"""Jacobian attribution for the /model flow diagram.

Why
---
`mtnn_inputs.f32` (export_mtnn_viz.py) stores each family's mean masked
z-score, percentile-normalized. The /model diagram uses that for edge widths,
tower radii and the "flow diagnostics" panel — so every edge currently encodes
INPUT MAGNITUDE, not influence on any output. A superstar lights every tower
because his inputs are large, which is why the panel once read
"tower selectivity 5.31%" and looked like a network pathology when it wasn't.

What this does
--------------
Borrows the mechanic behind Anthropic's Jacobian Lens ("Verbalizable
Representations Form a Global Workspace in Language Models", 2026): the
average causal effect of an intermediate representation on the eventual
outputs. Here the intermediate representation is each family tower's output
block t_k, and the outputs are the decode heads.

For every row we take the Jacobian block J_{h,k} = d y_h / d t_k and record its
Frobenius norm — the local sensitivity of head group h to tower k. Averaging
|J| across rows gives a population influence matrix; the per-row matrix drives
the diagram when a specific player-season is selected.

Honest limits
-------------
  * This is a LOCAL LINEARIZATION (sensitivity), not a counterfactual ablation.
  * The Frobenius norm discards sign and direction; a tower that pushes a head
    hard in either direction scores high. Per-row and population views are
    exported separately so an average never hides heterogeneity.
  * Masked families still have a defined Jacobian (the mask multiplies the
    input, not the gradient path), so influence != coverage. Read them together.

Writes:
  assets/mtnn_jacobian.json  — metadata + population influence matrices
  assets/mtnn_jacobian.f32   — per-row [towers x (1 embed + n_head_groups)]

Run: python pipeline/export_mtnn_jacobian.py [--device cuda] [--rows 12966]
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch

import train_mtnn as T

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
ASSETS = HERE.parent / "assets"
CKPT = DATA / "mtnn_best.pt"
OUT_JSON = ASSETS / "mtnn_jacobian.json"
OUT_F32 = ASSETS / "mtnn_jacobian.f32"

# Head groups exposed by the flow diagram (must match network-viz headDefs).
HEAD_GROUPS = ["archetype", "position", "skills", "next_profile"]


def families_from_ckpt(state: dict) -> dict[str, int]:
    """Recover {family: n_input_features} from tower fc1 shapes (d_cat = 2*d_in)."""
    fams: dict[str, int] = {}
    for k, v in state.items():
        if k.startswith("towers.") and k.endswith(".fc1.weight"):
            fam = k.split(".")[1]
            fams[fam] = v.shape[1] // 2
    return dict(sorted(fams.items()))


def load_matrix_for(ckpt_fams: dict[str, int]):
    """Pick the train matrix whose families match the checkpoint."""
    candidates = [(DATA / "train_matrix.npz", DATA / "feature_manifest.json"),
                  (DATA / "train_matrix.npz.prefix_bak",
                   DATA / "feature_manifest.json.prefix_bak")]
    for mpath, fpath in candidates:
        if not (mpath.exists() and fpath.exists()):
            continue
        manifest = json.loads(fpath.read_text(encoding="utf-8"))
        npz = np.load(mpath, allow_pickle=False)
        fams = T.family_slices(manifest)
        dims = {f: len(c) for f, c in fams.items()}
        if dims == ckpt_fams:
            print(f"  matrix: {mpath.name} ({len(fams)} families) — matches checkpoint")
            return npz, manifest, fams, mpath.name
        print(f"  skip {mpath.name}: {len(fams)} families != checkpoint {len(ckpt_fams)}")
    raise SystemExit(
        "no train matrix matches the checkpoint's families. Retrain, or keep the "
        "pre-fix snapshot (train_matrix.npz.prefix_bak).")


def build_model(ckpt: dict, fam_dims: dict[str, int], n_seasons: int,
                n_game: int, n_skills: int, device: str) -> T.MTNN:
    a = ckpt.get("args", {})
    model = T.MTNN(
        fam_dims, n_seasons,
        d_tower=a.get("tower_width", 24),
        d_tower_hidden=a.get("tower_hidden", 96),
        d_emb=a.get("dim", 48),
        n_game=n_game,
        n_skills=n_skills,
        d_skill_hidden=a.get("skill_hidden", 16),
        n_form=0, n_bbref=0,
        fusion_mode=a.get("fusion", "concat"),
        n_tower_blocks=a.get("tower_blocks", 1),
        mlp_heads=a.get("mlp_heads", False),
    ).to(device)
    missing, unexpected = model.load_state_dict(ckpt["model"], strict=False)
    drop = [k for k in missing if not k.startswith(("form_recon", "bbref"))]
    if drop:
        raise SystemExit(f"checkpoint missing required weights: {drop[:5]}")
    model.eval()
    return model


def head_outputs(model: T.MTNN, emb: torch.Tensor) -> dict[str, torch.Tensor]:
    out = {
        "archetype": model.archetype_head(emb),
        "position": model.position_head(emb),
        "next_profile": model.next_profile_head(emb),
    }
    if model.skill_towers is not None:
        out["skills"] = model.skill_towers(emb)
    return out


def jacobian_influence(model: T.MTNN, xs, ms, seas, rows: np.ndarray,
                       device: str, batch: int = 256):
    """Per-row Frobenius norm of d(head)/d(tower) and d(embed)/d(tower)."""
    fams = model.families
    n_t = len(fams)
    groups = [g for g in HEAD_GROUPS
              if g != "skills" or model.skill_towers is not None]
    per_row = np.zeros((len(rows), n_t, 1 + len(groups)), dtype=np.float32)

    for start in range(0, len(rows), batch):
        idx = rows[start:start + batch]
        idx_t = torch.tensor(idx, device=device)
        bx = {f: xs[f][idx_t] for f in fams}
        bm = {f: ms[f][idx_t] for f in fams}

        parts = torch.stack([model.towers[f](bx[f], bm[f]) for f in fams], dim=1)
        parts.retain_grad()
        emb = model.fusion(parts, seas[idx_t])
        heads = head_outputs(model, emb)

        # d(embed)/d(tower): one backward per embedding dim.
        acc = torch.zeros(len(idx), n_t, device=device)
        for i in range(emb.shape[1]):
            g, = torch.autograd.grad(emb[:, i].sum(), parts, retain_graph=True)
            acc += (g ** 2).sum(-1)
        per_row[start:start + len(idx), :, 0] = acc.sqrt().detach().cpu().numpy()

        # d(head_group)/d(tower): one backward per output dim in the group.
        for gi, gname in enumerate(groups):
            y = heads[gname]
            acc = torch.zeros(len(idx), n_t, device=device)
            for i in range(y.shape[1]):
                g, = torch.autograd.grad(y[:, i].sum(), parts, retain_graph=True)
                acc += (g ** 2).sum(-1)
            per_row[start:start + len(idx), :, 1 + gi] = (
                acc.sqrt().detach().cpu().numpy())
        del parts, emb, heads
    return per_row, groups


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    ap.add_argument("--rows", type=int, default=0, help="0 = all rows")
    ap.add_argument("--batch", type=int, default=256)
    args = ap.parse_args()
    device = ("cuda" if (args.device in ("auto", "cuda") and torch.cuda.is_available())
              else "cpu")
    if not CKPT.exists():
        raise SystemExit(f"missing {CKPT} — train first")

    print(f"device: {device}")
    ckpt = torch.load(CKPT, map_location=device, weights_only=False)
    ckpt_fams = families_from_ckpt(ckpt["model"])
    print(f"checkpoint families: {len(ckpt_fams)}")
    npz, manifest, fams, matrix_name = load_matrix_for(ckpt_fams)

    Z = npz["Z"].astype(np.float32)
    M = npz["mask"].astype(np.float32)
    seasons = npz["season"]
    season_ids = T.season_index(seasons)
    n_seasons = int(season_ids.max()) + 1
    game_cols = T.game_feature_cols(manifest)
    n_skills = sum(1 for k in ckpt["model"]
                   if k.startswith("skill_towers.towers.") and k.endswith(".0.weight"))

    model = build_model(ckpt, {f: len(c) for f, c in fams.items()}, n_seasons,
                        len(game_cols), n_skills, device)
    xs, ms = T.split_by_family(Z, M, fams, device)
    seas = torch.tensor(season_ids, device=device)

    n = len(Z) if args.rows <= 0 else min(args.rows, len(Z))
    rows = np.arange(n)
    t0 = time.time()
    per_row, groups = jacobian_influence(model, xs, ms, seas, rows, device, args.batch)
    print(f"jacobians: {n} rows x {len(fams)} towers x {1 + len(groups)} targets "
          f"in {time.time() - t0:.1f}s")

    fam_names = list(model.families)
    pop = per_row.mean(axis=0)                       # towers x (embed + groups)
    # Column-normalize so each target's edges are comparable in the UI.
    pop_norm = pop / np.maximum(pop.max(axis=0, keepdims=True), 1e-9)

    st = CKPT.stat()
    doc = {
        "built": time.strftime("%Y-%m-%d"),
        # Provenance so the client can fail closed when this file is stale
        # relative to the shipped mtnn_arch.json (e.g. after a promote/retrain).
        "dEmb": int(ckpt.get("args", {}).get("dim", 48)),
        "checkpoint": {"mtime": int(st.st_mtime), "bytes": int(st.st_size)},
        "matrix": matrix_name,
        "method": ("Frobenius norm of d(target)/d(tower_output), per row; "
                   "population view is the mean across rows. Local sensitivity, "
                   "not a counterfactual ablation."),
        "model": ckpt.get("args", {}).get("fusion", "concat"),
        "rows": int(n),
        "towerFamilies": fam_names,
        "targets": ["embedding"] + groups,
        "populationInfluence": {
            t: {fam_names[k]: round(float(pop[k, ti]), 6) for k in range(len(fam_names))}
            for ti, t in enumerate(["embedding"] + groups)
        },
        "populationInfluenceNorm": {
            t: {fam_names[k]: round(float(pop_norm[k, ti]), 4) for k in range(len(fam_names))}
            for ti, t in enumerate(["embedding"] + groups)
        },
        "perRowLayout": {
            "file": OUT_F32.name,
            "shape": [int(n), len(fam_names), 1 + len(groups)],
            "dtype": "float32",
            "order": "row-major: [row][tower][target]",
        },
    }
    ASSETS.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(doc, indent=2), encoding="utf-8")
    OUT_F32.write_bytes(per_row.astype(np.float32).tobytes(order="C"))
    kb = OUT_F32.stat().st_size / 1024
    print(f"wrote {OUT_JSON.name} + {OUT_F32.name} ({kb:.0f} KB)")
    print("\ntop towers by influence on each target (population mean):")
    for ti, t in enumerate(["embedding"] + groups):
        order = np.argsort(-pop[:, ti])[:5]
        s = ", ".join(f"{fam_names[k]} {pop[k, ti]:.3f}" for k in order)
        print(f"  {t:<14} {s}")


if __name__ == "__main__":
    main()

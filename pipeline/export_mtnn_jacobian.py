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

Feature granularity (--granularity feature)
-------------------------------------------
The tower-level Jacobian above answers "how sensitive is this head to that
family", which is the right weight for an EDGE. It cannot answer the question
the page actually poses — "which raw inputs drove this prediction, and did they
push it up or down". That needs sign, so we switch estimators: signed
gradient x input, a_j = x_j * d s / d x_j, taken w.r.t. the family inputs.
It is the first-order term of the output's decomposition, so the top-k
contributions genuinely sum toward the prediction.

Each target must be a SCALAR for a signed attribution to mean anything:

  archetype / position   the predicted class's logit (per row argmax) — "what
                         drove THIS call", not some average over classes
  skills / next_profile  the mean over the head's outputs — an overall level

`embedding` is deliberately absent. Its basis is arbitrary, so the sign of
d(emb_i)/d(x_j) carries no meaning; the tower-level Frobenius view above is the
honest one for the embedding. Four targets here, five there, on purpose.

Because a tower reads cat([x * m, m]), a masked feature has EXACTLY zero
gradient. Zero attribution therefore means "never measured", not "did not
matter" — the export carries per-feature coverage so the UI can say which.

Writes:
  assets/mtnn_jacobian.json  — metadata + population influence matrices
  assets/mtnn_jacobian.f32   — per-row [towers x (1 embed + n_head_groups)]
  assets/mtnn_attr_pop.json  — metadata + population [features x targets]
  assets/mtnn_attr_topk.bin  — per-row top-k signed contributions

Run: python pipeline/export_mtnn_jacobian.py [--device cuda] [--rows 12966]
                                             [--granularity tower|feature|both]
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
OUT_ATTR_JSON = ASSETS / "mtnn_attr_pop.json"
OUT_ATTR_BIN = ASSETS / "mtnn_attr_topk.bin"

# Head groups exposed by the flow diagram (must match network-viz headDefs).
HEAD_GROUPS = ["archetype", "position", "skills", "next_profile"]

# Heads whose scalar is the predicted class's logit rather than a mean.
ARGMAX_HEADS = frozenset({"archetype", "position"})

TOPK = 8


def families_from_ckpt(state: dict) -> dict[str, int]:
    """Recover {family: n_input_features} from tower fc1 shapes (d_cat = 2*d_in).

    Match `towers.<fam>.fc1.weight` EXACTLY. A stacked tower (tower_blocks >= 2)
    also carries `towers.<fam>.blocks.<i>.fc1.weight`, whose in-dim is d_tower,
    not the family's feature count — a suffix match lets the last block silently
    overwrite the real entry and every family reports d_tower/2.
    """
    fams: dict[str, int] = {}
    for k, v in state.items():
        parts = k.split(".")
        if len(parts) == 4 and parts[0] == "towers" and parts[2] == "fc1" \
                and parts[3] == "weight":
            fams[parts[1]] = v.shape[1] // 2
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
        bad = {f: (ckpt_fams.get(f), dims.get(f))
               for f in set(dims) | set(ckpt_fams) if dims.get(f) != ckpt_fams.get(f)}
        print(f"  skip {mpath.name}: {len(fams)} families, "
              f"{len(bad)} mismatched (ckpt, matrix): "
              f"{dict(list(bad.items())[:4])}")
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
        # Every v5 architecture knob must be replayed from the checkpoint's own
        # args. Silently defaulting one (d_head_hidden was defaulting to 64
        # while the promoted recipe trained at 128) does not fail loudly — it
        # would load a DIFFERENT network under strict=False.
        d_head_hidden=a.get("d_head_hidden", 64),
        d_model=a.get("d_model", 96),
        n_fusion_layers=a.get("n_fusion_layers", 4),
        n_attn_heads=a.get("n_attn_heads", 4),
        d_fusion_hidden=(a.get("fusion_hidden") or None),
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


def target_scalars(heads: dict[str, torch.Tensor]) -> dict[str, torch.Tensor]:
    """One scalar per row per head — the quantity a signed attribution explains.

    Classifiers use the predicted class's logit (argmax picks the row, the
    gradient flows only through it). Regression heads use the mean output.
    """
    out: dict[str, torch.Tensor] = {}
    for name, y in heads.items():
        if name in ARGMAX_HEADS:
            out[name] = y.gather(1, y.argmax(dim=1, keepdim=True)).squeeze(1)
        else:
            out[name] = y.mean(dim=1)
    return out


def feature_attribution(model: T.MTNN, xs, ms, seas, fams: dict[str, list[int]],
                        n_feat: int, rows: np.ndarray, device: str,
                        batch: int = 256, topk: int = TOPK):
    """Signed grad x input, per row, per target, over the raw input features.

    Returns (pop_signed, pop_abs, top_idx, top_val, targets). Rows are
    independent through towers/fusion (no batch mixing, LayerNorm is per
    sample), so one backward on the batch sum yields each row's own gradient.
    """
    fam_names = list(model.families)
    cols = {f: torch.tensor(fams[f], device=device, dtype=torch.long)
            for f in fam_names}

    targets: list[str] = []
    top_idx = top_val = None
    acc_signed = acc_abs = None

    for start in range(0, len(rows), batch):
        idx = rows[start:start + batch]
        idx_t = torch.tensor(idx, device=device)
        bx = {f: xs[f][idx_t].detach().clone().requires_grad_(True) for f in fam_names}
        bm = {f: ms[f][idx_t] for f in fam_names}

        parts = torch.stack([model.towers[f](bx[f], bm[f]) for f in fam_names], dim=1)
        emb = model.fusion(parts, seas[idx_t])
        scalars = target_scalars(head_outputs(model, emb))

        if not targets:
            targets = [g for g in HEAD_GROUPS if g in scalars]
            n_t = len(targets)
            acc_signed = np.zeros((n_feat, n_t), dtype=np.float64)
            acc_abs = np.zeros((n_feat, n_t), dtype=np.float64)
            top_idx = np.zeros((len(rows), n_t, topk), dtype=np.uint16)
            top_val = np.zeros((len(rows), n_t, topk), dtype=np.float32)

        for ti, tname in enumerate(targets):
            grads = torch.autograd.grad(
                scalars[tname].sum(), [bx[f] for f in fam_names],
                retain_graph=(ti < len(targets) - 1))
            attr = torch.zeros(len(idx), n_feat, device=device)
            for f, g in zip(fam_names, grads):
                attr[:, cols[f]] = bx[f].detach() * g       # a_j = x_j * dy/dx_j

            a = attr.detach()
            acc_signed[:, ti] += a.sum(0).double().cpu().numpy()
            acc_abs[:, ti] += a.abs().sum(0).double().cpu().numpy()

            k = min(topk, n_feat)
            sel = a.abs().topk(k, dim=1).indices              # rank by |a|, keep sign
            top_idx[start:start + len(idx), ti, :k] = sel.cpu().numpy().astype(np.uint16)
            top_val[start:start + len(idx), ti, :k] = (
                a.gather(1, sel).cpu().numpy().astype(np.float32))

        del parts, emb, scalars, bx
    n = float(len(rows))
    return acc_signed / n, acc_abs / n, top_idx, top_val, targets


def write_feature_assets(pop_signed, pop_abs, top_idx, top_val, targets,
                         feat_names, feat_family, coverage, ckpt, matrix_name,
                         n_rows: int) -> None:
    """Two assets: a small population JSON, and the per-row top-k binary.

    Dense per-row would be rows x 120 x targets x 4B ~ 25 MB. Top-k answers the
    only question the UI asks ("what drove THIS prediction") at a tenth of that.
    The binary is two contiguous blocks rather than interleaved 6-byte records,
    so the client can take zero-copy typed-array views (a uint16 next to a
    float32 would leave the float block 2-byte aligned).
    """
    n_t, k = len(targets), top_idx.shape[2]
    OUT_ATTR_BIN.write_bytes(top_idx.tobytes(order="C") + top_val.tobytes(order="C"))

    st = CKPT.stat()
    doc = {
        "built": time.strftime("%Y-%m-%d"),
        # Same fail-closed provenance as the tower export (V13).
        "checkpoint": {"mtime": int(st.st_mtime), "bytes": int(st.st_size)},
        "matrix": matrix_name,
        "rows": int(n_rows),
        "method": ("Signed gradient x input, a_j = x_j * d(target)/d(x_j), over the "
                   "raw input features. Classifier targets are the predicted class's "
                   "logit; regression targets are the mean output. Local "
                   "linearization, not a counterfactual ablation."),
        "maskedNote": ("A tower reads cat([x*m, m]), so a masked feature has exactly "
                       "zero gradient. Zero attribution means NEVER MEASURED, not "
                       "'no effect' — read it against `coverage`."),
        "targets": targets,
        "features": feat_names,
        "featureFamily": feat_family,
        # Fraction of rows where the feature was actually observed (mask == 1).
        "coverage": {f: round(float(c), 4) for f, c in zip(feat_names, coverage)},
        "populationSigned": {
            t: {feat_names[j]: round(float(pop_signed[j, ti]), 6)
                for j in range(len(feat_names))}
            for ti, t in enumerate(targets)
        },
        "populationAbs": {
            t: {feat_names[j]: round(float(pop_abs[j, ti]), 6)
                for j in range(len(feat_names))}
            for ti, t in enumerate(targets)
        },
        "topkLayout": {
            "file": OUT_ATTR_BIN.name,
            "k": int(k),
            "shape": [int(n_rows), n_t, int(k)],
            "order": "row-major: [row][target][rank], ranked by |value| descending",
            "blocks": [
                {"name": "index", "dtype": "uint16", "offset": 0,
                 "bytes": int(top_idx.nbytes), "note": "index into `features`"},
                {"name": "value", "dtype": "float32", "offset": int(top_idx.nbytes),
                 "bytes": int(top_val.nbytes), "note": "signed contribution"},
            ],
        },
    }
    OUT_ATTR_JSON.write_text(json.dumps(doc, indent=2), encoding="utf-8")
    kb = OUT_ATTR_BIN.stat().st_size / 1024
    print(f"wrote {OUT_ATTR_JSON.name} + {OUT_ATTR_BIN.name} ({kb:.0f} KB)")
    print("\ntop features by |contribution| on each target (population mean):")
    for ti, t in enumerate(targets):
        order = np.argsort(-pop_abs[:, ti])[:5]
        s = ", ".join(f"{feat_names[j]} {pop_signed[j, ti]:+.3f}" for j in order)
        print(f"  {t:<14} {s}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    ap.add_argument("--rows", type=int, default=0, help="0 = all rows")
    ap.add_argument("--batch", type=int, default=256)
    ap.add_argument("--granularity", choices=("tower", "feature", "both"),
                    default="tower")
    ap.add_argument("--topk", type=int, default=TOPK)
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

    if args.granularity in ("feature", "both"):
        feat_names = list(manifest["features"])
        if len(feat_names) != Z.shape[1]:
            raise SystemExit(f"manifest has {len(feat_names)} features, "
                             f"matrix has {Z.shape[1]} columns")
        feat_family = {f: manifest["families"][f] for f in feat_names}
        t0 = time.time()
        pop_signed, pop_abs, top_idx, top_val, targets = feature_attribution(
            model, xs, ms, seas, fams, len(feat_names), rows, device,
            args.batch, args.topk)
        print(f"attribution: {n} rows x {len(feat_names)} features x "
              f"{len(targets)} targets in {time.time() - t0:.1f}s")
        write_feature_assets(pop_signed, pop_abs, top_idx, top_val, targets,
                             feat_names, feat_family, M[rows].mean(axis=0),
                             ckpt, matrix_name, n)
        if args.granularity == "feature":
            return

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

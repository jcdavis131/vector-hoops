"""Export MTNN network-explorer assets for the /model page.

Writes:
  assets/mtnn_arch.json     — layer topology for the flow diagram
  assets/mtnn_map.json      — PCA(3) coords of 48-d embeddings + axis labels
  assets/mtnn_heads.f32     — row-aligned [arch | skills | position | next-profile]

Reads the promoted bundle (promote.load_promoted, every file re-hashed, and
the current train_matrix.npz checked to be the one the model trained on),
and checks every matrix row against assets/vectors.json by (player_id,
season). It used to read pipeline/data/embedding_v3.npz beside the last
run's mtnn_best.pt: on 2026-10-09 an 08-07 embedding with an 08-14 select-
phase checkpoint, so arch.json would have described one model and the map
another. Its architecture came from that checkpoint's args with hand-typed
defaults (tower 24/96/1) on any error, and its model label from
args["model"], which train_mtnn never sets, so it always read
"mtnn_v4_phase_b" [artifacts#2]. Both now come from the promoted run's
report: the model tag and lineage.args (the same vars(args) the checkpoint
holds). arch.json and map.json carry the run id under "lineage"
[artifacts#3, fork#13].

Run: python pipeline/export_mtnn_viz.py
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
import promote
import served_model as sm

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
ASSETS = HERE.parent / "assets"
VECTORS = ASSETS / "vectors.json"
TRAIN = DATA / "train_matrix.npz"
MANIFEST = DATA / "feature_manifest.json"

# Preferred display order. Families absent from feature_manifest.json (e.g.
# game_ratings once integrate_context's coverage gate drops it) are omitted,
# and any new family is appended -- the diagram must describe the net that
# actually ships, not a frozen list.
TOWER_FAMILY_ORDER = [
    "volume",
    "playmaking",
    "rebounding",
    "defense",
    "efficiency",
    "shotmix",
    "bio",
    "tracking",
    "form",
    "market",
    "roster",
    "career",
    "competition",
    "team",
    "pedigree",
    "playoffs",
    "honors",
    "game_ratings",
]


def tower_families(family_order: list[str]) -> list[str]:
    present = set(family_order)
    ordered = [f for f in TOWER_FAMILY_ORDER if f in present]
    ordered += [f for f in family_order if f not in set(ordered)]
    return ordered


OUT_ARCH = ASSETS / "mtnn_arch.json"
OUT_MAP = ASSETS / "mtnn_map.json"
OUT_HEADS = ASSETS / "mtnn_heads.f32"
OUT_INPUTS = ASSETS / "mtnn_inputs.f32"


def pca_coords(E: np.ndarray, n_comp: int = 3) -> tuple[np.ndarray, np.ndarray]:
    """PCA without sklearn; return (scaled_coords, raw_scores)."""
    X = E.astype(np.float64)
    X -= X.mean(axis=0)
    _, _, vt = np.linalg.svd(X, full_matrices=False)
    coords = X @ vt[:n_comp].T
    out = np.zeros_like(coords)
    for j in range(n_comp):
        col = coords[:, j]
        lo, hi = float(col.min()), float(col.max())
        span = hi - lo if hi > lo else 1.0
        out[:, j] = 0.05 + 0.9 * (col - lo) / span
    return out.astype(np.float32), coords.astype(np.float32)


def human_skill_label(key: str) -> str:
    labels = {
        "ft": "Free Throw Shooting",
        "efficiency": "Scoring Efficiency",
        "rim": "Rim Pressure",
        "three": "3P Volume",
        "three_acc": "3P Accuracy",
        "dreb": "Defensive Rebounding",
        "oreb": "Offensive Rebounding",
        "rim_def": "Rim Protection",
        "steal": "Ball Pressure",
        "playmaking": "Playmaking",
        "foul_avoid": "Foul Discipline",
        "security": "Ball Security",
        "gravity_off": "Off-ball Gravity",
        "gravity_on": "On-ball Gravity",
        "gravity_rim": "Rim Gravity",
        "hand_activity": "Hand Activity",
        "recovery": "Defensive Recovery",
        "screen_nav": "Screen Navigation",
    }
    return labels.get(key, key)


def infer_axes(
    raw_coords: np.ndarray,
    arch: np.ndarray,
    skills: np.ndarray,
    skill_keys: list[str],
    cluster_names: list[str],
) -> list[dict]:
    """Create human-readable PC interpretations from head correlations."""
    feature_names: list[str] = []
    for i in range(arch.shape[1]):
        nm = cluster_names[i] if i < len(cluster_names) else f"Archetype {i + 1}"
        feature_names.append(f"Arch: {nm}")
    for k in skill_keys:
        feature_names.append(f"Skill: {human_skill_label(k)}")
    feats = np.concatenate([arch, skills], axis=1).astype(np.float64)
    feats -= feats.mean(axis=0, keepdims=True)
    feat_std = feats.std(axis=0, keepdims=True)
    feat_std[feat_std == 0] = 1.0
    feats /= feat_std

    out = []
    for j in range(min(3, raw_coords.shape[1])):
        pc = raw_coords[:, j : j + 1].astype(np.float64)
        pc -= pc.mean(axis=0, keepdims=True)
        pc_std = pc.std(axis=0, keepdims=True)
        pc_std[pc_std == 0] = 1.0
        pc /= pc_std
        corr = (pc.T @ feats / max(1, feats.shape[0] - 1)).ravel()
        hi_idx = np.argsort(corr)[-2:][::-1]
        lo_idx = np.argsort(corr)[:2]
        hi = ", ".join(feature_names[i] for i in hi_idx)
        lo = ", ".join(feature_names[i] for i in lo_idx)
        out.append(
            {
                "pc": f"PC{j + 1}",
                "axis": "XYZ"[j],
                "name": f"Craft axis {j + 1}",
                "lo": f"higher {lo}",
                "hi": f"higher {hi}",
            }
        )
    return out


def main() -> None:
    try:
        bundle = promote.load_promoted(DATA, check_matrix=True)
    except promote.BundleError as e:
        raise SystemExit(f"export_mtnn_viz: {e}") from None
    if not VECTORS.exists():
        raise SystemExit(f"missing {VECTORS}")
    if not TRAIN.exists() or not MANIFEST.exists():
        raise SystemExit("missing train_matrix.npz or feature_manifest.json")

    data = np.load(bundle.embedding, allow_pickle=False)
    E = np.asarray(data["E"], dtype=np.float32)
    arch = np.asarray(data["archetype_logits"], dtype=np.float32)
    skills = np.asarray(data["skill_pred"], dtype=np.float32)
    pos = np.asarray(data["position_logits"], dtype=np.float32)
    next_profile = np.asarray(
        data.get("next_profile_pred", np.zeros((E.shape[0], 0), dtype=np.float32)),
        dtype=np.float32,
    )
    game_feature_keys = [str(k) for k in data.get("game_feature_keys", [])]
    skill_keys = [str(k) for k in data.get("skill_keys", [])]

    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    players = vec["players"]
    cluster_names = vec.get("clusters") or []
    n = len(players)
    if E.shape[0] != n:
        raise SystemExit(f"row mismatch: E {E.shape[0]} vs vectors {n}")

    # Actual per-family inputs used by MTNN towers (from train bundle + manifest).
    train = np.load(TRAIN, allow_pickle=False)
    Z = train["Z"].astype(np.float32)
    M = train["mask"].astype(np.float32)
    t_names = train["name"]
    t_seasons = train["season"]
    if Z.shape[0] != n:
        raise SystemExit(f"train row mismatch: Z {Z.shape[0]} vs vectors {n}")
    # Every row, by (player_id, season). This was 3 rows by name.
    t_keys = [sm.row_key(p, s) for p, s in zip(train["player_id"].tolist(), t_seasons.tolist(), strict=True)]
    v_keys = sm.vector_keys(players)
    bad = [i for i in range(n) if t_keys[i] != v_keys[i]]
    if bad:
        shown = "; ".join(f"row {i}: {t_keys[i]} ({t_names[i]}) vs {v_keys[i]}" for i in bad[:10])
        raise SystemExit(f"{len(bad)} matrix rows are not the vectors.json row at the same index: {shown}")

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    feats = manifest["features"]
    fam_of = manifest["families"]
    family_order = sorted({fam_of[f] for f in feats})
    family_cols: dict[str, list[int]] = {fam: [] for fam in family_order}
    for j, f in enumerate(feats):
        family_cols[fam_of[f]].append(j)

    fam_raw = np.zeros((n, len(family_order)), dtype=np.float32)
    fam_norm = np.zeros((n, len(family_order)), dtype=np.float32)
    for fi, fam in enumerate(family_order):
        cols = np.array(family_cols[fam], dtype=np.int64)
        zf = Z[:, cols]
        mf = M[:, cols]
        valid_cnt = mf.sum(axis=1)
        numer = (zf * mf).sum(axis=1)
        with np.errstate(divide="ignore", invalid="ignore"):
            mean = np.where(valid_cnt > 0, numer / np.maximum(valid_cnt, 1e-8), np.nan)
        mean = np.where(
            np.isfinite(mean),
            mean,
            np.nanmedian(mean[np.isfinite(mean)]) if np.isfinite(mean).any() else 0.0,
        )
        mean = np.clip(mean, -4, 4)
        fam_raw[:, fi] = mean.astype(np.float32)
        lo = float(np.percentile(mean, 5))
        hi = float(np.percentile(mean, 95))
        span = hi - lo if hi > lo else 1.0
        fam_norm[:, fi] = np.clip((mean - lo) / span, 0, 1).astype(np.float32)

    heads = np.concatenate([arch, skills, pos, next_profile], axis=1).astype(np.float32)
    coords, raw_coords = pca_coords(E)
    axis_meta = infer_axes(raw_coords, arch, skills, skill_keys, cluster_names)

    # The trained net's real shape, from the promoted run's own args (the same
    # vars(args) its checkpoint holds), so the diagram never advertises an
    # architecture that was not trained. No defaults: a missing key is an error.
    run_args = (bundle.report.get("lineage") or {}).get("args") or {}
    try:
        d_tower = int(run_args["tower_width"])
        d_hidden = int(run_args["tower_hidden"])
        n_blocks = int(run_args["tower_blocks"])
        fusion = str(run_args["fusion"])
        mlp_heads = bool(run_args["mlp_heads"])
    except KeyError as e:
        raise SystemExit(f"export_mtnn_viz: promoted run {bundle.run_id} records no {e} in lineage.args") from None
    fams_used = tower_families(family_order)
    d_emb = int(E.shape[1])
    ckpt_path = bundle.checkpoint

    arch_doc = {
        "built": time.strftime("%Y-%m-%d"),
        "model": bundle.manifest.get("model"),
        "lineage": bundle.stamp(),
        "fusion": fusion,
        "dTower": d_tower,
        "dEmb": d_emb,
        # Provenance stamp; the Jacobian export carries the same fingerprint so
        # the client can reject a stale attribution file (see network-viz.js,
        # which compares mtime and bytes). Both exporters stamp the promoted
        # bundle's checkpoint; sha256 is the part that cannot collide.
        "checkpoint": {
            "mtime": int(ckpt_path.stat().st_mtime),
            "bytes": int(ckpt_path.stat().st_size),
            "sha256": bundle.stamp()["checkpoint_sha256"],
        },
        "towerBlocks": n_blocks,
        "mlpHeads": mlp_heads,
        "nArchetypes": int(arch.shape[1]),
        "nPositions": int(pos.shape[1]),
        "nNextProfile": int(next_profile.shape[1]),
        "towerFamilies": fams_used,
        "familyOrder": family_order,
        "familyFeatures": {fam: [feats[j] for j in family_cols[fam]] for fam in family_order},
        "skillKeys": skill_keys,
        "gameFeatureKeys": game_feature_keys,
        "gameArchetypes": cluster_names,
        "layers": [
            {
                "id": "input",
                "label": "Masked inputs",
                "detail": f"{len(feats)} features in {len(fams_used)} families",
            },
            {
                "id": "towers",
                "label": "Residual towers",
                "detail": (
                    f"{len(fams_used)} × {n_blocks} block{'s' if n_blocks != 1 else ''} ({d_hidden} → {d_tower})"
                ),
            },
            {
                "id": "fusion",
                "label": f"{fusion.title()} fusion",
                "detail": (
                    f"{len(fams_used) * d_tower} + season → {d_emb}-d, L2 norm"
                    if fusion == "concat"
                    else f"attention over {len(fams_used)} towers → {d_emb}-d, L2 norm"
                ),
            },
            {
                "id": "embedding",
                "label": "Embedding",
                "detail": "Contrastive craft space",
            },
            {
                "id": "heads",
                "label": "Decode heads",
                "detail": (
                    f"{arch.shape[1]} archetype + {skills.shape[1]} skill + "
                    f"{pos.shape[1]} position + {next_profile.shape[1]} next-profile"
                ),
            },
        ],
    }

    map_doc = {
        "built": time.strftime("%Y-%m-%d"),
        "lineage": bundle.stamp(),
        "dim": 3,
        "rows": n,
        "method": (f"PCA(3) on {d_emb}-d MTNN embeddings; axes min-max scaled for the explorer map."),
        "axes": axis_meta,
        "coords": coords.tolist(),
    }

    ASSETS.mkdir(parents=True, exist_ok=True)
    OUT_ARCH.write_text(json.dumps(arch_doc, indent=2), encoding="utf-8")
    OUT_MAP.write_text(json.dumps(map_doc, separators=(",", ":")), encoding="utf-8")
    OUT_HEADS.write_bytes(heads.tobytes(order="C"))
    OUT_INPUTS.write_bytes(fam_norm.astype(np.float32).tobytes(order="C"))

    mb = OUT_HEADS.stat().st_size / (1024 * 1024)
    print(
        f"wrote {OUT_ARCH.name}, {OUT_MAP.name}, {OUT_HEADS.name}, {OUT_INPUTS.name} "
        f"({n}×{heads.shape[1]}, {mb:.2f} MB)"
    )


if __name__ == "__main__":
    main()

"""Export MTNN network-explorer assets for the /model page.

Writes:
  assets/mtnn_arch.json     — layer topology for the flow diagram
  assets/mtnn_map.json      — PCA(3) coords of 48-d embeddings + axis labels
  assets/mtnn_heads.f32     — row-aligned [arch | skills | position | next-profile]

Requires pipeline/data/embedding_v3.npz and assets/vectors.json alignment.

Run: python pipeline/export_mtnn_viz.py
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
ASSETS = HERE.parent / "assets"
EMB = DATA / "embedding_v3.npz"
VECTORS = ASSETS / "vectors.json"
TRAIN = DATA / "train_matrix.npz"
MANIFEST = DATA / "feature_manifest.json"

TOWER_FAMILIES = [
    "volume", "playmaking", "rebounding", "defense", "efficiency", "shotmix",
    "bio", "tracking", "form", "market", "roster", "career", "competition",
    "team", "pedigree", "playoffs", "honors", "game_ratings",
]

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
        pc = raw_coords[:, j:j+1].astype(np.float64)
        pc -= pc.mean(axis=0, keepdims=True)
        pc_std = pc.std(axis=0, keepdims=True)
        pc_std[pc_std == 0] = 1.0
        pc /= pc_std
        corr = (pc.T @ feats / max(1, feats.shape[0] - 1)).ravel()
        hi_idx = np.argsort(corr)[-2:][::-1]
        lo_idx = np.argsort(corr)[:2]
        hi = ", ".join(feature_names[i] for i in hi_idx)
        lo = ", ".join(feature_names[i] for i in lo_idx)
        out.append({
            "pc": f"PC{j + 1}",
            "axis": "XYZ"[j],
            "name": f"Craft axis {j + 1}",
            "lo": f"higher {lo}",
            "hi": f"higher {hi}",
        })
    return out


def main() -> None:
    if not EMB.exists():
        raise SystemExit(f"missing {EMB} — run pipeline/train_mtnn.py first")
    if not VECTORS.exists():
        raise SystemExit(f"missing {VECTORS}")
    if not TRAIN.exists() or not MANIFEST.exists():
        raise SystemExit("missing train_matrix.npz or feature_manifest.json")

    data = np.load(EMB, allow_pickle=True)
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
    for idx in (0, n // 2, n - 1):
        p = players[idx]
        if str(t_names[idx]) != p["name"] or str(t_seasons[idx]) != p["season"]:
            raise SystemExit(
                f"train alignment fail row {idx}: "
                f"{t_names[idx]!r}|{t_seasons[idx]!r} vs {p['name']!r}|{p['season']!r}"
            )

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
        mean = np.where(np.isfinite(mean), mean, np.nanmedian(mean[np.isfinite(mean)]) if np.isfinite(mean).any() else 0.0)
        mean = np.clip(mean, -4, 4)
        fam_raw[:, fi] = mean.astype(np.float32)
        lo = float(np.percentile(mean, 5))
        hi = float(np.percentile(mean, 95))
        span = hi - lo if hi > lo else 1.0
        fam_norm[:, fi] = np.clip((mean - lo) / span, 0, 1).astype(np.float32)

    heads = np.concatenate([arch, skills, pos, next_profile], axis=1).astype(np.float32)
    coords, raw_coords = pca_coords(E)
    axis_meta = infer_axes(raw_coords, arch, skills, skill_keys, cluster_names)

    arch_doc = {
        "built": time.strftime("%Y-%m-%d"),
        "model": "mtnn_v4_phase_b",
        "fusion": "concat",
        "dTower": 24,
        "dEmb": 48,
        "nArchetypes": int(arch.shape[1]),
        "nPositions": int(pos.shape[1]),
        "nNextProfile": int(next_profile.shape[1]),
        "towerFamilies": TOWER_FAMILIES,
        "familyOrder": family_order,
        "familyFeatures": {fam: [feats[j] for j in family_cols[fam]] for fam in family_order},
        "skillKeys": skill_keys,
        "gameFeatureKeys": game_feature_keys,
        "gameArchetypes": cluster_names,
        "layers": [
            {"id": "input", "label": "Masked inputs", "detail": "129 features in 18 families"},
            {"id": "towers", "label": "Residual towers", "detail": "18 × (96 → 24)"},
            {"id": "fusion", "label": "Concat fusion", "detail": "432 + season → 48-d, L2 norm"},
            {"id": "embedding", "label": "Embedding", "detail": "Contrastive craft space"},
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
        "dim": 3,
        "rows": n,
        "method": "PCA(3) on 48-d MTNN embeddings; axes min-max scaled for the explorer map.",
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

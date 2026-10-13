"""Regenerate assets/mtnn_map.json from the SERVED 64-d embeddings.

pipeline/export_mtnn_viz.py is the canonical exporter, but it reads the
training-side promoted bundle (pipeline/data/), which is not in this repo —
so after the v5 promotion the committed map stayed the previous 48-d build's
export (built 2026-07-14, 11 input families) while arch/heads moved to v5.
network-viz.js validates the viz assets against each other, and the stale
map's generation mismatch is part of why the /methods exhibits died.

This script derives the map from the files the site actually serves —
assets/mtnn_embeddings.f32 (the served bundle, row-aligned with
assets/vectors.json) and assets/mtnn_heads.f32 (for axis inference) — using
the same math as export_mtnn_viz.pca_coords / infer_axes. It does not touch
the served bundle, any checkpoint, or the promotion lineage; it only
rewrites the derived visualization asset. Run it after any re-export of
mtnn_embeddings.f32 / mtnn_heads.f32 until export_mtnn_viz.py can be run
on the training side again.

Run: python pipeline/regen_mtnn_map.py
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "assets"
EMBEDDINGS = ASSETS / "mtnn_embeddings.f32"
HEADS = ASSETS / "mtnn_heads.f32"
ARCH = ASSETS / "mtnn_arch.json"
VECTORS = ASSETS / "vectors.json"
OUT_MAP = ASSETS / "mtnn_map.json"

# Human skill labels — same table as export_mtnn_viz.human_skill_label.
SKILL_LABELS = {
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


def pca_coords(e: np.ndarray, n_comp: int = 3) -> tuple[np.ndarray, np.ndarray]:
    """PCA without sklearn; return (scaled_coords, raw_scores). Ported from
    export_mtnn_viz.pca_coords — keep the two in sync."""
    x = e.astype(np.float64)
    x -= x.mean(axis=0)
    _, _, vt = np.linalg.svd(x, full_matrices=False)
    coords = x @ vt[:n_comp].T
    out = np.zeros_like(coords)
    for j in range(n_comp):
        col = coords[:, j]
        lo, hi = float(col.min()), float(col.max())
        span = hi - lo if hi > lo else 1.0
        out[:, j] = 0.05 + 0.9 * (col - lo) / span
    return out.astype(np.float32), coords.astype(np.float32)


def infer_axes(
    raw_coords: np.ndarray,
    arch: np.ndarray,
    skills: np.ndarray,
    skill_keys: list[str],
    cluster_names: list[str],
) -> list[dict]:
    """Human-readable PC interpretations from head correlations.
    Ported from export_mtnn_viz.infer_axes — keep the two in sync."""
    feature_names: list[str] = []
    for i in range(arch.shape[1]):
        nm = cluster_names[i] if i < len(cluster_names) else f"Archetype {i + 1}"
        feature_names.append(f"Arch: {nm}")
    for k in skill_keys:
        feature_names.append(f"Skill: {SKILL_LABELS.get(k, k)}")
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
    arch_doc = json.loads(ARCH.read_text(encoding="utf-8"))
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    players = vec["players"]
    n = len(players)

    d_emb = int(arch_doc["dEmb"])
    e = np.fromfile(EMBEDDINGS, dtype=np.float32).reshape(n, d_emb)

    n_arch = int(arch_doc["nArchetypes"])
    n_skills = len(arch_doc["skillKeys"])
    n_pos = int(arch_doc["nPositions"])
    n_next = int(arch_doc["nNextProfile"])
    total = n_arch + n_skills + n_pos + n_next
    heads = np.fromfile(HEADS, dtype=np.float32).reshape(n, total)
    arch_logits = heads[:, :n_arch]
    skill_pred = heads[:, n_arch : n_arch + n_skills]

    coords, raw_coords = pca_coords(e)
    axis_meta = infer_axes(
        raw_coords,
        arch_logits,
        skill_pred,
        [str(k) for k in arch_doc["skillKeys"]],
        [str(c) for c in (arch_doc.get("gameArchetypes") or [])],
    )

    map_doc = {
        "built": time.strftime("%Y-%m-%d"),
        "dim": 3,
        "rows": n,
        "method": (
            f"PCA(3) on {d_emb}-d MTNN embeddings; axes min-max scaled for the explorer map. "
            "Regenerated from the served bundle (assets/mtnn_embeddings.f32) by "
            "pipeline/regen_mtnn_map.py — export_mtnn_viz.py needs the training-side "
            "promoted bundle, which is not in this repo."
        ),
        "axes": axis_meta,
        "coords": coords.tolist(),
    }
    OUT_MAP.write_text(json.dumps(map_doc, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT_MAP.name}: {n} rows, PCA(3) on {d_emb}-d served embeddings")


if __name__ == "__main__":
    main()

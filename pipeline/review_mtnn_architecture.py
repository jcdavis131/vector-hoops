"""Review MTNN family construction with correlation-driven suggestions.

Generates:
  pipeline/data/mtnn_architecture_review.json

Method:
  - Load train_matrix + feature_manifest
  - Compute feature-feature correlation (masked rows only)
  - Summarize within-family cohesion and cross-family overlap
  - Propose candidate family merges when cross-family median correlation
    exceeds threshold and within-family cohesion is weak.

Run:
  python pipeline/review_mtnn_architecture.py
"""

from __future__ import annotations

import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "pipeline" / "data"
TRAIN = DATA / "train_matrix.npz"
MANIFEST = DATA / "feature_manifest.json"
OUT = DATA / "mtnn_architecture_review.json"


def robust_corr(a: np.ndarray, b: np.ndarray, ma: np.ndarray, mb: np.ndarray) -> float | None:
    valid = (ma > 0) & (mb > 0)
    if valid.sum() < 200:
        return None
    x = a[valid]
    y = b[valid]
    sx = float(np.std(x))
    sy = float(np.std(y))
    if sx == 0 or sy == 0:
        return None
    return float(np.corrcoef(x, y)[0, 1])


def main() -> None:
    if not TRAIN.exists() or not MANIFEST.exists():
        raise SystemExit("missing train_matrix.npz or feature_manifest.json")

    npz = np.load(TRAIN, allow_pickle=False)
    Z = npz["Z"].astype(np.float32)
    M = npz["mask"].astype(np.float32)
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    feats: list[str] = manifest["features"]
    fam_of: dict[str, str] = manifest["families"]
    fam_cols: dict[str, list[int]] = defaultdict(list)
    for j, f in enumerate(feats):
        fam_cols[fam_of[f]].append(j)

    # Within-family cohesion: median absolute correlation among members.
    family_stats = {}
    for fam, cols in sorted(fam_cols.items()):
        pairs = []
        for i in range(len(cols)):
            for j in range(i + 1, len(cols)):
                c = robust_corr(Z[:, cols[i]], Z[:, cols[j]], M[:, cols[i]], M[:, cols[j]])
                if c is not None:
                    pairs.append(abs(c))
        family_stats[fam] = {
            "n_features": len(cols),
            "median_abs_corr": round(float(np.median(pairs)), 4) if pairs else None,
        }

    # Cross-family overlap.
    fams = sorted(fam_cols)
    cross = []
    for i in range(len(fams)):
        for j in range(i + 1, len(fams)):
            a = fams[i]
            b = fams[j]
            vals = []
            for ca in fam_cols[a]:
                for cb in fam_cols[b]:
                    c = robust_corr(Z[:, ca], Z[:, cb], M[:, ca], M[:, cb])
                    if c is not None:
                        vals.append(abs(c))
            if not vals:
                continue
            med = float(np.median(vals))
            cross.append(
                {
                    "famA": a,
                    "famB": b,
                    "median_abs_corr": round(med, 4),
                    "n_pairs": len(vals),
                }
            )
    cross.sort(key=lambda r: r["median_abs_corr"], reverse=True)

    suggestions = []
    for row in cross[:40]:
        a = row["famA"]
        b = row["famB"]
        ma = family_stats[a]["median_abs_corr"] or 0.0
        mb = family_stats[b]["median_abs_corr"] or 0.0
        if row["median_abs_corr"] >= 0.35 and (ma < 0.28 or mb < 0.28):
            suggestions.append(
                {
                    "proposal": f"consider shared block for {a} + {b}",
                    "cross_median_abs_corr": row["median_abs_corr"],
                    "within_a": family_stats[a]["median_abs_corr"],
                    "within_b": family_stats[b]["median_abs_corr"],
                }
            )

    doc = {
        "built": time.strftime("%Y-%m-%d"),
        "rows": int(Z.shape[0]),
        "features": int(Z.shape[1]),
        "families": len(fams),
        "method": (
            "Masked Pearson correlation on shared-valid rows; family cohesion uses "
            "median |corr| within family. Suggestions trigger when cross-family "
            "median is high and at least one family has weak internal cohesion."
        ),
        "familyCohesion": family_stats,
        "topCrossFamilyOverlap": cross[:25],
        "mergeSuggestions": suggestions[:12],
    }
    OUT.write_text(json.dumps(doc, indent=2), encoding="utf-8")
    print(f"wrote {OUT} with {len(suggestions[:12])} suggestions")


if __name__ == "__main__":
    main()

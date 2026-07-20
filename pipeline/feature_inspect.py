"""Feature inspection gate — coverage, distributions, correlation, leakage.

Run after integrate_context.py merges new columns.

  python pipeline/feature_inspect.py
  python pipeline/feature_inspect.py --correlation

Writes pipeline/data/feature_inspect.json
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "pipeline" / "data"
OUT = DATA_DIR / "feature_inspect.json"

CORR_FLAG = 0.92
LEAK_FLAG = 0.85
Z_CLIP = 4.001


def load_bundle():
    npz_path = DATA_DIR / "train_matrix.npz"
    man_path = DATA_DIR / "feature_manifest.json"
    if not npz_path.exists() or not man_path.exists():
        raise SystemExit(
            "missing train_matrix.npz or feature_manifest.json — "
            "run bootstrap_train_matrix.py + integrate_context.py"
        )
    npz = np.load(npz_path, allow_pickle=False)
    manifest = json.loads(man_path.read_text(encoding="utf-8"))
    return (
        npz["Z"].astype(np.float64),
        npz["mask"].astype(np.float64),
        manifest,
        npz["season"],
    )


def season_index(seasons) -> np.ndarray:
    uniq = sorted({str(s) for s in seasons})
    m = {s: i for i, s in enumerate(uniq)}
    return np.array([m[str(s)] for s in seasons], dtype=np.int64)


def per_feature_stats(Z, mask, features: list[str]) -> list[dict]:
    rows = []
    for j, f in enumerate(features):
        m = mask[:, j] > 0.5
        n_present = int(m.sum())
        n = len(m)
        pct = 100.0 * n_present / n if n else 0.0
        col = Z[:, j]
        present_vals = col[m] if n_present else np.array([])
        out_of_clip = 0
        if n_present:
            out_of_clip = int(np.sum(np.abs(present_vals) > Z_CLIP))
        rows.append(
            {
                "feature": f,
                "present_pct": round(pct, 2),
                "present_n": n_present,
                "mean": round(float(np.mean(present_vals)), 4) if n_present else None,
                "std": round(float(np.std(present_vals)), 4) if n_present else None,
                "out_of_clip": out_of_clip,
            }
        )
    return rows


def per_family_stats(feature_rows: list[dict], families: dict[str, str]) -> list[dict]:
    by_fam: dict[str, list[float]] = defaultdict(list)
    for r in feature_rows:
        fam = families.get(r["feature"], "unknown")
        by_fam[fam].append(r["present_pct"])
    out = []
    for fam in sorted(by_fam):
        pcts = by_fam[fam]
        out.append(
            {
                "family": fam,
                "features": len(pcts),
                "mean_present_pct": round(float(np.mean(pcts)), 2),
                "min_present_pct": round(float(np.min(pcts)), 2),
            }
        )
    return out


def correlation_flags(Z, mask, features: list[str], threshold: float) -> list[dict]:
    flags = []
    d = len(features)
    for i in range(d):
        for j in range(i + 1, d):
            both = (mask[:, i] > 0.5) & (mask[:, j] > 0.5)
            if both.sum() < 50:
                continue
            xi = Z[both, i]
            xj = Z[both, j]
            if np.std(xi) < 1e-6 or np.std(xj) < 1e-6:
                continue
            r = float(np.corrcoef(xi, xj)[0, 1])
            if abs(r) >= threshold:
                flags.append(
                    {
                        "a": features[i],
                        "b": features[j],
                        "r": round(r, 4),
                        "n": int(both.sum()),
                    }
                )
    flags.sort(key=lambda x: -abs(x["r"]))
    return flags


def leakage_flags(Z, mask, features: list[str], season_ids: np.ndarray) -> list[dict]:
    flags = []
    for j, f in enumerate(features):
        m = mask[:, j] > 0.5
        if m.sum() < 100:
            continue
        col = Z[m, j]
        sid = season_ids[m].astype(np.float64)
        if np.std(col) < 1e-6 or np.std(sid) < 1e-6:
            continue
        r = float(np.corrcoef(col, sid)[0, 1])
        if abs(r) >= LEAK_FLAG:
            flags.append(
                {
                    "feature": f,
                    "season_r": round(r, 4),
                    "n": int(m.sum()),
                }
            )
    return flags


def season_coverage(seasons, mask) -> dict:
    """Fraction of rows with any feature present per season."""
    uniq = sorted({str(s) for s in seasons})
    any_present: dict[str, list[float]] = {s: [] for s in uniq}
    for i, s in enumerate(seasons):
        any_present[str(s)].append(float(mask[i].max() > 0.5))
    return {s: round(100.0 * float(np.mean(any_present[s])), 2) for s in uniq}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--correlation", action="store_true", help="pairwise redundancy scan"
    )
    args = ap.parse_args()

    Z, mask, manifest, seasons = load_bundle()
    features = manifest["features"]
    families = manifest.get("families", {})

    feat_rows = per_feature_stats(Z, mask, features)
    fam_rows = per_family_stats(feat_rows, families)
    sid = season_index(seasons)

    report = {
        "rows": int(Z.shape[0]),
        "features": len(features),
        "per_feature": feat_rows,
        "per_family": fam_rows,
        "season_any_present_pct": season_coverage(seasons, mask),
        "leakage_flags": leakage_flags(Z, mask, features, sid),
        "warnings": [],
    }

    low_cov = [r for r in feat_rows if r["present_pct"] < 5.0]
    if low_cov:
        report["warnings"].append(
            f"{len(low_cov)} features below 5% coverage — document or drop"
        )
    clip_bad = [r for r in feat_rows if r["out_of_clip"] > 0]
    if clip_bad:
        report["warnings"].append(
            f"{len(clip_bad)} features have values outside [-4,4]"
        )
    if report["leakage_flags"]:
        report["warnings"].append(
            f"{len(report['leakage_flags'])} leakage proxy flags (|season_r|>={LEAK_FLAG})"
        )

    if args.correlation:
        corr = correlation_flags(Z, mask, features, CORR_FLAG)
        report["correlation_flags"] = corr
        if corr:
            report["warnings"].append(f"{len(corr)} feature pairs |r|>={CORR_FLAG}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"inspected {report['rows']} rows, {report['features']} features")
    for w in report["warnings"]:
        print(f"  WARN: {w}")
    if not report["warnings"]:
        print("  all inspection gates clean")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()

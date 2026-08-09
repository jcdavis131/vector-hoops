"""Audit the MTNN input matrix before tuning anything on top of it.

Two silent data bugs (career_arc stale in 3306bf6, position labels dead in
56ff7dd) each moved quality more than any hyperparameter in the 2026-07-24
sweep. Both were invisible in the loss curve. This script looks for the rest of
that class:

* dead / near-constant columns — a feature that never varies is a bias term
  wearing a feature's name,
* redundant pairs (|r| >= 0.98 on commonly-observed rows) — duplicated input
  signal inflates a family's apparent width and its fusion share,
* leak candidates — inputs that correlate ~1.0 with a *head target*, which is
  how CAREER_GP_PCT ended up feeding the durability head its own label,
* coverage cliffs across the 2024 boundary, the split the game depends on.

Read-only. Writes pipeline/data/feature_audit.json.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "pipeline" / "data"
MATRIX = DATA / "train_matrix.npz"
MANIFEST = DATA / "feature_manifest.json"
OUT = DATA / "feature_audit.json"

DUP_R = 0.98
LEAK_R = 0.95
MIN_OVERLAP = 400
NEAR_CONST_STD = 0.01

# Families whose columns are the durability head's labels. An input tower
# carrying these is feeding the head its own target.
TARGET_FAMILIES = {"injury"}


def masked_corr(a, b, ma, mb) -> tuple[float, int]:
    """Pearson r over rows where both features are observed."""
    both = (ma > 0) & (mb > 0)
    n = int(both.sum())
    if n < MIN_OVERLAP:
        return 0.0, n
    x, y = a[both].astype(np.float64), b[both].astype(np.float64)
    sx, sy = x.std(), y.std()
    if sx < 1e-9 or sy < 1e-9:
        return 0.0, n
    return float(((x - x.mean()) * (y - y.mean())).mean() / (sx * sy)), n


def main() -> None:
    m = np.load(MATRIX, allow_pickle=True)
    man = json.loads(MANIFEST.read_text(encoding="utf-8"))
    Z, M = m["Z"], m["mask"]
    feats: list[str] = man["features"]
    fam_of: dict[str, str] = man["families"]
    seasons = np.array([str(s) for s in m["season"]])
    yr = np.array([int(s[:4]) for s in seasons])

    fam_cols: dict[str, list[int]] = defaultdict(list)
    for j, f in enumerate(feats):
        fam_cols[fam_of.get(f, "?")].append(j)

    report: dict = {
        "rows": int(Z.shape[0]),
        "features": len(feats),
        "families": len(fam_cols),
    }

    # 1. dead / near-constant on observed rows
    dead = []
    for j, f in enumerate(feats):
        obs = M[:, j] > 0
        cov = float(obs.mean())
        if obs.sum() < MIN_OVERLAP:
            dead.append(
                {
                    "feature": f,
                    "family": fam_of.get(f),
                    "coverage": round(cov, 4),
                    "why": "coverage below usable threshold",
                }
            )
            continue
        sd = float(Z[obs, j].std())
        if sd < NEAR_CONST_STD:
            dead.append(
                {
                    "feature": f,
                    "family": fam_of.get(f),
                    "coverage": round(cov, 4),
                    "sd": round(sd, 6),
                    "why": "near-constant where observed",
                }
            )
    report["dead_or_constant"] = dead

    # 2. redundant pairs
    dups = []
    for j in range(len(feats)):
        for k in range(j + 1, len(feats)):
            r, n = masked_corr(Z[:, j], Z[:, k], M[:, j], M[:, k])
            if abs(r) >= DUP_R:
                dups.append(
                    {
                        "a": feats[j],
                        "b": feats[k],
                        "family_a": fam_of.get(feats[j]),
                        "family_b": fam_of.get(feats[k]),
                        "r": round(r, 4),
                        "n": n,
                    }
                )
    dups.sort(key=lambda d: -abs(d["r"]))
    report["redundant_pairs"] = dups

    # 3. leak candidates: input column ~ head-target column
    target_cols = [j for j, f in enumerate(feats) if fam_of.get(f) in TARGET_FAMILIES]
    leaks = []
    for j in target_cols:
        for k in range(len(feats)):
            if fam_of.get(feats[k]) in TARGET_FAMILIES:
                continue
            r, n = masked_corr(Z[:, j], Z[:, k], M[:, j], M[:, k])
            if abs(r) >= LEAK_R:
                leaks.append(
                    {
                        "target": feats[j],
                        "input": feats[k],
                        "input_family": fam_of.get(feats[k]),
                        "r": round(r, 4),
                        "n": n,
                    }
                )
    leaks.sort(key=lambda d: -abs(d["r"]))
    report["leak_candidates"] = leaks

    # 4. coverage across the split boundary the game depends on
    eras = {
        "le_2021": yr <= 2021,
        "2022_23": (yr >= 2022) & (yr <= 2023),
        "2024_plus": yr >= 2024,
    }
    fam_cov = {}
    cliffs = []
    for fam, cols in sorted(fam_cols.items()):
        cov = {name: round(float(M[msk][:, cols].mean()), 4) for name, msk in eras.items()}
        fam_cov[fam] = cov
        if cov["le_2021"] > 0.15 and cov["2024_plus"] < cov["le_2021"] * 0.5:
            cliffs.append({"family": fam, **cov})
    report["family_coverage_by_era"] = fam_cov
    report["coverage_cliffs_2024"] = cliffs

    # 5. within-family redundancy: mean |r| among a family's own columns
    fam_red = {}
    for fam, cols in sorted(fam_cols.items()):
        if len(cols) < 2:
            continue
        rs = []
        for i in range(len(cols)):
            for j in range(i + 1, len(cols)):
                r, n = masked_corr(Z[:, cols[i]], Z[:, cols[j]], M[:, cols[i]], M[:, cols[j]])
                if n >= MIN_OVERLAP:
                    rs.append(abs(r))
        if rs:
            fam_red[fam] = {
                "n_features": len(cols),
                "mean_abs_r": round(float(np.mean(rs)), 4),
                "max_abs_r": round(float(np.max(rs)), 4),
            }
    report["within_family_redundancy"] = fam_red

    OUT.write_text(json.dumps(report, indent=1), encoding="utf-8")

    print(f"rows={report['rows']} features={report['features']} families={report['families']}")
    print(f"dead/near-constant: {len(dead)}")
    for d in dead[:10]:
        print(f"  {d['feature']:26s} {d.get('why')}")
    print(f"redundant pairs |r|>={DUP_R}: {len(dups)}")
    for d in dups[:12]:
        print(f"  {d['a']:26s} ~ {d['b']:26s} r={d['r']:+.4f} ({d['family_a']}/{d['family_b']})")
    print(f"leak candidates |r|>={LEAK_R}: {len(leaks)}")
    for d in leaks[:10]:
        print(f"  target {d['target']:22s} <- {d['input']:24s} r={d['r']:+.4f} [{d['input_family']}]")
    print(f"coverage cliffs at 2024: {len(cliffs)}")
    for c in cliffs:
        print(f"  {c['family']}: {c['le_2021']} -> {c['2024_plus']}")
    print("most redundant families (mean |r|):")
    for fam, v in sorted(fam_red.items(), key=lambda kv: -kv[1]["mean_abs_r"])[:6]:
        print(f"  {fam:14s} n={v['n_features']:2d} mean|r|={v['mean_abs_r']:.3f} max={v['max_abs_r']:.3f}")
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()

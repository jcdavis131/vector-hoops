#!/usr/bin/env python3
"""No All-Star selection is a KNOWN zero, not an unknown. Fix the honors mask.

Solo personal project, no connection to employer, built with public/free-tier only

The five HON_* columns in pipeline/data/train_matrix.npz are observed on 1,132 of 12,966
rows — 8.73%, the lowest coverage in the matrix. That reads as a data gap and is not one.

    honors.json   cache_complete: true    award_seasons: 30    players: 1132

The fetch is COMPLETE. The 1,132 rows are every player-season that received any recognition;
the other 11,834 received none. build_honors.py's own docstring says what the features mean:

    HON_ALL_NBA_VOTE_LAG   prior season vote points (0 if none)
    HON_ASG_LAG            1 if prior season All-Star
    HON_VOTE_RECOG         1 if prior season received any All-NBA vote pts

"0 if none" and "1 if" are TOTAL definitions. A player who was not an All-Star has the value
0, and that is a fact about him, not an absence of information. Masking it unobserved tells
the model "unknown" for 91.3% of rows and removes its ability to distinguish a career role
player from a player it has never heard of — arguably the most informative single bit about
most of the population.

This is the mask defect this estate keeps finding, running in the opposite direction from
usual. Normally a structural zero is left UNMASKED and gets read as a measurement. Here a
genuine measurement of zero is MASKED and gets read as missing.

THE Z-SCORING MUST BE REDONE, NOT PATCHED AROUND. integrate_context.py:436-441 era-z's each
feature within its season pool:

    mu = nanmean(block); sd = nanstd(block) or 1.0
    Z = clip((block - mu) / sd, -4, 4);  M = 1 where valid

Those statistics are currently computed over the 1,132 honoured rows ONLY, so the stored
values are z-scores against a population of award winners. Writing raw 0.0 into the other
11,436 rows would mix raw and z-scored numbers in one column. The whole column is recomputed
instead: raw 0 for the unhonoured, then mean/sd over the FULL season pool. Honoured players
consequently move far into the tail and many clip at +4, which is correct — that is what
being an All-NBA player looks like against everyone who played that year.

1996-97 STAYS MASKED. It is the panel's first season, so a LAGGED honour has no prior season
to lag from. 398 rows, genuinely undefined, and filling them with 0 would assert that nobody
in 1996-97 had been recognised the year before.

    python pipeline/fix_honors_mask.py            # report only
    python pipeline/fix_honors_mask.py --write    # patch train_matrix.npz
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MATRIX = ROOT / "pipeline" / "data" / "train_matrix.npz"
HONORS = ROOT / "pipeline" / "data" / "honors.json"
MANIFEST = ROOT / "pipeline" / "data" / "feature_manifest.json"

HON = ("HON_ALL_NBA_TEAM_LAG", "HON_ALL_NBA_VOTE_LAG", "HON_ASG_LAG",
       "HON_ASG_CUM", "HON_VOTE_RECOG")


def norm(s: str) -> str:
    return " ".join(str(s).lower().replace(".", "").replace("'", "").split())


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    hon = json.loads(HONORS.read_text(encoding="utf-8"))
    if not hon.get("cache_complete"):
        print("honors.json cache_complete is false — refusing. An incomplete fetch means "
              "absence does NOT imply zero, and this whole correction depends on it.")
        return 2

    z = np.load(MATRIX, allow_pickle=True)
    man = json.loads(MANIFEST.read_text(encoding="utf-8"))
    names = [x if isinstance(x, str) else (x.get("feature") or x.get("name"))
             for x in man["features"]]
    Z, M = z["Z"].copy(), z["mask"].copy()
    seasons = z["season"].astype(str)
    players = z["name"].astype(str)

    missing = [f for f in HON if f not in names]
    if missing:
        print(f"features absent from manifest, refusing: {missing}")
        return 2
    col = {f: names.index(f) for f in HON}

    lut = {(norm(p["name"]), p["season"]): p for p in hon["players"]}
    first_season = sorted(set(seasons.tolist()))[0]

    before_obs = {f: int((M[:, col[f]] > 0).sum()) for f in HON}
    filled = 0
    for f in HON:
        j = col[f]
        raw = np.full(len(seasons), np.nan, dtype=np.float64)
        for i, (nm, s) in enumerate(zip(players, seasons)):
            if s == first_season:
                continue                     # lag undefined in the panel's first season
            rec = lut.get((norm(nm), s))
            raw[i] = float(rec.get(f, 0.0)) if rec else 0.0
        # exactly integrate_context.py's era-z, over the FULL season pool this time
        for s in set(seasons.tolist()):
            idx = np.where(seasons == s)[0]
            block = raw[idx]
            valid = ~np.isnan(block)
            if not valid.any():
                continue
            mu = float(np.nanmean(block))
            sd = float(np.nanstd(block)) or 1.0
            zb = (block - mu) / sd
            for k, i in enumerate(idx):
                if valid[k]:
                    Z[i, j] = np.clip(zb[k], -4, 4)
                    M[i, j] = 1.0
        filled += int((M[:, j] > 0).sum()) - before_obs[f]

    n = len(seasons)
    print(f"rows {n}   honoured player-seasons in honors.json {len(hon['players'])}\n")
    print(f"  {'feature':24} {'before':>7} {'after':>7} {'coverage':>9}")
    for f in HON:
        a = int((M[:, col[f]] > 0).sum())
        print(f"  {f:24} {before_obs[f]:>7} {a:>7} {100*a/n:>8.1f}%")
    print(f"\n  {first_season} deliberately left masked "
          f"({int((seasons == first_season).sum())} rows) — a LAGGED honour has no prior "
          f"season to lag from")
    print(f"  matrix mean observed: {100*z['mask'].mean():.1f}% -> {100*M.mean():.1f}%")

    j = col["HON_ASG_LAG"]
    obs = M[:, j] > 0
    print(f"\n  HON_ASG_LAG after: min {Z[obs, j].min():.3f}  max {Z[obs, j].max():.3f}  "
          f"share at +4 clip {float((Z[obs, j] >= 3.999).mean()):.4f}")

    if args.write:
        out = {k: z[k] for k in z.files}
        out["Z"], out["mask"] = Z, M
        np.savez(MATRIX, **out)
        print(f"\nwrote {MATRIX}")
    else:
        print("\ndry run — pass --write to patch the matrix")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

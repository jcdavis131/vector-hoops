"""Cut the held-out projection error out of a 2.8 MB file, per feature, with a baseline.

`assets/next_profile_eval.json` holds 12,966 rows of "what the model predicted
this player would become" against "what they actually became", and its summary
gives one number:

    {"rows": 12966, "scored": 10108, "pending": 491, "noNext": 2367,
     "meanAbsErrPrimary": 0.459}

**0.459 what?** Era-z units, mean absolute error over the primary features. On its
own that is unreadable: a reader cannot tell whether it is good without knowing
what doing nothing would score. So this computes both — the model's error and the
error of predicting the era mean for everybody — and the ratio between them.

Reproduced from the rows rather than copied: the primary-feature mean comes out
at 0.459, which is what the source summary says.

What it shows, and the reason the page exists:

    offensive glass     0.337 against 0.825 guessing   ratio 0.41
    on-court impact     0.650 against 0.741 guessing   ratio 0.88

The model can see a player's **shape** coming. It cannot see their **impact**
coming — that feature is barely better than guessing. Which is the honest answer
to what /dfs used to promise.

The whole slice is ~2.5 KB against the 2,873,826 it is cut from, so a page can
read it without pulling the evaluation set down.

    python scripts/build_projection_eval.py            # write
    python scripts/build_projection_eval.py --check    # fail if stale
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "next_profile_eval.json"
PROJ = ROOT / "assets" / "projections.json"
TARGET = ROOT / "assets" / "projection_eval.json"


def build() -> dict:
    d = json.loads(SOURCE.read_text(encoding="utf-8"))
    feats, labels = d["features"], d.get("featureLabels") or {}
    primary = set(d.get("primaryFeatures") or feats)
    n = len(feats)

    err = [0.0] * n
    base = [0.0] * n
    cnt = [0] * n
    for r in d["rows"].values():
        if r.get("status") != "scored":
            continue
        pred, actual = r.get("pred"), r.get("actual")
        if not pred or not actual:
            continue
        for i in range(n):
            p, a = pred[i], actual[i]
            if p is None or a is None:
                continue
            err[i] += abs(p - a)
            # the baseline is |actual - 0|: these are era-z features, so zero is
            # the era mean, and predicting it for everyone is the do-nothing
            # forecast every error figure should be read against
            base[i] += abs(a)
            cnt[i] += 1

    rows = []
    for i in range(n):
        if not cnt[i]:
            continue
        mae, bas = err[i] / cnt[i], base[i] / cnt[i]
        rows.append({
            "key": feats[i],
            "label": labels.get(feats[i], feats[i]),
            "primary": feats[i] in primary,
            "mae": round(mae, 3),
            "baseline": round(bas, 3),
            "ratio": round(mae / bas, 3) if bas else None,
            "n": cnt[i],
        })
    rows.sort(key=lambda r: (r["ratio"] is None, r["ratio"]))

    prim = [r for r in rows if r["primary"]]
    proj_n = None
    if PROJ.exists():
        proj_n = len(json.loads(PROJ.read_text(encoding="utf-8")).get("players") or [])

    return {
        "built": "projection_eval",
        "source": "assets/next_profile_eval.json",
        "projections": "assets/projections.json",
        "method": d.get("method", ""),
        "latestSeason": d.get("latestSeason"),
        "counts": d.get("summary", {}),
        "projectedPlayers": proj_n,
        "unit": ("mean absolute error in era-z per feature. The baseline is the error of "
                 "predicting the era mean (zero) for everybody, so ratio below 1 is signal "
                 "and ratio at 1 is none."),
        "meanAbsErrPrimary": round(sum(r["mae"] for r in prim) / len(prim), 3) if prim else None,
        "baselinePrimary": round(sum(r["baseline"] for r in prim) / len(prim), 3) if prim else None,
        "features": rows,
    }


def dump(obj: dict) -> str:
    return json.dumps(obj, indent=1, sort_keys=True, ensure_ascii=False)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report drift, write nothing")
    args = ap.parse_args()

    if not SOURCE.exists():
        print(f"  SKIP  {SOURCE.name} not present")
        return 0

    obj = build()
    # the reproduction is the point: if this stops matching the source summary,
    # one of the two is wrong and the page should not be quoting either
    said = (obj["counts"] or {}).get("meanAbsErrPrimary")
    if said is not None and obj["meanAbsErrPrimary"] is not None:
        if abs(said - obj["meanAbsErrPrimary"]) > 0.0015:
            print(f"FAIL recomputed primary MAE {obj['meanAbsErrPrimary']} does not match the "
                  f"source summary's {said}")
            return 1
    want = dump(obj)

    if args.check:
        if not TARGET.exists():
            print(f"FAIL {TARGET.relative_to(ROOT).as_posix()} does not exist")
            return 1
        have = TARGET.read_text(encoding="utf-8")
        if have != want:
            print(f"FAIL {TARGET.relative_to(ROOT).as_posix()} is stale — "
                  f"run: python scripts/build_projection_eval.py")
            return 1
        print(f"OK projection_eval.json matches next_profile_eval.json — "
              f"{len(obj['features'])} features, primary MAE {obj['meanAbsErrPrimary']} against "
              f"{obj['baselinePrimary']} guessing, {len(have):,} bytes")
        return 0

    TARGET.write_text(want, encoding="utf-8", newline="")
    src = SOURCE.stat().st_size
    best, worst = obj["features"][0], obj["features"][-1]
    print(f"wrote {TARGET.relative_to(ROOT).as_posix()} — {len(obj['features'])} features from "
          f"{obj['counts'].get('scored'):,} scored rows, {len(want):,} bytes "
          f"({100 * len(want) / src:.2f}% of the {src:,} it was cut from)")
    print(f"  primary MAE {obj['meanAbsErrPrimary']} against {obj['baselinePrimary']} guessing")
    print(f"  best  {best['label']} {best['mae']} vs {best['baseline']} (ratio {best['ratio']})")
    print(f"  worst {worst['label']} {worst['mae']} vs {worst['baseline']} (ratio {worst['ratio']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Cut a 2.75 MB props file down to the handful of numbers a page can honestly show.

`/player` fetched `assets/data/player_season_props.json` — **2,753,469 bytes** —
on every visit and then did this with it:

    if(Array.isArray(props) && props.length){ ...mean... }
    else  props avgΔ -1.02 fallback — Wemby +5.7 Castle even Harper +0.2

The file is an object, not an array. `Array.isArray` is false, so the branch that
computes anything never ran: **the whole file was downloaded, parsed and
discarded on every visit, and the line was always the typed fallback.**

The typed fallback was also wrong. Measured over the 3,407 scored player-seasons
in the file, mean `pts_delta` is **-0.035**. The page said -1.02. Of the three
players it named, only Wembanyama's +5.7 is in there; Castle and Harper appear
solely in 2026-27, where nothing is scored yet.

So this cuts the file to what a page can stand behind: per-season counts and
means, the overall figure, the biggest real movers, and the source line verbatim —
because the "prop" here is *the prior season's average rounded to 0.5*, not a
market line, and a page saying "props" without that is saying the wrong thing.

    python scripts/build_props_summary.py            # write
    python scripts/build_props_summary.py --check    # fail if stale
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "data" / "player_season_props.json"
TARGET = ROOT / "assets" / "props_summary.json"
TOP = 5
# Half a season. Ranked by raw |delta| the top mover was Alondes Williams at
# -51.3 off four games; the list was measuring sample size, not movement.
MIN_GP = 41


def build() -> dict:
    d = json.loads(SOURCE.read_text(encoding="utf-8"))
    seasons = d.get("seasons") or {}

    rows, scored_all = [], []
    for name in sorted(seasons):
        block = seasons[name]
        vals = [r["pts_delta"] for r in block.values() if r.get("pts_delta") is not None]
        scored_all += vals
        rows.append({
            "season": name,
            "players": len(block),
            "scored": len(vals),
            "meanPtsDelta": round(statistics.mean(vals), 3) if vals else None,
            "medianPtsDelta": round(statistics.median(vals), 2) if vals else None,
        })

    # the biggest real movers, from the most recent season that has actuals
    latest = next((r["season"] for r in reversed(rows) if r["scored"]), None)
    movers = []
    if latest:
        pool = [r for r in seasons[latest].values()
                if r.get("pts_delta") is not None and (r.get("gp") or 0) >= MIN_GP]
        pool.sort(key=lambda r: -abs(r["pts_delta"]))
        movers = [{"name": r["name"], "ptsDelta": round(r["pts_delta"], 2),
                   "ptsProp": r.get("pts_prop"), "ptsActual": r.get("pts_actual"),
                   "gp": r.get("gp")}
                  for r in pool[:TOP]]

    return {
        "built": "props_summary",
        "source": SOURCE.relative_to(ROOT).as_posix(),
        "sourceMethod": d.get("source", ""),
        "note": ("A prop here is the prior season's average rounded to 0.5, not a market "
                 "line. pts_delta is actual minus that. Seasons with no actuals yet are "
                 "counted and left unscored rather than filled in."),
        "seasons": rows,
        "scored": len(scored_all),
        "players": sum(r["players"] for r in rows),
        "meanPtsDelta": round(statistics.mean(scored_all), 3) if scored_all else None,
        "medianPtsDelta": round(statistics.median(scored_all), 2) if scored_all else None,
        "latestScoredSeason": latest,
        "moversMinGp": MIN_GP,
        "moversQualified": len([r for r in seasons.get(latest, {}).values()
                                if r.get("pts_delta") is not None
                                and (r.get("gp") or 0) >= MIN_GP]) if latest else 0,
        "biggestMovers": movers,
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
    want = dump(obj)

    if args.check:
        if not TARGET.exists():
            print(f"FAIL {TARGET.relative_to(ROOT).as_posix()} does not exist")
            return 1
        have = TARGET.read_text(encoding="utf-8")
        if have != want:
            print(f"FAIL {TARGET.relative_to(ROOT).as_posix()} is stale — "
                  f"run: python scripts/build_props_summary.py")
            return 1
        print(f"OK props_summary.json matches player_season_props.json — {obj['scored']:,} "
              f"scored of {obj['players']:,}, mean pts_delta {obj['meanPtsDelta']}, "
              f"{len(have):,} bytes")
        return 0

    TARGET.write_text(want, encoding="utf-8", newline="")
    src = SOURCE.stat().st_size
    print(f"wrote {TARGET.relative_to(ROOT).as_posix()} — {obj['scored']:,} scored of "
          f"{obj['players']:,} player-seasons over {len(obj['seasons'])} seasons, "
          f"mean pts_delta {obj['meanPtsDelta']:+}, {len(want):,} bytes "
          f"({100 * len(want) / src:.3f}% of the {src:,} it was cut from)")
    if obj["biggestMovers"]:
        m = obj["biggestMovers"][0]
        print(f"  biggest mover in {obj['latestScoredSeason']}: {m['name']} "
              f"{m['ptsDelta']:+} (prop {m['ptsProp']}, actual {m['ptsActual']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

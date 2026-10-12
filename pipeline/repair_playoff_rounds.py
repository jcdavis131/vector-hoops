"""Recompute team ``rounds`` from ``po_wins`` + season (era-aware).

Repairs cached ``pipeline/cache/playoffs_*.json`` written with the old
modern-only win thresholds (15-win champions labeled as conf. finals).
Does not refetch from the network.

Run:  python pipeline/repair_playoff_rounds.py
      python pipeline/build_playoffs.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from fetch_playoffs import rounds_from_playoff_wins  # noqa: E402
from nba_http import real_playoff_cache_paths  # noqa: E402


def main() -> None:
    paths = real_playoff_cache_paths(ROOT / "pipeline" / "cache")
    if not paths:
        raise SystemExit("no playoffs_*.json caches found")
    fixed_teams = 0
    touched_files = 0
    for path in paths:
        doc = json.loads(path.read_text(encoding="utf-8"))
        season = doc["season"]
        changed = False
        for _tid, rec in (doc.get("teams") or {}).items():
            wins = int(rec.get("po_wins") or 0)
            correct = rounds_from_playoff_wins(season, wins)
            if int(rec.get("rounds") or -1) != correct:
                rec["rounds"] = correct
                fixed_teams += 1
                changed = True
        if changed:
            path.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
            touched_files += 1
            print(f"{season}: repaired rounds")
    print(f"done — {fixed_teams} team rows across {touched_files} season caches")


if __name__ == "__main__":
    main()

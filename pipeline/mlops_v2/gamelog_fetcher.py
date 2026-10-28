"""Operator-machine gamelog fetcher — PLAN by default, fetch only on
explicit operator confirmation.

The 11 gamelog JSONLs (2015-16..2025-26) are the 143 chain's single
blocking fetch. They MUST run on an operator machine (Alienware/Mac):
Hatch stalls / CDN 403s on NBA shot data, and this fetcher never fakes
a Hatch success. Default mode writes the fetch plan + size manifest
only and exits 0 without touching the network.

Live mode requires BOTH:
  --live  (explicit)  AND  --i-am-on-operator-machine  (explicit)
and refuses on any other host claim. Live mode reuses the existing
pipeline/fetch_gamelogs.py producer (nba_api PlayerGameLogs) when
present; this file owns the plan, the 18-col KEEP schema check, and
the honest failure report — it never invents rows.

KEEP schema (game-logs-gap.md §1a, verbatim): PLAYER_ID, PLAYER_NAME,
TEAM_ID, TEAM_ABBREVIATION, GAME_ID, GAME_DATE, MIN, PTS, AST, OREB,
DREB, STL, BLK, TOV, FGA, FG3A, FTA, PLUS_MINUS.
All game types are kept in the file; consumers filter to regular
season via GAME_ID prefix 002 — EXCEPT roster, which does NOT filter
(known skew; roster 002-filter ruling still owed before trusting
ROSTER_MIN_RANK).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from .common import OUT, PIPE, provenance, write_json

KEEP18 = ["PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "TEAM_ABBREVIATION",
          "GAME_ID", "GAME_DATE", "MIN", "PTS", "AST", "OREB", "DREB",
          "STL", "BLK", "TOV", "FGA", "FG3A", "FTA", "PLUS_MINUS"]

SEASONS = [f"{y}-{str(y + 1)[2:]}" for y in range(2015, 2026)]  # 2015-16..2025-26


def plan():
    return {
        "stage": "gamelog-fetch-plan",
        "files": len(SEASONS),
        "seasons": SEASONS,
        "producer": "pipeline/fetch_gamelogs.py (nba_api PlayerGameLogs, "
                    "stats.nba.com) — operator machine only",
        "keep_schema_18": KEEP18,
        "estimated_total": "~160-270 MB for 11 files (~780,000 rows)",
        "game_type_rule": "keep ALL game types in file; consumers filter "
                          "to regular season (GAME_ID prefix 002) EXCEPT "
                          "roster (no filter — known skew, ruling owed)",
        "pre_2015_rule": "no file by design; pre-2015 rows stay masked",
        "existing_producer_present": (PIPE / "fetch_gamelogs.py").exists(),
        "columns_unblocked_by_this_fetch": {
            "form": 5, "roster": 5, "career_gamelog": 3, "competition": 4,
            "injury": 4, "team": 5, "system": 6, "total": 32,
        },
        "host_rule": "Hatch stalls / CDN 403s on NBA shot data. Live fetch "
                     "requires --live + --i-am-on-operator-machine. "
                     "No evasion of blocks, captchas, or rate limits, ever.",
        "provenance": provenance(
            "stats.nba.com PlayerGameLogs (NBA-origin)",
            "NEEDS PERMISSION (league-operator express prior consent)",
            "plan only in default mode; live fetch via fetch_gamelogs.py",
        ),
    }


def main(argv):
    live = "--live" in argv
    operator = "--i-am-on-operator-machine" in argv
    p = plan()
    if not live:
        write_json(OUT / "fetch-plans" / "gamelog_fetch_plan.json", p)
        print("DRY-RUN: fetch plan written; no network touched.")
        print(f"  11 files, seasons {SEASONS[0]}..{SEASONS[-1]}, "
              f"KEEP schema {len(KEEP18)} cols")
        print("  To fetch on an operator machine: run this module with "
              "--live --i-am-on-operator-machine there.")
        return 0
    if not operator:
        print("REFUSED: --live without --i-am-on-operator-machine. "
              "Gamelog fetch is operator-machine only.", file=sys.stderr)
        return 2
    # Operator machine: hand off to the existing producer, then verify.
    import subprocess
    proc = subprocess.run([sys.executable, str(PIPE / "fetch_gamelogs.py")],
                          capture_output=True, text=True, timeout=7200)
    print(proc.stdout[-2000:])
    if proc.returncode != 0:
        print(proc.stderr[-2000:], file=sys.stderr)
        print("LIVE FETCH FAILED — honest failure, no rows invented.",
              file=sys.stderr)
        return proc.returncode
    # Verify KEEP schema on whatever landed.
    data_dir = PIPE / "data"
    bad = []
    for s in SEASONS:
        f = data_dir / f"gamelogs_{s}.jsonl"
        if not f.exists():
            bad.append(f"{s}: MISSING")
            continue
        with f.open() as fh:
            first = fh.readline()
        if not first:
            bad.append(f"{s}: EMPTY")
            continue
        cols = set(json.loads(first).keys())
        missing = [c for c in KEEP18 if c not in cols]
        if missing:
            bad.append(f"{s}: missing {missing}")
    p["verification"] = {"bad": bad, "ok": not bad}
    write_json(OUT / "fetch-plans" / "gamelog_fetch_report.json", p)
    if bad:
        print("VERIFICATION FAILED:", bad, file=sys.stderr)
        return 3
    print("Gamelog fetch verified: 11 files, KEEP schema present.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

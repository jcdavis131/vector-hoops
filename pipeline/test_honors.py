"""Track J (honors) invariant gates — run after every build_honors.py.

Uses real BBRef award caches when present, else the committed fixture.
Rebuilds honors.json, then checks lag rules, vote-getter coverage, and
known spot checks (Jokić, Edwards vote-getter without team slot).

Run:  python pipeline/test_honors.py        (exit 0 = all gates pass)
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from build_honors import real_honor_cache_paths

CACHE_DIR = ROOT / "pipeline" / "cache"
HONORS = ROOT / "pipeline" / "data" / "honors.json"
ASSET = ROOT / "assets" / "honors.json"

FAILURES: list[str] = []


def check(cond: bool, msg: str) -> None:
    safe = msg.encode(sys.stdout.encoding or "utf-8", errors="backslashreplace").decode(
        sys.stdout.encoding or "utf-8", errors="backslashreplace")
    print(f"  [{'PASS' if cond else 'FAIL'}] {safe}")
    if not cond:
        FAILURES.append(msg)


def rebuild() -> bool:
    """Re-derive honors.json; returns True if REAL per-season caches were used."""
    real = bool(real_honor_cache_paths(CACHE_DIR))
    cmd = [sys.executable, "pipeline/build_honors.py"] + ([] if real else ["--fixture"])
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if proc.returncode != 0:
        print(proc.stdout + proc.stderr)
        raise SystemExit("build_honors.py failed")
    print(f"  (derived from {'REAL caches' if real else 'example fixture'})")
    return real


def main() -> None:
    real = rebuild()
    doc = json.loads(HONORS.read_text(encoding="utf-8"))
    rows = doc["players"]
    by = {(r["name"], r["season"]): r for r in rows}
    contemp = doc.get("contemporaneous", {})

    print("lag rule + vote-getter coverage")
    # Award year 2023-24 -> lagged row on 2024-25 season
    jok_lag = by.get(("Nikola Jokić", "2024-25"))
    check(jok_lag is not None, "Jokić 2024-25 has lagged honors row (from 2023-24 awards)")
    if jok_lag:
        check(jok_lag.get("HON_ALL_NBA_TEAM_LAG") == 3.0,
              f"Jokić lag All-NBA first team == 3 ({jok_lag.get('HON_ALL_NBA_TEAM_LAG')})")
        check(jok_lag.get("HON_ASG_LAG") == 1.0,
              f"Jokić lag ASG == 1 ({jok_lag.get('HON_ASG_LAG')})")

    # Vote-getter without a top-3 All-NBA slot (ORV tier)
    iverson_cont = contemp.get("Allen Iverson|1996-97", {})
    check(iverson_cont.get("allNbaVotePts", 0) > 0 and iverson_cont.get("allNbaTeam", 1) == 0,
          "Iverson 1996-97 contemporaneous: vote pts without top-3 team slot")

    ed_lag = by.get(("Anthony Edwards", "2024-25"))
    check(ed_lag is not None and ed_lag.get("HON_VOTE_RECOG") == 1.0,
          "Edwards 2024-25 lagged vote recognition from prior season")

    lebron_lag = by.get(("LeBron James", "2018-19"))
    check(lebron_lag is not None and lebron_lag.get("HON_ALL_NBA_TEAM_LAG") == 3.0,
          f"LeBron 2018-19 lag first team from 2017-18 awards "
          f"(got {lebron_lag.get('HON_ALL_NBA_TEAM_LAG') if lebron_lag else None})")

    duncan_lag = by.get(("Tim Duncan", "2000-01"))
    check(duncan_lag is not None and duncan_lag.get("HON_ALL_NBA_TEAM_LAG") == 3.0,
          f"Duncan 2000-01 lag first team from 1999-00 awards "
          f"(got {duncan_lag.get('HON_ALL_NBA_TEAM_LAG') if duncan_lag else None})")

    tier_lag_rows = sum(1 for r in rows if (r.get("HON_ALL_NBA_TEAM_LAG") or 0) > 0)
    check(tier_lag_rows > 400,
          f"lagged All-NBA team tiers backfilled ({tier_lag_rows} rows)")
    team_ok, vote_ok, asg_ok = True, True, True
    for r in rows:
        tier = r.get("HON_ALL_NBA_TEAM_LAG")
        if tier is not None and not (0 <= tier <= 3):
            team_ok = False
        vp = r.get("HON_ALL_NBA_VOTE_LAG")
        if vp is not None and vp < 0:
            vote_ok = False
        asg = r.get("HON_ASG_LAG")
        if asg is not None and asg not in (0.0, 1.0):
            asg_ok = False
    check(team_ok, "HON_ALL_NBA_TEAM_LAG in [0, 3] for every lagged row")
    check(vote_ok, "HON_ALL_NBA_VOTE_LAG >= 0 for every lagged row")
    check(asg_ok, "HON_ASG_LAG is 0 or 1 for every lagged row")

    vote_rows = sum(1 for r in rows if (r.get("HON_ALL_NBA_VOTE_LAG") or 0) > 0)
    check(vote_rows >= 1, f"at least one lagged vote-getter row ({vote_rows})")

    print("mask honesty")
    if real:
        cov = doc["coverage"]["contemporaneous_keys"]
        check(cov > 50, f"real caches cover many contemporaneous keys ({cov})")
        check(ASSET.exists(), "complete cache wrote transparent assets/honors.json")
    else:
        check(doc["cache_complete"] is True, "fixture marked complete for gate run")
        check(doc["coverage"]["contemporaneous_keys"] >= 8,
              f"fixture has contemporaneous keys ({doc['coverage']['contemporaneous_keys']})")
        check(not ASSET.exists() or doc["cache_complete"],
              "partial cache must not ship game asset without complete flag")

    print()
    if FAILURES:
        print(f"{len(FAILURES)} gate(s) FAILED")
        sys.exit(1)
    print("all honors gates passed"
          + ("" if real else " (fixture mode — run fetch_honors.py for full coverage)"))


if __name__ == "__main__":
    main()

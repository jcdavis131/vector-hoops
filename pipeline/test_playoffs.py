"""Track I (playoffs) invariant gates — run after every build_playoffs.py.

Uses the real per-season caches when present, else the committed
hand-checked fixture. Rebuilds playoffs.json so it always gates fresh
derivation logic, then checks: known joins + delta directionality (real
risers positive, faders negative), minutes/usage elevation sanity,
wins/rounds bounds, champion consistency, and mask honesty (a partial
cache must never fabricate a non-appearance).

Run:  python pipeline/test_playoffs.py        (exit 0 = all gates pass)
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from nba_http import real_playoff_cache_paths
CACHE_DIR = ROOT / "pipeline" / "cache"
PLAYOFFS = ROOT / "pipeline" / "data" / "playoffs.json"
ASSET = ROOT / "assets" / "playoffs.json"

FAILURES: list[str] = []


def check(cond: bool, msg: str) -> None:
    safe = msg.encode(sys.stdout.encoding or "utf-8", errors="backslashreplace").decode(
        sys.stdout.encoding or "utf-8", errors="backslashreplace")
    print(f"  [{'PASS' if cond else 'FAIL'}] {safe}")
    if not cond:
        FAILURES.append(msg)


def rebuild() -> bool:
    """Re-derive playoffs.json; returns True if REAL per-season caches were used."""
    real = bool(real_playoff_cache_paths(CACHE_DIR))
    cmd = [sys.executable, "pipeline/build_playoffs.py"] + ([] if real else ["--fixture"])
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if proc.returncode != 0:
        print(proc.stdout + proc.stderr)
        raise SystemExit("build_playoffs.py failed")
    print(f"  (derived from {'REAL caches' if real else 'example fixture'})")
    return real


def main() -> None:
    real = rebuild()
    doc = json.loads(PLAYOFFS.read_text(encoding="utf-8"))
    rows = doc["players"]
    by = {(r["name"], r["season"]): r for r in rows}

    print("known joins + riser/fader directionality")

    def field(name, season, f):
        r = by.get((name, season))
        return None if r is None else r.get(f)

    # Legendary playoff RISERS — PO_PTS_DELTA must be positive
    for name, season in [("Kawhi Leonard", "2018-19"), ("Jamal Murray", "2022-23"),
                         ("Kevin Durant", "2016-17"), ("Nikola Jokic", "2022-23")]:
        v = field(name, season, "PO_PTS_DELTA")
        check(v is not None and v > 0, f"{name} {season} riser (PO_PTS_DELTA {v} > 0)")

    # Known playoff FADERS — negative
    for name, season in [("James Harden", "2018-19"), ("Stephen Curry", "2015-16")]:
        v = field(name, season, "PO_PTS_DELTA")
        check(v is not None and v < 0, f"{name} {season} fader (PO_PTS_DELTA {v} < 0)")

    print("role elevation + bounds")
    # Playoff minutes generally rise for rotation stars
    kawhi_min = field("Kawhi Leonard", "2018-19", "PO_MIN_DELTA")
    check(kawhi_min is not None and kawhi_min > 0,
          f"Kawhi 2018-19 minutes elevated in playoffs (PO_MIN_DELTA {kawhi_min})")
    # Champions: 16 wins / 4 rounds (modern) OR 15 wins / 4 rounds (pre-2003 R1 best-of-5)
    check(field("Kawhi Leonard", "2018-19", "PO_TEAM_WINS") == 16.0
          and field("Kawhi Leonard", "2018-19", "PO_ROUNDS") == 4.0,
          "champion Kawhi 2018-19: 16 wins / 4 rounds")
    check(field("James Harden", "2018-19", "PO_ROUNDS") == 1.0,
          "R2-exit Harden 2018-19: rounds == 1")

    # Pre-2003 champions finished with 15 wins — must still be rounds=4 (Champion),
    # not 3 (Conf finals). Regression guard for Jordan 1997-98 screenshot bug.
    if real and ("Michael Jordan", "1997-98") in by:
        check(field("Michael Jordan", "1997-98", "PO_TEAM_WINS") == 15.0
              and field("Michael Jordan", "1997-98", "PO_ROUNDS") == 4.0,
              "champion Jordan 1997-98: 15 wins / 4 rounds (best-of-5 R1 era)")
        # Series path from game logs when present
        if ASSET.exists():
            asset = json.loads(ASSET.read_text(encoding="utf-8"))
            mj = asset["splits"].get("Michael Jordan|1997-98") or {}
            series = mj.get("series") or []
            check(len(series) == 4, f"Jordan 1997-98 series path length 4 (got {len(series)})")
            if series:
                check(series[-1].get("opp") == "UTA" and series[-1].get("result") == "4-2",
                      "Jordan 1997-98 Finals vs UTA 4-2")
                check(mj.get("champion") is True or mj.get("rounds") == 4,
                      "Jordan 1997-98 champion flag / rounds=4")
                # Outcome must not be confusable: last series is Finals, not Conf finals
                check(
                    series[-1].get("label") in ("Finals", "NBA Finals")
                    and series[-1].get("finals") is True,
                    "Jordan 1997-98 last series labeled Finals (not Conf finals)",
                )
            for season in ("1996-97", "1997-98"):
                row = asset["splits"].get(f"Michael Jordan|{season}") or {}
                check(row.get("rounds") == 4,
                      f"Jordan {season} rounds=4 Champion (got {row.get('rounds')})")
                ser = row.get("series") or []
                check(len(ser) == 4, f"Jordan {season} series path has 4 rounds")
                check(ser and ser[-1].get("label") in ("Finals", "NBA Finals"),
                      f"Jordan {season} terminal series is Finals, not Conf finals "
                      f"(got {ser[-1].get('label') if ser else None})")
                # Conf finals may appear as an earlier path step — never as the outcome.
                check(not (ser and ser[-1].get("label") == "Conf finals"),
                      f"Jordan {season} must not end on Conf finals")

            honors_asset = ROOT / "assets" / "honors.json"
            if honors_asset.exists():
                honors = json.loads(honors_asset.read_text(encoding="utf-8")).get("bySeason") or {}
                for season in ("1996-97", "1997-98"):
                    h = honors.get(f"Michael Jordan|{season}") or {}
                    check(h.get("finalsMvp") == 1,
                          f"Jordan {season} Finals MVP in honors asset")
            else:
                check(False, "assets/honors.json present for Finals MVP audit")

            paths_asset = ROOT / "assets" / "playoff_paths.json"
            if paths_asset.exists():
                paths = json.loads(paths_asset.read_text(encoding="utf-8")).get("paths") or {}
                mj_path = paths.get("Michael Jordan|1997-98") or {}
                games = mj_path.get("games") or []
                check(len(games) == 21, f"Jordan 1997-98 game log 21 games (got {len(games)})")
                if games:
                    check(games[-1].get("pts") == 45 and "UTA" in (games[-1].get("m") or ""),
                          "Jordan 1997-98 Game 6 Finals: 45 pts @ UTA")
            else:
                check(False, "assets/playoff_paths.json present when game logs cached")

    wins_ok, rounds_ok, gp_ok = True, True, True
    for r in rows:
        w, rd, gp = r.get("PO_TEAM_WINS"), r.get("PO_ROUNDS"), r.get("PO_GP")
        if w is not None and not (0 <= w <= 16):
            wins_ok = False
        if rd is not None and not (0 <= rd <= 4):
            rounds_ok = False
        if gp is not None and gp < 1:
            gp_ok = False
    check(wins_ok, "PO_TEAM_WINS in [0, 16] for every covered row")
    check(rounds_ok, "PO_ROUNDS in [0, 4] for every covered row")
    check(gp_ok, "every covered row has PO_GP >= 1 (appearance-only)")

    print("mask honesty")
    if real:
        cov = doc["coverage"]["appearances"]
        check(cov > 1000, f"real caches cover many appearances ({cov})")
        check(ASSET.exists(), "complete cache wrote transparent assets/playoffs.json")
    else:
        # Partial fixture: only the hand-listed appearances, nothing fabricated,
        # and the game asset must NOT be written from partial data.
        check(doc["cache_complete"] is False, "fixture marked incomplete")
        check(doc["coverage"]["appearances"] == len(rows) == 8,
              f"fixture emits exactly its listed appearances ({len(rows)})")
        check(not ASSET.exists(),
              "partial cache did NOT write assets/playoffs.json (game stays dormant)")

    print()
    if FAILURES:
        print(f"{len(FAILURES)} gate(s) FAILED")
        sys.exit(1)
    print("all playoff gates passed"
          + ("" if real else " (fixture mode — run fetch_playoffs.py on an "
             "operator machine for full coverage)"))


if __name__ == "__main__":
    main()

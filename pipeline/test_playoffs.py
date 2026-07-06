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
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / "pipeline" / "cache"
PLAYOFFS = ROOT / "pipeline" / "data" / "playoffs.json"
ASSET = ROOT / "assets" / "playoffs.json"

FAILURES: list[str] = []


def check(cond: bool, msg: str) -> None:
    print(f"  [{'PASS' if cond else 'FAIL'}] {msg}")
    if not cond:
        FAILURES.append(msg)


def rebuild() -> bool:
    """Re-derive playoffs.json; returns True if REAL caches were used."""
    real = bool(list(CACHE_DIR.glob("playoffs_*.json")))
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
                         ("Kevin Durant", "2016-17"), ("Nikola Jokić", "2022-23")]:
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
    # Champions: 16 wins, 4 rounds
    check(field("Kawhi Leonard", "2018-19", "PO_TEAM_WINS") == 16.0
          and field("Kawhi Leonard", "2018-19", "PO_ROUNDS") == 4.0,
          "champion Kawhi 2018-19: 16 wins / 4 rounds")
    check(field("James Harden", "2018-19", "PO_ROUNDS") == 1.0,
          "R2-exit Harden 2018-19: rounds == 1")

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

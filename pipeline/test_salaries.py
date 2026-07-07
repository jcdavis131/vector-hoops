"""Market / salary invariant gates — run after build_salary_market.py.

Rebuilds salary_market.json, then checks cap %, team payroll share, and
rank bounds plus a few hand-checked stars.

Run:  python pipeline/test_salaries.py
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MARKET = ROOT / "pipeline" / "data" / "salary_market.json"

FAILURES: list[str] = []


def check(cond: bool, msg: str) -> None:
    safe = msg.encode(sys.stdout.encoding or "utf-8", errors="backslashreplace").decode(
        sys.stdout.encoding or "utf-8", errors="backslashreplace")
    print(f"  [{'PASS' if cond else 'FAIL'}] {safe}")
    if not cond:
        FAILURES.append(msg)


def rebuild() -> None:
    proc = subprocess.run(
        [sys.executable, "pipeline/build_salary_market.py"],
        cwd=ROOT, capture_output=True, text=True,
    )
    if proc.returncode != 0:
        print(proc.stdout + proc.stderr)
        raise SystemExit("build_salary_market.py failed")


def main() -> None:
    rebuild()
    doc = json.loads(MARKET.read_text(encoding="utf-8"))
    rows = doc["players"]
    by = {(r["name"], r["season"]): r for r in rows}
    cov = doc["coverage"]

    print("coverage")
    check(cov["labeled_rows"] > 5000,
          f"labeled rows > 5000 ({cov['labeled_rows']})")
    check(cov["cap_pct_rows"] > 5000,
          f"cap% rows > 5000 ({cov['cap_pct_rows']})")
    check(cov["team_pct_rows"] > 4000,
          f"team payroll % rows > 4000 ({cov['team_pct_rows']})")

    print("bounds")
    cap_ok, team_ok, rank_ok, log_ok = True, True, True, True
    for r in rows:
        cap = r.get("SALARY_CAP_PCT")
        if cap is not None and not (0 < cap <= 1.35):
            cap_ok = False
        team = r.get("SALARY_TEAM_PCT")
        if team is not None and not (0 < team <= 1.0):
            team_ok = False
        rank = r.get("SALARY_RANK_POS")
        if rank is not None and not (0 <= rank <= 1):
            rank_ok = False
        slog = r.get("SALARY_LOG")
        if slog is not None and slog < 4.0:
            log_ok = False
    check(cap_ok, "SALARY_CAP_PCT in (0, 1.35] for covered rows")
    check(team_ok, "SALARY_TEAM_PCT in (0, 1.0] for covered rows")
    check(rank_ok, "SALARY_RANK_POS in [0, 1]")
    check(log_ok, "SALARY_LOG >= 4.0 for covered rows (min ~$10k)")

    print("spot checks")
    def field(name, season, f):
        r = by.get((name, season))
        return None if r is None else r.get(f)

    lebron = field("LeBron James", "2016-17", "SALARY_CAP_PCT")
    check(lebron is not None and lebron >= 0.2,
          f"LeBron 2016-17 cap% >= 20% (got {lebron})")

    jordan = field("Michael Jordan", "1996-97", "SALARY_TEAM_PCT")
    check(jordan is not None and jordan >= 0.4,
          f"Jordan 1996-97 team payroll% >= 40% (got {jordan})")

    garnett = field("Kevin Garnett", "2003-04", "SALARY_RANK_POS")
    check(garnett is not None and garnett >= 0.95,
          f"Garnett 2003-04 top salary rank (got {garnett})")

    print()
    if FAILURES:
        print(f"{len(FAILURES)} gate(s) FAILED")
        sys.exit(1)
    print("all salary market gates passed")


if __name__ == "__main__":
    main()

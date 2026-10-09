"""Market / salary invariant gates — run after build_salary_market.py.

Rebuilds salary_market.json into a tmp --out-root (never pipeline/data),
then checks cap %, team payroll share, and rank bounds plus a few
hand-checked stars.

local_data: build_salary_market reads pipeline/data/roster_context.json for
the team of each player-season, and returns {} without it, so the team-payroll
gates can only be checked where that gitignored file exists. The rebuild used
to write pipeline/data/salary_market.json in place, a training input
integrate_context reads.

Run:  python -m pytest pipeline/test_salaries.py
      python pipeline/test_salaries.py        (same tests; exit 0 = all gates pass)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
ROSTER = ROOT / "pipeline" / "data" / "roster_context.json"
MARKET = Path("pipeline") / "data" / "salary_market.json"

pytestmark = pytest.mark.local_data


@pytest.fixture(scope="module")
def built(tmp_path_factory) -> dict:
    if not ROSTER.exists():
        pytest.skip(f"local data missing: {ROSTER.relative_to(ROOT)} (team-payroll gates need it)")
    out = tmp_path_factory.mktemp("salaries")
    proc = subprocess.run(
        [sys.executable, "pipeline/build_salary_market.py", "--out-root", str(out)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        errors="replace",
    )
    assert proc.returncode == 0, f"build_salary_market.py failed:\n{proc.stdout}{proc.stderr}"
    doc = json.loads((out / MARKET).read_text(encoding="utf-8"))
    return {"doc": doc, "rows": doc["players"], "by": {(r["name"], r["season"]): r for r in doc["players"]}}


def test_coverage(built):
    cov = built["doc"]["coverage"]
    assert cov["labeled_rows"] > 5000, f"labeled rows {cov['labeled_rows']}"
    assert cov["cap_pct_rows"] > 5000, f"cap% rows {cov['cap_pct_rows']}"
    assert cov["team_pct_rows"] > 4000, f"team payroll % rows {cov['team_pct_rows']}"


def test_bounds(built):
    cap_ok, team_ok, rank_ok, log_ok = True, True, True, True
    for r in built["rows"]:
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
    assert cap_ok, "SALARY_CAP_PCT outside (0, 1.35] on some covered row"
    assert team_ok, "SALARY_TEAM_PCT outside (0, 1.0] on some covered row"
    assert rank_ok, "SALARY_RANK_POS outside [0, 1]"
    assert log_ok, "SALARY_LOG < 4.0 on some covered row (min ~$10k)"


@pytest.mark.parametrize(
    ("name", "season", "field", "floor"),
    [
        ("LeBron James", "2016-17", "SALARY_CAP_PCT", 0.2),
        ("Michael Jordan", "1996-97", "SALARY_TEAM_PCT", 0.4),
        ("Kevin Garnett", "2003-04", "SALARY_RANK_POS", 0.95),
    ],
)
def test_spot_checks(built, name, season, field, floor):
    r = built["by"].get((name, season))
    got = None if r is None else r.get(field)
    assert got is not None and got >= floor, f"{name} {season} {field} >= {floor} (got {got})"


if __name__ == "__main__":
    # Script form for export_assets.py, which reads only the exit code.
    # HOOPS_REQUIRE_LOCAL_DATA=1: a missing roster_context.json is a failure
    # here, as the old script's team-payroll gate was.
    os.environ.setdefault("HOOPS_REQUIRE_LOCAL_DATA", "1")
    sys.exit(pytest.main([__file__, "-p", "no:cacheprovider", "--runxfail"]))

"""pipeline/seasons.py: one season list, one split, and nobody writing their own.

The values are pinned to what the hard-coded lists held on 2026-10-09
(1996-97 .. 2025-26, tracking from 2013-14, hustle from 2015-16, split 2021 /
2023), so swapping a module over to seasons.py cannot change a row of the
matrix [ingest#9, health#13].

Run:  python -m pytest tests/test_seasons.py
"""

from __future__ import annotations

import datetime as dt
import re
import sys
import warnings
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import seasons  # noqa: E402

# The comprehension every module used to spell for itself.
OLD_1996 = [f"{y}-{str(y + 1)[-2:]}" for y in range(1996, 2026)]


def test_season_range_is_the_old_hard_coded_list():
    assert seasons.season_range() == OLD_1996
    assert len(OLD_1996) == 30
    assert "1999-00" in seasons.season_range()  # the century label, not "1999-100"
    assert seasons.season_range(seasons.TRACKING_FIRST_SEASON) == OLD_1996[OLD_1996.index("2013-14") :]
    assert seasons.season_range(seasons.HUSTLE_FIRST_SEASON) == OLD_1996[OLD_1996.index("2015-16") :]
    assert seasons.season_range(seasons.PRESEASON_ODDS_FIRST_SEASON) == OLD_1996[OLD_1996.index("2003-04") :]
    assert seasons.season_range("2010-11", "2010-11") == ["2010-11"]
    with pytest.raises(ValueError):
        seasons.season_range("2020-21", "2019-20")


def test_module_lists_come_from_seasons():
    """The modules that used to carry their own copy now hold the same list."""
    import build_availability
    import build_min_gp
    import build_vectors
    import fetch_honors
    import fetch_playoff_gamelogs
    import fetch_playoffs
    import fetch_wide_skills

    for mod in (build_vectors, build_availability, build_min_gp, fetch_playoffs, fetch_playoff_gamelogs):
        assert mod.SEASONS == OLD_1996, mod.__name__
    assert fetch_wide_skills.SEASONS == OLD_1996[OLD_1996.index("2015-16") :]
    assert fetch_honors.AWARD_YEARS == list(range(1997, 2027))
    assert build_vectors.TRACKING_FIRST_SEASON == "2013-14"
    assert build_vectors.WIDE_SKILLS_FIRST_SEASON == "2015-16"


def test_no_module_spells_its_own_season_list():
    """A second copy is how sources drift apart when the season rolls over."""
    comprehension = re.compile(r'f"\{y\}-\{str\(y ?\+ ?1\)\[-2:\]\}" for y in range\(')
    pinned_range = re.compile(r"range\(1996, ?20\d\d\)")
    offenders = []
    for path in sorted([*(ROOT / "pipeline").glob("*.py"), *(ROOT / "scripts").glob("*.py")]):
        if path.name == "seasons.py":
            continue
        text = path.read_text(encoding="utf-8")
        for n, line in enumerate(text.splitlines(), 1):
            if comprehension.search(line) or pinned_range.search(line):
                offenders.append(f"{path.relative_to(ROOT).as_posix()}:{n}: {line.strip()}")
    assert not offenders, "use seasons.season_range():\n" + "\n".join(offenders)


@pytest.mark.parametrize(
    ("season", "split"),
    [("2021-22", "train"), ("2022-23", "val"), ("2023-24", "val"), ("2024-25", "test"), ("1996-97", "train")],
)
def test_eval_split_boundaries(season, split):
    assert seasons.eval_split(season) == split


def test_every_eval_split_agrees():
    """mtnn_metrics, build_eval_scoreboard and seasons used to hold three copies."""
    import build_eval_scoreboard
    import mtnn_metrics

    for s in seasons.season_range("1996-97", "2030-31"):
        assert mtnn_metrics.eval_split(s) == seasons.eval_split(s) == build_eval_scoreboard.eval_split(s), s


def test_is_final():
    assert not seasons.is_final("2025-26", dt.date(2026, 6, 20))  # Finals week
    assert not seasons.is_final("2025-26", dt.date(2026, 7, 31))
    assert seasons.is_final("2025-26", dt.date(2026, 8, 1))
    assert seasons.is_final("2024-25", dt.date(2026, 1, 1))
    assert not seasons.is_final("2026-27", dt.date(2026, 10, 9))


def test_salary_cap_table_covers_every_season():
    """nba_salary_cap.CAP_BY_SEASON is the per-season table that has no default."""
    from nba_salary_cap import CAP_BY_SEASON

    missing = [s for s in seasons.season_range() if s not in CAP_BY_SEASON]
    assert not missing, f"add these seasons to nba_salary_cap.CAP_BY_SEASON: {missing}"


def test_warn_when_last_season_is_behind_the_calendar():
    """LAST_SEASON is pinned on purpose (see seasons.py); this only says when it is out of date.

    A warning, not a failure: rolling the season adds rows and needs a
    re-baseline, which is a decision, not something a test run should force.
    """
    nxt = seasons.season_label(seasons.season_end_year(seasons.LAST_SEASON))
    tip_off = dt.date(seasons.season_end_year(seasons.LAST_SEASON), 10, 15)
    if dt.date.today() >= tip_off:
        warnings.warn(
            f"the {nxt} season has started and seasons.LAST_SEASON is still {seasons.LAST_SEASON}; "
            "see the rolling note at the top of pipeline/seasons.py",
            stacklevel=1,
        )

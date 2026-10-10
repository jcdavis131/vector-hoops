"""The seasons the pipeline covers, and where the held-out split falls.

Until 2026-10-09 every module spelled its own season list. `grep` found
`[f"{y}-{str(y + 1)[-2:]}" for y in range(1996, 2026)]` in build_vectors,
build_availability, build_min_gp, build_front_office, fetch_playoffs,
fetch_playoff_gamelogs, fetch_team_season, fetch_bbref_advanced and fetch_pbp; the
same comprehension over range(2015, 2026) in fetch_gamelogs,
fetch_wide_skills, build_front_office and fetch_missing_tracking; over
range(2013, 2026) in fetch_advanced_tracking and fetch_missing_tracking; and
over range(2003, 2026) in both preseason-odds fetchers [ingest#9, health#13].
All of them end at 2025-26, so adding 2026-27 meant editing about a dozen
files, and missing one desynchronizes the sources without an error: a season
in dashbase_* with no playoffs, min_gp or hustle cache masks those families
for every row of it. The temporal split (train <= 2021, val <= 2023, test >=
2024 by season start year) was written out in mtnn_metrics.eval_split,
build_eval_scoreboard.eval_split and audit_features.

LAST_SEASON is a pinned constant on purpose. Deriving it from today's date
would make the matrix depend on the day it was built, and would move rows
into the test split in the middle of a season, so two runs a week apart
would not be measuring the same thing.

Rolling to 2026-27 (one edit, then a re-baseline):
  1. Set LAST_SEASON = "2026-27" here, in its own commit.
  2. Fetch the new season on an operator machine (fetch_* and
     build_vectors.py without --offline). Until 2027-08-01 it is not final
     (is_final below), so those fetchers refetch it once its cache is older
     than the TTL instead of keeping the first copy forever [ingest#8].
  3. The matrix gains rows, so `python pipeline/stage_contract.py
     --accept-drift` must re-record pipeline/contracts/train_matrix.contract.json,
     and every baseline measured on the old matrix (the climb anchor, the
     promoted run's numbers) has to be measured again before anything is
     compared with it.
  4. Add the season to the per-season tables that need it: eligibility.
     SEASON_GAMES only if the schedule is not 82 games, nba_salary_cap.
     CAP_BY_SEASON always (tests/test_seasons.py checks the second).

Stdlib only, so every script can import it.
"""

from __future__ import annotations

import datetime as _dt

FIRST_SEASON = "1996-97"
LAST_SEASON = "2025-26"

# First season each source exists for. Earlier seasons are not fetched and are
# masked downstream, never filled in.
TRACKING_FIRST_SEASON = "2013-14"  # SportVU player tracking (leaguedashptstats)
HUSTLE_FIRST_SEASON = "2015-16"  # synergyplaytypes + leaguehustlestatsplayer
GAMELOG_FIRST_SEASON = "2015-16"  # first slice fetch_gamelogs pulls (VH-101)
PRESEASON_ODDS_FIRST_SEASON = "2003-04"  # first BBRef preseason_odds page used

# A season counts as final, and its cache is kept as fetched, from this date in
# its end year. Every Finals since 1996-97 ended by June except two: 2020-21
# (2021-07-20) and the 2019-20 bubble (2020-10-11). A season that runs that
# late again needs this moved, or a --refresh, before its caches are trusted.
FINAL_MONTH_DAY = (8, 1)

# Held-out temporal split by season start year: train <= TRAIN_LAST_START_YEAR,
# val <= VAL_LAST_START_YEAR, test after. Keyed on the target row of an
# adjacent-season pair (mtnn_metrics) or on a row's own season (leakfree).
# train_career_mtnn.py keeps its own, deliberately different split (2018/2021).
TRAIN_LAST_START_YEAR = 2021
VAL_LAST_START_YEAR = 2023


# stats.nba.com GAME_ID: "00" + game type + season start (2 digits) + game
# number, e.g. "0022300001". Game types: 1 preseason, 2 regular season,
# 3 All-Star, 4 playoffs, 5 play-in, 6 NBA Cup final. fetch_gamelogs keeps
# every type (other readers want them), so a regular-season feature filters
# when it reads [ingest#0].
REGULAR_SEASON_GAME_PREFIX = "002"


def is_regular_season(game_id: object) -> bool:
    """True for a regular-season GAME_ID. An int id (leading zeros lost) is re-padded to 10 digits."""
    s = str(game_id or "").strip()
    if s.isdigit() and len(s) < 10:
        s = s.zfill(10)
    return s.startswith(REGULAR_SEASON_GAME_PREFIX)


def season_label(start: int) -> str:
    """1999 -> "1999-00"."""
    return f"{start}-{str(start + 1)[-2:]}"


def season_start_year(season: str) -> int:
    return int(str(season)[:4])


def season_end_year(season: str) -> int:
    """The calendar year the season's playoffs end in: "2023-24" -> 2024."""
    return season_start_year(season) + 1


def season_range(first: str = FIRST_SEASON, last: str = LAST_SEASON) -> list[str]:
    """Every season label from first to last, both included."""
    lo, hi = season_start_year(first), season_start_year(last)
    if hi < lo:
        raise ValueError(f"season_range: last {last} is before first {first}")
    return [season_label(y) for y in range(lo, hi + 1)]


def is_final(season: str, today: _dt.date | None = None) -> bool:
    """True once the season's playoffs are over, so its numbers no longer change."""
    today = today or _dt.date.today()
    month, day = FINAL_MONTH_DAY
    return today >= _dt.date(season_end_year(season), month, day)


def eval_split(season: str) -> str:
    """The held-out split a season falls in (train, val or test), by its start year."""
    y = season_start_year(season)
    if y <= TRAIN_LAST_START_YEAR:
        return "train"
    if y <= VAL_LAST_START_YEAR:
        return "val"
    return "test"

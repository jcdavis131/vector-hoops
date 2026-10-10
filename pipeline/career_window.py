"""Which careers the caches see from their first season (left-censoring at 1996-97).

Every per-season cache starts with 1996-97 (seasons.FIRST_SEASON). A career
that began earlier is visible only from 1996-97 on, so anything counted from
its first visible season (years in the league, experience, active fraction,
career All-Star selections, years since an undrafted player's entry) is a
lower bound, not a measurement [features#4]. A value nobody measured is
missing (mask 0), never the censored count with mask 1.

A career counts as fully observed when:
  - the complete stats.nba.com draft history (person_id == PLAYER_ID) puts
    the player's earliest draft in 1996 or later: nobody plays before being
    drafted, so his first season is 1996-97 or later; or
  - he has no draft record and his first dashbase season (every player who
    played, not only charted ones) is after 1996-97. One whose first dashbase
    season is 1996-97 may have played before it.
A player drafted before 1996 is censored even if his first visible season is
later: the caches cannot rule out a season before 1996-97.

build_honors (HON_ASG_CUM) and build_career_context (YEAR_IN_LEAGUE,
CAREER_EXP_YEARS, CAREER_ACTIVE_FRAC) and build_pedigree (an undrafted
player's PED_YEARS_SINCE) share this rule.
"""

from __future__ import annotations

import json
from pathlib import Path

from seasons import FIRST_SEASON


def season_start(season: str) -> int:
    return int(str(season)[:4])


def first_seasons_by_pid(cache_dir: Path) -> dict[int, str]:
    """PLAYER_ID -> first season with a dashbase row (every player who played, 1996-97 on)."""
    first: dict[int, str] = {}
    for path in sorted(cache_dir.glob("dashbase_*.json")):
        season = path.stem.split("_", 1)[1]
        for r in json.loads(path.read_text(encoding="utf-8")):
            pid = int(r["PLAYER_ID"])
            if pid not in first or season < first[pid]:
                first[pid] = season
    return first


def draft_years_by_pid(path: Path) -> dict[int, int]:
    """person_id -> earliest draft year, from the complete stats.nba.com draft history."""
    if not path.exists():
        return {}
    doc = json.loads(path.read_text(encoding="utf-8"))
    years: dict[int, int] = {}
    for recs in (doc.get("players") or {}).values():
        for rec in recs if isinstance(recs, list) else []:
            pid, year = rec.get("person_id"), rec.get("year")
            if pid is None or year is None:
                continue
            years[int(pid)] = min(int(year), years.get(int(pid), int(year)))
    return years


def career_fully_observed(pid: int | None, draft_year: dict[int, int], first_season: dict[int, str]) -> bool:
    """Do the caches (1996-97 on) see this career from its first season?"""
    if pid is None:
        return False
    if pid in draft_year:
        return draft_year[pid] >= season_start(FIRST_SEASON)
    first = first_season.get(pid)
    return first is not None and first > FIRST_SEASON

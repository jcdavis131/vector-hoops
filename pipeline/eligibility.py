"""Schedule-aware player-season eligibility for the Vector Hoops universe.

Keeps players with enough games and minutes for per-100 rates to be meaningful;
drops small-sample outliers (two-way noise, cup stints, garbage-time cameos).

Gates scale with regular-season length (lockout / COVID schedules included).
"""

from __future__ import annotations

import math

# Regular-season team schedule length.
SEASON_GAMES: dict[str, int] = {
    "1998-99": 50,
    "2011-12": 66,
    "2019-20": 72,
    "2020-21": 72,
}
DEFAULT_SEASON_GAMES = 82

# Fallback when not using schedule-aware mode (CLI override).
DEFAULT_MIN_GP = 12
DEFAULT_MIN_TOTAL_MINUTES = 450


def season_games(season: str) -> int:
    return SEASON_GAMES.get(season, DEFAULT_SEASON_GAMES)


def derive_min_gp(season: str, *, floor: int = 10, ceiling: int = 15) -> int:
    """~15% of schedule, clamped [10, 15]. Lockout seasons floor at 10 GP."""
    return max(floor, min(ceiling, round(0.15 * season_games(season))))


def derive_min_total_minutes(season: str, *, floor: int = 450) -> int:
    """~6% of a 48-mpg rotation baseline across the schedule (~450 in 82-game yr)."""
    sg = season_games(season)
    return max(floor, round(0.06 * sg * 48))


def reliability_score(gp: int | float, total_min: float) -> float:
    """Sample-size proxy: geometric mean of GP and total minutes."""
    g, m = int(gp or 0), float(total_min or 0)
    if g <= 0 or m <= 0:
        return 0.0
    return math.sqrt(g * m)


def season_eligible(
    gp: float | int | None,
    min_per_game: float | None,
    *,
    season: str,
    min_gp: int | None = None,
    min_total_minutes: int | None = None,
    schedule_aware: bool = True,
) -> bool:
    """True when a player-season clears GP and total-minutes reliability gates."""
    g = int(gp or 0)
    mpg = float(min_per_game or 0)
    total = g * mpg
    if schedule_aware:
        mg = derive_min_gp(season) if min_gp is None else min_gp
        mt = (
            derive_min_total_minutes(season)
            if min_total_minutes is None
            else min_total_minutes
        )
    else:
        mg = min_gp if min_gp is not None else DEFAULT_MIN_GP
        mt = min_total_minutes if min_total_minutes is None else min_total_minutes
    return g >= mg and total >= mt


def gates_for_season(season: str, *, schedule_aware: bool = True) -> dict[str, int]:
    if schedule_aware:
        return {
            "season_games": season_games(season),
            "min_gp": derive_min_gp(season),
            "min_total_minutes": derive_min_total_minutes(season),
        }
    return {
        "season_games": season_games(season),
        "min_gp": DEFAULT_MIN_GP,
        "min_total_minutes": DEFAULT_MIN_TOTAL_MINUTES,
    }

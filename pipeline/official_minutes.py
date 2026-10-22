"""Official regular-season minutes for vectors.json `mpg` and `total_min` [F6].

build_vectors fetches the Base dashboard Per100Possessions, so its MIN is
minutes per 100 possessions (~48 for everyone), not minutes per game. The
served `mpg` used to be that number and `total_min` GP x it, so every
player-season past the GP gate cleared the 450-minute gate.

The source here is stats.nba.com leaguedashplayerstats MeasureType=Base
PerMode=Totals SeasonType=Regular Season, cached raw (the endpoint's own
resultSets bytes) under pipeline/cache/official_totals/totals_<season>.json,
with the URL, retrieval time and sha256 of each file in SOURCES.json. Never
Basketball-Reference: `--minutes-source real` reads its per-game table before
2015-16, which is off the data rule for this field.

    mpg       = MIN / GP   (official minutes per game; None when GP is 0)
    total_min = MIN        (official total minutes)

A player-season with no row in the Totals response has no official minutes:
both stay None (missing), never the per-100 value.

The eligibility gate (eligibility.py) still decides membership on the per-100
arithmetic, so the universe, the matrix and the served MTNN rows are
unchanged. gate_summary() counts the rows whose official minutes miss the gate
and build_vectors writes that count into vectors.json's eligibility block.
Applying the gate on official minutes removes those rows from the universe:
a new matrix, a new baseline and a re-exported served bundle, which is a
decision for the model owner, not a side effect of fixing a field.
"""

from __future__ import annotations

import json
from pathlib import Path

from eligibility import gates_for_season

CACHE_DIR = Path(__file__).resolve().parent / "cache" / "official_totals"

WHY_KEPT = (
    "membership still uses the per-100 arithmetic (GP x MIN per 100 possessions), so these rows stay: "
    "dropping them changes the universe, the training matrix, every baseline and the served MTNN rows "
    "(scripts/check_served_model.py hashes vectors.json keys against the exported f32); applying the gate "
    "on official minutes waits for a re-baseline and re-export"
)


def load_official_totals(season: str, cache_dir: Path | None = None) -> dict[int, tuple[int, float]] | None:
    """{PLAYER_ID: (GP, total MIN)} from the cached Totals response, or None when there is no cache."""
    path = (cache_dir or CACHE_DIR) / f"totals_{season}.json"
    if not path.exists():
        return None
    rs = json.loads(path.read_text(encoding="utf-8"))["resultSets"][0]
    h = rs["headers"]
    i_pid, i_gp, i_min = h.index("PLAYER_ID"), h.index("GP"), h.index("MIN")
    out: dict[int, tuple[int, float]] = {}
    for r in rs["rowSet"]:
        gp, mins = r[i_gp], r[i_min]
        if gp is None or mins is None:
            continue
        out[int(r[i_pid])] = (int(gp), float(mins))
    return out


def official_minutes(entry: tuple[int, float] | None) -> tuple[float | None, float | None]:
    """(minutes per game, total minutes) for one Totals entry; (None, None) when there is none."""
    if entry is None:
        return None, None
    gp, total = entry
    return (total / gp if gp else None), total


def gate_summary(rows: list[dict]) -> dict:
    """Count rows (season, gp, total_min = official minutes) that miss gates_for_season.

    A row with no official total minutes is counted apart, never as a miss.
    """
    below: dict[str, int] = {}
    no_minutes = 0
    for r in rows:
        total = r.get("total_min")
        if total is None:
            no_minutes += 1
            continue
        g = gates_for_season(r["season"])
        if (r.get("gp") or 0) < g["min_gp"] or float(total) < g["min_total_minutes"]:
            below[r["season"]] = below.get(r["season"], 0) + 1
    return {
        "applied": False,
        "rule": "official GP >= min_gp and official total minutes >= min_total_minutes "
        "(eligibility.gates_for_season: 15% of season GP clamped 10-15, 6% of 48 x season games, floor 450)",
        "rows": len(rows),
        "rows_below_gate": sum(below.values()),
        "rows_without_official_minutes": no_minutes,
        "by_season": dict(sorted(below.items())),
        "why_kept": WHY_KEPT,
    }

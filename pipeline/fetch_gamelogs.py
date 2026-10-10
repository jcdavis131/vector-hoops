"""VH-101: per-game player logs — the dataset that unlocks the
temporal/relational questions (early-late splits, midseason moves,
teammate overlap). Seasons 2015-16..2025-26 first slice; JSONL per
season under pipeline/data/ (gitignored raw).

Run: pipeline/.venv/Scripts/python.exe pipeline/fetch_gamelogs.py

Exit codes (ingest.run_fetch): 0 when every season is cached, 2 when any
season failed. A failed season used to return -1 and the script still
exited 0 [ingest#7]. Each season is written atomically with a fetch record,
so a crash can no longer leave a truncated file; the old resume check
(`st_size > 1_000_000`) trusted any file past 1 MB, including one cut off
mid-write [ingest#8].
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ingest import (
    EmptyPayloadError,
    Failures,
    FetchError,
    cache_is_fresh,
    require_columns,
    run_fetch,
    write_cache_text,
)
from nba_http import retry_call
from seasons import GAMELOG_FIRST_SEASON, is_final, season_range

OUT = Path(__file__).resolve().parent / "data"
SEASONS = season_range(GAMELOG_FIRST_SEASON)
# Every column is in all 11 local seasons (checked 2026-10-09), so a missing
# one raises instead of being dropped from the file [ingest#11].
KEEP = [
    "PLAYER_ID",
    "PLAYER_NAME",
    "TEAM_ID",
    "TEAM_ABBREVIATION",
    "GAME_ID",
    "GAME_DATE",
    "MIN",
    "PTS",
    "AST",
    "OREB",
    "DREB",
    "STL",
    "BLK",
    "TOV",
    "FGA",
    "FG3A",
    "FTA",
    "PLUS_MINUS",
]


def _cell(v):
    """str as is, NaN -> None, whole floats -> int: the encoding the existing files use."""
    if isinstance(v, str):
        return v
    if v != v:
        return None
    return float(v) if not float(v).is_integer() else int(v)


def to_jsonl(df) -> str:
    return "".join(json.dumps({c: _cell(x[c]) for c in KEEP}) + "\n" for _, x in df[KEEP].iterrows())


def fetch(season: str) -> int:
    """Rows written for the season, 0 when its cache is kept. Raises FetchError."""
    dest = OUT / f"gamelogs_{season}.jsonl"
    if cache_is_fresh(dest, season):
        print(f"{season}: already fetched ({dest.stat().st_size // 1024}KB)")
        return 0
    # Imported here so the module imports without nba_api (tests, CI).
    from nba_api.stats.endpoints import playergamelogs

    def call():
        r = playergamelogs.PlayerGameLogs(season_nullable=season, timeout=60)
        df = r.get_data_frames()[0]
        require_columns(df.columns, KEEP, f"playergamelogs {season}")
        return df

    df = retry_call(call, f"{season} playergamelogs", attempts=3)
    write_cache_text(
        dest,
        to_jsonl(df),
        source="stats.nba.com playergamelogs via nba_api",
        n_rows=len(df),
        season=season,
    )
    return len(df)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    total = 0
    failures = Failures("fetch_gamelogs")
    for s in SEASONS:
        try:
            n = fetch(s)
        except EmptyPayloadError as e:
            if is_final(s):
                failures.add(s, e)
            else:
                print(f"{s}: no games yet; nothing cached")
            continue
        except FetchError as e:
            failures.add(s, e)
            continue
        print(f"{s}: {n} rows")
        if n > 0:
            total += n
            time.sleep(1.2)
    print(f"DONE: {total} new game-log rows across {len(SEASONS)} seasons")
    failures.raise_if_any()


if __name__ == "__main__":
    run_fetch(main, name="fetch_gamelogs")

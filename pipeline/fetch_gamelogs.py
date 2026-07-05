"""VH-101: per-game player logs — the dataset that unlocks the
temporal/relational questions (early-late splits, midseason moves,
teammate overlap). Seasons 2015-16..2025-26 first slice; JSONL per
season under pipeline/data/ (gitignored raw).

Run: pipeline/.venv/Scripts/python.exe pipeline/fetch_gamelogs.py
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from nba_api.stats.endpoints import playergamelogs

OUT = Path(__file__).resolve().parent / "data"
SEASONS = [f"{y}-{str(y + 1)[-2:]}" for y in range(2015, 2026)]
KEEP = ["PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "TEAM_ABBREVIATION",
        "GAME_ID", "GAME_DATE", "MIN", "PTS", "AST", "OREB", "DREB",
        "STL", "BLK", "TOV", "FGA", "FG3A", "FTA", "PLUS_MINUS"]


def fetch(season: str) -> int:
    dest = OUT / f"gamelogs_{season}.jsonl"
    if dest.exists() and dest.stat().st_size > 1_000_000:
        print(f"{season}: already fetched ({dest.stat().st_size//1024}KB)")
        return 0
    for attempt in range(3):
        try:
            r = playergamelogs.PlayerGameLogs(
                season_nullable=season, timeout=60)
            df = r.get_data_frames()[0]
            cols = [c for c in KEEP if c in df.columns]
            with dest.open("w", encoding="utf-8") as fh:
                for _, x in df[cols].iterrows():
                    fh.write(json.dumps(
                        {c: (x[c] if isinstance(x[c], str) else
                             (None if x[c] != x[c] else float(x[c])
                              if not float(x[c]).is_integer() else int(x[c])))
                         for c in cols}) + "\n")
            return len(df)
        except Exception as e:
            print(f"  {season} attempt {attempt+1}: {e}")
            time.sleep(4 * (attempt + 1))
    return -1


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    total = 0
    for s in SEASONS:
        n = fetch(s)
        print(f"{s}: {n} rows")
        if n > 0:
            total += n
        time.sleep(1.2)
    print(f"DONE: {total} new game-log rows across {len(SEASONS)} seasons")

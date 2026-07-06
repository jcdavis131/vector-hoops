"""Export assets/player_meta.json — roster teams + popularity weights for the game.

Run:  python pipeline/build_player_meta.py
"""

from __future__ import annotations

import json
import math
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
ASSETS = HERE.parent / "assets"
VECTORS = ASSETS / "vectors.json"
ROSTER = DATA / "roster_context.json"


def main() -> None:
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    seasons = sorted({p["season"] for p in vec["players"]})
    latest = seasons[-1]

    roster_map: dict[str, str] = {}
    latest_minutes: dict[str, float] = defaultdict(float)
    if ROSTER.exists():
        data = json.loads(ROSTER.read_text(encoding="utf-8"))
        for row in data.get("entries", []):
            key = f"{row['name']}|{row['season']}"
            roster_map[key] = str(row.get("team") or "")
            if row["season"] == latest:
                latest_minutes[row["name"]] = max(
                    latest_minutes[row["name"]], float(row.get("minutes") or 0)
                )

    active = {p["name"] for p in vec["players"] if p["season"] == latest}
    season_counts: dict[str, int] = defaultdict(int)
    for p in vec["players"]:
        season_counts[p["name"]] += 1

    popularity: dict[str, float] = {}
    for name in season_counts:
        w = 1.0
        if name in active:
            w += 2.5
        w += 0.15 * min(season_counts[name], 12)
        mins = latest_minutes.get(name, 0.0)
        if mins > 0:
            w += math.log10(1.0 + mins / 500.0) * 2.0
        popularity[name] = round(w, 4)

    payload = {
        "built": __import__("time").strftime("%Y-%m-%d"),
        "latestSeason": latest,
        "roster": roster_map,
        "popularity": popularity,
    }
    ASSETS.mkdir(parents=True, exist_ok=True)
    out = ASSETS / "player_meta.json"
    out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {out} ({len(roster_map)} roster rows, {len(popularity)} names)")

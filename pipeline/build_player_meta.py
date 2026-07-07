"""Export assets/player_meta.json — roster teams + puzzle inclusion weights.

Puzzle weight blends season minutes, All-Star / All-NBA recognition (including
vote-getters beyond the 15 team slots), and career popularity.

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
HONORS = DATA / "honors.json"


def main() -> None:
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    seasons = sorted({p["season"] for p in vec["players"]})
    latest = seasons[-1]

    roster_map: dict[str, str] = {}
    season_minutes: dict[str, float] = {}
    latest_minutes: dict[str, float] = defaultdict(float)
    if ROSTER.exists():
        data = json.loads(ROSTER.read_text(encoding="utf-8"))
        for row in data.get("entries", []):
            key = f"{row['name']}|{row['season']}"
            roster_map[key] = str(row.get("team") or "")
            mins = float(row.get("minutes") or 0)
            season_minutes[key] = mins
            if row["season"] == latest:
                latest_minutes[row["name"]] = max(latest_minutes[row["name"]], mins)

    honors_by_key: dict[str, dict] = {}
    if HONORS.exists():
        doc = json.loads(HONORS.read_text(encoding="utf-8"))
        honors_by_key = doc.get("contemporaneous", {})

    active = {p["name"] for p in vec["players"] if p["season"] == latest}
    season_counts: dict[str, int] = defaultdict(int)
    for p in vec["players"]:
        season_counts[p["name"]] += 1

    popularity: dict[str, float] = {}
    puzzle_weight: dict[str, float] = {}
    for p in vec["players"]:
        name, season = p["name"], p["season"]
        key = f"{name}|{season}"
        w = 1.0
        if name in active:
            w += 2.5
        w += 0.15 * min(season_counts[name], 12)
        mins = latest_minutes.get(name, 0.0)
        if mins > 0:
            w += math.log10(1.0 + mins / 500.0) * 2.0
        popularity[name] = round(w, 4)

        pw = 1.0 + math.log10(1.0 + season_minutes.get(key, 0.0) / 400.0) * 1.5
        hon = honors_by_key.get(key, {})
        pw += float(hon.get("asg") or 0) * 0.8
        pw += float(hon.get("allNbaTeam") or 0) * 1.2
        pw += min(float(hon.get("allNbaVotePts") or 0), 500.0) / 100.0
        pw += popularity.get(name, 1.0) * 0.12
        puzzle_weight[key] = round(pw, 4)

    payload = {
        "built": __import__("time").strftime("%Y-%m-%d"),
        "latestSeason": latest,
        "roster": roster_map,
        "popularity": popularity,
        "puzzleWeight": puzzle_weight,
        "honors": honors_by_key,
    }
    ASSETS.mkdir(parents=True, exist_ok=True)
    out = ASSETS / "player_meta.json"
    out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {out} ({len(roster_map)} roster rows, "
          f"{len(puzzle_weight)} puzzle weights, {len(honors_by_key)} honor keys)")


if __name__ == "__main__":
    main()

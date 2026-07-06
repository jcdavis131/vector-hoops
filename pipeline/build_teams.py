"""Export assets/teams.json for the favorite-team picker.

Joins NBA API team IDs + full names from team_base cache with 3-letter
abbreviations observed in VH-101 game logs.

Run:  python pipeline/build_teams.py
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"
DATA = HERE / "data"
ASSETS = HERE.parent / "assets"


def abbr_from_gamelogs() -> dict[int, str]:
    """TEAM_ID -> most common TEAM_ABBREVIATION."""
    votes: dict[int, Counter[str]] = defaultdict(Counter)
    for path in sorted(DATA.glob("gamelogs_*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            g = json.loads(line)
            tid = g.get("TEAM_ID")
            abbr = g.get("TEAM_ABBREVIATION")
            if tid is not None and abbr:
                votes[int(tid)][str(abbr)] += 1
    return {tid: c.most_common(1)[0][0] for tid, c in votes.items()}


def latest_team_names() -> dict[int, str]:
    """TEAM_ID -> TEAM_NAME (latest season file wins)."""
    names: dict[int, str] = {}
    for path in sorted(CACHE.glob("team_base_*.json")):
        rows = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(rows, list):
            continue
        for row in rows:
            names[int(row["TEAM_ID"])] = str(row["TEAM_NAME"])
    return names


def main() -> None:
    abbrs = abbr_from_gamelogs()
    names = latest_team_names()
    teams = []
    for tid in sorted(names):
        abbr = abbrs.get(tid)
        if not abbr:
            continue
        teams.append({
            "id": tid,
            "abbr": abbr,
            "name": names[tid],
        })
    teams.sort(key=lambda t: t["name"])
    payload = {
        "built": __import__("time").strftime("%Y-%m-%d"),
        "source": "pipeline/cache/team_base_*.json + gamelogs TEAM_ABBREVIATION",
        "teams": teams,
    }
    ASSETS.mkdir(parents=True, exist_ok=True)
    out = ASSETS / "teams.json"
    out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {out} ({len(teams)} teams)")


if __name__ == "__main__":
    main()

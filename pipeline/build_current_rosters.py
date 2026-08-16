"""Export assets/current_rosters.json — full NBA team lists from game logs.

Unlike roster_context.json (charted rotation mates only), this artifact lists
every player with logged minutes on each team for the latest charted season.
Traded players appear on each team they played for.

Run: python pipeline/build_current_rosters.py
"""

from __future__ import annotations

import json
import time
from collections import defaultdict
from pathlib import Path

from eligibility import season_eligible
from name_utils import canonical_name
from roster_context import load_team_rosters

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "assets"
VECTORS = ASSETS / "vectors.json"
OUT = ASSETS / "current_rosters.json"


def game_counts(season: str) -> dict[tuple[int, str], int]:
    path = HERE / "data" / f"gamelogs_{season}.jsonl"
    counts: dict[tuple[int, str], int] = defaultdict(int)
    if not path.exists():
        return counts
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        g = json.loads(line)
        if not g.get("MIN") or not g.get("PLAYER_NAME"):
            continue
        cname = canonical_name(g["PLAYER_NAME"])
        counts[(g["TEAM_ID"], cname)] += 1
    return counts


def next_season_label(season: str) -> str:
    start = int(season.split("-")[0])
    return f"{start + 1}-{str(start + 2)[-2:]}"


def main() -> None:
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    seasons = sorted({p["season"] for p in vec["players"]})
    season = seasons[-1]

    charted_keys = {(p["name"], p["season"]) for p in vec["players"]}
    gp_map = game_counts(season)
    by_team = load_team_rosters(season)
    if not by_team:
        raise SystemExit(f"no gamelogs for {season} — run pipeline/fetch_gamelogs.py")

    teams: dict[str, list[dict]] = defaultdict(list)
    player_primary: dict[str, str] = {}
    player_total_minutes: dict[str, float] = defaultdict(float)
    player_team_minutes: dict[str, float] = {}

    for team_id, roster in by_team.items():
        abbr = roster[0]["team"] if roster else "???"
        for rec in roster:
            name = rec["name"]
            mins = float(rec["min"])
            gp = gp_map.get((team_id, name), 0)
            player_total_minutes[name] += mins
            if mins > player_team_minutes.get(name, 0):
                player_team_minutes[name] = mins
                player_primary[name] = abbr
            eligible = season_eligible(gp, mins / max(gp, 1), season=season)
            charted = (name, season) in charted_keys
            teams[abbr].append(
                {
                    "name": name,
                    "minutes": round(mins, 1),
                    "games": gp,
                    "charted": charted,
                    "eligible": eligible,
                }
            )
        teams[abbr].sort(key=lambda r: (-r["minutes"], r["name"]))

    active = []
    for name, mins in sorted(player_total_minutes.items(), key=lambda x: (-x[1], x[0])):
        if mins <= 0:
            continue
        active.append(
            {
                "name": name,
                "team": player_primary.get(name, ""),
                "minutes": round(mins, 1),
                "charted": (name, season) in charted_keys,
            }
        )

    payload = {
        "built": time.strftime("%Y-%m-%d"),
        "season": season,
        "nextSeason": next_season_label(season),
        "method": (
            "Team lists from stats.nba.com game logs (pipeline/data/gamelogs_*.jsonl). "
            "charted = in vectors.json; eligible = schedule-aware GP/min gates."
        ),
        "teams": {k: teams[k] for k in sorted(teams)},
        "activePlayers": active,
        "summary": {
            "teams": len(teams),
            "roster_slots": sum(len(v) for v in teams.values()),
            "unique_players": len(player_total_minutes),
            "charted": sum(1 for a in active if a["charted"]),
        },
    }
    ASSETS.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(
        f"wrote {OUT} — {payload['summary']['unique_players']} players, "
        f"{payload['summary']['charted']} charted, season {season}"
    )


if __name__ == "__main__":
    main()

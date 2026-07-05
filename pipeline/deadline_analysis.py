"""VH-102 — The Deadline: who thrived and who cratered after a
midseason move. Method (stated on everything this produces):

- A "midseason move" = a player whose TEAM_ID changes within one
  season with >=15 games on each side (trade metadata isn't freely
  clean, so we measure the observable event, honestly named).
- Delta = after-move minus before-move in per-36 points, plus-minus
  per game, and a crude efficiency proxy (PTS per FGA+0.44*FTA).
- Team-context adjustment: subtract the change the player's NEW team
  context implies (league-relative team plus-minus in that season) so
  "joined a juggernaut" doesn't read as personal improvement.

Output: assets/deadline.json — top thrives + craters per season and
all-time (2015-2026 slice), each row carrying its sample sizes.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "assets" / "deadline.json"
MIN_SIDE = 15
MIN_MPG = 12.0


def per36(pts, mins):
    return 36.0 * pts / mins if mins > 0 else 0.0


def main() -> None:
    movers = []
    for f in sorted(HERE.glob("data/gamelogs_*.jsonl")):
        season = f.stem.split("_")[1]
        by_player: dict = defaultdict(list)
        team_pm: dict = defaultdict(list)
        for line in f.read_text(encoding="utf-8").splitlines():
            g = json.loads(line)
            if not g.get("MIN"):
                continue
            by_player[g["PLAYER_ID"]].append(g)
            team_pm[g["TEAM_ID"]].append(g.get("PLUS_MINUS") or 0.0)
        team_avg = {t: sum(v) / len(v) for t, v in team_pm.items()}

        for pid, games in by_player.items():
            games.sort(key=lambda g: g["GAME_DATE"])
            teams = [g["TEAM_ID"] for g in games]
            switch = next((i for i in range(1, len(teams))
                           if teams[i] != teams[i - 1]), None)
            if switch is None:
                continue
            before, after = games[:switch], games[switch:]
            # ignore multi-switch chaos beyond the first move
            after = [g for g in after if g["TEAM_ID"] == after[0]["TEAM_ID"]]
            if len(before) < MIN_SIDE or len(after) < MIN_SIDE:
                continue

            def agg(side):
                m = sum(g["MIN"] for g in side)
                pts = sum(g["PTS"] for g in side)
                pm = sum((g.get("PLUS_MINUS") or 0.0) for g in side) / len(side)
                fga = sum(g["FGA"] for g in side)
                fta = sum(g["FTA"] for g in side)
                eff = pts / (fga + 0.44 * fta) if (fga + 0.44 * fta) > 0 else 0
                return {"g": len(side), "mpg": m / len(side),
                        "p36": per36(pts, m), "pm": pm, "eff": eff}

            b, a = agg(before), agg(after)
            if b["mpg"] < MIN_MPG or a["mpg"] < MIN_MPG:
                continue
            ctx = team_avg.get(after[0]["TEAM_ID"], 0.0) - \
                team_avg.get(before[0]["TEAM_ID"], 0.0)
            movers.append({
                "name": before[0]["PLAYER_NAME"], "season": season,
                "from": before[0]["TEAM_ABBREVIATION"],
                "to": after[0]["TEAM_ABBREVIATION"],
                "gBefore": b["g"], "gAfter": a["g"],
                "dP36": round(a["p36"] - b["p36"], 2),
                "dPM": round((a["pm"] - b["pm"]) - ctx, 2),  # context-adj
                "dEff": round(a["eff"] - b["eff"], 3),
                "score": round((a["p36"] - b["p36"]) / 4
                               + ((a["pm"] - b["pm"]) - ctx) / 3
                               + (a["eff"] - b["eff"]) * 4, 3),
            })

    movers.sort(key=lambda m: m["score"])
    craters = movers[:25]
    thrives = list(reversed(movers[-25:]))
    OUT.write_text(json.dumps({
        "method": ("midseason move = in-season TEAM_ID change, >=15 games "
                   "both sides, >=12 mpg; deltas per-36 pts / context-"
                   "adjusted plus-minus / pts-per-shot-attempt proxy; "
                   "2015-16..2025-26; composite score is a stated blend, "
                   "not a truth claim"),
        "moversAnalyzed": len(movers),
        "thrives": thrives, "craters": craters,
    }, indent=1), encoding="utf-8")
    print(f"{len(movers)} qualified movers")
    print("top thrive:", thrives[0])
    print("top crater:", craters[0])


if __name__ == "__main__":
    main()

"""Mode 3 — FADER OR FINISHER: did a player's per-36 production rise or
fade from the season's first half to its second? Method (stated):

- Split = each player-season's own game sequence midpoint (not the
  All-Star date, which moves; "first half vs second half of HIS games").
- Qualify: >=25 games each half, >=12 mpg both halves.
- Stat lines examined: per-36 PTS and per-36 REB (OREB+DREB) — two
  question pools. Delta must be >= 1.5 per-36 to be quiz-worthy
  (unambiguous), <= 6.0 (outliers usually mean role change mid-season,
  still true but flagged).
- Output: assets/faderfinisher.json — {method, questions:[{name,
  season, stat: "scoring"|"rebounding", firstHalf, secondHalf, delta,
  g1, g2, verdict: "finisher"|"fader"}]}. Balanced pools.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "assets" / "faderfinisher.json"
MIN_G, MIN_MPG, MIN_D, MAX_D = 25, 12.0, 1.5, 6.0


def per36(v, m):
    return 36.0 * v / m if m > 0 else 0.0


def main() -> None:
    questions = []
    for f in sorted(HERE.glob("data/gamelogs_*.jsonl")):
        season = f.stem.split("_")[1]
        by_player = defaultdict(list)
        for line in f.read_text(encoding="utf-8").splitlines():
            g = json.loads(line)
            if g.get("MIN"):
                by_player[g["PLAYER_ID"]].append(g)
        for games in by_player.values():
            games.sort(key=lambda g: g["GAME_DATE"])
            half = len(games) // 2
            h1, h2 = games[:half], games[half:]
            if len(h1) < MIN_G or len(h2) < MIN_G:
                continue
            m1 = sum(g["MIN"] for g in h1)
            m2 = sum(g["MIN"] for g in h2)
            if m1 / len(h1) < MIN_MPG or m2 / len(h2) < MIN_MPG:
                continue
            for stat, fn in (
                ("scoring", lambda g: g["PTS"]),
                ("rebounding", lambda g: g["OREB"] + g["DREB"]),
            ):
                a = per36(sum(fn(g) for g in h1), m1)
                b = per36(sum(fn(g) for g in h2), m2)
                d = b - a
                if MIN_D <= abs(d) <= MAX_D:
                    questions.append(
                        {
                            "name": games[0]["PLAYER_NAME"],
                            "season": season,
                            "stat": stat,
                            "firstHalf": round(a, 1),
                            "secondHalf": round(b, 1),
                            "delta": round(d, 1),
                            "g1": len(h1),
                            "g2": len(h2),
                            "verdict": "finisher" if d > 0 else "fader",
                        }
                    )
    finishers = [q for q in questions if q["verdict"] == "finisher"]
    faders = [q for q in questions if q["verdict"] == "fader"]
    n = min(len(finishers), len(faders), 300)
    finishers.sort(key=lambda q: -q["delta"])
    faders.sort(key=lambda q: q["delta"])
    pool = finishers[:n] + faders[:n]
    OUT.write_text(
        json.dumps(
            {
                "method": (
                    "split at each player-season's own game-sequence "
                    "midpoint; >=25 games and >=12 mpg both halves; per-36 "
                    "rates; quiz pool limited to unambiguous deltas "
                    "(1.5-6.0 per-36); 2015-16 through 2025-26"
                ),
                "questions": pool,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"{len(questions)} qualified splits -> pool {len(pool)} ({n} finishers / {n} faders)")
    print("sample finisher:", finishers[0])
    print("sample fader:", faders[0])


if __name__ == "__main__":
    main()

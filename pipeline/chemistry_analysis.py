"""CHEMISTRY — real teammate pairs and how they complemented each
other. Method (stated in the artifact):

- A "pair" = two players on the same team-season, each >=1000 total
  minutes that season (rotation regulars; from game logs 2015-26).
- Complementarity = 1 - |cosine| of their era-z profile vectors
  (orthogonal skill sets complement; identical ones overlap) — vectors
  from vectors.json signature = that season's entry when charted.
- Joint success proxy = mean of the two players' per-game plus-minus
  that season (lineup-level on/off data would be better; not freely
  available — stated limitation).
- chemistry.json: per season, top pairs by a stated blend
  (0.5*complementarity_pctl + 0.5*joint_pm_pctl), plus each pair's
  raw numbers so the quiz can show its work.
"""

from __future__ import annotations

import json
import math
from collections import defaultdict
from itertools import combinations
from pathlib import Path

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "assets"
MIN_MINUTES = 1000


def cos(a, b):
    num = sum(x * y for x, y in zip(a, b, strict=False))
    da = math.sqrt(sum(x * x for x in a)) or 1
    db = math.sqrt(sum(x * x for x in b)) or 1
    return num / (da * db)


def main() -> None:
    vec = json.loads((ASSETS / "vectors.json").read_text(encoding="utf-8"))
    vindex = {(p["name"], p["season"]): p for p in vec["players"]}

    out_pairs = []
    for f in sorted(HERE.glob("data/gamelogs_*.jsonl")):
        season = f.stem.split("_")[1]
        by_team_player = defaultdict(lambda: {"min": 0.0, "pm": [], "team": ""})
        for line in f.read_text(encoding="utf-8").splitlines():
            g = json.loads(line)
            if not g.get("MIN"):
                continue
            k = (g["TEAM_ID"], g["PLAYER_NAME"])
            by_team_player[k]["min"] += g["MIN"]
            by_team_player[k]["pm"].append(g.get("PLUS_MINUS") or 0.0)
            by_team_player[k]["team"] = g["TEAM_ABBREVIATION"]

        by_team = defaultdict(list)
        for (tid, name), d in by_team_player.items():
            if d["min"] >= MIN_MINUTES and (name, season) in vindex:
                by_team[tid].append((name, sum(d["pm"]) / len(d["pm"]), d["team"]))

        for tid, roster in by_team.items():
            for (n1, pm1, team), (n2, pm2, _) in combinations(roster, 2):
                v1 = vindex[(n1, season)]["v"]
                v2 = vindex[(n2, season)]["v"]
                comp = 1 - abs(cos(v1, v2))
                out_pairs.append(
                    {
                        "a": n1,
                        "b": n2,
                        "season": season,
                        "team": team,
                        "complementarity": round(comp, 3),
                        "jointPM": round((pm1 + pm2) / 2, 2),
                    }
                )

    # percentile blend
    comps = sorted(p["complementarity"] for p in out_pairs)
    pms = sorted(p["jointPM"] for p in out_pairs)

    def pctl(sorted_vals, v):
        import bisect

        return bisect.bisect_left(sorted_vals, v) / len(sorted_vals)

    for p in out_pairs:
        p["chemistry"] = round(
            0.5 * pctl(comps, p["complementarity"]) + 0.5 * pctl(pms, p["jointPM"]), 3
        )
    out_pairs.sort(key=lambda p: -p["chemistry"])

    (ASSETS / "chemistry.json").write_text(
        json.dumps(
            {
                "method": (
                    "pairs = same team-season, each >=1000 min, both "
                    "charted; complementarity = 1-|cosine| of era-z "
                    "profiles (orthogonal skills complement); success "
                    "proxy = mean per-game plus-minus of the two (lineup "
                    "on/off would be better — not freely available; "
                    "stated limitation); chemistry = equal-weight "
                    "percentile blend, a stated heuristic, not a truth "
                    "claim; 2015-16 through 2025-26"
                ),
                "pairs": out_pairs[:800],
                "totalPairsAnalyzed": len(out_pairs),
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"{len(out_pairs)} pairs analyzed -> top 800 shipped")
    for p in out_pairs[:3]:
        print(
            " ",
            p["season"],
            p["team"],
            p["a"],
            "+",
            p["b"],
            f"chem={p['chemistry']} comp={p['complementarity']} pm={p['jointPM']}",
        )


if __name__ == "__main__":
    main()

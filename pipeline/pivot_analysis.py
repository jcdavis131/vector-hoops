"""THE PIVOT — adjacent archetypes and the measured value of embracing
them. NO simulation: every number is an observed historical outcome.
Method (stated in the artifact):

- ADJACENCY: for each of the 8 global archetypes, the nearest other
  centroids (cosine over centroid vectors); a player's "adjacent role"
  = his 2nd-nearest centroid.
- HISTORICAL PIVOTS: consecutive charted seasons where a player's
  cluster CHANGED (real transitions, 1996->2026). For each directed
  pivot path A->B with n>=8: the mean observed change in on-court
  impact (PLUS_MINUS z) and scoring/impact dims, with n shown.
- ROSTER UPSIDE (recent teams 2023-26, rosters from game logs, >=1000
  min): each player's adjacent role + the historical path stats for
  that exact pivot; "upside" = the path's mean observed dPM_z — a
  precedent-weighted sensitivity, NOT a prediction or simulation.

Output: assets/pivots.json
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "assets"
MIN_PATH_N = 8
PM_IDX = None  # resolved from features


def main() -> None:
    data = json.loads((ASSETS / "vectors.json").read_text(encoding="utf-8"))
    features = data["features"]
    pm = features.index("PLUS_MINUS")
    clusters = data["clusters"]
    k = len(clusters)

    # centroids from member means (harness-verified attribution)
    members = defaultdict(list)
    for p in data["players"]:
        members[p["c"]].append(p["v"])
    cents = np.stack([np.mean(members[i], 0) for i in range(k)])

    def cos(a, b):
        return float(np.dot(a, b) /
                     ((np.linalg.norm(a) or 1) * (np.linalg.norm(b) or 1)))

    adjacency = []
    for i in range(k):
        sims = sorted(((cos(cents[i], cents[j]), j)
                       for j in range(k) if j != i), reverse=True)
        adjacency.append({
            "archetype": clusters[i],
            "adjacent": [{"archetype": clusters[j], "similarity": round(s, 3)}
                         for s, j in sims[:3]],
        })

    # historical pivots: consecutive charted seasons, cluster changed
    by_player = defaultdict(list)
    for p in data["players"]:
        by_player[p["name"]].append(p)
    paths = defaultdict(list)
    for name, rows in by_player.items():
        rows.sort(key=lambda r: r["season"])
        for r1, r2 in zip(rows, rows[1:]):
            y1, y2 = int(r1["season"][:4]), int(r2["season"][:4])
            if y2 - y1 == 1 and r1["c"] != r2["c"]:
                paths[(r1["c"], r2["c"])].append({
                    "name": name, "from": r1["season"], "to": r2["season"],
                    "dPM": r2["v"][pm] - r1["v"][pm],
                })

    path_stats = []
    for (a, b), moves in paths.items():
        if len(moves) < MIN_PATH_N:
            continue
        d = [m["dPM"] for m in moves]
        best = max(moves, key=lambda m: m["dPM"])
        path_stats.append({
            "from": clusters[a], "to": clusters[b], "n": len(moves),
            "meanDPMz": round(float(np.mean(d)), 3),
            "stdDPMz": round(float(np.std(d)), 3),
            "bestExample": {"name": best["name"],
                            "seasons": f"{best['from']} -> {best['to']}",
                            "dPMz": round(best["dPM"], 2)},
        })
    path_stats.sort(key=lambda p: -p["meanDPMz"])
    path_index = {(p["from"], p["to"]): p for p in path_stats}

    # recent rosters (2023-26) from game logs, >=1000 min, charted
    rosters = defaultdict(list)
    vindex = {(p["name"], p["season"]): p for p in data["players"]}
    for f in sorted(HERE.glob("data/gamelogs_*.jsonl")):
        season = f.stem.split("_")[1]
        if season < "2023-24":
            continue
        mins = defaultdict(lambda: [0.0, ""])
        for line in f.read_text(encoding="utf-8").splitlines():
            g = json.loads(line)
            if g.get("MIN"):
                key = (g["TEAM_ABBREVIATION"], g["PLAYER_NAME"])
                mins[key][0] += g["MIN"]
        for (team, name), (m, _) in mins.items():
            p = vindex.get((name, season))
            if m >= 1000 and p is not None:
                rosters[(team, season)].append(p)

    team_cards = []
    for (team, season), players in sorted(rosters.items()):
        cands = []
        for p in players:
            sims = sorted(((cos(np.array(p["v"]), cents[j]), j)
                           for j in range(k)), reverse=True)
            adj = sims[1][1] if sims[0][1] == p["c"] else sims[0][1]
            st = path_index.get((clusters[p["c"]], clusters[adj]))
            if st is None:
                continue
            cands.append({
                "name": p["name"], "current": clusters[p["c"]],
                "adjacent": clusters[adj],
                "pivotDistance": round(1 - sims[1][0], 3),
                "path": {"n": st["n"], "meanDPMz": st["meanDPMz"],
                         "example": st["bestExample"]},
            })
        if len(cands) < 4:
            continue
        cands.sort(key=lambda c: -c["path"]["meanDPMz"])
        team_cards.append({"team": team, "season": season,
                           "candidates": cands[:8],
                           "answer": cands[0]["name"]})

    (ASSETS / "pivots.json").write_text(json.dumps({
        "method": ("adjacency = nearest other k-means centroids by "
                   "cosine; pivots = real consecutive-season cluster "
                   "changes 1996-2026; path stats = observed mean change "
                   "in PLUS_MINUS z for players who made that exact "
                   "directed pivot (n>=8 shown); roster upside = the "
                   "historical path mean for each player's adjacent "
                   "role — measured precedent WITH selection effects (players who pivoted are those whose games changed — precedent, not causation), NOT a prediction or "
                   "simulation; rosters 2023-26, >=1000 min, charted"),
        "adjacency": adjacency,
        "paths": path_stats,
        "teams": team_cards,
    }, separators=(",", ":")), encoding="utf-8")

    print(f"{len(path_stats)} pivot paths with n>={MIN_PATH_N}; "
          f"{len(team_cards)} team cards")
    print("most valuable pivots (observed):")
    for p in path_stats[:3]:
        print(f"  {p['from']} -> {p['to']}: {p['meanDPMz']:+.2f} dPMz "
              f"(n={p['n']}, e.g. {p['bestExample']['name']} "
              f"{p['bestExample']['seasons']})")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Baseline bake-off harness for the atlas graph model.
Candidates (a) popularity and (b) cohort-affinity, on held-out
player->team links from player_team_season.json. Pure stdlib.
Slot for (c)-(f): GNN, GNN+JEPA, CLM, hybrid — same eval, later.
"""
import json
import random
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

S = Path(__file__).resolve().parent
DB = Path(S) / "v2" / "atlas.db"
PTS = "/home/hatch/workspace/vector-hoops/assets/player_team_season.json"

def decade(name):
    r = db.execute("SELECT time_date FROM entities WHERE name=? AND layer='nba_players' LIMIT 1",
                   (name,)).fetchone()
    if r and r[0] and len(r[0]) >= 4:
        try:
            return str(int(r[0][:4]) // 10 * 10) + "s"
        except ValueError:
            return None
    return None

def country(name):
    r = db.execute("SELECT country FROM entities WHERE name=? AND layer='nba_players' LIMIT 1",
                   (name,)).fetchone()
    return r[0] if r else None

def main():
    global db
    db = sqlite3.connect(DB)
    pts = json.load(Path(PTS).open())
    # player->team links (dedupe to one per player: most common team)
    links = defaultdict(Counter)
    for key, team in pts.items():
        name = key.rsplit("|", 1)[0]
        links[name][team] += 1
    links = [(p, t.most_common(1)[0][0]) for p, t in links.items() if decade(p)]
    print("links:", len(links))
    random.seed(42)
    random.shuffle(links)
    k = len(links) // 10
    test, train = links[:k], links[k:]
    team_freq = Counter(t for _, t in train)
    teams = sorted(team_freq)
    # cohort index: (decade, country) -> team counts
    cohort = defaultdict(Counter)
    for p, t in train:
        cohort[(decade(p), country(p))][t] += 1

    def rank_pop(p):  # (a)
        return sorted(teams, key=lambda t: -team_freq[t])

    def rank_cohort(p):  # (b)
        c = cohort.get((decade(p), country(p)), Counter())
        return sorted(teams, key=lambda t: (-c[t], -team_freq[t]))

    for label, rankfn in (("popularity", rank_pop), ("cohort-affinity", rank_cohort)):
        rr, h1, h10 = 0.0, 0, 0
        for p, truth in test:
            ranked = rankfn(p)
            try:
                r = ranked.index(truth) + 1
            except ValueError:
                r = len(ranked) + 1
            rr += 1.0 / r
            h1 += r == 1
            h10 += r <= 10
        n = len(test)
        print(f"{label}: MRR={rr/n:.4f} Hits@1={h1/n:.4f} Hits@10={h10/n:.4f} (n={n})")
    db.close()

if __name__ == "__main__":
    main()

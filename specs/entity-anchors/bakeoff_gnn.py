#!/usr/bin/env python3
"""Candidate (c): GraphSAGE-style mean-aggregation encoder, pure stdlib.
Inductive: entity vector = normalized mean of its 2-hop neighborhood's
hashed anchor features (layer x decade x country x latlon-grid).
Link score = dot product. Evaluated on held-out played_for edges,
same protocol as the popularity/cohort baselines.
"""

import hashlib
import math
import random
import sqlite3
from pathlib import Path

S = Path(__file__).resolve().parent
DB = S / "v2" / "atlas.db"
DIM = 32
ROUNDS = 2


def hslot(feat_str):
    h = int(hashlib.md5(feat_str.encode()).hexdigest(), 16)
    return h % DIM, 1.0 if (h >> 7) % 2 else -1.0


def base_vector(layer, decade, country, lat, lon):
    v = [0.0] * DIM
    feats = [f"l:{layer}", f"d:{decade}", f"c:{country}"]
    if lat is not None and lon is not None:
        feats.append(f"g:{int(lat)},{int(lon)}")
    for fstr in feats:
        i, s = hslot(fstr)
        v[i] += s
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def main():
    db = sqlite3.connect(DB)
    ent = {}
    for eid, layer, td, ctry, lat, lon in db.execute(
        "SELECT entity_id, layer, time_date, country, lat, lon FROM entities"
    ):
        dec = "?"
        if td and len(td) >= 4:
            try:
                dec = str(int(td[:4]) // 10 * 10)
            except ValueError:
                pass
        ent[eid] = base_vector(layer or "?", dec, ctry or "?", lat, lon)
    adj = {}
    for s, d in db.execute("SELECT src, dst FROM edges"):
        if s in ent and d in ent:
            adj.setdefault(s, []).append(d)
            adj.setdefault(d, []).append(s)
    # mean-aggregation rounds (with self-loop)
    for _ in range(ROUNDS):
        new = {}
        for eid, vec in ent.items():
            agg = list(vec)
            for nb in adj.get(eid, ()):
                nv = ent[nb]
                for i in range(DIM):
                    agg[i] += nv[i]
            k = len(adj.get(eid, ())) + 1
            agg = [x / k for x in agg]
            n = math.sqrt(sum(x * x for x in agg)) or 1.0
            new[eid] = [x / n for x in agg]
        ent = new
    rows = [(s, d) for s, d in db.execute("SELECT src, dst FROM edges WHERE rel='played_for'")]
    random.seed(42)
    random.shuffle(rows)
    k = len(rows) // 10
    test, train = rows[:k], rows[k:]
    pop = {}
    for _, d in train:
        pop[d] = pop.get(d, 0) + 1
    targets = sorted(pop)
    rr = h1 = h10 = n = 0
    for s, truth in test:
        if s not in ent or truth not in pop:
            continue
        sv = ent[s]
        scored = sorted(targets, key=lambda t: (-sum(a * b for a, b in zip(sv, ent[t])), -pop[t]))
        n += 1
        try:
            r = scored.index(truth) + 1
        except ValueError:
            r = len(scored) + 1
        rr += 1.0 / r
        h1 += r == 1
        h10 += r <= 10
    db.close()
    print(f"gnn-mean2hop: MRR={rr / n:.4f} H@1={h1 / n:.4f} H@10={h10 / n:.4f} n={n}")


if __name__ == "__main__":
    main()

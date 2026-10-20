#!/usr/bin/env python3
"""Candidate (c): GNN link prediction, CLEAN protocol.
Graph built from TRAIN edges only (no test leakage). Two encoder variants:
mean aggregation and GCN symmetric normalization. Baselines re-run on the
same split. Held-out played_for edges.
"""
import hashlib, json, math, os, random, sqlite3

S = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(S, "v2", "atlas.db")
DIM, ROUNDS = 32, 2

def hslot(fstr):
    h = int(hashlib.md5(fstr.encode()).hexdigest(), 16)
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

def encode(ent0, adj, mode):
    ent = {e: list(v) for e, v in ent0.items()}
    if mode == "gcn":
        deg = {e: (len(adj.get(e, ())) + 1) for e in ent}
    for _ in range(ROUNDS):
        new = {}
        for eid, vec in ent.items():
            agg = [0.0] * DIM
            if mode == "mean":
                for nb in [eid] + adj.get(eid, []):
                    nv = ent[nb]
                    for i in range(DIM):
                        agg[i] += nv[i]
                k = len(adj.get(eid, ())) + 1
                agg = [x / k for x in agg]
            else:
                dv = deg[eid]
                for nb in [eid] + adj.get(eid, []):
                    w = 1.0 / math.sqrt(dv * deg[nb])
                    nv = ent[nb]
                    for i in range(DIM):
                        agg[i] += nv[i] * w
            n = math.sqrt(sum(x * x for x in agg)) or 1.0
            new[eid] = [x / n for x in agg]
        ent = new
    return ent

def evaluate(ent, test, pop):
    targets = sorted(pop)
    rr = h1 = h10 = n = 0
    for s, truth in test:
        if s not in ent or truth not in pop:
            continue
        sv = ent[s]
        scored = sorted(targets,
                        key=lambda t: (-sum(a * b for a, b in zip(sv, ent[t])), -pop[t]))
        n += 1
        try:
            r = scored.index(truth) + 1
        except ValueError:
            r = len(scored) + 1
        rr += 1.0 / r
        h1 += r == 1
        h10 += r <= 10
    return rr / n, h1 / n, h10 / n, n

def main():
    db = sqlite3.connect(DB)
    ent0, meta = {}, {}
    for eid, layer, td, ctry, lat, lon in db.execute(
            "SELECT entity_id, layer, time_date, country, lat, lon FROM entities"):
        dec = "?"
        if td and len(td) >= 4:
            try:
                dec = str(int(td[:4]) // 10 * 10)
            except ValueError:
                pass
        meta[eid] = layer
        ent0[eid] = base_vector(layer or "?", dec, ctry or "?", lat, lon)
    rows = [(s, d) for s, d in db.execute(
        "SELECT src, dst FROM edges WHERE rel='played_for'")]
    db.close()
    random.seed(42)
    random.shuffle(rows)
    k = len(rows) // 10
    test, train = rows[:k], rows[k:]
    # graph from TRAIN ONLY
    adj = {}
    for s, d in train:
        if s in ent0 and d in ent0:
            adj.setdefault(s, []).append(d)
            adj.setdefault(d, []).append(s)
    pop = {}
    for _, d in train:
        pop[d] = pop.get(d, 0) + 1
    # baselines on same split
    rr = h1 = h10 = n = 0
    targets = sorted(pop, key=lambda t: -pop[t])
    for s, truth in test:
        if truth not in pop:
            continue
        n += 1
        r = targets.index(truth) + 1
        rr += 1.0 / r
        h1 += r == 1
        h10 += r <= 10
    print(f"popularity: MRR={rr/n:.4f} H@1={h1/n:.4f} H@10={h10/n:.4f} n={n}")
    for mode in ("mean", "gcn"):
        ent = encode(ent0, adj, mode)
        mrr, hh1, hh10, nn = evaluate(ent, test, pop)
        print(f"gnn-{mode}2hop: MRR={mrr:.4f} H@1={hh1:.4f} H@10={hh10:.4f} n={nn}")

if __name__ == "__main__":
    main()

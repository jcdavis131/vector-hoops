#!/usr/bin/env python3
"""Export probe embeddings: top-N entities by graph degree with their
2-hop mean-aggregation vectors (same encoder as bakeoff_gnn.py) + metadata.
Output: probe-embeddings.json {model, snapshot, dim, entities: [{id,name,layer,date,place,country,v:[...]}]}
"""

import hashlib
import json
import math
import sqlite3
from pathlib import Path

S = Path(__file__).resolve().parent
DB = S / "v2" / "atlas.db"
OUT = S / "v2" / "probe-embeddings.json"
DIM, ROUNDS, TOPN = 32, 2, 20000


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


def main():
    db = sqlite3.connect(DB)
    meta, ent = {}, {}
    for eid, layer, name, td, ctry, lat, lon, place, qid in db.execute(
        "SELECT entity_id, layer, name, time_date, country, lat, lon, place_name, qid FROM entities"
    ):
        dec = "?"
        if td and len(td) >= 4:
            try:
                dec = str(int(td[:4]) // 10 * 10)
            except ValueError:
                pass
        meta[eid] = {"name": name, "layer": layer, "date": td, "place": place, "country": ctry, "qid": qid}
        ent[eid] = base_vector(layer or "?", dec, ctry or "?", lat, lon)
    adj = {}
    for s, d in db.execute("SELECT src, dst FROM edges"):
        if s in ent and d in ent:
            adj.setdefault(s, []).append(d)
            adj.setdefault(d, []).append(s)
    deg = {e: len(n) for e, n in adj.items()}
    keep = set(sorted(deg, key=lambda e: -deg[e])[:TOPN])
    deg = {e: (len(adj.get(e, ())) + 1) for e in ent}  # +1 self-loop
    for _ in range(ROUNDS):
        # GCN symmetric normalization: w = 1/sqrt(deg(v)*deg(u))
        # (plain mean over-smooths: mega-hub teams drown every player vector)
        new = {}
        for eid, vec in ent.items():
            agg = [0.0] * DIM
            dv = deg[eid]
            for nb in [eid] + adj.get(eid, []):
                w = 1.0 / math.sqrt(dv * deg[nb])
                nv = ent[nb]
                for i in range(DIM):
                    agg[i] += w * nv[i]
            n = math.sqrt(sum(x * x for x in agg)) or 1.0
            new[eid] = [x / n for x in agg]
        ent = new
    db.execute("SELECT 1").fetchone()
    out = {
        "model": "gnn-mean2hop",
        "dim": DIM,
        "topn": TOPN,
        "snapshot": "atlas-20261020-e216d06c",
        "eval": {
            "MRR": 0.3092,
            "Hits@1": 0.1515,
            "Hits@10": 0.6766,
            "n": 1512,
            "task": "held-out played_for link prediction",
        },
        "entities": [],
    }
    for eid in keep:
        m = meta[eid]
        out["entities"].append(
            {
                "id": eid,
                "name": m["name"],
                "layer": m["layer"],
                "date": m["date"],
                "place": m["place"],
                "country": m["country"],
                "qid": m["qid"],
                "v": [round(x, 4) for x in ent[eid]],
            }
        )
    out["edges"] = [
        {"s": s, "d": d, "r": r, "st": st, "en": en}
        for s, d, r, st, en in db.execute("SELECT src, dst, rel, start_date, end_date FROM edges")
        if s in keep and d in keep
    ]
    db.close()
    json.dump(out, open(OUT, "w"))
    print(f"exported {len(out['entities'])} entities -> {OUT} ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()

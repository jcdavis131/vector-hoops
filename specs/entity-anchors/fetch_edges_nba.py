#!/usr/bin/env python3
"""Targeted played_for pass for remaining NBA QIDs, small chunks (40).
Resumes via the same checkpoint."""
import json, os, sys, urllib.request, urllib.parse

S = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(S, "v2")
sys.path.insert(0, S)
from fetch_edges import ENT, rec_qid, sp_sparql, chunk

NAME = "played_for"
out = os.path.join(D, f"edges_{NAME}.jsonl")
ck = os.path.join(D, f"ckpt_edges_{NAME}.json")
done = set(json.load(open(ck)))

nba = [q for q, (eid, lay) in ENT.items()
       if q not in done and eid.startswith("nba:")]
print(f"nba remaining: {len(nba)}", flush=True)
for c in chunk(nba, 40):
    vals = " ".join(f"wd:{q}" for q in c)
    q = ("SELECT ?e ?v ?st ?et WHERE { VALUES ?e { " + vals + " } "
         "?e p:P54 ?stmt . ?stmt ps:P54 ?v . "
         "OPTIONAL { ?stmt pq:P580 ?st } OPTIONAL { ?stmt pq:P582 ?et } }")
    rows = sp_sparql(q)
    if rows is None:
        print("batch failed, checkpoint saved", flush=True); break
    with open(out, "a") as f:
        for row in rows:
            eq = row["e"]["value"].rsplit("/",1)[-1]
            vq = row["v"]["value"].rsplit("/",1)[-1]
            if vq not in ENT: continue
            src, _ = ENT[eq]; dst, _ = ENT[vq]
            f.write(json.dumps({"src": src, "dst": dst, "rel": NAME,
                "start": row.get("st",{}).get("value"),
                "end": row.get("et",{}).get("value")}) + "\n")
    done.update(c)
    json.dump(sorted(done), open(ck,"w"))
    print(f"done {len([q for q in done if ENT.get(q,(None,None))[0] and ENT[q][0].startswith('nba:')])}/{len(nba)} nba", flush=True)
print("NBA PASS DONE", flush=True)

#!/usr/bin/env python3
"""Pull relationship edges for all v2 entity layers via Wikidata SPARQL.
Checkpointed per phase. VALUES batches of 500 QIDs; phases:
  played_for (P54 + P580/P582 tenure), alma_mater (P69), employer (P108), founded_by (P112).
Only sources/targets already in our layers are kept.
"""

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

S = Path(__file__).resolve().parent
D = S / "v2"
UA = {"User-Agent": "atlas-anchor-fetch/1.0 (research; contact: jc@example.com)"}


def sp_sparql(q):
    data = urllib.parse.urlencode({"query": q, "format": "json"}).encode()
    for wait in (0, 5, 30):
        if wait:
            time.sleep(wait)
        try:
            r = urllib.request.Request("https://query.wikidata.org/sparql", data=data, headers=UA)
            r.add_header("Accept", "application/sparql-results+json")
            with urllib.request.urlopen(r, timeout=120) as fh:
                return json.load(fh)["results"]["bindings"]
        except Exception as e:
            print("SPARQL fail:", e, flush=True)
    return None


def chunk(xs, n=500):
    for i in range(0, len(xs), n):
        yield xs[i : i + n]


CHUNK = {"played_for": 250, "alma_mater": 500, "employer": 500, "founded_by": 500}


def qids_for(layers):
    q = {}
    for lay in layers:
        f = D / f"layer_{lay}.jsonl"
        if not f.exists():
            continue
        for line in open(f):
            r = json.loads(line)
            if r.get("qid"):
                q[r["qid"]] = (lay, r["name"])
    return q


def rec_qid(rec):
    if rec.get("qid"):
        return rec["qid"]
    src = (rec.get("provenance") or {}).get("source") or ""
    if src.startswith("wikidata:"):
        return src.split(":", 1)[1]
    return None


# map QID -> our entity id for every finished layer
LAYERS = ["cities", "universities", "nfl", "mlb", "nhl", "soccer", "business", "authors", "politicians", "franchises"]
V1_LAYERS = {"nba_players": "v1/players.jsonl", "nba_teams": "v1/teams.jsonl"}
ENT = {}  # qid -> (entity_id, layer)
for lay in LAYERS:
    f = D / f"layer_{lay}.jsonl"
    if lay == "franchises":
        f = D / "franchises.jsonl"
    if not f.exists():
        continue
    for line in open(f):
        r = json.loads(line)
        q = rec_qid(r)
        if q:
            ENT[q] = (r["entity_id"], lay)
for lay, rel in V1_LAYERS.items():
    f = S / rel
    if not f.exists():
        continue
    for line in open(f):
        r = json.loads(line)
        q = rec_qid(r)
        if q:
            ENT[q] = (r["entity_id"], lay)

PHASES = {
    "played_for": ("wdt:P54", True),
    "alma_mater": ("wdt:P69", False),
    "employer": ("wdt:P108", False),
    "founded_by": ("wdt:P112", False),
}


def phase_edges(name, prop, tenure):
    out = D / f"edges_{name}.jsonl"
    ck = D / f"ckpt_edges_{name}.json"
    done = set(json.load(open(ck))) if ck.exists() else set()
    wrote = out.exists() and sum(1 for _ in open(out))
    qids = [q for q in ENT if q not in done]
    print(f"{name}: {len(qids)} qids remaining, {wrote} edges banked", flush=True)
    for c in chunk(qids, CHUNK.get(name, 500)):
        vals = " ".join(f"wd:{q}" for q in c)
        if tenure:
            q = (
                "SELECT ?e ?v ?st ?et WHERE { VALUES ?e { " + vals + " } "
                "?e p:P54 ?stmt . ?stmt ps:P54 ?v . "
                "OPTIONAL { ?stmt pq:P580 ?st } OPTIONAL { ?stmt pq:P582 ?et } }"
            )
        else:
            q = "SELECT ?e ?v WHERE { VALUES ?e { " + vals + " } ?e " + prop + " ?v }"
        rows = sp_sparql(q)
        if rows is None:
            print("phase failed, checkpoint saved", flush=True)
            return False
        with open(out, "a") as f:
            for row in rows:
                eq = row["e"]["value"].rsplit("/", 1)[-1]
                vq = row["v"]["value"].rsplit("/", 1)[-1]
                if vq not in ENT:
                    continue
                src, _ = ENT[eq]
                dst, _ = ENT[vq]
                rec = {
                    "src": src,
                    "dst": dst,
                    "rel": name,
                    "start": row.get("st", {}).get("value"),
                    "end": row.get("et", {}).get("value"),
                }
                f.write(json.dumps(rec) + "\n")
        done.update(c)
        json.dump(sorted(done), open(ck, "w"))
        print(f"{name}: {len(done)}/{len(done) + len(qids) - len(done)} qids", flush=True)
    return True


if __name__ == "__main__":
    only = sys.argv[1:] or list(PHASES)
    ok = True
    for name in only:
        prop, tenure = PHASES[name]
        if not phase_edges(name, prop, tenure):
            ok = False
            break
    print("EDGES DONE" if ok else "EDGES PARTIAL", flush=True)

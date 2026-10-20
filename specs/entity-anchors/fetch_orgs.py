#!/usr/bin/env python3
"""Org layers: universities + companies via QID-range pagination.
Writes layer_universities.jsonl / layer_companies.jsonl
"""

import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

EA = Path("~/workspace/vector-hoops/specs/entity-anchors/v2").expanduser()
EA.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "ScoutAtlas/1.0 (research)"}

# layer -> (instance-of qid, namespace, type)
ORGS = {
    "universities": ("Q3918", "org:university", "university"),
    "companies": ("Q4830453", "org:company", "company"),  # business enterprise
}
QID_MAX = 130_000_000
RANGE = 5_000_000


def sparql(q):
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q, "format": "json"})
    for a in range(4):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=240))
        except Exception as e:
            print(f"  retry {a + 1}: {str(e)[:70]}", flush=True)
            time.sleep(15 * (a + 1))
    return None


def api(params):
    url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(params)
    for a in range(3):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
        except Exception:
            time.sleep(5 * (a + 1))
    return None


def slug(n):
    s = unicodedata.normalize("NFKD", n)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("'", "").replace(".", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


only = sys.argv[1:] or list(ORGS)
for layer in only:
    inst_qid, ns, etype = ORGS[layer]
    ckpt_p = EA / f"ckpt2_{layer}.json"
    ckpt = json.load(open(ckpt_p)) if ckpt_p.exists() else {"ranges_done": []}
    raw_p = EA / f"raw_{layer}.jsonl"
    seen = set(ckpt["ranges_done"])
    total = 0
    for lo in range(0, QID_MAX, RANGE):
        if lo in seen:
            continue
        hi = lo + RANGE
        q = """SELECT ?p ?inc ?hq WHERE {
          ?p wdt:P31/wdt:P279* wd:%s.
          OPTIONAL { ?p wdt:P571 ?inc. }
          OPTIONAL { ?p wdt:P159 ?hq. }
          BIND(xsd:integer(STRAFTER(STR(?p), "entity/Q")) AS ?n)
          FILTER(?n > %d && ?n <= %d)
        }""" % (inst_qid, lo, hi)
        r = sparql(q)
        if not r:
            print(f"{layer} Q{lo}-{hi}: FAILED", flush=True)
            continue
        rows = r["results"]["bindings"]
        with open(raw_p, "a") as fh:
            for b in rows:
                fh.write(
                    json.dumps(
                        {
                            "qid": b["p"]["value"].rsplit("/", 1)[-1],
                            "inc": b.get("inc", {}).get("value", "")[:10] or None,
                            "hq_qid": b.get("hq", {}).get("value", "").rsplit("/", 1)[-1] or None,
                        }
                    )
                    + "\n"
                )
        total += len(rows)
        seen.add(lo)
        json.dump({"ranges_done": sorted(seen)}, open(ckpt_p, "w"))
        if rows:
            print(f"{layer} Q{lo}-{hi}: {len(rows)} (total {total})", flush=True)
        time.sleep(2)
    print(f"{layer} phase 1 done: {total}", flush=True)

    raw = [json.loads(line) for line in open(raw_p)]
    qids = [x["qid"] for x in raw]
    hq_qids = sorted(set(x["hq_qid"] for x in raw if x["hq_qid"]))
    labels, places = {}, {}
    for pool, store in ((qids, labels), (hq_qids, places)):
        for i in range(0, len(pool), 50):
            batch = pool[i : i + 50]
            r = api(
                {
                    "action": "wbgetentities",
                    "ids": "|".join(batch),
                    "props": "labels",
                    "languages": "en",
                    "format": "json",
                }
            )
            if r:
                for q_, e in r.get("entities", {}).items():
                    lb = e.get("labels", {}).get("en", {}).get("value")
                    if lb:
                        store[q_] = lb
            time.sleep(0.5)
    print(f"{layer}: labels {len(labels)}/{len(qids)}, hq places {len(places)}/{len(hq_qids)}", flush=True)

    out_p = EA / f"layer_{layer}.jsonl"
    with open(out_p, "w") as fh:
        for x in raw:
            name = labels.get(x["qid"])
            if not name:
                continue
            f = x["inc"]
            prec = "unknown" if not f else ("year" if f[5:] == "01-01" else "day")
            if prec == "year":
                f = f[:4]
            hq = places.get(x["hq_qid"]) if x["hq_qid"] else None
            fh.write(
                json.dumps(
                    {
                        "entity_id": f"{ns}:{slug(name)}",
                        "entity_type": etype,
                        "name": name,
                        "time_anchor": {"date": f, "precision": prec},
                        "place_anchor": {
                            "name": hq,
                            "region": None,
                            "country": None,
                            "lat": None,
                            "lon": None,
                            "precision": "city" if hq else "unknown",
                        },
                        "provenance": {
                            "source": "wikidata:" + x["qid"],
                            "retrieved": "2026-10-19",
                            "method": "sparql-org-p571-p159",
                        },
                        "confidence": "high" if f and hq else "medium",
                    }
                )
                + "\n"
            )
    print(f"{layer}: WROTE {sum(1 for _ in open(out_p))}", flush=True)

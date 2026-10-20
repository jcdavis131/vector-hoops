#!/usr/bin/env python3
"""People layers: politicians (notable), businesspeople, authors.
Same anchor schema as athletes. Usage: python3 fetch_people.py [layer]
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
Path(EA).mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "ScoutAtlas/1.0 (research)"}

LAYERS = {
    # layer: (occupation qid, extra filter, entity prefix)
    "politicians": ("Q82955", "?p wikibase:sitelinks ?sl. FILTER(?sl >= 15)", "politician"),
    "business": ("Q43845", "", "businessperson"),
    "authors": ("Q482980", "", "author"),
}
BATCH = 5000


def sparql(q):
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q, "format": "json"})
    for a in range(3):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180))
        except Exception as e:
            print(f"  retry {a + 1}: {str(e)[:80]}", flush=True)
            time.sleep(10 * (a + 1))
    return None


def slug(n):
    s = unicodedata.normalize("NFKD", n)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("'", "").replace(".", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


only = sys.argv[1:] or list(LAYERS)
for layer in only:
    qid, extra, prefix = LAYERS[layer]
    ckpt_p = Path(EA) / f"ckpt_{layer}.json"
    ckpt = json.load(Path(ckpt_p).open()) if Path(ckpt_p).exists() else {"offset": 0}
    out_p = Path(EA) / f"people_{layer}.jsonl"
    fh = Path(out_p).open("a")
    offset = ckpt["offset"]
    total = 0
    while True:
        q = """SELECT ?p ?pLabel ?dob ?pobLabel WHERE {
          ?p wdt:P106 wd:%s; wdt:P569 ?dob. %s
          OPTIONAL { ?p wdt:P19 ?pob. }
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
        } ORDER BY ?p LIMIT %d OFFSET %d""" % (qid, extra, BATCH, offset)
        r = sparql(q)
        if not r:
            print(f"{layer}: query failed at offset {offset}", flush=True)
            break
        rows = r["results"]["bindings"]
        if not rows:
            break
        for b in rows:
            name = b["pLabel"]["value"]
            dobv = b["dob"]["value"][:10]
            prec = "year" if dobv[5:] == "01-01" else "day"
            if prec == "year":
                dobv = dobv[:4]
            pob = b.get("pobLabel", {}).get("value")
            fh.write(
                json.dumps(
                    {
                        "entity_id": f"people:{prefix}:{slug(name)}",
                        "entity_type": prefix,
                        "name": name,
                        "time_anchor": {"date": dobv, "precision": prec},
                        "place_anchor": {
                            "name": pob,
                            "region": None,
                            "country": None,
                            "lat": None,
                            "lon": None,
                            "precision": "city" if pob else "unknown",
                        },
                        "provenance": {
                            "source": "wikidata:" + b["p"]["value"].rsplit("/", 1)[-1],
                            "retrieved": "2026-10-19",
                            "method": "sparql-p106-p569-p19",
                        },
                        "confidence": "high" if pob else "medium",
                    }
                )
                + "\n"
            )
        offset += len(rows)
        total += len(rows)
        json.dump({"offset": offset}, Path(ckpt_p).open("w"))
        fh.flush()
        print(f"{layer}: {total} (offset {offset})", flush=True)
        time.sleep(2)
        if len(rows) < BATCH:
            break
    fh.close()
    print(f"{layer}: DONE {total}", flush=True)

#!/usr/bin/env python3
"""Athletes pull v2: QID-range pagination (no ORDER BY/OFFSET), labels resolved
in bulk afterward via the Action API. Resume-safe per sport+range.
Usage: python3 fetch_athletes2.py [sport]
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

SPORTS = {
    "nfl": "Q19204627",
    "mlb": "Q10871364",
    "nhl": "Q11774891",
    "soccer": "Q937857",
    "tennis": "Q10833314",
    "golf": "Q11303721",
}
# generic layers: layer -> (occupation qid, id namespace, entity type, extra sparql filter)
PEOPLE = {
    "politicians": ("Q82955", "people:politician", "politician", "?p wikibase:sitelinks ?sl. FILTER(?sl >= 15)"),
    "business": ("Q43845", "people:businessperson", "businessperson", ""),
    "authors": ("Q482980", "people:author", "author", ""),
    "musicians": ("Q639669", "people:musician", "musician", "?p wikibase:sitelinks ?sl. FILTER(?sl >= 10)"),
    "actors": ("Q33999", "people:actor", "actor", "?p wikibase:sitelinks ?sl. FILTER(?sl >= 10)"),
    "military": ("Q47064", "people:military", "military_personnel", ""),
    "inventors": ("Q205375", "people:inventor", "inventor", ""),
}
ALL = {k: (v, f"sports:athlete:{k}", "athlete", "") for k, v in SPORTS.items()}
ALL.update(PEOPLE)
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


only = sys.argv[1:] or [s for s in SPORTS if s not in ("soccer",)]
for sport in only:
    qid, ns, etype, extra = ALL[sport]
    ckpt_p = Path(EA) / f"ckpt2_{sport}.json"
    ckpt = json.load(Path(ckpt_p).open()) if Path(ckpt_p).exists() else {"ranges_done": []}
    raw_p = Path(EA) / f"raw_{sport}.jsonl"
    seen_ranges = set(ckpt["ranges_done"])
    total = 0
    for lo in range(0, QID_MAX, RANGE):
        if lo in seen_ranges:
            continue
        hi = lo + RANGE
        q = """SELECT ?p ?dob ?pob WHERE {
          ?p wdt:P106 wd:%s; wdt:P569 ?dob. %s
          OPTIONAL { ?p wdt:P19 ?pob. }
          BIND(xsd:integer(STRAFTER(STR(?p), "entity/Q")) AS ?n)
          FILTER(?n > %d && ?n <= %d)
        }""" % (qid, extra, lo, hi)
        r = sparql(q)
        if not r:
            print(f"{sport} Q{lo}-{hi}: FAILED, will retry next run", flush=True)
            continue
        rows = r["results"]["bindings"]
        with Path(raw_p).open("a") as fh:
            for b in rows:
                fh.write(
                    json.dumps(
                        {
                            "qid": b["p"]["value"].rsplit("/", 1)[-1],
                            "dob": b["dob"]["value"][:10],
                            "pob_qid": b.get("pob", {}).get("value", "").rsplit("/", 1)[-1] or None,
                        }
                    )
                    + "\n"
                )
        total += len(rows)
        seen_ranges.add(lo)
        json.dump({"ranges_done": sorted(seen_ranges)}, Path(ckpt_p).open("w"))
        if rows:
            print(f"{sport} Q{lo}-{hi}: {len(rows)} (total {total})", flush=True)
        time.sleep(2)
    print(f"{sport} phase 1 DONE: ranges complete", flush=True)

    # phase 2: bulk label resolution
    print(f"{sport} phase 2: resolving labels", flush=True)
    raw = [json.loads(line) for line in Path(raw_p).open()]
    qids = [x["qid"] for x in raw]
    pob_qids = sorted(set(x["pob_qid"] for x in raw if x["pob_qid"]))
    labels, places = {}, {}
    for i in range(0, len(qids), 50):
        batch = qids[i : i + 50]
        r = api(
            {"action": "wbgetentities", "ids": "|".join(batch), "props": "labels", "languages": "en", "format": "json"}
        )
        if r:
            for q_, e in r.get("entities", {}).items():
                lb = e.get("labels", {}).get("en", {}).get("value")
                if lb:
                    labels[q_] = lb
        time.sleep(0.5)
    for i in range(0, len(pob_qids), 50):
        batch = pob_qids[i : i + 50]
        r = api(
            {"action": "wbgetentities", "ids": "|".join(batch), "props": "labels", "languages": "en", "format": "json"}
        )
        if r:
            for q_, e in r.get("entities", {}).items():
                lb = e.get("labels", {}).get("en", {}).get("value")
                if lb:
                    places[q_] = lb
        time.sleep(0.5)
    print(f"{sport}: labels {len(labels)}/{len(qids)}, places {len(places)}/{len(pob_qids)}", flush=True)

    out_p = Path(EA) / f"layer_{sport}.jsonl"
    with Path(out_p).open("w") as fh:
        for x in raw:
            name = labels.get(x["qid"])
            if not name:
                continue
            dobv = x["dob"]
            prec = "year" if dobv[5:] == "01-01" else "day"
            if prec == "year":
                dobv = dobv[:4]
            pob = places.get(x["pob_qid"]) if x["pob_qid"] else None
            fh.write(
                json.dumps(
                    {
                        "entity_id": f"{ns}:{slug(name)}",
                        "entity_type": etype,
                        "sport": sport if etype == "athlete" else None,
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
                            "source": "wikidata:" + x["qid"],
                            "retrieved": "2026-10-19",
                            "method": "sparql-qidrange+bulklab",
                        },
                        "confidence": "high" if pob else "medium",
                    }
                )
                + "\n"
            )
    n = sum(1 for _ in Path(out_p).open())
    print(f"{sport}: WROTE {n} records", flush=True)

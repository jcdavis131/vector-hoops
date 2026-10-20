#!/usr/bin/env python3
"""Conflicts layer: wars + battles with date ranges and coordinates.
Writes layer_conflicts.jsonl
"""
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

EA = Path('~/workspace/vector-hoops/specs/entity-anchors/v2').expanduser()
Path(EA).mkdir(parents=True, exist_ok=True)
UA = {'User-Agent': 'ScoutAtlas/1.0 (research)'}

KINDS = {'wars': 'Q198', 'battles': 'Q178561'}
QID_MAX = 130_000_000
RANGE = 5_000_000

def sparql(q):
    url = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': q, 'format': 'json'})
    for a in range(4):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=240))
        except Exception as e:
            print(f'  retry {a+1}: {str(e)[:70]}', flush=True)
            time.sleep(15 * (a + 1))
    return None

def api(params):
    url = 'https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode(params)
    for a in range(3):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
        except Exception:
            time.sleep(5 * (a + 1))
    return None

def slug(n):
    s = unicodedata.normalize('NFKD', n)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("'", '').replace('.', '')
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')

only = sys.argv[1:] or list(KINDS)
for kind in only:
    inst = KINDS[kind]
    ckpt_p = Path(EA) / f'ckpt2_{kind}.json'
    ckpt = json.load(Path(ckpt_p).open()) if Path(ckpt_p).exists() else {'ranges_done': []}
    raw_p = Path(EA) / f'raw_{kind}.jsonl'
    seen = set(ckpt['ranges_done'])
    total = 0
    for lo in range(0, QID_MAX, RANGE):
        if lo in seen:
            continue
        hi = lo + RANGE
        q = '''SELECT ?p ?start ?end ?coord WHERE {
          ?p wdt:P31/wdt:P279* wd:%s.
          OPTIONAL { ?p wdt:P580 ?start. }
          OPTIONAL { ?p wdt:P582 ?end. }
          OPTIONAL { ?p wdt:P625 ?coord. }
          BIND(xsd:integer(STRAFTER(STR(?p), "entity/Q")) AS ?n)
          FILTER(?n > %d && ?n <= %d)
        }''' % (inst, lo, hi)
        r = sparql(q)
        if not r:
            print(f'{kind} Q{lo}-{hi}: FAILED', flush=True)
            continue
        rows = r['results']['bindings']
        with Path(raw_p).open('a') as fh:
            for b in rows:
                c = b.get('coord', {}).get('value', '')
                m = re.match(r'Point\(([-\d.]+) ([-\d.]+)\)', c)
                fh.write(json.dumps({
                    'qid': b['p']['value'].rsplit('/', 1)[-1],
                    'start': b.get('start', {}).get('value', '')[:10] or None,
                    'end': b.get('end', {}).get('value', '')[:10] or None,
                    'lon': float(m.group(1)) if m else None,
                    'lat': float(m.group(2)) if m else None,
                }) + '\n')
        total += len(rows)
        seen.add(lo)
        json.dump({'ranges_done': sorted(seen)}, Path(ckpt_p).open('w'))
        if rows:
            print(f'{kind} Q{lo}-{hi}: {len(rows)} (total {total})', flush=True)
        time.sleep(2)
    print(f'{kind} phase 1 done: {total}', flush=True)

    raw = [json.loads(line) for line in Path(raw_p).open()]
    qids = [x['qid'] for x in raw]
    labels = {}
    for i in range(0, len(qids), 50):
        batch = qids[i:i+50]
        r = api({'action': 'wbgetentities', 'ids': '|'.join(batch),
                 'props': 'labels', 'languages': 'en', 'format': 'json'})
        if r:
            for q_, e in r.get('entities', {}).items():
                lb = e.get('labels', {}).get('en', {}).get('value')
                if lb:
                    labels[q_] = lb
        time.sleep(0.5)
    out_p = Path(EA) / f'layer_{kind}.jsonl'
    with Path(out_p).open('w') as fh:
        for x in raw:
            name = labels.get(x['qid'])
            if not name:
                continue
            fh.write(json.dumps({
                'entity_id': f'events:{kind[:-1]}:{slug(name)}',
                'entity_type': kind[:-1], 'name': name,
                'time_anchor': {'start': x['start'], 'end': x['end'],
                                'precision': 'day' if x['start'] else 'unknown'},
                'place_anchor': {'name': None, 'lat': x['lat'], 'lon': x['lon'],
                                 'precision': 'coordinates' if x['lat'] else 'unknown'},
                'provenance': {'source': 'wikidata:' + x['qid'],
                               'retrieved': '2026-10-19', 'method': 'sparql-event-p580-p582-p625'},
                'confidence': 'medium',
            }) + '\n')
    print(f'{kind}: WROTE {sum(1 for _ in Path(out_p).open())}', flush=True)

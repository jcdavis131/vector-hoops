#!/usr/bin/env python3
"""Fetch birth date + birthplace for every atlas player from Wikidata.
Writes specs/dense-retriever/player_birth.json: name -> {dob, birthplace, wikidata_id}
Resumable: skips names already in the output file.
"""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = Path('~/workspace/vector-hoops').expanduser()
SPEC = BASE / 'specs/dense-retriever'
OUT = SPEC / 'player_birth.json'

v = json.load(open(BASE / 'assets/vectors.json'))
names = sorted(set(p['name'] for p in v['players']))

done = {}
if OUT.exists():
    done = json.load(open(OUT))
todo = [n for n in names if n not in done]
print(f'{len(names)} players, {len(done)} done, {len(todo)} to fetch', flush=True)

def esc(n):
    return n.replace('\\', '\\\\').replace('"', '\\"')

BATCH = 80
for i in range(0, len(todo), BATCH):
    batch = todo[i:i+BATCH]
    vals = ' '.join(f'"{esc(n)}"@en' for n in batch)
    q = '''SELECT ?person ?personLabel ?dob ?pobLabel WHERE {
      VALUES ?name { %s }
      ?person rdfs:label ?name; wdt:P31 wd:Q5; wdt:P106 wd:Q3665646;
              wdt:P569 ?dob.
      OPTIONAL { ?person wdt:P19 ?pob. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }''' % vals
    url = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': q, 'format': 'json'})
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'ScoutAtlas/1.0 (research)'})
            r = json.load(urllib.request.urlopen(req, timeout=90))
            break
        except Exception as e:
            print(f'  batch {i//BATCH} attempt {attempt+1} failed: {e}', flush=True)
            time.sleep(5 * (attempt + 1))
    else:
        print(f'  batch {i//BATCH} FAILED after 3 attempts', flush=True)
        continue
    hits = 0
    for b in r['results']['bindings']:
        label = b['personLabel']['value']
        # match back to our name (label should equal it)
        key = label if label in batch else None
        if key is None:
            # fuzzy: find case-insensitive match
            for n in batch:
                if n.lower() == label.lower():
                    key = n
                    break
        if key is None:
            continue
        done[key] = {
            'dob': b['dob']['value'][:10],
            'birthplace': b.get('pobLabel', {}).get('value'),
            'wikidata': b['person']['value'].rsplit('/', 1)[-1],
        }
        hits += 1
    # mark batch names with no hit as null (don't retry forever)
    for n in batch:
        if n not in done:
            done[n] = {'dob': None, 'birthplace': None, 'wikidata': None}
    json.dump(done, open(OUT, 'w'), indent=1)
    print(f'  batch {i//BATCH}: {hits}/{len(batch)} hits ({len(done)}/{len(names)})', flush=True)
    time.sleep(1)

have = sum(1 for x in done.values() if x['dob'])
print(f'DONE: {have}/{len(names)} with dob', flush=True)

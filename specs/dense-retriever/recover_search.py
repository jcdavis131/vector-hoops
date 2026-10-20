#!/usr/bin/env python3
"""Recover missing birth data via Wikidata fuzzy entity search.
For each name without dob: wbsearchentities -> top basketball-player hit -> P569/P19.
"""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

DR = Path('~/workspace/vector-hoops/specs/dense-retriever').expanduser()
P = Path(DR) / 'player_birth.json'
d = json.load(Path(P).open())
miss = [n for n, v in d.items() if not v.get('dob')]
print(f'recovering {len(miss)}', flush=True)

UA = {'User-Agent': 'ScoutAtlas/1.0 (research)'}

def search(name):
    url = 'https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode({
        'action': 'wbsearchentities', 'search': name, 'language': 'en',
        'format': 'json', 'limit': 6})
    r = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30))
    return [e['id'] for e in r.get('search', [])]

def entity(qid):
    url = 'https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode({
        'action': 'wbgetentities', 'ids': qid, 'props': 'claims|labels',
        'languages': 'en', 'format': 'json'})
    r = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30))
    return r['entities'][qid]

def is_bball(ent):
    for c in ent.get('claims', {}).get('P106', []):
        try:
            if c['mainsnak']['datavalue']['value']['id'] == 'Q3665646':
                return True
        except KeyError:
            pass
    return False

def get_str(ent, prop):
    cs = ent.get('claims', {}).get(prop, [])
    if not cs:
        return None
    try:
        return cs[0]['mainsnak']['datavalue']['value']
    except KeyError:
        return None

def place_name(qid):
    try:
        e = entity(qid)
        return e.get('labels', {}).get('en', {}).get('value')
    except Exception:
        return None

fixed = 0
for n in miss:
    try:
        for qid in search(n):
            ent = entity(qid)
            if not is_bball(ent):
                continue
            dob = get_str(ent, 'P569')
            if not dob:
                continue
            pob_qid = get_str(ent, 'P19')
            pob = place_name(pob_qid['id']) if isinstance(pob_qid, dict) else None
            d[n] = {'dob': dob['time'][1:11], 'birthplace': pob,
                    'wikidata': qid, 'via_search': True}
            fixed += 1
            break
    except Exception as e:
        print(f'  {n}: {e}', flush=True)
    time.sleep(0.4)
    if fixed % 25 == 0:
        json.dump(d, Path(P).open('w'), indent=1)

json.dump(d, Path(P).open('w'), indent=1)
have = sum(1 for x in d.values() if x.get('dob'))
print(f'fixed {fixed}; now {have}/2415 with dob', flush=True)

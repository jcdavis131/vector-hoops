#!/usr/bin/env python3
"""Recover missing birth data with BM25-ranked Wikidata candidates.
For each missed name: wbsearchentities -> normalize diacritics -> BM25-lite
token ranking over candidate labels -> verify best is a basketball player
with a dob -> record.
"""
import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

DR = Path('~/workspace/vector-hoops/specs/dense-retriever').expanduser()
P = Path(DR) / 'player_birth.json'
d = json.load(Path(P).open())
miss = [n for n, v in d.items() if not v.get('dob')]
print(f'recovering {len(miss)}', flush=True)

UA = {'User-Agent': 'ScoutAtlas/1.0 (research)'}

def norm(s):
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return s.lower()

def toks(s):
    return re.findall(r'[a-z0-9]+', norm(s))

def bm25(query_toks, doc_toks, avgdl, k1=1.2, b=0.75):
    # idf over the candidate set is ~1 here; use token overlap weighted by rarity
    score, dl = 0.0, len(doc_toks) or 1
    for t in set(query_toks):
        tf = doc_toks.count(t)
        if tf:
            score += (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / avgdl))
    # coverage bonus: fraction of query tokens hit
    hit = sum(1 for t in set(query_toks) if t in doc_toks)
    return score * (hit / max(1, len(set(query_toks))))

def search(name):
    url = 'https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode({
        'action': 'wbsearchentities', 'search': name, 'language': 'en',
        'format': 'json', 'limit': 10})
    r = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30))
    return [(e['id'], e.get('label', ''), e.get('description', '')) for e in r.get('search', [])]

def entity(qid):
    url = 'https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode({
        'action': 'wbgetentities', 'ids': qid, 'props': 'claims|labels',
        'languages': 'en', 'format': 'json'})
    r = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30))
    return r['entities'][qid]

def get_claim(ent, prop):
    for c in ent.get('claims', {}).get(prop, []):
        try:
            return c['mainsnak']['datavalue']['value']
        except KeyError:
            pass
    return None

def is_bball(ent):
    v = get_claim(ent, 'P106')
    return isinstance(v, dict) and v.get('id') == 'Q3665646'

fixed, wrong = 0, []
for n in miss:
    try:
        cands = search(n)
        if not cands:
            continue
        qt = toks(n)
        docs = [toks(label) for _, label, _ in cands]
        avgdl = sum(len(x) for x in docs) / max(1, len(docs))
        ranked = sorted(range(len(cands)),
                        key=lambda i: bm25(qt, docs[i], avgdl), reverse=True)
        for i in ranked:
            qid, label, desc = cands[i]
            # BM25 sanity: best must share at least half the query tokens
            if sum(1 for t in set(qt) if t in docs[i]) < max(1, len(set(qt)) // 2):
                continue
            ent = entity(qid)
            if not is_bball(ent):
                continue
            dob = get_claim(ent, 'P569')
            if not dob:
                continue
            pob = get_claim(ent, 'P19')
            pob_name = None
            if isinstance(pob, dict):
                try:
                    pob_name = entity(pob['id']).get('labels', {}).get('en', {}).get('value')
                except Exception:
                    pass
            d[n] = {'dob': dob['time'][1:11], 'birthplace': pob_name,
                    'wikidata': qid, 'via_bm25': label}
            fixed += 1
            break
        else:
            wrong.append(n)
    except Exception as e:
        print(f'  {n}: {e}', flush=True)
    time.sleep(0.35)
    if fixed % 10 == 0:
        json.dump(d, Path(P).open('w'), indent=1)
        print(f'  checkpoint: {fixed} fixed', flush=True)

json.dump(d, Path(P).open('w'), indent=1)
have = sum(1 for x in d.values() if x.get('dob'))
print(f'fixed {fixed}; now {have}/2415 with dob; {len(wrong)} unmatched', flush=True)
if wrong:
    print('unmatched sample:', wrong[:15], flush=True)

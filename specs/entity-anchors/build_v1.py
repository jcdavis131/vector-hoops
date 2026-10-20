#!/usr/bin/env python3
"""Build v1 of the entity time+place anchor resource per specs/entity-anchors/SPEC.md.
Reads:  specs/dense-retriever/player_birth.json, team_birth.json
Writes: specs/entity-anchors/v1/players.jsonl, teams.jsonl, REPORT.md
Idempotent: re-run any time; QA gates print pass/fail.
"""
import json
import re
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = HERE / '..' / 'entity-anchors'
V1 = SPEC / 'v1'
V1.mkdir(parents=True, exist_ok=True)

DR = HERE / '..' / 'dense-retriever'
players_raw = json.load(open(DR / 'player_birth.json'))
teams_raw = json.load(open(DR / 'team_birth.json'))

def slug(n):
    s = n.lower().replace("'", '').replace('.', '')
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s

def date_precision(d):
    # Wikidata year-pad trap: 1946-01-01 usually means year-only
    if d is None:
        return None, 'unknown'
    if d[5:] == '01-01':
        return d[:4], 'year'
    return d, 'day'

records = []
# --- players ---
for name, v in sorted(players_raw.items()):
    dob = v.get('dob')
    dstr, dprec = date_precision(dob)
    place = v.get('birthplace')
    records.append({
        'entity_id': f'nba:player:{slug(name)}',
        'entity_type': 'player',
        'name': name,
        'time_anchor': {'date': dstr, 'precision': dprec},
        'place_anchor': {'name': place, 'region': None, 'country': None,
                         'lat': None, 'lon': None,
                         'precision': 'city' if place else 'unknown'},
        'provenance': {'source': ('wikidata:' + v['wikidata']) if v.get('wikidata') else ('variant:' + v.get('via_variant', '?') if v.get('via_variant') else None),
                       'retrieved': str(date.today()), 'method': 'sparql-p569-p19'},
        'confidence': 'high' if dob and place else ('medium' if dob or place else 'low'),
    })

# --- teams ---
for name, v in sorted(teams_raw.items()):
    f = v.get('founded')
    dstr, dprec = date_precision(f)
    hq = v.get('hq')
    records.append({
        'entity_id': f'nba:team:{slug(name)}',
        'entity_type': 'team',
        'name': name,
        'time_anchor': {'date': dstr, 'precision': dprec},
        'place_anchor': {'name': hq, 'region': None, 'country': 'USA',
                         'lat': None, 'lon': None,
                         'precision': 'city' if hq else 'unknown'},
        'provenance': {'source': 'wikidata:' + v['wikidata'] if v.get('wikidata') else None,
                       'retrieved': str(date.today()), 'method': 'sparql-p571-p159'},
        'confidence': 'high' if f and hq else 'medium',
    })

# --- v1.1 additions: geocode + dossier name map ---
GEOCODE = V1 / 'geocode.json'
geocode = json.load(open(GEOCODE)) if GEOCODE.exists() else {}
NAME_MAP = json.load(open(DR / 'dossier_name_map.json')) if Path(DR / 'dossier_name_map.json').exists() else {}

for r in records:
    if r['entity_type'] == 'player':
        place = r['place_anchor']['name']
        g = geocode.get(place)
        if g and g.get('lat') is not None:
            r['place_anchor'].update({'lat': g['lat'], 'lon': g['lon'],
                                      'country': g.get('country'),
                                      'precision': 'coordinates'})
        # dossier linkage
        for f, mapped in NAME_MAP.items():
            if mapped == r['name']:
                r['dossier'] = f
                break

players = [r for r in records if r['entity_type'] == 'player']
teams = [r for r in records if r['entity_type'] == 'team']
with open(V1 / 'players.jsonl', 'w') as fh:
    for r in players:
        fh.write(json.dumps(r) + '\n')
with open(V1 / 'teams.jsonl', 'w') as fh:
    for r in teams:
        fh.write(json.dumps(r) + '\n')

# --- QA gates ---
gates = []
ids = [r['entity_id'] for r in records]
gates.append(('no duplicate entity_id', len(ids) == len(set(ids))))
gates.append(('every record has precisions',
              all(r['time_anchor']['precision'] and r['place_anchor']['precision'] for r in records)))
gates.append(('no Jan-1 day-precision trap',
              all(not (r['time_anchor']['precision'] == 'day' and r['time_anchor']['date'][5:] == '01-01') for r in records if r['time_anchor']['date'])))
p_unk_t = sum(1 for r in players if r['time_anchor']['precision'] == 'unknown')
p_unk_p = sum(1 for r in players if r['place_anchor']['precision'] == 'unknown')
t_unk = sum(1 for r in teams if r['time_anchor']['precision'] == 'unknown' or r['place_anchor']['precision'] == 'unknown')

report = [f'# Entity anchors v1 — build report ({date.today()})', '',
          f'players: {len(players)} | teams: {len(teams)}', '',
          '## QA gates']
allpass = True
for name, ok in gates:
    report.append(f'- [{"x" if ok else " "}] {name}')
    allpass = allpass and ok
report += ['', '## Unknown rates',
           f'- players time unknown: {p_unk_t}/{len(players)} ({100*p_unk_t/len(players):.1f}%)',
           f'- players place unknown: {p_unk_p}/{len(players)} ({100*p_unk_p/len(players):.1f}%)',
           f'- teams with any unknown: {t_unk}/{len(teams)}', '',
           '## Next (v1.1)',
           '- variant pass for 353 label mismatches (running)',
           '- geocode all place anchors → lat/lon',
           '- split region/country from place names']
open(V1 / 'REPORT.md', 'w').write('\n'.join(report) + '\n')
print('\n'.join(f'[{"PASS" if ok else "FAIL"}] {n}' for n, ok in gates))
print(f'players {len(players)}, teams {len(teams)}, unknown-time {p_unk_t}, unknown-place {p_unk_p}')
print('ALL PASS' if allpass else 'GATES FAILING')

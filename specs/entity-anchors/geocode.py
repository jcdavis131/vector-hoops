#!/usr/bin/env python3
"""Geocode all distinct birthplaces/HQs via Nominatim. Resume-safe.
Writes specs/entity-anchors/v1/geocode.json: place -> {lat, lon, display, precision}
"""
import json, os, time, urllib.parse, urllib.request

DR = os.path.expanduser('~/workspace/vector-hoops/specs/dense-retriever')
EA = os.path.expanduser('~/workspace/vector-hoops/specs/entity-anchors/v1')
OUT = os.path.join(EA, 'geocode.json')

d = json.load(open(os.path.join(DR, 'player_birth.json')))
t = json.load(open(os.path.join(DR, 'team_birth.json')))
places = sorted(set(v['birthplace'] for v in d.values() if v.get('birthplace'))
                | set(v['hq'] for v in t.values() if v.get('hq')))

done = json.load(open(OUT)) if os.path.exists(OUT) else {}
todo = [p for p in places if p not in done]
print(f'{len(places)} places, {len(done)} cached, {len(todo)} to geocode', flush=True)
UA = {'User-Agent': 'ScoutAtlas/1.0 (research; contact via repo)'}

for i, p in enumerate(todo):
    # bias toward city-level; append country hint from common patterns is skipped —
    # Nominatim handles bare city names well with addressdetails
    url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode({
        'q': p, 'format': 'json', 'limit': 1, 'addressdetails': 1})
    try:
        r = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30))
        if r:
            b = r[0]
            addr = b.get('address', {})
            done[p] = {
                'lat': float(b['lat']), 'lon': float(b['lon']),
                'display': b.get('display_name', '')[:120],
                'country': addr.get('country'),
                'precision': 'coordinates',
            }
        else:
            done[p] = {'lat': None, 'lon': None, 'display': None,
                       'country': None, 'precision': 'unknown'}
    except Exception as e:
        print(f'  {p}: {e}', flush=True)
        done[p] = {'lat': None, 'lon': None, 'display': None,
                   'country': None, 'precision': 'unknown'}
    if (i + 1) % 25 == 0:
        json.dump(done, open(OUT, 'w'), indent=1)
        print(f'  {i+1}/{len(todo)}', flush=True)
    time.sleep(1.1)  # Nominatim usage policy

json.dump(done, open(OUT, 'w'), indent=1)
hit = sum(1 for v in done.values() if v['lat'] is not None)
print(f'DONE: {hit}/{len(done)} geocoded', flush=True)

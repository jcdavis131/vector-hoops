
"""Fetch preseason over/under + title odds from Basketball-Reference.

Writes assets/data/preseason_win_totals.json merged with existing BetMGM snaps.

Source spec: Sports Reference blog says preseason NBA title odds back to 1985 and Over/Unders back to 2003.
URL pattern: https://www.basketball-reference.com/leagues/NBA_{end_year}_preseason_odds.html

Parse: table id=preseason_odds rows: Team, Over/Under, Price, etc.

Rate-limited, resumable, zero-deps (urllib only).

Run: python pipeline/fetch_preseason_odds.py [--season 2023-24] [--offline]
""""

from __future__ import annotations

import json, re, sys, time, pathlib, urllib.request

ROOT=pathlib.Path(__file__).resolve().parent.parent
CACHE=ROOT/"pipeline"/"cache"/"preseason_odds_raw.json"
DEST=ROOT/"assets"/"data"/"preseason_win_totals.json"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64)"

ROW_RE=re.compile(r'<tr[^>]*>.*?<a href="/teams/([A-Z]{3})/.*?</a>.*?Over/Under.*?([0-9]{1,2}\.[05])',re.S|re.I)

def fetch_season(end_year:int)->dict:
    url=f"https://www.basketball-reference.com/leagues/NBA_{end_year}_preseason_odds.html"
    req=urllib.request.Request(url, headers={"User-Agent":UA})
    try:
        html=urllib.request.urlopen(req,timeout=30).read().decode("utf-8",errors="ignore")
    except Exception as e:
        print(f"{end_year}: FAIL {e}")
        return {}
    out={}
    # crude table parse: look for rows with data-stat team_name + over_under
    # fallback: regex for teams + win total in surrounding td
    for abbr, ou in ROW_RE.findall(html):
        try:
            out[abbr]=float(ou)
        except: pass
    # second attempt: if empty, try generic float after team link
    if not out:
        # Look for pattern: data-stat="team_name_abbr" >XXX</td> ... data-stat="over_under" >42.5
        pat=re.compile(r'data-stat="team_name_abbr"[^>]*>([A-Z]{3})</td>.*?data-stat="over_under"[^>]*>([0-9.]+)</td>',re.S)
        for abbr, ou in pat.findall(html):
            try: out[abbr]=float(ou)
            except: pass
    print(f"{end_year}: {len(out)} totals {out}")
    return out

def main():
    seasons=[f"{y}-{str(y+1)[-2:]}" for y in range(2003,2026)]
    # load existing dest if any
    data=json.loads(DEST.read_text()) if DEST.exists() else {"seasons":{}}
    cache={}
    if CACHE.exists():
        cache=json.loads(CACHE.read_text())
    for season in seasons:
        end_year=int(season[:4])+1
        if season in data.get("seasons",{}) and len(data["seasons"][season])>=20:
            print(f"{season}: cached in dest")
            continue
        if str(end_year) in cache and len(cache[str(end_year)])>=10:
            # promote
            data.setdefault("seasons",{})[season]=cache[str(end_year)]
            print(f"{season}: from raw cache")
            continue
        if "--offline" in sys.argv:
            continue
        if len(sys.argv)>2 and f"--season" in sys.argv:
            idx=sys.argv.index("--season")
            if season!=sys.argv[idx+1]:
                continue
        out=fetch_season(end_year)
        if len(out)>=10:
            cache[str(end_year)]=out
            CACHE.write_text(json.dumps(cache))
            data.setdefault("seasons",{})[season]=out
            DEST.write_text(json.dumps(data,indent=2))
        time.sleep(4)
    print("done")

if __name__=="__main__":
    main()

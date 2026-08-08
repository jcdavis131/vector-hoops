"""Fetch preseason over/under + title odds from Basketball-Reference.

Writes assets/data/preseason_win_totals.json merged with existing BetMGM snaps.

Source spec: Sports Reference blog says preseason NBA title odds back to 1985 and Over/Unders back to 2003.
URL pattern: https://www.basketball-reference.com/leagues/NBA_{end_year}_preseason_odds.html

Parse: table id=NBA_preseason_odds rows: Team, Odds, W-L O/U (data-stat wins_ou)

Rate-limited, resumable, zero-deps (urllib + curl fallback).

Run: python pipeline/fetch_preseason_odds.py [--season 2023-24] [--offline]
"""

from __future__ import annotations

import json, re, sys, time, pathlib, urllib.request, subprocess

ROOT=pathlib.Path(__file__).resolve().parent.parent
CACHE=ROOT/"pipeline"/"cache"/"preseason_odds_raw.json"
DEST=ROOT/"assets"/"data"/"preseason_win_totals.json"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Scout/1.0"

def fetch_html(end_year:int)->str:
    url=f"https://www.basketball-reference.com/leagues/NBA_{end_year}_preseason_odds.html"
    # Try urllib first
    req=urllib.request.Request(url, headers={"User-Agent":UA, "Accept":"text/html,application/xhtml+xml"})
    try:
        data=urllib.request.urlopen(req, timeout=18).read().decode("utf-8", errors="ignore")
        if len(data)>5000:
            return data
    except Exception as e:
        print(f"{end_year}: urllib FAIL {e}", flush=True)
    # Fallback curl
    try:
        html=subprocess.check_output(["curl","-sL","-A",UA,"--compressed","-m","20",url], text=True, stderr=subprocess.DEVNULL)
        if len(html)>5000:
            return html
    except Exception as e:
        print(f"{end_year}: curl FAIL {e}", flush=True)
    return ""

def parse_wins_ou(html:str)->dict:
    # BBR wraps tables in HTML comments
    clean=re.sub(r'<!--|-->', '', html)
    out={}
    # Prefer div_NBA_preseason_odds table
    # Rows have <th data-stat="team"><a href='/teams/XXX/...
    # Then <td data-stat="wins_ou">58.5</td> or data-stat="over_under"
    # Use regex over entire cleaned html for team+ou pairs
    # Pattern1: wins_ou
    for abbr, ou in re.findall(r'/teams/([A-Z]{3})/\d+\.html.*?</a>.*?<td[^>]*data-stat="(?:wins_ou|over_under)"[^>]*>([0-9]{2,3}\.[05])</td>', clean, re.S):
        try:
            out[abbr]=float(ou)
        except: pass
    if len(out)>=8:
        return out
    # Fallback second pattern: header season older may use <tr> with team and float second column
    # Generic: look for /teams/XXX and next float  ... 
    for m in re.finditer(r'/teams/([A-Z]{3})/', clean):
        abbr=m.group(1)
        if abbr in out:
            continue
        snippet=clean[m.start():m.start()+800]
        fld=re.search(r'data-stat="(?:wins_ou|over_under|wins_ou_over|ou)"[^>]*>([0-9]{2,3}\.[05])</td>', snippet)
        if fld:
            try:
                out[abbr]=float(fld.group(1))
            except: pass
    return out

def fetch_season(end_year:int)->dict:
    html=fetch_html(end_year)
    if not html:
        print(f"{end_year}: empty html", flush=True)
        return {}
    parsed=parse_wins_ou(html)
    print(f"{end_year}: {len(parsed)} totals {parsed}", flush=True)
    return parsed

def main():
    seasons=[f"{y}-{str(y+1)[-2:]}" for y in range(2003,2026)]
    data=json.loads(DEST.read_text()) if DEST.exists() else {"built":"","source":"","seasons":{}}
    cache={}
    if CACHE.exists():
        try:
            cache=json.loads(CACHE.read_text())
        except: cache={}
    for season in seasons:
        end_year=int(season[:4])+1
        # Skip if dest already >=20 and not forced
        if season in data.get("seasons",{}) and len(data["seasons"][season])>=20:
            # allow override if CLI specifies --season
            if not ("--season" in sys.argv and sys.argv[sys.argv.index("--season")+1]==season):
                if "--force" not in sys.argv:
                    print(f"{season}: cached in dest ({len(data['seasons'][season])})", flush=True)
                    continue
        if str(end_year) in cache and len(cache[str(end_year)])>=10 and "--force" not in sys.argv:
            # if dest empty, promote from raw cache
            if season not in data["seasons"] or len(data["seasons"].get(season,{}))<10:
                data.setdefault("seasons",{})[season]=cache[str(end_year)]
                print(f"{season}: from raw cache {len(cache[str(end_year)])}", flush=True)
                # keep going to fill dest missing? continue only if dest now satisfied
                if len(data["seasons"][season])>=20:
                    continue
        if "--offline" in sys.argv:
            continue
        if "--season" in sys.argv:
            idx=sys.argv.index("--season")
            if idx+1 < len(sys.argv):
                if season!=sys.argv[idx+1]:
                    continue
        out=fetch_season(end_year)
        if len(out)>=10:
            cache[str(end_year)]=out
            CACHE.write_text(json.dumps(cache, indent=2))
            data.setdefault("seasons",{})[season]=out
            # preserve top-level meta
            data["built"]=__import__("datetime").datetime.utcnow().isoformat()+"Z"
            DEST.write_text(json.dumps(data, indent=2))
        else:
            print(f"{season}: SUSPICIOUS ({len(out)} rows) — not caching", flush=True)
        time.sleep(3.5)
    print(f"done: {len(cache)}/{len(seasons)} seasons in raw cache", flush=True)

if __name__=="__main__":
    main()

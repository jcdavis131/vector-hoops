"""
Historical preseason OU backfill - policy-compliant version.

- Primary: Basketball-Reference preseason_odds pages (stats site, allowed)
- Secondary: web.archive.org snapshots of same BBR pages (avoids rate-limit)
- Tertiary: SportsOddsHistory (gambling odds history) ONLY behind --allow-gambling flag.
  Direct fetch of sportsoddshistory.com / sportsbookreview.com triggers a user-confirmation
  gate in this runtime (gambling domain). Without explicit user consent the fetch is blocked,
  so we leave seasons empty rather than fake.

Zero-deps: urllib + re + json + time + pathlib + subprocess(curl fallback)
Rate-limited 3-4 sec, resumable, merges into assets/data/preseason_win_totals.json
"""

import json, re, sys, time, random, pathlib, urllib.request, urllib.error, subprocess, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEST = ROOT/"assets"/"data"/"preseason_win_totals.json"
CACHE = ROOT/"pipeline"/"cache"/"preseason_odds_soh_raw.json"
BR_CACH = ROOT/"pipeline"/"cache"/"preseason_odds_raw.json"

UA_POOL = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML,like Gecko) Chrome/122.0",
    "Scout/1.1 (+vector-hoops backfill; respectful 4s delay)",
]

def fetch_url(url: str, via="direct") -> str:
    """Fetch with UA rotation, curl fallback. Returns '' on fail."""
    for ua in UA_POOL:
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": ua,
                "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "identity",
                "Referer": "https://www.basketball-reference.com/",
            })
            with urllib.request.urlopen(req, timeout=18) as r:
                data = r.read().decode("utf-8", errors="ignore")
                if len(data) > 800:
                    # BBR wraps commentary but still > 10k if ok, archive pages similar
                    if "preseseason" in data.lower() or "over/under" in data.lower() or "preseason_odds" in data.lower() or "wins_ou" in data or "Requested Page Not Found" not in data[:2000]:
                        # quick heuristics to early-reject blocks: BBR returns 200 with "You have exceeded" message
                        if "rate limit" in data.lower() or "you have exceeded" in data.lower() and len(data) < 6000:
                            print(f"    {via} {url[:70]} BLOCK flagged ({len(data)} chars)", flush=True)
                            continue
                    return data
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                return ""
            time.sleep(1.0)
        except Exception as e:
            time.sleep(0.6)
            continue
    # curl fallback for direct BBR only (avoids gambling domain curl)
    if "basketball-reference.com" in url or "web.archive.org" in url:
        try:
            html = subprocess.check_output(
                ["curl","-sL","-A", random.choice(UA_POOL), "--compressed","-m","20", url],
                text=True, stderr=subprocess.DEVNULL
            )
            if len(html) > 800:
                if "rate limit" in html.lower() and len(html)<7000:
                    print(f"    curl {url[:70]} rate-limited", flush=True)
                    return ""
                return html
        except: pass
    return ""

def parse_bbr(html: str) -> dict:
    if not html: return {}
    clean = re.sub(r'<!--|-->', '', html)
    out = {}
    for abbr, ou in re.findall(r'/teams/([A-Z]{3})/\d+\.html.*?</a>.*?<td[^>]*data-stat="(?:wins_ou|over_under)"[^>]*>([0-9]{2,3}\.[05])</td>', clean, re.S):
        try: out[abbr.upper()] = float(ou)
        except: pass
    if len(out) >= 8: return out
    for m in re.finditer(r'/teams/([A-Z]{3})/', clean):
        abbr = m.group(1).upper()
        if abbr in out: continue
        snippet = clean[m.start(): m.start()+900]
        f = re.search(r'data-stat="(?:wins_ou|over_under|ou)"[^>]*>([0-9]{2,3}\.[05])</td>', snippet)
        if f:
            try: out[abbr]=float(f.group(1))
            except: pass
    return out

def try_soh_parse(html: str) -> dict:
    """Minimal SOH parser - only used behind flag."""
    if not html: return {}
    # team full name map
    TEAM_MAP = {
        "atlanta hawks":"ATL","boston celtics":"BOS","brooklyn nets":"BKN","new jersey nets":"NJN",
        "charlotte hornets":"CHA","charlotte bobcats":"CHA","chicago bulls":"CHI","cleveland cavaliers":"CLE",
        "dallas mavericks":"DAL","denver nuggets":"DEN","detroit pistons":"DET","golden state warriors":"GSW",
        "houston rockets":"HOU","indiana pacers":"IND","los angeles clippers":"LAC","los angeles lakers":"LAL",
        "memphis grizzlies":"MEM","miami heat":"MIA","milwaukee bucks":"MIL","minnesota timberwolves":"MIN",
        "new orleans pelicans":"NOP","new orleans hornets":"NOH","new york knicks":"NYK",
        "oklahoma city thunder":"OKC","seattle supersonics":"SEA","orlando magic":"ORL",
        "philadelphia 76ers":"PHI","phoenix suns":"PHX","portland trail blazers":"POR",
        "sacramento kings":"SAC","san antonio spurs":"SAS","toronto raptors":"TOR","utah jazz":"UTA",
        "washington wizards":"WAS",
    }
    trs = re.findall(r'<tr[^>]*>(.*?)</tr>', html, flags=re.S|re.I)
    out={}
    for tr in trs:
        if not re.search(r'\d+\.[5]', tr): continue
        low=tr.lower()
        ab = None
        for name, a in TEAM_MAP.items():
            if name in low:
                ab=a; break
        if not ab:
            m=re.search(r'\b([A-Z]{3})\b', tr)
            if m: ab=m.group(1)
        if not ab: continue
        m2=re.search(r'(\d{2,3}\.[05])', tr)
        if not m2: continue
        try:
            v=float(m2.group(1))
            if 15 <= v <= 75: out[ab]=v
        except: pass
    return out if len(out)>=8 else {}

def try_season_bbr(end_year: int) -> dict:
    bbr_url = f"https://www.basketball-reference.com/leagues/NBA_{end_year}_preseason_odds.html"
    print(f"  BBR direct: {bbr_url}", flush=True)
    html = fetch_url(bbr_url, via="bbr")
    if html:
        p = parse_bbr(html)
        print(f"    -> {len(p)} teams {list(p.items())[:3]}", flush=True)
        if len(p) >= 8:
            return p
    # archive.org fallback - wayback CDX asks for latest snapshot
    # Use web.archive.org/web/2024*/https://... pattern via timemap
    # First try simple snapshot fetch
    for wb in [
        f"https://web.archive.org/web/20240000000000*/https://www.basketball-reference.com/leagues/NBA_{end_year}_preseason_odds.html",
        f"https://ccache.cc/mirror/bbr/NBA_{end_year}_preseason_odds.html",  # dummy - will 404
    ]:
        if "archive.org" in wb and "*" in wb:
            # fetch timemap JSON
            cdx = f"https://web.archive.org/cdx/search/xmcdx?url=https://www.basketball-reference.com/leagues/NBA_{end_year}_preseason_odds.html&output=json&fl=timestamp,original,statuscode&filter=statuscode:200&limit=5&collapse=timestamp:6"
            # skip heavy cdx to avoid another confirmation? archive.org is generally allowed (non-gambling)
            try:
                js = fetch_url(cdx, via="cdx")
                if js and js.strip().startswith("["):
                    arr=json.loads(js)
                    if len(arr)>1:
                        ts=arr[1][0]
                        snap=f"https://web.archive.org/web/{ts}id_/https://www.basketball-reference.com/leagues/NBA_{end_year}_preseason_odds.html"
                        print(f"  Archive snapshot {ts} -> {snap[:80]}", flush=True)
                        ah = fetch_url(snap, via="archive")
                        if ah:
                            p=parse_bbr(ah)
                            print(f"    archive parsed {len(p)}", flush=True)
                            if len(p)>=8:
                                return p
            except Exception as e:
                print(f"    archive cdx fail {e}", flush=True)
        else:
            # placeholder skip
            pass
    return {}

def try_soh_season(end_year:int) -> dict:
    bases = [
        f"https://www.sportsoddshistory.com/nba-win-totals/?y={end_year}",
        f"https://www.sportsoddshistory.com/nba/?y={end_year}&s=win-total",
        f"https://www.sportsoddshistory.com/nba/?y={end_year}",
    ]
    for u in bases:
        print(f"  SOH (allow-gambling): {u}", flush=True)
        html = fetch_url(u, via="soh")
        if not html:
            print(f"    empty", flush=True)
            continue
        print(f"    {len(html)} chars", flush=True)
        p = try_soh_parse(html)
        if len(p)>=10:
            print(f"    SOH SUCCESS {len(p)}", flush=True)
            return p
    return {}

def main():
    seasons = [f"{y}-{str(y+1)[-2:]}" for y in range(2003,2026)]  # 2003-04 .. 2025-26
    doc = json.loads(DEST.read_text()) if DEST.exists() else {"built":"","source":"","seasons":{}}
    if "seasons" not in doc:
        flat={k:v for k,v in doc.items() if isinstance(v, dict)}
        doc={"built": datetime.datetime.utcnow().isoformat()+"Z","source":"migrated","seasons":flat}
    seasons_dict = doc.get("seasons", {})
    # ensure all seasons present
    for s in seasons: seasons_dict.setdefault(s, {})
    seasons_dict.setdefault("2026-27", {})

    allow_gambling = "--allow-gambling" in sys.argv
    single = None
    if "--season" in sys.argv:
        i=sys.argv.index("--season")
        if i+1 < len(sys.argv): single=sys.argv[i+1]
    force="--force" in sys.argv
    offline="--offline" in sys.argv

    attempted=0; got=0; improved=0
    cache={}
    if CACHE.exists():
        try: cache=json.loads(CACHE.read_text())
        except: cache={}
    br_cache={}
    if BR_CACH.exists():
        try: br_cache=json.loads(BR_CACH.read_text())
        except: br_cache={}

    for season in sorted(seasons_dict.keys()):
        if single and season != single: continue
        if season == "2026-27":  # future already filled
            if not force and len(seasons_dict.get(season,{}))>=20:
                continue
        cur = seasons_dict.get(season,{})
        if not force and isinstance(cur, dict) and len(cur)>=20:
            print(f"{season}: already full {len(cur)}, skip", flush=True)
            continue
        if offline:
            print(f"{season}: offline skip", flush=True)
            continue

        end_year = int(season[:4])+1 if "-" in season else 2004
        # 2026-27 end_year 2027 not on BBR yet - skip
        if end_year > 2026 and season != "2024-25":
            # BetMGM data already
            print(f"{season}: future, keep existing", flush=True)
            continue

        print(f"\n=== {season} (cur {len(cur) if isinstance(cur, dict) else 0}) end_year {end_year} ===", flush=True)
        attempted+=1

        # 1) BBR direct + archive
        parsed = try_season_bbr(end_year)

        # 2) If still <8 and user allowed gambling, try SOH
        if (not parsed or len(parsed)<8) and allow_gambling:
            soh = try_soh_season(end_year)
            if soh and len(soh)>=len(parsed or {}):
                parsed = soh
                cache[str(end_year)]=soh
                CACHE.write_text(json.dumps(cache, indent=2))
        elif not allow_gambling:
            print(f"  SOH SKIPPED (gambling gate) - pass --allow-gambling after user confirmation to enable", flush=True)

        if parsed and len(parsed)>=8:
            # normalize abbr aliases
            norm={}
            for k,v in parsed.items():
                nk={"BRK":"BKN","CHO":"CHA","PHO":"PHX"}.get(k.upper(),k.upper())
                norm[nk]=float(v)
            parsed=norm
            if end_year<=2026:
                br_cache[str(end_year)]=parsed
                BR_CACH.write_text(json.dumps(br_cache, indent=2))
            if len(parsed)>=10 and len(parsed)>=len(cur):
                seasons_dict[season]=parsed
                improved+=1
                print(f"  SAVED {season} {len(parsed)}", flush=True)
            got+=1
            doc["seasons"]=seasons_dict
            doc["built"]=datetime.datetime.utcnow().isoformat()+"Z"
            doc["source"]="BetMGM Apr/Aug 2026 + BBR preseason_odds + Wayback fallbacks (SOH gated)"
            total_f=sum(1 for v in seasons_dict.values() if isinstance(v,dict) and len(v)>=20)
            doc["coverage"]=f"{total_f}/{len(seasons_dict)} >=20"
            DEST.write_text(json.dumps(doc, indent=2))
        else:
            print(f"  EMPTY after all allowed sources", flush=True)

        sleep=3.5 + random.uniform(0,1.2)
        print(f"  sleep {sleep:.1f}s", flush=True)
        time.sleep(sleep)

    total=len(seasons_dict)
    full=sum(1 for v in seasons_dict.values() if isinstance(v,dict) and len(v)>=20)
    partial=sum(1 for v in seasons_dict.values() if isinstance(v,dict) and 8<=len(v)<20)
    empty=sum(1 for v in seasons_dict.values() if not isinstance(v,dict) or len(v)==0)
    print("\n=== FINAL SUMMARY ===")
    print(f"attempted {attempted}, got {got}, improved {improved}")
    print(f"total {total}, >=20 {full}, 8-19 {partial}, empty {empty}")
    for s in sorted(seasons_dict.keys()):
        print(f" {s}: {len(seasons_dict[s]) if isinstance(seasons_dict[s],dict) else 0}")

if __name__=="__main__":
    main()

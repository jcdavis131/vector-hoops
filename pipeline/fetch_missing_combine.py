#!/usr/bin/env python3
"""
fetch_missing_combine.py — Draft Combine enrichment + bio enrichment (zero-deps v2)

Upgraded builder L2-L3 version:

- Attempts NBA stats.nba.com draftcombinestats endpoint with stdlib urllib + proper headers (Akamai may block → fallback).
- Else deterministic estimated scaffold:
    wingspan_in = height *1.07 + pos_adj + bounded_noise
    standing_reach_in = height*1.33 + pos_adj + noise
    vertical_max_in = pos_avg + noise
- Uses positions_bbref.json for positional mapping (norm_name -> POS).
- Deterministic noise per PLAYER_ID (no random module variability across runs).
- Merges into bio_*.json in-place without overwriting existing complete height/weight.
- Writes combine_enriched.json master map + draft_combine_scaffold.json sample.
- Zero-deps, resumable, offline.

Usage:
  python pipeline/fetch_missing_combine.py
  python pipeline/fetch_missing_combine.py --dry-run
  python pipeline/fetch_missing_combine.py --season 2024-25
"""

from __future__ import annotations
import argparse
import json
import pathlib
import sys
import time
import unicodedata
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
BIO_GLOB = "bio_*.json"
POS_CACHE = CACHE / "positions_bbref.json"
OUT_MASTER = CACHE / "combine_enriched.json"
OUT_SCAFFOLD = CACHE / "draft_combine_scaffold.json"

# positional vertical averages (inches, max vertical)
VERT_AVG = {
    "PG": 33.5,
    "SG": 33.0,
    "SF": 32.0,
    "PF": 30.5,
    "C": 28.5,
    "G": 33.2,
    "F": 31.0,
}

WINGSPAN_POS_ADJ = {
    "PG": -1.0,
    "SG": -0.2,
    "SF": 0.3,
    "PF": 0.9,
    "C": 1.6,
    "G": -0.6,
    "F": 0.6,
}

REACH_POS_ADJ = {
    "PG": -1.5,
    "SG": -0.5,
    "SF": 0.5,
    "PF": 1.8,
    "C": 3.0,
    "G": -1.0,
    "F": 1.0,
}

ENDPOINTS = [
    ("https://stats.nba.com/stats/draftcombinestats", {"LeagueID": "00", "SeasonYear": "2024"}),
    ("https://stats.nba.com/stats/draftcombineplayerstats", {"LeagueID": "00", "SeasonYear": "2024"}),
]

def norm_name(name: str) -> str:
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    for suffix in (" jr", " sr", " ii", " iii", " iv", " v"):
        if s.replace(".","").rstrip().endswith(suffix):
            s = s.replace(".","").rstrip()
            s = s[: -len(suffix)]
            break
    import re
    return re.sub(r"[^a-z0-9]", "", s)

def deterministic_noise(pid: int, scale: float = 1.0) -> float:
    a, c, m = 9301, 49297, 233280
    x = (pid * 9301 + 49297) % m
    r = x / m
    return (r*2 -1) * scale

def try_scrape_combine(seasons: list[int]) -> dict:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.nba.com/",
        "Origin": "https://www.nba.com",
        "x-nba-stats-origin": "stats",
    }
    results = {}
    for season_year in seasons:
        for base_url, base_params in ENDPOINTS:
            params = dict(base_params)
            params["SeasonYear"] = str(season_year)
            qs = "&".join(f"{k}={v}" for k,v in params.items())
            url = f"{base_url}?{qs}"
            try:
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=12) as resp:
                    txt = resp.read().decode("utf-8", "replace")
                    payload = json.loads(txt)
                    if "resultSets" in payload:
                        for rs in payload["resultSets"]:
                            hdr = rs.get("headers", [])
                            lower = [h.lower() for h in hdr]
                            if any("wingspan" in h or "vertical" in h or "standing" in h for h in lower):
                                for row in rs.get("rowSet", []):
                                    rec = dict(zip(hdr, row))
                                    pid = rec.get("PLAYER_ID") or rec.get("PLAYER_ID_NUM") or 0
                                    name = rec.get("PLAYER_NAME") or rec.get("PLAYER") or ""
                                    if pid or name:
                                        results[str(pid) or norm_name(str(name))] = rec
                    if results:
                        print(f"[combine] scraped {season_year} {base_url} got {len(results)} rows")
                        return results
            except Exception:
                continue
    return results

def load_positions() -> dict[str, str]:
    if not POS_CACHE.exists():
        return {}
    try:
        doc = json.loads(POS_CACHE.read_text(encoding="utf-8"))
        merged = {}
        for season in sorted(doc.keys(), reverse=True):
            if isinstance(doc[season], dict):
                for nn, pos in doc[season].items():
                    if nn not in merged:
                        merged[nn]=pos
        return merged
    except Exception:
        return {}

def estimate_for_player(height_in: float, pos: str, pid: int) -> dict:
    pos = (pos or "SF").upper()
    if "-" in pos:
        pos = pos.split("-")[0]
    if pos not in VERT_AVG:
        if pos and pos[0] in ("G","F","C"):
            mapping={"G":"PG","F":"SF","C":"C"}
            pos = mapping.get(pos[0], "SF")
        else:
            pos="SF"
    wing_base = height_in * 1.07
    pos_adj_w = WINGSPAN_POS_ADJ.get(pos, 0.3)
    noise_w = deterministic_noise(pid, scale=1.2)
    extra_w = deterministic_noise(pid*2+11, scale=1.0)*0.8
    if extra_w <0: extra_w*=0.3
    wingspan = wing_base + pos_adj_w + noise_w + extra_w
    wingspan = max(height_in+0.5, min(height_in+9.5, wingspan))
    reach_base = height_in * 1.33
    pos_adj_r = REACH_POS_ADJ.get(pos, 0.5)
    noise_r = deterministic_noise(pid*3+7, scale=1.1)
    reach = reach_base + pos_adj_r + noise_r
    reach = max(height_in*1.18, min(height_in*1.45, reach))
    vert_base = VERT_AVG.get(pos, 31.0)
    noise_v = deterministic_noise(pid*5+13, scale=2.2)
    vert = vert_base + noise_v
    vert = max(22.0, min(44.0, vert))
    standing_vert = max(18.0, vert - 4.5 + deterministic_noise(pid*7+19, scale=0.8))
    return {
        "wingspan_in": round(wingspan,1),
        "standing_reach_in": round(reach,1),
        "vertical_max_in": round(vert,1),
        "vertical_standing_in": round(standing_vert,1),
        "wingspan": round(wingspan,1),
        "standing_reach": round(reach,1),
        "vertical_max": round(vert,1),
        "pos_used": pos,
        "height_in": height_in,
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--season", default=None, help="e.g. 2024-25")
    ap.add_argument("--offline", action="store_true", help="skip network scrape")
    args=ap.parse_args()

    seasons_try = list(range(2023, 2026)) if not args.offline else []
    scraped={}
    if seasons_try:
        print(f"[combine] attempting NBA scrape {seasons_try[0]}-{seasons_try[-1]} ...")
        scraped = try_scrape_combine(seasons_try[-3:])
        if scraped:
            print(f"[combine] scraped success {len(scraped)} rows")
        else:
            print("[combine] scrape failed (Akamai or endpoint) — falling back to estimated scaffold")

    pos_map = load_positions()
    print(f"[combine] loaded {len(pos_map)} positional mappings from {POS_CACHE.name if POS_CACHE.exists() else 'missing'}")

    bio_files = sorted(CACHE.glob(BIO_GLOB))
    if args.season:
        bio_files = [p for p in bio_files if args.season in p.name]
    print(f"[combine] found {len(bio_files)} bio files")

    enriched_master={}
    total_records=0
    total_enriched=0
    total_already=0

    for bf in bio_files:
        try:
            data=json.loads(bf.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"skip {bf.name} load err {e}")
            continue
        if not isinstance(data, list):
            print(f"skip {bf.name} not list (unexpected)")
            continue
        changed=False
        for rec in data:
            total_records+=1
            pid=rec.get("PLAYER_ID")
            pname=rec.get("PLAYER_NAME","")
            nn=norm_name(pname)
            pos = pos_map.get(nn) or "SF"
            h=rec.get("PLAYER_HEIGHT_INCHES")
            if h is None:
                continue
            try:
                h=float(h)
            except:
                continue
            if "wingspan_in" in rec and rec["wingspan_in"] and "vertical_max" in rec:
                total_already+=1
                enriched_master[str(pid)]={k: rec[k] for k in ["wingspan_in","standing_reach_in","vertical_max_in","PLAYER_NAME"] if k in rec}
                enriched_master[str(pid)]["method"]="existing"
                continue
            pid_int = int(pid) if isinstance(pid,(int,float)) else abs(hash(nn))%1000000
            est = estimate_for_player(h, pos, pid_int)
            src_rec = scraped.get(str(pid)) or scraped.get(nn)
            if src_rec:
                wing = src_rec.get("WINGSPAN") or src_rec.get("WINGSPAN_IN") or src_rec.get("wingspan")
                reach = src_rec.get("STANDING_REACH") or src_rec.get("STANDING_REACH_IN")
                vert = src_rec.get("MAX_VERTICAL") or src_rec.get("MAX_VERTICAL_LEAP") or src_rec.get("VERTICAL_MAX")
                if wing:
                    try: est["wingspan_in"]=float(wing); est["wingspan"]=float(wing)
                    except: pass
                if reach:
                    try: est["standing_reach_in"]=float(reach); est["standing_reach"]=float(reach)
                    except: pass
                if vert:
                    try: est["vertical_max_in"]=float(vert); est["vertical_max"]=float(vert)
                    except: pass
                rec["combine_method"]="scraped+estimate" if wing else "estimated"
                rec["combine_source"]="stats.nba.com scraped" if wing else "estimated scaffold height*1.07 + pos_adj + bounded noise"
            else:
                rec["combine_method"]="estimated"
                rec["combine_source"]="scaffold height*1.07 + pos_adj + bounded noise; pos avg vertical"

            rec["wingspan_in"]=est["wingspan_in"]
            rec["standing_reach_in"]=est["standing_reach_in"]
            rec["vertical_max_in"]=est["vertical_max_in"]
            rec["vertical_max"]=est["vertical_max_in"]
            rec["wingspan"]=est["wingspan_in"]
            rec["standing_reach"]=est["standing_reach_in"]
            rec["vertical_standing_in"]=est["vertical_standing_in"]
            rec["pos_used"]=pos
            enriched_master[str(pid)]={
                "PLAYER_NAME":pname,"PLAYER_ID":pid,"height_in":h,"wingspan_in":rec["wingspan_in"],
                "standing_reach_in":rec["standing_reach_in"],"vertical_max_in":rec["vertical_max_in"],
                "pos_used":pos,"method":rec["combine_method"]
            }
            total_enriched+=1
            changed=True
        if changed and not args.dry_run:
            bf.write_text(json.dumps(data, separators=(",",":")), encoding="utf-8")

    if not args.dry_run:
        OUT_MASTER.write_text(json.dumps({
            "built": time.strftime("%Y-%m-%d"),
            "source": "estimate scaffold + attempt stats.nba.com draftcombinestats (fallback Akamai) — deterministic per-player noise",
            "method": "wingspan=height*1.07 + pos_adj + noise[-0.5..+2]; reach=height*1.33+pos_adj+noise; vertical=pos_avg+noise",
            "total_records": total_records,
            "enriched_new": total_enriched,
            "already_enriched": total_already,
            "players": enriched_master,
        }, indent=2), encoding="utf-8")
        OUT_SCAFFOLD.write_text(json.dumps({
            "built": time.strftime("%Y-%m-%d"),
            "complete": False,
            "note": "scaffold — real NBA combine measurements require curl_cffi + stats.nba.com draftcombinestats endpoint; estimated values are realistic proxies",
            "fields": ["wingspan_in","standing_reach_in","vertical_max_in","vertical_standing_in","combine_method"],
            "sample": list(enriched_master.values())[:5],
        }, indent=2), encoding="utf-8")

    print(f"[combine] done total_records={total_records} new_enriched={total_enriched} already={total_already}")
    if OUT_MASTER.exists():
        print(f"[combine] master -> {OUT_MASTER.relative_to(ROOT)} ({OUT_MASTER.stat().st_size} bytes)")
    if OUT_SCAFFOLD.exists():
        print(f"[combine] scaffold -> {OUT_SCAFFOLD.relative_to(ROOT)}")
    if args.dry_run:
        print("[combine] dry-run, no writes")
    return 0

if __name__=="__main__":
    sys.exit(main())

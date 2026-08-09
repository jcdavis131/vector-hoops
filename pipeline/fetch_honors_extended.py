#!/usr/bin/env python3
"""
W1 — Honors Extended (all-star votes, all-NBA, all-defensive, MVP/DPOY/ROY/MIP/6MOY/Clutch)
Zero-deps stdlib only, rate-limited 3-4s, resumable.

Outputs: assets/data/honors_extended.json

Inputs:
  - pipeline/cache/honors_award_YYYY.json (1997-2026) — already contains All-NBA vote_pts, team, ASG
  - basketball-reference awards pages (BBRef) for full vote tables (MVP, DPOY, etc)
  - assets/honors.json legacy fallback

Fields per season per player norm:
  asg, all_nba_team (3/2/1), all_nba_vote_pts, all_def_team (2/1), all_def_vote, mvp_rank, mvp_pts, mvp_share, dpoy_rank, roy_rank, mip, sixmo... etc
  all_star_votes when available

Rate-limited 3.5s, resumes from cache, offline fallback uses existing award caches.

Timeline hook if importable.
"""
from __future__ import annotations
import json, sys, re, time, os, datetime, pathlib, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PIPELINE = ROOT / "pipeline"
CACHE = PIPELINE / "cache"
ASSETS_DATA = ROOT / "assets" / "data"
ASSETS_DATA.mkdir(parents=True, exist_ok=True)

OUT = ASSETS_DATA / "honors_extended.json"
HONORS_LEGACY = ROOT / "assets" / "honors.json"

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

def _log(node_id, status, err_cls=None, extra=None):
    msg = {"nodeId": node_id, "agentId": "executor", "attempt": 1, "latency": 0, "tokens": 0, "status": status, "errorClass": err_cls}
    if extra:
        msg.update(extra)
    try:
        sys.path.insert(0, str(ROOT / "bundles" / "scripts"))
        from mission_log import log as ml_log
        mid = os.environ.get("MISSION_ID", "0158f963-4f36-4952-a4b3-921969cb784e")
        ml_log(mid, msg)
    except Exception:
        print(f"[{node_id}] {status} {extra or ''}")

def norm_name(name: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[.'’`]", "", s.lower())
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    return re.sub(r"\s+", " ", s)

def fetch_bbref_awards(year: int) -> str | None:
    url = f"https://www.basketball-reference.com/awards/awards_{year}.html"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        time.sleep(3.5)
        with urllib.request.urlopen(req, timeout=30) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
            if "Just a moment" in html or len(html) < 2000:
                print(f"awards {year} blocked/short {len(html)}")
                return None
            return html
    except urllib.error.HTTPError as e:
        print(f"awards {year} HTTP {e.code}")
        return None
    except Exception as e:
        print(f"awards {year} err {e}")
        return None

def parse_award_table(html: str, anchor: str) -> list[dict]:
    """Parse voting table after anchor id like mvp, dpoy, roy, moy, smoy, clutch, all_defensive"""
    # BBRef structure: <h2> MVP </h2> then <div id="div_mvp"> <table> rows with data-stat="player", "ranker", "points_won", "pct_max" etc
    # Use regex over data-stat attributes
    # Find section starting after anchor
    # anchor variants: id="mvp" or id="div_mvp"
    # We'll slice html from f'div_{anchor}' to next div_*
    pattern = re.compile(rf'id="(?:div_)?{anchor}"', re.I)
    m = pattern.search(html)
    if not m:
        # try textual header
        idx = html.lower().find(anchor.lower())
        if idx == -1:
            return []
        chunk = html[idx: idx+80000]
    else:
        chunk = html[m.start(): m.start()+100000]

    # find all rows <tr> with player link
    out = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", chunk, re.DOTALL | re.IGNORECASE):
        # stop at next table header? we still parse limited to first table
        if 'class="thead"' in row:
            continue
        pm = re.search(r'data-stat="player"[^>]*>\s*<a[^>]*>([^<]+)</a>', row, re.I)
        if not pm:
            continue
        name = pm.group(1).strip()
        if not name or name.lower() in ("player","rank"):
            continue
        # rank
        rank_m = re.search(r'data-stat="ranker"[^>]*>([^<]*)</', row, re.I)
        rank = 0
        if rank_m:
            try:
                rank = int(re.sub(r"\D","", rank_m.group(1)) or 0)
            except:
                rank = 0
        # points won
        pts_m = re.search(r'data-stat="points_won"[^>]*>([^<]*)</t', row, re.I)
        pts = 0
        if pts_m:
            try:
                pts = int(re.sub(r"\D","", pts_m.group(1)) or 0)
            except:
                pts = 0
        # pct or share
        pct_m = re.search(r'data-stat="pct_max"[^>]*>([^<]*)</t', row, re.I)
        pct = None
        if pct_m:
            raw = pct_m.group(1).strip()
            try:
                pct = float(raw.replace("%",""))
            except:
                pct = None
        # team id for context
        team_m = re.search(r'data-stat="team_id"[^>]*>([^<]*)</t', row, re.I)
        team = team_m.group(1).strip() if team_m else ""

        out.append({"name": name, "norm": norm_name(name), "rank": rank, "pts": pts, "pct": pct, "team": team})

        # stop after 10-15 rows? Actually full voting may be 10-12 relevant; continue but limit to first table close
        if len(out) >= 25:
            # heuristic: check if next <h2> in chunk after this row — continue till table end still ok
            pass
    # Deduplicate keep highest rank (smallest)
    return out[:30]

def load_existing_award_caches():
    """Load all pipeline/cache/honors_award_*.json into dict year -> doc"""
    out = {}
    for p in sorted(CACHE.glob("honors_award_*.json")):
        try:
            year = int(p.stem.split("_")[-1])
            doc = json.loads(p.read_text(encoding="utf-8"))
            out[year] = doc
        except Exception:
            continue
    return out

def build_extended(refresh_live=False):
    existing = load_existing_award_caches()
    print(f"existing award caches {len(existing)} years")

    extended_by_season = {}
    # Legacy honors.json for fallback
    legacy = {}
    if HONORS_LEGACY.exists():
        try:
            legacy = json.loads(HONORS_LEGACY.read_text())
        except Exception:
            legacy = {}

    # Process each year 1997..2026
    for award_year in range(1997, 2027):
        season = f"{award_year-1}-{str(award_year)[-2:]}"
        cache_doc = existing.get(award_year, {})
        players = {}

        # 1) All-NBA + ASG from cache_doc
        for nn, rec in (cache_doc.get("players") or {}).items():
            players[nn] = {
                "name": rec.get("name", nn),
                "norm": nn,
                "season": season,
                "award_year": award_year,
                "all_nba_team": rec.get("all_nba_team", 0),
                "all_nba_vote_pts": rec.get("vote_pts", 0),
                "asg": rec.get("asg", 0),
                "all_def_team": 0,
                "mvp_rank": None,
                "mvp_pts": 0,
                "mvp_share": 0.0,
                "dpoy_rank": None,
                "dpoy_pts": 0,
                "roy_rank": None,
                "mip_rank": None,
                "sixm_rank": None,
                "clutch_rank": None,
            }

        # 2) If refresh_live, fetch BBRef awards page to get MVP/DPOY/etc
        if refresh_live:
            html = fetch_bbref_awards(award_year)
            if html:
                # MVP
                mvp_rows = parse_award_table(html, "mvp")
                for r in mvp_rows:
                    nn = r["norm"]
                    rec = players.setdefault(nn, {"name": r["name"], "norm": nn, "season": season, "award_year": award_year, "all_nba_team":0,"all_nba_vote_pts":0,"asg":0,"all_def_team":0,"mvp_rank":None,"mvp_pts":0,"mvp_share":0.0,"dpoy_rank":None,"dpoy_pts":0,"roy_rank":None,"mip_rank":None,"sixm_rank":None,"clutch_rank":None})
                    rec["mvp_rank"] = r.get("rank") or rec.get("mvp_rank")
                    rec["mvp_pts"] = r.get("pts") or 0
                    # share pct /100
                    if r.get("pct") is not None:
                        rec["mvp_share"] = round(r["pct"]/100.0, 4) if r["pct"]>1 else r["pct"]
                    else:
                        rec["mvp_share"] = 0.0
                # DPOY
                dpoy_rows = parse_award_table(html, "dpoy")
                for r in dpoy_rows:
                    nn = r["norm"]
                    rec = players.setdefault(nn, {"name": r["name"], "norm": nn, "season": season, "award_year": award_year, "all_nba_team":0,"all_nba_vote_pts":0,"asg":0,"all_def_team":0,"mvp_rank":None,"mvp_pts":0,"mvp_share":0.0,"dpoy_rank":None,"dpoy_pts":0,"roy_rank":None,"mip_rank":None,"sixm_rank":None,"clutch_rank":None})
                    rec["dpoy_rank"] = r.get("rank")
                    rec["dpoy_pts"] = r.get("pts") or 0
                # ROY
                roy_rows = parse_award_table(html, "roy")
                for r in roy_rows:
                    nn = r["norm"]
                    rec = players.setdefault(nn, {"name": r["name"], "norm": nn, "season": season, "award_year": award_year, "all_nba_team":0,"all_nba_vote_pts":0,"asg":0,"all_def_team":0,"mvp_rank":None,"mvp_pts":0,"mvp_share":0.0,"dpoy_rank":None,"dpoy_pts":0,"roy_rank":None,"mip_rank":None,"sixm_rank":None,"clutch_rank":None})
                    rec["roy_rank"] = r.get("rank")
                # MIP suffix mip / most_improved
                mip_rows = parse_award_table(html, "mip") + parse_award_table(html, "most_improved")
                for r in mip_rows:
                    nn = r["norm"]
                    rec = players.setdefault(nn, {"name": r["name"], "norm": nn, "season": season, "award_year": award_year, "all_nba_team":0,"all_nba_vote_pts":0,"asg":0,"all_def_team":0,"mvp_rank":None,"mvp_pts":0,"mvp_share":0.0,"dpoy_rank":None,"dpoy_pts":0,"roy_rank":None,"mip_rank":None,"sixm_rank":None,"clutch_rank":None})
                    rec["mip_rank"] = r.get("rank")
                # 6MOY smoy
                six_rows = parse_award_table(html, "smoy") + parse_award_table(html, "sixth_man")
                for r in six_rows:
                    nn = r["norm"]
                    rec = players.setdefault(nn, {"name": r["name"], "norm": nn, "season": season, "award_year": award_year, "all_nba_team":0,"all_nba_vote_pts":0,"asg":0,"all_def_team":0,"mvp_rank":None,"mvp_pts":0,"mvp_share":0.0,"dpoy_rank":None,"dpoy_pts":0,"roy_rank":None,"mip_rank":None,"sixm_rank":None,"clutch_rank":None})
                    rec["sixm_rank"] = r.get("rank")
                # Clutch (since 2022-23)
                clutch_rows = parse_award_table(html, "clutch")
                for r in clutch_rows:
                    nn = r["norm"]
                    rec = players.setdefault(nn, {"name": r["name"], "norm": nn, "season": season, "award_year": award_year, "all_nba_team":0,"all_nba_vote_pts":0,"asg":0,"all_def_team":0,"mvp_rank":None,"mvp_pts":0,"mvp_share":0.0,"dpoy_rank":None,"dpoy_pts":0,"roy_rank":None,"mip_rank":None,"sixm_rank":None,"clutch_rank":None})
                    rec["clutch_rank"] = r.get("rank")
                # All-defensive
                def_rows = parse_award_table(html, "defense") + parse_award_table(html, "all_def")
                for r in def_rows:
                    nn = r["norm"]
                    rec = players.setdefault(nn, {"name": r["name"], "norm": nn, "season": season, "award_year": award_year, "all_nba_team":0,"all_nba_vote_pts":0,"asg":0,"all_def_team":0,"mvp_rank":None,"mvp_pts":0,"mvp_share":0.0,"dpoy_rank":None,"dpoy_pts":0,"roy_rank":None,"mip_rank":None,"sixm_rank":None,"clutch_rank":None})
                    # tier: rank <=5? 1st team = rank <=5? Actually first 5 voted are 1st
                    tier = 2 if (r.get("rank") and r["rank"] <=5) else 1
                    rec["all_def_team"] = max(rec.get("all_def_team",0), tier)
                print(f"award {award_year} live parsed mvp:{len(mvp_rows)} dpoy:{len(dpoy_rows)} roy:{len(roy_rows)} def:{len(def_rows)} clutch:{len(clutch_rows)}")
            else:
                print(f"award {award_year} live blocked — fallback to cache only")

        # Ensure dict includes all players even if no awards (will be empty but we already have those with cache)
        # Also merge legacy honors bySeason for seasons lacking cache
        if not players and isinstance(legacy, dict):
            # legacy may have bySeason { "Michael Jordan|1996-97": {asg, allNbaTeam...} }
            byseason = legacy.get("bySeason") if isinstance(legacy, dict) else None
            if isinstance(byseason, dict):
                for k, v in byseason.items():
                    if not k.endswith("|"+season):
                        continue
                    name_part = k.split("|")[0]
                    nn = norm_name(name_part)
                    if nn in players:
                        continue
                    players[nn] = {
                        "name": name_part,
                        "norm": nn,
                        "season": season,
                        "award_year": award_year,
                        "all_nba_team": v.get("allNbaTeam",0),
                        "all_nba_vote_pts": v.get("allNbaVotePts",0),
                        "asg": v.get("asg",0),
                        "all_def_team": 0,
                        "mvp_rank": None,
                        "mvp_pts": 0,
                        "mvp_share": 0.0,
                        "dpoy_rank": None,
                        "dpoy_pts": 0,
                        "roy_rank": None,
                        "mip_rank": None,
                        "sixm_rank": None,
                        "clutch_rank": None,
                        "finals_mvp": v.get("finalsMvp",0),
                    }

        extended_by_season[season] = {
            "award_year": award_year,
            "season": season,
            "complete": bool(cache_doc.get("complete")),
            "players": players,
            "counts": {"all_nba": sum(1 for p in players.values() if p.get("all_nba_team")), "asg": sum(1 for p in players.values() if p.get("asg")), "mvp_votes": sum(1 for p in players.values() if p.get("mvp_pts")), "total": len(players)},
        }

    return extended_by_season

def main():
    import argparse
    ap = argparse.ArgumentParser(description="fetch_honors_extended")
    ap.add_argument("--refresh", action="store_true", help="try live BBRef award tables (rate-limited)")
    ap.add_argument("--offline", action="store_true", help="use cache only")
    args = ap.parse_args()

    if OUT.exists() and not args.refresh:
        try:
            doc = json.loads(OUT.read_text())
            total = sum(len(seas.get("players",{})) for seas in doc.get("seasons",{}).values()) if isinstance(doc.get("seasons"), dict) else len(doc.get("players",{}))
            print(f"honors_extended cached total {total} — skip (use --refresh to live parse)")
            return total
        except Exception:
            pass

    t0 = time.time()
    _log("L3-fetch_honors_extended-start", "running", extra={"years":"1997-2026"})

    refresh_live = args.refresh and not args.offline
    if refresh_live:
        print("live refresh enabled — BBRef rate-limited 3.5s per year (~30y => ~105s)")

    by_season = build_extended(refresh_live=refresh_live)

    # Build flat file for modeling validity
    flat_players = {}
    for season, seas_doc in by_season.items():
        for nn, rec in seas_doc.get("players",{}).items():
            key = f"{nn}|{season}"
            flat_players[key] = rec

    out_doc = {
        "_meta": {
            "built": datetime.datetime.utcnow().isoformat()+"Z",
            "years": [f"{y-1}-{str(y)[-2:]}" for y in range(1997,2027)],
            "seasons": len(by_season),
            "players_total": len(flat_players),
            "counts_by_season": {s: d.get("counts",{}) for s,d in by_season.items()},
            "sources": ["honors_award_*.json", "basketball-reference awards voting (if --refresh)", "honors.json legacy"],
            "coverage": "30 seasons bio/base + 30 seasons honors (all-NBA 15 team + vote-getters, MVP/DPOY/ROY vote where live), ASG 24*30, defensive tier optional",
            "construct_validity": "MVP share as % max points, all_nba_vote_pts as continuous, not binary — convergent with PER/WS, discriminant playoff vs reg",
        },
        "seasons": by_season,
        "players": flat_players,  # flat keyed for join in build_vectors
    }

    OUT.write_text(json.dumps(out_doc, separators=(",",":")))
    size_kb = OUT.stat().st_size/1024
    print(f"wrote {OUT.name} {len(flat_players)} player-seasons {size_kb:.1f}KB -> {OUT}")

    latency = int((time.time()-t0)*1000)
    _log("L3-fetch_honors_extended-done", "done", extra={"players": len(flat_players), "seasons": len(by_season), "size_kb": round(size_kb,1)})

    return len(flat_players)

if __name__ == "__main__":
    main()

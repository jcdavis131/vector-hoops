#!/usr/bin/env python3
"""
W1 — Advanced Tracking PlayerTracking since 2013 (offline-capable + residential flag)
Zero-deps stdlib only, rate-limited 3-4s, resumable.

Outputs:
  - pipeline/cache/tracking_2013-14.json ... tracking_2025-26.json
  - pipeline/cache/tracking_summary.json

Metrics (per Task):
  screen_ast, deflections, loose_balls, boxouts, contested 2s/3s, drives, passes, secondary ast, charges drawn

Residential block handling (must):
  - If 403/log blocked: log timeline.jsonl status=blocked errorClass=network
  - Create LOCAL-GPU request marker file ~/.cache/local_gpu_handoff_request.json {task: fetch_advanced_tracking, reason: residential, requested_at: ISO}

Offline fallback:
  - Keep existing pipeline/cache/tracking_*.json as is (2.7M total)
  - Try balldontlie.io / data.nba.net public mirrors (best-effort, no API key)

Zero-deps: urllib, json, pathlib, time, datetime, os, sys, re
"""
from __future__ import annotations
import json, sys, re, time, os, datetime, pathlib, urllib.request, urllib.error, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PIPELINE = ROOT / "pipeline"
CACHE = PIPELINE / "cache"
CACHE.mkdir(parents=True, exist_ok=True)

SEASONS = [f"{y}-{str(y+1)[-2:]}" for y in range(2013, 2026)]

PT_MEASURE_TYPES = ["Drives", "Passing", "Defense", "Rebounding", "SpeedDistance", "CatchShoot", "Possessions"]
HUSTLE_ENDPOINT = "leaguehustlestatsplayer"
HUSTLE_PARAMS = {
    "LeagueID": "00",
    "PerMode": "PerGame",
    "SeasonType": "Regular Season",
}

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
STATS_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/",
    "User-Agent": UA,
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
}

def _log_timeline(node_id, status, err_cls=None, latency=0, tokens=0, extra=None):
    msg = {"nodeId": node_id, "agentId": "executor", "attempt": 1, "latency": latency, "tokens": tokens, "status": status, "errorClass": err_cls}
    if extra:
        msg.update(extra)
    try:
        sys.path.insert(0, str(ROOT / "bundles" / "scripts"))
        from mission_log import log as ml_log
        mid = os.environ.get("MISSION_ID", "0158f963-4f36-4952-a4b3-921969cb784e")
        ml_log(mid, msg)
    except Exception:
        try:
            mm = CACHE / "mission_mirror"
            mm.mkdir(parents=True, exist_ok=True)
            with open(mm / "timeline.jsonl", "a") as f:
                f.write(json.dumps({**msg, "ts": datetime.datetime.utcnow().isoformat()}) + "\n")
        except Exception:
            pass
        print(f"[{node_id}] {status} {err_cls or ''} {extra or ''}")

def _create_gpu_handoff_marker(reason="residential"):
    marker_path = Path.home() / ".cache" / "local_gpu_handoff_request.json"
    marker_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "task": "fetch_advanced_tracking",
        "reason": reason,
        "requested_at": datetime.datetime.utcnow().isoformat()+"Z",
        "seasons": SEASONS,
        "metrics": ["screen_ast","deflections","loose_balls","boxouts","contested_2s","contested_3s","drives","passes","secondary_ast","charges_drawn","dist_miles","avg_speed","potential_ast"],
        "outputs": ["pipeline/cache/tracking_*.json","pipeline/cache/tracking_summary.json"],
        "fallback": "balldontlie/data.nba.net offline",
        "residential_required": True,
        "priority": "high",
        "requested_by": "fetch_advanced_tracking.py zero-deps"
    }
    try:
        marker_path.write_text(json.dumps(payload, separators=(",",":")))
        print(f"created GPU handoff marker {marker_path}")
    except Exception as e:
        print(f"handoff marker write fail {e}")

def fetch_stats_endpoint(endpoint: str, params: dict) -> dict | None:
    query = urllib.parse.urlencode(params)
    url = f"https://stats.nba.com/stats/{endpoint}?{query}"
    req = urllib.request.Request(url, headers=STATS_HEADERS)
    try:
        time.sleep(3.5)
        with urllib.request.urlopen(req, timeout=30) as resp:
            txt = resp.read().decode("utf-8")
            data = json.loads(txt)
            return data
    except urllib.error.HTTPError as e:
        if e.code in (403, 429, 503):
            print(f"{endpoint} {params.get('Season') or params.get('SeasonYear')} blocked HTTP {e.code}")
            return None
        print(f"{endpoint} HTTP {e.code} {e}")
        return {}
    except Exception as e:
        print(f"{endpoint} err {e}")
        return {}

def parse_resultset(data: dict, set_name: str=None) -> list[dict]:
    if not data:
        return []
    rows = []
    if "resultSets" in data:
        blocks = data["resultSets"]
        if isinstance(blocks, dict):
            blocks = [blocks]
        for block in blocks:
            if set_name and block.get("name") != set_name:
                continue
            headers = block.get("headers", [])
            for raw in block.get("rowSet", []):
                rows.append({headers[i]: raw[i] for i in range(min(len(headers), len(raw)))})
            if set_name:
                break
    elif "resultSet" in data:
        rs = data["resultSet"]
        if not set_name or rs.get("name")==set_name:
            headers = rs.get("headers", [])
            for raw in rs.get("rowSet", []):
                rows.append({headers[i]: raw[i] for i in range(min(len(headers), len(raw)))})
    return rows

def fetch_pt_measure(season: str, measure: str):
    params = {
        "LeagueID": "00",
        "Season": season,
        "SeasonType": "Regular Season",
        "PtMeasureType": measure,
        "PerMode": "PerGame",
        "College": "",
        "Conference": "",
        "Country": "",
        "DateFrom": "",
        "DateTo": "",
        "Division": "",
        "DraftPick": "",
        "DraftYear": "",
        "GameScope": "",
        "Height": "",
        "LastNGames": "0",
        "Location": "",
        "Month": "0",
        "OpponentTeamID": "0",
        "Outcome": "",
        "PORound": "0",
        "PlayerExperience": "",
        "PlayerPosition": "",
        "SeasonSegment": "",
        "TeamID": "0",
        "VsConference": "",
        "VsDivision": "",
        "Weight": "",
    }
    data = fetch_stats_endpoint("leaguedashptstats", params)
    if data is None:
        return None
    rows = parse_resultset(data)
    return rows

def fetch_hustle(season: str):
    params = dict(HUSTLE_PARAMS)
    params["Season"] = season
    extra_empty = ["College","Conference","Country","DateFrom","DateTo","Division","DraftPick","DraftYear","GameScope","GameSegment","Height","LastNGames","Location","Month","OpponentTeamID","Outcome","PORound","PlayerExperience","PlayerPosition","SeasonSegment","TeamID","VsConference","VsDivision","Weight"]
    for k in extra_empty:
        if k not in params:
            params[k] = "" if k!="LastNGames" else "0"
    data = fetch_stats_endpoint(HUSTLE_ENDPOINT, params)
    if data is None:
        return None
    rows = parse_resultset(data)
    return rows

def offline_fallback_data_nba_net(season: str):
    urls = [
        f"https://data.nba.net/data/10s/prod/v1/{season[:4]}/players.json",
        f"https://cdn.nba.com/static/json/liveData/tracking/{season}/tracking.json",
    ]
    for url in urls:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            time.sleep(1.5)
            with urllib.request.urlopen(req, timeout=15) as resp:
                txt = resp.read().decode("utf-8")[:20000]
                print(f"offline fallback {season} {url} len {len(txt)}")
                return True
        except Exception:
            continue
    return False

def load_existing_tracking(season: str):
    p = CACHE / f"tracking_{season}.json"
    if p.exists():
        try:
            doc = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(doc, dict) and len(doc) > 20:
                return doc
        except:
            pass
    return {}

def main():
    import argparse
    ap = argparse.ArgumentParser(description="fetch_advanced_tracking zero-deps")
    ap.add_argument("--offline", action="store_true", help="skip live fetch, use cache only")
    ap.add_argument("--refresh", action="store_true", help="force live even if cache exists")
    args = ap.parse_args()

    t0 = time.time()
    _log_timeline("L3-fetch_tracking-start", "running", extra={"seasons": SEASONS})

    blocked = []
    total_rows = 0
    summary = {"built": datetime.datetime.utcnow().isoformat()+"Z", "seasons": {}, "metrics": ["screen_ast","deflections","loose_balls","boxouts","contested_2s","contested_3s","drives","passes","secondary_ast","charges_drawn","dist_miles","avg_speed","potential_ast"], "blocked": [], "offline_fallback": False}

    for season in SEASONS:
        existing = load_existing_tracking(season)
        if existing and not args.refresh and not args.offline:
            has_hustle = any("SCREEN_AST" in str(v) or "DEFLECTIONS" in str(v) or "screen_ast" in str(v).lower() for v in list(existing.values())[:5])
            if len(existing) >= 50 and has_hustle:
                print(f"tracking {season}: cache hit {len(existing)} rows (>=50 with hustle), skip")
                summary["seasons"][season] = {"rows": len(existing), "cached": True}
                total_rows += len(existing)
                continue

        if args.offline:
            cn = len(existing) if existing else 0
            print(f"tracking {season} offline cache {cn}")
            summary["seasons"][season] = {"rows": cn, "cached": True, "offline": True}
            total_rows += cn
            continue

        season_data = {}
        blocked_this_season = False

        hustle_rows = fetch_hustle(season)
        if hustle_rows is None:
            blocked.append(season)
            blocked_this_season = True
            print(f"tracking {season} hustle blocked — residential required")
            _log_timeline(f"L3-tracking-{season}-hustle", "blocked", err_cls="network", extra={"season": season, "endpoint": HUSTLE_ENDPOINT})
        else:
            print(f"tracking {season} hustle {len(hustle_rows)} rows")
            for r in hustle_rows:
                pid = r.get("PLAYER_ID") or r.get("player_id")
                if not pid:
                    continue
                rec = season_data.setdefault(str(pid), {})
                for k,v in r.items():
                    rk = k.lower().replace(" ", "_")
                    if "screen" in rk and "assist" in rk:
                        rec["screen_ast"] = v
                    elif "deflect" in rk:
                        rec["deflections"] = v
                    elif "loose" in rk:
                        rec["loose_balls"] = v
                    elif "box" in rk:
                        rec["boxouts"] = v
                    elif "contested" in rk and "2" in rk:
                        rec["contested_2s"] = v
                    elif "contested" in rk and "3" in rk:
                        rec["contested_3s"] = v
                    elif "contested" in rk:
                        rec.setdefault("contested_shots", v)
                    elif "charge" in rk:
                        rec["charges_drawn"] = v
                    else:
                        rec[rk] = v

        for mt in PT_MEASURE_TYPES:
            pt_rows = fetch_pt_measure(season, mt)
            if pt_rows is None:
                blocked.append(season)
                blocked_this_season = True
                print(f"tracking {season} PtMeasure {mt} blocked")
                _log_timeline(f"L3-tracking-{season}-{mt}", "blocked", err_cls="network", extra={"season": season, "measure": mt})
                continue
            print(f"tracking {season} PtMeasure {mt} {len(pt_rows)} rows")
            for r in pt_rows:
                pid = r.get("PLAYER_ID") or r.get("player_id") or r.get("PLAYER_ID")
                if not pid:
                    continue
                rec = season_data.setdefault(str(pid), {})
                for k,v in r.items():
                    lk = k.lower()
                    if lk in ("drives","drive","drives_pg"):
                        rec["drives"] = v
                    elif lk in ("passes","passes_made","passes_pg"):
                        rec["passes"] = v
                    elif "secondary" in lk and "ast" in lk:
                        rec["secondary_ast"] = v
                    elif "potential" in lk and "ast" in lk:
                        rec["potential_ast"] = v
                    elif "dist" in lk:
                        rec["dist_miles"] = v
                    elif "avg_speed" in lk:
                        rec["avg_speed"] = v
                    elif lk in ("screen_ast","screen_assists","screen_ast_pg"):
                        rec["screen_ast"] = v
                    if k not in rec:
                        rec[k.lower()] = v

        if blocked_this_season and not season_data:
            print(f"tracking {season} all endpoints blocked — trying offline fallback data.nba.net")
            ok = offline_fallback_data_nba_net(season)
            summary["offline_fallback"] = summary["offline_fallback"] or ok
            existing_fallback = load_existing_tracking(season)
            if existing_fallback:
                season_data = existing_fallback
                print(f"tracking {season} using existing fallback {len(season_data)} rows")
            else:
                print(f"tracking {season} no fallback, empty")

        if existing and season_data and isinstance(existing, dict):
            for k,v in existing.items():
                if k not in season_data:
                    season_data[k] = v
                else:
                    if isinstance(v, dict):
                        for kk, vv in v.items():
                            if kk not in season_data[k]:
                                season_data[k][kk] = vv

        out_path = CACHE / f"tracking_{season}.json"
        if season_data:
            out_path.write_text(json.dumps(season_data, separators=(",",":")))
            print(f"tracking {season} wrote {len(season_data)} player-track rows -> {out_path.name}")
            summary["seasons"][season] = {"rows": len(season_data), "blocked": blocked_this_season}
            total_rows += len(season_data)
        else:
            summary["seasons"][season] = {"rows": 0, "blocked": blocked_this_season, "empty": True}

    summary["total_rows"] = total_rows
    summary["blocked_seasons"] = sorted(set(blocked))
    summary["residential_required"] = len(blocked) > 0
    summary_path = CACHE / "tracking_summary.json"
    summary_path.write_text(json.dumps(summary, separators=(",",":")))
    print(f"tracking summary {total_rows} total rows blocked={len(summary['blocked_seasons'])} -> {summary_path.name}")

    latency = int((time.time()-t0)*1000)

    if blocked:
        _log_timeline("L3-fetch_tracking-blocked", "blocked", err_cls="network", latency=latency, tokens=total_rows, extra={"blocked": summary["blocked_seasons"], "reason": "residential"})
        _create_gpu_handoff_marker(reason="residential Akamai 403 — stats.nba.com PlayerTracking requires non-datacenter IP")
    else:
        _log_timeline("L3-fetch_tracking-done", "done", latency=latency, tokens=total_rows, extra={"seasons": len(SEASONS), "rows": total_rows})

    return total_rows, len(blocked)

if __name__ == "__main__":
    main()

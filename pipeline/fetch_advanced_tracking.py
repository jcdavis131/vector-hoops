#!/usr/bin/env python3
"""
W1 — Advanced Tracking PlayerTracking since 2013 (residential flag)
Rate-limited, resumable.

Outputs:
  - pipeline/cache/advanced_tracking_2013-14.json ... advanced_tracking_<LAST_SEASON>.json
  - pipeline/cache/tracking_summary.json

Metrics (per Task):
  screen_ast, deflections, loose_balls, boxouts, contested 2s/3s, drives, passes, secondary ast, charges drawn

Residential block handling (must):
  - If 403/log blocked: log timeline.jsonl status=blocked errorClass=network
  - Create LOCAL-GPU request marker file ~/.cache/local_gpu_handoff_request.json {task: fetch_advanced_tracking, reason: residential, requested_at: ISO}

Why its own files (2026-10-09). This script used to merge every response
column (`rec[k.lower()] = v`: player_name, team_abbreviation, gp, min, ...)
into pipeline/cache/tracking_<season>.json, the file build_vectors reads
key by key into the matrix's tracking family, and its skip check looked for
hustle keys those files do not have, so one successful run would have
rewritten all 13 of them [ingest#11]. It now writes
advanced_tracking_<season>.json, which nothing in the build reads, and
build_vectors holds tracking_*.json to its declared columns either way.

Failures (2026-10-09). Requests go through nba_http.fetch_stats_json
(retries, 403 -> BlockedError). An HTTP error used to come back as {}, a
zero-row success, and main()'s (rows, blocked) return was ignored, so even a
fully blocked run exited 0 [ingest#7]. A season with any failed endpoint now
writes nothing; the run exits 2 (ingest.run_fetch) after trying the rest.
The old "offline fallback" probed data.nba.net and wrote nothing from it; it
is gone.
"""
from __future__ import annotations
import json, sys, time, os, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ingest import BlockedError, EmptyPayloadError, Failures, FetchError, cache_is_fresh, run_fetch, write_cache
from nba_http import fetch_stats_json
from artifact_io import atomic_write_text
from seasons import TRACKING_FIRST_SEASON, is_final, season_range

ROOT = Path(__file__).resolve().parents[1]
PIPELINE = ROOT / "pipeline"
CACHE = PIPELINE / "cache"

SEASONS = season_range(TRACKING_FIRST_SEASON)

PT_MEASURE_TYPES = ["Drives", "Passing", "Defense", "Rebounding", "SpeedDistance", "CatchShoot", "Possessions"]
HUSTLE_ENDPOINT = "leaguehustlestatsplayer"
HUSTLE_PARAMS = {
    "LeagueID": "00",
    "PerMode": "PerGame",
    "SeasonType": "Regular Season",
}


def out_path(season: str) -> Path:
    return CACHE / f"advanced_tracking_{season}.json"


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
        "outputs": ["pipeline/cache/advanced_tracking_*.json","pipeline/cache/tracking_summary.json"],
        "residential_required": True,
        "priority": "high",
        "requested_by": "fetch_advanced_tracking.py"
    }
    try:
        marker_path.write_text(json.dumps(payload, separators=(",",":")))
        print(f"created GPU handoff marker {marker_path}")
    except OSError as e:
        print(f"handoff marker write fail {e}")

def fetch_stats_endpoint(endpoint: str, params: dict) -> dict:
    """The parsed payload. FetchError (BlockedError on 403) when it never succeeds."""
    time.sleep(3.5)
    return fetch_stats_json(endpoint, params, timeout=30)

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
    return parse_resultset(fetch_stats_endpoint("leaguedashptstats", params))

def fetch_hustle(season: str):
    params = dict(HUSTLE_PARAMS)
    params["Season"] = season
    extra_empty = ["College","Conference","Country","DateFrom","DateTo","Division","DraftPick","DraftYear","GameScope","GameSegment","Height","LastNGames","Location","Month","OpponentTeamID","Outcome","PORound","PlayerExperience","PlayerPosition","SeasonSegment","TeamID","VsConference","VsDivision","Weight"]
    for k in extra_empty:
        if k not in params:
            params[k] = "" if k!="LastNGames" else "0"
    return parse_resultset(fetch_stats_endpoint(HUSTLE_ENDPOINT, params))

def build_season(season: str) -> dict[str, dict]:
    """player id -> merged hustle + tracking record. Raises FetchError on any failed endpoint."""
    season_data: dict[str, dict] = {}
    hustle_rows = fetch_hustle(season)
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
        print(f"tracking {season} PtMeasure {mt} {len(pt_rows)} rows")
        for r in pt_rows:
            pid = r.get("PLAYER_ID") or r.get("player_id")
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
    return season_data

def main():
    import argparse
    ap = argparse.ArgumentParser(description="fetch_advanced_tracking")
    ap.add_argument("--offline", action="store_true", help="no network: report which seasons are cached")
    ap.add_argument("--refresh", action="store_true", help="force live even if cache exists")
    args = ap.parse_args()

    if args.offline:
        have = [s for s in SEASONS if out_path(s).exists()]
        print(f"cached advanced-tracking seasons: {len(have)}/{len(SEASONS)}")
        if len(have) < len(SEASONS):
            raise FetchError(f"no advanced_tracking cache for {[s for s in SEASONS if s not in have]}")
        return

    t0 = time.time()
    _log_timeline("L3-fetch_tracking-start", "running", extra={"seasons": SEASONS})
    CACHE.mkdir(parents=True, exist_ok=True)

    failures = Failures("fetch_advanced_tracking")
    blocked = []
    total_rows = 0
    summary = {"built": datetime.datetime.utcnow().isoformat()+"Z", "seasons": {}, "metrics": ["screen_ast","deflections","loose_balls","boxouts","contested_2s","contested_3s","drives","passes","secondary_ast","charges_drawn","dist_miles","avg_speed","potential_ast"], "blocked": []}

    for season in SEASONS:
        p = out_path(season)
        if not args.refresh and cache_is_fresh(p, season):
            print(f"tracking {season}: cached, skip")
            summary["seasons"][season] = {"cached": True}
            continue
        try:
            season_data = build_season(season)
            write_cache(p, season_data, source="stats.nba.com leaguehustlestatsplayer + leaguedashptstats via nba_http", season=season)
        except EmptyPayloadError as e:
            if is_final(season):
                failures.add(season, e)
                summary["seasons"][season] = {"rows": 0, "error": str(e)}
            else:
                print(f"tracking {season}: no rows yet; nothing cached")
            continue
        except FetchError as e:
            failures.add(season, e)
            if isinstance(e, BlockedError):
                blocked.append(season)
                _log_timeline(f"L3-tracking-{season}", "blocked", err_cls="network", extra={"season": season})
            summary["seasons"][season] = {"rows": 0, "blocked": isinstance(e, BlockedError), "error": str(e)}
            continue
        print(f"tracking {season} wrote {len(season_data)} player-track rows -> {p.name}")
        summary["seasons"][season] = {"rows": len(season_data)}
        total_rows += len(season_data)

    summary["total_rows"] = total_rows
    summary["blocked_seasons"] = sorted(set(blocked))
    summary["residential_required"] = len(blocked) > 0
    summary_path = CACHE / "tracking_summary.json"
    atomic_write_text(summary_path, json.dumps(summary, separators=(",",":")))
    print(f"tracking summary {total_rows} total rows blocked={len(summary['blocked_seasons'])} -> {summary_path.name}")

    latency = int((time.time()-t0)*1000)
    if blocked:
        _log_timeline("L3-fetch_tracking-blocked", "blocked", err_cls="network", latency=latency, tokens=total_rows, extra={"blocked": summary["blocked_seasons"], "reason": "residential"})
        _create_gpu_handoff_marker(reason="residential Akamai 403 — stats.nba.com PlayerTracking requires non-datacenter IP")
    else:
        _log_timeline("L3-fetch_tracking-done", "done", latency=latency, tokens=total_rows, extra={"seasons": len(SEASONS), "rows": total_rows})
    failures.raise_if_any()

if __name__ == "__main__":
    run_fetch(main, name="fetch_advanced_tracking")

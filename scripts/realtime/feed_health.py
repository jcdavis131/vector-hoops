#!/usr/bin/env python3
"""Probe every realtime feed source and record health into feed_health.json.

Sources (all the repo's established ESPN API patterns, no invented sources):
    espn_scoreboard   scoreboard?dates=<today ET>     (live game state)
    espn_summary      summary?event=<a live/recent id> (per-game detail)
    espn_teams        /teams                           (identity resolution)
    season_snapshot   assets/realtime/season_2026_27.json freshness
    scoreboard_snap   assets/realtime/scoreboard.json freshness

Per-source record:
    {"status": "ok|degraded|down", "last_good_tick": "<iso|unknown>",
     "latency_ms": 123, "consecutive_failures": 0,
     "detail": "...", "checked_at": "<iso>"}

consecutive_failures accumulates across runs; a success resets it to 0.
last_good_tick only moves forward on success -- never invented.

Usage:
    python3 scripts/realtime/feed_health.py
"""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone, UTC
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from espn import EspnError, et_today_yyyymmdd, get, utcnow_iso

ROOT = Path(__file__).resolve().parent.parent.parent
RT = ROOT / "assets" / "realtime"
HEALTH = RT / "feed_health.json"
SNAPSHOT = RT / "scoreboard.json"
SEASON = RT / "season_2026_27.json"

MAX_SNAPSHOT_AGE_S = 6 * 3600  # snapshot older than this on any day = degraded
MAX_SEASON_AGE_S = 36 * 3600  # season refresh runs daily; 36h = degraded


def _iso_age_s(iso: str) -> float | None:
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return (datetime.now(UTC) - dt).total_seconds()
    except (ValueError, TypeError):
        return None


def _probe(name: str, fn) -> dict:
    t0 = time.monotonic()
    try:
        detail = fn()
        latency = int((time.monotonic() - t0) * 1000)
        return {
            "status": "ok",
            "last_good_tick": utcnow_iso(),
            "latency_ms": latency,
            "consecutive_failures": 0,
            "detail": detail,
            "checked_at": utcnow_iso(),
        }
    except EspnError as e:
        latency = int((time.monotonic() - t0) * 1000)
        return {
            "status": "down",
            "last_good_tick": "unknown",  # filled from previous below
            "latency_ms": latency,
            "consecutive_failures": 1,  # accumulated below
            "detail": str(e),
            "checked_at": utcnow_iso(),
        }


def _file_freshness(name: str, path: Path, max_age_s: float) -> dict:
    if not path.exists():
        return {
            "status": "down",
            "last_good_tick": "unknown",
            "latency_ms": None,
            "consecutive_failures": 1,
            "detail": f"{path.name} missing -- has the poller ever run?",
            "checked_at": utcnow_iso(),
        }
    try:
        payload = json.loads(path.read_text())
        as_of = payload.get("as_of", "unknown")
        age = _iso_age_s(as_of)
    except (OSError, ValueError):
        return {
            "status": "down",
            "last_good_tick": "unknown",
            "latency_ms": None,
            "consecutive_failures": 1,
            "detail": f"{path.name} unreadable or invalid JSON",
            "checked_at": utcnow_iso(),
        }
    if age is None:
        return {
            "status": "degraded",
            "last_good_tick": "unknown",
            "latency_ms": None,
            "consecutive_failures": 0,
            "detail": f"{path.name} has no parseable as_of",
            "checked_at": utcnow_iso(),
        }
    status = "ok" if age <= max_age_s else "degraded"
    return {
        "status": status,
        "last_good_tick": as_of,
        "latency_ms": None,
        "consecutive_failures": 0,
        "detail": f"{path.name} as_of {as_of} ({int(age)}s ago)",
        "checked_at": utcnow_iso(),
    }


def main() -> int:
    try:
        prev = json.loads(HEALTH.read_text()).get("sources", {})
    except (OSError, ValueError):
        prev = {}

    def scoreboard():
        d = get(f"/scoreboard?dates={et_today_yyyymmdd()}")
        return f"{len(d.get('events', []) or [])} events today"

    def summary():
        # Probe the summary endpoint against a recent event id: prefer a live
        # game from the current snapshot, else the first event on the board.
        event_id = None
        try:
            snap = json.loads(SNAPSHOT.read_text())
            for g in snap.get("games", []):
                if g.get("state") == "in":
                    event_id = g["id"]
                    break
            if event_id is None and snap.get("games"):
                event_id = snap["games"][0]["id"]
        except (OSError, ValueError, KeyError):
            event_id = None
        if event_id is None:
            d = get(f"/scoreboard?dates={et_today_yyyymmdd()}")
            ev = (d.get("events", []) or [])
            if not ev:
                return "no events today -- summary probe skipped (not a failure)"
            event_id = ev[0]["id"]
        d = get(f"/summary?event={event_id}")
        players = (d.get("boxscore") or {}).get("players")
        return f"event {event_id}: HTTP 200, players={'present' if players else 'absent'}"

    def teams():
        d = get("/teams")
        n = len(((d.get("sports") or [{}])[0].get("leagues") or [{}])[0].get("teams") or [])
        return f"{n} teams"

    probes = {
        "espn_scoreboard": _probe("espn_scoreboard", scoreboard),
        "espn_summary": _probe("espn_summary", summary),
        "espn_teams": _probe("espn_teams", teams),
        "scoreboard_snapshot": _file_freshness("scoreboard_snapshot", SNAPSHOT, MAX_SNAPSHOT_AGE_S),
        "season_snapshot": _file_freshness("season_snapshot", SEASON, MAX_SEASON_AGE_S),
    }

    # Accumulate failure counts; never move last_good_tick backwards.
    sources = {}
    for name, rec in probes.items():
        old = prev.get(name, {}) if isinstance(prev.get(name), dict) else {}
        if rec["status"] == "down":
            rec["consecutive_failures"] = old.get("consecutive_failures", 0) + 1
            rec["last_good_tick"] = old.get("last_good_tick", "unknown")
        else:
            rec["consecutive_failures"] = 0
        sources[name] = rec

    tmp = HEALTH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps({"sources": sources, "updated_at": utcnow_iso()},
                              indent=2, sort_keys=True) + "\n")
    tmp.replace(HEALTH)

    for name, rec in sources.items():
        print(f"{name:20s} {rec['status']:8s} {rec['detail']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

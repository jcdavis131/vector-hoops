#!/usr/bin/env python3
"""Poll the ESPN NBA scoreboard and write the game-night snapshot.

Writes ``assets/realtime/scoreboard.json`` -- the last-known-good game state
the static site falls back to when the live feed fails (honest degradation).
On game nights the intended cadence is ~45-60s via cron; the script is
idempotent and safe to run more often.

Schema (all fields real or "unknown", never invented):
    {
      "as_of": "2026-10-20T19:42:11Z",   # when ESPN answered (UTC)
      "last_good_tick": "2026-10-20T19:42:11Z",
      "source": "https://site.api.espn.com/apis/site/v2/sports/basketball/nba",
      "date": "20261020",                 # ESPN day (America/New_York)
      "season": "2026-27",
      "games": [
        {"id": "401909088", "state": "pre", "detail": "10/20 - 3:00 PM EDT",
         "clock": "0.0", "period": 0,
         "away": {"abbr": "BOS", "name": "Boston Celtics",
                  "score": "0", "record": "0-0"},
         "home": {"abbr": "DET", "name": "Detroit Pistons",
                  "score": "0", "record": "0-0"},
         "tip_et": "2026-10-20T15:00:00-04:00"}
      ],
      "games_live": 0, "games_scheduled": 3, "games_final": 0,
      "quiet": false
    }

Notes:
* Pre-tip games carry score "0" from ESPN -- consumers must show an en dash
  for pre games, never "0-0 as a score". Same rule as assets/live.js.
* On failure the snapshot is NOT touched: the previous last-known state
  stands and the failure is recorded in assets/realtime/feed_health.json.
* Writes are atomic (temp file + os.replace) so readers never see a half
  file.

Usage:
    python3 scripts/realtime/scoreboard.py [--date YYYYMMDD]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from espn import EspnError, et_today_yyyymmdd, get, utcnow_iso

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "assets" / "realtime" / "scoreboard.json"
HEALTH = ROOT / "assets" / "realtime" / "feed_health.json"


def _team(t: dict) -> dict:
    team = t.get("team", {})
    rec = "unknown"
    for r in t.get("records", []) or []:
        if r.get("type") == "total":
            rec = r.get("summary", "unknown") or "unknown"
            break
    return {
        "abbr": team.get("abbreviation", "unknown"),
        "name": team.get("displayName", "unknown"),
        "score": t.get("score", "unknown"),
        "record": rec,
    }


def _game(e: dict) -> dict:
    comps = e.get("competitions") or []
    c = comps[0] if comps else {}
    status = c.get("status", {}) or {}
    stype = status.get("type", {}) or {}
    teams = {t.get("homeAway"): t for t in c.get("competitors", []) or []}
    return {
        "id": str(e.get("id", "unknown")),
        "state": stype.get("state", "unknown"),
        "detail": stype.get("shortDetail", "unknown"),
        "clock": status.get("displayClock", "unknown"),
        "period": status.get("period", 0),
        "away": _team(teams.get("away", {})),
        "home": _team(teams.get("home", {})),
        "tip_et": e.get("date", "unknown"),
    }


def record_health_failure(detail: str) -> None:
    """Record a failed poll in feed_health.json without touching the snapshot."""
    entry = {
        "status": "down",
        "last_good_tick": "unknown",
        "latency_ms": None,
        "consecutive_failures": 1,
        "detail": detail,
        "checked_at": utcnow_iso(),
    }
    try:
        prev = json.loads(HEALTH.read_text())
        prev_src = (prev.get("sources") or {}).get("espn_scoreboard", {})
        entry["last_good_tick"] = prev_src.get("last_good_tick", "unknown")
        entry["consecutive_failures"] = prev_src.get("consecutive_failures", 0) + 1
        sources = dict(prev.get("sources") or {})
    except (OSError, ValueError):
        sources = {}
    sources["espn_scoreboard"] = entry
    _atomic_write(HEALTH, {"sources": sources, "updated_at": utcnow_iso()})


def record_health_ok(latency_ms: int) -> None:
    try:
        prev = json.loads(HEALTH.read_text())
        prev_src = (prev.get("sources") or {}).get("espn_scoreboard", {})
        sources = dict(prev.get("sources") or {})
    except (OSError, ValueError):
        prev_src, sources = {}, {}
    now = utcnow_iso()
    sources["espn_scoreboard"] = {
        "status": "ok",
        "last_good_tick": now,
        "latency_ms": latency_ms,
        "consecutive_failures": 0,
        "detail": "scoreboard poll succeeded",
        "checked_at": now,
        "previous_failures": prev_src.get("consecutive_failures", 0),
    }
    _atomic_write(HEALTH, {"sources": sources, "updated_at": now})


def _atomic_write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    tmp.replace(path)


def main() -> int:
    ap = argparse.ArgumentParser(description="Poll ESPN NBA scoreboard -> snapshot")
    ap.add_argument("--date", default=None, help="YYYYMMDD (default: today, ET)")
    args = ap.parse_args()
    day = args.date or et_today_yyyymmdd()

    import time

    t0 = time.monotonic()
    try:
        data = get(f"/scoreboard?dates={day}")
    except EspnError as e:
        record_health_failure(str(e))
        print(f"scoreboard poll failed: {e} -- last-known snapshot kept", file=sys.stderr)
        return 1
    latency_ms = int((time.monotonic() - t0) * 1000)

    games = [_game(e) for e in data.get("events", []) or []]
    states = [g["state"] for g in games]
    now = utcnow_iso()
    league = (data.get("leagues") or [{}])[0]
    season_name = (league.get("season") or {}).get("displayName") or "unknown"
    snapshot = {
        "as_of": now,
        "last_good_tick": now,
        "source": "https://site.api.espn.com/apis/site/v2/sports/basketball/nba",
        "date": day,
        "season": season_name,
        "games": games,
        "games_live": states.count("in"),
        "games_scheduled": states.count("pre"),
        "games_final": states.count("post"),
        # quiet: no live or upcoming games worth sub-minute polling
        "quiet": not any(s in ("in", "pre") for s in states),
    }
    _atomic_write(OUT, snapshot)
    record_health_ok(latency_ms)
    print(
        f"wrote {OUT.name}: {len(games)} games "
        f"({snapshot['games_live']} live, {snapshot['games_scheduled']} scheduled, "
        f"{snapshot['games_final']} final) in {latency_ms}ms"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

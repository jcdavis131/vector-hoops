#!/usr/bin/env python3
"""Daily 2026-27 season refresh: team records + player identity resolution.

Pulls the 30 NBA teams and their current rosters from the ESPN API and writes
``assets/realtime/season_2026_27.json``. This keeps player identity current as
trades and call-ups happen (Pillar 2 action 5) and carries team records for
surfaces that need them.

Intended cadence: once daily (overnight). Idempotent; safe to re-run.

Schema:
    {
      "as_of": "2026-10-20T19:42:11Z",
      "season": {"year": 2027, "display": "2026-27"},
      "source": "...",
      "teams": [
        {"id": "8", "abbr": "DET", "name": "Detroit Pistons",
         "record": "unknown",  # records live in the scoreboard snapshot
         "athletes": [{"id": "3908845", "name": "John Collins",
                       "position": "F", "jersey": "20",
                       "status": "Active", "injury": "none"}]}
      ]
    }

Point-in-time rule: this is a snapshot dated as_of. It must never be used to
backfill features for games played before as_of without a point-in-time join;
the QA script enforces that as_of is never in the future.

Usage:
    python3 scripts/realtime/season_refresh.py
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from espn import EspnError, get, utcnow_iso

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "assets" / "realtime" / "season_2026_27.json"
HEALTH = ROOT / "assets" / "realtime" / "feed_health.json"


def _record(_team: dict) -> str:
    # The teams-list endpoint carries no record; records come from the
    # scoreboard snapshot (same API, same family). Mark honestly as unknown.
    return "unknown"


def _athletes(team_id: str) -> list[dict]:
    data = get(f"/teams/{team_id}/roster")
    out = []
    for a in data.get("athletes", []) or []:
        pos = a.get("position") or {}
        st = a.get("status") or {}
        inj = a.get("injuries") or []
        out.append(
            {
                "id": str(a.get("id", "unknown")),
                "name": a.get("displayName", "unknown"),
                "position": pos.get("abbreviation", "unknown"),
                "jersey": str(a.get("jersey", "unknown")),
                # Injury/status signal (Pillar 2 action 6): surfaces where
                # roster availability changes. Only real values, else unknown.
                "status": st.get("name", "unknown"),
                "injury": (inj[0].get("description", "unknown") if inj else "none"),
            }
        )
    return out


def _atomic_write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    tmp.replace(path)


def _health(status: str, detail: str, latency_ms: int | None, failures: int) -> None:
    try:
        prev = json.loads(HEALTH.read_text())
        sources = dict(prev.get("sources") or {})
    except (OSError, ValueError):
        sources = {}
    now = utcnow_iso()
    sources["espn_season_refresh"] = {
        "status": status,
        "last_good_tick": now if status == "ok" else sources.get("espn_season_refresh", {}).get(
            "last_good_tick", "unknown"),
        "latency_ms": latency_ms,
        "consecutive_failures": failures,
        "detail": detail,
        "checked_at": now,
    }
    _atomic_write(HEALTH, {"sources": sources, "updated_at": now})


def main() -> int:
    t0 = time.monotonic()
    try:
        data = get("/teams")
    except EspnError as e:
        _health("down", str(e), None, 1)
        print(f"season refresh failed: {e}", file=sys.stderr)
        return 1

    sports = data.get("sports") or []
    leagues = (sports[0].get("leagues") if sports else None) or []
    entries = (leagues[0].get("teams") if leagues else None) or []
    season = ((leagues[0].get("season") if leagues else None) or {})

    teams = []
    for entry in entries:
        team = entry.get("team", {}) or {}
        tid = str(team.get("id", "unknown"))
        try:
            athletes = _athletes(tid)
        except EspnError as e:
            # One bad roster must not poison the whole refresh: keep the team
            # row, mark athletes unknown, keep going.
            print(f"  roster failed for {tid}: {e}", file=sys.stderr)
            athletes = []
        teams.append(
            {
                "id": tid,
                "abbr": team.get("abbreviation", "unknown"),
                "name": team.get("displayName", "unknown"),
                "record": _record(team),
                "athletes": athletes or "unknown",
            }
        )
        time.sleep(0.2)  # be polite: 30 roster fetches

    latency_ms = int((time.monotonic() - t0) * 1000)
    payload = {
        "as_of": utcnow_iso(),
        "season": {
            "year": season.get("year", "unknown"),
            "display": season.get("displayName", "unknown"),
        },
        "source": "https://site.api.espn.com/apis/site/v2/sports/basketball/nba",
        "teams": teams,
    }
    _atomic_write(OUT, payload)
    n_athletes = sum(len(t["athletes"]) for t in teams if isinstance(t["athletes"], list))
    _health("ok", f"{len(teams)} teams, {n_athletes} athletes", latency_ms, 0)
    print(f"wrote {OUT.name}: {len(teams)} teams, {n_athletes} athletes in {latency_ms}ms")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

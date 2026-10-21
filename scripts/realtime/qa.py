#!/usr/bin/env python3
"""Honest-data guard for the realtime data plane.

Fails (exit 1) on any violation of the real-data-only contract in
assets/realtime/*.json:
  * file is not valid JSON
  * as_of / last_good_tick missing, unparseable, or in the future
    (point-in-time correctness: no lookahead leakage)
  * scores that are not ESPN-shaped (digits or "unknown") -- a -1, null, or
    fabricated string fails
  * game state outside {pre, in, post, unknown}
  * season file: team rows missing id/abbr, athlete rows missing id/name

Unknown is fine. Invented is not. Designed to run in CI or pre-commit.

Usage:
    python3 scripts/realtime/qa.py [--dir assets/realtime]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone, UTC
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
_SCORE_RE = re.compile(r"^\d+$")
_STATES = {"pre", "in", "post", "unknown"}


def _fail(problems: list[str], msg: str) -> None:
    problems.append(msg)


def _check_iso(problems: list[str], where: str, value) -> None:
    if not isinstance(value, str):
        _fail(problems, f"{where}: timestamp missing or not a string")
        return
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        _fail(problems, f"{where}: unparseable timestamp {value!r}")
        return
    if dt.tzinfo is None:
        _fail(problems, f"{where}: naive timestamp {value!r} (need TZ)")
        return
    if dt > datetime.now(UTC).replace(microsecond=0):
        _fail(problems, f"{where}: timestamp {value} is in the future -- lookahead")


def _check_score(problems: list[str], where: str, value) -> None:
    if value == "unknown":
        return
    if not (isinstance(value, str) and _SCORE_RE.match(value)):
        _fail(problems, f"{where}: non-ESPN-shaped score {value!r}")


def check_scoreboard(path: Path, problems: list[str]) -> None:
    payload = json.loads(path.read_text())
    _check_iso(problems, f"{path.name}.as_of", payload.get("as_of"))
    lg = payload.get("last_good_tick", "unknown")
    if lg != "unknown":
        _check_iso(problems, f"{path.name}.last_good_tick", lg)
    games = payload.get("games")
    if not isinstance(games, list):
        _fail(problems, f"{path.name}: games is not a list")
        return
    for i, g in enumerate(games):
        w = f"{path.name}.games[{i}]"
        if g.get("state") not in _STATES:
            _fail(problems, f"{w}: bad state {g.get('state')!r}")
        _check_score(problems, f"{w}.away.score", (g.get("away") or {}).get("score"))
        _check_score(problems, f"{w}.home.score", (g.get("home") or {}).get("score"))


def check_season(path: Path, problems: list[str]) -> None:
    payload = json.loads(path.read_text())
    _check_iso(problems, f"{path.name}.as_of", payload.get("as_of"))
    teams = payload.get("teams")
    if not isinstance(teams, list) or not teams:
        _fail(problems, f"{path.name}: teams empty or not a list")
        return
    for i, t in enumerate(teams):
        w = f"{path.name}.teams[{i}]"
        if not t.get("id") or not t.get("abbr"):
            _fail(problems, f"{w}: missing id/abbr")
        ath = t.get("athletes")
        if ath == "unknown":
            continue
        if not isinstance(ath, list):
            _fail(problems, f"{w}: athletes neither list nor 'unknown'")
            continue
        for j, a in enumerate(ath):
            if not a.get("id") or not a.get("name"):
                _fail(problems, f"{w}.athletes[{j}]: missing id/name")


def check_health(path: Path, problems: list[str]) -> None:
    payload = json.loads(path.read_text())
    sources = payload.get("sources")
    if not isinstance(sources, dict) or not sources:
        _fail(problems, f"{path.name}: no sources recorded")
        return
    for name, s in sources.items():
        w = f"{path.name}.sources.{name}"
        if s.get("status") not in {"ok", "degraded", "down"}:
            _fail(problems, f"{w}: bad status {s.get('status')!r}")
        if not isinstance(s.get("consecutive_failures"), int):
            _fail(problems, f"{w}: consecutive_failures not an int")
        _check_iso(problems, f"{w}.checked_at", s.get("checked_at"))
        lg = s.get("last_good_tick", "unknown")
        if lg != "unknown":
            _check_iso(problems, f"{w}.last_good_tick", lg)


def main() -> int:
    ap = argparse.ArgumentParser(description="QA the realtime JSON snapshots")
    ap.add_argument("--dir", default=str(ROOT / "assets" / "realtime"))
    args = ap.parse_args()
    d = Path(args.dir)
    problems: list[str] = []
    checks = {
        "scoreboard.json": check_scoreboard,
        "season_2026_27.json": check_season,
        "feed_health.json": check_health,
    }
    ran = 0
    for fname, fn in checks.items():
        p = d / fname
        if not p.exists():
            _fail(problems, f"{fname}: missing -- run the poller first")
            continue
        try:
            fn(p, problems)
            ran += 1
        except (ValueError, OSError) as e:
            _fail(problems, f"{fname}: invalid JSON or unreadable ({e})")
    if problems:
        print("realtime QA FAILED:")
        for p in problems:
            print(f"  - {p}")
        return 1
    print(f"realtime QA passed ({ran} files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

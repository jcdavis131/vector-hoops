"""Build the Pixel Replay data files from cached cdn.nba.com play-by-play.

Reads pipeline/cache/cdn_pbp/playbyplay_<gameId>.json (the NBA's own liveData feed,
cached on the operator box) and writes, for each complete or in-progress game:

  assets/replays/<gameId>.json   compact events, lineups and teams for replay.js
  assets/replays/index.json      the game list the page opens with

What is real and what is staged. Every event, clock, score, shooter and shot
location comes from the feed. The positions of the other nine players are not in
any public feed, so replay.js stages them from formation templates (rung (a) of the
Pixel Replay research brief). This script writes only what the feed says, plus the
on-court lineup it can reconstruct from substitutions; nothing is invented here.

Stdlib only.   python pipeline/build_replays.py [--check]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache" / "cdn_pbp"
OUT = ROOT / "assets" / "replays"
TEAM_MAP = ROOT / "docs" / "live-recon" / "team_map.json"
FEED = "https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_{gid}.json"

COURT_L, COURT_W = 94.0, 50.0
HOOP_IN = 5.25  # rim centre from the baseline, feet

# NBA tricodes that ESPN's team map spells differently.
ALIAS = {
    "GSW": "GS",
    "NOP": "NO",
    "NYK": "NY",
    "SAS": "SA",
    "UTA": "UTAH",
    "WAS": "WSH",
}

TYPES = [
    "2pt",
    "3pt",
    "freethrow",
    "rebound",
    "turnover",
    "steal",
    "block",
    "foul",
    "substitution",
    "timeout",
    "jumpball",
    "violation",
    "period",
    "game",
    "other",
]


def clock_seconds(s: str) -> float:
    m = re.match(r"PT(\d+)M([\d.]+)S", s or "")
    return int(m.group(1)) * 60 + float(m.group(2)) if m else 0.0


def team_colors() -> dict[str, dict]:
    raw = json.loads(TEAM_MAP.read_text(encoding="utf-8"))
    return {
        v["abbr"]: {
            "name": v["name"],
            "short": v["short"],
            "c": "#" + v["color"],
            "alt": "#" + v["alt"],
        }
        for v in raw.values()
    }


def sides(actions: list[dict]) -> dict[int, int]:
    """teamId -> 0 (away) / 1 (home), read off which score moves on that team's points."""
    side: dict[int, int] = {}
    prev = (0, 0)
    for a in actions:
        cur = (int(a.get("scoreAway") or 0), int(a.get("scoreHome") or 0))
        if a.get("teamId") and cur != prev and a.get("teamId") not in side:
            side[a["teamId"]] = 0 if cur[0] != prev[0] else 1
        prev = cur
        if len(side) == 2:
            break
    ids = {a["teamId"] for a in actions if a.get("teamId")}
    if len(side) == 1:
        ((only, s),) = side.items()
        for t in ids - {only}:
            side[t] = 1 - s
    return side


def build_game(path: Path, colors: dict) -> dict | None:
    raw = path.read_bytes()
    game = json.loads(raw)["game"]
    gid = game["gameId"]
    acts = sorted(
        game["actions"],
        key=lambda a: (
            a["period"],
            -clock_seconds(a["clock"]),
            a.get("orderNumber", 0),
        ),
    )
    side = sides(acts)
    if len(side) != 2:
        return None
    tri = {}
    for a in acts:
        if a.get("teamId") in side and a.get("teamTricode"):
            tri[side[a["teamId"]]] = a["teamTricode"]
    teams = []
    for s in (0, 1):
        t = tri[s]
        c = colors.get(ALIAS.get(t, t), {"name": t, "short": t, "c": "#555555", "alt": "#ffffff"})
        teams.append({"tri": t, **c})

    players: dict[str, dict] = {}
    for a in acts:
        pid, tid = a.get("personId"), a.get("teamId")
        if pid and tid in side and a.get("playerNameI"):
            players.setdefault(str(pid), {"n": a["playerNameI"], "t": side[tid]})

    # Starters: on-court players whose first action is not "substitution in".
    first: dict[str, str] = {}
    for a in acts:
        pid = str(a.get("personId") or "")
        if pid in players and pid not in first:
            first[pid] = "in" if (a["actionType"] == "substitution" and a.get("subType") == "in") else "on"
    lineup = [[p for p in first if first[p] == "on" and players[p]["t"] == s][:5] for s in (0, 1)]
    last_seen: dict[str, int] = {}
    lineups = [[0, list(lineup[0]), list(lineup[1])]]
    events = []
    for i, a in enumerate(acts):
        pid = str(a.get("personId") or "")
        tid = a.get("teamId")
        s = side.get(tid, -1)
        typ = a["actionType"] if a["actionType"] in TYPES else "other"
        changed = False
        if typ == "substitution" and pid in players:
            ln = lineup[players[pid]["t"]]
            if a.get("subType") == "out" and pid in ln:
                ln.remove(pid)
                changed = True
            elif a.get("subType") == "in" and pid not in ln:
                ln.append(pid)
                changed = True
        elif pid in players:
            ln = lineup[players[pid]["t"]]
            if pid not in ln:  # the feed shows him playing: repair the lineup
                if len(ln) >= 5:
                    ln.remove(min(ln, key=lambda p: last_seen.get(p, -1)))
                ln.append(pid)
                changed = True
            last_seen[pid] = i
        if changed and all(len(x) == 5 for x in lineup):
            if lineups[-1][0] == i:
                lineups[-1] = [i, list(lineup[0]), list(lineup[1])]
            else:
                lineups.append([i, list(lineup[0]), list(lineup[1])])
        x = y = None
        if a.get("isFieldGoal") == 1 and a.get("x") is not None and a.get("y") is not None:
            x = round(a["x"] / 100 * COURT_L, 2)
            y = round(a["y"] / 100 * COURT_W, 2)
        res = {"Made": 1, "Missed": 0}.get(a.get("shotResult"))
        poss = side.get(a.get("possession"), -1)
        events.append(
            [
                a["period"],
                round(clock_seconds(a["clock"]), 1),
                TYPES.index(typ),
                a.get("subType") or "",
                s,
                int(pid) if pid in players else 0,
                x,
                y,
                int(a.get("scoreAway") or 0),
                int(a.get("scoreHome") or 0),
                res,
                a.get("description") or "",
                poss,
                1 if a.get("side") == "right" else (0 if a.get("side") == "left" else -1),
            ]
        )

    # Self-check: feed shot distance vs distance from (x, y) to the nearer rim.
    errs = []
    for a in acts:
        if a.get("isFieldGoal") == 1 and a.get("shotDistance") is not None and a.get("x") is not None:
            x, y = a["x"] / 100 * COURT_L, a["y"] / 100 * COURT_W
            d = min(
                math.hypot(x - HOOP_IN, y - COURT_W / 2),
                math.hypot(x - (COURT_L - HOOP_IN), y - COURT_W / 2),
            )
            errs.append(abs(d - a["shotDistance"]))
    errs.sort()
    last = acts[-1]
    final = last["actionType"] == "game" and last.get("subType") == "end"
    return {
        "gameId": gid,
        "source": FEED.format(gid=gid),
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "final": final,
        "periods": max(a["period"] for a in acts),
        "teams": teams,
        "score": [events[-1][8], events[-1][9]],
        "date": (acts[0].get("timeActual") or "")[:10],
        "types": TYPES,
        "fields": [
            "period",
            "clock",
            "type",
            "sub",
            "team",
            "person",
            "x",
            "y",
            "away",
            "home",
            "made",
            "desc",
            "poss",
            "rightSide",
        ],
        "players": players,
        "lineups": lineups,
        "events": events,
        "check": {
            "shots": len(errs),
            "distErrMedianFt": round(errs[len(errs) // 2], 2) if errs else None,
            "distErrP95Ft": round(errs[int(len(errs) * 0.95)], 2) if errs else None,
        },
        "staged": "Shooter, shot spot, event, clock and score are from the NBA feed. The other nine players are staged from formation templates: no public feed has their positions.",
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--check",
        action="store_true",
        help="fail if the committed files differ from a fresh build",
    )
    args = ap.parse_args()
    colors = team_colors()
    built = []
    for p in sorted(CACHE.glob("playbyplay_*.json")):
        g = build_game(p, colors)
        if g:
            built.append(g)
    index = {
        "games": [
            {k: g[k] for k in ("gameId", "date", "final", "teams", "score", "periods")}
            for g in sorted(built, key=lambda g: (g["date"], g["gameId"]), reverse=True)
        ],
        "note": built[0]["staged"] if built else "",
    }
    for g in index["games"]:
        g["teams"] = [{k: t[k] for k in ("tri", "short", "c", "alt")} for t in g["teams"]]
    files = {OUT / f"{g['gameId']}.json": g for g in built}
    files[OUT / "index.json"] = index
    stale = []
    for path, obj in files.items():
        text = json.dumps(obj, separators=(",", ":"), ensure_ascii=False) + "\n"
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                stale.append(path.name)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8", newline="\n")
    for g in built:
        c = g["check"]
        print(
            f"{g['gameId']} {g['teams'][0]['tri']}@{g['teams'][1]['tri']} {g['score'][0]}-{g['score'][1]} "
            f"events={len(g['events'])} lineups={len(g['lineups'])} shots={c['shots']} "
            f"dist err median={c['distErrMedianFt']} p95={c['distErrP95Ft']} ft"
        )
    if stale:
        print("stale:", ", ".join(stale), "-- run python pipeline/build_replays.py")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""VH-113 / Track F — Tier B shared-game stint edges from VH-101 game logs.

Method (stated in output and methods.html when shipped):

- Tier B edge = two players appeared in the same game for the same TEAM_ID
  (both logged minutes in that game). This counts **shared games**, not
  lineup minutes, co-possessions, or on/off impact.
- SHARED_GAMES = count of distinct GAME_IDs where both players dressed for
  the same team.
- weight = SHARED_GAMES / min(gp_a, gp_b) — optional normalization for
  roster overlap density.

Limitations (honest):
- A DNP-ACTIVE roster spot without minutes is invisible (logs require MIN).
- Midseason trades split pair counts by team stint (same TEAM_ID only).
- Garbage-time blowouts count the same as crunch time — no minute weighting.
- Tier C lineup on/off (VH-114) would be better; gated until Operator sign-off.

Output: pipeline/data/shared_games.jsonl — one edge per line:
  {a, b, season, team_id, team, shared_games, gp_a, gp_b, weight}

Run:  python pipeline/tier_b_stint_parser.py
      python pipeline/tier_b_stint_parser.py --dry-run
Deps: pipeline/data/gamelogs_*.jsonl (VH-101)
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from itertools import combinations
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
OUT = DATA / "shared_games.jsonl"

MIN_SHARED = 5
MIN_GP = 10


def canonical_pair(a: str, b: str) -> tuple[str, str]:
    return (a, b) if a <= b else (b, a)


def parse_season(
    path: Path,
) -> tuple[str, dict[tuple[str, str, str], int], dict[tuple[int, str], dict]]:
    """Return season label, shared-game pair counts, and per-team GP totals."""
    season = path.stem.split("_", 1)[1]
    pair_counts: dict[tuple[str, str, str], int] = defaultdict(int)
    gp: dict[tuple[int, str], dict] = defaultdict(lambda: {"gp": 0, "team": ""})

    game_rosters: dict[tuple[str, int], set[str]] = defaultdict(set)
    game_team: dict[tuple[str, int], str] = {}

    with path.open(encoding="utf-8") as fh:
        for line in fh:
            g = json.loads(line)
            if not g.get("MIN"):
                continue
            name = g.get("PLAYER_NAME")
            if not name:
                continue
            gid = str(g["GAME_ID"])
            tid = int(g["TEAM_ID"])
            key = (gid, tid)
            game_rosters[key].add(name)
            game_team[key] = g.get("TEAM_ABBREVIATION") or ""
            gp[(tid, name)]["gp"] += 1
            gp[(tid, name)]["team"] = game_team[key]

    for (gid, tid), roster in game_rosters.items():
        if len(roster) < 2:
            continue
        team = game_team.get((gid, tid), "")
        for a, b in combinations(sorted(roster), 2):
            pair_counts[(a, b, team)] += 1

    return season, pair_counts, gp


def build_edges(
    season: str,
    pair_counts: dict[tuple[str, str, str], int],
    gp: dict[tuple[int, str], dict],
    min_shared: int = MIN_SHARED,
) -> list[dict]:
    """Materialize edges with team_id resolved from GP table."""
    name_team_gp: dict[tuple[str, str], tuple[int, int, str]] = {}
    for (tid, name), info in gp.items():
        name_team_gp[(name, info["team"])] = (tid, info["gp"], info["team"])

    edges: list[dict] = []
    for (a, b, team), shared in pair_counts.items():
        if shared < min_shared:
            continue
        ta = name_team_gp.get((a, team))
        tb = name_team_gp.get((b, team))
        if not ta or not tb:
            continue
        tid, gp_a, _ = ta
        _, gp_b, _ = tb
        if gp_a < MIN_GP or gp_b < MIN_GP:
            continue
        denom = min(gp_a, gp_b)
        edges.append(
            {
                "a": a,
                "b": b,
                "season": season,
                "team_id": tid,
                "team": team,
                "shared_games": shared,
                "gp_a": gp_a,
                "gp_b": gp_b,
                "weight": round(shared / denom, 4) if denom else 0.0,
            }
        )
    edges.sort(key=lambda e: (-e["shared_games"], e["season"], e["a"], e["b"]))
    return edges


def main() -> None:
    ap = argparse.ArgumentParser(description="Tier B shared-game stint parser")
    ap.add_argument("--dry-run", action="store_true", help="print stats only; do not write jsonl")
    ap.add_argument(
        "--min-shared",
        type=int,
        default=MIN_SHARED,
        help=f"minimum shared games per edge (default {MIN_SHARED})",
    )
    args = ap.parse_args()

    log_files = sorted(DATA.glob("gamelogs_*.jsonl"))
    if not log_files:
        print("VH-113: no pipeline/data/gamelogs_*.jsonl — run fetch_gamelogs.py first")
        if not args.dry_run:
            DATA.mkdir(parents=True, exist_ok=True)
            OUT.write_text("", encoding="utf-8")
            print(f"wrote empty {OUT.name}")
        return

    all_edges: list[dict] = []
    for path in log_files:
        season, pairs, gp = parse_season(path)
        edges = build_edges(season, pairs, gp, min_shared=args.min_shared)
        all_edges.extend(edges)
        print(f"{season}: {len(edges)} edges (>= {args.min_shared} shared games)")

    print(f"total edges: {len(all_edges)} across {len(log_files)} seasons")

    if args.dry_run:
        if all_edges:
            print("sample:", all_edges[0])
        return

    DATA.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as fh:
        for edge in all_edges:
            fh.write(json.dumps(edge, separators=(",", ":")) + "\n")
    print(f"wrote {OUT} ({len(all_edges)} lines)")


if __name__ == "__main__":
    main()

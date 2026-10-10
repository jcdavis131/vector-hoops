"""Track H deriver — per player-season pedigree (entry expectations) features.

Joins pipeline/cache/draft_history.json to every charted player-season in
assets/vectors.json and derives the `pedigree` tower family. Every value is
known before the player's first NBA game, so the family is leak-free by
construction; the two season-varying features (years-since, decay) vary
only through elapsed time.

Features (raw, interpretable — integrate_context.py era-z's at merge):

  PED_PICK_QUALITY  61 - overall pick (higher = drafted earlier); undrafted -> masked
  PED_ROUND_ONE     1 if first-round pick, else 0
  PED_UNDRAFTED     1 if confidently undrafted (complete cache, no record)
  PED_EXPECT_SLOT   stated CBA-rookie-scale-shaped expectation curve,
                    #1 pick = 1.0, second round = 0.10, undrafted = 0.06
                    (relative expectation, NOT dollars)
  PED_TEAM_WINPCT   drafting team's W_PCT the season BEFORE the pick —
                    the team-fit prior (lottery team vs contender);
                    masked for drafts before 1997 (team cache starts 1996-97)
  PED_YEARS_SINCE   season start year - draft year (undrafted: - first
                    charted season year)
  PED_PICK_DECAY    pick quality scaled 0-1 x e^(-years_since/4) —
                    expectations fade as on-court evidence accumulates

Mask honesty: a player with no draft record gets PED_UNDRAFTED=1 ONLY when
the cache is marked complete, spans his entry window and carries a person_id
on every record; against a partial cache (e.g. the committed example fixture)
unmatched players are fully masked instead of being mislabeled undrafted.

Identity: a charted row is matched to draft records by PLAYER_ID ==
person_id (vectors.json 'pid'), and first_year is that PLAYER_ID's first
charted season. Among one person's records (119 people were drafted twice)
the latest draft <= first_year wins. This used to be keyed by display name
[features#5, health#3]: first_year[name] was the earliest season of anyone
with that name, so a son was matched against his father's debut (Jaren
Jackson Jr. 'undrafted', Gary Payton II with his father's 1990 #2 pick), and
a suffix-bearing name missed the suffix-stripped cache key and was labelled
confidently undrafted (227 rows of 38 drafted players on the committed
vectors.json, Hardaway Jr., Bagley, Porter Jr. among them).

Run:  python pipeline/build_pedigree.py [--cache PATH] [--fixture]
Output: pipeline/data/pedigree.json (consumed by integrate_context.py);
        assets/pedigree.json (transparent per-player draft facts for the
        Steals of the Draft surface) is written ONLY from a complete cache.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import itertools

from _out_root import add_out_root, rerooted, shown

ROOT = Path(__file__).resolve().parents[1]
VECTORS = ROOT / "assets" / "vectors.json"
CACHE_DIR = ROOT / "pipeline" / "cache"
DRAFT_CACHE = CACHE_DIR / "draft_history.json"
DRAFT_FIXTURE = CACHE_DIR / "draft_history.example.json"
OUT = ROOT / "pipeline" / "data" / "pedigree.json"
ASSET_OUT = ROOT / "assets" / "pedigree.json"

DECAY_YEARS = 4.0  # e-folding of entry expectations

# Stated expectation curve: CBA rookie-scale shape normalized to pick #1.
# Log-linear interpolation between anchors; round 2 flat; undrafted floor.
EXPECT_ANCHORS = [
    (1, 1.00),
    (2, 0.90),
    (3, 0.81),
    (4, 0.73),
    (5, 0.66),
    (7, 0.55),
    (10, 0.44),
    (14, 0.35),
    (18, 0.28),
    (21, 0.25),
    (25, 0.22),
    (30, 0.19),
]
EXPECT_ROUND2 = 0.10
EXPECT_UNDRAFTED = 0.06


def expect_slot(overall: int) -> float:
    if overall > 30:
        return EXPECT_ROUND2
    if overall <= EXPECT_ANCHORS[0][0]:
        return EXPECT_ANCHORS[0][1]
    for (p0, v0), (p1, v1) in itertools.pairwise(EXPECT_ANCHORS):
        if p0 <= overall <= p1:
            t = (overall - p0) / (p1 - p0)
            return round(math.exp(math.log(v0) + t * (math.log(v1) - math.log(v0))), 4)
    return EXPECT_ANCHORS[-1][1]


def season_start(season: str) -> int:
    return int(str(season)[:4])


def prior_season_str(draft_year: int) -> str:
    return f"{draft_year - 1}-{str(draft_year)[-2:]}"


def team_winpct_index() -> dict[str, dict[int, float]]:
    idx: dict[str, dict[int, float]] = {}
    for path in sorted(CACHE_DIR.glob("team_base_*.json")):
        season = path.stem.replace("team_base_", "")
        try:
            rows = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        idx[season] = {int(r["TEAM_ID"]): float(r["W_PCT"]) for r in rows if r.get("W_PCT") is not None}
    return idx


def pick_record(recs: list[dict], first_year: int) -> dict | None:
    """Latest draft at or before the player's first charted season year."""
    eligible = [r for r in recs if r["year"] <= first_year]
    return max(eligible, key=lambda r: r["year"]) if eligible else None


def main() -> None:
    global OUT, ASSET_OUT
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--cache",
        default=None,
        help="draft cache path (default pipeline/cache/draft_history.json)",
    )
    ap.add_argument(
        "--fixture",
        action="store_true",
        help="use the committed example fixture (tests)",
    )
    add_out_root(ap)
    args = ap.parse_args()
    OUT = rerooted(OUT, args.out_root)
    ASSET_OUT = rerooted(ASSET_OUT, args.out_root)

    cache_path = Path(args.cache) if args.cache else (DRAFT_FIXTURE if args.fixture else DRAFT_CACHE)
    if not cache_path.exists():
        raise SystemExit(
            f"no draft cache at {cache_path} — run pipeline/fetch_draft_history.py "
            "on an operator machine (or pass --fixture for the test fixture)"
        )

    draft = json.loads(cache_path.read_text(encoding="utf-8"))
    complete = bool(draft.get("complete"))
    dmin, dmax = draft.get("years") or [None, None]

    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    players = vec["players"]

    by_person: dict[int, list[dict]] = {}
    no_person_id = 0
    for recs in draft["players"].values():
        for rec in recs:
            if rec.get("person_id") is None:
                no_person_id += 1
                continue
            by_person.setdefault(int(rec["person_id"]), []).append(rec)
    # "Not in the draft history" means undrafted only when every record can be
    # found by person_id; a record without one could be this player.
    can_say_undrafted = complete and no_person_id == 0 and dmin is not None

    def pid_of(p: dict) -> int | None:
        return int(p["pid"]) if str(p.get("pid", "")).isdigit() else None

    first_year: dict[int, int] = {}
    for p in players:
        pid = pid_of(p)
        if pid is not None:
            first_year[pid] = min(first_year.get(pid, 9999), season_start(p["season"]))

    teams = team_winpct_index()

    resolved: dict[int, dict | None] = {}  # PLAYER_ID -> draft record | None(=undrafted)
    unmatched = 0
    for pid, fy in first_year.items():
        recs = by_person.get(pid)
        if recs:
            rec = pick_record(recs, fy)
            if rec is not None:
                resolved[pid] = rec
                continue
        if can_say_undrafted and dmin <= fy <= (dmax or fy) + 1:
            resolved[pid] = None  # confidently undrafted
        else:
            unmatched += 1  # partial cache -> masked, never mislabeled
    no_pid_rows = sum(1 for p in players if pid_of(p) is None)

    entries = []
    for p in players:
        name, season, pid = p["name"], p["season"], pid_of(p)
        row: dict = {"name": name, "season": season, "player_id": pid}
        if pid in resolved:
            rec = resolved[pid]
            sy = season_start(season)
            if rec is not None:
                overall = rec["overall"]
                quality01 = (61 - min(overall, 61)) / 60.0
                years = max(0, sy - rec["year"])
                wp = teams.get(prior_season_str(rec["year"]), {}).get(rec["team_id"])
                row.update(
                    {
                        "PED_PICK_QUALITY": 61 - overall,
                        "PED_ROUND_ONE": 1.0 if rec["round"] == 1 else 0.0,
                        "PED_UNDRAFTED": 0.0,
                        "PED_EXPECT_SLOT": expect_slot(overall),
                        "PED_TEAM_WINPCT": wp,
                        "PED_YEARS_SINCE": float(years),
                        "PED_PICK_DECAY": round(quality01 * math.exp(-years / DECAY_YEARS), 4),
                    }
                )
            else:
                years = max(0, sy - first_year[pid])
                row.update(
                    {
                        "PED_PICK_QUALITY": None,
                        "PED_ROUND_ONE": 0.0,
                        "PED_UNDRAFTED": 1.0,
                        "PED_EXPECT_SLOT": EXPECT_UNDRAFTED,
                        "PED_TEAM_WINPCT": None,
                        "PED_YEARS_SINCE": float(years),
                        "PED_PICK_DECAY": 0.0,
                    }
                )
        entries.append(row)

    n_drafted = sum(1 for r in resolved.values() if r is not None)
    n_undrafted = sum(1 for r in resolved.values() if r is None)
    covered_rows = sum(1 for e in entries if "PED_UNDRAFTED" in e)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "built": time.strftime("%Y-%m-%d"),
                "cache": cache_path.name,
                "cache_complete": complete,
                "coverage": {
                    "players_drafted": n_drafted,
                    "players_undrafted": n_undrafted,
                    "players_unmatched_masked": unmatched,
                    "rows_without_player_id": no_pid_rows,
                    "records_without_person_id": no_person_id,
                    "rows_covered": covered_rows,
                    "rows_total": len(entries),
                },
                "players": entries,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    # Transparent per-player draft facts for game surfaces (Steals of the
    # Draft) — ONLY from a complete cache, never the partial fixture.
    if complete and n_drafted:
        # The served surface is keyed by display name. A name two PLAYER_IDs
        # share (12 such names: Gary Payton / Payton II, both Tim Hardaways,
        # ...) shows the earliest-debut player under the name, as it did when
        # this was resolved by name; players_by_pid carries every player for a
        # pid-aware front end.
        name_of: dict[int, str] = {}
        for p in sorted(players, key=lambda p: season_start(p["season"])):
            pid = pid_of(p)
            if pid is not None:
                name_of.setdefault(pid, p["name"])
        asset_players = {}
        asset_by_pid = {}
        for pid, rec in sorted(resolved.items(), key=lambda kv: (first_year[kv[0]], kv[0]), reverse=True):
            name = name_of[pid]
            if rec is None:
                asset_players[name] = {
                    "undrafted": True,
                    "overall": None,
                    "round": None,
                    "pick": None,
                    "expect_slot": EXPECT_UNDRAFTED,
                    "draft_year": None,
                    "team": None,
                }
            else:
                asset_players[name] = {
                    "undrafted": False,
                    "overall": rec["overall"],
                    "round": rec["round"],
                    "pick": rec["pick"],
                    "expect_slot": expect_slot(rec["overall"]),
                    "draft_year": rec["year"],
                    "team": rec.get("team_abbr") or None,
                }
            asset_by_pid[str(pid)] = {"name": name, **asset_players[name]}
        ASSET_OUT.parent.mkdir(parents=True, exist_ok=True)
        ASSET_OUT.write_text(
            json.dumps(
                {
                    "built": time.strftime("%Y-%m-%d"),
                    "note": (
                        "per-player draft pick + stated rookie-scale expectation "
                        "slot (#1 = 1.0). Pairs with assets/skills.json for the "
                        "Steals of the Draft surface. Source: stats.nba.com."
                    ),
                    "players": asset_players,
                    "players_by_pid": dict(sorted(asset_by_pid.items(), key=lambda kv: int(kv[0]))),
                },
                separators=(",", ":"),
            ),
            encoding="utf-8",
        )
        asset_msg = f"wrote {shown(ASSET_OUT)} ({len(asset_players)} players)"
    else:
        asset_msg = "assets/pedigree.json NOT written (partial cache — Steals of the Draft surface stays dormant)"

    print(
        f"pedigree: {n_drafted} drafted, {n_undrafted} undrafted, "
        f"{unmatched} unmatched (masked) of {len(first_year)} players; "
        f"{covered_rows}/{len(entries)} rows covered "
        f"(cache complete={complete})"
    )
    print(f"wrote {shown(OUT)}; {asset_msg}")


if __name__ == "__main__":
    main()

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
the cache is marked complete and spans his entry window; against a partial
cache (e.g. the committed example fixture) unmatched players are fully
masked instead of being mislabeled undrafted.

Name collisions: the cache stores a LIST per norm_name (e.g. both Tim
Hardaways); the record whose draft year is the latest one <= the player's
first charted season year wins.

Run:  python pipeline/build_pedigree.py [--cache PATH] [--fixture]
Output: pipeline/data/pedigree.json (consumed by integrate_context.py)
"""

from __future__ import annotations

import argparse
import json
import math
import re
import time
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VECTORS = ROOT / "assets" / "vectors.json"
CACHE_DIR = ROOT / "pipeline" / "cache"
DRAFT_CACHE = CACHE_DIR / "draft_history.json"
DRAFT_FIXTURE = CACHE_DIR / "draft_history.example.json"
OUT = ROOT / "pipeline" / "data" / "pedigree.json"

DECAY_YEARS = 4.0  # e-folding of entry expectations

# Stated expectation curve: CBA rookie-scale shape normalized to pick #1.
# Log-linear interpolation between anchors; round 2 flat; undrafted floor.
EXPECT_ANCHORS = [
    (1, 1.00), (2, 0.90), (3, 0.81), (4, 0.73), (5, 0.66), (7, 0.55),
    (10, 0.44), (14, 0.35), (18, 0.28), (21, 0.25), (25, 0.22), (30, 0.19),
]
EXPECT_ROUND2 = 0.10
EXPECT_UNDRAFTED = 0.06


def norm_name(name: str) -> str:
    """Same accent-folding norm as fetch_draft_history.py (join contract)."""
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[.'’-]", "", s.lower())
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    return re.sub(r"\s+", " ", s)


def expect_slot(overall: int) -> float:
    if overall > 30:
        return EXPECT_ROUND2
    if overall <= EXPECT_ANCHORS[0][0]:
        return EXPECT_ANCHORS[0][1]
    for (p0, v0), (p1, v1) in zip(EXPECT_ANCHORS, EXPECT_ANCHORS[1:]):
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
        idx[season] = {int(r["TEAM_ID"]): float(r["W_PCT"])
                       for r in rows if r.get("W_PCT") is not None}
    return idx


def pick_record(recs: list[dict], first_year: int) -> dict | None:
    """Latest draft at or before the player's first charted season year."""
    eligible = [r for r in recs if r["year"] <= first_year]
    return max(eligible, key=lambda r: r["year"]) if eligible else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=None,
                    help="draft cache path (default pipeline/cache/draft_history.json)")
    ap.add_argument("--fixture", action="store_true",
                    help="use the committed example fixture (tests)")
    args = ap.parse_args()

    cache_path = Path(args.cache) if args.cache else (
        DRAFT_FIXTURE if args.fixture else DRAFT_CACHE)
    if not cache_path.exists():
        raise SystemExit(
            f"no draft cache at {cache_path} — run pipeline/fetch_draft_history.py "
            "on an operator machine (or pass --fixture for the test fixture)")

    draft = json.loads(cache_path.read_text(encoding="utf-8"))
    complete = bool(draft.get("complete"))
    dmin, dmax = (draft.get("years") or [None, None])

    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    players = vec["players"]

    first_year: dict[str, int] = {}
    for p in players:
        y = season_start(p["season"])
        first_year[p["name"]] = min(first_year.get(p["name"], 9999), y)

    teams = team_winpct_index()

    resolved: dict[str, dict | None] = {}   # name -> draft record | None(=undrafted)
    unmatched = 0
    for name, fy in first_year.items():
        recs = draft["players"].get(norm_name(name))
        if recs:
            rec = pick_record(recs, fy)
            if rec is not None:
                resolved[name] = rec
                continue
        if complete and dmin is not None and dmin <= fy <= (dmax or fy) + 1:
            resolved[name] = None  # confidently undrafted
        else:
            unmatched += 1  # partial cache -> masked, never mislabeled

    entries = []
    for p in players:
        name, season = p["name"], p["season"]
        row: dict = {"name": name, "season": season}
        if name in resolved:
            rec = resolved[name]
            sy = season_start(season)
            if rec is not None:
                overall = rec["overall"]
                quality01 = (61 - min(overall, 61)) / 60.0
                years = max(0, sy - rec["year"])
                wp = teams.get(prior_season_str(rec["year"]), {}).get(rec["team_id"])
                row.update({
                    "PED_PICK_QUALITY": 61 - overall,
                    "PED_ROUND_ONE": 1.0 if rec["round"] == 1 else 0.0,
                    "PED_UNDRAFTED": 0.0,
                    "PED_EXPECT_SLOT": expect_slot(overall),
                    "PED_TEAM_WINPCT": wp,
                    "PED_YEARS_SINCE": float(years),
                    "PED_PICK_DECAY": round(quality01 * math.exp(-years / DECAY_YEARS), 4),
                })
            else:
                years = max(0, sy - first_year[name])
                row.update({
                    "PED_PICK_QUALITY": None,
                    "PED_ROUND_ONE": 0.0,
                    "PED_UNDRAFTED": 1.0,
                    "PED_EXPECT_SLOT": EXPECT_UNDRAFTED,
                    "PED_TEAM_WINPCT": None,
                    "PED_YEARS_SINCE": float(years),
                    "PED_PICK_DECAY": 0.0,
                })
        entries.append(row)

    n_drafted = sum(1 for r in resolved.values() if r is not None)
    n_undrafted = sum(1 for r in resolved.values() if r is None)
    covered_rows = sum(1 for e in entries if "PED_UNDRAFTED" in e)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "built": time.strftime("%Y-%m-%d"),
        "cache": cache_path.name,
        "cache_complete": complete,
        "coverage": {
            "players_drafted": n_drafted,
            "players_undrafted": n_undrafted,
            "players_unmatched_masked": unmatched,
            "rows_covered": covered_rows,
            "rows_total": len(entries),
        },
        "players": entries,
    }, separators=(",", ":")), encoding="utf-8")

    print(f"pedigree: {n_drafted} drafted, {n_undrafted} undrafted, "
          f"{unmatched} unmatched (masked) of {len(first_year)} players; "
          f"{covered_rows}/{len(entries)} rows covered "
          f"(cache complete={complete})")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

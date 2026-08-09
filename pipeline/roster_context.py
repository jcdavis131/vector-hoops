"""VH-104: roster-season context from game logs + era-z profiles.

Method (stated in the artifact — roster-season co-membership, not
shared-floor minutes):

- Unit = charted player on a team-season (>=800 min, vectors.json profile).
- Minutes + TEAM_ID from VH-101 game logs when pipeline/data/gamelogs_*.jsonl
  exist; seasons without logs are skipped (no team join in vectors alone).
- ROSTER_MIN_RANK — minutes rank on team (1 = most).
- ROSTER_USAGE_CROWD — Herfindahl index of top-5 minute shares on team.
- ROSTER_COMPLEMENT — mean(1 - |cos(player, mate)|) over rotation mates.
- ROSTER_STAR_GAP — 1 - cos(player, top-minute teammate profile).
- ROSTER_MATES_N — count of rotation mates (>=800 min, charted).

Lineup on/off would be better for true chemistry lift — stated limitation.

Run: python pipeline/roster_context.py
"""

from __future__ import annotations

import json
import math
import statistics
from collections import defaultdict
from pathlib import Path

from name_utils import canonical_name

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
ASSETS = HERE.parent / "assets"
OUT = DATA / "roster_context.json"

ROTATION_MIN = 800
TOP_N_HHI = 5


def cos(a: list[float], b: list[float]) -> float:
    num = sum(x * y for x, y in zip(a, b, strict=False))
    da = math.sqrt(sum(x * x for x in a)) or 1.0
    db = math.sqrt(sum(x * x for x in b)) or 1.0
    return num / (da * db)


def hhi_top_n(minutes: list[float], n: int = TOP_N_HHI) -> float:
    total = sum(minutes)
    if total <= 0:
        return 0.0
    shares = sorted((m / total for m in minutes if m > 0), reverse=True)[:n]
    return sum(s * s for s in shares)


def load_team_rosters(season: str) -> dict[int, list[dict]]:
    path = DATA / f"gamelogs_{season}.jsonl"
    if not path.exists():
        return {}
    by_key: dict[tuple[int, str], dict] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        g = json.loads(line)
        if not g.get("MIN") or not g.get("PLAYER_NAME"):
            continue
        key = (g["TEAM_ID"], g["PLAYER_NAME"])
        cname = canonical_name(g["PLAYER_NAME"])
        rec = by_key.setdefault(
            key,
            {
                "name": cname,
                "team_id": g["TEAM_ID"],
                "team": g["TEAM_ABBREVIATION"],
                "min": 0.0,
            },
        )
        rec["min"] += g["MIN"]
        rec["team"] = g["TEAM_ABBREVIATION"]
    by_team: dict[int, list[dict]] = defaultdict(list)
    for rec in by_key.values():
        by_team[rec["team_id"]].append(rec)
    return by_team


def compute_season(
    season: str,
    vindex: dict[tuple[str, str], dict],
) -> list[dict]:
    entries: list[dict] = []
    for roster in load_team_rosters(season).values():
        roster.sort(key=lambda r: -r["min"])
        usage_crowd = round(hhi_top_n([r["min"] for r in roster[:TOP_N_HHI]]), 4)
        charted = [r for r in roster if r["min"] >= ROTATION_MIN and (r["name"], season) in vindex]
        if not charted:
            continue
        for subject in charted:
            sv = vindex[(subject["name"], season)]["v"]
            mates = [m for m in charted if m["name"] != subject["name"]]
            star = next((r for r in roster if r["name"] != subject["name"]), None)
            star_gap = None
            if star and (star["name"], season) in vindex:
                star_gap = round(1.0 - cos(sv, vindex[(star["name"], season)]["v"]), 4)
            comp = [1.0 - abs(cos(sv, vindex[(m["name"], season)]["v"])) for m in mates]
            entries.append(
                {
                    "name": subject["name"],
                    "season": season,
                    "team": subject["team"],
                    "teamId": subject["team_id"],
                    "minutes": round(subject["min"], 1),
                    "ROSTER_MIN_RANK": 1 + sum(1 for r in roster if r["min"] > subject["min"]),
                    "ROSTER_USAGE_CROWD": usage_crowd,
                    "ROSTER_COMPLEMENT": round(statistics.mean(comp), 4) if comp else None,
                    "ROSTER_STAR_GAP": star_gap,
                    "ROSTER_MATES_N": len(mates),
                }
            )
    return entries


def main() -> None:
    vec = json.loads((ASSETS / "vectors.json").read_text(encoding="utf-8"))
    vindex = {(p["name"], p["season"]): p for p in vec["players"]}

    log_files = sorted(DATA.glob("gamelogs_*.jsonl"))
    all_entries: list[dict] = []
    seasons: list[str] = []
    for f in log_files:
        season = f.stem.split("_", 1)[1]
        batch = compute_season(season, vindex)
        all_entries.extend(batch)
        seasons.append(season)
        print(f"{season}: {len(batch)} roster rows")

    method = (
        f"roster-season co-membership (VH-104): charted player (>={ROTATION_MIN} "
        "min on team) with era-z profile; minutes from VH-101 game logs by "
        "TEAM_ID when gamelogs exist; rotation mates = teammates >=800 min "
        "also charted; ROSTER_USAGE_CROWD = HHI of top-5 minute shares; "
        "ROSTER_COMPLEMENT = mean(1-|cos|) to mates (chemistry measure); "
        "ROSTER_STAR_GAP = 1-cos to highest-minute teammate; not shared-floor "
        "minutes — lineup on/off would be better (stated limitation)"
    )

    payload = {
        "method": method,
        "rotationMinutesThreshold": ROTATION_MIN,
        "gamelogSeasons": seasons,
        "entries": all_entries,
        "summary": {"playerTeamSeasons": len(all_entries), "seasons": len(seasons)},
    }

    DATA.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"\n{len(all_entries)} rows -> {OUT.relative_to(HERE.parent)}")
    if not log_files:
        print("note: no gamelogs_*.jsonl — run fetch_gamelogs.py (VH-101)")


if __name__ == "__main__":
    main()

"""Derive player-season eligibility gates from observed GP / minutes distributions.

Uses pipeline/data/gamelogs_*.jsonl (ground-truth game counts) and compares
retention vs assets/vectors.json. Goal: keep most rotation/role players,
drop small-sample per-100 outliers (low GP or low total minutes).

Run:  python pipeline/compute_eligibility_gates.py
"""

from __future__ import annotations

import json
import math
from collections import defaultdict
from pathlib import Path

from eligibility import (
    derive_min_gp,
    derive_min_total_minutes,
    reliability_score,
    season_eligible,
    season_games,
)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "pipeline" / "data"
VECTORS = ROOT / "assets" / "vectors.json"


def load_gamelog_seasons() -> dict[tuple[int, str], dict]:
    """Aggregate GP + total minutes per (PLAYER_ID, season) from jsonl logs."""
    out: dict[tuple[int, str], dict] = {}
    for path in sorted(DATA.glob("gamelogs_*.jsonl")):
        season = path.stem.replace("gamelogs_", "")
        games: dict[int, list[float]] = defaultdict(list)
        names: dict[int, str] = {}
        with path.open(encoding="utf-8") as f:
            for line in f:
                try:
                    g = json.loads(line)
                except json.JSONDecodeError:
                    continue
                mins = g.get("MIN") or 0
                if mins <= 0:
                    continue
                pid = g.get("PLAYER_ID")
                if pid is None:
                    continue
                pid = int(pid)
                games[pid].append(float(mins))
                names[pid] = g.get("PLAYER_NAME", "")
        for pid, mins_list in games.items():
            gp = len(mins_list)
            total = sum(mins_list)
            out[(pid, season)] = {
                "name": names[pid],
                "gp": gp,
                "total_min": total,
                "mpg": total / gp,
                "reliability": reliability_score(gp, total),
            }
    return out


def eligible(gp: int, total_min: float, season: str) -> bool:
    mpg = total_min / gp if gp else 0
    return season_eligible(gp, mpg, season=season, schedule_aware=True)


def pctile(vals: list[float], p: float) -> float:
    if not vals:
        return 0.0
    s = sorted(vals)
    k = (len(s) - 1) * p
    lo, hi = math.floor(k), math.ceil(k)
    if lo == hi:
        return s[lo]
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def main() -> None:
    logs = load_gamelog_seasons()
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    {(p["name"].lower(), p["season"]) for p in vec["players"]}

    print(f"gamelog player-seasons: {len(logs)}")
    print(f"vectors.json rows: {len(vec['players'])}\n")

    print("Derived gates by season (schedule-aware):")
    sample_seasons = ["1998-99", "2011-12", "2019-20", "2020-21", "2023-24", "2024-25"]
    for s in sample_seasons:
        print(
            f"  {s} ({season_games(s)} sched): "
            f"min_gp={derive_min_gp(s)}, min_total_min={derive_min_total_minutes(s)}"
        )

    # Per-season retention on gamelog ground truth
    by_season: dict[str, list[dict]] = defaultdict(list)
    for (_, season), row in logs.items():
        by_season[season].append(row)

    print("\nGamelog retention (derived gates vs fixed GP=20 / min=800 legacy):")
    for season in sorted(by_season):
        rows = by_season[season]
        n = len(rows)
        new_keep = sum(1 for r in rows if eligible(r["gp"], r["total_min"], season))
        leg_keep = sum(1 for r in rows if r["gp"] >= 20 and r["total_min"] >= 800)
        # "rotation proxy" = top 70% of reliability within season
        rels = [r["reliability"] for r in rows]
        rot_cut = pctile(rels, 0.30) if rels else 0
        rotation = sum(1 for r in rows if r["reliability"] >= rot_cut)
        new_in_rot = sum(
            1
            for r in rows
            if eligible(r["gp"], r["total_min"], season) and r["reliability"] >= rot_cut
        )
        print(
            f"  {season}: n={n}  derived={new_keep} ({100 * new_keep / n:.0f}%)  "
            f"legacy={leg_keep} ({100 * leg_keep / n:.0f}%)  "
            f"rotation~70%={rotation}  derived_and_rot={new_in_rot}"
        )

    # Reliability distribution: where does the long tail end?
    all_rel = [r["reliability"] for r in logs.values()]
    print("\nReliability sqrt(GP*total_min) percentiles (gamelogs):")
    for p in (0.05, 0.10, 0.20, 0.30, 0.50, 0.70):
        print(f"  p{int(p * 100):02d}: {pctile(all_rel, p):.0f}")

    # Fixed gate comparison on pooled gamelogs
    rows_all = list(logs.values())
    n = len(rows_all)
    gates = [
        ("derived (schedule-aware)", lambda r, s: eligible(r["gp"], r["total_min"], s)),
        ("GP>=10 min>=450", lambda r, s: r["gp"] >= 10 and r["total_min"] >= 450),
        ("GP>=12 min>=500", lambda r, s: r["gp"] >= 12 and r["total_min"] >= 500),
        ("GP>=15 min>=500", lambda r, s: r["gp"] >= 15 and r["total_min"] >= 500),
        (
            "GP>=20 min>=800 (legacy)",
            lambda r, s: r["gp"] >= 20 and r["total_min"] >= 800,
        ),
    ]
    print("\nPooled gamelog retention:")
    for label, fn in gates:
        # season passed via key lookup — re-walk with season
        kept = 0
        for (_pid, season), row in logs.items():
            if fn(row, season):
                kept += 1
        print(f"  {label}: {kept}/{n} ({100 * kept / n:.1f}%)")

    # Show borderline examples excluded by legacy but kept by derived
    print("\nExamples kept by derived, dropped by legacy (2024-25 gamelogs):")
    shown = 0
    for (_pid, season), row in sorted(logs.items(), key=lambda x: -x[1]["reliability"]):
        if season != "2024-25":
            continue
        if eligible(row["gp"], row["total_min"], season) and not (
            row["gp"] >= 20 and row["total_min"] >= 800
        ):
            print(
                f"  {row['name']}: {row['gp']} gp, {row['total_min']:.0f} min, "
                f"rel={row['reliability']:.0f}"
            )
            shown += 1
            if shown >= 8:
                break


if __name__ == "__main__":
    main()

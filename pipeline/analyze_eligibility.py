"""Quick eligibility impact report using playoffs.rs GP/MIN vs current vectors.json."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
sys.path.insert(0, str(ROOT / "pipeline"))
from build_vectors import norm_name  # noqa: E402
from eligibility import derive_min_gp, derive_min_total_minutes, season_eligible  # noqa: E402


def main() -> None:
    players = json.loads((ROOT / "assets" / "vectors.json").read_text())["players"]
    idx: dict[tuple[str, str], dict] = {}
    for p in CACHE.glob("playoffs_*.json"):
        if "example" in p.name:
            continue
        d = json.loads(p.read_text(encoding="utf-8"))
        season = d["season"]
        for k, v in d.get("players", {}).items():
            idx[(k, season)] = v.get("rs") or {}

    stats: list[tuple[str, int, float]] = []
    for pl in players:
        rs = idx.get((norm_name(pl["name"]), pl["season"]), {})
        if rs.get("GP") and rs.get("MIN"):
            gp = int(rs["GP"])
            total = float(gp) * float(rs["MIN"])
            stats.append((pl["season"], gp, total))

    print(f"current rows: {len(players)}")
    print(f"playoffs rs matched: {len(stats)}")
    gates = [
        ("schedule-aware (default)", True),
        ("GP>=20 min>=800 (legacy)", False),
    ]
    for label, aware in gates:
        n = sum(
            1 for season, gp, total in stats
            if season_eligible(gp, total / gp if gp else 0, season=season,
                               schedule_aware=aware,
                               min_gp=20 if not aware else None,
                               min_total_minutes=800 if not aware else None)
        )
        print(f"  {label}: {n} ({100 * n / len(players):.1f}% universe)")

    print("\nSchedule-aware gates by season (sample):")
    for s in ("1998-99", "2011-12", "2023-24", "2024-25"):
        print(f"  {s}: gp>={derive_min_gp(s)}, total_min>={derive_min_total_minutes(s)}")


if __name__ == "__main__":
    main()

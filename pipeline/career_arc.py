"""Career arc features per player-season (MTNN v4 career tower).

YEAR_IN_LEAGUE, LAG1_COSINE, DELTA_NORM, GP_RATIO, DRAFT_SLOT_Z.
Output: pipeline/data/career_arc.json

Run:  python pipeline/career_arc.py [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "data" / "career_arc.json"


def norm_name(name: str) -> str:
    s = re.sub(r"[.'’-]", "", name.lower())
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    return re.sub(r"\s+", " ", s)


def vec_cos(a: list[float], b: list[float]) -> float:
    num = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(x * x for x in b)) or 1.0
    return num / (na * nb)


def load_gp_ratios() -> dict[tuple[str, str], float]:
    ratios: dict[tuple[str, str], float] = {}
    for path in sorted(HERE.glob("data/gamelogs_*.jsonl")):
        season = path.stem.split("_", 1)[1]
        gp: dict[tuple[int, str], int] = defaultdict(int)
        roster: dict[int, set[str]] = defaultdict(set)
        for line in path.read_text(encoding="utf-8").splitlines():
            g = json.loads(line)
            if not g.get("MIN"):
                continue
            gp[(g["TEAM_ID"], g["PLAYER_NAME"])] += 1
            roster[g["TEAM_ID"]].add(g["PLAYER_NAME"])
        for tid, names in roster.items():
            mean = sum(gp[(tid, n)] for n in names) / len(names)
            if mean > 0:
                for n in names:
                    ratios[(n, season)] = round(gp[(tid, n)] / mean, 4)
    return ratios


def load_draft_z() -> dict[tuple[str, str], float]:
    raw: dict[tuple[str, str], float] = {}
    pools: dict[str, list[float]] = defaultdict(list)
    for path in sorted((HERE / "cache").glob("bio_*.json")):
        season = path.stem.split("_", 1)[1]
        for row in json.loads(path.read_text(encoding="utf-8")):
            if row.get("DRAFT_NUMBER") is None or not row.get("PLAYER_NAME"):
                continue
            pick = float(row["DRAFT_NUMBER"])
            key = (norm_name(row["PLAYER_NAME"]), season)
            raw[key] = pick
            pools[season].append(pick)
    out: dict[tuple[str, str], float] = {}
    for key, pick in raw.items():
        vals = pools[key[1]]
        if len(vals) < 2:
            continue
        mu = sum(vals) / len(vals)
        sd = math.sqrt(sum((v - mu) ** 2 for v in vals) / len(vals)) or 1.0
        out[key] = round((pick - mu) / sd, 4)
    return out


def build_rows(players: list[dict], gp: dict, draft_z: dict) -> list[dict]:
    by_name: dict[str, list[dict]] = defaultdict(list)
    for p in players:
        by_name[p["name"]].append(p)
    for rows in by_name.values():
        rows.sort(key=lambda p: int(p["season"][:4]))
    out: list[dict] = []
    for name, rows in by_name.items():
        for i, p in enumerate(rows):
            row = {"id": p["id"], "name": name, "season": p["season"],
                   "YEAR_IN_LEAGUE": i + 1}
            if i:
                prev, cur = rows[i - 1]["v"], p["v"]
                row["LAG1_COSINE"] = round(vec_cos(cur, prev), 4)
                row["DELTA_NORM"] = round(math.sqrt(sum((a - b) ** 2
                                                        for a, b in zip(cur, prev))), 4)
            if (name, p["season"]) in gp:
                row["GP_RATIO"] = gp[(name, p["season"])]
            dz = draft_z.get((norm_name(name), p["season"]))
            if dz is not None:
                row["DRAFT_SLOT_Z"] = dz
            out.append(row)
    return sorted(out, key=lambda r: (int(r["season"][:4]), r["name"]))


def main() -> None:
    ap = argparse.ArgumentParser(description="Build career arc features")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    players = json.loads((HERE.parent / "assets" / "vectors.json")
                         .read_text(encoding="utf-8"))["players"]
    gp, draft_z = load_gp_ratios(), load_draft_z()
    rows = build_rows(players, gp, draft_z)
    print(f"{len(rows)} rows | LAG1 {sum('LAG1_COSINE' in r for r in rows)} | "
          f"GP {sum('GP_RATIO' in r for r in rows)} | "
          f"DRAFT {sum('DRAFT_SLOT_Z' in r for r in rows)}")
    if args.dry_run:
        print("sample:", next(r for r in rows if "LAG1_COSINE" in r))
        return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "method": ("charted-season index; lag cosine/norm vs prior season; "
                   "GP_RATIO from gamelogs; DRAFT_SLOT_Z from bio cache (undrafted=61)"),
        "source": "assets/vectors.json + cache/bio_* + gamelogs",
        "gamelogSeasons": sorted({s for _, s in gp}),
        "bioSeasons": sorted({s for _, s in draft_z}),
        "players": rows,
    }, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()

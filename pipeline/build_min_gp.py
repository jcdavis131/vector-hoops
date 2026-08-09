"""Honest per-game minutes + games played per player-season.

vectors.json ``mpg`` is NOT minutes per game — build_vectors fetches the Base
dashboard with per_mode Per100Possessions, so its MIN is minutes/100 poss
(max ~57). This script produces real MPG/GP:

  * 2015-16 onward: derived from pipeline/data/gamelogs_<season>.jsonl
    (sum MIN / games with MIN>0) — zero network.
  * earlier seasons: LeagueDashPlayerStats PerGame, cached as
    pipeline/cache/pergame_<season>.json.

Output: pipeline/data/min_gp.json
  {"players": [{"player_id", "name", "season", "MPG", "GP"}, ...]}

Run:  python pipeline/build_min_gp.py [--offline]
"""

from __future__ import annotations

import argparse
import json
import math
import random
import time
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
CACHE = HERE / "cache"
OUT = DATA / "min_gp.json"

SEASONS = [f"{y}-{str(y + 1)[-2:]}" for y in range(1996, 2026)]


def from_gamelogs(path: Path, season: str) -> list[dict]:
    tot_min: dict[int, float] = defaultdict(float)
    gp: dict[int, int] = defaultdict(int)
    name_of: dict[int, str] = {}
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            g = json.loads(line)
            # Regular season only: GAME_ID prefix 002 (001=preseason,
            # 003=all-star, 004=playoffs, 005=play-in, 006=cup final)
            if not str(g.get("GAME_ID") or "").startswith("002"):
                continue
            pid = g.get("PLAYER_ID")
            m = g.get("MIN")
            if pid is None or not m or float(m) <= 0:
                continue
            pid = int(pid)
            tot_min[pid] += float(m)
            gp[pid] += 1
            if g.get("PLAYER_NAME"):
                name_of[pid] = str(g["PLAYER_NAME"])
    return [
        {
            "player_id": pid,
            "name": name_of.get(pid, ""),
            "season": season,
            "MPG": round(tot_min[pid] / gp[pid], 2),
            "GP": gp[pid],
        }
        for pid in sorted(tot_min)
    ]


def from_api(season: str, offline: bool) -> list[dict] | None:
    cache_p = CACHE / f"pergame_{season}.json"
    if cache_p.exists():
        try:
            return json.loads(cache_p.read_text(encoding="utf-8"))
        except Exception:
            pass
    if offline:
        return None
    from nba_api.stats.endpoints import leaguedashplayerstats

    for attempt in range(5):
        try:
            r = leaguedashplayerstats.LeagueDashPlayerStats(
                season=season,
                per_mode_detailed="PerGame",
                measure_type_detailed_defense="Base",
                timeout=75,
            )
            df = r.get_data_frames()[0]
            rows = []
            for _, x in df.iterrows():
                mpg = x.get("MIN")
                gp = x.get("GP")
                if mpg is None or gp is None:
                    continue
                if isinstance(mpg, float) and math.isnan(mpg):
                    continue
                rows.append(
                    {
                        "player_id": int(x["PLAYER_ID"]),
                        "name": str(x.get("PLAYER_NAME") or ""),
                        "season": season,
                        "MPG": round(float(mpg), 2),
                        "GP": int(gp),
                    }
                )
            CACHE.mkdir(parents=True, exist_ok=True)
            cache_p.write_text(json.dumps(rows, separators=(",", ":")), encoding="utf-8")
            time.sleep(1.2)
            return rows
        except Exception as e:
            wait = min(120, (2**attempt) * 8) + random.uniform(0, 4)
            print(
                f"  {season}: attempt {attempt + 1}/5 failed ({type(e).__name__}); sleeping {wait:.0f}s",
                flush=True,
            )
            time.sleep(wait)
    print(f"  {season}: EXHAUSTED retries — skipped (rerun resumes)", flush=True)
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true")
    args = ap.parse_args()

    all_rows: list[dict] = []
    missing: list[str] = []
    for season in SEASONS:
        logs = DATA / f"gamelogs_{season}.jsonl"
        if logs.exists():
            rows = from_gamelogs(logs, season)
            src = "gamelogs"
        else:
            rows = from_api(season, args.offline)
            src = "pergame api/cache"
        if not rows:
            missing.append(season)
            continue
        mx = max(r["MPG"] for r in rows)
        if mx > 48.0:
            raise SystemExit(f"{season}: MPG max {mx} > 48 — source is not per-game, abort")
        all_rows.extend(rows)
        print(f"{season}: {len(rows)} players (max MPG {mx}) via {src}", flush=True)

    if missing:
        print(f"WARNING missing seasons: {missing}", flush=True)

    OUT.write_text(
        json.dumps(
            {
                "method": (
                    "Honest per-game MPG/GP. gamelogs-derived where available "
                    "(2015-16+), LeagueDashPlayerStats PerGame otherwise. "
                    "vectors.json mpg is minutes/100 possessions — do not use."
                ),
                "n": len(all_rows),
                "players": all_rows,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"wrote {OUT} rows={len(all_rows)}")


if __name__ == "__main__":
    main()

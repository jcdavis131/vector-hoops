"""Games-missed / availability table per player-season.

Injury-proxy layer for the career GP head and trade-surplus trust:

  GP_PCT              GP / primary-team schedule games (clipped to 1)
  MISS_N              schedule games minus GP (>=0)
  LONGEST_MISS_STREAK max consecutive primary-team games missed between the
                      player's first and last appearance (gamelogs era only —
                      distinguishes one long injury from scattered DNPs)
  MISS_SPELLS         number of distinct missed spells >= 3 games (era only)

Sources:
  * 2015-16+ : pipeline/data/gamelogs_<season>.jsonl (regular season 002)
  * earlier  : pipeline/data/min_gp.json GP vs known season lengths

Output: pipeline/data/availability.json

Run:  python pipeline/build_availability.py
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
OUT = DATA / "availability.json"

SEASON_LENGTH = {"1998-99": 50, "2011-12": 66}  # lockouts; default 82
SEASONS = [f"{y}-{str(y + 1)[-2:]}" for y in range(1996, 2026)]


def season_games(season: str) -> int:
    return SEASON_LENGTH.get(season, 82)


def from_gamelogs(path: Path, season: str) -> list[dict]:
    # team -> ordered game ids; player -> team -> set(game ids); names
    team_games: dict[int, list[tuple[str, str]]] = defaultdict(list)
    seen_tg: set[tuple[int, str]] = set()
    player_games: dict[int, dict[int, set[str]]] = defaultdict(lambda: defaultdict(set))
    name_of: dict[int, str] = {}

    with path.open(encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            g = json.loads(line)
            gid = str(g.get("GAME_ID") or "")
            if not gid.startswith("002"):
                continue
            tid = g.get("TEAM_ID")
            pid = g.get("PLAYER_ID")
            if tid is None or pid is None:
                continue
            tid, pid = int(tid), int(pid)
            date = str(g.get("GAME_DATE") or "")
            if (tid, gid) not in seen_tg:
                seen_tg.add((tid, gid))
                team_games[tid].append((date, gid))
            if g.get("MIN") and float(g["MIN"]) > 0:
                player_games[pid][tid].add(gid)
                if g.get("PLAYER_NAME"):
                    name_of[pid] = str(g["PLAYER_NAME"])

    for tid in team_games:
        team_games[tid].sort()

    rows = []
    for pid, by_team in player_games.items():
        gp = sum(len(s) for s in by_team.values())
        if gp == 0:
            continue
        primary = max(by_team, key=lambda t: len(by_team[t]))
        sched = [gid for _, gid in team_games[primary]]
        played = by_team[primary]
        # Window: between first and last appearance on the primary team
        idxs = [i for i, gid in enumerate(sched) if gid in played]
        longest = 0
        spells = 0
        if idxs:
            run = 0
            for i in range(idxs[0], idxs[-1] + 1):
                if sched[i] in played:
                    if run >= 3:
                        spells += 1
                    longest = max(longest, run)
                    run = 0
                else:
                    run += 1
            if run >= 3:
                spells += 1
            longest = max(longest, run)
        n_sched = len(sched) or season_games(season)
        rows.append(
            {
                "player_id": pid,
                "name": name_of.get(pid, ""),
                "season": season,
                "GP": gp,
                "TEAM_GAMES": n_sched,
                "GP_PCT": round(min(1.0, gp / n_sched), 4),
                "MISS_N": max(0, n_sched - gp),
                "LONGEST_MISS_STREAK": longest,
                "MISS_SPELLS": spells,
            }
        )
    return rows


def from_min_gp(min_gp_rows: list[dict], season: str) -> list[dict]:
    n = season_games(season)
    rows = []
    for r in min_gp_rows:
        if r["season"] != season:
            continue
        gp = int(r["GP"])
        rows.append(
            {
                "player_id": int(r["player_id"]),
                "name": r.get("name", ""),
                "season": season,
                "GP": gp,
                "TEAM_GAMES": n,
                "GP_PCT": round(min(1.0, gp / n), 4),
                "MISS_N": max(0, n - gp),
                "LONGEST_MISS_STREAK": None,
                "MISS_SPELLS": None,
            }
        )
    return rows


def main() -> None:
    # min_gp.json is the pre-gamelog (pre 2015-16) fallback source; the gamelog
    # era carries the richer streak/spell signal. Treat it as optional so a
    # missing fallback never blocks the primary build.
    min_gp_path = DATA / "min_gp.json"
    if min_gp_path.exists():
        min_gp_rows = json.loads(min_gp_path.read_text(encoding="utf-8")).get("players", [])
    else:
        print(
            "note: pipeline/data/min_gp.json missing — pre-gamelog seasons "
            "(pre 2015-16) will be skipped (GP_PCT-only fallback unavailable)",
            flush=True,
        )
        min_gp_rows = []

    all_rows: list[dict] = []
    for season in SEASONS:
        logs = DATA / f"gamelogs_{season}.jsonl"
        if logs.exists():
            rows = from_gamelogs(logs, season)
            src = "gamelogs"
        else:
            rows = from_min_gp(min_gp_rows, season)
            src = "min_gp"
        all_rows.extend(rows)
        streaks = [r["LONGEST_MISS_STREAK"] for r in rows if r["LONGEST_MISS_STREAK"] is not None]
        extra = f" max_streak={max(streaks)}" if streaks else ""
        print(f"{season}: {len(rows)} players via {src}{extra}", flush=True)

    OUT.write_text(
        json.dumps(
            {
                "method": (
                    "Availability per player-season: GP_PCT vs primary-team schedule, "
                    "games missed, longest consecutive missed streak and >=3-game "
                    "spells (gamelogs era 2015-16+; earlier seasons GP_PCT only). "
                    "Injury proxy — no diagnosis source."
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

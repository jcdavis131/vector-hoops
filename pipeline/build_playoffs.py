"""Track I deriver — per player-season postseason features (a distinct regime).

Joins playoff caches to every charted player-season in assets/vectors.json
and derives the `playoffs` tower family. Every value is either a
playoff-only role/availability fact or a playoff-**minus**-regular-season
contrast, so the tower represents what *changes* in the postseason rather
than re-encoding regular-season stats.

Features (raw; integrate_context.py era-z's within the season's playoff pool):

  PO_GP          playoff games played
  PO_MIN         playoff minutes per game (raw playoff role)
  PO_MIN_DELTA   PO MPG - RS MPG (minutes elevation)
  PO_USG_DELTA   PO usage - RS usage (offensive-role shift)
  PO_PTS_DELTA   PO pts/100 - RS pts/100 (scoring riser/fader)
  PO_EFF_DELTA   PO TS% - RS TS% (efficiency under pressure)
  PO_PLUS_MINUS  PO on-court plus-minus per 100
  PO_TEAM_WINS   team playoff wins that postseason (0-16)
  PO_ROUNDS      rounds advanced (0-4) — champion = 4
  PO_SERIES      series played (from game-log path; usually = rounds for exits)
  PO_CLOSE_GAMES games decided by ≤5 pts (player appeared)
  PO_AVG_PTS     mean points in playoff games (box score)
  PO_HIGH_PTS    max points in a single playoff game
  PO_CLUTCH_PTS  points in games decided by ≤5 (0 if none)

Coverage: only player-seasons with >=1 playoff game. A player who did not
appear in the postseason is **masked** (did-not-play != played-badly);
absence in a partial cache is likewise masked, never fabricated.

Inputs:
  pipeline/cache/playoffs_{season}.json       splits + team W/rounds
  pipeline/cache/playoff_games_{season}.json  game logs + series (optional)
  pipeline/cache/playoffs.example.json        fixture for tests

Run:  python pipeline/build_playoffs.py [--fixture]
Output: pipeline/data/playoffs.json (integrate_context);
        assets/playoffs.json (splits + series path when game logs present);
        assets/playoff_paths.json (compact series + game logs for UI).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from nba_http import real_playoff_cache_paths
from name_utils import norm_name

VECTORS = ROOT / "assets" / "vectors.json"
CACHE_DIR = ROOT / "pipeline" / "cache"
FIXTURE = CACHE_DIR / "playoffs.example.json"
OUT = ROOT / "pipeline" / "data" / "playoffs.json"
ASSET_OUT = ROOT / "assets" / "playoffs.json"
PATHS_OUT = ROOT / "assets" / "playoff_paths.json"

CLOSE_MARGIN = 5  # pts — "close game" for clutch-ish box aggregates


def load_caches(use_fixture: bool) -> tuple[dict, dict, bool]:
    """Return (player_index, team_index, complete)."""
    players: dict[tuple[str, str], dict] = {}
    teams: dict[tuple[str, str], dict] = {}
    complete = True

    per_season = real_playoff_cache_paths(CACHE_DIR)
    if per_season and not use_fixture:
        for path in per_season:
            doc = json.loads(path.read_text(encoding="utf-8"))
            season = doc["season"]
            complete = complete and bool(doc.get("complete"))
            for nn, rec in doc.get("players", {}).items():
                players[(season, nn)] = rec
            for tid, rec in doc.get("teams", {}).items():
                teams[(season, str(tid))] = rec
        return players, teams, complete

    if not FIXTURE.exists():
        raise SystemExit(
            f"no playoff caches and no fixture at {FIXTURE} — run "
            "pipeline/fetch_playoffs.py on an operator machine (or --fixture)")
    doc = json.loads(FIXTURE.read_text(encoding="utf-8"))
    complete = bool(doc.get("complete"))
    for season, recs in doc.get("players", {}).items():
        for nn, rec in recs.items():
            players[(season, nn)] = rec
    for season, recs in doc.get("teams", {}).items():
        for tid, rec in recs.items():
            teams[(season, str(tid))] = rec
    return players, teams, complete


def load_game_caches() -> dict[str, dict]:
    """season -> playoff_games_*.json doc (if present)."""
    out: dict[str, dict] = {}
    for path in sorted(CACHE_DIR.glob("playoff_games_*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        out[doc["season"]] = doc
    return out


def team_pts_by_game(team_games: list[dict]) -> dict[str, dict[int, int]]:
    """gameId -> {teamId: pts} for margin calc."""
    by: dict[str, dict[int, int]] = defaultdict(dict)
    for g in team_games:
        by[g["gameId"]][g["teamId"]] = int(g["pts"])
    return by


def player_game_features(
    games: list[dict],
    team_pts: dict[str, dict[int, int]],
) -> dict:
    if not games:
        return {}
    pts_list = [int(g["pts"]) for g in games]
    close_pts = []
    close_n = 0
    for g in games:
        scores = team_pts.get(g["gameId"]) or {}
        if len(scores) < 2:
            continue
        vals = list(scores.values())
        margin = abs(vals[0] - vals[1])
        if margin <= CLOSE_MARGIN:
            close_n += 1
            close_pts.append(int(g["pts"]))
    return {
        "PO_AVG_PTS": round(sum(pts_list) / len(pts_list), 2),
        "PO_HIGH_PTS": float(max(pts_list)),
        "PO_CLOSE_GAMES": float(close_n),
        "PO_CLUTCH_PTS": float(sum(close_pts)) if close_pts else 0.0,
    }


def compact_player_games(games: list[dict]) -> list[dict]:
    return [
        {
            "d": g["date"],
            "m": g["matchup"],
            "wl": g["wl"],
            "min": g["min"],
            "pts": g["pts"],
            "reb": g["reb"],
            "ast": g["ast"],
            "stl": g["stl"],
            "blk": g["blk"],
            "tov": g["tov"],
            "pm": g["plusMinus"],
            "fg": f"{g['fgm']}-{g['fga']}",
            "fg3": f"{g['fg3m']}-{g['fg3a']}",
            "ft": f"{g['ftm']}-{g['fta']}",
        }
        for g in sorted(games, key=lambda x: (x["date"], x["gameId"]))
    ]


def compact_series(series: list[dict], *, champion: bool) -> list[dict]:
    out = []
    n = len(series)
    for i, s in enumerate(series):
        won = s["wins"] > s["losses"]
        # Last series for a champion is the NBA Finals (won).
        is_finals = (i == n - 1 and champion) or s.get("roundLabel") == "Finals"
        label = s["roundLabel"]
        if is_finals and champion and won:
            label = "NBA Finals"
        out.append({
            "round": s["round"],
            "label": label,
            "opp": s["opp"],
            "result": s["result"],
            "wins": s["wins"],
            "losses": s["losses"],
            "won": won,
            "finals": bool(is_finals),
        })
    return out


def delta(a, b):
    return round(a - b, 4) if (a is not None and b is not None) else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixture", action="store_true",
                    help="force the committed example fixture (tests)")
    args = ap.parse_args()

    players_idx, teams_idx, complete = load_caches(args.fixture)
    game_docs = {} if args.fixture else load_game_caches()
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))

    # Index player games: (season, nn) -> list
    player_games_idx: dict[tuple[str, str], list] = defaultdict(list)
    team_pts_idx: dict[str, dict[str, dict[int, int]]] = {}
    for season, doc in game_docs.items():
        team_pts_idx[season] = team_pts_by_game(doc.get("teamGames") or [])
        for g in doc.get("playerGames") or []:
            player_games_idx[(season, g["nn"])].append(g)

    entries = []
    splits = {}
    paths: dict[str, dict] = {}
    appearances = 0
    seasons_seen = set()
    with_path = 0

    for p in vec["players"]:
        name, season = p["name"], p["season"]
        nn = norm_name(name)
        rec = players_idx.get((season, nn))
        if not rec or (rec.get("po", {}).get("GP") or 0) <= 0:
            continue
        po, rs = rec["po"], rec.get("rs", {})
        tid = str(rec.get("team_id") or "")
        team = teams_idx.get((season, tid), {})
        gdoc = game_docs.get(season)
        series = (gdoc or {}).get("seriesByTeam", {}).get(tid) if gdoc else None
        pgames = player_games_idx.get((season, nn), [])
        gfeat = player_game_features(pgames, team_pts_idx.get(season, {})) if pgames else {}

        row = {
            "name": name, "season": season,
            "PO_GP": float(po["GP"]),
            "PO_MIN": float(po["MIN"]),
            "PO_MIN_DELTA": delta(po.get("MIN"), rs.get("MIN")),
            "PO_USG_DELTA": delta(po.get("USG"), rs.get("USG")),
            "PO_PTS_DELTA": delta(po.get("PTS100"), rs.get("PTS100")),
            "PO_EFF_DELTA": delta(po.get("TS"), rs.get("TS")),
            "PO_PLUS_MINUS": float(po.get("PLUS_MINUS") or 0.0),
            "PO_TEAM_WINS": float(team["po_wins"]) if "po_wins" in team else None,
            "PO_ROUNDS": float(team["rounds"]) if "rounds" in team else None,
            "PO_SERIES": float(len(series)) if series is not None else None,
            "PO_CLOSE_GAMES": gfeat.get("PO_CLOSE_GAMES"),
            "PO_AVG_PTS": gfeat.get("PO_AVG_PTS"),
            "PO_HIGH_PTS": gfeat.get("PO_HIGH_PTS"),
            "PO_CLUTCH_PTS": gfeat.get("PO_CLUTCH_PTS"),
        }
        entries.append(row)
        appearances += 1
        seasons_seen.add(season)

        split = {
            "po": po, "rs": rs,
            "wins": team.get("po_wins"), "rounds": team.get("rounds"),
            "pts_delta": row["PO_PTS_DELTA"], "min_delta": row["PO_MIN_DELTA"],
            "usg_delta": row["PO_USG_DELTA"],
        }
        if series is not None:
            champ = int(team.get("rounds") or 0) == 4
            split["series"] = compact_series(series, champion=champ)
            split["champion"] = champ
            with_path += 1
        if pgames:
            paths[f"{name}|{season}"] = {
                "series": split.get("series") or [],
                "games": compact_player_games(pgames),
                "wins": team.get("po_wins"),
                "rounds": team.get("rounds"),
                "champion": int(team.get("rounds") or 0) == 4,
            }
        splits[f"{name}|{season}"] = split

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "built": time.strftime("%Y-%m-%d"),
        "cache_complete": complete,
        "game_logs": bool(game_docs),
        "coverage": {
            "appearances": appearances,
            "seasons_covered": len(seasons_seen),
            "rows_total": len(vec["players"]),
            "with_series_path": with_path,
            "game_log_seasons": len(game_docs),
        },
        "players": entries,
    }, separators=(",", ":")), encoding="utf-8")

    if complete and appearances:
        ASSET_OUT.write_text(json.dumps({
            "built": time.strftime("%Y-%m-%d"),
            "note": (
                "regular-season vs playoff per-100 splits; riser/fader = "
                "PO minus RS pts/100. Series path + game logs from "
                "leaguegamelog when playoff_games_*.json caches exist. "
                "Source: stats.nba.com."
            ),
            "splits": splits,
        }, separators=(",", ":")), encoding="utf-8")
        PATHS_OUT.write_text(json.dumps({
            "built": time.strftime("%Y-%m-%d"),
            "note": "Compact playoff series path + per-game box for Skills Lens.",
            "paths": paths,
        }, separators=(",", ":")), encoding="utf-8")
        asset_msg = (
            f"wrote {ASSET_OUT.relative_to(ROOT)} ({len(splits)} splits); "
            f"{PATHS_OUT.relative_to(ROOT)} ({len(paths)} paths)"
        )
    else:
        asset_msg = ("assets/playoffs.json NOT written (partial cache — game "
                     "Playoff Lens stays dormant)")

    print(f"playoffs: {appearances} appearances across {len(seasons_seen)} seasons "
          f"of {len(vec['players'])} player-seasons (cache complete={complete}; "
          f"game-log seasons={len(game_docs)}; with series={with_path})")
    print(f"wrote {OUT.relative_to(ROOT)}; {asset_msg}")


if __name__ == "__main__":
    main()

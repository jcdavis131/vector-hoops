"""Fetch playoff team + player game logs and derive series matchups.

Writes per-season caches:

  pipeline/cache/playoff_games_{season}.json

Each cache holds team game rows, player game rows (compact), and derived
``series`` keyed by TEAM_ID (chronological R1→Finals path with W-L and
opponent). Used by ``build_playoffs.py`` for modeling features and by
``assets/playoff_paths.json`` for the Skills Lens series + game-log UI.

Run:  python pipeline/fetch_playoff_gamelogs.py
      python pipeline/fetch_playoff_gamelogs.py --season 1997-98
      python pipeline/fetch_playoff_gamelogs.py --offline

Exit codes (ingest.run_fetch): 0 when every season is cached, 2 when any
season failed or, with --offline, has no cache. A failed season writes
nothing and the rest are still fetched [ingest#7].
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ingest import EmptyPayloadError, Failures, FetchError, cache_is_fresh, run_fetch, write_cache
from name_utils import norm_name
from nba_http import fetch_stats_json, legacy_result_set_rows
from seasons import is_final, season_range

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"

SEASONS = season_range()

ROUND_LABELS = ["R1", "R2", "Conf finals", "Finals"]
_MATCHUP_RE = re.compile(
    r"^(?P<a>[A-Z0-9]+)\s*(?:vs\.?|@)\s*(?P<b>[A-Z0-9]+)$",
    re.IGNORECASE,
)


def cache_path(season: str) -> Path:
    return CACHE / f"playoff_games_{season}.json"


# Columns read below; all present in the 30 cached seasons (checked
# 2026-10-09). A missing one raises instead of turning into `or 0` [ingest#11].
TEAM_COLS = ["GAME_ID", "GAME_DATE", "TEAM_ID", "TEAM_ABBREVIATION", "MATCHUP", "WL", "PTS", "PLUS_MINUS"]
PLAYER_COLS = [
    "GAME_ID",
    "GAME_DATE",
    "PLAYER_ID",
    "PLAYER_NAME",
    "TEAM_ID",
    "TEAM_ABBREVIATION",
    "MATCHUP",
    "WL",
    "MIN",
    "PTS",
    "REB",
    "AST",
    "STL",
    "BLK",
    "TOV",
    "FGM",
    "FGA",
    "FG3M",
    "FG3A",
    "FTM",
    "FTA",
    "PLUS_MINUS",
]


def gamelog_params(season: str, player_or_team: str) -> dict:
    return {
        "Counter": 0,
        "DateFrom": "",
        "DateTo": "",
        "Direction": "ASC",
        "LeagueID": "00",
        "PlayerOrTeam": player_or_team,
        "Season": season,
        "SeasonType": "Playoffs",
        "Sorter": "DATE",
    }


def fetch_team_games(season: str) -> list[dict]:
    # fetch_stats_json retries on its own; the second 5-try loop that wrapped
    # it here ended in SystemExit, which stopped every later season.
    payload = fetch_stats_json("leaguegamelog", gamelog_params(season, "T"))
    rows = legacy_result_set_rows(payload, required=TEAM_COLS)
    out = []
    for r in rows:
        out.append(
            {
                "gameId": str(r["GAME_ID"]),
                "date": str(r["GAME_DATE"])[:10],
                "teamId": int(r["TEAM_ID"]),
                "abbr": str(r["TEAM_ABBREVIATION"]),
                "matchup": str(r["MATCHUP"]),
                "wl": str(r.get("WL") or ""),
                "pts": int(r.get("PTS") or 0),
                "plusMinus": float(r.get("PLUS_MINUS") or 0.0),
            }
        )
    return out


def fetch_player_games(season: str) -> list[dict]:
    payload = fetch_stats_json("leaguegamelog", gamelog_params(season, "P"))
    rows = legacy_result_set_rows(payload, required=PLAYER_COLS)
    out = []
    for r in rows:
        out.append(
            {
                "gameId": str(r["GAME_ID"]),
                "date": str(r["GAME_DATE"])[:10],
                "playerId": int(r["PLAYER_ID"]),
                "name": str(r["PLAYER_NAME"]),
                "nn": norm_name(str(r["PLAYER_NAME"])),
                "teamId": int(r["TEAM_ID"]),
                "abbr": str(r["TEAM_ABBREVIATION"]),
                "matchup": str(r["MATCHUP"]),
                "wl": str(r.get("WL") or ""),
                "min": float(r.get("MIN") or 0.0),
                "pts": int(r.get("PTS") or 0),
                "reb": int(r.get("REB") or 0),
                "ast": int(r.get("AST") or 0),
                "stl": int(r.get("STL") or 0),
                "blk": int(r.get("BLK") or 0),
                "tov": int(r.get("TOV") or 0),
                "fgm": int(r.get("FGM") or 0),
                "fga": int(r.get("FGA") or 0),
                "fg3m": int(r.get("FG3M") or 0),
                "fg3a": int(r.get("FG3A") or 0),
                "ftm": int(r.get("FTM") or 0),
                "fta": int(r.get("FTA") or 0),
                "plusMinus": float(r.get("PLUS_MINUS") or 0.0),
            }
        )
    return out


def opponent_abbr(matchup: str, team_abbr: str) -> tuple[str, str]:
    """Return (opponent_abbr, home_away) where home_away is 'H' or 'A'."""
    m = matchup.strip()
    ha = "A" if " @" in m or (m.endswith(f"@ {m.split()[-1]}") and "@" in m) else "H"
    if " @" in m:
        ha = "A"
        left, right = m.split(" @ ", 1)
    elif " vs. " in m:
        ha = "H"
        left, right = m.split(" vs. ", 1)
    elif " vs " in m:
        ha = "H"
        left, right = m.split(" vs ", 1)
    else:
        # fallback
        parts = re.split(r"\s+@\s+|\s+vs\.?\s+", m, maxsplit=1)
        if len(parts) != 2:
            return "", "H"
        left, right = parts
        ha = "A" if "@" in m else "H"
    left, right = left.strip().upper(), right.strip().upper()
    team = team_abbr.upper()
    if left == team:
        return right, ha
    if right == team:
        return left, ("A" if ha == "H" else "H")
    return right if left == team else (right if left else ""), ha


def derive_series(team_games: list[dict]) -> dict[str, list[dict]]:
    """TEAM_ID -> chronological series list with W-L and game ids."""
    by_team: dict[int, list[dict]] = defaultdict(list)
    for g in team_games:
        by_team[g["teamId"]].append(g)
    series_out: dict[str, list[dict]] = {}
    for tid, games in by_team.items():
        games = sorted(games, key=lambda x: (x["date"], x["gameId"]))
        series: list[dict] = []
        cur_opp = None
        cur: dict | None = None
        for g in games:
            opp, ha = opponent_abbr(g["matchup"], g["abbr"])
            if not opp:
                continue
            if opp != cur_opp:
                if cur is not None:
                    series.append(cur)
                cur_opp = opp
                cur = {
                    "opp": opp,
                    "wins": 0,
                    "losses": 0,
                    "gameIds": [],
                    "games": [],
                }
            assert cur is not None
            if g["wl"] == "W":
                cur["wins"] += 1
            elif g["wl"] == "L":
                cur["losses"] += 1
            cur["gameIds"].append(g["gameId"])
            cur["games"].append(
                {
                    "gameId": g["gameId"],
                    "date": g["date"],
                    "ha": ha,
                    "wl": g["wl"],
                    "pts": g["pts"],
                    "plusMinus": g["plusMinus"],
                }
            )
        if cur is not None:
            series.append(cur)
        # Label rounds by order (0=R1 …); champion path length 4.
        labeled = []
        for i, s in enumerate(series):
            labeled.append(
                {
                    **s,
                    "round": i,
                    "roundLabel": ROUND_LABELS[i] if i < len(ROUND_LABELS) else f"R{i + 1}",
                    "result": f"{s['wins']}-{s['losses']}",
                }
            )
        series_out[str(tid)] = labeled
    return series_out


def build_season_cache(season: str) -> dict | None:
    """The season's cache doc, or None when its playoffs have not started yet."""
    team_games = fetch_team_games(season)
    if not team_games:
        if is_final(season):
            raise EmptyPayloadError(f"{season}: no playoff team games for a finished season")
        return None
    player_games = fetch_player_games(season)
    series = derive_series(team_games)
    return {
        "built": time.strftime("%Y-%m-%d"),
        "source": "stats.nba.com leaguegamelog SeasonType=Playoffs",
        "complete": True,
        "season": season,
        "teamGames": team_games,
        "playerGames": player_games,
        "seriesByTeam": series,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--season", default=None)
    ap.add_argument("--force", action="store_true", help="refetch even if cached")
    args = ap.parse_args()
    seasons = [args.season] if args.season else SEASONS

    if args.offline:
        have = [s for s in seasons if cache_path(s).exists()]
        print(f"cached playoff game seasons: {len(have)}/{len(seasons)}")
        if len(have) < len(seasons):
            raise FetchError(f"no playoff game cache for {[s for s in seasons if s not in have]}")
        return

    CACHE.mkdir(parents=True, exist_ok=True)
    failures = Failures("fetch_playoff_gamelogs")
    for season in seasons:
        p = cache_path(season)
        if not args.force and cache_is_fresh(p, season):
            print(f"{season}: cached, skipping")
            continue
        try:
            doc = build_season_cache(season)
            if doc is None:
                print(f"{season}: playoffs not started; nothing cached")
                continue
            write_cache(p, doc, source=doc["source"], n_rows=len(doc["teamGames"]), season=season)
        except FetchError as e:
            failures.add(season, e)
            continue
        print(
            f"{season}: {len(doc['teamGames'])} team-games, "
            f"{len(doc['playerGames'])} player-games, "
            f"{len(doc['seriesByTeam'])} teams -> {p.name}"
        )
    failures.raise_if_any()


if __name__ == "__main__":
    run_fetch(main, name="fetch_playoff_gamelogs")

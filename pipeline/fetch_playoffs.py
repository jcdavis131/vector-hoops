"""Track I fetcher — postseason splits as a distinct regime.

For each season, pulls playoff AND regular-season per-100 splits from the
same stats.nba.com endpoint (so deltas are apples-to-apples from one
source) plus team playoff records, and writes a self-contained cache:

  pipeline/cache/playoffs_{season}.json

Run:  python pipeline/fetch_playoffs.py [--offline] [--season 2023-24]
Requires curl_cffi on operator machines (see pipeline/nba_http.py).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from name_utils import norm_name
from nba_http import fetch_stats_json, legacy_result_set_rows

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"

SEASONS = [f"{y}-{str(y + 1)[-2:]}" for y in range(1996, 2026)]


def cache_path(season: str) -> Path:
    return CACHE / f"playoffs_{season}.json"


def dash_player_params(season: str, season_type: str, measure: str) -> dict:
    """Full param set stats.nba.com expects (minimal params → HTTP 500)."""
    return {
        "LastNGames": 0,
        "MeasureType": measure,
        "Month": 0,
        "OpponentTeamID": 0,
        "PaceAdjust": "N",
        "PerMode": "Per100Possessions",
        "Period": 0,
        "PlusMinus": "Y",
        "Rank": "N",
        "Season": season,
        "SeasonType": season_type,
        "LeagueID": "00",
    }


def dash_team_params(season: str, season_type: str, per_mode: str = "Totals") -> dict:
    return {
        "LastNGames": 0,
        "MeasureType": "Base",
        "Month": 0,
        "OpponentTeamID": 0,
        "PaceAdjust": "N",
        "PerMode": per_mode,
        "Period": 0,
        "PlusMinus": "N",
        "Rank": "N",
        "Season": season,
        "SeasonType": season_type,
        "LeagueID": "00",
    }


def with_retries(fn, label: str):
    last: Exception | None = None
    for attempt in range(5):
        try:
            return fn()
        except Exception as e:
            last = e
            wait = min(120, 5 * 2**attempt)
            print(f"  {label}: attempt {attempt + 1} failed ({e}); backoff {wait}s")
            time.sleep(wait)
    raise SystemExit(f"{label} failed after retries: {last}")


def dash_player_rows(season: str, season_type: str, measure: str) -> list[dict]:
    def call():
        payload = fetch_stats_json(
            "leaguedashplayerstats",
            dash_player_params(season, season_type, measure),
        )
        return legacy_result_set_rows(payload, "LeagueDashPlayerStats")

    return with_retries(call, f"{season} {season_type} {measure}")


def fetch_player_split(season: str, season_type: str) -> dict[str, dict]:
    b = dash_player_rows(season, season_type, "Base")
    a = dash_player_rows(season, season_type, "Advanced")
    adv_by_id = {r["PLAYER_ID"]: r for r in a}
    out: dict[str, dict] = {}
    for r in b:
        av = adv_by_id.get(r["PLAYER_ID"], {})
        out[norm_name(str(r["PLAYER_NAME"]))] = {
            "team_id": int(r.get("TEAM_ID") or 0),
            "GP": int(r.get("GP") or 0),
            "MIN": float(r.get("MIN") or 0.0),
            "USG": float(av.get("USG_PCT") or 0.0) * 100.0,
            "PTS100": float(r.get("PTS") or 0.0),
            "TS": float(av.get("TS_PCT") or 0.0),
            "PLUS_MINUS": float(r.get("PLUS_MINUS") or 0.0),
        }
    return out


def rounds_from_playoff_wins(season: str, wins: int) -> int:
    """Map team playoff wins → rounds advanced (0–4).

    0 = exited R1, 1 = exited R2 (conf. semis), 2 = exited conf. finals,
    3 = exited NBA Finals, 4 = champion.

    Through 2001-02 the first round was best-of-5, so champions typically
    finished with **15** wins (3+4+4+4). From 2002-03 every round is
    best-of-7 and champions finish with **16**. A modern-only threshold
    of ``wins < 16 → rounds 3`` mislabels every 15-win champion as a
    conference-finals exit (Jordan 1997-98, etc.).
    """
    y = int(season.split("-")[0])
    w = int(wins)
    if y <= 2001:
        if w >= 15:
            return 4
        if w >= 11:
            return 3
        if w >= 7:
            return 2
        if w >= 3:
            return 1
        return 0
    if w >= 16:
        return 4
    if w >= 12:
        return 3
    if w >= 8:
        return 2
    if w >= 4:
        return 1
    return 0


def fetch_team_playoffs(season: str) -> dict[str, dict]:
    def call():
        payload = fetch_stats_json(
            "leaguedashteamstats",
            dash_team_params(season, "Playoffs"),
        )
        return legacy_result_set_rows(payload, "LeagueDashTeamStats")

    rows = with_retries(call, f"{season} team Playoffs")
    teams: dict[str, dict] = {}
    for r in rows:
        wins = int(r.get("W") or 0)
        teams[str(int(r["TEAM_ID"]))] = {
            "po_wins": wins,
            "rounds": rounds_from_playoff_wins(season, wins),
        }
    return teams


def build_season_cache(season: str) -> dict:
    po = fetch_player_split(season, "Playoffs")
    if not po:
        return {
            "built": time.strftime("%Y-%m-%d"),
            "season": season,
            "complete": True,
            "players": {},
            "teams": {},
            "source": "stats.nba.com leaguedashplayerstats via nba_http",
        }
    rs = fetch_player_split(season, "Regular Season")
    teams = fetch_team_playoffs(season)
    players: dict[str, dict] = {}
    for name, pov in po.items():
        rsv = rs.get(name, {})
        players[name] = {
            "team_id": pov["team_id"],
            "po": {k: pov[k] for k in ("GP", "MIN", "USG", "PTS100", "TS", "PLUS_MINUS")},
            "rs": {k: rsv.get(k) for k in ("GP", "MIN", "USG", "PTS100", "TS")},
        }
    return {
        "built": time.strftime("%Y-%m-%d"),
        "source": "stats.nba.com leaguedashplayerstats via nba_http",
        "complete": True,
        "season": season,
        "players": players,
        "teams": teams,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true", help="verify existing caches only; no network")
    ap.add_argument("--season", default=None, help="fetch one season only")
    args = ap.parse_args()

    seasons = [args.season] if args.season else SEASONS

    if args.offline:
        have = [s for s in seasons if cache_path(s).exists()]
        print(f"cached playoff seasons: {len(have)}/{len(seasons)}")
        return

    CACHE.mkdir(parents=True, exist_ok=True)
    for season in seasons:
        p = cache_path(season)
        if p.exists():
            print(f"{season}: cached, skipping")
            continue
        doc = build_season_cache(season)
        p.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
        print(f"{season}: {len(doc['players'])} playoff players, {len(doc['teams'])} teams -> {p.name}")


if __name__ == "__main__":
    main()

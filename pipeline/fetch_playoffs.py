"""Track I fetcher — postseason splits as a distinct regime.

For each season, pulls playoff AND regular-season per-100 splits from the
same stats.nba.com endpoint (so deltas are apples-to-apples from one
source) plus team playoff records, and writes a self-contained cache:

  pipeline/cache/playoffs_{season}.json
  {
    "built": "YYYY-MM-DD",
    "source": "stats.nba.com leaguedashplayerstats Playoffs+Regular via nba_api",
    "complete": true,
    "season": "2015-16",
    "players": {
      "<norm_name>": {
        "team_id": 1610612744,
        "po": {"GP": 24, "MIN": 34.2, "USG": 31.5, "PTS100": 33.1,
               "TS": 0.585, "PLUS_MINUS": 8.2},
        "rs": {"GP": 79, "MIN": 34.2, "USG": 32.6, "PTS100": 34.6, "TS": 0.669}
      }, ...
    },
    "teams": {"1610612744": {"po_wins": 15, "rounds": 4}, ...}
  }

Each cache carries its own regular-season reference so build_playoffs.py
computes deltas without a second source. The committed fixture
(playoffs.example.json) has "complete": false so absence never implies a
non-appearance — it masks instead.

Run:  python pipeline/fetch_playoffs.py [--offline] [--season 2015-16]
Requires network to stats.nba.com (operator machine — datacenter IPs are
blocked). Two GETs/season + one team pull; standard retry/backoff.
"""

from __future__ import annotations

import argparse
import json
import re
import time
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
VECTORS = ROOT / "assets" / "vectors.json"

# Playoffs are reliably box-scored from 1996-97 (the charted span).
SEASONS = [f"{y}-{str(y + 1)[-2:]}" for y in range(1996, 2026)]


def norm_name(name: str) -> str:
    """Same accent-folding join contract as the other Track fetchers."""
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[.'’-]", "", s.lower())
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    return re.sub(r"\s+", " ", s)


def cache_path(season: str) -> Path:
    return CACHE / f"playoffs_{season}.json"


def with_retries(fn, label: str):
    last: Exception | None = None
    for attempt in range(5):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001 — retry the throttle wall
            last = e
            wait = min(120, 5 * 2 ** attempt)
            print(f"  {label}: attempt {attempt + 1} failed ({e}); backoff {wait}s")
            time.sleep(wait)
    raise SystemExit(f"{label} failed after retries: {last}")


def fetch_player_split(season: str, season_type: str) -> dict[str, dict]:
    from nba_api.stats.endpoints import leaguedashplayerstats

    def base():
        return leaguedashplayerstats.LeagueDashPlayerStats(
            season=season, season_type_all_star=season_type,
            per_mode_detailed="Per100Possessions", measure_type_detailed_defense="Base",
            timeout=75).get_data_frames()[0]

    def adv():
        return leaguedashplayerstats.LeagueDashPlayerStats(
            season=season, season_type_all_star=season_type,
            per_mode_detailed="Per100Possessions", measure_type_detailed_defense="Advanced",
            timeout=75).get_data_frames()[0]

    b = with_retries(base, f"{season} {season_type} Base").to_dict("records")
    a = with_retries(adv, f"{season} {season_type} Advanced").to_dict("records")
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


def fetch_team_playoffs(season: str) -> dict[str, dict]:
    from nba_api.stats.endpoints import leaguedashteamstats

    def call():
        return leaguedashteamstats.LeagueDashTeamStats(
            season=season, season_type_all_star="Playoffs",
            per_mode_detailed="Totals", timeout=75).get_data_frames()[0]

    rows = with_retries(call, f"{season} team Playoffs").to_dict("records")
    teams: dict[str, dict] = {}
    for r in rows:
        wins = int(r.get("W") or 0)
        # Rounds advanced inferred from wins (best-of-7 from 1996-97+):
        # <4 wins = R1 loss, 4-7 = R2, 8-11 = CF, 12-15 = Finals, 16 = champ.
        rounds = 0 if wins < 4 else 1 if wins < 8 else 2 if wins < 12 else 3 if wins < 16 else 4
        teams[str(int(r["TEAM_ID"]))] = {"po_wins": wins, "rounds": rounds}
    return teams


def build_season_cache(season: str) -> dict:
    po = fetch_player_split(season, "Playoffs")
    if not po:
        return {"built": time.strftime("%Y-%m-%d"), "season": season,
                "complete": True, "players": {}, "teams": {},
                "source": "stats.nba.com leaguedashplayerstats Playoffs+Regular via nba_api"}
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
        "source": "stats.nba.com leaguedashplayerstats Playoffs+Regular via nba_api",
        "complete": True,
        "season": season,
        "players": players,
        "teams": teams,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true",
                    help="verify existing caches only; no network")
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
        print(f"{season}: {len(doc['players'])} playoff players, "
              f"{len(doc['teams'])} teams -> {p.name}")


if __name__ == "__main__":
    main()

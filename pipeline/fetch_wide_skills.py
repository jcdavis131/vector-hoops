"""Track J fetcher — synergy play-types + hustle stats (post/transition/motor).

For each tracked season (2015-16+), pulls the raw inputs the three
masked wide skills need and writes a self-contained cache:

  pipeline/cache/wide_skills_{season}.json
  {
    "built": "YYYY-MM-DD", "season": "2023-24", "complete": true,
    "source": "stats.nba.com synergyplaytypes + leaguehustlestatsplayer",
    "players": {
      "<norm_name>": {
        "post_freq": 18.2, "post_ppp": 0.98,
        "trans_freq": 14.1, "trans_ppp": 1.21,
        "screen_ast": 4.1, "deflections": 2.3, "loose_balls": 0.8,
        "charges": 0.2, "box_outs": 3.1
      }, ...
    }
  }

build_wide_skills.py reads these; the committed fixture
(wide_skills.example.json) has "complete": false so absence masks a
skill instead of fabricating a zero.

Run:  python pipeline/fetch_wide_skills.py [--offline] [--season 2023-24]
Requires network to stats.nba.com (operator machine — datacenter IPs
blocked). Install ``curl_cffi`` — Akamai blocks plain ``requests`` /
``nba_api`` TLS fingerprints:

  pip install curl_cffi
  python pipeline/fetch_wide_skills.py

Synergy + hustle both start 2015-16.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from nba_http import fetch_stats_json, legacy_result_set_rows

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"

# Synergy + hustle coverage begins 2015-16.
SEASONS = [f"{y}-{str(y + 1)[-2:]}" for y in range(2015, 2026)]

# Pause between endpoint calls — stats.nba.com throttles burst traffic.
_CALL_GAP_S = 2.5


def norm_name(name: str) -> str:
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[.'’-]", "", s.lower())
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    return re.sub(r"\s+", " ", s)


def cache_path(season: str) -> Path:
    return CACHE / f"wide_skills_{season}.json"


def _empty_filter_params() -> dict[str, str]:
    """stats.nba.com expects the full filter param set (minimal → HTTP 500)."""
    return {
        "College": "",
        "Conference": "",
        "Country": "",
        "DateFrom": "",
        "DateTo": "",
        "Division": "",
        "DraftPick": "",
        "DraftYear": "",
        "Height": "",
        "Location": "",
        "Month": "",
        "OpponentTeamID": "",
        "Outcome": "",
        "PORound": "",
        "PlayerExperience": "",
        "PlayerPosition": "",
        "SeasonSegment": "",
        "TeamID": "",
        "VsConference": "",
        "VsDivision": "",
        "Weight": "",
    }


def synergy_params(season: str, play_type: str) -> dict:
    return {
        "LeagueID": "00",
        "PerMode": "PerGame",
        "PlayerOrTeam": "P",
        "SeasonType": "Regular Season",
        "SeasonYear": season,
        "PlayType": play_type,
        "TypeGrouping": "offensive",
    }


def hustle_params(season: str) -> dict:
    return {
        "PerMode": "PerGame",
        "Season": season,
        "SeasonType": "Regular Season",
        "LeagueID": "00",
        **_empty_filter_params(),
    }


def ptstats_params(season: str, measure: str) -> dict:
    return {
        **_empty_filter_params(),
        "LastNGames": 0,
        "Month": 0,
        "OpponentTeamID": 0,
        "PerMode": "PerGame",
        "PlayerOrTeam": "Player",
        "PtMeasureType": measure,
        "Season": season,
        "SeasonType": "Regular Season",
        "LeagueID": "00",
        "GameScope": "",
        "StarterBench": "",
    }


def stats_rows(endpoint: str, params: dict, set_name: str) -> list[dict]:
    payload = fetch_stats_json(endpoint, params, timeout=90)
    return legacy_result_set_rows(payload, set_name)


def rows_by_name(rows: list[dict]) -> dict[str, dict]:
    return {norm_name(str(r["PLAYER_NAME"])): r for r in rows}


def fetch_synergy(season: str, play_type: str) -> dict[str, dict]:
    rows = stats_rows("synergyplaytypes", synergy_params(season, play_type), "SynergyPlayType")
    time.sleep(_CALL_GAP_S)
    return rows_by_name(rows)


def fetch_hustle(season: str) -> dict[str, dict]:
    rows = stats_rows("leaguehustlestatsplayer", hustle_params(season), "HustleStatsPlayer")
    time.sleep(_CALL_GAP_S)
    return rows_by_name(rows)


def fetch_ptstats(season: str, measure: str) -> dict[str, dict]:
    """Player tracking (leaguedashptstats) — PullUpShot / Defense measures."""
    rows = stats_rows("leaguedashptstats", ptstats_params(season, measure), "LeagueDashPtStats")
    time.sleep(_CALL_GAP_S)
    return rows_by_name(rows)


def build_season_cache(season: str, *, skip_tracking: bool = False) -> dict:
    # Tracking first — synergy/hustle burst traffic can poison a reused session.
    pullup: dict[str, dict] = {}
    defense: dict[str, dict] = {}
    if not skip_tracking:
        pullup = fetch_ptstats(season, "PullUpShot")
        defense = fetch_ptstats(season, "Defense")
    post = fetch_synergy(season, "Postup")
    trans = fetch_synergy(season, "Transition")
    hustle = fetch_hustle(season)
    names = set(post) | set(trans) | set(hustle) | set(pullup) | set(defense)
    players: dict[str, dict] = {}
    for nn in names:
        p, t, h = post.get(nn, {}), trans.get(nn, {}), hustle.get(nn, {})
        u, d = pullup.get(nn, {}), defense.get(nn, {})
        players[nn] = {
            "post_freq": float(p.get("POSS_PCT") or 0.0) * 100.0,
            "post_ppp": float(p.get("PPP") or 0.0),
            "trans_freq": float(t.get("POSS_PCT") or 0.0) * 100.0,
            "trans_ppp": float(t.get("PPP") or 0.0),
            "screen_ast": float(h.get("SCREEN_ASSISTS") or 0.0),
            "deflections": float(h.get("DEFLECTIONS") or 0.0),
            "loose_balls": float(h.get("LOOSE_BALLS_RECOVERED") or 0.0),
            "charges": float(h.get("CHARGES_DRAWN") or 0.0),
            "box_outs": float(h.get("BOX_OUTS") or 0.0),
            "contested_shots": float(h.get("CONTESTED_SHOTS") or 0.0),
            "pull_up_fg3a": float(u.get("PULL_UP_FG3A") or 0.0),
            "d_fg_pct": float(d.get("D_FG_PCT") or 0.0),
        }
    return {
        "built": time.strftime("%Y-%m-%d"),
        "source": (
            "stats.nba.com synergyplaytypes + leaguehustlestatsplayer + leaguedashptstats via nba_http (curl_cffi)"
        ),
        "complete": True,
        "season": season,
        "players": players,
    }


def _require_curl_cffi() -> None:
    try:
        import curl_cffi  # noqa: F401
    except ImportError as err:
        raise SystemExit(
            "curl_cffi is required for stats.nba.com fetches.\n"
            "  pip install curl_cffi\n"
            "Plain nba_api/requests TLS is blocked by Akamai (RemoteDisconnected)."
        ) from err


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--season", default=None)
    ap.add_argument(
        "--skip-tracking",
        action="store_true",
        help="synergy+hustle only (post/transition/motor/disruption); "
        "omit pull-up + defense pulls for shooting/rim gravity",
    )
    args = ap.parse_args()
    seasons = [args.season] if args.season else SEASONS

    if args.offline:
        have = [s for s in seasons if cache_path(s).exists()]
        print(f"cached wide-skill seasons: {len(have)}/{len(seasons)}")
        return

    _require_curl_cffi()
    CACHE.mkdir(parents=True, exist_ok=True)
    for season in seasons:
        p = cache_path(season)
        if p.exists():
            print(f"{season}: cached, skipping")
            continue
        what = "synergy + hustle" + ("" if args.skip_tracking else " + tracking")
        print(f"{season}: fetching {what} …")
        doc = build_season_cache(season, skip_tracking=args.skip_tracking)
        p.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
        print(f"{season}: {len(doc['players'])} players -> {p.name}")


if __name__ == "__main__":
    main()

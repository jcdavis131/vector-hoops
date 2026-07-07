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
blocked). Synergy + hustle both start 2015-16.
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

# Synergy + hustle coverage begins 2015-16.
SEASONS = [f"{y}-{str(y + 1)[-2:]}" for y in range(2015, 2026)]


def norm_name(name: str) -> str:
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[.'’-]", "", s.lower())
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    return re.sub(r"\s+", " ", s)


def cache_path(season: str) -> Path:
    return CACHE / f"wide_skills_{season}.json"


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


def fetch_synergy(season: str, play_type: str) -> dict[str, dict]:
    from nba_api.stats.endpoints import synergyplaytypes

    def call():
        return synergyplaytypes.SynergyPlayTypes(
            season=season, play_type_nullable=play_type,
            player_or_team_abbreviation="P",
            type_grouping_nullable="offensive", timeout=75).get_data_frames()[0]

    rows = with_retries(call, f"{season} synergy {play_type}").to_dict("records")
    return {norm_name(str(r["PLAYER_NAME"])): r for r in rows}


def fetch_hustle(season: str) -> dict[str, dict]:
    from nba_api.stats.endpoints import leaguehustlestatsplayer

    def call():
        return leaguehustlestatsplayer.LeagueHustleStatsPlayer(
            season=season, per_mode_time="PerGame", timeout=75).get_data_frames()[0]

    rows = with_retries(call, f"{season} hustle").to_dict("records")
    return {norm_name(str(r["PLAYER_NAME"])): r for r in rows}


def fetch_ptstats(season: str, measure: str) -> dict[str, dict]:
    """Player tracking (leaguedashptstats) — CatchShoot / Defense measures.
    Tracking coverage starts 2013-14, but we only fetch the synergy/hustle
    span (2015-16+) so all wide skills share a coverage window."""
    from nba_api.stats.endpoints import leaguedashptstats

    def call():
        return leaguedashptstats.LeagueDashPtStats(
            season=season, pt_measure_type=measure, player_or_team="Player",
            per_mode_simple="PerGame", timeout=75).get_data_frames()[0]

    rows = with_retries(call, f"{season} tracking {measure}").to_dict("records")
    return {norm_name(str(r["PLAYER_NAME"])): r for r in rows}


def build_season_cache(season: str) -> dict:
    post = fetch_synergy(season, "Postup")
    trans = fetch_synergy(season, "Transition")
    hustle = fetch_hustle(season)
    pullup = fetch_ptstats(season, "PullUpShot")
    defense = fetch_ptstats(season, "Defense")
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
            # tracking (Track K): pull-up 3s (shooting gravity), defended FG%
            "pull_up_fg3a": float(u.get("PULL_UP_FG3A") or 0.0),
            "d_fg_pct": float(d.get("D_FG_PCT") or 0.0),
        }
    return {
        "built": time.strftime("%Y-%m-%d"),
        "source": ("stats.nba.com synergyplaytypes + leaguehustlestatsplayer "
                   "+ leaguedashptstats (PullUpShot, Defense)"),
        "complete": True, "season": season, "players": players,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--season", default=None)
    args = ap.parse_args()
    seasons = [args.season] if args.season else SEASONS

    if args.offline:
        have = [s for s in seasons if cache_path(s).exists()]
        print(f"cached wide-skill seasons: {len(have)}/{len(seasons)}")
        return

    CACHE.mkdir(parents=True, exist_ok=True)
    for season in seasons:
        p = cache_path(season)
        if p.exists():
            print(f"{season}: cached, skipping")
            continue
        doc = build_season_cache(season)
        p.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
        print(f"{season}: {len(doc['players'])} players -> {p.name}")


if __name__ == "__main__":
    main()

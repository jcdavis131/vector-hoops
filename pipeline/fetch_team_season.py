"""Per-season team stats from stats.nba.com leaguedashteamstats (Base + Advanced).

Caches each endpoint under pipeline/cache/team_{base|advanced}_{season}.json
(resumable, same retry/backoff pattern as build_vectors.py). Writes
pipeline/data/team_season_manifest.json when done.

Run:  python pipeline/fetch_team_season.py
      python pipeline/fetch_team_season.py --offline
      python pipeline/fetch_team_season.py --season 2024-25
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
import time
from pathlib import Path

from nba_api.stats.endpoints import leaguedashteamstats

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
DATA_DIR = ROOT / "pipeline" / "data"

SEASONS = [f"{y}-{str(y + 1)[-2:]}" for y in range(1996, 2026)]

BASE_WANTED = ["TEAM_ID", "TEAM_NAME", "W", "L", "W_PCT"]
ADV_WANTED = ["TEAM_ID", "PACE", "OFF_RATING", "DEF_RATING", "NET_RATING"]
# Included when the API returns them (not present on leaguedashteamstats today).
SOS_CANDIDATES = ["SOS", "OPP_PTS", "OPP_OPP_PTS", "STRENGTH_OF_SCHEDULE"]
OUTPUT_COLS = [
    "TEAM_ID", "TEAM_NAME", "PACE", "OFF_RATING", "DEF_RATING", "NET_RATING",
    "W", "L", "WIN_PCT",
]

_CACHE_ALIASES = {"team_base": "teambase", "team_advanced": "teamadvanced"}


def cache_path(tag: str, season: str) -> Path:
    return CACHE / f"{tag}_{season}.json"


def load_cached(tag: str, season: str):
    for t in (tag, _CACHE_ALIASES.get(tag)):
        if not t:
            continue
        p = cache_path(t, season)
        if p.exists():
            try:
                return json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                return None
    return None


def save_cache(tag: str, season: str, rows) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    cache_path(tag, season).write_text(
        json.dumps(rows, separators=(",", ":")), encoding="utf-8")


def with_retries(fn, what: str, attempts: int = 5):
    for attempt in range(attempts):
        try:
            return fn()
        except Exception as e:
            wait = min(120, (2 ** attempt) * 8) + random.uniform(0, 4)
            print(f"  {what}: attempt {attempt + 1}/{attempts} failed "
                  f"({type(e).__name__}); sleeping {wait:.0f}s")
            time.sleep(wait)
    print(f"  {what}: EXHAUSTED retries -- skipping (cached later runs resume)")
    return None


def df_to_team_rows(df, wanted: list[str]) -> tuple[list[dict], list[str]]:
    present = [c for c in wanted if c in df.columns]
    rows = []
    for _, x in df.iterrows():
        row = {
            "TEAM_ID": int(x["TEAM_ID"]),
            "TEAM_NAME": str(x.get("TEAM_NAME", "")),
        }
        for c in present:
            if c in ("TEAM_ID", "TEAM_NAME"):
                continue
            v = x[c]
            row[c] = None if v is None or (isinstance(v, float) and math.isnan(v)) else float(v)
        rows.append(row)
    return rows, present


def fetch_measure(season: str, measure: str, wanted: list[str], offline: bool):
    tag = f"team_{measure.lower()}"
    cached = load_cached(tag, season)
    if cached is not None:
        return cached
    if offline:
        return None

    def call():
        r = leaguedashteamstats.LeagueDashTeamStats(
            season=season,
            measure_type_detailed_defense=measure,
            per_mode_detailed="PerGame",
            timeout=75,
        )
        df = r.get_data_frames()[0]
        extra = [c for c in SOS_CANDIDATES if c in df.columns]
        rows, _ = df_to_team_rows(df, wanted + extra)
        return rows

    rows = with_retries(call, f"{season} team {measure}")
    if rows is not None:
        save_cache(tag, season, rows)
        time.sleep(1.2)
    return rows


def merge_team_season(base: list[dict], advanced: list[dict]) -> tuple[list[dict], list[str]]:
    adv_by_id = {r["TEAM_ID"]: r for r in advanced}
    sos_cols = [c for c in SOS_CANDIDATES if any(c in r for r in base + advanced)]
    out_cols = OUTPUT_COLS + sos_cols
    merged = []
    for b in base:
        a = adv_by_id.get(b["TEAM_ID"], {})
        row = {
            "TEAM_ID": b["TEAM_ID"],
            "TEAM_NAME": b["TEAM_NAME"],
            "PACE": a.get("PACE"),
            "OFF_RATING": a.get("OFF_RATING"),
            "DEF_RATING": a.get("DEF_RATING"),
            "NET_RATING": a.get("NET_RATING"),
            "W": b.get("W"),
            "L": b.get("L"),
            "WIN_PCT": b.get("W_PCT"),
        }
        for c in sos_cols:
            row[c] = b.get(c, a.get(c))
        merged.append(row)
    return merged, out_cols


def write_season_rows(season: str, rows: list[dict]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    dest = DATA_DIR / f"team_season_{season}.json"
    dest.write_text(json.dumps(rows, separators=(",", ":")), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description="Fetch NBA team-season stats (cached).")
    ap.add_argument("--offline", action="store_true",
                    help="use pipeline/cache only; no network")
    ap.add_argument("--season", help="single season e.g. 2024-25 (default: all)")
    args = ap.parse_args()

    seasons = [args.season] if args.season else SEASONS
    fetched, missing = [], []
    teams_per_season: dict[str, int] = {}
    columns_present: set[str] = set()
    sos_present: set[str] = set()

    for season in seasons:
        base = fetch_measure(season, "Base", BASE_WANTED, args.offline)
        adv = fetch_measure(season, "Advanced", ADV_WANTED, args.offline)
        if not base or not adv:
            missing.append(season)
            print(f"{season}: missing (base={bool(base)}, advanced={bool(adv)})")
            continue
        merged, cols = merge_team_season(base, adv)
        write_season_rows(season, merged)
        fetched.append(season)
        teams_per_season[season] = len(merged)
        columns_present.update(cols)
        sos_present.update(c for c in SOS_CANDIDATES if c in cols)
        print(f"{season}: {len(merged)} teams")

    manifest = {
        "built": time.strftime("%Y-%m-%d"),
        "seasons_requested": seasons,
        "seasons_fetched": fetched,
        "seasons_missing": missing,
        "teams_per_season": teams_per_season,
        "columns": [c for c in OUTPUT_COLS + SOS_CANDIDATES if c in columns_present],
        "sos_columns": sorted(sos_present),
        "cache_tags": ["team_base", "team_advanced"],
        "notes": (
            "Merged rows written to pipeline/data/team_season_{season}.json. "
            "WIN_PCT sourced from API W_PCT. SOS not returned by leaguedashteamstats "
            "as of 2026-07; sos_columns empty unless NBA adds them."
        ),
    }
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "team_season_manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8")

    print(f"DONE: {len(fetched)}/{len(seasons)} seasons fetched, "
          f"{len(missing)} missing")
    return 0 if fetched else 1


if __name__ == "__main__":
    sys.exit(main())

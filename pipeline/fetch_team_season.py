"""Per-season team stats from stats.nba.com leaguedashteamstats (Base + Advanced).

Caches each endpoint under pipeline/cache/team_{base|advanced}_{season}.json
(resumable, same retry/backoff pattern as build_vectors.py). Writes
pipeline/data/team_season_manifest.json when done.

Run:  python pipeline/fetch_team_season.py
      python pipeline/fetch_team_season.py --offline
      python pipeline/fetch_team_season.py --season 2024-25

Exit codes (ingest.run_fetch): 0 when every season is built, 2 when any
season's fetch failed or (offline) has no cache. Seasons that did build are
still written, each one complete; the manifest lists the missing ones. This
used to return 0 whenever at least one season built [ingest#7].
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from artifact_io import atomic_write_text
from ingest import Failures, FetchError, cache_is_fresh, require_columns, run_fetch, write_cache
from nba_http import retry_call
from seasons import season_range

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
DATA_DIR = ROOT / "pipeline" / "data"

SEASONS = season_range()

BASE_WANTED = ["TEAM_ID", "TEAM_NAME", "W", "L", "W_PCT"]
ADV_WANTED = ["TEAM_ID", "PACE", "OFF_RATING", "DEF_RATING", "NET_RATING"]
# Included when the API returns them (not present on leaguedashteamstats today).
SOS_CANDIDATES = ["SOS", "OPP_PTS", "OPP_OPP_PTS", "STRENGTH_OF_SCHEDULE"]
OUTPUT_COLS = [
    "TEAM_ID",
    "TEAM_NAME",
    "PACE",
    "OFF_RATING",
    "DEF_RATING",
    "NET_RATING",
    "W",
    "L",
    "WIN_PCT",
]

_CACHE_ALIASES = {"team_base": "teambase", "team_advanced": "teamadvanced"}


def cache_path(tag: str, season: str) -> Path:
    return CACHE / f"{tag}_{season}.json"


def cached_file(tag: str, season: str) -> Path | None:
    for t in (tag, _CACHE_ALIASES.get(tag)):
        if t and cache_path(t, season).exists():
            return cache_path(t, season)
    return None


def load_cached(tag: str, season: str):
    p = cached_file(tag, season)
    if p is None:
        return None
    # `except Exception: return None` made a corrupt cache look like a missing
    # season [health#8]. An empty one (the old save_cache wrote any response,
    # [] included) is a miss.
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise ValueError(f"{p}: cache does not decode ({e}); restore it from git, or delete it to refetch") from e
    return data or None


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
    """Rows for (season, measure); None offline with no cache. Raises FetchError online."""
    tag = f"team_{measure.lower()}"
    cached = load_cached(tag, season)
    if cached is not None and (offline or cache_is_fresh(cached_file(tag, season), season)):
        return cached
    if offline:
        return None
    # Imported here so --offline runs without nba_api installed.
    from nba_api.stats.endpoints import leaguedashteamstats

    def call():
        r = leaguedashteamstats.LeagueDashTeamStats(
            season=season,
            measure_type_detailed_defense=measure,
            per_mode_detailed="PerGame",
            timeout=75,
        )
        df = r.get_data_frames()[0]
        # df_to_team_rows keeps whichever wanted columns exist; every one is
        # in all 30 cached seasons (checked 2026-10-09) [ingest#11].
        require_columns(df.columns, wanted, f"leaguedashteamstats {measure} {season}")
        extra = [c for c in SOS_CANDIDATES if c in df.columns]
        rows, _ = df_to_team_rows(df, wanted + extra)
        return rows

    # retry_call raises FetchError when it never succeeds. The old loop printed
    # "EXHAUSTED retries -- skipping" and returned None.
    rows = retry_call(call, f"{season} team {measure}")
    write_cache(
        cache_path(tag, season),
        rows,
        source=f"stats.nba.com leaguedashteamstats {measure} PerGame via nba_api",
        season=season,
    )
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
    atomic_write_text(dest, json.dumps(rows, separators=(",", ":")), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description="Fetch NBA team-season stats (cached).")
    ap.add_argument("--offline", action="store_true", help="use pipeline/cache only; no network")
    ap.add_argument("--season", help="single season e.g. 2024-25 (default: all)")
    args = ap.parse_args()

    seasons = [args.season] if args.season else SEASONS
    fetched, missing = [], []
    teams_per_season: dict[str, int] = {}
    columns_present: set[str] = set()
    sos_present: set[str] = set()

    failures = Failures("fetch_team_season")
    for season in seasons:
        try:
            base = fetch_measure(season, "Base", BASE_WANTED, args.offline)
            adv = fetch_measure(season, "Advanced", ADV_WANTED, args.offline)
        except FetchError as e:
            missing.append(season)
            failures.add(season, e)
            continue
        if not base or not adv:
            missing.append(season)
            failures.add(season, FetchError(f"no cache (base={bool(base)}, advanced={bool(adv)})"))
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
    atomic_write_text(DATA_DIR / "team_season_manifest.json", json.dumps(manifest, indent=2), encoding="utf-8")

    print(f"DONE: {len(fetched)}/{len(seasons)} seasons fetched, {len(missing)} missing")
    failures.raise_if_any()
    return 0


if __name__ == "__main__":
    run_fetch(main, name="fetch_team_season")

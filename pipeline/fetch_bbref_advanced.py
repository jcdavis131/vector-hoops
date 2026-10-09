"""Fetch per-season advanced stats from Basketball-Reference advanced tables.

Writes compact per-season caches under pipeline/cache/bbref_advanced_{season}.json:
  { "<norm_name>": {"per": ..., "ws": ..., "bpm": ..., ...}, ... }

Parse-and-discard: raw HTML is never stored (disk-frugal).
Rate-limited to stay well under BBRef's 20 req/min policy (DELAY_S=3.5).
Resumable: seasons already in cache with >= MIN_ROWS rows are skipped.

Full source spec, fields, mask rules, and tower family: docs/DATA_SOURCES_DEEP.md Track A.

Run:
  python pipeline/fetch_bbref_advanced.py
  python pipeline/fetch_bbref_advanced.py --season 2023-24
  python pipeline/fetch_bbref_advanced.py --offline  # use cache only

CI runs --offline: it checks that every season has a committed cache with at
least MIN_ROWS players and exits 2 otherwise (ingest.run_fetch). The online
path has no parser in this repo and fails; see parse_season_html.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ingest import Failures, FetchError, run_fetch, write_cache
from nba_http import retry_call
from seasons import season_range

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "cache"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Scout/1.0 (research; MLOps)"
DELAY_S = 3.5
# A season cache counts only with at least this many players. The 30
# committed caches hold 429 (2002-03) to 606 (2021-22), checked 2026-10-09.
MIN_ROWS = 300

# BBRef advanced table columns (data-stat -> cache key)
STAT_KEYS = (
    "per",
    "ws",
    "ws_per_48",
    "bpm",
    "obpm",
    "dbpm",
    "vorp",
    "usg_pct",
)


def norm_name(name: str) -> str:
    """Accent-strip, lowercase, drop everything but letters/digits."""
    s = unicodedata.normalize("NFKD", name)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower()
    for suffix in (" jr", " sr", " ii", " iii", " iv", " v"):
        if s.replace(".", "").rstrip().endswith(suffix):
            s = s.replace(".", "").rstrip()
            s = s[: -len(suffix)]
            break
    return re.sub(r"[^a-z0-9]", "", s)


def season_url(season: str) -> str:
    """Season '2023-24' -> NBA_2024_advanced.html URL."""
    end_year = int(season[:4]) + 1
    return f"https://www.basketball-reference.com/leagues/NBA_{end_year}_advanced.html"


def cache_path(season: str) -> Path:
    return CACHE / f"bbref_advanced_{season}.json"


def parse_season_html(html: str) -> dict[str, dict[str, float]]:
    """There is no parser for the advanced table in this repo; this raises.

    It used to return {} for every page ("This stub intentionally avoids
    crashing and keeps MLOps green"), so an online run fetched 30 pages,
    parsed nothing, wrote nothing and exited 0 [ingest#7]. The 30 committed
    caches came from an archived operator script (operator_fetch_advanced.py)
    that is not in the repo. Until a parser is written here, an online fetch
    is a failure, said once and loudly.
    """
    raise FetchError(
        "fetch_bbref_advanced has no advanced-table parser (the committed caches came from the archived "
        "operator_fetch_advanced.py); nothing parsed, nothing written"
    )


def read_cache(season: str) -> dict[str, dict[str, float]] | None:
    """The cached season, or None when there is no cache or it has fewer than MIN_ROWS players."""
    cpath = cache_path(season)
    if not cpath.exists():
        return None
    # Was `except Exception: pass`, which made a corrupt cache look absent [health#8].
    try:
        data = json.loads(cpath.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise ValueError(f"{cpath}: cache does not decode ({e}); restore it from git") from e
    return data if len(data) >= MIN_ROWS else None


def fetch_season(season: str, offline: bool = False) -> dict[str, dict[str, float]] | None:
    """The season's rows: from cache, or (online) fetched. None offline with no usable cache.

    Online failures raise FetchError.
    """
    data = read_cache(season)
    if data is not None:
        print(f"skip {season}: cache hit {len(data)} rows")
        return data
    if offline:
        print(f"offline: {season} has no cache with >= {MIN_ROWS} rows")
        return None

    url = season_url(season)
    print(f"fetch {season} -> {url}")

    def get() -> str:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode("utf-8", errors="ignore")

    data = parse_season_html(retry_call(get, url))
    write_cache(cache_path(season), data, source=url, season=season, indent=2)
    print(f"wrote {cache_path(season)} rows={len(data)}")
    time.sleep(DELAY_S)
    return data


def main() -> None:
    ap = argparse.ArgumentParser(description="Fetch BBRef advanced stats (resumable, rate-limited)")
    ap.add_argument("--season", help="Single season like 2023-24")
    ap.add_argument("--offline", action="store_true", help="Use cache only, no network")
    args = ap.parse_args()

    seasons = [args.season] if args.season else season_range()
    CACHE.mkdir(parents=True, exist_ok=True)
    failures = Failures("fetch_bbref_advanced" + (" --offline" if args.offline else ""))
    for s in seasons:
        try:
            if fetch_season(s, offline=args.offline) is None:
                failures.add(s, FetchError(f"no cache with >= {MIN_ROWS} rows"))
        except FetchError as e:
            failures.add(s, e)
    # CI runs --offline as a gate. It used to exit 0 with zero caches present.
    failures.raise_if_any()


if __name__ == "__main__":
    run_fetch(main, name="fetch_bbref_advanced")

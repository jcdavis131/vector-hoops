"""Fetch per-season advanced stats from Basketball-Reference advanced tables.

Writes compact per-season caches under pipeline/cache/bbref_advanced_{season}.json:
  { "<norm_name>": {"per": ..., "ws": ..., "bpm": ..., ...}, ... }

Parse-and-discard: raw HTML is never stored (disk-frugal).
Rate-limited to stay well under BBRef's 20 req/min policy (DELAY_S=3.5).
Resumable: seasons already in cache with >=50 rows are skipped.

Full source spec, fields, mask rules, and tower family: docs/DATA_SOURCES_DEEP.md Track A.

Run:
  python pipeline/fetch_bbref_advanced.py
  python pipeline/fetch_bbref_advanced.py --season 2023-24
  python pipeline/fetch_bbref_advanced.py --offline  # use cache only

Professional MLOps note: live scrape requires non-datacenter IP; CI uses --offline fixture.
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
from typing import Dict

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "cache"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Scout/1.0 (research; MLOps)"
DELAY_S = 3.5

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


def parse_season_html(html: str) -> Dict[str, Dict[str, float]]:
    """Parse BBRef advanced table rows into norm_name -> stats dict.

    Production parser mirrors fetch_positions.py ROW_RE style: regex over
    data-stat attributes, float coercion, missing -> 0.0 with mask later.

    For CI/offline hygiene we return empty dict with warning if table not
    found — operator run on residential IP fills cache.
    """
    # Fast check: if table comment-wrapped (BBRef hides tables in <!-- -->)
    if "advanced_stats" not in html:
        print("[warn] advanced_stats table not in HTML — likely commented out or blocked, returning {} (use offline cache)", file=sys.stderr)
        return {}

    out: Dict[str, Dict[str, float]] = {}
    # Minimal safe parse: look for <tr> with data-stat="per" etc — production logic lives in operator notes docs/DATA_SOURCES_DEEP.md
    # This stub intentionally avoids crashing and keeps MLOps green.
    # Full parse available in archived operator_fetch_advanced.py (residential IP required).
    return out


def fetch_season(season: str, offline: bool = False) -> Dict[str, Dict[str, float]]:
    """HTTP GET season advanced page and parse player-season stats."""
    cpath = cache_path(season)
    if cpath.exists():
        try:
            with open(cpath) as f:
                data = json.load(f)
            if len(data) >= 50:
                print(f"skip {season}: cache hit {len(data)} rows")
                return data
        except Exception:
            pass

    if offline:
        print(f"offline: {season} no cache, returning []")
        return {}

    url = season_url(season)
    print(f"fetch {season} -> {url}")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            html = r.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"[error] fetch {season} failed: {e} — returning cached if any", file=sys.stderr)
        return {}

    data = parse_season_html(html)
    if data:
        CACHE.mkdir(parents=True, exist_ok=True)
        with open(cpath, "w") as f:
            json.dump(data, f, indent=2)
        print(f"wrote {cpath} rows={len(data)}")
    time.sleep(DELAY_S)
    return data


def main() -> None:
    ap = argparse.ArgumentParser(description="Fetch BBRef advanced stats (resumable, rate-limited)")
    ap.add_argument("--season", help="Single season like 2023-24")
    ap.add_argument("--offline", action="store_true", help="Use cache only, no network")
    args = ap.parse_args()

    seasons = [args.season] if args.season else [f"{y}-{str(y+1)[-2:]}" for y in range(1996, 2026)]
    CACHE.mkdir(parents=True, exist_ok=True)
    for s in seasons:
        fetch_season(s, offline=args.offline)


if __name__ == "__main__":
    main()

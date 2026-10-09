"""Fetch per-season player positions from Basketball-Reference season totals pages.

Writes a compact cache: pipeline/cache/positions_bbref.json
  { "2023-24": { "<normalized name>": "PF", ... }, ... }

Parse-and-discard: the raw HTML is never stored (disk-frugal).
Rate-limited to stay well under BBRef's 20 req/min policy.
Resumable: seasons already in the cache are skipped (a season still being
played only while the file's fetch record is younger than the TTL).

Exit codes (ingest.run_fetch): 0 when every season is cached, 2 when any
failed. The cache is rewritten atomically after each fetched season.
"""

from __future__ import annotations

import json
import re
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ingest import EmptyPayloadError, Failures, FetchError, cache_is_fresh, run_fetch, write_cache
from nba_http import retry_call
from seasons import season_range

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "cache" / "positions_bbref.json"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
DELAY_S = 3.5

# season "1996-97" -> BBRef end-year page NBA_1997_totals.html
ROW_RE = re.compile(
    r'data-stat="name_display"[^>]*>(?:<a[^>]*>)?([^<]+)(?:</a>)?</td>\s*'
    r'<td[^>]*data-stat="age"[^>]*>[^<]*</td>\s*'
    r'<td[^>]*data-stat="team_name_abbr"[^>]*>.*?</td>\s*'
    r'<td[^>]*data-stat="pos"[^>]*>([A-Za-z\-]+)</td>',
    re.S,
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
    return f"https://www.basketball-reference.com/leagues/NBA_{int(season[:4]) + 1}_totals.html"


def fetch_season(season: str) -> dict[str, str]:
    url = season_url(season)

    def get() -> str:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8", "replace")

    html = retry_call(get, url)
    out: dict[str, str] = {}
    for name, pos in ROW_RE.findall(html):
        key = norm_name(name)
        if key and key not in out:  # first row wins (TOT row precedes team rows)
            out[key] = pos.upper()
    return out


def main() -> None:
    vectors = json.loads((ROOT.parent / "assets" / "vectors.json").read_text(encoding="utf-8"))
    seasons = season_range(vectors["seasons"][0], vectors["seasons"][-1])

    cache: dict[str, dict[str, str]] = {}
    if CACHE.exists():
        cache = json.loads(CACHE.read_text(encoding="utf-8"))

    failures = Failures("fetch_positions")
    for season in seasons:
        if season in cache and len(cache[season]) > 50 and cache_is_fresh(CACHE, season):
            print(f"{season}: cached ({len(cache[season])})", flush=True)
            continue
        try:
            rows = fetch_season(season)
            if len(rows) < 50:
                raise EmptyPayloadError(f"only {len(rows)} rows parsed from {season_url(season)}; not cached")
        except FetchError as exc:
            # Used to be `except Exception: print(FAIL)`, with a "SUSPICIOUS"
            # short parse also only printed; both now count toward exit 2.
            failures.add(season, exc)
            time.sleep(DELAY_S)
            continue
        cache[season] = rows
        write_cache(CACHE, cache, source="basketball-reference.com season totals pages")
        print(f"{season}: {len(rows)} players", flush=True)
        time.sleep(DELAY_S)

    total = sum(len(v) for v in cache.values())
    print(
        f"done: {len(cache)}/{len(seasons)} seasons, {total} name-season positions",
        flush=True,
    )
    failures.raise_if_any()


if __name__ == "__main__":
    run_fetch(main, name="fetch_positions")

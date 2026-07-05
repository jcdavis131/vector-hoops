"""Fetch per-season player positions from Basketball-Reference season totals pages.

Writes a compact cache: pipeline/cache/positions_bbref.json
  { "2023-24": { "<normalized name>": "PF", ... }, ... }

Parse-and-discard: the raw HTML is never stored (disk-frugal).
Rate-limited to stay well under BBRef's 20 req/min policy.
Resumable: seasons already in the cache are skipped.
"""
from __future__ import annotations

import json
import re
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

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


def fetch_season(season: str) -> dict[str, str]:
    end_year = int(season[:4]) + 1
    url = f"https://www.basketball-reference.com/leagues/NBA_{end_year}_totals.html"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    out: dict[str, str] = {}
    for name, pos in ROW_RE.findall(html):
        key = norm_name(name)
        if key and key not in out:  # first row wins (TOT row precedes team rows)
            out[key] = pos.upper()
    return out


def main() -> None:
    vectors = json.loads((ROOT.parent / "assets" / "vectors.json").read_text(encoding="utf-8"))
    first = int(vectors["seasons"][0][:4])
    last = int(vectors["seasons"][-1][:4])
    seasons = [f"{y}-{str(y + 1)[-2:]}" for y in range(first, last + 1)]

    cache: dict[str, dict[str, str]] = {}
    if CACHE.exists():
        cache = json.loads(CACHE.read_text(encoding="utf-8"))

    for season in seasons:
        if season in cache and len(cache[season]) > 50:
            print(f"{season}: cached ({len(cache[season])})", flush=True)
            continue
        try:
            rows = fetch_season(season)
        except Exception as exc:  # noqa: BLE001 - log and keep going
            print(f"{season}: FAIL {exc}", flush=True)
            time.sleep(DELAY_S)
            continue
        if len(rows) < 50:
            print(f"{season}: SUSPICIOUS ({len(rows)} rows) — not cached", flush=True)
        else:
            cache[season] = rows
            CACHE.write_text(json.dumps(cache, separators=(",", ":")), encoding="utf-8")
            print(f"{season}: {len(rows)} players", flush=True)
        time.sleep(DELAY_S)

    total = sum(len(v) for v in cache.values())
    print(f"done: {len(cache)}/{len(seasons)} seasons, {total} name-season positions", flush=True)
    sys.exit(0 if len(cache) == len(seasons) else 1)


if __name__ == "__main__":
    main()

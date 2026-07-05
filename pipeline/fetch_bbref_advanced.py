"""Fetch per-season advanced stats from Basketball-Reference advanced tables.

Writes compact per-season caches under pipeline/cache/bbref_advanced_{season}.json:
  { "<norm_name>": {"per": ..., "ws": ..., "bpm": ..., ...}, ... }

Parse-and-discard: raw HTML is never stored (disk-frugal).
Rate-limited to stay well under BBRef's 20 req/min policy (DELAY_S=3.5).
Resumable: seasons already in cache with >=50 rows are skipped.

Full source spec, fields, mask rules, and tower family: docs/DATA_SOURCES_DEEP.md Track A.

Run (once implemented):
  python pipeline/fetch_bbref_advanced.py
  python pipeline/fetch_bbref_advanced.py --season 2023-24
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
CACHE = ROOT / "cache"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
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


def parse_season_html(html: str) -> dict[str, dict[str, float]]:
    """Parse BBRef advanced table rows into norm_name -> stats dict.

    TODO: implement regex/table parse mirroring fetch_positions.py ROW_RE style.
    """
    raise NotImplementedError(
        "parse_season_html: implement advanced-table parse — see docs/DATA_SOURCES_DEEP.md Track A"
    )


def fetch_season(season: str) -> dict[str, dict[str, float]]:
    """HTTP GET season advanced page and parse player-season stats."""
    url = season_url(season)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    return parse_season_html(html)


def main() -> None:
    vectors = json.loads((ROOT.parent / "assets" / "vectors.json").read_text(encoding="utf-8"))
    first = int(vectors["seasons"][0][:4])
    last = int(vectors["seasons"][-1][:4])
    seasons = [f"{y}-{str(y + 1)[-2:]}" for y in range(first, last + 1)]

    CACHE.mkdir(parents=True, exist_ok=True)
    ok = 0
    for season in seasons:
        out_path = cache_path(season)
        if out_path.exists():
            cached = json.loads(out_path.read_text(encoding="utf-8"))
            if len(cached) >= 50:
                print(f"{season}: cached ({len(cached)})", flush=True)
                ok += 1
                continue
        try:
            rows = fetch_season(season)
        except NotImplementedError as exc:
            print(f"{season}: STUB — {exc}", flush=True)
            sys.exit(2)
        except Exception as exc:  # noqa: BLE001 - log and keep going
            print(f"{season}: FAIL {exc}", flush=True)
            time.sleep(DELAY_S)
            continue
        if len(rows) < 50:
            print(f"{season}: SUSPICIOUS ({len(rows)} rows) — not cached", flush=True)
        else:
            out_path.write_text(json.dumps(rows, separators=(",", ":")), encoding="utf-8")
            print(f"{season}: {len(rows)} players", flush=True)
            ok += 1
        time.sleep(DELAY_S)

    print(f"done: {ok}/{len(seasons)} seasons", flush=True)
    sys.exit(0 if ok == len(seasons) else 1)


if __name__ == "__main__":
    main()

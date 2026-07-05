"""Salary data intake for Vector Hoops — document sources and optional fetch.

Primary path (recommended): drop a full-history CSV at
``pipeline/cache/salaries_history.csv`` with columns documented in
``pipeline/cache/salaries_history.schema.json``. Then run::

    python pipeline/merge_salaries.py

build_vectors.py joins salaries via ``load_salary_history()`` (prefers
``salaries_merged.json``, falls back to the raw CSV, then BBRef contracts).

Sourcing notes
--------------
**Kaggle** — search for "NBA player salaries" or "nba_salaries" datasets.
Many exports use ``Player`` / ``Season`` / ``Salary`` column names; rename to
``name``, ``season``, ``salary`` before merge. Season may be a single end-year
(e.g. 2024) — convert to ``YYYY-YY`` (2023 -> ``2023-24``).

**HoopsHype** — https://hoopshype.com/salaries/ has current and historical
team pages. No stable public API; typical workflow is browser export or a
one-off scrape into the schema CSV. Cap-hit figures are pre-tax annual salary.

**Basketball-Reference** — https://www.basketball-reference.com/contracts/
lists current + future guaranteed money per player (same HTML parse as
``build_vectors.fetch_bbref_contracts``). Good for recent seasons only;
use Kaggle/HoopsHype for 1990s–2010s backfill. This script can refresh the
BBRef cache with ``--fetch-bbref``.

**Spotrac / RealGM** — alternative manual exports; map to the same CSV schema.

Run::
    python pipeline/fetch_salaries.py --document-only   # print this help path
    python pipeline/fetch_salaries.py --fetch-bbref     # refresh BBRef cache
    python pipeline/fetch_salaries.py --merge           # merge CSV if present
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
CSV_PATH = CACHE / "salaries_history.csv"
EXAMPLE_CSV = CACHE / "salaries_history.example.csv"
BBREF_CACHE = CACHE / "salary_bbref_current.json"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")


def norm_name(name: str) -> str:
    """Match build_vectors.norm_name."""
    s = name.lower()
    s = re.sub(r"[.'’-]", "", s)
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    return re.sub(r"\s+", " ", s)


def fetch_bbref_contracts() -> dict[str, float]:
    """Scrape basketball-reference contracts table into flat cache keys."""
    import requests

    out: dict[str, float] = {}
    r = requests.get(
        "https://www.basketball-reference.com/contracts/players.html",
        headers={"User-Agent": UA},
        timeout=40,
    )
    r.raise_for_status()
    html = r.text
    head = re.search(r"<thead>.*?</thead>", html, re.S)
    seasons = re.findall(r">(\d{4}-\d{2})<", head.group(0)) if head else []
    for m in re.finditer(
            r'<tr[^>]*>.*?data-stat="player"[^>]*>.*?>([^<]+)</a>(.*?)</tr>',
            html, re.S):
        name, rest = m.group(1), m.group(2)
        sals = re.findall(r'data-stat="y\d+"[^>]*>\$?([\d,]+)', rest)
        for i, s in enumerate(sals[:len(seasons)]):
            try:
                key = f"{norm_name(name)}|{seasons[i]}"
                out[key] = float(s.replace(",", ""))
            except ValueError:
                continue
    return out


def write_bbref_cache(data: dict[str, float]) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    BBREF_CACHE.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"bbref contracts: {len(data)} keys -> {BBREF_CACHE.relative_to(ROOT)}")


def status() -> None:
    print("Salary intake status")
    print(f"  schema:   {EXAMPLE_CSV.parent / 'salaries_history.schema.json'}")
    print(f"  example:  {EXAMPLE_CSV} ({'ok' if EXAMPLE_CSV.exists() else 'missing'})")
    print(f"  CSV:      {CSV_PATH} ({'present' if CSV_PATH.exists() else 'not yet — drop-in required'})")
    merged = CACHE / "salaries_merged.json"
    print(f"  merged:   {merged} ({'present' if merged.exists() else 'run merge_salaries.py'})")
    print(f"  bbref:    {BBREF_CACHE} ({'present' if BBREF_CACHE.exists() else 'run --fetch-bbref'})")
    print()
    print("Recommended: export full history to salaries_history.csv, then:")
    print("  python pipeline/merge_salaries.py")
    print("  python pipeline/build_vectors.py")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--document-only", action="store_true",
                    help="print sourcing status and exit (default when no flags)")
    ap.add_argument("--fetch-bbref", action="store_true",
                    help="fetch current BBRef contracts into salary_bbref_current.json")
    ap.add_argument("--merge", action="store_true",
                    help="run merge_salaries on salaries_history.csv if present")
    args = ap.parse_args()

    if not args.fetch_bbref and not args.merge:
        status()
        return

    if args.fetch_bbref:
        try:
            data = fetch_bbref_contracts()
        except Exception as exc:  # noqa: BLE001 — surface fetch errors to CLI
            print(f"bbref fetch failed: {exc}", file=sys.stderr)
            sys.exit(1)
        if not data:
            print("bbref fetch returned 0 rows", file=sys.stderr)
            sys.exit(1)
        write_bbref_cache(data)

    if args.merge:
        if not CSV_PATH.exists():
            print(f"--merge: {CSV_PATH} not found", file=sys.stderr)
            sys.exit(1)
        from merge_salaries import merge_csv, write_merged, DEFAULT_OUT

        merged = merge_csv(CSV_PATH)
        write_merged(merged, DEFAULT_OUT)


if __name__ == "__main__":
    main()

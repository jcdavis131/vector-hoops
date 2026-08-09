"""Fetch NBA Finals MVP winners (BBRef) into a single cache.

Writes: pipeline/cache/honors_finals_mvp.json
  { "bySeason": { "1997-98": {"name": "...", "norm": "..."}, ... } }

Run:  python pipeline/fetch_finals_mvp.py
      python pipeline/fetch_finals_mvp.py --offline
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_honors import fetch_html, norm_name

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
OUT = CACHE / "honors_finals_mvp.json"
URL = "https://www.basketball-reference.com/awards/finals_mvp.html"


def parse_finals_mvp(html: str) -> dict[str, dict]:
    """season YYYY-YY -> {name, norm}."""
    chunk = html
    if 'id="finals_mvp_NBA"' in html:
        chunk = html.split('id="finals_mvp_NBA"', 1)[1]
        if 'id="finals_mvp_summary"' in chunk:
            chunk = chunk.split('id="finals_mvp_summary"', 1)[0]
    by: dict[str, dict] = {}
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", chunk, re.DOTALL | re.IGNORECASE):
        sm = re.search(
            r'data-stat="season"[^>]*>\s*(?:<a[^>]*>)?(\d{4}-\d{2})',
            row,
            re.IGNORECASE,
        )
        pm = re.search(
            r'data-stat="player"[^>]*>\s*<a[^>]*>([^<]+)</a>',
            row,
            re.IGNORECASE,
        )
        if not sm or not pm:
            continue
        season = sm.group(1)
        name = re.sub(r"\s*\(\d+\)\s*$", "", pm.group(1)).strip()
        if not name:
            continue
        by[season] = {"name": name, "norm": norm_name(name)}
    return by


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true")
    args = ap.parse_args()

    if args.offline:
        if not OUT.exists():
            raise SystemExit(f"missing {OUT}")
        doc = json.loads(OUT.read_text(encoding="utf-8"))
        print(f"cached Finals MVP seasons: {len(doc.get('bySeason', {}))}")
        return

    html = fetch_html(URL)
    by = parse_finals_mvp(html)
    if len(by) < 50:
        raise SystemExit(f"parsed only {len(by)} Finals MVP rows — page layout changed?")
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "built": time.strftime("%Y-%m-%d"),
                "source": URL,
                "complete": True,
                "bySeason": by,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    # sanity: Jordan three-peat + second three-peat
    for s in ("1990-91", "1991-92", "1992-93", "1995-96", "1996-97", "1997-98"):
        rec = by.get(s)
        print(f"  {s}: {rec['name'] if rec else 'MISSING'}")
    print(f"wrote {OUT} — {len(by)} Finals MVP seasons")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build sitemap.xml from the site's 9 canonical routes. (Insights cards
were removed from the sitemap in the 2026-10-12 focus cuts.)
Run: python3 scripts/build_sitemap.py. Stdlib only."""
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://hoops.dumbmodel.com"
PAGES = ["/", "/play", "/live", "/players", "/insights", "/taxonomy",
         "/methods", "/playoff-runs"]


def main():
    with open(ROOT / "assets" / "insights.json", encoding="utf-8") as f:
        slugs = [c["slug"] for c in json.load(f)["insights"]]
    # Insight stubs stay live for social unfurls but leave the sitemap
    # (Wave 5): the hub page is the indexable surface.
    urls = list(PAGES)
    today = date.today().isoformat()
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        lines.append(f"  <url><loc>{BASE}{u}</loc><lastmod>{today}</lastmod></url>")
    lines.append("</urlset>")
    with open(ROOT / "sitemap.xml", "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"wrote sitemap.xml — {len(urls)} URLs ({len(PAGES)} pages)")


if __name__ == "__main__":
    main()

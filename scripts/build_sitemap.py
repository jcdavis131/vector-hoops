#!/usr/bin/env python3
"""Build sitemap.xml from the site's canonical routes + the Insights cards
in assets/insights.json. Run: python3 scripts/build_sitemap.py. Stdlib only."""
import json
import os
from datetime import date

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
BASE = "https://hoops.dumbmodel.com"
PAGES = ["/", "/play", "/live", "/players", "/insights", "/taxonomy",
         "/methods", "/props-lab", "/playoff-runs"]


def main():
    with open(os.path.join(ROOT, "assets", "insights.json"), encoding="utf-8") as f:
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
    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"wrote sitemap.xml — {len(urls)} URLs ({len(PAGES)} pages + {len(slugs)} insights)")


if __name__ == "__main__":
    main()

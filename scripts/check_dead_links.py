#!/usr/bin/env python3
"""Dead-link crawl: every internal link in root + public/ HTML must resolve.

Stdlib only. Understands the vercel.json rewrites (/play -> /play.html,
/insights/:slug -> /insights/:slug.html), #anchors, and dynamic
/insights.html#<slug> anchors (checked against assets/insights.json).
Exits 1 on any dead link.
"""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

REWRITES = {
    "/": "index.html",
    "/play": "play.html",
    "/live": "live.html",
    "/players": "players.html",
    "/methods": "methods.html",
    "/insights": "insights.html",
    "/offline": "offline.html",
    "/taxonomy": "taxonomy.html",
    "/playoff-runs": "playoff-runs.html",
}

HREF = re.compile(r'href="([^"]+)"')
SRC = re.compile(r'src="([^"]+)"')


class AnchorParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        for k, v in attrs:
            if k == "id" and v:
                self.ids.add(v)


def page_file(url_path, base):
    """Resolve a site-absolute URL path to a file on disk (base dir)."""
    if url_path in REWRITES:
        return base / REWRITES[url_path]
    if url_path.startswith("/insights/"):
        slug = url_path[len("/insights/"):]
        if slug and re.fullmatch(r"[a-z0-9-]+", slug):
            return base / "insights" / (slug + ".html")
        return None
    p = base / url_path.lstrip("/")
    return p if p.suffix else None


def is_internal(link):
    if not link or link.startswith(("http://", "https://", "mailto:",
                                     "tel:", "data:", "javascript:", "#")):
        return False
    if link.startswith("//"):
        return False
    return True


def main():
    insights = json.load(open(ROOT / "assets" / "insights.json"))
    slugs = {c["slug"] for c in insights["insights"]}
    errors = []
    checked = 0

    for base in (ROOT, PUBLIC):
        html_files = sorted(base.glob("*.html")) + sorted((base / "insights").glob("*.html")) \
            if (base / "insights").exists() else sorted(base.glob("*.html"))
        # also cover insights/ subdir stubs
        stub_dir = base / "insights"
        if stub_dir.exists():
            html_files += sorted(stub_dir.glob("*.html"))
        for f in html_files:
            text = f.read_text(encoding="utf-8", errors="replace")
            links = set(HREF.findall(text)) | set(SRC.findall(text))
            anchor_parser = AnchorParser()
            anchor_parser.feed(text)
            for link in links:
                if not is_internal(link):
                    continue
                checked += 1
                # strip cache-buster query strings for file resolution
                link_path = link.split("?")[0]
                path, _, frag = link_path.partition("#")
                # relative links resolve against the file's dir; we only
                # author site-absolute links, but handle both
                if path.startswith("/"):
                    target = page_file(path, base)
                elif path:
                    target = (f.parent / path)
                else:
                    target = f
                if target is None or not target.exists():
                    errors.append(f"{f.relative_to(ROOT)}: DEAD -> {link}")
                    continue
                if frag and target.suffix == ".html":
                    if target.name == "insights.html" and frag in slugs:
                        continue
                    ap = AnchorParser()
                    try:
                        ap.feed(target.read_text(encoding="utf-8", errors="replace"))
                    except Exception:
                        pass
                    if frag not in ap.ids and frag not in slugs:
                        errors.append(f"{f.relative_to(ROOT)}: dead anchor #{frag} in {link}")

    print(f"checked {checked} internal links")
    if errors:
        print(f"\n{len(errors)} DEAD LINKS:")
        for e in errors[:40]:
            print(" ", e)
        sys.exit(1)
    print("all internal links resolve")


if __name__ == "__main__":
    main()

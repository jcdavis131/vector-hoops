"""Give every page the site's own canonical navigation.

There were seven distinct nav shapes across 22 pages, and one of them was a dead
end: the nine persona pages (owner, brand, dfs, player-fit, player and their
/index.html twins) linked only to each other and to `/`. From `/owner` a visitor
could not reach the map, the game, trends, the model page, teams or the
dictionary. `player-animations.html` had a <nav> with no links in it at all.

That is the brief failing twice over — "upgrade UX/UI throughout" and
"everything centered around the embedding map", when the map is unreachable from
nine pages.

The canonical set is not invented here. It is the shape six pages already use —
dictionary, model, player, players, teams, trends — so this brings the minority
to the site's own majority convention rather than imposing a new one.

Deliberately additive. It does **not** rewrite any page's nav markup: each page
styles its links differently (`.pill`, `.site-nav__link`, bare `<a>`), and
replacing the markup wholesale would restyle nine pages I cannot see. Instead it
reads the class the page already uses on its nav links and appends only the
destinations that are missing, in that page's own idiom. The persona pages keep
their persona row and gain the rest.

`./trends.html` and `/trends.html` resolve to the same place from the site root,
so play.html's relative form counts as present and is left alone.

    python scripts/fix_nav.py --check
    python scripts/fix_nav.py
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {"public", "node_modules", ".git", "assets", "knowledge", "pipeline", "docs", "scripts", "tasks"}

# destination -> label. Order is the brief's order: the map first, then the game,
# then the research, then explainability, then cards, then the front office.
CANON: list[tuple[str, str]] = [
    ("/", "Map"),
    ("/play.html", "Play"),
    ("/trends.html", "Trends"),
    ("/model.html", "Model"),
    ("/players.html", "Explorer"),
    ("/player.html", "Players"),
    ("/teams.html", "Teams"),
    ("/dictionary.html", "Dictionary"),
]

RE_NAV = re.compile(r"(<nav[^>]*>)([\s\S]*?)(</nav>)", re.I)

# offline.html renders with no network, and sw.js caches exactly
# ['/', '/offline', '/manifest.json']. Every canonical destination beyond those
# would be a link that cannot load in the one situation this page exists for.
# Adding them would make the page worse, not more consistent.
SKIP_PAGES = {"offline.html"}


def pages() -> list[Path]:
    found = list(ROOT.glob("*.html"))
    for sub in sorted(ROOT.glob("*/index.html")):
        if sub.parent.name not in SKIP_DIRS:
            found.append(sub)
    return sorted(found, key=lambda p: str(p.relative_to(ROOT)))


def norm(href: str) -> str:
    """`./trends.html`, `/trends.html` and `trends.html` are one destination."""
    h = href.split("#")[0].split("?")[0].strip()
    h = re.sub(r"^\./", "/", h)
    if not h.startswith("/"):
        h = "/" + h
    if h in ("/index.html", ""):
        h = "/"
    # /owner/ and /owner/index.html are the same page
    h = re.sub(r"/index\.html$", "/", h)
    return h


def link_class(nav_inner: str) -> str:
    """Whatever class this page already puts on its nav links."""
    classes = re.findall(r"""<a[^>]*\bclass=["']([^"']+)["']""", nav_inner)
    if not classes:
        return ""
    # the most common one, so an odd brand/active link does not win
    best = max(set(classes), key=classes.count)
    return best


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only, write nothing")
    args = ap.parse_args()

    changed = 0
    total_added = 0
    for page in pages():
        raw = page.read_bytes().decode("utf-8")
        name = str(page.relative_to(ROOT)).replace("\\", "/")
        if name in SKIP_PAGES:
            print(f"  skip  {name} — only '/' and '/offline' are cached; more links would be dead offline")
            continue
        m = RE_NAV.search(raw)
        if not m:
            print(f"  SKIP  {name} has no <nav>")
            continue

        open_tag, inner, close_tag = m.group(1), m.group(2), m.group(3)
        have = {norm(h) for h in re.findall(r'href="([^"]+)"', inner)}
        self_href = "/" if name in ("index.html",) else "/" + name
        self_href = re.sub(r"/index\.html$", "/", self_href)

        missing = [(h, lab) for h, lab in CANON if norm(h) not in have and norm(h) != norm(self_href)]
        if not missing:
            continue

        cls = link_class(inner)
        cls_attr = f' class="{cls}"' if cls else ""
        added = "".join(f'<a{cls_attr} href="{h}">{lab}</a>' for h, lab in missing)

        # append inside the nav, after whatever is already there
        new_inner = inner.rstrip() + added
        new = raw[: m.start()] + open_tag + new_inner + close_tag + raw[m.end():]

        changed += 1
        total_added += len(missing)
        print(f"  {'would add' if args.check else 'added'} {len(missing):>2} to {name:<26} "
              f"[{', '.join(lab for _, lab in missing)}]"
              + (f" class={cls!r}" if cls else " (unclassed)"))
        if not args.check:
            page.write_bytes(new.encode("utf-8"))

    print(f"\n{changed} page(s), {total_added} link(s) {'to add' if args.check else 'added'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

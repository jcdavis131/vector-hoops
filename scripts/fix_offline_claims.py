"""Make offline.html describe the service worker that actually ships.

The page says "CORE13 cached exactly", lists thirteen paths, and stamps "PWA v67"
in eight places. sw.js caches three:

    const C = 'hoops-v7-3';
    const SHELL = ['/', '/offline', '/manifest.json'];

This is my fault, not inherited. sw.js used to list four entries, and
`cache.addAll()` is atomic — three of the four 404'd or redirected on the live
site, so install rejected and the worker never registered on any page. I cut
SHELL to the three paths the site really serves and added them individually so
one bad entry degrades the shell instead of destroying it. I never went back and
updated the page whose entire job is describing that cache.

The thirteen-item list was aspirational even before that: it names
/leaderboard.html, /methods.html and /assets/icon-192.png, none of which any
version of SHELL has contained.

    python scripts/fix_offline_claims.py --check
    python scripts/fix_offline_claims.py
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "offline.html"

EDITS: list[tuple[str, str]] = [
    ("<title>Vector Hoops — Offline PWA v67</title>",
     "<title>Vector Hoops — Offline</title>"),

    ("PWA v67 • offline shell 13k",
     "shell-only cache • 3 entries"),

    ("offline • cached core 13 assets DENY7 • shell-only no JSON cached • PWA v67",
     "offline • shell-only • 3 entries cached • no JSON cached • cache hoops-v7-3"),

    ("Offline shell v67 dark void #080A0F card says offline. CORE13 cached, no JSON cached (shell-only 13k).",
     "You are offline. sw.js caches three entries and no JSON at all, so the map, "
     "the season data and every model asset need a connection."),

    ("<div class=\"mono\">CORE13 cached exactly</div>",
     "<div class=\"mono\">What is actually cached</div>"),

    ("13 assets exactly — verified via sw CORE list v67",
     "Three entries — read from sw.js SHELL, cache name hoops-v7-3"),

    ("status: offline — dark card #080A0F shell 13k v67",
     "status: offline — shell-only, 3 entries cached"),

    ("PWA v67 manifest • inline only • header pill-yellow",
     "PWA manifest • inline only • network-first"),

    ("sw.js caches SHELL 13 only then fallback /offline.html deny .json /api/* ensures shell-only",
     "sw.js caches SHELL (3 entries) and falls back to /offline; .json and /api/* are never cached, "
     "so a stale model asset can never be served"),

    ("PWA v67 • CORE13 shell-only • DENY7 • #080A0F dark • Week Warrior 7-dot • local only",
     "shell-only • 3 entries • no JSON cached • Week Warrior 7-dot • local only"),
]

# the code block listing thirteen paths, replaced with the three that exist
OLD_LIST = ("/ /index.html /play.html /leaderboard.html /inventory.html /methods.html /offline.html "
            "/manifest.json /assets/icon-192.png /assets/icon-512.png /sw.js / inline / LCG / ww dots hub-streak")
NEW_LIST = "/\n/offline\n/manifest.json"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    if not PAGE.exists():
        sys.exit("offline.html not found")
    text = original = PAGE.read_bytes().decode("utf-8")

    applied = already = missing = 0
    for before, after in EDITS + [(OLD_LIST, NEW_LIST)]:
        if before in text:
            text = text.replace(before, after)
            applied += 1
        elif after in text:
            already += 1
        else:
            print(f"  MISS  {before[:64]!r}")
            missing += 1

    if text != original and not args.check:
        PAGE.write_bytes(text.encode("utf-8"))
        print("  wrote offline.html")
    elif text != original:
        print("  would change offline.html")

    print(f"\n{applied} claim(s) {'to correct' if args.check else 'corrected'}, "
          f"{already} already correct, {missing} not found")
    if missing:
        print("a MISS means the copy moved — re-read the page rather than assuming it is clean")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

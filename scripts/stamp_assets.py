"""Put a content hash on every asset fetch, because assets are cached for a year.

vercel.json sends `public, max-age=31536000, immutable` for assets/*.json.
Verified live. So a regenerated asset never reaches a returning visitor — the
browser will not even revalidate — and the pages compound it by asking for
`{cache:'force-cache'}`.

The repo's convention is a ?v= token bumped by hand. Hand-bumping is what let
the public/ mirror drift for weeks, so this derives the token instead: each
`fetch('assets/X')` gets `?v=<first 8 hex of that file's sha256>`. Change the
file, the URL changes, the cache misses, the visitor gets it. Leave the file
alone and the URL is stable, so the year-long cache still does its job.

Per asset rather than one global stamp: a global one would re-download 400 KB
of game vectors because a 25 KB trends file changed.

    python scripts/stamp_assets.py            # write tokens
    python scripts/stamp_assets.py --check    # fail if any are stale
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# fetch('assets/…')  with an optional existing ?v=… to replace
RE_FETCH = re.compile(r"""(fetch\(\s*['"])(assets/[\w./-]+)(?:\?v=[0-9a-f]+)?(['"])""")

# <script src="/assets/….js"> — same treatment, and it was the bigger hole.
# The vercel.json rule that makes this urgent names js in the same breath as json:
#   /assets/(.*)\.(json|js|css|png|webp|svg|woff2|f32|bin)
#     -> public, max-age=31536000, immutable
# so a script tag with no token is a module pinned in every returning visitor's
# cache for a year. Only stamping fetch() left every <script src> unversioned.
# The optional leading slash is kept in the output: root-absolute is what a page
# in a subdirectory needs, since a relative "assets/x.js" resolves differently
# depending on whether the URL ends in a slash.
RE_SCRIPT = re.compile(
    r"""(<script[^>]*?\ssrc=['"])(/?assets/[\w./-]+\.js)(?:\?v=[0-9a-f]+)?(['"])"""
)

PATTERNS = (RE_FETCH, RE_SCRIPT)


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:8]


def pages() -> list[Path]:
    found = list(ROOT.glob("*.html"))
    for sub in sorted(ROOT.glob("*/index.html")):
        if sub.parent.name != "public":
            found.append(sub)
    return sorted(found)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report stale tokens, write nothing")
    args = ap.parse_args()

    cache: dict[str, str] = {}
    stale: list[str] = []
    written = 0
    missing: list[str] = []

    for page in pages():
        text = page.read_text(encoding="utf-8")

        def sub(m: re.Match) -> str:
            raw = m.group(2)          # as written on the page, may be root-absolute
            rel = raw.lstrip("/")     # as found on disk
            target = ROOT / rel
            if not target.exists():
                # check_frontend's assets check owns reporting this; here it
                # only means "cannot stamp what is not there"
                missing.append(f"{page.name} -> {raw}")
                return m.group(0)
            if rel not in cache:
                cache[rel] = digest(target)
            return f"{m.group(1)}{raw}?v={cache[rel]}{m.group(3)}"

        new = text
        for pattern in PATTERNS:
            new = pattern.sub(sub, new)
        if new != text:
            rel_page = page.relative_to(ROOT).as_posix()
            stale.append(rel_page)
            if not args.check:
                page.write_text(new, encoding="utf-8")
                written += 1

    if missing:
        for m in sorted(set(missing)):
            print(f"  skip (not on disk): {m}")

    if args.check:
        if stale:
            print(f"FAIL {len(stale)} page(s) have stale or missing asset tokens:")
            for p in stale:
                print(f"  - {p}")
            print("  run: python scripts/stamp_assets.py")
            return 1
        print(f"OK   asset tokens current — {len(cache)} distinct asset(s) across {len(pages())} page(s)")
        return 0

    print(f"stamped {written} page(s) — {len(cache)} distinct asset(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

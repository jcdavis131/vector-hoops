"""Let the navigation wrap instead of running off the side of a phone.

Eighteen of twenty-two pages declare `nav{display:flex}` with no `flex-wrap`, so
the links sit on one line and whatever does not fit is simply gone. A 390px
screenshot of /owner shows it plainly: "OWNER PLAYER BRAND DFS PLAY TRE" and then
the edge of the screen.

Not entirely my doing — several of those navs already carried eight links. But
scripts/fix_nav.py appended seven more to the persona pages to make the map
reachable from them, taking those navs from four links to twelve, and I never
looked at one on a phone.

Nothing else on this branch could have caught it. check_responsive.py reads
declared widths and table wrappers; a flex row that clips its own children
declares nothing. It took rendering the page and looking at it.

Adding flex-wrap is additive and has no effect above the width where the links
already fit.

    python scripts/fix_nav_wrap.py --check
    python scripts/fix_nav_wrap.py
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {"public", "node_modules", ".git", "assets", "knowledge", "pipeline", "docs", "scripts", "tasks"}

RE_NAV_RULE = re.compile(r"(?<![\w.#-])(nav\s*\{)([^}]*)(\})")
RE_NAV_EL = re.compile(r"<nav[\s\S]*?</nav>")
RE_INNER_FLEX = re.compile(r"""(<div[^>]*style=")([^"]*display:\s*flex[^"]*)(")""")


def pages() -> list[Path]:
    found = list(ROOT.glob("*.html"))
    for sub in sorted(ROOT.glob("*/index.html")):
        if sub.parent.name not in SKIP_DIRS:
            found.append(sub)
    return sorted(found, key=lambda p: str(p.relative_to(ROOT)))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only, write nothing")
    args = ap.parse_args()

    changed = 0
    for page in pages():
        name = str(page.relative_to(ROOT)).replace("\\", "/")
        text = page.read_bytes().decode("utf-8")
        original = text
        did = []

        # the nav rule itself
        def nav_rule(m: re.Match) -> str:
            body = m.group(2)
            if "flex-wrap" in body or "display:flex" not in body.replace(" ", ""):
                return m.group(0)
            did.append("nav")
            sep = "" if body.rstrip().endswith(";") else ";"
            return m.group(1) + body + sep + "flex-wrap:wrap;gap:8px" + m.group(3)

        text = RE_NAV_RULE.sub(nav_rule, text, count=1)

        # inline flex rows inside the nav — the persona pages group their persona
        # links in one of these, and it clips independently of the nav
        nav_el = RE_NAV_EL.search(text)
        if nav_el:
            def inner(m: re.Match) -> str:
                if "flex-wrap" in m.group(2):
                    return m.group(0)
                did.append("inner")
                return m.group(1) + m.group(2) + ";flex-wrap:wrap" + m.group(3)

            patched = RE_INNER_FLEX.sub(inner, nav_el.group(0))
            text = text[: nav_el.start()] + patched + text[nav_el.end():]

        if text == original:
            continue
        changed += 1
        print(f"  {'would fix' if args.check else 'fixed'}  {name:<26} {', '.join(did)}")
        if not args.check:
            page.write_bytes(text.encode("utf-8"))

    print(f"\n{changed} page(s) {'to change' if args.check else 'changed'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

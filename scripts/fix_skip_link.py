"""Give every page a skip link that works.

WCAG 2.4.1 Bypass Blocks, Level A. Six of twenty-two pages had one. On the other
sixteen a keyboard user tabs through the whole navigation — twelve links on the
persona pages, after fix_nav.py made the map reachable from them — before
reaching any content, on every page, every time.

play.html was worse than missing: it carried skip-link text pointing at `#main`
while its `<main>` had no id at all, so the link went nowhere.

Copies the pattern the six working pages already use rather than inventing one:

    <a class="vh-skip" href="#main">Skip to the content</a>   right after <body>
    .vh-skip{position:absolute;left:-9999px;…}  .vh-skip:focus{left:0}
    <main id="main" tabindex="-1">

The `tabindex="-1"` is the part that is easy to leave out and makes the whole
thing work: without it the anchor scrolls but focus stays where it was, so the
next Tab goes back into the navigation and the link has achieved nothing.

Where a page already uses `id="main"` on some other element — index.html has
`<div class="grid" id="main">` — that element is left as the target and simply
made focusable, rather than moving the id and breaking whatever points at it.

    python scripts/fix_skip_link.py --check
    python scripts/fix_skip_link.py
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {"public", "node_modules", ".git", "assets", "knowledge", "pipeline", "docs", "scripts", "tasks"}

LINK = '<a class="vh-skip" href="#main">Skip to the content</a>'
CSS = (".vh-skip{position:absolute;left:-9999px;top:0;z-index:99;background:var(--paper,#fafaf8);"
       "border:2.2px solid var(--ink,#111);padding:10px 14px;font-family:ui-monospace,Menlo,monospace;"
       "font-weight:800;text-decoration:none;border-radius:0 0 10px 0}\n.vh-skip:focus{left:0}")

RE_BODY = re.compile(r"<body[^>]*>", re.I)
RE_MAIN = re.compile(r"<main\b([^>]*)>", re.I)
RE_ID_MAIN = re.compile(r"""<(\w+)([^>]*\sid=["']?main["'\s>][^>]*)>""", re.I)
RE_STYLE_END = re.compile(r"</style>", re.I)


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

        # 1. a focusable target called main
        target = RE_ID_MAIN.search(text)
        if not target:
            m = RE_MAIN.search(text)
            if m:
                attrs = m.group(1)
                text = text[: m.start()] + f'<main{attrs} id="main" tabindex="-1">' + text[m.end():]
                did.append("target")
            else:
                print(f"  SKIP  {name} has no <main> to point at")
                continue
        elif "tabindex" not in target.group(2):
            # focus must actually move, or the link only scrolls
            text = text[: target.start()] + f'<{target.group(1)}{target.group(2)} tabindex="-1">' + text[target.end():]
            did.append("focusable")

        # 2. the stylesheet rule
        if ".vh-skip" not in text:
            m = RE_STYLE_END.search(text)
            if not m:
                print(f"  SKIP  {name} has no <style> to put the rule in")
                continue
            text = text[: m.start()] + "\n" + CSS + "\n" + text[m.start():]
            did.append("css")

        # 3. the link itself, first thing in the body
        if 'class="vh-skip"' not in text:
            m = RE_BODY.search(text)
            if not m:
                print(f"  SKIP  {name} has no <body>")
                continue
            text = text[: m.end()] + "\n" + LINK + text[m.end():]
            did.append("link")

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

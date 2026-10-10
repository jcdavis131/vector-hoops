"""Install a tiny error hook in <head>, before any page script can fail.

This branch's worst defect was 9a0a4481: index.html shipped

    b.onclick=()=>{...}c.appendChild(b);

with no semicolon and no line break, so the landing page's entire inline script
was a SyntaxError and never ran — on production, for an unknown length of time,
with nothing to notice. assets/error-boundary.js exists and would have recorded
it, except it loads at the end of <body>, and a listener only sees errors from
scripts parsed after it is installed. On index, play, trends, model, teams and
players the first script on the page is the page's own inline block, so the one
class of failure that takes a whole page down is the one class the boundary
cannot see.

Rather than move a 10 KB file into <head> and block parsing on it, this inserts
about 400 bytes inline that only queues. error-boundary.js drains the queue when
it loads and logs each entry the same way it logs anything else — local only,
capped at 50, no external telemetry.

Placed immediately after <meta charset>, because the charset declaration has to
stay inside the first 1024 bytes of the document.

Idempotent.

    python scripts/fix_early_errors.py --check
    python scripts/fix_early_errors.py
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {"public", "node_modules", ".git", "assets", "knowledge", "pipeline", "docs", "scripts", "tasks"}

MARK = "window.__vhErr"

HOOK = (
    '<script>/* early error queue — drained by assets/error-boundary.js. Installed here '
    'because a listener only sees scripts parsed after it, and the page\'s own inline '
    'block used to be first. */'
    'window.__vhErr=[];'
    'window.addEventListener("error",function(e){try{var t=e.target,r=t&&(t.src||t.href);'
    'window.__vhErr.push({type:r?"resource":"js",'
    'message:e.message||("Failed to load "+(r||"")),'
    'source:e.filename||r||"",lineno:e.lineno||0,colno:e.colno||0,'
    'stack:(e.error&&e.error.stack)||""});}catch(_){}} ,true);'
    'window.addEventListener("unhandledrejection",function(e){try{'
    'window.__vhErr.push({type:"unhandledrejection",'
    'message:String((e.reason&&e.reason.message)||e.reason||"")});}catch(_){}});'
    "</script>"
)

RE_CHARSET = re.compile(r"<meta[^>]+charset[^>]*>", re.I)


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

    changed = already = missing = 0
    for page in pages():
        name = str(page.relative_to(ROOT)).replace("\\", "/")
        text = page.read_bytes().decode("utf-8")
        if MARK in text:
            already += 1
            continue
        m = RE_CHARSET.search(text)
        if not m:
            print(f"  MISS  {name} has no <meta charset> to anchor to")
            missing += 1
            continue
        # it must precede every other script on the page, or it defeats itself
        first_script = text.find("<script")
        if 0 <= first_script < m.end():
            print(f"  MISS  {name} already has a <script> before its charset meta")
            missing += 1
            continue
        new = text[: m.end()] + "\n" + HOOK + text[m.end():]
        changed += 1
        print(f"  {'would add' if args.check else 'added'} to {name}")
        if not args.check:
            page.write_bytes(new.encode("utf-8"))

    print(f"\n{changed} page(s) {'to change' if args.check else 'changed'}, "
          f"{already} already had it, {missing} could not be anchored")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())

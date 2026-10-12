"""Load the three site-wide utility modules on every page, not just one.

assets/keyboard-a11y.js, assets/error-boundary.js and assets/pwa-install.js are
committed, working, and were loaded by exactly one page: player-animations.html.
The gap that matters is the first one. 16 of the 22 pages ship no :focus-visible
rule of their own and 15 ship no :focus rule either, so a keyboard user cannot
see what is focused — WCAG 2.4.7 Focus Visible, Level AA. keyboard-a11y.js
injects that ring, plus roving tabindex on tablists, combobox ARIA on suggest
inputs, and Escape-closes-sheets. It has been sitting in the repo unloaded.

Placement copies what player-animations.html already does: immediately before
the service-worker registration at the end of <body>. That is late enough that
error-boundary.js will not catch errors thrown by a page's own inline script
during first execution — it still catches async, resource and rejection errors,
and the alternative (a blocking script in <head>) is a bigger change than this
is worth. Noted on the board rather than decided silently.

offline.html is skipped: it renders when the network is down and sw.js does not
precache these modules, so the tags would be guaranteed-dead references.

Tokens are deliberately NOT written here. scripts/stamp_assets.py owns that and
now stamps <script src> too; run it after this. Idempotent — a page that already
loads a module is left alone.

    python scripts/wire_a11y.py --check    # report, write nothing
    python scripts/wire_a11y.py            # insert the tags
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {"public", "node_modules", ".git", "assets", "knowledge", "pipeline", "docs", "scripts", "tasks"}

# Order matters: the error boundary installs its handlers before the other two
# run, so a throw inside them is still captured.
MODULES = ("error-boundary.js", "keyboard-a11y.js", "pwa-install.js")

# offline.html renders with no network; player-animations.html already has them.
SKIP_PAGES = {"offline.html"}

# Insert before the service-worker registration when there is one — that is where
# player-animations.html puts the block — otherwise before </body>.
RE_SW = re.compile(r"""<script>\s*if\s*\(\s*['"]serviceWorker['"]\s+in\s+navigator""")
RE_BODY_END = re.compile(r"</body\s*>", re.I)


def pages() -> list[Path]:
    found = list(ROOT.glob("*.html"))
    for sub in sorted(ROOT.glob("*/index.html")):
        if sub.parent.name not in SKIP_DIRS:
            found.append(sub)
    return sorted(found, key=lambda p: str(p.relative_to(ROOT)))


def label(p: Path) -> str:
    return str(p.relative_to(ROOT)).replace("\\", "/")


def tag_for(page: Path, module: str) -> str:
    # Root-absolute so a page in a subdirectory resolves it the same way a root
    # page does. vercel.json sets trailingSlash:false, but a relative path would
    # still break the moment a URL gained a trailing slash.
    depth = len(page.relative_to(ROOT).parts) - 1
    src = f"/assets/{module}" if depth else f"assets/{module}"
    return f'<script src="{src}"></script>'


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only, write nothing")
    args = ap.parse_args()

    changed, already, skipped, no_anchor = [], [], [], []

    for page in pages():
        if page.name in SKIP_PAGES:
            skipped.append(label(page))
            continue

        raw = page.read_bytes()
        text = raw.decode("utf-8")

        missing = [m for m in MODULES if f"assets/{m}" not in text]
        if not missing:
            already.append(label(page))
            continue

        block = "\n".join(tag_for(page, m) for m in missing) + "\n"

        anchor = RE_SW.search(text)
        if anchor:
            at = anchor.start()
        else:
            anchor = RE_BODY_END.search(text)
            if not anchor:
                no_anchor.append(label(page))
                continue
            at = anchor.start()

        new = text[:at] + block + text[at:]
        changed.append(f"{label(page)}  (+{len(missing)})")
        if not args.check:
            # bytes in, bytes out: no newline translation, no re-encoding
            page.write_bytes(new.encode("utf-8"))

    for p in skipped:
        print(f"  skip      {p}  (renders offline; modules are not precached)")
    for p in already:
        print(f"  already   {p}")
    for p in changed:
        print(f"  {'would wire' if args.check else 'wired'}  {p}")
    if no_anchor:
        print(f"FAIL no </body> in: {', '.join(no_anchor)}")
        return 1

    verb = "would change" if args.check else "changed"
    print(f"\n{verb} {len(changed)} page(s); {len(already)} already loaded them; {len(skipped)} skipped")
    if changed and not args.check:
        print("now run: python scripts/stamp_assets.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

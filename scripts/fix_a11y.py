"""Close the static accessibility failures scripts/check_a11y.py reports.

81 of them, and they are not exotic: 15 pages had no <main> landmark, 12 had no
<h1> at all, ~40 table headers declared no scope, 4 inputs had only a
placeholder, and one link's entire accessible name was "/".

Choices worth stating, because each one had a worse option:

* **<h1> is visually hidden, not promoted.** The persona pages use
  `<div class="mono">Owner Lab • …</div>` as their visual title, and promoting
  that to an <h1> is the better semantic fix. I cannot see these pages, and
  promoting a styled div across 12 files is exactly the kind of unreviewed visual
  change I removed a runtime 44px sweep for. A hidden <h1> taken from the page's
  own <title> is correct for a screen reader, invisible to everyone else, and
  cheap to upgrade later.

* **The hidden style is inline**, not a class. Not every page defines `.vh-sr`,
  and a hidden heading that silently becomes visible because a class is missing
  is worse than no heading.

* **<main> opens after </nav> and closes before the footer** — every page has
  exactly one </nav>, which makes the open anchor unambiguous. Trailing script
  tags end up inside the landmark on pages with no footer; that is valid, and it
  beats guessing where content stops.

* **scope="col"**, because every <th> without one here sits in a <thead> row.
  Row headers would need scope="row" and there are none.

Idempotent. Run check_a11y.py after.

    python scripts/fix_a11y.py --check
    python scripts/fix_a11y.py
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {"public", "node_modules", ".git", "assets", "knowledge", "pipeline", "docs", "scripts", "tasks"}

SR_ONLY = (
    "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;"
    "clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0"
)

# input -> the name it should announce. Placeholder text is not an accessible
# name; browsers expose it only as a last resort and it disappears on input.
INPUT_LABELS = {
    # /player was invisible to every root-walking check until its file moved
    # out of public/; these three controls had no accessible name at all.
    "q": "Search for a player by name",
    "teamCap": "Filter by team cap situation",
    "archSel": "Filter by archetype",
    "packIn": "Pack code, for example 672-123-456",
    "guess": "Type a modern player to guess the twin",
}
PLACEHOLDER_LABELS = {"player id": "Player id"}


def pages() -> list[Path]:
    found = list(ROOT.glob("*.html"))
    for sub in sorted(ROOT.glob("*/index.html")):
        if sub.parent.name not in SKIP_DIRS:
            found.append(sub)
    return sorted(found, key=lambda p: str(p.relative_to(ROOT)))


def page_heading(text: str) -> str:
    m = re.search(r"<title[^>]*>(.*?)</title>", text, re.S | re.I)
    t = re.sub(r"\s+", " ", m.group(1)).strip() if m else "Vector Hoops"
    # the site name is already the <title> prefix; the heading names the page
    t = re.sub(r"^(?:Vector Hoops|dumbmodel)\s*[—\-–]\s*", "", t).strip()
    return t or "Vector Hoops"


RE_SCRIPT_BLOCK = re.compile(r"<script[^>]*>.*?</script>", re.S | re.I)


def outside_scripts(text: str, fn) -> str:
    """Apply fn to the markup only, never inside a <script>.

    A first version rewrote <th> everywhere and reported 64 fixes where the audit
    saw 41 — the extra 23 were inside JavaScript template strings. Editing markup
    inside a JS string with a regex can produce something that still parses and
    still emits the wrong HTML, which is the failure mode with no symptom. Tables
    built in script are fixed where they are built; see teams.html, which sets
    scope on the headers it generates.
    """
    out, last = [], 0
    for m in RE_SCRIPT_BLOCK.finditer(text):
        out.append(fn(text[last:m.start()]))
        out.append(m.group(0))
        last = m.end()
    out.append(fn(text[last:]))
    return "".join(out)


def fix(text: str) -> tuple[str, list[str]]:
    did: list[str] = []

    # ── th scope ────────────────────────────────────────────────────────────
    def th(m: re.Match) -> str:
        if re.search(r"\bscope\s*=", m.group(1) or "", re.I):
            return m.group(0)
        did.append("th-scope")
        return f"<th scope=\"col\"{m.group(1)}>"

    text = outside_scripts(text, lambda s: re.sub(r"<th((?:\s+[^>]*?)?)>", th, s, flags=re.I))

    # ── input names ─────────────────────────────────────────────────────────
    def inp(m: re.Match) -> str:
        tag = m.group(0)
        if re.search(r"\baria-label(?:ledby)?\s*=", tag, re.I):
            return tag
        idm = re.search(r"""\bid\s*=\s*["']?([\w-]+)""", tag)
        label = INPUT_LABELS.get(idm.group(1)) if idm else None
        if not label:
            ph = re.search(r"""\bplaceholder\s*=\s*["']([^"']*)["']""", tag, re.I)
            if ph:
                label = PLACEHOLDER_LABELS.get(ph.group(1).strip().lower())
        if not label:
            return tag
        did.append("label")
        return tag[:-1].rstrip() + f' aria-label="{label}">'

    text = outside_scripts(text, lambda s: re.sub(r"<input\b[^>]*>", inp, s, flags=re.I))
    # <select> was never handled: three unnamed ones sat on /player.
    text = outside_scripts(text, lambda s: re.sub(r"<select\b[^>]*>", inp, s, flags=re.I))

    # ── the link whose whole name was "/" ───────────────────────────────────
    if '<a href="/index.html">/</a>' in text:
        text = text.replace('<a href="/index.html">/</a>', '<a href="/index.html" aria-label="Home">/</a>')
        did.append("btn-name")

    # ── main landmark ───────────────────────────────────────────────────────
    if not re.search(r"<main\b", text, re.I) and "</nav>" in text:
        at = text.index("</nav>") + len("</nav>")
        # On four pages the <nav> lives inside a <header>, so opening the
        # landmark straight after </nav> put <main> inside <header> and let
        # </header> close across it. Opening after </header> instead. Caught by
        # checking tag balance inside the inserted landmark, not by reading it.
        h_open = text.lower().find("<header")
        h_close = text.lower().find("</header>")
        if 0 <= h_open < at <= h_close:
            at = h_close + len("</header>")
        close = None
        for pat in (r"<footer\b", r"""<script[^>]+src=["'][^"']*error-boundary\.js""", r"</body\s*>"):
            m = re.search(pat, text[at:], re.I)
            if m:
                close = at + m.start()
                break
        if close:
            # index.html already had <div class="grid" id="main"> as its skip-link
            # target, so an unconditional id here defined it twice and
            # getElementById would have picked one of them. The landmark does not
            # need the id — the existing target ends up inside it and the skip
            # link keeps working.
            attr = "" if re.search(r"""\sid\s*=\s*["']?main["'\s>]""", text, re.I) else ' id="main"'
            text = text[:at] + f"\n<main{attr}>" + text[at:close] + "</main>\n" + text[close:]
            did.append("main")

    # ── one h1 per page ─────────────────────────────────────────────────────
    if not re.search(r"<h1\b", text, re.I):
        head = page_heading(text)
        h1 = f'<h1 style="{SR_ONLY}">{head}</h1>'
        m = re.search(r"<main\b[^>]*>", text, re.I)
        if m:
            text = text[: m.end()] + h1 + text[m.end():]
            did.append("h1")
        elif "</nav>" in text:
            at = text.index("</nav>") + len("</nav>")
            text = text[:at] + h1 + text[at:]
            did.append("h1")

    return text, did


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only, write nothing")
    args = ap.parse_args()

    total: dict[str, int] = {}
    touched = 0
    for page in pages():
        raw = page.read_bytes().decode("utf-8")
        new, did = fix(raw)
        if not did:
            continue
        touched += 1
        for d in did:
            total[d] = total.get(d, 0) + 1
        name = str(page.relative_to(ROOT)).replace("\\", "/")
        summary = ", ".join(f"{k}×{did.count(k)}" for k in dict.fromkeys(did))
        print(f"  {'would fix' if args.check else 'fixed'}  {name:<26} {summary}")
        if not args.check:
            page.write_bytes(new.encode("utf-8"))

    print(f"\n{touched} page(s), " + ", ".join(f"{k} {v}" for k, v in sorted(total.items())) if total else "\nnothing to do")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

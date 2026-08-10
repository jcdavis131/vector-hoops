"""Things that overflow a phone, decided from the markup.

Most visits to a site like this are on a phone, the brief asks for SOTA UX
throughout, and every check on this branch so far has looked at a desktop-shaped
page. This looks for the failures a static read can settle:

  viewport   every page declares <meta name=viewport>, or nothing scales
  wide       an element whose CSS forces it wider than a phone viewport, with
             nothing around it that scrolls
  table      a table of six or more columns, or one with nowrap cells, that has
             no scrollable ancestor

NARROW is 360px — a common Android width, narrower than an iPhone.

Both element checks resolve the wrapper from the **markup**, not from CSS
selectors. An earlier version compared selectors and reported five correctly
wrapped things — #retrMap inside #retrWrap, #archMap and svg.chart inside
.figwrap, #foTable inside #foWrap — because a stylesheet cannot say what contains
what. It also demanded the literal `overflow-x` and missed containers using
`overflow:auto`, and read `<table>` inside JavaScript strings as markup.

Three or four column tables are not reported: they wrap and compress, which is
the ordinary responsive case. What overflows is a wide one, or one whose cells
refuse to wrap.

It cannot lay the page out. It reports what is declared, which is where the
overflow bugs on this site come from. Real wrapping and tap ergonomics need a
device.

    python scripts/check_responsive.py
    python scripts/check_responsive.py --root public
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {"public", "node_modules", ".git", "assets", "knowledge", "pipeline", "docs", "scripts", "tasks"}

NARROW = 360
# below this a table wraps and compresses; at or above it, or with nowrap cells,
# it needs somewhere to scroll
WIDE_TABLE_COLS = 6

RE_STYLE = re.compile(r"<style[^>]*>(.*?)</style>", re.S | re.I)
RE_CSS_COMMENT = re.compile(r"/\*.*?\*/", re.S)
RE_RULE = re.compile(r"([^{}]+)\{([^{}]*)\}", re.S)
RE_VIEWPORT = re.compile(r"""<meta[^>]+name=["']?viewport""", re.I)
RE_SCRIPT_BLOCK = re.compile(r"<script[^>]*>.*?</script>", re.S | re.I)


def pages(root: Path) -> list[Path]:
    found = list(root.glob("*.html"))
    for sub in sorted(root.glob("*/index.html")):
        if sub.parent.name not in SKIP_DIRS:
            found.append(sub)
    return sorted(found, key=lambda p: str(p.relative_to(root)))


def px(decls: str, prop: str) -> float | None:
    m = re.search(r"(?<![-\w])" + prop + r"\s*:\s*([\d.]+)px", decls)
    return float(m.group(1)) if m else None


def scrollers(css: str) -> set[str]:
    """Selectors that can scroll sideways, so anything inside them is fine."""
    out = set()
    for m in RE_RULE.finditer(css):
        sel, decls = m.group(1).strip(), m.group(2)
        if re.search(r"overflow(-x)?\s*:\s*(auto|scroll)", decls):
            for s in sel.split(","):
                out.add(s.strip())
    return out


def ancestor_scrolls(raw: str, pos: int, names: set[str], window: int = 400) -> bool:
    """Walk back from pos for an opening tag that scrolls — inline, or by a class
    or id the stylesheet gives overflow to. Any axis counts: a container with
    `overflow:auto` scrolls horizontally too."""
    before = raw[max(0, pos - window): pos]
    for tag in reversed(re.findall(r"<(?:div|section|figure|main|details)[^>]*>", before)):
        if re.search(r"overflow(-x)?\s*:\s*(auto|scroll)", tag):
            return True
        got = " ".join(re.findall(r"""(?:class|id)=["']([^"']+)""", tag)).split()
        if any(n in got for n in names):
            return True
    return False


def wide_overflows(raw: str, sel: str, can_scroll: set[str]) -> bool:
    """Does the element this selector targets sit inside something that scrolls?

    The first version of this compared CSS selectors and reported five correctly
    wrapped elements as overflowing — #retrMap inside #retrWrap, #archMap and
    svg.chart inside .figwrap, #foTable inside #foWrap. A stylesheet cannot tell
    you what contains what; the markup can. So find the element and walk back
    through the text for an opening tag that either declares overflow inline or
    carries a class or id that declares it in CSS.
    """
    key = sel.split(",")[0].strip().split()[-1]
    m = re.match(r"[#.]([\w-]+)", key)
    if not m:
        return True                          # a bare tag selector — cannot locate it, do not cry wolf
    attr = "id" if key.startswith("#") else "class"
    hits = list(re.finditer(rf"""<[^>]+{attr}=["'][^"']*\b{re.escape(m.group(1))}\b""", raw))
    if not hits:
        return True                          # declared but never used
    names = {s.lstrip("#.") for s in can_scroll}
    for h in hits:
        window = raw[max(0, h.start() - 400): h.start()]
        opens = re.findall(r"<(?:div|section|figure|main)[^>]*>", window)
        ok = False
        for tag in reversed(opens):
            if re.search(r"overflow(-x)?\s*:\s*(auto|scroll)", tag):
                ok = True
                break
            got = re.findall(r"""(?:class|id)=["']([^"']+)""", tag)
            if any(n in " ".join(got).split() for n in names):
                ok = True
                break
        if not ok:
            return False
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", help="directory to check instead of the repo root")
    args = ap.parse_args()
    root = Path(args.root).resolve() if args.root else ROOT
    if not root.is_dir():
        sys.exit(f"--root {args.root} is not a directory")

    failures: list[str] = []
    counts = {"viewport": 0, "wide": 0, "table": 0}

    for page in pages(root):
        name = str(page.relative_to(root)).replace("\\", "/")
        raw = page.read_text(encoding="utf-8", errors="replace")
        css = RE_CSS_COMMENT.sub(" ", "\n".join(RE_STYLE.findall(raw)))

        counts["viewport"] += 1
        if not RE_VIEWPORT.search(raw):
            failures.append(f"{name}: no <meta name=viewport> — the page will not scale on a phone")

        can_scroll = scrollers(css)

        for m in RE_RULE.finditer(css):
            sel, decls = m.group(1).strip(), m.group(2)
            if sel.startswith("@"):
                continue
            w = px(decls, "min-width") or px(decls, "width")
            if w is None or w <= NARROW:
                continue
            counts["wide"] += 1
            if re.search(r"overflow(-x)?\s*:\s*(auto|scroll)", decls):
                continue                     # scrolls itself
            if not wide_overflows(raw, sel, can_scroll):
                failures.append(
                    f"{name}: {sel[:44]!r} is {w:g}px wide with no scrollable ancestor "
                    f"— on a {NARROW}px screen this drags the page sideways"
                )

        # every table needs a scroll parent. Same markup walk as the wide check:
        # the first version looked for the literal string overflow-x within 220
        # characters and reported five wrapped tables, because inventory and teams
        # use `overflow:auto`, player uses a .tablewrap class, and model builds one
        # of its tables in script under an element that scrolls.
        names = {s.lstrip("#.") for s in can_scroll}
        markup = RE_SCRIPT_BLOCK.sub(" ", raw)   # a <table> inside a JS string is not markup yet
        nowrap = bool(re.search(r"white-space\s*:\s*nowrap", css))
        for m in re.finditer(r"<table[^>]*>([\s\S]*?)</table>", markup, re.I):
            counts["table"] += 1
            cols = len(re.findall(r"<th\b", m.group(1)))
            # a three or four column table with wrapping text is the ordinary
            # responsive case and compresses fine. What actually overflows is a
            # wide one, or one whose cells refuse to wrap.
            if cols < WIDE_TABLE_COLS and not nowrap:
                continue
            if not ancestor_scrolls(markup, m.start(), names):
                failures.append(
                    f"{name}: a {cols}-column <table> has no scrollable ancestor — on a "
                    f"{NARROW}px screen this drags the page sideways"
                )

    for k, v in counts.items():
        print(f"  {k:<10} {v} checked")
    print()
    if failures:
        print(f"FAIL — {len(failures)} responsive problem(s):")
        for f in sorted(set(failures)):
            print(f"  - {f}")
        return 1
    print(f"OK — nothing declared overflows a {NARROW}px viewport across {len(pages(root))} pages")
    print("  (real layout, wrapping and tap ergonomics still need a device)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Statically-checkable accessibility failures across every page.

The brief says "make all pages free and accessible". I did the focus-ring half —
16 of 22 pages had no :focus-visible rule at all — and then treated accessibility
as finished, which it was not. This checks the criteria a static reader can
actually settle. It cannot judge colour contrast or reading order; those need a
browser and a person, and it says so rather than implying coverage it lacks.

What it checks, all WCAG A/AA and all objectively decidable from the markup:

  lang        <html lang> present                         3.1.1
  title       non-empty <title>, unique across the site   2.4.2
  img-alt     every <img> has alt=, or is aria-hidden     1.1.1
  label       every input/select/textarea has a name      3.3.2 / 4.1.2
  main        a <main> or role=main landmark exists       1.3.1
  h1          exactly one <h1>                            1.3.1
  heading     no skipped heading level                    1.3.1
  btn-name    no control whose only content is an icon    4.1.2
  tabindex    no positive tabindex                        2.4.3
  th-scope    every <th> declares scope                   1.3.1

    python scripts/check_a11y.py
    python scripts/check_a11y.py --root public
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {"public", "node_modules", ".git", "assets", "knowledge", "pipeline", "docs", "scripts", "tasks"}

RE_COMMENT = re.compile(r"<!--.*?-->", re.S)
RE_SCRIPT = re.compile(r"<script[^>]*>.*?</script>", re.S)
RE_TAG = re.compile(r"<(\w+)((?:\s+[^>]*?)?)>", re.S)
# an accessible name can come from any of these
RE_HAS_NAME = re.compile(r"""\b(aria-label|aria-labelledby|title)\s*=\s*["']?[^"'\s>]""", re.I)
# text that carries no name: emoji, arrows, punctuation, whitespace, entities
RE_ICON_ONLY = re.compile(r"^(?:\s|&[a-z]+;|&#\d+;|[^\w\s])*$")


def pages(root: Path) -> list[Path]:
    found = list(root.glob("*.html"))
    for sub in sorted(root.glob("*/index.html")):
        if sub.parent.name not in SKIP_DIRS:
            found.append(sub)
    return sorted(found, key=lambda p: str(p.relative_to(root)))


def mirrors(a: str, b: str) -> bool:
    """Is this the same page twice — brand.html and brand/index.html?

    vercel.json rewrites /brand to /brand/index.html, so only one of the pair is
    ever served and their titles matching is not a WCAG 2.4.2 failure. That the
    duplicates exist at all is a separate problem, already on the board.
    """
    stems = {a[:-5] if a.endswith(".html") else a, b[:-5] if b.endswith(".html") else b}
    return {s[:-6] if s.endswith("/index") else s for s in stems}.__len__() == 1


def attrs(raw: str) -> dict:
    out = {}
    for m in re.finditer(r"""([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?""", raw):
        out[m.group(1).lower()] = (m.group(2) or m.group(3) or m.group(4) or "")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", help="directory to check instead of the repo root")
    ap.add_argument("--only", help="comma-separated subset of checks")
    args = ap.parse_args()

    root = Path(args.root).resolve() if args.root else ROOT
    if not root.is_dir():
        sys.exit(f"--root {args.root} is not a directory")
    want = {c.strip() for c in args.only.split(",")} if args.only else None

    def on(name: str) -> bool:
        return want is None or name in want

    failures: list[str] = []
    titles: dict[str, str] = {}
    counts = {k: 0 for k in ("lang", "title", "img-alt", "label", "main", "h1", "heading", "btn-name", "tabindex", "th-scope")}

    for page in pages(root):
        name = str(page.relative_to(root)).replace("\\", "/")
        raw = page.read_text(encoding="utf-8", errors="replace")
        body = RE_SCRIPT.sub(" ", RE_COMMENT.sub(" ", raw))

        if on("lang"):
            counts["lang"] += 1
            m = re.search(r"<html([^>]*)>", body, re.I)
            if not m or not attrs(m.group(1)).get("lang"):
                failures.append(f"{name}: <html> has no lang attribute (WCAG 3.1.1)")

        if on("title"):
            counts["title"] += 1
            m = re.search(r"<title[^>]*>(.*?)</title>", body, re.S | re.I)
            t = (m.group(1).strip() if m else "")
            if not t:
                failures.append(f"{name}: no non-empty <title> (WCAG 2.4.2)")
            elif t in titles and not mirrors(name, titles[t]):
                failures.append(f"{name}: <title> duplicates {titles[t]} — {t!r} (WCAG 2.4.2)")
            elif t not in titles:
                titles[t] = name

        if on("img-alt"):
            for m in re.finditer(r"<img((?:\s+[^>]*?)?)>", body, re.I):
                counts["img-alt"] += 1
                a = attrs(m.group(1))
                if "alt" not in a and a.get("aria-hidden") != "true" and a.get("role") != "presentation":
                    failures.append(f"{name}: <img src={a.get('src','?')[:50]}> has no alt (WCAG 1.1.1)")

        if on("label"):
            ids_labelled = set(re.findall(r"<label[^>]*\bfor\s*=\s*[\"']?([\w-]+)", body, re.I))
            for m in re.finditer(r"<(input|select|textarea)((?:\s+[^>]*?)?)>", body, re.I):
                a = attrs(m.group(2))
                if a.get("type", "").lower() in {"hidden", "submit", "button", "reset", "image"}:
                    continue
                counts["label"] += 1
                if RE_HAS_NAME.search(m.group(2)) or a.get("id", "") in ids_labelled:
                    continue
                failures.append(
                    f"{name}: <{m.group(1)} id={a.get('id','?')}> has no label, aria-label or "
                    f"aria-labelledby (WCAG 3.3.2)"
                )

        if on("main"):
            counts["main"] += 1
            if not re.search(r"<main\b", body, re.I) and not re.search(r"""role\s*=\s*["']?main""", body, re.I):
                failures.append(f"{name}: no <main> or role=main landmark (WCAG 1.3.1)")

        heads = [(int(m.group(1)), re.sub(r"<[^>]+>", "", m.group(2)).strip())
                 for m in re.finditer(r"<h([1-6])[^>]*>(.*?)</h\1>", body, re.S | re.I)]
        if on("h1"):
            counts["h1"] += 1
            n = sum(1 for lv, _ in heads if lv == 1)
            if n == 0:
                failures.append(f"{name}: no <h1> (WCAG 1.3.1)")
            elif n > 1:
                failures.append(f"{name}: {n} <h1> elements — a page has one top-level heading (WCAG 1.3.1)")
        if on("heading"):
            prev = 0
            for lv, txt in heads:
                counts["heading"] += 1
                if prev and lv > prev + 1:
                    failures.append(f"{name}: heading jumps h{prev} -> h{lv} at {txt[:40]!r} (WCAG 1.3.1)")
                prev = lv

        if on("btn-name"):
            for m in re.finditer(r"<(button|a)((?:\s+[^>]*?)?)>(.*?)</\1>", body, re.S | re.I):
                tag, at, inner = m.group(1), m.group(2), m.group(3)
                a = attrs(at)
                if tag == "a" and "href" not in a:
                    continue
                if a.get("aria-hidden") == "true":
                    continue
                counts["btn-name"] += 1
                text = re.sub(r"<[^>]+>", "", inner)
                if RE_HAS_NAME.search(at):
                    continue
                if text.strip() and not RE_ICON_ONLY.match(text):
                    continue
                failures.append(
                    f"{name}: <{tag}> content {text.strip()[:18]!r} carries no accessible name (WCAG 4.1.2)"
                )

        if on("tabindex"):
            for m in re.finditer(r"""tabindex\s*=\s*["']?(\d+)""", body, re.I):
                counts["tabindex"] += 1
                if int(m.group(1)) > 0:
                    failures.append(f"{name}: tabindex={m.group(1)} overrides document order (WCAG 2.4.3)")

        if on("th-scope"):
            for m in re.finditer(r"<th((?:\s+[^>]*?)?)>", body, re.I):
                counts["th-scope"] += 1
                if "scope" not in attrs(m.group(1)):
                    failures.append(f"{name}: <th> without scope= (WCAG 1.3.1)")

    for k, v in counts.items():
        if want is None or k in want:
            print(f"  {k:<10} {v} checked")

    print()
    if failures:
        print(f"FAIL — {len(failures)} accessibility problem(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(f"OK — no static accessibility failures across {len(pages(root))} pages")
    print("  (reading order, focus order and real screen-reader flow still need a browser")
    print("   and a person; contrast is checked by scripts/check_contrast.py)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

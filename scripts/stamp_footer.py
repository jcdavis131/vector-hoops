"""One footer for every served page, rendered at build time from assets/site-nav.js.

LAUNCH-AUDIT #17: four footer variants shipped (a sitemap, a sitemap plus games,
a compact link row, a one-liner); the Explore column skipped Map Hunt, Twin
Networks, Twenty Questions, Replay and Models; "How it works" pointed at
dumbmodel.com while the nav's pointed at /methods. Each page carried its own
copy, so each drifted on its own.

This renders one block from the two lists site-nav.js already owns - EXPLORE
(the drawer) and GAMES - and writes it into every served page as static HTML,
so no-JS visitors and crawlers keep the sitemap. Parity is a byte-compare, the
same contract as stamp_assets.py: --check exits 1 when any page's block differs
from the rendered template, and the default mode rewrites them.

Columns: Play is GAMES; Explore is EXPLORE minus the brand slot ("/"), minus the
games, minus the two "How it works" doors; How it works is Methods, Models and
the source repo. The attribution line names the data sources and says nothing
about the model (DESIGN-DIRECTION D21).

The block sits between `<!-- footer:stamped -->` and `<!-- /footer:stamped -->`.
A page with a stamped block gets it replaced; a page with a legacy
`<footer class="site-footer">` gets that replaced; a page with neither gets the
block inserted before `</body>`. A page that would end up with more than one
<footer> (a second legacy footer, one inside <noscript>) fails in both modes.
Pages in DEFER are left alone in both modes.

The lists are read straight out of the JS source, so they have to stay the
shape the parser reads: one flat object per entry, `key: 'value'` pairs, no
`{`/`}` in a value, no nested objects. Comments are stripped first (a `]` in
a comment cannot end the array early), and the run exits 2 if the number of
entries parsed is not the number of `href:` keys in the array - a quietly
dropped entry would otherwise stamp a shorter sitemap onto every page.

Generated pages come out without a footer (pipeline/build_insights.py writes
insights/<slug>.html): run this after the generator, the way stamp_assets.py
runs after an asset rebuild.

Writes are LF on every platform. A CRLF checkout reads as LF (universal
newlines) and compares clean; a page that is rewritten goes back LF, so the
bytes here are the bytes CI and Vercel see.

    python scripts/stamp_footer.py            # write the footer into every served page
    python scripts/stamp_footer.py --check    # exit 1 if any page's footer is stale or missing
    python scripts/stamp_footer.py --root DIR # another tree (tests)
"""

from __future__ import annotations

import argparse
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# The served page set, kept identical to budget_check.py and check_design.py.
PAGE_GLOBS = ("*.html", "insights/*.html", "play/*.html", "models/*.html")

# Pages left alone in both modes, each with the reason.
DEFER = {
    "index.html": "Scout's #165 rewrites index.html; its footer is stamped on the next pass",
    "offline.html": "self-contained, no shell.css until task 2.7 gives it the head",
}

NAV_SRC = "assets/site-nav.js"
SOURCE_URL = "https://github.com/jcdavis131/vector-hoops"
BRAND_HREFS = ("/",)  # the brand / Map slot the nav already owns
HOW_HREFS = ("/methods", "/models/mtnn-v5")  # EXPLORE entries that belong under "How it works"
ATTRIBUTION = 'Scores and stats from stats.nba.com and ESPN · A <a href="https://dumbmodel.com">dumbmodel</a> project'

BEGIN = "<!-- footer:stamped -->"
END = "<!-- /footer:stamped -->"
RE_STAMPED = re.compile(re.escape(BEGIN) + r".*?" + re.escape(END), re.S)
RE_LEGACY = re.compile(
    r"""<footer\b[^>]*\bclass\s*=\s*["'][^"']*\bsite-footer\b[^"']*["'][^>]*>.*?</footer>""", re.S | re.I
)
RE_FOOTER_OPEN = re.compile(r"<footer\b", re.I)
RE_HTML_COMMENT = re.compile(r"<!--.*?-->", re.S)
RE_BODY_END = re.compile(r"</body\s*>", re.I)
RE_PAIR = re.compile(r"""(\w+)\s*:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")""")
RE_HREF_KEY = re.compile(r"\bhref\s*:")
RE_JS_UNICODE = re.compile(r"\\u([0-9a-fA-F]{4})")
QUOTES = "'\"`"


def strip_comments(js: str) -> str:
    """js with `//` and `/* */` comments blanked to spaces (newlines kept), string literals left alone."""
    out: list[str] = []
    i, n, quote = 0, len(js), None
    while i < n:
        c = js[i]
        if quote:
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(js[i + 1])
                i += 2
                continue
            if c == quote:
                quote = None
            i += 1
        elif c in QUOTES:
            quote = c
            out.append(c)
            i += 1
        elif js.startswith("//", i):
            j = js.find("\n", i)
            j = n if j == -1 else j
            out.append(" " * (j - i))
            i = j
        elif js.startswith("/*", i):
            j = js.find("*/", i + 2)
            j = n if j == -1 else j + 2
            out.append("".join("\n" if ch == "\n" else " " for ch in js[i:j]))
            i = j
        else:
            out.append(c)
            i += 1
    return "".join(out)


def array_body(js: str, name: str) -> str | None:
    """The text between the brackets of `var|let|const NAME = [ ... ]`, or None when absent or unclosed.

    Brackets inside string literals do not count; js must already have its comments stripped.
    """
    m = re.search(r"\b(?:var|let|const)\s+" + re.escape(name) + r"\s*=\s*\[", js)
    if not m:
        return None
    start = m.end()
    depth, quote, i = 1, None, start
    while i < len(js):
        c = js[i]
        if quote:
            if c == "\\":
                i += 1
            elif c == quote:
                quote = None
        elif c in QUOTES:
            quote = c
        elif c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                return js[start:i]
        i += 1
    return None


def js_string(raw: str) -> str:
    """A JS string literal's body with \\uXXXX, \\', \\" and \\\\ resolved: enough for a label."""
    raw = RE_JS_UNICODE.sub(lambda m: chr(int(m.group(1), 16)), raw)
    return raw.replace("\\'", "'").replace('\\"', '"').replace("\\\\", "\\")


def nav_list(js: str, name: str) -> list[dict[str, str]]:
    """`var NAME = [ {href, label, ...}, ... ]` out of site-nav.js, one dict per object.

    Comments are stripped and the array bracket-matched outside strings, so a `]` in a comment
    or a label cannot end it early. Each `{...}` yields its quoted `key: 'value'` pairs. An absent
    or unclosed array is []. Raises ValueError when the entries parsed are fewer than the `href:`
    keys in the array: a `{`/`}` in a value or a nested object would otherwise drop an entry silently.
    """
    body = array_body(strip_comments(js), name)
    if body is None:
        return []
    items = []
    for obj in re.finditer(r"\{([^{}]*)\}", body):
        pairs = {key: js_string(single or double) for key, single, double in RE_PAIR.findall(obj.group(1))}
        if pairs.get("href") and pairs.get("label"):
            items.append(pairs)
    expected = len(RE_HREF_KEY.findall(body))
    if len(items) != expected:
        raise ValueError(
            f"{name}: parsed {len(items)} of {expected} entries; keep one flat object per entry with "
            "quoted href and label, no '{'/'}' in a value, no nested objects"
        )
    return items


def columns(explore: list[dict[str, str]], games: list[dict[str, str]]) -> list[tuple[str, list[tuple[str, str]]]]:
    """(title, [(href, label), ...]) for the three sitemap columns."""
    game_hrefs = {g["href"] for g in games}
    play = [(g["href"], g["label"]) for g in games]
    explore_col = [
        (e["href"], e["label"])
        for e in explore
        if e["href"] not in BRAND_HREFS and e["href"] not in game_hrefs and e["href"] not in HOW_HREFS
    ]
    how = [(e["href"], e["label"]) for e in explore if e["href"] in HOW_HREFS]
    how.append((SOURCE_URL, "Source on GitHub"))
    return [("Play", play), ("Explore", explore_col), ("How it works", how)]


def link(href: str, label: str) -> str:
    rel = ' rel="noopener"' if href.startswith(("http://", "https://")) else ""
    return f'<a href="{html.escape(href, quote=True)}"{rel}>{html.escape(label)}</a>'


def render(explore: list[dict[str, str]], games: list[dict[str, str]]) -> str:
    """The stamped block, markers included, LF-joined, in shell.css's footer classes."""
    lines = [BEGIN, '<footer class="site-footer">', '  <nav class="site-footer__sitemap" aria-label="Sitemap">']
    for title, links in columns(explore, games):
        lines.append('    <div class="site-footer__col">')
        lines.append(f'      <span class="site-footer__col-title">{html.escape(title)}</span>')
        lines.extend(f"      {link(href, label)}" for href, label in links)
        lines.append("    </div>")
    lines += ["  </nav>", f'  <p class="site-footer__attribution">{ATTRIBUTION}</p>', "</footer>", END]
    return "\n".join(lines)


def apply(text: str, block: str) -> str:
    """text with block stamped in: over the stamped block, else over the legacy footer, else before </body>.

    Raises ValueError when the page has no </body>, or when the result holds more than one <footer>
    (a second legacy footer, or one inside <noscript>): a page has one footer, and --check must not
    pass a page that quietly keeps two.
    """
    if RE_STAMPED.search(text):
        new = RE_STAMPED.sub(lambda _: block, text, count=1)
    elif RE_LEGACY.search(text):
        new = RE_LEGACY.sub(lambda _: block, text, count=1)
    else:
        ends = list(RE_BODY_END.finditer(text))
        if not ends:
            raise ValueError("no </body> to put a footer before")
        at = ends[-1].start()
        lead = "" if at == 0 or text[at - 1] == "\n" else "\n"
        new = text[:at] + lead + block + "\n" + text[at:]
    n = len(RE_FOOTER_OPEN.findall(RE_HTML_COMMENT.sub("", new)))
    if n != 1:
        raise ValueError(f"{n} <footer> elements after stamping; a page has exactly one")
    return new


def pages(root: Path) -> list[Path]:
    found: set[Path] = set()
    for pattern in PAGE_GLOBS:
        found.update(p for p in root.glob(pattern) if p.is_file())
    return sorted(found)


def load_lists(root: Path) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    js = (root / NAV_SRC).read_text(encoding="utf-8")
    return nav_list(js, "EXPLORE"), nav_list(js, "GAMES")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--check", action="store_true", help="report stale or missing footers, write nothing")
    ap.add_argument("--root", help="site root to stamp instead of the repo root (tests)")
    args = ap.parse_args(argv)
    root = Path(args.root).resolve() if args.root else ROOT

    if not (root / NAV_SRC).is_file():
        print(f"FAIL {NAV_SRC} is not under {root}")
        return 2
    try:
        explore, games = load_lists(root)
    except ValueError as e:
        print(f"FAIL {NAV_SRC}: {e}")
        return 2
    if not explore or not games:
        print(f"FAIL {NAV_SRC}: EXPLORE has {len(explore)} entries and GAMES has {len(games)}; both must be non-empty")
        return 2
    block = render(explore, games)

    stale: list[str] = []
    broken: list[str] = []
    seen = 0
    for page in pages(root):
        rel = page.relative_to(root).as_posix()
        if rel in DEFER:
            print(f"  defer {rel}: {DEFER[rel]}")
            continue
        seen += 1
        text = page.read_text(encoding="utf-8")
        try:
            new = apply(text, block)
        except ValueError as e:
            broken.append(f"{rel}: {e}")
            continue
        if new != text:
            stale.append(rel)
            if not args.check:
                page.write_text(new, encoding="utf-8", newline="\n")

    for line in broken:
        print(f"  FAIL {line}")

    if args.check:
        if stale:
            print(f"FAIL {len(stale)} page(s) have a stale or missing footer:")
            for rel in stale:
                print(f"  - {rel}")
            print("  run: python scripts/stamp_footer.py")
        if stale or broken:
            return 1
        print(f"OK   footer current on {seen} page(s) - {len(games)} games, {len(explore)} explore entries")
        return 0

    print(f"stamped {len(stale)} of {seen} page(s) - {len(games)} games, {len(explore)} explore entries")
    return 1 if broken else 0


if __name__ == "__main__":
    raise SystemExit(main())

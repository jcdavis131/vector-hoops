#!/usr/bin/env python3
"""The design quality gate: the static detectors from DESIGN-DIRECTION.md section 5.

Every page on hoops.dumbmodel.com is meant to be one instrument - one token
table, one kit of classes, one shell - and the matrix in DESIGN-DIRECTION section 3
shows no page is that end to end. This is the part of section 5 a static reader can
settle without a browser: D1-D10, D12-D15, D17, D19-D21. The browser detectors
(D22-D28) live in the render harness; D11 is scripts/check_contrast.py; D16 and
D18 are not here either (engine count needs a judgment about what a "point
renderer" is; budgets are scripts/budget_check.py's).

Each detector has an id, one line of description, a pass criterion and a list
of `file:line: why` hits. Almost all of them are red today on purpose: wave 1
of the redesign is what turns them green, and the gate exists so the number
moves in one direction. So the default run enforces only D1 and D14 (both
green on master) and prints the rest; `--report` prints the whole table and
always exits 0; `--json` writes the receipts a PR body quotes; `--baseline`
prints the per-detector delta a reviewer wants to see ("D6 112 -> 97").

Scope: the served pages are budget_check.py's PAGE_GLOBS (root *.html plus
insights/, play/ and models/), and the CSS and JS those pages actually load,
transitively through import()/fetch literals - not every file under assets/,
so a dead sheet nothing links stops counting.
public/ is a mirror and is not read; D19 runs sync_public.py --check so the
mirror still has to match.

Where section 5 left room, this is what was decided (each is also in the detector's
docstring):

  D2   order is the *relative* order of the named tags; unlisted tags between
       them are fine. og:url must equal the canonical. A noindex page (robots
       meta) needs neither: it is not the canonical copy of any URL.
  D4   a "scoped token block" is any rule outside atlas.css that defines a
       custom property, not only `:root{`.
  D5   the spec regex is applied to each comma-separated selector, so
       `.btn{` hits and `.btn:active{` / `.btn-primary{` do not.
  D6   hex is counted only inside declaration values (never selectors) and
       inside JS string literals; whole <svg> subtrees are exempt.
  D7   the letter of the rule: atlas.css's own print and .visually-hidden
       `!important`s count; only the reduced-motion gate and a [hidden] rule
       (in any file) do not.
  D9   any `var(--...)` in the family position passes (atlas.css resolves the
       legacy aliases to the three tokens); a literal family is the hit.
  D10  a light token needs a dark twin only when its value is a colour
       literal; a var() alias follows its target.
  D12  the reference footer is the most common byte-exact block; GAMES is a
       constant here until stamp_footer.py moves it into site-nav.js.
  D13  data-active must equal the page's own clean URL when that URL is a nav
       destination, else merely be one; aria-current is JS-rendered and only
       a hard-coded duplicate can be seen here.
  D20  a <summary> with no rule declaring a height >= 44px is a hit, because a
       static read cannot credit padding it cannot sum.
  D21  text nodes only, <head> excluded, <noscript> included; <p class=
       "provenance"> is not a <details> and counts; only /methods and /models
       are exempt, exactly as the spec says.

    python scripts/check_design.py                      # gate: D1, D14
    python scripts/check_design.py --report             # table, exit 0
    python scripts/check_design.py --report --json out.json
    python scripts/check_design.py --baseline base.json # deltas
    python scripts/check_design.py --enforce D1,D14,D5
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import traceback
from collections import Counter
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# The served page set: budget_check.py's PAGE_GLOBS, kept identical on purpose
# (tests/test_check_design.py asserts it).
PAGE_GLOBS = ("*.html", "insights/*.html", "play/*.html", "models/*.html")

DEFAULT_ENFORCE = ("D1", "D14")

SITE_HOST = "https://hoops.dumbmodel.com"
SHARED_SHEETS = ("fonts.css", "atlas.css", "shell.css")
LEGACY_SHEETS = ("responsive.css", "final-qa.css", "unified.css", "motion.css")
THEME_LIGHT, THEME_DARK = "#FCFBF7", "#0F1114"
FONT_HOSTS = ("fonts.googleapis.com", "fonts.gstatic.com", "use.typekit.net", "fonts.bunny.net")

# D5: the spec's regex, per selector. `^`/`$` are the selector's own ends.
KIT_CLASS = re.compile(
    r"^\.(card|btn|pill|chip|tab-pills|mode-tab|toast|vh-toast|title-card__\w+"
    r"|site-footer\w*|site-nav\w*|progress-dot|plate|stat)\s*$"
)

# D12: the game destinations a footer may link besides EXPLORE. Task 1.2 moves
# this into site-nav.js as `GAMES`; when a `var GAMES = [...]` exists there it
# is read instead of this constant.
GAMES = ("/play", "/map-guess", "/twenty-questions", "/play/era-crossed", "/replay")

# D10: tokens that are materials - constant on both themes by design.
MATERIAL_TOKENS = ("coin-", "qblock-", "coin-ink", "void", "data-moss")

# D14: the same data-block exemptions as tests/test_no_inline_scripts.py.
DATA_SCRIPT_TYPES = ("application/json", "application/ld+json", "importmap", "text/template")

# D21: the spec's pattern, word-bounded; `64-d` deliberately open-ended so
# "64-dimensional" counts.
JARGON = re.compile(
    r"\bMTNN\b|(?<!\w)64-d|\b[Cc]osine\b|\bL2\b|\bPCA\b|\b[Tt]-SNE\b|\bUMAP\b|\b[Kk]-means\b|\b[Ss]ilhouette\b|\b[Hh]euristic\b"
)
COPY_EXEMPT_PAGES = {"methods.html"}  # plus models/*: the spec's two exemptions, nothing more

RE_COMMENT = re.compile(r"<!--.*?-->", re.S)
RE_SCRIPT = re.compile(r"<script\b[^>]*>.*?</script>", re.S | re.I)
RE_STYLE = re.compile(r"<style\b[^>]*>(.*?)</style>", re.S | re.I)
RE_SVG = re.compile(r"<svg\b.*?</svg>", re.S | re.I)
RE_STYLE_ATTR = re.compile(r"""\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')""", re.I)
RE_CSS_COMMENT = re.compile(r"/\*.*?\*/", re.S)
RE_RULE = re.compile(r"([^{}]+)\{([^{}]*)\}", re.S)
RE_DECL = re.compile(r"(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)")
RE_HEX = re.compile(r"#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b")
RE_HEX_LONG = re.compile(r"#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6})\b")
RE_HEX_SHORT = re.compile(r"#[0-9a-fA-F]{3,4}\b")
RE_PX = re.compile(r"(\d+(?:\.\d+)?)px\b")
RE_VAR = re.compile(r"var\((?:[^()]|\([^()]*\))*\)")
RE_FAMILY = re.compile(
    r"(?<![\w-])(system-ui|ui-sans-serif|ui-monospace|ui-serif|ui-rounded|sans-serif|serif|monospace|cursive"
    r"|-apple-system|BlinkMacSystemFont|Segoe UI|Roboto|Helvetica(?: Neue)?|Arial|Menlo|Consolas|SFMono-Regular"
    r"|SF Mono|Courier(?: New)?|Georgia|Archivo|Inter)(?![\w-])"
)
RE_QUOTED_FAMILY = re.compile(r"""["'][A-Za-z][\w -]*["']""")
RE_INLINE_SCRIPT = re.compile(r"<script(?![^>]*(?<![\w-])src=)([^>]*)>", re.I)
# `/assets/x.js`, `assets/x.css`, and `./x.js` / `../lemmino/x.js` relative to the importing file.
RE_ASSET_LITERAL = re.compile(
    r"""['"`]((?:\.?\.?/)?assets/[A-Za-z0-9_./-]+\.(?:css|js)|\.\.?/[A-Za-z0-9_./-]+\.(?:css|js))(?:\?v=[0-9a-f]+)?['"`]"""
)
RE_COLOURISH = re.compile(r"(?<![\w-])(color|background[\w-]*|font[\w-]*|fill|stroke)\s*:", re.I)
RE_FONT_SHORTHAND_PX = re.compile(
    r"(?:^|font\s*:)\s*(?:(?:\d{3}|bold|bolder|lighter|normal|italic|oblique|small-caps)\s+)*(\d+(?:\.\d+)?)px\b"
)


# --------------------------------------------------------------------------
# text helpers - every scan keeps the file's own line numbers
# --------------------------------------------------------------------------
def blank_spans(text: str, spans: list[tuple[int, int]]) -> str:
    """Replace each span with spaces, keeping newlines, so offsets and lines survive."""
    if not spans:
        return text
    out: list[str] = []
    pos = 0
    for s, e in sorted(spans):
        s = max(s, pos)
        if e <= s:
            continue
        out.append(text[pos:s])
        out.append(re.sub(r"[^\n]", " ", text[s:e]))
        pos = e
    out.append(text[pos:])
    return "".join(out)


def spans_of(pattern: re.Pattern, text: str, group: int = 0) -> list[tuple[int, int]]:
    return [(m.start(group), m.end(group)) for m in pattern.finditer(text)]


def line_of(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def inside(offset: int, spans: list[tuple[int, int]]) -> bool:
    return any(s <= offset < e for s, e in spans)


def block_end(css: str, open_idx: int) -> int:
    """Index just past the `}` that closes the `{` at open_idx."""
    depth = 0
    for i in range(open_idx, len(css)):
        if css[i] == "{":
            depth += 1
        elif css[i] == "}":
            depth -= 1
            if depth == 0:
                return i + 1
    return len(css)


def at_rule_spans(css: str, needle: str) -> list[tuple[int, int]]:
    """Spans of every `@media ... needle ... { ... }` block."""
    out = []
    for m in re.finditer(r"@media[^{;]*\{", css):
        if needle in m.group(0):
            out.append((m.start(), block_end(css, m.end() - 1)))
    return out


def attrs(raw: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for m in re.finditer(r"""([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?""", raw):
        out[m.group(1).lower()] = m.group(2) or m.group(3) or m.group(4) or ""
    return out


def js_scan(src: str) -> tuple[list[tuple[int, int]], list[tuple[int, int]]]:
    """(comment spans, string-literal content spans) of a JS source.

    Regex literals are not tracked; a quote inside one can swallow the rest of
    that line, which is why a non-template string stops at a newline.
    """
    comments: list[tuple[int, int]] = []
    strings: list[tuple[int, int]] = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if c == "/" and nxt == "/":
            j = src.find("\n", i)
            j = n if j < 0 else j
            comments.append((i, j))
            i = j
        elif c == "/" and nxt == "*":
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            comments.append((i, j))
            i = j
        elif c in "\"'`":
            j = i + 1
            while j < n:
                if src[j] == "\\":
                    j += 2
                    continue
                if src[j] == c or (c != "`" and src[j] == "\n"):
                    break
                j += 1
            strings.append((i + 1, j))
            i = j + 1
        else:
            i += 1
    return comments, strings


# --------------------------------------------------------------------------
# the site model
# --------------------------------------------------------------------------
@dataclass
class Rule:
    rel: str
    line: int
    offset: int
    selector: str
    decls: list[tuple[str, str, int]]  # (prop, value, line)
    kind: str  # "css" asset file - "style" page <style> - "attr" style=""
    in_svg: bool = False


@dataclass
class Page:
    rel: str
    url: str
    raw: str
    text: str  # HTML comments blanked
    markup: str  # comments + every <script> blanked: what the browser builds the DOM from
    style_blocks: list[tuple[int, str]]  # (offset in markup, <style> body with CSS comments blanked)
    svg_spans: list[tuple[int, int]]
    style_attrs: list[tuple[int, int, str]]  # (offset, line, value)
    sheets: list[str] = field(default_factory=list)  # served CSS this page loads
    scripts: list[str] = field(default_factory=list)


@dataclass
class Asset:
    rel: str
    text: str  # comments blanked
    kind: str  # "css" | "js"
    strings: list[tuple[int, int]] = field(default_factory=list)


@dataclass
class Site:
    root: Path
    pages: list[Page]
    css: dict[str, Asset]
    js: dict[str, Asset]
    rules: list[Rule]
    explore: list[str]
    known_paths: set[str]
    games: tuple[str, ...]
    rewrites: list[re.Pattern]
    redirects: list[re.Pattern]
    ledger_checks: list[list[str]]

    @property
    def atlas(self) -> Asset | None:
        return self.css.get("assets/atlas.css")

    def reachable(self, path: str) -> bool:
        """Would GET path return 200 on Vercel: `/`, a real .html file, or a rewrite."""
        path = path.split("?")[0].split("#")[0] or "/"
        if path == "/":
            return True
        if path.endswith(".html"):
            return (self.root / path.lstrip("/")).is_file()
        return any(r.match(path) for r in self.rewrites)

    def redirected(self, path: str) -> bool:
        path = path.split("?")[0].split("#")[0] or "/"
        return any(r.match(path) for r in self.redirects)


def clean_url(rel: str) -> str:
    stem = rel[:-5] if rel.endswith(".html") else rel
    if stem == "index":
        return "/"
    if stem.endswith("/index"):
        stem = stem[:-6]
    return "/" + stem


def _source_re(src: str) -> re.Pattern:
    parts = re.split(r"(:\w+\*?)", src)
    out = "".join((".*" if p.endswith("*") else "[^/]+") if p.startswith(":") else re.escape(p) for p in parts)
    return re.compile("^" + out + "$")


def resolve_ref(root: Path, ref: str, base: Path) -> Path | None:
    """Map a page-relative or root-absolute css/js ref to a repo file (budget_check's rule)."""
    ref = ref.split("?")[0].split("#")[0]
    if not ref or ref.startswith(("http", "data:", "mailto:", "//")):
        return None
    if Path(ref).suffix.lower() not in {".css", ".js"}:
        return None
    path = (root / ref[1:]) if ref.startswith("/") else (base.parent / ref).resolve()
    try:
        path.relative_to(root)
    except ValueError:
        return None
    return path if path.is_file() else None


def parse_decls(body: str, base: int, src: str) -> list[tuple[str, str, int]]:
    return [(d.group(1).lower(), d.group(2).strip(), line_of(src, base + d.start(1))) for d in RE_DECL.finditer(body)]


def css_rules(
    rel: str,
    css: str,
    kind: str,
    svg_spans: list[tuple[int, int]] | None = None,
    base: int = 0,
    src: str | None = None,
) -> list[Rule]:
    """Every `selector{decls}` in css. Offsets and lines are in src's coordinates when css is src[base:...].

    RE_RULE is run on the block alone, never on a page-length string: `[^{}]+\{` backtracks across
    everything after the last `}`, which made one page cost six seconds.
    """
    src = css if src is None else src
    out = []
    for m in RE_RULE.finditer(css):
        sel = m.group(1).strip()
        if not sel:
            continue
        off = base + m.start(2)
        out.append(
            Rule(
                rel=rel,
                line=line_of(src, off),
                offset=off,
                selector=sel,
                decls=parse_decls(m.group(2), off, src),
                kind=kind,
                in_svg=inside(off, svg_spans or []),
            )
        )
    return out


def discover_pages(root: Path) -> list[str]:
    found: set[str] = set()
    for pattern in PAGE_GLOBS:
        for f in root.glob(pattern):
            found.add(f.relative_to(root).as_posix())
    return sorted(found)


def load_page(root: Path, rel: str) -> Page:
    raw = (root / rel).read_text(encoding="utf-8", errors="replace")
    text = blank_spans(raw, spans_of(RE_COMMENT, raw))
    markup = blank_spans(text, spans_of(RE_SCRIPT, text))
    style_blocks = []
    for s, e in spans_of(RE_STYLE, markup, group=1):
        block = markup[s:e]
        style_blocks.append((s, blank_spans(block, spans_of(RE_CSS_COMMENT, block))))
    svg_spans = spans_of(RE_SVG, markup)
    style_attrs = [
        (m.start(1 if m.group(1) is not None else 2), line_of(markup, m.start()), m.group(1) or m.group(2) or "")
        for m in RE_STYLE_ATTR.finditer(markup)
    ]
    return Page(rel, clean_url(rel), raw, text, markup, style_blocks, svg_spans, style_attrs)


def nav_lists(js: str) -> tuple[list[str], set[str], tuple[str, ...], str]:
    """EXPLORE hrefs, the nav destinations site-nav.js can light (EXPLORE + MAP/PLAY/HOW), GAMES, and GAMES' source.

    js is site-nav.js with its comments blanked. GAMES is read from a `var|let|const GAMES = [...]` there when
    one exists (object items with `href:` or bare path strings), else the constant above; the source is
    returned so the run can say which. An array that never closes is treated as absent, not read to EOF.
    """

    def array(name: str) -> list[str] | None:
        m = re.search(r"\b(?:var|let|const)\s+" + name + r"\s*=\s*\[", js)
        if not m:
            return None
        open_idx = m.end() - 1
        depth = 0
        body = None
        for i in range(open_idx, len(js)):
            if js[i] == "[":
                depth += 1
            elif js[i] == "]":
                depth -= 1
                if depth == 0:
                    body = js[open_idx + 1 : i]
                    break
        if body is None:
            return None
        return re.findall(r"""href:\s*['"]([^'"]+)['"]""", body) or re.findall(r"""['"](/[^'"]*)['"]""", body)

    explore = array("EXPLORE") or []
    known = set(explore)
    for name in ("MAP", "PLAY", "HOW"):
        m = re.search(r"\b(?:var|let|const)\s+" + name + r"\s*=\s*\{[^}]*href:\s*['\"]([^'\"]+)['\"]", js)
        if m:
            known.add(m.group(1))
    found = array("GAMES")
    games, source = (tuple(found), "assets/site-nav.js GAMES") if found else (GAMES, "the built-in GAMES constant")
    return explore, {p.split("#")[0] or "/" for p in known}, games, source


def load_site(root: Path, ledger_checks: list[list[str]] | None = None) -> Site:
    pages = [load_page(root, rel) for rel in discover_pages(root)]
    css: dict[str, Asset] = {}
    js: dict[str, Asset] = {}

    def add_asset(path: Path) -> str:
        rel = path.relative_to(root).as_posix()
        if rel in css or rel in js:
            return rel
        src = path.read_text(encoding="utf-8", errors="replace")
        if path.suffix == ".css":
            css[rel] = Asset(rel, blank_spans(src, spans_of(RE_CSS_COMMENT, src)), "css")
        else:
            comments, strings = js_scan(src)
            js[rel] = Asset(rel, blank_spans(src, comments), "js", strings)
        return rel

    for page in pages:
        base = root / page.rel
        for m in re.finditer(r"<link\b([^>]*)>", page.markup, re.I):
            a = attrs(m.group(1))
            if "stylesheet" in a.get("rel", "").lower():
                hit = resolve_ref(root, a.get("href", ""), base)
                if hit:
                    rel = add_asset(hit)
                    if rel not in page.sheets:  # a sheet linked twice is still one sheet
                        page.sheets.append(rel)
        for m in re.finditer(r"<script\b([^>]*)>", page.text, re.I):
            hit = resolve_ref(root, attrs(m.group(1)).get("src", ""), base)
            if hit:
                page.scripts.append(add_asset(hit))
    # and whatever served scripts name by literal, transitively: import('./shared-map.js'),
    # fetch('/assets/x.css'), a lazy module two hops down. All of it is served.
    queue = list(js.values())
    while queue:
        asset = queue.pop()
        for lit in RE_ASSET_LITERAL.findall(asset.text):
            hit = resolve_ref(root, lit, root / asset.rel)
            if hit and hit.relative_to(root).as_posix() not in js and hit.relative_to(root).as_posix() not in css:
                rel = add_asset(hit)
                if rel in js:
                    queue.append(js[rel])

    rules: list[Rule] = []
    for rel, asset in css.items():
        rules += css_rules(rel, asset.text, "css")
    for page in pages:
        for off, block in page.style_blocks:
            rules += css_rules(page.rel, block, "style", page.svg_spans, base=off, src=page.markup)
        for off, line, value in page.style_attrs:
            rules.append(
                Rule(
                    page.rel,
                    line,
                    off,
                    "style=",
                    [(p, v, line) for p, v, _ in parse_decls(value, 0, value)],
                    "attr",
                    inside(off, page.svg_spans),
                )
            )

    nav_rel = "assets/site-nav.js"
    if nav_rel in js:
        nav_text = js[nav_rel].text
    elif (root / nav_rel).is_file():
        nav_src = (root / nav_rel).read_text(encoding="utf-8", errors="replace")
        nav_text = blank_spans(nav_src, js_scan(nav_src)[0])
    else:
        nav_text = ""
    explore, known, games, games_source = nav_lists(nav_text)
    print(f"check_design: GAMES read from {games_source}", file=sys.stderr)

    vercel_path = root / "vercel.json"
    vercel = json.loads(vercel_path.read_text(encoding="utf-8")) if vercel_path.is_file() else {}
    rewrites = [_source_re(r["source"]) for r in vercel.get("rewrites", []) if r.get("source")]
    redirects = [_source_re(r["source"]) for r in vercel.get("redirects", []) if r.get("source")]

    if ledger_checks is None:
        ledger_checks = [
            [sys.executable, "scripts/stamp_assets.py", "--check"],
            [sys.executable, "scripts/sync_public.py", "--check"],
        ]
    return Site(root, pages, css, js, rules, explore, known, games, rewrites, redirects, ledger_checks)


# --------------------------------------------------------------------------
# detectors
# --------------------------------------------------------------------------
@dataclass
class Result:
    id: str
    description: str
    criterion: str
    hits: list[str]

    @property
    def passed(self) -> bool:
        return not self.hits


def hit(rel: str, line: int, msg: str) -> str:
    return f"{rel}:{line}: {msg}"


def head_of(page: Page) -> str:
    end = page.markup.lower().find("</head>")
    return page.markup[: end if end > 0 else len(page.markup)]


def d1(site: Site) -> list[str]:
    """One <h1> per page."""
    out = []
    for p in site.pages:
        n = len(re.findall(r"<h1\b", p.markup, re.I))
        if n != 1:
            out.append(hit(p.rel, 1, f"{n} <h1> elements, a page has exactly one"))
    return out


def d2(site: Site) -> list[str]:
    """Head parity. Relative order of the named tags only; og:url must equal canonical.

    A noindex page (404, offline, status, feed-health) is exempt from canonical and og:url:
    404 and offline are served at whatever URL failed, so any canonical would be false.
    """
    out = []
    for p in site.pages:
        head = head_of(p)
        tags = []  # (offset, kind, attrs)
        for m in re.finditer(r"<(meta|link|title)\b([^>]*)>", head, re.I):
            tags.append((m.start(), m.group(1).lower(), attrs(m.group(2))))
        first: dict[str, int] = {}
        missing: list[str] = []
        line1 = line_of(p.markup, 0)

        def found(key: str, off: int) -> None:
            first.setdefault(key, off)

        for off, tag, a in tags:
            if tag == "meta" and "charset" in a:
                found("charset", off)
            name = a.get("name", "").lower()
            prop = a.get("property", "").lower()
            if tag == "meta" and name == "viewport":
                found("viewport", off)
            if tag == "meta" and name == "description" and a.get("content", "").strip():
                found("description", off)
            if tag == "link" and a.get("rel", "").lower() == "canonical":
                found("canonical", off)
            if tag == "meta" and name == "theme-color":
                found("theme-color", off)
            if tag == "meta" and prop.startswith("og:"):
                found("og", off)
            if tag == "meta" and name.startswith("twitter:"):
                found("twitter", off)
        tm = re.search(r"<title[^>]*>(.*?)</title>", head, re.S | re.I)
        if tm and tm.group(1).strip():
            found("title", tm.start())

        noindex = any(
            t == "meta" and a.get("name", "").lower() == "robots" and "noindex" in a.get("content", "").lower()
            for _, t, a in tags
        )
        for key in ("charset", "viewport", "title", "description", "canonical"):
            if key == "canonical" and noindex:
                continue
            if key not in first:
                missing.append(key)
        canon = next(
            (a.get("href", "") for _, t, a in tags if t == "link" and a.get("rel", "").lower() == "canonical"), ""
        )
        if canon and ".html" in canon:
            out.append(hit(p.rel, line_of(p.markup, first["canonical"]), f"canonical is not a clean URL: {canon}"))

        themes = [(off, a) for off, t, a in tags if t == "meta" and a.get("name", "").lower() == "theme-color"]
        values = {a.get("content", "").upper(): a.get("media", "").lower() for _, a in themes}
        if len(themes) != 2:
            missing.append(f"theme-color x2 ({len(themes)} found)")
        else:
            for want, scheme in ((THEME_LIGHT, "light"), (THEME_DARK, "dark")):
                if want not in values:
                    out.append(
                        hit(
                            p.rel,
                            line_of(p.markup, themes[0][0]),
                            f"theme-color {want} ({scheme}) missing; have {sorted(values)}",
                        )
                    )
                elif scheme not in values[want]:
                    out.append(
                        hit(
                            p.rel,
                            line_of(p.markup, themes[0][0]),
                            f"theme-color {want} should carry media (prefers-color-scheme: {scheme})",
                        )
                    )

        og = {
            a.get("property", "").lower(): a.get("content", "")
            for _, t, a in tags
            if t == "meta" and a.get("property", "").lower().startswith("og:")
        }
        for key in ("og:title", "og:description", "og:image", "og:url"):
            if key == "og:url" and noindex:
                continue
            if not og.get(key, "").strip():
                missing.append(key)
        if og.get("og:url") and canon and og["og:url"] != canon:
            out.append(
                hit(p.rel, line_of(p.markup, first["og"]), f"og:url {og['og:url']} differs from canonical {canon}")
            )
        if not any(t == "meta" and a.get("name", "").lower() == "twitter:card" for _, t, a in tags):
            missing.append("twitter:card")
        for key in missing:
            out.append(hit(p.rel, line1, f"<head> lacks {key}"))

        order = ["charset", "viewport", "title", "description", "canonical", "theme-color", "og", "twitter"]
        seq = [(first[k], k) for k in order if k in first]
        for (o1, k1), (o2, k2) in zip(seq, seq[1:]):
            if o2 < o1:
                out.append(
                    hit(p.rel, line_of(p.markup, o2), f"head order: {k2} comes before {k1} (want {' -> '.join(order)})")
                )
                break
    return out


def d3(site: Site) -> list[str]:
    """Stylesheet allowlist: fonts.css -> atlas.css -> shell.css -> <= 1 page sheet; no legacy sheets; no external fonts."""
    out = []
    for p in site.pages:
        links = []  # (line, basename, href, external)
        for m in re.finditer(r"<link\b([^>]*)>", p.markup, re.I):
            a = attrs(m.group(1))
            href = a.get("href", "")
            rel = a.get("rel", "").lower()
            line = line_of(p.markup, m.start())
            external = href.startswith(("http://", "https://", "//"))
            if external and (any(h in href for h in FONT_HOSTS) or "stylesheet" in rel):
                out.append(
                    hit(p.rel, line, f"external <link rel={rel or '?'}> {href[:60]} (self-hosted fonts.css only)")
                )
                continue
            if "stylesheet" in rel:
                links.append((line, Path(href.split("?")[0]).name, href))
        for off, block in p.style_blocks:
            for m in re.finditer(r"@import\b[^;]*;", block):
                out.append(hit(p.rel, line_of(p.markup, off + m.start()), f"@import in <style>: {m.group(0)[:50]}"))
        pos: dict[str, int] = {}
        page_sheets = []
        for i, (line, name, href) in enumerate(links):
            if name in LEGACY_SHEETS:
                out.append(hit(p.rel, line, f"legacy sheet {name} (killed by DESIGN-DIRECTION section 1d)"))
            elif name in SHARED_SHEETS:
                pos.setdefault(name, i)
            else:
                page_sheets.append((line, name, i))
        for name in SHARED_SHEETS:
            if name not in pos:
                out.append(hit(p.rel, links[0][0] if links else 1, f"{name} not loaded"))
        present = [n for n in SHARED_SHEETS if n in pos]
        if [pos[n] for n in present] != sorted(pos[n] for n in present):
            out.append(hit(p.rel, links[0][0], "shared sheets out of order: want fonts.css -> atlas.css -> shell.css"))
        shell_at = pos.get("shell.css")
        for n, (line, name, i) in enumerate(page_sheets):
            if n >= 1:
                out.append(hit(p.rel, line, f"second page sheet {name} (<= 1 after shell.css)"))
            elif shell_at is not None and i < shell_at:
                out.append(hit(p.rel, line, f"page sheet {name} loads before shell.css"))
    return out


def d4(site: Site) -> list[str]:
    """`:root{` only in atlas.css; no rule elsewhere defines a custom property (a scoped token block)."""
    out = []
    for r in site.rules:
        if r.kind == "attr" or r.rel == "assets/atlas.css":
            continue
        if re.search(r"(^|[\s,}])\:root\b", " " + r.selector):
            out.append(hit(r.rel, r.line, f":root block outside atlas.css ({r.selector[:40]!r})"))
        elif any(prop.startswith("--") for prop, _, _ in r.decls):
            names = ", ".join(prop for prop, _, _ in r.decls if prop.startswith("--"))[:60]
            out.append(hit(r.rel, r.line, f"scoped token block {r.selector[:40]!r} defines {names}"))
    return out


def d5(site: Site) -> list[str]:
    """No page or page sheet redeclares a kit class (the spec regex, per selector)."""
    out = []
    for r in site.rules:
        if r.kind == "attr" or r.rel in ("assets/atlas.css", "assets/shell.css"):
            continue
        for sel in r.selector.split(","):
            if KIT_CLASS.match(sel.strip()):
                out.append(hit(r.rel, r.line, f"redeclares kit class {sel.strip()} (atlas.css/shell.css own it)"))
    return out


def d6(site: Site) -> list[str]:
    """Hex colours outside atlas.css: declaration values in CSS/<style>/style="", and JS string literals."""
    out = []
    for r in site.rules:
        if r.rel == "assets/atlas.css" or r.in_svg:
            continue
        for prop, value, line in r.decls:
            value = re.sub(r"url\([^)]*\)", "url()", value)
            for m in RE_HEX.finditer(value):
                out.append(hit(r.rel, line, f"{prop}: {m.group(0)} in {r.selector[:30]!r}"))
    for asset in site.js.values():
        text = asset.text
        for s, e in asset.strings:
            lit = text[s:e]
            if "#" not in lit:
                continue
            if "<svg" in lit or "fill=" in lit or "stroke=" in lit:  # SVG markup in a string: an icon, not chrome
                continue
            line = line_of(text, s)
            for m in RE_HEX_LONG.finditer(lit):
                out.append(hit(asset.rel, line, f"{m.group(0)} in JS string {lit.strip()[:40]!r}"))
            for m in RE_HEX_SHORT.finditer(lit):
                if RE_HEX_LONG.match(lit, m.start()):
                    continue
                before = lit[: m.start()].rstrip()
                if not before or before.endswith(":"):
                    out.append(hit(asset.rel, line, f"{m.group(0)} in JS string {lit.strip()[:40]!r}"))
    return out


def d7(site: Site) -> list[str]:
    """`!important` anywhere except atlas.css's reduced-motion gate and a `[hidden]` rule (wherever it lives)."""
    out = []
    atlas = site.atlas
    gate = at_rule_spans(atlas.text, "prefers-reduced-motion") if atlas else []
    for r in site.rules:
        if r.selector.rstrip().endswith("[hidden]") or (r.rel == "assets/atlas.css" and inside(r.offset, gate)):
            continue
        for prop, value, line in r.decls:
            if "!important" in value:
                out.append(hit(r.rel, line, f"{prop} !important in {r.selector[:30]!r}"))
    return out


def _px_floor(prop: str, value: str) -> float | None:
    """The declared size in px, or None when the value is not statically a px size."""
    if prop in ("font-size", "--t-2xs"):
        v = value.strip()
        if v.lower().startswith(("clamp(", "min(", "max(")):
            m = RE_PX.search(v)
            return float(m.group(1)) if m else None
        m = re.fullmatch(r"(\d+(?:\.\d+)?)px\s*(!important)?", v)
        return float(m.group(1)) if m else None
    if prop == "font":
        m = RE_PX.search(value)
        return float(m.group(1)) if m else None
    return None


def d8(site: Site) -> list[str]:
    """Declared font-size floor 11px: font-size, font: shorthand, clamp() min stop, canvas font strings; --t-2xs >= 11px."""
    out = []
    for r in site.rules:
        for prop, value, line in r.decls:
            if prop == "--t-2xs" and r.rel != "assets/atlas.css":
                continue
            px = _px_floor(prop, value)
            if px is not None and 0 < px < 11:
                out.append(hit(r.rel, line, f"{prop}: {value[:30]} ({px:g}px < 11px) in {r.selector[:30]!r}"))
    for asset in site.js.values():
        text = asset.text
        for s, e in asset.strings:
            ls = text.rfind("\n", 0, s) + 1
            le = text.find("\n", e)
            line_text = text[ls : le if le > 0 else len(text)]
            if "font" not in line_text.lower():
                continue
            lit = text[s:e]
            line = line_of(text, s)
            sizes = [float(m.group(1)) for m in re.finditer(r"font-size\s*:\s*(\d+(?:\.\d+)?)px", lit)]
            sizes += [float(m.group(1)) for m in RE_FONT_SHORTHAND_PX.finditer(lit)]
            for px in sizes:
                if 0 < px < 11:
                    out.append(hit(asset.rel, line, f"{px:g}px in JS font string {lit.strip()[:40]!r}"))
    return out


def _literal_family(value: str) -> str | None:
    """A literal font family in a font/font-family value, after var() groups are removed."""
    rest = RE_VAR.sub(" ", value)
    if rest.strip().lower() in ("inherit", "initial", "unset", "revert", ""):
        return None
    m = RE_FAMILY.search(rest) or RE_QUOTED_FAMILY.search(rest)
    return m.group(0) if m else None


def d9(site: Site) -> list[str]:
    """Font families only via the --font-* tokens: no literal family in CSS, style="" or JS style strings."""
    out = []
    for r in site.rules:
        if r.selector.startswith("@font-face"):
            continue
        for prop, value, line in r.decls:
            if prop not in ("font-family", "font"):
                continue
            fam = _literal_family(value)
            if fam:
                out.append(hit(r.rel, line, f"{prop}: literal family {fam!r} in {r.selector[:30]!r}"))
    for asset in site.js.values():
        text = asset.text
        for s, e in asset.strings:
            ls = text.rfind("\n", 0, s) + 1
            le = text.find("\n", e)
            if "font" not in text[ls : le if le > 0 else len(text)].lower():
                continue
            lit = text[s:e]
            rest = RE_VAR.sub(" ", lit)
            m = RE_FAMILY.search(rest)
            if m:
                out.append(
                    hit(asset.rel, line_of(text, s), f"literal family {m.group(0)!r} in JS string {lit.strip()[:40]!r}")
                )
    return out


def _root_tokens(css: str, start: int) -> dict[str, tuple[str, int]]:
    body_start = css.find("{", start) + 1
    body = css[body_start : block_end(css, body_start - 1) - 1]
    return {
        m.group(1): (m.group(2).strip(), line_of(css, body_start + m.start()))
        for m in re.finditer(r"--([\w-]+)\s*:\s*([^;}]+)", body)
    }


def d10(site: Site) -> list[str]:
    """Dark token coverage: every colour-literal token in the light :root is set in the dark :root or is a material."""
    atlas = site.atlas
    if not atlas:
        return [hit("assets/atlas.css", 1, "atlas.css is not loaded by any page")]
    css = atlas.text
    media = [(m.start(), block_end(css, m.end() - 1)) for m in re.finditer(r"@media[^{;]*\{", css)]
    light_at = next((m.start() for m in re.finditer(r":root\s*\{", css) if not inside(m.start(), media)), None)
    dark_block = next(((s, e) for s, e in media if "prefers-color-scheme: dark" in css[s : css.find("{", s)]), None)
    if light_at is None or dark_block is None:
        return [hit(atlas.rel, 1, "could not find both the light :root and the dark-scheme :root")]
    dark_at = next(
        (m.start() for m in re.finditer(r":root\s*\{", css) if dark_block[0] <= m.start() < dark_block[1]), None
    )
    if dark_at is None:
        return [hit(atlas.rel, line_of(css, dark_block[0]), "dark-scheme @media has no :root block")]
    light, dark = _root_tokens(css, light_at), _root_tokens(css, dark_at)
    colour = re.compile(r"#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|color-mix)\(|-gradient\(")
    out = []
    for name, (value, line) in light.items():
        if not colour.search(value) or name in dark:
            continue
        if any(name.startswith(m) if m.endswith("-") else name == m for m in MATERIAL_TOKENS):
            continue
        out.append(hit(atlas.rel, line, f"--{name}: {value[:30]} has no night-board value"))
    return out


def d12(site: Site) -> list[str]:
    """Footer parity: one byte-exact <footer> block site-wide; internal links ⊆ EXPLORE+GAMES and each returns 200."""
    out = []
    blocks: dict[str, tuple[int, str]] = {}
    for p in site.pages:
        m = re.search(r"<footer\b[^>]*>.*?</footer>", p.text, re.S | re.I)
        if not m:
            out.append(hit(p.rel, 1, "no <footer>"))
            continue
        blocks[p.rel] = (line_of(p.text, m.start()), p.raw[m.start() : m.end()])
    if not blocks:
        return out
    counts = Counter(b for _, b in blocks.values())
    reference, n_ref = counts.most_common(1)[0]
    allowed = site.known_paths | set(site.games)
    for rel, (line, block) in blocks.items():
        if block != reference:
            out.append(
                hit(
                    rel,
                    line,
                    f"footer differs from the {n_ref}-page majority block ({len(block)} vs {len(reference)} bytes)",
                )
            )
        for href in re.findall(r"""href\s*=\s*["']([^"'#][^"']*)["']""", block):
            if href.startswith(("http://", "https://", "//", "mailto:")) and not href.startswith(SITE_HOST + "/"):
                continue
            path = href.replace(SITE_HOST, "", 1).split("?")[0].split("#")[0] or "/"
            base = path[:-5] if path.endswith(".html") else path
            if base not in allowed:
                out.append(hit(rel, line, f"footer link {href} is not in EXPLORE+GAMES"))
            if not site.reachable(path):
                why = "redirects, not a 200" if site.redirected(path) else "no rewrite or file"
                out.append(hit(rel, line, f"footer link {href}: {why}"))
    return out


def d13(site: Site) -> list[str]:
    """Nav parity: .site-nav[data-active] names a nav destination (the page itself when it is one); one aria-label site-wide."""
    out = []
    labels: dict[str, str] = {}
    navs: dict[str, tuple[int, dict[str, str]]] = {}
    for p in site.pages:
        m = re.search(r"""<nav\b([^>]*\bclass\s*=\s*["'][^"']*\bsite-nav\b[^"']*["'][^>]*)>""", p.markup, re.I)
        if not m:
            out.append(hit(p.rel, 1, 'no <nav class="site-nav">'))
            continue
        a = attrs(m.group(1))
        navs[p.rel] = (line_of(p.markup, m.start()), a)
        labels[p.rel] = a.get("aria-label", "")
        n = len(re.findall(r"\baria-current\s*=", p.markup, re.I))
        if n > 1:
            out.append(hit(p.rel, line_of(p.markup, m.start()), f"{n} hard-coded aria-current attributes"))
    mode = Counter(labels.values()).most_common(1)[0][0] if labels else ""
    for p in site.pages:
        if p.rel not in navs:
            continue
        line, a = navs[p.rel]
        active = a.get("data-active")
        if active is None:
            out.append(hit(p.rel, line, "site-nav has no data-active"))
        else:
            active_path = active.split("#")[0] or "/"
            if p.url in site.known_paths and active_path != p.url:
                out.append(hit(p.rel, line, f"data-active={active!r} on page {p.url}"))
            elif active_path not in site.known_paths:
                out.append(hit(p.rel, line, f"data-active={active!r} is not a nav destination"))
        if labels[p.rel] != mode:
            out.append(hit(p.rel, line, f"nav aria-label {labels[p.rel]!r}; the site says {mode!r}"))
    return out


def d14(site: Site) -> list[str]:
    """No <script> without src: production CSP is script-src 'self' with no nonce (vercel.json)."""
    out = []
    for p in site.pages:
        for m in RE_INLINE_SCRIPT.finditer(p.text):
            if any(t in m.group(1) for t in DATA_SCRIPT_TYPES):
                continue
            out.append(hit(p.rel, line_of(p.text, m.start()), "inline <script> never runs under script-src 'self'"))
    return out


def d15(site: Site) -> list[str]:
    """style="" attributes <= 2 per page, and none sets colour, background or font."""
    out = []
    for p in site.pages:
        n = len(p.style_attrs)
        for _, line, value in p.style_attrs:
            colourish = RE_COLOURISH.search(value)
            if n > 2:
                out.append(
                    hit(
                        p.rel,
                        line,
                        f'style="{value[:40]}" ({n} on the page, limit 2{"; sets colour/font" if colourish else ""})',
                    )
                )
            elif colourish:
                out.append(hit(p.rel, line, f'style="{value[:40]}" sets {colourish.group(1)}'))
    return out


def d17(site: Site) -> list[str]:
    """Clean URLs: no .html in canonical, og:url or internal hrefs; every root page has a vercel.json rewrite."""
    out = []
    for p in site.pages:
        head = head_of(p)
        for m in re.finditer(r"<(meta|link)\b([^>]*)>", head, re.I):
            a = attrs(m.group(2))
            if a.get("rel", "").lower() == "canonical" and ".html" in a.get("href", ""):
                out.append(hit(p.rel, line_of(p.markup, m.start()), f"canonical {a['href']}"))
            if a.get("property", "").lower() == "og:url" and ".html" in a.get("content", ""):
                out.append(hit(p.rel, line_of(p.markup, m.start()), f"og:url {a['content']}"))
        for m in re.finditer(r"""<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']""", p.markup, re.I):
            href = m.group(1)
            if href.startswith(("http://", "https://", "//", "mailto:")) and not href.startswith(SITE_HOST + "/"):
                continue
            path = href.replace(SITE_HOST, "", 1).split("?")[0].split("#")[0]
            if path.endswith(".html"):
                out.append(hit(p.rel, line_of(p.markup, m.start()), f'href="{href}" names the file, not the clean URL'))
        if p.url in ("/", "/404"):
            continue
        if not any(r.match(p.url) for r in site.rewrites):
            why = " (only a redirect)" if site.redirected(p.url) else ""
            out.append(hit(p.rel, 1, f"no vercel.json rewrite for {p.url}{why}; cleanUrls is off, so {p.url} 404s"))
    return out


def d19(site: Site) -> list[str]:
    """stamp_assets.py --check and sync_public.py --check pass (CACHE_NAME-vs-asset-change is not checked here)."""
    out = []
    for cmd in site.ledger_checks:
        shown = " ".join(cmd[1:]) if len(cmd) > 1 else cmd[0]
        script = site.root / cmd[1] if len(cmd) > 1 and cmd[1].endswith(".py") else None
        if script is not None and not script.is_file():
            out.append(hit(cmd[1], 1, "check script missing"))
            continue
        proc = subprocess.run(cmd, capture_output=True, text=True, cwd=site.root)
        if proc.returncode != 0:
            first = next((ln for ln in (proc.stdout + proc.stderr).splitlines() if ln.strip()), "")
            out.append(hit(cmd[1] if len(cmd) > 1 else cmd[0], 1, f"{shown} exited {proc.returncode}: {first[:80]}"))
    return out


def _targets_summary(selector: str, classes: set[str]) -> bool:
    """Does one selector plausibly target a <summary> with these (own + parent details) classes?"""
    sel = selector.strip()
    if re.fullmatch(r"\.[\w-]+", sel):
        return sel[1:] in classes
    if not re.search(r"(^|[\s>+~])summary\b", sel):
        return False
    return all(c in classes for c in re.findall(r"\.([\w-]+)", sel)) and not re.search(
        r"(^|[\s>+~])(?!details\b|summary\b)[a-z][\w-]*", sel
    )


def d20(site: Site) -> list[str]:
    """role=tab never on <a href>; every <summary> has a rule declaring min-height/height >= 44px."""
    out = []
    page_rules: dict[str, list[Rule]] = {}
    for r in site.rules:
        page_rules.setdefault(r.rel, []).append(r)
    for p in site.pages:
        for m in re.finditer(r"""<a\b[^>]*\brole\s*=\s*["']tab["'][^>]*>""", p.markup, re.I):
            out.append(
                hit(p.rel, line_of(p.markup, m.start()), "role=tab on a link that navigates; tabs switch panels")
            )
        rules = page_rules.get(p.rel, []) + [r for s in p.sheets for r in page_rules.get(s, [])]
        short_rules: set[tuple[str, int]] = set()
        for m in re.finditer(r"<summary\b([^>]*)>", p.markup, re.I):
            classes = set(attrs(m.group(1)).get("class", "").split())
            dm = None
            for dm in re.finditer(r"<details\b([^>]*)>", p.markup[: m.start()], re.I):
                pass
            if dm:
                classes |= set(attrs(dm.group(1)).get("class", "").split())
            declared: list[tuple[float, str, int]] = []
            for r in rules:
                if r.kind == "attr" or not any(_targets_summary(s, classes) for s in r.selector.split(",")):
                    continue
                for prop, value, line in r.decls:
                    if prop in ("min-height", "height"):
                        pm = re.fullmatch(r"(\d+(?:\.\d+)?)px", value.strip())
                        if pm:
                            declared.append((float(pm.group(1)), r.rel, line))
            line = line_of(p.markup, m.start())
            if not declared:
                out.append(
                    hit(
                        p.rel,
                        line,
                        f"<summary class={' '.join(sorted(classes)) or '-'}> has no rule declaring a height >= 44px",
                    )
                )
            else:
                for px, rel, rline in declared:
                    if px < 44 and (rel, rline) not in short_rules:
                        short_rules.add((rel, rline))  # one rule shared by N summaries is one hit
                        out.append(hit(rel, rline, f"summary rule declares {px:g}px, tap targets need 44px"))
    return out


class _Copy(HTMLParser):
    SKIP = frozenset({"script", "style", "template", "head", "title"})
    VOID = frozenset(
        {
            "meta",
            "link",
            "img",
            "br",
            "hr",
            "input",
            "source",
            "track",
            "wbr",
            "area",
            "base",
            "col",
            "embed",
            "param",
        }
    )

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, bool]] = []
        self.hits: list[tuple[int, str, str]] = []

    def handle_starttag(self, tag: str, attributes: list[tuple[str, str | None]]) -> None:
        if tag in self.VOID:
            return
        cls = dict(attributes).get("class") or ""
        skip = tag in self.SKIP or (tag == "details" and "provenance" in cls)
        self.stack.append((tag, skip))

    def handle_endtag(self, tag: str) -> None:
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                return

    def handle_data(self, data: str) -> None:
        if any(skip for _, skip in self.stack):
            return
        base = self.getpos()[0]
        for m in JARGON.finditer(data):
            snippet = " ".join(data[max(0, m.start() - 30) : m.end() + 30].split())
            self.hits.append((base + data[: m.start()].count("\n"), m.group(0), snippet))


def d21(site: Site) -> list[str]:
    """Copy lint: no model jargon in visitor-visible text outside /methods, /models and details.provenance.

    Text nodes only: attributes (alt, title, meta content), <template> bodies and <script type="text/template">
    bodies are not copy a visitor reads on the page. <noscript> text is.
    """
    out = []
    for p in site.pages:
        if p.rel in COPY_EXEMPT_PAGES or p.rel.startswith("models/"):
            continue
        parser = _Copy()
        parser.feed(p.text)
        for line, word, snippet in parser.hits:
            out.append(hit(p.rel, line, f"{word!r} in '{snippet}'"))
    return out


DETECTORS: list[tuple[str, str, str, object]] = [
    ("D1", "One <h1> per page", "= 1 on every page", d1),
    (
        "D2",
        "Head parity: charset, viewport, title, description, canonical, theme-color x2, og:*, twitter:card, in order",
        "every page",
        d2,
    ),
    (
        "D3",
        "Stylesheet allowlist: fonts -> atlas -> shell -> <= 1 page sheet; no legacy sheets; no external fonts",
        "0 violations",
        d3,
    ),
    ("D4", ":root{ only in atlas.css; no scoped token blocks", "0 outside atlas.css", d4),
    ("D5", "No page redeclares a kit class", "0", d5),
    ("D6", "Hex colours outside atlas.css", "0", d6),
    ("D7", "!important outside atlas.css's reduced-motion gate and [hidden]", "0", d7),
    ("D8", "Declared font-size floor 11px; --t-2xs >= 11px", "0 under", d8),
    ("D9", "Font families only via --font-display/--font-text/--font-code", "0 literals", d9),
    ("D10", "Dark token coverage of the light :root", "100%", d10),
    (
        "D12",
        "Footer parity: one byte-exact <footer>; links within EXPLORE+GAMES; every href 200s",
        "every page, 0 dead",
        d12,
    ),
    ("D13", ".site-nav data-active is a known path; one aria-label site-wide", "every page", d13),
    ("D14", "No <script> without src (CSP script-src 'self')", "0", d14),
    ("D15", 'style="" <= 2 per page, none setting colour/background/font', "<= 2, 0 colour", d15),
    ("D17", "Clean URLs: no .html in canonical/og:url/hrefs; every root page has a rewrite", "0", d17),
    ("D19", "stamp_assets.py --check and sync_public.py --check pass", "pass", d19),
    ("D20", "role=tab never on <a href>; every <summary> declares >= 44px", "0 fails", d20),
    ("D21", "Copy lint: no model jargon in visitor-visible text", "0", d21),
]
DETECTOR_IDS = [d[0] for d in DETECTORS]


def run(root: Path, only: set[str] | None = None, ledger_checks: list[list[str]] | None = None) -> dict[str, Result]:
    site = load_site(root, ledger_checks)
    results: dict[str, Result] = {}
    for did, desc, criterion, fn in DETECTORS:
        if only and did not in only:
            continue
        hits = sorted(fn(site), key=_hit_key)  # no set(): two identical hits on one line are two hits
        results[did] = Result(did, desc, criterion, hits)
    return results


def _hit_key(h: str) -> tuple[str, int, str]:
    m = re.match(r"([^:]+):(\d+): ", h)
    return (m.group(1), int(m.group(2)), h) if m else (h, 0, h)


# --------------------------------------------------------------------------
# output
# --------------------------------------------------------------------------
def worst_files(hits: list[str], n: int = 3) -> list[tuple[str, int, str]]:
    """(file, count, first hit) for the n files with the most hits."""
    by_file: dict[str, list[str]] = {}
    for h in hits:
        by_file.setdefault(h.split(":", 1)[0], []).append(h)
    ranked = sorted(by_file.items(), key=lambda kv: (-len(kv[1]), kv[0]))
    return [(f, len(hs), hs[0]) for f, hs in ranked[:n]]


def print_table(results: dict[str, Result], verbose: bool = False) -> None:
    print(f"  {'id':<4} {'status':<6} {'hits':>5}  check")
    for r in results.values():
        print(f"  {r.id:<4} {'PASS' if r.passed else 'FAIL':<6} {len(r.hits):>5}  {r.description}")
        if r.hits and not verbose:
            for _, count, first in worst_files(r.hits):
                print(f"       {count:>5}  {first}")
        elif r.hits:
            for h in r.hits:
                print(f"              {h}")
    green = sum(1 for r in results.values() if r.passed)
    print(f"\n  {green}/{len(results)} detectors green; {sum(len(r.hits) for r in results.values())} hits in all")


def receipts(results: dict[str, Result]) -> dict:
    return {
        r.id: {
            "pass": r.passed,
            "description": r.description,
            "criterion": r.criterion,
            "count": len(r.hits),
            "hits": r.hits,
        }
        for r in results.values()
    }


def print_delta(results: dict[str, Result], baseline: dict) -> None:
    print("  delta vs baseline (hits):")
    for r in results.values():
        base = baseline.get(r.id)
        if base is None or "hits" not in base and "count" not in base:
            print(f"  {r.id:<4} new -> {len(r.hits)}")
            continue
        before = base.get("count", len(base.get("hits", [])))
        diff = len(r.hits) - before
        sign = "+" if diff > 0 else ""
        print(
            f"  {r.id:<4} {before} -> {len(r.hits)}  ({sign}{diff})"
            if diff
            else f"  {r.id:<4} {before} -> {len(r.hits)}"
        )


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--root", help="directory to check instead of the repo root")
    ap.add_argument("--report", action="store_true", help="print the full table and exit 0 whatever it says")
    ap.add_argument(
        "--enforce",
        default=",".join(DEFAULT_ENFORCE),
        help=f"comma-separated detectors that fail the run (default {','.join(DEFAULT_ENFORCE)})",
    )
    ap.add_argument("--only", help="comma-separated subset of detectors to run")
    ap.add_argument("--json", dest="json_path", help="write the receipts {detector: {pass, hits}} here")
    ap.add_argument("--baseline", help="a saved --json file to print per-detector hit deltas against")
    ap.add_argument("--delta", action="store_true", help="print deltas (implied by --baseline)")
    ap.add_argument(
        "--verbose", action="store_true", help="print every hit instead of the three worst files per detector"
    )
    args = ap.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")  # quoted page text on a cp1252 console

    root = Path(args.root).resolve() if args.root else ROOT
    if not root.is_dir():
        sys.exit(f"--root {args.root} is not a directory")
    enforce = {s.strip() for s in args.enforce.split(",") if s.strip()}
    only = {s.strip() for s in args.only.split(",") if s.strip()} if args.only else None
    for did in enforce | (only or set()):
        if did not in DETECTOR_IDS:
            sys.exit(f"unknown detector {did}; known: {', '.join(DETECTOR_IDS)}")
    if args.delta and not args.baseline:
        sys.exit("--delta needs --baseline <json>")

    try:
        results = run(root, only)
    except Exception:
        if not args.report:
            raise
        traceback.print_exc()
        print("check_design: the gate itself failed (traceback above); report mode exits 0 so CI stays green")
        return 0
    n_pages = len(discover_pages(root))
    print(f"check_design: {n_pages} served pages under {root.name}/\n")
    print_table(results, verbose=args.verbose)

    if args.json_path:
        Path(args.json_path).write_text(
            json.dumps(receipts(results), indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        print(f"  receipts written to {args.json_path}")
    if args.baseline:
        print()
        print_delta(results, json.loads(Path(args.baseline).read_text(encoding="utf-8")))

    if args.report:
        return 0
    failing = [r for r in results.values() if r.id in enforce and not r.passed]
    print()
    if failing:
        print(f"FAIL - enforced detector(s) red: {', '.join(r.id for r in failing)}")
        for r in failing:
            for h in r.hits:
                print(f"  - {r.id} {h}")
        return 1
    print(f"OK - enforced detectors green: {', '.join(sorted(enforce, key=DETECTOR_IDS.index))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

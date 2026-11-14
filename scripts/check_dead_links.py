#!/usr/bin/env python3
"""Dead-link crawl: every internal link in the served site must resolve.

Stdlib only. What it reads, and from where:

* Routes come from ``vercel.json`` (``rewrites`` and ``redirects``), never from
  a table in this file. A path is served by, in Vercel's order: a redirect, a
  file on disk, then a rewrite. An external rewrite destination (the ESPN
  proxy) counts as served; nothing is fetched.
* Pages: only what is served. At the root, ``*.html`` plus the ``*.html`` of
  the folders scripts/sync_public.py mirrors (``SERVED_DIRS``: insights/,
  play/, models/, teams/); under ``public/``, the byte mirror Vercel serves,
  every ``*.html``. Any other folder (a nested checkout, .vercel/output, dist/,
  tests, docs, ...) is not crawled, so an untracked copy of the site cannot
  raise false alarms.
* Links: ``href`` and ``src`` attributes in the HTML, and literal site-absolute
  ``href`` values inside ``assets/**/*.js`` strings: ``href="/..."``,
  ``href='/...'`` (also written ``href=\\"/...\\"``) and object keys
  ``href: '/...'``. A value that continues at run time (``href="/players?q="
  + name``, or one whose string closes and is joined with ``+``) has its literal
  prefix checked up to the first ``?`` or ``#``.
  What is skipped is named in ``JS_ALLOWANCES``.
* Fragments: ``#frag`` must be an ``id`` (or ``<a name>``) in the target page;
  on insights.html a slug from assets/insights.json also counts, because the
  cards are built from that file at load time. A redirect keeps the link's
  own fragment unless its destination carries one.
* Redirects: each destination, and its ``#fragment``, must itself resolve. A
  destination that still holds a ``:param`` is not judged on its own; a link
  through that redirect is judged after the param is filled in.

Known dead links are listed in ``KNOWN`` and printed on every run. The list is
strict both ways: a dead link not in it fails, and an entry whose link is no
longer dead fails until it is removed. Exits 1 on either.

Usage: ``python scripts/check_dead_links.py [--root DIR]``
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# Folders under the root whose *.html scripts/sync_public.py mirrors into public/.
# Nothing else under the root is a served page.
SERVED_DIRS = ("insights", "play", "models", "teams")

# Dead anchors found by this crawl at 7c3acec. Fixing a link is a separate
# change that also deletes its entry here. Key: (file relative to the root,
# link exactly as written). The line is looked up, not stored, so an edit
# elsewhere in the file does not make an entry stale.
KNOWN = (
    ("players.html", "/methods#skills", "methods.html has no id=skills; it is at research.html:617"),
    (
        "assets/arc-projections.js",
        "/model#frontier",
        "/model redirects to /methods; id=frontier is only in research.html",
    ),
    (
        "assets/players-directory.js",
        "/insights#playoff-swings",
        "playoff-swings is on the cut list (CUTS.md) and not in insights.json",
    ),
    ("vercel.json", "/research -> /methods#frontier", "id=frontier is not in methods.html; it is at research.html:461"),
)

# What the JS scan allows itself to skip, by name, with the reason.
JS_ALLOWANCES = {
    "template": "a value holding ${...} is built at run time; there is no literal path to check",
    "open_prefix_without_query": (
        "a literal that continues at run time (an unclosed quote, or a closed string joined with +) "
        "and has no ? or # before the join ('/x/' + slug): "
        "the path itself is not known, so it is not judged; with a ? or # the path before it is"
    ),
}

# href = '/x'  /  href: '/x'  /  href=\\"/x\\"  /  href="/x?q=' + name. Group 2 is the
# literal up to the first quote, backslash or space; group 1 is the opening quote.
JS_HREF = re.compile(r"""\bhref\s*[=:]\s*\\?(["'])(/[^"'\\\s]*)""")
EXTERNAL = ("http://", "https://", "mailto:", "tel:", "data:", "javascript:", "//")


class PageParser(HTMLParser):
    """Collects ids, href/src values (with line numbers) from one page."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids: set[str] = set()
        self.links: list[tuple[int, str]] = []

    def handle_starttag(self, tag, attrs):
        for k, v in attrs:
            if not v:
                continue
            if k == "id" or (k == "name" and tag == "a"):
                self.ids.add(v)
            elif k in ("href", "src"):
                self.links.append((self.getpos()[0], v))


def parse_page(path: Path) -> PageParser:
    p = PageParser()
    p.feed(path.read_text(encoding="utf-8", errors="replace"))
    return p


def _pattern(source: str) -> re.Pattern:
    """A vercel route source ('/a/:slug', '/a/:rest*') as an anchored regex."""
    out, i = "", 0
    for m in re.finditer(r":[A-Za-z_]\w*(\*|\+)?", source):
        out += re.escape(source[i : m.start()])
        out += ".*" if m.group(1) == "*" else ".+" if m.group(1) == "+" else "[^/]+"
        i = m.end()
    out += re.escape(source[i:])
    return re.compile(out + "$")


def _fill(destination: str, source: str, path: str) -> str:
    """Substitute :params from the matched path into a destination."""
    names = re.findall(r":([A-Za-z_]\w*)", source)
    mm = re.fullmatch(_group_regex(source), path)
    if mm:
        for n, v in zip(names, mm.groups(), strict=False):
            destination = destination.replace(":" + n, v)
    return destination


def _group_regex(source: str) -> str:
    out, i = "", 0
    for m in re.finditer(r":[A-Za-z_]\w*(\*|\+)?", source):
        out += re.escape(source[i : m.start()])
        out += "(.*)" if m.group(1) == "*" else "(.+)" if m.group(1) == "+" else "([^/]+)"
        i = m.end()
    return out + re.escape(source[i:])


class Site:
    """The served surface of one tree: vercel.json routes plus files."""

    def __init__(self, root: Path, config_root: Path):
        self.root = root
        vj = config_root / "vercel.json"
        self.vercel_text = vj.read_text(encoding="utf-8")
        cfg = json.loads(self.vercel_text)
        self.rewrites = [(r["source"], r["destination"]) for r in cfg.get("rewrites", [])]
        self.redirects = [(r["source"], r["destination"]) for r in cfg.get("redirects", [])]
        ins = root / "assets" / "insights.json"
        self.slugs = (
            {c["slug"] for c in json.loads(ins.read_text(encoding="utf-8"))["insights"]} if ins.exists() else set()
        )
        self._ids: dict[Path, set[str]] = {}

    def source_line(self, source: str) -> int:
        needle = json.dumps(source)
        for n, line in enumerate(self.vercel_text.splitlines(), 1):
            if re.search(r'"source"\s*:\s*' + re.escape(needle), line):
                return n
        return 0

    def ids(self, page: Path) -> set[str]:
        if page not in self._ids:
            self._ids[page] = parse_page(page).ids
        return self._ids[page]

    def resolve(self, url_path: str):
        """-> (file or None, external?, redirect_destination or None)."""
        for src, dest in self.redirects:
            if _pattern(src).match(url_path):
                return None, False, _fill(dest, src, url_path)
        f = self.root / (url_path.lstrip("/") or "index.html")
        if f.is_file():
            return f, False, None
        for src, dest in self.rewrites:
            if _pattern(src).match(url_path):
                dest = _fill(dest, src, url_path)
                if dest.startswith(("http://", "https://")):
                    return None, True, None
                f = self.root / dest.split("#")[0].split("?")[0].lstrip("/")
                return (f, False, None) if f.is_file() else (None, False, None)
        return None, False, None

    def check(self, url: str, frag_inherit: str = "", hops: int = 0) -> str | None:
        """Why ``url`` (path[?q][#frag]) is dead, or None when it resolves."""
        if url.startswith(EXTERNAL):  # another host (a redirect to it too): nothing is fetched
            return None
        path, _, frag = url.partition("#")
        path = path.split("?")[0]
        if len(path) > 1 and path.endswith("/"):  # vercel.json trailingSlash:false sends /x/ to /x
            path = path.rstrip("/")
        frag = frag or frag_inherit
        f, external, redirect = self.resolve(path)
        if external:
            return None
        if redirect is not None:
            if hops > 5:
                return f"redirect loop at {path}"
            return self.check(redirect, frag, hops + 1)
        if f is None:
            return f"no page or route for {path}"
        if frag and f.suffix == ".html":
            if f.name == "insights.html" and frag in self.slugs:
                return None
            if frag not in self.ids(f):
                return f"dead anchor #{frag} in {url if not frag_inherit else path + '#' + frag}"
        return None


def pages(base: Path, top: bool) -> list[Path]:
    out = []
    if not top:  # public/ is served whole
        return sorted(base.rglob("*.html"))
    out = sorted(base.glob("*.html"))
    for d in SERVED_DIRS:
        out += sorted((base / d).glob("*.html"))
    return out


def js_links(path: Path) -> list[tuple[int, str]]:
    text = path.read_text(encoding="utf-8", errors="replace")
    out = []
    for m in JS_HREF.finditer(text):
        value = m.group(2)
        if "${" in value:  # JS_ALLOWANCES["template"]
            continue
        line = text.count("\n", 0, m.start()) + 1
        after = text[m.end() :]
        closed = re.match(r"\\?" + m.group(1), after)
        if closed and not re.match(r"\s*\+", after[closed.end() :]):
            out.append((line, value, value))  # the whole value is literal
            continue
        # the value goes on at run time (no closing quote, or a closing quote joined
        # with +): judge the literal path before ? or #
        path = re.split(r"[?#]", value, maxsplit=1)
        if len(path) == 1:  # JS_ALLOWANCES["open_prefix_without_query"]
            continue
        out.append((line, value, path[0]))
    return out


def crawl(base: Path, top: bool, config_root: Path):
    """-> (links checked, findings). A finding is (rel, line, link, why)."""
    site = Site(base, config_root)
    findings, checked = [], 0

    def judge(rel, line, link, resolve_against, check_link=None):
        nonlocal checked
        if not link or link.startswith(EXTERNAL) or link.startswith("#"):
            return
        checked += 1
        if link.startswith("/"):
            why = site.check(check_link or link)
        else:
            if link.startswith(("?",)):
                link = "/" + str(resolve_against.relative_to(base)) + link
                why = site.check(link)
            else:
                bare = link.split("#")[0].split("?")[0]
                target = Path(os.path.normpath(resolve_against.parent / bare))
                try:
                    rel_t = target.relative_to(base)
                except ValueError:
                    findings.append((rel, line, link, f"relative link leaves the tree: {link}"))
                    return
                frag = link.partition("#")[2]
                url = rel_t.as_posix()
                url = "" if url == "." else url
                why = site.check(
                    "/" + url + ("/" if bare.endswith("/") and url else "") + (("#" + frag) if frag else "")
                )
        if why:
            findings.append((rel, line, link, why))

    for page in pages(base, top):
        rel = page.relative_to(base).as_posix()
        for line, link in parse_page(page).links:
            judge(rel, line, link, page)
    for js in sorted((base / "assets").rglob("*.js")):
        rel = js.relative_to(base).as_posix()
        for line, link, check_link in js_links(js):
            judge(rel, line, link, js, check_link)
    for src, dest in site.redirects:
        checked += 1
        if re.search(r":[A-Za-z_]", dest):  # judged through the links that use it, after _fill
            continue
        why = site.check(dest)
        if why:
            findings.append(("vercel.json", site.source_line(src), f"{src} -> {dest}", f"redirect destination: {why}"))
    return checked, findings


def find_dead(root: Path):
    """-> (root links checked, public links checked, {(file, link): (line, why)})."""
    root = Path(root).resolve()
    n_root, f_root = crawl(root, True, root)
    pub = root / "public"
    n_pub, f_pub = crawl(pub, False, root) if pub.is_dir() else (0, [])
    dead: dict[tuple[str, str], tuple[int, str]] = {}
    for rel, line, link, why in f_root:
        dead.setdefault((rel, link), (line, why))
    root_keys = set(dead)
    for rel, line, link, why in f_pub:
        # a mirror finding with a root twin is the same defect
        if (rel, link) not in root_keys:
            dead.setdefault(("public/" + rel, link), (line, why))
    return n_root, n_pub, dead


def run(root: Path, known=KNOWN, out=print) -> int:
    n_root, n_pub, dead = find_dead(root)
    out(f"root: checked {n_root} links")
    out(f"public/: checked {n_pub} links")

    known_keys = {(f, link): why for f, link, why in known}
    out("")
    out("KNOWN dead links (listed in scripts/check_dead_links.py; fix the link, then delete its entry):")
    if not known_keys:
        out("  (none)")
    stale, new = [], []
    for (f, link), reason in known_keys.items():
        if (f, link) in dead:
            out(f"  {f}:{dead[(f, link)][0]}  {link}  [{reason}]")
        else:
            stale.append((f, link))
    for key in sorted(dead):
        if key not in known_keys:
            new.append(key)

    status = 0
    if new:
        status = 1
        out("")
        out(f"{len(new)} DEAD LINKS not in the known list:")
        for f, link in new:
            line, why = dead[(f, link)]
            out(f"  {f}:{line}: DEAD -> {link}  ({why})")
    if stale:
        status = 1
        out("")
        out(f"{len(stale)} KNOWN entries are no longer dead; remove them from KNOWN:")
        for f, link in stale:
            out(f"  {f}  {link}")
    out("")
    out("FAIL" if status else "ok: no dead links beyond the known list")
    return status


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=str(REPO), help="tree to crawl (default: this repo)")
    args = ap.parse_args(argv)
    if not (Path(args.root) / "vercel.json").is_file():
        ap.error(f"no vercel.json under {args.root}")
    return run(Path(args.root))


if __name__ == "__main__":
    sys.exit(main())

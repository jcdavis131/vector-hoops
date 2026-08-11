"""Frontend gate. The repo has pipeline tests and no check on the pages at all.

This exists because of one bug: index.html shipped

    b.onclick=()=>{...}c.appendChild(b);

with no semicolon and no line break, so the landing page's entire inline script
was a SyntaxError and never ran — on production, for an unknown length of time.
No byte diff, no grep, and no visual review catches that. `node --check` does,
in about a second.

Checks, in order of how much they have actually caught:

  1. syntax     every inline <script> parses            (found the outage)
  2. targets    every getElementById/$()/querySelector literal exists
  3. assets     every static src/href/fetch path resolves on disk
  4. ids        no duplicate element ids
  5. sourced    no known-unsourced figures in user-visible markup
  6. cited      figures printed as prose still match the file they name
  7. links      every internal .html link resolves

Read-only. Never writes. Exit 0 clean, 1 on any failure.

    python scripts/check_frontend.py
    python scripts/check_frontend.py --only syntax,links
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# public/ mirrors the whole site; auditing it double-reports every finding.
# node_modules and .git are never pages.
SKIP_DIRS = {"public", "node_modules", ".git", "assets", "knowledge", "pipeline", "docs", "scripts", "tasks"}

# Figures that appear in site copy and are in no committed file. Documented in
# /dictionary.html under "Terms this site uses that have no file behind them".
# If a scoreboard ever ships them, delete the entry — do not silence the check.
UNSOURCED = (
    "purity@10 0.7057",
    "lift 6.32",
    "purity 0.7057",
    # model.html carried a pill reading "EH 0.92 wins 6.7" beside the real
    # multi-tower numbers. No committed asset pairs an "EH" label with those
    # figures, nothing outside assets/ does either, and 0.92 and 6.7 never
    # co-occur in any object anywhere — and a wins MAE of 6.7 would have made it
    # the best model on the page, beating the v4 it sat next to. Removed and
    # pinned here so it cannot come back quietly.
    "EH 0.92 wins 6.7",
)

# The mirror image of UNSOURCED: figures that ARE sourced, printed on a page as
# prose rather than read from the file at runtime. `sourced` catches a number
# with no file behind it; this catches a number whose file has moved on without
# it. methods.html quotes the draft model zoo's SHAP and MAE figures — verified
# present 2026-08-10 — but the page does not fetch the file, so a regenerated
# zoo would leave the page quietly wrong and nothing would say so.
#
# Removing a figure from a page is also a failure here, deliberately: otherwise
# the list rots into entries that check nothing. Delete the row when you delete
# the claim.
#
# Verbatim only. A page that rounds for display — model.html prints 0.51 for a
# stored 0.5081 — cannot be checked this way, because the rounded string is not
# in the file. Those stay verified by hand; this covers the figures quoted exactly.
CITED = (
    ("methods.html", "1245.3", "assets/data/model_zoo_eval.json"),
    ("methods.html", "398.7", "assets/data/model_zoo_eval.json"),
    ("methods.html", "187.2", "assets/data/model_zoo_eval.json"),
    ("methods.html", "6.3", "assets/data/model_zoo_eval.json"),
    ("methods.html", "4450.09", "assets/data/model_zoo_eval.json"),
    ("methods.html", "4501.15", "assets/data/model_zoo_eval.json"),
    # the two multi-tower models model.html names, after removing the third that
    # had no file behind it
    ("model.html", "0.6847", "assets/data/model_zoo_eval.json"),
    ("model.html", "8.9", "assets/data/model_zoo_eval.json"),
    ("model.html", "0.6641", "assets/data/model_zoo_eval.json"),
    ("model.html", "8.99", "assets/data/model_zoo_eval.json"),
)

# A mention within 400 characters of one of these reads as naming the claim
# rather than making it, and passes. Keep these phrases explicit — anything
# vaguer turns the check off by accident.
DISCLAIMERS = (
    "no committed source",
    "in no committed file",
    "neither figure is in it",
    "previously cited",
    "treat them as claims",
    "have no file behind them",
)

RE_SCRIPT = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", re.S)
RE_ID_ATTR = re.compile(r"""\sid=["']?([A-Za-z][\w\-]*)""")
RE_GET_BY_ID = re.compile(r"""getElementById\(\s*['"]([A-Za-z][\w\-]*)['"]""")
RE_DOLLAR = re.compile(r"""\$\(\s*['"]([A-Za-z][\w\-]*)['"]\s*\)""")
RE_DOLLAR_DEF = re.compile(r"""\$\s*=\s*(?:function\s*\(|\w+\s*=>)""")
RE_QS = re.compile(r"""querySelector\(\s*['"]([#.][A-Za-z][\w\-]*)['"]\s*\)""")
# play.html is generated with unquoted attributes (class=chip), so a
# quoted-only pattern reported a live class as missing. Both forms.
RE_CLASS_ATTR = re.compile(r"""class=(?:["']([^"']+)["']|([^\s>"'=]+))""")
RE_ASSET = re.compile(
    r"""(?:fetch\(\s*['"]|<script[^>]+src=['"]|<link[^>]+href=['"]|<img[^>]+src=['"])([^'"]+)['"]"""
)
RE_LINK = re.compile(r"""href=["'](\.?/?[\w\-]+\.html)(?:[#?][^"']*)?["']""")
RE_COMMENT = re.compile(r"<!--.*?-->|/\*.*?\*/", re.S)


def pages() -> list[Path]:
    """Root pages plus the one-level directory pages Vercel actually serves.

    vercel.json rewrites /owner -> /owner/index.html and the same for brand,
    dfs, player and player-fit, so those directory files are the live pages —
    a root-only glob had never checked them. `public/` is a stale mirror of the
    whole site; auditing it would double-report every finding, so it is skipped
    and flagged on the board instead.
    """
    found = list(ROOT.glob("*.html"))
    for sub in sorted(ROOT.glob("*/index.html")):
        if sub.parent.name in SKIP_DIRS:
            continue
        found.append(sub)
    return sorted(found, key=lambda p: str(p.relative_to(ROOT)))


def label(page: Path) -> str:
    return str(page.relative_to(ROOT)).replace("\\", "/")


def strip_comments(text: str) -> str:
    """User-visible copy only — a comment quoting a bad figure is not shipping it."""
    return RE_COMMENT.sub("", text)


def check_syntax(fail) -> None:
    node = shutil.which("node")
    if not node:
        print("  SKIP  node not on PATH — cannot parse inline scripts")
        return
    checked = 0
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td) / "block.mjs"
        for page in pages():
            for i, block in enumerate(RE_SCRIPT.findall(page.read_text(encoding="utf-8")), 1):
                if not block.strip():
                    continue
                tmp.write_text(block, encoding="utf-8")
                checked += 1
                r = subprocess.run([node, "--check", str(tmp)], capture_output=True, text=True)
                if r.returncode != 0:
                    # node prints the offending source, then the error, then its
                    # own version banner — taking the last line reports "Node.js
                    # v24.1.0", which says nothing. Pick the actual error line.
                    lines = [ln.strip() for ln in r.stderr.splitlines() if ln.strip()]
                    err = next(
                        (ln for ln in lines if "Error" in ln and not ln.startswith("at ")),
                        lines[-1] if lines else "parse error",
                    )
                    fail(f"{label(page)} script block {i} does not parse: {err}")

        # External modules, which this used to skip entirely. Inline blocks were
        # parsed and assets/*.js was not, so a module could ship with a syntax
        # error and never execute — the browser reports it once in the console
        # and everything that file was meant to do simply does not happen.
        # Two were sitting in the repo when this check was added:
        #   assets/teams-time.js      a try{ block never closed before its catch
        #   assets/push-retention.js  \" escapes that leaked out of a generator
        # Neither is referenced by a page today, so nothing was visibly broken —
        # but nothing would have caught it if one had been.
        for js in sorted(ROOT.glob("assets/**/*.js")):
            if ".min." in js.name:
                continue
            checked += 1
            r = subprocess.run([node, "--check", str(js)], capture_output=True, text=True)
            if r.returncode != 0:
                lines = [ln.strip() for ln in r.stderr.splitlines() if ln.strip()]
                err = next((ln for ln in lines if "Error" in ln and not ln.startswith("at ")),
                           lines[-1] if lines else "parse error")
                fail(f"{js.relative_to(ROOT).as_posix()} does not parse: {err}")
    print(f"  {checked} script(s) parsed — inline blocks and assets/*.js")


def check_targets(fail) -> None:
    total = 0
    for page in pages():
        text = page.read_text(encoding="utf-8")
        # the same reason check_ids strips them, pointed the other way: an id or
        # class that only appears inside a comment would let a lookup for a
        # target that does not exist report as resolving. That hides a failure
        # rather than inventing one, which is the worse direction.
        markup = without_comments(text)
        ids = set(RE_ID_ATTR.findall(markup))
        classes = {c for m in RE_CLASS_ATTR.findall(markup) for c in (m[0] or m[1]).split()}
        wanted = set(RE_GET_BY_ID.findall(text))
        if RE_DOLLAR_DEF.search(text):
            wanted |= set(RE_DOLLAR.findall(text))
        for name in sorted(wanted):
            total += 1
            if name not in ids:
                fail(f"{label(page)} looks up #{name}, which does not exist on the page")
        for sel in sorted(set(RE_QS.findall(text))):
            total += 1
            pool = ids if sel[0] == "#" else classes
            if sel[1:] not in pool:
                fail(f"{label(page)} querySelector('{sel}') matches nothing on the page")
    print(f"  {total} DOM lookup(s) resolve")


def check_assets(fail) -> None:
    seen: set[tuple[str, str]] = set()
    for page in pages():
        for raw in RE_ASSET.findall(page.read_text(encoding="utf-8")):
            if raw.startswith(("http://", "https://", "data:", "//", "#", "mailto:")):
                continue
            rel = re.sub(r"[?#].*$", "", raw).lstrip("./")
            # paths built by string concatenation are exercised at runtime, not here
            if not rel or any(ch in rel for ch in "{}$+"):
                continue
            key = (label(page), rel)
            if key in seen:
                continue
            seen.add(key)
            if not (ROOT / rel).exists():
                fail(f"{label(page)} references {rel}, which is not on disk")
    print(f"  {len(seen)} static asset reference(s) resolve")


RE_HTML_COMMENT = re.compile(r"<!--.*?-->", re.S)
RE_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)


def without_comments(text: str) -> str:
    """Comments do not define ids.

    A comment that quotes the markup it is describing — `<input id=guess
    list=guessList>` — reads as a second `id=guess` to a regex, and the page was
    reported as defining it twice. The id was quoted, not declared. Only `<!-- -->`
    and `/* */` are stripped; `//` is left alone because it would take the rest
    of any line containing `https://` with it.
    """
    return RE_BLOCK_COMMENT.sub(" ", RE_HTML_COMMENT.sub(" ", text))


def check_ids(fail) -> None:
    for page in pages():
        ids = RE_ID_ATTR.findall(without_comments(page.read_text(encoding="utf-8")))
        for name in sorted({i for i in ids if ids.count(i) > 1}):
            fail(f"{label(page)} defines id={name} {ids.count(name)} times — getElementById will pick one")
    print(f"  no duplicate ids across {len(pages())} page(s)")


def check_sourced(fail) -> None:
    """Naming one of these AS a claim is allowed; presenting it as a fact is not.

    The dictionary's whole job is to list them, and a correction that says what a
    line used to claim has to quote it. So a mention passes only when the text
    around it disclaims it — an allowlist of files would let a genuine new use
    slip in beside a legitimate one.
    """
    allowed = 0
    for page in pages():
        visible = strip_comments(page.read_text(encoding="utf-8"))
        for bad in UNSOURCED:
            for m in re.finditer(re.escape(bad), visible):
                window = visible[max(0, m.start() - 400) : m.end() + 400].lower()
                if any(p in window for p in DISCLAIMERS):
                    allowed += 1
                    continue
                fail(
                    f"{label(page)} shows '{bad}' as fact — it is in no committed file. "
                    f"Use the eval_scoreboard figures, or disclaim it (see /dictionary.html#purity)."
                )
    print(f"  no unsourced figures presented as fact ({len(UNSOURCED)} pattern(s), {allowed} disclaimed mention(s) allowed)")


# The brief for this site is that every page is free. Nothing is gated — there is
# no auth, no entitlement check and no Stripe call anywhere — but the copy used to
# price the pages anyway: the landing nav read "Owner $5k", a title read
# "Championship Economics $5k/$10k/$15k", and three persona pages carried tier
# pills. Visitors were quoted a price for something that has none.
#
# Deliberately narrow. Franchise valuations ($9.1B), the 31-season cap history
# ($24.36M -> $154.65M) and payroll figures are data and must survive, so this
# matches tier and subscription shapes, not dollar signs.
RE_PRICING = re.compile(
    r"paywall|stripe|monetiz|\bstarter\b|per month|/mo\b|subscri|checkout|billing"
    r"|free trial|\$\d+\s*(?:k\b|/|per)|pro \$\d|\$\d+ api|\$\d+ (?:sneak|deck|daily|target|trophy|chart)",
    re.I,
)


def check_free(fail) -> None:
    """No page quotes a price. See RE_PRICING for why this is not a $-sign scan."""
    checked = 0
    for page in pages():
        visible = strip_comments(page.read_text(encoding="utf-8"))
        visible = re.sub(r"<script[^>]*>.*?</script>", " ", visible, flags=re.S)
        visible = re.sub(r"<style[^>]*>.*?</style>", " ", visible, flags=re.S)
        checked += 1
        for m in RE_PRICING.finditer(visible):
            snippet = re.sub(r"\s+", " ", visible[max(0, m.start() - 60) : m.end() + 60]).strip()
            fail(
                f"{label(page)} quotes a price or tier ({m.group(0)!r}) — every page on this "
                f"site is free and nothing is gated. Context: …{snippet}…"
            )
    print(f"  {checked} page(s) quote no price")


def check_cited(fail) -> None:
    """Every figure in CITED is still on its page AND still in its source file.

    Matching is bounded on both sides — a bare `in` test for "6.3" would pass on
    "16.35" and make the check meaningless the moment the file changed shape.
    """
    checked = matched = 0
    for page_name, figure, source in CITED:
        page = ROOT / page_name
        src = ROOT / source
        if not page.exists():
            # --root public and friends: nothing to check here
            continue
        checked += 1
        rx = re.compile(r"(?<![\d.])" + re.escape(figure) + r"(?![\d])")
        on_page = bool(rx.search(strip_comments(page.read_text(encoding="utf-8"))))
        if not src.exists():
            fail(f"{page_name} cites {source} for {figure}, and that file is not on disk")
            continue
        in_file = bool(rx.search(src.read_text(encoding="utf-8", errors="replace")))
        if on_page and not in_file:
            fail(
                f"{page_name} prints {figure} sourced to {source}, but that value is no longer "
                f"in the file. Re-read the file and update the page, or drop the claim."
            )
        elif not on_page:
            fail(
                f"CITED still lists {figure} for {page_name}, which no longer prints it — "
                f"remove the stale row from CITED in scripts/check_frontend.py."
            )
        else:
            matched += 1
    # say what actually held, not how many rows were looked at — an earlier
    # version printed "6 still match" on the same run that reported a mismatch
    print(f"  {matched} of {checked} cited figure(s) still match the file they name")


def check_links(fail) -> None:
    total = 0
    for page in pages():
        for raw in sorted(set(RE_LINK.findall(page.read_text(encoding="utf-8")))):
            total += 1
            if not (ROOT / raw.lstrip("./")).exists():
                fail(f"{label(page)} links to {raw}, which does not exist")
    print(f"  {total} internal link(s) resolve")


def check_mirror(fail) -> None:
    """public/ is what Vercel serves; root is what everyone edits.

    With no build step and no outputDirectory in vercel.json, Vercel serves
    public/ at the site root. Editing a root page therefore changes nothing
    that a visitor sees. That is not a hypothetical — /play served 27,938 bytes
    from public/play.html while the root file was 45,050, and every
    knowledge/*.md returned 404. This check makes the drift loud.
    """
    script = ROOT / "scripts" / "sync_public.py"
    if not script.exists():
        print("  SKIP  scripts/sync_public.py not present")
        return
    r = subprocess.run(
        [sys.executable, str(script), "--check"], capture_output=True, text=True,
        encoding="utf-8", errors="replace", cwd=str(ROOT)
    )
    first = (r.stdout.strip().splitlines() or ["no output"])[0]
    if r.returncode != 0:
        fail(f"public/ mirror is stale — {first.removeprefix('FAIL ').strip()}. Run: python scripts/sync_public.py")
    else:
        print(f"  {first.removeprefix('OK').strip()}")


def check_tokens(fail) -> None:
    """assets/*.json is served immutable for a year, so a regenerated asset
    never reaches a returning visitor unless its URL changes."""
    script = ROOT / "scripts" / "stamp_assets.py"
    if not script.exists():
        print("  SKIP  scripts/stamp_assets.py not present")
        return
    r = subprocess.run(
        [sys.executable, str(script), "--check"], capture_output=True, text=True,
        encoding="utf-8", errors="replace", cwd=str(ROOT)
    )
    lines = [ln for ln in r.stdout.strip().splitlines() if ln.strip()]
    first = lines[0] if lines else "no output"
    if r.returncode != 0:
        fail(f"asset cache tokens are stale — {first.removeprefix('FAIL').strip()} Run: python scripts/stamp_assets.py")
    else:
        print(f"  {first.removeprefix('OK').strip()}")


RE_FRAG = re.compile(r"""href=["']([^"']*#[^"']+)["']""")
RE_ID_ANY = re.compile(r"""\sid=["']?([A-Za-z][\w\-:.]*)""")
RE_ANCHOR_NAME = re.compile(r"""<a[^>]+name=["']([A-Za-z][\w\-:.]*)""")


def check_fragments(fail) -> None:
    """A deep link has to land on something.

    `links` resolves the file half of an href and throws the fragment away — its
    pattern captures `([\\w\\-]+\\.html)` and treats `#...` as optional trailing
    noise — so `/dictionary.html#retrieval` passed for as long as the file existed,
    whatever was or was not inside it. Rename a glossary entry and every page
    pointing at it quietly lands at the top of a long page instead.

    Found two on the landing page: `#games` in the nav and `#model` on the "How it
    works" button beside "Play today's". Neither id existed at parse time or after
    the scripts ran, and clicking each moved the page from scrollY 0 to scrollY 0
    while writing the fragment into the address bar.

    Ids are read out of the served markup, so a target built at runtime would read
    as missing here. None is today — every one of the site's fragment links names a
    static id — and a loud failure is the right way to find out that changed.
    """
    ids: dict[str, set[str]] = {}
    for p in pages():
        text = p.read_text(encoding="utf-8", errors="replace")
        ids[label(p)] = set(RE_ID_ANY.findall(text)) | set(RE_ANCHOR_NAME.findall(text))

    def resolve(src: str, file_part: str) -> str:
        if not file_part or file_part in ("./",):
            return src
        f = file_part.split("?")[0].lstrip("/")
        if not f.endswith(".html"):
            f = f.rstrip("/") + "/index.html"
        return f if f in ids else f.split("/")[-1]

    checked = 0
    for p in pages():
        src = label(p)
        # a comment quoting a link is not a link — the same reason `ids` reads
        # without_comments, learned when a comment quoting <input id=guess> was
        # counted as a second declaration of that id
        text = without_comments(p.read_text(encoding="utf-8", errors="replace"))
        for href in RE_FRAG.findall(text):
            if href.startswith(("http://", "https://", "mailto:")):
                continue
            file_part, frag = href.split("#", 1)
            frag = frag.split("?")[0]
            if not frag:
                continue
            target = resolve(src, file_part)
            checked += 1
            if target not in ids:
                fail(f"{src} links to {href!r} and {target} is not a page on this site")
            elif frag not in ids[target]:
                fail(f"{src} links to {href!r} but no element in {target} has "
                     f"id={frag!r} — the link writes a fragment into the address bar "
                     f"and leaves the reader where they were")
    print(f"  {checked} fragment link(s) land on an element that exists")


def check_derived(fail) -> None:
    """Assets cut from other committed assets have to still match what they were cut from.

    `assets/model_zoo.json` is a verbatim slice of `front_office.json`, served
    `immutable` for a year. If the source changes and the slice does not, nothing
    goes red and the page shows year-old numbers under a fresh headline. The same
    is true of every `build_*.py` output — that whole family was checkable and
    unchecked, which is the exact shape the `mirror` and `tokens` checks exist for.

    Each generator is run with `--check`, which is read-only: verified by running
    all seven against a clean tree and confirming it stayed clean. None of them
    imports the pipeline, touches the network, or loads torch — that was checked
    before wiring them in, because a gate that calls seven scripts is seven
    chances to repeat the run-that-also-shipped.
    """
    folder = ROOT / "scripts"
    if not folder.is_dir():
        print("  SKIP  no scripts/ under this root")
        return
    gens = sorted(folder.glob("build_*.py"))
    if not gens:
        print("  SKIP  no build_*.py generators found")
        return
    ok = 0
    for g in gens:
        # encoding is explicit: text=True decodes with the locale codec, which on
        # this box is cp1252, and the generators print em-dashes. The first run of
        # this check reported "is stale â€" run:" — mojibake in a gate's own
        # failure message, from the same class of bug the ledger already carries.
        r = subprocess.run([sys.executable, str(g), "--check"], capture_output=True,
                           text=True, encoding="utf-8", errors="replace", cwd=str(ROOT))
        if r.returncode != 0:
            last = [ln for ln in (r.stdout + r.stderr).strip().splitlines() if ln.strip()]
            fail(f"{g.name} reports drift — {last[-1] if last else 'no output'}")
        else:
            ok += 1
    print(f"  {ok}/{len(gens)} derived asset(s) match the sources they were built from")


def check_worker(fail) -> None:
    """offline.html tells the visitor which cache the worker uses, and that name
    was a literal in the page and a separate literal in sw.js with nothing tying
    them together.

    Bumping the worker to v7.3 left the page announcing v7.2. The one-shot script
    that owns those sentences has a --check mode and it passed anyway, because it
    compares the page against a frozen string rather than against the worker's
    actual name — a check that cannot fail. This one derives the expected value
    from sw.js, so the next bump either updates the page or goes red.
    """
    sw = ROOT / "sw.js"
    if not sw.exists():
        print("  SKIP  sw.js not present")
        return
    m = re.search(r"""const\s+C\s*=\s*['"]([^'"]+)['"]""", sw.read_text(encoding="utf-8"))
    if not m:
        fail("sw.js has no `const C = '…'` cache name for the pages to agree with")
        return
    name = m.group(1)
    agree = 0
    for p in pages():
        text = without_comments(p.read_text(encoding="utf-8", errors="replace"))
        for hit in sorted(set(re.findall(r"hoops-v[\w.-]+", text))):
            if hit == name:
                agree += 1
            else:
                fail(
                    f"{p.name} shows cache name {hit!r} but sw.js uses {name!r} — "
                    f"a visitor reading the page is told the wrong cache"
                )
    print(f"  {agree} page mention(s) of the worker cache agree with sw.js ({name})")


CHECKS = {
    "syntax": check_syntax,
    "mirror": check_mirror,
    "tokens": check_tokens,
    "derived": check_derived,
    "worker": check_worker,
    "targets": check_targets,
    "assets": check_assets,
    "ids": check_ids,
    "sourced": check_sourced,
    "cited": check_cited,
    "free": check_free,
    "links": check_links,
    "fragments": check_fragments,
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma-separated subset of: " + ", ".join(CHECKS))
    ap.add_argument(
        "--root",
        help="directory to check instead of the repo root. Use --root public to "
        "validate the surface Vercel actually serves, which is not the same tree.",
    )
    args = ap.parse_args()

    if args.root:
        global ROOT
        ROOT = Path(args.root).resolve()
        if not ROOT.is_dir():
            sys.exit(f"--root {args.root} is not a directory")

    names = [n.strip() for n in args.only.split(",")] if args.only else list(CHECKS)
    unknown = [n for n in names if n not in CHECKS]
    if unknown:
        sys.exit(f"unknown check(s): {', '.join(unknown)}")
    if not pages():
        sys.exit("no .html at repo root — wrong directory?")

    failures: list[str] = []
    for name in names:
        print(f"{name}:")
        CHECKS[name](failures.append)

    print()
    if failures:
        print(f"FAIL — {len(failures)} problem(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(f"OK — {len(names)} check(s) clean across {len(pages())} pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

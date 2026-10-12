"""Give every page a canonical URL and a link preview that is not blank.

The game builds a share card — `makeShareOG()`, `#shareCard`, `#shareCardD` — so
sharing is plainly intended. But the metadata that decides what a shared link
*looks like* was almost entirely absent:

    missing description: 15 | no og: 20 | no twitter: 22 | no canonical: 22  (of 22)

`play.html` is the page every navigation drives to, and a link to it rendered as
a bare URL: no title, no description, no image, while the page itself was drawing
a 1200x630 share image nobody ever saw in a preview.

Everything written here is already committed or already on the page. Nothing is
composed:

    og:title        the page's own <title>
    og:description  the page's own <meta name="description">, and only if it has
                    one — fifteen pages do not, and inventing copy for them is
                    writing, not wiring
    og:image        assets/og-1200x630.png, which is exactly 1200x630
    og:url          the clean URL, derived from the file path
    canonical       the same URL

**Canonical is the point as much as the preview.** Six pages exist twice —
`owner.html` and `owner/index.html` are the same page at `/owner` — and with no
canonical, that is the same content on two addresses. Both mirrors now name the
same one.

Only properties a page does not already declare are added, so the two pages that
came with their own Open Graph tags keep them.

    python scripts/build_social_meta.py --check
    python scripts/build_social_meta.py
"""

from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://hoops.dumbmodel.com"
IMAGE = f"{SITE}/assets/og-1200x630.png"
START = "<!-- build_social_meta.py: start -->"
END = "<!-- build_social_meta.py: end -->"
SKIP_DIRS = {"public", "node_modules", "assets", "knowledge", "pipeline", "docs",
             "scripts", "tasks", "your_files"}

RE_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.S | re.I)
RE_DESC = re.compile(r"""<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']""", re.S | re.I)
RE_HEAD_END = re.compile(r"</head>", re.I)


def pages() -> list[Path]:
    found = list(ROOT.glob("*.html"))
    for sub in sorted(ROOT.glob("*/index.html")):
        if sub.parent.name not in SKIP_DIRS:
            found.append(sub)
    return sorted(found, key=lambda p: str(p.relative_to(ROOT)))


def clean_url(page: Path) -> str:
    """The address vercel.json actually serves this page at.

    cleanUrls strips .html and trailingSlash is false, so brand.html and
    brand/index.html are both /brand — which is exactly why they need the same
    canonical rather than one each.
    """
    rel = page.relative_to(ROOT).as_posix()
    if rel == "index.html":
        return SITE + "/"
    if rel.endswith("/index.html"):
        rel = rel[: -len("/index.html")]
    elif rel.endswith(".html"):
        rel = rel[: -len(".html")]
    return f"{SITE}/{rel}"


def colliding() -> set[str]:
    """Clean URLs claimed by two pages that are not the same page.

    brand.html and brand/index.html are one page at /brand and share a title, so
    naming the same canonical is right. player-cards.html ("Player cards") once collided with
    player/index.html ("Player - Stay on floor") are *different pages* that both
    resolve to /player, and no canonical is truthful there: whichever Vercel
    serves, the other is unreachable at its clean URL. That is a routing problem
    to decide, not one to paper over with a tag, so those pages get every other
    tag and no canonical.
    """
    seen: dict[str, list[tuple[str, str]]] = {}
    for page in pages():
        text = page.read_text(encoding="utf-8", errors="replace")
        m = RE_TITLE.search(text)
        t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", m.group(1))).strip() if m else ""
        seen.setdefault(clean_url(page), []).append((page.as_posix(), t))
    return {u for u, rows in seen.items()
            if len(rows) > 1 and len({t for _, t in rows}) > 1}


CLASH: set[str] = set()


def build(text: str, url: str) -> str | None:
    """The tags this page is missing, or None if it needs nothing."""
    title = RE_TITLE.search(text)
    if not title:
        return None
    title_txt = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", title.group(1))).strip()
    desc = RE_DESC.search(text)
    desc_txt = re.sub(r"\s+", " ", desc.group(1)).strip() if desc else None

    # Everything between START and END belongs to this script and is replaced
    # wholesale by the caller, so "what the page already has" has to be read from
    # OUTSIDE that block. Reading it from the whole text made the script subtract
    # its own output: the first run wrote twelve tags, the second saw those twelve
    # as already-present, emitted only the remainder, and then replaced the block
    # with that remainder — deleting eleven of them. /player-cards and /player
    # oscillated between 12 tags and 0 on alternate runs, and `--check` reported
    # "2 page(s) to change" forever while exiting 0.
    outside = re.sub(re.escape(START) + r".*?" + re.escape(END), "", text, flags=re.S)

    have_props = set(re.findall(r"""property=["'](og:[\w:]+)["']""", outside, re.I))
    have_names = set(re.findall(r"""name=["'](twitter:[\w:]+)["']""", outside, re.I))
    has_canon = bool(re.search(r"""<link[^>]*rel=["']canonical["']""", outside, re.I))

    out: list[str] = []
    if not has_canon and url not in CLASH:
        out.append(f'<link rel="canonical" href="{html.escape(url, quote=True)}">')

    def og(prop: str, val: str) -> None:
        if prop not in have_props:
            out.append(f'<meta property="{prop}" content="{html.escape(val, quote=True)}">')

    def tw(name: str, val: str) -> None:
        if name not in have_names:
            out.append(f'<meta name="{name}" content="{html.escape(val, quote=True)}">')

    og("og:type", "website")
    og("og:site_name", "dumbmodel")
    og("og:url", url)
    og("og:title", title_txt)
    og("og:image", IMAGE)
    og("og:image:width", "1200")
    og("og:image:height", "630")
    # a summary_large_image card with no image renders worse than no card at all,
    # so the card type is only claimed alongside an image
    tw("twitter:card", "summary_large_image")
    tw("twitter:title", title_txt)
    tw("twitter:image", IMAGE)
    if desc_txt:
        og("og:description", desc_txt)
        tw("twitter:description", desc_txt)
    return "\n".join(out) if out else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only, write nothing")
    args = ap.parse_args()

    global CLASH
    CLASH = colliding()
    for u in sorted(CLASH):
        print(f"  NOTE  {u} is claimed by two different pages — no canonical written for either")
    changed = no_desc = 0
    for page in pages():
        name = page.relative_to(ROOT).as_posix()
        text = page.read_bytes().decode("utf-8")
        url = clean_url(page)
        if not RE_DESC.search(text):
            no_desc += 1

        body = build(text, url)
        if body is None:
            continue
        # Emit the newline the file already uses. This block was composed with
        # "\n" while `core.autocrlf=true` hands out CRLF working copies, so after
        # every fresh checkout the rebuilt block differed from the stored one by
        # nothing but line endings — the script reported "1 page(s) to change",
        # rewrote play.html 12 bytes shorter, and went quiet until the next
        # checkout. Harmless on its own; as the `derived` gate's input it is a
        # false red that trains you to ignore the gate.
        nl = "\r\n" if "\r\n" in text else "\n"
        block = (START + nl + body.replace("\n", nl) + nl + END)

        if START in text and END in text:
            updated = text[: text.index(START)] + block + text[text.index(END) + len(END):]
        else:
            m = RE_HEAD_END.search(text)
            if not m:
                print(f"  SKIP  {name} has no </head>")
                continue
            updated = text[: m.start()] + block + "\n" + text[m.start():]

        if updated == text:
            continue
        changed += 1
        n = body.count("<")
        print(f"  {'would add' if args.check else 'added'}  {name:<24} {n} tag(s)  ->  {url}")
        if not args.check:
            page.write_bytes(updated.encode("utf-8"))

    print(f"\n{changed} page(s) {'to change' if args.check else 'changed'}")
    if no_desc:
        print(f"{no_desc} page(s) still have no <meta name=\"description\">. Writing one is copy, "
              f"not wiring, so none was invented here — a shared link to those pages gets a title "
              f"and an image but no summary line.")
    # --check has to be able to fail. It reported "2 page(s) to change" and exited
    # 0 for as long as player-cards.html and player/index.html carried no Open
    # Graph or Twitter tags at all, while the readiness report said every page had
    # them. A check that names the drift and then passes is worse than no check:
    # it turns an open question into a green tick.
    #
    # Missing descriptions stay a note rather than a failure — writing one is copy,
    # and this script deliberately invents none.
    if args.check and changed:
        print(f"FAIL {changed} page(s) need social metadata — "
              f"run: python scripts/build_social_meta.py")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

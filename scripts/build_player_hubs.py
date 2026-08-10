"""Write the browse row on player-cards.html from the hub pages that already exist.

/player-cards was a search box and nothing else. 2,293 cards behind it, and the
page showed none of them until you typed a name you already knew — which means
you could only find a player you had already thought of. Its own copy says
"until now nothing on this site linked them", and on load it still linked
nothing.

It did not need new data. `knowledge/` already carries thirteen hub pages:

    knowledge/archetypes/*.md   8 archetype hubs
    knowledge/positions/*.md    5 position hubs

The page's own error message even names them ("plus 8 archetype and 5 position
hubs"), and `open('archetypes/playmaking-steals')` already worked. Nothing
linked to them.

The names are read out of each file's frontmatter rather than typed into the
markup, because a hand-copied label goes stale the moment a hub is renamed and
the page would then be lying about what it links to. Same reason
build_wiki_index.py exists.

Deliberately static markup, not JS: the row costs no bytes on load and needs no
index fetch, so the 539 KB `wiki_index.json` stays deferred until someone
actually searches. A blank page that could have shown thirteen doors did not
justify making every visitor download half a megabyte.

    python scripts/build_player_hubs.py --check
    python scripts/build_player_hubs.py
"""

from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "player-cards.html"
START = "<!-- build_player_hubs.py: start -->"
END = "<!-- build_player_hubs.py: end -->"

RE_NAME = re.compile(r"""^name:\s*["']?(.+?)["']?\s*$""", re.M)


def hubs(kind: str) -> list[tuple[str, str]]:
    """(path, display name) for every committed hub of one kind."""
    out = []
    for md in sorted((ROOT / "knowledge" / kind).glob("*.md")):
        head = md.read_text(encoding="utf-8", errors="replace").split("---", 2)
        front = head[1] if len(head) > 2 else ""
        m = RE_NAME.search(front)
        if not m:
            print(f"  SKIP  {md.name} has no name in its frontmatter")
            continue
        out.append((f"{kind}/{md.stem}", m.group(1).strip()))
    return out


def block() -> str:
    arch, pos = hubs("archetypes"), hubs("positions")
    if not arch or not pos:
        sys.exit("no hub pages found — knowledge/archetypes or knowledge/positions is empty")

    def row(label: str, items: list[tuple[str, str]], describe: str) -> str:
        # real buttons: the row has to be reachable and operable from a keyboard,
        # and these open a card rather than navigating, so a button is the honest
        # element for them
        btns = "".join(
            f'<button type="button" class="hub" data-path="{html.escape(p, quote=True)}">'
            f'{html.escape(n)}</button>'
            for p, n in items
        )
        return (f'<div class="mono dim" style="margin-top:12px">{html.escape(label)}</div>'
                f'<div class="hubrow" role="group" aria-label="{html.escape(describe, quote=True)}">'
                f'{btns}</div>')

    return "\n".join([
        START,
        '<div style="margin-top:16px;border-top:2px solid var(--hair,#e1e0d9);padding-top:4px">',
        '<p class="sub dim" style="margin:8px 0 0">Or start from a shape rather than a name — '
        'every charted player belongs to at least one of these.</p>',
        row("By archetype", arch, "Browse players by archetype"),
        row("By position", pos, "Browse players by position"),
        "</div>",
        END,
    ])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only, write nothing")
    args = ap.parse_args()

    text = PAGE.read_bytes().decode("utf-8")
    fresh = block()
    n = fresh.count("<button")

    if START in text and END in text:
        before = text[: text.index(START)]
        after = text[text.index(END) + len(END):]
        updated = before + fresh + after
    else:
        anchor = '<ul class="hits" id="hits" role="listbox" aria-label="Matching players"></ul>'
        if anchor not in text:
            sys.exit("could not find the results list to anchor the browse row to")
        updated = text.replace(anchor, anchor + "\n" + fresh, 1)

    if updated == text:
        print(f"  browse row already current — {n} hub link(s)")
        return 0
    print(f"  {'would write' if args.check else 'wrote'} the browse row — {n} hub link(s)")
    if not args.check:
        PAGE.write_bytes(updated.encode("utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

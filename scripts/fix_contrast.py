"""Raise the twelve colour pairs that fall below WCAG 1.4.3 AA.

They collapse to three distinct pairs, all of them white or orange text sitting
on a brand colour:

    #fff    on #eb6834 orange   3.20:1   ->  #111 on orange        5.90:1
    #fff    on #2a78d6 blue     4.42:1   ->  #fff on #0072b2       5.19:1
    #eb6834 on #f0e442 yellow   2.42:1   ->  #111 on yellow       14.28:1

No new colour is introduced. #0072b2 is `--okabe-blue`, already declared on this
site and already used for the focus ring; ink-on-brand-colour is already the
site's own pattern, in `.btn-y{background:var(--yellow);color:#111}`.

Why the text moved rather than the token: --orange and --blue are the brand, used
for borders, marks and chart series where contrast against paper is not the
constraint. Changing the token to satisfy one pill would restyle the whole site.
Changing the text on that pill is local and reversible.

The blue is the exception — neither #fff (4.42) nor #111 (4.28) clears 4.5 on
#2a78d6, so that one genuinely needs a different background, and the Okabe blue
the palette already carries is the obvious one.

Idempotent. Run check_contrast.py after.

    python scripts/fix_contrast.py --check
    python scripts/fix_contrast.py
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# (file, before, after)
EDITS: list[tuple[str, str, str]] = [
    ("index.html",
     ".title-accent{color:var(--orange);",
     ".title-accent{color:var(--ink);"),

    ("play.html", ".chip.active{background:var(--orange);color:#fff",
     ".chip.active{background:var(--orange);color:#111"),
    ("play.html", ".season-chip.active{background:#EB6834;color:#fff}",
     ".season-chip.active{background:#EB6834;color:#111}"),
    ("play.html", ".pill.o{background:var(--orange);color:#fff}",
     ".pill.o{background:var(--orange);color:#111}"),
    ("play.html", ".pill.b{background:var(--blue);color:#fff}",
     ".pill.b{background:#0072b2;color:#fff}"),
]

for page in ("inventory.html", "leaderboard.html", "methods.html", "offline.html"):
    EDITS += [
        (page, ".pill-o{background:var(--orange);color:#fff}",
         ".pill-o{background:var(--orange);color:#111}"),
        (page, ".pill-b{background:var(--blue);color:#fff}",
         ".pill-b{background:#0072b2;color:#fff}"),
    ]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only, write nothing")
    args = ap.parse_args()

    by_file: dict[str, list[tuple[str, str]]] = {}
    for name, before, after in EDITS:
        by_file.setdefault(name, []).append((before, after))

    applied = already = absent = 0
    for name, pairs in by_file.items():
        path = ROOT / name
        if not path.exists():
            print(f"  SKIP  {name} not on disk")
            continue
        text = path.read_bytes().decode("utf-8")
        original = text
        for before, after in pairs:
            if before in text:
                text = text.replace(before, after)
                applied += 1
            elif after in text:
                already += 1
            else:
                # not every page defines every pill variant; that is fine and is
                # reported rather than silently counted as done
                absent += 1
        if text != original and not args.check:
            path.write_bytes(text.encode("utf-8"))
            print(f"  wrote {name}")
        elif text != original:
            print(f"  would change {name}")

    print(f"\n{applied} replacement(s) {'to apply' if args.check else 'applied'}, "
          f"{already} already done, {absent} rule(s) not present on that page")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

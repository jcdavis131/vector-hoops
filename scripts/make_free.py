"""Take the price tags off. The brief says make all pages free and accessible.

Nothing on this site is gated. There is no auth, no entitlement check, no Stripe
call anywhere — the owner page's own copy calls it a "Stripe mock". Every page is
already free to use. What was not free was the *copy*: the landing page's primary
navigation read "Owner $5k", a page title read "Championship Economics
$5k/$10k/$15k", and three persona pages carried tier pills.

So a visitor was told there was a price for something that has none. Removing the
pricing does not remove a feature — it makes the page describe what the site
actually does. That is why this is a copy fix and not a business decision.

Idempotent: a second run reports every replacement as already applied. If the
tiers are a real plan rather than aspiration, this is one commit to revert.

    python scripts/make_free.py --check    # report, write nothing
    python scripts/make_free.py            # apply
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# (file, before, after). Root pages and their public-facing duplicates both.
EDITS: list[tuple[str, str, str]] = [
    # ── /player: the page nothing walked ─────────────────────────────────────
    # It lived in public/ with no root counterpart, so all sixteen root-walking
    # checks missed it, and it shipped a three-tier price card on a site where
    # nothing is gated. The feature copy is real and stays; only the prices go,
    # because the features are all just here.
    ("player.html", "<b class=hd>PRO $19/MO</b>", "<b class=hd>SHAP + CLOSER FIT</b>"),
    ("player.html", "<b class=hd>AGENCY $199 10 SEATS</b>", "<b class=hd>API + WHITE-LABEL</b>"),
    ("player.html", "<div class=small>10 seats, API,", "<div class=small>API,"),
    ("player.html", ">OWNER FOR $5K</a>", ">OWNER</a>"),
    ("player.html", ">FIT CALC $19</a>", ">FIT CALC</a>"),
    ("player.html", ">BRAND W/$B</a>", ">BRAND</a>"),
    ("player.html", "<div class=hd>PRICING & PROPS HONESTY",
     "<div class=hd>WHAT IS HERE, AND WHAT IT RESTS ON"),
    # the same unsourced figure the merge commit called master out for
    ("player.html", "twin 100 purity@10 0.7057, Wemby 699 real PO mins",
     "twin 100, Wemby 699 real PO mins"),

    # ── landing: the nav literally priced the pages ──────────────────────────
    ("index.html",
     '<a class="btn btn-xl" href="/owner">Owner $5k</a>',
     '<a class="btn btn-xl" href="/owner">Owner</a>'),
    ("index.html",
     '<a class="btn" href="/brand">Brand $2k</a>',
     '<a class="btn" href="/brand">Brand</a>'),
    ("index.html",
     '<a class="btn btn-y" href="/dfs">DFS $9</a>',
     '<a class="btn btn-y" href="/dfs">DFS</a>'),
    ("index.html",
     "Four monetization towers, one map. Pick Your Edge below.",
     "Four ways into the same map. Pick Your Edge below. All of it free."),
    ("index.html", "🏆 Owner • $5k trophy", "🏆 Owner"),
    ("index.html", "📈 Brand • $2k chart", "📈 Brand"),
    ("index.html", "🎯 DFS • $9 target", "🎯 DFS"),
    ("index.html", "👟 Player • $19 sneakers", "👟 Player"),

    # The four call-to-action buttons further down priced the pages a second
    # time. Missed on the first pass because the scan that found the pills
    # deduplicated by matched text, so a repeat of "$5k" never printed — which is
    # why this file is verified by re-scanning after applying, not by trusting
    # the edit list.
    ("index.html", '>/owner $5k →</a>', '>/owner →</a>'),
    ("index.html", '>/player $19 →</a>', '>/player →</a>'),
    ("index.html", '>📈 /brand $2k →</a>', '>📈 /brand →</a>'),
    ("index.html", '>🎯 /dfs $9 →</a>', '>🎯 /dfs →</a>'),

    # ...and twice more in body copy.
    ("index.html", "ValΔ% NYK16 SAS7 $2k deck.", "ValΔ% NYK16 SAS7."),
    ("index.html", "$9 daily: 2 locks 1 fade 1 pivot", "Daily: 2 locks 1 fade 1 pivot"),
]

# Not pricing, and must survive: "Trophy wall $9.1B top" on index.html is a
# franchise valuation out of front_office.json, as are the $M and $B figures in
# the owner table. Only tier and subscription copy comes out.

for page in ("owner.html",):
    EDITS += [
        (page,
         "<title>Vector Hoops — Owner • Championship Economics $5k/$10k/$15k</title>",
         "<title>Vector Hoops — Owner • Championship Economics</title>"),
        (page,
         '<span class="pill pill-y">$5k Starter</span><span class="pill">$10k Pro</span>'
         '<span class="pill pill-o">$15k Org</span><span class="pill">Stripe mock</span>',
         '<span class="pill pill-y">Free</span><span class="pill">No account</span>'
         '<span class="pill pill-o">Every figure recomputable</span>'),
        (page,
         "Paywall $5k/$10k/$15k Owner PWA manifest+SW Stripe mock.",
         "Owner PWA manifest+SW. Free, no account."),
    ]

for page in ("brand.html",):
    EDITS.append((
        page,
        '<span class="pill pill-y">$2k CMO deck</span><span class="pill">$8k Pro</span>'
        '<span class="pill">$25k Org</span>',
        '<span class="pill pill-y">CMO deck</span><span class="pill">Free</span>'
        '<span class="pill">No account</span>',
    ))

for page in ("dfs.html",):
    EDITS.append((
        page,
        "Free 3 / Pro $9 10 / $49 API with lock/avoid tags sorting by value.",
        "Lock/avoid tags sorting by value. Free, no account, no request cap.",
    ))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only, write nothing")
    args = ap.parse_args()

    by_file: dict[str, list[tuple[str, str]]] = {}
    for name, before, after in EDITS:
        by_file.setdefault(name, []).append((before, after))

    applied = already = missing = 0
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
                print(f"  MISS  {name}: {before[:70]!r} not found and replacement absent")
                missing += 1
        if text != original and not args.check:
            path.write_bytes(text.encode("utf-8"))
            print(f"  wrote {name}")
        elif text != original:
            print(f"  would change {name}")

    print(f"\n{applied} replacement(s) {'to apply' if args.check else 'applied'}, "
          f"{already} already done, {missing} not found")
    if missing:
        print("a MISS means the copy moved — re-read the page before assuming it is clean")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

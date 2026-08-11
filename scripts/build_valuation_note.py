"""Franchise valuations are synthetic, and three pages quoted a stale one.

`assets/front_office.json` carries `valuations_meta_by_season`, and every one of
its **360 records across 12 seasons** says the same thing about itself:

    "source": "forbes_synth_estimated_for_training"

They are estimates generated to train the model, not measured franchise values.
No page said so. Three said `Trophy wall $9.1B top`, which is not the top and not
the season: for `season_focus` 2025-26 the file's largest valuation is GSW at
$10,090M.

So this does two things, both from the file:

    the figure       the largest valuation in season_focus, computed
    the disclosure   quoted from the file's own `source` field, not paraphrased

Both are stamped into the pages that show a valuation, and `check_frontend`'s
`derived` check runs this with `--check`, so neither can drift again. The numbers
are not changed — a synthetic estimate is still the best figure this repo has,
and removing it would leave the pages emptier and no more honest. It is labelled
instead, which is what the dictionary already does for the 48-d `eratwins.json`.

    python scripts/build_valuation_note.py            # write
    python scripts/build_valuation_note.py --check    # fail if stale
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "front_office.json"
PAGES = ("index.html", "brand.html", "owner.html")

MARK_OPEN = "<!-- build_valuation_note.py: start -->"
MARK_CLOSE = "<!-- build_valuation_note.py: end -->"


def facts() -> dict:
    d = json.loads(SOURCE.read_text(encoding="utf-8"))
    season = d.get("season_focus")
    meta = d.get("valuations_meta_by_season") or {}
    if season not in meta:
        sys.exit(f"front_office.json has no valuations for its own season_focus {season!r}")
    rows = meta[season]
    top_abbr = max(rows, key=lambda k: rows[k].get("valuation_m") or 0)
    top_m = rows[top_abbr]["valuation_m"]
    sources = sorted({v.get("source") for s in meta.values() for v in s.values() if v.get("source")})
    n = sum(len(s) for s in meta.values())
    return {"season": season, "abbr": top_abbr, "top_m": top_m,
            "top_b": f"{top_m / 1000:.2f}", "sources": sources,
            "records": n, "seasons": len(meta)}


def note(f: dict) -> str:
    src = ", ".join(f"<code>{s}</code>" for s in f["sources"])
    only = "every one of" if len(f["sources"]) == 1 else "the"
    return (f'{MARK_OPEN}<p class="mono" style="font-size:10.5px;line-height:1.55;'
            f'text-transform:none;letter-spacing:0;margin:8px 0 0;color:#6F6D68">'
            f'Franchise valuations on this site are <b>estimates, not measured figures</b>. '
            f'{only.capitalize()} the {f["records"]} valuation records in '
            f'<code>assets/front_office.json</code>, across {f["seasons"]} seasons, names its own '
            f'source as {src} — generated to train the model. The largest in '
            f'{f["season"]} is {f["abbr"]} at ${f["top_b"]}B; read it as the model’s number, '
            f'not the market’s.</p>{MARK_CLOSE}')


def patterns(f: dict) -> list[tuple[re.Pattern[str], str]]:
    """Anchored, never a bare number swap."""
    return [
        (re.compile(r"Trophy wall \$[\d.]+B top"), f'Trophy wall ${f["top_b"]}B top'),
        (re.compile(r"\$[\d.]+B top • [A-Z]{3} [\d.]+B"),
         f'${f["top_b"]}B top • {f["abbr"]} {f["top_b"]}B'),
    ]


def apply(text: str, f: dict) -> str:
    for rx, want in patterns(f):
        text = rx.sub(want, text)
    block = note(f)
    if MARK_OPEN in text:
        return re.sub(re.escape(MARK_OPEN) + r"[\s\S]*?" + re.escape(MARK_CLOSE),
                      lambda _: block, text)
    # First run. The anchor is the shared script tag every page carries at the
    # end of <body>: matching on a footer put the note inside index.html's MAP
    # overlay, which is pointer-events:none over a dark canvas, and owner.html
    # has no footer at all. One anchor that exists on every page beats three
    # guesses about layout.
    m = re.search(r'<script src="assets/error-boundary\.js', text)
    if not m:
        m = re.search(r"</body>", text)
    if not m:
        return text
    return text[:m.start()] + block + "\n" + text[m.start():]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report drift, write nothing")
    args = ap.parse_args()

    if not SOURCE.exists():
        print(f"  SKIP  {SOURCE.name} not present")
        return 0

    f = facts()
    stale, wrote = [], []
    for rel in PAGES:
        page = ROOT / rel
        if not page.exists():
            continue
        with open(page, encoding="utf-8", newline="") as fh:
            original = fh.read()
        text = apply(original, f)
        if text == original:
            continue
        if args.check:
            stale.append(rel)
        else:
            with open(page, "w", encoding="utf-8", newline="") as fh:
                fh.write(text)
            wrote.append(rel)

    if args.check:
        if stale:
            print(f"FAIL {', '.join(stale)} quote a stale valuation or lack the source note — "
                  f"run: python scripts/build_valuation_note.py")
            return 1
        print(f"OK {len(PAGES)} page(s) quote the top valuation in {f['season']} "
              f"(${f['top_b']}B, {f['abbr']}) and name its source")
        return 0

    print(f"top valuation in {f['season']}: {f['abbr']} ${f['top_m']:,}M = ${f['top_b']}B · "
          f"{f['records']} records over {f['seasons']} seasons · source(s) {f['sources']}")
    print(f"  {len(wrote)} page(s) updated" + (f": {', '.join(wrote)}" if wrote else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

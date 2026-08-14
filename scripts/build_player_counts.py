"""Keep the player counts on /players in step with the file they describe.

The Explorer stated **1814** in twelve places a visitor can see — the title, the
description, both social cards, the h1, the "All" button, the loading pill, the
prose, the footer note and the label on the map. The file it describes,
`assets/embedding_map_points_limited.json`, holds **1,764** usable points. The
prose said "Honest count live from file" next to a number that was frozen in the
markup, and the map label printed both at once — `dots.length` and a hardcoded
1814 — so the page disagreed with itself in public.

The current-season count, 532, was right.

Every count here is derived from the asset, so a rebuilt file either updates the
page or turns `check_frontend`'s `derived` check red. Patterns are anchored to
the sentence around them: a bare number-swap would rewrite pids, hex colours and
the 80-row cap as well.

    python scripts/build_player_counts.py --check
    python scripts/build_player_counts.py
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ("players.html", "index.html", "model.html")
ASSET = ROOT / "assets" / "embedding_map_points_limited.json"


def counts() -> tuple[int, int]:
    j = json.loads(ASSET.read_text(encoding="utf-8"))
    pts = j.get("points") or []
    usable = [p for p in pts
              if isinstance(p.get("x"), (int, float))
              and isinstance(p.get("y"), (int, float))
              and isinstance(p.get("c"), (int, float))]
    return len(usable), sum(1 for p in usable if p.get("is_current"))


def patterns(total: int, current: int) -> list[tuple[re.Pattern[str], str]]:
    """(what to find, what it should say) — anchored, never a bare number swap."""
    # Thousands separator, which this deliberately stripped. The page it writes
    # renders "1,764 players" and "1,764 of 1,764 points" from its own script, so
    # stripping it here put both spellings of one number on one screen — the
    # heading read "PLAYERS EXPLORER · 1764 FILTERED" directly above "1,764
    # players". Every string below is prose a visitor reads.
    #
    # The finders take [\d,]+ so a run over already-formatted markup still
    # matches; on \d+ alone the check read "764 players filtered" out of "1,764
    # players filtered" and reported drift against a page that was correct.
    t, c = f"{total:,}", f"{current:,}"
    return [
        (re.compile(r"Players Explorer · [\d,]+ filtered"), f"Players Explorer · {t} filtered"),
        (re.compile(r"[\d,]+ players filtered · current/all"), f"{t} players filtered · current/all"),
        (re.compile(r">All [\d,]+</button>"), f">All {t}</button>"),
        (re.compile(r">Current [\d,]+</button>"), f">Current {c}</button>"),
        (re.compile(r">loading [\d,]+ pts<"), f">loading {t} pts<"),
        (re.compile(r"Current = [\d,]+ latest seasons"), f"Current = {c} latest seasons"),
        (re.compile(r"All = [\d,]+ filtered \(current"), f"All = {t} filtered (current"),
        (re.compile(r"· [\d,]+ → 80 list subset"), f"· {t} → 80 list subset"),
        # index.html and model.html quote the same count in their own words
        (re.compile(r"[\d,]+ pts filt"), f"{t} pts filt"),
        (re.compile(r"map [\d,]+ filt"), f"map {t} filt"),
        (re.compile(r"LOD [\d,]+ vs "), f"LOD {t} vs "),
    ]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    if not ASSET.exists():
        print(f"  SKIP  {ASSET.name} not present")
        return 0

    total, current = counts()
    stale, writes = [], []
    for rel in PAGES:
        page = ROOT / rel
        if not page.exists():
            continue
        with open(page, encoding="utf-8", newline="") as fh:
            original = fh.read()
        text = original
        for rx, want in patterns(total, current):
            for m in rx.finditer(text):
                if m.group(0) != want:
                    stale.append(f"{rel}: {m.group(0)!r} should read {want!r}")
            text = rx.sub(want.replace("\\", "\\\\"), text)
        if text != original:
            writes.append((page, text))

    if stale:
        print(f"  {len(stale)} stale count(s) against {total} usable points "
              f"({current} current):")
        for s in stale[:8]:
            print(f"    {s}")
    else:
        print(f"  player counts match the file — {total} usable points, {current} current")

    if args.check:
        return 1 if stale else 0
    for page, text in writes:
        with open(page, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
        print(f"  wrote {page.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

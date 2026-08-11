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
PAGE = ROOT / "players.html"
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
    t, c = f"{total:,}".replace(",", ""), f"{current:,}".replace(",", "")
    return [
        (re.compile(r"Players Explorer · \d+ filtered"), f"Players Explorer · {t} filtered"),
        (re.compile(r"\d+ players filtered · current/all"), f"{t} players filtered · current/all"),
        (re.compile(r">All \d+</button>"), f">All {t}</button>"),
        (re.compile(r">Current \d+</button>"), f">Current {c}</button>"),
        (re.compile(r">loading \d+ pts<"), f">loading {t} pts<"),
        (re.compile(r"Current = \d+ latest seasons"), f"Current = {c} latest seasons"),
        (re.compile(r"All = \d+ filtered \(current"), f"All = {t} filtered (current"),
        (re.compile(r"· \d+ → 80 list subset"), f"· {t} → 80 list subset"),
    ]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    if not ASSET.exists() or not PAGE.exists():
        print(f"  SKIP  {ASSET.name} or {PAGE.name} not present")
        return 0

    total, current = counts()
    with open(PAGE, encoding="utf-8", newline="") as fh:
        original = fh.read()

    text, stale = original, []
    for rx, want in patterns(total, current):
        for m in rx.finditer(text):
            if m.group(0) != want:
                stale.append(f"{m.group(0)!r} should read {want!r}")
        text = rx.sub(want.replace("\\", "\\\\"), text)

    if stale:
        print(f"  {len(stale)} stale count(s) against {total} usable points "
              f"({current} current):")
        for s in stale[:8]:
            print(f"    {s}")
    else:
        print(f"  player counts match the file — {total} usable points, {current} current")

    if args.check:
        return 1 if stale else 0
    if text != original:
        with open(PAGE, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
        print(f"  wrote {PAGE.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

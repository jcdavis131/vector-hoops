"""Emit assets/front_office_lite.json — the thirteen fields the owner table reads.

/owner is about 5 KB of markup and downloads 1,127,784 bytes of
assets/front_office.json to draw a 30-row table. The table uses thirteen fields
per team. Everything else in that file — draft pick histories, foresight blocks,
cap rules, per-season valuations, the model zoo, expected-pick tables — is read
by other pages, not by this one.

That eager 1.1 MB is mine. I rebuilt the owner table earlier on this branch to
read real data instead of Math.random(), pointed it at the full file, and did not
look at what that cost. model.html got an IntersectionObserver for the same
reason and this did not.

Derived from committed data only, no network, no model, no pipeline cache. Writes
exactly one file and refuses to write a wrong-sized one.

    python scripts/build_front_office_lite.py
    python scripts/build_front_office_lite.py --check
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "front_office.json"
OUT = ROOT / "assets" / "front_office_lite.json"

# The union of what /owner and /teams read. Checked against both pages rather
# than guessed: owner's COLS touch the first fourteen, teams adds losses and
# playoff_result and reads .score off three nested blocks.
FIELDS = (
    "abbr", "name", "primary", "is_champion",
    "wins", "losses", "weighted_wins", "payroll_m",
    "w_per_m", "weighted_wpm", "po_wins_per_m",
    "valuation_m", "for_final", "for_grade", "for_rank",
    "playoff_result",
    # /player sorts its team picker by cap_pct. Without it that page had to
    # fetch the whole 1,127,784-byte front_office.json for one number.
    "cap_pct",
)

# teams.html reads r.draft.score, r.cap_efficiency.score and r.foresight.score
# through a sort accessor, so these stay nested — flattening them would mean
# editing that page's COLS for no gain.
NESTED = ("draft", "cap_efficiency", "foresight")
NESTED_KEYS = ("score", "grade")

# teams.html also reads these off the top level; method is printed verbatim there
TOP = ("season_focus", "built", "champion_map", "champion_display",
       "playoff_win_weight", "method")


def build() -> dict:
    if not SRC.exists():
        sys.exit(f"missing {SRC}")
    full = json.loads(SRC.read_text(encoding="utf-8"))
    teams = full.get("teams") or []
    if len(teams) != 30:
        sys.exit(f"expected 30 teams, found {len(teams)} — refusing to write")

    slim = []
    for t in teams:
        row = {k: t.get(k) for k in FIELDS}
        # playoff_result is "" for a team that missed, which is a real value
        missing = [k for k in FIELDS
                   if row[k] is None and k not in ("primary", "playoff_result")]
        if missing:
            sys.exit(f"{t.get('abbr')} is missing {missing} — refusing to write a table with holes")
        for block in NESTED:
            src = t.get(block)
            if not isinstance(src, dict) or src.get("score") is None:
                sys.exit(f"{t.get('abbr')}.{block} has no score — refusing to write")
            row[block] = {k: src.get(k) for k in NESTED_KEYS}
        slim.append(row)

    out = {
        "source": "assets/front_office.json → teams[], the fields /owner and /teams actually read",
        "generator": "scripts/build_front_office_lite.py",
        "note": (
            "The full file is 1,127,784 bytes and also carries draft pick histories, cap rules, "
            "per-season valuations and the model zoo, which belong to other pages. These two "
            "pages read what is here and nothing else."
        ),
        "count": len(slim),
        "teams": slim,
    }
    for k in TOP:
        if k in full:
            out[k] = full[k]
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify without writing")
    args = ap.parse_args()

    data = build()
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))

    if args.check:
        if not OUT.exists():
            print(f"FAIL {OUT.name} does not exist")
            return 1
        same = OUT.read_text(encoding="utf-8") == payload
        print(("OK   " if same else "FAIL ") + f"{OUT.name} {'matches' if same else 'is STALE'} — {data['count']} teams")
        return 0 if same else 1

    OUT.write_text(payload, encoding="utf-8")
    src_size = SRC.stat().st_size
    print(f"wrote {OUT.relative_to(ROOT)} — {data['count']} teams, {len(payload):,} bytes "
          f"(was {src_size:,}, {100 - 100 * len(payload) / src_size:.1f}% smaller)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

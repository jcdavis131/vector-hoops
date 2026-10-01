#!/usr/bin/env python3
"""Build the playoff-swings dataset: every qualifying riser/faller season.

Method (2026-10-01, final — same population as Insights card #10):
- Source: assets/playoffs.json (regular-season vs playoff per-100 splits,
  stats.nba.com), 1996-97 -> 2025-26.
- Established-scorer gate: RS GP >= 40, RS PTS100 >= 28, PO GP >= 8,
  PO usage >= 18. 334 player-seasons qualify.
- Delta = PO PTS100 - RS PTS100 (per-100 scoring-rate swing).
- Names are display-fixed (Jermaine O'Neal, not Jermaine ONeal) so the
  Players directory can match them to vectors.json rows.

Output: assets/playoff-swings.json (mirrored root/public), sorted by
season then player. Byte-identical on re-run.

Hard-block QA: exactly 334 rows, top/bottom rows match the published
insight card (Mitchell +8.6, Embiid -14.6), every name normalizes to a
vectors.json player name.
"""

import json
import os
import re
import unicodedata

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(REPO, "public")

NAME_FIXES = {
    "Shai GilgeousAlexander": "Shai Gilgeous-Alexander",
    "KarlAnthony Towns": "Karl-Anthony Towns",
    "Michael CarterWilliams": "Michael Carter-Williams",
    "Shaquille ONeal": "Shaquille O'Neal",
    "Jermaine ONeal": "Jermaine O'Neal",
    "Royce ONeale": "Royce O'Neale",
    "Nikola Jokic": "Nikola Jokić",
    "Luka Doncic": "Luka Dončić",
}


def load(name):
    with open(os.path.join(REPO, "assets", name), encoding="utf-8") as f:
        return json.load(f)


def norm(name):
    folded = unicodedata.normalize("NFD", name)
    folded = "".join(c for c in folded if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", folded.lower())


def main():
    playoffs = load("playoffs.json")
    vectors = load("vectors.json")
    known = {norm(p["name"]) for p in vectors["players"]}

    rows = []
    for key, s in playoffs["splits"].items():
        name, season = key.rsplit("|", 1)
        po, rs = s["po"], s["rs"]
        if not (
            rs["GP"] >= 40
            and rs["PTS100"] >= 28
            and po["GP"] >= 8
            and po.get("USG", 0) >= 18
        ):
            continue
        display = NAME_FIXES.get(name, name)
        rows.append(
            {
                "player": display,
                "season": season,
                "rs_pts100": round(rs["PTS100"], 1),
                "po_pts100": round(po["PTS100"], 1),
                "delta": round(po["PTS100"] - rs["PTS100"], 1),
                "po_gp": po["GP"],
            }
        )

    # Hard-block QA
    assert len(rows) == 334, f"expected 334 qualifying seasons, got {len(rows)}"
    by_delta = sorted(rows, key=lambda r: -r["delta"])
    top, bottom = by_delta[0], by_delta[-1]
    assert (top["player"], top["season"], top["delta"]) == (
        "Donovan Mitchell",
        "2024-25",
        8.6,
    ), f"top row drifted: {top}"
    assert (bottom["player"], bottom["season"], bottom["delta"]) == (
        "Joel Embiid",
        "2022-23",
        -14.6,
    ), f"bottom row drifted: {bottom}"
    missing = [r["player"] for r in rows if norm(r["player"]) not in known]
    assert not missing, f"names missing from vectors.json: {missing[:5]}"

    rows.sort(key=lambda r: (r["season"], r["player"]))
    payload = {
        "built": "2026-10-01",
        "note": "Playoff scoring-rate swings (PO PTS100 - RS PTS100) for "
        "established scorers. Same population as Insights card #10.",
        "count": len(rows),
        "rows": rows,
    }
    text = json.dumps(payload, indent=1, ensure_ascii=False) + "\n"
    for base in (REPO, PUBLIC):
        path = os.path.join(base, "assets", "playoff-swings.json")
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
    print(f"wrote assets/playoff-swings.json ({len(rows)} rows, mirrored)")


if __name__ == "__main__":
    main()

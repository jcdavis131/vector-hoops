"""Carry the site's display fields from the previous vectors.json into a rebuilt one.

build_vectors.py writes the names the dashbase caches were saved under, so a
rebuild drops the 275 suffix names d2a16d37 restored by hand ('Tim Hardaway
Jr.' becomes 'Tim Hardaway'), and it does not write the slug `person_id` the
July export carried. Run after enrich_vectors.py (which writes the position
code `p` that players-directory.js, players-skills.js and archetype-bridge.js
read), this puts the names and `person_id` back, matched on (season, id), the
row key both files share, and fills `p` only on a row enrich left without one.
Nothing else is touched.

A name is carried only when the rebuilt name is the previous one without a
generational suffix, so a real rename in the caches is never overwritten; any
other mismatch is counted and left as rebuilt. Rows with no match keep the
rebuilt values and no `p` / `person_id`.

    python pipeline/carry_display_fields.py --from <previous vectors.json>
    git show HEAD:assets/vectors.json > /tmp/prev.json && python pipeline/carry_display_fields.py --from /tmp/prev.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VECTORS = ROOT / "assets" / "vectors.json"
SUFFIX = re.compile(r"\s+(Jr\.?|Sr\.?|II|III|IV|V)$")
CARRIED = ("person_id",)


def carry(new: dict, prev: dict) -> dict:
    by_key = {(p["season"], p["id"]): p for p in prev["players"]}
    stats = {"rows": 0, "matched": 0, "names_restored": 0, "names_kept_rebuilt": 0, "unmatched": 0}
    for row in new["players"]:
        stats["rows"] += 1
        old = by_key.get((row["season"], row["id"]))
        if old is None:
            stats["unmatched"] += 1
            continue
        stats["matched"] += 1
        if old["name"] != row["name"]:
            if SUFFIX.sub("", old["name"]) == row["name"]:
                row["name"] = old["name"]
                stats["names_restored"] += 1
            else:
                stats["names_kept_rebuilt"] += 1
        for k in CARRIED:
            if k in old:
                row[k] = old[k]
        if "p" not in row and "p" in old:
            row["p"] = old["p"]
            stats["p_filled"] = stats.get("p_filled", 0) + 1
    return stats


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--from", dest="prev", required=True, type=Path, help="the previous vectors.json")
    ap.add_argument("--vectors", type=Path, default=VECTORS, help="the rebuilt vectors.json, rewritten in place")
    args = ap.parse_args()
    new = json.loads(args.vectors.read_text(encoding="utf-8"))
    prev = json.loads(args.prev.read_text(encoding="utf-8"))
    stats = carry(new, prev)
    # The bytes build_vectors.py writes: compact separators, ASCII escapes, no trailing newline.
    args.vectors.write_text(json.dumps(new, separators=(",", ":")), encoding="utf-8")
    print("carry_display_fields: " + ", ".join(f"{k} {v}" for k, v in stats.items()))
    return 0 if stats["unmatched"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

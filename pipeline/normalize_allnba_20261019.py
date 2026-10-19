"""One-off migration (panel v3 G3, 2026-10-19): normalize All-NBA team tiers.

The honors cache assigned team tiers (3/2/1) beyond the real 15 All-NBA
slots to players who merely received votes, which made dossier badges
claim impossible counts ("24x All-NBA" for Curry's 11 real selections).

This applies pipeline.build_honors.normalize_allnba_teams to the two
committed data files that carry per-season honors:
  - assets/honors.json            (bySeason)
  - assets/player_meta.json       (honors)

Idempotent: re-running zeroes nothing new. Run from the repo root.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
from build_honors import normalize_allnba_teams  # noqa: E402

NEW_NOTE = (
    "All-NBA team tiers are the real 15 slots per season "
    "(3 = 1st team, 2 = 2nd, 1 = 3rd: the 5 highest "
    "vote-getters per tier); vote-receivers outside the "
    "slots are tier 0. "
    "Same-season keys for UI include Finals MVP when "
    "honors_finals_mvp.json is present. Lagged HON_* in pipeline/data."
)


def main():
    total = 0
    # assets/honors.json -> bySeason
    p = ROOT / "assets" / "honors.json"
    doc = json.loads(p.read_text(encoding="utf-8"))
    z = normalize_allnba_teams(doc["bySeason"])
    doc["note"] = NEW_NOTE
    doc["built"] = "2026-10-19"
    p.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    print(f"honors.json: {z} rows zeroed")
    total += z

    # assets/player_meta.json -> honors
    p = ROOT / "assets" / "player_meta.json"
    doc = json.loads(p.read_text(encoding="utf-8"))
    z = normalize_allnba_teams(doc["honors"])
    doc["built"] = "2026-10-19"
    p.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    print(f"player_meta.json: {z} rows zeroed")
    total += z

    print(f"total rows zeroed: {total}")


if __name__ == "__main__":
    main()

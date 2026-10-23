#!/usr/bin/env python3
"""Build the slim player index for the players.html Directory tab.

The directory only needs name/season/position/archetype per player-season to
render its alphabetical list and filters — not the 14-d stat vectors, PCA
projection, or feature metadata that make assets/vectors.json 4.1 MB.
This emits assets/player_directory_index.json (~0.4 MB, 10x smaller) so the Directory
tab never waits on the full vectors file; profile/leaderboard tabs still
fetch vectors.json on first need (see assets/players-skills.js bootSkills).

Run: python3 scripts/build_player_index.py. Stdlib only.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    with open(ROOT / "assets" / "vectors.json", encoding="utf-8") as f:
        v = json.load(f)
    slim = {
        "built": v.get("built", ""),
        "players": [
            [p["name"], p["season"], p.get("p"), p.get("c")]
            for p in v["players"]
        ],
        "clusters": v["clusters"],
    }
    out = ROOT / "assets" / "player_directory_index.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(slim, f, separators=(",", ":"), ensure_ascii=False)
    print("wrote %s — %d bytes (%d player-seasons)" % (
        out.relative_to(ROOT), out.stat().st_size, len(slim["players"])))


if __name__ == "__main__":
    main()

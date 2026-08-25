"""Emit assets/vectors_map_lite.json: the sampled 3D point cloud shared-map.js
renders (every 3rd row of vectors_search_lite.json, xyz quantized to 2 dp).

Each row carries its global row id `i` explicitly. The original hand-built
asset omitted `i`, so shared-map.js fell back to baseI[i]=i (local index) and
every id-based lookup — hover names, guess rings, the target bullseye for
ids < 4322 — pointed at the wrong player. Rerun whenever
vectors_search_lite.json changes.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
STRIDE = 3  # keeps the map at ~4.3k dots — same visual density the page shipped with


def main():
    lite = json.loads((ASSETS / "vectors_search_lite.json").read_text(encoding="utf-8"))
    players = lite["players"] if isinstance(lite, dict) else lite

    rows = [
        {
            "i": p["i"],
            "x": round(p["x"], 2),
            "y": round(p["y"], 2),
            "z": round(p["z"], 2),
            "c": p["c"],
        }
        for p in players[::STRIDE]
    ]

    out = ASSETS / "vectors_map_lite.json"
    out.write_text(
        json.dumps({"players": rows}, separators=(",", ":")), encoding="utf-8"
    )
    print(
        f"map_lite: {len(rows)} rows (stride {STRIDE} of {len(players)}), {out.stat().st_size} bytes"
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Precompute named concept axes for the atlas axis picker.

The atlas plots PCA(x, y) of 14 era-normalised per-100 z-scored features.
This script derives a handful of plain-words concept scores (weighted
combinations of those same z-scored features) so the atlas can offer
reader-named axes -- "closeness depends on what you asked" -- without
loading the full 4.1 MB vectors.json on the homepage.

Output: assets/atlas-concepts.json
  {
    "built": "YYYY-MM-DD",
    "source": "assets/vectors.json",
    "scale": 25,                      # byte = clamp(round(score*25), -127, 127)
    "order": "vectors.json players[] index; index-aligned with vectors_search_lite.json",
    "concepts": [{"id","name","lo","hi","formula","weights"}],
    "minmax": {"<id>": [lo, hi]},     # raw score range, for 0..1 normalisation
    "data": "<base64>"                # row-major int8, [player][concept]
  }

Row i of `data` belongs to players[i] of vectors.json (same order as the
atlas lite file). The mapping id -> formula is recorded here and in the
JSON so the numbers are never a black box.
"""

from __future__ import annotations

import base64
import datetime
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VECTORS = ROOT / "assets" / "vectors.json"
OUT = ROOT / "assets" / "atlas-concepts.json"
SCALE = 25

# Feature index in vectors.json `features`:
# PTS AST OREB DREB STL BLK TOV FG3A FGA FTA FG3_PCT FG_PCT FT_PCT PLUS_MINUS
CONCEPTS = [
    {
        "id": "scoring",
        "name": "Scoring load",
        "lo": "low-usage role players",
        "hi": "high-usage scorers",
        "formula": "0.5*PTS + 0.3*FGA + 0.2*FTA",
        "weights": {"PTS": 0.5, "FGA": 0.3, "FTA": 0.2},
    },
    {
        "id": "playmaking",
        "name": "Playmaking",
        "lo": "off-ball finishers",
        "hi": "on-ball creators",
        "formula": "0.6*AST + 0.25*STL - 0.15*TOV",
        "weights": {"AST": 0.6, "STL": 0.25, "TOV": -0.15},
    },
    {
        "id": "glass",
        "name": "Glass work",
        "lo": "perimeter floaters",
        "hi": "board crashers",
        "formula": "0.5*OREB + 0.5*DREB",
        "weights": {"OREB": 0.5, "DREB": 0.5},
    },
    {
        "id": "rimprot",
        "name": "Rim protection",
        "lo": "no contests",
        "hi": "shot blockers",
        "formula": "BLK",
        "weights": {"BLK": 1.0},
    },
    {
        "id": "threevol",
        "name": "Three-point volume",
        "lo": "never shoots them",
        "hi": "launches them",
        "formula": "FG3A",
        "weights": {"FG3A": 1.0},
    },
    {
        "id": "threeacc",
        "name": "Three-point accuracy",
        "lo": "cold from deep",
        "hi": "snipers",
        "formula": "FG3_PCT",
        "weights": {"FG3_PCT": 1.0},
    },
    {
        "id": "rimpress",
        "name": "Rim pressure",
        "lo": "settles for jumpers",
        "hi": "lives at the line",
        "formula": "0.6*FTA + 0.4*FG_PCT",
        "weights": {"FTA": 0.6, "FG_PCT": 0.4},
    },
    {
        "id": "defense",
        "name": "Defensive disruption",
        "lo": "quiet",
        "hi": "havoc",
        "formula": "0.5*STL + 0.5*BLK",
        "weights": {"STL": 0.5, "BLK": 0.5},
    },
]


def main() -> None:
    doc = json.loads(VECTORS.read_text())
    features: list[str] = doc["features"]
    players: list[dict] = doc["players"]
    n = len(players)

    # Resolve each concept's weight vector once, in feature order.
    wvecs: list[list[float]] = []
    for c in CONCEPTS:
        wvecs.append([c["weights"].get(f, 0.0) for f in features])

    raw = bytearray(n * len(CONCEPTS))
    minmax: dict[str, list[float]] = {c["id"]: [1e9, -1e9] for c in CONCEPTS}
    for i, p in enumerate(players):
        v: list[float] = p["v"]
        for k, w in enumerate(wvecs):
            s = sum(wi * vi for wi, vi in zip(w, v))
            cid = CONCEPTS[k]["id"]
            lo, hi = minmax[cid]
            minmax[cid] = [min(lo, s), max(hi, s)]
            q = max(-127, min(127, round(s * SCALE)))
            raw[i * len(CONCEPTS) + k] = q & 0xFF

    payload = {
        "built": datetime.date.today().isoformat(),
        "source": "assets/vectors.json",
        "scale": SCALE,
        "order": "vectors.json players[] index; index-aligned with vectors_search_lite.json",
        "concepts": [
            {
                "id": c["id"],
                "name": c["name"],
                "lo": c["lo"],
                "hi": c["hi"],
                "formula": c["formula"],
            }
            for c in CONCEPTS
        ],
        "minmax": {cid: [round(lo, 4), round(hi, 4)] for cid, (lo, hi) in minmax.items()},
        "data": base64.b64encode(bytes(raw)).decode("ascii"),
    }
    OUT.write_text(json.dumps(payload, separators=(",", ":")))
    kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT}  {n} players x {len(CONCEPTS)} concepts  {kb:.1f} KiB")


if __name__ == "__main__":
    sys.exit(main())

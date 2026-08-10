"""Emit assets/game_vectors.json — the pool play.html should be scoring against.

play.html currently scores every guess with a hand-written table:

    POOL   = 10 past players,   v:[0.92,0.11,0.18]
    MODERN = 8 modern players,  same 3-value shape
    function cos(a,b){ ... for(let i=0;i<3;i++) ... }

Three numbers, eighteen players. Meanwhile assets/vectors.json carries the real
**14-dimension frozen game contract** for all 12,966 charted player-seasons —
the vector docs/HANDOFF.md says the game is supposed to ship, and which it
never loads. (Not the 64-d MTNN embedding: that lives in mtnn_embeddings.f32
and promotion of it into the game is a separate gated decision. This script
does not touch that question.)

The pool is chosen from data, not taste:

  past    a season with an All-Star or All-NBA honour in assets/honors.json
  modern  a recent season over a minutes floor, so guesses are nameable

Ids are `vectors.json` row indices, unchanged, so an existing ?pack= link keeps
resolving to the same rows.

Reads only committed files. No network, no model, no pipeline cache. Writes
exactly one file.

    python scripts/build_game_vectors.py
    python scripts/build_game_vectors.py --check
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VECTORS = ROOT / "assets" / "vectors.json"
HONORS = ROOT / "assets" / "honors.json"
OUT = ROOT / "assets" / "game_vectors.json"

MODERN_FROM = 2022      # season start year counted as "modern" for the guess pool
MODERN_MIN_MPG = 28.0
MODERN_MIN_GP = 45
PAST_MIN_MPG = 24.0     # an All-Star who barely played is still a bad puzzle
PAST_MIN_GP = 40
VEC_DP = 3              # 14 values per row; 3 dp keeps cosine stable and the file small


def season_start(season: str) -> int:
    try:
        return int(str(season)[:4])
    except (TypeError, ValueError):
        return 0


def load() -> tuple[list[dict], dict]:
    if not VECTORS.exists():
        sys.exit(f"missing {VECTORS}")
    rows = json.loads(VECTORS.read_text(encoding="utf-8")).get("players") or []
    if not rows:
        sys.exit("vectors.json has no players")
    honors = {}
    if HONORS.exists():
        honors = json.loads(HONORS.read_text(encoding="utf-8")).get("bySeason") or {}
    return rows, honors


def build() -> dict:
    rows, honors = load()
    dim = len(rows[0].get("v") or [])
    if not dim:
        sys.exit("vectors.json rows carry no v")

    past, modern = [], []
    for i, r in enumerate(rows):
        v = r.get("v")
        if not v or len(v) != dim:
            continue  # a ragged row would silently skew every cosine against it
        name, season = r.get("name"), r.get("season")
        if not name or not season:
            continue
        entry = {
            "i": r.get("id", i),
            "n": name,
            "s": season,
            "v": [round(float(x), VEC_DP) for x in v],
        }
        h = honors.get(f"{name}|{season}") or {}
        starred = bool(h.get("asg")) or bool(h.get("allNbaTeam")) or bool(h.get("finalsMvp"))
        yr = season_start(season)
        if starred and (r.get("mpg") or 0) >= PAST_MIN_MPG and (r.get("gp") or 0) >= PAST_MIN_GP:
            past.append(entry)
        if yr >= MODERN_FROM and (r.get("mpg") or 0) >= MODERN_MIN_MPG and (r.get("gp") or 0) >= MODERN_MIN_GP:
            modern.append(entry)

    return {
        "built_from": "assets/vectors.json (frozen 14-d game contract) + assets/honors.json",
        "generator": "scripts/build_game_vectors.py",
        "note": (
            "Real era-z vectors, not the 3-value placeholders play.html shipped. "
            "This is the transparent 14-d game contract, NOT the 64-d MTNN embedding — "
            "promoting that into the game is a separate gated decision."
        ),
        "dim": dim,
        "criteria": {
            "past": f"All-Star / All-NBA / Finals MVP season with mpg>={PAST_MIN_MPG}, gp>={PAST_MIN_GP}",
            "modern": f"season starting {MODERN_FROM} or later with mpg>={MODERN_MIN_MPG}, gp>={MODERN_MIN_GP}",
        },
        "ids": "row index into assets/vectors.json — existing ?pack= links keep resolving",
        "counts": {"past": len(past), "modern": len(modern)},
        "past": past,
        "modern": modern,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify the shipped file matches")
    args = ap.parse_args()

    data = build()
    if not data["past"] or not data["modern"]:
        sys.exit(f"refusing to write an unplayable pool: {data['counts']}")
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))

    if args.check:
        if not OUT.exists():
            print(f"FAIL {OUT.name} does not exist")
            return 1
        same = OUT.read_text(encoding="utf-8") == payload
        print(("OK   " if same else "FAIL ") + f"{OUT.name} {'matches' if same else 'is STALE'} — {data['counts']}")
        return 0 if same else 1

    OUT.write_text(payload, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} — {data['counts']}, dim {data['dim']}, {len(payload):,} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

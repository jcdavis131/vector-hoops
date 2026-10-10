"""Track L deriver — video-game scout ratings joined to charted player-seasons.

Maps 2K-style attribute snapshots to (name, season) rows. Masked when no
release aligns with the NBA season or the player is absent from the roster.

Outputs:
  pipeline/data/game_ratings.json
  assets/game_ratings.json (only when cache complete)

With no real release cache (and no --fixture) the output is an explicit
"source unavailable" doc with no rows, which integrate_context reads as a
missing family. It used to be the 2-row example fixture [ingest#5].

Run:  python pipeline/build_game_ratings.py [--fixture]
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from _out_root import add_out_root, rerooted
from name_utils import norm_name

ROOT = Path(__file__).resolve().parents[1]
VECTORS = ROOT / "assets" / "vectors.json"
CACHE_DIR = ROOT / "pipeline" / "cache"
FIXTURE = CACHE_DIR / "game_ratings.example.json"
OUT = ROOT / "pipeline" / "data" / "game_ratings.json"
ASSET_OUT = ROOT / "assets" / "game_ratings.json"

ATTR_KEYS = (
    "overall",
    "three_pt",
    "mid_range",
    "close_shot",
    "ball_handle",
    "pass_accuracy",
    "perimeter_def",
    "interior_def",
    "steal",
    "block",
    "off_rebound",
    "def_rebound",
    "speed",
    "strength",
)
GAME_PREFIX = "GK_"


def real_release_caches() -> list[Path]:
    """Release caches that are not the example fixture or a byte copy of it.

    `fetch_2k_ratings.py --offline` used to copy the fixture to
    game_ratings_2k25.json byte for byte, so a name check alone would read that
    copy as a real release.
    """
    fixture_bytes = FIXTURE.read_bytes() if FIXTURE.exists() else None
    return [
        p
        for p in sorted(CACHE_DIR.glob("game_ratings_*.json"))
        if p.name != FIXTURE.name and p.read_bytes() != fixture_bytes
    ]


def load_cache(use_fixture: bool) -> tuple[dict, str, bool] | None:
    """(norm_name -> record, nba_season, complete), or None when no real release cache exists.

    None is the "source unavailable" outcome. This used to fall back to
    game_ratings.example.json, and since integrate_context runs this builder
    on every prepare (the herdmux climb's included), its two hand-entered rows
    were rewritten into pipeline/data/game_ratings.json each time [ingest#5].
    """
    if use_fixture:
        if not FIXTURE.exists():
            raise SystemExit(f"--fixture: no fixture at {FIXTURE}")
        path = FIXTURE
    else:
        paths = real_release_caches()
        if not paths:
            return None
        path = paths[-1]
    doc = json.loads(path.read_text(encoding="utf-8"))
    by_name: dict[str, dict] = {}
    for p in doc.get("players", []):
        by_name.setdefault(norm_name(p["norm_name"]), p)  # stored key, keyed again (name_utils)
    return by_name, str(doc.get("nba_season", "")), bool(doc.get("complete"))


def main() -> None:
    global OUT, ASSET_OUT
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixture", action="store_true")
    add_out_root(ap)
    args = ap.parse_args()
    OUT = rerooted(OUT, args.out_root)
    ASSET_OUT = rerooted(ASSET_OUT, args.out_root)

    loaded = load_cache(args.fixture)
    built = time.strftime("%Y-%m-%d %H:%M")
    if loaded is None:
        why = (
            f"no real {CACHE_DIR.name}/game_ratings_<release>.json (only the example fixture or a byte copy of it); "
            "an operator scrape is the only source"
        )
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(
            json.dumps(
                {"built": built, "season": None, "complete": False, "source_unavailable": why, "players": []},
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"game_ratings: source unavailable, 0 rows ({why}); {ASSET_OUT.name} NOT written")
        return
    ratings, cache_season, complete = loaded
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))

    rows = []
    covered = 0
    for p in vec["players"]:
        name, season = p["name"], p["season"]
        if season != cache_season:
            continue
        rec = ratings.get(norm_name(name))
        if not rec:
            continue
        covered += 1
        row = {"name": name, "season": season}
        for k in ATTR_KEYS:
            # An attribute the release does not list is missing, not a 0 rating.
            v = rec.get(k)
            row[f"{GAME_PREFIX}{k.upper()}"] = float(v) if v is not None else None
        rows.append(row)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "built": built,
                "season": cache_season,
                "complete": complete,
                "players": rows,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    asset_msg = ""
    if complete and rows:
        ASSET_OUT.parent.mkdir(parents=True, exist_ok=True)
        ASSET_OUT.write_text(
            json.dumps(
                {"built": built, "season": cache_season, "players": rows},
                separators=(",", ":"),
            ),
            encoding="utf-8",
        )
        asset_msg = f" + {ASSET_OUT.name}"
    else:
        asset_msg = f"; {ASSET_OUT.name} NOT written (partial cache)"

    print(f"game_ratings: {covered} rows for season {cache_season} (complete={complete}){asset_msg}")


if __name__ == "__main__":
    main()

"""Track L deriver — video-game scout ratings joined to charted player-seasons.

Maps 2K-style attribute snapshots to (name, season) rows. Masked when no
release aligns with the NBA season or the player is absent from the roster.

Outputs:
  pipeline/data/game_ratings.json
  assets/game_ratings.json (only when cache complete)

Run:  python pipeline/build_game_ratings.py [--fixture]
"""

from __future__ import annotations

import argparse
import json
import re
import time
import unicodedata
from pathlib import Path

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


def norm_name(name: str) -> str:
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[.'’-]", "", s.lower())
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    return re.sub(r"\s+", " ", s)


def load_cache(use_fixture: bool) -> tuple[dict, str, bool]:
    paths = sorted(CACHE_DIR.glob("game_ratings_*.json"))
    paths = [p for p in paths if p.name != "game_ratings.example.json"]
    if paths and not use_fixture:
        doc = json.loads(paths[-1].read_text(encoding="utf-8"))
        by_name = {p["norm_name"]: p for p in doc.get("players", [])}
        return by_name, str(doc.get("nba_season", "")), bool(doc.get("complete"))
    if not FIXTURE.exists():
        raise SystemExit(f"no game_ratings cache and no fixture at {FIXTURE}")
    doc = json.loads(FIXTURE.read_text(encoding="utf-8"))
    by_name = {p["norm_name"]: p for p in doc.get("players", [])}
    return by_name, str(doc.get("nba_season", "")), bool(doc.get("complete"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixture", action="store_true")
    args = ap.parse_args()

    ratings, cache_season, complete = load_cache(args.fixture)
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    built = time.strftime("%Y-%m-%d %H:%M")

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
            row[f"{GAME_PREFIX}{k.upper()}"] = float(rec.get(k, 0))
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

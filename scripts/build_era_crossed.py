"""Build the Era Crossed quiz data from the shipped era-twin candidates.

Reads only committed files (no network, no models):
  assets/eratwins.json   1,313 careers with top-5 other-decade twin
                         candidates by 64-d MTNN embedding cosine.

Writes:
  assets/era-crossed-games/gNNN.json   per-game subsets, 10 rounds each
                         (the last game carries the remainder; the page
                         shuffles and deals 10). Only ONE game file (~3.5KB)
                         downloads per visit instead of the whole 459KB pool.

Each round: an anchor career (name/season/decade/archetype) and 4 options —
the true closest twin plus 3 distractors drawn from the same shipped top-5
candidate list, shuffled at build time. Distractors are real near-twins, so
the quiz is genuinely hard and every option is honest data. Similarities
ship so the reveal can show how close each option really was.

The page (play/era-crossed.html) hardcodes GAME_COUNT; --check verifies the
page's constant matches the number of game files written, so a rebuild that
changes the pool cannot silently desync the client.

    python scripts/build_era_crossed.py
    python scripts/build_era_crossed.py --check   # verify shipped files
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IN = ROOT / "assets" / "eratwins.json"
OUT_DIR = ROOT / "assets" / "era-crossed-games"
PAGE = ROOT / "play" / "era-crossed.html"

SEED = 20261020
N_OPTIONS = 4
ROUNDS_PER_GAME = 10


def build_rounds() -> list[dict]:
    src = json.loads(IN.read_text())
    rng = random.Random(SEED)
    rounds = []
    skipped = 0
    for p in src["players"]:
        top5 = p.get("top5", [])
        twin = p.get("twin", {})
        if len(top5) < N_OPTIONS:
            skipped += 1
            continue
        # The true twin must be top5[0]; guard the contract explicitly.
        if not twin or twin.get("name") != top5[0].get("name"):
            skipped += 1
            continue
        distractors = rng.sample(top5[1:], N_OPTIONS - 1)
        options = [{"n": twin["name"], "s": twin["season"], "sim": round(float(top5[0]["sim"]), 3), "correct": True}]
        for d in distractors:
            options.append({"n": d["name"], "s": d["season"], "sim": round(float(d["sim"]), 3), "correct": False})
        rng.shuffle(options)
        rounds.append(
            {
                "a": p["name"],  # anchor name
                "s": p["season"],  # anchor signature season
                "d": p.get("decade"),  # anchor decade
                "arc": p.get("archetype"),  # anchor archetype
                "o": options,  # 4 options, shuffled
            }
        )
    # Shuffle round order deterministically, then deal into games of 10.
    rng.shuffle(rounds)
    return rounds, skipped


def game_name(i: int) -> str:
    return f"g{i + 1:03d}.json"


def page_game_count() -> int | None:
    m = re.search(r"var GAME_COUNT\s*=\s*(\d+)", PAGE.read_text())
    return int(m.group(1)) if m else None


def build() -> dict:
    rounds, skipped = build_rounds()
    # Deal into games of ROUNDS_PER_GAME; any remainder folds into the last
    # game (the client shuffles and takes 10), so every game plays a full 10.
    n_full = len(rounds) // ROUNDS_PER_GAME
    games = [rounds[i * ROUNDS_PER_GAME : (i + 1) * ROUNDS_PER_GAME] for i in range(n_full - 1)]
    games.append(rounds[(n_full - 1) * ROUNDS_PER_GAME :])
    return {
        "built": "2026-10-20",
        "lineage": {
            "source": "assets/eratwins.json",
            "method": "twin = nearest other-decade career by 64-d MTNN "
            "embedding cosine; distractors = 3 of the other 4 "
            "shipped top-5 candidates; options shuffled with "
            "seed 20261020; rounds shuffled and dealt into "
            f"{ROUNDS_PER_GAME}-round games",
            "n_rounds": len(rounds),
            "n_games": len(games),
            "skipped": skipped,
            "note": "Similarity shown on reveal is embedding cosine x 100, not a percentage of anything.",
        },
        "games": games,
    }


def write_all(doc: dict) -> list[Path]:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = []
    for i, game in enumerate(doc["games"]):
        blob = json.dumps({"game": i + 1, "rounds": game}, separators=(",", ":"), ensure_ascii=False).encode()
        out = OUT_DIR / game_name(i)
        out.write_bytes(blob)
        written.append(out)
    return written


def check(doc: dict) -> int:
    games = doc["games"]
    if not OUT_DIR.is_dir():
        print(f"FAIL: {OUT_DIR.name}/ missing")
        return 1
    ok = True
    for i, game in enumerate(games):
        blob = json.dumps({"game": i + 1, "rounds": game}, separators=(",", ":"), ensure_ascii=False).encode()
        f = OUT_DIR / game_name(i)
        if not f.exists():
            print(f"FAIL: {f.name} missing")
            ok = False
        elif hashlib.sha256(f.read_bytes()).digest() != hashlib.sha256(blob).digest():
            print(f"FAIL: {f.name} differs from fresh build")
            ok = False
    extras = sorted(p.name for p in OUT_DIR.glob("g*.json") if p.name > game_name(len(games) - 1))
    if extras:
        print(f"FAIL: stale game files: {extras}")
        ok = False
    want = len(games)
    got = page_game_count()
    if got != want:
        print(f"FAIL: page GAME_COUNT={got}, built {want} games")
        ok = False
    # Every pool round must be dealt exactly once across the game files.
    seen = [r["a"] for g in games for r in g]
    if len(seen) != len(set(seen)) or len(seen) != doc["lineage"]["n_rounds"]:
        print("FAIL: rounds not dealt exactly once")
        ok = False
    if ok:
        print(f"OK: {want} game files, {doc['lineage']['n_rounds']} rounds, GAME_COUNT in sync")
        return 0
    return 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify the shipped files match a fresh build")
    args = ap.parse_args()
    doc = build()
    if args.check:
        return check(doc)
    written = write_all(doc)
    total = sum(p.stat().st_size for p in written)
    print(f"wrote {len(written)} game files ({total} bytes, {doc['lineage']['n_rounds']} rounds)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Build the Era Crossed quiz data from the shipped era-twin candidates.

Reads only committed files (no network, no models):
  assets/eratwins.json   1,313 careers with top-5 other-decade twin
                         candidates by 64-d MTNN embedding cosine.

Writes:
  assets/era-crossed-quiz.json   compact per-round quiz items.

Each round: an anchor career (name/season/decade/archetype) and 4 options —
the true closest twin plus 3 distractors drawn from the same shipped top-5
candidate list, shuffled at build time. Distractors are real near-twins, so
the quiz is genuinely hard and every option is honest data. Similarities
ship so the reveal can show how close each option really was.

    python scripts/build_era_crossed.py
    python scripts/build_era_crossed.py --check   # verify shipped file
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IN = ROOT / "assets" / "eratwins.json"
OUT = ROOT / "assets" / "era-crossed-quiz.json"

SEED = 20261020
N_OPTIONS = 4


def build() -> dict:
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
    # Shuffle round order deterministically; the client reshuffles per game.
    rng.shuffle(rounds)
    return {
        "built": "2026-10-20",
        "lineage": {
            "source": "assets/eratwins.json",
            "method": "twin = nearest other-decade career by 64-d MTNN "
            "embedding cosine; distractors = 3 of the other 4 "
            "shipped top-5 candidates; options shuffled with "
            "seed 20261020",
            "n_rounds": len(rounds),
            "skipped": skipped,
            "note": "Similarity shown on reveal is embedding cosine x 100, not a percentage of anything.",
        },
        "rounds": rounds,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify the shipped file matches a fresh build")
    args = ap.parse_args()
    doc = build()
    blob = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode()
    if args.check:
        if not OUT.exists():
            print(f"FAIL: {OUT.name} missing")
            return 1
        if hashlib.sha256(OUT.read_bytes()).digest() != hashlib.sha256(blob).digest():
            print(f"FAIL: {OUT.name} differs from fresh build")
            return 1
        print(f"OK: {OUT.name} ({len(doc['rounds'])} rounds)")
        return 0
    OUT.write_bytes(blob)
    print(f"wrote {OUT.name} ({OUT.stat().st_size} bytes, {len(doc['rounds'])} rounds)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

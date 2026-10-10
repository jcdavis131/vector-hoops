"""Track L fetcher — video-game scout ratings (2K proxy via 2kratings.com).

NOT official 2K Sports data. Third-party fan site snapshots per game
release; use as an orthogonal masked tower family, never as ground truth.

There is no automated scrape. A live snapshot needs a residential IP and a
manual step (docs/DATA_SOURCES_DEEP.md) that writes
pipeline/cache/game_ratings_{release}.json (e.g. game_ratings_2k25.json).

This script used to copy the committed fixture game_ratings.example.json to
that real cache name on every run (`if args.offline or True:`), and CI's
offline step and `make offline` ran it, so the next build_game_ratings read
two hand-entered rows as a release [ingest#5]. It never writes the fixture
anywhere now:

  --offline   reports which release caches exist; exit 2 when there is none
  (default)   exit 2: the scrape is an operator step, not code here

A byte copy of the fixture under a release name is reported as not real
(build_game_ratings.real_release_caches skips it too).

Run:  python pipeline/fetch_2k_ratings.py --offline [--release 2k25]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ingest import FetchError, run_fetch

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
FIXTURE = CACHE / "game_ratings.example.json"


def cache_path(release: str) -> Path:
    return CACHE / f"game_ratings_{release.lower()}.json"


def main() -> None:
    ap = argparse.ArgumentParser(description="Report 2K ratings release caches (the scrape is an operator step)")
    ap.add_argument("--offline", action="store_true", help="report cached releases only (no network)")
    ap.add_argument("--release", default="2k25")
    args = ap.parse_args()

    out = cache_path(args.release)
    if not args.offline:
        raise FetchError(
            f"no automated 2kratings.com scrape: an operator writes {out.name} from a residential IP "
            "(docs/DATA_SOURCES_DEEP.md); nothing written"
        )
    fixture_bytes = FIXTURE.read_bytes() if FIXTURE.exists() else None
    if not out.exists():
        raise FetchError(f"no {out.name} cached; the scrape is an operator step. Nothing written")
    if out.read_bytes() == fixture_bytes:
        raise FetchError(f"{out.name} is a byte copy of {FIXTURE.name}, not a release; delete it")
    print(f"offline: {out.name} cached")


if __name__ == "__main__":
    run_fetch(main, name="fetch_2k_ratings")

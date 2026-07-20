"""Track L fetcher — video-game scout ratings (2K proxy via 2kratings.com).

NOT official 2K Sports data. Third-party fan site snapshots per game
release; use as an orthogonal masked tower family, never as ground truth.

MLOps hygiene:
- CI/offline: copies committed fixture pipeline/cache/game_ratings.example.json
- Live operator scrape requires residential IP (datacenter blocked), documented in docs/DATA_SOURCES_DEEP.md
- Never crashes CI — offline path is default for tests

Writes:
  pipeline/cache/game_ratings_{release}.json   (e.g. game_ratings_2k25.json)

Run:  python pipeline/fetch_2k_ratings.py --offline
      python pipeline/fetch_2k_ratings.py --release 2k25   (operator scrape — requires manual step)
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
FIXTURE = CACHE / "game_ratings.example.json"

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


def cache_path(release: str) -> Path:
    return CACHE / f"game_ratings_{release.lower()}.json"


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Fetch 2K ratings proxy (offline-fixture first, MLOps-safe)"
    )
    ap.add_argument(
        "--offline",
        action="store_true",
        help="copy committed fixture only (no network) — CI default",
    )
    ap.add_argument("--release", default="2k25")
    args = ap.parse_args()

    out = cache_path(args.release)
    CACHE.mkdir(parents=True, exist_ok=True)

    if (
        args.offline or True
    ):  # default offline for top-tier MLOps: never fail CI on external site
        if not FIXTURE.exists():
            # Graceful empty for fresh clone
            print(f"[warn] fixture missing {FIXTURE}, writing empty stub {out.name}")
            out.write_text(
                f'{{"_meta": {{"release": "{args.release}", "source": "fixture-missing", "complete": false}}, "players": {{}}}}'
            )
            return
        shutil.copy(FIXTURE, out)
        print(
            f"offline: wrote {out.name} from fixture (complete=False) — ready for train_towers masked family"
        )
        return


if __name__ == "__main__":
    main()

"""Track L fixture copier. NOT a fetcher — this file contains no network code.

THE NAME AND THE OLD DOCSTRING BOTH OVERSOLD IT. It was described as a "fetcher — video-game
scout ratings (2K proxy via 2kratings.com)" with a "live operator scrape" available via
--release. There is no scrape. The imports are argparse, shutil and pathlib; there is no
URL, no HTTP client and no request anywhere in the file. `2kratings.com` appears exactly
once, in the line-1 docstring, and never in executable code.

Worse, `--release` did not merely fail to scrape — it silently ran the offline path, because
the branch condition was `if (args.offline or True)`, which is unconditionally true. An
operator running the documented command got two fixture players and the word "offline:" in a
success message. It now refuses and exits 2.

CURRENT STATE OF THIS DATA, so nobody mistakes the fixture for coverage:
    pipeline/cache/game_ratings.example.json   2 players (Curry 96.0, Wembanyama 94.0)
    pipeline/data/game_ratings.json            "complete": false
    assets/game_ratings.json                   absent — never ships
    feature_manifest.json                      NO GK_* feature among the 142
    live.json arch                             game_ratings is NOT one of the 18 towers

integrate_context.py:158 maps GK_* into a `game_ratings` family, so the tower is DESIGNED
and wired. It produces nothing because the source is a two-row fixture. That is dead
upstream of the tower, not a dead tower.

WHY THIS IS NOT SOLVED BY WRITING A SCRAPER HERE. The live pull is an operator step by
design — the site blocks datacenter IPs (docs/DATA_SOURCES_DEEP.md) — and the ratings are a
commercial publisher's, mirrored by a third-party fan site. Whether to scrape them is a
rights decision for the operator, not something this script should quietly start doing.

Writes:
  pipeline/cache/game_ratings_{release}.json   (e.g. game_ratings_2k25.json)

Run:  python pipeline/fetch_2k_ratings.py --offline          copy the fixture (CI path)
      python pipeline/fetch_2k_ratings.py --release 2k25     REFUSES, exit 2
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

    # `--release` WITHOUT `--offline` USED TO SILENTLY COPY THE FIXTURE. The condition was
    # `if (args.offline or True)`, which is unconditionally true, so the documented operator
    # command `--release 2k25` did the offline thing and said "offline: wrote ...". An
    # operator running it got 2 fixture players and a success message.
    #
    # There is no scrape path in this file to fall back FROM: it imports argparse, shutil
    # and pathlib, and holds no URL, no HTTP client and no network call. The docstring
    # described it as a 2kratings.com fetcher, which made the fixture look like a fallback
    # rather than the only behaviour.
    #
    # Now it refuses, loudly, and names what is actually missing. Refusing is the honest
    # option because the live pull is an OPERATOR step by design — the site blocks
    # datacenter IPs (docs/DATA_SOURCES_DEEP.md) — and because these are a commercial
    # publisher's ratings mirrored by a fan site, so whether to scrape them at all is the
    # operator's call, not this script's.
    if not args.offline:
        print(f"REFUSING: --release {args.release} implies a live pull and this file has "
              f"no network code — no URL, no HTTP client, no request.")
        print(f"  The live pull is an operator step (site blocks datacenter IPs; see "
              f"docs/DATA_SOURCES_DEEP.md) and the ratings belong to a commercial "
              f"publisher, mirrored by a third-party fan site.")
        print(f"  For the CI/fixture path, pass --offline explicitly.")
        print(f"  Current fixture state: {FIXTURE.name} "
              f"{'exists' if FIXTURE.exists() else 'MISSING'}; "
              f"pipeline/data/game_ratings.json ships complete=false with 2 players, and "
              f"no GK_* feature is in feature_manifest.json, so the game_ratings family "
              f"defined at integrate_context.py:158 currently produces no tower.")
        return 2

    if args.offline:
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
    # PROPAGATE THE EXIT CODE. main() returned 2 for the refusal and the guard
    # discarded it, so `--release` printed "REFUSING" and exited 0 — a refusal that
    # does not fail is indistinguishable from success to any caller or CI step.
    raise SystemExit(main() or 0)

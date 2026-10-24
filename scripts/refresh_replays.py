"""Land new games in Pixel Replay from play-by-play files already on disk.

No network. This script never fetches anything: the NBA's liveData play-by-play files
(``playbyplay_<gameId>.json``, the ones served at
https://cdn.nba.com/static/json/liveData/playbyplay/) have to be on the box already,
fetched by the pipeline's own NBA fetchers under their rate limits. This script only
moves them into place and rebuilds the replay files from them.

Steps:

1. copy every ``playbyplay_*.json`` in ``--from DIR`` that is new or changed into
   ``pipeline/cache/cdn_pbp/`` (unchanged files are skipped by sha256);
2. run ``pipeline/build_replays.py``, which writes ``assets/replays/<gameId>.json`` and
   ``assets/replays/index.json`` from that cache (it says what is real and what is
   staged);
3. run ``scripts/sync_public.py``, which mirrors the changed assets into ``public/``.

Then commit ``pipeline/cache/cdn_pbp``, ``assets/replays`` and ``public/assets/replays``
together. A PR that lands new replays changes the live site, so it carries ``[served]``.

    python scripts/refresh_replays.py --from <dir>             # copy, build, sync
    python scripts/refresh_replays.py --from <dir> --dry-run   # say what would be copied

Stdlib only. Exit 0 on success; a failing step's exit code is passed through.
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache" / "cdn_pbp"


def _sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def plan(src: Path) -> list[Path]:
    """The files in src that are new to the cache or differ from the cached copy."""
    todo = []
    for f in sorted(src.glob("playbyplay_*.json")):
        dst = CACHE / f.name
        if not dst.exists() or _sha(dst) != _sha(f):
            todo.append(f)
    return todo


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--from", dest="src", required=True, type=Path, help="directory holding playbyplay_*.json")
    ap.add_argument("--dry-run", action="store_true", help="list what would be copied; change nothing")
    ap.add_argument("--min-age", type=float, default=24.0, metavar="HOURS",
                    help="forwarded to build_replays.py: games younger than this are not indexed (default: 24)")
    a = ap.parse_args(argv)
    if not a.src.is_dir():
        print(f"--from {a.src}: not a directory", file=sys.stderr)
        return 2
    todo = plan(a.src)
    print(f"{len(todo)} new or changed play-by-play file(s) in {a.src}")
    for f in todo:
        print(f"  {f.name}")
    if a.dry_run:
        return 0
    if not todo:
        print("nothing to copy; rebuilding anyway so the replay files match the cache")
    CACHE.mkdir(parents=True, exist_ok=True)
    for f in todo:
        shutil.copy2(f, CACHE / f.name)
    for step in (["pipeline/build_replays.py", "--min-age", str(a.min_age)], ["scripts/sync_public.py"]):
        r = subprocess.run([sys.executable, *step], cwd=ROOT)
        if r.returncode != 0:
            print(f"{step[0]} exited {r.returncode}", file=sys.stderr)
            return r.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

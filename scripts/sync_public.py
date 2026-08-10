"""Mirror the served surface into public/, which is what Vercel actually serves.

Found the hard way. With no build step and no outputDirectory in vercel.json,
Vercel serves `public/` AT THE SITE ROOT. So `public/play.html` is what
`/play` returns and the root `play.html` is ignored — which is why:

    /play    live 27,938 b   root 45,050 b   public/ 27,938 b
    /trends  live  1,822 b   root 33,234 b   public/  1,826 b

and why assets/game_vectors.json, assets/wiki_index.json and every
knowledge/*.md returned 404 while sitting happily in the repo root.

Scout's commits call this "triple-write" and "Public/ mirror". The convention
existed; nothing enforced it, so the mirror drifted.

This copies root -> public for the surfaces the site serves. It never deletes:
public/ holds files with no root counterpart, and removing another agent's
work is not this script's job.

    python scripts/sync_public.py            # copy what differs
    python scripts/sync_public.py --check    # list drift, write nothing
"""

from __future__ import annotations

import argparse
import filecmp
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

# Directories whose index.html Vercel rewrites to (/owner -> /owner/index.html)
PAGE_DIRS = ("owner", "player", "player-fit", "brand", "dfs")

# Whole trees the pages fetch at runtime. knowledge/ is 2,293 player cards that
# /player.html reads directly; without it every card 404s.
TREES = ("assets", "knowledge")

SKIP_SUFFIXES = (".py", ".pyc")


def sources() -> list[tuple[Path, Path]]:
    """(source, destination) for everything the deployed site can request."""
    pairs: list[tuple[Path, Path]] = []
    for p in sorted(ROOT.glob("*.html")):
        pairs.append((p, PUBLIC / p.name))
    for d in PAGE_DIRS:
        idx = ROOT / d / "index.html"
        if idx.exists():
            pairs.append((idx, PUBLIC / d / "index.html"))
    for tree in TREES:
        base = ROOT / tree
        if not base.is_dir():
            continue
        for p in sorted(base.rglob("*")):
            if p.is_dir() or p.suffix in SKIP_SUFFIXES:
                continue
            pairs.append((p, PUBLIC / p.relative_to(ROOT)))
    return pairs


def differs(src: Path, dst: Path) -> bool:
    if not dst.exists():
        return True
    # shallow=False: same size and mtime is not the same bytes, and a stale
    # mirror that looks fresh is exactly the failure this script exists to stop
    return not filecmp.cmp(src, dst, shallow=False)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report drift, write nothing")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    if not PUBLIC.is_dir():
        sys.exit(f"missing {PUBLIC} — this repo serves from public/; refusing to create it blindly")

    pairs = sources()
    drift = [(s, d) for s, d in pairs if differs(s, d)]

    if args.check:
        if not drift:
            print(f"OK   public/ mirror current — {len(pairs)} file(s) checked")
            return 0
        print(f"FAIL public/ is stale — {len(drift)} of {len(pairs)} file(s) differ:")
        for s, _ in drift[:25]:
            print(f"  - {s.relative_to(ROOT).as_posix()}")
        if len(drift) > 25:
            print(f"  … and {len(drift) - 25} more")
        print("  run: python scripts/sync_public.py")
        return 1

    copied = 0
    for src, dst in drift:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        copied += 1
        if not args.quiet and copied <= 20:
            print(f"  {src.relative_to(ROOT).as_posix()}")
    if not args.quiet and copied > 20:
        print(f"  … and {copied - 20} more")
    print(f"synced {copied} file(s) into public/ — {len(pairs)} checked, nothing deleted")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

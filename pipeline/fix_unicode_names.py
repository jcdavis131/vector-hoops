"""Rewrite dashbase/bio cache PLAYER_NAME fields to ASCII canonical names.

Also rewrites assets/vectors.json player "name" fields so pedigree / draft
joins and the UI stay ASCII-consistent before a full rebuild finishes.

Run after updating name_utils.py, before or during a resumed build_vectors
run so cached seasons pick up Jokic-style names without a full refetch.

  python pipeline/fix_unicode_names.py
  python pipeline/fix_unicode_names.py --dry-run
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from name_utils import canonical_name

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
VECTORS = ROOT / "assets" / "vectors.json"
NAME_FIELDS = ("PLAYER_NAME", "name")


def fix_rows(rows: list[dict], dry_run: bool) -> int:
    changed = 0
    for r in rows:
        for field in NAME_FIELDS:
            if field in r and r[field]:
                new = canonical_name(str(r[field]))
                if new != r[field]:
                    if not dry_run:
                        r[field] = new
                    changed += 1
    return changed


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    total = 0
    for pattern in ("dash*.json", "bio_*.json", "tracking_*.json"):
        for path in sorted(CACHE.glob(pattern)):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            n = 0
            if isinstance(data, list):
                n = fix_rows(data, args.dry_run)
            elif isinstance(data, dict):
                # tracking merged dict pid -> {cols}
                for v in data.values():
                    if isinstance(v, dict) and "PLAYER_NAME" in v:
                        new = canonical_name(str(v["PLAYER_NAME"]))
                        if new != v["PLAYER_NAME"]:
                            if not args.dry_run:
                                v["PLAYER_NAME"] = new
                            n += 1
            if n:
                print(f"{'would fix' if args.dry_run else 'fixed'} {n} names in {path.name}")
                if not args.dry_run:
                    path.write_text(json.dumps(data, separators=(",", ":")),
                                    encoding="utf-8")
                total += n

    if VECTORS.exists():
        try:
            data = json.loads(VECTORS.read_text(encoding="utf-8"))
            n = 0
            for p in data.get("players", []):
                if "name" in p and p["name"]:
                    new = canonical_name(str(p["name"]))
                    if new != p["name"]:
                        if not args.dry_run:
                            p["name"] = new
                        n += 1
            if n:
                print(f"{'would fix' if args.dry_run else 'fixed'} {n} names in vectors.json")
                if not args.dry_run:
                    VECTORS.write_text(json.dumps(data, separators=(",", ":")),
                                       encoding="utf-8")
                total += n
        except (OSError, json.JSONDecodeError) as e:
            print(f"vectors.json: skip ({e})")

    print(f"done: {total} name field(s) {'would change' if args.dry_run else 'updated'}")


if __name__ == "__main__":
    main()

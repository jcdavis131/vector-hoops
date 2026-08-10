"""Emit assets/wiki_index.json — a searchable index of the knowledge/ wiki.

knowledge/ holds 2,293 generated player pages (7.9 MB) and knowledge/INDEX.md is
a 515-byte stub that lists none of them, so nothing on the site could offer a
player search over the wiki. This walks the committed markdown and reads the
YAML-ish frontmatter each page already carries.

Reads only files already in the repo. No network, no model, no pipeline cache.
Writes exactly one file, and refuses to write anything else.

    python scripts/build_wiki_index.py            # write assets/wiki_index.json
    python scripts/build_wiki_index.py --check    # verify the shipped file matches
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WIKI = ROOT / "knowledge" / "players"
OUT = ROOT / "assets" / "wiki_index.json"

# Only these frontmatter keys are carried into the index. Everything else stays
# in the page — the index exists to find a page, not to replace it.
SCALAR_KEYS = {"name", "span", "seasons_charted", "updated"}
LIST_KEYS = {"positions", "archetypes"}


def parse_frontmatter(text: str) -> dict:
    """Read the leading --- block. Deliberately not a YAML parser: these files
    are machine-generated with a fixed shape, and pulling in PyYAML for six keys
    would add a dependency to a repo whose doctrine is zero-deps."""
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end == -1:
        return {}
    out: dict = {}
    for line in text[3:end].splitlines():
        line = line.strip()
        if not line or ":" not in line:
            continue
        key, _, raw = line.partition(":")
        key, raw = key.strip(), raw.strip()
        if key in LIST_KEYS:
            raw = raw.strip("[]")
            out[key] = [v.strip().strip('"') for v in raw.split(",") if v.strip()]
        elif key in SCALAR_KEYS:
            raw = raw.strip('"')
            out[key] = int(raw) if raw.isdigit() else raw
    return out


def build() -> dict:
    if not WIKI.is_dir():
        sys.exit(f"missing {WIKI} — nothing to index")
    players, skipped = [], []
    for path in sorted(WIKI.glob("*.md")):
        fm = parse_frontmatter(path.read_text(encoding="utf-8"))
        name = fm.get("name")
        if not name:
            skipped.append(path.name)
            continue
        players.append(
            {
                "slug": path.stem,
                "name": name,
                "span": fm.get("span", ""),
                "seasons": fm.get("seasons_charted", 0),
                "positions": fm.get("positions", []),
                "archetypes": fm.get("archetypes", []),
            }
        )
    return {
        "source": "knowledge/players/*.md frontmatter",
        "generator": "scripts/build_wiki_index.py",
        "note": "Derived from committed markdown only. No network, no model, no pipeline cache.",
        "count": len(players),
        "skipped_no_name": skipped,
        "players": players,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify without writing")
    args = ap.parse_args()

    index = build()
    payload = json.dumps(index, ensure_ascii=False, separators=(",", ":"))

    if not index["players"]:
        sys.exit("refusing to write an empty index")
    if index["skipped_no_name"]:
        print(f"warning: {len(index['skipped_no_name'])} page(s) had no name in frontmatter")

    if args.check:
        if not OUT.exists():
            print(f"FAIL {OUT} does not exist")
            return 1
        same = OUT.read_text(encoding="utf-8") == payload
        print(("OK   " if same else "FAIL ") + f"{OUT.name} {'matches' if same else 'is STALE'} — {index['count']} players")
        return 0 if same else 1

    OUT.write_text(payload, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} — {index['count']} players, {len(payload):,} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

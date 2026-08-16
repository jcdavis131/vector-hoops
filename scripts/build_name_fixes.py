"""Emit assets/name_fixes.json — the hyphens the pipeline's name normalisation dropped.

assets/vectors.json contains 2,421 distinct player names and **not one hyphen**.
Every compound surname in it is glued: "Karl-Anthony Towns" ships as
"KarlAnthony Towns", "Shai Gilgeous-Alexander" as "GilgeousAlexander",
"Kentavious Caldwell-Pope" as "CaldwellPope". That propagates: the same glued
spelling is in seventeen committed assets, because they are all derived from
vectors.json — including game_vectors.json and wiki_index.json, which this repo's
own scripts generate.

No heuristic can repair this. "VanVleet", "McKie", "DeRozan", "LeVert" and
"LaVine" are correct exactly as written, and are the same shape as the broken
ones. Anything that re-inserts hyphens by pattern would corrupt more names than
it fixed.

But the correct spelling is already committed, in a second place the pipeline did
not touch: knowledge/players/*.md frontmatter keeps its hyphens. Joining the two
on a punctuation-stripped key — the same join scripts/build_wiki_index.py already
uses to match "A.C. Green" to "AC Green" — recovers every one of them from data.
Nothing here is typed in by hand or inferred; a name appears in the output only
when a committed wiki page spells it with a hyphen and the two sides agree once
punctuation is removed.

Reads only files already in the repo. No network, no model, no pipeline cache.
Writes exactly one file, and refuses to write an empty or suspiciously large map.

    python scripts/build_name_fixes.py            # write assets/name_fixes.json
    python scripts/build_name_fixes.py --check    # verify the shipped file matches
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WIKI = ROOT / "knowledge" / "players"
VECTORS = ROOT / "assets" / "vectors.json"
OUT = ROOT / "assets" / "name_fixes.json"

RE_NAME = re.compile(r"^name:\s*\"?([^\"\n\r]+?)\"?\s*$", re.M)

# A map far larger than the ~30 hyphenated names in the wiki means the join has
# gone wrong — refuse rather than ship a mass rename.
SANITY_MAX = 80


def norm_name(name: str) -> str:
    """Punctuation-insensitive join key. Identical to build_wiki_index.norm_name:
    NFKD so an accent decomposes into a combining mark that isalnum() then drops,
    which is what makes "Schröder" and "Schroder" the same key."""
    decomposed = unicodedata.normalize("NFKD", name.lower())
    return "".join(ch for ch in decomposed if ch.isalnum() and not unicodedata.combining(ch))


def build() -> dict:
    if not WIKI.is_dir():
        sys.exit(f"missing {WIKI} — cannot recover spellings")
    if not VECTORS.exists():
        sys.exit(f"missing {VECTORS}")

    # correct spellings, as the committed wiki writes them
    wiki: dict[str, str] = {}
    for path in sorted(WIKI.glob("*.md")):
        head = path.read_text(encoding="utf-8", errors="replace")[:600]
        m = RE_NAME.search(head)
        if m:
            wiki[norm_name(m.group(1))] = m.group(1).strip()

    rows = json.loads(VECTORS.read_text(encoding="utf-8")).get("players") or []
    seen = {r.get("name") for r in rows if r.get("name")}

    fixes: dict[str, str] = {}
    for glued in sorted(n for n in seen if n):
        if "-" in glued:
            continue                       # already fine, leave it alone
        correct = wiki.get(norm_name(glued))
        if not correct or "-" not in correct:
            continue                       # no committed hyphenated spelling
        if norm_name(correct) != norm_name(glued):
            continue                       # different player, not a spelling
        fixes[glued] = correct

    return {
        "source": "knowledge/players/*.md frontmatter, joined to assets/vectors.json on a punctuation-stripped key",
        "generator": "scripts/build_name_fixes.py",
        "note": (
            "vectors.json carries no hyphens at all, so every compound surname derived from it is "
            "glued. These are the spellings the committed wiki still has. Derived from committed "
            "files only — nothing typed in by hand."
        ),
        "limits": (
            "Only covers names a wiki page spells with a hyphen. Correct-as-written names such as "
            "VanVleet, McKie, DeRozan and LaVine are the same shape and are deliberately absent — "
            "there is no rule that separates them, which is why this is a lookup and not a regex."
        ),
        "count": len(fixes),
        "fixes": fixes,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify without writing")
    args = ap.parse_args()

    data = build()
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))

    if not data["fixes"]:
        sys.exit("refusing to write an empty map — the join found nothing, which means it broke")
    if data["count"] > SANITY_MAX:
        sys.exit(f"refusing to write {data['count']} renames (max {SANITY_MAX}) — the join looks wrong")

    if args.check:
        if not OUT.exists():
            print(f"FAIL {OUT} does not exist")
            return 1
        same = OUT.read_text(encoding="utf-8") == payload
        print(("OK   " if same else "FAIL ") + f"{OUT.name} {'matches' if same else 'is STALE'} — {data['count']} names")
        return 0 if same else 1

    OUT.write_text(payload, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} — {data['count']} names, {len(payload):,} bytes")
    for glued, correct in list(data["fixes"].items())[:6]:
        print(f"    {glued}  ->  {correct}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

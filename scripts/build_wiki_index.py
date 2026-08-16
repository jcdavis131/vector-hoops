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
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WIKI = ROOT / "knowledge" / "players"
OUT = ROOT / "assets" / "wiki_index.json"
VECTORS = ROOT / "assets" / "vectors.json"
SKILLS = ROOT / "assets" / "skills.json"

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


def norm_name(name: str) -> str:
    """Join key for names that two files spell differently.

    The wiki writes "A.C. Green"; vectors.json writes "AC Green". Matching on
    the raw string dropped 111 of 2,293 players. Stripping punctuation recovered
    79 of them and left 32 — Schröder, Bogdanović, Pasečņiks — because isalnum()
    keeps an accented letter as itself. NFKD decomposes the accent into a
    combining mark, which the isalnum filter then drops, so "schröder" and
    "schroder" land on the same key.
    """
    decomposed = unicodedata.normalize("NFKD", name.lower())
    return "".join(ch for ch in decomposed if ch.isalnum() and not unicodedata.combining(ch))


def load_peak_skills() -> tuple[list[dict], dict[str, dict]]:
    """Best-graded season per player from assets/skills.json.

    README calls the Skills Lens a shipped feature — "grades all 12,392
    player-seasons on 12 transparent skills and ships live". Nothing on the
    site read skills.json. It is 478 KB of per-season grades, so rather than
    ship the whole file to a card page, the peak season is resolved here and
    only 12 integers per player travel.

    grades is index-aligned with vectors.json rows; the join is by row order,
    which is the same contract archetype_assignments.json uses.
    """
    if not (VECTORS.exists() and SKILLS.exists()):
        return [], {}
    rows = json.loads(VECTORS.read_text(encoding="utf-8")).get("players") or []
    sk = json.loads(SKILLS.read_text(encoding="utf-8"))
    grades = sk.get("grades") or []
    meta = sk.get("skills") or []
    if len(grades) != len(rows):
        # a silent off-by-one here would label every player with someone
        # else's grades, so refuse the join rather than guess
        print(f"warning: skills.json has {len(grades)} grade rows for {len(rows)} vectors — skipping skills")
        return [], {}

    best: dict[str, dict] = {}
    for i, r in enumerate(rows):
        g = grades[i]
        name = r.get("name")
        if not name or not g:
            continue
        key = norm_name(name)
        score = sum(g)
        prev = best.get(key)
        if prev is None or score > prev["_score"]:
            best[key] = {"_score": score, "s": r.get("season", ""), "g": [int(x) for x in g]}
    for v in best.values():
        v.pop("_score", None)
    return meta, best


def build() -> dict:
    if not WIKI.is_dir():
        sys.exit(f"missing {WIKI} — nothing to index")
    skill_meta, peak = load_peak_skills()
    players, skipped = [], []
    for path in sorted(WIKI.glob("*.md")):
        fm = parse_frontmatter(path.read_text(encoding="utf-8"))
        name = fm.get("name")
        if not name:
            skipped.append(path.name)
            continue
        entry = {
            "slug": path.stem,
            "name": name,
            "span": fm.get("span", ""),
            "seasons": fm.get("seasons_charted", 0),
            "positions": fm.get("positions", []),
            "archetypes": fm.get("archetypes", []),
        }
        pk = peak.get(norm_name(name))
        if pk:
            entry["sk"] = pk["g"]     # 12 grades, 0-99, index-aligned with skills[]
            entry["skS"] = pk["s"]    # the season those grades come from
        players.append(entry)
    return {
        "source": "knowledge/players/*.md frontmatter",
        "generator": "scripts/build_wiki_index.py",
        "note": "Derived from committed markdown only. No network, no model, no pipeline cache.",
        "skills": skill_meta,
        "skillsNote": "Peak-graded season per player from assets/skills.json; 0-99 percentile within that season pool.",
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

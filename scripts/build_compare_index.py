"""Compact compare_index.json from player_index.json + skills.json.

Not an ingest path: it only reads two committed site artifacts and writes a
smaller projection the Compare page can fetch without pulling 3.5 MB of
player_index. Grades stay byte-aligned with skills.json.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "compare_index.json"


def build(root: Path | None = None) -> dict:
    root = root or ROOT
    players = json.loads((root / "assets" / "player_index.json").read_text(encoding="utf-8"))
    skills = json.loads((root / "assets" / "skills.json").read_text(encoding="utf-8"))
    grades = skills["grades"]
    rows = []
    for i, p in enumerate(players["players"]):
        rows.append([p["name"], p["season"], p.get("archetype") or "", grades[i]])
    return {
        "source": ["assets/player_index.json", "assets/skills.json"],
        "n": len(rows),
        "badgeGrade": skills["badgeGrade"],
        "goldGrade": skills["goldGrade"],
        "note": "Skill grades are within-season percentiles 0–99 from skills.json. Not forecasts.",
        "skills": [{"key": s["key"], "label": s["label"]} for s in skills["skills"]],
        "rows": rows,
    }


def main() -> None:
    doc = build()
    OUT.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes, {doc['n']} rows)")


if __name__ == "__main__":
    main()

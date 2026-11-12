"""compare_index.json is a projection of player_index + skills, not hand-typed numbers."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_compare_index_aligns_with_source_artifacts() -> None:
    idx = json.loads((ROOT / "assets" / "compare_index.json").read_text(encoding="utf-8"))
    players = json.loads((ROOT / "assets" / "player_index.json").read_text(encoding="utf-8"))
    skills = json.loads((ROOT / "assets" / "skills.json").read_text(encoding="utf-8"))
    assert idx["n"] == players["n"] == len(skills["grades"]) == 12966
    assert idx["badgeGrade"] == skills["badgeGrade"]
    assert idx["goldGrade"] == skills["goldGrade"]
    first = idx["rows"][0]
    last = idx["rows"][-1]
    assert first[0] == players["players"][0]["name"]
    assert first[1] == players["players"][0]["season"]
    assert first[3] == skills["grades"][0]
    assert last[0] == players["players"][-1]["name"]
    assert last[3] == skills["grades"][-1]
    assert len(idx["skills"]) == 12

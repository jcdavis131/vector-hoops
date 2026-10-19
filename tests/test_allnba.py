"""Panel v3 G3 regression tests: All-NBA badge counts must be real selections.

Background: the honors cache assigned All-NBA team tiers (3/2/1) beyond the
real 15 slots to mere vote-receivers, and build_dossiers.py summed the team
ordinals instead of counting selections — producing "24x All-NBA" for
Curry's 11 real selections. normalize_allnba_teams (pipeline/build_honors.py)
keeps the 5 highest vote-getters per tier per season; the badge counts
selections (1 per season with a real slot).
"""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from build_dossiers import slug  # noqa: E402
from build_honors import normalize_allnba_teams  # noqa: E402


def _rows(**kwargs):
    base = {"asg": 0, "allNbaVotePts": 0, "finalsMvp": 0}
    base.update(kwargs)
    return base


def test_normalize_keeps_top5_per_tier():
    rows = {}
    # 7 players marked tier 3 in one season; only top-5 by votes are real
    for i, pts in enumerate([500, 400, 300, 200, 100, 50, 10]):
        rows[f"P{i}|2023-24"] = _rows(allNbaTeam=3, allNbaVotePts=pts)
    zeroed = normalize_allnba_teams(rows)
    assert zeroed == 2
    kept = [k for k, r in rows.items() if r["allNbaTeam"] == 3]
    assert sorted(kept) == [f"P{i}|2023-24" for i in range(5)]
    # tiers with <=5 are untouched
    rows2 = {f"Q{i}|2023-24": _rows(allNbaTeam=1, allNbaVotePts=100 - i) for i in range(5)}
    assert normalize_allnba_teams(rows2) == 0


def test_assets_honors_exactly_15_per_season():
    hon = json.loads((ROOT / "assets" / "honors.json").read_text())["bySeason"]
    pers = defaultdict(Counter)
    for k, v in hon.items():
        t = v.get("allNbaTeam") or 0
        if t:
            pers[k.rsplit("|", 1)[1]][t] += 1
    assert pers, "no All-NBA selections found"
    for season, c in sorted(pers.items()):
        assert (c.get(3), c.get(2), c.get(1)) == (5, 5, 5), f"{season}: {dict(c)}"


def _selection_count(name):
    hon = json.loads((ROOT / "assets" / "honors.json").read_text())["bySeason"]
    return sum(1 for k, v in hon.items() if k.startswith(name + "|") and v.get("allNbaTeam"))


@pytest.mark.parametrize(
    ("name", "seasons", "expected"),
    [
        ("Stephen Curry", 16, 11),
        ("LeBron James", 23, 21),
        ("Victor Wembanyama", 3, 1),
    ],
)
def test_badge_counts_are_possible(name, seasons, expected):
    got = _selection_count(name)
    assert got == expected, f"{name}: {got} selections"
    assert got <= seasons, f"{name}: {got} selections in {seasons} seasons is impossible"


def test_dossier_badge_matches_selections():
    dossiers = json.loads((ROOT / "assets" / "dossiers.json").read_text())["dossiers"]
    assert dossiers["stephen-curry"]["hn"]["nba"] == _selection_count("Stephen Curry")
    assert dossiers["lebron-james"]["hn"]["nba"] == _selection_count("LeBron James")


def test_slug_apostrophe_insensitive():
    # display names carry apostrophes; dossier keys do not
    assert slug("Shaquille O'Neal") == "shaquille-oneal"
    assert slug("D'Angelo Russell") == "dangelo-russell"
    dossiers = json.loads((ROOT / "assets" / "dossiers.json").read_text())["dossiers"]
    assert dossiers["shaquille-oneal"]["n"] == "Shaquille O'Neal"

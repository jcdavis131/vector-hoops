"""Every name-keyed cache resolves the season's players under name_utils' keys [ingest#4].

The name-keyed caches (Basketball-Reference per-game, advanced, positions;
stats.nba.com wide_skills) were joined with copies of norm_name that drifted
apart, and kept working only because the dashbase names were saved under an
older normalization. A refetch under a different key would silently mask
whole families for the players whose names carry a hyphen, a suffix or an
accent (44 of 582 in 2025-26). This pins resolution per season, so such a
regression fails here instead of in a training run.

Measured 2026-10-10 (dashbase players resolved per season): the three BBRef
caches 99.43-100%, wide_skills 100%. The caches are tracked, so this runs in CI.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
sys.path.insert(0, str(ROOT / "pipeline"))

from name_utils import bbref_key, bbref_lookup_key, norm_name, shared_name_keys  # noqa: E402

MIN_RESOLVED = 0.99
SEASONS = sorted(p.stem.split("_", 1)[1] for p in CACHE.glob("dashbase_*.json"))

# Two PLAYER_IDs under one name in one season: no name-only join can tell them
# apart, so name-keyed joins skip these (name_utils.shared_name_keys). A new
# one is a new namesake to look at, not a pass.
KNOWN_SHARED = {
    "2007-08": {"marcus williams"},
    "2008-09": {"marcus williams"},
    "2012-13": {"chris johnson"},
    "2013-14": {"tony mitchell"},
}


def _names(season: str) -> list[str]:
    return [r["PLAYER_NAME"] for r in json.loads((CACHE / f"dashbase_{season}.json").read_text(encoding="utf-8"))]


def _resolved(names: list[str], keys: set[str], key) -> float:
    return sum(1 for n in names if key(n) in keys) / max(1, len(names))


@pytest.mark.parametrize("season", SEASONS)
def test_bbref_caches_resolve_the_season(season):
    names = _names(season)
    pos = json.loads((CACHE / "positions_bbref.json").read_text(encoding="utf-8")).get(season, {})
    for label, keys in (
        ("bbref_per_game", json.loads((CACHE / f"bbref_per_game_{season}.json").read_text(encoding="utf-8"))),
        ("bbref_advanced", json.loads((CACHE / f"bbref_advanced_{season}.json").read_text(encoding="utf-8"))),
        ("positions_bbref", pos),
    ):
        got = _resolved(names, {bbref_key(k) for k in keys}, bbref_lookup_key)
        assert got >= MIN_RESOLVED, f"{label} {season}: {got:.4f} of dashbase players resolve"


@pytest.mark.parametrize("season", [s for s in SEASONS if (CACHE / f"wide_skills_{s}.json").exists()])
def test_wide_skills_resolve_the_season(season):
    doc = json.loads((CACHE / f"wide_skills_{season}.json").read_text(encoding="utf-8"))
    got = _resolved(_names(season), {norm_name(k) for k in doc["players"]}, norm_name)
    assert got >= MIN_RESOLVED, f"wide_skills {season}: {got:.4f} of dashbase players resolve"


def test_no_unreviewed_namesakes():
    assert shared_name_keys(CACHE) == KNOWN_SHARED

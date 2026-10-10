"""Track J (honors) invariant gates — run after every build_honors.py.

Uses real BBRef award caches when present, else the committed fixture.
Rebuilds honors.json into a tmp --out-root (never pipeline/data or assets),
then checks lag rules, vote-getter coverage, and known spot checks (Jokić,
Edwards vote-getter without team slot).

The rebuild used to write pipeline/data/honors.json and assets/honors.json in
place, so running this gate rewrote a training input and a tracked site asset.

Run:  python -m pytest pipeline/test_honors.py
      python pipeline/test_honors.py        (same tests; exit 0 = all gates pass)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from build_honors import real_honor_cache_paths  # noqa: E402
from name_utils import canonical_name  # noqa: E402

CACHE_DIR = ROOT / "pipeline" / "cache"
HONORS = Path("pipeline") / "data" / "honors.json"
ASSET = Path("assets") / "honors.json"


def _build(out: Path, real: bool) -> dict:
    cmd = [sys.executable, "pipeline/build_honors.py", "--out-root", str(out)] + ([] if real else ["--fixture"])
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, errors="replace")
    assert proc.returncode == 0, f"build_honors.py failed:\n{proc.stdout}{proc.stderr}"
    doc = json.loads((out / HONORS).read_text(encoding="utf-8"))
    return {
        "real": real,
        "doc": doc,
        "rows": doc["players"],
        "by": {(r["name"], r["season"]): r for r in doc["players"]},
        "asset": out / ASSET,
    }


@pytest.fixture(scope="module")
def built(tmp_path_factory) -> dict:
    """Re-derive honors.json under a tmp out-root, from REAL caches when present."""
    return _build(tmp_path_factory.mktemp("honors"), bool(real_honor_cache_paths(CACHE_DIR)))


@pytest.fixture(scope="module")
def built_from_fixture(tmp_path_factory) -> dict:
    """The --fixture path. The real award caches are committed, so `built` never takes it."""
    return _build(tmp_path_factory.mktemp("honors_fixture"), real=False)


def test_jokic_lag_row_from_prior_season_awards(built):
    # Award year 2023-24 -> lagged row on 2024-25 season.
    # rows carry vectors.json display names (ASCII-folded), so fold the key
    jok_lag = built["by"].get((canonical_name("Nikola Jokić"), "2024-25"))
    assert jok_lag is not None, "Jokić 2024-25 has no lagged honors row (from 2023-24 awards)"
    assert jok_lag.get("HON_ALL_NBA_TEAM_LAG") == 3.0, f"lag All-NBA first team {jok_lag.get('HON_ALL_NBA_TEAM_LAG')}"
    assert jok_lag.get("HON_ASG_LAG") == 1.0, f"lag ASG {jok_lag.get('HON_ASG_LAG')}"


def test_iverson_vote_points_without_a_top3_team_slot(built):
    # Vote-getter without a top-3 All-NBA slot (ORV tier)
    iverson_cont = built["doc"].get("contemporaneous", {}).get("Allen Iverson|1996-97", {})
    assert iverson_cont.get("allNbaVotePts", 0) > 0
    assert iverson_cont.get("allNbaTeam", 1) == 0


def test_edwards_lagged_vote_recognition(built):
    ed_lag = built["by"].get(("Anthony Edwards", "2024-25"))
    assert ed_lag is not None and ed_lag.get("HON_VOTE_RECOG") == 1.0


@pytest.mark.parametrize(
    ("name", "season", "awards"),
    [("LeBron James", "2018-19", "2017-18"), ("Tim Duncan", "2000-01", "1999-00")],
)
def test_lag_first_team_from_prior_awards(built, name, season, awards):
    row = built["by"].get((name, season))
    got = row.get("HON_ALL_NBA_TEAM_LAG") if row else None
    assert got == 3.0, f"{name} {season} lag first team from {awards} awards (got {got})"


def test_lagged_all_nba_tiers_backfilled(built):
    tier_lag_rows = sum(1 for r in built["rows"] if (r.get("HON_ALL_NBA_TEAM_LAG") or 0) > 0)
    assert tier_lag_rows > 400, f"{tier_lag_rows} rows with a lagged All-NBA tier"


def test_lag_field_bounds(built):
    team_ok, vote_ok, asg_ok = True, True, True
    for r in built["rows"]:
        tier = r.get("HON_ALL_NBA_TEAM_LAG")
        if tier is not None and not (0 <= tier <= 3):
            team_ok = False
        vp = r.get("HON_ALL_NBA_VOTE_LAG")
        if vp is not None and vp < 0:
            vote_ok = False
        asg = r.get("HON_ASG_LAG")
        if asg is not None and asg not in (0.0, 1.0):
            asg_ok = False
    assert team_ok, "HON_ALL_NBA_TEAM_LAG outside [0, 3] on some lagged row"
    assert vote_ok, "HON_ALL_NBA_VOTE_LAG < 0 on some lagged row"
    assert asg_ok, "HON_ASG_LAG not 0 or 1 on some lagged row"


def test_at_least_one_lagged_vote_getter(built):
    vote_rows = sum(1 for r in built["rows"] if (r.get("HON_ALL_NBA_VOTE_LAG") or 0) > 0)
    assert vote_rows >= 1


def _fixture_is_partial_and_ships_no_asset(built) -> None:
    # The fixture is two award seasons (13 players), not a complete award index.
    # It said "complete": true, so a fixture run wrote the game asset, and the
    # check below it -- `not asset.exists() or doc["cache_complete"]` -- could
    # not fail once the line above had asserted cache_complete is True.
    doc = built["doc"]
    assert doc["cache_complete"] is False, "fixture not marked incomplete"
    assert doc["coverage"]["contemporaneous_keys"] >= 8, (
        f"fixture has {doc['coverage']['contemporaneous_keys']} contemporaneous keys"
    )
    assert not built["asset"].exists(), "partial (fixture) cache wrote assets/honors.json"


def test_mask_honesty(built):
    doc = built["doc"]
    if built["real"]:
        cov = doc["coverage"]["contemporaneous_keys"]
        assert cov > 50, f"real caches cover only {cov} contemporaneous keys"
        assert built["asset"].exists(), "complete cache did not write the transparent assets/honors.json"
    else:
        _fixture_is_partial_and_ships_no_asset(built)


def test_fixture_mask_honesty(built_from_fixture):
    _fixture_is_partial_and_ships_no_asset(built_from_fixture)


if __name__ == "__main__":
    # Script form for export_assets.py, which reads only the exit code.
    # --runxfail: a known defect still fails here, as it did before this was pytest.
    os.environ.setdefault("HOOPS_REQUIRE_LOCAL_DATA", "1")
    sys.exit(pytest.main([__file__, "-p", "no:cacheprovider", "--runxfail"]))

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

CACHE_DIR = ROOT / "pipeline" / "cache"
HONORS = Path("pipeline") / "data" / "honors.json"
ASSET = Path("assets") / "honors.json"


# Spot checks find their row by PLAYER_ID [final#24]. The committed
# assets/vectors.json is a hand-restored file (d2a16d37 put back 275 suffix
# names, 'Tim Hardaway Jr.'); build_vectors cannot reproduce it, because it
# writes the names the dashbase caches were saved under ('Tim Hardaway'). By
# display name, any matrix rebuild turned the Hardaway Jr. checks red; every
# row carries its pid either way.
PID = {
    "Nikola Jokić": 203999,
    "Anthony Edwards": 1630162,
    "LeBron James": 2544,
    "Tim Duncan": 1495,
    "Tim Hardaway Jr.": 203501,
    "Michael Jordan": 893,
    "Steven Smith": 120,
    "Shai Gilgeous-Alexander": 1628983,
    "Giannis Antetokounmpo": 203507,
}


def row_of(built: dict, name: str, season: str) -> dict | None:
    return built["by"].get((PID[name], season))


def _build(out: Path, real: bool) -> dict:
    cmd = [sys.executable, "pipeline/build_honors.py", "--out-root", str(out)] + ([] if real else ["--fixture"])
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, errors="replace")
    assert proc.returncode == 0, f"build_honors.py failed:\n{proc.stdout}{proc.stderr}"
    doc = json.loads((out / HONORS).read_text(encoding="utf-8"))
    return {
        "real": real,
        "doc": doc,
        "rows": doc["players"],
        "by": {(r["pid"], r["season"]): r for r in doc["players"] if r.get("pid") is not None},
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
    jok_lag = row_of(built, "Nikola Jokić", "2024-25")
    assert jok_lag is not None, "Jokić 2024-25 has no lagged honors row (from 2023-24 awards)"
    assert jok_lag.get("HON_ALL_NBA_TEAM_LAG") == 3.0, f"lag All-NBA first team {jok_lag.get('HON_ALL_NBA_TEAM_LAG')}"
    assert jok_lag.get("HON_ASG_LAG") == 1.0, f"lag ASG {jok_lag.get('HON_ASG_LAG')}"


def test_iverson_vote_points_without_a_top3_team_slot(built):
    # Vote-getter without a top-3 All-NBA slot (ORV tier)
    iverson_cont = built["doc"].get("contemporaneous", {}).get("Allen Iverson|1996-97", {})
    assert iverson_cont.get("allNbaVotePts", 0) > 0
    assert iverson_cont.get("allNbaTeam", 1) == 0


def test_edwards_lagged_vote_recognition(built):
    ed_lag = row_of(built, "Anthony Edwards", "2024-25")
    assert ed_lag is not None and ed_lag.get("HON_VOTE_RECOG") == 1.0


@pytest.mark.parametrize(
    ("name", "season", "awards"),
    [("LeBron James", "2018-19", "2017-18"), ("Tim Duncan", "2000-01", "1999-00")],
)
def test_lag_first_team_from_prior_awards(built, name, season, awards):
    row = row_of(built, name, season)
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


# --- observed zeros vs missing [features#2] -------------------------------------
# A complete award cache lists everyone honored that season, so a charted
# player it omits got 0: that row is emitted with zeros (mask 1 after
# integrate_context). Only seasons and careers the caches cannot see are missing.


def test_unhonored_rows_in_covered_seasons_are_observed_zeros(built):
    if not built["real"]:
        pytest.skip("fixture mode: the fixture covers no complete season")
    # Before: 1,132 rows, one per honored player-season, so 91% of the family was masked.
    assert len(built["rows"]) > 10_000, f"only {len(built['rows'])} lagged rows"
    zero = row_of(built, "Tim Hardaway Jr.", "2014-15")
    assert zero is not None, "an unhonored 2014-15 row is missing instead of zero"
    assert zero["HON_ALL_NBA_VOTE_LAG"] == 0.0 and zero["HON_VOTE_RECOG"] == 0.0 and zero["HON_ASG_LAG"] == 0.0


def test_first_season_has_no_lagged_row(built):
    # The caches start with 1996-97 awards, so 1996-97 rows have no prior season to lag.
    assert not [r for r in built["rows"] if r["season"] == "1996-97"]


def test_no_all_star_game_in_1999_is_missing_not_zero(built):
    if not built["real"]:
        pytest.skip("fixture mode")
    rows = [r for r in built["rows"] if r["season"] == "1999-00"]
    assert rows and all(r["HON_ASG_LAG"] is None for r in rows)
    duncan = row_of(built, "Tim Duncan", "1999-00")
    assert duncan["HON_ALL_NBA_TEAM_LAG"] == 3.0  # the 1998-99 vote itself was measured


def test_asg_count_is_per_player_and_masked_when_the_career_predates_the_caches(built):
    if not built["real"]:
        pytest.skip("fixture mode")
    # Drafted 1984: selections before 1997 are invisible to the caches.
    assert row_of(built, "Michael Jordan", "1997-98")["HON_ASG_CUM"] is None
    # Drafted 1997: 1998 and 2000 games (none in 1999).
    assert row_of(built, "Tim Duncan", "2000-01")["HON_ASG_CUM"] == 2.0
    # The old name-keyed count gave the son his father's selections [features#5].
    assert row_of(built, "Tim Hardaway Jr.", "2014-15")["HON_ASG_CUM"] == 0.0


def test_steve_smith_is_steven_smith(built):
    if not built["real"]:
        pytest.skip("fixture mode")
    # BBRef 'Steve Smith' (62 vote pts, All-Star in 1997-98) is charted as
    # 'Steven Smith' (pid 120). Unmatched, his row was held back (no zero
    # row) and so were 12 other Smiths' (eff24dc1); aliased, it is his.
    cov = built["doc"]["coverage"]
    assert cov["unmatched_honorees"] == []
    row = row_of(built, "Steven Smith", "1998-99")
    assert row["HON_ALL_NBA_VOTE_LAG"] == 62.0 and row["HON_ASG_LAG"] == 1.0


def test_a_partial_all_star_list_is_not_a_zero(built):
    if not built["real"]:
        pytest.skip("fixture mode")
    # honors_award_2025 lists 15 All-Stars (every 1997-2024 list has 22-26):
    # the lag is missing for the whole next season, the count keeps a listed one.
    assert built["doc"]["coverage"]["asg_partial"] == ["2024-25", "2025-26"]
    sga = row_of(built, "Shai Gilgeous-Alexander", "2025-26")
    assert sga["HON_ASG_LAG"] is None and sga["HON_ASG_CUM"] >= 3.0
    giannis = row_of(built, "Giannis Antetokounmpo", "2025-26")
    assert giannis["HON_ASG_LAG"] is None and giannis["HON_ASG_CUM"] is None
    assert giannis["HON_ALL_NBA_VOTE_LAG"] is not None  # the vote list is not partial


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

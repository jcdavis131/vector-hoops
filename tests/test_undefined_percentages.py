"""A percentage with no attempt behind it is missing, not 0.0 or the season prior [final#8].

The dashbase rates are per 100 possessions, rounded half-up to 0.1, so FG3A/100
0.0 means fewer than possessions / 2000 attempts, not none. On the FA1 rows
1,649 FG3_PCT and 56 FT_PCT values sat at mask 1 on rate 0.0, and the a = 0
shrinkage turned each into the season prior; 34 of them carried a measured
non-zero percentage (1.0 x24) the prior replaced.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))


def _row(fg3_pct, fg3a, *, ft_pct=0.8, fta=5.0, **extra):
    r = {"FG3_PCT": fg3_pct, "FG3A": fg3a, "FT_PCT": ft_pct, "FTA": fta, "FG_PCT": 0.45, "FGA": 15.0}
    r.update(extra)
    return r


def test_fewest_attempts_a_rounded_percentage_allows():
    import build_vectors as bv

    assert [bv.fewest_attempts(p) for p in (1.0, 0.5, 0.333, 0.667, 0.25, 0.4)] == [1, 2, 3, 3, 4, 5]


def test_rate_zero_without_evidence_is_missing_and_leaves_the_prior():
    import build_vectors as bv

    rows = [
        _row(0.40, 8.0),  # a shooter
        _row(0.0, 3.0),  # 0 of n: measured
        _row(0.0, 0.0, _poss=3000.0),  # rate 0.0, 0.0, no count: undecided
        _row(0.0, 0.0, _poss=900.0, _gl_att={"FG3A": 0, "FTA": 3, "FGA": 90, "MIN": 400.0}),  # logs: none
    ]
    tally = bv.undefined_percentages(rows)
    assert [r["FG3_PCT"] for r in rows] == [0.40, 0.0, None, None]
    assert tally["FG3_PCT"] == {"undecided (rate 0.0, no count)": 1, "no attempt (game logs)": 1}
    bv.shrink_percentages(rows)
    mu = (0.40 + 0.0) / 2  # over the rows with attempts only
    assert rows[0]["FG3_PCT"] == pytest.approx((0.40 * 8 + mu * 6) / 14)
    assert rows[1]["FG3_PCT"] == pytest.approx((0.0 * 3 + mu * 6) / 9)
    assert rows[2]["FG3_PCT"] is None and rows[3]["FG3_PCT"] is None


def test_a_rounded_rate_with_proven_attempts_keeps_its_value_on_a_count_weight():
    import build_vectors as bv

    rows = [
        _row(0.40, 8.0),
        _row(1.0, 0.0, _poss=2500.0),  # pre-2015: 1.0 proves at least 1 attempt
        _row(0.0, 0.0, _poss=2600.0, _gl_att={"FG3A": 2, "FTA": 10, "FGA": 300, "MIN": 1200.0}),  # 0 for 2
    ]
    tally = bv.undefined_percentages(rows)
    assert tally["FG3_PCT"] == {"proven by the percentage": 1, "proven by the game logs": 1}
    assert rows[1]["_att_n"] == {"FG3A": 1} and rows[2]["_att_n"] == {"FG3A": 2}
    bv.shrink_percentages(rows)
    mu = (0.40 + 1.0 + 0.0) / 3
    a1, a2 = 100 * 1 / 2500, 100 * 2 / 2600
    assert rows[1]["FG3_PCT"] == pytest.approx((1.0 * a1 + mu * 6) / (a1 + 6))
    assert rows[2]["FG3_PCT"] == pytest.approx((0.0 * a2 + mu * 6) / (a2 + 6))
    assert rows[1]["FG3_PCT"] > mu > rows[2]["FG3_PCT"]  # measured, not the pure prior


def test_count_mode_weights_a_rounded_rate_by_the_count():
    import build_vectors as bv

    rows = [
        _row(0.40, 8.0, _total_min=2000.0, PACE=96.0),
        _row(1.0, 0.0, _total_min=1000.0, PACE=96.0, _poss=2000.0, _gl_att={"FG3A": 1, "FTA": 0, "FGA": 1, "MIN": 1.0}),
    ]
    bv.undefined_percentages(rows)
    bv.shrink_percentages(rows, by_count=True)
    mu = (0.40 + 1.0) / 2
    m_count = 6 * ((2000 * 96 / 48 + 1000 * 96 / 48) / 2) / 100  # 6 x the median possessions / 100
    assert rows[1]["FG3_PCT"] == pytest.approx((1.0 * 1 + mu * m_count) / (1 + m_count))


def test_attempts_without_possessions_are_missing_not_the_prior():
    import build_vectors as bv

    rows = [_row(0.40, 8.0), _row(1.0, 0.0)]  # no real minutes: no weight
    tally = bv.undefined_percentages(rows)
    assert rows[1]["FG3_PCT"] is None
    assert tally["FG3_PCT"] == {"attempts but no possessions to weight them": 1}


def test_free_throws_shares_and_catch_and_shoot():
    import build_vectors as bv

    no_three = _row(0.0, 0.0, ft_pct=0.0, fta=0.0, _poss=500.0, CATCH_SHOOT_FG3_PCT=0.0)
    no_three.update(PCT_AST_3PM=0.0, PCT_UAST_3PM=0.0, PCT_AST_2PM=0.6, PCT_UAST_2PM=0.4)
    shooter = _row(0.0, 2.0, CATCH_SHOOT_FG3_PCT=0.0)  # took threes, none caught and shot: kept as sourced
    shooter.update(PCT_AST_3PM=0.0, PCT_UAST_3PM=0.0, PCT_AST_2PM=1.0, PCT_UAST_2PM=0.0)
    rows = [no_three, shooter]
    tally = bv.undefined_percentages(rows)
    assert no_three["FT_PCT"] is None and no_three["FG3_PCT"] is None
    assert no_three["CATCH_SHOOT_FG3_PCT"] is None and shooter["CATCH_SHOOT_FG3_PCT"] == 0.0
    # Both shares of a pair are 0 only when nothing was made: 0/0, both missing.
    assert no_three["PCT_AST_3PM"] is None and no_three["PCT_UAST_3PM"] is None
    assert shooter["PCT_AST_3PM"] is None and shooter["PCT_UAST_3PM"] is None
    assert (shooter["PCT_AST_2PM"], shooter["PCT_UAST_2PM"]) == (1.0, 0.0)  # a measured 0 share stays
    assert tally["PCT_AST_3PM/PCT_UAST_3PM"] == {"no make": 2}
    assert tally["CATCH_SHOOT_FG3_PCT"] == {"no three-point attempt": 1}


def test_gamelog_attempts_count_regular_season_games_only(tmp_path, monkeypatch):
    import build_vectors as bv

    games = [
        {"PLAYER_ID": 7, "GAME_ID": f"00215000{i:02d}", "MIN": 20.0, "FGA": 5, "FG3A": 0, "FTA": 1} for i in range(10)
    ]
    games.append({"PLAYER_ID": 7, "GAME_ID": "0041500101", "MIN": 30.0, "FGA": 9, "FG3A": 2, "FTA": 0})  # playoffs
    (tmp_path / "gamelogs_2015-16.jsonl").write_text("\n".join(json.dumps(g) for g in games), encoding="utf-8")
    monkeypatch.setattr(bv, "DATA_DIR", tmp_path)
    assert bv.gamelog_attempts("2015-16") == {7: {"FGA": 50, "FG3A": 0, "FTA": 10, "MIN": 200.0}}
    assert bv.gamelog_attempts("1999-00") == {}

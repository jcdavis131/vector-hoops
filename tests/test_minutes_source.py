"""build_vectors --minutes-source real [ingest#1, features#0, fork#1].

The Base dashboard is fetched Per100Possessions, so MIN is minutes per 100
possessions (~48 for everyone): GP x MIN clears the 450-minute gate for
every player past the GP gate, and shrinkage weights by attempt rate.
`real` reads real per-game minutes and weights by attempt counts; the
default (per100) is unchanged.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))


def _rows():
    # Same per-100 FT rate and FT% for both; one played a season, one a cameo.
    full = {"FT_PCT": 0.9, "FTA": 6.0, "FG3_PCT": None, "FG3A": None, "FG_PCT": None, "FGA": None}
    cameo = dict(full)
    low = {"FT_PCT": 0.6, "FTA": 6.0, "FG3_PCT": None, "FG3A": None, "FG_PCT": None, "FGA": None}
    full.update(_total_min=2400.0, PACE=100.0)
    cameo.update(_total_min=90.0, PACE=100.0)
    low.update(_total_min=1200.0, PACE=100.0)
    return [full, cameo, low]


def test_per100_shrinkage_is_unchanged():
    import build_vectors as bv

    rows = _rows()
    bv.shrink_percentages(rows)
    mu = (0.9 + 0.9 + 0.6) / 3
    assert rows[0]["FT_PCT"] == pytest.approx((0.9 * 6 + mu * 6) / 12)
    assert rows[0]["FT_PCT"] == rows[1]["FT_PCT"]  # sample size never entered


def test_count_shrinkage_pulls_a_cameo_harder_than_a_season():
    import build_vectors as bv

    rows = _rows()
    bv.shrink_percentages(rows, by_count=True)
    mu = (0.9 + 0.9 + 0.6) / 3
    # possessions = minutes x PACE / 48; prior = 6 x median(possessions) / 100.
    poss = {0: 2400 * 100 / 48, 1: 90 * 100 / 48, 2: 1200 * 100 / 48}
    m = 6 * sorted(poss.values())[1] / 100
    for i in (0, 1):
        a = 6 * poss[i] / 100
        assert rows[i]["FT_PCT"] == pytest.approx((0.9 * a + mu * m) / (a + m))
    assert abs(rows[1]["FT_PCT"] - mu) < abs(rows[0]["FT_PCT"] - mu)


def test_real_minutes_from_game_logs_by_player_id(tmp_path, monkeypatch):
    import build_vectors as bv

    games = [
        {"PLAYER_ID": 7, "PLAYER_NAME": "A B", "GAME_ID": f"00215000{i:02d}", "MIN": 4.0 + i % 2} for i in range(21)
    ]
    games.append({"PLAYER_ID": 7, "PLAYER_NAME": "A B", "GAME_ID": "0041500101", "MIN": 40.0})  # playoffs: ignored
    (tmp_path / "gamelogs_2015-16.jsonl").write_text("\n".join(json.dumps(g) for g in games), encoding="utf-8")
    monkeypatch.setattr(bv, "DATA_DIR", tmp_path)
    by_pid, by_key, src = bv.load_real_minutes("2015-16")
    assert src == "gamelogs" and by_key == {}
    mpg, gp = by_pid[7]
    assert gp == 21 and mpg * gp == pytest.approx(4.0 * 11 + 5.0 * 10, abs=0.2)  # 94 minutes: under any gate


def test_real_minutes_from_bbref_per_game_by_name(tmp_path, monkeypatch):
    import build_vectors as bv

    doc = {"aaronbrooks": {"games": 51.0, "mp_per_g": 11.9}, "nominutes": {"games": 3.0, "mp_per_g": None}}
    (tmp_path / "bbref_per_game_2007-08.json").write_text(json.dumps(doc), encoding="utf-8")
    monkeypatch.setattr(bv, "DATA_DIR", tmp_path / "no_logs")
    monkeypatch.setattr(bv, "CACHE", tmp_path)
    by_pid, by_key, src = bv.load_real_minutes("2007-08")
    assert src == "bbref_per_game" and by_pid == {}
    assert by_key == {"aaronbrooks": (11.9, 51)}  # a row without minutes is no source, not 0


def test_season_eligible_without_minutes_falls_back_to_the_default_gate():
    from eligibility import DEFAULT_MIN_TOTAL_MINUTES, season_eligible

    # schedule_aware=False with no min_total_minutes used to compare against None (TypeError).
    assert season_eligible(20, 30.0, season="2015-16", schedule_aware=False)
    assert not season_eligible(20, (DEFAULT_MIN_TOTAL_MINUTES - 20) / 20, season="2015-16", schedule_aware=False)

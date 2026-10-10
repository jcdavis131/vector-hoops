"""Regular-season features read only regular-season games [ingest#0].

The game logs hold every game type (GAME_ID 001 preseason, 002 regular
season, 003 All-Star, 004 playoffs, 005 play-in, 006 Cup final), and
compute_form_features and competition_context took them all.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from seasons import is_regular_season  # noqa: E402


@pytest.mark.parametrize(
    ("gid", "regular"),
    [
        ("0022300001", True),
        ("0012300001", False),  # preseason
        ("0032300001", False),  # All-Star
        ("0042300405", False),  # playoffs
        ("0052300101", False),  # play-in
        ("0062300001", False),  # Cup final
        (22300001, True),  # an int id lost its leading zeros
        (42300405, False),
        (None, False),
        ("", False),
    ],
)
def test_is_regular_season(gid, regular):
    assert is_regular_season(gid) is regular


def _game(gid: str, pts: int, date: str, team: int = 1, pid: int = 7, mins: float = 30.0) -> dict:
    return {
        "PLAYER_ID": pid,
        "PLAYER_NAME": "A Player" if pid == 7 else "B Player",
        "TEAM_ID": team,
        "GAME_ID": gid,
        "GAME_DATE": date,
        "MIN": mins,
        "PTS": pts,
        "AST": 1,
        "OREB": 1,
        "DREB": 2,
        "STL": 0,
        "BLK": 0,
    }


def test_form_ignores_preseason_and_playoff_games(tmp_path, monkeypatch):
    import build_vectors as bv

    regular = [_game(f"00223000{i:02d}", 10, f"2023-11-{i + 1:02d}") for i in range(12)]
    other = [_game("0012300001", 50, "2023-10-10"), _game("0042300401", 60, "2024-05-01", mins=45.0)]
    (tmp_path / "gamelogs_2023-24.jsonl").write_text(
        "\n".join(json.dumps(g) for g in regular + other), encoding="utf-8"
    )
    monkeypatch.setattr(bv, "DATA_DIR", tmp_path)
    form = bv.compute_form_features("2023-24")["7"]
    # Before: the 50- and 60-point exhibition/playoff games set FORM_CEIL and moved FORM_MIN_AVG.
    assert form["FORM_CEIL"] == 10 and form["FORM_MIN_AVG"] == 30.0


def test_competition_ignores_non_regular_season_games(tmp_path, monkeypatch):
    import competition_context as cc

    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "team_season_2023-24.json").write_text(
        json.dumps([{"TEAM_ID": 1, "NET_RATING": 5.0}, {"TEAM_ID": 2, "NET_RATING": -5.0}]), encoding="utf-8"
    )
    games = []
    for i in range(3):
        gid = f"002230000{i}"
        games += [_game(gid, 10, f"2023-11-{2 * i + 1:02d}"), _game(gid, 10, f"2023-11-{2 * i + 1:02d}", team=2, pid=8)]
    # A preseason game the night before the opener would add a back-to-back.
    games += [_game("0012300009", 10, "2023-10-31"), _game("0012300009", 10, "2023-10-31", team=2, pid=8)]
    (tmp_path / "data" / "gamelogs_2023-24.jsonl").write_text("\n".join(json.dumps(g) for g in games), encoding="utf-8")
    monkeypatch.setattr(cc, "HERE", tmp_path)
    feats = cc.from_logs()[(7, "2023-24")]  # keyed by PLAYER_ID [features#6]
    assert feats["B2B_RATE"] == 0.0 and feats["REST_AVG"] == 2.0

"""Game-log and context joins go by PLAYER_ID, not by how a name is spelled [features#6].

The game logs spell names the way stats.nba.com prints them ('Al-Farouq
Aminu', 'Dennis Schröder', 'Glenn Robinson III'); the charted rows carry the
names the dashbase caches were saved under ('AlFarouq Aminu', 'Dennis
Schroder', 'Glenn Robinson'). Joined by name, 658 gamelog-era rows with 10+
games lost the form, competition, career GP_RATIO and injury families.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))


def _game(gid: str, date: str, *, pid: int, name: str, team: int, mins: float = 30.0, pts: int = 10) -> dict:
    return {
        "PLAYER_ID": pid,
        "PLAYER_NAME": name,
        "TEAM_ID": team,
        "TEAM_ABBREVIATION": f"T{team}",
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


def _write_logs(path: Path, games: list[dict]) -> None:
    path.write_text("\n".join(json.dumps(g) for g in games), encoding="utf-8")


def test_form_context_joins_a_respelled_name_by_player_id(tmp_path, monkeypatch):
    import build_vectors as bv
    import form_context as fc

    data, assets = tmp_path / "data", tmp_path / "assets"
    data.mkdir()
    assets.mkdir()
    games = [
        _game(f"00223000{i:02d}", f"2023-11-{i + 1:02d}", pid=202329, name="Al-Farouq Aminu", team=1) for i in range(12)
    ]
    _write_logs(data / "gamelogs_2023-24.jsonl", games)
    vec = {"players": [{"id": 0, "name": "AlFarouq Aminu", "season": "2023-24", "pid": 202329}]}
    (assets / "vectors.json").write_text(json.dumps(vec), encoding="utf-8")
    monkeypatch.setattr(bv, "DATA_DIR", data)
    monkeypatch.setattr(fc, "DATA", data)
    monkeypatch.setattr(fc, "ASSETS", assets)
    monkeypatch.setattr(fc, "OUT", data / "form_context.json")
    fc.main()
    rows = json.loads((data / "form_context.json").read_text(encoding="utf-8"))["entries"]
    # By name the row was dropped: 'Al-Farouq Aminu' is not a charted name.
    assert [(r["name"], r["player_id"], r["season"]) for r in rows] == [("AlFarouq Aminu", 202329, "2023-24")]


def test_gp_ratio_is_keyed_by_player_id_and_sums_a_traded_players_teams(tmp_path, monkeypatch):
    import build_career_context as bcc

    games = []
    # Team 1: the traded player (pid 7) plays 4 games, a teammate (pid 8) 8.
    for i in range(8):
        games.append(_game(f"0022300{i:03d}", f"2023-11-{i + 1:02d}", pid=8, name="Mate One", team=1))
    for i in range(4):
        games.append(_game(f"0022300{i:03d}", f"2023-11-{i + 1:02d}", pid=7, name="Traded Guy Jr.", team=1))
    # Team 2: he plays 6 more, a teammate (pid 9) 10.
    for i in range(10):
        games.append(_game(f"0022301{i:03d}", f"2023-12-{i + 1:02d}", pid=9, name="Mate Two", team=2))
    for i in range(6):
        games.append(_game(f"0022301{i:03d}", f"2023-12-{i + 1:02d}", pid=7, name="Traded Guy Jr.", team=2))
    _write_logs(tmp_path / "gamelogs_2023-24.jsonl", games)
    monkeypatch.setattr(bcc, "DATA", tmp_path)
    ratios = bcc.load_gp_ratios()
    # Team means 6 (4, 8) and 8 (6, 10): 10 games / 7 = 1.4286. By name the
    # key was 'Traded Guy Jr.' and the last team's 6 / 8 = 0.75 won.
    assert ratios[(7, "2023-24")] == round(10 / 7, 4)
    assert ratios[(8, "2023-24")] == round(8 / 6, 4)  # one team: unchanged


def test_roster_context_matches_charted_rows_by_player_id(tmp_path, monkeypatch):
    import roster_context as rc

    games = []
    for i in range(30):
        games.append(_game(f"0022300{i:03d}", f"2023-11-{i % 28 + 1:02d}", pid=1, name="Karl-Anthony Towns", team=5))
        games.append(_game(f"0022300{i:03d}", f"2023-11-{i % 28 + 1:02d}", pid=2, name="Anthony Edwards", team=5))
    _write_logs(tmp_path / "gamelogs_2023-24.jsonl", games)
    monkeypatch.setattr(rc, "DATA", tmp_path)
    vindex = {
        (1, "2023-24"): {"name": "KarlAnthony Towns", "v": [1.0, 0.0]},
        (2, "2023-24"): {"name": "Anthony Edwards", "v": [0.0, 1.0]},
    }
    entries = rc.compute_season("2023-24", vindex)
    got = sorted((e["player_id"], e["name"], e["ROSTER_MATES_N"]) for e in entries)
    # By name 'Karl-Anthony Towns' (the log's spelling, hyphen kept by
    # canonical_name) missed the charted 'KarlAnthony Towns'.
    assert got == [(1, "KarlAnthony Towns", 1), (2, "Anthony Edwards", 1)]


def test_integrate_joins_on_player_id_and_keeps_name_for_old_artifacts():
    import integrate_context as ic

    with_ids = ic._index([{"name": "Glenn Robinson III", "player_id": 203922, "season": "2015-16", "X": 1.0}], "t")
    old = ic._index([{"name": "Glenn Robinson", "season": "2015-16", "X": 2.0}], "t")
    # The matrix spells him 'Glenn Robinson'; the id joins whatever the spelling.
    assert ic.lookup(with_ids, 203922, "Glenn Robinson", "2015-16")["X"] == 1.0
    assert ic.lookup(with_ids, 203922, "Glenn Robinson", "2016-17") == {}
    assert ic.lookup(old, 203922, "Glenn Robinson", "2015-16")["X"] == 2.0
    # Gary Payton and Gary Payton II share a display name, never an id.
    payton = ic._index([{"name": "Gary Payton", "player_id": 56, "season": "2002-03", "X": 3.0}], "t")
    assert ic.lookup(payton, 1627780, "Gary Payton", "2002-03") == {}


def test_build_row_values_reads_every_artifact_by_player_id():
    import integrate_context as ic

    av = ic._index([{"player_id": 1629029, "name": "Luka Dončić", "season": "2023-24", "GP_PCT": 0.85}], "a")
    vals = ic.build_row_values(
        np.array([1629029]),
        np.array(["Luka Doncic"]),
        np.array(["2023-24"]),
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        av,
    )
    assert vals[0]["INJ_GP_PCT"] == 0.85

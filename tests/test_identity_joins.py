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


def test_gp_ratio_counts_regular_season_games_only(tmp_path, monkeypatch):
    """[final#7] The All-Star Game's pseudo-team was a second team for every All-Star.

    Its roster mean is 1 game, so (gp + 1) / ((team mean + 1) / 2) roughly
    doubled the ratio of all 269 All-Star rows (median 3.58, against 1.52 for
    everyone else): a same-season All-Star flag inside the career tower.
    """
    import build_career_context as bcc

    def season(extra: list[dict]) -> dict:
        games = []
        for i in range(70):  # the star: 70 regular-season games
            games.append(_game(f"00223{i:05d}", "2023-11-01", pid=1, name="Star", team=1))
        for i in range(50):  # a teammate: 50
            games.append(_game(f"00223{i:05d}", "2023-11-01", pid=2, name="Mate", team=1))
        _write_logs(tmp_path / "gamelogs_2023-24.jsonl", games + extra)
        monkeypatch.setattr(bcc, "DATA", tmp_path)
        return bcc.load_gp_ratios()

    plain = season([])
    assert plain[(1, "2023-24")] == round(70 / 60, 4)
    # One All-Star Game (prefix 003, TEAM_ID 1610616833, roster mean 1), plus a
    # preseason (001) and a playoff (004) game for the team: none of them counts.
    extra = [
        _game("0032300001", "2024-02-18", pid=1, name="Star", team=1610616833),
        _game("0032300001", "2024-02-18", pid=3, name="Other Star", team=1610616833),
        _game("0012300001", "2023-10-10", pid=1, name="Star", team=1),
        _game("0042300101", "2024-04-21", pid=1, name="Star", team=1),
        _game("0042300101", "2024-04-21", pid=2, name="Mate", team=1),
    ]
    with_extra = season(extra)
    assert with_extra[(1, "2023-24")] == plain[(1, "2023-24")]
    assert with_extra[(2, "2023-24")] == plain[(2, "2023-24")]
    assert (3, "2023-24") not in with_extra  # only an All-Star Game: no regular-season ratio


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


def test_position_labels_join_on_player_id(tmp_path, monkeypatch):
    """The committed vectors.json spells 275 suffix names the matrix does not [features#7]."""
    import pytest

    pytest.importorskip("torch")
    import train_mtnn

    vec = {
        "players": [
            {"name": "Andre Jackson Jr.", "season": "2023-24", "pid": 1641748, "p": 2},
            {"name": "LeBron James", "season": "2023-24", "pid": 2544, "p": 2},
            {"name": "No Pid", "season": "2023-24", "p": 4},
        ]
    }
    (tmp_path / "vectors.json").write_text(json.dumps(vec), encoding="utf-8")
    monkeypatch.setattr(train_mtnn, "VECTORS", tmp_path / "vectors.json")
    names = np.array(["Andre Jackson", "LeBron James", "No Pid"])
    seasons = np.array(["2023-24"] * 3)
    pids = np.array([1641748, 2544, 99])
    assert train_mtnn.load_positions(names, seasons, pids).tolist() == [2, 2, 4]  # by id, then by name
    assert train_mtnn.load_positions(names, seasons).tolist() == [-1, 2, 4]  # by name the suffix row is lost


def _skill_npz(path: Path, names, seasons, grades, pids=None, mask=None) -> Path:
    arrays = {"name": np.array(names), "season": np.array(seasons), "keys": np.array(["a", "b"])}
    arrays["grades"] = np.array(grades, dtype=np.float32)
    if pids is not None:
        arrays["player_id"] = np.array(pids, dtype=np.int64)
    if mask is not None:
        arrays["mask"] = np.array(mask, dtype=np.float32)
    np.savez_compressed(path, **arrays)
    return path


def test_skill_labels_join_on_player_id(tmp_path, capsys):
    """[final#23] Labels built against the committed vectors.json lost its 275 suffix rows by name."""
    import pytest

    pytest.importorskip("torch")
    import train_mtnn

    names = np.array(["Andre Jackson", "LeBron James"])
    seasons = np.array(["2023-24", "2023-24"])
    pids = np.array([1641748, 2544])
    label_names, grades = ["Andre Jackson Jr.", "LeBron James"], [[0.1, 0.2], [0.9, 0.8]]
    with_ids = _skill_npz(
        tmp_path / "ids.npz", label_names, ["2023-24"] * 2, grades, pids=[1641748, 2544], mask=[[1, 0], [1, 1]]
    )
    G, M, keys = train_mtnn._join_skill_npz(with_ids, names, seasons, pids)
    assert keys == ["a", "b"] and np.allclose(G, grades)
    assert M.tolist() == [[1, 0], [1, 1]]  # the file's per-skill mask
    # A file without ids (every file before the fix) still joins by name: the suffix row is lost, and said.
    legacy = _skill_npz(tmp_path / "legacy.npz", label_names, ["2023-24"] * 2, grades)
    G, M, _ = train_mtnn._join_skill_npz(legacy, names, seasons, pids)
    assert M.tolist() == [[0, 0], [1, 1]]
    assert "1 of its 2 rows join the matrix by (name, season)" in capsys.readouterr().out


def test_an_id_keyed_label_file_that_misses_rows_stops_the_run(tmp_path):
    import pytest

    pytest.importorskip("torch")
    import train_mtnn

    n = 200
    names = np.array([f"P{i}" for i in range(n)])
    seasons = np.array(["2023-24"] * n)
    pids = np.arange(n)
    grades = [[0.5, 0.5]] * n
    # 2 of 200 rows keyed to another vectors.json (1%): trained on, with a line.
    near = _skill_npz(tmp_path / "near.npz", names, seasons, grades, pids=[*range(198), 900, 901])
    _, M, _ = train_mtnn._join_skill_npz(near, names, seasons, pids)
    assert int(M[:, 0].sum()) == 198
    # 3 of 200 (1.5%): stale or mis-keyed, the run stops before training.
    far = _skill_npz(tmp_path / "far.npz", names, seasons, grades, pids=[*range(197), 900, 901, 902])
    with pytest.raises(SystemExit, match=r"197 of its 200 rows join the matrix by \(player_id, season\)"):
        train_mtnn._join_skill_npz(far, names, seasons, pids)


def test_position_labels_under_half_stop_the_run_unless_allowed(tmp_path, monkeypatch, capsys):
    """[eval#10] A vectors.json without enrich_vectors' `p` used to print a WARNING and train on.

    The position head then learned from nothing and the CQS position
    component read 0.0: a broken prepare step scored as a worse model.
    """
    import pytest

    pytest.importorskip("torch")
    import train_mtnn

    vec = {"players": [{"name": n, "season": "2023-24", "pid": i} for i, n in enumerate("ABC")]}
    vec["players"][0]["p"] = 1  # 1 of 3 labelled: 33%
    (tmp_path / "vectors.json").write_text(json.dumps(vec), encoding="utf-8")
    monkeypatch.setattr(train_mtnn, "VECTORS", tmp_path / "vectors.json")
    names, seasons, pids = np.array(list("ABC")), np.array(["2023-24"] * 3), np.array([0, 1, 2])
    with pytest.raises(SystemExit, match=r"cover only 33\.3%.*enrich_vectors.*--allow-missing-positions"):
        train_mtnn.load_positions(names, seasons, pids)
    assert train_mtnn.load_positions(names, seasons, pids, allow_missing=True).tolist() == [1, -1, -1]
    assert "WARNING: position labels cover only 33.3%" in capsys.readouterr().out

    # No vectors.json at all is 0% coverage, the same stop.
    monkeypatch.setattr(train_mtnn, "VECTORS", tmp_path / "absent.json")
    with pytest.raises(SystemExit, match=r"absent\.json missing"):
        train_mtnn.load_positions(names, seasons, pids)
    assert train_mtnn.load_positions(names, seasons, pids, allow_missing=True).tolist() == [-1, -1, -1]

    # The option exists, off by default (so the herdmux climb's runs are unchanged).
    assert train_mtnn.build_parser().parse_args([]).allow_missing_positions is False

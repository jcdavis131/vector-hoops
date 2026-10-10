"""hill_climb and sweep_stability score each trial on that trial's own files [orchestration#7].

Both used to measure continuity on pipeline/data/embedding_v3.npz, which since
2026-08-11 is the promoted embedding (trials write theirs to _scratch), so the
continuity columns were one number repeated across every arm. hill_climb's
cache key also ignored --arch-dim. Training is replaced by a stub that writes
a run directory, so nothing here imports torch or touches pipeline/data.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
import hill_climb as hc  # noqa: E402
import sweep_stability as ss  # noqa: E402

REPORT = {
    "held_out_recall": {
        "test": {"recall_at_10_mtnn": 0.5},
        "val": {"recall_at_10_mtnn": 0.6},
        "all": {"recall_at_10_mtnn": 0.7},
        "train": {"recall_at_10_mtnn": 0.9},
    },
    "composite": {"cqs": 70.0},
    "cross_era_archetype_neighbor_purity_at_20": 0.6,
    "position_top1_acc": 0.8,
}


def _write_run(run_dir: Path, cos: float) -> None:
    """A run directory whose 2016-2019 same-player transitions all have cosine `cos`."""
    run_dir.mkdir(parents=True, exist_ok=True)
    a = np.array([1.0, 0.0], dtype=np.float32)
    b = np.array([cos, np.sqrt(1 - cos * cos)], dtype=np.float32)
    E, pid, season = [], [], []
    for p in range(40):
        for k, y in enumerate(range(2016, 2020)):
            E.append(a if k % 2 == 0 else b)
            pid.append(p)
            season.append(f"{y}-{str(y + 1)[2:]}")
    np.savez(run_dir / "embedding_v3.npz", E=np.array(E), player_id=np.array(pid), season=np.array(season))
    (run_dir / "mtnn_report.json").write_text(json.dumps(REPORT), encoding="utf-8")


def _fake_train(calls: list[list[str]], cos: float):
    def run(cmd, *a, **k):
        calls.append(list(cmd))
        _write_run(Path(cmd[cmd.index("--run-dir") + 1]), cos)

    return run


@pytest.fixture
def climb(tmp_path, monkeypatch):
    monkeypatch.setattr(hc, "OUT", tmp_path)
    monkeypatch.setattr(hc, "RUNS", tmp_path / "runs")
    monkeypatch.setattr(hc, "_code_and_matrix", lambda: '{"git": "x", "matrix_sha256": "y"}')
    return tmp_path


def test_cache_key_changes_with_arch_dim_under_the_same_tag(climb):
    d48 = hc.override(hc.BASE_ARCH, {"--dim": "48"})
    d64 = hc.override(hc.BASE_ARCH, {"--dim": "64"})
    assert hc.cache_key("full", d48, [], 7, 20) != hc.cache_key("full", d64, [], 7, 20)
    assert hc.cache_key("full", d48, [], 7, 20).startswith("full|s7|e20|")


def test_cache_key_changes_with_commit_or_matrix(climb, monkeypatch):
    k1 = hc.cache_key("full", hc.BASE_ARCH, [], 7, 20)
    monkeypatch.setattr(hc, "_code_and_matrix", lambda: '{"git": "x", "matrix_sha256": "z"}')
    assert hc.cache_key("full", hc.BASE_ARCH, [], 7, 20) != k1


def test_two_different_dirty_trees_on_one_head_do_not_share_a_key(monkeypatch):
    # The key used to carry only dirty=True, so a second uncommitted edit on
    # the same HEAD reused the first edit's run directory as "the same trial".
    monkeypatch.setattr(hc, "sha256_file", lambda p: "m")
    states = {}
    for label, dirty, diff in [("edit1", True, "d1"), ("edit2", True, "d2"), ("clean", False, "unused")]:
        monkeypatch.setattr(hc, "git_state", lambda root, dirty=dirty: {"sha": "abc", "dirty": dirty})
        monkeypatch.setattr(hc, "_tracked_py_diff_sha256", lambda diff=diff: diff)
        hc._code_and_matrix.cache_clear()
        states[label] = json.loads(hc._code_and_matrix())
    hc._code_and_matrix.cache_clear()
    assert states["edit1"]["py_diff_sha256"] == "d1" and states["edit2"]["py_diff_sha256"] == "d2"
    assert states["edit1"] != states["edit2"]
    assert "py_diff_sha256" not in states["clean"]  # a clean tree keeps its old key


def test_a_trial_is_scored_on_its_own_run_directory(climb, monkeypatch):
    calls: list[list[str]] = []
    monkeypatch.setattr(hc.subprocess, "run", _fake_train(calls, 0.5))
    row = hc.run_one("full", hc.BASE_ARCH, [], 7, 20)
    assert len(calls) == 1 and "--run-dir" in calls[0]
    assert row["cqs"] == 70.0
    assert row["continuity_min"] == pytest.approx(0.5, abs=1e-4)
    assert row["continuity_spread"] == pytest.approx(0.0, abs=1e-4)
    assert Path(row["run_dir"]).parent == (climb / "runs").resolve()


def test_a_finished_run_directory_is_reused_not_retrained(climb, monkeypatch):
    calls: list[list[str]] = []
    monkeypatch.setattr(hc.subprocess, "run", _fake_train(calls, 0.5))
    hc.run_one("full", hc.BASE_ARCH, [], 7, 20)
    hc.run_one("full", hc.BASE_ARCH, [], 7, 20)
    assert len(calls) == 1


def test_two_arms_get_two_continuity_numbers(climb, monkeypatch):
    calls: list[list[str]] = []
    monkeypatch.setattr(hc.subprocess, "run", _fake_train(calls, 0.5))
    a = hc.run_one("full", hc.BASE_ARCH, [], 7, 20)
    monkeypatch.setattr(hc.subprocess, "run", _fake_train(calls, 0.9))
    b = hc.run_one("drop_bio", hc.BASE_ARCH, ["bio"], 7, 20)
    assert a["continuity_min"] != b["continuity_min"]


def test_sweep_arm_trains_into_and_reads_its_own_directory(tmp_path, monkeypatch):
    monkeypatch.setattr(ss, "OUT", tmp_path)
    calls: list[list[str]] = []
    monkeypatch.setattr(ss.subprocess, "run", _fake_train(calls, 0.7))
    row = ss.run_arm("base", ss.ARMS["base"], 7)
    assert calls[0][calls[0].index("--run-dir") + 1] == str(tmp_path / "base_s7")
    assert row["continuity_min"] == pytest.approx(0.7, abs=1e-4)


def test_sweep_refuses_before_training_when_an_arm_directory_holds_a_run(tmp_path, monkeypatch):
    monkeypatch.setattr(ss, "OUT", tmp_path)
    monkeypatch.setattr(ss, "ROOT", tmp_path)
    _write_run(tmp_path / "base_s7", 0.5)
    calls: list[list[str]] = []
    monkeypatch.setattr(ss.subprocess, "run", _fake_train(calls, 0.5))
    monkeypatch.setattr(sys, "argv", ["sweep_stability.py", "--arms", "base", "--seeds", "7"])
    with pytest.raises(SystemExit, match="already hold a run"):
        ss.main()
    assert calls == []

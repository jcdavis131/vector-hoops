"""tower_ablation trains the measured recipe, pairs arms by seed, and reads each run's own report [eval#13].

It used to run one seed on a recipe that no longer shipped, call a family
KEEP on a 0.01 test-recall threshold (a third of the seed sd), and read the
shared last-run report. Training is stubbed by a writer of run directories;
only the parser check imports train_mtnn (and torch).
"""

from __future__ import annotations

import importlib
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
import feature_stress as fs  # noqa: E402
import tower_ablation as ta  # noqa: E402

# CQS per (arm, seed). drop_a costs ~2 CQS on every seed (t far past 3.5);
# drop_b moves CQS by noise.
CQS = {
    ("full", 5): 77.0,
    ("full", 7): 78.0,
    ("full", 13): 77.5,
    ("drop_a", 5): 75.1,
    ("drop_a", 7): 76.0,
    ("drop_a", 13): 75.4,
    ("drop_b", 5): 77.8,
    ("drop_b", 7): 77.1,
    ("drop_b", 13): 77.6,
}


def _report(cqs: float) -> dict:
    h = {"recall_at_10_mtnn": 0.8}
    return {
        "composite": {"cqs": cqs},
        "held_out_recall": {"test": h, "val": h, "all": h},
        "cross_era_archetype_neighbor_purity_at_20": 0.7,
    }


@pytest.fixture
def stubbed(tmp_path, monkeypatch):
    monkeypatch.setattr(ta, "OUT", tmp_path / "runs")
    monkeypatch.setattr(ta, "SUMMARY", tmp_path / "tower_ablation.json")
    monkeypatch.setattr(ta, "ROOT", tmp_path)
    monkeypatch.setattr(ta, "manifest_families", lambda: ["a", "b"])
    calls: list[list[str]] = []

    def run(cmd, *a, **k):
        calls.append(list(cmd))
        out = Path(cmd[cmd.index("--run-dir") + 1])
        name, seed = out.name.rsplit("_s", 1)
        out.mkdir(parents=True)
        cqs = CQS.get((name, int(seed)), 77.5)
        (out / "mtnn_report.json").write_text(json.dumps(_report(cqs)), encoding="utf-8")

    monkeypatch.setattr(ta.subprocess, "run", run)
    return tmp_path, calls


def test_arms_train_the_measure_recipe_into_their_own_run_dirs(stubbed, monkeypatch):
    tmp_path, calls = stubbed
    monkeypatch.setattr(sys, "argv", ["tower_ablation.py", "--seeds", "5,7,13"])
    ta.main()
    assert len(calls) == 4 * 3  # full, drop_a, drop_b, drop_form_pedigree
    for cmd in calls:
        assert cmd[cmd.index("--recipe") + 1] == "measure"
        assert "--dim" not in cmd and "--nce-player-weight" not in cmd
    out = json.loads((tmp_path / "tower_ablation.json").read_text(encoding="utf-8"))
    assert out["runs"]["drop_a"]["verdict"] == "family helps"
    assert out["runs"]["drop_a"]["paired"]["cqs"]["t"] <= -ta.PAIRED_T
    assert out["runs"]["drop_b"]["verdict"] == "inside paired noise"
    assert out["runs"]["drop_a"]["test_recall"] == 0.8 and out["baseline_test"] == 0.8


def test_one_seed_is_refused_before_training(stubbed, monkeypatch):
    _, calls = stubbed
    monkeypatch.setattr(sys, "argv", ["tower_ablation.py", "--seeds", "7"])
    with pytest.raises(SystemExit, match="at least 2 seeds"):
        ta.main()
    assert calls == []


def test_an_occupied_run_dir_is_refused_before_training(stubbed, monkeypatch):
    tmp_path, calls = stubbed
    (tmp_path / "runs" / "drop_b_s7").mkdir(parents=True)
    (tmp_path / "runs" / "drop_b_s7" / "mtnn_report.json").write_text("{}", encoding="utf-8")
    monkeypatch.setattr(sys, "argv", ["tower_ablation.py", "--seeds", "5,7"])
    with pytest.raises(SystemExit, match="already hold a run"):
        ta.main()
    assert calls == []


def test_feature_stress_gives_no_verdict_for_a_single_seed_file(tmp_path, monkeypatch):
    old = {"baseline_test": 0.80, "runs": {"full": {"test_recall": 0.80}, "drop_x": {"test_recall": 0.75}}}
    path = tmp_path / "tower_ablation.json"
    path.write_text(json.dumps(old), encoding="utf-8")
    monkeypatch.setattr(fs, "TOWER_ABLATION", path)
    (row,) = fs.ablation_summary()["drop_one"]
    assert row["family_helps"] is None and row["delta_test_recall"] == -0.05


def test_the_command_parses_with_train_mtnn():
    pytest.importorskip("torch")
    tm = importlib.import_module("train_mtnn")
    cmd = ta.train_cmd(["bio"], 7, None, "cpu")
    args = tm.parse_args([*cmd[2:], "--run-dir", "x"]).args
    assert args.dim == 64 and args.epochs == 40 and args.mask_families == "bio"

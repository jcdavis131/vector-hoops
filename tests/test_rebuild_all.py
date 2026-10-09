"""pipeline/rebuild_all.py: plan order, fail-fast, no fixtures, dry runs, and parity with the climb.

No pipeline step runs here. rebuild_all's reference to the subprocess module is
replaced with a recorder, git and library lookups are stubbed, and run records
go to tmp_path, never pipeline/data.

Run:  python -m pytest tests/test_rebuild_all.py
"""

from __future__ import annotations

import json
import shlex
import sys
import types
from pathlib import Path

import pytest
from climb_protocol import climb_py, hoops_protocol

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import rebuild_all as ra  # noqa: E402
from artifact_io import sha256_file  # noqa: E402

PREPARE = ["build_vectors", "enrich_vectors", "integrate_context"]
EXPORT = [
    "export_assets",
    "export_mtnn_embeddings",
    "export_mtnn_jacobian",
    "export_mtnn_viz",
    "export_season_norms",
    "procrustes_drift",
    "archetype_time",
    "build_scoring_lite",
]
DEFAULT_PLAN = [*PREPARE, "stage_contract", "train_mtnn", "promote", *EXPORT, "test_scoring_lite", "verify_accuracy"]


class Recorder:
    """Stands in for the subprocess module inside rebuild_all only."""

    def __init__(self, fail_at: str | None = None, rc: int = 3):
        self.fail_at, self.rc, self.calls = fail_at, rc, []

    def run(self, cmd, cwd=None):
        assert cmd[0] == sys.executable and cmd[1] == "-u", cmd
        name = Path(cmd[2]).stem
        self.calls.append(name)
        return types.SimpleNamespace(returncode=self.rc if name == self.fail_at else 0)


class Forbidden:
    def run(self, *a, **k):
        raise AssertionError("a step was run")


@pytest.fixture
def runs(tmp_path, monkeypatch):
    monkeypatch.setattr(ra, "RUNS_DIR", tmp_path / "runs")
    monkeypatch.setattr(ra, "git_state", lambda root: {"sha": "f" * 40, "short": "ffffffff", "dirty": False})
    monkeypatch.setattr(ra, "env_versions", lambda: {"python": "test"})
    return tmp_path / "runs"


def only_record(runs: Path) -> dict:
    (run_dir,) = list(runs.iterdir())
    return json.loads((run_dir / "rebuild.json").read_text(encoding="utf-8"))


# --- the plan ------------------------------------------------------------------


def test_default_plan_order_and_stages():
    plan = ra.build_plan()
    assert [s.name for s in plan] == DEFAULT_PLAN
    order = [ra.STAGES.index(s.stage) for s in plan]
    assert order == sorted(order), "stages run matrix -> train -> export -> verify"
    assert not any(s.context for s in plan)


def test_context_block_sits_between_enrich_and_integrate():
    names = [s.name for s in ra.build_plan(refresh_context=True)]
    ctx = [s.name for s in ra.build_plan(refresh_context=True) if s.context]
    assert ctx and names[: 2 + len(ctx) + 1] == ["build_vectors", "enrich_vectors", *ctx, "integrate_context"]
    # Dependencies inside the block.
    for before, after in (
        ("roster_context", "build_career_context"),
        ("roster_context", "derive_system_tags"),
        ("build_availability", "build_career_context"),
        ("build_honors", "build_player_meta"),
    ):
        assert names.index(before) < names.index(after)


def test_default_matrix_steps_are_the_climb_prepare_chain():
    matrix = [s for s in ra.build_plan() if s.stage == "matrix" and s.name != "stage_contract"]
    assert [s.command(python="python")[1:] for s in matrix] == [
        ["-u", "pipeline/build_vectors.py", "--offline"],
        ["-u", "pipeline/enrich_vectors.py"],
        ["-u", "pipeline/integrate_context.py"],
    ]


def test_matrix_steps_equal_herdmux_climb_protocol():
    path = climb_py()
    if path is None:
        pytest.skip("herdmux gpu/climb.py not on this machine (set HERDMUX_ROOT to point at it)")
    prepare = [shlex.split(cmd) for cmd in hoops_protocol(path, "prepare")]
    matrix = [s for s in ra.build_plan() if s.stage == "matrix" and s.name != "stage_contract"]
    assert [p[1:] for p in prepare] == [s.command()[1:] for s in matrix], (
        f"rebuild_all's matrix stage drifted from the climb's prepare in {path}"
    )


@pytest.mark.parametrize("recipe", ["ship", "legacy-v5-refit", "legacy-v6-refit"])
@pytest.mark.parametrize("refresh", [False, True])
def test_no_step_uses_a_fixture_or_the_retired_paths(recipe, refresh):
    for s in ra.build_plan(recipe=recipe, refresh_context=refresh):
        assert "--fixture" not in s.argv, s
        assert not any(x in s.argv[0] for x in ("bootstrap_train_matrix", "ablate_v5", "sweep_v5")), s


def test_train_sh_is_a_wrapper_with_no_fixture_and_nothing_swallowed():
    code = [
        ln for ln in (ROOT / "train.sh").read_text(encoding="utf-8").splitlines() if not ln.lstrip().startswith("#")
    ]
    for bad in ("--fixture", "|| true", "|| echo", "train_mtnn.py", "bootstrap_train_matrix"):
        assert not [ln for ln in code if bad in ln], f"train.sh runs {bad!r} itself"
    assert [ln for ln in code if ln.startswith("exec ") and "pipeline/rebuild_all.py" in ln]


def test_makefile_build_and_train_go_through_rebuild_all():
    lines = (ROOT / "Makefile").read_text(encoding="utf-8").splitlines()
    recipe = {
        lines[i].split(":")[0]: lines[i + 1].strip() for i in range(len(lines) - 1) if lines[i] in ("build:", "train:")
    }
    assert recipe == {
        "build": "$(PYTHON) pipeline/rebuild_all.py --to stage_contract",
        "train": "$(PYTHON) pipeline/rebuild_all.py --quick",
    }


def test_device_is_passed_only_when_given():
    train = next(s for s in ra.build_plan() if s.name == "train_mtnn")
    assert "--device" not in train.argv
    train = next(s for s in ra.build_plan(device="cuda") if s.name == "train_mtnn")
    assert train.argv[-2:] == ("--device", "cuda")


def test_train_writes_its_bundle_to_the_run_dir_and_promote_checks_it_before_any_export():
    """The torn-triple fix [orchestration#0]: the train step names the run
    directory, never --write-artifacts, and promote.py runs on that directory
    before the first exporter."""
    plan = ra.build_plan(run_dir="pipeline/data/runs/R")
    names = [s.name for s in plan]
    train = plan[names.index("train_mtnn")]
    promote = plan[names.index("promote")]
    assert "--write-artifacts" not in train.argv
    i = train.argv.index("--run-dir")
    assert train.argv[i + 1] == "pipeline/data/runs/R"
    assert promote.argv == ("pipeline/promote.py", "--run", "pipeline/data/runs/R")
    first_export = min(k for k, s in enumerate(plan) if s.stage == "export")
    assert names.index("train_mtnn") < names.index("promote") < first_export
    forced = next(s for s in ra.build_plan(promote_force="reviewed") if s.name == "promote")
    assert forced.argv[-2:] == ("--force", "reviewed")


def test_a_real_run_passes_its_own_run_dir_to_train_and_promote(runs, monkeypatch):
    rec = Recorder()
    monkeypatch.setattr(ra, "subprocess", rec)
    assert ra.main(["--only", "train_mtnn", "--only", "promote", "--promote-force", "why"]) == 0
    doc = only_record(runs)
    train, promote = (next(s for s in doc["steps"] if s["name"] == n) for n in ("train_mtnn", "promote"))
    run_dir = train["argv"][train["argv"].index("--run-dir") + 1]
    assert Path(run_dir).name == doc["run_id"]
    assert promote["argv"][-4:] == ["--run", run_dir, "--force", "why"]
    assert doc["options"]["promote_force"] == "why"


def test_epochs_are_passed_only_when_asked_for(capsys, runs):
    """Without --epochs/--quick/--full the recipe's own count stands (ship:
    40). --epochs 0 is a value, not a missing one."""
    cases = (
        ([], None),
        (["--quick"], "40"),
        (["--full"], "150"),
        (["--quick", "--epochs", "20"], "20"),
        (["--epochs", "0"], "0"),
    )
    for argv, want in cases:
        assert ra.main(["--dry-run", "--only", "train_mtnn", *argv]) == 0
        out = capsys.readouterr().out
        if want is None:
            assert "--epochs" not in out
        else:
            assert f"--epochs {want} " in out


def test_the_train_step_trains_a_recipe_and_spells_no_flags_of_its_own():
    """The inline SHIPPING_RECIPES are gone [orchestration#3]; every training
    flag comes from the recipe file."""
    train = next(s for s in ra.build_plan() if s.name == "train_mtnn")
    assert train.argv[:3] == ("pipeline/train_mtnn.py", "--recipe", "ship")
    flags = {a for a in train.argv if a.startswith("--")}
    assert flags == {"--recipe", "--run-dir"}
    assert not hasattr(ra, "SHIPPING_RECIPES")


def test_batch_and_seed_are_passed_only_when_given(capsys, runs):
    """A flag on train_mtnn's command line beats the recipe's value, so this
    script's own defaults must not be passed on every run."""
    train = next(s for s in ra.build_plan(batch=256, seed=5) if s.name == "train_mtnn")
    assert train.argv[3:7] == ("--batch", "256", "--seed", "5")
    assert ra.main(["--dry-run", "--only", "train_mtnn", "--seed", "13"]) == 0
    out = capsys.readouterr().out
    assert "--seed 13 " in out and "--batch" not in out


def test_v6_is_the_legacy_v6_refit_and_excludes_recipe(capsys, runs):
    assert ra.main(["--dry-run", "--only", "train_mtnn", "--v6"]) == 0
    assert "--recipe legacy-v6-refit " in capsys.readouterr().out
    with pytest.raises(SystemExit) as e:
        ra.main(["--dry-run", "--v6", "--recipe", "ship"])
    assert e.value.code == 2


def test_a_recipe_path_is_passed_relative_to_the_repo_root(capsys, runs):
    path = ROOT / "pipeline" / "recipes" / "measure.json"
    assert ra.main(["--dry-run", "--only", "train_mtnn", "--recipe", str(path)]) == 0
    assert "--recipe pipeline/recipes/measure.json " in capsys.readouterr().out


def test_an_unknown_recipe_stops_the_run_before_any_step(runs, monkeypatch):
    monkeypatch.setattr(ra, "subprocess", Forbidden())
    with pytest.raises(SystemExit, match="--recipe nope: no recipe of that name"):
        ra.main(["--recipe", "nope"])
    assert not runs.exists()


# --- selection -----------------------------------------------------------------


def test_from_to_only_and_stage():
    plan = ra.build_plan()
    names = lambda steps: [s.name for s in steps]  # noqa: E731
    assert names(ra.select(plan, stages=["matrix"])) == [*PREPARE, "stage_contract"]
    assert names(ra.select(plan, stop="stage_contract")) == [*PREPARE, "stage_contract"]
    assert names(ra.select(plan, start="build_scoring_lite", stop="test_scoring_lite")) == [
        "build_scoring_lite",
        "test_scoring_lite",
    ]
    assert names(ra.select(plan, only=["verify_accuracy", "build_vectors"])) == ["build_vectors", "verify_accuracy"]
    with pytest.raises(SystemExit, match="no such step"):
        ra.select(plan, only=["bootstrap_train_matrix"])
    with pytest.raises(SystemExit, match="--refresh-context"):
        ra.select(plan, only=["build_pedigree"], all_steps=ra.build_plan(refresh_context=True))


# --- running -------------------------------------------------------------------


def test_fail_fast_stops_at_the_first_failure_and_exits_nonzero(runs, monkeypatch, capsys):
    rec = Recorder(fail_at="integrate_context", rc=3)
    monkeypatch.setattr(ra, "subprocess", rec)
    assert ra.main(["--stage", "matrix"]) == 3
    assert rec.calls == ["build_vectors", "enrich_vectors", "integrate_context"]
    assert "FAILED at integrate_context (exit 3)" in capsys.readouterr().out

    doc = only_record(runs)
    assert doc["status"] == "failed" and doc["failed_step"] == "integrate_context"
    assert doc["not_run"] == ["stage_contract"]
    assert [(s["name"], s["returncode"]) for s in doc["steps"]] == [
        ("build_vectors", 0),
        ("enrich_vectors", 0),
        ("integrate_context", 3),
    ]
    assert doc["git"]["short"] == "ffffffff" and doc["env_versions"] == {"python": "test"}


def test_odd_exit_codes_still_fail(runs, monkeypatch):
    """A Windows crash code or a POSIX signal (negative) must not wrap to 0."""
    for rc in (-9, 3221225477):
        monkeypatch.setattr(ra, "subprocess", Recorder(fail_at="build_vectors", rc=rc))
        assert ra.main(["--only", "build_vectors"]) == 1


def test_a_full_pass_records_every_step(runs, monkeypatch):
    rec = Recorder()
    monkeypatch.setattr(ra, "subprocess", rec)
    assert ra.main([]) == 0
    assert rec.calls == DEFAULT_PLAN
    doc = only_record(runs)
    assert doc["status"] == "ok" and [s["name"] for s in doc["steps"]] == DEFAULT_PLAN
    contract = next(s for s in doc["steps"] if s["name"] == "stage_contract")
    assert contract["argv"][-1].endswith(f"{doc['run_id']}/train_matrix.stats.json")
    ship = ROOT / "pipeline" / "recipes" / "ship.json"
    assert doc["options"]["recipe"] == "ship"
    assert doc["recipe"] == {"name": "ship", "path": "pipeline/recipes/ship.json", "sha256": sha256_file(ship)}


def test_dry_run_and_list_run_and_write_nothing(runs, monkeypatch, capsys):
    monkeypatch.setattr(ra, "subprocess", Forbidden())
    assert ra.main(["--dry-run"]) == 0
    assert ra.main(["--list", "--refresh-context", "--v6"]) == 0
    assert not runs.exists()
    out = capsys.readouterr().out
    assert "pipeline/build_vectors.py --offline" in out


def test_missing_real_cache_stops_the_run_before_any_step(runs, monkeypatch, capsys):
    monkeypatch.setattr(ra, "subprocess", Forbidden())
    monkeypatch.setattr(ra.real_caches, "wide_skills", lambda: "wide_skills_2013-14.json is a proxy doc")
    assert ra.main(["--refresh-context", "--stage", "matrix"]) == 1
    out = capsys.readouterr().out
    assert "cannot run build_wide_skills: wide_skills_2013-14.json is a proxy doc" in out
    assert "nothing was run" in out
    assert not runs.exists()

"""End to end: the real chain, run as processes, on a 100-player slice of real data.

Every other test of the train -> promote -> export path calls one module's
functions on hand-built bundles (bundle_fixtures.make_run). Nothing ran the
chain the way an operator does, so nothing showed that train_mtnn's lineage
block and write_run_bundle produce a run directory promote.py accepts, that
the exporters read what promote wrote, or that the served-model check passes
on what the exporters write. This does, in CI too (CPU torch is installed
there; pipeline/data is not, hence the committed slice).

The skeleton. tests/fixtures/e2e_slice/ (README.md says how it was cut) is
copied with pipeline/*.py, pipeline/recipes, pipeline/contracts,
scripts/check_served_model.py and scripts/sync_public.py into a throwaway
repo under tmp_path. Every module resolves its paths from its own file
(ROOT = Path(__file__).resolve().parents[1]), so the copied tree is
self-contained: no environment override and no monkeypatching, since the
steps are subprocesses. Then, from the skeleton's root:

  train_mtnn.py --recipe measure --epochs 1 --device cpu --seed 5 --run-dir <run>
  promote.py --run <run> --force "e2e smoke: 1 epoch on a 100-player slice"
  export_assets.py (export_mtnn_embeddings, then archetype_time and
    career_trajectories on the new f32, project_next_season,
    export_mtnn_viz), export_mtnn_jacobian --device cpu --granularity both,
    build_scoring_lite
  scripts/sync_public.py
  scripts/check_served_model.py            -> exit 0
  verify_accuracy V13 + V13b on the exported files -> exit 0

--force because one epoch on 100 players clears neither should_promote nor
the export floors (archetype top-1 0.115, purity 0.56 on this box); a
forced promotion waives the floors and the served lineage records it.
export_assets runs since it stopped rebuilding the side builders' outputs
[final#25]; its steps that need pipeline/cache (season norms, drift, current
rosters) fail softly on the slice, as it allows, and the test checks it
wrote nothing under pipeline/data. No metric value is asserted, only that
every file names the same bytes: the report's lineage, the promoted manifest
and CURRENT.json, the legacy paths, assets/mtnn_lineage.json, the meta and
every sidecar. A second skeleton runs export_assets with nothing promoted,
the way the live assets were built (origin b7ccea45).

8 to 16 s on the training box's CPU (measured 8.4 s and 15.4 s); nothing is
written outside tmp_path. One more test trains a second skeleton the same
way under --protocol-v2 with skill_labels.npz removed, to check the CQS
rule that reads the report's lineage on a report the trainer wrote.

Run:  python -m pytest tests/test_e2e_smoke.py
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

# Only the subprocesses need torch. Checked, not imported: importing it here
# would hold several hundred MB in the pytest process beside each step's own.
if importlib.util.find_spec("torch") is None:
    pytest.skip("torch is not installed", allow_module_level=True)

ROOT = Path(__file__).resolve().parents[1]
SLICE = ROOT / "tests" / "fixtures" / "e2e_slice"
sys.path.insert(0, str(ROOT / "pipeline"))

import artifact_io as aio  # noqa: E402
import served_model as sm  # noqa: E402

REASON = "e2e smoke: 1 epoch on a 100-player slice"
RUN_ID = "e2e"
LINEAGE_INPUTS = (
    "pipeline/data/train_matrix.npz",
    "pipeline/data/feature_manifest.json",
    "assets/vectors.json",
    "pipeline/data/skill_labels.npz",
    "pipeline/data/wide_skill_labels.npz",
    "pipeline/data/role_context.json",
    "assets/drift.json",
)
MODEL_ROLES = ("checkpoint", "embedding", "centroids")
EXPORTERS = (
    # export_mtnn_embeddings, archetype_time + career_trajectories,
    # project_next_season, export_mtnn_viz, in that order [final#2].
    ("pipeline/export_assets.py",),
    # --granularity both, as rebuild_all's export stage runs it [final#0].
    ("pipeline/export_mtnn_jacobian.py", "--device", "cpu", "--granularity", "both"),
    ("pipeline/build_scoring_lite.py",),
)
STEP_TIMEOUT = 600
VERIFY_SERVED = (
    "import json, sys; sys.path.insert(0, 'pipeline'); import verify_accuracy as V; "
    "data = json.loads((V.ASSETS / 'vectors.json').read_text(encoding='utf-8')); "
    "V.v13_mtnn_jacobian(data); V.v13b_mtnn_attribution(data); sys.exit(1 if V.FAILS else 0)"
)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def build_skeleton(root: Path) -> None:
    (root / "pipeline").mkdir(parents=True)
    for py in (ROOT / "pipeline").glob("*.py"):
        shutil.copy2(py, root / "pipeline" / py.name)
    for d in ("recipes", "contracts"):
        shutil.copytree(ROOT / "pipeline" / d, root / "pipeline" / d)
    (root / "scripts").mkdir()
    for name in ("check_served_model.py", "sync_public.py"):
        shutil.copy2(ROOT / "scripts" / name, root / "scripts" / name)
    shutil.copytree(SLICE / "pipeline" / "data", root / "pipeline" / "data")
    shutil.copytree(SLICE / "assets", root / "assets")
    # The tree Vercel serves; sync_public refuses to create it.
    (root / "public").mkdir()


def tree_hashes(d: Path) -> dict[str, str]:
    """sha256 of every file under d, by path relative to d."""
    return {p.relative_to(d).as_posix(): sha(p) for p in sorted(d.rglob("*")) if p.is_file()}


def run_step(root: Path, argv, logs: Path, name: str) -> subprocess.CompletedProcess:
    env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
    # git must not find a checkout above the skeleton and report it as the
    # run's git state; lineage.git is then all None, as in the herdmux scratch
    # copy. UTF-8 stdout: on Windows a piped child otherwise writes the ANSI
    # code page, and a step printing a character outside it would crash.
    env.update(PYTHONDONTWRITEBYTECODE="1", PYTHONIOENCODING="utf-8", GIT_CEILING_DIRECTORIES=str(root.parent))
    proc = subprocess.run(
        [sys.executable, "-u", *argv],
        cwd=root,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=STEP_TIMEOUT,
    )
    (logs / f"{name}.log").write_text(proc.stdout + "\n--- stderr ---\n" + proc.stderr, encoding="utf-8")
    return proc


def outside_snapshot() -> dict[str, tuple[int, int]]:
    """(mtime, size) of what the real checkout's pipeline/data and assets hold at the top level."""
    out = {}
    for d in (ROOT / "pipeline" / "data", ROOT / "assets", ROOT / "public" / "assets"):
        if d.is_dir():
            for p in d.iterdir():
                st = p.stat()
                out[str(p)] = (st.st_mtime_ns, st.st_size)
    return out


@pytest.fixture(scope="module")
def chain(tmp_path_factory):
    root = tmp_path_factory.mktemp("e2e") / "repo"
    build_skeleton(root)
    run = root / "pipeline" / "data" / "runs" / RUN_ID
    steps = [
        (
            "train_mtnn",
            ("pipeline/train_mtnn.py", "--recipe", "measure", "--epochs", "1", "--device", "cpu", "--seed", "5")
            + ("--run-dir", str(run)),
        ),
        ("promote", ("pipeline/promote.py", "--run", str(run), "--force", REASON)),
        *((Path(argv[0]).stem, argv) for argv in EXPORTERS),
        ("sync_public", ("scripts/sync_public.py",)),
        ("check_served_model", ("scripts/check_served_model.py",)),
        # verify_accuracy's checks of the files this chain exported: the
        # whole harness also checks the slice's vectors.json, skills and
        # norms, which a 100-player cut does not pass.
        ("verify_served", ("-c", VERIFY_SERVED)),
    ]
    before = outside_snapshot()
    results = {}
    logs = root.parent / "logs"
    logs.mkdir()
    data_around_export = {}
    for name, argv in steps:
        if name == "export_assets":
            data_around_export["before"] = tree_hashes(root / "pipeline" / "data")
        proc = run_step(root, argv, logs, name)
        if name == "export_assets":
            data_around_export["after"] = tree_hashes(root / "pipeline" / "data")
        results[name] = proc
        if name not in ("check_served_model", "verify_served") and proc.returncode != 0:
            tail = (proc.stdout + proc.stderr)[-3000:]
            pytest.fail(f"{name} exited {proc.returncode} (logs in {logs}):\n{tail}")
    return {
        "root": root,
        "run": run,
        "results": results,
        "outside_before": before,
        "data_around_export": data_around_export,
    }


def test_the_served_model_check_passes_on_what_the_chain_exported(chain):
    check = chain["results"]["check_served_model"]
    assert check.returncode == 0, check.stdout + check.stderr
    assert "served model: OK" in check.stdout


def test_verify_accuracy_v13_and_v13b_pass_on_a_fresh_export(chain):
    """[final#0, final#1] V13 failed on every fresh export (arch listed injury as a
    tower, the Jacobian did not) and V13b after every promote (nothing rewrote
    mtnn_attr_pop.json from the promoted bundle)."""
    proc = chain["results"]["verify_served"]
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assets = chain["root"] / "assets"
    arch, jac = load(assets / "mtnn_arch.json"), load(assets / "mtnn_jacobian.json")
    attr = load(assets / "mtnn_attr_pop.json")
    assert set(arch["towerFamilies"]) == set(jac["towerFamilies"])
    assert "injury" in arch["familyOrder"] and "injury" not in arch["towerFamilies"]
    assert attr["lineage"] == jac["lineage"] and attr["lineage"]["run_id"] == RUN_ID
    assert attr["checkpoint"] == jac["checkpoint"] == arch["checkpoint"]
    assert (assets / "mtnn_attr_topk.bin").exists()


def test_the_export_stage_writes_nothing_under_pipeline_data(chain):
    """[final#4, final#21, final#25] export_assets ran the side builders without
    --out-root, rewriting skill_labels.npz, wide_skill_labels.npz, pedigree.json,
    playoffs.json and honors.json (training inputs) undeclared."""
    around = chain["data_around_export"]
    assert around["before"] and around["after"] == around["before"]
    log = chain["results"]["export_assets"].stdout
    for builder in ("build_skills", "build_wide_skills", "build_pedigree", "build_playoffs", "build_honors"):
        assert f"== {builder}" not in log


def test_the_archetype_files_cluster_the_new_f32_before_the_projections(chain):
    """[final#2] In export_assets' log order, and by lineage: archetypes_time.json,
    archetype_assignments.json and trajectories.json carry the bundle.stamp() of the run
    whose f32 they clustered, as projections.json does."""
    root = chain["root"]
    log = chain["results"]["export_assets"].stdout
    at = [
        log.index(f"== {step}: ") for step in ("export_mtnn_embeddings", "archetype_time.py", "career_trajectories.py")
    ]
    assert at == sorted(at) and at[-1] < log.index("== project_next_season: "), log[-3000:]
    stamp = load(root / "assets" / "projections.json")["lineage"]
    assert stamp["run_id"] == RUN_ID
    for name in ("archetypes_time.json", "archetype_assignments.json", "trajectories.json"):
        assert load(root / "assets" / name)["lineage"] == stamp, name


@pytest.mark.parametrize("with_lineage", [True, False], ids=["served-f32-has-lineage", "live-assets-state"])
def test_export_assets_with_nothing_promoted(chain, tmp_path, with_lineage):
    """The skipped path is a primary case: origin b7ccea45 built the live assets with
    export_assets and nothing promoted (and no mtnn_lineage.json, the live state). It
    exits 0, clusters the f32 already served, stamps that f32's lineage (null when
    nothing names it), and writes nothing under pipeline/data."""
    root = tmp_path / "repo"
    build_skeleton(root)
    served = chain["root"] / "assets"
    names = (sm.F32, sm.META, *((sm.LINEAGE,) if with_lineage else ()))
    for name in names:
        shutil.copy2(served / name, root / "assets" / name)
    logs = tmp_path / "logs"
    logs.mkdir()
    before = tree_hashes(root / "pipeline" / "data")
    proc = run_step(root, ("pipeline/export_assets.py",), logs, "export_assets")
    assert proc.returncode == 0, (proc.stdout + proc.stderr)[-3000:]
    assert tree_hashes(root / "pipeline" / "data") == before
    assert "MTNN exports: skipped, nothing is promoted" in proc.stdout
    assert not (root / "assets" / "projections.json").exists()
    manifest = load(root / "assets" / "manifest.json")
    assert manifest["mtnn_promoted"] is False and manifest["steps"]["archetype_time.py"] is True
    want = load(served / "projections.json")["lineage"] if with_lineage else None
    for name in ("archetypes_time.json", "archetype_assignments.json", "trajectories.json"):
        assert load(root / "assets" / name)["lineage"] == want, name


def test_the_run_bundle_holds_the_bytes_its_lineage_names(chain):
    """train_mtnn's lineage block and write_run_bundle, tested on a real run."""
    root, run = chain["root"], chain["run"]
    report = load(run / "mtnn_report.json")
    lin = report["lineage"]
    assert (lin["schema"], lin["run_id"], lin["fit_rows"], lin["seed"]) == (1, RUN_ID, "train", 5)
    assert lin["recipe"]["name"] == "measure" and lin["recipe"]["overridden"] == ["epochs"]
    assert lin["args"]["epochs"] == 1 and lin["args"]["dim"] == 64 and lin["device"] == "cpu"
    # The seven inputs, hashed as the run read them: the slice's files.
    assert lin["inputs"] == {rel: sha(SLICE / rel) for rel in LINEAGE_INPUTS}
    # The final weights are the checkpoint (--val-every 0 --no-best-checkpoint).
    assert sorted(lin["artifacts"]) == sorted(MODEL_ROLES)
    for role in MODEL_ROLES:
        assert lin["artifacts"][role]["sha256"] == sha(run / aio.BUNDLE_FILES[role]), role
    data = root / "pipeline" / "data"
    fp = aio.load_matrix_fingerprint(data / "train_matrix.npz", data / "feature_manifest.json")
    assert lin["matrix_fingerprint"] == fp and fp["rows"] == 671
    # The last-run report is the bundle's report.
    assert (data / "mtnn_report.json").read_bytes() == (run / "mtnn_report.json").read_bytes()
    # The <=2012 rows are what give composite_v2 its regime slice.
    assert report["composite_v2"]["components_missing"] == []


def test_promote_shipped_exactly_the_run_and_refreshed_the_legacy_paths(chain):
    data, run = chain["root"] / "pipeline" / "data", chain["run"]
    lin = load(run / "mtnn_report.json")["lineage"]
    current = load(data / "promoted" / "CURRENT.json")
    bundle = data / "promoted" / RUN_ID
    manifest = load(bundle / "manifest.json")
    assert (current["run_id"], current["forced"], current["force_reason"]) == (RUN_ID, True, REASON)
    assert current["manifest_sha256"] == sha(bundle / "manifest.json")
    assert (manifest["forced"], manifest["force_reason"], manifest["fit_rows"]) == (True, REASON, "train")
    assert manifest["matrix_fingerprint"] == lin["matrix_fingerprint"]
    for role in MODEL_ROLES:
        name = aio.BUNDLE_FILES[role]
        want = lin["artifacts"][role]["sha256"]
        assert manifest["files"][role]["sha256"] == want == sha(bundle / name), role
        assert sha(data / name) == want, f"legacy {name} is not the promoted one"
    assert manifest["files"]["report"]["sha256"] == sha(run / "mtnn_report.json")


def test_the_served_files_name_the_promoted_bundle(chain):
    root = chain["root"]
    data, assets = root / "pipeline" / "data", root / "assets"
    current = load(data / "promoted" / "CURRENT.json")
    manifest = load(data / "promoted" / RUN_ID / "manifest.json")
    files = {role: rec["sha256"] for role, rec in manifest["files"].items()}
    served = load(assets / sm.LINEAGE)
    assert served["run_id"] == RUN_ID and served["manifest_sha256"] == current["manifest_sha256"]
    assert (served["embedding_npz_sha256"], served["checkpoint_sha256"]) == (files["embedding"], files["checkpoint"])
    assert (served["centroids_sha256"], served["report_sha256"]) == (files["centroids"], files["report"])
    assert served["embedding_f32_sha256"] == sha(assets / sm.F32)
    assert served["keys_sha256"] == manifest["matrix_fingerprint"]["keys_sha256"]
    assert served["forced"] is True and served["force_reason"] == REASON
    floors = served["export_floors"]
    assert floors["ok"] or floors["waived_by_force"] == REASON
    meta = load(assets / sm.META)
    assert meta["run_id"] == RUN_ID and (meta["rows"], meta["dim"]) == (671, 64)
    assert {k: meta[k] for k in sm.METRIC_KEYS} == served["metrics"] == manifest["metrics"]
    for name in sm.SIDECARS:
        assert load(assets / name)["lineage"]["run_id"] == RUN_ID, name
    # sync_public mirrored the bundle into the tree Vercel serves.
    for name in (sm.F32, sm.META, sm.LINEAGE, *sm.SIDECARS):
        assert (root / "public" / "assets" / name).read_bytes() == (assets / name).read_bytes(), name


def test_a_protocol_v2_run_that_lost_its_skill_labels_is_unscored(chain, tmp_path):
    """composite_score's rule (d106598c), on a report train_mtnn itself wrote [final#6].

    A --protocol-v2 run whose pipeline/data/skill_labels.npz is missing trains no skill tower,
    and its lineage records the file with sha None: a broken prepare, so the CQS is unscored.
    The trainer used to score before it attached the lineage block, so the rule never saw the
    inputs and the run was scored as if it had left the skill towers out. A hand-built report
    with the lineage already in it cannot catch that; this runs the trainer in its real order.
    Takes the `chain` fixture only so that test_nothing_outside_the_skeleton_was_written,
    which runs after it, also covers this run.
    """
    root = tmp_path / "repo"
    build_skeleton(root)
    (root / "pipeline" / "data" / "skill_labels.npz").unlink()
    env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
    env.update(PYTHONDONTWRITEBYTECODE="1", PYTHONIOENCODING="utf-8", GIT_CEILING_DIRECTORIES=str(root.parent))
    argv = ("pipeline/train_mtnn.py", "--recipe", "measure", "--epochs", "1", "--device", "cpu", "--seed", "5")
    proc = subprocess.run(
        [sys.executable, "-u", *argv, "--protocol-v2"],
        cwd=root,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=STEP_TIMEOUT,
    )
    assert proc.returncode == 0, (proc.stdout + proc.stderr)[-3000:]
    report = load(root / "pipeline" / "data" / "mtnn_report.json")
    assert report["protocol"] == "v2" and report["skills"] is None
    # The full lineage block replaced the inputs-only one the scoring read.
    assert report["lineage"]["schema"] == 1 and report["lineage"]["inputs"]["pipeline/data/skill_labels.npz"] is None
    block = report["composite"]
    assert {"skills_r2", "skill_nn"} <= set(block["components_expected"])
    assert block["cqs"] is None and "skills_r2, skill_nn" in block["cqs_unscored"]
    assert report["promote"]["ok"] is False and "CQS was not scored" in report["promote"]["reason"]


def test_nothing_outside_the_skeleton_was_written(chain):
    assert outside_snapshot() == chain["outside_before"]

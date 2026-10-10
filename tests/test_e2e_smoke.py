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
  export_mtnn_embeddings, project_next_season, export_mtnn_viz,
    export_mtnn_jacobian --device cpu, build_scoring_lite
  scripts/sync_public.py
  scripts/check_served_model.py            -> exit 0

--force because one epoch on 100 players clears neither should_promote nor
the export floors (archetype top-1 0.115, purity 0.56 on this box); a
forced promotion waives the floors and the served lineage records it.
export_assets is not run: it rebuilds skills, pedigree and playoffs from
pipeline/cache first. No metric value is asserted, only that every file
names the same bytes: the report's lineage, the promoted manifest and
CURRENT.json, the legacy paths, assets/mtnn_lineage.json, the meta and
every sidecar.

About 20 s on the training box's CPU; nothing is written outside tmp_path.

Run:  python -m pytest tests/test_e2e_smoke.py
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

pytest.importorskip("torch")

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
    ("pipeline/export_mtnn_embeddings.py",),
    ("pipeline/project_next_season.py",),
    ("pipeline/export_mtnn_viz.py",),
    ("pipeline/export_mtnn_jacobian.py", "--device", "cpu"),
    ("pipeline/build_scoring_lite.py",),
)
STEP_TIMEOUT = 600


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
    env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
    # No git checkout above the skeleton is its git state; lineage.git is
    # then all None, as in the herdmux scratch copy.
    env.update(PYTHONDONTWRITEBYTECODE="1", GIT_CEILING_DIRECTORIES=str(root.parent))
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
    ]
    before = outside_snapshot()
    results = {}
    logs = root.parent / "logs"
    logs.mkdir()
    for name, argv in steps:
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
        results[name] = proc
        if name != "check_served_model" and proc.returncode != 0:
            tail = (proc.stdout + proc.stderr)[-3000:]
            pytest.fail(f"{name} exited {proc.returncode} (logs in {logs}):\n{tail}")
    return {"root": root, "run": run, "results": results, "outside_before": before}


def test_the_served_model_check_passes_on_what_the_chain_exported(chain):
    check = chain["results"]["check_served_model"]
    assert check.returncode == 0, check.stdout + check.stderr
    assert "served model: OK" in check.stdout


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


def test_nothing_outside_the_skeleton_was_written(chain):
    assert outside_snapshot() == chain["outside_before"]

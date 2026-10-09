"""pipeline/promote.py: what gets promoted, what is refused, and what the exporters' loader accepts.

Every artifact here is a tiny one built in tmp_path: a 6-row matrix, a 4-d
embedding, a checkpoint that is just bytes (promote.py never loads it, it
only hashes it). promote.DATA_DIR is pointed at tmp_path, so nothing touches
pipeline/data.

Run:  python -m pytest tests/test_promote.py
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import artifact_io as aio  # noqa: E402
import promote as pm  # noqa: E402
from bundle_fixtures import DIM, PIDS, SEASONS, make_run, write_matrix  # noqa: E402


@pytest.fixture
def data(tmp_path, monkeypatch) -> Path:
    d = tmp_path / "data"
    d.mkdir()
    write_matrix(d)
    monkeypatch.setattr(pm, "DATA_DIR", d)
    monkeypatch.setattr(pm, "git_state", lambda root: {"sha": "a" * 40, "short": "aaaaaaaa", "dirty": False})
    return d


def refused(run: Path, **kw) -> str:
    with pytest.raises(pm.PromotionRefusedError) as e:
        pm.promote(run, **kw)
    return " | ".join(e.value.problems)


def current(data: Path) -> dict:
    return json.loads((data / "promoted" / "CURRENT.json").read_text(encoding="utf-8"))


def nothing_promoted(data: Path) -> bool:
    return not (data / "promoted" / "CURRENT.json").exists() and not (data / "embedding_v3.npz").exists()


# --- a coherent run ------------------------------------------------------------


def test_a_coherent_run_promotes_and_flips_current(data):
    run = make_run(data, "r1")
    cur = pm.promote(run, now="2026-10-09T00:00:01Z")

    bundle = data / "promoted" / "r1"
    assert sorted(p.name for p in bundle.iterdir()) == sorted([*aio.BUNDLE_FILES.values(), "manifest.json"])
    assert cur == current(data)
    assert cur["run_id"] == "r1" and cur["previous"] is None and cur["forced"] is False
    assert cur["manifest_sha256"] == aio.sha256_file(bundle / "manifest.json")

    man = json.loads((bundle / "manifest.json").read_text(encoding="utf-8"))
    for role, name in aio.BUNDLE_FILES.items():
        assert man["files"][role]["sha256"] == aio.sha256_file(run / name) == aio.sha256_file(bundle / name)
    assert man["metrics"] == {
        "cqs": 90.0,
        "test_recall_at_10": 0.9,
        "purity_at_20": 0.8,
        "archetype_top1_acc": 0.91,
        "position_top1_acc": 0.72,
        "transparent_14d_test_recall_at_10": 0.2,
        "continuity_spread": 0.1,
    }
    assert (man["rows"], man["dim"], man["phase"]) == (6, DIM, "final-refit")
    assert man["verdict"]["at_promotion"]["ok"] is True

    # The legacy paths vector-unified reads now hold the promoted bytes.
    for role in ("embedding", "centroids"):
        assert aio.sha256_file(data / aio.BUNDLE_FILES[role]) == aio.sha256_file(bundle / aio.BUNDLE_FILES[role])
    # The last-run paths are not touched.
    assert not (data / "mtnn_best.pt").exists() and not (data / "mtnn_report.json").exists()
    # No temp directory or file left behind.
    assert sorted(p.name for p in (data / "promoted").iterdir()) == ["CURRENT.json", "r1"]


def test_current_flip_is_atomic(data, monkeypatch):
    pm.promote(make_run(data, "r1"), now="2026-10-09T00:00:01Z")
    before = (data / "promoted" / "CURRENT.json").read_bytes()
    legacy = aio.sha256_file(data / "embedding_v3.npz")
    real_replace = Path.replace

    def replace(self, target):
        if Path(target).name == "CURRENT.json":
            raise OSError("simulated failure at the CURRENT.json rename")
        return real_replace(self, target)

    monkeypatch.setattr(Path, "replace", replace)
    with pytest.raises(OSError, match="simulated"):
        pm.promote(make_run(data, "r2", seed=1), now="2026-10-09T00:00:02Z")
    assert (data / "promoted" / "CURRENT.json").read_bytes() == before
    assert aio.sha256_file(data / "embedding_v3.npz") == legacy
    assert not [p for p in (data / "promoted").iterdir() if p.name.startswith(".")]
    assert pm.load_promoted().run_id == "r1"


def test_keeps_the_newest_five_and_never_the_current_one(data):
    for i in range(7):
        pm.promote(make_run(data, f"r{i}", seed=i), now=f"2026-10-09T00:00:0{i}Z")
    names = sorted(p.name for p in (data / "promoted").iterdir() if p.is_dir())
    assert names == ["r2", "r3", "r4", "r5", "r6"]
    assert current(data)["run_id"] == "r6" and current(data)["previous"] == "r5"

    # Roll back to the oldest kept bundle while keeping only 2: r2 is the
    # oldest by promoted_at, but it is current, so it stays with r5 and r6.
    pm.promote(data / "promoted" / "r2", keep=2, now="2026-10-09T00:00:10Z")
    assert current(data)["run_id"] == "r2" and current(data)["previous"] == "r6"
    names = sorted(p.name for p in (data / "promoted").iterdir() if p.is_dir())
    assert names == ["r2", "r5", "r6"]


def test_rollback_re_promotes_an_existing_bundle_without_copying(data):
    pm.promote(make_run(data, "a"), now="2026-10-09T00:00:01Z")
    pm.promote(make_run(data, "b", seed=1), now="2026-10-09T00:00:02Z")
    man_a = (data / "promoted" / "a" / "manifest.json").read_bytes()
    cur = pm.promote(data / "promoted" / "a", now="2026-10-09T00:00:03Z")
    assert (cur["run_id"], cur["previous"]) == ("a", "b")
    assert (data / "promoted" / "a" / "manifest.json").read_bytes() == man_a
    assert aio.sha256_file(data / "embedding_v3.npz") == aio.sha256_file(data / "promoted" / "a" / "embedding_v3.npz")


# --- refusals --------------------------------------------------------------------


def test_a_file_whose_sha_does_not_match_the_lineage_is_refused(data):
    run = make_run(data, "r1")
    E = np.zeros((len(PIDS), DIM), np.float32)
    np.savez_compressed(run / "embedding_v3.npz", E=E, player_id=PIDS, season=SEASONS)
    why = refused(run, force="even forced")
    assert "embedding_v3.npz: sha256" in why and "lineage recorded" in why
    assert nothing_promoted(data)


def test_a_torn_bundle_is_refused(data):
    """Report from one run, embedding and checkpoint from another: the 08-14 / 08-07 case."""
    a = make_run(data, "a", seed=1)
    b = make_run(data, "b", seed=2)
    shutil.copyfile(b / "embedding_v3.npz", a / "embedding_v3.npz")
    shutil.copyfile(b / "mtnn_best.pt", a / "mtnn_best.pt")
    why = refused(a, force="even forced")
    assert "embedding_v3.npz: sha256" in why and "mtnn_best.pt: sha256" in why
    assert nothing_promoted(data)


def test_a_select_phase_run_is_a_measurement_and_is_refused(data):
    why = refused(make_run(data, "r1", phase="select"), force="even forced")
    assert "phase 'select' is a measuring run" in why
    assert nothing_promoted(data)


def test_an_auto_run_is_refused_since_the_phase_was_removed(data):
    run = make_run(data, "r1", phase="auto", deploy_mode="final_refit_all_rows")
    assert "phase 'auto' was removed" in refused(run, force="even forced")


def test_should_promote_failure_refuses_without_force_and_records_the_force(data):
    run = make_run(data, "r1", composite={"cqs": 50.0, "test_recall_at_10": 0.9, "purity_at_20": 0.8})
    why = refused(run)
    assert "should_promote: CQS 50.00 < promote bar" in why and "--force" in why
    assert nothing_promoted(data)
    with pytest.raises(pm.PromotionRefusedError, match="needs a reason"):
        pm.promote(run, force="  ")

    cur = pm.promote(run, force="single-seed refit, operator accepts the 1-seed bar")
    man = json.loads((data / "promoted" / "r1" / "manifest.json").read_text(encoding="utf-8"))
    assert cur["forced"] is True and man["forced"] is True
    assert man["force_reason"] == cur["force_reason"] == "single-seed refit, operator accepts the 1-seed bar"
    assert man["verdict"]["at_promotion"]["ok"] is False and "CQS 50.00" in man["verdict"]["at_promotion"]["reason"]
    # The trainer's own verdict is kept beside it, not used.
    assert man["verdict"]["at_training"] == {"ok": True, "reason": "set by the test"}


def test_a_run_without_a_checkpoint_is_refused(data):
    why = refused(make_run(data, "r1", checkpoint=False), force="even forced")
    assert "the run wrote no checkpoint" in why


def test_centroids_of_another_width_are_refused(data):
    """8 x 48 centroids beside a 64-d embedding, as pipeline/data held on 2026-10-09."""
    why = refused(make_run(data, "r1", dim=64, centroid_dim=48), force="even forced")
    assert "centroids have shape (8, 48), not (k, 64)" in why


def test_a_matrix_changed_since_training_is_refused(data):
    run = make_run(data, "r1")
    write_matrix(data, shift=0.5)
    why = refused(run, force="even forced")
    assert "is not the matrix this run trained on" in why and "values_sha256" in why


def test_an_embedding_bound_to_other_rows_is_refused(data):
    run = make_run(data, "r1")
    E = np.load(run / "embedding_v3.npz")["E"]
    np.savez_compressed(run / "embedding_v3.npz", E=E, player_id=PIDS[::-1], season=SEASONS)
    rep = json.loads((run / "mtnn_report.json").read_text(encoding="utf-8"))
    rep["lineage"]["artifacts"]["embedding"] = aio.file_record(run / "embedding_v3.npz", data.parent)
    (run / "mtnn_report.json").write_text(json.dumps(rep), encoding="utf-8")
    assert "rows are not the trained matrix's" in refused(run, force="even forced")


def test_a_report_without_lineage_or_a_missing_report_is_refused(data):
    run = make_run(data, "r1")
    rep = json.loads((run / "mtnn_report.json").read_text(encoding="utf-8"))
    del rep["lineage"]
    (run / "mtnn_report.json").write_text(json.dumps(rep), encoding="utf-8")
    assert "no lineage block" in refused(run, force="even forced")
    (run / "mtnn_report.json").unlink()
    assert "mtnn_report.json: missing" in refused(run, force="even forced")


def test_an_existing_bundle_with_other_content_is_not_overwritten(data):
    pm.promote(make_run(data, "r1"), now="2026-10-09T00:00:01Z")
    other = data.parent / "elsewhere"
    other.mkdir()
    shutil.copytree(make_run(data, "r2", seed=5), other / "r1")
    rep = json.loads((other / "r1" / "mtnn_report.json").read_text(encoding="utf-8"))
    rep["lineage"]["run_id"] = "r1"
    (other / "r1" / "mtnn_report.json").write_text(json.dumps(rep), encoding="utf-8")
    assert "already exists and is not this run's bundle" in refused(other / "r1")


def test_cli_dry_run_writes_nothing_and_a_refusal_exits_2(data, capsys):
    run = make_run(data, "r1")
    assert pm.main(["--run", str(run), "--dry-run"]) == 0
    assert nothing_promoted(data)
    assert pm.main(["--run", str(make_run(data, "r2", phase="select")), "--dry-run"]) == pm.EXIT_REFUSED
    assert pm.main(["--run", str(make_run(data, "r3", phase="select"))]) == pm.EXIT_REFUSED
    assert "REFUSED" in capsys.readouterr().out
    assert nothing_promoted(data)
    assert pm.main(["--status"]) == 1
    assert pm.main(["--run", str(run)]) == 0
    assert pm.main(["--status"]) == 0


# --- the exporters' loader -------------------------------------------------------


def test_loader_says_nothing_is_promoted(data):
    with pytest.raises(pm.NoPromotedBundleError, match="nothing is promoted"):
        pm.load_promoted()


def test_loader_returns_the_verified_bundle(data):
    pm.promote(make_run(data, "r1"))
    b = pm.load_promoted(check_matrix=True)
    assert b.run_id == "r1" and b.embedding == data / "promoted" / "r1" / "embedding_v3.npz"
    assert b.metrics["cqs"] == 90.0
    assert b.stamp() == {
        "run_id": "r1",
        "embedding_npz_sha256": aio.sha256_file(b.embedding),
        "checkpoint_sha256": aio.sha256_file(b.checkpoint),
    }


def test_loader_refuses_an_edited_bundle_file(data):
    pm.promote(make_run(data, "r1"))
    with open(data / "promoted" / "r1" / "mtnn_best.pt", "ab") as f:
        f.write(b"x")
    with pytest.raises(pm.BundleError, match=r"mtnn_best\.pt: sha256 differs"):
        pm.load_promoted()


def test_loader_refuses_a_swapped_in_file(data):
    pm.promote(make_run(data, "r1"))
    other = make_run(data, "r2", seed=9)
    shutil.copyfile(other / "embedding_v3.npz", data / "promoted" / "r1" / "embedding_v3.npz")
    with pytest.raises(pm.BundleError, match=r"embedding_v3\.npz: sha256 differs"):
        pm.load_promoted()


def test_loader_refuses_an_edited_manifest(data):
    """A hand-typed metric in the manifest is caught by CURRENT.json's manifest sha."""
    pm.promote(make_run(data, "r1"))
    path = data / "promoted" / "r1" / "manifest.json"
    man = json.loads(path.read_text(encoding="utf-8"))
    man["metrics"]["cqs"] = 99.9
    path.write_text(json.dumps(man, indent=2), encoding="utf-8")
    with pytest.raises(pm.BundleError, match="not the manifest that was promoted"):
        pm.load_promoted()


def test_loader_checks_the_matrix_only_when_asked(data):
    pm.promote(make_run(data, "r1"))
    write_matrix(data, shift=1.0)
    assert pm.load_promoted().run_id == "r1"
    with pytest.raises(pm.BundleError, match="not the matrix promoted run r1 trained on"):
        pm.load_promoted(check_matrix=True)


def test_the_embedding_keys_hash_is_the_matrix_fingerprints(data):
    """promote.py hashes the embedding's rows with artifact_io.keys_sha256;
    train_mtnn records matrix_fingerprint's keys_sha256. One format."""
    fp = aio.load_matrix_fingerprint(data / "train_matrix.npz", data / "feature_manifest.json")
    assert aio.keys_sha256(PIDS, SEASONS) == fp["keys_sha256"]

"""The exporters read the trained model only through promote.load_promoted().

export_mtnn_embeddings is run end to end on a tiny promoted bundle in
tmp_path: it checks every row by (player_id, season), writes the f32, the
meta and assets/mtnn_lineage.json, and copies metrics from the promoted
manifest. The other readers are checked for the refusal: with nothing
promoted, or with a bundle that does not verify, none of them writes.

Run:  python -m pytest tests/test_export_lineage.py
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import artifact_io as aio  # noqa: E402
import build_scoring_lite as bsl  # noqa: E402
import export_assets as ea  # noqa: E402
import export_mtnn_embeddings as eme  # noqa: E402
import export_mtnn_viz as viz  # noqa: E402
import export_next_profile_eval as npe  # noqa: E402
import project_next_season as pns  # noqa: E402
import promote as pm  # noqa: E402
import served_model as sm  # noqa: E402
from bundle_fixtures import PIDS, make_run, write_matrix, write_vectors  # noqa: E402


@pytest.fixture
def env(tmp_path, monkeypatch):
    data = tmp_path / "data"
    data.mkdir()
    write_matrix(data)
    monkeypatch.setattr(pm, "DATA_DIR", data)
    monkeypatch.setattr(pm, "git_state", lambda root: {"sha": "a" * 40, "short": "aaaaaaaa", "dirty": False})
    assets = tmp_path / "assets"
    write_vectors(assets)
    return data, assets


def stamp_sidecars(assets: Path, run_id: str) -> None:
    for name in sm.SIDECARS:
        (assets / name).write_text(json.dumps({"lineage": {"run_id": run_id}}), encoding="utf-8")


def served_files(assets: Path) -> set[str]:
    return {p.name for p in assets.iterdir()} - {"vectors.json"}


def test_export_writes_the_f32_meta_and_lineage_from_the_promoted_bundle(env):
    data, assets = env
    pm.promote(make_run(data, "r1"))
    b = pm.load_promoted()
    eme.main(data_dir=data, assets=assets)

    E = np.load(b.embedding)["E"]
    blob = (assets / sm.F32).read_bytes()
    assert blob == E.astype(np.float32).tobytes(order="C")

    meta = json.loads((assets / sm.META).read_text(encoding="utf-8"))
    lineage = json.loads((assets / sm.LINEAGE).read_text(encoding="utf-8"))
    assert (meta["rows"], meta["dim"], meta["run_id"], meta["model"]) == (6, 4, "r1", "test_model_r1")
    assert set(meta) <= set(sm.META_KEYS)
    # Metrics are the promoted manifest's, in the meta and in the lineage.
    assert {k: meta[k] for k in sm.METRIC_KEYS} == lineage["metrics"] == b.metrics
    assert lineage["embedding_f32_sha256"] == hashlib.sha256(blob).hexdigest()
    assert lineage["f32_bytes"] == len(blob) == 6 * 4 * 4
    assert lineage["keys_sha256"] == b.manifest["matrix_fingerprint"]["keys_sha256"]
    assert lineage["embedding_npz_sha256"] == aio.sha256_file(b.embedding)
    assert lineage["checkpoint_sha256"] == aio.sha256_file(b.checkpoint)
    assert meta["f32"] == sm.f32_url(lineage["embedding_f32_sha256"])

    stamp_sidecars(assets, "r1")
    assert sm.problems(assets) == []


def test_export_refuses_when_nothing_is_promoted(env):
    data, assets = env
    with pytest.raises(SystemExit, match="nothing is promoted"):
        eme.main(data_dir=data, assets=assets)
    assert served_files(assets) == set()


def test_export_refuses_a_bundle_that_does_not_verify(env):
    data, assets = env
    pm.promote(make_run(data, "r1"))
    with open(data / "promoted" / "r1" / "embedding_v3.npz", "ab") as f:
        f.write(b"\0")
    with pytest.raises(SystemExit, match="does not verify"):
        eme.main(data_dir=data, assets=assets)
    assert served_files(assets) == set()


def test_export_checks_every_row_by_player_id_and_season(env):
    data, assets = env
    pm.promote(make_run(data, "r1"))
    # Row 2 is the same name and season, another player_id: the on-box case
    # (4673 Marcus Williams 2007-08, 200766 in the matrix, 201173 in vectors.json).
    pids = PIDS.copy()
    pids[2] = 99
    write_vectors(assets, pids)
    with pytest.raises(SystemExit) as e:
        eme.main(data_dir=data, assets=assets)
    msg = str(e.value)
    assert "1 of 6 rows" in msg and "row 2: embedding 12|2020-21 (Player 12) vs vectors.json 99|2020-21" in msg
    assert served_files(assets) == set()


def test_export_does_not_compare_names(env):
    """275 rows differ by name spelling alone on 2026-10-09 ('Roger Mason' vs
    'Roger Mason Jr.'); the binding is (player_id, season)."""
    data, assets = env
    pm.promote(make_run(data, "r1"))
    doc = json.loads((assets / "vectors.json").read_text(encoding="utf-8"))
    doc["players"][0]["name"] += " Jr."
    (assets / "vectors.json").write_text(json.dumps(doc), encoding="utf-8")
    eme.main(data_dir=data, assets=assets)
    assert (assets / sm.LINEAGE).exists()


def test_build_scoring_lite_refuses_an_f32_its_lineage_does_not_name(env, monkeypatch):
    _, assets = env
    monkeypatch.setattr(bsl, "ASSETS", assets)
    (assets / sm.F32).write_bytes(np.zeros(24, np.float32).tobytes())
    (assets / sm.META).write_text(json.dumps({"rows": 6, "dim": 4}), encoding="utf-8")
    with pytest.raises(SystemExit, match=r"mtnn_lineage\.json: missing"):
        bsl.main()
    (assets / sm.LINEAGE).write_text(
        json.dumps({"run_id": "r1", "embedding_f32_sha256": "0" * 64, "rows": 6, "dim": 4}), encoding="utf-8"
    )
    with pytest.raises(SystemExit, match="is not the 000000000000"):
        bsl.main()
    assert not (assets / "scoring_lite.f32").exists()


@pytest.mark.parametrize(
    ("module", "attr"),
    [(viz, "DATA"), (pns, "DATA"), (npe, "DATA")],
    ids=["export_mtnn_viz", "project_next_season", "export_next_profile_eval"],
)
def test_other_readers_refuse_without_a_verified_bundle(env, monkeypatch, module, attr):
    data, _ = env
    monkeypatch.setattr(module, attr, data)
    with pytest.raises(SystemExit, match="nothing is promoted"):
        module.main()
    pm.promote(make_run(data, "r1"))
    (data / "promoted" / "r1" / "mtnn_best.pt").write_bytes(b"someone else's weights")
    with pytest.raises(SystemExit, match="does not verify"):
        module.main()


def test_viz_describes_the_promoted_run(env, monkeypatch):
    """Architecture from the promoted run's lineage.args, the model tag from its
    manifest, and the run id on both JSON files. It used to read
    args["model"] from the last run's checkpoint, which train_mtnn never sets,
    so every arch.json said 'mtnn_v4_phase_b'."""
    data, assets = env
    for name, value in {
        "DATA": data,
        "ASSETS": assets,
        "VECTORS": assets / "vectors.json",
        "TRAIN": data / "train_matrix.npz",
        "MANIFEST": data / "feature_manifest.json",
        "OUT_ARCH": assets / "mtnn_arch.json",
        "OUT_MAP": assets / "mtnn_map.json",
        "OUT_HEADS": assets / "mtnn_heads.f32",
        "OUT_INPUTS": assets / "mtnn_inputs.f32",
    }.items():
        monkeypatch.setattr(viz, name, value)
    pm.promote(make_run(data, "r1"))
    b = pm.load_promoted()
    viz.main()
    arch = json.loads((assets / "mtnn_arch.json").read_text(encoding="utf-8"))
    mp = json.loads((assets / "mtnn_map.json").read_text(encoding="utf-8"))
    assert arch["model"] == "test_model_r1"
    assert (arch["dTower"], arch["towerBlocks"], arch["fusion"], arch["dEmb"]) == (32, 2, "concat", 4)
    assert arch["lineage"] == mp["lineage"] == b.stamp()
    assert arch["checkpoint"]["sha256"] == aio.sha256_file(b.checkpoint)


def test_export_assets_skips_with_nothing_promoted_and_stops_on_a_broken_bundle(env):
    data, _ = env
    bundle, why = ea.promoted_bundle()
    assert bundle is None and "nothing is promoted" in why
    pm.promote(make_run(data, "r1"))
    assert ea.promoted_bundle()[0].run_id == "r1"
    (data / "promoted" / "r1" / "mtnn_report.json").write_text("{}", encoding="utf-8")
    with pytest.raises(SystemExit, match="does not verify"):
        ea.promoted_bundle()


def test_export_assets_labels_and_gates_on_the_metrics_the_manifest_carries(env):
    """[eval#7] The label was hard-coded "transductive"; a select run is held out.
    For a refit, the export floors read the select run's report, not the refit's."""
    data, _ = env
    assert ea.eval_protocol_label(None) is None
    pm.promote(make_run(data, "sel"))
    b = pm.load_promoted()
    assert ea.eval_protocol_label(b).startswith("held out: ")
    assert b.metrics_report is b.report

    failing = {"test": {"recall_at_10_mtnn": 0.1, "recall_at_10_transparent_14d": 0.2}}
    refit = make_run(data, "refit", phase="final-refit", seed=1)
    rep = json.loads((refit / "mtnn_report.json").read_text(encoding="utf-8"))
    rep["held_out_recall"] = failing  # in-sample numbers that would fail the floors
    (refit / "mtnn_report.json").write_text(json.dumps(rep), encoding="utf-8")
    pm.promote(refit, selection_run=data.parent / "runs" / "sel")
    b = pm.load_promoted()
    assert ea.eval_protocol_label(b).startswith("held out, from select run sel")
    assert not ea.mtnn_promotion_eligible(b.report)
    assert ea.mtnn_promotion_eligible(b.metrics_report)


def test_metric_keys_are_the_ones_the_served_meta_carries():
    assert set(sm.METRIC_KEYS) <= set(sm.META_KEYS)
    assert set(pm.metrics_from_report({})) == set(sm.METRIC_KEYS)


def test_served_keys_hash_is_the_matrix_fingerprints(env):
    data, assets = env
    fp = aio.load_matrix_fingerprint(data / "train_matrix.npz", data / "feature_manifest.json")
    players = json.loads((assets / "vectors.json").read_text(encoding="utf-8"))["players"]
    assert sm.keys_sha256(sm.vector_keys(players)) == fp["keys_sha256"]


# --- wide skills provenance [ingest#5] -------------------------------------------


def test_wide_skills_source_says_what_this_export_did():
    doc = {"built": "2026-07-30"}
    # Before: "real_caches" whenever any wide_skills_*.json existed, proxies included,
    # whether or not this export rebuilt the file.
    assert ea.wide_skills_source(True, None, doc).startswith("rebuilt by this export")
    skipped = ea.wide_skills_source(False, "wide_skills_2013-14.json is a proxy doc", doc)
    assert "not rebuilt" in skipped and "proxy" in skipped and "2026-07-30" in skipped
    assert "build_wide_skills failed" in ea.wide_skills_source(False, None, {})

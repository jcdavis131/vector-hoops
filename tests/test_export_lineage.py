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
import types
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
from bundle_fixtures import COLUMNS, PIDS, make_run, write_matrix, write_vectors  # noqa: E402


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
    assert "embedding_f32_sha256" not in b.manifest
    before_data = {
        p.relative_to(data).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(data.rglob("*"))
        if p.is_file()
    }
    eme.main(data_dir=data, assets=assets)
    after_data = {
        p.relative_to(data).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(data.rglob("*"))
        if p.is_file()
    }
    assert after_data == before_data

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
    after = pm.load_promoted()
    assert "embedding_f32_sha256" not in after.manifest
    assert after.current == b.current
    assert (
        after.current["manifest_sha256"] == lineage["manifest_sha256"] == aio.sha256_file(after.dir / "manifest.json")
    )
    assert after.manifest["files"]["embedding"]["sha256"] == lineage["embedding_npz_sha256"]
    side = json.loads((assets / sm.F32_LINEAGE).read_text(encoding="utf-8"))
    assert side["embedding_f32_sha256"] == lineage["embedding_f32_sha256"]
    assert side["promote_manifest_sha256"] == b.current["manifest_sha256"]
    assert side["embedding_npz_sha256"] == lineage["embedding_npz_sha256"]
    assert side["run_id"] == "r1"

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


def _below_floors(run: Path) -> None:
    """Archetype top-1 0.115, purity 0.56: the P12 one-epoch slice run's numbers."""
    rep = json.loads((run / "mtnn_report.json").read_text(encoding="utf-8"))
    rep["archetype_top1_acc"], rep["cross_era_archetype_neighbor_purity_at_20"] = 0.115, 0.56
    (run / "mtnn_report.json").write_text(json.dumps(rep), encoding="utf-8")


def test_the_embedding_export_reads_a_refits_floors_from_its_select_run(env):
    """export_assets gated a refit on the select run's report and then ran
    export_mtnn_embeddings, which gated on the refit's in-sample one."""
    data, assets = env
    make_run(data, "sel")
    refit = make_run(data, "refit", phase="final-refit", seed=1)
    _below_floors(refit)  # in-sample numbers only; the select run's pass
    pm.promote(refit, selection_run=data.parent / "runs" / "sel")
    eme.main(data_dir=data, assets=assets)
    lineage = json.loads((assets / sm.LINEAGE).read_text(encoding="utf-8"))
    assert lineage["run_id"] == "refit" and lineage["export_floors"] == {
        "ok": True,
        "failed": [],
        "waived_by_force": None,
    }


def test_a_forced_promotion_waives_the_export_floors_and_the_lineage_says_so(env):
    data, assets = env
    run = make_run(data, "r1")
    _below_floors(run)
    pm.promote(run)  # should_promote reads the composite block, which passes; the floors do not
    with pytest.raises(SystemExit, match=r"misses the export floors.*archetype top-1 0\.115 < 0\.55"):
        eme.main(data_dir=data, assets=assets)
    assert served_files(assets) == set()
    assert not ea.mtnn_promotion_eligible(pm.load_promoted().metrics_report)

    run2 = make_run(data, "r2", seed=1)
    _below_floors(run2)
    pm.promote(run2, force="e2e smoke: 1 epoch on a 100-player slice")
    eme.main(data_dir=data, assets=assets)
    floors = json.loads((assets / sm.LINEAGE).read_text(encoding="utf-8"))["export_floors"]
    assert floors["ok"] is False and floors["waived_by_force"] == "e2e smoke: 1 epoch on a 100-player slice"
    assert any("archetype top-1 0.115" in f for f in floors["failed"]) and any("purity" in f for f in floors["failed"])
    assert ea.mtnn_exports_allowed(pm.load_promoted())[0] is True
    stamp_sidecars(assets, "r2")
    assert sm.problems(assets) == []  # a waiver is consistent; quality is the floors' job, not this check's


def test_export_refuses_a_run_the_trainer_refused_even_when_floors_pass(env):
    """The 2026-10-09 incident: the export gates checked three floors and
    never read the trainer's own verdict, so a refused run could still ship.
    Floors passing + report["promote"]["ok"] False must refuse; --force
    waives it with the reason in the lineage."""
    data, assets = env
    run = make_run(data, "r1")  # floors pass (recall 0.9, arch 0.91, purity 0.8)
    rep = json.loads((run / "mtnn_report.json").read_text(encoding="utf-8"))
    rep["promote"] = {"ok": False, "reason": "recall 0.742 < floor 0.773"}
    (run / "mtnn_report.json").write_text(json.dumps(rep), encoding="utf-8")
    pm.promote(run)  # should_promote re-runs on the composite block, which passes
    assert not eme.promotion_eligible(pm.load_promoted().metrics_report)
    assert not ea.mtnn_promotion_eligible(pm.load_promoted().metrics_report)
    with pytest.raises(SystemExit, match=r"refused by its own training verdict.*recall 0\.742"):
        eme.main(data_dir=data, assets=assets)
    assert served_files(assets) == set()

    run2 = make_run(data, "r2", seed=1)
    rep2 = json.loads((run2 / "mtnn_report.json").read_text(encoding="utf-8"))
    rep2["promote"] = {"ok": False, "reason": "recall 0.742 < floor 0.773"}
    (run2 / "mtnn_report.json").write_text(json.dumps(rep2), encoding="utf-8")
    pm.promote(run2, force="e2e smoke: trainer refused, operator overrides")
    eme.main(data_dir=data, assets=assets)
    lineage = json.loads((assets / sm.LINEAGE).read_text(encoding="utf-8"))
    assert lineage["trainer_verdict"]["ok"] is False
    assert lineage["trainer_verdict"]["waived_by_force"] == "e2e smoke: trainer refused, operator overrides"


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
    # whether or not this export rebuilt the file. The export rebuilds it never now
    # [final#25]; the sentence says so and when the file on disk was built.
    src = ea.wide_skills_source(doc)
    assert src.startswith("not rebuilt by this export") and "--refresh-context" in src and "2026-07-30" in src
    assert "unknown date" in ea.wide_skills_source({})


# --- export_assets: order and write set [final#2, final#4, final#21, final#25] --------

SIDE_BUILDERS = (
    "build_skills",
    "test_skills",
    "build_wide_skills",
    "test_wide_skills",
    "build_pedigree",
    "build_playoffs",
    "build_honors",
    "build_salary_market",
    "build_game_ratings",
)


@pytest.fixture
def export_env(tmp_path, monkeypatch):
    """export_assets.main with every subprocess recorded instead of run, assets/ in tmp_path."""
    assets = tmp_path / "assets"
    write_vectors(assets)
    vec_sha = hashlib.sha256((assets / "vectors.json").read_bytes()).hexdigest()
    (assets / "skills.json").write_text(json.dumps({"vectors_sha256": vec_sha, "grades": []}), encoding="utf-8")
    for name, value in {
        "ROOT": tmp_path,
        "ASSETS": assets,
        "MANIFEST": assets / "manifest.json",
        "LEDGER": tmp_path / "no_ledger.json",
        "SWEEP": tmp_path / "no_sweep.json",
    }.items():
        monkeypatch.setattr(ea, name, value)
    calls: list[tuple[str, bool]] = []

    def run(name, cmd, required=True):
        calls.append((Path(cmd[1]).stem, required))
        return True

    monkeypatch.setattr(ea, "run", run)
    return assets, calls


def _stems(calls):
    return [name for name, _ in calls]


def test_export_assets_clusters_the_new_f32_before_projecting(export_env, monkeypatch):
    """[final#2] archetype_time and career_trajectories ran before export_mtnn_embeddings
    wrote the new f32, so projections.json took archetype names from the previous model
    and trajectories.json was built from the previous f32 under the new lineage."""
    _, calls = export_env
    bundle = types.SimpleNamespace(run_id="r1", manifest={"model": "m"}, metrics={}, metrics_source={})
    monkeypatch.setattr(ea, "promoted_bundle", lambda: (bundle, None))
    monkeypatch.setattr(ea, "mtnn_exports_allowed", lambda b: (True, None))
    ea.main()
    names = _stems(calls)
    emb, proj = names.index("export_mtnn_embeddings"), names.index("project_next_season")
    for reader in ("archetype_time", "career_trajectories"):
        assert names.count(reader) == 1 and emb < names.index(reader) < proj, names
        assert (reader, True) in calls  # required: a failure would ship mixed provenance
    assert names.index("export_mtnn_viz") > proj
    assert not set(names) & set(SIDE_BUILDERS)


def test_export_assets_with_nothing_promoted_is_how_the_live_assets_were_built(export_env, monkeypatch):
    """The skipped path is a primary case, not a fallback: origin b7ccea45 built the live
    assets with export_assets and nothing promoted. It still clusters the served f32."""
    assets, calls = export_env
    monkeypatch.setattr(ea, "promoted_bundle", lambda: (None, "nothing is promoted: test"))
    ea.main()
    names = _stems(calls)
    assert {"archetype_time", "career_trajectories", "procrustes_drift", "build_player_meta"} <= set(names)
    assert not {"export_mtnn_embeddings", "project_next_season", "export_mtnn_viz"} & set(names)
    assert not set(names) & set(SIDE_BUILDERS)
    manifest = json.loads((assets / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["mtnn_promoted"] is False and manifest["mtnn_run_id"] is None


def test_export_assets_runs_none_of_the_side_builders():
    """[final#4, final#21, final#25] They rewrote pipeline/data training inputs undeclared;
    rebuild_all's context block owns them."""
    src = (ROOT / "pipeline" / "export_assets.py").read_text(encoding="utf-8")
    for name in SIDE_BUILDERS:
        assert f"pipeline/{name}.py" not in src, name


def test_export_assets_stops_on_a_missing_or_stale_skills_json(export_env, monkeypatch):
    assets, calls = export_env
    monkeypatch.setattr(ea, "promoted_bundle", lambda: (None, "nothing is promoted: test"))
    doc = json.loads((assets / "vectors.json").read_text(encoding="utf-8"))
    doc["players"][0]["v"] = [0.5]  # vectors.json rebuilt since build_skills read it
    (assets / "vectors.json").write_text(json.dumps(doc), encoding="utf-8")
    with pytest.raises(SystemExit, match=r"skills\.json was built from vectors\.json .* --refresh-context"):
        ea.main()
    (assets / "skills.json").unlink()
    with pytest.raises(SystemExit, match=r"skills\.json is missing; .* --only build_skills"):
        ea.main()
    assert calls == []  # stopped before any step
    # A skills.json written before the stamp is not checked, and says so.
    (assets / "skills.json").write_text(json.dumps({"grades": []}), encoding="utf-8")
    ea.main()
    assert "archetype_time" in _stems(calls)


def test_the_files_clustered_from_the_served_f32_carry_its_lineage(env):
    """served_model.f32_stamp: bundle.stamp() for an f32 exported from the bundle, None
    for one nothing ties to a run (the live assets' state)."""
    data, assets = env
    (assets / sm.F32).write_bytes(np.zeros(24, np.float32).tobytes())
    assert sm.f32_stamp(assets) is None  # no mtnn_lineage.json
    pm.promote(make_run(data, "r1"))
    eme.main(data_dir=data, assets=assets)
    assert sm.f32_stamp(assets) == pm.load_promoted().stamp()
    with open(assets / sm.F32, "ab") as f:
        f.write(b"\0\0\0\0")
    assert sm.f32_stamp(assets) is None  # other bytes than the lineage names
    assert {"archetypes_time.json", "archetype_assignments.json", "trajectories.json"} <= set(sm.SIDECARS)


def test_next_profile_eval_never_scores_an_unmeasured_actual(env, monkeypatch):
    """vectors.json `vm` lists the game dims a row never measured (FA2: FG3_PCT / FT_PCT
    with no attempt; `v` holds z 0.0 there). Such an actual is null and left out of mae,
    not compared with the prediction as if 0.0 had been measured."""
    data, assets = env
    for name, value in {"DATA": data, "ASSETS": assets, "VECTORS": assets / "vectors.json"}.items():
        monkeypatch.setattr(npe, name, value)
    monkeypatch.setattr(npe, "OUT", assets / "next_profile_eval.json")
    doc = json.loads((assets / "vectors.json").read_text(encoding="utf-8"))
    doc["features"] = list(COLUMNS)
    rng = np.random.default_rng(1)
    for p in doc["players"]:
        p["v"] = [round(float(x), 3) for x in rng.standard_normal(len(COLUMNS))]
    unmeasured = {("Player 11", "2020-21"): [1], ("Player 13", "1998-99"): [0, 1]}
    for p in doc["players"]:
        if (p["name"], p["season"]) in unmeasured:
            p["vm"] = unmeasured[(p["name"], p["season"])]
            for j in p["vm"]:
                p["v"][j] = 0.0  # what build_vectors stores there: the season mean
    (assets / "vectors.json").write_text(json.dumps(doc), encoding="utf-8")
    pm.promote(make_run(data, "r1"))
    npe.main()
    out = json.loads((assets / "next_profile_eval.json").read_text(encoding="utf-8"))
    assert out["primaryFeatures"] == ["PTS", "AST"]
    one = out["rows"]["Player 11|2019-20"]
    assert one["status"] == "scored" and one["actual"][1] is None and one["actual"][0] is not None
    assert one["mae"] == round(abs(one["pred"][0] - one["actual"][0]), 3)  # PTS only
    none_measured = out["rows"]["Player 13|1997-98"]
    assert none_measured["status"] == "scored" and none_measured["actual"][:2] == [None, None]
    assert none_measured["mae"] is None
    assert out["summary"]["meanAbsErrPrimary"] == one["mae"]  # the only measured mae

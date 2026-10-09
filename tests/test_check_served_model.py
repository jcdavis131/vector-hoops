"""scripts/check_served_model.py: a consistent served bundle passes, and each way of breaking it is named.

The bundle is exported for real (export_mtnn_embeddings on a tiny promoted
run in tmp_path) and mirrored into a tmp public/assets, then broken one way
at a time. Nothing here reads the repo's assets/: run against them the check
fails by design until the served bundle is re-promoted, and that verdict
belongs to its own CI job, not to this suite.

Run:  python -m pytest tests/test_check_served_model.py
"""

from __future__ import annotations

import importlib.util
import json
import shutil
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import export_mtnn_embeddings as eme  # noqa: E402
import promote as pm  # noqa: E402
import served_model as sm  # noqa: E402
from bundle_fixtures import make_run, write_matrix, write_vectors  # noqa: E402

_SPEC = importlib.util.spec_from_file_location("check_served_model", ROOT / "scripts" / "check_served_model.py")
csm = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(csm)


@pytest.fixture
def site(tmp_path, monkeypatch) -> Path:
    """tmp_path laid out like the repo: assets/ and public/assets/ serving run r1."""
    data = tmp_path / "pipeline" / "data"
    data.mkdir(parents=True)
    write_matrix(data)
    monkeypatch.setattr(pm, "DATA_DIR", data)
    monkeypatch.setattr(pm, "git_state", lambda root: {"sha": "a" * 40, "short": "aaaaaaaa", "dirty": False})
    pm.promote(make_run(data, "r1"))
    assets = tmp_path / "assets"
    write_vectors(assets)
    eme.main(data_dir=data, assets=assets)
    for name in sm.SIDECARS:
        (assets / name).write_text(json.dumps({"lineage": {"run_id": "r1"}}), encoding="utf-8")
    shutil.copytree(assets, tmp_path / "public" / "assets")
    return tmp_path


def problems(site: Path) -> str:
    return " | ".join(csm.check(site))


def test_a_promoted_exported_bundle_passes(site, capsys):
    assert csm.check(site) == []
    assert csm.main(["--root", str(site)]) == 0
    assert "served model: OK" in capsys.readouterr().out


def test_an_f32_of_the_wrong_size_fails(site, capsys):
    f32 = site / "public" / "assets" / sm.F32
    f32.write_bytes(f32.read_bytes()[:-16])
    why = problems(site)
    assert "public/assets/mtnn_embeddings.f32 is 80 bytes, but mtnn_meta.json rows*dim*4 = 6*4*4 = 96" in why
    assert csm.main(["--root", str(site)]) == 1
    assert "problem(s)" in capsys.readouterr().out


def test_a_missing_lineage_file_fails(site):
    (site / "assets" / sm.LINEAGE).unlink()
    assert "assets/mtnn_lineage.json: missing: nothing ties mtnn_embeddings.f32 to a promoted run" in problems(site)


def test_a_same_size_f32_from_another_model_fails(site):
    """What the size check alone cannot see: the 2dc6ad78 swap was the same 12966 x 64 shape."""
    f32 = site / "assets" / sm.F32
    f32.write_bytes(bytes(len(f32.read_bytes())))
    assert "assets/mtnn_embeddings.f32 sha256" in problems(site)


def test_a_hand_typed_metric_fails(site):
    path = site / "assets" / sm.META
    meta = json.loads(path.read_text(encoding="utf-8"))
    meta["cqs"] = 87.8
    meta["top1_790"] = 0.55
    path.write_text(json.dumps(meta), encoding="utf-8")
    why = problems(site)
    assert "mtnn_meta.json cqs 87.8 != mtnn_lineage.json cqs 90.0" in why
    assert "keys export_mtnn_embeddings never writes: ['top1_790']" in why


def test_a_reordered_vectors_json_fails(site):
    path = site / "assets" / "vectors.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["players"][0], doc["players"][1] = doc["players"][1], doc["players"][0]
    path.write_text(json.dumps(doc), encoding="utf-8")
    assert "vectors.json rows (pid|season, in order) are not the rows the f32 was exported against" in problems(site)


def test_a_sidecar_from_another_run_fails(site):
    (site / "assets" / "mtnn_map.json").write_text(json.dumps({"built": "2026-07-14"}), encoding="utf-8")
    assert "assets/mtnn_map.json is from run None, the served embedding from 'r1'" in problems(site)


def test_assets_and_public_serving_different_runs_fails(site):
    path = site / "public" / "assets" / sm.LINEAGE
    lin = json.loads(path.read_text(encoding="utf-8"))
    lin["run_id"] = "r0"
    path.write_text(json.dumps(lin), encoding="utf-8")
    assert "assets/ and public/assets/ serve different bundles" in problems(site)

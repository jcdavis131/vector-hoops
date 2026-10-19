"""scripts/check_served_model.py: a consistent served bundle passes, and each way of breaking it is named.

The bundle is exported for real (export_mtnn_embeddings on a tiny promoted
run in tmp_path) and mirrored into a tmp public/assets, then broken one way
at a time. test_the_committed_served_bundle_passes reads the repo's assets/
so a drift that would redden ci.yml's served-model job also fails this suite.

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


def _rewrite_f32_sidecar(site: Path, **fields: object) -> None:
    """Corrupt the export sidecar in assets/ and public/assets/; leave promoted/ alone."""
    for rel in csm.SERVED_DIRS:
        path = site / rel / sm.F32_LINEAGE
        side = json.loads(path.read_text(encoding="utf-8"))
        side.update(fields)
        path.write_text(json.dumps(side), encoding="utf-8")


def test_a_promoted_exported_bundle_passes(site, capsys):
    assert csm.check(site) == []
    assert csm.main(["--root", str(site)]) == 0
    assert "served model: OK" in capsys.readouterr().out


def test_the_committed_served_bundle_passes():
    """July v5 incumbent on master, after scripts/record_served_lineage.py."""
    assert csm.check(ROOT) == []


def test_the_committed_jacobian_and_attr_pop_are_marked_not_from_served_net():
    assert sm.STALE_SIDECAR_ALLOWLIST == frozenset({"mtnn_jacobian.json", "mtnn_attr_pop.json"})
    for name in ("mtnn_jacobian.json", "mtnn_attr_pop.json"):
        lin = json.loads((ROOT / "assets" / name).read_text(encoding="utf-8"))["lineage"]
        assert lin["stale"] is True and lin["not_from_served_net"] is True
        assert lin["run_id"] != sm.INCUMBENT_RUN_ID


def test_a_forced_lineage_with_a_different_sha_fails(site):
    """Hand-written forced adoption of a non-incumbent f32 fails the check, not only the recorder."""
    for rel in csm.SERVED_DIRS:
        path = site / rel / sm.LINEAGE
        lin = json.loads(path.read_text(encoding="utf-8"))
        lin["forced"] = True
        lin["force_reason"] = "sneak in a new model"
        lin["checkpoint_sha256"] = None
        lin["adoption"] = {"kind": "served-incumbent"}
        path.write_text(json.dumps(lin), encoding="utf-8")
    why = problems(site)
    assert "forced adoption is pinned to the July v5 incumbent" in why
    assert str(lin["embedding_f32_sha256"])[:12] in why
    assert csm.main(["--root", str(site)]) == 1


def test_a_forced_lineage_with_a_fake_checkpoint_sha_fails(site):
    """forced: true pins the July v5 sha even when checkpoint_sha256 is a non-empty fake."""
    for rel in csm.SERVED_DIRS:
        path = site / rel / sm.LINEAGE
        lin = json.loads(path.read_text(encoding="utf-8"))
        lin["forced"] = True
        lin["force_reason"] = "sneak in a new model"
        lin["checkpoint_sha256"] = "a" * 64
        path.write_text(json.dumps(lin), encoding="utf-8")
    why = problems(site)
    assert "forced adoption is pinned to the July v5 incumbent" in why
    assert str(lin["embedding_f32_sha256"])[:12] in why
    assert csm.main(["--root", str(site)]) == 1


def test_a_forced_lineage_passes_after_real_promote_then_export(site):
    """export writes the f32 sidecar next to the f32; no hand restamp of promoted/."""
    promoted = site / "pipeline" / "data" / "promoted"
    current = json.loads((promoted / "CURRENT.json").read_text(encoding="utf-8"))
    man = json.loads((promoted / current["run_id"] / "manifest.json").read_text(encoding="utf-8"))
    side = json.loads((site / "assets" / sm.F32_LINEAGE).read_text(encoding="utf-8"))
    f32_sha = None
    for rel in csm.SERVED_DIRS:
        path = site / rel / sm.LINEAGE
        lin = json.loads(path.read_text(encoding="utf-8"))
        f32_sha = lin["embedding_f32_sha256"]
        lin["forced"] = True
        lin["force_reason"] = "matching promote"
        path.write_text(json.dumps(lin), encoding="utf-8")
    assert "embedding_f32_sha256" not in man
    assert side["embedding_f32_sha256"] == f32_sha
    assert side["promote_manifest_sha256"] == current["manifest_sha256"] == lin["manifest_sha256"]
    assert side["embedding_npz_sha256"] == man["files"]["embedding"]["sha256"] != f32_sha
    assert csm.check(site) == []
    assert csm.main(["--root", str(site)]) == 0


def test_a_forced_lineage_fails_when_sidecar_f32_sha_differs(site):
    """Valid checkpoint shas are not enough if the sidecar f32 sha is not the served one."""
    f32_sha = None
    for rel in csm.SERVED_DIRS:
        path = site / rel / sm.LINEAGE
        lin = json.loads(path.read_text(encoding="utf-8"))
        f32_sha = lin["embedding_f32_sha256"]
        lin["forced"] = True
        lin["force_reason"] = "checkpoint-only promote"
        path.write_text(json.dumps(lin), encoding="utf-8")
    _rewrite_f32_sidecar(site, embedding_f32_sha256="b" * 64)
    why = problems(site)
    assert "forced adoption is pinned to the July v5 incumbent" in why
    assert str(f32_sha)[:12] in why
    assert f"{sm.F32_LINEAGE} records" in why
    assert csm.main(["--root", str(site)]) == 1


def test_a_sidecar_pointing_at_a_stale_promote_manifest_fails(site):
    """The sidecar must name the CURRENT.json manifest, not an older promote."""
    _rewrite_f32_sidecar(site, promote_manifest_sha256="c" * 64)
    why = problems(site)
    assert f"{sm.F32_LINEAGE} promote manifest sha" in why
    assert "is not CURRENT.json's" in why
    assert csm.main(["--root", str(site)]) == 1


def test_a_stale_sidecar_claiming_the_served_run_fails(site):
    (site / "assets" / "mtnn_jacobian.json").write_text(
        json.dumps({"lineage": {"run_id": "r1", "stale": True, "not_from_served_net": True}}),
        encoding="utf-8",
    )
    assert "assets/mtnn_jacobian.json is marked not-from-served-net but claims run 'r1'" in problems(site)


def test_a_non_allowlisted_stale_sidecar_with_drifted_run_id_fails(site):
    """Marking a sidecar stale is not a self-exemption; only the 48-d allowlist skips drift."""
    (site / "assets" / "mtnn_map.json").write_text(
        json.dumps({"lineage": {"run_id": "other-run", "stale": True, "not_from_served_net": True}}),
        encoding="utf-8",
    )
    assert "assets/mtnn_map.json is from run 'other-run', the served embedding from 'r1'" in problems(site)


def test_allowlisted_stale_sidecars_with_drifted_run_id_pass(site):
    """The 48-d jacobian and attr_pop may still skip run-id drift when marked stale."""
    for name, rid in (
        ("mtnn_jacobian.json", "pre-v5-48d-2026-07-14"),
        ("mtnn_attr_pop.json", "pre-v5-48d-2026-07-11"),
    ):
        for rel in csm.SERVED_DIRS:
            (site / rel / name).write_text(
                json.dumps({"lineage": {"run_id": rid, "stale": True, "not_from_served_net": True}}),
                encoding="utf-8",
            )
    assert csm.check(site) == []


def test_record_served_lineage_refuses_a_different_f32(tmp_path, monkeypatch, capsys):
    spec = importlib.util.spec_from_file_location(
        "record_served_lineage", ROOT / "scripts" / "record_served_lineage.py"
    )
    rsl = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(rsl)
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / sm.F32).write_bytes(b"not-the-incumbent")
    monkeypatch.setattr(rsl, "ASSETS", assets)
    assert rsl.main() == 1
    assert "not the pinned July v5 incumbent" in capsys.readouterr().err
    assert rsl.INCUMBENT_F32_SHA256 == sm.sha256_file(ROOT / "assets" / sm.F32)


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


def test_a_forced_bundle_passes_but_says_so(site, capsys):
    """A forced promotion is a recorded decision, not a broken bundle: exit 0, with a warning annotation."""
    for rel in csm.SERVED_DIRS:
        path = site / rel / sm.LINEAGE
        lin = json.loads(path.read_text(encoding="utf-8"))
        lin.update(
            forced=True,
            force_reason="e2e smoke",
            export_floors={"ok": False, "failed": ["archetype_top1"], "waived_by_force": "e2e smoke"},
        )
        path.write_text(json.dumps(lin), encoding="utf-8")
    assert csm.check(site) == []
    assert csm.main(["--root", str(site)]) == 0
    out = capsys.readouterr().out
    assert out.count("::warning title=served model override::") == 4
    assert "promoted with --force: e2e smoke" in out and "failed: ['archetype_top1']" in out


def test_an_unforced_bundle_prints_no_override_warning(site, capsys):
    assert csm.overrides(site) == []
    csm.main(["--root", str(site)])
    assert "::warning" not in capsys.readouterr().out


def test_a_sidecar_from_another_run_fails(site):
    (site / "assets" / "mtnn_map.json").write_text(json.dumps({"built": "2026-07-14"}), encoding="utf-8")
    assert "assets/mtnn_map.json is from run None, the served embedding from 'r1'" in problems(site)


def test_assets_and_public_serving_different_runs_fails(site):
    path = site / "public" / "assets" / sm.LINEAGE
    lin = json.loads(path.read_text(encoding="utf-8"))
    lin["run_id"] = "r0"
    path.write_text(json.dumps(lin), encoding="utf-8")
    assert "assets/ and public/assets/ serve different bundles" in problems(site)

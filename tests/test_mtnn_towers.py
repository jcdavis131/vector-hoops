"""arch.towerFamilies lists the promoted run's towers, by the rule train_mtnn builds them with [final#1].

export_mtnn_viz listed every manifest family as a tower, injury included,
while export_mtnn_jacobian lists the checkpoint's towers, so
verify_accuracy V13 (jacobian towerFamilies == arch towerFamilies) failed on
every fresh export. mtnn_towers holds the rule once for both; these tests
hold it to train_mtnn.family_slices + train_mtnn.main's filtering, and run
export_mtnn_viz on a tmp_path bundle whose matrix has an injury family.
tests/test_e2e_smoke.py compares the two exported files on a real run.

Run:  python -m pytest tests/test_mtnn_towers.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import export_mtnn_viz as viz  # noqa: E402
import mtnn_towers  # noqa: E402
import promote as pm  # noqa: E402
from bundle_fixtures import make_run, write_matrix, write_vectors  # noqa: E402

MANIFEST = {
    "features": ["PTS", "AST", "INJ_GP_PCT", "TRK_DRIVES", "FG3A", "INJ_MISSED"],
    "families": {
        "PTS": "volume",
        "AST": "playmaking",
        "INJ_GP_PCT": "injury",
        "TRK_DRIVES": "tracking",
        "FG3A": "volume",
        "INJ_MISSED": "injury",
    },
}


@pytest.mark.parametrize(
    "args",
    [
        {},
        {"exclude_families": "", "drop_features": ""},
        {"exclude_families": None, "drop_features": None},
        {"exclude_families": "tracking"},
        {"drop_features": "AST"},  # empties playmaking: the family is gone
        {"drop_features": "PTS, FG3A", "exclude_families": "playmaking ,tracking"},
    ],
)
def test_the_rule_is_train_mtnns(args):
    T = pytest.importorskip("train_mtnn")
    split = lambda v: {s.strip() for s in str(v or "").split(",") if s.strip()}  # noqa: E731
    drop, exclude = split(args.get("drop_features")), split(args.get("exclude_families"))
    # train_mtnn.main: family_slices(manifest, drop), then the exclude/injury filter.
    want = {k: v for k, v in T.family_slices(MANIFEST, drop).items() if k not in exclude and k != "injury"}
    assert mtnn_towers.family_columns(MANIFEST, drop) == T.family_slices(MANIFEST, drop)
    assert mtnn_towers.tower_columns(MANIFEST, args) == want
    assert list(mtnn_towers.tower_families(MANIFEST, args)) == list(want)


def test_injury_is_never_a_tower():
    assert "injury" not in mtnn_towers.tower_families(MANIFEST, {})
    assert mtnn_towers.tower_families(MANIFEST, {}) == ["volume", "playmaking", "tracking"]


def test_viz_lists_the_runs_towers_and_keeps_every_input_family(tmp_path, monkeypatch):
    data = tmp_path / "data"
    data.mkdir()
    write_matrix(data)
    # The fixture's three columns, with tracking relabelled injury: a matrix
    # with an injury family, as every real one since it was added.
    (data / "feature_manifest.json").write_text(
        json.dumps(
            {
                "features": ["PTS", "AST", "TRK_DRIVES"],
                "families": {"PTS": "volume", "AST": "playmaking", "TRK_DRIVES": "injury"},
            }
        ),
        encoding="utf-8",
    )
    assets = tmp_path / "assets"
    write_vectors(assets)
    monkeypatch.setattr(pm, "DATA_DIR", data)
    monkeypatch.setattr(pm, "git_state", lambda root: {"sha": "a" * 40, "short": "aaaaaaaa", "dirty": False})
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
    viz.main()
    arch = json.loads((assets / "mtnn_arch.json").read_text(encoding="utf-8"))
    assert arch["towerFamilies"] == ["volume", "playmaking"]  # display order, injury dropped
    assert arch["familyOrder"] == ["injury", "playmaking", "volume"]  # the inputs, injury kept
    assert set(arch["familyFeatures"]) == set(arch["familyOrder"])
    inputs = np.fromfile(assets / "mtnn_inputs.f32", dtype=np.float32)
    assert inputs.size == 6 * len(arch["familyOrder"])  # keyed by familyOrder, as network-viz.js reads it
    layers = {layer["id"]: layer["detail"] for layer in arch["layers"]}
    assert layers["input"] == "2 features in 2 families"
    assert layers["towers"].startswith("2 × 2 blocks")

    # A run that excluded a family: towerFamilies follows its args.
    pm.promote(make_run(data, "r2", seed=1, args={"exclude_families": "playmaking"}))
    viz.main()
    arch = json.loads((assets / "mtnn_arch.json").read_text(encoding="utf-8"))
    assert arch["towerFamilies"] == ["volume"]
    assert arch["familyOrder"] == ["injury", "playmaking", "volume"]

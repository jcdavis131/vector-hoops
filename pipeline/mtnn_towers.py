"""mtnn_towers.py -- which matrix families a trained MTNN has a tower for. Numpy-free, torch-free.

train_mtnn.main builds its towers from feature_manifest.json in three steps:
family_slices(manifest, --drop-features) (a family that loses every column
is gone), then minus --exclude-families, then minus "injury" always (injury
is only the durability head's target). export_mtnn_jacobian.tower_slices
and eval_v2 apply that rule; export_mtnn_viz listed every manifest family as
a tower instead, injury included, so mtnn_arch.json's towerFamilies never
matched mtnn_jacobian.json's and verify_accuracy V13 failed on every fresh
export [final#1]. This module is the rule once, readable by the exporters
that must not import torch (export_mtnn_viz is numpy-only).

`args` is the trained run's recorded arguments: its checkpoint's
ckpt["args"] or the report's lineage.args, the same vars(args).
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

# Never a tower: train_mtnn drops it unconditionally.
NEVER_A_TOWER = frozenset({"injury"})


def _names(value: Any) -> set[str]:
    return {s.strip() for s in str(value or "").split(",") if s.strip()}


def family_columns(manifest: Mapping[str, Any], drop: set[str] | None = None) -> dict[str, list[int]]:
    """Column indices per family, minus the features in drop; a family left empty is removed.

    The same mapping as train_mtnn.family_slices (tests/test_mtnn_towers.py holds them equal).
    """
    drop = drop or set()
    fams: dict[str, list[int]] = {}
    for j, f in enumerate(manifest["features"]):
        if f in drop:
            continue
        fams.setdefault(manifest["families"][f], []).append(j)
    return {k: v for k, v in fams.items() if v}


def tower_columns(manifest: Mapping[str, Any], args: Mapping[str, Any]) -> dict[str, list[int]]:
    """The matrix columns per tower, as train_mtnn.main built them for a run with these args."""
    exclude = _names(args.get("exclude_families")) | NEVER_A_TOWER
    cols = family_columns(manifest, _names(args.get("drop_features")))
    return {k: v for k, v in cols.items() if k not in exclude}


def tower_families(manifest: Mapping[str, Any], args: Mapping[str, Any]) -> list[str]:
    """The tower families, in the order train_mtnn builds them."""
    return list(tower_columns(manifest, args))

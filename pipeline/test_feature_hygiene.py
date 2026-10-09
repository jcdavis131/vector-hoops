"""Feature-hygiene gates — run after every integrate_context.py rebuild.

Three bugs of the same shape shipped undetected in July 2026: career features
at 0% coverage (3306bf6), position labels absent for all 12,966 rows (56ff7dd),
and FORM_GP feeding the durability head its own target. None of them broke a
build or moved a loss curve; they just quietly degraded the model. These gates
turn that class of failure into an exit code.

local_data: the matrix and manifest live in gitignored pipeline/data, so CI
deselects these and they run on the training box. There, set
HOOPS_REQUIRE_LOCAL_DATA=1 (the script form does) and a missing matrix fails
instead of skipping, as the old script's exit 1 did. Read-only.

Run:  python -m pytest pipeline/test_feature_hygiene.py
      python pipeline/test_feature_hygiene.py    (same tests; exit 0 = all gates pass)
"""

from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "pipeline" / "data"
MATRIX = DATA / "train_matrix.npz"
MANIFEST = DATA / "feature_manifest.json"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from integrate_context import RETIRED_FEATURES  # noqa: E402

pytestmark = pytest.mark.local_data

# A column the durability head predicts. An input tower carrying a near-copy
# lets the head solve its task by reading its own label.
TARGET_FAMILIES = {"injury"}

DUP_R = 0.995  # perfect-duplicate territory, not merely correlated
LEAK_R = 0.95
MIN_OVERLAP = 400
MIN_COVERAGE = 0.01

# Redundant input pairs that are known, deliberate, and measured harmless. Add
# to this set only with a reason and a measurement — an unexplained entry here
# is how a real duplicate hides.
KNOWN_DUPLICATES = {
    # Identical draft position in two towers (bio and career). Masking it
    # measured free (CQS +0.00), and removing it means editing
    # build_vectors.BIO_COLS, which rebuilds the live vectors.json for zero
    # gain. See docs/MTNN_STABILITY_2026-07-24.md §6-§7.
    "DRAFT_NUMBER~DRAFT_SLOT_Z",
    # Structural complements: assisted% + unassisted% = 100 by construction, so
    # r=-0.9986 is arithmetic, not duplicated sourcing. Both are kept because
    # the pair is how the shotmix tower expresses shot creation.
    "PCT_AST_FGM~PCT_UAST_FGM",
    "PCT_AST_2PM~PCT_UAST_2PM",
    "PCT_AST_3PM~PCT_UAST_3PM",
}


def masked_corr(a, b, ma, mb) -> tuple[float, int]:
    both = (ma > 0) & (mb > 0)
    n = int(both.sum())
    if n < MIN_OVERLAP:
        return 0.0, n
    x, y = a[both].astype(np.float64), b[both].astype(np.float64)
    sx, sy = x.std(), y.std()
    if sx < 1e-9 or sy < 1e-9:
        return 0.0, n
    return float(((x - x.mean()) * (y - y.mean())).mean() / (sx * sy)), n


@pytest.fixture(scope="module")
def matrix() -> dict:
    missing = [p.relative_to(ROOT).as_posix() for p in (MATRIX, MANIFEST) if not p.exists()]
    if missing:
        pytest.skip(f"local data missing: {', '.join(missing)} (run integrate_context.py)")
    man = json.loads(MANIFEST.read_text(encoding="utf-8"))
    m = np.load(MATRIX, allow_pickle=True)
    return {"Z": m["Z"], "M": m["mask"], "feats": man["features"], "fam_of": man["families"]}


def test_shape(matrix):
    Z, M, feats = matrix["Z"], matrix["M"], matrix["feats"]
    assert Z.shape[1] == len(feats), f"matrix width {Z.shape[1]} vs manifest features {len(feats)}"
    assert Z.shape == M.shape, "values and mask differ in shape"


def test_retired_features_stay_retired(matrix):
    back = sorted(f for f in RETIRED_FEATURES if f in matrix["feats"])
    assert not back, f"retired features are in the matrix: {back}"


def test_no_dead_columns(matrix):
    Z, M = matrix["Z"], matrix["M"]
    dead = []
    for j, f in enumerate(matrix["feats"]):
        obs = M[:, j] > 0
        if obs.mean() < MIN_COVERAGE:
            dead.append(f"{f} (coverage {obs.mean():.4f})")
        elif obs.sum() >= MIN_OVERLAP and float(Z[obs, j].std()) < 0.01:
            dead.append(f"{f} (near-constant)")
    assert not dead, f"features carrying no signal: {', '.join(dead[:5])}"


def test_no_new_duplicate_input_pairs(matrix):
    # Only input columns matter here. Two injury targets being near-collinear
    # (INJ_GP_PCT ~ INJ_MISS_N at -0.9998) is a property of the label space, not
    # a duplicated input, and the durability head is a multi-target regressor by
    # design.
    Z, M, feats, fam_of = matrix["Z"], matrix["M"], matrix["feats"], matrix["fam_of"]
    dups = []
    for j in range(len(feats)):
        if fam_of.get(feats[j]) in TARGET_FAMILIES:
            continue
        for k in range(j + 1, len(feats)):
            if fam_of.get(feats[k]) in TARGET_FAMILIES:
                continue
            r, _ = masked_corr(Z[:, j], Z[:, k], M[:, j], M[:, k])
            if abs(r) >= DUP_R:
                dups.append(f"{feats[j]}~{feats[k]} r={r:+.4f}")
    unknown_dups = [d for d in dups if d.split(" r=")[0] not in KNOWN_DUPLICATES]
    assert not unknown_dups, f"new duplicate pairs |r|>={DUP_R}: {', '.join(unknown_dups[:5])}"


def test_no_input_leaks_the_durability_target(matrix):
    Z, M, feats, fam_of = matrix["Z"], matrix["M"], matrix["feats"], matrix["fam_of"]
    target_cols = [j for j, f in enumerate(feats) if fam_of.get(f) in TARGET_FAMILIES]
    leaks = []
    for j in target_cols:
        for k, f in enumerate(feats):
            if fam_of.get(f) in TARGET_FAMILIES:
                continue
            r, _ = masked_corr(Z[:, j], Z[:, k], M[:, j], M[:, k])
            if abs(r) >= LEAK_R:
                leaks.append(f"{f} -> {feats[j]} r={r:+.4f}")
    assert not leaks, f"inputs within |r|>={LEAK_R} of an injury target: {', '.join(leaks[:5])}"


def test_families_intact(matrix):
    fam_cols: dict[str, list[int]] = defaultdict(list)
    for j, f in enumerate(matrix["feats"]):
        fam_cols[matrix["fam_of"].get(f, "?")].append(j)
    assert "?" not in fam_cols, f"features with no family: {[matrix['feats'][j] for j in fam_cols['?']][:5]}"
    assert len(fam_cols) >= 15, f"only {len(fam_cols)} families"


if __name__ == "__main__":
    # Script form for update_dataset.py, which reads only the exit code.
    # HOOPS_REQUIRE_LOCAL_DATA=1: a missing matrix is a failure, as it was.
    os.environ.setdefault("HOOPS_REQUIRE_LOCAL_DATA", "1")
    sys.exit(pytest.main([__file__, "-p", "no:cacheprovider", "--runxfail"]))

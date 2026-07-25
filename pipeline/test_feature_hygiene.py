"""Feature-hygiene gates — run after every integrate_context.py rebuild.

Three bugs of the same shape shipped undetected in July 2026: career features
at 0% coverage (3306bf6), position labels absent for all 12,966 rows (56ff7dd),
and FORM_GP feeding the durability head its own target. None of them broke a
build or moved a loss curve; they just quietly degraded the model. These gates
turn that class of failure into an exit code.

Run:  python pipeline/test_feature_hygiene.py    (exit 0 = all gates pass)
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "pipeline" / "data"
MATRIX = DATA / "train_matrix.npz"
MANIFEST = DATA / "feature_manifest.json"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from integrate_context import RETIRED_FEATURES  # noqa: E402

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

FAILURES: list[str] = []


def check(ok: bool, label: str) -> None:
    print(f"  {'PASS' if ok else 'FAIL'}  {label}")
    if not ok:
        FAILURES.append(label)


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


def main() -> None:
    if not MATRIX.exists() or not MANIFEST.exists():
        print(
            "train_matrix.npz / feature_manifest.json missing — run integrate_context.py"
        )
        sys.exit(1)

    man = json.loads(MANIFEST.read_text(encoding="utf-8"))
    m = np.load(MATRIX, allow_pickle=True)
    Z, M = m["Z"], m["mask"]
    feats: list[str] = man["features"]
    fam_of: dict[str, str] = man["families"]

    print("shape")
    check(Z.shape[1] == len(feats), f"matrix width == manifest features ({len(feats)})")
    check(Z.shape == M.shape, "values and mask same shape")

    print("retired features stay retired")
    for f in sorted(RETIRED_FEATURES):
        check(f not in feats, f"{f} absent from the matrix")

    print("no dead columns")
    dead = []
    for j, f in enumerate(feats):
        obs = M[:, j] > 0
        if obs.mean() < MIN_COVERAGE:
            dead.append(f"{f} (coverage {obs.mean():.4f})")
        elif obs.sum() >= MIN_OVERLAP and float(Z[obs, j].std()) < 0.01:
            dead.append(f"{f} (near-constant)")
    check(
        not dead,
        f"every feature carries signal{'' if not dead else ': ' + ', '.join(dead[:5])}",
    )

    print("no perfect duplicates among input features")
    # Only input columns matter here. Two injury targets being near-collinear
    # (INJ_GP_PCT ~ INJ_MISS_N at -0.9998) is a property of the label space, not
    # a duplicated input, and the durability head is a multi-target regressor by
    # design.
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
    check(
        not unknown_dups,
        f"no new duplicate pairs |r|>={DUP_R}"
        f"{'' if not unknown_dups else ': ' + ', '.join(unknown_dups[:5])}",
    )

    print("no input leaks the durability target")
    target_cols = [j for j, f in enumerate(feats) if fam_of.get(f) in TARGET_FAMILIES]
    leaks = []
    for j in target_cols:
        for k, f in enumerate(feats):
            if fam_of.get(f) in TARGET_FAMILIES:
                continue
            r, _ = masked_corr(Z[:, j], Z[:, k], M[:, j], M[:, k])
            if abs(r) >= LEAK_R:
                leaks.append(f"{f} -> {feats[j]} r={r:+.4f}")
    check(
        not leaks,
        f"no input within |r|>={LEAK_R} of an injury target"
        f"{'' if not leaks else ': ' + ', '.join(leaks[:5])}",
    )

    print("families intact")
    fam_cols: dict[str, list[int]] = defaultdict(list)
    for j, f in enumerate(feats):
        fam_cols[fam_of.get(f, "?")].append(j)
    check("?" not in fam_cols, "every feature has a family")
    check(len(fam_cols) >= 15, f"family count sane ({len(fam_cols)})")

    print()
    if FAILURES:
        print(f"{len(FAILURES)} feature-hygiene gate(s) FAILED")
        sys.exit(1)
    print("all feature-hygiene gates passed")


if __name__ == "__main__":
    main()

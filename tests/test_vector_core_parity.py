"""Parity gate: local pipeline utilities vs the shared vector_core library.

Before vector-hoops swaps its duplicated preprocessing + era-alignment modules
for imports from the shared ``vector_core`` package, this gate proves the swap
is a zero-behavior-change refactor: on a seeded synthetic fixture, the local
``pipeline/realmlp_preproc.py`` and ``pipeline/era_procrustes_align.py`` produce
output that is *bit-identical* (max abs diff == 0.0, same float32 dtype) to the
corresponding ``vector_core`` implementations.

If any assertion here fails, the swap must NOT be performed.

Run:  pytest tests/test_vector_core_parity.py -q
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import vector_core

REPO_ROOT = Path(__file__).resolve().parents[1]
PIPELINE = REPO_ROOT / "pipeline"

# Commit that still carries the original local pipeline/realmlp_preproc.py and
# pipeline/era_procrustes_align.py (the base of chore/adopt-vector-core, before
# those modules were deleted in favour of vector_core). Loading the reference
# implementation from this pinned blob keeps the parity gate permanently
# runnable even after the working-tree modules are removed, so it stays a live
# regression guard: if vector_core ever diverges from hoops' proven behaviour,
# this test fails.
_REFERENCE_REV = "1b0570bc0783ab7f89cf0848769d1a3b4b6211a6"


def _load_local(name: str):
    """Load the *original* local pipeline module (as train_mtnn imported it).

    Prefers the working-tree file if it still exists (pre-deletion run); once the
    module has been deleted, falls back to the pinned reference commit so the
    parity comparison target is always available.
    """
    src_path = PIPELINE / f"{name}.py"
    if src_path.exists():
        source = src_path.read_text(encoding="utf-8")
    else:
        source = subprocess.check_output(
            ["git", "-C", str(REPO_ROOT), "show", f"{_REFERENCE_REV}:pipeline/{name}.py"],
            text=True,
        )
    tmp = Path(tempfile.mkdtemp()) / f"{name}.py"
    tmp.write_text(source, encoding="utf-8")
    spec = importlib.util.spec_from_file_location(name, tmp)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _make_fixture(seed: int = 1234, n: int = 240, d: int = 14):
    """Seeded synthetic z-scored matrix, seasons, and validity mask."""
    rng = np.random.default_rng(seed)
    Z = rng.standard_normal((n, d)).astype(np.float32)
    # inject a few outliers so median/IQR clipping actually bites
    Z[rng.integers(0, n, size=12), rng.integers(0, d, size=12)] = 9.0
    seasons = [f"{1996 + (i % 6)}-{(97 + (i % 6)) % 100:02d}" for i in range(n)]
    mask = (rng.random((n, d)) > 0.1).astype(np.float32)
    return Z, seasons, mask


def _make_drift(seasons: list[str], d: int = 14, seed: int = 99) -> dict:
    """Synthetic drift.json with an orthogonal chained rotation per season."""
    rng = np.random.default_rng(seed)
    chained = {}
    for s in sorted(set(seasons)):
        a = rng.standard_normal((d, d))
        q, _ = np.linalg.qr(a)  # orthogonal DxD
        chained[s] = q.astype(np.float32).tolist()
    return {"method": "orthogonal-procrustes-synthetic", "chainedToRoot": chained}


def test_realmlp_preprocessor_parity():
    local_mod = _load_local("realmlp_preproc")
    Z, seasons, mask = _make_fixture()

    local = local_mod.RealMLPPreprocessor(list(range(Z.shape[1])))
    local.fit(Z.copy(), seasons, mask.copy(), by_season=True)
    out_local = local.transform(Z.copy(), seasons)

    lib = vector_core.RealMLPPreprocessor(list(range(Z.shape[1])))
    lib.fit(Z.copy(), seasons, mask.copy(), by_season=True)
    out_lib = lib.transform(Z.copy(), seasons)

    assert out_local.dtype == np.float32
    assert out_lib.dtype == np.float32
    assert out_local.dtype == out_lib.dtype
    assert out_local.shape == out_lib.shape
    max_abs_diff = float(np.max(np.abs(out_local - out_lib)))
    assert max_abs_diff == 0.0, f"RealMLPPreprocessor parity residual: {max_abs_diff}"


def test_era_alignment_parity():
    local_mod = _load_local("era_procrustes_align")
    Z, seasons, _ = _make_fixture()
    drift = _make_drift(seasons, d=Z.shape[1])

    with tempfile.TemporaryDirectory() as tmp:
        drift_path = Path(tmp) / "drift.json"
        drift_path.write_text(json.dumps(drift), encoding="utf-8")

        # local load_alignment() hardcodes assets/drift.json -> point it at the fixture
        local_mod.DRIFT = drift_path
        chains_local = local_mod.load_alignment()["chains"]

        # vector_core takes an explicit path-or-dict source
        chains_lib = vector_core.load_alignment(drift_path)["chains"]

    assert sorted(chains_local) == sorted(chains_lib)
    for s in chains_local:
        assert chains_local[s].dtype == chains_lib[s].dtype == np.float32
        assert float(np.max(np.abs(chains_local[s] - chains_lib[s]))) == 0.0

    out_local = local_mod.align_batch(Z.copy(), [str(s) for s in seasons], chains_local)
    out_lib = vector_core.align_batch(Z.copy(), [str(s) for s in seasons], chains_lib)

    assert out_local.dtype == np.float32
    assert out_lib.dtype == np.float32
    assert out_local.shape == out_lib.shape
    max_abs_diff = float(np.max(np.abs(out_local - out_lib)))
    assert max_abs_diff == 0.0, f"align_batch parity residual: {max_abs_diff}"


if __name__ == "__main__":
    test_realmlp_preprocessor_parity()
    test_era_alignment_parity()
    print("vector_core parity gates passed (0.0 diff)")

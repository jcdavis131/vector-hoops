"""Gates for assets/mtnn_embeddings.f32 + mtnn_meta.json.

Run after export_mtnn_embeddings.py:
  python -m pytest pipeline/test_mtnn_export.py
  python pipeline/test_mtnn_export.py          (same tests; exit 0 = all gates pass)

Tracked assets only, so these run in CI. Two things changed when this became a
pytest module, both because nobody had been running it:

- It asserted `dim == 48`. The promoted v5 model (07-25) is 64-d, so this gate
  had been red since that promotion. The invariant it stood for is that the
  bytes, the meta and the architecture describe one embedding: f32 bytes ==
  rows*dim*4 and meta dim == mtnn_arch.json dEmb. That is what it checks now.
- `meta["centroids"]` raised KeyError on the committed meta, which export
  writes but the hand-assembled v6 meta does not have. Those two checks stay as
  they were and are marked xfail with the finding, rather than dropped.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
VECTORS = ASSETS / "vectors.json"
F32 = ASSETS / "mtnn_embeddings.f32"
META = ASSETS / "mtnn_meta.json"
ARCH = ASSETS / "mtnn_arch.json"

# export_mtnn_embeddings.py writes built/centroids/purity_at_20 (the v5 meta,
# blob 4c0e879f, has all three). The committed meta is the v6 one from
# 2dc6ad78, assembled outside the pipeline, with none of them.
SERVED_V6 = "[eval#0] committed mtnn_meta.json is the hand-assembled v6 meta from 2dc6ad78, not export output"


@pytest.fixture(scope="module")
def meta() -> dict:
    return json.loads(META.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def emb(meta) -> np.ndarray:
    rows, dim = int(meta["rows"]), int(meta["dim"])
    size = F32.stat().st_size
    assert size == rows * dim * 4, f"{F32.name} is {size} bytes, rows*dim*4 = {rows}*{dim}*4 = {rows * dim * 4}"
    return np.fromfile(F32, dtype=np.float32).reshape(rows, dim)


def test_rows_match_vectors_json(meta):
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    assert len(vec["players"]) == int(meta["rows"]), f"vectors.json {len(vec['players'])} vs meta rows {meta['rows']}"


def test_bytes_meta_and_architecture_describe_one_embedding(meta, emb):
    arch = json.loads(ARCH.read_text(encoding="utf-8"))
    assert emb.shape == (int(meta["rows"]), int(meta["dim"]))
    assert int(meta["dim"]) == int(arch["dEmb"]), f"meta dim {meta['dim']} vs mtnn_arch dEmb {arch['dEmb']}"


def test_rows_are_l2_normalized(emb):
    norms = np.linalg.norm(emb, axis=1)
    assert float(norms.min()) > 0.99, f"min row norm {float(norms.min()):.4f}"
    assert float(norms.max()) < 1.01, f"max row norm {float(norms.max()):.4f}"


@pytest.mark.xfail(strict=True, reason=f"{SERVED_V6}; it has no 'centroids'")
def test_eight_archetype_centroids(meta):
    cents = np.array(meta["centroids"], dtype=np.float32)
    assert cents.shape == (8, int(meta["dim"])), f"centroids shape {cents.shape}"


@pytest.mark.xfail(strict=True, reason=f"{SERVED_V6}; it has no 'purity_at_20'")
def test_purity_at_20_floor(meta):
    purity = meta.get("purity_at_20")
    assert purity is not None and purity >= 0.63, f"purity@20 {purity}"


if __name__ == "__main__":
    # Script form for export_assets.py / retrain_universe.py, which read only the
    # exit code. --runxfail: a known defect still fails here.
    os.environ.setdefault("HOOPS_REQUIRE_LOCAL_DATA", "1")
    sys.exit(pytest.main([__file__, "-p", "no:cacheprovider", "--runxfail"]))

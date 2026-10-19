"""Peers-top8 freshness gates — run after every build_peers_topk.py.

The atlas, live-atlas, and player-profile "similar craft" lists read
assets/peers_top8.json instead of downloading mtnn_embeddings.f32. If the
peers rebuild is skipped after a data refresh, the site silently serves
stale neighbors; these gates pin peers_top8.json to the f32's sha256 and
re-verify a sample of rows against the f32 directly.

Run:  python -m pytest pipeline/test_peers_topk.py
      python pipeline/test_peers_topk.py     (same tests; exit 0 = all gates pass)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import served_model as sm

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
PEERS = ASSETS / "peers_top8.json"
F32 = ASSETS / "mtnn_embeddings.f32"
META = ASSETS / "mtnn_meta.json"
K = 8


@pytest.fixture(scope="module")
def doc() -> dict:
    return json.loads(PEERS.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def meta() -> dict:
    return json.loads(META.read_text(encoding="utf-8"))


def test_peers_tracks_the_served_f32(doc):
    """The JSON must be built from exactly the f32 the lineage names."""
    lineage = sm.verify_f32(ASSETS)  # raises if bytes != lineage
    assert doc["f32_sha256"] == lineage["embedding_f32_sha256"]
    assert doc["f32_sha256"] == sm.sha256_file(F32)


def test_shape(doc, meta):
    rows, k = meta["rows"], doc["k"]
    assert doc["rows"] == rows
    assert k == K
    assert len(doc["peers"]) == rows
    bad = [i for i, p in enumerate(doc["peers"]) if len(p) != 2 * k]
    assert not bad, f"{len(bad)} rows do not hold exactly k=8 pairs"


def test_values_sane(doc, meta):
    rows = meta["rows"]
    for i, p in enumerate(doc["peers"]):
        ids = p[0::2]
        sims = p[1::2]
        assert all(isinstance(x, int) and 0 <= x < rows for x in ids), f"row {i}: bad id"
        assert i not in ids, f"row {i}: peers with itself"
        assert len(set(ids)) == len(ids), f"row {i}: duplicate peer"
        assert all(isinstance(s, (int, float)) and -1.0 <= s <= 1.0 for s in sims), f"row {i}: sim out of range"
        assert all(a >= b for a, b in zip(sims, sims[1:])), f"row {i}: not desc by cosine"


def test_spot_check_against_f32(doc, meta):
    """A sample of rows recomputed live must match the stored top-8."""
    rows, dim = meta["rows"], meta["dim"]
    emb = np.fromfile(str(F32), dtype=np.float32).reshape(rows, dim)
    lite = json.loads((ASSETS / "vectors_search_lite.json").read_text(encoding="utf-8"))
    players = lite["players"] if isinstance(lite, dict) else lite
    names = {p["i"]: p.get("n", "") for p in players if 0 <= p.get("i", -1) < rows}
    rng = np.random.default_rng(42)
    for i in map(int, rng.choice(rows, size=12, replace=False)):
        sims = emb @ emb[i]
        sims[i] = -np.inf
        nm = names.get(i, "")
        if nm:
            sims[[j for j, n in names.items() if n == nm and j != i]] = -np.inf
        idx = np.argpartition(sims, -K)[-K:]
        idx = idx[np.argsort(sims[idx])[::-1]]
        stored_ids = doc["peers"][i][0::2]
        assert list(idx) == stored_ids, f"row {i}: live top-8 != stored"
        stored_sims = doc["peers"][i][1::2]
        for j, s in zip(idx, stored_sims):
            assert abs(float(sims[j]) - s) < 5e-4, f"row {i} peer {j}: sim drift"


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-q"]))

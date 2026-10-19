"""Emit assets/peers_top8.json: precomputed top-8 64-d cosine peers per row.

Why this exists (Straubel/Dean, 2026-10-19): the browser used to download
assets/mtnn_embeddings.f32 (3.3 MB of raw model weights) to compute
nearest-neighbors live — atlas peers, live-atlas style twins, player-profile
"similar craft" lists. The player set and the embedding are both frozen, so
every one of those numbers is a build-time constant. This script computes
them once; the served path ships the JSON and never touches the f32.

Call sites that must use assets/vh-peers.js (the JSON's reader) instead of
VHMtnn.topK:
  - assets/atlas-map.js      (peers of the selected point, k=3)
  - assets/live-atlas.js     (style twins, k=6)
  - assets/players-skills.js (similar craft profiles, k=5)

Filter parity: all three call sites exclude same-name rows
(`P[i].n !== name`). The precompute applies the same rule, and vh-peers.js
re-applies the caller's filterFn on the stored list, so topK(row, k, f)
matches the old live computation exactly for k <= 8.

Lineage: slices the served f32, so it first checks those bytes are the ones
assets/mtnn_lineage.json names (served_model.verify_f32) and refuses
otherwise — same gate as build_scoring_lite.py. Stamps run_id + f32 sha256.

Rerun when mtnn_embeddings.f32 or vectors_search_lite.json (names) change.

    python pipeline/build_peers_topk.py
    python -m pytest pipeline/test_peers_topk.py
"""

from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np

import served_model as sm

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
K = 8
OUT = ASSETS / "peers_top8.json"


def main() -> int:
    try:
        lineage = sm.verify_f32(ASSETS)
    except sm.ServedModelError as e:
        raise SystemExit(f"build_peers_topk: {e}") from None

    meta = json.loads((ASSETS / "mtnn_meta.json").read_text(encoding="utf-8"))
    dim, rows = int(meta["dim"]), int(meta["rows"])
    if (rows, dim) != (lineage.get("rows"), lineage.get("dim")):
        raise SystemExit(
            f"build_peers_topk: mtnn_meta.json says {rows}x{dim}, "
            f"{sm.LINEAGE} {lineage.get('rows')}x{lineage.get('dim')}"
        )

    emb = np.fromfile(str(ASSETS / "mtnn_embeddings.f32"), dtype=np.float32)
    if emb.size != rows * dim:
        raise SystemExit(f"build_peers_topk: f32 has {emb.size} floats, expected {rows * dim}")
    emb = emb.reshape(rows, dim)

    lite = json.loads((ASSETS / "vectors_search_lite.json").read_text(encoding="utf-8"))
    players = lite["players"] if isinstance(lite, dict) else lite
    names = [""] * rows
    for p in players:
        i = p.get("i")
        if isinstance(i, int) and 0 <= i < rows:
            names[i] = p.get("n") or ""

    # name -> row indices, so the same-name mask is a dict lookup per row
    from collections import defaultdict

    name_rows: dict[str, list[int]] = defaultdict(list)
    for i, nm in enumerate(names):
        if nm:
            name_rows[nm].append(i)

    # Blocked cosine: 12,966 rows x 64-d. One full matmul is ~1.1 GB of
    # float32 output; block the query side so peak stays modest.
    block = 2048
    peers: list[list] = [[] for _ in range(rows)]
    for start in range(0, rows, block):
        end = min(rows, start + block)
        sims = emb[start:end] @ emb.T  # (block, rows); rows are L2-normalized
        for bi in range(end - start):
            i = start + bi
            row = sims[bi]
            row[i] = -np.inf  # never peer with yourself
            nm = names[i]
            # top-K excluding same-name rows, matching the call-site filters
            if nm:
                for j in name_rows[nm]:
                    if j != i:
                        row[j] = -np.inf
            # argpartition for the top K, then exact-sort those K
            idx = np.argpartition(row, -K)[-K:]
            idx = idx[np.argsort(row[idx])[::-1]]
            flat: list = []
            for j in idx:
                s = float(row[j])
                if not np.isfinite(s):
                    continue
                flat.extend([int(j), round(min(1.0, max(-1.0, s)), 4)])
            peers[i] = flat
        del sims
        print(f"  rows {start}-{end} done", file=sys.stderr)

    doc = {
        "run_id": lineage.get("run_id"),
        "built": dt.date.today().isoformat(),
        "source": "mtnn_embeddings.f32",
        "f32_sha256": sm.sha256_file(ASSETS / "mtnn_embeddings.f32"),
        "rows": rows,
        "k": K,
        "format": "peers[row_id] = flat [peer_id, cosine4, ...], desc by cosine, same-name excluded",
        "peers": peers,
    }
    OUT.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Structural identity check: retrained run vs the served v5 champion.

1. Linear CKA between the two 64-d embedding spaces on the shared row set.
2. Twin/neighbor stability: for each row, top-3 nearest neighbors by cosine
   in old vs new space; report fraction of probes with identical top-1 and
   identical top-3 sets.

Rows are joined on (player_id, season) — never assumed to be in the same order.

Run:  python pipeline/v5_identity_check.py --run-dir pipeline/data/runs/seed7 [--probes N]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"


def load_served() -> tuple[np.ndarray, list[tuple]]:
    E = np.fromfile(ASSETS / "mtnn_embeddings.f32", dtype=np.float32).reshape(-1, 64)
    players = json.loads((ASSETS / "vectors.json").read_text(encoding="utf-8"))["players"]
    keys = [(str(p.get("pid")), str(p["season"])) for p in players]
    assert len(keys) == E.shape[0], f"served rows {E.shape[0]} != vectors {len(keys)}"
    return E, keys


def load_run(run_dir: Path) -> tuple[np.ndarray, list[tuple]]:
    d = np.load(run_dir / "embedding_v3.npz", allow_pickle=False)
    E = np.ascontiguousarray(d["E"], dtype=np.float64)
    keys = list(zip([str(p) for p in d["player_id"].tolist()], [str(s) for s in d["season"].tolist()], strict=True))
    return E, keys


def linear_cka(X: np.ndarray, Y: np.ndarray) -> float:
    Xc = X - X.mean(axis=0, keepdims=True)
    Yc = Y - Y.mean(axis=0, keepdims=True)
    cross = np.linalg.norm(Yc.T @ Xc, ord="fro") ** 2
    return float(cross / (np.linalg.norm(Xc.T @ Xc, ord="fro") * np.linalg.norm(Yc.T @ Yc, ord="fro")))


def topk_neighbors(E: np.ndarray, k: int, batch: int = 2048) -> np.ndarray:
    n = E.shape[0]
    out = np.empty((n, k), dtype=np.int64)
    for s in range(0, n, batch):
        e = batch
        sims = E[s : s + e] @ E.T
        # exclude self
        idx = np.arange(s, min(s + e, n))
        sims[np.arange(e)[: len(idx)], idx] = -np.inf
        out[s : s + e] = np.argpartition(-sims, k, axis=1)[:, :k]
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-dir", type=Path, required=True)
    ap.add_argument("--probes", type=int, default=0, help="0 = all shared rows as probes (deterministic)")
    args = ap.parse_args()

    E_old, keys_old = load_served()
    E_new, keys_new = load_run(args.run_dir)
    old_index = {k: i for i, k in enumerate(keys_old)}
    shared = [(old_index[k], j) for j, k in enumerate(keys_new) if k in old_index]
    print(f"shared rows: {len(shared)} / served {len(keys_old)} / new {len(keys_new)}")
    oi = np.array([a for a, _ in shared])
    ni = np.array([b for _, b in shared])
    Xo = E_old[oi].astype(np.float64)
    Xn = E_new[ni].astype(np.float64)
    # unit-norm for cosine
    Xo /= np.linalg.norm(Xo, axis=1, keepdims=True)
    Xn /= np.linalg.norm(Xn, axis=1, keepdims=True)

    cka = linear_cka(Xo, Xn)
    print(f"linear CKA (old vs new 64-d): {cka:.4f}")

    probes = (
        np.arange(len(shared))
        if args.probes <= 0
        else np.random.default_rng(7).choice(len(shared), size=min(args.probes, len(shared)), replace=False)
    )
    # Xo[i] and Xn[i] are the same player-season (shared rows, same order), so
    # neighbor indices are directly comparable positions in the shared set.
    No = topk_neighbors(Xo, 3)[probes]
    Nn = topk_neighbors(Xn, 3)[probes]
    top1_same = float((No[:, 0] == Nn[:, 0]).mean())
    top3_same = float(np.array([set(a) == set(b) for a, b in zip(No, Nn)]).mean())
    print(f"probes: {len(No)}; top-1 identical: {top1_same:.3f}; top-3 set identical: {top3_same:.3f}")


if __name__ == "__main__":
    main()

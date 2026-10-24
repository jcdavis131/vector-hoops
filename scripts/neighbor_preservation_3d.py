#!/usr/bin/env python3
"""V2 evidence: 3D neighbor-preservation for the landing trust badge.

For a deterministic sample of 2,000 player-seasons: of each player's 8
model-neighbors (peers_top8.json, 64-d MTNN cosine), what fraction fall within
the 20 nearest neighbors in 3D PCA *coordinate* space (embed3d.json) — NOT
screen space. Badge ships iff fraction >= 15% (SPEC K1).

Row alignment: peers_top8.json row i == embed3d.json row i (12,966 rows).
"""
import json
import numpy as np

N_SAMPLE = 2000
K_3D = 20
SEED = 42

d = json.load(open("assets/projections/embed3d.json"))
assert d["meta"]["format"] == 4 and d["meta"]["n"] == 12966
pca = np.asarray(d["pca"], dtype=np.float64).reshape(-1, 3) / 1000.0
n = pca.shape[0]

p = json.load(open("assets/peers_top8.json"))
peers = p["peers"]
assert len(peers) == n and p["k"] == 8

rng = np.random.default_rng(SEED)
sample = rng.choice(n, size=N_SAMPLE, replace=False)

hits = 0
for i in sample:
    # 20 nearest in 3D PCA space, excluding self
    d2 = ((pca - pca[i]) ** 2).sum(axis=1)
    d2[i] = np.inf
    nearest20 = set(np.argpartition(d2, K_3D)[:K_3D].tolist())
    model8 = set(peers[i][0::2])  # flat [peer_id, cos4, ...]
    hits += len(model8 & nearest20)

frac = hits / (N_SAMPLE * 8)
print(f"n={n} sample={N_SAMPLE} K_3d={K_3D}")
print(f"neighbor-preservation fraction = {frac:.4f} ({frac*100:.1f}%)")
print(f"1-in-N = {1/frac:.1f}" if frac > 0 else "no hits")
print("BADGE:", "SHIP (number)" if frac >= 0.15 else "KILL (qualitative only)")

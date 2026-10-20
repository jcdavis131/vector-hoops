#!/usr/bin/env python3
"""Validate assets/projections/embed3d.json (V3 compact format).

1. Schema + row-order integrity vs vectors.json.
2. Twin consistency: for 5 known player-seasons from eratwins.json, find the
   #1 cosine neighbor in the 64-d embedding and report its rank by 3-d
   Euclidean distance in each projection (sanity check, not a proof).
"""
import json

import numpy as np

ASSETS = "assets"

doc = json.load(open(f"{ASSETS}/projections/embed3d.json"))
meta, pts = doc["meta"], doc["points"]
N = meta["n"]
assert len(pts) == N == 12966, f"n mismatch: {len(pts)}"
for key in ("projections", "variance_explained", "kl_divergence",
            "kmeans_k", "silhouette", "built_at", "names", "fields"):
    assert key in meta, f"meta missing {key}"
print(f"meta OK: projections={meta['projections']} "
      f"var={meta['variance_explained']} KL={meta['kl_divergence']} "
      f"k=8 sil={meta['silhouette']}")
assert set(meta["projections"]) == {"pca", "tsne", "umap"}

names = meta["names"]


def label(p):
    s = p["s"]
    return names[p["n"]], f"{s}-{str(s + 1)[-2:]}"


vec = json.load(open(f"{ASSETS}/vectors.json"))["players"]
for i in (0, 100, 5000, 12965):
    p = pts[i]
    nm, sn = label(p)
    assert nm == vec[i]["name"] and sn == vec[i]["season"], f"row {i} misaligned"
    assert len(p["pca"]) == 3 and len(p["tsne"]) == 3 and len(p["umap"]) == 3
    assert all(isinstance(v, int) for v in p["pca"] + p["tsne"] + p["umap"])
    assert 0 <= p["c"] <= 7
print("row-order + schema OK (spot rows 0,100,5000,12965)")

# --- twin consistency ---
raw = np.frombuffer(open(f"{ASSETS}/mtnn_embeddings.f32", "rb").read(),
                    dtype=np.float32).reshape(N, 64).astype(np.float64)
norms = np.linalg.norm(raw, axis=1, keepdims=True)
Xn = raw / np.maximum(norms, 1e-12)

er = json.load(open(f"{ASSETS}/eratwins.json"))["players"]
by_label = {}
for i, p in enumerate(pts):
    by_label[label(p)] = i

proj = {a: np.array([p[a] for p in pts], dtype=np.float64) / 1000.0
        for a in meta["projections"]}
print("\ntwin spot-check (64-d cosine #1 neighbor -> 3-d distance rank):")
checked = 0
for e in er:
    key = (e["name"], e["season"])
    if key not in by_label or checked >= 5:
        continue
    i = by_label[key]
    sims = Xn @ Xn[i]
    sims[i] = -2
    j = int(np.argmax(sims))  # #1 true neighbor in 64-d
    jnm, jsn = label(pts[j])
    line = (f"  {e['name']} {e['season']}: 64-d #1 = {jnm} {jsn} "
            f"(cos {sims[j]:.3f})")
    for a, arr in proj.items():
        d = np.linalg.norm(arr - arr[i], axis=1)
        rank = int(np.sum(d < d[j])) + 1
        line += f" | {a}: rank {rank}"
    print(line)
    checked += 1
assert checked == 5, f"only checked {checked}"
print("\nVALIDATION OK")

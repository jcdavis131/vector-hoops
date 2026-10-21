#!/usr/bin/env python3
"""Build 3D projections of the MTNN v5 64-d embeddings for the opening-night 3D map.

Inputs:
  assets/mtnn_embeddings.f32   (12,966 x 64 float32, row i = player-season i)
  assets/vectors.json           (players[i] <-> row i, verified row-aligned)
  assets/player_team_season.json ("Name|Season" -> team abbr)

Outputs:
  assets/projections/embed3d.json
    {meta: {...}, points: [{id, name, season, team, c, pca:[..], tsne:[..], umap:[..]}]}

All projections computed ONCE at build time — never in the client.
Deterministic: random_state=42 everywhere it applies.
"""
import json
import math
import re
import time
from datetime import UTC, datetime

import numpy as np

ASSETS = "assets"
N = 12966
DIM = 64
SEED = 42


def load_embeddings():
    raw = open(f"{ASSETS}/mtnn_embeddings.f32", "rb").read()
    assert len(raw) == N * DIM * 4, f"unexpected f32 size {len(raw)}"
    x = np.frombuffer(raw, dtype=np.float32).reshape(N, DIM).astype(np.float64)
    return x


def load_meta():
    vec = json.load(open(f"{ASSETS}/vectors.json"))["players"]
    assert len(vec) == N
    pts = json.load(open(f"{ASSETS}/player_team_season.json"))
    norm_pts = {}
    for k, v in pts.items():
        nk = re.sub(r"\.", "", k)
        nk = re.sub(r"\s+", " ", nk).strip()
        norm_pts[nk] = v

    def norm(n):
        n = re.sub(r"\.", "", n)
        return re.sub(r"\s+", " ", n).strip()

    rows = []
    missing_team = 0
    for i, p in enumerate(vec):
        assert p["id"] == i, f"row misalignment at {i}"
        team = norm_pts.get(norm(p["name"]) + "|" + p["season"])
        if team is None:
            missing_team += 1
        rows.append(
            {
                "name": p["name"],
                "season": p["season"],
                "team": team,  # null when no mapping exists (honest)
                "c": None,  # filled by k-means
            }
        )
    print(f"team coverage: {N - missing_team}/{N} ({missing_team} null)")
    return rows


def main():
    t0 = time.time()
    X = load_embeddings()
    rows = load_meta()

    from sklearn.decomposition import PCA
    from sklearn.manifold import TSNE
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score

    try:
        import umap

        have_umap = True
    except ImportError:
        have_umap = False
        print("umap-learn not installed — SHIPPING WITHOUT UMAP (stated)")

    # ---- PCA-3 (SVD) ----
    pca = PCA(n_components=3, random_state=SEED)
    X_pca = pca.fit_transform(X)
    var = [round(float(v), 4) for v in pca.explained_variance_ratio_]
    print(f"PCA variance explained: {var} (sum {round(sum(var), 4)})")

    # ---- t-SNE-3 (Barnes-Hut) ----
    tsne = TSNE(
        n_components=3,
        perplexity=30,
        random_state=SEED,
        method="barnes_hut",
        init="pca",
        max_iter=1000,
    )
    X_tsne = tsne.fit_transform(X)
    print(f"t-SNE KL divergence: {round(float(tsne.kl_divergence_), 4)}")

    # ---- UMAP-3 (optional) ----
    X_umap = None
    if have_umap:
        reducer = umap.UMAP(
            n_components=3, n_neighbors=15, min_dist=0.1, random_state=SEED
        )
        X_umap = reducer.fit_transform(X)

    # ---- k-means k=8 on the 64-d vectors (STATED k, not eyeballed) ----
    km = KMeans(n_clusters=8, random_state=SEED, n_init=10)
    labels = km.fit_predict(X)
    sil = float(
        silhouette_score(X, labels, sample_size=5000, random_state=SEED)
    )
    print(f"k-means k=8 silhouette (n=5000 sample): {round(sil, 4)}")

    # V3 compact format: int-millis coords (3-decimal-equivalent precision),
    # name dictionary, season as start-year int, id = array index.
    def q3(a):
        return [int(round(float(v) * 1000)) for v in a]

    names = sorted({r["name"] for r in rows})
    nidx = {n: i for i, n in enumerate(names)}
    projections = ["pca", "tsne"] + (["umap"] if have_umap else [])
    points = []
    for i in range(N):
        r = rows[i]
        pt = {
            "n": nidx[r["name"]],
            "s": int(r["season"][:4]),
            "t": r["team"],
            "c": int(labels[i]),
        }
        pt["pca"] = q3(X_pca[i])
        pt["tsne"] = q3(X_tsne[i])
        if have_umap:
            pt["umap"] = q3(X_umap[i])
        points.append(pt)

    doc = {
        "meta": {
            "projections": projections,
            "method": {
                "pca": "sklearn PCA n_components=3 (SVD), random_state=42",
                "tsne": "sklearn TSNE barnes_hut, perplexity=30, max_iter=1000, "
                "init=pca, random_state=42",
                "umap": (
                    "umap-learn n_components=3, n_neighbors=15, min_dist=0.1, "
                    "random_state=42"
                    if have_umap
                    else "not built — umap-learn unavailable at build time"
                ),
                "kmeans": "sklearn KMeans k=8 (STATED, not eyeballed), "
                "n_init=10, random_state=42, fit on 64-d embeddings",
            },
            "variance_explained": var,
            "kl_divergence": round(float(tsne.kl_divergence_), 4),
            "kmeans_k": 8,
            "silhouette": round(sil, 4),
            "silhouette_sample": 5000,
            "built_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "n": N,
            "seed": SEED,
            "names": names,
            "fields": {
                "n": "index into meta.names",
                "s": "season starting year as int; 1996 = the 1996-97 season",
                "t": "team abbreviation (null when unknown)",
                "c": "k-means cluster id (0-7)",
                "pca/tsne/umap": "3 coords as int millis; divide by 1000 "
                "(3-decimal-equivalent precision)",
            },
            "id": "omitted per-point; point id IS its index in the points array",
        },
        "points": points,
    }

    from pathlib import Path

    Path(f"{ASSETS}/projections").mkdir(parents=True, exist_ok=True)
    out = f"{ASSETS}/projections/embed3d.json"
    with open(out, "w") as f:
        json.dump(doc, f, separators=(",", ":"), ensure_ascii=False)
    size = Path(out).stat().st_size
    print(f"WROTE {out}: {size:,} bytes ({size / 1e6:.2f} MB)")
    if size > 1_500_000:
        print("WARNING: over 1.5MB budget — requantize or drop a projection")
    print(f"total build time: {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()

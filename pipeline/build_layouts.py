#!/usr/bin/env python3
"""Build 2D map layouts (PCA + t-SNE) from player-level 14-d embedding vectors.

Reads assets/vectors.json (12,966 player-season rows with 14-d v[] vectors),
aggregates to player level, and computes two canonical 2D arrangements:

  PCA 2D  - stdlib-friendly linear projection (uses scikit-learn for exactness),
            deterministic. Shows the big axes of the data.
  t-SNE 2D - perplexity 30, random_state 42, init pca, one canonical run.
            Shows twin neighborhoods (local structure).

Aggregation choice (documented): total_min-weighted mean of v[] per person_id.
Rationale: a player's typical season should reflect the seasons they actually
played most. Falls back to equal weights when a player's total_min sums to 0.
Canonical display name = the name from the player's max-total_min season.

Output: assets/layouts.v1.json (COMPACT format — see note below)
  {"ids": [person_id, ...],
   "pca": [[x, y], ...], "tsne": [[x, y], ...], ["svd": [[x, y], ...]],
   "meta": {...params, seeds, axis captions, format notes...}}
Coordinates are min-max normalized to [-1, 1] per axis, stored as INTEGER
THOUSANDTHS (divide by 1000 client-side). Client builds pid->index via ids.

FORMAT NOTE (2026-10-09): the spec's keyed example ({"pca": {pid: [x,y]}})
cannot meet the 120KB budget at 2,426 players — measured 159.8KB for two
layouts at 4-decimal floats, 130.7KB as integer thousandths. The compact
ids+arrays layout holds the identical data at ~92KB. Same content, smaller
page weight; the budget (reaffirmed) wins over the example shape.

SVD LENS CANDIDATE (2026-10-09): truncated SVD (n_components=2,
random_state=42) computed as a 4th candidate lens. Kubrick's lens-distinctness
gate applies: SVD of centered data IS PCA, so on near-centered 14-d vectors
it is expected to duplicate PCA's structure. The gate measures SVD-vs-PCA
pairwise-distance correlation on the seeded 500-player sample; if r >= 0.95
the "svd" key is CUT from the output (decoration, not a lens) and the cut is
recorded in the manifest. The UI renders segments dynamically from whichever
keys survive, so no UI change is needed either way.

QA (hard-block, exit non-zero on any failure):
  - every unique person_id has an entry in both layouts (count consistency)
  - no NaN / infinite values
  - all coordinates within [-1, 1]
  - output file <= 120 KB
On success writes pipeline/build_layouts.manifest.json (seeds, params, QA results)
and prints a lens-distinctness report (PCA vs t-SNE and PCA vs SVD
pairwise-distance correlations on a seeded 500-player sample). Kubrick's gate:
SVD is CUT from the output when its correlation with PCA is >= 0.95
(decoration, not a lens).

Build-time only. scikit-learn/numpy/scipy are never shipped to the client.
"""

import json
import math
import os
import random
import sys
from datetime import date

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VECTORS = os.path.join(REPO, "assets", "vectors.json")
OUT = os.path.join(REPO, "assets", "layouts.v1.json")
MANIFEST = os.path.join(REPO, "pipeline", "build_layouts.manifest.json")
SIZE_BUDGET_BYTES = 120 * 1024
RANDOM_STATE = 42
TSNE_PERPLEXITY = 30


def fail(msg):
    print("QA FAIL:", msg, file=sys.stderr)
    sys.exit(1)


def main():
    try:
        from sklearn.decomposition import PCA, TruncatedSVD
        from sklearn.manifold import TSNE
        import numpy as np
    except ImportError:
        fail("scikit-learn is required (pip install scikit-learn). Build-time only.")

    with open(VECTORS, encoding="utf-8") as f:
        data = json.load(f)

    feature_labels = data.get("featureLabels", {})

    # --- aggregate player-seasons -> players (minutes-weighted mean) ---
    agg = {}
    for e in data["players"]:
        pid = e["person_id"]
        a = agg.setdefault(
            pid, {"num": None, "den": 0.0, "name": e["name"], "best_min": -1.0}
        )
        v = e["v"]
        w = float(e.get("total_min") or 0.0)
        if a["num"] is None:
            a["num"] = [0.0] * len(v)
        for i, val in enumerate(v):
            a["num"][i] += val * w
        a["den"] += w
        if w > a["best_min"]:
            a["best_min"] = w
            a["name"] = e["name"]
    pids, names, X = [], [], []
    for pid, a in agg.items():
        n = len(a["num"])
        if a["den"] > 0:
            mean = [x / a["den"] for x in a["num"]]
        else:  # degenerate: no minutes recorded -> equal weights
            mean = [x / n for x in a["num"]]
        pids.append(pid)
        names.append(a["name"])
        X.append(mean)
    n_players = len(pids)
    print(
        f"players aggregated: {n_players} (from {len(data['players'])} player-seasons)"
    )

    # --- PCA 2D ---
    Xa = np.asarray(X, dtype=float)
    pca = PCA(n_components=2, random_state=RANDOM_STATE)
    Xp = pca.fit_transform(Xa)
    # axis captions from top-loading features
    axes = []
    for comp in range(2):
        loadings = sorted(enumerate(pca.components_[comp]), key=lambda t: -abs(t[1]))[
            :2
        ]
        feats = data.get("features", [])
        words = [
            feature_labels.get(feats[i], feats[i])
            for i, _ in loadings
            if i < len(feats)
        ]
        axes.append(
            {
                "pc": f"PC{comp + 1}",
                "explained_variance_ratio": round(
                    float(pca.explained_variance_ratio_[comp]), 4
                ),
                "top_features": words,
            }
        )
    print("PCA axes:", json.dumps(axes))

    # --- t-SNE 2D (one canonical run) ---
    tsne = TSNE(
        n_components=2,
        perplexity=TSNE_PERPLEXITY,
        random_state=RANDOM_STATE,
        init="pca",
        learning_rate="auto",
    )
    Xt = tsne.fit_transform(Xa)
    print(
        f"t-SNE done: kl_divergence={tsne.kl_divergence_:.4f} " f"n_iter={tsne.n_iter_}"
    )

    # --- truncated SVD 2D (lens CANDIDATE — must pass the distinctness gate) ---
    svd = TruncatedSVD(n_components=2, random_state=RANDOM_STATE)
    Xs = svd.fit_transform(Xa)
    print(
        "SVD done: explained_variance_ratio=",
        [round(float(v), 4) for v in svd.explained_variance_ratio_],
    )

    # --- normalize each layout to [-1, 1] per axis ---
    def norm2d(M):
        cols = list(zip(*M))
        out = []
        for col in cols:
            lo, hi = min(col), max(col)
            span = hi - lo
            out.append([2 * (v - lo) / span - 1 if span > 0 else 0.0 for v in col])
        return [list(r) for r in zip(*out)]

    Np, Nt, Ns = norm2d(Xp), norm2d(Xt), norm2d(Xs)

    # --- QA: hard-block ---
    def check_finite(M, label):
        for pid, (x, y) in zip(pids, M):
            for val in (x, y):
                if not math.isfinite(val):
                    fail(f"{label}: non-finite coordinate for {pid}")
                if not -1.0 <= val <= 1.0:
                    fail(f"{label}: coordinate out of [-1,1] for {pid}: {val}")

    check_finite(Np, "pca")
    check_finite(Nt, "tsne")
    check_finite(Ns, "svd")

    # --- lens-distinctness (500-player seeded sample) + Kubrick's SVD gate ---
    def pairwise_corr(A, B, sample_idx):
        da, db = [], []
        for ii in range(len(sample_idx)):
            for jj in range(ii + 1, len(sample_idx)):
                i, j = sample_idx[ii], sample_idx[jj]
                da.append(math.dist(A[i], A[j]))
                db.append(math.dist(B[i], B[j]))
        ma, mb = sum(da) / len(da), sum(db) / len(db)
        cov = sum((a - ma) * (b - mb) for a, b in zip(da, db))
        va = sum((a - ma) ** 2 for a in da)
        vb = sum((b - mb) ** 2 for b in db)
        return cov / math.sqrt(va * vb) if va and vb else 0.0

    rng = random.Random(RANDOM_STATE)
    sample_idx = rng.sample(range(n_players), min(500, n_players))
    r_tsne = pairwise_corr(Np, Nt, sample_idx)
    r_svd = pairwise_corr(Np, Ns, sample_idx)
    print(
        f"lens-distinctness: PCA vs t-SNE r = {r_tsne:.3f}; "
        f"PCA vs SVD r = {r_svd:.3f} (n={len(sample_idx)} players)"
    )
    distinct_ok = r_tsne <= 0.90
    if not distinct_ok:
        print("WARNING: PCA/t-SNE suspiciously similar (r > 0.90) — flag for review")
    # Kubrick's gate: SVD of centered data IS PCA — if it duplicates PCA's
    # structure (r >= 0.95) it is decoration, not a lens. CUT it.
    svd_survives = r_svd < 0.95
    if svd_survives:
        print("SVD gate: PASS — SVD reveals distinct structure, kept as a lens")
    else:
        print(
            f"SVD gate: CUT — SVD duplicates PCA (r = {r_svd:.3f} >= 0.95); "
            f"dropping 'svd' key from output"
        )

    # --- compact output: ids + integer-thousandths coord arrays ---
    def to_millis(M):
        return [[int(round(x * 1000)), int(round(y * 1000))] for x, y in M]

    layouts = {"pca": to_millis(Np), "tsne": to_millis(Nt)}
    if svd_survives:
        layouts["svd"] = to_millis(Ns)
    for name, arr in layouts.items():
        if len(arr) != n_players:
            fail(f"layout '{name}' entry count != player count")
    payload = {
        "ids": pids,
        "meta": {
            "version": 1,
            "built": date.today().isoformat(),
            "format": "ids+arrays (compact); coords are INTEGER THOUSANDTHS — "
            "divide by 1000 client-side; index i of each layout "
            "array corresponds to ids[i]",
            "n_players": n_players,
            "n_player_seasons": len(data["players"]),
            "aggregation": "total_min-weighted mean of v[] per person_id "
            "(equal weights when total_min sums to 0)",
            "pca": {"random_state": RANDOM_STATE, "axes": axes},
            "tsne": {
                "perplexity": TSNE_PERPLEXITY,
                "random_state": RANDOM_STATE,
                "init": "pca",
                "learning_rate": "auto",
                "kl_divergence": round(float(tsne.kl_divergence_), 4),
                "n_iter": int(tsne.n_iter_),
            },
            "svd": {
                "random_state": RANDOM_STATE,
                "explained_variance_ratio": [
                    round(float(v), 4) for v in svd.explained_variance_ratio_
                ],
                "gate": "kept" if svd_survives else "CUT (r>=0.95 vs PCA)",
                "pearson_r_vs_pca": round(r_svd, 4),
            },
        },
    }
    payload.update(layouts)

    blob = json.dumps(payload, separators=(",", ":"))
    size = len(blob.encode("utf-8"))
    print(f"layouts.v1.json size: {size} bytes (budget {SIZE_BUDGET_BYTES})")
    if size > SIZE_BUDGET_BYTES:
        fail(f"size {size} exceeds budget {SIZE_BUDGET_BYTES}")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write(blob)

    manifest = {
        "built": payload["meta"]["built"],
        "version": 1,
        "n_players": n_players,
        "aggregation": payload["meta"]["aggregation"],
        "format": payload["meta"]["format"],
        "pca": payload["meta"]["pca"],
        "tsne": payload["meta"]["tsne"],
        "svd": payload["meta"]["svd"],
        "qa": {
            "counts_consistent": True,
            "finite": True,
            "in_range": True,
            "size_bytes": size,
            "size_budget_bytes": SIZE_BUDGET_BYTES,
            "size_ok": True,
        },
        "distinctness": {
            "sample": len(sample_idx),
            "pca_vs_tsne_r": round(r_tsne, 4),
            "pca_vs_tsne_ok": distinct_ok,
            "pca_vs_svd_r": round(r_svd, 4),
            "svd_gate": "kept" if svd_survives else "CUT",
        },
    }
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1)
    print("wrote", OUT)
    print("wrote", MANIFEST)
    print("QA PASS")


if __name__ == "__main__":
    main()

"""Archetype era audit — distinctness, stability, and model separability.

Measures whether the frozen global K=8 archetypes remain meaningful as the
league geometry drifts, and whether era-native clusters expose new types
the global vocabulary misses.

Run:  python pipeline/archetype_era_audit.py
Writes: pipeline/data/archetype_era_audit.json
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
DATA = ROOT / "pipeline" / "data"
OUT = DATA / "archetype_era_audit.json"

ERAS = [
    ("1996-2003", "1996-97", "2002-03"),
    ("2003-2009", "2003-04", "2008-09"),
    ("2009-2015", "2009-10", "2014-15"),
    ("2015-2021", "2015-16", "2020-21"),
    ("2021-2026", "2021-22", "2025-26"),
]


def kmeans(X: np.ndarray, k: int, seed: int = 42, iters: int = 60):
    rng = np.random.default_rng(seed)
    cents = X[rng.choice(len(X), k, replace=False)]
    for _ in range(iters):
        d = ((X[:, None, :] - cents[None]) ** 2).sum(-1)
        lab = d.argmin(1)
        new = np.stack(
            [X[lab == i].mean(0) if (lab == i).any() else cents[i] for i in range(k)]
        )
        if np.allclose(new, cents):
            break
        cents = new
    return lab, cents


def silhouette_sample(
    X: np.ndarray, lab: np.ndarray, max_n: int = 2000, seed: int = 7
) -> float:
    """Mean silhouette on a random subsample (O(n^2) capped)."""
    n = len(X)
    if n < 50 or len(set(lab.tolist())) < 2:
        return float("nan")
    rng = np.random.default_rng(seed)
    idx = rng.choice(n, size=min(n, max_n), replace=False)
    Xs = X[idx]
    ls = lab[idx]
    sil = []
    for i, xi in enumerate(Xs):
        same = ls == ls[i]
        if same.sum() <= 1:
            continue
        a = np.linalg.norm(Xs[same] - xi, axis=1).sum() / (same.sum() - 1)
        b_vals = []
        for c in set(ls.tolist()):
            if c == ls[i]:
                continue
            mask = ls == c
            if mask.any():
                b_vals.append(np.linalg.norm(Xs[mask] - xi, axis=1).mean())
        if not b_vals:
            continue
        b = min(b_vals)
        sil.append((b - a) / max(a, b) if max(a, b) > 1e-9 else 0.0)
    return float(np.mean(sil)) if sil else float("nan")


def between_within_ratio(X: np.ndarray, lab: np.ndarray) -> float:
    """Between-cluster / within-cluster variance ratio (higher = more separated)."""
    global_mean = X.mean(0)
    within = 0.0
    between = 0.0
    n = len(X)
    for c in set(lab.tolist()):
        mask = lab == c
        if not mask.any():
            continue
        block = X[mask]
        cm = block.mean(0)
        within += ((block - cm) ** 2).sum()
        between += mask.sum() * ((cm - global_mean) ** 2).sum()
    within /= max(n, 1)
    between /= max(n, 1)
    return float(between / within) if within > 1e-9 else float("nan")


def global_label_purity_in_era_native(
    X: np.ndarray, global_lab: np.ndarray, k: int = 8
) -> dict:
    """Fit era-native k-means; for each global label, what fraction lands in one native cluster?"""
    native_lab, _ = kmeans(X, k)
    table = np.zeros((k, k), dtype=int)
    for g, n in zip(global_lab, native_lab, strict=False):
        table[g, n] += 1
    purities = []
    for g in range(k):
        row = table[g]
        if row.sum() == 0:
            continue
        purities.append(float(row.max() / row.sum()))
    return {
        "mean_purity": round(float(np.mean(purities)), 4) if purities else None,
        "min_purity": round(float(np.min(purities)), 4) if purities else None,
    }


def optimal_k_silhouette(X: np.ndarray, k_range: range, seed: int = 7) -> list[dict]:
    rows = []
    for k in k_range:
        lab, _ = kmeans(X, k, seed=seed)
        sil = silhouette_sample(X, lab, seed=seed)
        bwr = between_within_ratio(X, lab)
        rows.append(
            {"k": k, "silhouette": round(sil, 4), "between_within_ratio": round(bwr, 4)}
        )
    return rows


def era_native_novelty(era_arch: list[dict], threshold: float = 0.85) -> list[dict]:
    """Era-native archetypes whose ancestor similarity is below threshold = geometrically novel."""
    out = []
    for a in era_arch:
        anc = a.get("ancestor") or {}
        sim = anc.get("similarity")
        if sim is not None and sim < threshold:
            out.append(
                {
                    "name": a["name"],
                    "share": a.get("share"),
                    "ancestor": anc.get("name"),
                    "similarity": sim,
                }
            )
    return out


def per_era_global_metrics(players: list[dict], clusters: list[str]) -> list[dict]:
    rows = []
    for era_name, lo, hi in ERAS:
        subset = [p for p in players if lo <= p["season"] <= hi]
        if len(subset) < 100:
            continue
        X = np.array([p["v"] for p in subset])
        lab = np.array([p["c"] for p in subset])
        counts = Counter(lab.tolist())
        shares = {clusters[c]: round(counts[c] / len(subset), 4) for c in counts}
        rows.append(
            {
                "era": era_name,
                "n": len(subset),
                "global_silhouette_k8": round(silhouette_sample(X, lab), 4),
                "global_between_within": round(between_within_ratio(X, lab), 4),
                "entropy_bits": round(
                    float(
                        -sum(
                            (counts[c] / len(subset))
                            * np.log2(counts[c] / len(subset) + 1e-12)
                            for c in counts
                        )
                    ),
                    4,
                ),
                "shares": shares,
                "era_native_vs_global": global_label_purity_in_era_native(X, lab),
                "k_sweep": optimal_k_silhouette(X, range(6, 13)),
            }
        )
    return rows


def mtnn_archetype_by_era() -> list[dict] | None:
    """Per-era archetype top-1 from saved logits if embedding_v3 exists."""
    emb_path = DATA / "embedding_v3.npz"
    if not emb_path.exists():
        return None
    npz = np.load(emb_path, allow_pickle=False)
    if "archetype_logits" not in npz or "cluster" not in npz:
        return None
    logits = npz["archetype_logits"]
    truth = npz["cluster"]
    seasons = npz["season"]
    pred = logits.argmax(1)
    by_era = defaultdict(lambda: {"correct": 0, "n": 0})
    for i in range(len(truth)):
        s = str(seasons[i])
        era = next((e[0] for e in ERAS if e[1] <= s <= e[2]), "other")
        by_era[era]["n"] += 1
        if pred[i] == truth[i]:
            by_era[era]["correct"] += 1
    return [
        {"era": e, "top1_acc": round(v["correct"] / v["n"], 4), "n": v["n"]}
        for e, v in sorted(by_era.items())
    ]


def recommendations(audit: dict) -> list[str]:
    recs = []
    eras = audit.get("perEraGlobal", [])
    if not eras:
        return recs

    sil_early = eras[0].get("global_silhouette_k8")
    sil_late = eras[-1].get("global_silhouette_k8")
    if sil_early and sil_late and sil_late < sil_early - 0.03:
        recs.append(
            "Global K=8 silhouette degrades in recent eras — consider era-conditioned "
            "archetype heads or auxiliary era-native labels in MTNN."
        )

    for e in eras:
        pur = e.get("era_native_vs_global", {}).get("min_purity")
        if pur is not None and pur < 0.45:
            recs.append(
                f"{e['era']}: at least one global archetype splits across multiple "
                f"era-native clusters (min purity {pur:.2f}) — vocabulary drift."
            )

    k_sweeps = [
        max(e["k_sweep"], key=lambda r: r["silhouette"])
        for e in eras
        if e.get("k_sweep")
    ]
    best_ks = [r["k"] for r in k_sweeps]
    if best_ks and max(best_ks) - min(best_ks) >= 2:
        recs.append(
            f"Optimal K by silhouette varies by era (median {float(np.median(best_ks)):.0f}, "
            f"range {min(best_ks)}–{max(best_ks)}) — fixed K=8 is deliberate compression; "
            "use era-native layer (archetype_time.py) for era-specific vocabulary."
        )

    novelty = audit.get("eraNovelty", [])
    if novelty:
        recs.append(
            f"{len(novelty)} era-native archetypes in 2021-2026 have ancestor similarity <0.85 — "
            "candidates for named 'era shift' blog posts (spacing big, switchable big, etc.)."
        )

    mtnn = audit.get("mtnnArchetypeByEra")
    if mtnn:
        accs = [r["top1_acc"] for r in mtnn if r["era"] != "other"]
        if accs and max(accs) - min(accs) > 0.08:
            recs.append(
                "MTNN archetype accuracy varies >8pp by era — add era context embedding "
                "or Procrustes-aligned features to the archetype head."
            )

    if not recs:
        recs.append(
            "Global K=8 remains separable across eras at current thresholds; "
            "continue monitoring with this audit each vectors.json rebuild."
        )
    return recs


def main() -> None:
    data = json.loads((ASSETS / "vectors.json").read_text(encoding="utf-8"))
    atime_path = ASSETS / "archetypes_time.json"
    atime = (
        json.loads(atime_path.read_text(encoding="utf-8"))
        if atime_path.exists()
        else {}
    )

    players = data["players"]
    clusters = data["clusters"]

    per_era = per_era_global_metrics(players, clusters)

    novelty = []
    if atime.get("eras"):
        atime["eras"][-1]
        # re-load full era block from archetype_time if needed — use biggestShifts
        json.loads(atime_path.read_text())["eras"] if atime_path.exists() else []
        # archetypes_time.json strips ancestor in export — reload from pipeline run
        # Use precomputed biggestShifts + prevalence instead
    # Run inline era-native for novelty on latest window
    lo, hi = ERAS[-1][1], ERAS[-1][2]
    subset = [p for p in players if lo <= p["season"] <= hi]
    X = np.array([p["v"] for p in subset])
    lab, cents = kmeans(X, 8)
    drift = json.loads((ASSETS / "drift.json").read_text(encoding="utf-8"))
    chain = {s: np.array(m) for s, m in drift["chainedToRoot"].items()}
    prev_lo, prev_hi = ERAS[-2][1], ERAS[-2][2]
    prev_subset = [p for p in players if prev_lo <= p["season"] <= prev_hi]
    Xp = np.array([p["v"] for p in prev_subset])
    _, _cents_prev = kmeans(Xp, 8)
    root_prev = []
    for i in range(8):
        members = [
            chain[p["season"]] @ np.array(p["v"])
            for p, lab2 in zip(prev_subset, kmeans(Xp, 8)[0], strict=False)
            if lab2 == i
        ]
        root_prev.append(np.mean(members, 0) if members else np.zeros(X.shape[1]))
    root_cur = []
    for i in range(8):
        members = [
            chain[p["season"]] @ np.array(p["v"])
            for p, lab2 in zip(subset, lab, strict=False)
            if lab2 == i
        ]
        root_cur.append(np.mean(members, 0) if members else np.zeros(X.shape[1]))

    def cosine(a, b):
        na, nb = np.linalg.norm(a) or 1, np.linalg.norm(b) or 1
        return float(np.dot(a, b) / (na * nb))

    era_arch = []
    counts = Counter(lab.tolist())
    for i in range(8):
        top = np.argsort(-cents[i])[:2]
        name = " + ".join(data["features"][j] for j in top)
        sims = [(cosine(root_cur[i], rp), j) for j, rp in enumerate(root_prev)]
        best_sim, _best_j = max(sims)
        era_arch.append(
            {
                "name": name,
                "share": round(counts[i] / len(subset), 4),
                "ancestor": {"similarity": round(best_sim, 3)},
            }
        )
    novelty = [a for a in era_arch if a["ancestor"]["similarity"] < 0.85]

    audit = {
        "built": __import__("time").strftime("%Y-%m-%d"),
        "globalArchetypes": clusters,
        "biggestPrevalenceShifts": atime.get("biggestShifts", [])[:6],
        "perEraGlobal": per_era,
        "eraNovelty2021": novelty,
        "mtnnArchetypeByEra": mtnn_archetype_by_era(),
        "recommendations": [],
    }
    audit["recommendations"] = recommendations(audit)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(audit, indent=2), encoding="utf-8")

    print("Archetype era audit")
    for e in per_era:
        print(
            f"  {e['era']}: sil={e['global_silhouette_k8']:.3f} "
            f"b/w={e['global_between_within']:.3f} "
            f"native_purity={e['era_native_vs_global']['mean_purity']:.3f}"
        )
    best_k = [max(e["k_sweep"], key=lambda r: r["silhouette"])["k"] for e in per_era]
    print(f"  optimal K by silhouette per era: {best_k}")
    print("recommendations:")
    for r in audit["recommendations"]:
        print(f"  - {r}")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()

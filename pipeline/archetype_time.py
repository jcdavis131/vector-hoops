"""Archetypes over time. Two honest layers (method stated in artifact):

1. PREVALENCE: per-season share of each GLOBAL archetype (the 8
   k-means labels already shipped) — how playstyle populations rose
   and fell, 1996-97 -> 2025-26.
2. ERA-NATIVE: k-means (K=8, numpy, seeded) WITHIN five era windows so
   each period gets its own archetype vocabulary, named from top
   centroid sigmas exactly like the global build. LINEAGE: each era
   archetype's centroid is mapped through the chained Procrustes
   root-frame transforms and matched to its nearest predecessor-era
   centroid — which modern archetype descends from which older one.

Output: assets/archetypes_time.json
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "assets"

ERAS = [("1996-2003", "1996-97", "2002-03"),
        ("2003-2009", "2003-04", "2008-09"),
        ("2009-2015", "2009-10", "2014-15"),
        ("2015-2021", "2015-16", "2020-21"),
        ("2021-2026", "2021-22", "2025-26")]

FEATURE_LABELS = {
    "PTS": "Scoring Volume", "AST": "Playmaking", "OREB": "Offensive Glass",
    "DREB": "Defensive Glass", "STL": "Steals", "BLK": "Rim Protection",
    "TOV": "Turnovers", "FG3A": "Three-Point Volume", "FGA": "Shot Volume",
    "FTA": "Free-Throw Pressure", "FG3_PCT": "Three-Point Accuracy",
    "FG_PCT": "Finishing Efficiency", "FT_PCT": "Free-Throw Touch",
    "PLUS_MINUS": "On-Court Impact",
}


def kmeans(X: np.ndarray, k: int = 8, seed: int = 42, iters: int = 60):
    rng = np.random.default_rng(seed)
    cents = X[rng.choice(len(X), k, replace=False)]
    for _ in range(iters):
        d = ((X[:, None, :] - cents[None]) ** 2).sum(-1)
        lab = d.argmin(1)
        new = np.stack([X[lab == i].mean(0) if (lab == i).any() else cents[i]
                        for i in range(k)])
        if np.allclose(new, cents):
            break
        cents = new
    return lab, cents


def name_centroid(c: np.ndarray, features: list[str]) -> str:
    idx = np.argsort(-c)[:2]
    return " + ".join(FEATURE_LABELS.get(features[i], features[i])
                      for i in idx)


def main() -> None:
    data = json.loads((ASSETS / "vectors.json").read_text(encoding="utf-8"))
    drift = json.loads((ASSETS / "drift.json").read_text(encoding="utf-8"))
    features = data["features"]
    chain = {s: np.array(m) for s, m in drift["chainedToRoot"].items()}
    seasons = sorted({p["season"] for p in data["players"]})

    # Layer 1 — global-archetype prevalence per season
    per_season = defaultdict(Counter)
    totals = Counter()
    for p in data["players"]:
        per_season[p["season"]][p["c"]] += 1
        totals[p["season"]] += 1
    prevalence = [{
        "season": s,
        "shares": [round(per_season[s][c] / totals[s], 4)
                   for c in range(len(data["clusters"]))],
        "n": totals[s],
    } for s in seasons]

    # biggest risers/fallers: first-5 vs last-5 season mean share
    def mean_share(rows, c):
        return sum(r["shares"][c] for r in rows) / len(rows)
    early, late = prevalence[:5], prevalence[-5:]
    deltas = [{"archetype": data["clusters"][c],
               "early": round(mean_share(early, c), 4),
               "late": round(mean_share(late, c), 4),
               "delta": round(mean_share(late, c) - mean_share(early, c), 4)}
              for c in range(len(data["clusters"]))]
    deltas.sort(key=lambda d: -abs(d["delta"]))

    # Layer 2 — era-native archetypes + Procrustes lineage
    by_era = []
    for name, s_lo, s_hi in ERAS:
        rows = [p for p in data["players"] if s_lo <= p["season"] <= s_hi]
        X = np.array([p["v"] for p in rows])
        lab, cents = kmeans(X, seed=42)
        counts = Counter(lab.tolist())
        # map centroids to the root frame (season-weighted: transform each
        # member vector by ITS season chain, then average)
        root_cents = []
        for i in range(len(cents)):
            members = [chain[p["season"]] @ np.array(p["v"])
                       for p, l in zip(rows, lab) if l == i]
            root_cents.append(np.mean(members, 0) if members else
                              np.zeros(len(features)))
        by_era.append({
            "era": name,
            "archetypes": [{
                "name": name_centroid(cents[i], features),
                "share": round(counts[i] / len(rows), 4),
                "centroid": np.round(cents[i], 3).tolist(),
                "rootCentroid": np.round(root_cents[i], 3).tolist(),
            } for i in range(len(cents))],
            "n": len(rows),
        })

    # lineage: nearest predecessor-era centroid in the ROOT frame
    def cosine(a, b):
        na, nb = np.linalg.norm(a) or 1, np.linalg.norm(b) or 1
        return float(np.dot(a, b) / (na * nb))
    for prev, cur in zip(by_era, by_era[1:]):
        for arch in cur["archetypes"]:
            sims = [(cosine(np.array(arch["rootCentroid"]),
                            np.array(pa["rootCentroid"])), pa["name"])
                    for pa in prev["archetypes"]]
            best = max(sims)
            arch["ancestor"] = {"era": prev["era"], "name": best[1],
                                "similarity": round(best[0], 3)}

    (ASSETS / "archetypes_time.json").write_text(json.dumps({
        "method": ("layer 1: per-season share of the 8 global k-means "
                   "archetypes (labels from vectors.json, no re-fit); "
                   "layer 2: k-means K=8 re-fit within five era windows "
                   "(seeded, numpy), named from top-2 centroid sigmas; "
                   "lineage = nearest predecessor-era centroid by cosine "
                   "in the Procrustes root frame (era-geometry-corrected); "
                   "shares are of charted players (MIN>=800), not all "
                   "rosters — stated scope"),
        "globalArchetypes": data["clusters"],
        "prevalence": prevalence,
        "biggestShifts": deltas,
        "eras": [{k: v for k, v in e.items()
                  if k in ("era", "n")} | {
                  "archetypes": [{k: v for k, v in a.items()
                                  if k != "rootCentroid" and k != "centroid"}
                                 for a in e["archetypes"]]}
                 for e in by_era],
    }, separators=(",", ":")), encoding="utf-8")

    print("prevalence shifts (early-5 vs late-5 mean share):")
    for d in deltas[:4]:
        print(f"  {d['archetype']}: {d['early']:.1%} -> {d['late']:.1%} "
              f"({d['delta']:+.1%})")
    print("\nera-native archetypes (share, ancestor):")
    for e in by_era[-1:]:
        for a in sorted(e["archetypes"], key=lambda x: -x["share"])[:4]:
            anc = a.get("ancestor", {})
            print(f"  [{e['era']}] {a['name']} ({a['share']:.1%}) "
                  f"<- {anc.get('name','—')} ({anc.get('similarity','')})")


if __name__ == "__main__":
    main()

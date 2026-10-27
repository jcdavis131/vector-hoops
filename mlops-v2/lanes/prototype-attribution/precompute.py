#!/usr/bin/env python3
"""Builder B precompute — Attribution Graph (Curry 2016-17 -> Ginobili 2009-10).

Reads ONLY served champion assets (read-only):
  assets/mtnn_embeddings.f32  (12,966 x 64, L2)
  assets/vectors.json         (14 era-z per-100 stats, person_id, season)
  assets/skills.json          (12 per-row skill grades, aligned by player id)
Writes data.json next to this script. No training, no GPU, no installs.
BANNED sources are never read: mtnn.onnx, mtnn_attr_pop.json, mtnn_jacobian.json.
True served-model tower ablation is UNAVAILABLE (120-feature matrix
uncommitted) and is emitted as an explicit gap, never estimated silently.
"""
import json, math, os, sys
import numpy as np

ASSETS = os.path.expanduser("~/workspace/vector-hoops-mlops-v2/assets")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.json")
MODEL = "mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256"

def load():
    vec = json.load(open(os.path.join(ASSETS, "vectors.json")))
    skl = json.load(open(os.path.join(ASSETS, "skills.json")))
    emb = np.fromfile(os.path.join(ASSETS, "mtnn_embeddings.f32"),
                      dtype=np.float32).reshape(-1, 64).astype(np.float64)
    return vec, skl, emb

def find(players, person_id, season):
    hits = [p for p in players if p["person_id"] == person_id and p["season"] == season]
    assert len(hits) == 1, (person_id, season, len(hits))
    return hits[0]

def rank_of(sims, target_idx, exclude_person_ids, players):
    """Rank (1-based) of target_idx in sims descending, excluding rows whose
    person_id is in exclude_person_ids, except the target itself. Ties broken
    by lower row index (deterministic); reported as rank + n_compared."""
    order = []
    for i, s in enumerate(sims):
        if i == target_idx:
            order.append(i)
        elif players[i]["person_id"] not in exclude_person_ids:
            order.append(i)
    order.sort(key=lambda i: (-sims[i], i))
    return order.index(target_idx) + 1, order

def top_list(sims, players, exclude, k, self_idx):
    _, order = rank_of(sims, self_idx, exclude, players)  # order excludes self-person rows except self
    out = []
    for i in order:
        if i == self_idx:
            continue
        out.append({"name": players[i]["name"], "season": players[i]["season"],
                    "person_id": players[i]["person_id"], "cosine": round(float(sims[i]), 4)})
        if len(out) == k:
            break
    return out

def main():
    vec, skl, emb = load()
    players = vec["players"]
    feats = vec["features"]          # 14 stats, in order
    skill_keys = [s["key"] for s in skl["skills"]]  # 12 graded skills
    skill_labels = {s["key"]: s["label"] for s in skl["skills"]}
    assert len(players) == 12966 and emb.shape == (12966, 64), (len(players), emb.shape)
    curry = find(players, "stephen-curry", "2016-17")
    gino = find(players, "manu-ginobili", "2009-10")
    ci, gi = curry["id"], gino["id"]
    assert players[ci]["name"] == "Stephen Curry" and players[gi]["name"] == "Manu Ginobili"
    exclude = {"stephen-curry"}  # person-excluded: all Curry seasons out

    # --- (1) 64-d verification ---
    e_c, e_g = emb[ci], emb[gi]
    cos64 = float(e_c @ e_g)  # L2 rows, so dot == cosine
    sims64 = emb @ e_c
    rank64, _ = rank_of(sims64, gi, exclude, players)
    top64 = top_list(sims64, players, exclude, 5, ci)

    # --- (2) 64-d dimension-contribution decomposition ---
    contrib = e_c * e_g  # sums to cos64
    assert abs(contrib.sum() - cos64) < 1e-6
    order = np.argsort(-contrib)
    dims_top = [{"dim": int(i), "contribution": round(float(contrib[i]), 4),
                 "share_pct": round(float(100 * contrib[i] / cos64), 2),
                 "curry": round(float(e_c[i]), 4), "ginobili": round(float(e_g[i]), 4)}
                for i in order[:10]]
    dims_bottom = [{"dim": int(i), "contribution": round(float(contrib[i]), 4),
                    "share_pct": round(float(100 * contrib[i] / cos64), 2),
                    "curry": round(float(e_c[i]), 4), "ginobili": round(float(e_g[i]), 4)}
                   for i in order[-10:][::-1]]
    dims_sorted = [{"dim": int(i), "contribution": round(float(contrib[i]), 4)}
                   for i in order]

    # --- (3)+(4) 14-d stat space: vectors.json "v" is already era-z ---
    X = np.array([p["v"] for p in players], dtype=np.float64)
    Xn = X / np.linalg.norm(X, axis=1, keepdims=True)
    sims14 = Xn @ Xn[ci]
    cos14 = float(sims14[gi])
    rank14, _ = rank_of(sims14, gi, exclude, players)
    top14 = top_list(sims14, players, exclude, 5, ci)

    GROUPS = {
        "Scoring volume": ["PTS", "FGA", "FTA"],
        "Playmaking": ["AST", "TOV"],
        "Rebounding": ["OREB", "DREB"],
        "Defense": ["STL", "BLK"],
        "Shooting": ["FG3A", "FG3_PCT", "FG_PCT", "FT_PCT"],
        "Impact": ["PLUS_MINUS"],
    }
    idx = {f: i for i, f in enumerate(feats)}
    logo = []
    for gname, members in GROUPS.items():
        keep = [i for i in range(14) if feats[i] not in members]
        sub = Xn[:, keep]  # NOTE: re-normalised below per row
        sub = sub / np.linalg.norm(sub, axis=1, keepdims=True)
        s = sub @ sub[ci]
        r, _ = rank_of(s, gi, exclude, players)
        top1 = top_list(s, players, exclude, 1, ci)[0]
        logo.append({"group": gname, "dropped": members, "n_dropped": len(members),
                     "ginobili_rank": r, "rank_change": int(rank14 - r),
                     "ginobili_cosine": round(float(s[gi]), 4),
                     "top1_name": top1["name"], "top1_season": top1["season"],
                     "top1_cosine": top1["cosine"]})
    # leave-one-stat-out (appendix, same method)
    loso = []
    for f in feats:
        keep = [i for i in range(14) if feats[i] != f]
        sub = X[:, keep]; sub = sub / np.linalg.norm(sub, axis=1, keepdims=True)
        s = sub @ sub[ci]
        r, _ = rank_of(s, gi, exclude, players)
        loso.append({"stat": f, "ginobili_rank": r, "rank_change": int(rank14 - r),
                     "ginobili_cosine": round(float(s[gi]), 4)})

    # facet comparison: 14 stats + 12 skill grades
    facets_stats = []
    for j, f in enumerate(feats):
        a, b = float(X[ci, j]), float(X[gi, j])
        facets_stats.append({"stat": f, "label": vec["featureLabels"][f],
                             "curry": round(a, 3), "ginobili": round(b, 3),
                             "diff": round(a - b, 3), "abs_diff": round(abs(a - b), 3),
                             "both_high": bool(a > 1.0 and b > 1.0),
                             "both_low": bool(a < -0.5 and b < -0.5)})
    grades = skl["grades"]
    facets_skills = []
    for k, key in enumerate(skill_keys):
        a, b = int(grades[ci][k]), int(grades[gi][k])
        facets_skills.append({"skill": key, "label": skill_labels[key],
                              "curry": a, "ginobili": b, "diff": a - b,
                              "both_elite": bool(a >= 80 and b >= 80),
                              "both_weak": bool(a < 50 and b < 50)})

    # --- (5) embedding-space counterfactuals: skill high-vs-low mean directions ---
    grades_arr = np.array(grades, dtype=float)  # 12966 x 12
    alphas = [-2.0, -1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5, 2.0]
    cf_all = []
    for k, key in enumerate(skill_keys):
        g = grades_arr[:, k]
        hi = g >= np.percentile(g, 75)
        lo = g <= np.percentile(g, 25)
        d = emb[hi].mean(axis=0) - emb[lo].mean(axis=0)
        d = d / np.linalg.norm(d)
        sweep = []
        for a in alphas:
            v = e_c + a * d
            v = v / np.linalg.norm(v)
            s = emb @ v
            r, _ = rank_of(s, gi, exclude, players)
            sweep.append({"alpha": a, "ginobili_rank": r,
                          "ginobili_cosine": round(float(s[gi]), 4)})
        at1 = [x for x in sweep if x["alpha"] == 1.0][0]
        cf_all.append({"skill": key, "label": skill_labels[key],
                       "direction": "mean embedding of top-quartile minus bottom-quartile "
                                    f"rows on {key} grade (skills.json)",
                       "n_high": int(hi.sum()), "n_low": int(lo.sum()),
                       "rank_at_alpha_1": at1["ginobili_rank"],
                       "rank_change_at_1": int(rank64 - at1["ginobili_rank"]),
                       "sweep": sweep})
    # headline counterfactual: largest rank improvement at alpha=+1, and at any alpha
    best1 = max(cf_all, key=lambda c: c["rank_change_at_1"])
    best_any = max(
        ({"skill": c["skill"], "label": c["label"], "alpha": s["alpha"],
          "rank": s["ginobili_rank"], "change": int(rank64 - s["ginobili_rank"])}
         for c in cf_all for s in c["sweep"]),
        key=lambda d: d["change"])

    out = {
        "model": MODEL, "n_rows": 12966, "method": "person-excluded ranking (all rows of the target person removed, except the target row itself is never a candidate; Ginobili's own other seasons remain candidates)",
        "pair": {"curry": {"name": "Stephen Curry", "season": "2016-17", "person_id": "stephen-curry", "row": ci},
                 "ginobili": {"name": "Manu Ginobili", "season": "2009-10", "person_id": "manu-ginobili", "row": gi}},
        "space_64d": {"cosine": round(cos64, 4), "rank_person_excluded": rank64,
                      "n_compared": 12966 - sum(1 for p in players if p["person_id"] == "stephen-curry"),
                      "top5": top64},
        "space_14d": {"cosine": round(cos14, 4), "rank_person_excluded": rank14,
                      "n_compared": 12966 - sum(1 for p in players if p["person_id"] == "stephen-curry"),
                      "top5": top14, "note": "vectors.json v is already z-scored within season (era-z); cosine on v."},
        "dimension_contribution": {"sum_check": round(float(contrib.sum()), 4),
                                   "top10": dims_top, "bottom10": dims_bottom, "all_sorted": dims_sorted},
        "stat_groups_logo": {"baseline_rank_14d": rank14, "baseline_cosine_14d": round(cos14, 4), "groups": logo},
        "stat_loso": loso,
        "facets_stats": facets_stats, "facets_skills": facets_skills,
        "skill_keys": skill_keys,
        "counterfactuals": {"alphas": alphas, "baseline_rank_64d": rank64,
                            "best_at_alpha_1": {"skill": best1["skill"], "label": best1["label"],
                                                "rank": best1["rank_at_alpha_1"],
                                                "change": best1["rank_change_at_1"]},
                            "best_any_alpha": best_any, "by_skill": cf_all},
        "gap": {"true_tower_ablation": "UNAVAILABLE — the 120-feature input matrix is uncommitted, so the served v5 model cannot be re-run with a tower masked. No tower number on this page is a measured model internal.",
                "banned_not_used": ["mtnn.onnx (119->48, not served 64-d)",
                                     "mtnn_attr_pop.json (48-d pre-v5, marked not_from_served_net)",
                                     "mtnn_jacobian.json (48-d pre-v5, marked not_from_served_net)"],
                "skills_coverage": "skills.json grades cover 12 skills per row; mtnn_meta.json lists 18 skill keys, but the other 6 (post, transition, motor, shooting_gravity, rim_gravity, disruption_gravity) have no per-row grades in skills.json and are therefore NOT shown as facets."},
    }
    json.dump(out, open(OUT, "w"), indent=1)
    print(f"wrote {OUT}")
    print(f"64d cosine={cos64:.4f} rank={rank64} top={top64[0]}")
    print(f"14d cosine={cos14:.4f} rank={rank14} top={top14[0]}")
    print("LOGO:", [(g['group'], g['ginobili_rank']) for g in logo])
    print("best CF @1:", best1["skill"], best1["rank_at_alpha_1"], "best any:", best_any)
    return 0

if __name__ == "__main__":
    sys.exit(main())

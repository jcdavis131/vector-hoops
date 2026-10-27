#!/usr/bin/env python3
"""Builder A — Steerable Twin Explorer, precompute (PROTOTYPE ONLY).

Reads the champion MTNN v5 assets READ-ONLY (never writes to any repo
checkout) and bakes discrete slider-step twin lists into data.js / data.json.

Method (see NOTES.md for the full derivation log):
  * Embeddings: assets/mtnn_embeddings.f32, 12,966 x 64 float32, L2 rows,
    index-aligned with vectors.json players[] and skills.json grades[].
  * Skill directions: for a skill key, mean 64-d embedding of rows with
    grade >= 90 minus mean embedding of rows with grade <= 10, L2-normalized.
    skills.json carries 12 grade columns (not the 18 keys listed in
    mtnn_meta.json); only those 12 are used.
  * Archetype directions: unit vector (centroid - global mean embedding),
    centroids from mtnn_meta.json (8 x 64, already unit norm).
  * Stat-group directions: mean embedding of rows in the top decile of a
    vectors.json era-z stat minus mean embedding of rows in the bottom
    decile, L2-normalized.
  * Steering (all directions, one formula): steered = L2-normalize(
    start_embedding + alpha * direction), alpha in
    [-1.0, -0.8, ..., +1.0]. Twins = top-10 by cosine over the FULL
    12,966-row space, with every row sharing the start player's person_id
    excluded (never name alone). No model is rerun: this is linear motion
    in the saved embedding space, and the page says so.
  * No training, no GPU, no new packages. Stdlib + numpy (already
    installed on this machine) only.

Usage: python3 precompute.py   (writes data.js and data.json next to it)
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = "/home/hatch/workspace/vector-hoops-mlops-v2/assets"
MODEL = "mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256"
ALPHAS = [round(-1.0 + 0.2 * i, 1) for i in range(11)]

STARTS = [
    ("Stephen Curry", "2016-17"),
    ("James Harden", "2017-18"),
    ("Giannis Antetokounmpo", "2018-19"),
    ("Nikola Jokic", "2022-23"),
]

SKILL_DIRS = [
    # (id, skill key, plain-words sentence, derivation label)
    ("skill-shooting", "shooting",
     "More shooting pulls the list toward elite three-point shooters; less shooting pulls it toward slashers and drivers.",
     "Skill-difference vector: mean 64-d embedding of rows graded >=90 in Perimeter Shooting minus mean of rows graded <=10, from skills.json (1,297 high rows, 1,424 low rows)."),
    ("skill-playmaking", "playmaking",
     "More playmaking pulls the list toward pass-first floor generals; less pulls it toward finishers who play off the ball.",
     "Skill-difference vector: mean 64-d embedding of rows graded >=90 in Playmaking minus mean of rows graded <=10, from skills.json (1,297 high rows, 1,424 low rows)."),
    ("skill-rim", "rim",
     "More rim protection pulls the list toward shot-blockers and bigs; less pulls it toward perimeter players.",
     "Skill-difference vector: mean 64-d embedding of rows graded >=90 in Rim Protection minus mean of rows graded <=10, from skills.json (1,297 high rows, 1,424 low rows)."),
    ("skill-scoring", "scoring",
     "More scoring pulls the list toward high-volume bucket-getters; less pulls it toward lower-usage role players.",
     "Skill-difference vector: mean 64-d embedding of rows graded >=90 in Scoring Volume minus mean of rows graded <=10, from skills.json (1,297 high rows, 1,424 low rows)."),
    ("skill-oreb", "oreb",
     "More offensive rebounding pulls the list toward glass-crashers; less pulls it toward players who leak out instead of crashing.",
     "Skill-difference vector: mean 64-d embedding of rows graded >=90 in Offensive Glass minus mean of rows graded <=10, from skills.json (1,297 high rows, 1,424 low rows)."),
]

ARCH_DIRS = [
    # (id, centroid index, label, plain sentence, metric skill for "what moved")
    ("arch-0", 0, "Glass + Rim bigs",
     "Blending toward this archetype center turns the player into a paint big: boards, blocks, and interior finishing take over the list.",
     "rim"),
    ("arch-5", 5, "Perimeter shooting",
     "Blending toward this archetype center turns the player into a pure perimeter shooter: three-point volume and accuracy take over the list.",
     "shooting"),
    ("arch-6", 6, "Playmaking + steals",
     "Blending toward this archetype center turns the player into a pass-and-pressure guard: assists and steals take over the list.",
     "playmaking"),
]

STAT_DIRS = [
    # (id, feature, label, plain sentence)
    ("stat-fg3a", "FG3A", "Three-point volume (raw stat)",
     "More three-point volume pulls the list toward high-volume three-point shooters, even ones the skill grade alone would miss.",
     "FG3A era-z in vectors.json, top decile minus bottom decile (1,297 rows each)."),
    ("stat-fta", "FTA", "Rim pressure / free throws (raw stat)",
     "More free-throw volume pulls the list toward players who live at the rim and draw fouls.",
     "FTA era-z in vectors.json, top decile minus bottom decile (1,297 rows each)."),
]


def unit(v):
    return v / np.linalg.norm(v)


def main():
    vectors = json.load(open(os.path.join(ASSETS, "vectors.json")))
    skills = json.load(open(os.path.join(ASSETS, "skills.json")))
    meta = json.load(open(os.path.join(ASSETS, "mtnn_meta.json")))
    players = vectors["players"]
    feats = vectors["features"]
    grades = np.array(skills["grades"], dtype=int)          # 12966 x 12
    skill_keys = [s["key"] for s in skills["skills"]]       # 12 keys
    skill_labels = {s["key"]: s["label"] for s in skills["skills"]}
    emb = np.fromfile(os.path.join(ASSETS, "mtnn_embeddings.f32"),
                      dtype=np.float32).reshape(12966, 64).astype(np.float64)
    assert len(players) == 12966 and grades.shape == (12966, 12)
    assert np.allclose(np.linalg.norm(emb, axis=1), 1.0, atol=1e-4)

    by_name_season = {(p["name"], p["season"]): p for p in players}
    person_of = np.array([p["person_id"] for p in players])
    stat_mat = np.array([p["v"] for p in players], dtype=float)  # era-z

    directions = []  # dicts: id, group, label, plain, derivation, metric, vector

    for did, key, plain, deriv in SKILL_DIRS:
        j = skill_keys.index(key)
        hi = grades[:, j] >= 90
        lo = grades[:, j] <= 10
        d = unit(emb[hi].mean(0) - emb[lo].mean(0))
        directions.append({"id": did, "group": "Skill", "label": skill_labels[key],
                           "plain": plain, "derivation": deriv,
                           "metric": key, "vector": d,
                           "n_high": int(hi.sum()), "n_low": int(lo.sum())})

    global_mean = emb.mean(0)
    centroids = np.array(meta["centroids"], dtype=float)
    # Archetype labels are DERIVED here: mean skill grades of the rows
    # nearest (cosine) to each centroid. They are NOT the vectors.json
    # cluster names (those cluster the 14-d stat space, a different space).
    nearest = np.argmax(emb @ (centroids / np.linalg.norm(centroids, axis=1, keepdims=True)).T, axis=1)
    for did, ci, label, plain, metric in ARCH_DIRS:
        sel = nearest == ci
        prof = {skill_keys[j]: round(float(grades[sel, j].mean()), 1)
                for j in range(12)}
        d = unit(centroids[ci] - global_mean)
        directions.append({"id": did, "group": "Archetype", "label": label,
                           "plain": plain,
                           "derivation": (
                               "Archetype-centroid direction: mtnn_meta.json centroid %d "
                               "minus the global mean embedding, L2-normalized. Label derived "
                               "from the %d rows nearest that centroid (mean grades: %s)."
                               % (ci, int(sel.sum()), prof)),
                           "metric": metric, "vector": d, "centroid": ci,
                           "n_nearest": int(sel.sum()), "profile": prof})

    for did, feat, label, plain, deriv in STAT_DIRS:
        col = stat_mat[:, feats.index(feat)]
        hi = col >= np.quantile(col, 0.9)
        lo = col <= np.quantile(col, 0.1)
        d = unit(emb[hi].mean(0) - emb[lo].mean(0))
        directions.append({"id": did, "group": "Raw stat group", "label": label,
                           "plain": plain,
                           "derivation": "Stat-group difference vector: " + deriv,
                           "metric": feat, "vector": d,
                           "n_high": int(hi.sum()), "n_low": int(lo.sum())})

    out_starts = []
    for name, season in STARTS:
        p = by_name_season[(name, season)]
        si = p["id"]
        assert players[si]["name"] == name and players[si]["season"] == season
        keep = person_of != p["person_id"]  # person-excluded, never name alone
        start_entry = {
            "name": name, "season": season, "person_id": p["person_id"],
            "row": si,
            "grades": {skill_keys[j]: int(grades[si, j]) for j in range(12)},
            "directions": {},
        }
        for d in directions:
            per_alpha = {}
            for alpha in ALPHAS:
                vec = unit(emb[si] + alpha * d["vector"])
                sims = np.where(keep, emb @ vec, -9.0)
                idx = np.argsort(-sims)[:10]
                twins = []
                for t in idx:
                    q = players[int(t)]
                    twins.append({
                        "name": q["name"], "season": q["season"],
                        "person_id": q["person_id"],
                        "cos": round(float(sims[t]), 4),
                        "grades": [int(x) for x in grades[t]],
                        "FG3A_z": round(float(stat_mat[t, feats.index("FG3A")]), 2),
                        "FTA_z": round(float(stat_mat[t, feats.index("FTA")]), 2),
                    })
                per_alpha[str(alpha)] = twins
            start_entry["directions"][d["id"]] = per_alpha
        out_starts.append(start_entry)

    payload = {
        "model": MODEL,
        "rows": 12966, "dim": 64,
        "alphas": ALPHAS,
        "skill_keys": skill_keys,
        "skill_labels": skill_labels,
        "directions": [{k: v for k, v in d.items() if k != "vector"}
                        for d in directions],
        "starts": out_starts,
        "provenance": (
            "Champion MTNN v5 embeddings (mtnn_embeddings.f32, 12,966 x 64, "
            "L2-normalized) index-aligned with vectors.json players and "
            "skills.json grades. Slider positions are discrete precomputed "
            "steps (alpha -1.0 to +1.0, step 0.2); steering is linear motion "
            "in the saved embedding space and is NOT a model rerun."),
        # Coordinator-verified space note, reproduced so the page states it.
        "space_note": (
            "Curry 2016-17 -> Ginobili 2009-10 is a 14-d STAT-space Twin Reveal "
            "pair. In the 64-d champion embedding space its cosine is 0.4003 "
            "and it ranks 390th (person-excluded) -- it is NOT a 64-d top twin. "
            "The 64-d top twin of Curry 2016-17 is James Harden 2017-18 (0.8600)."),
    }
    with open(os.path.join(HERE, "data.json"), "w") as f:
        json.dump(payload, f)
    with open(os.path.join(HERE, "data.js"), "w") as f:
        f.write("window.STEER_DATA = ")
        json.dump(payload, f)
        f.write(";\n")

    # Validation printout: metric at -1 / 0 / +1 for every start x direction.
    print("starts x directions: metric(top10 mean) at alpha -1 / 0 / +1")
    for s_entry, (name, season) in zip(out_starts, STARTS):
        for d in directions:
            vals = []
            for a in ("-1.0", "0.0", "1.0"):
                tw = s_entry["directions"][d["id"]][a]
                if d["metric"] in skill_keys:
                    j = skill_keys.index(d["metric"])
                    vals.append(round(sum(t["grades"][j] for t in tw) / 10, 1))
                elif d["metric"] == "FG3A":
                    vals.append(round(sum(t["FG3A_z"] for t in tw) / 10, 2))
                else:
                    vals.append(round(sum(t["FTA_z"] for t in tw) / 10, 2))
            print(f"  {name} {season} | {d['id']} ({d['metric']}): {vals}")
    print("wrote data.json + data.js in", HERE)


if __name__ == "__main__":
    sys.exit(main())

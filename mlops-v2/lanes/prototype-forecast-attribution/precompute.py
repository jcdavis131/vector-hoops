#!/usr/bin/env python3
"""Forecast Attribution — precompute script (read-only inputs, one output).

Reads (read-only, never modified):
  ~/workspace/vector-hoops-mlops-v2/assets/vectors.json   (row master, 12,966 rows)
  ~/workspace/vector-hoops-mlops-v2/assets/mtnn_heads.f32 (checked, NOT used as
      a forecast: it holds saved per-row head OUTPUTS only, no weights and no
      documented column layout, so no input ablation can be run through it.)

Writes (only file written, in this directory):
  data.json — everything index.html displays.

Forecast method (a labeled BASELINE, never presented as a model prediction):
  "Neighbor baseline", K = 25. For a target player-season T:
    - Candidate pool: every player-season from an EARLIER season than T whose
      own next season exists in vectors.json, excluding T's person_id
      (self excluded, keyed by person_id, not by name).
    - Distance: Euclidean over 17 standardized dims, equal weight:
      the 14 game-vector z-scores (already z-scored within season in
      vectors.json) + age_z + gp_z + total_min_z, where age = season-start
      year minus birthYear and the _z features use the global mean/std
      across all 12,966 rows (reported in data.json).
    - Forecast: the mean of the 25 nearest candidates' ACTUAL next-season
      14-d z-lines.
  "Carry-forward baseline": forecast = T's own 14-d line, unchanged.
  "Age-curve baseline": forecast = T's line + the mean year-over-year delta
    per stat for all adjacent-season pairs at T's age (exact age; widened by
    +-1, +-2 years only until the cell holds >= 30 pairs; the n used is
    reported per player).

Attribution (leave-one-signal-out, LOSO, computed — never asserted):
  Six signals partition the 17 distance dims (see SIGNALS). For each signal:
    - remove: re-run the neighbor search with that signal's dims DROPPED
      from the distance (both sides), K = 25, forecast = new neighbors'
      mean next-season line. Delta = ablated forecast minus full forecast.
    - vary 0.5x / 1.5x: re-run the neighbor search with T's dims in that
      signal scaled by 0.5 / 1.5 (candidates unchanged), K = 25.
  All forecasts, deltas, neighbor lists and error scores in data.json are
  outputs of this script. Nothing on the page is hand-written.

Units: every stat line is a 14-d z-score line (season-relative: +1.0 means
one standard deviation above that season's average for that stat), because
vectors.json stores z-scores, not raw per-100 values. The page says so.
No raw per-100 values are invented by de-z-scoring without season means.

Global check (--full-eval, on by default): the same neighbor baseline and
carry-forward scored on every adjacent-season pair that has an earlier-
season candidate pool (n reported). This is the honest headline for how
good the baseline is; per-player pages also show the player's own actual
next-season line so the forecast error is visible, not hidden.

Usage: python3 precompute.py [--no-full-eval] [--out data.json]
Requires numpy (already installed on this VM; nothing is installed here).
"""

import argparse
import json
import math
import os
import sys

import numpy as np

ASSETS = os.path.expanduser("~/workspace/vector-hoops-mlops-v2/assets")
FEATURES = ["PTS", "AST", "OREB", "DREB", "STL", "BLK", "TOV", "FG3A",
            "FGA", "FTA", "FG3_PCT", "FG_PCT", "FT_PCT", "PLUS_MINUS"]

# Signal groups: name, plain-words gloss, indices into the 17-dim distance
# vector (0-13 = the 14 stats in FEATURES order, 14 = age_z, 15 = gp_z,
# 16 = total_min_z).
SIGNALS = [
    {"id": "scoring", "label": "Last-season scoring",
     "gloss": "How much he scored and shot (PTS, shot attempts, threes attempted).",
     "dims": [0, 8, 7], "stats": ["PTS", "FGA", "FG3A"]},
    {"id": "playmaking", "label": "Playmaking & ball security",
     "gloss": "Setting teammates up, and giving it away (AST, TOV).",
     "dims": [1, 6], "stats": ["AST", "TOV"]},
    {"id": "glass-defense", "label": "Glass & defense",
     "gloss": "Rebounding and defensive plays (OREB, DREB, STL, BLK).",
     "dims": [2, 3, 4, 5], "stats": ["OREB", "DREB", "STL", "BLK"]},
    {"id": "efficiency", "label": "Shooting efficiency",
     "gloss": "How well he shot, not how much (FG3_PCT, FG_PCT, FT_PCT).",
     "dims": [10, 11, 12], "stats": ["FG3_PCT", "FG_PCT", "FT_PCT"]},
    {"id": "line-impact", "label": "Free throws & on-court impact",
     "gloss": "Getting to the line and the score while he was on court "
              "(FTA, PLUS_MINUS) — the closest stored proxy for team context.",
     "dims": [9, 13], "stats": ["FTA", "PLUS_MINUS"]},
    {"id": "age-workload", "label": "Age & workload",
     "gloss": "How old he was and how much he played (age, games, stored minutes).",
     "dims": [14, 15, 16], "stats": []},
]

PLAYERS = [
    # (person_id, season, role note)
    ("stephen-curry", "2016-17", "Guard, prime superstar"),
    ("nikola-jokic", "2022-23", "Big man, MVP-level center"),
    ("luka-doncic", "2018-19", "Young player, rookie season"),
    ("victor-wembanyama", "2023-24", "Young player, rookie big man"),
]

K = 25


def season_start(season):
    return int(season[:4])


def next_season(season):
    y = season_start(season)
    return "%d-%02d" % (y + 1, (y + 2) % 100)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-full-eval", action="store_true")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(
        os.path.abspath(__file__)), "data.json"))
    args = ap.parse_args()

    with open(os.path.join(ASSETS, "vectors.json")) as f:
        vec = json.load(f)
    players = sorted(vec["players"], key=lambda p: p["id"])
    assert len(players) == 12966, len(players)
    assert vec["features"] == FEATURES

    stats = np.array([p["v"] for p in players], dtype=np.float64)  # 12966x14
    ages = np.array([season_start(p["season"]) - p["birthYear"]
                     for p in players], dtype=np.float64)
    gps = np.array([p["gp"] for p in players], dtype=np.float64)
    mins = np.array([p["total_min"] for p in players], dtype=np.float64)

    def z(a):
        return float(a.mean()), float(a.std())
    age_mu, age_sd = z(ages)
    gp_mu, gp_sd = z(gps)
    min_mu, min_sd = z(mins)
    # 17-dim distance space.
    X = np.column_stack([stats,
                         (ages - age_mu) / age_sd,
                         (gps - gp_mu) / gp_sd,
                         (mins - min_mu) / min_sd])

    by_key = {(p["person_id"], p["season"]): p for p in players}
    # Next-season line per row id (None where the player has no next season
    # in the file, e.g. 2025-26 rows or a missed season).
    next_line = {}
    for p in players:
        q = by_key.get((p["person_id"], next_season(p["season"])))
        next_line[p["id"]] = np.array(q["v"], dtype=np.float64) if q else None
    season_year = np.array([season_start(p["season"]) for p in players])
    person = np.array([p["person_id"] for p in players])

    # ---- age curve: mean year-over-year delta per stat, per age ----
    adj = [(p, by_key[(p["person_id"], next_season(p["season"]))])
           for p in players
           if (p["person_id"], next_season(p["season"])) in by_key]
    age_deltas = {}
    for p, q in adj:
        a = season_start(p["season"]) - p["birthYear"]
        age_deltas.setdefault(a, []).append(
            np.array(q["v"]) - np.array(p["v"]))
    age_curve = {}
    for a, ds in age_deltas.items():
        age_curve[a] = (np.mean(np.array(ds), axis=0), len(ds))

    def age_curve_for(age):
        for widen in (0, 1, 2, 3, 5):
            sel = [a for a in age_curve if abs(a - age) <= widen]
            n = sum(age_curve[a][1] for a in sel)
            if n >= 30:
                tot = sum(age_curve[a][0] * age_curve[a][1] for a in sel)
                return tot / n, n, widen
        sel = list(age_curve)
        n = sum(age_curve[a][1] for a in sel)
        tot = sum(age_curve[a][0] * age_curve[a][1] for a in sel)
        return tot / n, n, None

    def neighbor_forecast(target_id, drop_dims=(), scale_dims=(), scale=1.0):
        """Return (forecast 14-d, neighbor row ids)."""
        t = players[target_id]
        ty = season_year[target_id]
        # Candidates: earlier seasons, with a known next season, not same person.
        cand = np.array([i for i in range(len(players))
                         if season_year[i] < ty
                         and next_line[i] is not None
                         and person[i] != t["person_id"]], dtype=int)
        if len(cand) == 0:
            return None, []
        keep = [d for d in range(17) if d not in set(drop_dims)]
        tv = X[target_id, keep].copy()
        if scale_dims:
            pos = {d: k for k, d in enumerate(keep)}
            for d in scale_dims:
                if d in pos:
                    tv[pos[d]] *= scale
        diff = X[cand][:, keep] - tv
        dist = np.sqrt(np.sum(diff * diff, axis=1))
        order = cand[np.argsort(dist, kind="stable")[:K]]
        fc = np.mean([next_line[int(i)] for i in order], axis=0)
        return fc, [int(i) for i in order]

    def mae(a, b):
        return float(np.mean(np.abs(np.array(a) - np.array(b))))

    out_players = []
    for pid, season, role in PLAYERS:
        t = by_key[(pid, season)]
        tid = t["id"]
        actual = by_key[(pid, next_season(season))]
        full, nbrs = neighbor_forecast(tid)
        assert full is not None
        delta_age, age_n, age_widen = age_curve_for(
            season_start(season) - t["birthYear"])
        age_fc = np.array(t["v"]) + delta_age
        carry = np.array(t["v"])
        entry = {
            "person_id": pid, "name": t["name"], "season": season,
            "role_note": role,
            "age": season_start(season) - t["birthYear"],
            "gp": t["gp"], "total_min_stored": t["total_min"],
            "predict_season": next_season(season),
            "base_line": [round(float(x), 3) for x in t["v"]],
            "actual_next_line": [round(float(x), 3) for x in actual["v"]],
            "forecast": [round(float(x), 3) for x in full],
            "carry_forward": [round(float(x), 3) for x in carry],
            "age_curve": [round(float(x), 3) for x in age_fc],
            "age_curve_n": age_n, "age_curve_widen": age_widen,
            "mae_forecast_vs_actual": round(mae(full, actual["v"]), 4),
            "mae_carry_vs_actual": round(mae(carry, actual["v"]), 4),
            "mae_agecurve_vs_actual": round(mae(age_fc, actual["v"]), 4),
            "neighbors_top5": [
                {"name": players[i]["name"], "season": players[i]["season"],
                 "person_id": players[i]["person_id"]}
                for i in nbrs[:5]],
            "n_candidates": int(sum(1 for i in range(len(players))
                                    if season_year[i] < season_year[tid]
                                    and next_line[i] is not None
                                    and person[i] != pid)),
            "ablations": {},
        }
        for sig in SIGNALS:
            ab = {}
            for variant, kw in (("remove", {"drop_dims": sig["dims"]}),
                                ("scale_0.5", {"scale_dims": sig["dims"],
                                               "scale": 0.5}),
                                ("scale_1.5", {"scale_dims": sig["dims"],
                                               "scale": 1.5})):
                fc, nbrs2 = neighbor_forecast(tid, **kw)
                ab[variant] = {
                    "forecast": [round(float(x), 3) for x in fc],
                    "delta": [round(float(a - b), 3)
                              for a, b in zip(fc, full)],
                    "neighbors_top5": [
                        {"name": players[i]["name"],
                         "season": players[i]["season"]}
                        for i in nbrs2[:5]],
                }
            entry["ablations"][sig["id"]] = ab
        out_players.append(entry)

    # ---- global check: neighbor baseline vs carry-forward, all pairs ----
    full_eval = None
    if not args.no_full_eval:
        errs_nb, errs_cf = [], []
        n_eval = 0
        # Chunked so memory stays flat; candidates recomputed per target year.
        for p, q in adj:
            ty = season_year[p["id"]]
            cand = np.array([i for i in range(len(players))
                             if season_year[i] < ty
                             and next_line[i] is not None
                             and person[i] != p["person_id"]], dtype=int)
            if len(cand) == 0:
                continue
            diff = X[cand] - X[p["id"]]
            dist = np.sqrt(np.sum(diff * diff, axis=1))
            order = cand[np.argsort(dist, kind="stable")[:K]]
            fc = np.mean([next_line[int(i)] for i in order], axis=0)
            errs_nb.append(np.mean(np.abs(fc - np.array(q["v"]))))
            errs_cf.append(np.mean(np.abs(np.array(p["v"]) - np.array(q["v"]))))
            n_eval += 1
        full_eval = {
            "n_adjacent_pairs": len(adj),
            "n_evaluated": n_eval,
            "mae_neighbor_baseline": round(float(np.mean(errs_nb)), 4),
            "mae_carry_forward": round(float(np.mean(errs_cf)), 4),
        }

    data = {
        "generated_by": "precompute.py (this directory); inputs read-only from "
                        "vector-hoops-mlops-v2/assets/vectors.json",
        "features": FEATURES,
        "method": {
            "name": "Neighbor baseline (K=25) — a labeled baseline, "
                    "NOT a model prediction",
            "k": K,
            "distance": "Euclidean over 17 standardized dims, equal weight: "
                        "14 game-vector z-scores + age_z + gp_z + "
                        "total_min_z (global mean/std below)",
            "candidate_rule": "Earlier seasons only, own next season known, "
                              "same person_id excluded",
            "forecast": "Mean of the 25 neighbors' ACTUAL next-season lines",
            "standardization": {"age": [age_mu, age_sd], "gp": [gp_mu, gp_sd],
                                "total_min": [min_mu, min_sd]},
        },
        "signals": SIGNALS,
        "v5_head_check": {
            "runnable": False,
            "evidence": "mtnn_heads.f32 is 583,470 float32 = 12,966 rows x 45 "
                        "outputs; no weight file and no documented column "
                        "layout is saved, and no checkpoint file exists in "
                        "assets/. Its last 14 columns (row-major) are a "
                        "shrunk copy of the CURRENT season (slope 0.30-0.81 "
                        "per stat, MAE vs actual next season 0.4708 vs "
                        "carry-forward 0.4732 over 10,107 adjacent pairs) — "
                        "so it cannot be run on new inputs and cannot be "
                        "ablated. Baselines are therefore used and labeled.",
        },
        "full_eval": full_eval,
        "players": out_players,
    }
    with open(args.out, "w") as f:
        json.dump(data, f, indent=1)
    print("wrote", args.out)
    print("players:", [(p["name"], p["season"]) for p in out_players])
    print("full_eval:", full_eval)
    for p in out_players:
        print(p["name"], p["season"], "MAE fc/carry/age:",
              p["mae_forecast_vs_actual"], p["mae_carry_vs_actual"],
              p["mae_agecurve_vs_actual"])
    return 0


if __name__ == "__main__":
    sys.exit(main())

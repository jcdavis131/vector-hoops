#!/usr/bin/env python3
"""Precompute baked data for the Steerable Future Explorer (v0).

Reads ONLY (never writes to) the saved champion assets:
  ~/workspace/vector-hoops-mlops-v2/assets/vectors.json   (12,966 rows, 14-d z)
  ~/workspace/vector-hoops-mlops-v2/assets/mtnn_heads.f32  (12,966 x 45, layout
      [arch 8 | skills 18 | position 5 | next-profile 14] per
      pipeline/export_mtnn_viz.py)
  ~/workspace/vector-hoops-mlops-v2/assets/mtnn_arch.json  (head widths)

Writes (this lane directory only):
  data.json  -- canonical baked data
  data.js    -- same data as `window.FUTURE_EXPLORER_DATA = {...};`
               (index.html loads it with a <script> tag so the demo runs
               by double-clicking the file: no server, no fetch, no CORS.)

What is computed, in plain words:
  * Adjacent-season pairs: same person_id, season N and season N+1.
  * Carry-forward baseline: next season = this season (14-d z, unchanged).
  * Age-curve baseline: next season = this season + the average year-to-year
    change of players in the same age bin, computed from all adjacent pairs.
    Age = season-start-year minus birthYear from vectors.json.
  * Steering vectors: for one driver stat, the ordinary-least-squares slope
    of each stat's year-to-year change on the driver's year-to-year change,
    over all adjacent pairs. Steering a slider by +1.0 z of the driver adds
    slope[j] to stat j. This is a correlation from real history, NOT a
    model run and NOT a causal claim: players who shot more threes also
    tended to change in these other ways.
  * v5 saved-head reference: columns 31:45 of mtnn_heads.f32, the frozen
    next-profile outputs the v5 export saved per row. These are DISPLAYED
    only. They cannot be re-run or steered from saved assets: no checkpoint
    weights are saved in the repo (no .pt file; the saved mtnn.onnx is a
    different 119->48 model, per contract honesty bans), so there is no
    model to feed a steered input through.

Validation printed at the end: baseline MAEs in z units over all adjacent
pairs, per-stat correlations of the v5 head vs actual next season, and the
success-test numbers (Curry, more-threes slider at max).

Stdlib only. No training, no GPU, no network, no writes outside this lane.
"""

import json
import struct
import sys
from pathlib import Path

ASSETS = Path.home() / "workspace" / "vector-hoops-mlops-v2" / "assets"
HERE = Path(__file__).resolve().parent

STATS = ["PTS", "AST", "OREB", "DREB", "STL", "BLK", "TOV",
         "FG3A", "FGA", "FTA", "FG3_PCT", "FG_PCT", "FT_PCT", "PLUS_MINUS"]
PLAIN = {
    "PTS": "scoring", "AST": "playmaking", "OREB": "offensive rebounds",
    "DREB": "defensive rebounds", "STL": "steals", "BLK": "blocks",
    "TOV": "turnovers", "FG3A": "three-point attempts",
    "FGA": "total shot attempts", "FTA": "free-throw attempts",
    "FG3_PCT": "three-point accuracy", "FG_PCT": "shooting accuracy",
    "FT_PCT": "free-throw accuracy", "PLUS_MINUS": "on-court impact (noisy)",
}
AGE_BINS = [(0, 21), (22, 24), (25, 27), (28, 30), (31, 33), (34, 120)]
AGE_BIN_LABELS = ["21 and under", "22-24", "25-27", "28-30", "31-33", "34 and over"]
# driver stat index -> steer definition
STEERS = [
    {"id": "threes", "label": "More threes",
     "driver": "FG3A",
     "plain": "He shoots more threes than last season.",
     "derivation": "Slope of each stat's year-to-year change on the change in "
                   "three-point attempts, over all players with two straight seasons."},
    {"id": "role", "label": "Bigger scoring role",
     "driver": "FGA",
     "plain": "He takes more shots overall: a bigger role in the offense.",
     "derivation": "Slope of each stat's year-to-year change on the change in "
                   "total shot attempts, over all players with two straight seasons."},
    {"id": "playmaking", "label": "Run the offense",
     "driver": "AST",
     "plain": "He becomes the main playmaker and sets teammates up more.",
     "derivation": "Slope of each stat's year-to-year change on the change in "
                   "assists, over all players with two straight seasons."},
    {"id": "glass", "label": "Crash the glass",
     "driver": None,  # combined driver: change in OREB + change in DREB
     "plain": "He crashes the boards harder at both ends.",
     "derivation": "Slope of each stat's year-to-year change on the change in "
                   "total rebounds (offensive + defensive), over all players "
                   "with two straight seasons."},
]
START_PLAYERS = [
    ("stephen-curry", "2016-17", "guard, prime"),
    ("nikola-jokic", "2020-21", "big man, prime"),
    ("victor-wembanyama", "2023-24", "young player, age 20"),
]


def season_year(season):
    return int(season[:4])


def age_bin(age):
    for i, (lo, hi) in enumerate(AGE_BINS):
        if lo <= age <= hi:
            return i
    return len(AGE_BINS) - 1


def mean(rows):
    n = len(rows)
    return [sum(r[j] for r in rows) / n for j in range(14)]


def ols_slope(xs, ys):
    mx = sum(xs) / len(xs)
    my = sum(ys) / len(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den = sum((x - mx) ** 2 for x in xs)
    return num / den if den else 0.0


def corr(xs, ys):
    mx = sum(xs) / len(xs)
    my = sum(ys) / len(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = sum((x - mx) ** 2 for x in xs) ** 0.5
    dy = sum((y - my) ** 2 for y in ys) ** 0.5
    return num / (dx * dy) if dx and dy else 0.0


def mae(a_rows, b_rows):
    tot, n = 0.0, 0
    for a, b in zip(a_rows, b_rows):
        tot += sum(abs(x - y) for x, y in zip(a, b))
        n += 14
    return tot / n


def main():
    vec = json.loads((ASSETS / "vectors.json").read_text())
    assert vec["features"] == STATS, vec["features"]
    players = vec["players"]
    assert len(players) == 12966, len(players)

    arch = json.loads((ASSETS / "mtnn_arch.json").read_text())
    assert arch["nNextProfile"] == 14, arch["nNextProfile"]

    raw = (ASSETS / "mtnn_heads.f32").read_bytes()
    vals = struct.unpack("<%df" % (len(raw) // 4), raw)
    assert len(vals) == 12966 * 45, len(vals)
    # Row-aligned with vectors.json by index (players[i]["id"] == i).
    assert all(p["id"] == i for i, p in enumerate(players))
    v5_head = [list(vals[i * 45 + 31: i * 45 + 45]) for i in range(12966)]

    by_key = {(p["person_id"], season_year(p["season"])): p for p in players}
    pairs = []
    for p in players:
        q = by_key.get((p["person_id"], season_year(p["season"]) + 1))
        if q is not None:
            pairs.append((p, q))
    curr = [p["v"] for p, _ in pairs]
    actual = [q["v"] for _, q in pairs]
    delta = [[q["v"][j] - p["v"][j] for j in range(14)] for p, q in pairs]
    ages = [season_year(p["season"]) - p["birthYear"] for p, _ in pairs]

    # Age-curve baseline.
    bin_mean = []
    bin_n = []
    for lo, hi in AGE_BINS:
        rows = [d for d, a in zip(delta, ages) if lo <= a <= hi]
        bin_mean.append(mean(rows))
        bin_n.append(len(rows))
    age_fc = [[curr[i][j] + bin_mean[age_bin(ages[i])][j] for j in range(14)]
              for i in range(len(pairs))]

    # Steering vectors (OLS slopes of year-to-year change on driver change).
    def driver_series(steer):
        if steer["driver"] is None:  # glass: OREB change + DREB change
            return [d[2] + d[3] for d in delta]
        j = STATS.index(steer["driver"])
        return [d[j] for d in delta]

    steers_out = []
    for steer in STEERS:
        xs = driver_series(steer)
        slopes = [ols_slope(xs, [d[j] for d in delta]) for j in range(14)]
        steers_out.append({
            "id": steer["id"], "label": steer["label"],
            "driver": steer["driver"] or "OREB+DREB",
            "plain": steer["plain"], "derivation": steer["derivation"],
            "slopes": [round(s, 4) for s in slopes],
            "n_pairs": len(pairs),
        })

    # Validation: MAE (z units) and v5-head per-stat correlation vs actual.
    head_rows = [v5_head[p["id"]] for p, _ in pairs]
    v5_corr = {}
    for j, name in enumerate(STATS):
        v5_corr[name] = round(corr([r[j] for r in head_rows],
                                   [r[j] for r in actual]), 3)
    validation = {
        "n_adjacent_pairs": len(pairs),
        "mae_carry_forward_z": round(mae(curr, actual), 4),
        "mae_age_curve_z": round(mae(age_fc, actual), 4),
        "mae_v5_saved_head_z": round(mae(head_rows, actual), 4),
        "v5_head_corr_vs_actual_next": v5_corr,
        "age_bins": [{"label": AGE_BIN_LABELS[i], "n_pairs": bin_n[i],
                      "mean_delta": [round(x, 4) for x in bin_mean[i]]}
                     for i in range(len(AGE_BINS))],
        "note": "MAE is in within-season z units (0 = average player-season, "
                "1 = one standard deviation above). Lower is better. The v5 "
                "head is a frozen saved output, not a runnable model: it is "
                "scored here for reference only and is never steered.",
    }

    # Start players, each with a real following season (so 'actual next'
    # can be shown as a check, never as a prediction).
    players_out = []
    for pid, season, role in START_PLAYERS:
        p = by_key[(pid, season_year(season))]
        q = by_key[(pid, season_year(season) + 1)]
        age = season_year(season) - p["birthYear"]
        b = age_bin(age)
        age_forecast = [p["v"][j] + bin_mean[b][j] for j in range(14)]
        players_out.append({
            "person_id": pid, "name": p["name"], "season": season,
            "role": role, "age": age, "age_bin": AGE_BIN_LABELS[b],
            "current": [round(x, 3) for x in p["v"]],
            "baseline_age_curve": [round(x, 3) for x in age_forecast],
            "carry_forward": [round(x, 3) for x in p["v"]],
            "v5_saved_head": [round(x, 3) for x in v5_head[p["id"]]],
            "actual_next_season": q["season"],
            "actual_next": [round(x, 3) for x in q["v"]],
        })

    data = {
        "stats": STATS, "plain": PLAIN,
        "units": "Per-100-possession stats, z-scored within each season: "
                 "0 = an average player-season that year, +1 = one standard "
                 "deviation above average, -1 = one below. A forecast is a "
                 "predicted z for NEXT season, on the same scale.",
        "framing": "PREDICTION-FIRST DRAFT — user-directed, pending panel "
                   "ratification (CONTRACT §11 HOLD). Headline = predicted "
                   "future stat line, not twins. Twins remain a product "
                   "surface and secondary validation only.",
        "players": players_out, "steers": steers_out,
        "validation": validation,
        "provenance": {
            "vectors": "assets/vectors.json, 12,966 rows, row master by person_id",
            "heads": "assets/mtnn_heads.f32, 12,966x45, next-profile = columns "
                     "31:45 ([arch 8 | skills 18 | position 5 | next 14])",
            "v5_head_runnable": False,
            "v5_head_why_not_runnable": "Saved file holds frozen per-row head "
                "OUTPUTS, not weights. No v5 checkpoint (.pt) is saved in "
                "the repo, and the saved mtnn.onnx is a different 119->48 "
                "model (contract honesty ban). With no weights there is no "
                "model to feed a steered input through, so steering is "
                "computed from transparent baselines below, never presented "
                "as a model prediction.",
            "steering_method": "Baseline forecast (age-curve) + sum over "
                "active steers of (slider_z * slope vector). Slider at +100 "
                "= driver +1.0 z above the baseline change; -100 = -1.0 z. "
                "Reference lines (carry-forward, v5 saved head, actual next) "
                "do NOT move when you steer.",
            "omitted_steers": "New-team steering is OMITTED: team is not in "
                "the 14-d stat vector and no team-change effect was "
                "estimated from these assets, so any team effect shown "
                "would be invented. SAE steering and JEPA predictions are "
                "v1 notes only, never shown as working.",
        },
    }
    (HERE / "data.json").write_text(json.dumps(data, indent=2))
    (HERE / "data.js").write_text(
        "window.FUTURE_EXPLORER_DATA = " + json.dumps(data) + ";\n")

    # Success test: Curry 2016-17, more-threes slider at +100 (+1.0 z FG3A).
    curry = players_out[0]
    threes = steers_out[0]
    steered = [curry["baseline_age_curve"][j] + threes["slopes"][j]
               for j in range(14)]
    print("pairs:", len(pairs))
    print("MAE carry-forward %.4f  age-curve %.4f  v5-head %.4f"
          % (validation["mae_carry_forward_z"], validation["mae_age_curve_z"],
             validation["mae_v5_saved_head_z"]))
    print("SUCCESS TEST — Curry 2016-17, More threes +100:")
    for j, name in enumerate(STATS):
        print("  %-10s baseline %6.2f -> steered %6.2f  (delta %+0.2f)"
              % (name, curry["baseline_age_curve"][j], steered[j],
                 steered[j] - curry["baseline_age_curve"][j]))
    assert steered[STATS.index("FG3A")] > curry["baseline_age_curve"][STATS.index("FG3A")]
    print("wrote data.json + data.js")
    return 0


if __name__ == "__main__":
    sys.exit(main())

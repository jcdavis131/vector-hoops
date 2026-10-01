#!/usr/bin/env python3
"""
pergame_convert.py — calibrate arc-forecast z-scores to per-game priors.

The arc forecaster predicts era-honest z-scored per-100 features. PrizePicks
prices per-game lines, so this script learns an empirical z -> per-game
mapping from 2025-26 real data (vectors.json z-scores joined to
Basketball-Reference game-log per-game averages) and applies it to the
2026-27 forecasts.

This absorbs all unit/scale quirks of the source data into one documented,
data-driven calibration instead of hand-derived pace math.

Usage:
    python3 pergame_convert.py [--forecasts PATH] [--out PATH]

Output: assets/arc_priors_2026-27.json — per-game priors per person_id.
"""

from __future__ import annotations
import argparse
import json
import re
from pathlib import Path
from collections import defaultdict
import numpy as np

FEATURES = [
    "PTS",
    "AST",
    "OREB",
    "DREB",
    "STL",
    "BLK",
    "TOV",
    "FG3A",
    "FGA",
    "FTA",
    "FG3_PCT",
    "FG_PCT",
    "FT_PCT",
    "PLUS_MINUS",
]
FIDX = {f: i for i, f in enumerate(FEATURES)}

# stat -> (game_log fields to sum, z feature expr)
STAT_MAP = {
    "pts": (["pts"], [("PTS", 1.0)]),
    "trb": (["trb"], [("OREB", 1.0), ("DREB", 1.0)]),
    "ast": (["ast"], [("AST", 1.0)]),
    "stl": (["stl"], [("STL", 1.0)]),
    "blk": (["blk"], [("BLK", 1.0)]),
    "tp": (["tp"], [("FG3A", 1.0), ("FG3_PCT", 1.0)]),  # 3pm ~ volume x accuracy
}
# stats fit with one slope per z-feature (lets OREB/DREB differ for trb)
MULTI_FIT = {"trb", "tp"}


def norm_name(s: str) -> str:
    import unicodedata

    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = s.lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\.?$", "", s).strip()
    return re.sub(r"[^a-z]", "", s)


def load_game_log_avgs(log_dir: Path, season: str):
    """bref_id -> {stat: per-game avg} for the given season."""
    agg = defaultdict(lambda: defaultdict(float))
    n = defaultdict(int)
    for fp in log_dir.glob("*.json"):
        if fp.name.startswith("_"):
            continue
        try:
            games = json.loads(fp.read_text())
        except Exception:
            continue
        if not games or not isinstance(games, list):
            continue
        for g in games:
            if g.get("season") != season or g.get("dnp"):
                continue
            bid = g["bref_id"]
            n[bid] += 1
            for k in ["mp", "pts", "trb", "ast", "stl", "blk", "tp"]:
                agg[bid][k] += float(g.get(k) or 0)
    return {
        bid: {k: v / n[bid] for k, v in vals.items()}
        for bid, vals in agg.items()
        if n[bid] >= 10
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--forecasts", default=None)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    root = Path(__file__).resolve().parents[2]
    props = Path("/home/hatch/workspace/nba-props")
    fc_path = Path(args.forecasts or root / "assets" / "arc_forecasts_v1.json")
    out_path = Path(args.out or root / "assets" / "arc_priors_2026-27.json")

    fc = json.loads(fc_path.read_text())
    forecasts = fc["forecasts"]
    vec = json.loads((root / "assets" / "vectors.json").read_text())
    # person_id -> (z14, dataset_mpg, name) for 2025-26
    z26 = {}
    for p in vec["players"]:
        if p["season"] == "2025-26" and p.get("person_id"):
            z26[p["person_id"]] = (
                np.array(p["v"], dtype=float),
                float(p.get("mpg", 0) or 0),
                p["name"],
            )

    # bref_id -> person_id via display-name match on the 2025-26 pool
    bmap = json.loads((props / "data" / "bref_id_map.json").read_text())
    name_to_pid = {}
    for pid, (z, mpg, name) in z26.items():
        name_to_pid[norm_name(name)] = pid
    bid_to_pid = {}
    for norm, info in bmap.items():
        pid = name_to_pid.get(norm_name(info["display"]))
        if pid:
            bid_to_pid[info["bref_id"]] = pid

    avgs = load_game_log_avgs(props / "data" / "game_logs", "2025-26")
    print(
        f"[pergame] 2025-26 game-log players: {len(avgs)}, "
        f"mapped to person_id: {sum(1 for b in avgs if b in bid_to_pid)}"
    )

    # fit per_game = a.z + b per stat on the joined set
    cal = {}
    for stat, (gfields, zexpr) in STAT_MAP.items():
        xs, ys = [], []
        for bid, a in avgs.items():
            pid = bid_to_pid.get(bid)
            if not pid or pid not in z26:
                continue
            z, mpg, _ = z26[pid]
            if stat in MULTI_FIT:
                xs.append([z[FIDX[f]] * c for f, c in zexpr])
            else:
                xs.append([sum(z[FIDX[f]] * c for f, c in zexpr)])
            ys.append(sum(a[f] for f in gfields))
        X = np.array(xs)
        Y = np.array(ys)
        A = np.column_stack([X, np.ones(len(X))])
        coef, *_ = np.linalg.lstsq(A, Y, rcond=None)
        pred = A @ coef
        cal[stat] = {
            "a": [round(float(c), 4) for c in coef[:-1]],
            "b": round(float(coef[-1]), 4),
            "n": len(X),
            "mae": round(float(np.mean(np.abs(pred - Y))), 3),
            "r2": round(float(1 - np.var(Y - pred) / np.var(Y)), 3),
        }
        print(
            f"[pergame] {stat:<4} n={len(X):<4} mae={cal[stat]['mae']:.3f} "
            f"r2={cal[stat]['r2']:.3f}"
        )

    # Minutes prior: the dataset's mpg field is uncorrelated with real minutes
    # (corr ~ 0.0 on the 2025-26 join) — do NOT use it. Use each player's
    # 2025-26 real per-game minutes from game logs directly.
    mpg_real = {}
    for bid, a in avgs.items():
        pid = bid_to_pid.get(bid)
        if pid:
            mpg_real[pid] = round(float(a["mp"]), 1)

    # apply to 2026-27 forecasts
    priors = {}
    for pid, f in forecasts.items():
        z = np.array(f["per100"])
        pg = {}
        for stat, (gfields, zexpr) in STAT_MAP.items():
            c = cal[stat]
            if stat in MULTI_FIT:
                xv = [z[FIDX[fe]] * co for fe, co in zexpr]
            else:
                xv = [sum(z[FIDX[fe]] * co for fe, co in zexpr)]
            pg[stat] = round(float(sum(a * x for a, x in zip(c["a"], xv)) + c["b"]), 2)
        # look up display name from 2025-26 pool (None for retired/historical)
        nm = z26[pid][2] if pid in z26 else None
        priors[pid] = {
            "name": nm,
            "per_game": pg,
            "mpg_prior": mpg_real.get(pid),  # 2025-26 real mpg; None if unmapped
            "gp_est": f["gp_est"],
            "n_seasons": f["n_seasons"],
            "last_season": f["last_season"],
        }

    out = {
        "version": "arc-priors-v1",
        "season": "2026-27",
        "forecaster": fc["version"],
        "forecaster_metrics": fc["metrics"],
        "calibration_season": "2025-26",
        "calibration": cal,
        "note": (
            "Empirical z->per-game mapping fit on 2025-26 real game logs. "
            "Documented approximation; game-level model refines it."
        ),
        "priors": priors,
    }
    out_path.write_text(json.dumps(out))
    n_current = sum(1 for v in priors.values() if v["name"])
    print(
        f"[pergame] wrote {out_path} ({len(priors)} persons, "
        f"{n_current} in 2025-26 pool)"
    )


if __name__ == "__main__":
    main()

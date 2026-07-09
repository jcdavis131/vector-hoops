"""Calibrated prediction intervals for the MTNN's regression heads.

The classification heads (archetype, position) publish a real confidence: the
softmax probability of the predicted class. The regression heads (skills,
next_profile) published nothing comparable. `/model` filled the gap with the
10th-90th percentile of the model's *own predictions* for a player's 24 nearest
embedding neighbours -- which is not uncertainty at all. Neighbours are near
*because* their embeddings agree, so their predictions agree, so that band is
narrow by construction and never touches ground truth.

This exports the honest thing: an **empirical 80% prediction interval**, fitted
on held-out residuals.

Method
------
For each output dimension j:

  1. Take the residuals `r = y - yhat` on the **val** split (seasons 2022-23),
     over rows where that dimension was actually measured.
  2. Bin those rows by the quintile of `yhat` -- uncertainty is not constant
     across the range, and a single marginal band would be too wide in the
     middle and too narrow at the extremes.
  3. Within each bin take the empirical 10th and 90th percentiles of `r`.
     Empirical, so no Gaussian assumption; the interval is calibrated by
     construction on the split it was fitted to.
  4. A bin with fewer than MIN_BIN rows falls back to that dimension's
     marginal quantiles.

The interval for a new prediction is then `[yhat + lo_b, yhat + hi_b]` for the
bin `b` containing `yhat`.

Honesty gate
------------
Quantiles are fitted on **val** and coverage is measured on **test** (2024+),
which the fit never saw. A well-calibrated 80% interval covers ~80% of test
rows. The measured coverage is written into the asset and printed; if it drifts
far from 0.80 the interval is lying and the number says so out loud.

This is a *marginal-per-bin* interval: it reflects how wrong this head usually
is for predictions of this size. It is not a per-player posterior, and it does
not widen when a player's input families are masked. Both limits are carried
into the UI copy.

Run:  python pipeline/export_mtnn_intervals.py
Env:  MTNN_DATA_DIR   override for pipeline/data (needed from a git worktree)
Out:  assets/mtnn_intervals.json
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

DATA = Path(os.environ.get("MTNN_DATA_DIR") or (HERE / "data")).resolve()
ASSETS = HERE.parent / "assets"
CKPT = DATA / "mtnn_best.pt"
OUT = ASSETS / "mtnn_intervals.json"

import train_mtnn as T                  # noqa: E402
import export_mtnn_jacobian as J        # noqa: E402

# The two modules resolve `data/` from their own __file__. From a worktree that
# directory does not exist (it is gitignored), so repoint them at the real one.
T.DATA_DIR = DATA
J.DATA = DATA
J.CKPT = CKPT

LEVEL = 0.80
Q_LO, Q_HI = 0.10, 0.90
N_BINS = 5
MIN_BIN = 60


def _quantile_bins(pred: np.ndarray, n_bins: int) -> np.ndarray:
    """Interior bin edges on the predicted value. Deduped: a head whose
    predictions pile onto one value yields fewer, wider bins rather than
    empty ones."""
    qs = np.linspace(0, 1, n_bins + 1)[1:-1]
    return np.unique(np.quantile(pred, qs)) if len(pred) else np.array([])


def _fit_dim(pred_fit: np.ndarray, resid_fit: np.ndarray) -> dict:
    """Conditional residual quantiles, binned by predicted value."""
    edges = _quantile_bins(pred_fit, N_BINS)
    marg_lo = float(np.quantile(resid_fit, Q_LO))
    marg_hi = float(np.quantile(resid_fit, Q_HI))

    b = np.digitize(pred_fit, edges)
    lo, hi, counts = [], [], []
    for k in range(len(edges) + 1):
        sel = resid_fit[b == k]
        if len(sel) < MIN_BIN:
            lo.append(marg_lo)
            hi.append(marg_hi)
        else:
            lo.append(float(np.quantile(sel, Q_LO)))
            hi.append(float(np.quantile(sel, Q_HI)))
        counts.append(int(len(sel)))
    return {
        "edges": [round(e, 5) for e in edges.tolist()],
        "lo": [round(v, 5) for v in lo],
        "hi": [round(v, 5) for v in hi],
        "fitRows": int(len(resid_fit)),
        "binRows": counts,
    }


def _coverage(spec: dict, pred_ev: np.ndarray, resid_ev: np.ndarray) -> float | None:
    """Share of held-out rows whose true value lands inside the interval."""
    if not len(resid_ev):
        return None
    edges = np.array(spec["edges"], dtype=np.float64)
    b = np.digitize(pred_ev, edges)
    lo = np.array(spec["lo"])[b]
    hi = np.array(spec["hi"])[b]
    return float(np.mean((resid_ev >= lo) & (resid_ev <= hi)))


def build_target(name: str, keys: list[str], units: str,
                 pred: np.ndarray, true: np.ndarray, valid: np.ndarray,
                 split_of: np.ndarray) -> dict:
    """valid[n, k] -> was dim k measured for row n. split_of[n] -> train/val/test."""
    dims = {}
    cov_fit, cov_eval = [], []
    for j, key in enumerate(keys):
        fit = np.where(valid[:, j] & (split_of == "val"))[0]
        ev = np.where(valid[:, j] & (split_of == "test"))[0]
        if len(fit) < MIN_BIN:
            print(f"    ! {name}.{key}: only {len(fit)} val rows — skipped")
            continue
        spec = _fit_dim(pred[fit, j], true[fit, j] - pred[fit, j])
        spec["coverageTest"] = _coverage(spec, pred[ev, j], true[ev, j] - pred[ev, j])
        spec["evalRows"] = int(len(ev))
        dims[key] = spec
        if spec["coverageTest"] is not None:
            cov_eval.append(spec["coverageTest"])
        cov_fit.append(_coverage(spec, pred[fit, j], true[fit, j] - pred[fit, j]))

    return {
        "units": units,
        "keys": [k for k in keys if k in dims],
        "dims": dims,
        "coverageTestMean": round(float(np.mean(cov_eval)), 4) if cov_eval else None,
        "coverageFitMean": round(float(np.mean(cov_fit)), 4) if cov_fit else None,
    }


def main() -> None:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if not CKPT.exists():
        raise SystemExit(f"missing {CKPT} — train first (or set MTNN_DATA_DIR)")
    print(f"device: {device}\ndata:   {DATA}")

    ckpt = torch.load(CKPT, map_location=device, weights_only=False)
    ckpt_fams = J.families_from_ckpt(ckpt["model"])
    npz, manifest, fams, matrix_name = J.load_matrix_for(ckpt_fams)

    Z = npz["Z"].astype(np.float32)
    M = npz["mask"].astype(np.float32)
    seasons = npz["season"]
    names = npz["name"]
    pids = npz["player_id"]

    season_ids = T.season_index(seasons)
    game_cols = T.game_feature_cols(manifest)
    n_skills = sum(1 for k in ckpt["model"]
                   if k.startswith("skill_towers.towers.") and k.endswith(".0.weight"))

    model = J.build_model(ckpt, {f: len(c) for f, c in fams.items()},
                          int(season_ids.max()) + 1, len(game_cols), n_skills, device)
    xs, ms = T.split_by_family(Z, M, fams, device)
    seas = torch.tensor(season_ids, device=device)

    t0 = time.time()
    with torch.no_grad():
        emb = model.encode(xs, ms, seas)
        heads = J.head_outputs(model, emb)
    print(f"forward: {len(Z)} rows in {time.time() - t0:.1f}s")

    split_of = np.array([T.eval_split(str(s)) for s in seasons])
    targets: dict = {}

    # ---- skills: grade points 0-100, per-skill coverage (wide skills 2015-16+)
    if "skills" in heads:
        skill_g, skill_m, skill_keys, _n_core = T.load_skill_labels(names, seasons)
        skill_pred = heads["skills"].cpu().numpy().astype(np.float64) * 100.0
        skill_true = skill_g.astype(np.float64) * 100.0
        targets["skills"] = build_target(
            "skills", skill_keys, "grade points (0-100)",
            skill_pred, skill_true, skill_m > 0, split_of)

    # ---- next_profile: z within the TARGET season, so it splits on the target's
    #      season — matching train_mtnn.next_profile_holdout_metrics.
    pairs = T.adjacent_season_pairs(pids, seasons, names)
    pair_arr = np.array(pairs) if pairs else np.zeros((0, 2), int)
    next_idx = T.next_season_index(len(Z), pair_arr)
    valid_row = next_idx >= 0

    next_pred = heads["next_profile"].cpu().numpy().astype(np.float64)
    next_true = np.zeros_like(next_pred)
    next_true[valid_row] = Z[next_idx[valid_row]][:, game_cols]

    next_split = np.full(len(next_idx), "", dtype=object)
    next_split[valid_row] = np.array(
        [T.eval_split(str(s)) for s in seasons[next_idx[valid_row]]])

    game_keys = [manifest["features"][j] for j in game_cols]
    targets["next_profile"] = build_target(
        "next_profile", game_keys, "z within the target season",
        next_pred, next_true,
        np.repeat(valid_row[:, None], len(game_keys), axis=1), next_split)

    st = CKPT.stat()
    out = {
        "built": time.strftime("%Y-%m-%d"),
        "model": ckpt.get("args", {}).get("fusion", "concat"),
        "checkpoint": {"mtime": int(st.st_mtime), "bytes": int(st.st_size)},
        "matrix": matrix_name,
        "rows": int(len(Z)),
        "level": LEVEL,
        "bins": N_BINS,
        "fitSplit": "val (2022-23)",
        "evalSplit": "test (2024+)",
        "method": ("Empirical 80% prediction interval. Residuals y-yhat on the val "
                   "split, binned by the quintile of yhat; the 10th/90th percentile "
                   "within each bin. Coverage is measured on the test split, which "
                   "the fit never saw."),
        "limits": ("A marginal-per-bin interval: how wrong this head usually is for "
                   "predictions of this size. Not a per-player posterior, and it does "
                   "not widen when a player's input families are masked."),
        "targets": targets,
    }
    OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")

    print(f"\nwrote {OUT.name} ({OUT.stat().st_size / 1024:.1f} KB)")
    for name, spec in targets.items():
        print(f"  {name:<13} dims={len(spec['keys']):<3} "
              f"coverage fit={spec['coverageFitMean']} test={spec['coverageTestMean']}")


if __name__ == "__main__":
    main()

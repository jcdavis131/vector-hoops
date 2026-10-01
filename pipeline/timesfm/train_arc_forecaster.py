#!/usr/bin/env python3
"""
Arc Forecaster v1 — career-arc ridge regression on person_id trajectories.

Trains a multivariate ridge model that predicts a player's next-season stat
line from their career arc. Trajectories are keyed by person_id (never display
name) — this is the first forecaster trained on identity-clean arcs.

Zero-deps (numpy only), deterministic, CPU-friendly.

Usage:
    python3 train_arc_forecaster.py [--vectors PATH] [--identity PATH] [--out PATH]

End to end: loads vectors.json -> builds person arcs -> featurizes ->
tunes ridge alpha on validation -> retrains -> evaluates vs baselines on the
held-out test split -> writes the versioned forecast artifact (or hard-fails
the win gate).
"""
from __future__ import annotations
import argparse
import hashlib
import json
import sys
import time
from pathlib import Path
import numpy as np

FEATURES = ['PTS', 'AST', 'OREB', 'DREB', 'STL', 'BLK', 'TOV', 'FG3A',
            'FGA', 'FTA', 'FG3_PCT', 'FG_PCT', 'FT_PCT', 'PLUS_MINUS']
N_F = len(FEATURES)  # 14
# Props-weighted MAE: scoring/playmaking/rebounding/defense emphasis
W_PROPS = np.array([3.0, 2.0, 1.0, 1.0, 1.5, 1.5, 1.0, 1.5,
                    1.0, 1.0, 1.0, 1.0, 1.0, 1.0])
W_PROPS = W_PROPS / W_PROPS.sum()

ALPHAS = [0.01, 0.1, 1.0, 10.0, 100.0, 1000.0]
CTX_MAX = 6  # cap context at 6 most recent seasons


def season_year(s: str) -> int:
    return int(s.split('-')[0])


def load_players(vectors_path: Path):
    d = json.loads(vectors_path.read_text())
    players = d['players']
    assert d['features'] == FEATURES, "feature order changed — refusing to train"
    rows = []
    for p in players:
        pid = p.get('person_id')
        assert pid, f"row {p.get('id')} missing person_id — identity gate failed"
        v = p.get('v')
        assert v is not None and len(v) == N_F, f"row {p.get('id')} bad vector"
        rows.append((pid, p['season'], season_year(p['season']),
                     np.array(v, dtype=np.float64),
                     float(p.get('mpg', 0.0)), float(p.get('gp', 0.0)),
                     p.get('name', '')))
    return rows


def build_arcs(rows):
    """person_id -> chronological list of (year, vec14, mpg, gp)."""
    arcs = {}
    for pid, season, year, vec, mpg, gp, name in rows:
        arcs.setdefault(pid, []).append((year, season, vec, mpg, gp, name))
    for pid in arcs:
        arcs[pid].sort(key=lambda t: (t[0], t[1]))
        # hard fail on duplicate person|season (identity collision residue)
        seen = set()
        for year, season, *_ in arcs[pid]:
            assert season not in seen, f"duplicate {pid}|{season}"
            seen.add(season)
    return arcs


def featurize(ctx):
    """ctx: list of (vec14, mpg, gp), oldest->newest, len>=1. -> 76-d x."""
    vecs = [c[0] for c in ctx]
    last1 = vecs[-1]
    last2 = vecs[-2] if len(vecs) >= 2 else np.zeros(N_F)
    last3 = vecs[-3] if len(vecs) >= 3 else np.zeros(N_F)
    has2 = 1.0 if len(vecs) >= 2 else 0.0
    has3 = 1.0 if len(vecs) >= 3 else 0.0
    # recency-weighted 3yr mean over available seasons
    w = np.array([0.5, 0.3, 0.2][:len(vecs)][::-1] if len(vecs) <= 3
                 else [0.5, 0.3, 0.2])
    take = vecs[-3:]
    w = w[-len(take):]
    w = w / w.sum()
    wavg = sum(wi * v for wi, v in zip(w, take))
    career_year = float(len(ctx))
    momentum = last1 - last2  # zeros when no last2 (has2 flag covers it)
    mpg_last = float(ctx[-1][1])
    gp_last = float(ctx[-1][2])
    return np.concatenate([last1, last2, [has2], last3, [has3], wavg,
                           [career_year, career_year ** 2], momentum,
                           [mpg_last, gp_last]])


def build_pairs(arcs):
    """-> list of (x, y16, target_year, person_id). y = 14 feats + mpg + gp."""
    pairs = []
    for pid, traj in arcs.items():
        for i in range(1, len(traj)):
            ctx = [(t[2], t[3], t[4]) for t in traj[max(0, i - CTX_MAX):i]]
            x = featurize(ctx)
            tgt = traj[i]
            y = np.concatenate([tgt[2], [tgt[3], tgt[4]]])
            pairs.append((x, y, tgt[0], pid))
    return pairs


def ridge_fit(X, Y, alpha):
    n = X.shape[1]
    A = X.T @ X + alpha * np.eye(n)
    return np.linalg.solve(A, X.T @ Y)


def mae(a, b):
    return float(np.mean(np.abs(a - b)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--vectors', default=None)
    ap.add_argument('--identity', default=None)
    ap.add_argument('--out', default=None)
    args = ap.parse_args()

    root = Path(__file__).resolve().parents[2]
    vectors_path = Path(args.vectors or root / 'assets' / 'vectors.json')
    identity_path = Path(args.identity or root / 'assets' / 'player-identity.json')
    out_path = Path(args.out or root / 'assets' / 'arc_forecasts_v1.json')

    t0 = time.time()
    rows = load_players(vectors_path)
    arcs = build_arcs(rows)
    n_persons = len(arcs)
    pairs = build_pairs(arcs)
    print(f"[arc] persons={n_persons} pairs={len(pairs)}", flush=True)

    X = np.stack([p[0] for p in pairs])
    Y = np.stack([p[1] for p in pairs])
    years = np.array([p[2] for p in pairs])

    tr = years <= 2021
    va = (years == 2022) | (years == 2023)
    te = years >= 2024
    print(f"[arc] split train={tr.sum()} val={va.sum()} test={te.sum()}", flush=True)
    assert tr.sum() > 0 and va.sum() > 0 and te.sum() > 0, "empty split — abort"

    # standardize X on train; standardize Y on train (for stable ridge)
    x_mu, x_sd = X[tr].mean(0), X[tr].std(0) + 1e-8
    y_mu, y_sd = Y[tr].mean(0), Y[tr].std(0) + 1e-8
    Xs = (X - x_mu) / x_sd
    Ys = (Y - y_mu) / y_sd

    def predict(W, Xi):
        return (Xi - x_mu) / x_sd @ W * y_sd + y_mu

    # --- tune alpha on validation (macro-MAE over 14 features) ---
    best = None
    for alpha in ALPHAS:
        W = ridge_fit(Xs[tr], Ys[tr], alpha)
        pred = predict(W, X[va])
        m = mae(pred[:, :N_F], Y[va][:, :N_F])
        print(f"[arc] alpha={alpha:<8} val_macro_mae={m:.4f}", flush=True)
        if best is None or m < best[1]:
            best = (alpha, m)
    alpha_star = best[0]
    print(f"[arc] chosen alpha={alpha_star}", flush=True)

    # --- retrain on train+val ---
    trva = tr | va
    W = ridge_fit(Xs[trva], Ys[trva], alpha_star)

    # --- test evaluation ---
    pred_te = predict(W, X[te])
    Y_te = Y[te]
    test_macro = mae(pred_te[:, :N_F], Y_te[:, :N_F])
    test_props = float((np.abs(pred_te[:, :N_F] - Y_te[:, :N_F]) * W_PROPS).sum(axis=1).mean())
    print(f"[arc] TEST challenger macro_mae={test_macro:.4f} props_mae={test_props:.4f}", flush=True)

    # --- baselines on the same clean test split ---
    # naive_last: repeat most recent season's features
    # avg3: recency-weighted 3yr mean
    # lite_clean: incumbent TimesFM-lite idea (fixed temporal weights + LS
    #             cross-variate mix), reimplemented on clean person_id arcs
    bl = {'naive_last': [], 'avg3': [], 'lite_clean': []}
    w_temp = np.array([0.2, 0.3, 0.5])
    # fit lite_clean's mixing matrix on train pairs with >=3 ctx seasons
    Xl, Yl = [], []
    for pid, traj in arcs.items():
        vecs = np.stack([t[2] for t in traj])
        yrs = [t[0] for t in traj]
        for i in range(3, len(vecs)):
            if yrs[i] <= 2021:  # train-only fit
                Xl.append(vecs[i - 3:i].T)  # (14,3)
                Yl.append(vecs[i])
    Xl = np.array(Xl)
    Yl = np.array(Yl)
    Xl_proj = np.tensordot(Xl, w_temp, axes=([2], [0]))
    W_var, _, _, _ = np.linalg.lstsq(Xl_proj, Yl, rcond=None)

    for idx in np.where(te)[0]:
        x, y, yr, pid = pairs[idx]
        traj = arcs[pid]
        # find target position in traj
        ti = next(i for i, t in enumerate(traj) if t[0] == yr
                  and np.allclose(t[2], y[:N_F]))
        prev = [t[2] for t in traj[:ti]]
        bl['naive_last'].append(prev[-1])
        k = min(3, len(prev))
        w = np.array([0.5, 0.3, 0.2][-k:])
        w = w / w.sum()
        bl['avg3'].append(sum(wi * v for wi, v in zip(w, prev[-k:])))
        if len(prev) >= 3:
            ctx = np.stack(prev[-3:]).T
            bl['lite_clean'].append(ctx @ w_temp @ W_var)
        else:
            bl['lite_clean'].append(prev[-1])  # fallback for short arcs

    results = {'challenger': {'macro_mae': test_macro, 'props_mae': test_props}}
    win = True
    for name, preds in bl.items():
        P = np.stack(preds)
        m_macro = mae(P, Y_te[:, :N_F])
        m_props = float((np.abs(P - Y_te[:, :N_F]) * W_PROPS).sum(axis=1).mean())
        results[name] = {'macro_mae': m_macro, 'props_mae': m_props}
        print(f"[arc] TEST baseline {name:<10} macro_mae={m_macro:.4f} props_mae={m_props:.4f}", flush=True)
        if not (test_macro < m_macro and test_props < m_props):
            win = False

    print(f"[arc] WIN GATE: {'PASS' if win else 'FAIL'}", flush=True)
    if not win:
        print("[arc] challenger did not beat all baselines — no artifact written.",
              flush=True)
        sys.exit(2)

    # --- prod artifact: 2026-27 forecasts for every person with >=1 season ---
    forecasts = {}
    for pid, traj in arcs.items():
        ctx = [(t[2], t[3], t[4]) for t in traj[-CTX_MAX:]]
        x = featurize(ctx)
        yhat = predict(W, x.reshape(1, -1))[0]
        yhat = np.where(np.isnan(yhat), 0.0, yhat)  # QA: no NaNs escape
        forecasts[pid] = {
            'per100': [round(float(v), 4) for v in yhat[:N_F]],
            'mpg': round(float(yhat[N_F]), 2),
            'gp_est': round(float(np.clip(yhat[N_F + 1], 0, 82)), 1),
            'n_seasons': len(traj),
            'last_season': traj[-1][1],
        }

    def sha(p):
        return hashlib.sha256(Path(p).read_bytes()).hexdigest()[:12]

    artifact = {
        'version': 'arc-ridge-v1',
        'model': 'ridge(alpha=%s) on 76-d career-arc features, numpy closed-form' % alpha_star,
        'season': '2026-27',
        'trained_on': {
            'vectors.json': sha(vectors_path),
            'player-identity.json': sha(identity_path),
            'n_persons': n_persons,
            'n_pairs': len(pairs),
        },
        'split': 'train target<=2021 / val 2022-2023 / test >=2024 (chronological)',
        'features': FEATURES,
        'metrics': results,
        'win': True,
        'elapsed_s': round(time.time() - t0, 1),
        'forecasts': forecasts,
    }
    out_path.write_text(json.dumps(artifact))
    print(f"[arc] wrote {out_path} ({len(forecasts)} forecasts, "
          f"{out_path.stat().st_size / 1e6:.1f} MB)", flush=True)


if __name__ == '__main__':
    main()

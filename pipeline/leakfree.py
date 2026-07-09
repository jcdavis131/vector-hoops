"""Leak-free (inductive) evaluation protocol for MTNN model selection.

Why this exists
---------------
The legacy training loop iterated all 12,966 rows with no split filter, so:
  * every held-out InfoNCE pair (761 val + 790 test) was a TRAINING positive;
  * every held-out next-season target was a TRAINING regression target;
  * k-means archetype labels were fit over all rows (incl. test) and the model
    was trained to classify them, while purity@20 scored neighbor agreement on
    those same labels.
Result: recall@10, next-profile RMSE and purity@20 all measured memorization,
not generalization — which is why they were saturated and insensitive to
architecture.

This module supplies an inductive protocol: supervision comes ONLY from
train-split rows. Val/test rows are still encoded (the encoder generalizes),
but never supervise anything. Use it for ablation / model selection.

The shipped product embedding may remain transductive by design (the site is
an atlas over all player-seasons); this is the measurement device, not the
production recipe.

Splits (train_mtnn.eval_split, by the row's own season):
    train: season start year <= 2021
    val:   2022, 2023
    test:  >= 2024
"""
from __future__ import annotations

import hashlib

import numpy as np

import train_mtnn as T


def row_split(seasons) -> np.ndarray:
    """Split label for each row, keyed on that row's own season (temporal)."""
    return np.array([T.eval_split(str(s)) for s in seasons], dtype=object)


def player_split(names, seed: int = 7, val_frac: float = 0.10,
                 test_frac: float = 0.10) -> np.ndarray:
    """Assign each PLAYER (all his seasons) to one split, deterministically.

    Why not the temporal split for model selection:
      * era-gated towers (tracking 2013-14+, form/competition/roster) cover
        only ~20-37% of train rows but ~65-100% of val/test rows — a large
        covariate shift that confounds any architecture comparison;
      * 771 adjacent-season pairs straddle the split and must be discarded;
      * the 4 held-out seasons never appear in training, so their rows of
        `season_emb` stay at random init and are used at eval.

    Grouping by player removes all three: coverage parity across splits, zero
    cross-split pairs (a player's seasons are always together), and every
    season seen during training.

    Trade-off: this measures generalization to an UNSEEN PLAYER, not temporal
    forecasting. Use `row_split` when the claim is "predicts the future".
    """
    out = np.empty(len(names), dtype=object)
    for i, n in enumerate(names):
        h = hashlib.md5(f"{seed}:{n}".encode("utf-8")).hexdigest()
        u = int(h[:8], 16) / 0xFFFFFFFF
        out[i] = "test" if u < test_frac else (
            "val" if u < test_frac + val_frac else "train")
    return out


def build_split(names, seasons, mode: str = "player", seed: int = 7) -> np.ndarray:
    if mode == "temporal":
        return row_split(seasons)
    if mode == "player":
        return player_split(names, seed=seed)
    raise ValueError(f"unknown split mode: {mode}")


def train_mask(seasons) -> np.ndarray:
    """Back-compat: temporal train mask."""
    return row_split(seasons) == "train"


def pairs_in_split(pair_arr: np.ndarray, split: np.ndarray, which: str) -> np.ndarray:
    """Pairs whose BOTH endpoints lie in `which`."""
    if len(pair_arr) == 0:
        return pair_arr
    a, b = pair_arr[:, 0], pair_arr[:, 1]
    keep = (split[a] == which) & (split[b] == which)
    return pair_arr[keep] if keep.any() else np.zeros((0, 2), int)


def restrict_next_idx_split(next_idx: np.ndarray, split: np.ndarray,
                            which: str = "train") -> np.ndarray:
    """Blank next-season targets unless source AND target are in `which`."""
    out = np.full_like(next_idx, -1)
    valid = next_idx >= 0
    src = np.arange(len(next_idx))
    ok = np.zeros(len(next_idx), dtype=bool)
    ok[valid] = (split[src[valid]] == which) & (split[next_idx[valid]] == which)
    out[ok] = next_idx[ok]
    return out


def next_profile_metrics(pred: np.ndarray, target: np.ndarray,
                         next_idx: np.ndarray, split: np.ndarray,
                         feature_names: list[str]) -> dict:
    """Held-out next-season regression, scored by the TARGET row's split."""
    out: dict = {}
    valid = next_idx >= 0
    for s in ("val", "test"):
        rows = np.where(valid & (split[np.where(valid, next_idx, 0)] == s))[0]
        rows = np.array([i for i in rows if next_idx[i] >= 0], dtype=int)
        if len(rows) == 0:
            out[s] = None
            continue
        y = target[next_idx[rows]]
        p = pred[rows]
        resid = y - p
        ss_tot = float(((y - y.mean(axis=0, keepdims=True)) ** 2).sum())
        out[s] = {
            "rows": int(len(rows)),
            "mae_z": round(float(np.abs(resid).mean()), 4),
            "rmse_z": round(float(np.sqrt((resid ** 2).mean())), 4),
            "r2": round(1.0 - float((resid ** 2).sum()) / max(ss_tot, 1e-9), 4),
        }
    return out


def leakfree_clusters(Zg: np.ndarray, is_train: np.ndarray, k: int = 8,
                      seed: int = 7, iters: int = 40) -> np.ndarray:
    """k-means fit on TRAIN rows only, then assign every row to a centroid.

    Mirrors build_vectors.py (K=8, rng(7), 40 Lloyd iterations, on the 14
    game dims) but never lets val/test rows move a centroid.
    """
    rng = np.random.default_rng(seed)
    Zt = Zg[is_train]
    cent = Zt[rng.choice(len(Zt), k, replace=False)].copy()
    for _ in range(iters):
        lab = ((Zt[:, None, :] - cent[None]) ** 2).sum(-1).argmin(1)
        for j in range(k):
            if (lab == j).any():
                cent[j] = Zt[lab == j].mean(0)
    return ((Zg[:, None, :] - cent[None]) ** 2).sum(-1).argmin(1).astype(np.int64)


def restrict_pairs(pair_arr: np.ndarray, is_train: np.ndarray) -> np.ndarray:
    """Keep only adjacent-season pairs whose BOTH endpoints are train rows."""
    if len(pair_arr) == 0:
        return pair_arr
    a, b = pair_arr[:, 0], pair_arr[:, 1]
    keep = is_train[a] & is_train[b]
    return pair_arr[keep] if keep.any() else np.zeros((0, 2), int)


def restrict_next_idx(next_idx: np.ndarray, is_train: np.ndarray) -> np.ndarray:
    """Blank out next-season targets unless source AND target are train rows."""
    out = np.full_like(next_idx, -1)
    valid = next_idx >= 0
    src = np.arange(len(next_idx))
    ok = np.zeros(len(next_idx), dtype=bool)
    ok[valid] = is_train[src[valid]] & is_train[next_idx[valid]]
    out[ok] = next_idx[ok]
    return out


def purity_at_20(E: np.ndarray, clusters: np.ndarray, seasons,
                 sample_rows: np.ndarray, k: int = 20,
                 n_sample: int = 400) -> float | None:
    """Cross-era archetype neighbor purity, restricted to `sample_rows`.

    Same math as train_mtnn.cross_era_archetype_purity but lets us score only
    held-out rows instead of a corpus-wide sample dominated by train rows.
    """
    yr = np.array([int(str(s)[:4]) for s in seasons])
    rng = np.random.default_rng(7)
    cand = np.asarray([i for i in sample_rows if clusters[i] >= 0], dtype=int)
    if len(cand) == 0:
        return None
    sample = rng.choice(cand, min(n_sample, len(cand)), replace=False)
    out = []
    for i in sample:
        sims = E @ E[i]
        sims[i] = -np.inf
        top = np.argpartition(-sims, k)[:k]
        cross = top[yr[top] != yr[i]]
        if len(cross) == 0:
            continue
        out.append(float((clusters[cross] == clusters[i]).mean()))
    return float(np.mean(out)) if out else None


def audit(seasons, pair_arr: np.ndarray, next_idx: np.ndarray) -> dict:
    """Quantify what the legacy protocol leaked."""
    is_train = train_mask(seasons)
    split = row_split(seasons)
    valid = next_idx >= 0
    tgt_split = np.full(len(next_idx), "", dtype=object)
    tgt_split[valid] = split[next_idx[valid]]
    return {
        "rows_total": int(len(seasons)),
        "rows_train": int(is_train.sum()),
        "rows_val": int((split == "val").sum()),
        "rows_test": int((split == "test").sum()),
        "pairs_total": int(len(pair_arr)),
        "pairs_train_only": int(len(restrict_pairs(pair_arr, is_train))),
        "leaked_pair_positives": int(len(pair_arr) - len(restrict_pairs(pair_arr, is_train))),
        "leaked_next_targets_val": int((tgt_split == "val").sum()),
        "leaked_next_targets_test": int((tgt_split == "test").sum()),
    }

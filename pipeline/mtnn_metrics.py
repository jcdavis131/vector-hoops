"""The numpy code that defines the MTNN's headline numbers, with no torch import.

Why a module of its own (2026-10-09). Held-out recall@10, cross-era purity@20
and the 14-d baseline those feed into CQS were defined inside train_mtnn.py,
which imports torch at module scope, and nothing tested them: a grep over
pipeline/test_*.py and tests/ for eval_split, adjacent_season_pairs,
recall_at_k or cross_era_archetype_purity matched only comments
[tests#7, training#13]. A refactor of the split cutoffs or the pair keying
would have changed every recorded number with no failing test.

The function bodies are moved here unchanged (recall_at_k gained a
docstring). train_mtnn imports them back under the same names, so
`train_mtnn.recall_at_k` and the other
`T.<name>` uses in ablate_v5, leakfree, sweep_v5 and score_mtnn_validation
keep working. tests/test_mtnn_metrics.py pins each one on hand-computed
inputs.

recall_at_k draws its 500-pair subsample from the GLOBAL numpy RNG. That is
deliberate here, not an oversight: it is the protocol every recorded number
was measured under (herdmux baselines.json, composite_score.BASELINE).
train_mtnn seeds that state once with np.random.seed(args.seed) and its
per-epoch np.random.permutation draws from it too, so the subsample depends
on how many epochs and evaluations ran before it, and the MTNN and the 14-d
baseline are scored on different subsets of the test pairs [tests#7].
Changing that changes every recall and CQS on record, so it has to ship as a
protocol change with re-measured anchors. The test that pins the draw makes
such a change visible.
"""

from __future__ import annotations

import itertools
from collections import defaultdict

import numpy as np
from seasons import TRAIN_LAST_START_YEAR, VAL_LAST_START_YEAR


def adjacent_season_pairs(pids, seasons, names=None) -> list[tuple[int, int]]:
    """Same-player adjacent calendar years keyed by stable NBA PLAYER_ID.

    ``names`` is accepted for call-site compatibility but ignored — display
    names collide across distinct careers and break continuity.
    """
    del names  # explicit: do not key careers by display name

    def season_start(s: str) -> int:
        return int(s[:4])

    by_key: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for i, (pid, s) in enumerate(zip(pids, seasons, strict=False)):
        by_key[int(pid)].append((season_start(str(s)), i))
    pairs = []
    for rows in by_key.values():
        rows.sort()
        for (y1, i1), (y2, i2) in itertools.pairwise(rows):
            if y2 - y1 == 1:
                pairs.append((i1, i2))
    return pairs


def next_season_index(n_rows: int, pairs: np.ndarray) -> np.ndarray:
    """Row -> next-season row index (or -1 when unavailable)."""
    nxt = np.full(n_rows, -1, dtype=np.int64)
    for i1, i2 in pairs:
        nxt[int(i1)] = int(i2)
    return nxt


def season_start_year(season: str) -> int:
    return int(str(season)[:4])


def eval_split(season: str) -> str:
    """Held-out split for adjacent-season pairs (target = next season).

    The boundaries (2021 / 2023) are pipeline/seasons.py's, shared with
    build_eval_scoreboard and audit_features.
    """
    y = season_start_year(season)
    if y <= TRAIN_LAST_START_YEAR:
        return "train"
    if y <= VAL_LAST_START_YEAR:
        return "val"
    return "test"


def filter_pairs_by_split(
    pairs: np.ndarray,
    seasons: np.ndarray,
    split: str,
) -> np.ndarray:
    """Keep pairs whose target row (index b) falls in split."""
    if len(pairs) == 0:
        return pairs
    keep = []
    for a, b in pairs:
        if eval_split(str(seasons[b])) == split:
            keep.append((int(a), int(b)))
    return np.array(keep, dtype=int) if keep else np.zeros((0, 2), int)


def recall_at_k(E: np.ndarray, pairs: np.ndarray, k: int = 10) -> float | None:
    """Fraction of sampled pairs (a, b) whose b is in a's top-k by dot product, self excluded.

    Samples min(500, len(pairs)) pairs with one np.random.choice call on the
    global RNG, as the module docstring explains; with fewer than 500 pairs
    every pair is scored and the result does not depend on the RNG. Empty
    pairs return None without drawing.
    """
    if len(pairs) == 0:
        return None
    sample = pairs[np.random.choice(len(pairs), min(500, len(pairs)), replace=False)]
    hits = 0
    for a, b in sample:
        sims = E @ E[a]
        sims[a] = -np.inf
        top = np.argpartition(-sims, k)[:k]
        hits += int(b in top)
    return hits / len(sample)


def transparent_baseline_embeddings(Z: np.ndarray, game_cols: list[int]) -> np.ndarray:
    """L2-normalized 14-d game profile vectors for held-out baseline."""
    G = Z[:, game_cols].astype(np.float64)
    norms = np.linalg.norm(G, axis=1, keepdims=True)
    G = G / np.maximum(norms, 1e-8)
    return G.astype(np.float32)


def cross_era_archetype_purity(
    E: np.ndarray,
    clusters: np.ndarray,
    seasons: np.ndarray,
    k: int = 20,
    n_sample: int = 400,
) -> float | None:
    """Among cross-era neighbors, fraction sharing the same archetype."""
    season_year = np.array([int(str(s)[:4]) for s in seasons])
    rng = np.random.default_rng(7)
    candidates = np.where(clusters >= 0)[0]
    if len(candidates) < n_sample:
        return None
    sample = rng.choice(candidates, min(n_sample, len(candidates)), replace=False)
    purities = []
    for i in sample:
        sims = E @ E[i]
        sims[i] = -np.inf
        top = np.argpartition(-sims, k)[:k]
        cross = top[season_year[top] != season_year[i]]
        if len(cross) == 0:
            continue
        purities.append(float((clusters[cross] == clusters[i]).mean()))
    return float(np.mean(purities)) if purities else None

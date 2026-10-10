"""CQS v2: a composite scored on held-out rows only, each component against a free baseline.

Computed beside v1 (composite_score.py), never instead of it. train_mtnn.py
writes it to report["composite_v2"] after the v1 report is complete, and
pipeline/eval_v2.py recomputes it from a report, an embedding npz and the
matrix. Nothing reads it to decide anything yet: the weights below are a
proposal for the operator to ratify, and v1 stays the number the climb and
promote.py judge.

Why v1 needs a second opinion (each measured on this box, 2026-10-09):
  * Four v1 components, 0.34 of the weight, are scored over every row, 85% of
    them rows the loss trained on [eval#3, training#3]. On the 08-07
    pipeline/data/embedding_v3.npz archetype top-1 is 0.9745 on train rows
    and 0.8779 on test rows.
  * Same-player recall@10 can be had without a model. Cosine nearest
    neighbour over 7 career-constant draft/body columns (IDENTITY_FEATURES)
    gives exhaustive test recall@10 0.9025 against the same embedding's
    0.8304 [features#1].
  * The next-season head has no persistence baseline. Copying this season
    forward gives test R2 0.4998, and 14 per-feature shrink factors fit on
    train pairs give R2 0.5802 / MAE 0.4637 [critic#0].
  * purity@20's labels are k-means over the 14 game input columns, so the raw
    input wins by construction: held-out purity is 0.734 for the raw 14-d
    vector and 0.688 for the embedding (train-only labels) [eval#4].
  * skills_r2 and aux_r2 score rebuilding inputs. The build_skills formula
    over the input columns reproduces every core skill grade at R2 1.0000,
    and every aux target is itself an input column [critic#1].
  * margin_14d is 1.0 on every report on record [eval#9], and test recall
    comes from a 500-of-790 subsample drawn from the global RNG [eval#8].
  * A missing v1 component scores 0.0 and reads as a bad model [eval#10].
  * Every held-out row is a fully observed 2023+ row, while 53% of served
    rows (1996-2012) have 58 columns that were never recorded [critic#2].

What v2 does about each:
  * Every component is scored on held-out rows or pairs only, all of them:
    no subsample, so no RNG. Ranks are exhaustive and pessimistic on ties
    (the build_eval_scoreboard.retrieval_ranks rule), so a tie never helps.
  * Recall and the regime slice score against max(transparent 14-d, identity
    lookup); the next-season head against the better of raw and shrunk
    persistence. See centered() for the scale.
  * Archetype labels come from k-means fit on train rows only, matched to the
    stored label ids on train rows [features#10]; archetype and position
    top-1 are scored on held-out rows only [eval#3].
  * purity, skills_r2, aux_r2 and v1's margin_14d are diagnostics with their
    baselines or ceilings beside them, and carry no weight.
  * A component that cannot be computed is None, listed in
    components_missing with the reason, and leaves cqs_v2 None. 0.0 never
    stands in for missing.

The test split is scored (cqs_v2), as v1 scores test. The same components
on the val split give cqs_v2_val. Val has never been used to select
anything, so it is the clean split for a climb that wants to stop selecting
on test [eval#5]; switching is the operator's decision.

Pure numpy. The only randomness is k-means initialisation, drawn from a
local np.random.default_rng(KMEANS_SEED); the global numpy RNG is never
touched (tests/test_composite_v2.py checks np.random.get_state()).
"""

from __future__ import annotations

import itertools
import math
from typing import Any

import numpy as np
from mtnn_metrics import adjacent_season_pairs, eval_split, filter_pairs_by_split, season_start_year

VERSION = "2.0-provisional"

SPLITS = ("val", "test")
SCORED_SPLIT = "test"
K_RECALL = 10
K_PURITY = 20

# Draft slot (three encodings of it: DRAFT_NUMBER and DRAFT_SLOT_Z correlate
# at r = 0.99999, PED_PICK_QUALITY at -0.97), pedigree and body. Within-player
# sd is 0.02-0.11 against a global sd near 1, so they name the player more
# than they describe the season [features#1].
IDENTITY_FEATURES = (
    "DRAFT_NUMBER",
    "DRAFT_SLOT_Z",
    "DRAFT_UNDRAFTED",
    "PED_PICK_QUALITY",
    "PED_EXPECT_SLOT",
    "PED_TEAM_WINPCT",
    "PLAYER_HEIGHT_INCHES",
    "PLAYER_WEIGHT",
)
# DRAFT_UNDRAFTED joined on 2026-10-10 (d1a93955): undrafted used to be an
# observed pick 61 in DRAFT_NUMBER and is now a masked pick plus this flag, so
# without it the lookup would lose the drafted/undrafted split it had. The
# 0.9025 above was measured on the 2026-08-04 matrix with the first 7 columns;
# feature_index skips any name a matrix does not have.

# The regime slice re-encodes held-out anchors as a <=2012 row would look.
# On the 2026-08-04 matrix the per-column observed rate over the 6,928
# <=2012 rows splits cleanly: 58 columns under 1% (tracking 13, playmaking 7,
# defense 6, system 6, form 5, roster 5, team 5, competition 4, injury 4,
# career 3) and nothing else below 25%. The partially observed columns
# (playoffs 0.465, PED_TEAM_WINPCT 0.548, career slopes 0.797) are left as
# they are: masking a random share of rows would need an RNG, and the
# playoff columns are no rarer in the test era (0.445).
REGIME_LAST_YEAR = 2012
REGIME_UNOBSERVED_RATE = 0.01
# regime_component's reason when everything is there but the masked
# re-encode: eval_v2 replaces it with why it had no model.
NO_REENCODE = "no masked re-encode of the held-out anchors (needs the model)"

# The archetype head's classes are build_vectors' K=8 k-means ids.
N_ARCHETYPES = 8
KMEANS_SEED = 7
KMEANS_ITERS = 40

# Each aux head's target column, as train_mtnn.py defines it (a test reads
# the constants out of train_mtnn's source to keep the two in step).
AUX_TARGETS = {
    "team_fit": ("TM_NET_RTG",),
    "roster_lift": ("ROSTER_COMPLEMENT",),
    "career_slope": ("CAREER_SLOPE_3Y", "DELTA_NORM"),  # the second when the first has no observations
    "competition": ("SOS_NET_RTG",),
    "pedigree_expectation": ("PED_PICK_QUALITY",),
    "playoff_riser": ("PO_PTS_DELTA",),
    "honors_recognition": ("HON_ALL_NBA_VOTE_LAG",),
}

# PROVISIONAL weights, for the operator to ratify; nothing gates on them yet.
#   recall     0.30  the product's core claim, same-player continuity, now
#                    credited only beyond what an identity lookup or the raw
#                    14-d profile already retrieves.
#   regime     0.20  the same retrieval when the anchor looks like a
#                    1996-2012 row, the regime the site's past-vs-modern
#                    queries serve and no v1 number measures [critic#2].
#   next_r2    0.15  the one forward-looking prediction, credited beyond
#   next_mae   0.10  persistence. R2 weighs large misses, MAE typical ones.
#   position   0.15  a label from outside the matrix (the listed positions
#                    enrich_vectors joins), though height and weight are
#                    inputs and predict it in part.
#   archetype  0.10  held out and train-only labels, but still a function of
#                    the 14 game inputs (nearest train centroid gets 1.0),
#                    so it is weighted below position.
# Not scored: purity@20 (the raw input beats every embedding on record
# because the labels are k-means on that input), skills_r2 and aux_r2
# (reconstructions of input columns), margin_14d (constant).
WEIGHTS = {
    "recall": 0.30,
    "regime": 0.20,
    "next_r2": 0.15,
    "next_mae": 0.10,
    "position": 0.15,
    "archetype": 0.10,
}

TRANSFORM = (
    "recall, regime, next_r2 and next_mae: centered(value, no_skill, baseline, perfect) maps no skill to 0, "
    "the best free baseline to 0.5 and perfect to 1, linearly between, so 0.5 means 'no better than a lookup "
    "or persistence' and below 0.5 is worse than the free baseline. position and archetype: top-1 accuracy."
)


# ---------------------------------------------------------------------------
# small helpers
# ---------------------------------------------------------------------------


def _r(x: float | None, nd: int = 4) -> float | None:
    """A plain Python float rounded for the report, or None."""
    if x is None:
        return None
    v = float(x)
    return None if math.isnan(v) else round(v, nd)


def _clip01(x: float) -> float:
    return float(max(0.0, min(1.0, x)))


def centered(value: float, *, no_skill: float, baseline: float, perfect: float) -> float:
    """0 at no_skill, 0.5 at the free baseline, 1 at perfect, linear between, clipped to [0, 1].

    Works either way up: for an error (MAE) pass perfect=0 and a larger
    no_skill. A baseline outside [no_skill, perfect] is clamped into it.

    Why not v1's clip01(margin / scale): with the baseline above the model,
    as identity lookup is for recall on every embedding measured so far,
    that clips to a constant 0, the margin_14d defect at the other end
    [eval#9]. Here the score keeps moving below the baseline, and 0.5 says
    exactly where parity is.
    """
    sign = 1.0 if perfect > no_skill else -1.0
    v, b, lo, hi = (sign * float(x) for x in (value, baseline, no_skill, perfect))
    b = min(max(b, lo), hi)
    if v >= b:
        s = 0.5 + 0.5 * (v - b) / (hi - b) if hi > b else 0.5
    else:
        s = 0.5 * (v - lo) / (b - lo) if b > lo else 0.0
    return _clip01(s)


def unit_rows(X: np.ndarray) -> np.ndarray:
    """L2-normalised rows, as mtnn_metrics.transparent_baseline_embeddings does; all-zero rows stay zero."""
    X = np.asarray(X, dtype=np.float64)
    return (X / np.maximum(np.linalg.norm(X, axis=1, keepdims=True), 1e-8)).astype(np.float32)


def pessimistic_ranks(
    queries: np.ndarray,
    gallery: np.ndarray,
    targets: np.ndarray,
    exclude: np.ndarray,
    chunk: int = 256,
) -> np.ndarray:
    """Rank of gallery[targets[i]] for queries[i] among every gallery row but exclude[i]; ties count against.

    The rule of build_eval_scoreboard.retrieval_ranks: rank = rows scoring
    higher + rows tied with the target. Ties are real in the lookup
    baselines: a player's seasons share one identity vector, and every
    all-masked row is the zero vector. Similarities are float64 and a tie is
    any gap under 1e-9, so two bitwise-equal vectors tie even when the
    matrix product sums them in a different order.
    """
    queries = np.asarray(queries, dtype=np.float64)
    gallery_t = np.asarray(gallery, dtype=np.float64).T
    targets = np.asarray(targets, dtype=np.int64)
    exclude = np.asarray(exclude, dtype=np.int64)
    out = np.empty(len(targets), dtype=np.int64)
    for lo in range(0, len(targets), chunk):
        q = queries[lo : lo + chunk]
        sims = q @ gallery_t
        rows = np.arange(len(q))
        target_sim = sims[rows, targets[lo : lo + chunk]].copy()
        sims[rows, exclude[lo : lo + chunk]] = -np.inf
        gap = sims - target_sim[:, None]
        greater = (gap > 1e-9).sum(axis=1)
        ties = (np.abs(gap) <= 1e-9).sum(axis=1) - 1  # minus the target itself
        out[lo : lo + chunk] = greater + np.maximum(ties, 0)
    return out


def recall_from_ranks(ranks: np.ndarray, k: int | None = None) -> float | None:
    k = K_RECALL if k is None else k
    return float((np.asarray(ranks) < k).mean()) if len(ranks) else None


def pair_recall(space: np.ndarray, pairs: np.ndarray, queries: np.ndarray | None = None) -> float | None:
    """Recall@10 over every pair (a, b): is b in the top 10 for a, a itself excluded.

    queries[i] stands in for space[a_i] when given (the regime slice's masked
    anchors); the gallery is always the unmasked space.
    """
    if len(pairs) == 0:
        return None
    a, b = pairs[:, 0], pairs[:, 1]
    q = space[a] if queries is None else queries
    return recall_from_ranks(pessimistic_ranks(q, space, b, a))


def split_pairs(player_id, season) -> dict[str, np.ndarray]:
    """Adjacent-season pairs by the target row's split, as train_mtnn's held_out_recall keys them."""
    pairs = adjacent_season_pairs(player_id, season)
    arr = np.array(pairs, dtype=np.int64) if pairs else np.zeros((0, 2), np.int64)
    return {s: filter_pairs_by_split(arr, np.asarray(season), s) for s in ("train", *SPLITS)}


def feature_index(features: list[str], names) -> list[int]:
    return [features.index(f) for f in names if f in features]


# ---------------------------------------------------------------------------
# recall (and the identity-lookup baseline)
# ---------------------------------------------------------------------------


def recall_component(E, Z, game_cols, identity_cols, pairs_by_split) -> dict:
    """Exhaustive held-out recall@10 against the transparent 14-d and identity-lookup baselines."""
    if not identity_cols:
        return {"missing": "no identity-lookup columns in this matrix, so the recall baseline is incomplete"}
    G = unit_rows(Z[:, game_cols])
    ident = unit_rows(Z[:, identity_cols])
    out: dict = {"measures": {}, "baselines": {}, "scores": {}}
    for s in SPLITS:
        p = pairs_by_split[s]
        r = pair_recall(E, p)
        b14 = pair_recall(G, p)
        bid = pair_recall(ident, p)
        if r is None:
            out["scores"][s] = None
            continue
        best = max(b14, bid)
        out["measures"][s] = {"recall_at_10": _r(r), "pairs": len(p)}
        out["baselines"][s] = {
            "transparent_14d": _r(b14),
            "identity_lookup": _r(bid),
            "best": _r(best),
            "margin": _r(r - best),
        }
        out["scores"][s] = centered(r, no_skill=0.0, baseline=best, perfect=1.0)
    if out["scores"].get(SCORED_SPLIT) is None:
        return {"missing": f"no {SCORED_SPLIT}-split adjacent-season pairs"}
    return out


# ---------------------------------------------------------------------------
# regime-shift slice
# ---------------------------------------------------------------------------


def regime_mask_columns(M: np.ndarray, season, last_year: int = REGIME_LAST_YEAR) -> list[int]:
    """Columns observed in under REGIME_UNOBSERVED_RATE of the rows up to last_year."""
    years = np.array([season_start_year(str(s)) for s in season])
    old = years <= last_year
    if not old.any():
        return []
    rate = np.asarray(M, dtype=np.float64)[old].mean(axis=0)
    return [int(j) for j in np.where(rate < REGIME_UNOBSERVED_RATE)[0]]


def regime_anchor_rows(pairs_by_split) -> np.ndarray:
    """The anchor rows of the val and test pairs: the rows the regime slice re-encodes."""
    parts = [pairs_by_split[s][:, 0] for s in SPLITS if len(pairs_by_split[s])]
    return np.unique(np.concatenate(parts)).astype(np.int64) if parts else np.zeros(0, np.int64)


def regime_component(E, Z, game_cols, identity_cols, pairs_by_split, regime, mask_cols) -> dict:
    """Recall@10 of a masked anchor's embedding against its unmasked next season.

    regime = {"rows": anchor row ids, "E": their embeddings re-encoded with
    mask_cols zeroed in Z and M}. Baselines see the same mask on the query
    side. On the 08-04 matrix no game or identity column is in mask_cols, so
    the baselines equal recall's, and the slice measures how much of the
    embedding's recall depends on the 58 columns the old era lacks.
    """
    # Causes in the data first, the missing re-encode last: train_mtnn and
    # eval_v2 pass regime None when there is nothing to mask or no anchor to
    # re-encode, and the reason said "needs the model" for both (P12).
    if not mask_cols:
        return {"missing": f"no column is unobserved in the <={REGIME_LAST_YEAR} rows, so there is no regime to mask"}
    if not identity_cols:
        return {"missing": "no identity-lookup columns in this matrix, so the regime baseline is incomplete"}
    if not any(len(pairs_by_split[s]) for s in SPLITS):
        return {"missing": "no val- or test-split adjacent-season pairs, so no held-out anchor to re-encode"}
    if regime is None:
        return {"missing": NO_REENCODE}
    rows = np.asarray(regime["rows"], dtype=np.int64)
    Er = np.asarray(regime["E"], dtype=np.float32)
    where = {int(r): i for i, r in enumerate(rows)}
    Zq = np.asarray(Z, dtype=np.float64).copy()
    Zq[:, mask_cols] = 0.0
    G, Gq = unit_rows(Z[:, game_cols]), unit_rows(Zq[:, game_cols])
    ident, ident_q = unit_rows(Z[:, identity_cols]), unit_rows(Zq[:, identity_cols])
    out: dict = {"measures": {}, "baselines": {}, "scores": {}}
    for s in SPLITS:
        p = pairs_by_split[s]
        if len(p) == 0:
            out["scores"][s] = None
            continue
        absent = [int(a) for a in p[:, 0] if int(a) not in where]
        if absent:
            return {"missing": f"{len(absent)} {s} anchors were not re-encoded (e.g. row {absent[0]})"}
        q = Er[[where[int(a)] for a in p[:, 0]]]
        r = pair_recall(E, p, queries=q)
        b14 = pair_recall(G, p, queries=Gq[p[:, 0]])
        bid = pair_recall(ident, p, queries=ident_q[p[:, 0]])
        best = max(b14, bid)
        unmasked = pair_recall(E, p)
        out["measures"][s] = {
            "recall_at_10": _r(r),
            "pairs": len(p),
            "unmasked_recall_at_10": _r(unmasked),
            "retained": _r(r / unmasked) if unmasked else None,
        }
        out["baselines"][s] = {
            "transparent_14d": _r(b14),
            "identity_lookup": _r(bid),
            "best": _r(best),
            "margin": _r(r - best),
        }
        out["scores"][s] = centered(r, no_skill=0.0, baseline=best, perfect=1.0)
    if out["scores"].get(SCORED_SPLIT) is None:
        return {"missing": f"no {SCORED_SPLIT}-split adjacent-season pairs"}
    return out


# ---------------------------------------------------------------------------
# next-season head
# ---------------------------------------------------------------------------


def _r2_mae(y: np.ndarray, p: np.ndarray) -> tuple[float, float]:
    """Pooled R2 and MAE exactly as train_mtnn.next_profile_holdout_metrics computes them."""
    resid = y - p
    ss_tot = float(((y - y.mean(axis=0, keepdims=True)) ** 2).sum())
    return 1.0 - float((resid**2).sum()) / max(ss_tot, 1e-9), float(np.abs(resid).mean())


def shrunk_persistence_factors(Zg: np.ndarray, train_pairs: np.ndarray) -> np.ndarray:
    """beta_j = sum(x y) / sum(x x) over train-split pairs: next = beta * this season, per feature [critic#0]."""
    x, y = Zg[train_pairs[:, 0]], Zg[train_pairs[:, 1]]
    return (x * y).sum(axis=0) / np.maximum((x * x).sum(axis=0), 1e-12)


def next_head_component(next_pred, Z, game_cols, pairs_by_split, game_names) -> dict:
    """Model R2/MAE on held-out next seasons against raw and train-fit shrunk persistence."""
    if next_pred is None:
        return {"missing": "no next-season head predictions"}
    train = pairs_by_split["train"]
    if len(train) == 0:
        return {"missing": "no train-split pairs to fit the shrunk persistence baseline on"}
    Zg = np.asarray(Z, dtype=np.float64)[:, game_cols]
    pred = np.asarray(next_pred, dtype=np.float64)
    beta = shrunk_persistence_factors(Zg, train)
    mean_next = Zg[train[:, 1]].mean(axis=0)
    out: dict = {"measures": {}, "baselines": {}, "scores": {"next_r2": {}, "next_mae": {}}}
    for s in SPLITS:
        p = pairs_by_split[s]
        if len(p) == 0:
            out["scores"]["next_r2"][s] = out["scores"]["next_mae"][s] = None
            continue
        x, y = Zg[p[:, 0]], Zg[p[:, 1]]
        r2_m, mae_m = _r2_mae(y, pred[p[:, 0]])
        r2_raw, mae_raw = _r2_mae(y, x)
        r2_shr, mae_shr = _r2_mae(y, x * beta)
        # No-skill forecast: every row gets the train pairs' mean next season.
        _, mae_mean = _r2_mae(y, np.broadcast_to(mean_next, y.shape))
        best_r2, best_mae = max(r2_raw, r2_shr), min(mae_raw, mae_shr)
        out["measures"][s] = {"r2": _r(r2_m), "mae_z": _r(mae_m), "pairs": len(p)}
        out["baselines"][s] = {
            "persistence": {"r2": _r(r2_raw), "mae_z": _r(mae_raw)},
            "shrunk_persistence": {"r2": _r(r2_shr), "mae_z": _r(mae_shr)},
            "train_mean": {"mae_z": _r(mae_mean)},
            "r2_margin": _r(r2_m - best_r2),
            "mae_margin": _r(best_mae - mae_m),
        }
        out["scores"]["next_r2"][s] = centered(r2_m, no_skill=0.0, baseline=best_r2, perfect=1.0)
        out["scores"]["next_mae"][s] = centered(mae_m, no_skill=mae_mean, baseline=best_mae, perfect=0.0)
    out["baselines"]["shrink_factors"] = {f: _r(b) for f, b in zip(game_names, beta, strict=True)}
    if out["scores"]["next_r2"].get(SCORED_SPLIT) is None:
        return {"missing": f"no {SCORED_SPLIT}-split next-season pairs"}
    return out


# ---------------------------------------------------------------------------
# archetype labels and the two classification components
# ---------------------------------------------------------------------------


def train_only_archetypes(Zg: np.ndarray, is_train: np.ndarray, k: int = N_ARCHETYPES) -> np.ndarray:
    """K-means on train rows only, every row assigned to its nearest train centroid [features#10].

    build_vectors' recipe (K=8, 40 Lloyd iterations, the 14 game columns,
    initial centroids drawn by rng(7)) with leakfree.leakfree_clusters' one
    change: val and test rows never move a centroid. leakfree.py imports
    train_mtnn, and so torch, which this module must not, hence the copy.
    The rng is local; the global numpy RNG is untouched.
    """
    Zg = np.asarray(Zg, dtype=np.float64)
    rng = np.random.default_rng(KMEANS_SEED)
    Zt = Zg[is_train]
    cent = Zt[rng.choice(len(Zt), k, replace=False)].copy()
    for _ in range(KMEANS_ITERS):
        lab = ((Zt[:, None, :] - cent[None]) ** 2).sum(-1).argmin(1)
        for j in range(k):
            if (lab == j).any():
                cent[j] = Zt[lab == j].mean(0)
    return ((Zg[:, None, :] - cent[None]) ** 2).sum(-1).argmin(1).astype(np.int64)


def match_labels(new: np.ndarray, stored: np.ndarray, rows: np.ndarray, k: int = N_ARCHETYPES) -> np.ndarray:
    """Relabel new k-means ids to the stored ids they agree with most on `rows` (the head's classes).

    Exhaustive over the k! permutations (40,320 for k=8), which is exact and
    needs no scipy: the CI install is numpy and pytest.
    """
    if k > 9:
        raise ValueError(f"match_labels enumerates k! permutations; k={k} is too many")
    ok = rows & (stored >= 0) & (stored < k)
    C = np.zeros((k, k), dtype=np.int64)
    np.add.at(C, (new[ok], stored[ok]), 1)
    perms = np.array(list(itertools.permutations(range(k))), dtype=np.int64)
    best = perms[int(np.argmax(C[np.arange(k), perms].sum(axis=1)))]
    return best[new]


def top1_by_split(logits, labels, split_of) -> dict[str, tuple[float | None, int]]:
    pred = np.asarray(logits).argmax(axis=1)
    labels = np.asarray(labels)
    out = {}
    for s in SPLITS:
        rows = (split_of == s) & (labels >= 0)
        n = int(rows.sum())
        out[s] = (float((pred[rows] == labels[rows]).mean()) if n else None, n)
    return out


def majority_rate(labels, split_of, s) -> float | None:
    """Accuracy of always guessing the most common train-row label, on split s."""
    labels = np.asarray(labels)
    tr = labels[(split_of == "train") & (labels >= 0)]
    held = labels[(split_of == s) & (labels >= 0)]
    if len(tr) == 0 or len(held) == 0:
        return None
    mode = np.bincount(tr).argmax()
    return float((held == mode).mean())


def classification_component(logits, labels, split_of, what: str) -> dict:
    if logits is None:
        return {"missing": f"no {what} head logits"}
    if labels is None or not (np.asarray(labels) >= 0).any():
        return {"missing": f"no {what} labels"}
    acc = top1_by_split(logits, labels, split_of)
    if acc[SCORED_SPLIT][0] is None:
        return {"missing": f"no labelled {SCORED_SPLIT}-split rows for {what}"}
    return {
        "measures": {s: {"top1": _r(a), "rows": n} for s, (a, n) in acc.items() if a is not None},
        "baselines": {s: {"majority_class": _r(majority_rate(labels, split_of, s))} for s in SPLITS},
        "scores": {s: (None if a is None else _clip01(a)) for s, (a, _n) in acc.items()},
    }


# ---------------------------------------------------------------------------
# diagnostics (no weight)
# ---------------------------------------------------------------------------


def exact_purity(E: np.ndarray, labels: np.ndarray, years: np.ndarray, anchors: np.ndarray, chunk: int = 256):
    """purity@20 over every anchor given, neighbours from all rows: v1's definition without its 400-anchor draw."""
    E = np.asarray(E, dtype=np.float64)
    anchors = anchors[labels[anchors] >= 0]
    vals = []
    for lo in range(0, len(anchors), chunk):
        q = anchors[lo : lo + chunk]
        sims = E[q] @ E.T
        sims[np.arange(len(q)), q] = -np.inf
        top = np.argpartition(-sims, K_PURITY, axis=1)[:, :K_PURITY]
        for r, i in enumerate(q):
            cross = top[r][years[top[r]] != years[i]]
            if len(cross):
                vals.append(float((labels[cross] == labels[i]).mean()))
    return (float(np.mean(vals)) if vals else None), len(vals)


def purity_diagnostic(E, Z, game_cols, labels, years, split_of) -> dict:
    """Held-out purity@20 for the embedding and for the raw 14-d input it is measured against [eval#4]."""
    G = unit_rows(Z[:, game_cols])
    out: dict = {
        "scored": False,
        "labels": "train-only k-means (train_only_archetypes)",
        "why_not_scored": (
            "the labels are k-means on the 14 game input columns, so the raw input defines them and wins by "
            "construction: an embedding can only pass it by fitting that partition harder than the input does"
        ),
    }
    for s in SPLITS:
        anchors = np.where(split_of == s)[0]
        pm, n = exact_purity(E, labels, years, anchors)
        pr, _ = exact_purity(G, labels, years, anchors)
        out[s] = {
            "purity_at_20": _r(pm),
            "raw_input_purity_at_20": _r(pr),
            "margin": _r(pm - pr) if pm is not None and pr is not None else None,
            "anchors": n,
        }
    return out


def skill_formula_grades(Zg: np.ndarray, game_features: list[str], season) -> tuple[np.ndarray, list[str]]:
    """build_skills' grades/100, recomputed from the game columns the model reads.

    Imported here, not at module scope: build_skills is numpy-only, but only
    the skills diagnostic needs it.
    """
    import build_skills

    W = build_skills.weight_matrix(list(game_features))
    scores = np.asarray(Zg, dtype=np.float64) @ W.T
    vol_cols = [list(game_features).index(f) for f in ("FGA", "FTA", "AST") if f in game_features]
    season = np.asarray(season).astype(str)
    season_idx = {s: np.where(season == s)[0] for s in sorted(set(season.tolist()))}
    grades = build_skills.season_percentiles(scores, Zg[:, vol_cols].sum(axis=1), season_idx)
    return grades / 100.0, [sk["key"] for sk in build_skills.SKILLS]


def _r2(y: np.ndarray, p: np.ndarray) -> float:
    return 1.0 - float(((y - p) ** 2).sum()) / max(float(((y - y.mean()) ** 2).sum()), 1e-9)


def skills_diagnostic(skills, Z, game_cols, game_features, season, split_of, report) -> dict:
    """Model R2 on the core skill grades beside the formula's R2 from the same inputs [critic#1]."""
    out: dict = {
        "scored": False,
        "why_not_scored": (
            "each core grade is a fixed linear formula over the 14 game input columns plus a within-season "
            "percentile, so the inputs alone reproduce it (formula_mean_r2); the head scores how much of its "
            "own input survives the bottleneck"
        ),
    }
    v1 = (((report or {}).get("skills") or {}).get("holdout") or {}) if report else {}
    if skills is None:
        out["missing"] = "no skill predictions or labels"
        return out
    n_core = int(skills["n_core"])
    keys = list(skills["keys"])[:n_core]
    formula, formula_keys = skill_formula_grades(np.asarray(Z)[:, game_cols], game_features, season)
    if keys != formula_keys:
        out["missing"] = f"core skill keys {keys} do not match build_skills' {formula_keys}"
        return out
    pred, target, mask = (np.asarray(skills[k], dtype=np.float64)[:, :n_core] for k in ("pred", "target", "mask"))
    for s in SPLITS:
        m_r2, f_r2 = [], []
        for j in range(n_core):
            rows = np.where((mask[:, j] > 0) & (split_of == s))[0]
            if len(rows) < 5:
                continue
            m_r2.append(_r2(target[rows, j], pred[rows, j]))
            f_r2.append(_r2(target[rows, j], formula[rows, j]))
        out[s] = {
            "core_skills": len(m_r2),
            "model_mean_r2": _r(np.mean(m_r2)) if m_r2 else None,
            "formula_mean_r2": _r(np.mean(f_r2)) if f_r2 else None,
            "v1_mean_r2_all_skills": _r((v1.get(s) or {}).get("mean_r2")),
        }
    return out


def aux_diagnostic(report, features, families, M, run_args) -> dict:
    """Each aux head's held-out R2 beside its identity ceiling: 1.0 when the target column is also an input.

    M is the mask as the model read it: train_mtnn picks the career_slope
    target from it, and a --mask-features column has no observations left.
    """
    exclude = {f.strip() for f in str(run_args.get("exclude_families") or "").split(",") if f.strip()}
    drop = {f.strip() for f in str(run_args.get("drop_features") or "").split(",") if f.strip()}
    heads = {}
    for head, cands in AUX_TARGETS.items():
        col = None
        for c in cands:
            if c in features and np.asarray(M)[:, features.index(c)].any():
                col = c
                break
        if col is None:
            heads[head] = {"target": None}
            continue
        fam = families.get(col)
        is_input = bool(fam not in exclude and fam != "injury" and col not in drop)
        block = (report or {}).get(head) or {}
        heads[head] = {
            "target": col,
            "target_is_input": is_input,
            "identity_ceiling_r2": 1.0 if is_input else None,
            **{f"{s}_r2": _r(((block.get(s) or {}) if isinstance(block, dict) else {}).get("r2")) for s in SPLITS},
        }
    return {
        "scored": False,
        "why_not_scored": (
            "every aux target is an input column of its own run unless its family is excluded or the column "
            "dropped, so copying the input scores R2 1.0"
        ),
        "heads": heads,
    }


def margin_14d_diagnostic(report) -> dict:
    """v1's margin_14d for this run, and whether it is pinned at 1.0.

    The note was one fixed sentence ("1.0 on every report") whatever the run
    said; a one-epoch run on a 100-player slice scores 0.72 against 0.65, a
    component of 0.7. It is computed from the run's own numbers now.
    """
    comp = (report or {}).get("composite") or {}
    ho = (((report or {}).get("held_out_recall") or {}).get("test")) or {}
    component = _r((comp.get("components") or {}).get("margin_14d"))
    recall, base = _r(ho.get("recall_at_10_mtnn")), _r(ho.get("recall_at_10_transparent_14d"))
    margin = _r(recall - base) if recall is not None and base is not None else None
    saturated = None if component is None else bool(component >= 1.0)
    if margin is None or component is None:
        note = "v1 scores clip01((test recall - 14-d recall) / 0.10); this report lacks the inputs."
    else:
        note = (
            f"v1 scores clip01((test recall - 14-d recall) / 0.10) = clip01(({recall} - {base}) / 0.10) "
            f"= {component}. "
            + (
                "It is saturated: any margin over 0.10 scores 1.0, so it moves no decision [eval#9]."
                if saturated
                else "It is not saturated: the margin is under 0.10, so the component moves with it."
            )
        )
    return {
        "scored": False,
        "v1_component": component,
        "v1_test_recall_at_10": recall,
        "v1_transparent_14d": base,
        "v1_margin": margin,
        "saturated": saturated,
        "note": note + " The two recalls are two different 500-pair draws from the global RNG [eval#8].",
    }


def metrics_source(report) -> dict:
    """Whether the run's loss saw the held-out rows, labelled as v1 labels it.

    composite_v2 scores held-out rows, but on a fit_rows 'all' run (--phase
    final-refit) the loss trained on the val and test rows too, so cqs_v2 is
    as in-sample as v1's CQS; v1 says so with metrics_source
    'in_sample_refit' (composite_score.in_sample_reason), and v2 said nothing
    (P12). selection.fit_rows covers reports from before metrics_source.
    """
    if not report:
        return {"metrics_source": None, "in_sample": None}
    fit_rows = (report.get("selection") or {}).get("fit_rows")
    in_sample = report.get("metrics_source") == "in_sample_refit" or fit_rows == "all"
    out: dict[str, Any] = {
        "metrics_source": "in_sample_refit" if in_sample else report.get("metrics_source"),
        "in_sample": in_sample,
    }
    if in_sample:
        out["metrics_note"] = (
            "in-sample: the loss trained on every row (fit_rows 'all'), val and test included, so cqs_v2 and "
            "cqs_v2_val are not held out. A refit's held-out evidence is the select run of its recipe [training#0]."
        )
    return out


# ---------------------------------------------------------------------------
# aggregation
# ---------------------------------------------------------------------------


def cqs_from(scores: dict[str, float | None]) -> float | None:
    if any(scores.get(k) is None for k in WEIGHTS):
        return None
    return round(100.0 * sum(WEIGHTS[k] * float(scores[k]) for k in WEIGHTS), 2)


def failed_block(reason: str) -> dict:
    """What train_mtnn writes when composite_v2 itself fails: no score, every component missing, the reason."""
    return {
        "version": VERSION,
        "cqs_v2": None,
        "cqs_v2_val": None,
        "components": dict.fromkeys(WEIGHTS),
        "weights": dict(WEIGHTS),
        "weights_status": "provisional: proposed in composite_v2.py, not ratified",
        "components_missing": list(WEIGHTS),
        "missing_reasons": dict.fromkeys(WEIGHTS, reason),
        "error": reason,
    }


def composite_v2(inputs: dict[str, Any]) -> dict:
    """Score a run. inputs, all indexed by the matrix's rows in order:

    required  E [n, d] embeddings; Z, M [n, F] the matrix as build_vectors and
              integrate_context wrote it; features, families (manifest);
              game_features; player_id, season.
    optional  Z_model, M_model: the matrix as the model read it, after the
              run's --era-align / --robust-scaling / --mask-* (default Z, M);
              cluster (stored archetype ids, the head's classes), position
              (-1 unknown), archetype_logits, position_logits,
              next_profile_pred [n, 14], regime {"rows", "E"},
              skills {"pred", "target", "mask", "keys", "n_core"},
              report (the v1 report, for the diagnostics), run_args (the
              trainer's args, for which columns were inputs).

    Which matrix where. The lookup baselines, the regime rule, the archetype
    labels and the skills formula read Z: they describe the data, and the
    stored labels and skill grades were built from it. The next-season head
    predicts the run's own Z_model columns, so its targets and persistence
    baselines read Z_model, as v1's next_profile does. On the 08-14 run
    (--era-align procrustes --robust-scaling), train-only k-means on
    Z_model agreed with the stored ids on 0.61 of train rows and the skills
    formula scored R2 -0.31: the wrong space for both.

    Returns {version, cqs_v2, cqs_v2_val, components, components_val,
    weights, measures, baselines, diagnostics, components_missing,
    missing_reasons, ...}. A component is None when its input is absent,
    and then cqs_v2 is None.
    """
    for key in ("E", "Z", "M", "features", "families", "game_features", "player_id", "season"):
        if inputs.get(key) is None:
            raise ValueError(f"composite_v2 needs inputs[{key!r}]")
    E = np.asarray(inputs["E"], dtype=np.float32)
    Z = np.asarray(inputs["Z"], dtype=np.float32)
    M = np.asarray(inputs["M"], dtype=np.float32)
    Zm = Z if inputs.get("Z_model") is None else np.asarray(inputs["Z_model"], dtype=np.float32)
    Mm = M if inputs.get("M_model") is None else np.asarray(inputs["M_model"], dtype=np.float32)
    features = list(inputs["features"])
    families = dict(inputs["families"])
    game_features = list(inputs["game_features"])
    season = np.asarray(inputs["season"])
    if not (len(E) == len(Z) == len(M) == len(Zm) == len(Mm) == len(season) == len(inputs["player_id"])):
        raise ValueError("composite_v2 inputs disagree on the row count")
    report = inputs.get("report")
    run_args = inputs.get("run_args") or {}

    game_cols = feature_index(features, game_features)
    identity_cols = feature_index(features, IDENTITY_FEATURES)
    split_of = np.array([eval_split(str(s)) for s in season])
    years = np.array([season_start_year(str(s)) for s in season])
    pairs_by_split = split_pairs(inputs["player_id"], season)
    mask_cols = regime_mask_columns(M, season)

    results: dict[str, dict] = {}
    results["recall"] = recall_component(E, Z, game_cols, identity_cols, pairs_by_split)
    results["regime"] = regime_component(
        E, Z, game_cols, identity_cols, pairs_by_split, inputs.get("regime"), mask_cols
    )
    nxt = next_head_component(
        inputs.get("next_profile_pred"), Zm, game_cols, pairs_by_split, [features[j] for j in game_cols]
    )

    stored = inputs.get("cluster")
    labels = None
    arch_note = None
    if stored is not None and (np.asarray(stored) >= 0).any():
        new = train_only_archetypes(Z[:, game_cols], split_of == "train")
        stored = np.asarray(stored, dtype=np.int64)
        labels = match_labels(new, stored, split_of == "train")
        arch_note = {s: _r(float((labels[split_of == s] == stored[split_of == s]).mean())) for s in ("train", *SPLITS)}
    results["position"] = classification_component(
        inputs.get("position_logits"), inputs.get("position"), split_of, "position"
    )
    results["archetype"] = (
        classification_component(inputs.get("archetype_logits"), labels, split_of, "archetype")
        if labels is not None
        else {"missing": "no stored cluster ids to align the archetype head's classes with"}
    )

    components: dict[str, float | None] = {}
    components_val: dict[str, float | None] = {}
    measures: dict[str, Any] = {}
    baselines: dict[str, Any] = {}
    reasons: dict[str, str] = {}
    for name in ("recall", "regime", "position", "archetype"):
        res = results[name]
        if "missing" in res:
            components[name] = components_val[name] = None
            reasons[name] = res["missing"]
            continue
        components[name] = _r(res["scores"].get(SCORED_SPLIT))
        components_val[name] = _r(res["scores"].get("val"))
        measures[name] = res["measures"]
        baselines[name] = res["baselines"]
    if "missing" in nxt:
        for name in ("next_r2", "next_mae"):
            components[name] = components_val[name] = None
            reasons[name] = nxt["missing"]
    else:
        for name in ("next_r2", "next_mae"):
            components[name] = _r(nxt["scores"][name].get(SCORED_SPLIT))
            components_val[name] = _r(nxt["scores"][name].get("val"))
        measures["next_head"] = nxt["measures"]
        baselines["next_head"] = nxt["baselines"]

    stored_top1 = None
    if inputs.get("archetype_logits") is not None and stored is not None:
        stored_top1 = {s: _r(a) for s, (a, _n) in top1_by_split(inputs["archetype_logits"], stored, split_of).items()}

    diagnostics = {
        "purity": (
            purity_diagnostic(E, Z, game_cols, labels, years, split_of)
            if labels is not None
            else {"scored": False, "missing": "no archetype labels"}
        ),
        "skills_r2": skills_diagnostic(inputs.get("skills"), Z, game_cols, game_features, season, split_of, report),
        "aux_r2": aux_diagnostic(report, features, families, Mm, run_args),
        "margin_14d": margin_14d_diagnostic(report),
        "archetype_labels": {
            "fit": f"k-means K={N_ARCHETYPES} on train-split rows only, rng({KMEANS_SEED}), {KMEANS_ITERS} iterations",
            "agreement_with_stored_ids": arch_note,
            "head_top1_against_stored_ids": stored_top1,
        },
        "identity_features": [features[j] for j in identity_cols],
        "regime_masked_features": [features[j] for j in mask_cols],
        "regime_rule": f"columns observed in under {REGIME_UNOBSERVED_RATE:.0%} of rows with season <= {REGIME_LAST_YEAR}",
        "rows": {
            "recall": "every adjacent-season pair whose target row is in the split, ranked against all rows",
            "regime": "the same pairs, anchor re-encoded with the regime columns zeroed in Z and M",
            "next_head": "the same pairs: prediction from the anchor row, target the next season",
            "position": "rows of the split with a position label",
            "archetype": "rows of the split",
        },
    }
    missing = [k for k in WEIGHTS if components.get(k) is None]
    return {
        "version": VERSION,
        "cqs_v2": cqs_from(components),
        "cqs_v2_val": cqs_from(components_val),
        **metrics_source(report),
        "scored_split": SCORED_SPLIT,
        "components": {k: components.get(k) for k in WEIGHTS},
        "components_val": {k: components_val.get(k) for k in WEIGHTS},
        "weights": dict(WEIGHTS),
        "weights_status": "provisional: proposed in composite_v2.py, not ratified",
        "transform": TRANSFORM,
        "measures": measures,
        "baselines": baselines,
        "diagnostics": diagnostics,
        "components_missing": missing,
        "missing_reasons": reasons,
    }

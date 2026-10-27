#!/usr/bin/env python3
"""MTNN v7 challenger-vs-champion evaluation (DRAFT -- Lane 5, MLOps v2).

Evaluation and interpretation ONLY. No training, no game code, no writes to
any repo checkout, no writes to the champion asset, no promotion. The script
writes exactly one output directory (the --out argument): eval_report.json
and, when requested, spot_check_candidates.json. It never writes to
~/workspace/registry/ and never overwrites its inputs.

One code path, both models, every prefix
---------------------------------------
The function evaluate_embeddings() is the ONLY metric implementation. It is
called for the champion and for the challenger, at every prefix
m in {8, 16, 32, 64}, after the same slice_and_normalize() step (slice to
the first m dims, then L2-normalize). There is no per-model branch anywhere
in the metric code. Champion prefixes are truncated-champion diagnostics:
the champion serves at 64-d only, and the promotion gate is judged at 64-d
only. The 16-d check compares challenger-16 against challenger-64, never
against a truncated champion.

Retrieval rules (reverse-engineered from the prior evals, then pinned here)
--------------------------------------------------------------------------
* Search space: the full 12,966-row space. Exhaustive -- no sampling. This
  deliberately diverges from mtnn_metrics.recall_at_k, which scores a
  500-pair subsample drawn from the global RNG (so its number depends on
  how many RNG draws happened before it). Exhaustive numbers are not
  comparable to subsampled numbers; the champion is therefore re-measured
  in the same run, and the gate compares challenger vs champion from this
  run only, never against the old anchors (top-1 0.118, continuity 0.176).
* Self excluded: the query row itself never counts as a neighbour.
* Identity key: person_id, from the --rows file. Name is NEVER a key
  (distinct players share names: Dee Brown, Reggie Williams, Mike James,
  Chris Johnson). If any row lacks person_id, the script fails loud --
  it does not fall back to name. NOTE (verified 2026-10-26): the served
  assets/vectors.json players carry NO person_id field, although contract
  section 0 says the master vectors file does. The --rows file must
  therefore be a person_id-enriched rows file (for example vectors.json
  after pipeline/apply_player_identity.py), not raw assets/vectors.json.
  Row alignment is positional: --rows entry i must have id == i, matching
  .f32 row i. A mismatch fails loud.
* Pessimistic ties: for query q and candidate r, the pessimistic rank is
  1 + #{s != q : sim(s) > sim(r)} + #{s != q, r : sim(s) == sim(r)}.
  Tied rows all share the worst rank of their tie group. Top-1 is a hit
  only when the target's pessimistic rank is 1 (its similarity is strictly
  greater than every other non-self row); recall@10 is a hit only when
  the pessimistic rank is <= 10. A top-10 SET is {r : pessimistic rank
  <= 10}; it can hold fewer than 10 rows when a tie group straddles the
  boundary, and hit-rate@10 still divides by 10 (pessimistic, matching
  the prior eval_twin_agreement.py convention). This is stricter than
  that script's stable argsort, which breaks ties by row order.
* Adjacent-season pairs: same person_id, consecutive season-start years
  (y2 - y1 == 1), built from the --rows file. A pair is scored for a
  split when its TARGET season is in that split's season list (the
  mtnn_metrics.filter_pairs_by_split convention).

Folds: consumed from the Lane 3 fold manifest (contract section 2a),
never hardcoded here. Each fold object carries fold, train_seasons,
val_seasons, test_seasons, n_train_rows, n_val_rows, n_test_rows,
n_pairs_adjacent, n_pairs_twin, n_pairs_dropped_cross_boundary and
n_val_new_player_rows. The script validates internal consistency
(season lists disjoint within a fold, row counts reconciling to the
--rows file) and records -- but does not silently repair -- any
disagreement with the contract's printed counts. KNOWN CONFLICT (see
EVAL_PROTOCOL.md C7): contract Fold 2 as printed (train <= 2023,
val 2024-25, 984 rows) does not reconcile under season-start-year
keying, because 2024-25 (500) + 2025-26 (491) = 991, while
500 + 484 = 984 pairs 2024-25 with 2023-24. Lane 3 must resolve the
manifest; this script trusts the manifest's season lists.

Primary metrics (the promotion gate, contract section 2d)
---------------------------------------------------------
top-1, recall@10, continuity_spread_global (lower is better). Twin
agreement is a guardrail/diagnostic, NOT a gate metric: positives
include v5's own twins, so v6 cannot beat v5 on twin agreement -- it
can only match (spec section 6, distillation ceiling). Requiring a
"beat" there would make promotion impossible by construction.

Continuity, pinned (see EVAL_PROTOCOL.md C2): the spec and the
workbench skill quote a champion continuity of 0.176 without a formula.
The closest recorded definition is train_mtnn.continuity_report /
sweep_stability.continuity: per season-boundary mean same-player
adjacent-season cosine, and continuity_spread = max - min over modern
boundaries (source-start-year >= 2016, boundaries with >= 30 pairs).
This script implements exactly that as continuity_spread_global
(computed on the full space, so it is identical for every fold and is
reported once per model per prefix, with the per-fold copy marked as
such), plus a per-split boundary table and, where a split has >= 2
boundaries, a per-split spread. A single-boundary split (the frozen
2025-26 test has exactly one boundary, 2024-25 -> 2025-26) has NO
spread: the script reports null, never 0.0. The gated continuity
number is the global spread.

New-player slice, pinned (see EVAL_PROTOCOL.md C6): contract section 2a
defines the slice on ROWS (person_id with no earlier-season row in the
fold's training portion). A debut row has no adjacent predecessor, so
it cannot be a retrieval TARGET. The script therefore scores the slice
on pairs whose SOURCE row is a new-player row (the debut season itself
is the query, its next season the target, searched in the full space),
with targets restricted to seasons outside the fold's training seasons
(train-window debut pairs were training positives, not held-out
scores). For the frozen test it additionally reports cold-start
transitions (target in the frozen test, source person absent from the
union of all folds' training seasons) -- the frozen-test cold-start
number that actually exists -- while frozen-test debut rows themselves
report null retrieval by construction (a 2025-26 debut has no next
season in the file), never 0. The slice is always reported separately,
never blended into headlines.

Tower ablations and the mask-ablation era test need re-encoded
embeddings (a family masked at inference), which only an encoder run
can produce. This script therefore consumes them as files, it does not
encode anything itself:
* --ablate-dir: one <family>.f32 per ablated family (whole family
  masked at inference, same encoder, same row order). Deltas vs the
  full challenger are reported; see EVAL_PROTOCOL.md section 8.
* --era-masked-tracking / --era-masked-form / --era-masked-control:
  challenger embeddings re-encoded with that family masked on modern
  rows only. See EVAL_PROTOCOL.md section 9.

Dependencies: numpy only (stdlib + numpy, like the prior evals).
No torch, no GPU, no package installs.

Usage (run only when an authorized operator invokes it; Lane 5 drafts
are not executed by the lane itself):
  python3 eval_mtnn_v7.py --champion <champion.f32> \
      --challenger <challenger.f32> --rows <rows.json> \
      --fold-manifest <manifest.json> --out <dir> \
      [--run-report <train_report.json>] \
      [--ablate-dir <dir>] \
      [--era-masked-tracking <f32>] [--era-masked-form <f32>] \
      [--era-masked-control <f32>] [--spot-check-out <path>]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np

N_ROWS = 12966
DIM = 64
PREFIXES = (8, 16, 32, 64)
K = 10

# Contract section 0: 17 tower families, in order.
FAMILIES = (
    "volume",
    "playmaking",
    "rebounding",
    "defense",
    "efficiency",
    "shotmix",
    "bio",
    "tracking",
    "form",
    "market",
    "roster",
    "career",
    "competition",
    "team",
    "pedigree",
    "playoffs",
    "honors",
)

# Masked-family era windows (contract section 0 / Lane 2 rules).
TRACKING_START_YEAR = 2013  # tracking masked pre-2013: present only >= 2013
FORM_START_YEAR = 2015  # form masked pre-2015: present only >= 2015
MODERN_YEAR = 2016  # train_mtnn continuity_report modern filter
MIN_PAIRS_PER_BOUNDARY = 30  # train_mtnn continuity_report threshold


def fail(msg: str) -> None:
    raise SystemExit(f"eval_mtnn_v7: FAIL: {msg}")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def season_start(season: str) -> int:
    return int(str(season)[:4])


def era_bucket(year: int) -> str:
    if year < 2000:
        return "pre_2000"
    if year < 2010:
        return "2000s"
    if year < 2020:
        return "2010s"
    return "2020s"


def load_f32(path: Path, label: str) -> np.ndarray:
    if not path.exists():
        fail(f"{label} file not found: {path}")
    raw = np.fromfile(path, dtype=np.float32)
    if raw.size != N_ROWS * DIM:
        fail(
            f"{label} shape mismatch: {path} holds {raw.size} float32 values, "
            f"expected {N_ROWS}x{DIM} = {N_ROWS * DIM}. "
            "If the champion file reports != 12966x64, stop and investigate; "
            "never edit the champion file to fit."
        )
    E = raw.reshape(N_ROWS, DIM)
    if not np.isfinite(E).all():
        fail(f"{label} contains NaN or Inf: {path}")
    norms = np.linalg.norm(E, axis=1)
    if (norms <= 0).any():
        n_bad = int((norms <= 0).sum())
        fail(f"{label} has {n_bad} zero-norm rows: {path}")
    return E


def slice_and_normalize(E: np.ndarray, m: int) -> np.ndarray:
    """The one slicing step, shared by both models at every prefix."""
    X = E[:, :m].astype(np.float64)
    norms = np.linalg.norm(X, axis=1, keepdims=True)
    if (norms <= 0).any():
        fail(f"slice to {m}d produced zero-norm rows")
    return X / norms


def load_rows(path: Path) -> list[dict]:
    if not path.exists():
        fail(f"rows file not found: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data["players"] if isinstance(data, dict) else data
    if len(rows) != N_ROWS:
        fail(f"rows file holds {len(rows)} rows, expected {N_ROWS}: {path}")
    out: list[dict] = []
    for i, r in enumerate(rows):
        if r.get("id") is not None and int(r["id"]) != i:
            fail(
                f"rows entry at position {i} has id {r.get('id')!r}; "
                "row alignment is positional (.f32 row i == rows entry i). "
                "Reorder the rows file or stop and investigate."
            )
        pid = r.get("person_id")
        if pid is None or (isinstance(pid, str) and not pid.strip()):
            fail(
                f"rows entry {i} ({r.get('name')!r}, {r.get('season')!r}) "
                "has no person_id. The eval key is person_id, never name; "
                "name fallback is banned (same-name distinct players). "
                "Supply a person_id-enriched rows file (see module docstring) "
                "instead of raw assets/vectors.json, which carries no "
                "person_id field."
            )
        season = r.get("season")
        if season is None:
            fail(f"rows entry {i} has no season")
        out.append(
            {
                "row": i,
                "person_id": pid,
                "season": str(season),
                "year": season_start(season),
                "name": r.get("name"),
                "position": r.get("position", r.get("p")),
                "cluster": r.get("cluster", r.get("c")),
                "stats14": r.get("v"),
            }
        )
    return out


def load_manifest(path: Path) -> list[dict]:
    if not path.exists():
        fail(f"fold manifest not found: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    folds = data["folds"] if isinstance(data, dict) else data
    if not isinstance(folds, list) or not folds:
        fail("fold manifest must hold a non-empty 'folds' list (contract 2a)")
    required = (
        "fold",
        "train_seasons",
        "val_seasons",
        "test_seasons",
        "n_train_rows",
        "n_val_rows",
        "n_test_rows",
        "n_pairs_adjacent",
        "n_pairs_twin",
        "n_pairs_dropped_cross_boundary",
        "n_val_new_player_rows",
    )
    for f in folds:
        missing = [k for k in required if k not in f]
        if missing:
            fail(f"fold {f.get('fold')!r} is missing manifest fields: {missing}")
        seen: set[str] = set()
        for key in ("train_seasons", "val_seasons", "test_seasons"):
            for s in f[key]:
                if s in seen:
                    fail(f"fold {f['fold']!r}: season {s!r} appears in two splits")
                seen.add(s)
    return folds


def season_sets(fold: dict) -> dict[str, set[str]]:
    return {
        "train": set(fold["train_seasons"]),
        "val": set(fold["val_seasons"]),
        "test": set(fold["test_seasons"]),
    }


def check_manifest_counts(folds: list[dict], rows: list[dict]) -> list[str]:
    """Row counts must reconcile to the rows file; the manifest's own
    pair/drop counts are recorded, not recomputed (Lane 3 owns them)."""
    warnings: list[str] = []
    by_season: dict[str, int] = {}
    for r in rows:
        by_season[r["season"]] = by_season.get(r["season"], 0) + 1
    for f in folds:
        for key, field in (
            ("train_seasons", "n_train_rows"),
            ("val_seasons", "n_val_rows"),
            ("test_seasons", "n_test_rows"),
        ):
            expect = sum(by_season.get(s, 0) for s in f[key])
            if f[field] != expect:
                fail(
                    f"fold {f['fold']!r}: {field}={f[field]} but its seasons "
                    f"{sorted(f[key])} hold {expect} rows in the rows file. "
                    "Manifest and rows file disagree; Lane 3 must resolve."
                )
        for s in f["train_seasons"] + f["val_seasons"] + f["test_seasons"]:
            if s not in by_season:
                warnings.append(f"fold {f['fold']!r}: season {s!r} has no rows")
    total = sum(by_season.values())
    if total != N_ROWS:
        fail(f"rows file totals {total}, expected {N_ROWS}")
    return warnings


def adjacent_pairs(rows: list[dict]) -> list[tuple[int, int]]:
    """Same-person consecutive seasons, person_id keyed, year-sorted."""
    by_person: dict[object, list[tuple[int, int]]] = {}
    for r in rows:
        by_person.setdefault(r["person_id"], []).append((r["year"], r["row"]))
    pairs: list[tuple[int, int]] = []
    for seq in by_person.values():
        seq.sort()
        for (y1, i1), (y2, i2) in zip(seq, seq[1:], strict=False):
            if y2 - y1 == 1:
                pairs.append((i1, i2))
    return pairs


def pairs_with_target_in(pairs: list[tuple[int, int]], rows: list[dict], seasons: set[str]) -> list[tuple[int, int]]:
    return [(a, b) for (a, b) in pairs if rows[b]["season"] in seasons]


def new_player_rows(rows: list[dict], train_seasons: set[str]) -> set[int]:
    """Rows whose person_id has no earlier-season row in the training
    portion of the fold (contract 2a). 'Earlier' is by season-start year
    and, for the debut row itself, by absence from the train seasons."""
    train_persons = {r["person_id"] for r in rows if r["season"] in train_seasons}
    out: set[int] = set()
    for r in rows:
        if r["person_id"] not in train_persons:
            # A row counts as new-player only if it is that person's
            # earliest row overall: otherwise a mid-career row of a
            # never-trained player would be mislabelled.
            earliest = min(x["year"] for x in rows if x["person_id"] == r["person_id"])
            if r["year"] == earliest:
                out.add(r["row"])
    return out


def _rank_of_target(sims: np.ndarray, query: int, target: int) -> int:
    """Pessimistic rank of target among all rows except the query."""
    t = sims[target]
    greater = int(np.count_nonzero(sims > t))
    # sims[query] is 1.0 (self); it must not count for or against.
    if sims[query] > t:
        greater -= 1
    equal_other = int(np.count_nonzero(sims == t)) - 1  # exclude target
    if sims[query] == t:
        equal_other -= 1
    return 1 + greater + equal_other


def retrieval_metrics(
    X: np.ndarray,
    pairs: list[tuple[int, int]],
    chunk: int = 512,
) -> dict:
    """Exhaustive adjacent-season retrieval over the full space."""
    if not pairs:
        return {"n_pairs": 0, "top1": None, "recall_at_10": None}
    by_source: dict[int, list[int]] = {}
    for a, b in pairs:
        by_source.setdefault(a, []).append(b)
    sources = sorted(by_source)
    top1_hits = 0
    r10_hits = 0
    for s in range(0, len(sources), chunk):
        block = sources[s : s + chunk]
        S = X[block] @ X.T  # (len(block), N_ROWS), float64 cosines
        for j, q in enumerate(block):
            sims = S[j]
            for b in by_source[q]:
                rank = _rank_of_target(sims, q, b)
                if rank == 1:
                    top1_hits += 1
                if rank <= K:
                    r10_hits += 1
    n = len(pairs)
    return {"n_pairs": n, "top1": top1_hits / n, "recall_at_10": r10_hits / n}


def nn_cosine_stats(X: np.ndarray, query_rows: list[int], chunk: int = 512) -> dict:
    """Nearest-neighbour cosine stats for query rows, self excluded."""
    if not query_rows:
        return {"n_queries": 0, "top1_mean": None, "top1_std": None,
                "top1_p5": None, "top1_p50": None, "top1_p95": None,
                "top10_mean": None, "frac_top1_ge_0_999": None}
    top1: list[float] = []
    top10: list[float] = []
    for s in range(0, len(query_rows), chunk):
        block = query_rows[s : s + chunk]
        S = X[block] @ X.T
        for j, q in enumerate(block):
            sims = S[j].copy()
            sims[q] = -np.inf
            part = np.argpartition(-sims, K)[:K]
            vals = np.sort(sims[part])[::-1]
            top1.append(float(vals[0]))
            top10.append(float(vals.mean()))
    a = np.asarray(top1, dtype=float)
    return {
        "n_queries": len(query_rows),
        "top1_mean": float(a.mean()),
        "top1_std": float(a.std()),
        "top1_p5": float(np.percentile(a, 5)),
        "top1_p50": float(np.percentile(a, 50)),
        "top1_p95": float(np.percentile(a, 95)),
        "top10_mean": float(np.mean(top10)),
        "frac_top1_ge_0_999": float((a >= 0.999).mean()),
    }


def pessimistic_topk_set(sims: np.ndarray, query: int) -> list[int]:
    """Top-10 SET under pessimistic ties, ordered by (-sim, row) for ranks."""
    order = np.argsort(-sims, kind="stable")
    out: list[int] = []
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and sims[order[j + 1]] == sims[order[i]]:
            j += 1
        group = [int(r) for r in order[i : j + 1] if int(r) != query]
        if group:
            # Pessimistic rank of the group = 1 + #strictly greater
            # rows (excluding the query) + #other rows tied with it.
            v = sims[group[0]]
            greater = int(np.count_nonzero(sims > v)) - (1 if sims[query] > v else 0)
            equal_other = int(np.count_nonzero(sims == v)) - len(group) - (1 if sims[query] == v else 0)
            rank = 1 + greater + equal_other
            if rank <= K:
                out.extend(group)
        i = j + 1
        if len(out) >= K:
            break
    return out[:K]


def topk_map(X: np.ndarray, query_rows: list[int], chunk: int = 512) -> dict[int, list[int]]:
    out: dict[int, list[int]] = {}
    for s in range(0, len(query_rows), chunk):
        block = query_rows[s : s + chunk]
        S = X[block] @ X.T
        for j, q in enumerate(block):
            out[q] = pessimistic_topk_set(S[j], q)
    return out


def _rank_avg(values: list[float]) -> list[float]:
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        avg = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    return ranks


def spearman(x: list[float], y: list[float]) -> float:
    n = len(x)
    if n < 2:
        return 0.0
    rx, ry = _rank_avg(x), _rank_avg(y)
    mx, my = sum(rx) / n, sum(ry) / n
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry, strict=True))
    den = math.sqrt(sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry))
    return num / den if den else 0.0


def twin_agreement(
    champ_topk: dict[int, list[int]],
    chal_topk: dict[int, list[int]],
) -> dict:
    """Hit-rate@10, mean overlap +- std, shared-pair Spearman.

    Random baseline for orientation only: two random 10-sets drawn
    from 12,965 candidates share 10 * 10 / 12965 ~= 0.0077 rows in
    expectation, so a random hit-rate@10 (overlap / 10) is ~= 0.0008.
    A measured 0.07 is therefore roughly 90x random, not near-random.
    """
    hits: list[float] = []
    rhos: list[float] = []
    for q, A in champ_topk.items():
        if q not in chal_topk:
            continue
        B = chal_topk[q]
        set_b = set(B)
        inter = [a for a in A if a in set_b]
        hits.append(len(inter) / K)
        if len(inter) >= 2:
            ra = {a: r for r, a in enumerate(A)}
            rb = {b: r for r, b in enumerate(B)}
            rhos.append(spearman([ra[a] for a in inter], [rb[a] for a in inter]))
    if not hits:
        return {"n_queries": 0, "hit_rate_at_10_mean": None,
                "hit_rate_at_10_std": None, "shared_pair_spearman_mean": None,
                "shared_pair_spearman_n": 0}
    mean = sum(hits) / len(hits)
    std = (sum((h - mean) ** 2 for h in hits) / len(hits)) ** 0.5
    return {
        "n_queries": len(hits),
        "hit_rate_at_10_mean": mean,
        "hit_rate_at_10_std": std,
        "shared_pair_spearman_mean": (sum(rhos) / len(rhos)) if rhos else None,
        "shared_pair_spearman_n": len(rhos),
    }


def continuity_tables(X: np.ndarray, pairs: list[tuple[int, int]], rows: list[dict]) -> dict:
    """Per-boundary mean same-player cosine; global spread over modern
    boundaries (train_mtnn.continuity_report convention)."""
    by_boundary: dict[int, list[float]] = {}
    for a, b in pairs:
        sim = float(X[a] @ X[b])
        by_boundary.setdefault(rows[a]["year"], []).append(sim)
    table: dict[str, dict] = {}
    for y in sorted(by_boundary):
        vals = by_boundary[y]
        if len(vals) >= MIN_PAIRS_PER_BOUNDARY:
            table[str(y)] = {"n_pairs": len(vals), "mean_cosine": float(np.mean(vals))}
    modern = [v["mean_cosine"] for y, v in table.items() if int(y) >= MODERN_YEAR]
    spread = (max(modern) - min(modern)) if len(modern) >= 2 else None
    return {"by_transition": table, "modern_spread": spread, "n_modern_boundaries": len(modern)}


def evaluate_embeddings(
    X: np.ndarray,
    rows: list[dict],
    pairs: list[tuple[int, int]],
    folds: list[dict],
    frozen_test_seasons: set[str],
) -> dict:
    """The single metric implementation, shared by both models."""
    cont = continuity_tables(X, pairs, rows)
    out: dict = {
        "continuity_global": {
            "modern_spread": cont["modern_spread"],
            "n_modern_boundaries": cont["n_modern_boundaries"],
            "by_transition": cont["by_transition"],
        },
        "folds": {},
    }
    # Per-split continuity spreads, computed from boundary means whose
    # target season falls in the split.
    def split_spread_for(seasons: set[str]) -> float | None:
        by_b: dict[int, list[float]] = {}
        for a, b in pairs:
            if rows[b]["season"] in seasons:
                by_b.setdefault(rows[a]["year"], []).append(float(X[a] @ X[b]))
        means = [float(np.mean(v)) for v in by_b.values() if len(v) >= MIN_PAIRS_PER_BOUNDARY]
        return (max(means) - min(means)) if len(means) >= 2 else None

    for fold in folds:
        sets = season_sets(fold)
        entry: dict = {}
        for split_name in ("val", "test"):
            seasons = sets[split_name]
            if not seasons:
                entry[split_name] = None
                continue
            split_pairs = pairs_with_target_in(pairs, rows, seasons)
            query_rows = [r["row"] for r in rows if r["season"] in seasons]
            entry[split_name] = {
                "seasons": sorted(seasons),
                "retrieval": retrieval_metrics(X, split_pairs),
                "nn_cosine": nn_cosine_stats(X, query_rows),
                "continuity_split_spread": split_spread_for(seasons),
            }
        # New-player slice for this fold: debut rows (person absent
        # from the fold's training seasons) whose season is in the
        # fold's val or test seasons, scored on pairs whose target
        # season is outside the fold's training seasons (held-out
        # targets for this fold). Train-window debut pairs are
        # excluded: they were training positives, not held-out scores.
        debut_rows = new_player_rows(rows, sets["train"])
        fold_new_rows = {
            r for r in debut_rows
            if rows[r]["season"] in (sets["val"] | sets["test"])
        }
        new_pairs = [
            (a, b) for (a, b) in pairs
            if a in fold_new_rows and rows[b]["season"] not in sets["train"]
        ]
        entry["new_player"] = {
            "train_seasons": sorted(sets["train"]),
            "n_new_rows": len(fold_new_rows),
            "n_new_pairs": len(new_pairs),
            "retrieval": retrieval_metrics(X, new_pairs),
        }
        out["folds"][str(fold["fold"])] = entry
    # Frozen test as its own entry (the gated test cohort), even when
    # it also appears as some fold's test split.
    frozen_pairs = pairs_with_target_in(pairs, rows, frozen_test_seasons)
    frozen_queries = [r["row"] for r in rows if r["season"] in frozen_test_seasons]
    out["frozen_test"] = {
        "seasons": sorted(frozen_test_seasons),
        "retrieval": retrieval_metrics(X, frozen_pairs),
        "nn_cosine": nn_cosine_stats(X, frozen_queries),
        "continuity_split_spread": split_spread_for(frozen_test_seasons),
    }
    # Frozen-test new-player slice. Reference = the union of all
    # folds' training seasons (everything the expanding-window
    # procedure ever trained on before the frozen test). Two numbers,
    # kept apart:
    #  * frozen debut rows: frozen-test rows whose person is absent
    #    from the reference and whose season is their debut season.
    #    These have no next season in the file, so their retrieval
    #    is null by construction -- reported, never 0.
    #  * cold-start transitions: pairs whose TARGET is in the frozen
    #    test and whose SOURCE person is absent from the reference
    #    (players who debuted after the training window, e.g. in the
    #    val window, retrieving their frozen-test season). This is
    #    the frozen-test cold-start number that actually exists.
    ref_train: set[str] = set()
    for f in folds:
        ref_train.update(f["train_seasons"])
    ref_persons = {r["person_id"] for r in rows if r["season"] in ref_train}
    frozen_debut_rows = {
        r["row"] for r in rows
        if r["season"] in frozen_test_seasons
        and r["person_id"] not in ref_persons
        and r["year"] == min(x["year"] for x in rows if x["person_id"] == r["person_id"])
    }
    cold_pairs = [
        (a, b) for (a, b) in pairs
        if rows[b]["season"] in frozen_test_seasons
        and rows[a]["person_id"] not in ref_persons
    ]
    out["frozen_test"]["new_player"] = {
        "reference_train_seasons": sorted(ref_train),
        "n_frozen_debut_rows": len(frozen_debut_rows),
        "frozen_debut_retrieval": None,
        "frozen_debut_note": (
            "Null by construction: a frozen-test debut has no next "
            "season in the file, so it has no pair to retrieve."
        ),
        "n_cold_start_pairs": len(cold_pairs),
        "cold_start_retrieval": retrieval_metrics(X, cold_pairs),
    }
    return out


def evaluate_twin_agreement_all(
    champ_X: dict[int, np.ndarray],
    chal_X: dict[int, np.ndarray],
    rows: list[dict],
    folds: list[dict],
    frozen_test_seasons: set[str],
) -> dict:
    """Twin agreement per prefix. Champion reference is ALWAYS the
    champion 64-d top-10 (the prior eval's convention); the challenger
    varies by prefix. Cohort rows are the split's own rows."""
    out: dict = {}
    champ64 = topk_map(champ_X[64], [r["row"] for r in rows])
    cohorts: dict[str, list[int]] = {}
    for fold in folds:
        for split_name in ("val", "test"):
            seasons = season_sets(fold)[split_name]
            if seasons:
                cohorts[f"{fold['fold']}_{split_name}"] = [
                    r["row"] for r in rows if r["season"] in seasons
                ]
    cohorts["frozen_test"] = [r["row"] for r in rows if r["season"] in frozen_test_seasons]
    for m in PREFIXES:
        chal_map_full = topk_map(chal_X[m], [r["row"] for r in rows])
        per: dict[str, dict] = {}
        for name, qs in cohorts.items():
            per[name] = twin_agreement(
                {q: champ64[q] for q in qs}, {q: chal_map_full[q] for q in qs}
            )
        out[str(m)] = per
    return out


def cross_check_champion_twins(path: Path, champ_X64: np.ndarray, rows: list[dict]) -> list[str]:
    """Optional cross-check of an external champion-twins file against
    freshly computed champion 64-d twins. Gated numbers always use the
    computed twins; a mismatch here warns, it never overrides them."""
    warnings: list[str] = []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        twins = data["twins"]
    except Exception as exc:  # noqa: BLE001 -- any unreadable file warns, not fails
        return [f"champion-twins cross-check skipped: unreadable file ({exc})"]
    queries = [int(q) for q in twins if int(q) < N_ROWS]
    computed = topk_map(champ_X64, queries)
    mism = sum(1 for q in queries if set(computed[q]) != set(int(x) for x in twins[str(q)]))
    if mism:
        warnings.append(
            f"champion-twins file disagrees with recomputed champion twins "
            f"on {mism}/{len(queries)} queries (tie handling and/or stale "
            f"file). Gated twin agreement uses the recomputed twins."
        )
    return warnings


def promotion_gate(
    champ: dict, chal: dict, twin_frozen: dict, era: dict | None
) -> dict:
    """Gate at 64-d only. Primary metrics: top-1, recall@10,
    continuity_spread_global (lower better). Each must beat the champion
    on Fold 1 val, Fold 2 val AND the frozen test. Twin agreement is
    not gated (distillation ceiling). 16-d retention is a separate
    serving-unification check, not a promotion check."""
    checks: list[dict] = []
    all_pass = True

    def check(split_label: str, c_ret: dict, h_ret: dict) -> None:
        nonlocal all_pass
        for metric, better in (("top1", "higher"), ("recall_at_10", "higher")):
            c, h = c_ret.get(metric), h_ret.get(metric)
            passed = c is not None and h is not None and (c > h if better == "higher" else c < h)
            if not passed:
                all_pass = False
            checks.append({"split": split_label, "metric": metric,
                           "challenger": c, "champion": h, "pass": bool(passed)})

    # Val checks use the first two folds that carry a val split, in
    # manifest order; the operator must confirm they are Fold 1 / Fold 2.
    val_folds = [k for k, v in chal["folds"].items() if v.get("val")]
    for k in val_folds[:2]:
        check(f"val:{k}", chal["folds"][k]["val"]["retrieval"], champ["folds"][k]["val"]["retrieval"])
    check("frozen_test", chal["frozen_test"]["retrieval"], champ["frozen_test"]["retrieval"])
    # Continuity: one global number per model at 64-d (see module docstring).
    c_spread = chal["continuity_global"]["modern_spread"]
    h_spread = champ["continuity_global"]["modern_spread"]
    cont_pass = c_spread is not None and h_spread is not None and c_spread < h_spread
    if not cont_pass:
        all_pass = False
    checks.append({"split": "global", "metric": "continuity_spread_global",
                   "challenger": c_spread, "champion": h_spread, "pass": bool(cont_pass)})
    # Collapse watch (flag, not a primary metric, but it blocks a
    # PROMOTE-CANDIDATE recommendation: a collapsed space must not ship).
    # Checked on every val fold's NN stats and the frozen test's.
    collapse = False
    nn_blocks: list[dict] = [chal["frozen_test"]["nn_cosine"]]
    for v in chal["folds"].values():
        if v.get("val"):
            nn_blocks.append(v["val"]["nn_cosine"])
    for nn in nn_blocks:
        if nn and nn["top1_mean"] is not None and (nn["top1_mean"] >= 0.99 or nn["top1_std"] <= 0.01):
            collapse = True
    if collapse:
        all_pass = False
    # 16-d retention: challenger-16 top-1 / challenger-64 top-1, per split.
    retention: dict[str, float | None] = {}
    # Filled by the caller (needs all prefixes); placeholder replaced below.
    reasons: list[str] = []
    if not all_pass:
        reasons.append("At least one primary check failed; see checks.")
    if collapse:
        reasons.append("Collapse watch fired (NN top-1 cosine mean >= 0.99 or std <= 0.01).")
    decision = "PROMOTE-CANDIDATE (needs the user's separate word)" if all_pass else "RESEARCH-ONLY"
    if era is not None and era.get("leak_flag"):
        decision = "RESEARCH-ONLY"
        reasons.append("Mask-ablation era test flagged an era leak; see era_test.")
    return {"checks": checks, "collapse_watch": collapse, "retention_16d": retention,
            "decision_recommendation": decision, "reasons": reasons}


def retention_report(chal_by_prefix: dict[int, dict]) -> dict:
    """16-d retention per split: challenger top-1 at 16-d divided by
    challenger top-1 at 64-d. Earns the serving-unification story only
    when >= 0.90 on every val fold AND the frozen test."""
    out: dict[str, dict] = {}
    split_labels: list[str] = [f"val:{k}" for k, v in chal_by_prefix[64]["folds"].items() if v.get("val")]
    split_labels.append("frozen_test")
    for label in split_labels:
        if label.startswith("val:"):
            k = label.split(":", 1)[1]
            top64 = chal_by_prefix[64]["folds"][k]["val"]["retrieval"]["top1"]
            top16 = chal_by_prefix[16]["folds"][k]["val"]["retrieval"]["top1"]
            rec64 = chal_by_prefix[64]["folds"][k]["val"]["retrieval"]["recall_at_10"]
            rec16 = chal_by_prefix[16]["folds"][k]["val"]["retrieval"]["recall_at_10"]
        else:
            top64 = chal_by_prefix[64]["frozen_test"]["retrieval"]["top1"]
            top16 = chal_by_prefix[16]["frozen_test"]["retrieval"]["top1"]
            rec64 = chal_by_prefix[64]["frozen_test"]["retrieval"]["recall_at_10"]
            rec16 = chal_by_prefix[16]["frozen_test"]["retrieval"]["recall_at_10"]
        out[label] = {
            "top1_retention_16d": (top16 / top64) if top64 else None,
            "recall_at_10_retention_16d": (rec16 / rec64) if rec64 else None,
            "top1_64d": top64, "top1_16d": top16,
        }
    vals = [v["top1_retention_16d"] for v in out.values() if v["top1_retention_16d"] is not None]
    out["serving_unification_earned"] = bool(vals) and all(v >= 0.90 for v in vals)
    return out


def ablation_report(
    ablate_dir: Path, full_chal_64: np.ndarray, full_chal_16: np.ndarray,
    rows: list[dict], pairs: list[tuple[int, int]], folds: list[dict],
    frozen_test_seasons: set[str],
) -> dict:
    """Per-family contribution: ablated minus full, at 64-d (primary)
    and 16-d (top-1/recall only). A family 'helps' when masking it lowers
    top-1 on every val fold AND the frozen test; 'hurts' when masking
    raises it everywhere; otherwise 'mixed'. Single-run deltas: no
    paired t-test is claimed (tower_ablation.py's paired-t needs seeds;
    this mode has one embedding per arm)."""
    files = sorted(ablate_dir.glob("*.f32")) if ablate_dir.exists() else []
    full64 = evaluate_embeddings(full_chal_64, rows, pairs, folds, frozen_test_seasons)
    full16 = evaluate_embeddings(full_chal_16, rows, pairs, folds, frozen_test_seasons)

    def top1s(res: dict) -> dict[str, float | None]:
        d = {f"val:{k}": v["val"]["retrieval"]["top1"] for k, v in res["folds"].items() if v.get("val")}
        d["frozen_test"] = res["frozen_test"]["retrieval"]["top1"]
        return d

    base64, base16 = top1s(full64), top1s(full16)
    base_cont = full64["continuity_global"]["modern_spread"]
    out: dict = {"arms": {}, "note": "Ablated files must come from the same encoder with one family masked at inference; this script never encodes."}
    for f in files:
        fam = f.stem
        if fam not in FAMILIES:
            out["arms"][fam] = {"error": "filename is not one of the 17 contract families; skipped"}
            continue
        E = load_f32(f, f"ablated {fam}")
        ab64 = evaluate_embeddings(slice_and_normalize(E, 64), rows, pairs, folds, frozen_test_seasons)
        ab16 = evaluate_embeddings(slice_and_normalize(E, 16), rows, pairs, folds, frozen_test_seasons)
        a64, a16 = top1s(ab64), top1s(ab16)
        deltas = {k: ((a64[k] - base64[k]) if (a64[k] is not None and base64[k] is not None) else None) for k in base64}
        deltas16 = {k: ((a16[k] - base16[k]) if (a16[k] is not None and base16[k] is not None) else None) for k in base16}
        vals = [v for v in deltas.values() if v is not None]
        verdict = "mixed"
        if vals and all(v < 0 for v in vals):
            verdict = "family helps (masking hurts retrieval everywhere)"
        elif vals and all(v > 0 for v in vals):
            verdict = "family hurts (masking helps retrieval everywhere)"
        out["arms"][fam] = {
            "top1_delta_64d": deltas, "top1_delta_16d": deltas16,
            "continuity_spread_64d": ab64["continuity_global"]["modern_spread"],
            "continuity_spread_delta_64d": (
                (ab64["continuity_global"]["modern_spread"] - base_cont)
                if (ab64["continuity_global"]["modern_spread"] is not None and base_cont is not None) else None
            ),
            "contribution": verdict,
        }
    return out


def daily_court_twins(X: np.ndarray, rows: list[dict]) -> dict[int, list[int]]:
    """Daily Court twin lists: top-10 excluding self AND the whole
    person (PR #194 rule), pessimistic ties. Used for the era test and
    the spot-check candidates -- NOT for the headline twin-agreement
    metrics, which follow the prior eval (self excluded only)."""
    out: dict[int, list[int]] = {}
    for s in range(0, N_ROWS, 512):
        block = list(range(s, min(s + 512, N_ROWS)))
        S = X[block] @ X.T
        for j, q in enumerate(block):
            sims = S[j].copy()
            sims[q] = -np.inf
            for r in rows:
                if r["person_id"] == rows[q]["person_id"]:
                    sims[r["row"]] = -np.inf
            order = np.argsort(-sims, kind="stable")
            picked: list[int] = []
            i = 0
            while i < len(order) and len(picked) < K:
                v = sims[order[i]]
                if v == -np.inf:
                    break
                j2 = i
                while j2 + 1 < len(order) and sims[order[j2 + 1]] == v:
                    j2 += 1
                group = [int(r) for r in order[i : j2 + 1]]
                # Pessimistic: include the group only if its worst rank <= 10.
                if len(picked) + len(group) <= K:
                    picked.extend(group)
                # If the group straddles the boundary, pessimism drops it.
                i = j2 + 1
            out[q] = picked
    return out


def era_test(
    base_X: np.ndarray, masked_X: np.ndarray, rows: list[dict],
    present_from_year: int, label: str,
) -> dict:
    """Mask-ablation era test for one family. Queries: modern rows
    where the family was present (season-start >= present_from_year).
    Twins exclude the whole person. Era = mean season-start year of
    the top-10 twins; bucket = era_bucket of each twin's year."""
    base_twins = daily_court_twins(base_X, rows)
    masked_twins = daily_court_twins(masked_X, rows)
    queries = [r["row"] for r in rows if r["year"] >= present_from_year]
    shifts: list[float] = []
    signed: list[float] = []
    bucket_changes = 0
    older = 0
    for q in queries:
        b = base_twins[q]
        m = masked_twins[q]
        if not b or not m:
            continue
        mean_b = float(np.mean([rows[t]["year"] for t in b]))
        mean_m = float(np.mean([rows[t]["year"] for t in m]))
        signed.append(mean_m - mean_b)
        shifts.append(abs(mean_m - mean_b))
        if mean_m < mean_b:
            older += 1
        mode_b = max(set(era_bucket(rows[t]["year"]) for t in b),
                     key=lambda bk: sum(1 for t in b if era_bucket(rows[t]["year"]) == bk))
        mode_m = max(set(era_bucket(rows[t]["year"]) for t in m),
                     key=lambda bk: sum(1 for t in m if era_bucket(rows[t]["year"]) == bk))
        if mode_b != mode_m:
            bucket_changes += 1
    n = len(shifts)
    return {
        "family": label,
        "present_from_year": present_from_year,
        "n_queries": n,
        "mean_abs_era_shift_years": (float(np.mean(shifts)) if n else None),
        "frac_shift_ge_5_years": (float(np.mean([s >= 5.0 for s in shifts])) if n else None),
        "frac_modal_bucket_changed": (bucket_changes / n if n else None),
        "frac_shifted_older": (older / n if n else None),
        "mean_signed_shift_years": (float(np.mean(signed)) if n else None),
    }


def spot_check_candidates(
    chal_X64: np.ndarray, champ_X64: np.ndarray, rows: list[dict],
    frozen_test_seasons: set[str], n: int = 20, seed: int = 7,
) -> list[dict]:
    """Deterministic 20-query spot-check slate from the frozen test,
    stratified by era bucket x position (falling back to era only when
    no position field exists). Twins follow the Daily Court rule
    (whole person excluded). Reviewer fields are left blank for the
    human eyeball test; see EVAL_PROTOCOL.md section 11."""
    rng = np.random.default_rng(seed)
    chal_twins = daily_court_twins(chal_X64, rows)
    champ_twins = daily_court_twins(champ_X64, rows)
    pool = [r for r in rows if r["season"] in frozen_test_seasons]
    strata: dict[tuple, list[dict]] = {}
    for r in pool:
        key = (era_bucket(r["year"]), str(r["position"]) if r["position"] is not None else "unknown")
        strata.setdefault(key, []).append(r)
    keys = sorted(strata)
    chosen: list[dict] = []
    per = max(1, n // max(1, len(keys)))
    for key in keys:
        members = strata[key][:]
        rng.shuffle(members)
        chosen.extend(members[:per])
    if len(chosen) < n:
        rest = [r for r in pool if r not in chosen]
        rng.shuffle(rest)
        chosen.extend(rest[: n - len(chosen)])
    chosen = chosen[:n]

    def twin_line(twins: dict[int, list[int]], q: int) -> dict | None:
        if not twins[q]:
            return None
        t = twins[q][0]
        return {"name": rows[t]["name"], "season": rows[t]["season"],
                "person_id": str(rows[t]["person_id"]),
                "cosine": float(chal_X64[q] @ chal_X64[t]) if twins is chal_twins else float(champ_X64[q] @ champ_X64[t])}

    out = []
    for r in chosen:
        q = r["row"]
        out.append({
            "query": {"name": r["name"], "season": r["season"], "person_id": str(r["person_id"])},
            "challenger_top1_daily_court_twin": twin_line(chal_twins, q),
            "champion_top1_daily_court_twin": twin_line(champ_twins, q),
            "reviewer_verdict": "",  # PASS / FAIL / HARD-FAIL -- human fills in
            "reviewer_notes": "",
        })
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="MTNN v7 challenger-vs-champion eval (draft).")
    ap.add_argument("--champion", required=True, help="champion .f32 (12966x64)")
    ap.add_argument("--challenger", required=True, help="challenger .f32 (12966x64, versioned filename)")
    ap.add_argument("--rows", required=True, help="person_id-enriched rows JSON (see module docstring)")
    ap.add_argument("--fold-manifest", required=True, help="Lane 3 fold manifest JSON (contract 2a)")
    ap.add_argument("--run-report", default=None, help="Lane 4 training run report JSON (contract 2c, optional)")
    ap.add_argument("--champion-twins", default=None, help="external champion-twins JSON for cross-check only")
    ap.add_argument("--out", required=True, help="output directory (created)")
    ap.add_argument("--ablate-dir", default=None, help="directory of <family>.f32 inference-masked embeddings")
    ap.add_argument("--era-masked-tracking", default=None, help="challenger .f32 with tracking masked on modern rows")
    ap.add_argument("--era-masked-form", default=None, help="challenger .f32 with form masked on modern rows")
    ap.add_argument("--era-masked-control", default=None, help="challenger .f32 with a control family masked")
    ap.add_argument("--spot-check-out", default=None, help="path for spot_check_candidates.json")
    ap.add_argument("--seed", type=int, default=7, help="seed for spot-check sampling only (default 7)")
    args = ap.parse_args(argv)

    champ_E = load_f32(Path(args.champion), "champion")
    chal_E = load_f32(Path(args.challenger), "challenger")
    rows = load_rows(Path(args.rows))
    folds = load_manifest(Path(args.fold_manifest))
    warnings = check_manifest_counts(folds, rows)
    pairs = adjacent_pairs(rows)
    frozen = set()
    for f in folds:
        if f["test_seasons"] == ["2025-26"]:
            frozen = set(f["test_seasons"])
    if not frozen:
        # Fall back to the union of test seasons only if no fold pins the
        # frozen test exactly; the report flags this as non-standard.
        frozen = set().union(*[set(f["test_seasons"]) for f in folds]) if folds else set()
        warnings.append("No fold pins test_seasons == ['2025-26']; frozen test taken as the union of test seasons -- non-standard, resolve with Lane 3.")

    run_report = None
    if args.run_report:
        run_report = json.loads(Path(args.run_report).read_text(encoding="utf-8"))
        man_sha = sha256_file(Path(args.fold_manifest))
        if run_report.get("fold_manifest_sha256") not in (None, man_sha):
            fail("training run report fold_manifest_sha256 does not match the manifest passed to eval -- wrong folds, wrong eval.")

    champ_by_prefix = {m: slice_and_normalize(champ_E, m) for m in PREFIXES}
    chal_by_prefix = {m: slice_and_normalize(chal_E, m) for m in PREFIXES}
    champ_res = {m: evaluate_embeddings(champ_by_prefix[m], rows, pairs, folds, frozen) for m in PREFIXES}
    chal_res = {m: evaluate_embeddings(chal_by_prefix[m], rows, pairs, folds, frozen) for m in PREFIXES}
    twin = evaluate_twin_agreement_all(champ_by_prefix, chal_by_prefix, rows, folds, frozen)
    if args.champion_twins:
        warnings.extend(cross_check_champion_twins(Path(args.champion_twins), champ_by_prefix[64], rows))

    era: dict | None = None
    if args.era_masked_tracking or args.era_masked_form or args.era_masked_control:
        era = {"arms": {}}
        base64 = chal_by_prefix[64]
        if args.era_masked_tracking:
            era["arms"]["tracking"] = era_test(base64, slice_and_normalize(load_f32(Path(args.era_masked_tracking), "era-masked tracking"), 64), rows, TRACKING_START_YEAR, "tracking")
        if args.era_masked_form:
            era["arms"]["form"] = era_test(base64, slice_and_normalize(load_f32(Path(args.era_masked_form), "era-masked form"), 64), rows, FORM_START_YEAR, "form")
        if args.era_masked_control:
            era["arms"]["control"] = era_test(base64, slice_and_normalize(load_f32(Path(args.era_masked_control), "era-masked control"), 64), rows, TRACKING_START_YEAR, "control")
        # Leak flag: a masked family shifts eras far more than the control.
        tr = era["arms"].get("tracking", {}).get("frac_shift_ge_5_years")
        fo = era["arms"].get("form", {}).get("frac_shift_ge_5_years")
        ct = era["arms"].get("control", {}).get("frac_shift_ge_5_years")
        era["leak_flag"] = False
        if ct is not None:
            for v in (tr, fo):
                if v is not None and v - ct > 0.20:
                    era["leak_flag"] = True
        elif tr is not None and tr > 0.30:
            era["leak_flag"] = True  # no control supplied: absolute fallback bar
        era["leak_flag_note"] = ("Without a control arm the flag uses an absolute 0.30 bar; "
                                 "with a control arm it uses masked-minus-control > 0.20. "
                                 "See EVAL_PROTOCOL.md section 9.")

    ablations = None
    if args.ablate_dir:
        ablations = ablation_report(Path(args.ablate_dir), chal_by_prefix[64], chal_by_prefix[16],
                                    rows, pairs, folds, frozen)

    gate = promotion_gate(champ_res[64], chal_res[64], twin["64"]["frozen_test"], era)
    gate["retention_16d"] = retention_report(chal_res)
    if not gate["retention_16d"]["serving_unification_earned"]:
        gate["reasons"].append("16-d retention below 0.90 on at least one split: the separate 14-d projection stays; serving unification is NOT earned.")
    if era is None:
        gate["reasons"].append("Era test not run: any PROMOTE-CANDIDATE recommendation is conditional on a clean era test.")
    if args.spot_check_out is None:
        gate["reasons"].append("Spot-check slate not generated: any PROMOTE-CANDIDATE recommendation is conditional on the 20-pair eyeball test.")

    report = {
        "eval": "eval_mtnn_v7 (Lane 5 draft)",
        "champion": {"path": args.champion, "sha256": sha256_file(Path(args.champion)),
                     "model": "mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256", "rows": N_ROWS, "dim": DIM},
        "challenger": {"path": args.challenger, "sha256": sha256_file(Path(args.challenger))},
        "rows_file": {"path": args.rows, "sha256": sha256_file(Path(args.rows))},
        "fold_manifest": {"path": args.fold_manifest, "sha256": sha256_file(Path(args.fold_manifest))},
        "run_report": ({"seed": run_report.get("seed"), "config": run_report.get("config"),
                        "feature_matrix_sha256": run_report.get("feature_matrix_sha256")}
                       if run_report else None),
        "warnings": warnings,
        "champion_by_prefix": champ_res,
        "challenger_by_prefix": chal_res,
        "twin_agreement": twin,
        "promotion_gate_64d": gate,
        "tower_ablations": ablations,
        "era_test": era,
        "notes": [
            "Gate compares challenger vs champion measured in this run, same code path. Old anchors (top-1 0.118, continuity 0.176) are context only.",
            "Twin agreement is a guardrail, not a gate metric (distillation ceiling: v6 cannot beat v5 on v5's own twins).",
            "This report is a RECOMMENDATION. Promotion itself needs the user's separate word (contract 2d).",
        ],
    }
    outdir = Path(args.out)
    outdir.mkdir(parents=True, exist_ok=True)
    (outdir / "eval_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    if args.spot_check_out:
        cands = spot_check_candidates(chal_by_prefix[64], champ_by_prefix[64], rows, frozen, seed=args.seed)
        Path(args.spot_check_out).write_text(json.dumps({"candidates": cands, "n": len(cands)}, indent=2), encoding="utf-8")
        print(f"spot-check candidates: {args.spot_check_out} ({len(cands)} queries)")
    print(f"eval report: {outdir / 'eval_report.json'}")
    print(f"promotion recommendation: {gate['decision_recommendation']}")
    print(f"serving unification earned (16-d >= 90% of 64-d top-1 everywhere): {gate['retention_16d']['serving_unification_earned']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

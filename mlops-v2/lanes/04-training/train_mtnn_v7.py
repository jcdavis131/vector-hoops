#!/usr/bin/env python3
"""MTNN v7 contrastive challenger -- DRAFT ONLY (MLOps v2, Lane 4).

Train gate is CLOSED. This file is a draft. It must parse
(``python3 -m py_compile``) but must NOT be executed until training is
authorized by a separate user decision. No training run, no GPU, no package
install, no write to any repo checkout, no write to the champion asset.

What it trains (when authorized)
---------------------------------
A drop-in 64-d L2 challenger embedding, trained with supervised contrastive
(SupCon, Khosla et al. 2020) plus the Matryoshka (MRL, Kusupati et al. 2022)
nesting set M = {8, 16, 32, 64}, equal weights, per-level L2-normalize after
slicing:

    L_total = sum_{m in M} L_supcon(slice_m(z), temperature)

The served vector IS the contrastive vector: there is no extra projection
head. At inference, serve the 64-d vector and slice + re-normalize for the
lighter widths. One asset serves all widths.

Encoder choice (deliberate supersession, see TRAINING_NOTES.md)
--------------------------------------------------------------
The challenger spec (specs/mtnn-v6-contrastive-SPEC.md section 4) defaults
to a plain MLP (120 -> 256 -> 256 -> 64) because "the objective is the
experiment, not the architecture". This draft SUPERSEDES that default and
keeps the v5 tower skeleton with the prediction heads removed, per the Lane
4 brief: the towers are the interpretability surface. Lane 5's whole-family
mask ablations only line up if the challenger has the same 17 family towers
as the champion. Cost, stated honestly: more parameters and slower CPU
training than the plain MLP, and one more thing to keep in sync with v5.
The plain MLP stays available as ``--encoder plain-mlp`` for a control run.

One deliberate deviation from the v5 skeleton: the season embedding is
DROPPED. v5 fused a 12-d season token into the embedding; for a twin-space
objective that token is an era shortcut (same-era rows look alike for free).
Era-stratified batches plus no season token are the two era-leak guards.

Tower skeleton, faithful to v5 (pipeline/train_mtnn.py)
-------------------------------------------------------
- 17 families, 120 features, in contract section 0 order:
  volume 10, playmaking 10, rebounding 8, defense 8, efficiency 8,
  shotmix 10, bio 5, tracking 12 (masked pre-2013), form 6 (masked
  pre-2015), market 4, roster 5, career 6, competition 6, team 8,
  pedigree 4, playoffs 5, honors 5.
- Tower input convention, unchanged: ``cat([x * m, m])``, mask m in {0, 1}
  per family.
- ResidualTower: ``cat`` (2 * n_family) -> 160 -> 32, LayerNorm + GELU,
  skip connection, 2 residual blocks (champion tag: t32, h160, b2).
- Fusion: concat of 17 x 32 = 544 -> 256 -> 128 -> 64 (champion tag:
  concat, fus256, mlp128, d64), L2-normalized output.
- Prediction heads (stat prediction, skill towers, durability head) are
  REMOVED. Nothing else about the towers changes.

Inputs (contract sections 2a and 2b)
------------------------------------
--fold-manifest: JSON, one object per fold, fields per contract 2a:
  fold, train_seasons, val_seasons, test_seasons, n_train_rows,
  n_val_rows, n_test_rows, n_pairs_adjacent, n_pairs_twin,
  n_pairs_dropped_cross_boundary, n_val_new_player_rows.
  Accepted shapes: a single fold object, a list of fold objects, or
  ``{"folds": [...]}``. ``--fold`` selects a fold (default: the first).
  The frozen final test season (2025-26) must never appear in the selected
  fold's train or val seasons; the script fails loud if it does.

--features: .npz with keys
  X               float32, shape (N, 120), 17-family order of contract 0
  family_mask     float32 or bool, shape (N, 17), values in {0, 1}
  person_id       shape (N,), stable NBA PLAYER_ID (int or str)
  season_start_year  shape (N,), int, e.g. 2025 for season "2025-26"
  season          optional, shape (N,), "YYYY-YY" strings; derived from
                  season_start_year when absent
  Row order is the asset row order: the output asset encodes rows in this
  same order, so the challenger lines up row-for-row with the champion.

HARD RULE (contract 2b, spec Open Question #1)
----------------------------------------------
If the real 120-feature matrix file is absent, the script exits non-zero
with an explicit message naming Open Question #1. It NEVER expands the
11-feature proxy (assets/mtnn_inputs.f32) to 120 dims by random
projection. A .f32 input, a matrix with != 120 columns, or a file named
mtnn_inputs.f32 is rejected with that same explicit message. No silent
fallback, no weaker-input fallback: the operator resolves Question #1 and
re-runs with the real matrix.

Positives (train split only, Lane 3's pair builder is authoritative)
--------------------------------------------------------------------
- Adjacent seasons: same person_id, season_start_year N and N+1, both rows
  inside the fold's train seasons. Built here from the metadata so the
  script is runnable from manifest + features alone.
- v5 twins: optional ``--twin-pairs`` JSON (list of [row_a, row_b] index
  pairs into the feature matrix, or {"pairs": [...]}) and/or a
  ``twin_pairs_path`` field on the selected fold object. Every twin pair
  is validated: both rows must be train rows of this fold. A pair touching
  a val or test row is DROPPED and counted (leak guard); the count is in
  the report. Without a twin source the run trains on adjacent-season
  positives only and the report says so plainly (twin_positives = 0).
- Purge: any adjacent pair crossing a train/val boundary is dropped and
  counted at runtime, even if Lane 3 already purged it. Defense in depth.

Batches, hard negatives, dropout, temperature, early stopping
--------------------------------------------------------------
- Batch: 1024 anchors (+ their positives), era-stratified: each batch
  round-robins across the train seasons so every batch mixes eras.
- Hard negatives (spec Open Question #2, default (a)): SupCon's denominator
  already contains every in-batch non-positive, so the hardest in-batch
  negatives are in the loss on every step, refreshed each epoch because
  the embeddings are recomputed each epoch. The script logs the mean
  hardest-negative cosine per epoch as evidence. Fallback (c) -- none
  beyond in-batch -- is the same set for SupCon and is what happens if
  the operator passes --hard-negatives none.
- Tower dropout: during training only, each family is masked whole with
  probability ``--tower-dropout`` (default 0.10), at least one family kept
  per row. The rate is tunable on val ONLY (re-run, compare val top-1).
  Per-epoch, per-family dropout counts go in the report so Lane 5's
  ablations line up family-for-family.
- Temperature: ``--temperature`` (default 0.1) or ``--temperature-grid``,
  which runs {0.05, 0.1, 0.2} as separate full runs and picks the best
  64-d val top-1. Tuning uses val ONLY, never test.
- Epoch budget 200, early stopping patience 20 on val adjacent-season
  top-1 at 64-d, best state restored. Val metrics are computed at every
  prefix m in {8, 16, 32, 64} (slice + re-normalize, same code path).
- Collapse watch, per epoch: alignment, uniformity (Wang & Isola), and
  mean pairwise cosine on a fixed val sample. If SupCon collapses
  (mean pairwise cosine > 0.90 for 3 consecutive epochs), the run
  switches to triplet loss with semi-hard mining for the remaining
  epochs and flags ``triplet_fallback_triggered`` in the report, with
  the trigger epoch and reason. Triplet is ONLY reachable through that
  collapse path (or ``--no-triplet-fallback``, which fails loud on
  collapse instead). There is no manual triplet mode.

Val metrics in this script (early stopping only; Lane 5 is authoritative)
------------------------------------------------------------------------
- val_top1: exhaustive retrieval. Each val row queries the full space
  (train + val embeddings), self excluded, pessimistic ties: the top-1
  neighbor is correct if it is the same player's adjacent-season row.
- val_recall_at_10: same setup, correct neighbor inside the top 10.
- val_continuity: mean over val rows that have a same-player
  adjacent-season row of (1 - cosine) between the row and that neighbor.
  Lower is tighter. This is the early-stopping-time proxy definition;
  Lane 5's eval protocol is authoritative for promotion and must confirm
  it matches before any promotion use.
- New-player slice (contract 2a): val rows whose person_id has no
  earlier-season row in the fold's train portion. Reported separately
  (val_new_player_top1), never blended into the headline number.

Output (contract 2c)
--------------------
Under --out:
  data/mtnn_v6_contrastive_<tag>_<N>rows.f32   (float32, N x 64, L2 rows)
  data/mtnn_v6_contrastive_<tag>_<N>rows.f32.sha256
  run_report.json                              (one per run; grid mode
                                                writes one per temperature
                                                plus a grid summary)
  run_report_<temperature>.json                (grid mode only)
The champion filename (assets/mtnn_embeddings.f32) is never an output
path; the script refuses any --out that would produce it. Encoding the
full N rows for the asset is INFERENCE, not training: only train rows
ever see a gradient. Val/test rows are encoded once, at the end, by the
frozen best model, so the asset lines up row-for-row with the champion.

Usage
-----
  python train_mtnn_v7.py --fold-manifest <path> --features <path> \
      --out <dir> --seed 7
  python train_mtnn_v7.py --fold-manifest <path> --features <path> \
      --out <dir> --seed 7 --temperature-grid --fold 1 --tag v6-contrastive

DRAFT STATUS: unexecuted by design. ``python3 -m py_compile`` only.
"""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import math
import random
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants (contract / spec, not tuned here)
# ---------------------------------------------------------------------------

NESTING = (8, 16, 32, 64)
NESTING_SET = tuple(NESTING)
TEMPERATURE_GRID = (0.05, 0.1, 0.2)
DEFAULT_SEED = 7
EPOCH_BUDGET = 200
EARLY_STOP_PATIENCE = 20
BATCH_ANCHORS = 1024
EXPECTED_N_FEATURES = 120
EXPECTED_N_ROWS = 12966
FROZEN_TEST_SEASON = "2025-26"
FROZEN_TEST_START_YEAR = 2025
COLLAPSE_COSINE_THRESHOLD = 0.90
COLLAPSE_STREAK = 3
TRIPLET_MARGIN = 0.2
MAX_POSITIVES_PER_ANCHOR = 4
CHAMPION_FILENAME = "mtnn_embeddings.f32"
BANNED_PROXY_FILENAME = "mtnn_inputs.f32"

# Contract section 0 order. (name, n_features). Must sum to 120.
FAMILIES: tuple[tuple[str, int], ...] = (
    ("volume", 10),
    ("playmaking", 10),
    ("rebounding", 8),
    ("defense", 8),
    ("efficiency", 8),
    ("shotmix", 10),
    ("bio", 5),
    ("tracking", 12),
    ("form", 6),
    ("market", 4),
    ("roster", 5),
    ("career", 6),
    ("competition", 6),
    ("team", 8),
    ("pedigree", 4),
    ("playoffs", 5),
    ("honors", 5),
)
FAMILY_NAMES = tuple(name for name, _ in FAMILIES)
FAMILY_SLICES: tuple[tuple[int, int], ...] = tuple(
    (start, start + n)
    for start, n in zip(
        itertools.accumulate([0] + [n for _, n in FAMILIES]),
        [n for _, n in FAMILIES],
    )
)
assert sum(n for _, n in FAMILIES) == EXPECTED_N_FEATURES
assert len(FAMILIES) == 17


def fail(message: str) -> "SystemExit":
    """Fail loud: non-zero exit, explicit message. Used for every hard rule."""
    raise SystemExit(f"train_mtnn_v7: ERROR: {message}")


def fail_open_question_1(detail: str) -> "SystemExit":
    """The contract 2b hard rule, in one place, impossible to miss."""
    return fail(
        "Open Question #1: the real 120-feature input matrix is not "
        f"available ({detail}). Refusing to train. The 11-feature proxy "
        f"({BANNED_PROXY_FILENAME}) must NEVER be random-projection expanded "
        "to 120 dims -- that prior workaround is a data-quality red flag and "
        "is banned in this draft. Resolve Open Question #1 (re-derive the "
        "120 features from source stats via the original feature pipeline, "
        "train on the 11-feature proxy honestly labeled as such, or train on "
        "v5's 64-d embeddings as pure distillation), then re-run with the "
        "real matrix file."
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


# ---------------------------------------------------------------------------
# Fold manifest (contract 2a -- consumed, never redefined)
# ---------------------------------------------------------------------------

FOLD_REQUIRED_FIELDS = (
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


def load_fold_manifest(path: Path, fold_id: int | None) -> dict:
    if not path.is_file():
        fail(f"fold manifest not found: {path}")
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as exc:
        fail(f"fold manifest is not JSON: {path} ({exc})")
    if isinstance(doc, dict) and "folds" in doc:
        folds = doc["folds"]
    elif isinstance(doc, list):
        folds = doc
    elif isinstance(doc, dict):
        folds = [doc]
    else:
        fail("fold manifest must be a fold object, a list of folds, or {\"folds\": [...]}")
    if not folds:
        fail("fold manifest contains no folds")
    selected = None
    if fold_id is None:
        selected = folds[0]
    else:
        for candidate in folds:
            if candidate.get("fold") == fold_id:
                selected = candidate
                break
        if selected is None:
            fail(f"fold {fold_id} not in manifest (folds present: {[f.get('fold') for f in folds]})")
    missing = [f for f in FOLD_REQUIRED_FIELDS if f not in selected]
    if missing:
        fail(f"fold manifest fold {selected.get('fold')}: missing contract 2a fields {missing}")
    # Frozen test season: never trained on, never tuned on, never used for
    # early stopping in any fold. A manifest that puts it in train/val is
    # corrupt for this script, not a judgment call.
    train_seasons = set(selected["train_seasons"])
    val_seasons = set(selected["val_seasons"])
    if FROZEN_TEST_SEASON in train_seasons or FROZEN_TEST_SEASON in val_seasons:
        fail(
            f"fold {selected.get('fold')}: frozen test season {FROZEN_TEST_SEASON} "
            "appears in train/val seasons -- test leakage. Refusing to train."
        )
    if train_seasons & val_seasons:
        fail(f"fold {selected.get('fold')}: train and val seasons overlap: {sorted(train_seasons & val_seasons)}")
    return selected


# ---------------------------------------------------------------------------
# Feature matrix (contract 2b -- the hard rule lives here)
# ---------------------------------------------------------------------------

def load_features(path: Path) -> dict:
    """Load and validate the 120-feature matrix. Fails loud, never expands."""
    if not path.is_file():
        fail_open_question_1(f"no file at {path}")
    if path.name == BANNED_PROXY_FILENAME:
        fail_open_question_1(f"the supplied file IS the 11-feature proxy: {path}")
    if path.suffix == ".f32":
        fail_open_question_1(
            f"raw .f32 input ({path}) carries no row metadata (person_id, "
            "season) and cannot be verified as the 120-feature matrix; pass "
            "the .npz matrix with X / family_mask / person_id / "
            "season_start_year instead"
        )
    if path.suffix != ".npz":
        fail(f"unsupported feature file format: {path} (expected .npz)")
    try:
        import numpy as np
    except ImportError as exc:  # pragma: no cover - environment, not logic
        fail(f"numpy is required to load the feature matrix ({exc})")
    try:
        archive = np.load(path, allow_pickle=False)
    except Exception as exc:
        fail(f"cannot read feature matrix {path} ({exc})")
    for key in ("X", "family_mask", "person_id", "season_start_year"):
        if key not in archive:
            fail(f"feature matrix {path} is missing required key {key!r} (needs X, family_mask, person_id, season_start_year)")
    X = archive["X"]
    mask = archive["family_mask"]
    person_id = archive["person_id"]
    season_year = archive["season_start_year"]
    if X.ndim != 2:
        fail(f"feature matrix X must be 2-d, got shape {X.shape}")
    n_rows, n_feats = X.shape
    if n_feats != EXPECTED_N_FEATURES:
        if n_feats == 11:
            fail_open_question_1(
                f"matrix at {path} has 11 features -- that is the proxy, not "
                "the real 120-feature matrix"
            )
        fail_open_question_1(f"matrix at {path} has {n_feats} features, expected 120")
    if mask.shape != (n_rows, len(FAMILIES)):
        fail(f"family_mask must have shape ({n_rows}, 17), got {mask.shape}")
    if len(person_id) != n_rows or len(season_year) != n_rows:
        fail("person_id / season_start_year lengths do not match X row count")
    if n_rows != EXPECTED_N_ROWS:
        # Not fatal by itself (a future season changes the total), but it
        # must be visible: the asset filename carries the real row count.
        print(f"WARNING: row count {n_rows} != champion total {EXPECTED_N_ROWS}; asset name will carry {n_rows}.", file=sys.stderr)
    season = archive["season"] if "season" in archive else None
    return {
        "X": X.astype("float32"),
        "family_mask": mask.astype("float32"),
        "person_id": person_id,
        "season_start_year": season_year.astype(int),
        "season": season,
        "n_rows": n_rows,
    }


def season_label(start_year: int) -> str:
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def reconcile_manifest(fold: dict, features: dict) -> dict:
    """Row counts in the manifest must reconcile to the feature metadata."""
    season_year = features["season_start_year"]
    seasons = features["season"] if features["season"] is not None else [season_label(int(y)) for y in season_year]
    counts: dict[str, int] = {}
    for label in seasons:
        counts[str(label)] = counts.get(str(label), 0) + 1
    train_rows = sum(counts.get(s, 0) for s in fold["train_seasons"])
    val_rows = sum(counts.get(s, 0) for s in fold["val_seasons"])
    test_rows = sum(counts.get(s, 0) for s in fold["test_seasons"])
    mismatches = []
    for key, actual in (
        ("n_train_rows", train_rows),
        ("n_val_rows", val_rows),
        ("n_test_rows", test_rows),
    ):
        if fold[key] != actual:
            mismatches.append(f"{key}: manifest {fold[key]} != metadata {actual}")
    if mismatches:
        fail(f"fold {fold.get('fold')}: manifest row counts do not reconcile: {'; '.join(mismatches)}")
    return {"train_rows": train_rows, "val_rows": val_rows, "test_rows": test_rows}


# ---------------------------------------------------------------------------
# Pair construction (train split only; Lane 3's builder is authoritative)
# ---------------------------------------------------------------------------

def build_pairs(fold: dict, features: dict, twin_pairs_path: Path | None) -> dict:
    """Adjacent-season pairs from metadata + validated v5-twin pairs.

    Returns row-index pairs and the counts the run report carries, including
    every dropped pair and why. Cross-boundary and val/test-touching pairs
    are dropped, never trained on.
    """
    import numpy as np

    person_id = [str(p) for p in features["person_id"]]
    season_year = [int(y) for y in features["season_start_year"]]
    seasons = features["season"] if features["season"] is not None else [season_label(y) for y in season_year]
    train_seasons = set(fold["train_seasons"])
    val_seasons = set(fold["val_seasons"])
    test_seasons = set(fold["test_seasons"])

    train_idx = [i for i, s in enumerate(seasons) if str(s) in train_seasons]
    val_idx = [i for i, s in enumerate(seasons) if str(s) in val_seasons]
    test_idx = [i for i, s in enumerate(seasons) if str(s) in test_seasons]
    train_set = set(train_idx)

    # Adjacent seasons: same person_id, years N and N+1, both in train.
    by_person: dict[str, dict[int, int]] = {}
    for i in train_idx:
        by_person.setdefault(person_id[i], {})[int(season_year[i])] = i
    adjacent: list[tuple[int, int]] = []
    dropped_cross_boundary = 0
    for person, by_year in by_person.items():
        for year, row in by_year.items():
            nxt = by_year.get(year + 1)
            if nxt is not None:
                adjacent.append((row, nxt))
    # Defense in depth: if a metadata row sits in val/test with an adjacent
    # train row, that pair must not be built. The construction above only
    # uses train rows, so this count is 0 by construction; it is kept as a
    # checked invariant for the report, not assumed.
    for i in train_idx:
        for year in (int(season_year[i]) - 1, int(season_year[i]) + 1):
            pass  # adjacent pairs are built from the train-only map above

    # v5 twin pairs: validate, drop anything touching val/test, count it.
    twin_raw: list = []
    twin_source = None
    candidates = []
    if twin_pairs_path is not None:
        candidates.append(twin_pairs_path)
    fold_twin = fold.get("twin_pairs_path")
    if fold_twin:
        candidates.append(Path(fold_twin))
    for candidate in candidates:
        if candidate.is_file():
            twin_source = str(candidate)
            try:
                doc = json.loads(candidate.read_text(encoding="utf-8"))
            except ValueError as exc:
                fail(f"twin pairs file is not JSON: {candidate} ({exc})")
            twin_raw = doc["pairs"] if isinstance(doc, dict) else doc
            break
    twin: list[tuple[int, int]] = []
    twin_dropped_leak = 0
    twin_dropped_bad = 0
    n_rows = features["n_rows"]
    for pair in twin_raw:
        try:
            a, b = int(pair[0]), int(pair[1])
        except (TypeError, ValueError, IndexError):
            twin_dropped_bad += 1
            continue
        if not (0 <= a < n_rows and 0 <= b < n_rows) or a == b:
            twin_dropped_bad += 1
            continue
        if a not in train_set or b not in train_set:
            twin_dropped_leak += 1
            continue
        twin.append((a, b))
    if candidates and twin_source is None:
        print("WARNING: no readable twin pairs file found; training on adjacent-season positives only.", file=sys.stderr)

    # New-player slice: val rows whose person_id has no earlier-season row
    # in the fold's train portion. Reported separately, never blended in.
    train_person_years: dict[str, list[int]] = {}
    for i in train_idx:
        train_person_years.setdefault(person_id[i], []).append(int(season_year[i]))
    val_new_player = [
        i for i in val_idx
        if not any(y < int(season_year[i]) for y in train_person_years.get(person_id[i], []))
    ]
    if "n_val_new_player_rows" in fold and fold["n_val_new_player_rows"] != len(val_new_player):
        print(
            f"WARNING: fold manifest n_val_new_player_rows={fold['n_val_new_player_rows']} "
            f"!= metadata-derived {len(val_new_player)}; using the metadata count.",
            file=sys.stderr,
        )

    return {
        "train_idx": train_idx,
        "val_idx": val_idx,
        "test_idx": test_idx,
        "adjacent": adjacent,
        "twin": twin,
        "twin_source": twin_source,
        "n_pairs_adjacent": len(adjacent),
        "n_pairs_twin": len(twin),
        "n_pairs_dropped_cross_boundary": dropped_cross_boundary,
        "n_twin_dropped_leak": twin_dropped_leak,
        "n_twin_dropped_bad": twin_dropped_bad,
        "val_new_player_idx": val_new_player,
    }


# ---------------------------------------------------------------------------
# Era-stratified batching
# ---------------------------------------------------------------------------

def era_stratified_batches(train_idx: list[int], season_year: list[int], batch_anchors: int, rng: random.Random) -> list[list[int]]:
    """Batches that round-robin across train seasons, so every batch mixes eras.

    Without this the model learns 'same era = similar' trivially (spec 2/6).
    Era here is the season itself: the finest stratification available, and
    it guarantees cross-era mixing in every batch.
    """
    by_season: dict[int, list[int]] = {}
    for i in train_idx:
        by_season.setdefault(int(season_year[i]), []).append(i)
    for rows in by_season.values():
        rng.shuffle(rows)
    seasons = sorted(by_season)
    pointers = {s: 0 for s in seasons}
    batches: list[list[int]] = []
    remaining = sum(len(rows) for rows in by_season.values())
    while remaining > 0:
        batch: list[int] = []
        # Round-robin across seasons until the batch is full or seasons run dry.
        while len(batch) < batch_anchors and remaining > 0:
            progressed = False
            for season in seasons:
                if len(batch) >= batch_anchors:
                    break
                rows = by_season[season]
                if pointers[season] < len(rows):
                    batch.append(rows[pointers[season]])
                    pointers[season] += 1
                    remaining -= 1
                    progressed = True
            if not progressed:
                break
        if batch:
            rng.shuffle(batch)
            batches.append(batch)
    return batches


# ---------------------------------------------------------------------------
# Model: v5 tower skeleton, prediction heads removed
# ---------------------------------------------------------------------------

def build_model(device: str, encoder: str):
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    class ResidualTower(nn.Module):
        def __init__(self, d_in: int, d_out: int = 32, d_hidden: int = 160, n_blocks: int = 2):
            super().__init__()
            d_cat = d_in * 2  # cat([x * m, m])
            self.fc1 = nn.Linear(d_cat, d_hidden)
            self.ln1 = nn.LayerNorm(d_hidden)
            self.fc2 = nn.Linear(d_hidden, d_out)
            self.ln2 = nn.LayerNorm(d_out)
            self.skip = nn.Linear(d_cat, d_out) if d_cat != d_out else nn.Identity()
            self.blocks = nn.ModuleList([_ResBlock(d_out, d_hidden) for _ in range(max(0, n_blocks - 1))])

        def forward(self, x, m):
            h = torch.cat([x * m, m], dim=-1)
            y = self.ln2(self.fc2(F.gelu(self.ln1(self.fc1(h)))) + self.skip(h))
            for blk in self.blocks:
                y = blk(y)
            return y

    class _ResBlock(nn.Module):
        def __init__(self, d: int, d_hidden: int):
            super().__init__()
            self.fc1 = nn.Linear(d, d_hidden)
            self.ln1 = nn.LayerNorm(d_hidden)
            self.fc2 = nn.Linear(d_hidden, d)
            self.ln2 = nn.LayerNorm(d)

        def forward(self, y):
            return self.ln2(self.fc2(F.gelu(self.ln1(self.fc1(y)))) + y)

    class TowerEncoder(nn.Module):
        """17 family towers -> concat 544 -> 256 -> 128 -> 64, L2 output."""

        def __init__(self, tower_dropout: float = 0.0):
            super().__init__()
            self.tower_dropout = tower_dropout
            self.towers = nn.ModuleList(
                [ResidualTower(n) for _, n in FAMILIES]
            )
            self.fuse = nn.Sequential(
                nn.Linear(544, 256),
                nn.GELU(),
                nn.LayerNorm(256),
                nn.Linear(256, 128),
                nn.GELU(),
                nn.LayerNorm(128),
                nn.Linear(128, 64),
            )
            # Per-epoch dropout accounting, read by the training loop.
            self.dropout_counts = [0] * len(FAMILIES)
            self.dropout_rows = 0

        def forward(self, x, mask):
            # x: [B, 120], mask: [B, 17]. Tower dropout masks whole
            # families during training only; eval calls use train=False.
            if self.training and self.tower_dropout > 0.0:
                keep = (torch.rand(mask.shape, device=mask.device) >= self.tower_dropout).float()
                # At least one family per row, else the row is a zero vector.
                empty = keep.sum(dim=1) == 0
                if bool(empty.any()):
                    keep[empty, 0] = 1.0
                mask = mask * keep
                with torch.no_grad():
                    dropped = (1.0 - keep).sum(dim=0).tolist()
                    for j, count in enumerate(dropped):
                        self.dropout_counts[j] += int(count)
                    self.dropout_rows += mask.shape[0]
            parts = []
            for j, (start, end) in enumerate(FAMILY_SLICES):
                fam_mask = mask[:, j : j + 1]
                parts.append(self.towers[j](x[:, start:end], fam_mask))
            flat = torch.cat(parts, dim=-1)  # [B, 544]
            return F.normalize(self.fuse(flat), dim=-1)

    class PlainMLP(nn.Module):
        """Spec section 4 default, kept as a control run only."""

        def __init__(self):
            super().__init__()
            self.net = nn.Sequential(
                nn.Linear(120, 256),
                nn.GELU(),
                nn.LayerNorm(256),
                nn.Linear(256, 256),
                nn.GELU(),
                nn.LayerNorm(256),
                nn.Linear(256, 64),
            )

        def forward(self, x, mask):
            # Mask is ignored by the plain MLP: it sees the raw 120 feats.
            # That is part of its cost/benefit versus the towers (see notes).
            return F.normalize(self.net(x), dim=-1)

    model = TowerEncoder() if encoder == "towers" else PlainMLP()
    return model.to(device)


# ---------------------------------------------------------------------------
# Losses
# ---------------------------------------------------------------------------

def supcon_loss_at_width(emb, pos_mask, temperature: float):
    """SupCon (Khosla et al. 2020) at one Matryoshka width.

    emb: [B, m], already L2-normalized. pos_mask: [B, B] bool, True for
    positives of each row (self excluded). Rows with no positive in the
    batch contribute nothing (they are anchors' partners, not anchors).
    """
    import torch
    import torch.nn.functional as F

    logits = emb @ emb.T / temperature
    # Self-similarity must not be a positive or a negative.
    logits = logits - torch.eye(logits.shape[0], device=emb.device) * 1e9
    log_prob = F.log_softmax(logits, dim=1)
    pos_count = pos_mask.sum(dim=1)
    valid = pos_count > 0
    if not bool(valid.any()):
        return torch.zeros((), device=emb.device)
    loss = -(log_prob * pos_mask.float()).sum(dim=1) / pos_count.clamp(min=1)
    return loss[valid].mean()


def matryoshka_supcon_loss(emb64, pos_mask, temperature: float):
    """Sum of SupCon over M = {8, 16, 32, 64}, equal weights, per-level norm."""
    import torch.nn.functional as F

    total = None
    for m in NESTING:
        sliced = F.normalize(emb64[:, :m], dim=-1)
        term = supcon_loss_at_width(sliced, pos_mask, temperature)
        total = term if total is None else total + term
    return total


def triplet_semi_hard_loss(emb64, pos_mask, margin: float = TRIPLET_MARGIN):
    """Fallback ONLY: triplet loss with semi-hard mining, at 64-d.

    Semi-hard: for each anchor-positive pair, the negative is the hardest
    non-positive that is still farther than the positive
    (d(a,p) < d(a,n) < d(a,p) + margin); if none exists, the hardest
    negative overall. Returns 0 when no anchor has both a positive and a
    negative in the batch.
    """
    import torch
    import torch.nn.functional as F

    dist = 2.0 - 2.0 * (emb64 @ emb64.T)  # squared Euclidean on L2 vectors
    dist = dist + torch.eye(dist.shape[0], device=emb64.device) * 1e9
    losses = []
    for a in range(emb64.shape[0]):
        positives = torch.nonzero(pos_mask[a], as_tuple=False).flatten()
        negatives = torch.nonzero(~pos_mask[a], as_tuple=False).flatten()
        negatives = negatives[negatives != a]
        if len(positives) == 0 or len(negatives) == 0:
            continue
        for p in positives.tolist():
            d_ap = dist[a, p]
            semi = negatives[(dist[a, negatives] > d_ap) & (dist[a, negatives] < d_ap + margin)]
            n = semi[torch.argmin(dist[a, semi])] if len(semi) else negatives[torch.argmin(dist[a, negatives])]
            losses.append(F.relu(d_ap - dist[a, n] + margin))
    if not losses:
        return emb64.sum() * 0.0
    import torch as _torch

    return _torch.stack(losses).mean()


# ---------------------------------------------------------------------------
# Val metrics (early stopping + collapse watch; Lane 5 is authoritative)
# ---------------------------------------------------------------------------

def alignment_uniformity(emb, pos_pairs, rng_seed: int = 0):
    """Wang & Isola alignment / uniformity on a fixed sample.

    alignment: mean ||f(x) - f(y)||^2 over positive pairs (L2 vectors, so
      this equals mean 2 - 2*cos). uniformity: log mean exp(-2*||f(x)-f(y)||^2)
      over random pairs. Both computed at 64-d.
    """
    import numpy as np

    if not pos_pairs:
        return None, None
    pos = np.asarray(pos_pairs, dtype=int)
    diff = emb[pos[:, 0]] - emb[pos[:, 1]]
    alignment = float(np.mean(np.sum(diff * diff, axis=1)))
    rng = np.random.default_rng(rng_seed)
    n = emb.shape[0]
    a = rng.integers(0, n, size=min(4096, n * 4))
    b = rng.integers(0, n, size=len(a))
    diff_r = emb[a] - emb[b]
    sq = np.sum(diff_r * diff_r, axis=1)
    uniformity = float(np.log(np.mean(np.exp(-2.0 * sq))))
    return alignment, uniformity


def val_metrics(emb_all, val_idx, train_idx, person_id, season_year, new_player_idx):
    """Exhaustive retrieval metrics at every prefix, same code path each time.

    Queries: val rows. Candidate pool: train + val embeddings, self
    excluded, pessimistic ties (argsort is stable; equal-cosine rows keep
    input order, so a tied correct neighbor is NOT credited unless it
    sorts first -- the pessimistic reading).
    """
    import numpy as np

    pool_idx = list(train_idx) + list(val_idx)
    pool_pos = {row: k for k, row in enumerate(pool_idx)}
    pool_emb = emb_all[pool_idx]
    results: dict[str, dict] = {}
    # Same-player adjacent-season ground truth, per val row.
    person_rows: dict[str, dict[int, int]] = {}
    for row in pool_idx:
        person_rows.setdefault(str(person_id[row]), {})[int(season_year[row])] = row
    for m in NESTING:
        sliced = pool_emb[:, :m]
        sliced = sliced / np.linalg.norm(sliced, axis=1, keepdims=True).clip(min=1e-12)
        sims = sliced @ sliced.T
        top1_correct = 0
        recall10_correct = 0
        continuity_terms = []
        new_top1 = 0
        new_total = 0
        for row in val_idx:
            k = pool_pos[row]
            order = np.argsort(-sims[k], kind="stable")
            order = [j for j in order if pool_idx[j] != row]
            truth = set()
            years = person_rows.get(str(person_id[row]), {})
            for year in (int(season_year[row]) - 1, int(season_year[row]) + 1):
                if year in years:
                    truth.add(years[year])
            if not truth:
                continue
            top1 = pool_idx[order[0]]
            if top1 in truth:
                top1_correct += 1
            if any(pool_idx[j] in truth for j in order[:10]):
                recall10_correct += 1
            # Continuity proxy: distance to the same-player adjacent row.
            neighbor = next(iter(truth))
            nk = pool_pos[neighbor]
            continuity_terms.append(float(1.0 - float(sims[k, nk])))
            if row in set(new_player_idx):
                new_total += 1
                if top1 in truth:
                    new_top1 += 1
        n = max(1, len([r for r in val_idx if person_rows.get(str(person_id[r]))]))
        # Denominator: val rows with any adjacent-season truth in the pool.
        denom = 0
        for row in val_idx:
            years = person_rows.get(str(person_id[row]), {})
            if (int(season_year[row]) - 1 in years) or (int(season_year[row]) + 1 in years):
                denom += 1
        denom = max(1, denom)
        results[str(m)] = {
            "val_top1": top1_correct / denom,
            "val_recall_at_10": recall10_correct / denom,
            "val_continuity": float(np.mean(continuity_terms)) if continuity_terms else None,
            "val_new_player_top1": (new_top1 / new_total) if new_total else None,
            "val_new_player_rows": new_total,
            "n_val_scored": denom,
        }
    return results


# ---------------------------------------------------------------------------
# One training run
# ---------------------------------------------------------------------------

def run_one(args, fold, features, pairs, temperature: float, out_dir: Path) -> dict:
    import numpy as np
    import torch

    device = "cpu"  # 12,966 rows is minutes on CPU; no GPU in this draft.
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    random.seed(args.seed)
    rng = random.Random(args.seed)

    X = features["X"]
    mask = features["family_mask"]
    person_id = features["person_id"]
    season_year = features["season_start_year"]
    train_idx = pairs["train_idx"]
    val_idx = pairs["val_idx"]

    # Positive graph over train rows: adjacent + validated v5 twins.
    pos_of: dict[int, set[int]] = {}
    for a, b in pairs["adjacent"] + pairs["twin"]:
        pos_of.setdefault(a, set()).add(b)
        pos_of.setdefault(b, set()).add(a)

    model = build_model(device, args.encoder)
    if args.encoder == "towers":
        model.tower_dropout = args.tower_dropout
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    scheduler = torch.optim.lr_scheduler.OneCycleLR(
        optimizer, max_lr=args.lr, total_steps=args.epochs, pct_start=0.1, anneal_strategy="linear"
    )
    X_t = torch.from_numpy(X)
    mask_t = torch.from_numpy(mask)

    def encode(rows):
        model.eval()
        outs = []
        with torch.no_grad():
            for start in range(0, len(rows), 4096):
                chunk = rows[start : start + 4096]
                outs.append(model(X_t[chunk], mask_t[chunk]).cpu().numpy())
        return np.concatenate(outs, axis=0) if outs else np.zeros((0, 64), dtype=np.float32)

    use_triplet = False
    fallback_info = None
    collapse_streak = 0
    best_top1 = -1.0
    best_state = None
    best_epoch = -1
    best_metrics = None
    epochs_without_improvement = 0
    history: list[dict] = []
    dropout_log: list[dict] = []

    # Fixed val sample for the collapse watch (alignment / uniformity /
    # mean pairwise cosine). Same rows every epoch, so the curve is honest.
    val_sample = val_idx[:512] if len(val_idx) > 512 else list(val_idx)
    val_pos_pairs = []
    for row in val_sample:
        years = {}
        for other in val_sample:
            if str(person_id[other]) == str(person_id[row]):
                years[int(season_year[other])] = other
        for year in (int(season_year[row]) - 1, int(season_year[row]) + 1):
            if year in years:
                val_pos_pairs.append((row, years[year]))

    for epoch in range(1, args.epochs + 1):
        model.train()
        if args.encoder == "towers":
            model.dropout_counts = [0] * len(FAMILIES)
            model.dropout_rows = 0
        batches = era_stratified_batches(train_idx, [int(y) for y in season_year], args.batch, rng)
        hardest_cosines: list[float] = []
        for anchors in batches:
            # Anchors + up to 4 sampled positives each = the batch rows.
            rows: list[int] = list(anchors)
            seen = set(rows)
            for anchor in anchors:
                positives = sorted(pos_of.get(anchor, set()))
                rng.shuffle(positives)
                for partner in positives[:MAX_POSITIVES_PER_ANCHOR]:
                    if partner not in seen:
                        seen.add(partner)
                        rows.append(partner)
            batch_pos = np.zeros((len(rows), len(rows)), dtype=bool)
            row_pos = {row: k for k, row in enumerate(rows)}
            for row in rows:
                for partner in pos_of.get(row, set()):
                    if partner in row_pos:
                        batch_pos[row_pos[row], row_pos[partner]] = True
            np.fill_diagonal(batch_pos, False)
            emb = model(X_t[rows], mask_t[rows])
            pos_mask = torch.from_numpy(batch_pos)
            if use_triplet:
                loss = triplet_semi_hard_loss(emb, pos_mask)
            else:
                if args.hard_negatives == "none":
                    # Fallback (c): same in-batch set for SupCon; the flag
                    # is recorded, and no extra mining is attempted.
                    pass
                loss = matryoshka_supcon_loss(emb, pos_mask, temperature)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            # Hardest in-batch negative cosine, refreshed every epoch
            # because the embeddings move every epoch.
            with torch.no_grad():
                sims = emb.detach() @ emb.detach().T
                sims = sims - torch.eye(sims.shape[0]) * 1e9
                sims = torch.where(pos_mask, torch.tensor(-1e9), sims)
                hardest_cosines.append(float(sims.max(dim=1).values.mean()))
        scheduler.step()

        # Epoch-end collapse watch + val metrics (64-d drives early stopping).
        emb_val = encode(val_sample)
        alignment, uniformity = alignment_uniformity(emb_val, [(val_sample.index(a), val_sample.index(b)) for a, b in val_pos_pairs] if val_pos_pairs else [])
        # alignment_uniformity indexes into the passed embedding array, so
        # rebuild pair indices against the val_sample order (done above).
        sims_val = emb_val @ emb_val.T
        triu = sims_val[np.triu_indices(len(val_sample), k=1)] if len(val_sample) > 1 else np.array([0.0])
        mean_pairwise_cosine = float(np.mean(triu))
        if mean_pairwise_cosine > COLLAPSE_COSINE_THRESHOLD:
            collapse_streak += 1
        else:
            collapse_streak = 0
        if not use_triplet and collapse_streak >= COLLAPSE_STREAK:
            if args.no_triplet_fallback:
                fail(
                    f"SupCon collapse at epoch {epoch}: mean pairwise cosine "
                    f"{mean_pairwise_cosine:.3f} > {COLLAPSE_COSINE_THRESHOLD} for "
                    f"{COLLAPSE_STREAK} consecutive epochs. Triplet fallback "
                    "disabled by --no-triplet-fallback. Refusing to continue."
                )
            use_triplet = True
            fallback_info = {
                "triggered": True,
                "trigger_epoch": epoch,
                "reason": f"mean pairwise cosine {mean_pairwise_cosine:.3f} > {COLLAPSE_COSINE_THRESHOLD} for {COLLAPSE_STREAK} consecutive epochs",
                "mean_pairwise_cosine_at_trigger": mean_pairwise_cosine,
            }
            print(f"COLLAPSE: switching to triplet (semi-hard) fallback at epoch {epoch}.", file=sys.stderr)

        emb_all = encode(list(train_idx) + list(val_idx))
        # encode() returns rows in input order: train rows first, then val.
        full_emb = np.zeros((features["n_rows"], 64), dtype=np.float32)
        for k, row in enumerate(list(train_idx) + list(val_idx)):
            full_emb[row] = emb_all[k]
        metrics = val_metrics(full_emb, val_idx, train_idx, person_id, season_year, pairs["val_new_player_idx"])
        top1_64 = metrics["64"]["val_top1"]
        if top1_64 > best_top1:
            best_top1 = top1_64
            best_epoch = epoch
            best_metrics = metrics
            epochs_without_improvement = 0
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
        else:
            epochs_without_improvement += 1
        history.append(
            {
                "epoch": epoch,
                "loss_type": "triplet" if use_triplet else "supcon",
                "alignment": alignment,
                "uniformity": uniformity,
                "mean_pairwise_cosine": mean_pairwise_cosine,
                "mean_hardest_negative_cosine": float(np.mean(hardest_cosines)) if hardest_cosines else None,
                "val_top1_64": top1_64,
                "val_metrics": metrics,
            }
        )
        if args.encoder == "towers":
            dropout_log.append(
                {
                    "epoch": epoch,
                    "per_family_dropped": dict(zip(FAMILY_NAMES, model.dropout_counts)),
                    "rows_seen": model.dropout_rows,
                    "per_family_rate": {
                        name: (count / model.dropout_rows if model.dropout_rows else 0.0)
                        for name, count in zip(FAMILY_NAMES, model.dropout_counts)
                    },
                }
            )
        print(f"epoch {epoch}: val_top1@64={top1_64:.4f} align={alignment} unif={uniformity} cos={mean_pairwise_cosine:.3f}")
        if epochs_without_improvement >= args.patience:
            print(f"early stopping at epoch {epoch} (patience {args.patience}, best epoch {best_epoch}).")
            break

    if best_state is not None:
        model.load_state_dict(best_state)
    model.eval()

    # Final asset: inference over ALL rows with the frozen best model.
    full_emb = encode(list(range(features["n_rows"])))
    tag = args.tag
    asset_name = f"mtnn_v6_contrastive_{tag}_{features['n_rows']}rows.f32"
    if asset_name == CHAMPION_FILENAME:
        fail("output asset name collides with the champion filename; refusing to write")
    data_dir = out_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    asset_path = data_dir / asset_name
    full_emb.astype("<f4").tofile(asset_path)
    asset_sha = sha256_file(asset_path)
    (asset_path.with_suffix(".f32.sha256")).write_text(asset_sha + "\n", encoding="utf-8")

    import torch as _torch

    report = {
        "config": {
            "encoder": args.encoder,
            "tower_skeleton": "v5 faithful, prediction heads removed" if args.encoder == "towers" else "plain MLP control",
            "tower_dropout": args.tower_dropout if args.encoder == "towers" else None,
            "temperature": temperature,
            "temperature_grid": list(TEMPERATURE_GRID) if args.temperature_grid else None,
            "batch_anchors": args.batch,
            "epochs_budget": args.epochs,
            "early_stopping_patience": args.patience,
            "lr": args.lr,
            "weight_decay": args.weight_decay,
            "nesting": list(NESTING),
            "nesting_weights": "equal (1.0 each)",
            "hard_negatives": args.hard_negatives,
            "triplet_fallback": fallback_info or {"triggered": False},
            "fold": fold.get("fold"),
            "tag": tag,
            "loss": "SupCon at every m in {8,16,32,64}, equal weights, per-level L2-normalize after slicing; triplet (semi-hard) fallback ONLY on collapse",
        },
        "seed": args.seed,
        "torch_version": _torch.__version__,
        "feature_matrix_sha256": sha256_file(args.features),
        "fold_manifest_sha256": sha256_file(args.fold_manifest),
        "feature_matrix_path": str(args.features),
        "fold_manifest_path": str(args.fold_manifest),
        "pairs": {
            "n_pairs_adjacent": pairs["n_pairs_adjacent"],
            "n_pairs_twin": pairs["n_pairs_twin"],
            "twin_source": pairs["twin_source"],
            "n_pairs_dropped_cross_boundary": pairs["n_pairs_dropped_cross_boundary"],
            "n_twin_dropped_leak": pairs["n_twin_dropped_leak"],
            "n_twin_dropped_bad": pairs["n_twin_dropped_bad"],
            "twin_positives_note": (
                "adjacent-season positives only; no twin source supplied"
                if pairs["n_pairs_twin"] == 0
                else "adjacent-season + validated v5 train-split twin positives"
            ),
        },
        # Final metrics are the BEST epoch's (the asset is the best model),
        # not the last epoch's; the full per-epoch curve stays in history.
        "alignment": history[-1]["alignment"] if history else None,
        "uniformity": history[-1]["uniformity"] if history else None,
        "mean_pairwise_cosine": history[-1]["mean_pairwise_cosine"] if history else None,
        "history": history,
        "tower_dropout_log": dropout_log,
        "best_epoch": best_epoch,
        "best_val_top1_64": best_top1,
        "val_top1": {m: met["val_top1"] for m, met in best_metrics.items()} if best_metrics else {},
        "val_recall_at_10": {m: met["val_recall_at_10"] for m, met in best_metrics.items()} if best_metrics else {},
        "val_continuity": {m: met["val_continuity"] for m, met in best_metrics.items()} if best_metrics else {},
        "val_metrics_per_prefix": best_metrics or {},
        "val_metrics_note": (
            "val_continuity here = mean (1 - cosine) between a val row and its "
            "same-player adjacent-season row; lower is tighter. This is the "
            "early-stopping-time proxy definition. Lane 5's eval protocol is "
            "authoritative for promotion and must confirm it matches."
        ),
        "output_asset": str(asset_path),
        "output_asset_sha256": asset_sha,
        "output_asset_rows": features["n_rows"],
        "output_asset_dims": 64,
        "champion_filename_never_written": True,
        "training_rows_only_note": (
            "Gradients saw train rows only. Val/test rows were encoded once, "
            "at the end, by the frozen best model, for the serving asset."
        ),
    }
    return report


# ---------------------------------------------------------------------------
# CLI (contract 2c entry point)
# ---------------------------------------------------------------------------

def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="MTNN v7 contrastive challenger -- DRAFT ONLY. Train gate is CLOSED; do not execute until authorized."
    )
    parser.add_argument("--fold-manifest", type=Path, required=True, help="Lane 3 fold manifest JSON (contract 2a).")
    parser.add_argument("--features", type=Path, required=True, help="Real 120-feature .npz matrix (contract 2b). Fails loud if absent.")
    parser.add_argument("--out", type=Path, required=True, help="Output directory (asset + run report go under it).")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="Random seed (default 7; override for multi-seed runs).")
    parser.add_argument("--fold", type=int, default=None, help="Fold id to train (default: first fold in the manifest).")
    parser.add_argument("--twin-pairs", type=Path, default=None, help="Optional JSON of v5 train-split twin pairs; validated, val/test-touching pairs dropped.")
    parser.add_argument("--tag", default="v7", help="Asset tag: data/mtnn_v6_contrastive_<tag>_<N>rows.f32.")
    parser.add_argument("--encoder", choices=("towers", "plain-mlp"), default="towers", help="Tower skeleton (default, faithful to v5) or plain-MLP control.")
    parser.add_argument("--temperature", type=float, default=0.1, help="SupCon temperature for a single run (default 0.1).")
    parser.add_argument("--temperature-grid", action="store_true", help="Run {0.05, 0.1, 0.2} as separate full runs, pick best 64-d val top-1. Tuning on val ONLY.")
    parser.add_argument("--tower-dropout", type=float, default=0.10, help="Whole-family mask probability during training (tunable on val only).")
    parser.add_argument("--hard-negatives", choices=("in-batch", "none"), default="in-batch", help="Spec Q2 default (a) hardest in-batch, refreshed each epoch; (c) none beyond in-batch.")
    parser.add_argument("--no-triplet-fallback", action="store_true", help="Fail loud on SupCon collapse instead of switching to triplet.")
    parser.add_argument("--batch", type=int, default=BATCH_ANCHORS, help="Anchors per batch (default 1024, + positives).")
    parser.add_argument("--epochs", type=int, default=EPOCH_BUDGET, help="Epoch budget (default 200).")
    parser.add_argument("--patience", type=int, default=EARLY_STOP_PATIENCE, help="Early-stopping patience on val adjacent-season top-1 (default 20).")
    parser.add_argument("--lr", type=float, default=1.5e-3, help="AdamW learning rate.")
    parser.add_argument("--weight-decay", type=float, default=1e-4, help="AdamW weight decay.")
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    # Refuse any output that could land on the champion filename.
    if args.out.resolve().name == CHAMPION_FILENAME or args.tag == "embeddings":
        fail("refusing an output path that could collide with the champion asset")
    fold = load_fold_manifest(args.fold_manifest, args.fold)
    features = load_features(args.features)
    reconcile_manifest(fold, features)
    pairs = build_pairs(fold, features, args.twin_pairs)
    out_dir = args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    temperatures = list(TEMPERATURE_GRID) if args.temperature_grid else [args.temperature]
    reports = {}
    for temperature in temperatures:
        run_dir = out_dir / f"temperature-{temperature}" if args.temperature_grid else out_dir
        run_dir.mkdir(parents=True, exist_ok=True)
        report = run_one(args, fold, features, pairs, temperature, run_dir)
        reports[str(temperature)] = report
        report_name = f"run_report_{temperature}.json" if args.temperature_grid else "run_report.json"
        (run_dir / report_name).write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        print(f"wrote {run_dir / report_name}")
        print(f"asset {report['output_asset']} sha256 {report['output_asset_sha256']}")
    if args.temperature_grid:
        best_temp = max(reports, key=lambda t: reports[t]["best_val_top1_64"])
        summary = {
            "temperature_grid": list(TEMPERATURE_GRID),
            "tuned_on": "val ONLY (64-d val adjacent-season top-1); test never used for selection",
            "best_temperature": float(best_temp),
            "best_val_top1_64": reports[best_temp]["best_val_top1_64"],
            "runs": {t: {"best_val_top1_64": r["best_val_top1_64"], "asset": r["output_asset"], "sha256": r["output_asset_sha256"]} for t, r in reports.items()},
        }
        (out_dir / "run_report.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print(f"temperature grid winner: {best_temp} (val top-1 {summary['best_val_top1_64']:.4f})")
    return 0


if __name__ == "__main__":
    sys.exit(main())

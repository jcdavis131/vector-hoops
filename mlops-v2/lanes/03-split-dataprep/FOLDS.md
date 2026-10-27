# Lane 3 — Expanding-Window Folds + Pair Construction (DRAFT)

Status: DRAFT ONLY. Train gate is CLOSED. No training runs, no GPU, no
package installs, no writes outside this lane directory. This document and
`build_pairs.py` describe the folds; they do not execute training.

Champion (pinned, never overwritten): MTNN v5,
`mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256`, 12,966 player-seasons
through 2025-26, 64-d L2, `assets/mtnn_embeddings.f32`, incumbent
2026-07-25. Identity key is `person_id` (never name alone — four names
in this file map to two distinct players each: Dee Brown, Reggie
Williams, Mike James, Chris Johnson; see §6). Season key is `YYYY-YY`;
season-start-year is the first four digits.

Source of truth for every count below (read-only):
`~/workspace/vector-hoops-mlops-v2/assets/vectors.json` — 12,966 rows in
its `players` list, one row per person per season (zero duplicate
person-season rows verified), every row carrying a `person_id`.
`build_pairs.py` re-derives every count from that file and fails loud on
any mismatch (§7). The counts in this document were computed from that
file on 2026-10-26 and cross-checked against the script's own output.

## 0. Contract conflict — READ FIRST (decision needed, not silently fixed)

Contract §2a as written cannot be satisfied literally. It states:

- Fold 1: train ≤ 2021, val 2022-23, **948 rows (464 + 484)**.
- Fold 2: train ≤ 2023, val 2024-25, **984 rows (500 + 484)**.
- Final test: 2025-26, **491 rows**, FROZEN.

The verified season sizes are 2022-23 = 464, 2023-24 = 484,
2024-25 = 500, 2025-26 = 491. Therefore:

- Fold 1's 948 is only reachable as a **two-season** val window:
  2022-23 + 2023-24 = 948. A single-season "val 2022-23" is 464.
- Fold 2's 984 is only reachable as 2023-24 + 2024-25 = 984 — but
  2023-24 is inside Fold 2's own train (start-year ≤ 2023), so that
  window puts train rows into val: leakage, not a fold. The other
  two-season reading, 2024-25 + 2025-26 = 991, swallows the frozen test.
- **No non-leaking reading of Fold 2 yields 984 for val.** The 984
  figure is treated here as a contract arithmetic error (most plausibly
  the author added the val season 2024-25 to the last train season
  2023-24), and it is NOT implemented. What is implemented instead is
  the only reconciling, non-leaking design (§1): Fold 2 val is the
  single season 2024-25 = **500 rows**, and the frozen test stays
  2025-26 = 491 rows.

**Decision needed from the coordinator (before any training):**
confirm Fold 2 val = 500 (this lane's recommendation) and amend
contract §2a's "984" accordingly — or amend the fold design itself.
Until that confirmation lands, the 984 number must not be quoted as a
val size anywhere downstream. Lanes 4/5 should build against the
manifest `build_pairs.py` emits, not against the contract's 984.

A second, smaller wording note: the task brief's shorthand "val 2022-23
(948 rows)" / "val 2024-25 (984 rows)" inherits the same problem. This
lane follows the contract's season boundaries and the verified counts,
not the shorthand labels.

## 1. Folds as implemented (expanding window, embargoed default)

The script's default is the **embargoed** design (§3). The purge-only
variant (no embargo) is available via `--no-embargo` and is tabulated
in §4 for comparison; it is NOT the default.

| Fold | Train seasons (start-year) | Train rows | Embargo season (rows) | Val seasons | Val rows | Test season | Test rows | Unused seasons |
|---|---|---|---|---|---|---|---|---|
| fold1 | 1996-97 … 2020-21 (≤ 2020) | 10,539 | 2021-22 (488) | 2022-23, 2023-24 | 948 | 2025-26 | 491 | 2024-25 (500) |
| fold2 | 1996-97 … 2022-23 (≤ 2022) | 11,491 | 2023-24 (484) | 2024-25 | 500 | 2025-26 | 491 | — |
| final | 1996-97 … 2023-24 (≤ 2023) | 11,975 | 2024-25 (500) | — | 0 | 2025-26 | 491 | — |

Notes on the table:

- "Train ≤ 2021" / "train ≤ 2023" in the contract describe the window
  **before** the embargo season is removed. The embargo season is the
  last season of that window; removing it is what the embargo is.
  Fold 1's train window before embargo is ≤ 2021 (11,027 rows);
  Fold 2's is ≤ 2023 (11,975 rows); the final model's is ≤ 2024
  before embargo is applied to the test boundary — see below.
- Fold 1's val is a two-season window (948) because that is the only
  reading matching the contract's Fold 1 count, and because the
  original spec's val was also 948. Fold 2's val is a single season
  because its second season would be the frozen test.
- The folds are intentionally asymmetric. Symmetry would require
  either shrinking Fold 1's val to one season (contradicting the
  contract's 948) or expanding Fold 2's val into the frozen test
  (forbidden). Asymmetry is the price of keeping both the contract's
  Fold 1 count and the frozen test.
- Fold 1's "unused" season 2024-25 is neither train, val, nor test
  for Fold 1: it is future data at Fold 1's horizon. It becomes
  Fold 2's val, then the final model's embargo season. Nothing is
  double-counted: each fold's row partition sums to 12,966 (§2).
- The **final** entry is not a tuning fold. It is the protocol for
  the model that gets evaluated on the frozen test: hyperparameters
  and early stopping come from fold1/fold2 only; the final model is
  trained once on the final train set and evaluated once on 2025-26.
  Its val row count is 0 by construction, and its new-player count
  is reported as `n_test_new_player_rows`, not blended into any val
  number.
- The frozen test (2025-26, 491 rows) is never in any train set, never
  in any val set, never used for early stopping, temperature choice,
  or any other tuning decision, in any fold. The script asserts this
  per fold and fails otherwise.
- Folds are per-fold independent: Fold 2 retrains from scratch on its
  own (larger) train set. The fact that Fold 1's val seasons later
  enter Fold 2's train set is normal expanding-window behaviour, not
  leakage — leakage is defined within a fold, never across folds.

## 2. Reconciliation to the 12,966 total (embargoed default)

Every fold's partition sums exactly to 12,966. The script asserts this.

| Fold | Train | Embargo | Val | Test | Unused | Total |
|---|---|---|---|---|---|---|
| fold1 | 10,539 | 488 | 948 | 491 | 500 | 12,966 |
| fold2 | 11,491 | 484 | 500 | 491 | 0 | 12,966 |
| final | 11,975 | 500 | 0 | 491 | 0 | 12,966 |

Season sizes (verified from the vectors file, all 30 seasons
1996-97 … 2025-26): 398, 393, 377, 397, 395, 402, 394, 394, 415, 428,
418, 412, 407, 413, 420, 435, 430, 434, 450, 437, 441, 460, 457, 448,
484 (2020-21), 488 (2021-22), 464 (2022-23), 484 (2023-24), 500
(2024-25), 491 (2025-26). Cumulative through 2020-21 = 10,539;
through 2021-22 = 11,027; through 2022-23 = 11,491; through 2023-24 =
11,975; through 2024-25 = 12,475; through 2025-26 = 12,966.
`build_pairs.py` checks the four recent seasons and the total against
these constants and fails on any mismatch (override only with
`--no-count-check`, which the coordinator must approve explicitly if
the source file ever legitimately changes).

## 3. Purge + embargo: recommendation and justification

**Recommendation: hard one-season embargo gap at every train/val and
train/test boundary, on top of the purge.** This is the contract's
default recommendation, and this lane adopts it. "Hard" means the
embargo-season rows are removed from the training row set entirely
(not merely de-paired): they are never anchors, never positives, never
hard negatives, and never batch members. They remain ordinary rows for
evaluation retrieval only (a val/test anchor may retrieve its embargo
predecessor — that predecessor is unseen, which is exactly what makes
the retrieval score a generalization score).

Why purge alone does NOT suffice (the justification the contract
requires if no gap were chosen — here it is the reason a gap IS
chosen):

1. **Purge removes the pair label, not the person.** Under purge-only,
   Fold 2's val anchor (2024-25) has its own previous-season row
   (2023-24) sitting in the training set, trained as an anchor in
   pairs with 2022-23. Adjacent-season top-1 — the very metric used
   for early stopping and temperature choice — then partly measures
   person memorisation ("I have seen this player's last season"),
   not twin-structure generalisation. The purge drops 393 such pairs
   in Fold 2 but leaves all 393 predecessor rows trained on.
2. **Fold 2 has no clean eval signal without an embargo.** Fold 2's
   val is a single season, so it has zero val-internal adjacent pairs
   (§5). Every val anchor's only adjacent-season target is the
   previous season — the train season under purge-only. With the
   embargo, every val anchor's adjacent target is an unseen embargo
   row, and the eval measures what it claims to measure.
3. **The champion's published test numbers were effectively
   embargoed.** The original spec split trained ≤ 2021 and tested
   ≥ 2024, leaving two full seasons between train and test. Judging a
   challenger on a no-gap test (train through 2024-25, test 2025-26)
   would give the challenger an easier test than the champion ever
   had. The embargo keeps the promotion comparison honest, arguably
   stricter.
4. **Cost is small and quantified.** The embargo removes one season
   from training per fold (488 / 484 / 500 rows, ~4% of the train
   set) and withholds 390 / 383 / 393 train→embargo adjacent pairs
   beyond the purge (§5). Against that, the alternative is an
   inflated val signal steering every downstream decision (early
   stopping, temperature, promotion). That trade favours the embargo
   clearly.

What the embargo costs the final model (stated plainly, not hidden):
the model evaluated on the frozen test never trains on 2024-25, the
most recent and arguably most era-relevant season. If the challenger
is later promoted, a production retrain including 2024-25 is a
separate user decision; the reported frozen-test number stays the
embargoed one and must not be re-quoted as if it covered a model
trained on 2024-25.

Purge rule (applies with or without embargo, and is enforced by
assertion, not just by construction): **no adjacent-season positive
pair (N, N+1) may cross a fold boundary.** Cross-boundary pairs are
dropped, counted (§5), and the script fails if any emitted pair has
endpoints on different sides of a boundary. "Boundary" means any
train/embargo, embargo/val, val/test, or val/unused season edge —
under the embargo the train-side boundary pair is already excluded
because the embargo row is not in the train set, and the
embargo→val/test pair is excluded because the embargo row is not a
training anchor. Both directions are asserted.

## 4. Purge-only variant (for comparison, NOT the default)

Produced by `build_pairs.py --no-embargo`. Same boundaries, no season
removed; only cross-boundary pairs are dropped.

| Fold | Train rows | Val rows | Train-internal adjacent pairs | Cross-boundary pairs dropped | Val new-player rows |
|---|---|---|---|---|---|
| fold1 | 11,027 | 948 | 8,556 | 378 (2021-22 → 2022-23) | 199 |
| fold2 | 11,975 | 500 | 9,317 | 393 (2023-24 → 2024-25) | 83 |
| final | 12,475 | 0 (test 491) | 9,710 | 397 (2024-25 → 2025-26) | test new: 83 |

Use this table only to see what the embargo costs. Do not tune on
purge-only val numbers and report embargoed test numbers (or vice
versa): each variant is a self-consistent protocol, and Lane 5 must
report which one a number came from.

## 5. Pair construction

### 5a. Positives (a): same player's adjacent seasons, keyed by person_id

For each fold, for each person with rows in seasons N and N+1 where
**both** rows are in the fold's train set, emit the undirected pair
(N-row, N+1-row). In the SupCon positives map each endpoint lists the
other as a positive. Rules:

- Keyed by `person_id` only. Name matching is forbidden (see §6).
- A player with a gap season (e.g. rows in N and N+2 but not N+1)
  yields NO pair for that span — adjacency means consecutive
  season-start-years, not consecutive rows in that player's history.
- Pairs are undirected for construction but directed in the positives
  map (each endpoint is an anchor with the other as positive).
- Maximum adjacent positives per anchor is 2 (previous + next
  season); most anchors have 0, 1, or 2.

Counts (embargoed default):

| Fold | Train-internal adjacent pairs | Val-internal adjacent pairs (eval only, never training) |
|---|---|---|
| fold1 | 8,166 | 383 (2022-23 → 2023-24) |
| fold2 | 8,934 | 0 (single-season val) |
| final | 9,317 | — (test has no internal pair; its anchors' targets are embargo rows) |

Full adjacent-pair ledger (all 10,107 adjacent pairs in the file,
partitioned by endpoint location under the embargoed design — the
script's partition must match this table):

| Pair location | fold1 | fold2 | final |
|---|---|---|---|
| train → train (emitted as training pairs) | 8,166 | 8,934 | 9,317 |
| train → embargo (withheld by embargo) | 390 | 383 | 393 |
| embargo → val / test (cross-boundary, purged) | 378 | 393 | 397 |
| val → val (eval pairs, Fold 1 only) | 383 | 0 | 0 |
| val → unused / unused → test / val → test (future, never training) | 393 + 397 | 397 | 0 |
| **Total** | **10,107** | **10,107** | **10,107** |

Reading the "dropped" columns for the manifest: the contract field
`n_pairs_dropped_cross_boundary` counts the embargo→val/test
cross-boundary pairs (fold1 378, fold2 393, final 397). The extra
manifest field `n_pairs_dropped_embargo_only` counts the
train→embargo pairs withheld solely by the embargo (fold1 390,
fold2 383, final 393). Pairs entirely outside the train set were
never training candidates and are not counted as "dropped"; they
appear in this ledger only so the 10,107 total reconciles.

### 5b. Positives (b): v5's top-10 twins — ZERO usable pairs from the available file

**Finding (verified against the file, not assumed):**
`~/workspace/evals/embeddinggemma-hoops/champion_twins_test.json`
contains **991 anchors, all of them test rows** — 500 from 2024-25 and
491 from 2025-26 — with 10 twin targets each (9,910 pairs total).
Its own metadata says `split: test`, `cohort: test: 991
player-seasons`. It contains **zero train-split anchors**.

Consequences, stated without softening:

- Twin positives usable for training from this file: **0 in every
  fold** (`n_pairs_twin = 0` in every manifest entry). This is the
  correct outcome, not a script failure: emitting any of these pairs
  as training positives would leak test rows into training (every
  pair has a test anchor, and 1,919 of the 9,910 pairs are even
  same-person pairs — a test row paired with its own other seasons).
- The file remains valuable, but as **evaluation** data for Lane 5
  (twin-agreement on the frozen test), not as training labels for
  this lane. Lane 5's twin-agreement metrics should use exactly this
  file.
- **What is missing and needed:** a train-split twin file in the
  same format (anchor row id → 10 v5 twin row ids, computed over the
  same 64-d champion space, self excluded) covering train anchors.
  Until such a file exists, the challenger trains on adjacent-season
  positives only, and any claim that it "distils v5's twins" is
  false for the training phase. This is the lane's top blocker (§8).
- When a train twin file arrives, the rules are fixed now so no
  re-decision is needed: (i) emit a twin pair only if **both**
  anchor and target are in the fold's train set; (ii) drop pairs
  whose target is a val/test/embargo/future row, counting them as
  dropped, never emitting them; (iii) drop same-person targets
  (they duplicate adjacent-season or same-player signal and, per the
  standing no-self-twin lesson, a twin reveal must never be the
  player himself — same-person targets are not cross-player twins);
  (iv) drop pairs already present as adjacent pairs, counting the
  dedupe separately; (v) cap total positives per anchor at 12
  (2 adjacent + 10 twins), adjacent first, then twins in file order.
  `build_pairs.py` implements all five rules; with the current
  test-only file, rules (i)–(ii) drop all 9,910 pairs and the script
  reports that ledger instead of failing, because 0 is the true
  filtered result. Pass `--fail-on-zero-twins` to turn that ledger
  into a hard failure (recommended for any CI gate that requires
  twin positives to be present).
- The script FAILS (non-zero exit, explicit message) if it is ever
  asked to emit a pair touching a non-train row, or if a twin file
  is supplied with `--allow-test-twins` — that flag does not exist,
  deliberately. There is no sanctioned way to train on test twins.

### 5c. Negatives: in-batch + hard negatives (spec §2 default (a))

- Base negatives: every other row in the batch (in-batch negatives,
  standard SupCon denominator). No sampling, no filtering beyond
  the exclusions below.
- Hard negatives: spec §2 default **(a) hardest in-batch by current
  cosine distance, refreshed each epoch**, fallback **(c) none beyond
  in-batch** if hard-negative mining destabilises training (Lane 4
  decides the fallback on val only, and must flag it in the run
  report). Option (b) (same-era + same-position players v5 ranks far
  apart) is NOT adopted: it needs position data this lane does not
  own and it bakes v5's ranking into the negative set, which muddies
  the distillation story.
- Hard-negative exclusions (implemented by `build_pairs.py`'s
  exclusion-mask helper, consumed by Lane 4 each epoch): a row is
  NEVER a hard negative for an anchor if it is (i) the anchor itself,
  (ii) any positive of the anchor (adjacent or twin), or (iii) any
  other season of the same person (`person_id` match). Rule (iii)
  matters: a player's non-adjacent seasons are not positives, but
  mining them as "hard negatives" would teach the model to push a
  player away from himself — the exact failure the adjacent-season
  objective is trying to prevent.
- Refresh cadence: hard negatives are recomputed from the current
  encoder embeddings at the start of each epoch (Lane 4 owns the
  embeddings and the recompute; this lane owns the exclusion rules
  and the reference `hardest_in_batch` selector in the script).
- Hard negatives are a training-time selection, not a stored pair
  list: the manifest does not (and must not) contain a fixed hard-
  negative list, because a fixed list would go stale after epoch 1.

### 5d. Batching: era-stratified, every batch mixes eras

Batch size (contract §2c): **1024 anchors (+ their positives)**.
Without era stratification the model learns "same era = similar"
trivially (adjacent positives are same-era by construction, and
tracking/form masks are era-correlated). Stratification rule:

- Era bins (season-start-year): **1996–2004, 2005–2012, 2013–2019,
  2020+**. Rationale: the bins respect the tracking-mask boundary
  (tracking masked pre-2013, so no bin straddles 2012/2013) and
  separate the early, middle, tracking-era, and modern games; the
  2013–2019 bin does straddle the form-mask boundary (2015) — noted,
  accepted, because splitting it further would leave a 2-season bin
  too small for the floor rule below. Bin sizes in the final train
  set: 3,565 / 3,363 / 3,127 / 1,920.
- Per-batch quotas: proportional to bin share of the fold's train
  set, with a **floor of 64 anchors per bin per batch** (when the bin
  holds that many rows), remainder adjusted on the largest bin so
  quotas sum to 1024. Every batch therefore contains all four eras
  in non-trivial numbers; a batch is invalid if any era is absent
  (the sampler asserts this).
- Shuffling: within-bin shuffle each epoch with seed 7 + epoch
  (Lane 4's loop; the script's `epoch_batches` generator implements
  the same rule deterministically). Bins are cycled, not exhausted
  in order; leftover rows (< 1024) form a final short batch only at
  epoch end, never padded with repeats.
- Positives travel with their anchor: a batch is 1024 anchors plus
  each anchor's positives (≤ 12 each). The SupCon denominator is
  computed over the batch's anchor + positive rows, with the
  exclusions of §5c applied to hard-negative selection.
- Era stratification applies to anchors. Positives are exempt by
  necessity (a positive is defined by the anchor, not sampled) —
  but because anchors are era-mixed, positives are era-mixed in
  aggregate, and the in-batch negative pool is era-mixed by
  construction.

## 6. New-player (cold-start) slice

Definition (contract §2a, applied literally): a val/test row whose
`person_id` has **no earlier-season row in that fold's training
portion**. "Training portion" means the rows actually trained on —
post-embargo in the default design. The slice is a **separately
reported** metric everywhere (Lane 5), never blended into headline
numbers. It is computed from identity only and needs no model.

| Fold / set | New-player rows (embargoed default) | New-player rows (purge-only, for comparison) | Slice size vs set size |
|---|---|---|---|
| fold1 val (948) | 310 | 199 | 32.7% / 21.0% |
| fold2 val (500) | 142 | 83 | 28.4% / 16.6% |
| final test (491) | 147 | 83 | 29.9% / 16.9% |

Why the embargoed slice is larger (read this before comparing to the
contract's "≈ 67–98 typical" note): under the embargo, a player who
debuted in the embargo season and returns in val/test has no row in
the embargoed train set, so he counts as new — correctly, because
the model genuinely never saw him. Example: 64 players debuted in
2024-25 and returned in 2025-26; they are part of the embargoed
test slice (147) but not of the purge-only slice (83). The contract's
67–98 range describes true debutants per season (2022-23: 67,
2024-25: 83, 2025-26: 83 under purge-only counting); the embargoed
slice is a stricter cold-start measure (debutants + embargo-season
second-year players) and must be labelled as such wherever it is
reported. Lane 5 must not compare an embargoed slice number against
a purge-only slice number as if they were the same slice.

Fold 1 val new-player detail (embargoed): 124 of the 2022-23 rows
and 186 of the 2023-24 rows are new against the embargoed train set.
Fold 1's val is a two-season window, so its slice mixes true
debutants with players who debuted in the embargo season — same
labelling rule applies.

## 7. Script contract (`build_pairs.py`, draft)

Usage (from the lane directory; paths are arguments, nothing is
hardcoded to a repo):

```
python3 build_pairs.py --features <vectors.json> --twins <champion_twins_test.json> \
    --out <dir> [--no-embargo] [--fail-on-zero-twins] [--emit-batches] [--no-count-check]
```

- Inputs: a features/metadata file (the vectors.json `players` list,
  or a flat JSON list of rows with `id`, `person_id`, `season`,
  `name`) and a twin file (`twins` map: anchor row id → list of twin
  row ids). Only identity/season columns are read; feature values
  are never used, so the script works before Lane 1 resolves the
  120-feature matrix question, and Lane 4 joins pairs to the feature
  matrix by row `id`.
- Outputs (in `--out`): `fold_manifest.json` (schema:
  `fold_manifest_schema.json` in this directory), plus
  `pairs_fold1.json`, `pairs_fold2.json`, `pairs_final.json`
  (adjacent pairs, twin pairs, and the per-anchor positives map per
  fold). With `--emit-batches`, also `batches_<fold>.json` (epoch-0
  era-stratified batches, seed 7 — a worked example for Lane 4, not
  a training run).
- The script FAILS LOUD (non-zero exit, explicit message on stderr)
  on: total row count ≠ 12,966 or recent-season counts ≠ the §2
  table (unless `--no-count-check`); any row missing `person_id`;
  any duplicate person-season row; any emitted pair with an
  endpoint outside the fold's train set; any emitted pair crossing
  a fold boundary; any pair touching a frozen-test row in a training
  pair list; any fold partition not summing to the file total; any
  batch missing an era. Cross-boundary pairs are dropped by
  construction AND re-checked by assertion — the assertion is the
  fail-loud part, the drop is the mechanism.
- The script does NOT fail merely because the twin file yields 0
  training pairs: 0 is the true filtered result for a test-only twin
  file, and failing on it would make the script unusable with the
  only twin file that exists. It prints the full twin drop ledger
  to stderr and records it in the manifest. Use
  `--fail-on-zero-twins` to opt into a hard failure.
- Determinism: seed 7 everywhere shuffling occurs. Stdlib only, no
  torch, no numpy, no installs.
- The script writes only to `--out`. It never writes to any repo
  checkout, `~/workspace/evals/`, or `~/workspace/registry/`.

## 8. Blockers and open decisions (in order)

1. **Contract §2a "984" is wrong for Fold 2 val (§0).** Needs a
   coordinator amendment (this lane's recommendation: 500) before
   Lanes 4/5 build against a manifest. Nothing in this lane hides
   it: the script emits 500 and the manifest never claims 984.
2. **No train-split twin file exists.** The only twin file is
   test-only, so `n_pairs_twin = 0` everywhere and the challenger
   currently trains on adjacent-season positives only. A train twin
   file (same format, train anchors, v5 64-d space, self excluded)
   must be produced — by whom is a coordinator decision (Lane 1
   provenance or a fresh v5-space computation) — before any claim
   about twin distillation in training is made.
3. **Embargo adoption needs coordinator confirmation.** This lane
   recommends the embargo (§3) and defaults to it, but if the
   coordinator prefers purge-only, Lane 5's numbers must be
   re-based to §4 and the manifest regenerated with `--no-embargo`.
   The two variants must never be mixed within one report.
4. **Fold 1 val is two seasons, Fold 2 val is one (§1).** A
   consequence of keeping both the contract's Fold 1 count and the
   frozen test. If the coordinator wants symmetric val windows, the
   fold design itself must be amended — this lane does not have
   authority to do that unilaterally.

## 9. What this lane does NOT own

No model code, no training loop, no eval metrics, no game or
integration changes, no feature-matrix resolution (Lane 1, open
question #1), no masking rules (Lane 2). Eval retrieval candidate
policy (full space, self excluded, per spec §5) is Lane 5's to
confirm; this lane's only statement on it is that embargo/val/test
rows are never training rows, which is independent of how Lane 5
builds its candidate pool.

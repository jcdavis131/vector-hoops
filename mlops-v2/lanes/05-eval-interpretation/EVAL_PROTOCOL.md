# MTNN v7 Evaluation Protocol — Lane 5 (DRAFT)

Status: DRAFT ONLY. Train gate is CLOSED. This protocol describes work an
authorized operator runs later; Lane 5 itself runs nothing, trains
nothing, and writes no repo, registry, or production file. Companion
script: `eval_mtnn_v7.py` in this directory. The script implements this
protocol; where the two disagree, this document wins and the script must
be fixed, not the protocol reinterpreted.

Sources this protocol builds on (read first, in this order):

- Contract: `~/workspace/mlops-v2-drafts/CONTRACT.md` (§0 shared facts,
  §2a fold manifest, §2c run report, §2d eval report, §3 lane scope).
  The contract is binding. Conflicts with it are listed in §14 and are
  resolved by the coordinator, never silently by this lane.
- Challenger spec: `specs/mtnn-v6-contrastive-SPEC.md` in
  `~/workspace/vector-hoops` (§5 eval protocol, §6 risks). Where the
  spec and the contract disagree on splits, the contract wins (§14, C1).
- Prior evals reverse-engineered (read-only): `eval_twin_agreement.py`
  (twin agreement, stable-sort top-10, Spearman on shared pairs),
  `mtnn_metrics.py` (adjacent pairs keyed by stable PLAYER_ID,
  target-in-split filtering), `mtnn_validation.py` (population
  diagnostics, era buckets), `ablate_v5.py` / `tower_ablation.py`
  (mask-don't-delete ablations, paired-by-seed discipline).

## 1. Inputs and validation (fail loud, in this order)

| # | Input | Check | On failure |
|---|---|---|---|
| 1 | Champion `.f32` | Exactly 12,966 × 64 float32, finite, no zero-norm rows; sha256 recorded | Stop. If the champion file reports ≠ 12,966 × 64, investigate; never edit the champion file to fit. |
| 2 | Challenger `.f32` | Same shape checks; versioned filename only (`data/mtnn_v6_contrastive_<tag>_12966rows.f32` + sha256); never the champion filename | Stop. |
| 3 | Rows file (`--rows`) | 12,966 entries, positional alignment (entry `i` has `id == i`, matching `.f32` row `i`), every row carries `person_id` and `season` | Stop. See §14 C3: raw `assets/vectors.json` carries NO `person_id` field (verified 2026-10-26), so it is NOT an acceptable rows file. Use a person_id-enriched rows file (e.g. vectors.json after `pipeline/apply_player_identity.py`). Name fallback is banned — see §3. |
| 4 | Fold manifest (`--fold-manifest`) | Contract §2a fields present on every fold; season lists disjoint within a fold; row counts reconcile to the rows file; `n_pairs_dropped_cross_boundary` present | Stop on missing fields, overlapping seasons, or count mismatch. Pair/drop counts are Lane 3's product: recorded, not recomputed here. |
| 5 | Training run report (`--run-report`, optional) | `fold_manifest_sha256` matches the manifest passed to eval | Stop on mismatch (wrong folds = wrong eval). `feature_matrix_sha256` is recorded only; eval uses no features. |
| 6 | External champion-twins file (optional cross-check) | Compared against freshly computed champion 64-d twins | Warn on mismatch. Gated twin agreement ALWAYS uses freshly computed twins; a stale file never overrides them. |

Validation of both embedding files (shape, finiteness, norms, sha256)
mirrors spec §5 step 1 (`bin/validate_vectors.py` in the workbench
skill). Both files must pass before any metric is computed.

## 2. Folds (contract §2a, consumed — not redefined)

Expanding-window folds, season-start-year keyed. The Lane 3 manifest's
season lists are authoritative; the table below is the contract's
printed intent and the check against which the manifest is audited:

| Fold | Train | Val | Frozen test |
|---|---|---|---|
| Fold 1 | ≤ 2021 | 2022–23 (948 rows: 2022-23 = 464 + 2023-24 = 484) | — |
| Fold 2 | ≤ 2023 | 2024–25 (contract prints 984 rows: 500 + 484) | — |
| Final | — | — | 2025-26 (491 rows), FROZEN |

Rules that apply to every fold:

- The frozen test (2025-26) is never tuned on, never trained on in any
  fold, and never used for early stopping or hyperparameter choice.
  Temperature, dropout rate, and every other choice are tuned on val
  only (spec §3: temperature grid {0.05, 0.1, 0.2} on val only).
- Purge/embargo: adjacent-season pairs (N, N+1) MUST NOT cross a fold
  boundary. Lane 3's pair builder drops cross-boundary pairs and
  documents the counts dropped per fold. A one-season embargo gap
  between train and val/test is the default recommendation; if Lane 3
  chooses no gap, it must justify why the purge alone suffices
  (contract §2a). Eval does not re-litigate the purge, but the eval
  report must carry the manifest's dropped counts so the reader can.
- New-player slice: rows whose `person_id` has NO earlier-season row in
  the training portion of that fold. Reported as a separate metric
  everywhere, never blended into any headline number. Its pair mapping
  is pinned in §4.6 — the contract defines the slice on rows, and a
  row-level slice cannot be scored directly as retrieval.
- Row counts must reconcile to the 12,966 total. See §14 C7: contract
  Fold 2 as printed does not reconcile under season-start-year keying
  (see §14). Until Lane 3 resolves the manifest, the script trusts the
  manifest's season lists and flags the disagreement; it does not pick
  a reconciliation on its own.

## 3. One code path (the anti-cheat rules)

1. **Same function, both models, every prefix.** `evaluate_embeddings()`
   in `eval_mtnn_v7.py` is the only metric implementation. No per-model
   branch exists in the metric code. Never hand-tune per model.
2. **Slice, then normalize, then measure.** At prefix m, take the first
   m dims and L2-normalize, for both models, with the same function.
   The champion's prefixes are truncated-champion diagnostics: the
   champion serves at 64-d only, and the gate is judged at 64-d only.
3. **Exhaustive retrieval.** The full 12,966-row space is searched for
   every query. NO sampling. This deliberately diverges from
   `mtnn_metrics.recall_at_k`, which scores a 500-pair subsample drawn
   from the global RNG (its number therefore depends on how many RNG
   draws happened before it). Exhaustive numbers are not comparable to
   subsampled numbers.
4. **Self excluded.** The query row itself never counts as a neighbour,
   in retrieval, twin lists, NN stats, or the era test.
5. **Identity is `person_id`, never name.** Adjacent pairs, new-player
   membership, and same-person exclusion are all keyed by `person_id`.
   Name alone is wrong: distinct players share names (Dee Brown
   b1968/b1984, Reggie Williams b1964/b1986, Mike James, Chris
   Johnson). This is also the PR #194 lesson: a Daily Court reveal
   must exclude the target's whole person, not just one row.
6. **Pessimistic ties.** For query q and candidate r, the pessimistic
   rank is 1 + #{s ≠ q : sim(s) > sim(r)} + #{s ≠ q, r : sim(s) == sim(r)}.
   Tied rows share the worst rank of their tie group. Top-1 counts only
   when the target's pessimistic rank is 1 (strictly greater similarity
   than every other non-self row); recall@10 counts only when the
   pessimistic rank is ≤ 10. A top-10 SET is {r : pessimistic rank
   ≤ 10}; it can hold fewer than 10 rows when a tie group straddles
   the boundary, and hit-rate@10 still divides by 10 (pessimistic).
   This is stricter than `eval_twin_agreement.py`'s stable argsort,
   which breaks ties by row order — deterministic, but not pessimistic.
7. **Search space is the full space, always.** Retrieval queries the
   full 12,966 rows (self excluded), including rows from train seasons.
   Restricting the search space to a split would inflate scores and
   hide era leakage; the prior evals' convention is full-space search.

## 4. Metric definitions (per fold, per prefix, both models)

Every metric below is computed at every m in {8, 16, 32, 64}, for every
fold's val split, every fold's test split where present, and the frozen
test. "Per fold per prefix" in contract §2d means exactly this grid;
no metric may be reported at 64-d only with the other prefixes omitted.

### 4.1 Adjacent-season retrieval: top-1 and recall@10

- Pairs: same `person_id`, consecutive season-start years (y2 − y1 = 1),
  built from the rows file.
- A pair is scored for a split when its TARGET season is in that
  split's season list (`mtnn_metrics.filter_pairs_by_split` convention).
- For pair (a, b): top-1 hit iff b's pessimistic rank from query a is
  1; recall@10 hit iff that rank is ≤ 10. Report the hit fraction and
  `n_pairs`. Empty pair sets report null, never 0.
- Direction: higher is better for both.

### 4.2 Continuity (lower is better)

Pinned definition (see §14 C2 for why pinning was necessary): the spec
and the workbench skill quote a champion continuity of 0.176 without a
formula. The closest recorded definition is
`train_mtnn.continuity_report` / `sweep_stability.continuity`:

- For each season boundary (source-start-year y, pair y → y+1), the
  boundary mean = mean same-player adjacent-season cosine over that
  boundary's pairs (boundaries with fewer than 30 pairs are dropped,
  matching the prior code).
- `continuity_spread_global` = max − min over MODERN boundaries
  (source-start-year ≥ 2016). Lower is better: a flat continuity curve
  across eras means the space generalizes; a peaked curve means it
  memorizes the training window and falls off at the boundary.
- Because it is computed on the full space, the global spread is
  identical for every fold; the report says so explicitly rather than
  pretending it is a per-fold measurement.
- Per-split spread: the same max − min restricted to boundaries whose
  TARGET season is in the split. A split with fewer than two qualifying
  boundaries has NO spread: report null, never 0.0. The frozen 2025-26
  test has exactly one boundary (2024-25 → 2025-26), so its per-split
  spread is always null.
- **Gated continuity number: the global spread.** The gate (§6) compares
  challenger vs champion global spread at 64-d. Per-split spreads and
  the full per-transition table are supporting evidence.

### 4.3 Nearest-neighbour cosine stats (diagnostic, not gated)

For each query row whose season is in the evaluated split (self
excluded): top-1 cosine and mean top-10 cosine. Report n_queries,
top-1 mean / std / p5 / p50 / p95, mean top-10 cosine, and the fraction
of queries with top-1 cosine ≥ 0.999. Purpose: collapse watch. A
collapsed space shows top-1 mean near 1.0 with tiny std (everyone's
nearest neighbour is nearly identical). Collapse flag (§6): top-1 mean
≥ 0.99 or top-1 std ≤ 0.01 on any val fold or the frozen test. The flag
blocks a PROMOTE-CANDIDATE recommendation; it is not itself a primary
metric.

### 4.4 Twin agreement vs the champion (guardrail, not gated)

Champion reference: champion 64-d top-10 sets (self excluded only,
matching the prior eval — NOT the Daily Court whole-person rule; the
Daily Court rule is used only for the era test and spot checks, §9/§11).
Challenger: top-10 sets at each prefix. Cohorts: each fold's val and
test splits, plus the frozen test (the gated reporting cohort is the
frozen test; val cohorts are diagnostics).

Per cohort, report:

- hit-rate@10 = mean over queries of |champion_top10 ∩ challenger_top10| / 10;
- mean overlap ± std (the same quantity's mean and standard deviation
  — reported together so a mean is never read without its spread);
- shared-pair Spearman = mean Spearman rho of the two rank orders
  within the intersection, over queries with |intersection| ≥ 2, plus
  the count of such queries (the prior eval's convention, average-tie
  ranks).

Random baseline for orientation: two random 10-sets from 12,965
candidates share ≈ 0.0077 rows in expectation, so random hit-rate@10 is
≈ 0.0008. A measured 0.07 is ~90× random, not near-random.

**Why this is not gated — the distillation ceiling (§7).** Positives
include v5's own twins, so v6 cannot beat v5 on twin agreement; it can
only match. A gate requiring a "beat" on twin agreement would make
promotion impossible by construction. Twin agreement is therefore a
transfer diagnostic: high frozen-test agreement means the metric
transferred to held-out seasons; low agreement means it did not. A
hit-rate@10 below 0.05 on the frozen test is flagged in the report as
"did not transfer" (diagnostic flag, not a gate fail by itself).

### 4.5 Prefix reporting and the degradation curve

Publish the full degradation curve at every prefix: top-1, recall@10,
and hit-rate@10 at 8/16/32/64-d, per split, for the challenger (and the
truncated champion for reference). Truncation levels are reported, not
promoted on (spec §5). The one prefix decision the protocol makes is
the 16-d serving-unification check in §6.2.

### 4.6 New-player slice (separate, never blended)

Contract §2a defines the slice on rows. A debut row has no adjacent
predecessor, so it cannot be a retrieval target. The pinned mapping:

- Per fold: debut rows = rows whose `person_id` is absent from the
  fold's training seasons AND whose season is the person's earliest
  season, restricted to rows in the fold's val or test seasons.
  Scored pairs = adjacent pairs sourced at those rows whose TARGET
  season is outside the fold's training seasons (held-out targets for
  this fold). Train-window debut pairs are excluded: they were
  training positives, not held-out scores.
- Frozen test: reference = the union of all folds' training seasons.
  Report BOTH (a) frozen debut rows (frozen-test rows whose person is
  absent from the reference and whose season is their debut season) —
  retrieval null by construction, because a 2025-26 debut has no next
  season in the file; and (b) cold-start transitions — pairs whose
  target is in the frozen test and whose source person is absent from
  the reference (players who debuted after the training window,
  e.g. in the val window, retrieving their frozen-test season).
  (b) is the frozen-test cold-start number that actually exists.
- Always report `n_new_rows` / `n_pairs` alongside every slice score,
  so a small-n slice is never mistaken for a precise one. Typical
  cold-start volume is ~67–98 new players per recent season (~83
  typical, contract §0) — expect small-n noise and say so.

### 4.7 Tower ablations (see §8) and era test (see §9)

Both are part of the eval report (contract §2d) but neither gates
promotion on its own, except the era-test leak flag (§9.4), which
downgrades a PROMOTE-CANDIDATE recommendation to RESEARCH-ONLY.

## 5. What the script writes (eval report interface, contract §2d)

`eval_mtnn_v7.py --out <dir>` writes `eval_report.json` in that
directory and nothing else (plus `spot_check_candidates.json` when
`--spot-check-out` is given). Schema (keys, not values — values are
whatever the run measures):

```json
{
  "champion": {"path": "...", "sha256": "...", "model": "mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256", "rows": 12966, "dim": 64},
  "challenger": {"path": "...", "sha256": "..."},
  "rows_file": {"path": "...", "sha256": "..."},
  "fold_manifest": {"path": "...", "sha256": "..."},
  "run_report": {"seed": 7, "config": "...", "feature_matrix_sha256": "..."},
  "warnings": ["..."],
  "champion_by_prefix": {"64": {"folds": "...", "frozen_test": "...", "continuity_global": "..."}, "32": "...", "16": "...", "8": "..."},
  "challenger_by_prefix": {"64": "...", "32": "...", "16": "...", "8": "..."},
  "twin_agreement": {"64": {"frozen_test": "...", "fold1_val": "..."}, "32": "...", "16": "...", "8": "..."},
  "promotion_gate_64d": {"checks": "...", "collapse_watch": false, "retention_16d": "...", "decision_recommendation": "...", "reasons": ["..."]},
  "tower_ablations": {"arms": {"tracking": "..."}},
  "era_test": {"arms": {"tracking": "...", "form": "...", "control": "..."}, "leak_flag": false}
}
```

Each per-split block carries `retrieval` (top-1, recall@10, n_pairs),
`nn_cosine`, and `continuity_split_spread`; each fold block carries its
`new_player` slice; the frozen-test block carries its `new_player`
block (§4.6). Lane 6 consumes this report by reference (asset names,
widths, metric gates). The script never writes to the registry: the
decision record (winner, metrics table, both sha256s, date) goes to
`~/workspace/registry/` and the scoreboard mirrors the
`eval_scoreboard*.json` convention only after the user's promotion word
(spec §5 step 6) — that step belongs to the coordinator, not this lane.

## 6. Promotion gate (read this whole section before judging any run)

### 6.1 The gate (64-d only)

The challenger is a PROMOTE-CANDIDATE **only if ALL of the following
hold at 64-d**, measured in one run, same code path, both models:

1. Top-1: challenger > champion on Fold 1 val AND Fold 2 val AND the
   frozen test.
2. Recall@10: challenger > champion on Fold 1 val AND Fold 2 val AND
   the frozen test.
3. Continuity: challenger `continuity_spread_global` < champion
   `continuity_spread_global` (lower is better).
4. No collapse flag (§4.3) on any val fold or the frozen test.
5. No era-test leak flag, when the era test was run (§9.4). When the
   era test was NOT run, any PROMOTE-CANDIDATE recommendation is
   explicitly conditional on a clean era test.

Anything less → RESEARCH-ONLY under its versioned filename. A
single-metric win is not a promotion. A win on val but not the frozen
test is not a promotion. A win on the frozen test but not val is not a
promotion. "Close" is not a promotion. The script's output is a
RECOMMENDATION, not a promotion: **promotion itself needs the user's
separate word after the report** (contract §2d, spec §5). No script,
lane, or coordinator promotes on its own.

Multi-seed rule: the training script's default seed is 7. The gate is
judged on the seed-7 run. If multi-seed runs exist, the report must
also show the mean across seeds, and a promotion recommendation
requires the mean to pass the same checks — no seed cherry-picking.
Seeds are never selected on test performance.

### 6.2 The 16-d serving-unification check (separate from promotion)

Retention per split = challenger top-1 at 16-d ÷ challenger top-1 at
64-d. The 16-d level earns the serving-unification story (one asset
replacing both the 64-d embedding and the separate 14-d projection)
**only if retention ≥ 0.90 on every val fold AND the frozen test**.
If it does not, say so plainly and keep the separate 14-d projection
(`assets/vectors.json`, which is NOT a projection of the embedding —
it is 14 raw per-100 stats, z-scored within season; do not conflate the
two spaces). Recall@10 retention at 16-d is reported alongside as a
secondary check. Unification is a serving decision, not a promotion
criterion: a challenger can be a promote-candidate at 64-d while its
16-d level fails unification, in which case 64-d serves and the 14-d
projection stays.

### 6.3 What "beats" does and does not mean

- "Beats" is a strict inequality on the measured number in this run.
  No significance test is claimed on a single run: with ~500–1,000
  pairs per split, top-1 differences below ~0.02 are within sampling
  noise and must be described as such in the report narrative, even
  when the strict gate passes. The gate is a floor, not a proof.
- NEVER compare a challenger number from this run against an old
  anchor number (top-1 0.118, continuity 0.176) as the gate. Anchors
  come from other protocols (subsampled or differently-cohorted runs —
  other scoreboards in the same repo quote champion top-1 as 0.438 and
  0.5081 under different cohorts). The gate compares challenger vs
  champion measured HERE, same code path. Anchors are context only.

## 7. The distillation ceiling (honest, up front)

Positives include v5's own twins (train-split rows only — the twin
file also contains test rows, and using those as training labels
leaks; Lane 3 owns that filter). Therefore:

- v6 **cannot beat v5 on twin agreement**; it can only match. Do not
  present a twin-agreement shortfall as a surprise failure, and do not
  present a twin-agreement match as a win.
- The winnable metrics are the held-out adjacent-season retrieval
  ones, where the prior v6 scored top-1 0.0007 vs the champion's 0.118
  and continuity 0.507 vs 0.176 — and stayed research-only. That gap is
  the bar, and a research-only outcome is the likely result (spec §6).
- A win proves a better metric space for twin structure — not new
  basketball knowledge, and not a license to rebuild game mechanics.
  The mechanics question stays separate.

## 8. Tower ablations (whole family masked at inference)

Purpose: attribute retrieval performance to tower families, and check
that no single family (especially a masked family — tracking, form)
carries the space.

Interface (Lane 4 / the encoder operator supplies these; Lane 5 never
encodes): one ablated `.f32` per family, produced by the SAME encoder
with the WHOLE family masked at inference (values and mask bits zeroed,
`tower_ablation.py`'s mask-don't-delete rule: masking keeps fusion
width constant, so the delta measures information content, not a
reshaped architecture). Files are named `<family>.f32` in the
`--ablate-dir`, one per family of the 17 in contract §0. The script
evaluates each arm at 64-d (full metric set) and 16-d (top-1/recall
only) on every val fold and the frozen test, plus global continuity.

Per-family contribution report (per arm):

- `top1_delta_64d` and `top1_delta_16d` per split (ablated − full;
  negative means masking hurt, so the family helps).
- `continuity_spread_delta_64d` (ablated − full; positive means the
  space got less flat without the family).
- `contribution` label: "family helps" when masking lowers top-1 on
  every val fold AND the frozen test; "family hurts" when masking
  raises top-1 everywhere; otherwise "mixed". Labels describe this run
  only.
- No paired t-test is claimed on single-run ablations. The prior
  `tower_ablation.py` paired-t (|t| ≥ 3.5) needs multiple seeds with
  the same seed list on every arm; if multi-seed ablated embeddings
  are ever supplied, the report must show per-seed deltas and the
  paired statistic — until then, deltas are reported raw, without a
  significance claim.
- The arm list must include tracking and form separately (they are the
  era-leak suspects, §9) and at least one always-present family as an
  informal control (e.g. volume). A family whose ablation changes
  nothing anywhere is reported as such, not dropped from the table.

## 9. Mask-ablation era test (the mask-as-era-signal leak test)

### 9.1 The hypothesis

Tracking is masked pre-2013 and form pre-2015, so mask presence itself
is an era signal: a modern player HAS tracking data, a pre-2013 player
does not. A lazy model can learn "tracking present = modern" and cluster
by era instead of by playing style. Era-stratified batches (§2, spec)
and the twin-agreement test (which includes cross-era twins) are the
training-time guards; this test is the eval-time check that they worked.

### 9.2 Procedure (at 64-d, the serving width)

1. Take the challenger embeddings (base) and re-encoded challenger
   embeddings with ONE family artificially masked — tracking first,
   then form separately, never both at once. Masking applies to modern
   rows only: tracking-masked queries are rows with season-start
   ≥ 2013 (where tracking was present); form-masked queries are rows
   with season-start ≥ 2015. Masking a row where the family was already
   masked tests nothing and is excluded.
2. For each query row, build the Daily Court twin list: top-10
   neighbours excluding self AND the whole person (PR #194 rule — own
   other seasons are the nearest rows and would otherwise drown the
   era signal), pessimistic ties, base vs masked with the same code.
3. Era of a twin list = mean season-start year of its top-10 twins;
   modal era bucket uses the `mtnn_validation` buckets (pre-2000,
   2000s, 2010s, 2020s).
4. Repeat with a CONTROL family masked (an always-present family such
   as volume, masked on the same modern queries). The control is what
   makes the test interpretable: any masking perturbs twins somewhat.
5. Report per arm: n_queries, mean absolute era shift (years), fraction
   of queries with |shift| ≥ 5 years, fraction whose modal era bucket
   changed, fraction shifted older, mean signed shift (negative =
   masked twins skew older, the leak's expected direction: a modern
   player stripped of tracking looks pre-2013).

### 9.3 Interpretation

- Tracking or form masking shifts twins markedly OLDER while the
  control barely moves → mask-as-era-signal leak: the model used mask
  presence as an era feature. This is evidence against the space, and
  it must be reported prominently even if retrieval metrics pass.
- All arms shift similarly (including the control) → the test is
  non-specific (masking perturbs the space generally); do NOT conclude
  a leak from tracking/form alone. Report the control comparison, not
  the absolute shift.
- No arm shifts much → no evidence of era leakage from masking (this
  does not prove the space is era-free — era-stratified retrieval and
  cross-era twin agreement are the other guards).

### 9.4 Leak flag (script rule, pinned)

- With a control arm: leak flag fires when (tracking OR form
  frac_shift_ge_5_years) − (control frac_shift_ge_5_years) > 0.20.
- Without a control arm: leak flag fires on the absolute fallback bar
  of 0.30 for tracking or form. A no-control era test is second-class
  evidence and must be labelled as such in the report.
- A fired leak flag downgrades any PROMOTE-CANDIDATE recommendation to
  RESEARCH-ONLY (§6.1 step 5). The leak does not need a second vote:
  shipping a space known to use mask presence as an era feature would
  mislead every cross-era surface (Daily Court era twins, Career
  Trails, Atlas).

## 10. SAE features (interpretation only — detail in SAE_NOTES.md)

A sparse autoencoder on tower outputs is an interpretation tool, not
an eval metric and never a promotion input. It does not change
embeddings, does not feed training, and does not change game mechanics.
Its full sketch — training sketch, one-feature-one-idea validation
with counterexamples, and the plain-words translation format — lives in
`SAE_NOTES.md` in this directory. The eval report references SAE
findings only as interpretation notes attached to a run, clearly
labelled as post-hoc description, never as evidence for the gate.

## 11. Daily Court twin-quality spot check (20 held-out pairs, eyeball test)

Downstream sanity (spec §5 step 4; contract §2d): numbers can pass
while twins look wrong to a basketball eye. This check catches that.

### 11.1 Slate selection (deterministic, not cherry-picked)

`eval_mtnn_v7.py --spot-check-out` writes `spot_check_candidates.json`:
20 queries from the frozen test, sampled with seed 7, stratified by
era bucket × position (falling back to era only when no position field
exists). Each candidate carries the query (name, season, person_id),
the challenger top-1 Daily Court twin (whole person excluded) with its
cosine, and the champion top-1 Daily Court twin with its cosine. The
reviewer fills in `reviewer_verdict` and `reviewer_notes` per pair.
Selection is mechanical: the reviewer does not pick favourable queries,
and a failed pair is not swapped for a better one.

### 11.2 Checklist (one row per pair; copy this table into the report)

| # | Query (name, season) | Challenger twin (name, season, cosine) | Champion twin (name, season, cosine) | Smell test | Notes |
|---|---|---|---|---|---|
| 1–20 | | | | PASS / FAIL / HARD-FAIL | |

Per pair, the reviewer checks:

1. **Not the player himself.** The twin is not the query player in any
   season. A self-twin is a HARD-FAIL (see §11.3) — this is the PR #194
   bug, and it must never reappear on a Daily Court surface.
2. **Not a same-name wrong person.** Where a name collides (Dee Brown,
   Reggie Williams, Mike James, Chris Johnson), the twin's person_id
   must match the intended career, not just the display name.
3. **Stat-profile plausibility.** Do the twin's headline stats (the
   14 per-100 stats in the rows file, z-scored within season) look like
   the query's — same broad role (scorer, playmaker, rim protector,
   shooter, rebounder), similar volume/efficiency shape? Exact stat
   equality is NOT required; twins are neighbours, not clones.
4. **Era plausibility is NOT required.** Cross-era twins are the
   product (era twins are a feature, not a bug). A 1990s twin for a
   2020s player fails only if the stat profile also fails check 3.
5. **Position plausibility is a soft check.** Cross-position twins can
   be legitimate (big wings, combo guards, stretch bigs). A position
   mismatch fails only with a stat-profile mismatch to back it.
6. **No trivial same-team-same-season artefact.** A twin who is only a
   twin because of shared team-season context (same roster, same
   season, similar team stats) with a weak stat match is a FAIL — the
   twin should survive on playing style, not on jersey.
7. **Challenger vs champion.** Where challenger and champion twins
   disagree, the reviewer notes which one passes the smell test. A
   challenger twin that is plausible while the champion's is not is
   genuine evidence FOR the challenger; the reverse is evidence
   against it. Neither alone decides promotion.

### 11.3 Pass bar

- Pass bar: ≥ 17/20 pairs PASS, AND zero HARD-FAILs.
- HARD-FAIL = self-twin (any season of the query player) or same-name
  wrong-person twin. One HARD-FAIL fails the whole spot check,
  regardless of the other 19.
- A failed spot check (below 17/20, or any HARD-FAIL) sends the run to
  RESEARCH-ONLY pending Lane 6 recalibration review — it does not
  silently adjust thresholds, and it does not block a run whose gate
  metrics pass from being reported as a PROMOTE-CANDIDATE with the
  spot-check failure attached as a blocking condition. The user decides
  with both facts in front of him.

## 12. Operator run checklist (when a run is authorized)

1. Resolve contract open question #1 (feature matrix) and record the
   choice — eval never runs on an unresolved input.
2. Confirm the Lane 3 manifest (season lists, purge counts) and the
   Lane 4 run report (seed, sha256s) match the files being evaluated.
3. Validate both embedding files (§1); record both sha256s.
4. Run `eval_mtnn_v7.py` with champion, challenger, rows, manifest,
   out dir; add `--ablate-dir` and the `--era-masked-*` arms when the
   re-encoded files exist; generate the spot-check slate.
5. Read the gate (§6), the degradation curve (§4.5), the new-player
   slice (§4.6), the ablation table (§8), the era test (§9), and the
   spot-check verdicts (§11) together. No single section decides.
6. Write the report narrative in plain language: what won, what lost,
   what is noise, what is a leak, what stays research-only. Attach
   `eval_report.json` and the completed spot-check table.
7. Hand the report to the coordinator. Do NOT write to the registry,
   do NOT touch production assets, do NOT promote. Promotion needs the
   user's separate word.

## 13. Failure modes the protocol refuses to paper over

- Missing `person_id` → fail, never name fallback (§1, §3).
- Champion shape ≠ 12,966 × 64 → stop and investigate (§1).
- Manifest/rows count mismatch → fail (§1).
- Run-report manifest sha mismatch → fail (§1).
- Empty pair set, single-boundary split, or last-season debuts → null
  with a reason, never 0 (§4).
- Collapsed space (NN stats, §4.3) → flag blocks promotion (§6).
- Era leak (mask test, §9) → flag downgrades promotion (§6).
- Twin-agreement "failure" against an impossible beat-bar → not a
  failure at all; the bar was misread (§7).
- A metric that looks good only because the search space was narrowed
  or the split was tuned on → invalid run; re-run under §3.

## 14. Conflicts and open questions (for the coordinator, not silently resolved)

- **C1 — Spec vs contract test definition.** Spec §2/§5 define test as
  ≥ 2024 (991 rows: 2024-25 + 2025-26). Contract §2a defines the frozen
  test as 2025-26 only (491 rows), with 2024-25 inside Fold 2's val
  window. Using the spec test would double-count Fold 2 val rows as
  test rows and let val tuning leak into the test verdict. RESOLUTION
  USED HERE: the contract wins; the gated test cohort is 2025-26
  only. A spec-test diagnostic (≥ 2024) must never be computed as part
  of the gated run, and must never be used for tuning.
- **C2 — Continuity formula undocumented.** The 0.176 champion anchor
  is quoted in the spec, the workbench skill, and the contract without
  a formula. RESOLUTION USED HERE: pinned to the
  `train_mtnn.continuity_report` spread (max − min modern boundary
  means, ≥ 2016, ≥ 30 pairs per boundary), the closest recorded
  definition. If that pin is wrong, the anchor comparison is wrong —
  which is why the gate compares same-run numbers, never anchors (§6.3).
- **C3 — `person_id` in the rows file.** Contract §0 says all 12,966
  rows in the master vectors file carry a `person_id`. The served
  `assets/vectors.json` as read 2026-10-26 carries NO `person_id`
  field on any player. RESOLUTION USED HERE: the script requires a
  person_id-enriched rows file and fails loud otherwise; it never
  falls back to name. Lane 3 / the coordinator must name the
  authoritative enriched file before any run.
- **C4 — Champion top-1 anchor disagrees with itself.** The spec's
  0.118 sits alongside other in-repo scoreboards quoting champion
  top-1 as 0.438 and 0.5081 under different cohorts/protocols.
  RESOLUTION USED HERE: anchors are context only; the gate is
  same-run, same-code-path (§6.3).
- **C5 — Twin agreement as a gate metric is impossible.** Spec §6's
  distillation ceiling means a "beat v5 on twin agreement" gate can
  never pass. RESOLUTION USED HERE: twin agreement is a guardrail /
  transfer diagnostic (§4.4), and the primary gate is the retrieval
  trio (§6.1). If the coordinator intended twin agreement as a gate
  metric, the gate as written is unsatisfiable and needs an explicit
  amendment — this lane does not silently keep an impossible gate.
- **C6 — New-player slice: rows vs pairs.** Contract §2a defines the
  slice on rows; retrieval needs pairs. RESOLUTION USED HERE: §4.6's
  source-row mapping with held-out targets, plus the frozen-test
  cold-start transitions. If Lane 3 defines the slice differently
  (e.g. target-based with a different reference), the script's
  `new_player` block must be amended to match — the report must state
  which mapping was used.
- **C7 — Fold 2 counts do not reconcile (contract §2a internal).**
  Under season-start-year keying, Fold 2 train ≤ 2023 (through
  2023-24) with val 2024–25 as two start-years gives 500 + 491 = 991
  rows, not the printed 984; 984 = 500 + 484 pairs 2024-25 with
  2023-24, which would put train at ≤ 2022. Fold 1 reconciles under
  start-year keying (464 + 484 = 948) but not under end-year keying
  (488 + 464 = 952), so the two folds' printed triples do not share
  one year convention. RESOLUTION USED HERE: the manifest's season
  lists are authoritative; the script validates counts against the
  rows file and flags any disagreement with the printed counts. Lane
  3 must resolve the manifest before any run is gated on it.
- **No further conflicts found in Lane 5's scope.** Tower-output export
  for the SAE sketch (§10) is an open interface question for Lane 4 /
  the coordinator (file format, row order, sha256), listed in
  SAE_NOTES.md §6 rather than duplicated here.

## 15. What this lane does not do

No training code. No game or integration code (Lane 6 owns surfaces,
thresholds, and recalibration). No registry writes. No production
promotion. No redefinition of the fold manifest (§2a) or the training
run report (§2c) — both are consumed as specified. If a future run
needs a different metric, it amends this protocol first and re-runs
everything under the amended protocol; it does not add a metric
mid-run to rescue a failing gate.

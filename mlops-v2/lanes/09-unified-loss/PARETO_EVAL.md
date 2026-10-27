# Lane 9 — Phase 2 Pareto Evaluation Protocol (DESIGN ONLY)

**Status:** DESIGN ONLY. No training runs, no GPU, no package installs,
no repo writes, no prod writes, no merge. The joint model is NOT built,
trained, or evaluated in this pass. All tolerances, margins, and
thresholds below are PROPOSED — pending user confirmation before any
training — never measured facts. The user confirms them (§6) before
any Phase 2 run is judged against them; a run judged against
unconfirmed tolerances is not a verdict, it is a draft.

**Authority:** Contract §7 (separate baselines as ablation controls;
twin-space promotion gate unchanged) and §8 (Pareto eval: no
regression on either head beyond a stated tolerance, plus a win on at
least one joint-only metric). Companion doc: `UNIFIED_LOSS_DESIGN.md`
(the model); `RESEARCH_NOTES.md` (the citations).

## 0. The rule in one paragraph

The joint model is judged on THREE axes, and it must pass ALL THREE
to earn sharing (§7's both-axes gate, made concrete):

1. **Retrieval axis:** no regression versus the separate Lane 4
   contrastive baseline beyond the tolerances in §2.
2. **Dynamics axis:** no regression versus the separate Lane 8 JEPA
   baseline beyond the tolerances in §2 (Mode S dynamics are judged
   by future twins §3 as well as by Mode G's own eval when Mode G is
   active; Mode G absence is NOT a dynamics regression — see §2.3).
3. **Joint-only axis:** a win on future twins (§3) against the
   persistence control, by at least the margin in §3.4.

Fail any axis → the joint model does not justify sharing. Fail axis 1
or 2 even while winning axis 3 → the joint model is a THIRD model
with a party trick, not a unification (Lane 8 §4.1's own warning) —
it stays research-only and the separate baselines stand. Win axes 1
and 2 but not 3 → the joint model is a successful multi-task run, not
a successful unification — it has not earned the bridge's complexity.

## 1. Comparison discipline (how every number is computed)

- **Same folds, same seeds, same code path.** Every comparison is
  joint-vs-baseline on the SAME fold (Contract §2a expanding window:
  Fold 1 train ≤ 2021 / val 2022–23; Fold 2 train ≤ 2023 / val
  2024–25; frozen test 2025–26, never tuned on, never trained on,
  never used for early stopping). Seeds: seed 7 (Lane 4 default) plus
  two further seeds (PROPOSED: 8 and 9 — the exact seeds matter less
  than that there are ≥ 3 and they are fixed before runs start).
  Tolerances in §2 are checked on the MEAN over seeds; any single
  seed regressing beyond 2× the tolerance is flagged in the report
  even if the mean passes (a mean can hide a collapse).
- **Same code path for champion, baseline, and joint** (Contract
  §2d): exhaustive retrieval, self excluded — and, per the standing
  self-twin lesson, PERSON-excluded (all rows of the same person_id
  excluded from a row's twin retrieval, not just the row itself),
  pessimistic ties. Every metric at every prefix m ∈ {8, 16, 32, 64}
  for the twin space (slice + re-normalize).
- **New-player slice reported separately, never blended** (Contract
  §2a): rows whose person_id has no earlier-season row in the
  training portion of that fold (~83/season typical). The joint
  model's new-player numbers matter MORE than its headline numbers,
  because Mode S predictions cannot exist for debut players (no
  prior season to predict from) — a joint model that helps veterans
  while hurting debuts has not improved the twin space.
- **Val gates frozen; frozen test is the verdict.** A joint model
  that passes val but regresses on the frozen 2025–26 test FAILS —
  val is a gate to the test, not the verdict. Hyperparameters
  (including prefix weights and uncertainty scalars' initialization)
  are tuned on val ONLY; the frozen test is run once per final
  configuration, with the result reported whatever it is.
- **Baselines must exist first.** If either Phase 1 baseline is
  unmeasured (no run report on the same folds), the corresponding
  axis is BLOCKED, not passed by default. "No baseline, no verdict"
  is the entry condition (§7), restated as an eval rule.

## 2. No-regression tolerances (PROPOSED, pending user confirmation)

Tolerances are ABSOLUTE differences (percentage points for rates,
raw units for continuity), joint-minus-baseline, on the same fold
and seed protocol. "Within tolerance" means the regression is no
larger than the number; an improvement of any size passes.

### 2.1 Retrieval axis (joint twin head vs. Lane 4 separate baseline)

| Metric (64-d unless stated) | Tolerance (PROPOSED) | Notes |
|---|---|---|
| Val top-1 (adjacent-season, per Lane 4 §"early stopping") | ≥ baseline − 0.005 (0.5 pp) | Champion reference: 0.118 (Contract §0). 0.5 pp ≈ 4% relative at that level — tight enough to mean something, loose enough to survive seed noise. |
| Val recall@10 | ≥ baseline − 0.010 (1.0 pp) | Recall is noisier than top-1; wider band. |
| Val continuity (lower better) | ≤ baseline + 0.010 | Champion reference: 0.176. Continuity is a distance (lower better), so the tolerance is an allowed INCREASE. |
| Val new-player-slice top-1 | ≥ baseline − 0.005 (0.5 pp) | Same band as headline top-1, applied to the slice separately. No hiding a debut regression inside a veteran win. |
| Frozen-test top-1 / recall@10 / continuity / new-player top-1 | Same bands as val, on 2025–26 | The frozen bands are the verdict; val bands are the gate. |
| 16-d retention: 16-d top-1 as % of 64-d top-1 | ≥ 90% (from Contract §2d, NOT proposed — this one is contract) | Applies to the joint model's OWN 16-d vs. 64-d, on val and frozen. If the joint model breaks the serving-unification story (16-d lightweight surfaces), that is a regression of the product case, not just a metric. |
| Twin-agreement vs. champion (hit-rate@10 / mean overlap ± std / shared-pair Spearman, Contract §2d) | No hard tolerance (PROPOSED: report-only) | These measure agreement with v5, not quality; a joint model that legitimately IMPROVES on v5 will disagree with v5. Gating on agreement would punish improvement. Reported so disagreement is visible and explainable, not hidden. |

### 2.2 Dynamics axis (joint dynamics vs. Lane 8 separate JEPA baseline)

Lane 8's eval (§5 of `JEPA_DESIGN.md`) sets NO thresholds before the
first model exists ("setting a number before the first model exists
would be inventing a bar"). This protocol therefore does NOT invent
absolute bars for JEPA quality — it sets RELATIVE no-regression bands
against the separate JEPA baseline once measured, which is the only
honest bar available before first measurement.

| Metric | Tolerance (PROPOSED) | Notes |
|---|---|---|
| Next-play decoded top-1 accuracy, per event type + overall (held-out games) | ≥ baseline − 0.010 (1.0 pp), overall AND no event type worse than baseline − 0.030 | Per-type band prevents a model that only predicts the majority event from passing on overall accuracy. |
| Next-play calibration (decoded distribution vs. observed rates) | No worse than baseline by more than 0.02 in mean absolute calibration error (PROPOSED) | Calibration is the honesty check on the decoder; a sharper-but-wrong model fails here even with good top-1. |
| What-if discrimination (good vs. bad action ranking, held-out games) | ≥ baseline − 0.010 in ranking accuracy / AUC (PROPOSED) | The planning-quality axis. If the joint model cannot tell a good call from a bad one as well as the separate JEPA can, its planner regressed. |
| Rollout coherence (rule violations: illegal lineups, impossible event sequences) | ≤ baseline violation rate + 0.02 (PROPOSED) | Violations are a rate (lower better); the band is an allowed increase. |
| Ghost style fidelity (tendency drift over rollout length: pace, 3PT rate, zone distribution) | ≤ baseline drift + 0.02 per tendency (PROPOSED, report-only if baseline unmeasured) | Ghost believability is the softest axis; the band is wide on purpose. A ghost failure never gates the twin space — see §2.3. |

### 2.3 Mode G absence is not a dynamics regression

The FIRST expected Phase 2 run is Mode S only
(`UNIFIED_LOSS_DESIGN.md` §2.3: Mode G is data-gated on Lane 8 §6
blockers 1–4). For a Mode-S-only run, the dynamics axis is judged
by:

- Future twins (§3) — the joint-only metric, which IS a dynamics
  measurement (it measures season-timescale prediction quality
  through retrieval).
- Mode S prediction quality itself: mean cosine between ẑ_{t+1} and
  z_{t+1} on held-out pairs, reported alongside future twins (a
  diagnostic, not a gate — raw cosine is subject to the frame-shift
  caution in `RESEARCH_NOTES.md` §1, which is why overlap@k is the
  headline and cosine is supporting).
- The separate JEPA baseline's game-timescale metrics are NOT
  applicable to a Mode-S-only run and are marked N/A (data-gated),
  never scored as zero. Scoring an absent mode as a failure would
  punish the design for a data dependency it states openly.

When Mode G IS active (data gate open), §2.2 applies in full, and
the joint model must pass BOTH the Mode S evidence (future twins)
and the Mode G bands.

## 3. Headline joint metric: FUTURE TWINS — exact definition

### 3.1 Why neither separate model can do this alone

- The separate SupCon model has NO predictor. It can retrieve the
  twins of a true next-season embedding (it does that for every
  row), but it cannot PRODUCE a predicted next-season embedding —
  there is no future to retrieve twins of. Future twins needs a
  prediction; the similarity model alone has none.
- The separate JEPA model (Lane 8 base design) predicts next GAME
  STATES in game-state latent space. Its predictions are not twin
  embeddings, its latent space is not the twin space (Lane 8 §3.3:
  JEPA is never trained to reproduce twin neighbours), and its
  predictions cannot be meaningfully twin-searched — retrieving
  "twins" of a game-state latent from a player-season corpus is a
  category error, not a metric. Future twins needs a prediction
  that LIVES in twin space; the dynamics model alone has none.
- The joint model is the first model whose prediction lives in twin
  space (the bridge, `UNIFIED_LOSS_DESIGN.md` §4). That is why this
  metric is joint-only: it is not that the separate models score
  badly on it — it is that they cannot compute it at all. Any
  report that scores a separate model on future twins by smuggling
  in a predictor has built the joint model and mislabeled it.

### 3.2 Computation (step by step, no ambiguity)

**Eligible pairs.** A player-season pair (t, t+1) is eligible if:
(a) both rows exist; (b) the t row is in the training portion and
the t+1 row is in the held-out portion of the protocol (§3.3) —
never the reverse, never both in training; (c) the pair does not
cross a fold boundary (Lane 3 purge rule). Players debuting in t+1
(no t row) are INELIGIBLE and counted separately as "unpredictable
by construction" — reported as coverage (§3.5), never silently
dropped from the denominator without mention.

**Step 1 — Predict.** For each eligible pair, encode the t row with
the joint model's stem + head (a) → z_t; run Mode S → predicted
next-season embedding ẑ_{t+1} (64-d, L2-normalized).

**Step 2 — Retrieve A (ground truth).** Retrieve the top-k twins of
the TRUE next-season embedding z_{t+1} from the candidate pool (§3.3
pool definition), person-excluded (all rows of the same person_id
excluded), exhaustive cosine, pessimistic ties, same code path as
Contract §2d. Call this set A.

**Step 3 — Retrieve B (predicted).** Retrieve the top-k twins of the
PREDICTED embedding ẑ_{t+1} from the SAME pool with the SAME
exclusion. Call this set B.

**Step 4 — Score.** overlap@k = |A ∩ B| / k for that player.
Headline statistic: MEAN overlap@10 over all eligible players,
reported with standard deviation and with the fraction of players
at overlap@10 = 0 (complete miss) and overlap@10 = 1 (perfect
agreement). Secondary statistics: mean overlap@1 (future top-1
twin agreement — a much harder bar, reported, not gated) and
hit-rate@10 = fraction of players with overlap@10 ≥ 0.1 (at least
one shared twin — a lenient floor that catches "roughly right"
predictions).

**Parameters, fixed here (not tuned later):** k = 10 (headline;
matches the recall@10 convention and is large enough that overlap
is not a coin flip). Retrieval space: 64-d twin space ONLY (the
full space — the planning space per `UNIFIED_LOSS_DESIGN.md` §4).
Prefix-level future twins (16-d) are reported as a diagnostic, not
the headline: the 16-d question is serving unification (§2.1), not
prediction quality.

### 3.3 Held-out season protocol (which seasons are predicted, which are never trained on)

| Protocol | Train on | Predict FROM (input season) | Predict TO (target season) | Target rows trained on? |
|---|---|---|---|---|
| Val protocol (Fold 2) | ≤ 2023 | 2023–24 rows | 2024–25 rows | NO — 2024–25 is val in Fold 2, never trained on, never used for early stopping of the predictor |
| Frozen protocol | ≤ 2024 (Fold 2 train + val combined, SAME hyperparameters as the val run — no re-tuning) | 2024–25 rows | 2025–26 rows | NO — 2025–26 is the frozen test, never trained on, never tuned on, never used for early stopping |

Notes:

- The val protocol is the gate: a joint model must pass §2 + §3.4
  on val before it is run on the frozen protocol at all.
- The frozen protocol retrains on ≤ 2024 (train + val combined).
  This is NOT tuning on test: hyperparameters are frozen from the
  val run, and 2025–26 rows play no part in training, early
  stopping, or hyperparameter choice. If this retraining step is
  ever skipped and the val-trained model is evaluated directly on
  2025–26, that is also acceptable — but the choice must be stated
  in the report, because the two give different frozen numbers and
  silently mixing them breaks comparability.
- Fold 1 (train ≤ 2021 / val 2022–23) gets the same val-protocol
  treatment as a secondary check (predict 2022–23 from 2021–22,
  predict 2023–24 from 2022–23 under Fold 1's own boundaries). The
  Fold 2 val protocol is the headline; Fold 1 is a robustness
  check, not a second headline.
- Candidate pool for retrieval: ALL rows at the TARGET season
  (e.g., all 2024–25 rows for the val protocol) — the pool is the
  season being predicted into, because future twins asks "who does
  the predicted next season play like, among the players who
  actually played next season." Retrieval against all 12,966 rows
  is reported as a diagnostic only; it answers a different question
  ("who in history does this resemble") and would inflate overlap
  via same-era neighbours.

### 3.4 Win condition (PROPOSED)

The joint model wins on future twins if, on BOTH the val protocol
and the frozen protocol:

```
mean overlap@10 (joint)  ≥  mean overlap@10 (persistence baseline) + 0.05
```

where the **persistence baseline** is: use the CURRENT-season
embedding z_t itself (from the SEPARATE Lane 4 baseline's
embeddings, not the joint model's — so the control is not
contaminated by joint training) as the "predicted" next-season
embedding, and run Steps 2–4 identically. Persistence is the honest
null hypothesis ("players mostly play like themselves next season,
so just carry the embedding forward") — a predictor that cannot
beat carrying the present forward has learned nothing about career
movement, however low its training loss looks. The +0.05 margin
(5 pp absolute) is PROPOSED: it is large enough to exceed seed noise
on ~400–500 eligible pairs, small enough to be attainable by a real
predictor. The user confirms or replaces it before any run is judged
(§6).

Additionally (PROPOSED, report-only, not gated): the joint model's
mean overlap@10 should exceed the "twin-space noise floor" — the
overlap@10 between two independent retrievals of the same true
embedding under different seeds (a measure of retrieval stability).
If the noise floor itself is near the joint score, the metric is
too noisy to judge with and the report must say so rather than
claim a win.

### 3.5 Coverage reporting (who the metric does NOT cover)

Every future-twins report states: number of eligible pairs, number
of target-season rows, coverage = eligible / target-season rows,
and the count of debut players excluded as unpredictable by
construction. A coverage below 0.70 (PROPOSED flag, not a gate)
means the metric describes veterans only and must be labeled as
such in any summary — "future twins" without a coverage note
overstates what was measured.

## 4. What the joint model must ALSO NOT break (guardrails)

- **Era-invariance of the twin space (Lane 5's mask-ablation era
  test).** The joint model's twin head must pass the same era-shift
  test as the separate baseline: artificially mask a modern player's
  tracking family, measure twin era shift. If joint training (via
  the season predictor, which is inherently time-aware) leaks era
  into the twin space, this test catches it. A joint model that
  passes §2's metrics but fails the era test has traded the twin
  space's core property for prediction quality — FAIL, research-only.
- **Self-twin exclusion.** Every retrieval in this protocol is
  person-excluded (see §1). Any future-twins number computed with
  only row-self excluded (the pre-fix bug) is invalid and must be
  recomputed.
- **No test leakage through the predictor.** Mode S training pairs
  are built from the training portion ONLY (§2.1 of the design doc).
  A Mode S example whose target row is in val/test is leakage, full
  stop — the run is invalid, not "approximately valid."
- **No sprite inputs, ever** (Lane 8 §5, design doc §1). A joint run
  that ingests sprite positions in any mode fails review regardless
  of its metrics.

## 5. Ablation table (the joint model must pass — all rows run, all rows reported)

Every row is run on the SAME folds and seed protocol (§1). "—" means
the row cannot compute that metric (stated, not zero-filled). Rows
are reported even when they fail — a missing ablation row is a
missing deliverable.

| Row | Configuration | Retrieval (§2.1) | Dynamics (§2.2 / N/A) | Future twins (§3) | Grad-cosine mean (S vs DS) | Verdict rule |
|---|---|---|---|---|---|---|
| A0 | Separate Lane 4 baseline (SupCon only) | Baseline numbers | — (no predictor) | — (cannot compute) | — | Control. All §2.1 bands are measured against this row. |
| A1 | Separate Lane 8 baseline (JEPA only) | — | Baseline numbers | — (cannot compute) | — | Control. All §2.2 bands are measured against this row. |
| J0 | **Joint, full** (bridge + predictive positives + PCGrad + uncertainty weights + variance reg) | Must pass §2.1 | Must pass §2.2 / §2.3 | Must pass §3.4 | Reported; stop rules (§6 of design doc) apply | PASS on all three axes → sharing justified (pending user word for any serving change). |
| J1 | Joint WITHOUT bridge (Mode S targets a separate season-latent space; L_bridge = 0; no predictive positives) | Must pass §2.1 | Must pass §2.3 (Mode S latent quality reported, not gated on twin retrieval) | — (predictions not in twin space; cannot compute) | Reported | If J1 matches J0 on retrieval AND J0 wins future twins, the bridge is what earned the win. If J1 matches J0 everywhere J0 is measured, the bridge added nothing → unification claim FAILS. |
| J2 | Joint WITHOUT PCGrad (uncertainty weights only) | Must pass §2.1 | Must pass §2.2 / §2.3 | Must pass §3.4 | Reported — EXPECTED to be more negative than J0 if PCGrad matters | If J2 fails where J0 passes, PCGrad is load-bearing (keep it). If J2 matches J0, PCGrad is decorative (cut it — simpler is better). |
| J3 | Joint WITHOUT predictive positives (bridge target kept — Mode S still targets twin space — but L_bridge = 0, predictions never enter the SupCon batch) | Must pass §2.1 | Must pass §2.2 / §2.3 | Must pass §3.4 | Reported | Isolates the predictive-positive mechanism from the target-coupling mechanism. If J3 matches J0 on future twins, predictive positives added nothing beyond target coupling → simplify to J3. |
| J4 | Joint WITHOUT uncertainty weighting (fixed equal weights over S / DS / B; PCGrad kept) | Must pass §2.1 | Must pass §2.2 / §2.3 | Must pass §3.4 | Reported | If J4 fails where J0 passes, uncertainty weighting is load-bearing. If J4 matches J0, fixed weights suffice — prefer them (fewer learned scalars, more interpretable). |
| J5 | Joint WITHOUT variance regularizer (w_reg = 0) | Must pass §2.1 | Must pass §2.2 / §2.3 | Must pass §3.4 | Reported | Collapse check row: if J5 collapses (mean pairwise cosine > 0.90 for 3 epochs) where J0 does not, the regularizer is load-bearing. |
| J6 | Joint WITH EMA target (design doc §5.1 rule 5) — OPTIONAL, only if the user confirms it in §6 | Must pass §2.1 | Must pass §2.2 / §2.3 | Must pass §3.4 | Reported | Only run if confirmed; otherwise marked "not run (user cut)" — an explicit cut, not a gap. |

**Reading the table honestly.** The ablations are not a menu to
cherry-pick from after the fact. J0 is the candidate; J1–J6 explain
WHY J0 works or doesn't. A J0 that passes but whose ablations show
every mechanism is decorative has still passed — but the report must
say the joint model is unnecessarily complex, and simplification to
the best ablation is the recommended next step, not a defeat.

## 6. Stop / rollback rule

**Stop during training (per run):**

- Interference stop (design doc §5.3 PROPOSED thresholds): 5-epoch
  mean cos(g_S, g_DS) < −0.50, or any single-epoch cosine < −0.70,
  or 3 consecutive epochs < −0.50 → STOP, report interference.
- Collapse stop: mean pairwise cosine > 0.90 for 3 consecutive
  epochs → STOP, report collapse (no silent loss switch — design
  doc §5.1).
- Predictive-positive failure: zero predictive-positive rows for a
  full epoch → FAIL LOUD, stop (design doc §4.2 rule 5).
- Either head's val metric regresses beyond its §2 tolerance for 2
  consecutive evals → STOP that configuration (it will not pass the
  Pareto gate; continuing burns runs to confirm a known failure).

**Rollback after evaluation (the model level):**

- If the joint model regresses either head beyond tolerance on val:
  it does NOT proceed to the frozen protocol. Status: research-only.
  The separate baselines remain the candidates for any serving
  decision.
- If the joint model passes val but regresses on frozen: status
  research-only. No asset switch, no threshold change, no serving
  change of any kind follows from a frozen failure.
- If the joint model passes all three axes on val AND frozen: it has
  earned SHARING as a research result. Serving is a separate
  decision: any joint embedding that would REPLACE the v5 twin
  space still faces the Contract §2d promotion gate (beat the
  champion on ALL primary retrieval metrics on val AND frozen test)
  PLUS the user's separate word. Passing this protocol is necessary
  for a serving conversation, never sufficient for a serving switch.
- Rollback itself is trivial by design: the joint model never
  overwrites a baseline asset (Contract §2c: challenger-only output
  names; champion filename never an output path). "Rollback" means
  "continue serving the baselines / champion" — there is nothing to
  revert, because nothing was switched. Any report that describes
  rollback as a risky operation has misunderstood the asset
  discipline.

## 7. Decisions the user must confirm before any Phase 2 training

1. The §2 tolerance numbers (all PROPOSED).
2. The §3.4 win margin (+0.05 absolute over persistence, PROPOSED)
   and the k = 10 headline choice.
3. The interference thresholds (design doc §5.3, PROPOSED).
4. Whether ablation J6 (EMA target) runs or is cut.
5. Whether the frozen protocol retrains on ≤ 2024 or evaluates the
   val-trained model directly (§3.3 — either is acceptable, but
   the choice must be fixed before runs start).
6. Whether a citation check of UniJEPA / DreamerV3 / MuDreamer
   against the actual papers is required before training, or
   whether the design's self-contained formulas suffice (see
   `RESEARCH_NOTES.md` — the current position is that the design
   does not depend on those citations, so training does not wait
   for them; the user may overrule that).

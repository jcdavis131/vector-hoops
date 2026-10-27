# Text Embedding Design — Scope B (DESIGN ONLY)

Status: DRAFT. No model is trained. No lift is measured. No package is
installed. No production file is changed. This design is a proposal for
review by the standing MLOps review panel before any synthesis or
training decision.

## 0. What governs this design

### 0.1 The 22:32 correction governs evaluation — user-directed, pending panel ratification

On 2026-10-26 at 22:32 CDT the user corrected the twin-centric framing.
This design follows that stated direction. GOVERNANCE NOTE (2026-10-26
22:37 CDT): the prediction-first reframe is now under 12-seat panel
review and is NOT yet ratified as a program-wide decision. The user has
ruled that the reframe is not the orchestrator's call. No delivered lane
document, contract headline, eval protocol, or prototype brief is being
rewritten until the panel synthesis lands AND the user rules on it.
This new design document is the exception named in that governance
note: it keeps forecast-lift gating as the user's stated direction,
but that gating choice is labeled here as USER-DIRECTED, PENDING PANEL
RATIFICATION. It is not presented as ratified. If the panel synthesis
and the user's ruling reinstate twin-agreement gating, this document
remains usable without a rewrite, because §6.4 fully specifies the
twin-agreement and future-twins diagnostics (computation, k,
comparison statistic, and availability condition) alongside the
forecast-lift gate. The contract §10 text that says the correction
"takes precedence" is quoted as the user's stated direction for this
document only; it is not a claim that the program-wide reframe has
been ratified.

- PRIMARY objective: next-season overall stat prediction. The target is
  the 14-d game vector (raw per-100 stats, z-scored within season,
  from `vectors.json`). The score is MAE and R² under expanding-window
  cross-validation, with the new-player slice reported separately.
- Twins are a product surface and a secondary validation. They are not
  the gate for this tower.
- The JEPA predictor head is primary. The contrastive twin head is
  auxiliary. The unified loss is prediction-first.
- Future twins is a diagnostic. It is not a gate.
- This text tower is judged by FORECAST LIFT against the stats-only
  baseline. It is not judged by twin-agreement retention.

Any part of the original Scope B brief that made twin agreement or
future twins the gate is SUPERSEDED for gating. Twin agreement and
future twins remain diagnostics only. This document states that
explicitly, as required.

### 0.2 Claim labels used in this document

Every claim carries one label:

- MEASURED: a number taken from a tool result, a file, or a
  coordinator-verified fact in the contract.
- ESTIMATED: a number derived by arithmetic from a stated method and
  stated assumptions. It is not measured until the stated measurement
  is run.
- PROPOSED: a design choice that needs user confirmation before any
  training run uses it.
- UNVERIFIED: a claim that no evidence in hand confirms. The document
  names what would verify it.
- DIAGNOSTIC: a metric reported for information. It never gates
  promotion of this tower.

No lift number in this document is measured. All lift numbers are
targets. A reader who treats a target as a result misreads this design.

### 0.3 Scope and boundaries

- Text units: official play-by-play (PBP) event text ONLY. No generated
  commentary. No broadcast transcripts. No social text. No synthetic
  text.
- This design covers the text tower only. It does not redesign the
  stat towers, the folds, the JEPA head, or the unified loss. It does
  not re-pin the stat width (see §7).
- This design adds two new files only. It edits no existing lane file.
  The task authorizes these two files as an exception to the contract
  §1 ownership table. See §9 for the conflict record.

## 1. Text units and template deduplication (FIRST)

### 1.1 Why deduplication comes first

Raw per-event embedding across 30 seasons is infeasible on CPU. PBP
text is highly templated. The same sentence shape repeats with a
different player name, a different score, and a different clock time.
Embed the unique template once. Compose the player-season rollup from
template counts. Never embed the same sentence shape twice.

### 1.2 Volume estimate (ESTIMATED — method stated, numbers not measured)

Method:

1. Count regular-season games per season. Use 1,230 games per season
   as the scale anchor (30 teams × 82 games ÷ 2). This is an
   approximation. Early seasons had fewer teams. Lockout seasons had
   fewer games. Playoff games are excluded from this first estimate.
2. Count actions per game. Use 593 actions per game as the anchor.
   This number is MEASURED in a narrow sense: the coordinator verified
   ~593 actions in each of 5 on-disk games (2026-27 opening games,
   ids 0022600001–3 and 0022600085–6). It is ESTIMATED as a 30-season
   average, because 5 opening games from one season do not prove the
   average for 30 seasons.
3. Multiply: 30 seasons × 1,230 games × 593 actions ≈ 21,900,000 raw
   events (21.9M). With playoffs added, the total rises by roughly
   2–3M events (ESTIMATED). The design target is the regular-season
   figure first.
4. Count unique templates. Normalize each description by the rules in
   §1.3, then count distinct normalized strings. The unique-template
   count is ESTIMATED at 2,000–15,000 across all 30 seasons, with a
   central working figure of ~10,000. Rationale: PBP vocabulary is
   bounded by action types, subtypes, shot types, foul types, and
   rebound types. Player names, scores, and clock times supply most
   surface variation, and §1.3 removes exactly those fields. This
   range is NOT measured. It is the single largest uncertainty in
   this section.

Result (ESTIMATED):

| Quantity | Value | Label |
|---|---|---|
| Raw PBP events, 30 regular seasons | ~21.9M | ESTIMATED |
| Unique templates, 30 seasons | 2,000–15,000 (working figure ~10,000) | ESTIMATED |
| Embedding calls after dedup | ~10,000 (one per template) | ESTIMATED |
| Reduction factor | ~2,200× at the working figure (range ~1,500×–11,000×) | ESTIMATED |

The reduction factor does not depend on embedding throughput. Any
per-text cost divides out of the ratio. Absolute wall-clock time DOES
depend on throughput, and throughput on Hatch CPU is UNVERIFIED (see
§8). The design therefore claims only the call-count reduction, not a
wall-clock time, until the pilot in §8 is run.

What would measure this: run the §1.3 normalization on one full real
season of PBP (when Scope A collection delivers it), report the exact
raw-event count and the exact unique-template count for that season,
then extrapolate by season with the per-season counts, not by a single
multiplier. Until then, every number in this section stays ESTIMATED.

### 1.3 Template normalization rules (PROPOSED)

A template is a normalized PBP description. Normalization applies in
this order:

1. Replace every player name with a role token: `ACTOR` for the
   primary person, `ASSISTOR` for the assisting person, `FOULED` /
   `FOULER` where the schema distinguishes them. Player identity must
   not survive in the template string.
2. Replace the score, the clock time, and the period clock with
   placeholders. Score and clock are game state, not playing style,
   and they inflate template counts without adding style signal.
3. KEEP event attributes that describe style: shot type, shot
   distance bucket, points value (2 vs 3), make/miss, foul type,
   rebound type (offensive/defensive), turnover type, steal/block
   flag, and free-throw sequence position. Masking these would destroy
   the signal the tower is supposed to carry.
4. KEEP the structured fields alongside the text: `actionType`,
   `subType`, `qualifiers`, and the x/y coordinate bucket (see §1.4).
   The template key is the normalized text PLUS these structured
   fields. Two events with the same words but different structured
   fields are different templates only if the structured fields change
   the style meaning (for example, a different shot zone). The exact
   key construction is an open question (see §10, Q1).
5. Lowercase, strip extra whitespace, and strip punctuation that does
   not change meaning. Do not stem or paraphrase. The template must
   remain traceable to the original description.

Open question (see §10, Q1): whether team abbreviations stay in the
template. The default in this design is to REMOVE team abbreviations
from the template string and carry team as a separate structured
field, so that a player who changes teams does not change templates
for the same play. The stricter name-masked ablation (§6.2) tests the
consequence of that choice.

### 1.4 What the text unit is NOT

- The text unit is not a game summary. No summarization step exists.
- The text unit is not a generated description of a play. Only the
  official PBP description is embedded.
- The text unit is not a shot-chart coordinate. PBP x/y fields are
  event location fields carried as structured context. They are not
  ShotChartDetail LOC_X/LOC_Y. The contract records that LOC_X appears
  nowhere in the cache (0 hits) and that coordinates in hand use PBP
  x/y naming. This design does not conflate the two.
- Pixel sprite positions are never text units and never training
  inputs. They are rendering output.

### 1.5 Composition: from templates to a player-season rollup

The rollup for one player-season is built by counting, not by
re-embedding:

1. For each PBP event, identify the primary actor by `personId`.
   Events where the player is only the assistor count separately
   under the assist role, not as primary-actor events. The exact
   `personId` semantics of the on-disk PBP schema are UNVERIFIED
   beyond the task grounding (the fields exist; their role semantics
   need confirmation on a real file). See §10, Q2.
2. Count, for that player-season, how many times each template occurs
   in the primary-actor role (and, separately, in the assist role if
   the schema supports it).
3. Rollup vector = the count-weighted mean of the Stage 1 template
   embeddings (see §2). In symbols: rollup = Σ_c (count_c × emb_c) /
   Σ_c count_c, where c ranges over templates.
4. L2-normalize the rollup. Store the rollup, the total event count,
   and the mask (see §4).

Counting 21.9M events into a sparse player-season × template matrix
(12,966 rows × ~10,000 templates) is feasible on CPU. It is counting
and sparse addition, not embedding. The sparse matrix is the artifact
that makes the design CPU-feasible. Dense materialization of that
matrix (12,966 × 10,000 floats) is not required and not proposed.

## 2. Stage 1 embedder: EmbeddingGemma-300M (first cut)

### 2.1 Choice (MEASURED context, PROPOSED use)

Stage 1 uses EmbeddingGemma-300M as the first cut. The workspace has
already evaluated this model: 768-d vs 128-d Matryoshka truncation
gives twin hit@10 of 0.0739 vs 0.0732 (MEASURED, from prior workspace
evaluation, cited in the contract §10). Truncation loses almost
nothing on that diagnostic: 0.0732 / 0.0739 ≈ 99.1% retention.

That retention number is a DIAGNOSTIC under the correction. It justifies
EmbeddingGemma as a reasonable first embedder. It does NOT gate this
tower. A tower that retains twin agreement but adds no forecast lift
fails. A tower that adds forecast lift passes even if its twin
retention differs.

### 2.2 Stage 1 procedure

1. Embed each unique template once with EmbeddingGemma-300M.
   Store the 768-d vector per template. The 128-d Matryoshka prefix is
   stored alongside it as a diagnostic, not as the rollup input.
   Rollups use the full 768-d vector first; the 128-d prefix is a
   fallback if CPU or storage forces a smaller rollup, and any switch
   to 128-d must be re-run through the §3 protocol, not assumed
   equivalent for forecasting (twin retention does not prove forecast
   retention).
2. Mean-pool per player-season by the §1.5 count-weighted mean.
   Pooling weights: occurrence count is the weight. No recency weight
   inside a season is proposed for the first cut, because PBP order
   inside a season is game order, not a style signal the forecast head
   needs at season granularity. A recency-weighted variant is a
   follow-up experiment, not part of the first cut.
3. L2-normalize each player-season rollup after pooling.

### 2.3 Minimum-event floors (PROPOSED)

- Floor: 100 primary-actor PBP events in the player-season. Below the
  floor, the tower mask is 0 (see §4). The rollup vector is zeros.
  The model must not impute a rollup for a masked row.
- Rationale (ESTIMATED): a player who appears in even a few games
  typically accumulates hundreds of primary-actor events, because a
  game carries ~593 actions spread across ~20 players who appear.
  A 100-event floor therefore masks only cup-of-coffee seasons and
  seasons with no PBP coverage, not regular rotation players. This
  rationale is ESTIMATED, not measured on a real season distribution.
- Sensitivity (PROPOSED): report the §3 protocol at floors 50 and 200
  as a sensitivity check. The floor is tuned on validation folds only,
  never on the frozen test. If the sensitivity check shows the lift
  depends sharply on the floor, the floor choice is flagged as fragile
  and the tower does not promote on that evidence alone.

## 3. Stage 2 task-aligned reduction: judged by forecast lift

### 3.1 SVD is the baseline to beat, not the final answer

The user proposal is: convert all text to embeddings, then truncated
SVD to a manageable size. This design treats SVD exactly as the
baseline to beat:

- SVD baseline: truncated SVD of the 768-d player-season rollups,
  fitted on TRAIN seasons only within each fold, truncated to the
  same output width as the learned projection (32-d, see §3.3).
  The SVD matrix is frozen after fitting. It is fed to the same
  forecast head, under the same folds, with the same metrics, as the
  learned projection. SVD is scored by variance explained only as a
  DIAGNOSTIC. It is never scored by variance explained for gating.
  A high variance-explained number with no forecast lift is a failed
  baseline comparison, not a success.
- Learned projection (the design): a linear projection from 768-d to
  32-d, trained end-to-end with the forecast objective (see §3.2).
  It must beat the SVD baseline on forecast lift (see §3.5).

Why SVD alone is insufficient (reasoning, not a measured result):
SVD keeps the directions of largest variation in text space. The
directions that vary most across players are not necessarily the
directions that predict next-season stats. A direction can dominate
text variance (for example, a common play type that every player
accumulates) while carrying no forward information. A learned
projection can down-weight such directions and up-weight rarer but
forward-informative style directions. That is the hypothesis the §3.5
protocol tests. It is not a result.

### 3.2 Learned projection design (PROPOSED)

- Form: a linear map W (768 → 32), followed by LayerNorm, inside the
  forecast model. A 2-layer MLP variant (768 → 128 → 32) is a
  follow-up experiment, not the first cut. The first cut stays linear
  so that the comparison against SVD isolates the benefit of
  task-aligned training from the benefit of added non-linear capacity.
- Training: W is trained jointly with the forecast head by the
  forecast loss (next-season 14-d prediction). No separate text-only
  loss gates the projection.
- Auxiliary alignment (optional, ablated): an auxiliary loss that
  aligns the projected text rollup with the same-season 14-d stat
  vector (cosine alignment). Weight: small, tuned on validation only,
  default 0 (off) for the first cut. The on/off state of this auxiliary
  loss is reported with every run. If the auxiliary loss helps
  forecasting, it is kept and reported as a component of the win. If
  it helps only twin agreement, it is dropped: twin agreement is not
  the objective.
- What the projection must NOT do: it must not see the target season.
  Projection training data, SVD fitting data, and normalization
  statistics all come from train seasons only within each fold (see
  §6.1). Any run that fits SVD or trains W on validation or test
  seasons is invalid and must be discarded, not reported as a win.

### 3.3 Output width (PROPOSED)

- Text tower output width: 32 dimensions. The tower adds 33 columns
  to the model input under the `cat([x·m, m])` convention (32 projected
  values plus 1 mask bit). See the tower spec for the full contract.
- Tuning set (PROPOSED): {16, 32, 64}, tuned on validation folds only,
  default 32. The width is not tuned on the frozen test.

### 3.4 Forecast head and baselines (PROPOSED, pending Lane 4 / Lane 5 alignment)

The comparison needs a forecast head. This design does not specify the
head architecture in full, because that belongs to the training lane
under the prediction-first rethink. It specifies the comparison
invariants the head must satisfy, so that the text comparison is
valid regardless of head choice:

- The stats-only baseline and the text-on run use the SAME head
  architecture, the SAME stat towers, the SAME folds, the SAME seed
  protocol, and the SAME training budget. The ONLY difference is the
  text tower (on vs off). Any other difference invalidates the lift
  claim.
- Reference baselines reported alongside (not gates): carry-forward
  (predict next season = current season 14-d) and a stats-only
  carry-forward-plus-age-curve reference if the training lane provides
  one. These references show whether the head itself beats trivial
  forecasting. They do not gate the text tower. The text gate is
  text-on vs stats-only with the same head.
- Metrics: per-stat MAE and per-stat R² for all 14 stats, plus the
  mean across stats (equal weight, with scoring stats shown as a
  highlighted breakdown, per the proposed defaults in the 22:33
  rethink note). The headline lift uses MAE (see §3.5). R² is reported
  for every stat. No single stat carries the headline alone.

### 3.5 Exact comparison protocol

Folds (embargoed expanding-window, per the task brief and contract §9
P1 — see §9 for the status of these folds):

| Fold | Train rows | Embargo season | Validation / test rows |
|---|---|---|---|
| Fold 1 | 10,539 | 2021-22 | Val 948 (2022-23 + 2023-24) |
| Fold 2 | 11,491 | 2023-24 | Val 500 (2024-25) |
| Final | 11,975 | 2024-25 | Frozen test 491 (2025-26) |

Rules:

1. Fit SVD, train the projection, fit normalization, and tune
   hyperparameters on train seasons only, within each fold.
2. The frozen test (2025-26) is never used for tuning, early stopping,
   floor choice, width choice, or threshold choice. It is evaluated
   once, after the validation-fold decision, and reported as-is.
3. Report per fold, per stat, and pooled across validation folds.
   Report the new-player slice separately in every table (see §3.6).
   Never blend the slice into the headline number.
4. Headline lift: mean relative MAE reduction across the 14 stats,
   text-on vs stats-only with the same head:
   lift = mean over stats of (MAE_stats-only − MAE_text) / MAE_stats-only.
   Compute lift per fold, then average across Fold 1 and Fold 2 for
   the validation headline. Report the frozen-test lift separately.
5. The learned projection must beat BOTH comparators to claim a win
   on validation: (a) the stats-only baseline, and (b) the SVD
   baseline at the same width with the same head. Beating SVD but not
   stats-only is not a win (the text adds nothing). Beating stats-only
   but not SVD is not a win for the learned projection (SVD suffices,
   and the simpler method should be preferred).
6. Seeds: at least 3 seeds for the validation headline (PROPOSED).
   Report mean and spread across seeds. A lift that appears at one
   seed and vanishes at others is not a win.

### 3.6 New-player slice (definition dependency — see §10, Q3)

The contract defines the new-player slice as rows whose `person_id`
has no earlier-season row in the training portion of that fold. This
design reports the slice exactly as the fold manifest defines it, and
does NOT silently redefine it for forecasting. The mapping from that
definition to forecast samples (input season → target season) needs
confirmation from the split lane, because a forecast sample spans two
seasons and the slice definition was written for single-row retrieval.
Until that confirmation lands, the slice table in any text-tower report
must state which mapping was used, and the headline must not depend
on the slice.

Gate condition on the slice (PROPOSED): the text-on run must not
regress the new-player slice. That is, slice MAE with text must be
less than or equal to slice MAE stats-only (within seed spread). A
headline win bought by regressing new players is not a promotion-grade
win, because cold-start players are the case where a style signal
from text should help most, not hurt.

### 3.7 Proposed promotion threshold (PROPOSED — pending user confirmation)

PROPOSED lift threshold: mean relative MAE reduction ≥ 2% on the
validation headline (average across Fold 1 and Fold 2), with:

- the learned projection beating both the stats-only baseline and
  the SVD baseline (see §3.5, rule 5);
- no validation fold regressing (each fold's lift ≥ 0%);
- the new-player slice not regressing (see §3.6);
- the name-masked ablation passing (see §6.2);
- the result holding across at least 3 seeds (see §3.5, rule 6).

This threshold is PROPOSED, not user-confirmed. It is deliberately
modest: text is one tower among many, and a 2% mean MAE reduction from
a single auxiliary tower is a meaningful signal without being a
trivially-passable bar. If the user sets a different threshold, this
document's threshold is replaced, not reinterpreted. The frozen test
is reported against the same threshold but is not re-tuned to meet it.

Why 2% and not a larger number: a larger bar (for example 5%) would
risk rejecting a real but small style signal that compounds with other
towers. A smaller bar (for example 0.5%) would risk promoting noise.
2% sits between those failure modes. That reasoning is judgment, not
measurement. The panel should challenge it.

## 4. Text as one tower among the stat towers

### 4.1 Tower interface

- Input: one 768-d rollup vector per player-season, plus a mask bit
  and an event count (see the tower spec for the artifact schema).
- Projection: 768-d → 32-d (PROPOSED width, §3.3), inside the model.
- Join: the projected text vector joins the tower concatenation under
  the existing convention `cat([x·m, m])`, where m ∈ {0, 1} is the
  text-tower mask for that player-season. Masked rows contribute
  zeros plus the mask bit, exactly like any masked stat family.
- The text tower is ONE tower. It does not replace any stat tower.
  It does not change any stat tower's width, mask rule, or order.
  It is appended after the existing towers in the concatenation, so
  that removing it restores the exact stats-only input.

### 4.2 Mask rule for thin or missing PBP coverage

Mask m = 0 when ANY of these holds:

- the player-season has fewer than 100 primary-actor PBP events
  (PROPOSED floor, §2.3);
- the season has no PBP coverage at all in the delivered collection
  (pre-coverage era, or a gap season in the Scope A inventory);
- the player-season is absent from the PBP index entirely.

Mask m = 1 otherwise. In all masked cases the rollup vector is zeros
and the model receives the mask bit. No imputation, no mean-fill, no
borrowing from adjacent seasons. Borrowing from an adjacent season
would leak across the season boundary (see §6.1) and would fake
coverage where none exists.

Era consequence, stated plainly: early seasons will be heavily masked
if PBP coverage starts late. That is honest. A tower that is masked
for half of history and still lifts validation folds (which are
recent seasons with coverage) is useful for recent-season forecasting
and limited for era-spanning retrieval. The design does not hide that
limitation behind imputation. The per-era mask rate must be reported
with every run.

### 4.3 On/off ablation

- Flag: `--text-tower on/off` (see the tower spec). Default: off.
  Baseline runs use off. Text runs use on. Nothing else changes.
- The ablation runs under the embargoed expanding-window folds in
  §3.5, with the new-player slice reported separately.
- Promotion rule: the text tower is promoted only on a held-out win
  as defined in §3.7 (forecast lift, not twin agreement). A win on
  validation folds alone, without the frozen-test report, is a
  validation win, not a promotion. Promotion itself needs the user's
  separate word, as with every model change in this program.

## 5. What this design does NOT claim

- No trained model exists from this design. No text rollup artifact
  exists yet. No Stage 2 projection exists yet.
- No lift number is measured. The 2% threshold is a target. The
  EmbeddingGemma 0.0739 vs 0.0732 numbers are twin-agreement
  diagnostics from prior work, not forecast results for this tower.
- No claim is made that text WILL lift forecasting. The hypothesis is
  that playing-style signal in PBP text (shot selection, foul
  tendency, rebounding role, creation role) carries forward information
  beyond season-aggregate stats. The §3.5 protocol is the test. If the
  test fails, the tower is dropped, and the failure is reported as a
  result, not hidden.
- No claim is made about PBP coverage before the Scope A inventory
  lands. Per-season PBP availability, especially for early seasons,
  is UNVERIFIED. The mask rule (§4.2) is designed to survive that
  uncertainty, not to assume it away.

## 6. Leakage guards

### 6.1 Season-boundary masking (mechanism)

Rule: a forecast sample that predicts season S+1 from season S may
use PBP text from season S only. It may never use text from season
S+1 or later.

Mechanism (all steps mandatory, all failures loud):

1. Build rollups keyed by (`person_id`, season). The build reads only
   PBP events whose game season equals that season key. The build
   script asserts this per event and fails (non-zero exit, naming the
   offending event) on any mismatch. It never silently drops the
   offending event and continues.
2. The forecast sample for (player, input season S) joins ONLY the
   rollup for (player, S). The join key includes the season. A join
   that matches on `person_id` alone is a bug and is banned.
3. Fold construction uses season keys, not row order. Train-season
   rollups, SVD fits, projection training, and normalization all use
   train seasons only within each fold. Validation and test rollups
   are built by the same per-season code path, but they are never
   used to fit any component.
4. For any game-timescale JEPA use (predicting the next play inside a
   game), the season rule is necessary but NOT sufficient. The
   additional rule is a game-date cutoff: a prediction at game time t
   may use only events with game date/time strictly before t. This
   design specifies the season rule fully and flags the game-date
   rule as required before any game-timescale use. The game-timescale
   implementation is not designed here.
5. Audit: every rollup artifact carries its season key, its source
   PBP file hashes, and its event-count distribution. Any artifact
   whose season key does not match its source events is rejected by
   the training script (see the tower spec).

Why this matters beyond the obvious: PBP text for a player's breakout
season describes the breakout. If that text leaked into the input for
predicting the breakout, the model would appear to predict what it
already read. The season join is the guard. The embargo gap in the
folds (§3.5) is a second, independent guard: it prevents adjacent
season pairs from straddling a fold boundary.

### 6.2 Name-masked ablation (PROPOSED pass bar)

Purpose: prove the text adds playing style, not just player identity.
If the text tower wins only because the model recognizes a player's
name (or a name-shaped proxy) and recalls that player's history, the
tower is an identity lookup, not a style signal. An identity lookup
cannot help new players, and it will not generalize to players the
model has not memorized.

Exact ablation:

1. Build a second set of templates and rollups with ALL player names
   and identifiers masked before embedding. Names become role tokens
   (`ACTOR`, `ASSISTOR`). `personId` values are never embedded and
   never fed as features. Jersey numbers are removed from the text
   in this ablation, because a jersey number can act as an identity
   proxy on a given team-season.
2. Re-run the full §3.5 protocol with the masked rollups: same folds,
   same head, same SVD baseline (re-fitted on masked rollups), same
   metrics, same seeds.
3. Compare masked lift against unmasked lift and against stats-only.

PROPOSED pass bar (pending user confirmation): the masked run must
retain at least 50% of the unmasked mean MAE reduction, AND the masked
run must itself beat stats-only by at least 1% mean relative MAE
reduction. If the masked lift collapses to near zero while the
unmasked lift passes, the tower is REJECTED as an identity lookup,
even if the unmasked number passes §3.7. The unmasked win alone is
never sufficient.

Residual-identity limitation, stated plainly: masking names does not
remove all identity signal. Team context, role combinations, and rare
play patterns can still identify a star player. The design therefore
also proposes a stricter sensitivity ablation (team abbreviations
masked as well) to be reported alongside the primary masked ablation.
If the stricter ablation collapses the lift, that result is reported
and the tower's claim is downgraded to "style-plus-context" rather
than "style alone". The panel should judge whether that downgrade
still justifies promotion.

### 6.3 Other leakage paths (named, not hidden)

- Template dictionary leakage: the template vocabulary is built from
  all seasons' text shapes in the naive implementation. Template
  SHAPES are not player outcomes, but a template that only appears in
  a future season could still leak era information. Mitigation: the
  template dictionary for a fold is built from train seasons only.
  Templates that first appear in validation or test seasons map to
  an UNK template vector (zeros plus a mask note) at evaluation time.
  This is a cost in coverage, accepted for cleanliness.
- Normalization leakage: rollup L2 normalization is per-row and
  leaks nothing across rows. Any future within-season centering must
  be computed on train seasons only. The first cut uses per-row L2
  only, so this path is closed by construction.
- Duplicate players: identity is `person_id`, never name alone
  (contract §0). Distinct players share names. The rollup build keys
  on `person_id`. A name-keyed build is a bug.

### 6.4 Twin diagnostics, fully specified (so the doc works under either ruling)

These diagnostics are reported on every text-tower evaluation, whether
the governing gate is forecast lift (user-directed, pending panel
ratification) or twin agreement (the pre-correction framing). They
never silently become the gate under the current user direction, and
they are specified completely enough to become the gate if the panel
synthesis and the user's ruling so decide. No new model is assumed.

Diagnostic D1 — twin agreement of the text rollups (COMPUTABLE NOW,
once rollups exist):

1. For each validation or test player-season, compute cosine
   similarity of its 768-d Stage 1 rollup against all other
   player-season rollups in the same evaluation set.
2. Exclude the row itself AND every other row with the same
   `person_id` (person-excluded retrieval, per the self-twin lesson:
   exclusion is by person, not by single row or by name).
3. Take the top 10 neighbours (k = 10). Do the same retrieval in the
   champion v5 64-d embedding space, with the same exclusions.
4. Report, per fold and for the frozen test separately: hit-rate@10
   (fraction of the text rollup's top 10 that appear in the
   champion's top 10), mean overlap ± standard deviation across rows,
   and shared-pair Spearman correlation of the cosine ranks for pairs
   present in both lists. Report the same three numbers for the 128-d
   Matryoshka prefix rollups as a secondary diagnostic.
5. Interpretation rule, stated in advance: D1 measures whether text
   rollups preserve champion twin structure. It does not measure
   forecasting. A high D1 with no forecast lift is a diagnostic
   success and a gate failure under the current user direction. A
   low D1 with forecast lift is a gate success and a diagnostic
   flag (the text signal is forward-looking, not twin-preserving).

Diagnostic D2 — future twins (COMPUTABLE ONLY IF A PREDICTOR HEAD EXISTS):

1. Definition (from contract §8): predict next season's embedding,
   retrieve its twins, compare against the actual next season's twins.
2. Exact computation: for each forecast sample (input season S,
   target season S+1), take the predictor head's predicted embedding
   for S+1 (built from inputs at S, including the text rollup for S
   when the text tower is on). Retrieve its top 10 neighbours by
   cosine, person-excluded, in the target embedding space. Retrieve
   the top 10 neighbours of the ACTUAL S+1 embedding in the same
   space, with the same exclusions. Report hit-rate@10, mean overlap
   ± standard deviation, and shared-pair Spearman, per fold and for
   the frozen test separately.
3. Availability condition: D2 requires a predictor head that outputs
   an embedding for S+1. This text-tower design does not build that
   head. Until such a head exists, D2 is reported as NOT COMPUTABLE,
   not approximated from the 14-d stat forecast. Approximating D2
   from stat vectors would conflate the 14-d stat space with the
   embedding space (see contract §9 S4: the same player pair can rank
   1st in stat space and 390th in 64-d space).
4. If the panel/user ruling reinstates a twin-based gate, the gate
   statistic must be chosen from D1 or D2 explicitly, with its own
   threshold set by the user at that time. This document sets no twin
   gate threshold, because no twin threshold is user-confirmed for
   this tower under either framing.

Twin-quality floor note: the 22:33 rethink note proposes twin quality
as a floor constraint (not a gate) under a prediction-first program.
No numeric floor is specified for this tower in any source in hand,
so this document records the floor concept as PROPOSED and undefined,
not as a number. If a floor is later set, it applies to D1/D2 as
diagnostics and does not replace the forecast-lift gate unless the
user explicitly rules so.

## 7. Width interaction: the tower ADDS width (no silent re-pin)

The stat width question is disputed: 73 (verified base chain) vs 143
(HEAD contract, unverified, gamelog-blocked) vs 130 (champion export)
vs 120 (spec/contract, now known wrong). This design does NOT resolve
that dispute and does NOT re-pin anything.

Rule: the text tower ADDS width on top of whatever width the overhaul
lane and the user pin. With the PROPOSED 32-d text output under the
`cat([x·m, m])` convention, total model input width = pinned stat
width + 33. Examples (illustrative, not decisions):

- If the pinned width is 73, text-on input width is 106.
- If the pinned width is 143, text-on input width is 176.

The pinned-width decision from the overhaul lane must absorb the
+33 explicitly in its width accounting. Any training script that
hardcodes a total width without accounting for the text tower will
fail loud (see the tower spec). Any document that quotes a total
width without stating whether text is on or off is incomplete.

## 8. CPU feasibility note

What runs on Hatch CPU (reasoned, not measured):

- Template embedding: ~10,000 unique templates (ESTIMATED) through a
  300M-parameter embedder in batches. This is the only embedding step.
  It is orders of magnitude smaller than 21.9M per-event embeddings.
  Feasibility is plausible but UNVERIFIED until throughput is
  measured (see the pilot below).
- Rollup composition: sparse counting over 21.9M events (ESTIMATED).
  Feasible on CPU. It is integer counting and sparse addition.
- SVD on the rollup matrix (12,966 × 768): feasible on CPU with
  randomized SVD. This is standard linear algebra at this size.
- Linear projection training jointly with a forecast head: feasible
  on CPU at MLP scale, subject to the training lane's head choice.
  This design does not promise CPU feasibility for a full JEPA
  training run. That decision belongs to the training lane.

What needs another machine, or an alternate source:

- Bulk PBP COLLECTION: the Hatch VM is a known-bad collector for
  stats.nba.com ShotChartDetail (stalls, zero bytes) and cdn.nba.com
  (instant 403), per the 2026-10-11 shot-source verdict. PBP
  collection routes through Alienware or Mac, or through alternate
  real sources, per Scope A. Never synthesize missing PBP.
- Any embedding step whose measured Hatch throughput fails the pilot
  gate below. If the pilot shows Hatch CPU is too slow even for
  ~10,000 templates, template embedding moves to Alienware or Mac.
  The design does not change in that case; only the machine changes.

Pilot gate (PROPOSED, to run before any bulk work):

1. Take the 5 on-disk games. Normalize their descriptions by §1.3.
   Report the raw-event count and the unique-template count for
   those 5 games. This gives the first MEASURED template ratio, on a
   tiny sample.
2. Embed those unique templates on Hatch CPU. Report templates per
   second and peak memory. Extrapolate to 10,000 templates by
   division. If the extrapolated time exceeds a half-day of Hatch
   CPU, move template embedding to Alienware or Mac and say so.
3. Do not extrapolate the 5-game template ratio to 30 seasons as a
   fact. Report it as a 5-game observation. The 30-season ratio is
   measured only when a full season of PBP lands.

## 9. Contract conflicts found (reported, not silently rewritten)

This design follows the task instruction to report conflicts, not to
rewrite other lanes' files:

1. Twin gate vs forecast gate (contract §2d vs §10): §2d's promotion
   gate is written for a model that would REPLACE the v5 twin space
   (retrieval trio on val and frozen test). §10 states the text
   tower's gate as forecast lift. Both can stand, because they gate
   different things: §2d still gates any v5 replacement; §10 states
   this text tower's direction. GOVERNANCE UPDATE: that §10 direction
   is user-directed, pending panel ratification (see §0.1), not
   ratified program-wide. Any document that applies the §2d twin gate
   to this tower as if it were the current direction, or the §10
   forecast gate to a v5 replacement, is wrong. §6.4 keeps the twin
   diagnostics fully specified so either ruling remains executable.
2. Future twins (§8 headline vs §10 diagnostic): §8 names future
   twins as the headline joint-only metric. §10 demotes future twins
   to a diagnostic. For this tower, §10 governs. The unified-loss
   design needs a prediction-first rebalance amendment as a follow-up
   pass; this design does not pretend that amendment already happened.
3. Fold numbers (§2a vs §9 P1 vs the task brief): §2a lists Fold 2
   validation as 2024-25 with 984 rows (500 + 484), which mixes a
   two-season count with a one-season label. §9 P1 corrects Fold 2
   validation to 500 (single season 2024-25) and adopts the embargoed
   folds. The task brief gives the embargoed fold table used in §3.5
   (Fold 1 train 10,539 / embargo 2021-22 / val 948; Fold 2 train
   11,491 / embargo 2023-24 / val 500; final train 11,975 / embargo
   2024-25 / test 491). This design uses the task-brief table. The
   embargoed folds remain PROPOSED canonical per §9 P1, pending user
   confirmation. If the user picks the purge-only variant instead,
   the §3.5 protocol runs unchanged except for the fold definition.
4. Width dispute (§0 / §6 vs §9): the contract cites 120 features and
   17 towers, while §9 records 73 verified, 143 unverified, 130
   export, and 120 now known wrong, plus shotmix as 13 columns not
   10. This design adds a text tower on top of the pinned width
   (§7) and does not pick a winner. The "17 stat towers" phrase in
   this design means the existing stat families, whatever their
   pinned width turns out to be; the text tower is an 18th tower in
   the concatenation, not a member of the 17.
5. Scope B ownership vs §1 ownership table: §1 assigns
   `lanes/01-data-collection/` to Lane 1 and `lanes/04-training/` to
   Lane 4, with one owner per lane. The Scope B task explicitly
   authorizes two NEW files in those directories from this specialist
   and forbids editing existing lane files. This design honors that
   exception narrowly: two new files added, zero existing files
   edited. The coordinator must reconcile the ownership table at
   synthesis time; this specialist does not rewrite it.
6. Shot-coordinate naming (§6 / §10): ShotChartDetail LOC_X/LOC_Y
   vs PBP x/y. The contract records LOC_X at 0 hits in the cache and
   PBP x/y fields on the on-disk games. This design uses PBP x/y
   naming for PBP location and never claims ShotChartDetail coverage
   from PBP files.

## 10. Open questions (what would answer each)

- Q1. Template key construction: does the key include team, shot
  zone, and coordinate bucket, or text alone? Answered by: building
  both variants on one real PBP season and comparing template counts
  and §3.5 validation lift. The variant with fewer templates and no
  lift loss wins.
- Q2. `personId` role semantics: which field marks the primary actor
  vs the assistor vs other involved players in the on-disk PBP schema?
  Answered by: inspecting one on-disk game file field by field and
  documenting the mapping before any rollup build.
- Q3. New-player slice mapping for forecast samples: how does the
  contract's single-row slice definition map to (input season →
  target season) forecast samples? Answered by: the split lane
  confirming the mapping in the fold manifest schema. Until then,
  reports must state their mapping.
- Q4. PBP coverage by season: which seasons have PBP, at what
  completeness, and what is the true 30-season template count?
  Answered by: the Scope A inventory + gap report. No bulk design
  number in §1.2 survives contact with that report unchanged; the
  report replaces the estimate.
- Q5. EmbeddingGemma availability on Hatch: are the weights
  available, and what is measured batch throughput? Answered by: the
  §8 pilot. No install or download is authorized by this design.
- Q6. Threshold confirmation: is the PROPOSED 2% lift threshold (and
  the 50% / 1% masked-ablation bar) the user's bar? Answered by: the
  user's word. Until then, both bars stay PROPOSED.
- Q7. Head architecture: what forecast head does the training lane
  use, and does text lift survive across head choices? Answered by:
  the training lane's prediction-first design and a head-sensitivity
  run (same §3.5 protocol, second head). A lift that exists under
  only one head is flagged as head-dependent.
- Q8. Game-timescale cutoff: for JEPA next-play prediction, what is
  the exact game-time cutoff rule and its audit? Answered by: the
  JEPA lane's design. This design specifies only the season rule
  fully.

## 11. Review-panel notes (for adversarial review)

Challenges this design expects from the panel, stated before the
panel states them:

- Howard (practical): the 10,000-template estimate is the weakest
  number. If the true count is 100,000+, CPU feasibility still holds
  for embedding but the sparse matrix grows 10×. The pilot (§8) is
  the answer, not a stronger assertion.
- Ilya (generalization): text from a player's own season may encode
  that season's outcome (for example, "makes his 40th three") in ways
  that do not generalize forward. The season-boundary guard (§6.1)
  blocks cross-season leakage but not within-season outcome encoding.
  The validation folds are the test: if within-season encoding
  inflates train fit without validation lift, the tower fails §3.7
  and is dropped.
- Karpathy (simplicity): a linear projection on count-weighted mean
  embeddings discards play order, matchup context, and game state.
  That is intentional for the first cut. Order and context are JEPA
  inputs at game timescale, not season-rollup inputs. If the panel
  wants order in the rollup, the burden is to name a season-level
  order statistic that survives the §3.5 protocol, not to assert
  that order must matter.
- Panel-wide: the 2% threshold is judgment. If the panel prefers a
  different bar, the protocol (§3.5) does not change; only the bar
  changes. That separation is deliberate.

---

Files in this scope: this design document, plus
`lanes/04-training/TEXT_TOWER_SPEC.md` (tower contract for the
training script). No other files were added or edited by this
specialist.

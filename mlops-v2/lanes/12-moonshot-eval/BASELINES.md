# Forecast Baselines — Lane 12 (DRAFT)

Status: DRAFT ONLY. Spec finalization waits for the panel's moonshot
verdict (CONTRACT.md §11, §13). No training runs, no merges, no
production writes, no execution on real data in this pass.

Headline framing (user-directed 2026-10-26 22:32 CDT, PENDING PANEL
RATIFICATION): forecast accuracy is the headline; twin metrics are
secondary/diagnostic, never the gate. The three baselines below are
the bar every forecast model must beat. No performance numbers are
claimed in this document — there are none to claim yet, because no
baseline has been run under this harness. Any number added later
must be a measured number from `eval_forecast.py`, labelled with
its fold, cohort, and space.

## Rules that apply to all three baselines

1. **Same code path.** Every baseline is scored by
   `eval_forecast.py` in this directory, from a forecast file in
   that script's format. No baseline gets its own scoring code.
2. **Same folds, same cohorts.** Fold 1 val (948 rows, 2022-23 +
   2023-24), Fold 2 val (500 rows, 2024-25), frozen test (491 rows,
   2025-26), per the embargoed Lane 3 manifest. One fold per
   invocation; a baseline forecast file is produced per fold, from
   that fold's train set only.
3. **Same space.** Forecasts and actuals share one declared space.
   The served game vector is z-scored within season (CONTRACT.md
   §0), so the default space is "z-scored within season". A
   baseline computed in raw per-100 space must be scored against
   raw per-100 actuals, with `space` labelled accordingly. Spaces
   are never mixed within one comparison.
4. **No target-season information.** No baseline may use the target
   season's league means, standard deviations, or any other
   target-season aggregate. That is leakage, not a baseline.
5. **New-player slice reported separately, never blended.** Every
   baseline report carries the headline block and the
   new-player-slice block from `eval_forecast.py`. A baseline that
   cannot forecast a debutant says so (see carry-forward below);
   it never silently drops debutants from its headline cohort.
6. **The 14 stats.** PTS, AST, OREB, DREB, STL, BLK, TOV, FG3A, FGA,
   FTA, FG3_PCT, FG_PCT, FT_PCT, PLUS_MINUS. All 14, every cohort.
7. **No invented numbers.** Margins in §5 are labelled PROPOSED and
   pending the user's confirmation. They are thresholds to be
   confirmed, not measured results.

## Baseline 1 — Carry-forward

**Definition.** The forecast for target season T is the player's own
most recent observed season vector before T, in the same space as
the actuals.

- Source season: the player's most recent row with season-start-year
  < T's start year, drawn from the fold's train seasons only. A gap
  season (rows in T−2 but not T−1) does not break it: the most
  recent observed season is used, and the gap is recorded in the
  forecast file's provenance (not in the scored numbers).
- Era-normalized handling (stated explicitly, because it changes
  what the baseline means): in z-scored space, carry-forward carries
  the player's z-score, i.e. it predicts that the player's standing
  relative to his own season's league persists — NOT that his raw
  per-100 production persists. In raw per-100 space, it carries the
  raw values. The two are different baselines with different
  meanings; the report must state which space was used. Carried
  values are never re-z-scored with target-season statistics: that
  would use target-season aggregates and violate rule 4.
- Debutants (no prior-season row in the fold's train set): there is
  nothing to carry. The forecast is the zero vector in z-scored
  space (the league mean), flagged as a fallback row in the
  forecast file's provenance. In raw space the fallback is the
  train-set league mean vector for that stat, computed from train
  seasons only, likewise flagged. The fallback is reported as its
  own sub-count: carry-forward's headline cohort stays at full
  coverage, and its returning-only subset is reported alongside
  so the reader can see how much of its headline is fallback.
- Why it is the bar: it is the "nothing changes" null. A forecast
  model that cannot beat "last season = next season" has learned
  nothing about change.

## Baseline 2 — Age-curve

**Definition.** The forecast is the player's last observed vector
plus the typical one-season change for players of his age, where
"typical change" is fitted on train transitions only.

- Fitting split (binding): adjacent-season transitions whose BOTH
  endpoints lie in the fold's train seasons (post-embargo). No
  val, test, embargo, or future-season transition enters the fit,
  for any fold. The fit is redone per fold from that fold's train
  set; a single pooled fit across folds is forbidden.
- Age: the player's age at the source season (season-start-year
  minus birth year, from the bio data). Age bands (this draft's
  definition): under 22; 22–24; 25–27; 28–30; 31–33; 34 and over.
  Band edges are a draft definition, not a measured finding; they
  are fixed here so the baseline is reproducible, and may be
  amended at spec finalization.
- Per stat, per band: the fitted value is the mean delta
  (target-season value minus source-season value) across all train
  transitions in that band. Forecast = last observed vector +
  band delta for the player's band. Deltas are computed in the
  scored space (z-space deltas in z-space, raw deltas in raw
  space); spaces are never mixed.
- Small-band rule: a band with fewer than 30 train transitions for
  a stat pools with its adjacent band(s) until it reaches 30, or
  falls back to the all-ages mean delta for that stat. The pooling
  actually used is recorded in the baseline's run note.
- Debutants: no last observed vector exists. Forecast = the mean
  target-season vector, in the scored space, of train players in
  the same age band (train seasons only); if that band is empty,
  the train-set league mean vector. Flagged as fallback, same
  reporting rule as carry-forward.
- Why it is the bar: it is the "players age predictably" null. It
  captures the average aging pattern and nothing player-specific
  beyond the player's own last season and age. A model must beat
  it to show it knows something beyond age.

## Baseline 3 — Stats-only MLP

**Definition.** A small neural model whose inputs are statistics
only — no text, no twin embeddings, no JEPA components, no
retrieval neighbours.

- Inputs (exact): for forecast origin at season T−1, the player's
  most recent season 14-d game vector; the player's career-mean
  14-d vector computed over seasons strictly before T (as-of-origin
  only — a career aggregate that includes T is leakage); and age
  at the source season (1 value). Input width: 14 + 14 + 1 = 29.
  No v5 embedding, no twin list, no PBP text, no shot-location
  feature, no team or lineup feature enters this baseline. A
  player's own history only.
- Architecture sketch (draft, not a measured configuration): a
  feed-forward MLP — 29-d input, two hidden layers with ReLU
  activations and dropout, 14-d linear output. Layer widths,
  dropout rate, learning rate, and epoch budget are set at spec
  finalization and tuned on val only; this document fixes the
  shape (input → hidden → hidden → 14-d output) and the
  stats-only input restriction, not the widths.
- Loss: mean squared error over the 14-d output, equal weight per
  stat. (The "all-14 equal weight with scoring highlighted"
  weighting is a PROPOSED default from the pending rethink brief,
  not adopted here; if the user confirms it, the loss weighting
  changes at spec finalization and all baselines are re-scored.)
- Training-split discipline (binding): training pairs are
  adjacent-season transitions with both endpoints in the fold's
  train seasons (post-embargo), exactly the Lane 3 train-internal
  pair set. No val, test, embargo, or future row is a training
  input or target. Early stopping and every hyperparameter choice
  use val only; the frozen test is scored once, never tuned on.
  Seed 7 default, matching the program's convention. The model is
  retrained from scratch per fold.
- Debutants: a debutant has no prior-season vector and no career
  mean. The baseline forecasts the train-set league-mean vector
  for the debutant's age band (same fallback rule as the age-curve
  baseline), flagged as fallback. The stats-MLP's new-player
  slice is therefore a fallback slice by construction — reported
  as such, not presented as a learned cold-start result.
- Why it is the bar: it is the "statistics alone, learned
  properly" null. It separates "the model learned something" from
  "the model had access to text, twins, or a world model". Any
  context column (text tower, shot-location family, JEPA head) is
  judged by FORECAST LIFT over this baseline — its on/off ablation
  under expanding-window CV — not by twin agreement.

## What "beating" a baseline means

Metric: mean MAE across the 14 stats (the headline number from
`eval_forecast.py`). Per-stat MAE and mean R² are reported
alongside as diagnostics; a per-stat win count is reported but is
not the gate.

Folds: a model beats a baseline only when it beats it on ALL THREE
cohorts — Fold 1 val AND Fold 2 val AND the frozen test — each
scored by the same harness on the same rows in the same space.
A win on val but not the frozen test is not a beat. A win on the
frozen test but not val is not a beat.

Margins (all PROPOSED, pending the user's confirmation — none of
these is a measured result):

- Primary rule (PROPOSED): on each of the three cohorts, the paired
  bootstrap 95% interval for the mean-MAE difference
  (model minus baseline, same rows, `eval_forecast.py --compare`)
  must exclude 0 on the model's side. A point win inside the
  interval is noise, not a beat.
- Additional frozen-test margin (PROPOSED): mean-MAE improvement
  over the baseline on the frozen test of at least 0.01 in
  z-scored space (or the raw-space equivalent declared at spec
  finalization). This margin exists so a statistically detectable
  but practically trivial win does not count as beating the bar.
- New-player slice (reported, not gated): the model's
  new-player-slice mean MAE is reported against each baseline's
  slice on every cohort, but beating a baseline does NOT require
  winning the new-player slice — carry-forward and the stats-MLP
  both fall back to league means there by construction, so a slice
  win is informative, not decisive. A model that wins the headline
  while collapsing on new players must say so in its report.

Beating all three baselines is the forecast gate's bar (per the
pending rethink brief's promotion-gate replacement, itself pending
panel ratification and the user's ruling). Beating one or two is
reported as exactly that — partial, not a pass.

## PATCH ADDITION — E1: "beating" by horizon, similarity separate (binding)

This section ADDS to the "beating" definition above; it does not
change the existing folds, margins, or PROPOSED values.

- **Forecast error BY HORIZON.** Where a forecast file labels
  horizons, the paired-bootstrap "beats" test in §"What beating
  means" is run PER HORIZON — 1-step, short, and long separately
  — in addition to any pooled number. A model beats a baseline
  only on the horizons it actually beats it on; the report states
  the per-horizon verdicts, and a pooled win that hides a
  long-horizon collapse is reported as exactly that. A model
  winning at 1 step and collapsing at 5 steps must NOT be
  reportable as a world model: a world-model claim requires the
  horizon-degradation curves named in RUNG1_DEMO_SPEC.md
  Appendix E2, not a 1-step win.
- **Similarity SEPARATELY from dynamics.** Similarity metrics
  (twin retrieval, twin agreement, embedding-space neighbour
  quality) are reported in their own block in
  `forecast_eval_report.json` (`similarity_metrics`), never
  blended into the forecast headline, never averaged with
  dynamics metrics, and never used to rescue a forecast miss
  (or vice versa). The forecast gate is judged on forecast
  numbers; the twin floor (FLOOR_CONSTRAINT.md) is judged on
  twin numbers; the two verdicts sit side by side.
- **Horizon labels are all-or-none.** `eval_forecast.py`
  enforces this: a forecast file either labels every entry's
  horizon (one of `1-step`, `short`, `long`) or none. A
  partially labelled file fails loud. A single-horizon
  next-season file is a 1-step result, labelled as such — it
  is not evidence about short or long horizons.

## PATCH ADDITION — E4: optimizer-arm control reference (binding)

Wherever the eval docs touch the optimizer arm, the control is
**AdamW+EMA, NOT plain AdamW** (PANEL_REVIEW.md Addendum III-C,
R3: on the tabular benchmark, AdamW+EMA scored +0.66 on the plain
MLP while Muon scored +0.32 — EMA alone beat Muon there, so Muon
must beat the stronger control). Adoption is **MAE-led**: beat
AdamW+EMA beyond the bootstrap interval on Fold 2, with zero
stability cost. Wall-clock must be measured **ON OUR ROWS**:
CPU timing at 12,966 rows is UNVERIFIED — never quote an LLM
"1% overhead" figure or Moonlight ~2× FLOPs (a 3B-active/16B MoE
pretraining comparison, not a small-model result). No claim that
Muon is better may appear in any eval report; the deliverable is
an ablation design, not an adoption decision.

## PATCH ADDITION — E5: bio eval items (summary; full tests in FLOOR_CONSTRAINT.md Appendix E5)

Bio mechanisms are judged ONLY by the named tests in
FLOOR_CONSTRAINT.md Appendix E5 — per-tower error bands as
warning/alarm inputs, the two-threshold gate test, structured
pruning pass rules, and the multi-detector + co-stimulation OOD
test. All thresholds there are PROPOSED DEFAULTS pending
calibration. No bio mechanism ships until its named test passes
on basketball data (Panel IV-A BLOCKED item). Literal swarm /
morphogenesis / negative-selection / homeostasis-as-freeze stay
REJECTED and are not reintroduced by any eval provision here.

## Contract conflicts and notes (reported, not silently resolved)

- C1 (carried from Lane 3, FOLDS.md §0): contract §2a prints Fold 2
  val as 984 rows. No non-leaking reading yields 984; Lane 3
  implements 500 (single season 2024-25) and this harness validates
  against the manifest's own counts, never against 984. The 984
  figure must be amended in the contract before any gated run.
- C2: contract §2a's pre-embargo fold table (train ≤ 2023 for Fold 2)
  vs the embargoed folds adopted here (Fold 2 train 11,491 after
  removing embargo season 2023-24). This harness reads the embargo
  flag and season lists from the manifest, so it scores either
  variant correctly — but a report must state which variant its
  numbers came from, and the two variants must never be mixed in
  one report (Lane 3, FOLDS.md §4).
- C3: the 14-d vector's space. CONTRACT.md §0 describes
  `assets/vectors.json` as "14 raw per-100 stats, z-scored within
  season". The harness therefore requires the forecast file to
  declare its space and refuses to convert. If a future lane
  redefines the game vector's space, every baseline forecast file
  must be regenerated in that space before any comparison.

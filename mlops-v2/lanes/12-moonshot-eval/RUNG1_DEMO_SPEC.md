# Rung-1 Demo Spec: Next-Shot Location Prediction — Lane 12 (DRAFT)

Status: DRAFT ONLY, written as an executable spec. Spec finalization
waits for the panel's moonshot verdict (CONTRACT.md §11, §13). This
spec authorizes NO execution: no training run, no data collection
run, no merge, no production write. When the data precondition in §6
clears and the user gives the word, an operator executes exactly
these steps, in this order, and stops at the kill rule in §5.

Source: panel Round 1 pre-registered demo (PANEL_REVIEW.md, Addendum
II §4), carried here verbatim in its rules and extended only with
the executable steps needed to run it. Where this spec and the panel
text differ in wording, the panel text wins and this spec is amended
— this spec does not silently reinterpret the panel.

## 1. Task (exactly as pre-registered)

Given a possession's real context up to event t — play-by-play
events so far in the possession, tracking aggregates where they
exist, shot coordinates of prior shots, and score / clock / lineup
from PBP — predict the location of the NEXT shot in that possession
as (x, y) in feet, in court coordinates, OR predict "no shot this
possession" as a separate outcome head.

- If a possession ends without a shot, it counts in the no-shot
  head only — never as a location miss, never as a zero-error hit.
- The location head is scored only on possessions that actually
  contain a next shot. The no-shot head is scored as a separate
  classification outcome (accuracy reported alongside, not blended
  into the feet error).
- One prediction per possession. No trajectory, no path, no
  interpolated movement: the demo predicts one event location,
  the next shot. Continuous-trajectory prediction is a different,
  BLOCKED claim (no trajectory source is inventoried) and is not
  part of this demo.
- Panel dissent, kept: Seat 7 notes next-shot location is the
  EASIEST location task (shots cluster in known zones) and passing
  it proves less than passing next-event location for all event
  types. Accept this demo as rung 1, not as proof of the whole fine
  level. Seat 1 insists the demo run on the SIMPLEST model first
  (gradient-boosted trees or a small MLP on structured features)
  before any JEPA machinery touches locations. Seat 9 notes PBP
  text may help, but only as context, tested by ablation AFTER
  the no-text demo clears.

## 2. Metric: error in feet

- Primary metric: mean Euclidean error in feet between predicted
  (x, y) and actual next-shot (x, y), over held-out possessions
  that contain a next shot.
- Reported overall AND by zone (paint / mid-range / three) AND by
  play type. A model that wins overall by nailing paint shots
  while failing threes has not proven the level — the zone and
  play-type breakdowns are part of the result, not an appendix.
- Also reported: median error, and the error distribution by zone,
  so a mean pulled by a few wild misses is visible as such.
- Coordinate convention: the data builder MUST pin, in writing,
  the transform from the source coordinate fields to feet
  (origin, axes, units, court dimensions used for validation)
  before any run, and validate it against known court geometry.
  This spec does not assume a conversion factor: PBP x/y fields
  and ShotChartDetail LOC_X/LOC_Y are different field systems,
  and assuming one is the other would corrupt every error in feet.
- The demo page prints the error in feet on the page, with
  predicted vs actual shot spots side by side, predicted spots
  marked as predictions, and the baselines printed alongside. A
  demo without baselines on the page is not a demo — it is a
  trailer (panel's rule, adopted verbatim).

## 3. Baselines (all on the same possessions, paired comparison)

All three baselines are computed on the SAME held-out possessions
as the model, so the comparison is paired, not cross-cohort:

- (a) Carry-forward: the location of the most recent shot by the
  SAME player before event t (his last shot location, carried
  forward). If the player has no prior shot in the collected data,
  the fallback is the league-mean shot location (flagged as a
  fallback possession in the report; the fallback count is printed,
  never hidden).
- (b) Team-mean: the mean shot location of the shooting player's
  team, computed from train-period shots only (never from the
  held-out possessions themselves).
- (c) League-mean by play type: the mean shot location, across the
  league, for shots of the same play type as the possession's
  context, computed from train-period shots only.

Baselines (b) and (c) are train-period aggregates: computing them
from held-out data would leak the answers into the bar.

## 4. Comparison: paired bootstrap

- Resample held-out possessions with replacement (seed 7, at least
  1000 resamples), computing the mean-error difference between the
  model and each baseline on the SAME resample each time.
- Report, per baseline: mean difference in feet, 95% percentile
  interval, and the fraction of resamples where the model wins.
- A model "beats" a baseline only when the interval excludes 0 on
  the model's side. A point win inside the interval is noise.
- The comparison is run on the frozen test AND on the new-player
  subset (possessions by players unseen in train — location
  prediction must generalize to new players, not memorize
  shooters' favorite spots). New-player possessions are reported
  separately, never blended into the overall error.

## 5. Success rule and KILL RULE

Pre-registered success rule (PROPOSED thresholds, needs the user's
confirmation — the panel text marks the threshold as proposed):

- The model beats the BEST baseline's mean error by more than the
  bootstrap interval on the frozen test AND on the new-player
  subset, overall and without a zone collapse (no zone where the
  model loses to carry-forward by more than the interval while
  winning overall — a zone collapse is reported as a failure of
  the level claim even if the overall number passes).

KILL RULE (binding, not proposed — this is the panel's rule):

- If the demo fails to beat CARRY-FORWARD on the frozen test, the
  fine level STOPS. No hierarchy work, no ghost mode, no rung 2 —
  until a better location model or better location data exists.
  There is no silent continuation to rung 2, no re-framing of the
  demo after the fact, and no second run on re-tuned thresholds
  without a fresh pre-registration. The kill is recorded in the
  run report as KILLED, with the carry-forward comparison attached,
  and the coordinator stops rung-2 work.

Note the relationship between the two rules: the kill rule is the
floor (carry-forward specifically), the success rule is the bar
(best baseline, both cohorts). Failing the success rule while
beating carry-forward means the fine level is unproven but not
killed — it returns for a better model or better data, with the
failure reported. Failing carry-forward means it stops.

## 6. Data precondition: DATA-GATED (current state, 2026-10-26)

This demo CANNOT run today. The precondition is unmet, and this
spec does not pretend otherwise:

- NO ShotChartDetail cache exists on this VM. LOC_X appears
  NOWHERE in the cache (0 hits, coordinator-verified 2026-10-26,
  CONTRACT.md §10).
- Play-by-play x/y coordinates exist for exactly 5 games:
  `cdn_pbp/` holds games 0022600001–3 and 0022600085–6, all
  2026-27 opening games, ~593 actions each, WITH x/y coordinate
  fields and description text. Five games is a smoke-test sample,
  not a training or evaluation corpus.
- The existing "shotmix" tower family (10 features from the
  Scoring dashboard, 13 columns as built) is shot TYPE mix only
  (2PT/3PT/FT shares, assisted/unassisted). It contains NO floor
  location and cannot substitute for shot coordinates.
- The Hatch VM is a known-bad collector for stats.nba.com
  ShotChartDetail (stalls, zero bytes) and cdn.nba.com (instant
  403), per the 2026-10-11 shot-source verdict. Collection must
  run on the Alienware box or the user's Mac, or through alternate
  real sources. NEVER synthesize, proxy-fill, or interpolate
  missing shot locations.

What unblocks it, in order:

1. Scope A inventory + per-season gap report (game logs, shot
   coordinates, PBP) — the FIRST deliverable before any bulk
   fetch (CONTRACT.md §10). The inventory states, per season,
   which shot-coordinate source covers it and at what volume.
2. Bulk collection at scale through a working collector
   (Alienware/Mac), into a versioned cache with validation gates
   that fail loud — the same standard as the 73-column rebuild
   (exit-0 + hash-verified). Ad-hoc fetches from a laptop are not
   a dataset.
3. Location-era folds, defined INSIDE the location era
   (tracking 2013-14+; shot-chart coverage per the inventory) —
   NOT the 30-season expanding windows. The brief's 1996-97…
   2025-26 windows do NOT apply to the fine level. Proposed fold
   shape (panel text; exact seasons set by the inventory and
   pre-registered before running): train ≤ 2021 / val 2022-23 /
   frozen test 2024-25 or 2025-26 depending on collected coverage.
   The frozen test season is fixed in the pre-registration and
   never moved after seeing results.
4. Coordinate-transform pinning (§2) and a possession builder
   (possession boundaries from PBP, deterministic, versioned)
   with its own validation gate: every possession in the demo
   must trace to real PBP events, and every predicted-vs-actual
   pair on the demo page must carry its game and event pointers.

Until steps 1–4 land, this spec's status is DATA-GATED and any
claim about the fine level is a claim about an unrun demo.

## 7. Executable steps (when unblocked and authorized)

1. Pre-register: fold seasons, frozen test season, coordinate
   transform, possession definition, bootstrap seed (7) and
   resample count, and the success thresholds. Publish the
   pre-registration before any model touches held-out data.
2. Build the location-era possession dataset from the versioned
   cache only. Fail loud on: missing coordinate fields, possessions
   with no traceable PBP events, any sprite-animation position in
   the inputs (rendering output is never training input,
   CONTRACT.md §7).
3. Compute baselines (a)–(c) from train-period data only.
4. Train the SIMPLEST model first (boosted trees / small MLP on
   structured features). No JEPA machinery in the rung-1 run.
5. Score on the frozen test and the new-player subset: overall,
   by zone, by play type, plus the no-shot head.
6. Run the paired bootstrap against each baseline.
7. Apply §5: beat carry-forward or KILLED; beat the best baseline
   on both cohorts or unproven. Write the run report with the
   demo page (predicted vs actual, error in feet, baselines
   alongside) attached.
8. Hand the report to the coordinator. Do NOT start rung 2 on a
   KILLED or unproven result. Rung 2 (next-event location + play
   type) begins only on a passed rung 1, under its own
   pre-registration.

## 8. What this demo does not prove

- Passing rung 1 does not prove the fine level, the hierarchy, or
  ghost/coach/Live modes (panel Seat 7 dissent, §1).
- It does not prove continuous trajectories exist or are
  predictable — no trajectory source is inventoried, and this
  demo predicts one shot location, not a path.
- It does not license location claims for pre-tracking-era seasons
  where the data does not exist. A gap stays a gap until collected.

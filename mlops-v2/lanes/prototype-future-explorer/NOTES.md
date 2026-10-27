# Steerable Future Explorer — NOTES

Reframed prototype (new pair, separate from the original twin competition).
The user compares this prototype against Forecast Attribution and picks;
no verdict is claimed here. Framing is **prediction-first, user-directed,
pending panel ratification** (CONTRACT §11 HOLD): the headline is the
predicted future stat line, not twins. Spec finalization waits for panel
synthesis — this is a draft prototype, not a finalized spec.

## Files

- `index.html` — runnable demo. Open it directly (double-click); it loads
  `data.js` with a `<script>` tag, so there is no server, no fetch, and no
  CORS problem. No build step, no new packages, relative paths only.
- `data.json` — canonical baked data (players, steering slopes, validation).
- `data.js` — the same data as `window.FUTURE_EXPLORER_DATA = {...};`,
  written by the same precompute run so the two cannot drift.
- `precompute.py` — stdlib-only script that reproduces `data.json` +
  `data.js` from the saved assets. Run: `python3 precompute.py`.

## Was the v5 next-profile head runnable? NO — with evidence

- The saved file `assets/mtnn_heads.f32` is 12,966 × 45 float32, layout
  `[arch 8 | skills 18 | position 5 | next-profile 14]` (confirmed in
  `pipeline/export_mtnn_viz.py`: `heads = concat([arch, skills, pos,
  next_profile])`). Columns 31:45 are the next-profile outputs.
- Those are frozen per-row **outputs**, not weights. There is no v5
  checkpoint (`.pt`) saved in the repo, and the saved `mtnn.onnx` is a
  different 119→48 model (contract honesty ban) — so there is no model
  to feed a steered input through. A steered "model prediction" would
  have to be invented, and it is not.
- The frozen outputs are still real and worth showing: scored against
  the actual next season over all 10,107 adjacent-season pairs, the
  v5 saved head has overall MAE 0.4708 in z units, vs carry-forward
  0.4732 and age-curve 0.4705 — essentially a three-way tie. Per-stat
  correlation with the actual next season runs 0.435 (PLUS_MINUS) to
  0.882 (OREB). For Curry 2016-17 specifically, the v5 head's MAE
  (0.553) is worse than carry-forward (0.354) — reported on the page's
  reference table rather than hidden. Conclusion: the head is displayed
  as a frozen reference line only, never steered, never called a live
  prediction.

## What is a model output vs a labelled baseline (the honesty ledger)

| Line on the page | What it is | May it move when you steer? |
|---|---|---|
| This season | Real 14-d line from `vectors.json` | No — it is history |
| Baseline forecast (age-curve) | This season + mean year-to-year change of the player's age bin, from all 10,107 adjacent pairs | Yes — this is the steered line |
| Steered forecast | Baseline + Σ (slider/100 × slope vector) | This IS the steering |
| Carry-forward | Next = this season | No |
| v5 saved head | Frozen v5 export outputs, cols 31:45 | No — no weights to run |
| Actual next season | Real following-season line | No — it already happened |

## Derivations (all computed, none asserted)

- **Adjacent pairs:** same `person_id`, season N → N+1, in
  `vectors.json` (row master, 12,966 rows). n = 10,107.
- **Age bins:** ≤21 (n=861), 22–24 (2,607), 25–27 (2,617), 28–30 (2,004),
  31–33 (1,267), 34+ (751). Age = season-start-year − `birthYear`.
  The age-curve forecast adds the bin's mean 14-d change to this season.
- **Steering slopes:** ordinary least squares, slope of each stat's
  year-to-year change on the driver's year-to-year change, over all
  10,107 pairs. Drivers: FG3A ("More threes"), FGA ("Bigger scoring
  role"), AST ("Run the offense"), OREB+DREB change ("Crash the glass").
  Slider +100 = driver +1.0 z above the baseline change.
  These are correlations from history, not causal effects and not model
  runs. The page says so, under each slider and in the method section.
- **Units:** per-100-possession stats, z-scored within each season
  (0 = average player-season that year, ±1 = one standard deviation).
  A forecast is a predicted z for next season on the same scale. The
  page does not convert to raw points/rebounds because `vectors.json`
  stores z-scores, not raw per-100 values — converting would require
  per-season means/stds that are not in the saved asset.

## Success test (reproduced by `python3 precompute.py`)

Stephen Curry 2016-17, "More threes" slider at +100 (+1.0 z of FG3A),
baseline (age-curve) → steered:

| Stat | Baseline | Steered | Δ |
|---|---|---|---|
| FG3A | 2.55 | 3.55 | **+1.00** |
| FGA | 1.91 | 2.41 | +0.51 |
| FG3_PCT | 1.76 | 2.20 | +0.45 |
| PTS | 2.31 | 2.73 | +0.42 |
| FG_PCT | 0.18 | −0.09 | −0.27 |
| OREB | −0.63 | −0.81 | −0.18 |

Plain-words sentence: *Shooting way more threes lifts Curry's predicted
three-point volume a full standard deviation, drags total shot volume
and three-point accuracy up with it — but pulls overall shooting
accuracy down, because the extra shots are harder threes, not easy
twos.* The surprising FG_PCT drop is real history (slope −0.268),
shown honestly rather than smoothed away.

## Start players

- Stephen Curry 2016-17 (guard, prime, age 28) — the required Curry anchor.
- Nikola Jokic 2020-21 (big man, prime, age 26).
- Victor Wembanyama 2023-24 (young player, age 20).
All three have a real following season, so the page can show "actual
next season" as a check. No player is shown without a following season
in this v0, so every reference line is complete.

## Omitted, deliberately

- **New-team steering:** team is not in the 14-d vector and no
  team-change effect was estimated from these assets. Omitted, with the
  reason printed on the page — not faked.
- **SAE steering, JEPA predictions, trained-model forecasts:** v1 notes
  only, listed on the page as not built. No number on the page comes
  from any of them.
- **Twins:** demoted to product surface / secondary validation per the
  prediction-first correction. This prototype shows no twin list; the
  twin surface is judged separately (original competition stands apart).

## Limits

- Baselines are weak in an honest way: age-curve MAE 0.4705 vs
  carry-forward 0.4732 is a ~0.5% improvement. The prototype's value is
  the *steerable interaction*, not forecast accuracy — a trained
  predictor head is the v1 step that could actually beat the baselines.
- Steering slopes are population averages. They describe what tended to
  happen to players who changed this way; they do not promise what will
  happen to this player, and they can push a stat to an implausible
  extreme at slider ±100 for already-extreme players (Curry's steered
  FG3A of 3.55 z is such a case — it is arithmetic, labelled as such).
- Percentages (FG3_PCT, FG_PCT, FT_PCT) move by linear slopes and are
  not re-constrained for consistency with volume stats (e.g. FG_PCT is
  not recomputed from makes/attempts). That inconsistency is a known
  v0 limit of slope steering, stated here rather than hidden.
- Age uses `birthYear` from `vectors.json`; a small number of rows
  carry placeholder birth years, which the binning absorbs but does
  not fix.

## Blockers (in order)

1. No runnable v5 head (no saved weights) — steering cannot go through
   the model until a trained predictor is authorized and built.
2. No raw per-100 values in the saved asset — the page speaks in z
   units, which a fan must learn (the page explains them, but raw
   points/rebounds would read faster).
3. Prediction-first framing itself is pending panel ratification
   (CONTRACT §11 HOLD) — if the panel rules otherwise, this page's
   headline framing must be revisited, though its computed baselines
   and steering arithmetic survive either ruling.

# Forecast Attribution — Notes (derivation, honesty, limits)

Prototype B of the NEW reframed pair (forecast attribution). The sibling
(Steerable Future Explorer) was not read, opened, or collaborated with.
The original twin competition (`prototype-steerable`, `prototype-attribution`,
`COMPARISON.html`) was not touched. No verdict is claimed here — the user
compares.

## Framing label (required)

Prediction-first framing is **user-directed, pending panel ratification**
(CONTRACT §11 HOLD). This prototype drafts the idea; it does not finalize
any spec. Spec finalization waits for panel synthesis.

## What is a model output vs a labeled baseline

- **Nothing on the page is a v5 model prediction.** There is no runnable
  v5 forecast to attribute, for measured reasons (below).
- **Headline forecast = Neighbor baseline (K = 25), a labeled baseline.**
  Forecast = mean of the actual next-season 14-d lines of the 25 most
  similar *earlier* player-seasons (same person_id excluded).
- **Carry-forward baseline** = last season's line unchanged.
- **Age-curve baseline** = last season's line + the mean year-over-year
  delta per stat for players of the same age (cell widened ±1, ±2… years
  only until n ≥ 30; n reported per player in `data.json`).
- **Actual next-season line** = hindsight check only, never an input.

## Was the v5 next-profile head runnable? NO — evidence

1. `assets/mtnn_heads.f32` is 583,470 float32 = 12,966 rows × 45 outputs.
   It holds saved per-row head *outputs*, not weights: no weight file, no
   documented column layout, and no checkpoint file exists anywhere in
   `assets/` (the architecture file references a checkpoint of 1,563,083
   bytes, but no such file is saved).
2. Parsed row-major, its last 14 columns are a shrunk copy of the
   *current* season (per-stat slope 0.30–0.81 toward the mean), not a
   forecast: over 10,107 adjacent-season pairs its MAE vs the actual next
   season is 0.4708, vs carry-forward 0.4732 — a tie, and closer to the
   current season (MAE 0.3672) than to the next one.
3. Consequence: it cannot be run on new inputs and cannot be ablated.
   Attributing it would be fabrication. The page therefore attributes
   baselines, and says so in the banner.
4. Banned assets were NOT used: `mtnn.onnx` (119→48, stale, not served
   v5), `mtnn_attr_pop.json` / `mtnn_jacobian.json` (48-d pre-v5,
   `not_from_served_net`). SAE/JEPA attributions are v1 notes only.

## Method (exactly as implemented in `precompute.py`)

- Row master: `vector-hoops-mlops-v2/assets/vectors.json` (12,966 rows),
  read-only. Distance space: 17 standardized dims, equal weight — the 14
  game-vector z-scores (PTS, AST, OREB, DREB, STL, BLK, TOV, FG3A, FGA,
  FTA, FG3_PCT, FG_PCT, FT_PCT, PLUS_MINUS) + age_z + gp_z + total_min_z
  (age = season-start year − birthYear; the _z features use global
  mean/std across all 12,966 rows, recorded in `data.json`).
- Candidates: seasons strictly earlier than the target season, own next
  season known, same person_id excluded. K = 25, Euclidean distance.
- Attribution = leave-one-signal-out on the neighbor search (recomputed,
  not asserted):
  - *remove*: drop the signal's dims from the distance, re-find neighbors.
  - *vary 0.5× / 1.5×*: scale the *target player's* dims in that signal,
    candidates unchanged, re-find neighbors.
  - Delta = ablated forecast − full forecast, per stat. The page's
    plain-words sentence is generated in JS from the measured largest
    delta, not hand-written per player.
- Signals: scoring (PTS, FGA, FG3A); playmaking & ball security (AST,
  TOV); glass & defense (OREB, DREB, STL, BLK); shooting efficiency
  (FG3_PCT, FG_PCT, FT_PCT); free throws & on-court impact (FTA,
  PLUS_MINUS — labeled as the closest stored proxy for team context, not
  a real team field); age & workload (age, gp, stored total_min).
- Units: z-scores throughout (season-relative). No raw per-100 line is
  shown, because the dataset stores z-scores and season means/stds for
  de-z-scoring are not saved with it. Inventing a raw line would be fake
  precision.

## Success test (measured, quoted)

- Stephen Curry 2016-17, remove last-season scoring: predicted PTS
  **falls by 0.429** (1.843 → 1.413). Plain-words sentence on the page:
  "Without last-season scoring, predicted PTS falls by 0.429…"
- Strongest single demo: Nikola Jokic 2022-23, remove playmaking:
  predicted AST **falls by 1.423**. Victor Wembanyama 2023-24, remove
  glass & defense: predicted BLK **falls by 2.172**.

## How good is the baseline? Honestly, not better than carry-forward

- Global check (same method, all adjacent pairs with an earlier-season
  pool): n = 9,787 of 10,107 pairs; neighbor-baseline MAE **0.4805** vs
  carry-forward **0.4732**. Per player, the neighbor forecast also loses
  to carry-forward on all four demo players (Curry 0.638 vs 0.354; Jokic
  0.507 vs 0.312; Doncic 0.975 vs 0.727; Wembanyama 0.735 vs 0.527).
- This is shown on the page, not hidden. The prototype's claim is the
  *attribution mechanics* (a removed signal moves the line by a measured
  amount through a changed neighbor set), not forecast skill. A future
  model head, once runnable and gated, would slot into the same page
  with the same LOSO interaction — that swap is the path to shippable.

## Players (why these four)

- Stephen Curry 2016-17 (task-named start player; age 29).
- Nikola Jokic 2022-23 (big man; age 28).
- Luka Doncic 2018-19 (young player; rookie, age 20).
- Victor Wembanyama 2023-24 (young big man; rookie, age 20; bonus fourth).
  Every demo season has a real next season in the file, so the hindsight
  check is real for all four.

## Limits

- Attribution here is *neighbor-set* causality ("which inputs pick the
  comparables"), not model-internal causality. No tower, gradient, SAE,
  or JEPA attribution is claimed.
- Neighbor forecasts regress toward typical players: stars' forecasts
  under-shoot (e.g. Curry's actual next-season PTS z 2.964 vs forecast
  1.843), because no past neighbor was quite that good. That shrinkage
  is visible in the forecast-vs-actual table.
- Equal weight per distance dim is a choice, not a finding; scoring and
  efficiency dims are correlated, so "remove scoring" also shifts the
  neighbor set through correlated dims. The deltas are still measured,
  but they are not independent causal effects.
- Stored workload fields (gp, total_min) are used as stored; they are
  not re-derived into real minutes per game.
- No training, no GPU, no installs, no prod writes, no merge. Inputs
  read-only; `precompute.py` writes only `data.json` in this directory.
  `index.html` embeds that JSON inline so the demo runs from a file
  with no server and no external fetch; `data.json` is kept alongside
  as the standalone baked artifact (verified byte-identical to the
  embedded copy at build time).

## Reproduce

```
python3 precompute.py        # rewrites data.json (~55 s, full eval incl.)
python3 -m py_compile precompute.py
```

Then re-embed `data.json` into `index.html` at the `__DATA_JSON__`
placeholder if the data is regenerated (the checked-in page already
carries the current embedding; the placeholder is replaced, verified
by parsing the embedded JSON and comparing it to `data.json`).

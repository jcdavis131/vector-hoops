# Arc Forecaster SPEC — career-arc talent priors for PrizePicks

**Status:** approved for build → train → prod on held-out win (Cameron, 2026-10-01)
**Branch:** `scout/arc-forecaster` (stacked on `scout/player-identity`)

## 1. Why

The incumbent forecaster (`numpy-timesfm-lite-deterministic-seed7`, test MAE 0.1335)
builds trajectories keyed by **display name**. Eleven shared names (22 persons,
123 player-seasons) are contaminated multi-person arcs — the `_identity_note` in
`timesfm_forecasts.json` admits Gary Payton, Gary Trent, Glenn Robinson, Jaren
Jackson, Ron Harper, Tim Hardaway forecasts were computed on merged careers.

The identity fix (`person_id` on all 12,966 rows) makes clean person-level arcs
possible for the first time. This spec trains the first forecaster on them.

Downstream: the nba-props lab needs per-player talent priors for 2026-27 to
price PrizePicks per-game lines. The arc forecaster is the prior engine.

## 2. Non-goals

- NOT a v5 embedding retrain. v5 stays frozen as the identity-free style space.
- NOT game-level modeling (matchup, pace, rest, injuries) — that lives in nba-props.
- NOT a torch transformer (v2 path, gated on pip approval + GPU recovery).

## 3. Data

- **Source:** `assets/vectors.json` → `players` (12,966 rows), grouped by
  `person_id`, sorted chronologically. Row `v` = 14-d per-100-possession
  z-scored features (era-honest), order = `features` list.
- **Arc features per (person, target season T):** seasons T-1, T-2, T-3
  (with missingness indicators), 3-yr recency-weighted mean, career-year index
  (1st/2nd/… season — age proxy; no birth-year source exists) and its square,
  per-feature momentum (T-1 minus T-2), gp/mpg level + trend.
- **Target:** season T's 14 features. One training pair per person per eligible
  target season (≥1 prior season; context capped at 6).
- **Split (chronological, no shuffle — matches incumbent convention):**
  train = target ≤ 2021, validation = 2022–2023, test = ≥ 2024.
- **Determinism:** fixed seed; no RNG in the ridge path.

## 4. Model (v1 challenger: `arc-ridge-v1`)

Multi-target ridge regression (14 targets, one alpha tuned on validation).
Small data (2,426 persons, short arcs) favors regularized linear over deep —
this is a principled choice, not just a CPU compromise.

**Baselines (all recomputed on clean person_id arcs):**
- `naive_last`: repeat T-1
- `avg3`: 3-yr mean
- `incumbent`: existing numpy-timesfm-lite logic re-run on clean arcs

**Win gate (both required):**
- test macro-MAE (14 features, z-space) < best baseline
- test props-weighted MAE (PTS×3, AST×2, REB×2 = OREB+DREB, STL/BLK/3PM×1.5,
  rest ×1) < best baseline

## 5. Prod artifact

`assets/arc_forecasts_v1.json` (+ `public/` mirror):
```json
{
  "version": "arc-ridge-v1",
  "trained_on": "vectors.json <sha> + player-identity.json <sha>",
  "split": "train<=2021 val2022-23 test>=2024",
  "metrics": {"test_macro_mae": …, "baselines": {…}, "win": true},
  "forecasts": {"<person_id>": {"per100": [14 floats], "mpg": f, "gp_est": f}},
  "season": "2026-27"
}
```
- Covers every person_id with ≥1 season through 2025-26; no NaNs (QA-enforced).
- `per100` is z-space; `pipeline/timesfm/pergame_convert.py` calibrates to
  per-game priors empirically: for each stat it fits per_game = a·z + b on
  2025-26 real data (vectors.json z-scores joined to Basketball-Reference
  game-log per-game averages, n=265, e.g. PTS r²=0.83, AST r²=0.84).
  Documented approximation; the game-level model refines it.

**Data-quality flag (2026-10-01):** the dataset's `mpg` field is uncorrelated
with real minutes (corr ≈ 0.0 on the 2025-26 join; values cluster 45–50).
It is NOT used. The minutes prior comes from 2025-26 real per-game minutes
directly. The underlying `total_min`/`mpg` scale issue is logged for a future
data fix — the data is never altered to fit the model.

## 6. Pipeline (one command end to end)

- `pipeline/timesfm/train_arc_forecaster.py` — build arcs → featurize →
  tune alpha → train → eval vs baselines → emit artifact. Hard-fails if any
  trajectory groups by anything but person_id, if row count/order differs
  from canonical vectors.json, or if the win gate fails.
- `pipeline/timesfm/pergame_convert.py` — z-space → per-game priors.
- `~/workspace/nba-props/pipeline/arc_priors.py` — map person_id → props
  player names, emit `data/arc_priors_2026-27.json` for the props lab.

## 7. Landing

On win: commit, PR `scout/arc-forecaster` → master, merge per Cameron's
2026-10-01 "landed in prod" approval, Vercel serves `public/` (mirror +
cache-busted verify). On loss: no ship; report metrics and the v2 options
(torch transformer w/ approval, age data join, game-log features).

## 8. v2 options (parked)

- Torch patch-transformer (needs explicit pip approval; GPU lane down as of
  2026-10-01 09:45 CDT).
- Birth-year join for true age curves (no source identified yet).
- Game-log level features (nba-props/game_logs, 704 files and growing).

# Hustle-tracking defense features + a self-inflicted position-label confound

2026-07-30. Follow-up to `MTNN_STABILITY_2026-07-24.md`.

## What changed

`fetch_wide_skills.py` has cached real hustle-tracking stats (deflections,
loose balls, charges drawn, box-outs, screen assists, contested shots) for
every player, every season 2015-16 through 2025-26, complete, for a long
time — but it only ever fed the skill-grade display (`assets/skills_wide.json`)
and the `motor`/`disruption_gravity`/`rim_gravity` skill-tower **targets**
(`pipeline/data/wide_skill_labels.npz`). It never reached the tower
**inputs** that shape the embedding itself. The `defense` family sat at 3
features (STL, BLK, DEF_RATING) despite this sitting in cache unused.

`build_vectors.py` now joins 6 of these 7 fields into `defense` (3 → 9
features; `HUSTLE_D_FG_PCT` is excluded — confirmed every player in every
season's cache has `d_fg_pct` exactly `0.0`, a pre-existing gap in
`fetch_wide_skills.py`'s own fetch, not something this change touches).
Matrix: 136 features / 18 families. `test_feature_hygiene.py` and
`audit_features.py` both come back identical to the pre-hustle baseline — no
new redundant pairs, no leak candidates, no dead columns.

## The confound, and why the first read was wrong

Rebuilding the base matrix (`build_vectors.py --offline`) regenerates
`assets/vectors.json`, which resets its `p` (position index) field to
missing — that field is only restored by a separate, additive script,
`enrich_vectors.py`, which is **not** part of `rebuild_all.py`'s documented
sequence. Every training run done immediately after the hustle rebuild —
including the first "restore the seed=7 reference" run and the first 4-seed
sweep — ran before `enrich_vectors.py` was re-run, so `position_labeled: 0`,
`position_top1_acc: null` in every one of them.

`composite_score.py`'s CQS reads `pos = _num(report.get("position_top1_acc"))
or 0.0` — a `null` scores as a flat `0.0` instead of the usual ~0.79-0.83.
At weight 0.05 that alone costs ~4 CQS points, which is nearly the entire
"CQS regressed 75.82 → 73.22" finding reported the first time around. That
finding was a measurement bug, not a real result.

Fixed by running `python pipeline/enrich_vectors.py` (rejoins position from
`pipeline/cache/positions_bbref.json`, 99.68% coverage) and retraining.
`vector-unified`'s `load_live_encoders.py` smoke test confirms the fix
(warning gone, `SMOKE PASS` on all three sports).

## Corrected 4-seed sweep (position labels fixed)

Same recipe as the `2026-07-24`/`2026-07-25` baseline (concat fusion, tower
32/160, 2 blocks, dim 64, mlp-heads, d-head-hidden 128, fusion-hidden 256,
hybrid NCE, onecycle, 40 epochs, `--val-every 0 --no-best-checkpoint` for
seed-comparability), seeds 7/13/21/42, now on the 136-feature hustle matrix:

| seed | CQS | test recall | purity | position_top1_acc |
|---|---|---|---|---|
| 7 | 77.06 | 0.800 | 0.7773 | 0.8272 |
| 13 | 77.60 | 0.834 | 0.7808 | 0.8183 |
| 21 | 76.49 | 0.782 | 0.7834 | 0.8228 |
| 42 | 76.62 | 0.778 | 0.7753 | 0.8238 |
| **mean** | **76.94** | **0.7985** | **0.7792** | **0.8230** |
| **sd** | **0.50** | **0.0255** | **0.0036** | — |

vs. `composite_score.py`'s current `BASELINE` (pre-hustle, same 4 seeds):
CQS 75.82 (sd 3.40), recall 0.732 (sd 0.176), purity 0.7813 (sd 0.0038).

**Mean CQS is up** (+1.12, not down — the earlier −2.6 finding does not
survive the confound fix). **Mean recall is up** (+0.0665). Purity is flat
(−0.0021, within noise). **Seed dispersion collapses by ~85%** on both CQS
(sd 3.40 → 0.50) and recall (sd 0.176 → 0.0255). Seed 42 — historically a
bad basin for concat fusion (CQS ~70.7, recall ~0.47-0.48, collapsing on
bench/rookie/low-signal current-season rows) — no longer collapses: CQS
76.62, recall 0.778, in line with the other three seeds. `position_top1_acc`
also improved over the pre-hustle baseline's 0.7946, up to a 0.818-0.827
range — hustle stats (box-outs, screen assists) apparently carry real
positional signal too.

## Promote-gate math, run as-is

`_threshold` widens the bar using `BASELINE_SD`, which is still the
*pre-hustle* dispersion (that constant was not touched by this change):

- recall: need ≥ 0.732 − max(0.02, 2·0.176/√4) = 0.732 − 0.176 = 0.556 →
  **clears easily** (0.7985)
- purity: need ≥ 0.7813 − max(0.015, 2·0.0038/√4) = 0.7813 − 0.015 = 0.7663 →
  **clears** (0.7792)
- CQS: need ≥ 75.82 + max(0.5, 2·3.40/√4) = 75.82 + 3.4 = 79.22 →
  **does not clear** (76.94)

The CQS bar is wide because it's sized off concat fusion's *old*, seed-42-
inflated dispersion. This run's own dispersion (sd 0.50) is 6.8x tighter than
that. The gate, as currently written, doesn't know the new recipe is
inherently more stable — it's still charging the old noise premium against a
mean that's actually improved.

**Open call, not made here:** whether `BASELINE`/`BASELINE_SD` should be
re-anchored on this recipe (mirroring the 07-24/07-25 re-anchors), which
would very likely let hustle-defense clear its own gate — or whether the
existing wide margin should stand until a 6-seed run (matching the 07-24
methodology) confirms sd 0.50 isn't itself a lucky draw. Recalibrating the
gate changes what promotes for every future candidate, not just this one, so
it's flagged here rather than done inline.

## State on disk

- `pipeline/data/mtnn_best.pt` / `mtnn_report.json` / `embedding_v3.npz` /
  `mtnn_centroids.npz`: restored to the select-phase (best-epoch) seed=7
  reference — CQS 77.53, test recall 0.828, purity 0.7791,
  `position_top1_acc` 0.8255, `best_epoch` 39. This is the file state
  currently shipped; **not a promotion**, same as the wiring commit.
- `pipeline/data/*.confounded_no_position_20260730_143726`: the pre-fix
  (position-label-broken) runs, kept for reference, not deployed.
- `pipeline/data/*.pre_hustle_20260730_142101`: the true pre-hustle
  reference (130 features), kept for reference, not deployed.
- `pipeline/data/sweep_stability/report_seed{7,13,21,42}_hustle_fixed.json`:
  the corrected 4-seed sweep reports backing the table above.

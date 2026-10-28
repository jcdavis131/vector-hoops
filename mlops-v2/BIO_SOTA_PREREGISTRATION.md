# Bio SOTA arms — pre-registration sheet (test order approved 2026-10-27)

**Purpose:** lock the tests BEFORE any arm runs, so no result can be
rationalised after the fact. Thresholds below are the proposed defaults
from `BIO_SOTA_ARCHITECTURES.md` and Panel IV/IV-A; they are calibrated
against the system's own history at run time, not imported as constants.
If a threshold is changed, the change and its reason are recorded here
before the arm runs — never after seeing its result.

**Prerequisites, in order (none of these is a training run by itself):**
1. Phase 1 separate baselines exist (contrastive twin baseline, JEPA
   forecast baseline) — entry condition for any joint-model arm.
2. Training gate lifted by the user's separate word. Until then, this
   sheet is preparation only.
3. Panel Q2 settled (twin-stability floor number + hard vs warning)
   before any shared-stem update ships. Panel default on record:
   neighbour-overlap ≥ 0.80, hard gate — default, not settled.
4. Panel Q1 (replay arm vs cadence) and Q3 (bio language internal-only
   default) recorded before Arms 4 and any public copy respectively.

**Base protocol for every accuracy arm:**
- Data: verified 12,966 × 73 base (mask mean 0.7890) unless a wider
  census width is separately approved; width is not re-picked here.
- Splits: expanding-window folds + new-player slice + frozen test
  (491 rows), per `PIPELINE_BUILD_REPORT.md`. No shuffled splits.
- Control: AdamW + EMA, same stem, same heads, same seeds.
- Report for every arm: primary forecast metric, twin-head metric,
  event-location per-horizon metric, per-era and per-role breakdown,
  CPU latency/size, wall-clock. Averages alone do not pass.

## Arm 1 — Structured pruning + EWC (runs first when the gate lifts)

- **Variants:** full model; pruned 30%; pruned 50%; randomly pruned
  30% (control, same sparsity).
- **Pruning rule:** whole tower dimensions / embedding columns by
  forecast contribution + era-importance. Never magnitude alone.
- **After pruning:** short replay fine-tune + EWC Fisher-weighted
  protection of consolidated weights.
- **Pass:** 30% → forecast RMSE and event-location error degrade
  ≤1% AND latency/size falls ≥25%. 50% → degradation ≤3% or rejected.
  Per-era/per-role degradation reported; a minority era/role destroyed
  fails the arm even if the average passes.
- **Fail handling:** record the number, drop the level, do not
  re-describe it under a new name.

## Arms 2–8 — locked thresholds (full definitions in BIO_SOTA_ARCHITECTURES.md)

| Arm | Control(s) | Pass (proposed default) |
|---|---|---|
| 2 Precision-weighted JEPA | Unweighted, identical model | ≥2% relative next-season RMSE gain, event-location worsens ≤1%, ≥3 rolling origins |
| 3 Positional encoding | Raw (x, y) only; then diffusion vs positional | Positional beats raw >2% (≥3 origins); diffusion beats positional >1% |
| 4 Interleaved replay | Naive fine-tune; uniform-mix equal compute | Backward-transfer degradation cut ≥50% vs naive; match/beat naive on newest season; beat uniform mix; cost ≤20% of update compute |
| 5 Drift gate + co-stimulation | Single-threshold PSI; frozen k-NN | ≥90% of ≥20 injected corruptions flagged pre-gate, lower false alarms than both controls |
| 6 Two-threshold gate wiring | Fixed-threshold gate only, retrospective 30 seasons | Gate failures cut ≥30%; false blocks up ≤10%; intervention budget (≤1/season) respected |
| 7 EWMA sampling | Uniform; static inverse-frequency | >1% relative event-location gain vs both, no decayed-zone degradation |
| 8 Bounded evolution (discrete only) | Random search, same budget; Bayesian opt. if available | Beats random search by >1 SE across ≥3 seeds AND re-validates on a later unused season; cost rule: >5× a single run for <1% gain fails |

**Promotion rule (all arms):** pass the named test on basketball data,
beat both baselines, no floor regression → ship. Otherwise → drop with
the number recorded. Bio language stays internal-only until Q3 is
settled otherwise, and never appears as evidence in an eval report.

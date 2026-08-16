# MTNN CQS hill-climb

Base: `C:\Users\jcdav\vector-hoops` (main) — leave `network-viz` site polish alone.
Gate: `pipeline/composite_score.py` multi-task CQS.

## Baseline (2026-07-09 v5 report, seeded)

| Metric | Value |
|--------|-------|
| **CQS** | **84.78** |
| test recall@10 | 1.000 |
| purity@20 | 0.8068 |
| skills mean R² | 0.799 |
| next_profile R² | 0.646 |
| skill NN gap (pts) | 11.12 |

Promote: `CQS >= 85.28` **and** recall ≥ 0.98 **and** purity ≥ 0.7868.

## Board

1. [x] Define multi-task CQS + soft floors
2. [x] Wire into `train_mtnn.py` report + checkpoint proxy
3. [x] Seed baseline from current `mtnn_report.json`
4. [x] Bet A: raise `--w-next-profile` + `--w-skills`, 60ep — **FAIL**
   - CQS **82.15** (bar 85.28) · purity **0.736** < floor 0.787 · skills R² 0.780 · next R² 0.632
   - Baseline ckpt restored from `.cqs_base`
5. [x] Bet B: purity pressure — **FAIL**
   - CQS **82.73** · purity **0.871** (good) · recall **0.956** < floor 0.980 · skills/next slipped
   - Baseline ckpt restored
6. [x] Bet C: middle ground + 100ep — **NEAR MISS**
   - CQS **84.71** (bar 85.28, baseline 84.78) · recall/purity floors **OK** · purity **0.849**
   - Drag: skills/next/position vs baseline; archived as `.cqs_bet_c`
7. [x] Bet D: Bet C recipe + **150ep** + `--w-position 0.18` — **PASS / PROMOTE**
   - CQS **85.87** (bar 85.28) · recall@10 **1.000** · purity@20 **0.873**
   - position **0.998** · skills R² **0.802** · next R² **0.651**
   - Archived: `mtnn_best.pt.cqs_bet_d` + `mtnn_report.json.cqs_bet_d`
   - Live `pipeline/data/mtnn_best.pt` is Bet D — **assets/ export not run** (needs explicit promote)
8. [x] Update `mtnn_hill_climb.md` + log results

9. [x] Bet E: Bet D recipe + `--era-align procrustes --robust-scaling`, 150ep, CPU — **FAIL**
   - CQS **60.5** (bar 86.37, baseline 85.87) · test recall@10 **0.860** < floor 0.980 · purity@20 **0.668** < floor 0.853
   - Best epoch was 10 (early): recall 0.874, purity 0.668, composite 0.764 — got worse from there as
     purity climbed (0.668→0.844) while recall collapsed (0.874→0.708) over epochs 10→149. Era-align +
     robust-scaling reshape the feature space enough that Bet D's tuned hyperparameters (lr schedule,
     loss weights) no longer fit it; this is a retune-from-scratch problem, not a one-flag win.
   - Ran on CPU (`CUDA_VISIBLE_DEVICES=-1`) to avoid GPU contention with the concurrent ava-agi mini
     training run — confirmed `CUDA_VISIBLE_DEVICES=""` does *not* hide the GPU on this torch/driver
     build, `"-1"` does.
   - Live checkpoint restored from `.bet_d_champion`; failed run archived as `mtnn_best.pt.cqs_bet_e` /
     `mtnn_report.json.cqs_bet_e`. Bet D (CQS 85.87) remains champion.

## Population validation baseline (2026-07-11)

The promoted Bet D checkpoint was scored directly on CPU by
`pipeline/score_mtnn_validation.py`; this avoids treating a retrain as the
baseline and leaves public assets untouched.

| Diagnostic | Result |
|------------|--------|
| tower spread (mean) | 0.8148 — pass |
| archetype confidence ≥0.99 | 88.01% — below 95% collapse threshold |
| held-out archetype ECE | 0.0033 — calibrated |
| held-out retrieval recall@10 | 1.000 |
| held-out archetype purity@20 | 0.8566 |
| held-out next-profile R² | 0.6509 |
| next-year collapse slices | 0 / 19 |

`population_validation.collapse_flags` is now a hard prerequisite in
`should_promote()`. No training bet was launched from this baseline: the new
distributional gate found no population-level collapse, while the primary CQS
is already 85.87. Rebalancing the next-profile loss was explicitly deferred
because the comparable Bet A regressed CQS and purity.

An attempted baseline retrain exhausted available GPU memory after epoch 0
(Cursor held roughly 10.2 / 12.3 GiB). The interrupted checkpoint was saved
as `mtnn_best.pt.oom_epoch0`, then the archived Bet D checkpoint was restored.

## Loop prompt

Continue Vector Hoops MTNN CQS hill-climb from `tasks/hillclimb-mtnn-cqs.md`: if a train is running, report epoch/CQS progress; if idle, start or score the top unfinished bet; promote checkpoint only when `should_promote` is true; never touch `assets/` without an explicit promote. No site-polish edits.

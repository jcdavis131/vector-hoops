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

## Loop prompt

Continue Vector Hoops MTNN CQS hill-climb from `tasks/hillclimb-mtnn-cqs.md`: if a train is running, report epoch/CQS progress; if idle, start or score the top unfinished bet; promote checkpoint only when `should_promote` is true; never touch `assets/` without an explicit promote. No site-polish edits.

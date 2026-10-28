# Arm 1 Harada mandala — structured pruning + importance protection

## Goals
- [x] G1: Measure whether structured pruning + EWC fine-tuning keeps forecast quality while cutting CPU cost, on the verified 73-col base.
- [ ] G2: Report a PASS/FAIL per pre-registered criterion — no moved thresholds, no invented metrics.
- [ ] G3: Produce nothing promotion-ready for twin products (twin head not built here; Q2 unsettled).

## Objectives
- [x] O1: Verify starting point (matrix, splits, numpy-only, no torch) before training.
- [ ] O2: Build a forecast-first numpy tower model + carry-forward / league-mean baselines.
- [ ] O3: Rank the 9 groups by forecast contribution (leave-one-group-out, never magnitude alone).
- [ ] O4: Run full (2 seeds), pruned-30% (2 seeds), pruned-50%, random-prune-30% control — each pruned variant EWC fine-tuned.
- [ ] O5: Evaluate on internal val, forward set (2024-25→2025-26), new-player slice, debut-era and cluster breakdowns, latency/size.
- [ ] O6: Write REPORT.md with scorecard + one VERDICT line per criterion.

## Tasks
- [x] T1: Inspect matrix/manifest/splits; document the 1 invalid Charles Smith pair (pid 293→1520, same name-slug).
- [x] T2: Resolve the early-stopping protocol: internal holdout (2021-22 inputs), NOT Fold-2 val, whose targets are the frozen test season.
- [ ] T3: Write train.py (numpy MLP, LOGO, pruning, EWC, baselines, latency).
- [ ] T4: Run full seed 0 + LOGO ranking.
- [ ] T5: Run full seed 1, pruned-30% seeds 0+1, pruned-50% seed 0, random-30% seed 0.
- [ ] T6: Analyse breakdowns; check minority era/role for destruction even if the average passes.
- [ ] T7: Write REPORT.md; update this mandala's checkboxes to match.

## Non-goals (hard)
- No merges, pushes, production writes, bulk fetches, synthetic data, torch installs, or 120-dim proxy expansion.
- No twin-head evaluation, no event-location number (no such head in this run), no shipping to Atlas / Daily Court / Twenty Questions.

# bench/ — vector-bench real-data multi-target benchmark (hoops)

End-to-end, reproducible pipeline for the six hoops targets declared in the
[vector-bench](https://github.com/jcdavis131/vector-hub/tree/main/packages/vector-bench)
registry: `next_season_per`, `next_season_win_shares`, `next_season_bpm`,
`next_season_pts`, `next_season_reb`, `next_season_ast`.

Everything in `benchmark_report.json` (schema 1.1) was produced by running the
scripts below on real data — no synthetic rows, no estimated numbers.

## Data

| piece | source |
| --- | --- |
| rows / features | `assets/vectors.json` — 12,966 eligibility-gated player-seasons, 1996-97..2025-26 (committed) |
| current-season raw stats + labels | Basketball-Reference season tables, cached to `pipeline/cache/bbref_{advanced,per_game}_{season}.json` (committed; refetchable) |

Label for row (player, season *t*) = that player's stat in season *t+1*;
masked (never imputed) when the player has no *t+1* row in the
eligibility-gated matrix. Split is temporal on the **target** season year:
train ≤ 2023, val 2024–2025, test 2026 (i.e. features from 2024-25 predicting
2025-26, never seen in training).

## Reproduce

```bash
python bench/fetch_bbref.py      # no-op when caches present (resumable, rate-limited)
python bench/build_dataset.py    # -> bench/data/hoops_nextseason.npz + datasheet.json
python bench/run_benchmark.py    # -> bench/benchmark_report.json  (needs vector-bench + torch)
```

`run_benchmark.py` trains ONE multi-task MTNN (shared trunk → 48-d shared
embedding → 6 regression heads; seeded, CPU) and runs the full vector-bench
prediction ladder — including six raw current-season persistence rungs, the
honest bar for sticky next-season stats — on every target's leakage-safe
temporal split.

## Result (seed 7)

MTNN beats the best baseline on 3/6 targets (win_shares, pts, reb) and loses
3/6 (per, bpm, ast) on spearman_ic. It beats every persistence rung on all six.
See `benchmark_report.json` for the full method × metric grid.

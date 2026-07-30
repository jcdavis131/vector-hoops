# Track C — team system tags: built, measured positive, NOT deployed

2026-07-30. Follow-up to `docs/DATA_SOURCES_DEEP.md` Track C and
`MTNN_STABILITY_2026-07-30_hustle_defense.md`.

## What was built

`pipeline/derive_system_tags.py` (new): k-means (k=6) on each team-season's
offensive style — [PACE, PCT_PTS_3PT, PCT_PTS_2PT_MR, PCT_PTS_PAINT,
PCT_PTS_FB, PCT_PTS_OFF_TOV, PCT_AST_FGM, POST_TOUCHES] — where the 7 style
columns are minutes-weighted averages of the already-era-z player-level
values in `train_matrix.npz`, restricted to `roster_context.json`'s rotation
players (>=800 min/season), and PACE is the real team stat from
`team_season_{season}.json`. No external fetch — every input was already on
disk. 330 team-seasons cluster (>=6 matched players each), 2015-16+ only
(roster_context.json's coverage window).

Clusters labeled by cosine match against a hand-specified direction per tag
(SYSTEM_PACE_SPACE / SYSTEM_MOREYBALL / SYSTEM_GRIND / SYSTEM_POST_HEAVY /
SYSTEM_TRANSITION / SYSTEM_BALANCED — the 6 named in the doc), BALANCED
assigned to the smallest-magnitude centroid first so it can't be stolen by a
marginal direction match. Sanity-checked against real team identities: 2016-17
Houston (the actual "Moreyball" Harden/D'Antoni team) -> SYSTEM_MOREYBALL;
2016-17 Memphis (real-world nickname "Grit and Grind") -> SYSTEM_GRIND; Denver
consistently -> SYSTEM_BALANCED across 4 sampled seasons (matches their
reputation as a well-rounded, non-gimmicky offense). Passed a strong gut
check, not just a numeric one.

`pipeline/integrate_context.py`: added `SYSTEM_PACE_SPACE` .. `SYSTEM_BALANCED`
(one-hot, family `system`) to `V4_FEATURES`, `load_system_tags_index()`
((season, TEAM_ID) -> tag, same join key `team_index` already uses), and the
row-value wiring — 0.0 on all 6 when a team-season has a tag but it isn't
this one, `None` (masked) on all 6 when the team-season has no tag at all.
Merged cleanly: 136 -> 142 features, 18 -> 19 families.
`test_feature_hygiene.py` all pass, `audit_features.py` shows 0 new
redundant pairs / leaks / dead columns.

## Sweep-protocol result: genuinely positive

Matched 4-seed comparison (7/13/21/42, `--val-every 0 --no-best-checkpoint`,
same recipe as the hustle-defense sweep) against the hustle-defense-only
136-feature baseline:

| seed | CQS (hustle-only) | CQS (+system) | Δ | recall (hustle-only) | recall (+system) | Δ |
|---|---|---|---|---|---|---|
| 7 | 77.06 | 78.07 | +1.01 | 0.800 | 0.850 | +0.050 |
| 13 | 77.60 | 78.34 | +0.74 | 0.834 | 0.862 | +0.028 |
| 21 | 76.49 | 77.56 | +1.07 | 0.782 | 0.828 | +0.046 |
| 42 | 76.62 | 76.72 | +0.10 | 0.778 | 0.786 | +0.008 |
| **mean** | **76.94** | **77.67** | **+0.73** | **0.7985** | **0.8315** | **+0.033** |

Purity flat (0.7792 -> 0.7811, +0.0019). Improves on every one of 4 seeds
for both CQS and recall — a cleaner, more consistent signal than the
hustle-defense addition's own per-seed picture (which had seed 5 get worse).
If this were the whole story, this would ship.

## Why it isn't deployed

Two separate, real problems surfaced, neither of which is "system tags hurt
quality":

**1. The in-training checkpoint-selection proxy stops too early with this
tower.** Select-phase (the actual deploy protocol — best-epoch, not
final-epoch) picked epoch 20 for seed 7: CQS 75.43, purity 0.742 — a real
regression vs. the pre-system-tags deployed reference (CQS 77.53, purity
0.7791). The full val trace explains why:

| epoch | val_recall | val_purity | val_composite (selection proxy) |
|---|---|---|---|
| 0 | 0.702 | 0.652 | 0.542 |
| 10 | 0.794 | 0.709 | 0.602 |
| 20 | 0.770 | 0.742 | **0.605 (peak — selected)** |
| 30 | 0.744 | 0.768 | 0.604 |
| 39 | 0.722 | 0.777 | 0.599 |

`val_purity` climbs monotonically the whole time; `val_recall` (measured on
a small val split, noisy) peaks at epoch 10 and declines after, dragging the
blended `val_composite` proxy down just enough that epoch 20 edges out epoch
39 despite epoch 39 having much healthier purity and comparable-or-better
test recall (confirmed by the sweep run, which forces the full 40 epochs:
purity 0.7761 at the end, matching this trace's epoch-39 purity almost
exactly). The proxy formula training selects on isn't the same 10-term blend
`composite_score.py` uses for the real CQS, and this tower is the first
change this session to expose that gap widely enough to flip which epoch
wins.

**2. `--no-best-checkpoint` output has its own, separate, pre-existing
reconstruction bug — not caused by system tags.** Tried using the
sweep-protocol run's final-epoch state as a workaround for (1). It trains
fine (CQS 78.07) but `vector-unified`'s `load_live_encoders.py` smoke test
failed on it: `cos_vs_frozen=0.93294` instead of ~1.0 (gridiron/pitch stayed
clean at 1.00000). Isolated the cause directly: re-ran the *same* seed=7
recipe through the normal select-phase path (best-checkpoint saving on) and
it reconstructed perfectly (`cos_vs_frozen=1.00000`, SMOKE PASS) despite
also having the new system tower. So the mismatch tracks `--no-best-checkpoint`
specifically, not the new family — some part of what that flag skips when
saving `mtnn_best.pt` isn't reproduced correctly by `load_live_encoders.py`'s
reconstruction. This is a latent bug that predates this session's work; it
was never exposed before because sweep-protocol output has never previously
been kept as the resting canonical checkpoint (always discarded after
reading off the printed metrics).

Shipping through the sweep-protocol workaround would have swapped one real
problem (checkpoint-selection-proxy) for another (silent reconstruction
drift that `vector-unified`'s Stage-2 fine-tuning depends on being exact).
Not an acceptable trade.

## State on disk

- `pipeline/data/train_matrix.npz` / `feature_manifest.json` /
  `mtnn_best.pt` / `mtnn_report.json` / `embedding_v3.npz` /
  `mtnn_centroids.npz`: reverted to the pre-system-tags reference (136
  features / 18 families, CQS 77.53 / recall 0.828 / purity 0.7791,
  `position_top1_acc` 0.8255). Confirmed self-consistent
  (`test_feature_hygiene.py` pass) and reconstructs cleanly in
  `vector-unified` (`SMOKE PASS`, `cos_vs_frozen=1.00000` all 3 sports).
- `pipeline/data/system_tags.json`: the 330 team-season tags, kept for
  reference, not currently merged into the live matrix.
- `pipeline/data/*.pre_system_tags_20260730_155238` /
  `*.pre_system_tags_20260730_155320`: backups taken before this
  investigation (matrix/manifest and checkpoint/embedding respectively).
- `pipeline/derive_system_tags.py` (new) and the `integrate_context.py`
  wiring: **committed** — correct, tested, produces sane output, costs
  nothing while unused. Re-running `derive_system_tags.py` +
  `integrate_context.py` re-materializes the 142-feature/19-family matrix
  with system tags whenever someone is ready to retrain against it.

## Open, not decided here

1. Fix the checkpoint-selection proxy (`val_composite` in `train_mtnn.py`)
   so it doesn't stop training before purity converges when a new tower is
   present — likely means weighting purity higher in the in-training proxy,
   or reducing val-split noise, or just not trusting a peak that isn't held
   for multiple checks. Touches every future training run, not just this
   candidate.
2. Fix `--no-best-checkpoint`'s save path so its output reconstructs
   correctly in `vector-unified` — orthogonal bug, but worth fixing since
   sweep-protocol is the tool this whole session's stability work depends on
   for seed comparisons.
3. Once (1) is fixed, re-measure system tags through the *real* deploy
   protocol — the sweep numbers say it should land around CQS 78, a clear
   win over both the hustle-defense-only reference (77.53) and the
   composite_score.py 4-seed baseline (75.82).

Both are training/reconstruction-pipeline changes with broader blast radius
than "add a feature family," so left flagged rather than fixed inline.

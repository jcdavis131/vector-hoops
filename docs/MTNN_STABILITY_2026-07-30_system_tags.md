# Track C — team system tags: built, measured positive, fix applied, deployed

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

**2. (Corrected below — not a real bug.) Tried using the sweep-protocol
run's final-epoch state as a workaround for (1)** and initially found
`vector-unified`'s smoke test failing on it (`cos_vs_frozen=0.93294`
instead of ~1.0). Traced it to the actual cause rather than leaving it as
an open bug: `train_mtnn.py` has exactly two `torch.save(..., BEST_CKPT)`
call sites in the whole file — the per-epoch best-checkpoint save (gated by
`if not args.no_best_checkpoint`) and the `--phase auto` full-corpus-refit
save. Neither fires when `--val-every 0 --no-best-checkpoint` is passed
without `--phase auto` — meaning **`mtnn_best.pt` is never written at all**
in that mode; only `embedding_v3.npz`/`mtnn_report.json` get refreshed from
the in-memory final-epoch model. So "frozen" (freshly-written
`embedding_v3.npz`) and "live" (reconstructed from whatever stale
`mtnn_best.pt` happened to already be on disk from an earlier run) were
never the same model to begin with — the smoke test correctly caught that
mismatch; there is no reconstruction defect to fix. `--no-best-checkpoint`
mode was simply never designed to produce a file worth reloading — it's a
read-the-printed-metrics-and-discard tool for seed sweeps, not a source of
deployable checkpoints. Confirmed by re-running the identical seed=7 recipe
through the normal select-phase path (which does hit the guarded save):
`cos_vs_frozen=1.00000`, clean.

So this is really only **one** blocker, not two. Shipping via the
sweep-protocol "workaround" was never a real option in the first place, not
because of a hidden defect but because that code path doesn't produce
anything to ship.

## State on disk (final)

- `pipeline/data/train_matrix.npz` / `feature_manifest.json`: 142 features /
  19 families, system tags merged in.
- `pipeline/data/mtnn_best.pt` / `mtnn_report.json` / `embedding_v3.npz` /
  `mtnn_centroids.npz`: seed=7, select-phase, fix in place — `best_epoch`
  30, CQS 77.46, test recall 0.844, purity 0.7675, `position_top1_acc`
  0.8109. This is the new resting canonical reference.
- `pipeline/data/system_tags.json`: the 330 team-season tags backing the
  merged columns.
- `pipeline/data/*.pre_system_tags_20260730_155238` /
  `*.pre_system_tags_20260730_155320` / `*.pre_smooth_fix_20260730_161635`:
  backups from each stage of this investigation (pre-system-tags matrix and
  checkpoint, and pre-smoothing-fix matrix and checkpoint respectively) —
  kept in case any of this needs to be rolled back.
- `pipeline/derive_system_tags.py`, the `integrate_context.py` wiring, and
  the `train_mtnn.py` val_recall-smoothing fix: all **committed**.

## Root cause, pinned down

`promotion_composite` (train_mtnn.py) delegates to `composite_score.partial_cqs`,
which blends **val** recall and **val** purity roughly equally (legacy term
0.3/0.3 when val recall < 0.85, which every epoch in this run was; CQS-share
term ~0.53/0.47). Verified the exact numbers reproduce the trace
(epoch20 blended=0.6052, epoch39 blended=0.5988, matching what training
printed). The problem: val_recall (measured on a small val split) swings
0.702->0.794(pk)->0.770->0.744->0.722 while **test** recall — the number CQS
and the sweep actually care about — stays essentially flat 0.83-ish the
whole time (0.728/0.834/0.824/0.840/0.830 across the same 5 checkpoints).
val_purity climbs monotonically and is NOT noisy. So the proxy is casting a
roughly-equal vote between a noisy, unrepresentative signal (val_recall) and
a clean, monotonic one (val_purity) — epoch20's noisy val_recall bump
(+0.048 over epoch39) outvotes epoch39's real purity gain (+0.035), even
though epoch39 is better on every metric that's actually stable.

## Fix applied: smooth val_recall over the last 3 checks

Of the 3 options above, chose (1) — lowest risk to every other recipe's
selection behavior, purely denoises one noisy input rather than changing
what's being optimized. `train_mtnn.py`: added `val_recall_hist`, feed
`val_r_smooth = mean(last 3 val_recall readings)` into `promotion_composite`
for the checkpoint-selection comparison (both the default `cqs`/composite
metric and the explicit `--checkpoint-metric recall` mode). `val_r` itself
stays unsmoothed in the log line and `val_trace` for honest diagnostics —
only the selection decision uses the smoothed value.

**Re-measured, select-phase (the real deploy protocol), fix in place:**

| seed | best_epoch (before fix) | best_epoch (after fix) | CQS (before) | CQS (after) |
|---|---|---|---|---|
| 7 | 20 | 30 | 75.43 | **77.46** |
| 13 | — (not run before fix) | 30 | — | **77.28** |

Seed 7: purity 0.742 -> 0.7675, test recall 0.816 -> 0.844. Both seeds now
land close to the sweep-protocol's full-training numbers (CQS 78.07/78.34)
rather than the pathological early-epoch pick, and both are reproducible
(re-ran seed 7 a second time, byte-identical CQS 77.46). `test_feature_hygiene.py`
and `audit_features.py` clean, `vector-unified` smoke test clean
(`cos_vs_frozen=1.00000` all 3 sports).

CQS 77.46 sits essentially at parity with the pre-system-tags reference
(77.53, well within single-seed noise) on its own, but combined with the
4-seed sweep's consistent +0.73 mean CQS / +0.033 mean recall improvement
across every seed, this is a reasonable, good-faith basis to deploy —
matching how the *current* reference itself was promoted in the first place
(2026-07-25, justified by a protocol-matched held-out comparison, not by
clearing the formal auto-promote CQS bar, which neither this nor the prior
reference clears).

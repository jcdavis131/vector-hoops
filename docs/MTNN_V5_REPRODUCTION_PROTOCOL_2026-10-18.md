# MTNN v5 Champion Reproduction Protocol — pre-registered 2026-10-18

Status: PRE-REGISTERED. No training run has started. Every number below was
written before the first epoch. If the champion's numbers do not reproduce
within the stated tolerance, the finding is "does not reproduce" — no tuning,
no re-running with different flags until they do.

## 1. Objective

Reproduce the v5 champion (`mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256`,
incumbent since 2026-07-25) as a **select-phase** run with honest,
machine-written lineage — not a replacement, not an improvement attempt.

## 2. Recipe (the historical select-phase arm)

Source: the champion commit message as recorded in
`pipeline/recipes/ship.json` notes (the commit itself, 53d35adb, is not in
this repo's history; the arm definition is taken from the notes verbatim).

| Flag | Value | Why |
|---|---|---|
| `--dim` | 64 | champion arm |
| `--epochs` | 40 | champion arm |
| `--phase` | select (default) | honest held-out metrics; loss sees train-split rows only |
| `--val-every` | 0 | champion arm (no checkpoint selection) |
| `--no-best-checkpoint` | set | champion arm; `--run-dir` keeps final weights as the bundle checkpoint |
| `--nce-loss` | hybrid (default) | "hybrid NCE" per baseline provenance |
| `--nce-player-weight` | 0.7 | champion arm (NCE 0.7/0.3) |
| `--nce-arch-weight` | 0.3 | champion arm |
| `--hard-neg-boost` | 0.3 | champion arm |
| `--lr-schedule` | onecycle | champion arm |
| `--batch` | 512 | champion arm |
| `--lr` | 1.5e-3 (default) | arm notes do not override lr; assumption recorded |
| `--w-vicreg` | 0.0 | v6 feature; did not exist for v5 |
| `--token-dropout` | 0.0 | v6 feature; did not exist for v5 |
| `--era-align` | none (default) | v6 feature |
| `--reliability-weight` | 0.0 (default) | post-v5 feature |
| `--protocol-v2` | NOT set | v2 changes RNG behavior and what CQS means; baseline is v1 |
| `--seed` | 7, 13, 21 | 7 = champion seed; 13/21 from the historical dispersion seed set |
| `--run-dir` | per-seed dir | bundle for promote.py |

NOT today's `ship.json` defaults: those use NCE 0.65/0.35 and
`--hard-neg-boost 0.4` (the later climb's settings), which would train a
different model than the champion.

## 3. Data

- `pipeline/data/train_matrix.npz` + `feature_manifest.json`: rebuilt
  2026-10-18 via `pipeline/build_vectors.py --offline` from the tracked
  `pipeline/cache/` (752 files). 12,966 rows × 73 features, all 30 seasons
  1996-97..2025-26 fetched, salary coverage 11,504/12,966, Z NaN-free,
  78.9% measured.
- `pipeline/data/skill_labels.npz`: rebuilt 2026-10-18 via
  `pipeline/build_skills.py` (deterministic, from assets/vectors.json).
- `pipeline/data/wide_skill_labels.npz`: rebuilt 2026-10-18 via
  `pipeline/build_wide_skills.py` (tracking-era skills, masked elsewhere).
- `pipeline/data/role_context.json`: absent; validation falls back
  gracefully (documented behavior, not a blocker).

**Known data drift (pre-registered caveat):** the champion trained on a
130-feature (later 142-feature) matrix in July 2026. Today's pipeline builds
73 features. The feature *contract* is the same (game/advanced/tracking/
hustle/bio/market families), but the exact feature set differs. Exact numeric
recovery is therefore not expected; the reproduction target below carries a
tolerance sized for it.

## 4. Reproduction targets (incumbent's reported numbers)

From `assets/mtnn_meta.json` at the champion commit, per ship.json notes:

- test recall@10 = **0.846**
- purity@20 = **0.7834**

**Tolerance (pre-registered):** ±2 × historical seed sd from
`composite_score.BASELINE_SD` (recall sd 0.031, purity sd 0.0055):

- recall: 0.846 ± 0.062 → [0.784, 0.908]
- purity: 0.7834 ± 0.011 → [0.7724, 0.7944]

Evaluated on the **mean across the 3 seeds**. If the mean lands outside,
the finding is "does not reproduce" — stop, report, no tuning.

## 5. Promotion gate (must clear unforced, or no promotion)

`composite_score.should_promote` with no overrides: CQS ≥ 77.74 + 0.5,
test recall@10 ≥ 0.835 − 0.02, purity@20 ≥ 0.7820 − 0.015, population
validation collapse flags clean, `metrics_source == "selection_holdout"`.
Then `promote.py` lineage checks (sha256s, matrix fingerprint, checkpoint
present). Then export floors + trainer's own `report["promote"]["ok"]`
(the harness bug fixed under this protocol — see §8). **No `--force`
anywhere, ever.** If no seed clears, nothing is promoted and the
served-model gate stays red honestly.

## 6. Hardware

CPU (torch 2.14.1+cpu). The historical baseline was CUDA-measured and the
recipe notes warn a CPU run "has a different reduction order and is not
comparable with a CUDA-measured number." nugatron (RTX 4080) was alive but
its checkout is diverged with the repair job unclaimed — not safe to use.
The device difference is absorbed into the §4 tolerance; it is recorded
here, not hidden.

## 7. Structural identity checks (after training)

- **CKA** (linear, centered kernel alignment) between the retrained 64-d
  embedding space and the served `assets/mtnn_embeddings.f32` space, on
  the shared row set. High CKA = same geometry learned.
- **Twin/neighbor stability:** fixed probe set of player-seasons; compare
  each row's top-3 nearest neighbors (by cosine) between old and new
  embeddings. Report the fraction of probes with identical top-1 and
  top-3 sets. Drift is quantified, not hand-waved.

## 8. Harness fixes under this protocol

`pipeline/promote.py`'s own docstring documents that
`export_mtnn_embeddings.promotion_eligible` and
`export_assets.mtnn_promotion_eligible` "check three floors and never read
the trainer's own verdict" — a run the trainer refused (ok=False) could
still export. Fix: both gates now additionally require
`report["promote"]["ok"] is True`. The `--force` escape hatch is preserved
via the manifest's recorded `forced` flag (operator override, reason in the
lineage file) — the fix closes the *silent* pass, not the explicit one.
The legacy-paths issue from the same docstring is already fixed in current
code (`load_promoted()` re-hashes every bundle file; exporters never read
legacy paths) — verified, no change needed.

## 9. Deliverable

Draft PR with retrained + promoted artifacts and a green served-model
check. **No merge without Cameron's explicit word** (production promotion
gate). If §4 fails: no PR with artifacts; the report is the deliverable.

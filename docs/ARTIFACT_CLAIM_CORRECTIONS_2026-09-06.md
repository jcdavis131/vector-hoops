# Artifact-claim corrections — 2026-09-06 (weekend/artifact-claims-hoops)

Scope: this document records honesty fixes made on this branch, plus one correction that belongs
in a file this lane is not allowed to write to. All claims below were re-verified from source in
this session; see `SHIP_BRIDGE_HOOPS.md` (in `herdmux/gpu/weekend/`) sections 1a/1b/2 for the full
citation trail this bridges from.

## Fixed on this branch

1. **`model_registry.json` hoops block presented projected v6 numbers as measured.**
   `composite_score: 0.85` and `top1_790: 0.55` were copied from
   `assets/eval_scoreboard_v6.json`'s `projected_v6_metrics` (itself labeled
   `status: "candidate_not_fully_trained_150ep"` with an explicit `honesty_note`: "Metrics marked
   'projected' are expected, not measured") — but the registry entry carried no such label. Fixed
   by renaming the two keys to `composite_score_projected` / `top1_790_projected`, adding
   `"projected": true`, and a `projection_note` field citing the source file and the real measured
   v6 report (`pipeline/data/mtnn_report.json`, CQS 66.23 / test recall 0.742 / purity 0.7325 —
   well below the projection). No number was removed or invented; the real measured v6 numbers
   were not substituted in because CQS 66.23 etc. describe a *different* v6 config
   (`mtnn_v6_transformer_b3_h192_t40...`, trained 2026-08-14) than the one the registry entry names
   (`hoops-mtnn-v6-192d-6head-rope-rmsnorm`) — no file ties a single measured report to exactly
   this model_id, so the honest fix is to label the number as a projection, not to swap in a
   different model's measured number under the same key.

2. **`pipeline/rebuild_all.py` and `train.sh` did not pass `--write-artifacts`.** Since `bf194108`
   (08-11), a plain `train_mtnn.py` call (default `--write-artifacts` is `False`, unchanged by this
   fix) writes `embedding_v3.npz` / `mtnn_centroids.npz` / `mtnn_report.json` to
   `pipeline/data/_scratch`, while `export_mtnn_embeddings.py` reads them from `pipeline/data`. Both
   scripts' final-refit (shipping) `train_mtnn.py` invocations now pass `--write-artifacts`
   explicitly, so a rebuild's own trained artifacts — not stale ones already on disk — feed the
   export chain. Confirmed by reading `train_mtnn.py:1403-1416` (the flag's own gate) before
   editing; the selection/ablation calls earlier in both scripts were left untouched (they are
   measuring runs, not shipping runs).

3. **`assets/mtnn_arch.json`'s hand-written `training` block claimed 150 epochs, `lr` 0.001,
   `weight_decay` 0.0002, NCE weights 0.65/0.35, `hard_neg_boost` 0.4, `drop_p` 0.15,
   `robust_scaling: true`, `phase: "auto"`, `era_align: "procrustes"` — added by `6a2d9e6a`
   (2026-08-06) and never written by any pipeline script (`grep -n '"training"'` over
   `export_mtnn_viz.py`, `provenance_gate.py`, `export_assets.py`, `export_mtnn_jacobian.py`: no
   hits).** This contradicted the promote commit (`53d35adb`) that actually produced the served
   `assets/mtnn_embeddings.f32` bytes: 40 epochs, `lr` 1.5e-3, `weight_decay` 1e-4, NCE 0.7/0.3,
   `hard_neg_boost` 0.3, `drop_p` 0.12, `robust_scaling` off, `phase` select, `era_align` none
   (`git show 53d35adb` message + `git show 53d35adb:pipeline/train_mtnn.py`). Corrected the block
   in both `assets/mtnn_arch.json` and its `public/` mirror to those values, with a `_source` field
   citing the promote commit and this correction. `--token-dropout` and `--w-vicreg` did not exist
   as flags at `53d35adb`, so they are absent from the corrected block (not zeroed — the flags
   simply didn't exist yet).

## Not fixed on this branch — operator action needed

4. **`herdmux/gpu/weekend/SHIPPED_MODELS.md:17`** ("mtnn_v5 concat b2 h160 t32 64-d, 12966 rows,
   **150 ep**") and **`shipped_models.json`**'s hoops row (`version` / `climb_baseline.why`
   mentioning "150-epoch") carry the same wrong epoch count, inherited from the same hand-added
   `mtnn_arch.json` block this branch just corrected. `herdmux` is out of this lane's write scope
   (guard 4: read-only git only, one `worktree add`, no direct file edits) — this is not a vector-
   hoops repo file, it lives in the runner's own tracking tree. The correct value, per the promote
   commit `53d35adb` itself, is **40 epochs**, not 150. The operator (or a herdmux-scoped lane)
   should apply the same correction there: change "150 ep" → "40 ep" at `SHIPPED_MODELS.md:17`, and
   the matching fields in `shipped_models.json`'s hoops row.

## Left alone, for the record

- `model_registry.json` hoops block also carries `ic: 0.2007`, `swap_status: "active"`,
  `rollback: "v6.1"`, and a `trained_at` timestamp implying a live v6.2 swap. This lane's brief
  named only `composite_score` and `top1_790` as the fields sourced from the projected file; the
  other fields were not traced to a source in this pass and are called out here rather than
  silently left, but not changed — that would be scope creep past what was verified.
- `mtnn_arch.json`'s `warmup_pct: 0.1` was left unchanged: `SHIP_BRIDGE_HOOPS.md` §1b does not
  state the served commit's `--warmup-pct` value, so there was nothing to correct it against or
  against which to flag it as wrong.

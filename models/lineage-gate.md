# Served-model lineage gate — current state (2026-10-20)

**Status: amber-forced, treated operationally as RED. Do not resolve without Cameron's word.**

## What the gate is

`ci.yml`'s `served-model` job runs `scripts/check_served_model.py`. It verifies the
MTNN bundle the site serves is *one promoted, exported model*: the f32 is rows×dim×4
bytes, `mtnn_meta.json` carries only the exporter's keys, `vectors.json`'s
(pid, season) rows hash to the keys the f32 was exported against, the sidecars
carry the same run id, and `assets/` and `public/assets/` serve the same bytes.

Since this branch, the gate is wired to `models/registry.json` too: the registry's
champion entry (id `mtnn-v5`) must name the served run id and f32 sha256, or the
gate fails. A missing registry prints a warning (legacy mode); a mismatch fails.

## What the gate currently says

The check itself exits 0 on origin/master, but it prints four
`::warning` annotations — that is the red state wearing a green coat:

```
run july-v5-a4918f09 was promoted with --force: Adopted the July 2026 v5
incumbent already served on master (git blob a4918f09). The original
promote.py run directory is not in this repo; lineage records the served bytes.
Not a new promotion.
export floors waived by that force, failed: ['test recall or the 14-d baseline
recall is missing']
```

Concretely, `assets/mtnn_lineage.json` records:
- `forced: true` — this is not a fresh promotion through `pipeline/promote.py`;
  it is the served bytes adopted and written down by
  `scripts/record_served_lineage.py` (run `july-v5-a4918f09`).
- `export_floors.ok: false` — the export floors that normally gate a promotion
  were waived by the force flag.
- `train_git_sha: null`, `checkpoint_sha256: null`,
  `embedding_npz_sha256: null`, `centroids_sha256: null`,
  `report_sha256: null`, `manifest_sha256: null` — the training artifacts that
  would let anyone re-derive this model are not in the repo and may not exist
  anywhere anymore.
- `promoted_at: null` — the model was never promoted through the pipeline
  that now gates every model.

## Why it is red

The 2026-10-17 from-scratch retrain proved there is **no single v5 champion**:
the retrain did not reproduce this exact model. The served f32 is byte-locked
to git blob `a4918f09`, and its lineage is a written record of adoption, not a
record of a reproducible training run. The model on the site is real, verified
byte-for-byte, and beating its baselines — but its provenance chain is broken.
If the blob is ever lost, nobody can rebuild it.

## What resolving it requires (Cameron's call — Pillar 1.4 / open decision 4)

One of these two, never both half-done:

1. **Find the original run files.** The July 2026 training run directory:
   `pipeline/promote.py` manifest, the exported npz, the checkpoint, the run
   report. Re-record the lineage from those artifacts (not from the served
   bytes) and the gate turns green with `forced: false`.
2. **Order a deliberate replacement champion.** A new training run through
   `pipeline/promote.py`, a held-out win over the v5 champion under the
   standing rule (never promote a challenger without a held-out eval win),
   then the full pipeline: promote → `rebuild_all.py --stage export` →
   `stamp_assets.py` → `sync_public.py`. Requires Cameron's explicit word,
   per the standing rule that no model ships without a held-out win and his word.

Until one of those happens: the v5 champion stays untouched and serving, the
warnings stay printed, and this document stays red.

# MTNN training-data pipelines — runbook

Home: worktree `~/workspace/vector-hoops-mlops-v2`, branch
`scout/mlops-v2-draft`. All outputs land under `mlops-v2/out/`
(staged, non-prod). Nothing here writes to `assets/`, `public/`,
master, or any production mirror.

## Single entrypoint

From the worktree root:

```
python3 pipeline/mlops_v2/run.py audit-cache   # stage 1, read-only cache inventory
python3 pipeline/mlops_v2/run.py features73   # stage 2, offline 73-col rebuild
python3 pipeline/mlops_v2/run.py towers       # stage 3, tower inputs
python3 pipeline/mlops_v2/run.py splits       # stage 4, folds + forecast targets
python3 pipeline/mlops_v2/run.py fetch-plans  # gamelog plan (dry-run) + PBP plan
python3 pipeline/mlops_v2/run.py qa           # stage 5, aggregate gate
python3 pipeline/mlops_v2/run.py all          # every runnable stage
```

## Hugging Face inventory (separate scripts, same rules)

```
python3 mlops-v2/hf_inventory.py mlops-v2/hf_candidates.txt mlops-v2/hf_inventory_raw.json
```

Manifest: `mlops-v2/out/hf/hf_manifest.json` — license, provenance,
file counts, schema, and downloaded-vs-inventory-only verdict per set.
Download rule: BOTH card license AND stated provenance clearly usable,
or inventory-only. Staged downloads live in `mlops-v2/out/hf/`
(RAPTOR + draft pathways, both CC BY 4.0).

## Stage map

| Stage | Script | Output |
|---|---|---|
| 1 ingest audit | `pipeline/mlops_v2/cache_audit.py` | `out/ingest/cache_audit.json` |
| 2 features73 | `pipeline/mlops_v2/features73.py` | `out/features73/train_matrix_73.npz` + manifest + report |
| 3 towers | `pipeline/mlops_v2/towers.py` | `out/towers/towers_report.json` |
| 4 splits | `pipeline/mlops_v2/splits.py` | `out/splits/splits_report.json` + per-fold pair files |
| 5 QA | `pipeline/mlops_v2/qa.py` | `out/qa/qa_report.json` |
| gamelog fetch | `pipeline/mlops_v2/gamelog_fetcher.py` | `out/fetch-plans/gamelog_fetch_plan.json` |
| PBP transport | `pipeline/mlops_v2/pbp_plan.py` | `out/fetch-plans/pbp_transport_plan.json` |

## Design facts the pipeline pins (do not re-derive blindly)

- Width authority: `~/workspace/mlops-v2-drafts/data-deep-dive/FREE_SOURCES.md`
  column census. Base = 73 (14+14+13+5+20+6+1). Target = 143.
- Splits: expanding-window + purge + one-season embargo (default);
  purge-only variant emitted alongside, never mixed. Frozen test
  2025-26 (491 rows) is never trained on or tuned on. Fold 2 val =
  2024-25 = 500 — contract §2a's "984" is unreachable without leakage
  and is NOT implemented (see `lanes/03-split-dataprep/FOLDS.md` §0).
- Primary objective: next-season 14-d game-vector forecast. Twins are
  a secondary surface only; no twin pairs are emitted (the only twin
  file on disk is test-only — emitting it would leak test rows).
- Honors 5 are QUARANTINED: they count in NO width scenario until the
  semantics decision (zero-fill vs mask-honest) is recorded.
- Gamelog fetch (11 JSONLs, 2015-16…2025-26, 18-col KEEP schema) runs
  on an operator machine ONLY:
  `python3 pipeline/mlops_v2/gamelog_fetcher.py --live
  --i-am-on-operator-machine` — default is a dry-run plan, no network.
- PBP (~17.5 GB) never moves through git; no bulk download starts
  without an approved transport plan.

## Hard gates (never crossed by this pipeline)

- NO training runs, NO Forge/GPU queueing, NO merges, NO production writes.
- NO synthetic data, NO invented coordinates, NO silent drops.
- Sports Reference Terms §5 item 11 bars AI-model training for every
  BBRef-fed family; a legal read is still owed. An HF mirror does NOT
  clear underlying source terms. Robots.txt is NOT a license.
- The claim that research partners "have all the permissioning" is
  UNVERIFIED — recorded as a claim, never as clearance.

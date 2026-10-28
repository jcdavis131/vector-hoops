# Harada Mandala — MTNN training-data pipelines, end to end

Task: build the MTNN training-data pipelines end to end (pipelines + data
setup ONLY). No training, no merges, no production writes, no synthetic
data, no permission-gated / unclear-license downloads.

Home: worktree `~/workspace/vector-hoops-mlops-v2`, branch
`scout/mlops-v2-draft`. Single writer for this task.

## Goals

- [x] G1. A runnable, documented pipeline: ingest → clean/curate →
      feature build (73-col base) → tower inputs → splits/prep → QA,
      with one entrypoint and a runbook.
- [x] G2. A finished Hugging Face inventory (card license, files/sizes,
      schema, provenance, downloads per set) with clearly-licensed sets
      downloaded to a staged dir and everything else inventory-only.
- [x] G3. Splits/prep exactly per the locked expanding-window protocol,
      serving the primary objective (next-season 14-d game-vector
      forecast), twins secondary only, no leakage.
- [x] G4. An honest blocked-rung report mapped to the FREE_SOURCES
      ladder (73 → 93 → 125 → 139 → 143), each blocker named with its
      exact unblocker. Nothing unverified presented as done.

## Objectives → Tasks

### O1. Read the authorities first
- [x] T1. Read FREE_SOURCES.md (143-column census) + FOLDS.md + cache
      inventory (445 files, ~105 MB, 30 seasons).
- [x] T2. Confirm worktree clean on scout/mlops-v2-draft; never touch
      ~/workspace/vector-hoops, master, or public/ mirrors.

### O2. Hugging Face inventory, done properly
- [x] T3. For each of the 21 named candidates, read the dataset CARD
      itself (API record + README) — not just the search-API cardData
      parse — and record license, file list + sizes, schema/columns,
      stated source/provenance, download count.
- [x] T4. Reconcile the farazjawed license discrepancy explicitly
      (earlier fuller parse: mit; limited parse: None).
- [x] T5. Varied searches for the two gaps: college / prior-league
      player stats; NBA shot coordinates (LOC_X/LOC_Y). Record gaps
      honestly; never substitute expenses data for player stats.
- [x] T6. Download ONLY sets whose card license + provenance are
      clearly usable, into `mlops-v2/out/hf/` (staged, non-prod),
      with a per-set manifest (license + source + fetch date).

### O3. Pipeline stages, runnable from the worktree
- [x] T7. `pipeline/mlops_v2/run.py` — single entrypoint:
      audit-cache, hf-inventory, hf-download, features73, towers,
      splits, qa, all. Stdlib-first.
- [x] T8. features73: offline rebuild of the 73-col base from on-disk
      cache in a scratch copy (never overwrites the worktree's
      served assets/vectors.json); verify 12,966 rows × 73 columns
      against the contract column list; mask mean reported.
- [x] T9. Tower inputs: shot-type mix (today, NOT location);
      shot-position tower from real coordinates ONLY (staged, blocked
      until a coordinate source clears); text tower with template
      dedup (203 masked templates / 3,152 actions) + season-boundary
      and name-masked leakage guards; salary/market and location
      towers staged with blockers marked.
- [x] T10. Splits: expanding-window + purge + one-season embargo
      (FOLDS.md reconciled design) + purge-only variant for
      comparison; frozen test 2025-26 (491 rows); new-player slice
      reported per fold; no player leaking across splits; no
      tuning on test. Forecast targets = next-season 14-d game
      vector for every row with a next-season row.
- [x] T11. QA gates at every stage: row counts, coverage by family,
      missingness, duplicate/leakage checks, schema pins; provenance
      (source, license, fetch date/method, transform version) in
      every manifest. Fail loud, never silent drops.

### O4. Blocked-rung report + final report
- [x] T12. Rung map 73 → 93 → 125 → 139 → 143 with exact unblockers:
      gamelog fetch (11 files, 2015-16→2025-26, operator machine,
      fetcher runnable there, no faked Hatch success); BBRef legal
      read; bulk salary source found-or-dropped; PBP transport
      decision (~17.5 GB, never through git, no bulk download
      without a plan); roster 002-filter ruling; honors semantics
      (5 columns quarantined, count in NO scenario yet).
- [x] T13. Trajectories: no promise. Only public source is frozen
      2015-16 SportVU mirrors (~600 games); Second Spectrum
      partner-only. Fine level stays event-location.
- [x] T14. `~/workspace/mlops-v2-drafts/PIPELINE_BUILD_REPORT.md`:
      what was built, what verified (real numbers), HF manifest
      table, rung map, what still needs the user's word.
- [x] T15. Final message ends with one VERDICT line per acceptance
      criterion. Scorecard table in the report.

## Standing gates (never crossed by this task)

- NO training runs, NO Forge/Alienware GPU work, NO merges/releases/
  redeployments/production writes, NO synthetic data.
- Sports Reference Terms §5 item 11 bars AI-model training for every
  BBRef-fed family; a legal read is still owed. An HF mirror does
  NOT clear underlying source terms. Robots.txt is NOT a license.
- The user's claim that research partners "have all the
  permissioning" is UNVERIFIED — recorded as a claim, never clearance.

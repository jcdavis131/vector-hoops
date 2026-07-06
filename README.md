# Vector Hoops

Daily NBA chimera puzzle over an era-honest player embedding space.
12,392 player-seasons (1996-2026), per-100-possession, z-scored within
season; PCA(3) map; 8 auto-named archetypes. Static, zero backend, free.

## Skills Lens (`skills.html`, `docs/SKILLS_LENS.md`)

Every charted player-season graded 0-99 on twelve skills — fixed linear
composites of the era-z contract, percentile within season pool, badges
at 90+. `pipeline/build_skills.py` emits `assets/skills.json` (grades,
order-aligned with vectors.json), `assets/skill_probe.json` (weights +
pooled quantile knots so the client grades the fused daily chimera), and
MTNN training targets. `pipeline/test_skills.py` gates every rebuild;
`pipeline/update_dataset.py` is the growth loop (fetch best-effort →
rebuild → gate → ledger at `pipeline/cache/dataset_ledger.json`).
`train_mtnn.py` (v4) adds a per-skill tower bank on the fused embedding
with held-out per-skill R² in `mtnn_report.json` — research lane only;
the site ships the transparent composites.

## OKF LLM-Wiki (`knowledge/`)

One interlinked, machine-editable markdown page per charted player
(2,293), plus archetype and position hubs. Two-layer contract: an AUTO
block regenerated from the data, and a CURATED layer below the marker
that humans/LLM agents extend and the generator never touches. Nearest-
neighbor wikilinks make the graph walkable; the game's reveal card links
each chimera component to its dossier. Contract: `knowledge/OKF.md`.

- `python pipeline/build_wiki.py` — idempotent regeneration

## Enrichment (`pipeline/enrich_vectors.py`)

Adds to `assets/vectors.json` without touching the game contract:

- `proj` — exact affine recovery of the build-time PCA+minmax map, so
  the client projects the fused Chimera vector into the 3D map honestly
- `axes` — PC1/PC2/PC3 interpretations verified against feature
  correlations (paint vs perimeter / scoring load / ball in hand)
- `p` + `positions` — per-season PG/SG/SF/PF/C from Basketball-Reference
  (`pipeline/fetch_positions.py`, 99.7% coverage), coloring the 3D map

## Data pipeline (v2)

`python pipeline/build_vectors.py` builds two artifacts:

- `assets/vectors.json` — the frozen 14-dim game contract (+ optional
  `sal` salary-z per player where payroll coverage exists)
- `pipeline/data/train_matrix.npz` + `feature_manifest.json` — the wide
  matrix: Base + Advanced + shot-mix (Scoring) + bio + player-tracking
  (2013-14+, masked before) + salary, all era z-scored with missing
  masks, grouped into tower families

Sources: stats.nba.com (leaguedashplayerstats Base/Advanced/Scoring,
leaguedashplayerbiostats, leaguedashptstats), basketball-reference
current contracts, and an optional `pipeline/cache/salaries_history.csv`
drop-in (name,season,salary) for full 1996+ payroll history.

Every season/endpoint response is cached under `pipeline/cache/`;
stats.nba.com throttles hard, so re-running resumes where it left off.
`--offline` rebuilds from cache only.

Cleaning: dedupe on (PLAYER_ID, season), NaN -> season mean with masks,
attempt-weighted empirical-Bayes shrinkage of FG3%/FT%/FG%, z-clip ±4.

## Embedding v2 (multi-tower net)

`python pipeline/train_towers.py` (torch) trains per-family MLP towers
(volume / playmaking / rebounding / defense / efficiency / shot-mix /
tracking / bio / market) fused into a 32-dim contrastive embedding
(InfoNCE; positives = same player in adjacent seasons + augmented
views; auxiliary salary-regression head). Outputs
`pipeline/data/embedding_v2.npz` + `tower_report.json` with a
same-player-next-season recall@10 sanity metric. The game keeps the
transparent 14-dim profile until v2 demonstrably beats it — promotion
is a deliberate, separate step.

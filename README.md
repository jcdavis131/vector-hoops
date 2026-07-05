# Vector Hoops

Daily NBA chimera puzzle over an era-honest player embedding space.
12,392 player-seasons (1996-2026), per-100-possession, z-scored within
season; PCA(3) map; 8 auto-named archetypes. Static, zero backend, free.

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

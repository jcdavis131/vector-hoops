# Vector Hoops — NBA Embedding & Daily Chimera Game

**Purpose:** Production-grade NBA player embedding space and static-site daily game. Provides 12,966 player-seasons (1996–2026), a multi-tower neural net (MTNN v5 shipped, v6-v9 candidates), and a PWA static site (no backend) hosting daily chimera puzzles, 3D embedding maps, DFS/oracle, and front-office analytics.

Live: https://hoops.dumbmodel.com — plain HTML/JS, no framework, PWA-capable.

## Structure

```
.
├── assets/                 # Shipped artifacts: vectors.json, mtnn_meta.json, mtnn.onnx, skills.json, eval JSONs
├── data/                   # Training matrices and curated model weights (intentionally tracked, see Large Assets)
├── pipeline/               # Data pipeline, training, evaluation (stdlib + torch, zero-deps noted)
│   ├── build_vectors.py
│   ├── build_skills.py
│   ├── train_mtnn*.py
│   ├── cache/              # API cache, resumable — gitignored
│   └── data/               # Derived intermediates — gitignored
├── public/                 # Static-site mirror for deploy (Vercel static)
├── bundles/                # Execution harness — manifest, ultra runs (canonical: bundles/ultra/runs/)
├── docs/                   # Architecture, data model, gates, handoff
├── knowledge/              # Player wiki generated (AUTO + CURATED contract)
├── scripts/                # Utilities, verification
├── tests/                  # Pipeline gates
├── api/, apps/, game/      # Site modules
└── index.html, play.html, model.html, players.html, etc. — static pages
```

## Quick Start

```bash
# Static site (no build)
python -m http.server 8000
# open http://localhost:8000

# Pipeline gates (dev extras)
python -m pytest pipeline/ -q

# Build vectors / skills
python pipeline/build_vectors.py
python pipeline/build_skills.py

# Training (GPU recommended for v6+)
bash train.sh
# or
python pipeline/train_mtnn_v6_192d.py --epochs 150 --batch 512 --device cuda --d-model 192 --n-heads 6 --n-layers 6
```

Promotion gate: candidate.json must beat shipped eval on player-split leak-free (composite ≥0.85, top1 ≥0.55 vs shipped 0.7937/0.438). See `docs/MTNN_V5_PROMOTE_GATE.md` and `assets/eval_scoreboard.json`.

## Embedding

- 12,966 player-seasons, per-100-poss z-scored within season (era-honest).
- MTNN v5 shipped: 130 feats 18 families, 17 towers → 64-d L2 normalized.
  - Eval leak-free player-split: recall@10 0.977, purity@20 0.6717, composite 0.7937, adjacent-season n=790 top1 0.438 top5 0.757.
- v6+ transformer fusion candidates scaffolded (17 towers → tokens → CLS transformer 128d 4L4H → 64-d L2), targeting composite 0.85+, gated via `candidate.json`.

Shipped artifacts in `assets/` allow client-side inference (ONNX optional).

## Data Pipeline

- Sources: stats.nba.com dashboards + Basketball-Reference contracts, cached under `pipeline/cache/` with resume + `--offline`.

Dormant tracks (one-time residential-IP fetch required due to stats.nba.com datacenter block):

- Pedigree: `bash pipeline/operator_fetch_pedigree.sh`
- Playoffs: `bash pipeline/operator_fetch_playoffs.sh`
- Wide skills: `bash pipeline/operator_fetch_wide_skills.sh`

## Zero-Deps Note

Core site is zero-deps stdlib HTML/JS. Pipeline uses stdlib + `numpy`, `pandas`, `scikit-learn`, `torch`, `nba_api` declared in `pyproject.toml`. Bundles harness declares `{"zero_deps":true,"allow":"acne:./src"}` — no pip installs at runtime, ACNE optional local at `dottie/rl/` canonical. Torch device auto: cuda if available else cpu (Hatch VM CPU-only → honest 503 waiting GPU, Alienware RTX 4090 24GB when available).

## LCG Deterministic

Daily packs use glibc LCG deterministic chain same-link-same-stars:

- Seed = YYYYMMDD
- `L(s) = (s * 1103515245 + 12345) & 0x7fffffff`
- Daily: `20260813 → 189831298 idx3820 triple[11205,19448,14209] ?daily=YYYYMMDD&n=1/3/5`
- Guarantees same-link-same-stars across open → drag-map → Jordan → copy-link (DAU3/WAU3 TLPG dedup).

Chain verified: 2026-08-13T21:00:15Z, 21:01:02Z, 01:34:50Z.

## Large Assets & Git Hygiene

- `assets/matchup_players.json` (9.9 MB), `assets/playoff_paths.json` (9.0 MB), `public/assets/` mirrors — intentionally committed for static hosting, treated as data artifact.
- `datasets/vegas/dfs/dfs_harvest_vegas.jsonl` (7.3 MB), `exports/dfs/dfs_harvest_vegas.jsonl` same — harvested Vegas lines, kept in data for reproducibility; exports pruned to last 30 days.
- `data/*.pt` (e.g., mtnn_v9_2_procrustes_vae) intentionally tracked as curated model weight (small 1-3 MB) for static inference; general `*.pt/*.pth` and `pipeline/data/*.pt`, `pipeline/cache/checkpoints/*.pt` are gitignored and should use LFS or be untracked.
- `pipeline/cache/checkpoints/` historically tracked — now ignored; use `git rm --cached` to untrack if present.

## Coordination

- Master board: `bundles/coordination/active-tasks.md` (see also repo root `COORDINATION.md` mirror, `COORDINATION_LOCAL_GPU.md` for GPU lanes).
- Active tasks ≤15 rows, CLAIM flow in COORDINATION.md, branch `scout/<slug>`, candidate.json first, triple-write timeline.jsonl mandatory 7 fields `nodeId,agentId,attempt,latency_ms,tokens_est,status,errorClass`.
- Zero-deps, offline-friendly, PWA v67 void #080A0F 40px sticky OKABE-8.

## License

MIT — solo personal project, no employer connection, public/free-tier only.

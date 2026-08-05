# Vector Hoops

![CI](https://github.com/jcdavis131/vector-hoops/actions/workflows/ci.yml/badge.svg)
![Python 3.11](https://img.shields.io/badge/python-3.11-blue)

A daily NBA "chimera" puzzle played over an era-honest player-embedding space: guess the blend of real player-seasons behind each day's composite. Static site, no backend, live at https://hoops.dumbmodel.com.

> Solo personal project, no connection to employer, built with public/free-tier only (free data pipeline, ONNX optional, static Vercel).

> **Picking up in-progress work?** Start at [`docs/HANDOFF.md`](docs/HANDOFF.md) — current state, dormant data tracks and how to activate them, verification commands, and open follow-ups.

## The embedding

12,966 player-seasons (1996–2026), per-100-possession stats z-scored within season so eras compare honestly. A multi-tower neural net (MTNN v5: 130 features in 18 families, 17 of them towers (injury feeds a durability head, not an input tower), fused to a 64-dim L2-normalized embedding with archetype / position / next-profile / skills heads) produces the space the game scores in. On the player-split leak-free eval: 0.977 recall@10, 0.6717 purity@20, composite 0.7937 (see `docs/DATA_MODEL_2026-07-16.md`, `docs/MTNN_V5_PROMOTE_GATE.md`, and `assets/eval_scoreboard.json` for how the gate is defined — an earlier season-split eval that scored recall@10 = 1.0 was memorization and was replaced).

The shipped artifacts (`assets/mtnn_meta.json`, `assets/mtnn.onnx`, `assets/vectors.json`, `assets/skills.json`) are committed, so the site runs from a static host with client-side inference (ONNX optional).

## The site

Plain HTML/JS/Canvas/WebGL, no framework or game engine, PWA-capable (`sw.js`, `offline.html`). Pages: the daily game (`play.html`), a 3D embedding map (`model.html`), player dossiers (`players.html`), trends, teams, leaderboard, and methods (`methods.html`). `knowledge/` holds a generated, interlinked markdown wiki page per charted player (AUTO block regenerated from data, CURATED block preserved) — contract in `knowledge/OKF.md`, rebuilt with `python pipeline/build_wiki.py`.

## Data pipeline

```bash
python pipeline/build_vectors.py     # frozen 14-dim game contract + wide training matrix
python pipeline/build_skills.py      # 12-skill grades + client-side probe weights
python pipeline/update_dataset.py    # growth loop: fetch -> rebuild -> gate -> ledger
```

Sources: stats.nba.com league dashboards (Base/Advanced/Scoring/bio/tracking) and Basketball-Reference contracts. Every response is cached under `pipeline/cache/`; stats.nba.com throttles hard, so reruns resume, and `--offline` rebuilds from cache only. Rebuilds are gated by `pipeline/test_skills.py` before anything ships.

Three data tracks are built but dormant, each cache-ready and gated on a committed fixture until one operator fetch from a residential IP (stats.nba.com blocks datacenter IPs):

- **Pedigree (Track H)** — draft slot and entry expectations: `bash pipeline/operator_fetch_pedigree.sh`
- **Playoffs (Track I)** — postseason-vs-regular-season deltas: `bash pipeline/operator_fetch_playoffs.sh`
- **Wide skills (Track J)** — post/transition/motor from synergy + hustle feeds: `bash pipeline/operator_fetch_wide_skills.sh`

## Training

`train.sh` drives MTNN training (`pipeline/train_mtnn.py`, torch). Promotion of a new embedding into the game is a deliberate, separate step behind the leak-free gate above — the transparent 14-dim contract stays until a candidate beats it there. Research notes live in `docs/` (`MTNN_V5_DEEP_ARCHITECTURE.md`, `MTNN_V6_SOTA.md`, `RESEARCH.md`).

### v6 transformer fusion candidate (not shipped, 2026-08-05)

- **Arch:** 17 towers `cat([x·m,m])→96h→24d` LayerNorm skip L2 `d_in×2→40→192→40 ×3 blocks`, tokens 17×40→proj 128, fusion `CLS + season 12-d→128 + 17 tokens = 19 tokens` transformer `d_model128 n_layers4 n_heads4 ff512 pre-LN dropout0.15` → `CLS 128→512→64 L2` (shared lib `towers.py` ResidualTower + `TransformerFusion` 128d 4-head CLS→64-d)
- **Losses:** InfoNCE hybrid player 0.65 arch 0.35 hard_neg_boost 0.4 SupCon + CORAL/GRL λ0.3 VICReg var25 cov1 w0.05, mask fix (B,1) expand (B,D)
- **Shipped eval (v5, player-split leak-free, season-split 1.0 replaced):** recall@10 0.977, purity@20 0.6717, composite 0.7937, adjacent-season retrieval test `n=790` top1 0.438 top5 0.757 (overall top1 0.5081 top5 0.9339), val `n=761` top1 0.2668 — see `assets/eval_scoreboard.json` computed 2026-07-25
- **Target v6:** composite 0.7937→0.85, test top1 0.438→0.55, CQS 85.87→87.5-88.0, purity@20 0.8726→0.89-0.91 — requires `train_mtnn_v6.py --epochs 150` on local GPU (Hatch OOM, torch wheel). Candidate gates `candidate.json` first, promote only if beats shipped on leak-free player-split (no season leak).
- **Status:** Code scaffolded (`pipeline/train_mtnn_v6.py` forwards to `train_mtnn.py` with v6 defaults, `pipeline/towers.py` shared lib), local training claimed by LOCAL-GPU lane `local/hoops-v6-gpu`, no push to main until eval passes.

## Running locally

```bash
python -m http.server 8000   # static site, open http://localhost:8000
python -m pytest pipeline/ -q   # pipeline gates (needs the dev extras in pyproject.toml)
```

## License

MIT. Solo personal project, no connection to employer, built with public/free-tier only.

# Vector Hoops

![CI](https://github.com/jcdavis131/vector-hoops/actions/workflows/ci.yml/badge.svg)
![Python 3.11](https://img.shields.io/badge/python-3.11-blue)

A daily NBA "chimera" puzzle played over an era-honest player-embedding space: guess the blend of real player-seasons behind each day's composite. Static site, no backend, live at https://hoops.dumbmodel.com.

> Solo personal project, no connection to employer, built with public/free-tier only (free data pipeline, ONNX optional, static Vercel).

> **Picking up in-progress work?** Start at [`docs/HANDOFF.md`](docs/HANDOFF.md) — current state, dormant data tracks and how to activate them, verification commands, and open follow-ups.

## The embedding

12,966 player-seasons (1996–2026), per-100-possession stats z-scored within season so eras compare honestly. A multi-tower neural net (MTNN v5: 120 features in 17 tower families, fused to a 48-dim L2-normalized embedding with archetype / position / next-profile / skills heads) produces the space the game scores in. On the player-split leak-free eval: 0.977 recall@10, 0.6717 purity@20, composite 0.7937 (see `docs/DATA_MODEL_2026-07-16.md`, `docs/MTNN_V5_PROMOTE_GATE.md`, and `assets/eval_scoreboard.json` for how the gate is defined — an earlier season-split eval that scored recall@10 = 1.0 was memorization and was replaced).

The shipped artifacts (`assets/mtnn_meta.json`, `assets/mtnn.onnx`, `assets/vectors.json`, `assets/skills.json`) are committed, so the site runs from a static host with client-side inference (ONNX optional).

## The site

Plain HTML/JS/Canvas/WebGL, no framework or game engine, PWA-capable (`sw.js`, `offline.html`). Pages: the daily game (`play.html`), a 3D embedding map (`model.html`), player dossiers (`players.html`), trends, teams, leaderboard, and methods (`methods.html`). `knowledge/` holds a generated, interlinked markdown wiki page per charted player (AUTO block regenerated from data, CURATED block preserved) — contract in `knowledge/OKF.md`, rebuilt with `python pipeline/build_wiki.py`.

## Data pipeline

```bash
python pipeline/build_vectors.py     # frozen 14-dim game contract + wide training matrix
python pipeline/build_skills.py      # 12-skill grades + client-side probe weights
python pipeline/update_dataset.py    # growth loop: fetch -> rebuild -> gate -> ledger
```

Sources: stats.nba.com league dashboards (Base/Advanced/Scoring/bio/tracking) and Basketball-Reference contracts. Every response is cached under `pipeline/cache/`; stats.nba.com throttles hard, so reruns resume, and `--offline` rebuilds from cache only. Rebuilds are gated by `pipeline/test_skills.py` / `pipeline/test_arena.py` before anything ships.

Three data tracks are built but dormant, each cache-ready and gated on a committed fixture until one operator fetch from a residential IP (stats.nba.com blocks datacenter IPs):

- **Pedigree (Track H)** — draft slot and entry expectations: `bash pipeline/operator_fetch_pedigree.sh`
- **Playoffs (Track I)** — postseason-vs-regular-season deltas: `bash pipeline/operator_fetch_playoffs.sh`
- **Wide skills (Track J)** — post/transition/motor from synergy + hustle feeds: `bash pipeline/operator_fetch_wide_skills.sh`

## Training

`train.sh` drives MTNN training (`pipeline/train_mtnn.py`, torch). Promotion of a new embedding into the game is a deliberate, separate step behind the leak-free gate above — the transparent 14-dim contract stays until a candidate beats it there. Research notes live in `docs/` (`MTNN_V5_DEEP_ARCHITECTURE.md`, `MTNN_V6_SOTA.md`, `RESEARCH.md`).

## Running locally

```bash
python -m http.server 8000   # static site, open http://localhost:8000
python -m pytest pipeline/ -q   # pipeline gates (needs the dev extras in pyproject.toml)
```

## License

MIT. Solo personal project, no connection to employer, built with public/free-tier only.

# pipeline/attic

Retired scripts, moved here on 2026-10-09 by the backend hardening pass. None of
them has a caller: a grep over pipeline/, scripts/, tests/, train.sh, the
Makefile, .github/, herdmux and the C:/Users/jcdav/vector-* repos found no
import or command line that runs them, only docs, each other, and pyproject
lint ignores. Each one is either broken against the current trainer or
produces numbers that mislead.

They are kept as files rather than deleted so the docs that mention them still
point at something, and git history keeps every earlier version anyway. They
are not maintained, not linted (pyproject excludes this directory) and not
importable as written: the sibling imports (`import train_mtnn`,
`import train_mt`) assume pipeline/ is the script's directory. To revive one,
move it back to pipeline/ and fix what is listed below first.

The training entry points that are maintained: `pipeline/rebuild_all.py` (the
orchestrator, which trains through `pipeline/train_mtnn.py --recipe` and ships
through `pipeline/promote.py`) and herdmux's climb, which runs
`pipeline/train_mtnn.py` with the flags in `pipeline/recipes/measure.json`.

| file | why it was retired | finding |
|---|---|---|
| `train_mt.py` | Model-zoo trainer that writes the served `assets/data/model_zoo_eval.json` (read by lab.html and model.html) with in-sample numbers: `rf.fit(Xc, yc)` then `eval_reg(yc, rf.predict(Xc))` for RF_payroll_cap (published R2 0.8192 against Linear 0.0612) and `pipe.fit(Xf, yf)` then `eval_reg(yf, pipe.predict(Xf))` for the foresight Ridge (avg_r2 1.0 on every fold). Only caller was train_factory.py. | [training#14], [health#12] |
| `train_factory.py` | Stub that drives train_mt.py and writes model_zoo_eval.json. No caller. methods.html names it in prose. | [health#12] |
| `train_mt_v53.py` | v5.3 variant of train_mt.py; reads and writes the same `assets/data/model_zoo_eval.json`. No caller. | [health#12], [training#14] |
| `train_quick_wins.py` | Tabular baselines that also write model_zoo_eval.json. No caller. | [health#12], [training#14] |
| `train_mtnn_v6_cpu.py` | CPU wrapper over train_mtnn.py with `--era-align none`; its only caller was pipeline/run_local_gpu.sh, deleted with the v6-192d trainers. | [health#12] |
| `score_mtnn_validation.py` | Rebuilds MTNN over every manifest family minus `exclude_families`, so it keeps an `injury` tower that train_mtnn always drops (`k != "injury"`) and passes no `n_injury`, so builds no `durability_head`. The current mtnn_best.pt has `durability_head` and no `towers.injury`, so the strict `load_state_dict` should fail (static evidence; not run). When it did run, it rewrote mtnn_report.json's population_validation without recomputing composite or promote. | [eval#14] |
| `seed_cqs_baseline.py` | Regex-replaces composite_score.BASELINE with a 3-key dict (cqs, recall, purity) from one report. That deletes `continuity_spread`, so `should_promote`'s continuity guard (`base_spread = _num(BASELINE.get("continuity_spread"))`) silently stops firing, and n=1 contradicts BASELINE_PROVENANCE's multi-seed rule. | [eval#14] |
| `retrain_universe.py` | Without `--recipe` it retrains `apply_hp_sweep.py --epochs 150 --seed 99` (help: "hybrid-040 best seed", stale), with no `--device` (so cpu), no `--phase`, no `--run-dir` and no `--write-artifacts`, and it never runs enrich_vectors.py after rebuilding vectors.json. Its job (rebuild, train, promote, export, verify) is rebuild_all.py's. | [orchestration#8] |
| `apply_hp_sweep.py` | Builds train_mtnn argv from mtnn_hp_sweep.json's top-level keys only, so the best entry's nested `train_hparams` (tower 24/96, hard-neg 0.3) are dropped for trainer defaults (32/160, 0.4); defaults a missing `fusion` to `gated`; passes no `--run-dir`, `--device` or `--write-artifacts`. Its only caller was retrain_universe.py. | [orchestration#8] |

Deleted outright rather than moved here, because they wrote invented metrics
or random-init models (git history keeps them): `train_mtnn_v6_192d.py`,
`train_mtnn_v6_192d_cpu.py`, `train_mtnn_v6_192d_gated.py`,
`run_local_192d.sh`, `run_local_gpu.sh`, `scripts/export_onnx.py`,
`scripts/export_executorch.py` [health#4, artifacts#7, artifacts#8].

Also deleted outright, on 2026-10-09, four fetch-named scripts whose only
writes were estimates or proxies presented as data. None had a caller.
Removing their fabrication paths would have left nothing that fetches
[ingest#5, health#5]:

| file | what it wrote |
|---|---|
| `pipeline/fetch_missing_combine.py` | wingspan/reach/vertical "scaffold" (`height*1.07 + pos_adj + bounded noise`, positional vertical averages) written in place into all 30 `pipeline/cache/bio_*.json` (14,498 of 14,569 rows `combine_method: estimated`), plus `combine_enriched.json` and `draft_combine_scaffold.json`. Its scrape attempt only overlaid three fields on the estimate. |
| `pipeline/fetch_missing_injury.py` | `assets/data/injury_history.json` inferred from `82 - gp` (wrong for the 50/66/72-game seasons and for traded players) with an age default of 27 for the load-management flag. Measured games missed come from `build_availability.py` (game logs, 2015-16 on). |
| `pipeline/fetch_pbp.py` | `assets/chemistry.json` / `assets/faderfinisher.json` "proxies" from vectors.json minutes (`source: vectors_proxy`), a three-game play-by-play probe whose rows it discarded, and a "BigDataBall fallback" that fetched a statsbomb README as a connectivity test. |
| `pipeline/fetch_missing_payroll.py` | Rewrote `assets/data/payroll_by_season.json` from itself and copied it into `pipeline/cache`. Its CSV path reads a `payroll` column `salaries_history.csv` does not have, and its fallback summed whatever player salaries `salaries_merged.json` held per team and divided by 1e6 on a guess of the unit. |

The served files they wrote are listed for the frontend follow-up; this pass
does not touch `assets/` or `public/`.

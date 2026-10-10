# The pipeline: matrix, train, promote, export, verify

How the model behind the site is built, measured and shipped, as of the `forge/backend-hardening` branch (2026-10-10). The per-finding record of why each piece looks the way it does is in the commit bodies; this page is the map.

One rule runs through all of it: **ship what you measure.** The model the site serves is a run whose held-out numbers were measured on the matrix it trained on, copied byte for byte from that run's own directory, with a file in `assets/` that says which run it was. Nothing else ships, and no number on the way is typed in.

## The stages

`pipeline/rebuild_all.py` is the one orchestrator. Each step runs as `<interpreter> -u <script> <args>` from the repo root; the first nonzero exit stops the run and the run exits nonzero naming the step.

| stage | steps | writes |
|---|---|---|
| matrix | `build_vectors.py --offline`, `enrich_vectors.py`, `integrate_context.py` (the herdmux climb's prepare chain, flag for flag; a test compares them when herdmux is on the box; `integrate_context` ends with the contract check), then `stage_contract.py` (the same check, plus its stats manifest in the run directory) | `assets/vectors.json`, `pipeline/data/train_matrix.npz` + `feature_manifest.json` |
| context (opt-in) | with `--refresh-context`, between enrich and integrate: the side builders (skills, wide skills, pedigree, playoffs, honors, roster, min_gp, availability, career, form, competition, system tags, player meta, rosters), from real caches only | `pipeline/data/*.json`, a few `assets/` sidecars |
| train | `train_mtnn.py --recipe ship --run-dir pipeline/data/runs/<run_id> --device <resolved>`, then `promote.py --run <that dir>` | the run directory, `pipeline/data/promoted/` |
| export | `export_assets`, `export_mtnn_embeddings`, `export_mtnn_jacobian`, `export_mtnn_viz`, `export_season_norms`, `procrustes_drift`, `archetype_time`, `build_scoring_lite` | `assets/` |
| verify | `test_scoring_lite.py`, `verify_accuracy.py` | nothing |

```bash
python pipeline/rebuild_all.py --list                  # the plan, with what each step writes
python pipeline/rebuild_all.py --dry-run               # the commands, plus the read-only preflights; writes nothing
python pipeline/rebuild_all.py --stage matrix          # rebuild the matrix and check the contract
python pipeline/rebuild_all.py                         # matrix, train (ship), promote, export, verify
python pipeline/rebuild_all.py --promote-force "single-seed run, reviewed by hand"
python pipeline/rebuild_all.py --stage export          # re-export the promoted bundle
python pipeline/rebuild_all.py --from train_mtnn --to build_scoring_lite
python pipeline/rebuild_all.py --refresh-context --stage matrix
```

Options worth knowing:

- `--device auto|cpu|cuda`, default `auto`: cuda when the interpreter that runs the steps sees a GPU, else cpu, probed in a subprocess only when the train step is in the plan. `train_mtnn.py`'s own default is still `cpu`; only the orchestrator resolves. Every host climb panel under protocol 397e16a79ddc ran on cpu by falling through to that default.
- `--recipe NAME|PATH` (default `ship`), `--v6` (`--recipe legacy-v6-refit`). `--epochs` / `--quick` (40) / `--full` (150), `--batch` and `--seed` are passed only when given, so a recipe's own values stand otherwise.
- `--dry-run` runs the real-input preflights (`pipeline/real_caches.py`: is each selected step's input there and not a proxy or fixture?) and exits 1 when a real run would stop on one.
- Every real run writes `pipeline/data/runs/<run_id>/rebuild.json` after each step: options (the requested and the resolved device), each step's argv, exit code and duration, git state, library versions, the matrix's stats manifest and the run's bundle.

The wrappers are thin. `train.sh` maps its old flags onto `rebuild_all.py` (`--device=cuda` becomes `--device cuda`, `--seeds=N` becomes `--seed N`, anything else passes through) and execs it with `pipeline/.venv`'s interpreter when there is one. The Makefile's `PYTHON` defaults to the same interpreter by the same rule (`pipeline/.venv/Scripts/python.exe`, then `pipeline/.venv/bin/python`, then `python`):

```bash
make build    # rebuild_all.py --to stage_contract
make train    # rebuild_all.py --quick
make ci       # what .github/workflows/ci.yml runs: offline fetch, pytest -m "not local_data", stamp_assets --check
make lint     # ruff check + ruff format --check
make eval     # the whole suite, local_data tests included
```

`make ci` does not run the served-model check; see below.

## Recipes

A recipe is a JSON file in `pipeline/recipes/` naming `train_mtnn.py` flags (`pipeline/mtnn_recipe.py` says how they bind). `train_mtnn.py --recipe NAME|PATH` installs them as defaults, so a flag on the command line still wins, and the report's lineage records the recipe's name, path, sha256 and which values the command line overrode.

| recipe | what | metrics |
|---|---|---|
| `measure` | the herdmux climb's pinned train flags without `--device` and `--seed`: `--epochs 40 --dim 64 --val-every 0 --no-best-checkpoint`, everything else default. `tests/test_recipes.py` holds it equal to `PROTOCOLS['vector-hoops'].train` in `gpu/climb.py`, but only where herdmux is checked out | held out (select phase) |
| `ship` | `measure`, nothing added. What `rebuild_all.py` trains by default | held out |
| `legacy-v5-refit`, `legacy-v6-refit` | the two refits `rebuild_all.py` hard-coded until 2026-10-09, flag for flag, plus the `--epochs 80` it passed. `--phase final-refit`: the loss sees every row, val and test included | in-sample: ship only with `--selection-run` |

One limit: a `store_true` switch a recipe sets cannot be turned off on the command line (argparse has no off spelling for it), so `--recipe measure` always trains with `--no-best-checkpoint` and the legacy refits always with `--robust-scaling`. Copy the file without the key and pass `--recipe <path>`; the lineage records the copy. `--mlp-heads` is a `BooleanOptionalAction` and does have `--no-mlp-heads`.

Selection does not happen here. Recipes are chosen in the herdmux climb (paired seed panels against a measured baseline); this repo trains the recipe it is given.

## The data contract

`pipeline/stage_contract.py` compares a stats manifest of `train_matrix.npz` + `feature_manifest.json` with the committed `pipeline/contracts/train_matrix.contract.json` and exits 2 on: a row count moved by more than 1%, a changed column list, order or family, a family's coverage down more than 5 points, a column's zero fraction up more than 10 points, changed `player_id|season` keys (`--allow-key-change` for a deliberate identity fix), or an observed column that is one value over a season (era z-scoring turns such a block into zeros marked observed). Availability-proxy correlations are warnings.

`integrate_context.py` runs the same check at the end of every run, after it writes the matrix, so it is on the herdmux climb's prepare path too: a matrix that breaks the contract makes `integrate_context` exit 2 with the violations and the remedy (`rebuild_all.py --refresh-context --stage matrix`; if the change is intended, `--accept-drift` and commit), and the climb's prepare stops before training. A matching matrix is written byte for byte as before and the exit is 0. `--no-contract`, or `HOOPS_NO_CONTRACT=1` in the environment, skips the check and says so in the log: for scratch builds, and for a climb arm that changes the layout on purpose through `build_vectors` flags (`--with-shape` adds columns, `--minutes-source real` and `--fixed-gates` change the rows). The climb's extra build flags reach `build_vectors` only, so for such an arm set the variable in the shell that runs `climb.py`. Measured with the home checkout's July side files installed (honors, pedigree, playoffs, career, form, competition, roster): the 3-step prepare used to exit 0; now `integrate_context` exits 2 with 20 violations (honors coverage 0.9238 -> 0.0873 and its five columns' zero fractions up 72-91 points, form and competition -5.1 points, 12 per-season constants).

To accept drift you meant:

1. Read every violation it prints. Each should trace to a commit that intended it.
2. `python pipeline/stage_contract.py --accept-drift` rewrites the contract. It cannot accept the per-season constant gate: that is a defect in the matrix, fixed in the builder or listed in `CONSTANT_ALLOWED` with the reason.
3. Commit the contract alone, with the `matrix_diff` family table in the body (rows added/removed, per family: mask on, mask off, changed cells, observed fraction before and after, and the commit each one comes from). `b0f37e50` and `b7063daf` are the pattern.

## Lineage and promotion

`train_mtnn.py --run-dir DIR` copies the run's checkpoint, `embedding_v3.npz`, `mtnn_centroids.npz` and, last, `mtnn_report.json` into `DIR`, each hashed against the sha256 recorded when the run wrote it. The report's `lineage` block carries argv, the resolved args, the recipe, seed, device, phase, `fit_rows`, git state, library versions, the matrix fingerprint (rows, columns, keys, values), the sha256 of the seven training inputs (`train_matrix.npz`, `feature_manifest.json`, `assets/vectors.json`, `skill_labels.npz`, `wide_skill_labels.npz`, `role_context.json`, `assets/drift.json`) and of every artifact written. A run with `--val-every 0 --no-best-checkpoint` (measure, ship) keeps its final weights as the bundle's checkpoint.

`pipeline/promote.py` is the only way a model ships:

```bash
python pipeline/promote.py --run pipeline/data/runs/<run_id> --dry-run
python pipeline/promote.py --run pipeline/data/runs/<run_id>
python pipeline/promote.py --run pipeline/data/runs/<run_id> --force "why"
python pipeline/promote.py --run pipeline/data/runs/<refit> --selection-run pipeline/data/runs/<select>
python pipeline/promote.py --status
```

It refuses, `--force` or not, a directory whose files are not the ones its lineage names, whose embedding rows are not the matrix fingerprint's keys, whose matrix is not the current `train_matrix.npz`, or whose metrics are not held out. Then it runs `composite_score.should_promote` on the numbers the bundle will carry; a run that fails it ships only with `--force "<reason>"`, and the reason goes into the manifest, `CURRENT.json` and the served lineage. With one seed the CQS bar is baseline + 2 x seed sd (77.74 + 1.2), so a single run often needs it: that is the operator's call, recorded.

A refit (`fit_rows` all, the legacy recipes) has no held-out numbers, so it needs `--selection-run`: a select run of the same recipe on the same matrix, trained with the same arguments except where files went, the device and the validation/checkpointing switches. Two rules added on 2026-10-10: that select run must have scored its final weights (no restored best epoch, `best_epoch` null), because the refit ships its final epoch; and an option the select run predates compares as `train_mtnn`'s default, not as None. The manifest then carries the select run's metrics, labelled as its, and the bundle keeps a copy of its report.

What a promotion writes: `pipeline/data/promoted/<run_id>/` (the four files, `manifest.json`, `selection/` for a refit), then `CURRENT.json`, flipped atomically, then the **legacy paths**: `pipeline/data/embedding_v3.npz`, `mtnn_centroids.npz` and `mtnn_best.pt`, byte copies of the promoted bundle for readers outside this repo (vector-unified loads the embedding and the checkpoint, and its freshness check reads the checkpoint's mtime). Legacy paths = promoted model, with one caveat: a select run with validation and best-checkpoint selection still saves its candidates to `pipeline/data/mtnn_best.pt` until the next promote. The measure and ship recipes and the climb never write it. `pipeline/data/mtnn_report.json` is the last run's report, always; the climb and the sweeps read it there. The newest five bundles are kept; re-promoting one (`--run pipeline/data/promoted/<run_id>`) is a rollback.

Every exporter reads the model through `promote.load_promoted()`, which re-hashes every file in the current bundle and refuses a missing, edited or mixed one. `export_mtnn_embeddings` checks every row against `vectors.json` by `(player_id, season)` and applies the export floors (test recall >= the transparent 14-d baseline + 0.05, archetype top-1 >= 0.55, purity@20 >= 0.63) on the numbers the bundle carries. A bundle below them is not exported unless its promotion was forced; then it is, and `assets/mtnn_lineage.json` records the misses and the reason under `export_floors`.

## The served-model check

`scripts/check_served_model.py` (stdlib, its own CI job) checks `assets/` and `public/assets/`: the f32 is rows x dim x 4 bytes, the meta carries only the keys `export_mtnn_embeddings` writes, `vectors.json`'s rows hash to the keys the f32 was exported against, `mtnn_lineage.json` names the f32's sha256 and the bundle's, the meta's metrics are the lineage's, the sidecars (`mtnn_arch.json`, `mtnn_map.json`, `mtnn_jacobian.json`, `projections.json`, `scoring_lite_index.json`) carry the same run id, and both trees serve the same bundle.

It is **red by design** on this branch. The committed bundle is the 2dc6ad78 model (f32 blob 09923d98): an effectively untrained v6 smoke model, test top-5 retrieval 0.035 against 0.749 for the v5 blob it replaced, with a hand-assembled meta (composite 0.85, top1_790 0.55, numbers nobody measured) and no lineage [eval#0]. It goes green only when a real run is promoted, exported and mirrored. Never edit `assets/` or `public/assets/` to make it green. `verify_accuracy.py` fails on the same bundle today (jacobian towerFamilies and dEmb 48 against the arch's 64, two stale checkpoint stamps); it still exits 1, and it now lists those failures under "[served bundle, unpromoted]" so they are not read as the rebuild's.

`tests/test_e2e_smoke.py` runs the chain the check describes, as processes, on a 100-player slice of real data (`tests/fixtures/e2e_slice/`): train one epoch, `promote --force`, the five MTNN exporters, `sync_public`, and the check exits 0. It takes about 10 s on the training box's CPU and runs in CI.

## CQS v1 and v2

**v1** (`pipeline/composite_score.py`) is what the climb, `should_promote` and promotion judge. It blends ten components on [0, 100]: test recall@10 0.18, purity@20 0.16, margin over the 14-d baseline 0.08, archetype 0.08, position 0.05, skills R2 0.14, skill-neighbour gap 0.05, next-season R2 0.12 and MAE 0.06, aux-head R2 0.08. Four of them (0.34 of the weight) are scored over every row, 85% of them rows the loss trained on; `composite.component_rows` says which rows each used. Recall is a 500-of-790 subsample drawn from the global RNG. A missing component scores 0.0 and `components_missing` names it; v1 expects nothing, so every recorded v1 number stands. The baseline is 77.74 (sd 0.60, six seeds, 2026-07-31).

**v2** (`pipeline/composite_v2.py`, `report["composite_v2"]`) is computed beside v1 and decides nothing. Every component is scored on held-out rows or pairs only, all of them, ranked exhaustively, and against a free baseline: recall and a regime slice (held-out anchors re-encoded with the 58 columns the pre-2013 era never recorded zeroed) against the better of the transparent 14-d profile and an identity lookup on seven draft/body columns; the next-season head against raw and shrunk persistence. `centered()` maps no skill to 0, the best free baseline to 0.5 and perfect to 1. Weights, **provisional, for the operator to ratify**: recall 0.30, regime 0.20, next R2 0.15, next MAE 0.10, position 0.15, archetype 0.10. Purity, skills R2, aux R2 and v1's margin are diagnostics. A component that cannot be computed is None with its reason, and so is `cqs_v2`. A final refit's block says `metrics_source: in_sample_refit`.

What it measured on the box's 08-14 checkpoint, re-encoded like for like (`eval_v2.py`, all four v1 checks reproduce exactly; commits `5d24b21a`, `bd04bfd5`):

| | value | free baseline |
|---|---|---|
| v1 CQS | 66.23 | |
| v2 CQS | 41.50 (val 46.39) | |
| test recall@10, exhaustive (08-07 embedding) | 0.8304 | identity lookup 0.9025, 14-d 0.2494 |
| regime slice | keeps 21.8% of test recall (0.7418 -> 0.1620) | |
| next-season R2 | 0.3246 | raw persistence 0.349, shrunk 0.457 |

`pipeline/eval_v2.py --run <dir>` recomputes v2 for a run that already happened.

For a `--protocol-v2` report (below), `composite_score` leaves the CQS unscored (None, which the climb reads as a broken run), not 0.0, when a component the run should have produced is missing: every component but aux R2, the two skills ones only when the run trained skill towers. `composite.components_expected` lists them.

## --protocol-v2

Off by default, and off is exactly the old run. On, it changes three things the numbers depend on: the per-epoch permutations get their own RNG (in v1 they share the global one with recall's subsample, so every validation check shifts training); the step-mode LR schedule is sized from the batches actually trained (v1 sizes OneCycle for all 12,966 rows, 1,040 steps over 40 epochs, while a select run takes 880 and stops mid-anneal at 17% of peak LR); and in a select run no val row is a training signal. Different numbers, so not comparable with v1. Adopting it means adding `--protocol-v2` to the climb's pinned train flags (and `measure.json`, which a test holds equal to them): that is a new protocol id, and a new six-seed baseline panel before any arm is judged. Passing it as an experiment's extra flag is not hashed and would be judged against the v1 baseline; don't.

## What this branch changed in the data

The matrix is not the one the climb's baseline trained on. These packages changed it on purpose, each accepted in its own contract commit with the family table in the body:

- `b0f37e50` (P10): honors observed 0.087 -> 0.937 (a measured zero is observed now), `DRAFT_UNDRAFTED` added (142 -> 143 columns; undrafted is no longer pick 61), regular-season-only form and competition, unmeasured hustle masked instead of zero, 70 mojibake salary keys repaired.
- `b7063daf` (P11): game-log and context joins by `PLAYER_ID` instead of display name (form, injury and competition observed 0.347 -> 0.398), pedigree matched by id, left-censored career counts masked (career observed 0.728 -> 0.693), partial All-Star lists no longer read as complete.

- `25b3c10f` + `f5a60a3c` brought back 386 non-zero 2015-16 hustle values and were reverted (with their test, `8fe52f2a`): each value is a per-game average over 1-2 tracked games from 15 teams, not the season rate its column holds, so 2015-16 hustle stays off the training path as P10 left it [final#10].
- `b6806210` + `68b1150d`: a pick of 0 is undrafted. 20 bio records (8 players, none in the complete draft history) carried pick 0, ranked ahead of every real No. 1 pick; 12 matrix rows lose `DRAFT_NUMBER` and `DRAFT_SLOT_Z` and get `DRAFT_UNDRAFTED` 1 (bio observed 0.9664 -> 0.9663, career 0.6927 -> 0.6927) [final#9].
- `15e94146`, `078b75df` + `366e06a5` (FA2):
  - `GP_RATIO` counts regular-season games only. The All-Star Game's pseudo-team counted as a second team and roughly doubled the ratio of every All-Star row (median 3.58 against 1.52), and preseason and playoff games inflated the rest. All 5,154 values move: All-Star rows by a median 0.448x, the others 0.883x. Its correlation with the injury target rises to r = 0.912 (still a warning, not a gate) [final#7].
  - A percentage with no attempt behind it is missing instead of 0.0 at mask 1 (and the a = 0 shrinkage's season prior). Attempts are proven by a per-100 rate above 0, a non-zero percentage, or a game-log count (2015-16 on); a rate rounded to 0.0 with no count is undecided and missing too. Before 2015-16 no cache counts attempts. Masked: `FG3_PCT` 1,565, `FT_PCT` 56, the `_3PM` assisted/unassisted pair 2,736 rows (no made three), the `_2PM` pair 7, the `_FGM` pair 1, `CATCH_SHOOT_FG3_PCT` 20 (efficiency observed 1.0 -> 0.9875, shotmix 1.0 -> 0.9674). The season prior is now the mean over rows with attempts. 84 rows whose rate rounded to 0.0 keep a measured value, weighted by their count [final#8].
  - **`FG3_PCT` and `FT_PCT` are two of the frozen 14 game columns.** So the transparent 14-d baseline, `vectors.json` `v`, the map and the seeded k-means archetypes changed too. After label alignment, 2,516 rows (19.4%) change archetype. The side builders that read `v` (career cosines, roster complementarity) moved with them, and `derive_system_tags`' near-tied cluster naming swapped three tag names on 169 team-seasons: `SYSTEM_PACE_SPACE`, `SYSTEM_GRIND` and `SYSTEM_POST_HEAVY` change on 3,385 rows each, and `SYSTEM_MOREYBALL` (615 rows) and `SYSTEM_BALANCED` (297) change value too, 11,067 system cells in all (matrix_diff FA1 -> FA2).
  - `vectors.json` rows carry `vm`, the game dims nobody measured, on the 1,615 rows that have one. `build_skills` masks the skills whose composite reads one of them (shooting, efficiency, ft) and ranks those skills among the measured rows; the CQS v2 skills diagnostic ranks its formula grades the same way (`fecbf245`), so its `formula_mean_r2` stays the labels' ceiling. `build_wide_skills` leaves `shooting_gravity` ungraded there (202 rows). `skills.json` still shows an int for every cell.

The z of the left-censored career counts is not comparable across seasons before about 2008 [final#11]. `YEAR_IN_LEAGUE`, `CAREER_EXP_YEARS`, `CAREER_ACTIVE_FRAC` and `HON_ASG_CUM` are masked for careers that began before the caches do (`b7063daf`). `integrate_context` z-scores them per season over the observed rows. Until about 2007-08 those rows are mostly young careers: `YEAR_IN_LEAGUE` is observed on 92 of 393 rows in 1997-98 and 382 of 412 in 2007-08. So a raw `YEAR_IN_LEAGUE` of 2 is z +1.34 in 1997-98, -0.17 in 1999-00, -0.52 in 2001-02, and about -0.95 from 2007-08 on. The values are measured, and the drift predates the branch (before P11 the pool held lower-bound counts instead). Standardising these columns over all seasons, or over 2008 on, would change every season's values; that is the owner's call and is not done here.

These fixes live in two places. The `build_vectors.py` changes (hustle, form, `DRAFT_UNDRAFTED`, salaries, the bio caches, the undefined percentages) reach anything that runs the climb's 3-step prepare chain. The other fixes live in the side builders: honors, career (`GP_RATIO`, and the cosines that read `v`), pedigree, form/competition context, roster, system tags, and the skill and wide-skill labels. Their outputs sit in gitignored `pipeline/data/`, and those three steps do not rebuild them. On the training box, run `python pipeline/rebuild_all.py --refresh-context --stage matrix` once after merging, before any climb or re-baseline.

Until then the side files there are the old ones. The climb's prepare now stops at `integrate_context` with the contract violations (above) instead of training on them; it used to exit 0 and train. The contract does not compare values, though. A side file with the right coverage and the old values passes it: `career_arc.json` before `15e94146` and `roster_context.json`, `system_tags.json` and `career_arc.json` from before `078b75df` all do. Only the refresh replaces them. The skill label files are not part of the matrix either. Since `037a4d96` they carry `player_id`. Since `ce5416c4` any label file that loses more than 1% of its rows in the join stops the run, whether it joins by id or, written before `037a4d96`, by name; a smaller shortfall prints a line and trains. Every earlier snapshot's name-keyed files join all their rows, so the stop fires only on a file that really lost rows. A stale file with the same keys still trains.

`assets/drift.json` is stale too, by design. It is a lineage input that `procrustes_drift` builds from `vectors.json` `v`, the 14 game columns. The export side rebuilds it (`rebuild_all.py --stage export`, `export_assets`, `rebuild_drift_suite.py`); the matrix stage does not, and this branch does not write `assets/`. FA2 is the first package that changes `v` (`FG3_PCT`, `FT_PCT`): rebuilt from FA2's `vectors.json` into scratch, the chained rotations move by up to 0.20 per element (2014-15; median of the per-season maxima 0.15, 29 of 30 seasons), while FA1's `vectors.json` reproduces the committed chains exactly. The climb is not affected: the `ship` and `measure` recipes do not pass `--era-align`. `legacy-v5-refit` and `legacy-v6-refit` (`--era-align procrustes`) and `eval_v2`'s era-align replay rotate the new rows with the pre-FA2 chains until `--stage export` reruns `procrustes_drift`.

## Joins

Rows join on `(player_id, season)` wherever both sides carry the id: the game logs, the context artifacts, positions and, since `037a4d96`, both skill label files. Sources keyed only by name join through `name_utils`: `norm_name` for the hustle cache and salaries, and its spaceless form `bbref_key` for the Basketball-Reference caches. A skill label file written before `037a4d96` still joins by exact display name, under the same 1% stop (`ce5416c4`). `ablate_v5` passes the matrix's ids too since `ce5416c4`, so its ablations join an id-keyed label file by id, as training does. A name two players share in a season joins nothing from a name-only source. The committed `assets/vectors.json` is a hand-restored file: `d2a16d37` put back 275 suffix names (`Tim Hardaway Jr.`) that `build_vectors` writes without the suffix. So never join or look up on its display names; its rows carry `pid`. `rebuild_all.py --stage export` and `update_dataset.py --keep-vectors` rebuild the skill labels from whatever `assets/vectors.json` is on disk. With the committed file, the id join loses 3 rows, the `(pid, season)` keys it does not share with the matrix.

Rows are unchanged at 12,966, keyed the same. **The climb's 77.52 baseline (protocol 1cdf63f8c825, measured at 995b8679) is not comparable with anything trained on this branch until it is re-baselined** on the merged commit; neither is the 77.74 in `composite_score.BASELINE`.

## Rolling to a new season

`pipeline/seasons.py` holds the one season list and the split boundaries (train <= 2021, val <= 2023, test >= 2024 by start year) and says how to roll: set `LAST_SEASON`, fetch the new season on an operator machine (it refetches past the TTL until it is final), accept the contract drift, re-baseline, and add the season to `eligibility.SEASON_GAMES` (if the schedule is not 82 games) and `nba_salary_cap.CAP_BY_SEASON`.

These still spell 2025-26 (or 2026-27) themselves and need a look on the roll:

- `pipeline/build_embedding_map_manifest.py`: `bio_2025-26.json` as the current-player list, `RECENT` seasons
- `pipeline/build_front_office.py`: `season_next = "2025-26"`, the latest-season override, the 2025-26 playoff tables
- `pipeline/build_player_props_baseline.py`: its season list and the 2026-27 copy-forward stub
- `pipeline/import_team_season_cache.py`: the BBRef seasons it imports
- `pipeline/fetch_odds_sportsoddshistory.py`: the 2026-27 special case
- `pipeline/fetch_contracts.py`, `pipeline/nba_salary_cap.py`: per-season tables, one entry per new season
- `pipeline/archetype_era_audit.py`, `pipeline/trend_mtnn.py`: the "2021-2026" era bucket
- `scripts/smoke_attr.py`, `scripts/smoke_fit.py`: test players named by 2025-26 season
- `scripts/smoke_season.py`: compares the archetype mix against a literal 2025-26 (lines 291, 293)
- `pipeline/deadline_analysis.py`: writes "2015-16..2025-26" into its output text

## Operator runbook

1. **Rebuild the matrix.** `python pipeline/rebuild_all.py --refresh-context --stage matrix` once after merging this branch, before any climb or re-baseline (the side files on the box are the old ones until then), and again after new caches land; `python pipeline/rebuild_all.py --stage matrix` otherwise. If the contract fails (`integrate_context` exits 2 and prints the violations), see "The data contract".
2. **Train and promote.** `python pipeline/rebuild_all.py` trains `ship` on the resolved device and promotes it, and when the promotion passes goes on to export and verify. If `should_promote` refuses a single seed you have reviewed, `python pipeline/promote.py --run <the run dir> --force "<reason>"`, then continue with `--stage export`.
3. **Export.** `python pipeline/rebuild_all.py --stage export`, then `--stage verify`. Review `git status` and `git diff --stat assets/`.
4. **Mirror and check.** `python scripts/sync_public.py --check`, then `python scripts/sync_public.py`, `python scripts/stamp_assets.py`, and `python scripts/check_served_model.py`, which must exit 0 before anything is committed.
5. **Re-baseline.** Before any climb arm on a new matrix or protocol: first step 1 with `--refresh-context` (once after merging, then whenever caches changed) and confirm `python pipeline/stage_contract.py` exits 0, then `climb.py vector-hoops --baseline` in herdmux, on cuda, six seeds, on the commit being measured. The climb's prepare runs the contract check inside `integrate_context` and stops on a violation, but a baseline measured on a refreshed, passing matrix is the one the arms are judged against.
6. **Deploying.** Pushing `master` deploys the site. Local `master` and `origin/master` share no history; decide how the backend lands there (see the branch writeup) before any push.

## Follow-ups outside this repo (herdmux)

- The climb's drift check (`gpu/climb.py` `SURFACE`: `pipeline/train_`, `build_`, `enrich_`, `integrate_`, `composite_`, `eval_`) misses files that now decide what a run measures: `pipeline/mtnn_metrics.py`, `mtnn_recipe.py`, `mtnn_loop.py`, `artifact_io.py`, and also `seasons.py` (the split boundaries `mtnn_metrics` imports) and `name_utils.py` (the joins `build_vectors` and `enrich_vectors` use).
- `classify_exit` calls any nonzero exit without a traceback infra. `train_mtnn` exits 3 on a non-finite loss or embedding, with a message and no traceback, so a recipe that diverges is retried as a harness failure instead of discarded. The new position-label stop (exit 1, no traceback) is a broken prepare step, so infra is right for that one, and so is `integrate_context`'s contract stop (exit 2, no traceback); the runner may retry it, and it fails the same way each time until the side files are rebuilt or the drift is accepted.
- The climb has no way to pass a flag to `integrate_context` (extra build flags go to `build_vectors`), which is why the contract opt-out for a layout-changing build arm is the `HOOPS_NO_CONTRACT=1` environment variable. A per-step flag in the protocol would be cleaner, and storing `composite.matrix_fingerprint` in `baselines.json` and the journal would let a baseline/arm matrix mismatch be seen after the fact.
- `measure.json`'s parity with the climb's pinned flags is tested only where herdmux is checked out (`tests/test_recipes.py` skips otherwise, so CI never runs it). A change to either side has to be made on both.

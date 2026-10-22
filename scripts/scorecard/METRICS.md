# Scorecard metrics (K1)

`python -I scripts/scorecard/run.py --out <file>` recomputes the product scorecard (coverage, freshness, speed,
accuracy) and the model scorecard. Each metric is one record:

```json
{"value": 12966, "unit": "player-seasons", "command": "python -I scripts/scorecard/run.py ... :: coverage.site_player_seasons",
 "inputs": [{"path": "assets/vectors.json", "sha256": "...", "bytes": 4133521}], "fetched_at": null}
```

`fetched_at` is null for a number the checkout alone answers. For a number from a saved NBA response it is that
response's own fetch time (the cache's meta or fetch log), never the time of this run. A value that could not be
computed is `null` with a `reason`; it is never 0. The document also carries `git_sha`, `git_dirty`, `mode` and the
cache directories used. Stdlib only.

## Modes and the NBA side

- `--offline`: no network. Answers what the checkout and any cache directory given can answer.
- default (live-site): plain GETs to https://hoops.dumbmodel.com for the realtime snapshot and the time to response
  headers per page, through `nbafetch.Fetcher` (>= 1 s apart, logged to `<out>.fetch_log.jsonl`).
- **stats.nba.com and cdn.nba.com are not fetched in this wave.** `nbafetch.Fetcher.get` refuses both hosts unless a
  caller passes `allow_nba=True`, and `run.py` never does (`--fetch-nba` exits 3 and writes nothing). NBA-side
  numbers come from saved responses: `--stats-cache` (wave 1's B-COV layout, `<name>.body` + `<name>.meta.json`),
  `--acc-cache` (B-ACC layout, `lds_<MeasureType>_<PerMode>_<RS|PO>_<season>.json`, fetch times from the
  `fetch_log.jsonl` beside it), `--cdn-cache` (`scheduleLeagueV2.json` and optionally `todaysScoreboard_00.json`,
  each with a `.meta.json`). Without one they are null with reason `no-fetch-this-wave`.
- When NBA fetches are allowed again, `nbafetch.STATS_HEADERS` is the only header set: pipeline/nba_http.py's
  `_STATS_HEADERS` plus the Chrome 120 User-Agent wave 1 recorded as H1 (evidence/B-COV/header-rules.json; Cam's
  D8). No cookie warm-up, no Sec-Fetch-*. A test pins the dict to nba_http.py by AST. Per-host spacing (2 s for
  both NBA hosts) is box-wide: the last request time lives in `$SCORECARD_FETCH_STATE/<host>.last` (default under
  the temp dir), read and written under an mkdir lock, so two processes cannot undercut it (wave 1 finding P-2).

## Metrics

Noise bands are TARGETS.md's (2026-10-22). Definitions follow wave 1's readers, whose scripts and verdicts are in
`writeups/hoops-sota-2026-10-21/evidence/B-*` and `B-CRIT/critic.md`.

### Coverage (`coverage.py`)

| Metric | Definition | Source | Noise band |
|---|---|---|---|
| site_player_seasons | rows of assets/vectors.json `players` | repo | 0 |
| site_players_distinct_pid | distinct `pid` (= stats.nba.com PLAYER_ID) in those rows; the slug count is one lower (`charles-smith` merges two) | repo | 0 |
| site_rows_mpg_over_48 | rows whose served `mpg` is over 48: it is MIN per 100 possessions (build_vectors.py `--minutes-source per100`) | repo | 0 |
| site_seasons_with_rows | seasons with any row, of 81 (1946-47..2026-27) | repo | 0 |
| site_gate_replica_matches_site | seasons where the site's gate (GP >= min_gp, GP x per-100 MIN >= min_total) over pipeline/cache/dashbase_<s>.json gives exactly the site's pids | repo | 0 |
| site_regular_season_games | null: the site serves no regular-season game rows | repo | - |
| nba_player_seasons_1996_2025 | leaguedashplayerstats Totals players with GP > 0, summed over 1996-97..2025-26 | stats cache | ±0.12% |
| nba_player_seasons_gate_as_built / _as_stated | the same list through the site's gate with per-100 MIN / with real total MIN | stats cache | ±0.12% |
| site_rows_under_stated_minutes_gate | site rows whose real total MIN misses the stated gate | stats cache | 0 given the cache |
| nba_regular_season_games_1946_2025 | distinct GAME_ID in leaguegamelog T, 1946-47..2025-26 | stats cache | 0 given the cache |
| seasons_site_equals_nba_under_site_gate | seasons whose site pids equal the NBA list through the site's own gate | stats cache | 0 |
| seasons_site_equals_nba_face_value | seasons whose site pids equal every NBA player with GP > 0, of 81 (a season with no NBA list is not equal) | stats cache | 0 |

### Freshness (`freshness.py`)

| Metric | Definition | Source | Noise band |
|---|---|---|---|
| site_scoreboard_as_of | `as_of` of assets/realtime/scoreboard.json, the only served file with scores | repo (offline) or a GET of the site's copy | 0 |
| site_scoreboard_age_minutes | run time (or GET time) minus `as_of` | same | ± run cadence |
| nba_finals_listed | regular-season (002) games with gameStatus 3 in the cached schedule and today's scoreboard | cdn cache | + ~6 min on final_at (B-FRESH) |
| finals_with_result_on_site | finals the served scoreboard shows in state "post" with both teams and scores equal | cdn cache + site | ± reprobe cadence |
| lag_p95_minutes | null until a final is seen on the site; a lag needs a first on-site sighting kept across runs | - | - |

### Speed (`speed.py`)

| Metric | Definition | Source | Noise band |
|---|---|---|---|
| page_bytes | pages whose gate bytes exceed budgets.json; `detail.pages` has every page's gate bytes, budget and the referenced-uncounted bytes | repo: git blob sizes at HEAD; the gate's parser imported from scripts/budget_check.py (read only) | 0 (git objects) |
| index_gate_bytes, index_budget_bytes | index.html's gate bytes and budget | same | 0 |
| index_referenced_uncounted_bytes | CSS/JS/JSON that index.html or its counted CSS/JS reference (resolved as a browser does) and the gate does not count | same | 0 |
| pages_over_1mb_incl_referenced | pages whose gate bytes plus referenced-uncounted CSS/JS/JSON exceed 1,000,000 B (B-SPEED's line) | same | 0 |
| ttfb_median_ms | live only: median over pages of the median time to response headers over `--ttfb-runs` GETs (fresh connection each, like curl's time_starttransfer) | site GETs | ±55 ms |

### Accuracy (`accuracy.py`)

| Metric | Definition | Source | Noise band |
|---|---|---|---|
| rendered_mismatches | wave 1's seeded sample (seed 20261021): A, players.html next-season Actual values (5 per season); B, playoff-swing rows (40 rows x 3 values); compared within B-ACC's tolerances | repo + acc cache | integers exact; derived per B-ACC tolerances.json; Wilson 95% in detail |
| served_mismatches | D, served-not-rendered vectors.json gp / mpg / total_min (4 player-seasons per season) against Base Totals GP, MIN/GP, MIN | repo + acc cache | same |
| served_rows_under_stated_minutes_gate | sampled D player-seasons whose official total MIN is under 450 | repo + acc cache | Wilson 95% in detail |

### Model (`model.py`)

| Metric | Definition | Source | Noise band |
|---|---|---|---|
| served_products_scored_2026_27 | served forecast products (next_profile_eval, paper_trades, arc_priors_2026-27, timesfm_forecasts) with any score on a 2026-27 row | repo | 0 |
| next_profile_vs_carry_forward | next-profile head minus last-season carry-forward, primary macro MAE (era-z), held-out targets >= 2024-25, per-feature MAE rounded to 4 dp first as B-MODEL did | repo | paired player-clustered CI width ~0.025 (B-CRIT) |
| retrieval_test_top1 | recorded adjacent-season retrieval test top1 (assets/eval_scoreboard.json), baseline in detail | repo (recorded, not recomputed) | - |
| arc_ridge_test_macro_mae | recorded arc-ridge-v1 held-out macro MAE (assets/arc_priors_2026-27.json forecaster_metrics) | repo (recorded) | - |
| served_lineage_cqs | assets/mtnn_lineage.json metrics.cqs; null today (forced promotion). Origin's CQS baseline is F1's | repo | F1's seed sd |
| served_lineage_forced | assets/mtnn_lineage.json `forced` | repo | - |

## Reproducing wave 1

From a clean checkout of this branch, with the program's evidence directory on the box
(`EV=C:/Users/jcdav/writeups/hoops-sota-2026-10-21/evidence`):

```
python -I scripts/scorecard/run.py --offline --out /tmp/sc.json \
  --stats-cache $EV/B-COV/raw --acc-cache $EV/B-ACC/nba_cache --cdn-cache $EV/B-FRESH/cache/20261022T021925Z
```

Expected against BASELINE.md (origin/master 50697c11): 12,966 player-seasons; 2,427 pids; 9,508 rows with mpg > 48;
14,569 NBA player-seasons 1996-2025; 2,560 rows under the stated gate; 68,524 games; 30 seasons equal under the
site's gate and 0 at face value; index.html 2,465,565 gate bytes against 3,661,824, plus 2,061,954 referenced and
uncounted; 6 pages over 1 MB with those counted; rendered 0 of 245, served 240 of 360, 22 of 120 under the gate;
0 served products scored; next-profile +0.0255 on 639 test rows; top1 0.438 vs 0.0785. With
`--cdn-cache $EV/B-CRIT/rerun/B-FRESH/cache/20261022T023157Z` the finals count is the critic's 02:32Z one. The
snapshot age grows with the clock; `as_of` must stay 2026-10-20T19:01:25Z until something refreshes it.

## Where daily outputs go

`bench/scorecard/<UTC date>.json` (with its `.fetch_log.jsonl`). `.vercelignore` drops `/bench/` and `/scripts/`
from the deploy, so neither the harness nor its outputs are served. This PR commits no output; a daily job that
writes and commits them is a separate item.

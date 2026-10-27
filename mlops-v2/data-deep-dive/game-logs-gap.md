# GAME-LOGS-GAP — what the 143-column chain is actually missing

Scope: read-only investigation of `~/workspace/vector-hoops-mlops-v2/pipeline/`
(`rebuild_all.py` context order, `contracts/train_matrix.contract.json`,
the side builders, `real_caches.py`, `fetch_gamelogs.py`, `fetch_team_season.py`).
No fetches run, no checkouts written. Ground truths confirmed on disk in this
checkout: `pipeline/data/` does not exist at all (gitignored wholesale —
`.gitignore:3 pipeline/data/`), so every `pipeline/data/*.json` below is
missing here, not just the gamelogs. `assets/vectors.json` is present
(4,133,521 bytes, 2026-10-27).

## 0. How to read the "70 missing columns"

The contract file holds 143 columns, 12,966 rows, FA2 matrix sha256
`60dba1cbeabd6e03` (UNVERIFIED as a build — see §3). The 70 is a **set
difference, not a suffix**: contract column order interleaves base and
context columns (e.g. `FORM_*` and three `HUSTLE_*` sit inside the first 73
positions). Grouped by contract family, the 70 columns outside the verified
73-column base are:

| family | n | columns |
|---|---|---|
| playoffs | 14 | `PO_GP, PO_MIN, PO_MIN_DELTA, PO_USG_DELTA, PO_PTS_DELTA, PO_EFF_DELTA, PO_PLUS_MINUS, PO_TEAM_WINS, PO_ROUNDS, PO_SERIES, PO_CLOSE_GAMES, PO_AVG_PTS, PO_HIGH_PTS, PO_CLUTCH_PTS` |
| career | 12 | `YEAR_IN_LEAGUE, LAG1_COSINE, DELTA_NORM, GP_RATIO, DRAFT_SLOT_Z, CAREER_SLOPE_3Y, CAREER_GAP_YEARS, CAREER_TEAM_CHANGE, CAREER_EXP_YEARS, CAREER_MPG_SLOPE, CAREER_GP_SLOPE, CAREER_ACTIVE_FRAC` |
| pedigree | 7 | `PED_PICK_QUALITY, PED_ROUND_ONE, PED_UNDRAFTED, PED_EXPECT_SLOT, PED_TEAM_WINPCT, PED_YEARS_SINCE, PED_PICK_DECAY` |
| system | 6 | `SYSTEM_PACE_SPACE, SYSTEM_MOREYBALL, SYSTEM_GRIND, SYSTEM_POST_HEAVY, SYSTEM_TRANSITION, SYSTEM_BALANCED` |
| roster | 5 | `ROSTER_MIN_RANK, ROSTER_USAGE_CROWD, ROSTER_COMPLEMENT, ROSTER_STAR_GAP, ROSTER_MATES_N` |
| team | 5 | `TM_PACE, TM_OFF_RTG, TM_DEF_RTG, TM_NET_RTG, TM_WIN_PCT` |
| honors | 5 | `HON_ALL_NBA_TEAM_LAG, HON_ALL_NBA_VOTE_LAG, HON_ASG_LAG, HON_ASG_CUM, HON_VOTE_RECOG` |
| competition | 4 | `SOS_NET_RTG, B2B_RATE, REST_AVG, CONF_STRENGTH` |
| injury | 4 | `INJ_GP_PCT, INJ_MISS_N, INJ_MAX_MISS_STREAK, INJ_MISS_SPELLS` |
| market | 4 | `SALARY_LOG, SALARY_CAP_PCT, SALARY_TEAM_PCT, SALARY_RANK_POS` |
| defense (hustle tail) | 3 | `HUSTLE_DEFLECTIONS, HUSTLE_LOOSE_BALLS, HUSTLE_SCREEN_AST` |
| bio | 1 | `DRAFT_UNDRAFTED` |

Two reconciliations with the brief's shorthand (flagged, not silently fixed):
- **Form 5 are value-blocked but width-present in the base.** `build_vectors.py`
  `FORM_FEATURES` (`FORM_VOL, FORM_CEIL, FORM_DD_RATE, FORM_TD_RATE, FORM_GP,
  FORM_MIN_AVG`) are computed by `compute_form_features()` from the gamelogs;
  with no gamelog file it returns `{}` (build_vectors.py:665-668), so the
  base silently carries zero/masked form. `FORM_GP` is then deliberately
  excluded from the contract (`integrate_context.py`: "FORM_GP is availability,
  not form", r=+0.9676 vs `INJ_GP_PCT`). So form counts toward the gamelog
  block but not toward the 70.
- **Pedigree is 7 by the contract file, not 2.** The brief's "pedigree
  expansion 2" does not match `train_matrix.contract.json` (all 7 `PED_*`
  columns sit outside the first-73 positions). Treat 7 as authoritative
  unless the parent confirms a different base-73 set — the base-73 membership
  itself cannot be verified on this checkout because `pipeline/data/` is absent.
- **Defense/playmaking count differences** = the 3 hustle-tail columns above
  (wide-skills defense via `build_vectors.load_wide_skills_defense`, NOT
  gamelogs) plus `SALARY_LOG`/`DRAFT_UNDRAFTED` already carried by the base
  build via salary history / bio and refreshed by `integrate_context`.

FA2 family coverage already bakes in the gamelog-era limit: form 0.3975,
competition 0.3975, injury 0.3975, roster 0.2611, team 0.2611, system 0.2611 —
i.e. even a "complete" 143 has pre-2015-16 rows masked for every gamelog
family. A rebuild that reproduces those coverages is the success criterion,
not 1.0 coverage.

## 1. Missing-file table (all six columns per file)

Key to (f): KEEP = usable as-is or with a small adapter; KILL = does not
substitute for the stated purpose. "Present" below means verified in this
checkout's `pipeline/cache/` (counts in §4).

### 1a. Directly gamelog-gated (no gamelogs → no output, or empty output)

| # | (a) file / pattern | (b) producer | (c) fields actually read by the consumer | (d) contract columns / families unblocked | (e) season coverage + game-type filter | (f) alternate source + verdict |
|---|---|---|---|---|---|---|
| G1 | `pipeline/data/gamelogs_YYYY-YY.jsonl` × 11 seasons, 2015-16…2025-26 | `pipeline/fetch_gamelogs.py` → `nba_api` `playergamelogs.PlayerGameLogs(season_nullable=<season>)`, stats.nba.com. One JSONL per season, all game types kept in the file; **operator machine only** (stats.nba.com blocks datacenter IPs — `real_caches.OPERATOR`). Seasons pinned by `seasons.GAMELOG_FIRST_SEASON="2015-16"`, `LAST_SEASON="2025-26"` | File schema (`KEEP`, 18 cols): `PLAYER_ID, PLAYER_NAME, TEAM_ID, TEAM_ABBREVIATION, GAME_ID, GAME_DATE, MIN, PTS, AST, OREB, DREB, STL, BLK, TOV, FGA, FG3A, FTA, PLUS_MINUS`. Per-consumer reads: form — `MIN, PTS, AST, OREB+DREB, STL, BLK, GAME_ID, PLAYER_ID`; roster — `MIN, PLAYER_NAME, PLAYER_ID, TEAM_ID, TEAM_ABBREVIATION`; min_gp — `GAME_ID, PLAYER_ID, MIN, PLAYER_NAME`; availability — `GAME_ID, TEAM_ID, PLAYER_ID, GAME_DATE, MIN`; career GP_RATIO — `GAME_ID, PLAYER_ID, TEAM_ID`; competition — `GAME_ID, TEAM_ID, PLAYER_ID, GAME_DATE, MIN` | Everything in rows G2–G7 below: form 5, roster 5, career `GP_RATIO` (+ MPG/GP slopes via G3), competition 4, injury 4 (via G4), and indirectly team 5 + system 6 (both join on roster `teamId`) | File must contain **all game types** as fetched (2023-24 file: 2,078 preseason + 1,685 playoff + 24 All-Star + 120 play-in + 26 Cup-final rows beside 26,401 regular-season rows). Consumers filter to regular season via `seasons.is_regular_season` (`GAME_ID` prefix `002`) — **except roster (G5), which does NOT filter** and therefore sums preseason/playoff minutes into rotation minutes (known skew, confirm before trusting `ROSTER_MIN_RANK`). Pre-2015-16: no file by design; those rows stay masked | **BBRef per-game logs: KILL as a substitute.** No `PLAYER_ID`/`GAME_ID`-002 join keys matching the builders, no shared-`GAME_ID` opponent join for competition, no per-game `MIN` sequence in the builders' shape; would need a new keyed builder + revalidation. Usable only as an aggregate cross-check on GP/MPG. **stats.nba.com `leaguegamelog`: KEEP as fallback only** if `playergamelogs` is blocked — same source family and same IP-block caveat, different row shape, needs an adapter to the 18-col `KEEP` schema. **Cached `cache/bbref_per_game_*.json`: KILL** — season aggregates, not per-game logs |
| G2 | `pipeline/data/form_context.json` | `pipeline/form_context.py`, which calls `build_vectors.compute_form_features(season)` per gamelog file and joins to `assets/vectors.json` on `(PLAYER_ID, season)` | Reads `compute_form_features` output: `FORM_VOL, FORM_CEIL, FORM_DD_RATE, FORM_TD_RATE, FORM_GP, FORM_MIN_AVG` (per-36 scoring CV, 95th-pct game PTS, DD/TD rates over 5 stat cats ≥10, GP, avg MIN). Only players with ≥10 regular-season games with `MIN>0` get a row | form 5 (`FORM_VOL, FORM_CEIL, FORM_DD_RATE, FORM_TD_RATE, FORM_MIN_AVG`); `FORM_GP` deliberately NOT a contract column | 2015-16…2025-26 only; regular-season `002` only; pre-2015 masked ("Mask-honest pre-2015") | None — derivation only. KILL any aggregate substitute: DD/TD rates and scoring CV need the per-game sequence |
| G3 | `pipeline/data/min_gp.json` | `pipeline/build_min_gp.py --offline` (the rebuild order's flag). Gamelog path first; fallback `from_api` reads `pipeline/cache/pergame_<season>.json` (LeagueDashPlayerStats PerGame) or fetches it online | Output rows: `player_id, name, season, MPG, GP` (honest per-game values; `vectors.json` mpg is minutes/100 possessions and must NOT be used). Read by `build_availability` (pre-gamelog fallback) and `build_career_context.load_min_gp` (honest MPG/GP) | career `CAREER_MPG_SLOPE, CAREER_GP_SLOPE` (via honest MPG/GP windows) + `GP_RATIO` context; availability pre-2015 `GP_PCT`-only fallback | 2015-16+ from gamelogs (regular-season `002`, `MIN>0`); pre-2015 only via `pergame_*.json` — **those caches are ABSENT in this checkout** (no `cache/pergame_*` files), so under `--offline` pre-2015 seasons are skipped with a warning, not filled | **BBRef per-game aggregates (`cache/bbref_per_game_*.json`, present 1996-97…2025-26): KEEP as a lagging, adapter-required candidate for pre-2015 MPG/GP only** — `build_min_gp` currently reads the LeagueDash `pergame_*.json` shape, not BBRef's, so this needs a builder change, and it can never supply streaks/spells. Does NOT block 143 width (FA2 already masks pre-2015 injury/form) |
| G4 | `pipeline/data/availability.json` | `pipeline/build_availability.py` from G1 (+ G3 as pre-gamelog fallback) | Output rows: `player_id, name, season, GP, TEAM_GAMES, GP_PCT, MISS_N, LONGEST_MISS_STREAK, MISS_SPELLS`. Gamelog path derives schedule from the player's primary team's game list between first/last appearance; fallback path sets streak/spells to `None` | injury 4 (`INJ_GP_PCT←GP_PCT, INJ_MISS_N←MISS_N, INJ_MAX_MISS_STREAK←LONGEST_MISS_STREAK, INJ_MISS_SPELLS←MISS_SPELLS`); plus non-contract career `CAREER_GP_PCT, CAREER_MISS_STREAK, CAREER_AVAIL_3Y` (deliberately excluded from the contract: r=+0.9999/+0.9996 vs the `INJ_*` twins) | All seasons 1996-97…2025-26 in shape, but streaks/spells only 2015-16+ (gamelog era); earlier seasons `GP_PCT`-only — and only if G3 covers them (it does not, under `--offline`, per G3) | None — derivation only. Injury-proxy by construction ("no diagnosis source"); no external injury feed is wired in |
| G5 | `pipeline/data/roster_context.json` | `pipeline/roster_context.py` from G1 + `assets/vectors.json` (charted rows keyed `(PLAYER_ID, season)`; rotation = ≥800 min) | Output entries: `name, player_id, season, team, teamId, minutes` + the 5 `ROSTER_*` values (`ROSTER_MIN_RANK` = rank by summed minutes; `ROSTER_USAGE_CROWD` = HHI of top-5 minutes; `ROSTER_COMPLEMENT` = mean `1-|cos|` vs mates' vectors; `ROSTER_STAR_GAP` = `1-cos` vs minutes leader; `ROSTER_MATES_N`). **No game-type filter** in `load_team_rosters` (see G1 skew note). Missing gamelogs → builder prints "no gamelogs — run fetch_gamelogs.py" and writes an empty-ish doc | roster 5 directly; team 5 + system 6 indirectly (both join on roster `teamId`: `integrate_context` team_index/system_index look up `(season, teamId)` from roster rows; `derive_system_tags` keys roster entries by `(name, season)`) | 2015-16…2025-26 in practice (gamelog era); rotation mates = teammates ≥800 min; FA2 roster/team/system coverage 0.2611 reflects this era limit | **Team-season files already cached: KILL as a roster substitute.** `team_base_*.json` gives team aggregates, not player-team-minutes membership, so it cannot supply `teamId` per player-season, minutes rank, or mate vectors. `build_current_rosters` is a different, served-asset use of the same logs (see §2) |
| G6 | `pipeline/data/career_arc.json` + `pipeline/data/career_sequences.npz` | `pipeline/build_career_context.py` from `assets/vectors.json` + G3 (min_gp) + G4 (availability) + G5 (roster `teamId`) + `cache/bio_*.json` (draft z) + `cache/draft_history.json` + `pipeline/data/train_matrix.npz` (matrix identity for sequencing) | Output feats per player-season: the 12 contract career columns + non-contract `CAREER_GP_PCT, CAREER_MISS_STREAK, CAREER_AVAIL_3Y`. `GP_RATIO` itself is computed directly from G1 (regular-season `002` only; traded players summed over teams, All-Star pseudo-teams excluded by the filter — `final#7`). `LAG1_COSINE/DELTA_NORM` need consecutive-season vectors; `YEAR_IN_LEAGUE/CAREER_EXP_YEARS/CAREER_ACTIVE_FRAC` are absent for careers begun before 1996-97 (`career_window`) | career 12 | All seasons for vector/lag features; `GP_RATIO` and MPG/GP slopes gamelog-era only; `CAREER_TEAM_CHANGE` needs roster `teamId` (G5) for both seasons | None — derivation only. Note the ordering trap: career reads the **pre-context** `train_matrix.npz` (build_vectors + enrich step), so it must run after those but its own output only reaches the matrix via `integrate_context` |
| G7 | `pipeline/data/competition.json` | `pipeline/competition_context.py` from G1 + `pipeline/data/team_season_<season>.json` (row T2) | Output rows: `id, name, player_id, season` + `SOS_NET_RTG` (mean opponent `NET_RATING` via shared `GAME_ID`), `B2B_RATE`, `REST_AVG` (from `GAME_DATE` gaps), `CONF_STRENGTH` (conference-mean `NET_RATING` for the player's modal team). Skips a season entirely when `team_net(season)` is empty | competition 4 | 2015-16…2025-26; regular-season `002` + `MIN>0` only | None — derivation only. Without T2, `from_logs()` yields no rows even with gamelogs present (`if not nets: continue`) |

### 1b. Indirectly gamelog-gated (derivable, but degraded until roster/team return)

| # | (a) file / pattern | (b) producer | (c) fields actually read | (d) contract columns unblocked | (e) coverage / filter | (f) alternate + verdict |
|---|---|---|---|---|---|---|
| T1 | `pipeline/data/salary_market.json` | `pipeline/build_salary_market.py` from `cache/salaries_merged.json` (PRESENT) + G5 roster (team fallback) + `nba_salary_cap.py` caps. Raises without salaries; roster missing only degrades it | Output rows: `name, player_id, season, SALARY_LOG, SALARY_CAP_PCT, SALARY_TEAM_PCT, SALARY_RANK_POS`. `SALARY_TEAM_PCT` needs a team: salary record's own `team` first, else roster `team`; payrolls need ≥8 salaried rows per team-season | market 4 (incl. `SALARY_LOG`, which the base also carries via salary history and `integrate_context` then refreshes from here) | All salaried seasons; `SALARY_TEAM_PCT` coverage rises only after G5 returns; `CAP_PCT`/`RANK_POS` unaffected by gamelogs | **Salary record's own team field: KEEP as the working fallback** — `SALARY_TEAM_PCT` is computable for rows whose salary record carries a team without any gamelog. No alternate source needed |
| T2 | `pipeline/data/team_season_YYYY-YY.json` (30 seasons, 1996-97…2025-26) | `pipeline/fetch_team_season.py --offline` merges `cache/team_base_<season>.json` + `cache/team_advanced_<season>.json` (both PRESENT, 30/30, 29–30 rows each; empty `[]` docs count as a miss per `health#8`). Online fallback: `leaguedashteamstats` Base + Advanced | Output rows: `TEAM_ID, TEAM_NAME, PACE, OFF_RATING, DEF_RATING, NET_RATING, W, L, WIN_PCT` (+ SOS candidates if the API ever returns them — it does not today). Read by: `integrate_context` team_index (`PACE→TM_PACE, OFF_RATING→TM_OFF_RTG, DEF_RATING→TM_DEF_RTG, NET_RATING→TM_NET_RTG, WIN_PCT→TM_WIN_PCT`); `competition_context.team_net` (`NET_RATING` only); `derive_system_tags.load_team_season_pace` (`PACE` only) | team 5 directly; competition 4 + system 6 indirectly (both need `NET_RATING`/`PACE` from here) | All 30 seasons; regular-season team stats (no game-type question — these are season aggregates) | **`pipeline/import_team_season_cache.py`: KEEP but unnecessary here** — backfills `team_base`/`team_advanced` from Brescou GitHub CSVs (1996-97…2022-23) + BBRef league pages (2024-25, 2025-26) if stats.nba.com is throttled. Caches are already present, so `--offline` merge is the path; do NOT refetch online first |

### 1c. NOT gamelog-gated (inputs present; files missing only because `pipeline/data/` is absent)

| # | (a) file / pattern | (b) producer | (c) fields actually read | (d) contract columns unblocked | (e) coverage / filter | (f) alternate + verdict |
|---|---|---|---|---|---|---|
| N1 | `pipeline/data/system_tags.json` | `pipeline/derive_system_tags.py` (sklearn `KMeans`, K=6, seed 7) from pre-context `train_matrix.npz` + `feature_manifest.json` + G5 roster + T2 `PACE`. No fetch at all ("everything here is already on disk") | Team-season style vectors: minutes-weighted mean of player z-scores over `PACE, PCT_PTS_3PT, PCT_PTS_2PT_MR, PCT_PTS_PAINT, PCT_PTS_FB, PCT_PTS_OFF_TOV, PCT_AST_FGM, POST_TOUCHES`; teams with <6 matched rotation players dropped; pace missing → team dropped | system 6 (one-hot from the team's assigned tag via `integrate_context` system_index) | Gamelog-era rotation teams only in practice (needs G5 + T2) | None — derivation only. Blocked transitively, not by any fetch |
| N2 | `pipeline/data/playoffs.json` (+ `assets/playoffs.json`, `assets/playoff_paths.json`) | `pipeline/build_playoffs.py` from `cache/playoffs_<season>.json` (PRESENT 30/30) + `cache/playoff_games_<season>.json` (PRESENT 30/30, optional enrichment for close games / clutch). Preflight `rc.playoffs` passes on this checkout | Cache docs: per-player playoff aggregates + per-team wins; game caches: per-game `pts` by team for margin/close-game math. Output `PO_*` 14 (incl. deltas vs regular-season rate stats) | playoffs 14 | All seasons; playoff games only by construction | Producers if caches ever go stale: `fetch_playoffs.py` (`leaguedashplayerstats`/`leaguedashteamstats`, `SeasonType=Playoffs`) and `fetch_playoff_gamelogs.py` (`leaguegamelog`, `SeasonType=Playoffs`) — both operator-machine, stats.nba.com. **Not needed now: KEEP the cached path, do not refetch** |
| N3 | `pipeline/data/pedigree.json` (+ `assets/pedigree.json`) | `pipeline/build_pedigree.py` from `cache/draft_history.json` (PRESENT) + `cache/team_base_<season>.json` (`PED_TEAM_WINPCT`). Preflight `rc.draft_history` passes | Draft pick/round/undrafted, draft-year team win pct, years since draft, pick-decay curve | pedigree 7 (see §0 note on the "expansion 2" shorthand) | Drafted + undrafted rows; `PED_TEAM_WINPCT` observed 0.6704 in FA2 | None needed. **BBRef draft pages: KILL as a replacement** — `draft_history.json` is already the merged source; re-deriving it adds join risk for zero gain |
| N4 | `pipeline/data/honors.json` (+ `assets/honors.json`) | `pipeline/build_honors.py` from `cache/honors_award_<year>.json` (PRESENT 1997…2026, 30 files) + `cache/honors_finals_mvp.json` + `cache/dashbase_*.json` (played-pids for suspect-lag logic) + draft history. Preflight `rc.honors` passes | Award index per (season, norm_name): `all_nba_team` tier, `vote_pts`, `asg`; builder lags by one season (award year N−1 → season N) and normalizes All-NBA tiers to real 15 slots (Panel v3 G3) | honors 5 — **but see the semantics decision in §3, which blocks re-pinning even though the file is derivable** | Lagged rows only where the prior season's award cache is `complete`; partial-coverage seasons emit honored rows only and mask omissions; suspect-lag rows (lost honor under a shared surname) are held back as masked | Producer if caches go stale: `fetch_honors.py` / `fetch_honors_extended.py` (operator machine). **Not needed now** |
| N5 | `pipeline/data/train_matrix.npz` + `pipeline/data/feature_manifest.json` (the 143 itself) | `pipeline/build_vectors.py --offline` (writes `assets/vectors.json` + base matrix) → `pipeline/enrich_vectors.py` → `pipeline/integrate_context.py` (merges G2, G4–G7, T1, T2, N1–N4 + `game_ratings` if available; ends with the contract check, exit 2 on drift) | Base inputs (present): `cache/dashbase_*.json, dashadvanced_*.json, dashscoring_*.json, bio_*.json, tracking_*.json` (2013-14+, pre-2013 unavailable by design, masked), `cache/wide_skills_*.json` (2015-16…2025-26, 11 files; the 2013-14/2014-15 proxy docs were deleted per `ingest#5` and `build_wide_skills` refuses proxies), salary history | All 143 when every side file above lands; the 3 hustle-tail defense columns come from the wide-skills defense path inside `build_vectors`, not from any side builder | 12,966 rows, 1996-97…2025-26; `stage_contract` gates: rows ±1%, columns + families exact **in order**, family coverage drop ≤5 pts, column zero rise ≤10 pts, per-season constants unless `CONSTANT_ALLOWED` names them | `game_ratings` (`GK_*`): NOT in the 143 contract — `integrate_context` builds it itself inside the merge and writes a `source_unavailable` doc when `cache/game_ratings_*.json` is absent/fixture-only (real_caches check). It does not block 143 width; do not chase it for this chain |

## 2. Non-matrix gamelog dependency (can lag, but note it)

- `assets/current_rosters.json` via `pipeline/build_current_rosters.py`: reads
  G1 game counts for the latest season and **raises** (`SystemExit: no gamelogs
  for {season}`) without them. It is a served asset, not a contract column,
  and it sits inside `rebuild_all --refresh-context`'s matrix stage — so a
  partial-gamelog rebuild must select around it (`--only` the builders that
  can run) rather than running the whole context block.

## 3. Non-gamelog blockers that survive gamelog return

1. **Honors semantics decision (REQUIRED before any re-pin).** Contract note:
   the promoted matrix's honors family is 0.969 observed vs 0.087 on HEAD.
   The 0.087 is the 3-step prepare chain reading stale/missing side files;
   the FA2 contract recorded *after* the side builders ran shows
   `HON_*` observed 0.81–0.97 and family coverage 0.9238 — so the gap is
   mostly "side builders not run", not "honors unbuildable". The real
   decision is narrower and still open: **zero-fill** (promoted semantics:
   every unhonored player-season is an observed 0, coverage ≈0.969) vs
   **mask-honest** (HEAD `build_honors`: unhonored = observed 0 only when
   the prior season's award cache is `complete`; partial seasons emit
   honored rows only; suspect-lag rows held back masked). The contract
   only flags *drops*, so the zero-fill direction would pass the gate
   while changing the honors tower's values ~10× in coverage terms.
   Decide, record it, and only then re-record the contract — otherwise
   the rebuild silently re-anchors on whichever semantics happened to run.
2. **Width re-pin (REQUIRED, mechanical).** `stage_contract.py` fails on any
   column/order change, and `integrate_context` drops any family under
   1% coverage (`MIN_FAMILY_COVERAGE`) — a single gated family (e.g. a
   thin `system` or `team` join) changes width and fails the run with
   exit 2. The FA2 sha `60dba1cbeabd6e03` is UNVERIFIED as a build, so
   the re-pin is not "restore FA2": it is `stage_contract.py --accept-drift`
   on a verified full rebuild, followed by re-measuring every baseline
   anchored to the old matrix (climb anchor, promoted run numbers). Until
   that happens, no rebuilt 143 can be called "the contract matrix".
3. **Pre-2015 min_gp gap under `--offline` (ACCEPT or ADAPTER, does not block
   width).** `cache/pergame_*.json` (LeagueDash) is absent, so
   `build_min_gp --offline` skips 1996-97…2014-15 and `build_availability`
   skips those seasons' fallback rows entirely. Consequence is already in
   FA2 (injury/form/competition coverage 0.3975 = gamelog-era share). A
   BBRef-aggregate adapter for pre-2015 MPG/GP (G3, KEEP) would improve
   career slopes and pre-2015 `GP_PCT` but is a builder change + revalidation,
   not a fetch, and must lag the 143 rebuild.
4. **Operator-machine + finality constraints (SCHEDULING, not files).**
   `fetch_gamelogs.py` must run where stats.nba.com is not blocked; this
   VM is not that machine. 2025-26 is not final until 2026-08-01
   (`seasons.is_final`), so its cache is TTL-refetched rather than kept
   forever — a rebuild that pins 2025-26 early will drift on refetch.
   `LAST_SEASON` is deliberately pinned at 2025-26; adding 2026-27 is a
   one-edit + full re-baseline event, not a fetch flag.
5. **Roster game-type skew (CONFIRM, one line).** `roster_context`
   does not apply the `002` filter while every other gamelog consumer
   does. Confirm whether rotation minutes should include preseason/playoff
   games; if not, that is a builder fix that moves `ROSTER_MIN_RANK` /
   `ROSTER_USAGE_CROWD` for every gamelog-era row and must land before
   the re-pin, not after.
6. **Environment, not data.** `derive_system_tags` needs sklearn
   (`KMeans`); `build_career_context` needs the pre-context matrix on disk.
   Neither is a fetch, but both fail a naive "fetch gamelogs → run
   everything" plan if the box lacks them or the matrix step is skipped.

## 4. What is already present (so the parent does not refetch it)

Verified in this checkout: `cache/team_base_*.json` 30/30,
`cache/team_advanced_*.json` 30/30, `cache/playoffs_*.json` 30/30,
`cache/playoff_games_*.json` 30/30, `cache/honors_award_*.json` 30 files
(1997…2026), `cache/draft_history.json`, `cache/salaries_merged.json`,
`cache/wide_skills_*.json` 11 files (2015-16…2025-26),
`cache/bbref_per_game_*.json` 30/30 (aggregates only — see G1 KILL),
`cache/dashbase/dashadvanced/dashscoring/bio_*.json` 30/30,
`assets/vectors.json` present. Absent: all of `pipeline/data/`
(including `team_season_*.json`, which is a free `--offline` merge away),
all `cache/pergame_*.json`, all `gamelogs_*.jsonl`.

## 5. Dependency-ordered fetch list

**Tier 0 — run first, no gamelogs needed (unblocks everything downstream
that is not itself gamelog-derived):**
1. `pipeline/fetch_team_season.py --offline` → T2 `team_season_*.json`
   (30 seasons from present caches). Zero network, zero decisions.
2. `pipeline/build_vectors.py --offline` + `enrich_vectors.py` → base matrix
   + refreshed `assets/vectors.json` (every side builder reads it).
   This also restores the base form/hustle values that are currently
   zero/masked — but form stays empty until Tier 1 lands.

**Tier 1 — the single blocking fetch (operator machine only):**
3. `pipeline/fetch_gamelogs.py` → G1 `gamelogs_2015-16.jsonl` …
   `gamelogs_2025-26.jsonl` (11 files, all game types in-file).
   Partial coverage is usable per-season (builders glob per season),
   but form/roster/competition/injury coverage for a missing season
   is zero for that season's rows — do not re-pin on a partial set.

**Tier 2 — derivations, in `rebuild_all --refresh-context` order
(roster before everything that joins on its teams; availability before
career; honors before player_meta):**
4. `roster_context.py` (G5) → `build_min_gp.py --offline` (G3) →
   `build_availability.py` (G4) → `build_career_context.py` (G6) →
   `form_context.py` (G2) → `competition_context.py` (G7, needs T2) →
   `derive_system_tags.py` (N1, needs G5 + T2 + base matrix).
5. In parallel with Tier 2 (no gamelog dependency):
   `build_playoffs.py` (N2), `build_pedigree.py` (N3),
   `build_honors.py` (N4 — file derivable now, but its **semantics
   decision (§3.1) must be recorded before its output is trusted**),
   `build_salary_market.py` (T1 — `TEAM_PCT` improves after G5).
6. `integrate_context.py` → `stage_contract.py` (expect exit 2 on first
   full run; that is the re-pin trigger, §3.2 — not a failure to hide).
   `build_current_rosters.py` only after G1 covers the latest season.

**Tier 3 — can lag indefinitely without blocking 143 width:**
- Pre-2015 `min_gp` BBRef adapter (G3 KEEP candidate) + its revalidation.
- `fetch_playoffs` / `fetch_honors` / `fetch_team_season` online refreshes
  (caches present; refetch only on staleness).
- `game_ratings` operator scrape (not a contract family).
- Roster `002`-filter fix (§3.5) — but if it is adopted, it must land
  **before** the §3.2 re-pin, so it belongs in Tier 2's window, not Tier 3's.

## Verdicts

VERDICT: BLOCKED — gamelog-blocked 143 chain — ~/workspace/mlops-v2-drafts/data-deep-dive/game-logs-gap.md
VERDICT: FAIL — gamelogs_2015-16..2025-26 absent (pipeline/data/ absent entirely) — ~/workspace/mlops-v2-drafts/data-deep-dive/game-logs-gap.md
VERDICT: PASS — team_season derivable offline from present caches (no fetch needed) — ~/workspace/mlops-v2-drafts/data-deep-dive/game-logs-gap.md
VERDICT: PASS — playoffs/pedigree/honors/salary inputs present (files derivable without gamelogs) — ~/workspace/mlops-v2-drafts/data-deep-dive/game-logs-gap.md
VERDICT: BLOCKED — honors semantics decision + width re-pin still open after gamelogs return — ~/workspace/mlops-v2-drafts/data-deep-dive/game-logs-gap.md

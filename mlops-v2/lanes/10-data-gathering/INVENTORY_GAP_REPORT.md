# Scope A — Inventory and Gap Report (FIRST deliverable)

Scope A owner: lanes/10-data-gathering. Date measured: 2026-10-26 (CDT).
Source checkout measured: `~/workspace/vector-hoops-mlops-v2`
(the mlops-v2 checkout; the row master is its `assets/vectors.json`).
Contract: `~/workspace/mlops-v2-drafts/CONTRACT.md` §0, §6, §10.
Objective, per the 22:32 user correction: NEXT-SEASON OVERALL STAT
PREDICTION (14-d game-vector forecast, MAE/R², expanding-window CV +
new-player slice). Twins are a product surface, not the objective.
Collection below is judged by what it feeds: stat prediction,
shot-position features, and text features.

Status words used in this report:
- MEASURED — counted from a file on disk by this lane on 2026-10-26.
- CLAIM — stated in a fetcher script, a code comment, or the contract,
  and NOT yet measured on disk. A claim is not coverage.
- ABSENT — searched for and not found on disk in this checkout.

No bulk fetch ran for this report. This report is the gate before
any bulk fetch (contract §10, Scope A).

## 0. Headline gap numbers

| Category | Seasons with data on disk | Seasons missing | Coverage |
|---|---|---|---|
| Regular-season game logs (`gamelogs_*.jsonl`) | 0 of 30 | 30 of 30 (1996-97 through 2025-26) | 0% |
| Playoff game logs (`playoff_games_*.json`) | 30 of 30 | 0 | 100% of seasons (playoffs only — NOT a substitute for regular-season logs) |
| Shot coordinates, ShotChartDetail LOC_X/LOC_Y | 0 of 30 | 30 of 30 | 0% (0 hits for `LOC_X` anywhere in the cache) |
| Shot coordinates, PBP x/y | 0 of 30 full seasons; 5 games of 2026-27 only (outside the 30-season window) | 30 of 30 | 5 games, 1 week, 0 historical seasons |
| Shot coordinates, alternate snapshots (BBR + ESPN) | 0 of 30 full seasons; 3 games of 2026-10-20 only | 30 of 30 | 1 date, 2 sources, same 3 games |
| Play-by-play, stats + text (full seasons) | 0 of 30 | 30 of 30 | 0% |
| Play-by-play, stats + text (any game) | 5 games of 2026-27 only | — | 3,152 actions total |
| Season-summary cache (dashboards / bio / BBRef / tracking / matchup / team) | 30 of 30 for the core families (see §4) | 0 for core families | 100% of seasons for the 73-column base build |

The single largest gap is the regular-season game log: 0 files.
It blocks the 143-column full-context chain (contract §9, S1).
The 73-column verified base (12,966 × 73, sha256 `2422e56a…`)
is the fallback, not the destination.

## 1. What was counted, and how

- Cache root: `pipeline/cache/` — MEASURED: 445 top-level entries,
  788 files including subdirectories, 105 MB (`du -sh`, 2026-10-26).
  This matches the coordinator-verified starting point exactly.
- Row master: `assets/vectors.json` — MEASURED: 12,966 player rows,
  built 2026-10-11, 14-d `v` per row, seasons 1996-97 through 2025-26.
  Per-season row counts are in §5.
- PBP files: `pipeline/cache/cdn_pbp/` — MEASURED: 5 files.
  NOTE ON LOCATION: the contract brief says "`cdn_pbp/` holds 5 games".
  On disk the directory is `pipeline/cache/cdn_pbp/`, not a top-level
  `cdn_pbp/`. Same 5 files, same game IDs. The brief's path is
  shorthand; the cache path is authoritative.
- Replays: `assets/replays/` — MEASURED: 6 entries (5 game JSONs +
  `index.json`), 340 KB total, the SAME 5 game IDs as the PBP files.
  Replays are a presentation derivative of the PBP feed, not an
  independent data source. Do not count them as separate coverage.
- Gamelog search: `find` for `gamelogs_*.jsonl` under the checkout
  returns nothing, and `pipeline/data/` (the directory
  `fetch_gamelogs.py` writes to) does not exist in this checkout.
  ABSENT, not merely uncommitted-elsewhere: the build code itself
  treats a missing gamelog file as "return empty" (`build_vectors.py`,
  `gamelog_attempts` / `compute_form_features`), which is exactly
  why the base build succeeds without gamelogs and the full-context
  chain does not.

## 2. Per-season coverage table (30 seasons, 1996-97 through 2025-26)

Legend: ● = file(s) present for the season. ○ = absent for the season.
"Reg GL" = regular-season game logs. "PO GL" = playoff game logs.
"PBP" = full-season play-by-play. "Shot XY" = any per-shot coordinate
source for the season (ShotChartDetail, PBP x/y, BBR, ESPN).
Core summary = dashbase / dashadvanced / dashscoring / bio /
bbref_per_game / bbref_advanced / matchup_enriched / team_base /
team_advanced / official totals (all 30 seasons, see §4).

| Season | Rows in vectors.json | Reg GL | PO GL | PBP | Shot XY | Core summary | Tracking |
|---|---|---|---|---|---|---|---|
| 1996-97 | 398 | ○ | ● | ○ | ○ | ● | ○ (pre-2013, structural) |
| 1997-98 | 393 | ○ | ● | ○ | ○ | ● | ○ |
| 1998-99 | 377 | ○ | ● | ○ | ○ | ● | ○ |
| 1999-00 | 397 | ○ | ● | ○ | ○ | ● | ○ |
| 2000-01 | 395 | ○ | ● | ○ | ○ | ● | ○ |
| 2001-02 | 402 | ○ | ● | ○ | ○ | ● | ○ |
| 2002-03 | 394 | ○ | ● | ○ | ○ | ● | ○ |
| 2003-04 | 394 | ○ | ● | ○ | ○ | ● | ○ |
| 2004-05 | 415 | ○ | ● | ○ | ○ | ● | ○ |
| 2005-06 | 428 | ○ | ● | ○ | ○ | ● | ○ |
| 2006-07 | 418 | ○ | ● | ○ | ○ | ● | ○ |
| 2007-08 | 412 | ○ | ● | ○ | ○ | ● | ○ |
| 2008-09 | 407 | ○ | ● | ○ | ○ | ● | ○ |
| 2009-10 | 413 | ○ | ● | ○ | ○ | ● | ○ |
| 2010-11 | 420 | ○ | ● | ○ | ○ | ● | ○ |
| 2011-12 | 435 | ○ | ● | ○ | ○ | ● | ○ |
| 2012-13 | 430 | ○ | ● | ○ | ○ | ● | ○ |
| 2013-14 | 434 | ○ | ● | ○ | ○ | ● | ● |
| 2014-15 | 450 | ○ | ● | ○ | ○ | ● | ● |
| 2015-16 | 437 | ○ | ● | ○ | ○ | ● | ● |
| 2016-17 | 441 | ○ | ● | ○ | ○ | ● | ● |
| 2017-18 | 460 | ○ | ● | ○ | ○ | ● | ● |
| 2018-19 | 457 | ○ | ● | ○ | ○ | ● | ● |
| 2019-20 | 448 | ○ | ● | ○ | ○ | ● | ● |
| 2020-21 | 484 | ○ | ● | ○ | ○ | ● | ● |
| 2021-22 | 488 | ○ | ● | ○ | ○ | ● | ● |
| 2022-23 | 464 | ○ | ● | ○ | ○ | ● | ● |
| 2023-24 | 484 | ○ | ● | ○ | ○ | ● | ● |
| 2024-25 | 500 | ○ | ● | ○ | ○ | ● | ● |
| 2025-26 | 491 | ○ | ● | ○ | ○ | ● | ● |
| TOTAL | 12,966 | 0/30 | 30/30 | 0/30 | 0/30 | 30/30 | 13/30 |

Reading the table correctly:
- The ○ in "Reg GL" is uniform: no season is better off than any
  other. There is no partial gamelog cache to resume from in this
  checkout. (A code comment in `build_vectors.py` says "All 11 local
  files decode line by line (checked 2026-10-09)". That is a CLAIM
  about files that existed somewhere on 2026-10-09. It is NOT true
  of this checkout on 2026-10-26: 0 files. Do not treat the comment
  as coverage. If those 11 files exist on another machine, they are
  a recovery lead, not on-disk inventory — see §7, item G-4.)
- The ● in "PO GL" must not be misread: playoff logs cover only
  playoff games (MEASURED totals in §4). They do not supply
  regular-season form, durability, or early/late splits, and the
  build's form features explicitly filter to regular-season game
  IDs (`is_regular_season`), so playoff rows cannot fill the gap.
- Tracking ● starts 2013-14 (13 seasons). Pre-2013 absence is
  structural (the source does not exist before SportVU), not a
  collection failure. It is masked downstream, never filled.

Outside the 30-season window (for orientation only, not counted
above): 2026-27 has 5 PBP games, 5 replay files, and shot snapshots
for 2026-10-20. 2026-27 is not part of the 12,966-row master and not
part of any fold; it is a probe corpus, not training coverage.

## 3. Game logs — what is missing, and what the fetcher actually carries

### 3a. Regular-season game logs: 0 files, 0 rows, 30 seasons

- Expected destination: `pipeline/data/gamelogs_<season>.jsonl`
  (gitignored raw, per the fetcher docstring). MEASURED: directory
  absent, files absent.
- Fetcher: `pipeline/fetch_gamelogs.py` (nba_api
  `playergamelogs.PlayerGameLogs`, `season_nullable=<season>`).
  CLAIMED scope in code: `season_range(GAMELOG_FIRST_SEASON)` with
  `GAMELOG_FIRST_SEASON = "2015-16"` (`pipeline/seasons.py`), i.e.
  11 seasons: 2015-16 through 2025-26. The fetcher's own docstring
  says "Seasons 2015-16..2025-26 first slice".
- CONSEQUENCE 1 — the "all seasons" target is wider than the
  existing fetcher: 1996-97 through 2014-15 (19 seasons) are outside
  the fetcher's coded range. Extending the range is new work, and
  whether `playergamelogs` returns clean rows for 1990s seasons is
  UNVERIFIED until a probe runs on a clean machine. Do not assume
  30 seasons of gamelogs are fetchable just because the endpoint
  accepts a season string.
- CONSEQUENCE 2 — even the 11 in-range seasons are at 0 files here.
  The fetch must run, not resume, for all 11 first-slice seasons.
- What one fetched row carries (KEEP list, `fetch_gamelogs.py`):
  PLAYER_ID, PLAYER_NAME, TEAM_ID, TEAM_ABBREVIATION, GAME_ID,
  GAME_DATE, MIN, PTS, AST, OREB, DREB, STL, BLK, TOV, FGA, FG3A,
  FTA, PLUS_MINUS. One row per player-game, all game types kept
  (preseason, regular, All-Star, play-in, Cup final, playoffs);
  readers filter to regular-season IDs downstream.
- What it does NOT carry: NO shot coordinates, NO shot zones, NO
  shot distances, NO event text. This is the report's most
  important correction (see §7, item G-1). Game logs feed
  prediction through per-game stat lines — form (volatility,
  ceiling, double/triple-double rates), durability, early/late
  splits, midseason moves, minutes/attempt realism checks
  (`gamelog_attempts` in `build_vectors.py`) — not through shot
  location. Any plan that says "gamelogs give us shot coordinates"
  is wrong about this endpoint.
- Scale claim for planning (CLAIM, from the build code, not
  measured here): the form-features comment in `build_vectors.py`
  cites 2023-24 file composition — 26,401 regular-season rows
  beside 2,078 preseason, 24 All-Star, 1,685 playoff, 120 play-in,
  26 Cup-final rows. Use ~26k regular-season player-game rows per
  full recent season as the planning magnitude; the completeness
  gate (§6 of COLLECTION_PLAN.md) must verify each fetched season
  against its own schedule count, not against this comment.
- Downstream mask consequence if a season stays missing: that
  season's form family is fully masked (build returns `{}` for the
  season), and the 70 full-context columns stay unbuilt for every
  row of that season. The 73-column base is unaffected. A missing
  gamelog season does NOT block the base build; it blocks only
  promotion from 73 to 143.

### 3b. Playoff game logs: present, all 30 seasons — but scoped

- Files: `pipeline/cache/playoff_games_<season>.json`, 30 files.
- MEASURED totals: 4,880 team-game rows, 50,356 player-game rows
  across all 30 seasons. Per-season samples: 1996-97 = 144 team /
  1,412 player rows; 1997-98 = 142 team / 1,424 player rows.
- Source (per file + fetcher): stats.nba.com `leaguegamelog`,
  `SeasonType=Playoffs`, player + team variants, via
  `pipeline/fetch_playoff_gamelogs.py`. Each file also carries
  derived `seriesByTeam` (R1 → Finals paths).
- Player columns carried: GAME_ID, GAME_DATE, PLAYER_ID,
  PLAYER_NAME, TEAM_ID, TEAM_ABBREVIATION, MATCHUP, WL, MIN, PTS,
  REB, AST, STL, BLK, TOV, FGM, FGA, FG3M, FG3A, FTM, FTA,
  PLUS_MINUS. Again: aggregates per game, NO coordinates, NO text.
- Gap inside this "complete" family: none by season count, but
  playoff logs alone cannot supply regular-season prediction
  features. Do not let "playoff gamelogs 30/30" soften the
  headline "regular-season gamelogs 0/30".

## 4. Shot coordinates — three namings, three different realities

Do not merge these. They are different fields, from different feeds,
with different coverage and different joins.

### 4a. ShotChartDetail LOC_X / LOC_Y: 0 rows, 0 seasons

- MEASURED: `grep` for `LOC_X` across `pipeline/cache/` returns
  0 hits. No ShotChartDetail response file exists anywhere in the
  cache. The only `LOC_X` mentions in the checkout are in design
  docs (overhaul lane SHOT_POSITION.md, JEPA design, contract).
- What the source is (CLAIM, from the 2026-10-11 shot-source
  verdict + overhaul SHOT_POSITION.md): stats.nba.com
  `shotchartdetail`, per-shot rows with LOC_X / LOC_Y (tenths of
  feet), SHOT_MADE_FLAG, SHOT_TYPE, plus zone fields
  (SHOT_ZONE_BASIC / SHOT_ZONE_AREA / SHOT_ZONE_RANGE).
  Native NBA PLAYER_ID join — the cleanest join of the three.
- Why it is absent: the 2026-10-11 verdict probed it from this
  Hatch VM twice and got zero bytes both times (stalls, read
  timeouts at 15s and 30s, no status code). It is a known-bad
  collector from Hatch, not a missing endpoint. Collection must
  run on Alienware or Mac (see COLLECTION_PLAN.md).
- Era availability: UNVERIFIED. Overhaul SHOT_POSITION.md research
  questions RQ-1/RQ-2/RQ-3 are still open: earliest season with
  per-shot rows, LOC_X/LOC_Y null rate by era, and whether early
  seasons return zones only. Until those probes run on a clean
  machine, the shot-position tower mask is 0 for every row.
  Do not quote any era boundary for ShotChartDetail as fact.

### 4b. PBP x / y (statscapture feed): 5 games, 2026-27 only, 100% of FG actions

MEASURED from `pipeline/cache/cdn_pbp/playbyplay_*.json`
(each file: `meta.request` =
`https://api.nba.com/statscapture/games/<gameId>/playbyplay?Format=json`,
`game.actions[]`):

| Game | Date | Actions | FG actions (isFieldGoal=1) | FG with x/y | x/y rate on FG | Distinct personIds | Description non-null |
|---|---|---|---|---|---|---|---|
| 0022600001 | 2026-10-20 | 593 | 174 | 174 | 100.0% | 22 | 593 (100%) |
| 0022600002 | 2026-10-20 | 628 | 183 | 183 | 100.0% | 19 | 628 (100%) |
| 0022600003 | 2026-10-21 | 667 | 188 | 188 | 100.0% | 27 | 667 (100%) |
| 0022600085 | 2026-10-21 | 629 | 175 | 175 | 100.0% | 19 | 629 (100%) |
| 0022600086 | 2026-10-21 | 635 | 177 | 177 | 100.0% | 21 | 635 (100%) |
| TOTAL | — | 3,152 | 897 | 897 | 100.0% | — | 3,152 (100%) |

Notes, all MEASURED:
- x/y non-null rate over ALL actions is only ~28–29% per game
  (174–188 of 593–667). That number is misleading if quoted alone:
  x/y exists exactly on field-goal actions and nowhere else.
  Free throws carry NO x/y (0 of 53–75 FT actions per game).
  The honest headline is: **100.0% of field-goal actions carry
  x/y (897/897); 0% of non-FG actions do.** Quote it that way.
- Each FG action also carries `shotDistance` (174–189 per game,
  i.e. FG count + 1 in most games — one extra shotDistance on a
  non-FG action per game; treat shotDistance presence as FG-plus-
  epsilon, not as an independent coordinate), `shotResult`
  (Made/Missed, 227–250 per game — includes FT results, so it
  exceeds FG count), `xLegacy`/`yLegacy` (legacy coordinate pair,
  present on every action as a field but meaningful only on FG),
  `side` (left/right), `subType` (Jump Shot / Layup / DUNK / …),
  `descriptor`, `qualifiers`, and full `description` text (100%
  non-null on all actions — this is the text corpus for Scope B
  at game scale, and the template-dedup problem in miniature).
- Coordinate system: NOT ShotChartDetail LOC_X/LOC_Y. PBP x/y are
  statscapture-court coordinates (sample FG: x ≈ 92.85, y ≈ 99.16
  for one 3PT; xLegacy/yLegacy are a second, different pair).
  Conversion to the canonical feet/hoop-origin system is defined
  in overhaul SHOT_POSITION.md §2.2 — "present but unconverted".
  Never feed raw PBP x/y into a tower, and never join PBP x/y to
  ShotChartDetail LOC_X/LOC_Y as if they were one field.
- Feed-identity discrepancy (flagged, not resolved): the PBP
  files' own `meta.request` names the `api.nba.com/statscapture`
  feed, while `pipeline/build_replays.py` describes its input as
  "the NBA's own liveData feed" from
  `cdn.nba.com/static/json/liveData/playbyplay/`. Both cannot be
  the provenance of the same 5 files. The files' own metadata
  wins: statscapture. The collection plan must re-verify which
  feed the clean machine can actually reach before bulk fetch,
  and must record the winning feed URL in every file's metadata.
- Historical availability: UNVERIFIED (overhaul RQ-4). The 5 files
  are opening-week 2026-27 games. Whether statscapture serves
  1996-97 or 2015-16 games with coordinates is unknown until a
  clean-machine probe requests one historical game per era.
  If it does not serve history, PBP is a current-season-only
  source and ShotChartDetail (or BBR/ESPN backfill) must carry
  the historical shot tower.

### 4c. Alternate snapshot sources: 1 date, 3 games, 2 systems

MEASURED under `pipeline/shotcharts/snapshots/` + `manifests/`:

| Source | File | Games | Records | Players | Fetched | QA verdict (manifest) |
|---|---|---|---|---|---|---|
| BBR (pixel-derived feet) | `shotcharts-20261020.jsonl` | 3 (2026-10-20) | 545 | 62 | 2026-10-21T18:47:41Z | PASS (schema, row_counts, spot_sample, geometry) |
| ESPN plays (native feet coords) | `shotcharts-20261020.jsonl` | 3 (2026-10-20) | 546 | 62 | 2026-10-21T18:47:02Z / 18:51:00Z | PASS (schema, row_counts, spot_sample) |

- BBR coordinates are DERIVED: shot-dot pixel positions on the
  BBR shot-chart plot converted to feet (HOOP_X_PX 239.87,
  HOOP_Y_PX 30.68, 9.962 px/ft; fit verified against BBR's own
  reported distances, median |computed − reported| 0.25 ft, p90
  0.41 ft, per `sources/bbr.py`). They are measurement-grade
  estimates, not native coordinates. BBR player IDs are BBR slugs
  (`tatumja01`), not NBA PLAYER_IDs — join needs the registry,
  with ambiguous-name masking.
- ESPN coordinates are NATIVE feet (`coordinate.{x,y}` against
  the attacked basket; hoop (25, 0), RMSE 0.75 ft against ESPN's
  labeled distances, per `sources/espn_plays.py`). ESPN athlete
  IDs are ESPN IDs, not NBA PLAYER_IDs — same registry-join caveat.
- The 1-record difference (545 vs 546) for the same 3 games is
  itself a cross-source agreement signal worth recording in the
  validation gate; it is not an error to "fix" by hand.
- Both sources are gated in code: BBR is snapshot-only by design
  (no CORS, server-side fetch, ≤1 req/3s); ESPN historical
  snapshots go to versioned JSONL (live games are client-side).
  Neither has any historical backfill on disk today. Their value
  in this plan is (a) the canonical-record format contract and
  (b) the backfill fallback if ShotChartDetail/PBP history fails.
  Historical availability of both is UNVERIFIED.

### 4d. What already exists but is NOT shot location

- `dashscoring_*.json`, 30 files, 1996-97 through 2025-26: the
  shotmix family (shot TYPE mix: 2PT/3PT/FT shares,
  assisted/unassisted; 13 columns as built, not 10). It contains
  NO floor location. Do not count it as shot-position coverage.
- `assets/replays/*.json`: shooter + shot spot per event come
  from the PBP feed (same 5 games); the other nine players'
  positions are staged from formation templates. The replay
  "shot spot" is real for the shooter only, and only for those
  5 games. Sprite/template positions are NEVER training inputs
  (contract §7 pixel-game loop).

## 5. Play-by-play — stats + text: 5 games, 0 historical seasons

- On disk: the same 5 statscapture files as §4b. 3,152 actions,
  897 FG actions, 3,152/3,152 descriptions non-null.
  Action-type mix (all 5 games): substitutions are the largest
  type (~130–184 per game), then rebounds, FG, fouls, FTs.
  Text is official feed text only — no generated commentary —
  which is exactly what Scope B requires. But 5 games cannot
  train a text tower: template dedup, embedding, and forecast
  lift all need season-scale volume (see COLLECTION_PLAN.md §5
  for the volume math and the per-season ordering).
- No PBP fetcher script exists in `pipeline/` (searched:
  `fetch_pbp.py` absent; `seasons.py`'s docstring mentions
  `fetch_pbp` among modules, but the file is not there — a
  docstring CLAIM, not a script). The PBP collection script is
  new work, not a re-run. `build_replays.py` is a consumer of
  cached PBP, not a fetcher.
- Missing in full: every game of every season 1996-97 through
  2025-26, regular season + playoffs + play-in. As a planning
  magnitude only (NOT a measured count): ~1,230 regular-season
  games per 82-game season × 30 seasons ≈ 36,900 regular-season
  games, plus playoffs/play-in. The collection plan's
  completeness gate must use fetched schedule counts per season,
  not this arithmetic, because lockout/shortened seasons
  (1998-99, 2011-12, 2019-20, 2020-21) break the 82-game
  assumption. Do not hardcode 1,230 anywhere in a gate.

## 6. Season-summary cache — what is already solid (and its dates)

All files below are MEASURED present in `pipeline/cache/`.
They are the reason the 73-column base rebuild succeeds offline.
They do NOT close the Scope A gaps; they bound them (the base
does not need gamelogs/PBP/shot charts, the full context does).

| Family | Files | Seasons | Notes |
|---|---|---|---|
| dashbase (`base_*` + `dashbase_*`) | 30 + 30 | 1996-97–2025-26 | Legacy `base_*` name-keyed dicts are treated as a miss by current code (no MIN/GP); `dashbase_*` is the live form. Both counted; do not double-count as 60 seasons. |
| dashadvanced | 30 | 1996-97–2025-26 | |
| dashscoring | 30 | 1996-97–2025-26 | Shot TYPE mix only (§4d). |
| bio | 30 | 1996-97–2025-26 | |
| bbref_per_game | 30 | 1996-97–2025-26 | |
| bbref_advanced | 30 | 1996-97–2025-26 | |
| matchup_enriched | 30 | 1996-97–2025-26 | |
| team_base / team_advanced | 30 + 30 | 1996-97–2025-26 | |
| official_totals (`totals_*` + SOURCES.json) | 30 + 1 | 1996-97–2025-26 | |
| tracking | 13 | 2013-14–2025-26 | Structural start 2013-14; pre-2013 masked. Plus `tracking_availability.json`, `tracking_summary.json`, `tracking_pre2013_unavailable.json`. |
| wide_skills | 11 | 2015-16–2025-26 | Plus `.example.json`. |
| playoff_games (§3b) | 30 | 1996-97–2025-26 | 4,880 team / 50,356 player rows. |
| honors_award | 30 | award years 1997–2026 | Plus `honors_finals_mvp.json`, `honors.example.json`. Year-keyed, not season-keyed — do not misalign by one. |
| salaries_history.csv | 1 file | 16,679 rows | Plus `salaries_merged.json`, `salary_bbref_current.json`, `payroll_by_season.json`, `payroll_enriched.json`, `cap_rules.json`. BBRef salary detail by team-year lives in `bbref_salaries/<year>/<TEAM>.json` for years 2019–2025 (7 year-dirs, 30 teams each). |
| draft_history.json | 1 file | — | Plus `.example.json`. |
| dataset_ledger.json | 1 file | — | Cache ledger; read it before assuming any file above is fresh. |

Dates: the cache files carry no uniform fetch-date field in the
filenames; `assets/vectors.json` is built 2026-10-11 and the
shot snapshots are fetched 2026-10-21. Per-file fetch dates are
exactly what the versioned-cache design (CACHE_VALIDATION_DESIGN.md)
requires going forward — their absence from the current cache is
itself a finding: today's cache cannot prove its own freshness,
which is why Scope A re-fetch metadata is mandatory, not cosmetic.

## 7. Gap register — every gap as a number, with its downstream consequence

| ID | Gap | Size | Downstream consequence if it stays missing |
|---|---|---|---|
| G-1 | Regular-season gamelogs absent | 30/30 seasons, 0 rows | Form family masked for all rows; 70 full-context columns unbuilt; 143 stays unverified; prediction loses per-game volatility/ceiling/durability/split features. Shot coordinates are NOT part of this gap — see §3a correction. |
| G-2 | ShotChartDetail absent | 30/30 seasons, 0 rows, LOC_X 0 hits | Shot-position tower has no native-ID source; tower mask stays 0 for all rows until clean-machine probes answer RQ-1–RQ-3. |
| G-3 | PBP history absent | 30/30 seasons; only 5 games of 2026-27 | No text tower training corpus; no PBP shot-location history; JEPA game-timescale inputs have no historical sequences. |
| G-4 | Gamelog fetcher range too narrow + 11 "local files" unverified | 19 seasons outside coded range (1996-97–2014-15); 11 in-range seasons at 0 files here | If the 11 files exist on another machine, recovery beats re-fetch; if not, all 11 re-fetch. Pre-2015 gamelog fetchability is unproven until probed. |
| G-5 | No PBP fetcher script | 0 scripts | PBP collection cannot start by re-running; a new fetcher (game-ID enumeration + statscapture fetch + resume) must be written and run on a clean machine. |
| G-6 | Feed identity unresolved (statscapture vs cdn liveData) | 1 discrepancy, 5 files | Bulk PBP fetch aimed at the wrong feed wastes the clean-machine window. Resolve with a 1-game probe on each feed before bulk. |
| G-7 | No per-file fetch metadata in current cache | 788 files, ~0 with uniform fetch metadata | Freshness, machine, and source URL are unprovable for today's cache. All Scope A re-fetches must write metadata (see CACHE_VALIDATION_DESIGN.md). |
| G-8 | Shot era boundary unknown | 30 seasons, boundary = unknown | Any shot-tower mask by era written today would be invented. Mask stays 0 until RQ probes return. |

## 8. Contract conflicts and corrections found by this lane

1. **"Later-season game logs carry actual shot coordinates"
   (Scope A directive, 22:29 CDT) — CORRECTED.** As coded,
   `fetch_gamelogs.py` (playergamelogs) carries NO coordinate
   field, and `fetch_playoff_gamelogs.py` (leaguegamelog) carries
   none either. Later-season gamelogs are still the top priority,
   but for per-game stat lines (form, durability, splits), NOT
   for shot coordinates. Shot coordinates come from
   ShotChartDetail, PBP x/y, or BBR/ESPN snapshots — three
   separate collections with separate gates. The collection plan
   is written on the corrected premise; the coordinator should
   confirm the correction so no downstream lane plans a
   "gamelog shot" feature that cannot exist.
2. **"`cdn_pbp/` holds 5 games" — PATH CORRECTED.** On disk it is
   `pipeline/cache/cdn_pbp/`. Same files. No coverage change.
3. **"`build_vectors.py` comment: 11 local gamelog files" —
   NOT TRUE of this checkout.** 0 files, `pipeline/data/`
   absent. Treated as a recovery lead (G-4), not as inventory.
4. **`seasons.py` docstring names `fetch_pbp` — FILE ABSENT.**
   No PBP fetcher exists to re-run (G-5).
5. **`build_replays.py` feed description vs PBP file metadata —
   DISCREPANCY (G-6).** Files say statscapture; the consumer
   docstring says cdn liveData. Metadata wins until probed.
6. **No conflict with the 22:32 correction.** This report's
   priorities already follow prediction-first: gamelogs first
   (they feed the 14-d forecast directly through form/durability
   and the full-context matrix), shot positions second (a new
   tower judged by forecast lift), PBP text third (a text tower
   judged by forecast lift, Scope B). Twin agreement is not used
   as a coverage criterion anywhere in this report.

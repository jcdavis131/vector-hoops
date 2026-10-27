# Context sources — Vector Hoops MTNN data-collection deep dive

**Lane:** context sources · **Status:** READ-ONLY investigation (pipeline code + cache read; one small
read-only join probe; no bulk fetch, no writes to any live checkout, no training, no prod writes) ·
**Date:** 2026-10-26 · **Checkout measured:** `~/workspace/vector-hoops-mlops-v2` (master `1e5bfecc` line) ·
**Contract reference:** `pipeline/contracts/train_matrix.contract.json` (143 columns, FA2 matrix
sha256 `60dba1cbeabd6e03`, manifest `f1c90cdca75df174`) vs the verified 73-column base from
`build_vectors.py --offline` alone.

**Read first (done):** `mlops-v2-drafts/lanes/01-data-collection/SOURCES.md` §3 (context rows) and §6–§7,
`mlops-v2-drafts/lanes/07-pipeline-overhaul/INVENTORY.md` §1.1, and the side builders
`build_salary_market.py`, `build_pedigree.py`, `build_playoffs.py`, `build_honors.py`,
`derive_system_tags.py`, plus `roster_context.py`, `form_context.py`, `build_career_context.py`,
`competition_context.py`, `build_availability.py`, `fetch_team_season.py`,
`import_team_season_cache.py`, `fetch_gamelogs.py`, `fetch_salaries.py`, `fetch_salary_history.py`,
`integrate_context.py` (join layer).

**Headline:** the context families split cleanly into two classes. (1) **Cache-complete, build-only:**
salaries/market (modulo 1,435 unmatched rows), honors, playoffs, pedigree, team-season inputs — the
data is on disk; what is missing is a *decision* (honors semantics) or a *build step*
(team-season merge), not a fetch. (2) **Gamelog-gated:** form, roster, competition, injury-readout,
and (partly) career and system — all blocked by the same single missing input,
`pipeline/data/gamelogs_*.jsonl`, which is gitignored and absent from every checkout. One fetch
(`fetch_gamelogs.py`, stats.nba.com `PlayerGameLogs` via nba_api, 2015-16…2025-26 first slice)
unblocks five families at once; pre-2015-16 gamelog families have no cached equivalent at all and
need either a backwards extension of the same endpoint or a builder rewrite onto season-level data.
Contract family coverages cited below are the contract file's `family_coverage` (mean mask share
over the family's columns, not row share).

**Key join fact (applies to every family):** `integrate_context.py` joins each side artifact on
`(PLAYER_ID, season)` when the artifact row carries an id, else falls back to `(name, season)`
(`_key` / `lookup`). The old name-only join lost 658 gamelog-era rows with 10+ games
(features#6: hyphen/diacritic/suffix spellings — 'Al-Farouq Aminu', 'Dennis Schröder',
'Glenn Robinson III'). Any builder that still emits name-only rows re-opens that failure mode.
Shared names (one `norm_name`, two PLAYER_IDs, same season) are the other systematic failure:
salary is *suppressed* for shared names, while name-keyed builders risk *misattribution*
(son inheriting father's draft pick / All-Star count — fixed in pedigree/honors by pid keying).
Traded players are a third mode: every gamelog builder reduces a multi-team season to a
*primary* team (most games), so secondary-team stints vanish from roster/competition/availability.

---

## 1. Salaries / market — 4 columns, contract coverage 0.884

Contract columns: `SALARY_LOG` (base build) + `SALARY_CAP_PCT`, `SALARY_TEAM_PCT`,
`SALARY_RANK_POS` (from `build_salary_market.py`, NOT the base build).

### Cached (exact files + coverage)

- `pipeline/cache/salaries_history.csv` — 16,679 lines (16,678 rows + header), header
  `name,season,salary,team`, seasons 1990-91…2030-31. Matrix-relevant span 1996-97…2025-26 is
  populated every season (e.g. 2018-19: 581 rows, 2024-25: 518, 2025-26: 515). Rows after
  2025-26 are BBRef *current-contract future years*, not player-seasons — not a gap, not data.
- `pipeline/cache/salaries_merged.json` — 16,678 rows keyed `<norm_name>|<season>`, `_meta` =
  `{key_format, rows, schema}` only (no provenance — see §12).
- `pipeline/cache/salary_bbref_current.json` — 1,230 keys `<norm_name>|<season>`, current +
  future contract years (e.g. Curry 2025-26 $59,606,817), from BBRef contracts page
  (`fetch_salaries.py --fetch-bbref`).
- `pipeline/cache/bbref_salaries/` — 210 files = 30 teams × 7 end-years (2019…2025), i.e.
  BBRef team-season `salaries2` tables for seasons 2018-19…2024-25 (the backfill
  `fetch_salary_history.py` wrote; each file is a list of `{name, salary}`).
- `pipeline/nba_salary_cap.py` — hardcoded cap table 1996-97…2026-27 (Spotrac/BBRef/Bleacher
  Report/ESPN per its docstring; 2016-17 spike $94,143,000 noted). Complete for all matrix
  seasons, so `SALARY_CAP_PCT` needs no fetch.
- Read-only probe (this investigation): joining `salaries_merged.json` to the 12,966
  `assets/vectors.json` rows on `norm_name|season` matches 11,531 rows and misses 1,435
  (11.1%) — consistent with the Oct 18 protocol's 11,504/12,966 once shared-name suppression
  and the $10,000 floor are applied (delta ≈ 27 rows).

### Gapped (exact missing input)

- 1,435 charted player-seasons with no salary row. Worst seasons: 1999-00 (131/397),
  2006-07 (116/418), 1997-98 (79/393), 2007-08 (77/412), 1998-99 (76/377). These are
  predominantly short-stint / two-way / 10-day players and name-mismatch rows, not a missing
  season block — no matrix season is wholly absent.
- `SALARY_TEAM_PCT` additionally requires a resolvable team and ≥8 salary rows on that
  team-season (`MIN_TEAM_SALARY_ROWS = 8`); team comes from the salary row's `team` field,
  falling back to `roster_context.json` — which is gamelog-gated, so team-pct for
  team-blank salary rows in gamelog seasons depends on the gamelog fetch (see §6).
- `SALARY_RANK_POS` is computable for every matched row (within-season percentile); it has
  no independent gap beyond the 1,435 unmatched rows.

### Best real alternate source per gap

- **BBRef team-season salary pages** (`basketball-reference.com/teams/<TM>/<endyear>.html`,
  `salaries2` table in an HTML comment, `csk` = raw figure) — the exact method
  `fetch_salary_history.py` already used for 2018-19…2024-25, at BBRef's ≤20 req/min
  politeness rate. This is real contract money, not an estimate. Extend the same script's
  year range backwards for the worst seasons (1999-00, 2006-07) — BBRef team pages exist
  back to 1990-91.
- **Spotrac team payroll pages / HoopsHype salary pages** as a second real source for
  cross-checking disputed rows (cap-hit vs salary definitional differences must be recorded;
  HoopsHype figures are pre-tax annual salary per `fetch_salaries.py` notes).
- **NOT acceptable:** rookie-scale-implied salaries, cap-pct back-computation, or
  position-median fills — those are proxy fills, and they would launder a guessed number
  into a "market" signal. Missing stays masked.

### Join key and failure modes

- Key: `norm_name|season` in the merged file; `build_salary_market.py` re-keys with today's
  `norm_name` and emits `player_id` when the vectors row has one, so the merge itself is
  pid-safe — but the *source* match is name-based.
- Failure modes: (a) shared name in a season → salary deliberately suppressed (not
  misattributed); (b) name spelling drift between CSV and charted name (diacritics/suffixes)
  → silent miss, counted in the 1,435; (c) salary rows below $10,000 dropped as noise;
  (d) traded players carry one `team` value, so team-pct uses one team's payroll.

### Decision / check that unblocks it

- No semantics decision needed. The check is a **coverage audit, not a fetch**: re-run the
  name-join probe after a BBRef backfill pass for 1999-00 and 2006-07 and confirm the
  unmatched count falls; accept the residual (two-way/10-day) rows as masked. Separately,
  the provenance question (§12) must be answered before any claim about redistribution
  rights — it does not block training use of derived log-salary features.

---

## 2. Honors — 5 columns, contract coverage 0.924 (but semantics undecided)

Contract columns: `HON_ALL_NBA_TEAM_LAG`, `HON_ALL_NBA_VOTE_LAG`, `HON_ASG_LAG`,
`HON_ASG_CUM`, `HON_VOTE_RECOG`. The base build carries **no** honors columns at all.

### Cached

- `pipeline/cache/honors_award_*.json` — 30 files, award years 1997…2026 = seasons
  1996-97…2025-26, every file `complete: true`, `source: basketball-reference.com/awards`
  (BBRef awards pages via `fetch_honors.py`; vote-getters, not just the 15 All-NBA
  selections). The 2026 file (2025-26 season) is marked complete.
- `pipeline/cache/honors_finals_mvp.json` — present; **not** a contract column (no
  Finals-MVP feature exists in the 143) — do not let it leak in as a sixth honors column.
- `pipeline/cache/draft_history.json` (person_id records) — used by `build_honors.py` for
  the `career_fully_observed` gate on `HON_ASG_CUM`.

### Gapped

- Coverage is **not** the gap; the decision is (see below). Genuine coverage holes:
  (a) every `HON_*` on 1996-97 rows (caches start with 1996-97 awards, so there is no prior
  season to lag from); (b) `HON_ASG_LAG` on 1999-00 rows (no All-Star Game in 1999 — the
  1998-99 cache lists 0 All-Stars, so "not an All-Star" was never measured); (c) `HON_ASG_CUM`
  for careers that began before 1996-97 (left-censored — earlier selections invisible);
  (d) **2025/2026 All-Star lists are partial**: `honors_award_2025` and `_2026` name 15
  each vs 22–26 historically (game moved to a four-team tournament in 2025, USA-vs-World
  in 2026). `build_honors.py` flags these `asg_partial` (fewer than `ASG_MIN_LISTED = 20`);
  per its docstring, the next season's `HON_ASG_LAG` is then missing for every row — an
  omitted player is *unknown*, not 0 — and the listed-only 1s collapse under per-season
  z-scoring (the contract gate flagged exactly 13 observed 1s in 2025-26).

### Best real alternate source per gap

- For (d): the **BBRef awards pages for 2025/2026 re-parsed with the tournament rosters**
  (all four teams' selections, not the single-game list) or the **NBA's official All-Star
  roster announcements** — both real selection lists. This is a re-parse, not a new source.
- For (a)–(c): **no real alternate exists inside the BBRef-awards frame** — pre-1996-97
  awards would need BBRef awards pages for 1990…1996 (`fetch_honors.py` year range
  extended backwards; the pages exist). That only fixes `HON_ASG_CUM` left-censoring and
  the 1996-97 lag hole for players whose prior season is 1995-96; it cannot fix the
  1999-00 hole (no game was held — that cell is *structurally* missing and must stay
  masked, never zero-filled).

### Join key and failure modes

- Builder (`build_honors.py`) indexes awards by season → re-keyed `norm_name`, then emits
  rows keyed by PLAYER_ID (`HON_ASG_CUM` counted per PLAYER_ID; `career_fully_observed`
  via draft year / first dashbase season). Merge falls back to `(name, season)`.
- Failure modes: (a) BBRef-vs-stats.nba.com spelling drift — one hardcoded alias exists
  (`steve smith` → `steven smith`, pid 120; 5 of 1,211 award entries were unmatched as of
  2026-10-09, including 'Ömer Aşık' 2012-13, fixed by `norm_name` folding); an unmatched
  honoree makes his own next-season row read as a *measured zero* — the worst failure,
  because it is wrong, not missing; (b) All-NBA tier inflation — the cache assigns tiers
  beyond the real 15 slots to mere vote-getters (e.g. Jaylen Brown 2023-24: team=1 on 50
  vote points without making a team); the builder zeroes non-top-5-per-tier rows
  (`normalize_allnba_teams`); (c) suffix-stripped name keys historically let a son inherit
  his father's All-Star count — fixed by pid counting, but any name-keyed re-derivation
  re-opens it.

### Decision / check that unblocks it — HONORS SEMANTICS (the named blocker)

Three competing semantics, stated exactly:

1. **LAG + measured zero (current HEAD builder):** awards after season S are applied to
   season S+1 rows (leak-free for MTNN); a complete award season that does *not* list a
   player is a measured 0 (mask 1). Result: family coverage 0.924 (FA2).
2. **LAG + honor-only rows (old HEAD builder):** same lag, but a row is emitted only when
   the prior season had an honor; all other rows masked. Result: coverage 0.087.
3. **CURRENT-SEASON (contemporaneous):** awards for season S on season-S rows — what
   `build_player_meta.py` already emits for game-puzzle weighting ("same-season
   recognition"). The promoted 2026-08-04 matrix's 0.969 is consistent with a
   zero-filled variant (nearly every row observed), but 0.969 ≠ 1.000, so the promoted
   matrix's exact rule is *not* proven by its coverage alone.

**The exact measurement that decides:** take the promoted matrix's honors columns (if
recoverable — see SOURCES.md §6: its location on the training box is UNCONFIRMED) and, for
a sample of known honorees (e.g. every All-NBA 1st-team selection 2010–2024), test two
hypotheses exactly: does `HON_ALL_NBA_TEAM_LAG` on row S equal the tier for season S−1
(lag wins) or season S (current wins)? Exact-match rate, not correlation — one hypothesis
should match ~100% and the other ~0% on selections. If the promoted matrix is
unrecoverable, the fallback measurement is a **leakage audit + coordinator ruling**:
current-season awards are announced *after* season S ends, so semantics (3) is
post-season information in a season embedding — acceptable for a descriptive twin
geometry, a leak for any predictive use. **Decision owner: coordinator / Lane 2**
(SOURCES.md §6 assigns it there; it is recorded nowhere as made). Until ruled, do not
re-anchor any contract on a rebuilt matrix — the choice moves the family from 0.087 to
0.924 observed, which changes every downstream tower weight.

---

## 3. Playoffs — 14 columns, contract coverage 0.459

Contract columns: `PO_GP`, `PO_MIN`, `PO_MIN_DELTA`, `PO_USG_DELTA`, `PO_PTS_DELTA`,
`PO_EFF_DELTA`, `PO_PLUS_MINUS`, `PO_TEAM_WINS`, `PO_ROUNDS`, `PO_SERIES`,
`PO_CLOSE_GAMES`, `PO_AVG_PTS`, `PO_HIGH_PTS`, `PO_CLUTCH_PTS` (all from
`build_playoffs.py`; spec said 5, HEAD chain has 14).

### Cached

- `pipeline/cache/playoffs_*.json` — 30 files, 1996-97…2025-26, `complete: true`,
  `source: stats.nba.com leaguedashplayerstats via nba_http` — per-player playoff splits
  (`po` vs `rs`: GP, MIN, USG, PTS100, TS, PLUS_MINUS) + team W/rounds. This is what
  carries the 8 delta/role columns.
- `pipeline/cache/playoff_games_*.json` — 30 files, 1996-97…2025-26, `complete: true`,
  `source: stats.nba.com leaguegamelog SeasonType=Playoffs` — `teamGames` + `playerGames`.
  This is what carries `PO_SERIES`, `PO_CLOSE_GAMES` (≤5-pt games), `PO_AVG_PTS`,
  `PO_HIGH_PTS`, `PO_CLUTCH_PTS`. Both files are required; neither alone gives all 14.
- Coverage 0.459 is *structural*, not a gap: non-playoff rows are masked by design
  ("did-not-play ≠ played-badly").

### Gapped

- No season gap. The only soft gap: `PO_SERIES` "usually = rounds for exits" (builder
  docstring) — series counting from the game-log path is approximate for teams with
  byes/odd paths; and a player traded mid-playoffs across conferences is reduced to
  one team's path (team-index join).
- Refresh gap: 2026-27 playoffs do not exist yet (season in progress) — not a training gap.

### Best real alternate source per gap

- Re-run `fetch_playoffs.py` / `fetch_playoff_gamelogs.py` against the same stats.nba.com
  endpoints (operator machine — datacenter IPs are blocked per the builder's own error
  message). No alternate source is needed; for the series-count approximation, the real
  check is **BBRef playoff series pages** (series results per team-season), which would
  confirm `PO_ROUNDS`/`PO_SERIES` independently of the game-log path.

### Join key and failure modes

- Builder indexes players by `(season, norm_name)` with `setdefault` (first record wins)
  and teams by `(season, TEAM_ID)`; merge falls back to `(name, season)` if the emitted
  row carries no pid — **verify pid emission before trusting same-name playoff seasons**,
  because two same-name players in one postseason would collide on the name key where
  pedigree/honors (pid-keyed) would not.
- Playoff-vs-regular-season deltas require the `rs` split in the same cache file; a
  partial season file would silently skew deltas — guarded by the `complete` flag.

### Decision / check

- No decision needed. Check: confirm `build_playoffs.py` output rows carry `player_id`
  (one grep); if not, add it — that is a builder fix, not a data fetch.

---

## 4. Pedigree — 7 columns, contract coverage 0.927

Contract columns: `PED_PICK_QUALITY`, `PED_ROUND_ONE`, `PED_UNDRAFTED`,
`PED_EXPECT_SLOT`, `PED_TEAM_WINPCT`, `PED_YEARS_SINCE`, `PED_PICK_DECAY`
(from `build_pedigree.py`). Note: the base build separately carries `DRAFT_NUMBER` /
`DRAFT_SLOT_Z` (bio/career); pedigree is the *entry-expectation* expansion, and every
value is known before the player's first NBA game (leak-free by construction).

### Cached

- `pipeline/cache/draft_history.json` — `complete: true`, `built: 2026-07-07`,
  `source: stats.nba.com drafthistory via nba_api`, years 1947…2025, every record carrying
  `person_id` (e.g. Cooper Flagg 2025 #1, DAL, person_id 1642843). Covers all matrix
  draftees including the 2025-26 rookie class.
- `pipeline/cache/team_base_*.json` — supplies `PED_TEAM_WINPCT` (drafting team's W_PCT
  the season *before* the pick).

### Gapped

- `PED_TEAM_WINPCT` masked for drafts before 1997 (team cache starts 1996-97) — a
  small, old-player hole.
- `PED_UNDRAFTED = 1` is asserted only when the cache is marked complete, spans the
  player's entry window, and carries person_id on every record; against a partial cache
  unmatched players are fully masked instead of mislabeled (builder docstring). With the
  committed complete cache, this gate is satisfied — no gap in practice.
- `PED_EXPECT_SLOT`'s curve (pick #1 = 1.0, round 2 = 0.10, undrafted = 0.06, log-linear
  anchors) is a *stated CBA-rookie-scale-shaped expectation*, not dollars — it is a
  modeling choice, not a data gap, but it must be labeled as such wherever the family
  is described.

### Best real alternate source per gap

- `fetch_draft_history.py` re-fetch from the same stats.nba.com `drafthistory` endpoint;
  cross-check against **BBRef draft pages** (`basketball-reference.com/draft/`) for the
  pre-1997 team-winpct hole (BBRef draft + team pages both exist back to 1947/1990s).
  No proxy needed: draft position is a public fact with two independent real sources.

### Join key and failure modes

- Key: `PLAYER_ID == person_id` (vectors `pid`), first charted season = `first_year`;
  among one person's records (119 people drafted twice) the latest draft ≤ first_year wins.
- This is the fixed version of a known failure: the old display-name key matched a son
  against his father's debut (Jaren Jackson Jr. 'undrafted', Gary Payton II with his
  father's 1990 #2 pick) and suffix-stripped keys mislabeled 227 rows of 38 drafted
  players (Hardaway Jr., Bagley, Porter Jr.). Any re-derivation must keep the pid key.

### Decision / check

- No decision needed. Check: none blocking — pedigree is the cleanest context family.
  Optional: confirm the 2025 draft class (Flagg etc.) maps to 2025-26 charted rows by pid
  in the next build; that is a regression check, not a fetch.

---

## 5. Competition — 4 columns, contract coverage 0.398

Contract columns: `SOS_NET_RTG`, `B2B_RATE`, `REST_AVG`, `CONF_STRENGTH`
(from `competition_context.py`).

### Cached

- Everything *except* the player game logs: `team_season_*.json` (derived — see §13)
  supplies opponent `NET_RATING` per team-season, and the EAST conference TEAM_ID set is
  hardcoded in the builder. The 0.398 coverage equals exactly the gamelog-era row share
  (2015-16…2025-26 rows = 5,154/12,966), because every column derives from dated,
  opponent-tagged games.

### Gapped

- **Entire family, pre-2015-16, plus everything until gamelogs land:** `competition.json`
  is built only from `pipeline/data/gamelogs_*.jsonl` (`from_logs()` iterates log files;
  `team_net()` returns {} when the team-season file is missing, and the season is then
  skipped entirely). Regular-season games only (GAME_ID prefix `002` filter via
  `seasons.is_regular_season`); preseason, All-Star, playoff, play-in, Cup-final games
  are excluded by design.

### Best real alternate source per gap

- **Primary (no rewrite of the concept):** the same `fetch_gamelogs.py` fetch
  (stats.nba.com `PlayerGameLogs`, 2015-16…2025-26). The endpoint itself covers earlier
  seasons too — `GAMELOG_FIRST_SEASON = 2015-16` is a scope choice in `seasons.py`,
  not an API limit — so a backwards extension of the same fetch is a real, not proxy,
  source for pre-2015 competition features.
- **Alternate without player logs (requires a builder rewrite, but real):** team-level
  schedules from stats.nba.com `leaguegamelog` (team rows carry dates + opponents) give
  SOS/REST/B2B at *team* level; join to players via `assets/player_team_season.json`
  (Name|season → abbr, 14,565 keys, all 30 seasons — see §6). SOS then becomes
  team-schedule strength rather than the player's faced-opponent average (a definition
  change: traded players and DNP games differ). Label it if used; do not present it as
  the same feature.

### Join key and failure modes

- Key: `(PLAYER_ID, season)` from the log's PLAYER_ID (fixed from the old raw-name join
  that lost the same 658 rows as form). Opponent resolution needs exactly one opposing
  team in the game-team set *and* that team present in the team-season net index;
  games failing either are dropped from the SOS average (silent shrinkage, not error).
- Conference strength uses the *primary* team (most games) — traded players' secondary
  conference is ignored. Back-to-back/rest use the player's own game dates, so DNP
  games do not count as rest (correct) but also do not appear as gaps (a player who
  misses 10 days shows one long gap, not 10 rest days — the builder's `REST_AVG` is
  mean inter-game gap, not mean days off).

### Decision / check

- Decision: **scope cut vs fetch.** Either (a) fetch gamelogs (unblocks competition
  exactly as specified for 2015-16+), or (b) declare competition a gamelog-era-only
  family and mask pre-2015 (the current contract's 0.398 already *is* that mask — the
  question is whether 0.398 is acceptable for a tower, or the family should be dropped
  for pre-2015 rows by an explicit rule rather than by accident). The team-schedule
  rewrite (above) is a third option only if the coordinator wants full-era coverage
  more than it wants definition stability.

---

## 6. Roster — 5 columns, contract coverage 0.261 (lowest of any family)

Contract columns: `ROSTER_MIN_RANK`, `ROSTER_USAGE_CROWD`, `ROSTER_COMPLEMENT`,
`ROSTER_STAR_GAP`, `ROSTER_MATES_N` (from `roster_context.py`, "roster-season
co-membership, not shared-floor minutes" — stated limitation; lineup on/off would be
better for true chemistry lift).

### Cached

- `assets/vectors.json` 14-d profiles — the complement/star-gap cosines are computed
  over these served profiles, so the *profile* input is cached.
- `assets/player_team_season.json` — 14,565 keys `Name|season` → team abbreviation,
  all 30 seasons. This is the unexploited alternate team-membership source (see below).
- What is NOT cached: `pipeline/data/gamelogs_*.jsonl` (minutes + TEAM_ID source) and
  therefore `pipeline/data/roster_context.json` itself (`pipeline/data/` does not exist).

### Gapped

- **Everything, until gamelogs land:** `load_team_rosters()` returns {} for any season
  without a log file, and the season is skipped — "seasons without logs are skipped (no
  team join in vectors alone)". Coverage 0.261 < gamelog-era share 0.398 because of the
  additional ≥800-minute rotation filter (`ROTATION_MIN = 800`) and the charted-row
  match requirement (only charted rotation mates count toward `ROSTER_MATES_N`).
- `ROSTER_MIN_RANK` / `ROSTER_USAGE_CROWD` need summed log minutes; the other three
  need only team membership + profiles.

### Best real alternate source per gap

- **Primary:** `fetch_gamelogs.py` (same as §5) — summed log minutes are the specified
  input; no substitute reproduces them exactly (season totals differ for traded players
  and for players whose log minutes include non-regular-season games, which the builder
  does *not* filter for roster minutes — note: roster minutes sum all logged games with
  MIN, unlike competition/availability which filter to regular season).
- **Real fallback for team membership only (not minutes):**
  `assets/player_team_season.json` gives one team per player-season for all 30 seasons.
  Combined with vectors profiles it rebuilds `ROSTER_COMPLEMENT`, `ROSTER_STAR_GAP`,
  and `ROSTER_MATES_N` (with a ≥800-minute filter replaced by a charted-row filter) for
  pre-2015 seasons — real membership, real profiles, changed minutes rule. For
  `ROSTER_MIN_RANK` / `ROSTER_USAGE_CROWD`, minutes can come from **BBRef per-game
  MP × GP** (`bbref_per_game_*.json`, complete 30 seasons; traded players have TOT +
  per-team rows, so primary-team MP×GP is well-defined). This is real playing time, but
  it is a *different minutes definition* from summed logs — label the seam if used.
- **NOT acceptable:** inferring teammates from shared team-season stats rows (no
  player-team link exists in `base_*`/`dashbase_*` caches — those rows carry no TEAM_ID
  in the cached dict form) or from `team-rosters.json` UI assets without verifying
  their season coverage.

### Join key and failure modes

- Key: `(PLAYER_ID, season)` from the log's PLAYER_ID (fixed 2026-10-09 rebuild at
  `1733bdbf` recovered 255 of 3,463 rows lost under the old canonical-name join).
- Failure modes: (a) multi-team seasons collapse to the log's per-team minutes (roster
  builder keeps per-(TEAM_ID, PLAYER_ID) minutes, so a traded player appears on two
  rosters — but `integrate_context`'s roster lookup takes one row per player-season,
  so the merge, not the builder, decides which team wins); (b) the 800-minute cutoff
  is a hard cliff — a 799-minute player has no roster row at all, not a partial one;
  (c) `ROSTER_STAR_GAP` uses the top-minute teammate *on the roster list*, which may
  be uncharted (then the gap is None, not 0).

### Decision / check

- Decision: **same scope decision as competition** — fetch gamelogs (exact spec,
  2015-16+ only) vs accept 0.261 coverage vs adopt the player-team-season + BBRef-MP
  fallback for full-era coverage with a labeled definition change. Note the blast
  radius: roster is the join backbone for team (§9) and system (§10) — fixing roster
  fixes three families' coverage at once, which is why the gamelog fetch is the
  highest-leverage single action in this entire report.

---

## 7. Form — 5 columns, contract coverage 0.398

Contract columns: `FORM_CEIL`, `FORM_DD_RATE`, `FORM_MIN_AVG`, `FORM_TD_RATE`,
`FORM_VOL` (from `form_context.py` → `build_vectors.compute_form_features`).
Note: `form_context.py` also computes `FORM_GP`, but it is **not** a contract column.

### Cached

- Nothing usable: form is computed *only* from `pipeline/data/gamelogs_*.jsonl`
  (`compute_form_features(season)` returns {} when the log file is missing — INVENTORY
  §1.2: the base build then "silently produces zero form features"). No per-game
  aggregates exist anywhere else in the cache; `base_*`/`dashbase_*` are season totals,
  which cannot yield volatility, ceiling (95th-pct game score), or DD/TD rates.

### Gapped

- **Entire family, all seasons, until gamelogs land** — and structurally pre-2015-16
  even after the first-slice fetch, because `GAMELOG_FIRST_SEASON = 2015-16`.
  Coverage 0.398 = gamelog-era share, and the builder is "mask-honest pre-2015" (no
  backfill, no season-total proxy).

### Best real alternate source per gap

- **Primary:** `fetch_gamelogs.py` (stats.nba.com `PlayerGameLogs`, 2015-16…2025-26).
  The KEEP columns (PLAYER_ID, PLAYER_NAME, TEAM_ID, GAME_ID, GAME_DATE, MIN, PTS,
  AST, OREB, DREB, STL, BLK, TOV, FGA, FG3A, FTA, PLUS_MINUS) are exactly the form
  inputs — nothing else is needed.
- **Backwards extension (real, same endpoint):** run the same endpoint for 1996-97…
  2014-15. The endpoint covers those seasons; the cost is throttling/operator-machine
  time (stats.nba.com blocks datacenter IPs — same caveat as playoffs/honors fetchers),
  not source availability.
- **Second real source (heavier):** BBRef player gamelog pages
  (`basketball-reference.com/players/<id>/gamelog/<year>/`) — per-game boxes for every
  season back to 1996-97. Real, but a per-player scrape (12,966 player-seasons) vs one
  endpoint call per season — use only if stats.nba.com is blocked.
- **NOT acceptable:** deriving "volatility" or "ceiling" from season totals, or from
  the 14-d profile — within-season game-to-game variation is destroyed by aggregation
  and cannot be reconstructed. Any such column would be a fabricated feature.

### Join key and failure modes

- Key: `(PLAYER_ID, season)`; charted-name lookup drops log players with no charted
  row (correct — uncharted players are not matrix rows). Old raw-name join lost 658
  rows; current code keys by pid.
- Failure modes: minimum-games threshold inside `compute_form_features` (rows with
  few games get unstable CV/ceiling — check the builder's floor before trusting
  low-GP rows); traded players' games pooled across teams (form is team-agnostic,
  which is correct for scoring volatility but hides team-context effects).

### Decision / check

- Decision: **fetch-or-mask, same as §5/§6.** Form is the purest gamelog dependency
  (no season-level fallback exists even in principle), so if the coordinator declines
  the gamelog fetch, form should be *dropped as a family* (or explicitly declared
  gamelog-era-only) rather than zero-filled — the contract's MIN_FAMILY_COVERAGE gate
  (0.01) would otherwise keep a 0.398-coverage family that is really a 0.000-coverage
  family for 60% of rows.

---

## 8. Career — 12 columns, contract coverage 0.693

Contract columns: `YEAR_IN_LEAGUE`, `LAG1_COSINE`, `DELTA_NORM`, `GP_RATIO`,
`DRAFT_SLOT_Z`, `CAREER_SLOPE_3Y`, `CAREER_GAP_YEARS`, `CAREER_TEAM_CHANGE`,
`CAREER_EXP_YEARS`, `CAREER_MPG_SLOPE`, `CAREER_GP_SLOPE`, `CAREER_ACTIVE_FRAC`
(from `build_career_context.py`, keyed by stable NBA PLAYER_ID over the base matrix).

### Cached

- The base matrix itself (`build_vectors.py --offline` output: 12,966 × 73) — slopes,
  lags, deltas, gaps, team changes, and experience years are all computable from
  continuous PLAYER_ID trajectories over season rows. No gamelog needed for those 11.
- `pipeline/cache/draft_history.json` — `DRAFT_SLOT_Z`.
- `pipeline/data/min_gp.json` — **absent** (it is a `pipeline/data/` artifact); it is
  the pre-gamelog fallback for GP/MPG inputs (`build_min_gp --offline` rebuilds it from
  cached season data — it does not need gamelogs).
- `pipeline/data/availability.json` — absent; needed only for the availability-linked
  pieces (see below).

### Gapped

- `GP_RATIO` (games played / mean games of his teams' rosters) is the gamelog-gated
  column: `load_gp_ratios()` keys on the log's PLAYER_ID, sums traded players' games
  over teams, divides by the mean of those teams' roster means. Pre-2015-16 (and until
  gamelogs land) it has no input — though `min_gp.json` GP vs season length is a
  partial stand-in for the numerator, the *roster-mean denominator* is a gamelog
  construct.
- First-season rows have no lag/slope by definition (masked, not missing data);
  left-censored careers (debut before 1996-97) have truncated slopes — the builder
  tracks this via `career_fully_observed`.
- `build_career_context.py` **requires** `train_matrix.npz` (raises SystemExit without
  it) and reads `availability.json` if present — so career cannot run before the base
  build + availability build, even though most of its columns need neither gamelogs
  nor availability.

### Best real alternate source per gap

- For `GP_RATIO`: **BBRef per-game GP + team schedule lengths** — GP from
  `bbref_per_game_*.json` (complete, 30 seasons) and team games from `team_base_*`
  (W+L) give GP/team-games, a real ratio that differs from the specified
  roster-mean denominator only in the denominator (schedule games vs roster mean —
  nearly identical for non-traded players; traded players need the mean-of-teams rule
  re-implemented from `player_team_season.json` team lists). This is the most
  defensible fallback in the report: same numerator source family, real denominator.
- For the rest: no alternate needed — the base matrix *is* the source.

### Join key and failure modes

- Key: `(PLAYER_ID, season)` throughout; `vectors.json` rows without a numeric pid
  get no career row (builder warns and counts them).
- Failure modes: (a) the old raw-name GP_RATIO join lost the same 658 rows and kept
  only the last-reached team for traded players — both fixed by pid keying + summed
  teams; (b) regular-season-only filtering matters: the logs hold preseason/All-Star/
  playoff/play-in/Cup games, and the All-Star pseudo-teams (TEAM_ID 1610616833/834,
  roster mean ≈ 1 game) would corrupt GP_RATIO if unfiltered — the builder filters
  via `seasons.is_regular_season`; any reimplementation must keep that filter;
  (c) slope columns on short careers (<2–3 observed seasons) are masked, so early-career
  rows are systematically thinner — a modeling caveat, not a data error.

### Decision / check

- Decision: **career is the salvageable gamelog family.** Ruling needed: run career
  with `GP_RATIO` masked pre-2015 (11 of 12 columns live) vs adopt the BBRef-GP
  fallback ratio for full-era coverage. Recommendation to the coordinator: run it
  masked-first (no definition change), because career's 0.693 coverage already reflects
  first-season/lag masking and the GP_RATIO fallback's denominator change would need
  its own validation. Check: confirm `build_min_gp --offline` reproduces `min_gp.json`
  from cache alone before relying on it as the fallback numerator.

---

## 9. Team — 5 columns, contract coverage 0.261

Contract columns: `TM_PACE`, `TM_OFF_RTG`, `TM_DEF_RTG`, `TM_NET_RTG`, `TM_WIN_PCT`
(from `integrate_context.py` team-env join, "joined via roster_context teamId").

### Cached

- `pipeline/cache/team_base_*.json` — 30 files, 1996-97…2025-26, each 30 teams with
  TEAM_ID / TEAM_NAME / W / L / W_PCT. Complete.
- `pipeline/cache/team_advanced_*.json` — 30 files, 1996-97…2025-26, with PACE /
  OFF_RATING / DEF_RATING / NET_RATING. Complete.
- Together these are *exactly* the five TM_* inputs for every team-season. The team
  data itself has no gap whatsoever.

### Gapped

- The **join**, not the data: team columns reach a player row only through
  `roster_context.json`'s `teamId` (`integrate_context`: `team_index.get((season,
  int(r["teamId"])))` if the roster row has one, else no team values). Hence team
  coverage is 0.261 — identical to roster — even though team stats cover all 30
  seasons. Pre-2015-16 rows and sub-800-minute rows get no team context despite the
  team being known.
- The merged `team_season_*.json` files the join reads are themselves derived
  (see §13) — but that derivation needs only the two complete caches, so it is a
  build step, not a data gap.

### Best real alternate source per gap

- **No new external source needed.** The alternate *join* is
  `assets/player_team_season.json` (Name|season → abbr, 14,565 keys, all seasons)
  plus an abbreviation→TEAM_ID map. The map itself is the only missing link: team
  caches key by TEAM_ID/TEAM_NAME (not abbreviation), so the coordinator must bless
  one static NBA abbr→ID table (stable across the matrix era except for
  franchise-rename cases: e.g. CHA/CHO, BKN/NJN, NOP/NOH — the map must be
  season-aware for renamed franchises, or the join must go through TEAM_NAME).
  With that map, TM_* coverage goes from 0.261 to ~1.0 with zero new fetching and
  zero definition change to the TM_* values themselves — only the team-attribution
  rule changes (primary team per player_team_season vs log-derived teamId).
- Traded players remain the residual: player_team_season carries one team per
  player-season, so the secondary stint's team context is still lost (same as the
  roster join — no regression, but no fix either).

### Join key and failure modes

- Specified key: `(season, TEAM_ID)` via roster `teamId`. Alternate key:
  `(season, abbr)` → TEAM_ID map → team index.
- Failure modes: (a) franchise renames across seasons (abbr changes while TEAM_ID is
  stable — an abbr map that is not season-aware mis-joins CHA/CHO, NJN/BKN, NOH/NOP
  rows); (b) the roster join silently drops rows with no `teamId` rather than
  erroring — a coverage drop looks like missing data when it is a join drop;
  (c) W_PCT vs WIN_PCT naming: merged output columns are `WIN_PCT` (from
  `fetch_team_season.OUTPUT_COLS`), while the base cache field is `W_PCT` — a
  rename bug in the merge would zero the column, so the merge output must be
  spot-checked against `team_base_*` values.

### Decision / check

- Decision: **adopt the player_team_season alternate join or not.** This is the
  cheapest coverage win in the report (0.261 → ~1.0, no fetch, no value-definition
  change). The check that unblocks it: build the season-aware abbr→TEAM_ID map and
  verify it against gamelog-era roster rows (where both the abbr and the TEAM_ID
  are known) — 100% agreement on the overlap is the acceptance test. If the
  coordinator prefers definition purity (log-derived teamId only), then team stays
  at 0.261 and the "team data is complete" fact must never be quoted as "team
  features are complete."

---

## 10. System — 6 columns, contract coverage 0.261

Contract columns: `SYSTEM_PACE_SPACE`, `SYSTEM_MOREYBALL`, `SYSTEM_GRIND`,
`SYSTEM_POST_HEAVY`, `SYSTEM_TRANSITION`, `SYSTEM_BALANCED` (from
`derive_system_tags.py`: a 6-way k-means over team-season offensive style, one-hot
per player via his team's tag). HEAD-chain only — not in the spec's 17 families.

### Cached

- Everything needed is derived, not fetched: team-season style vectors come from the
  base matrix's shotmix/tracking columns (`PCT_PTS_3PT`, `PCT_PTS_2PT_MR`,
  `PCT_PTS_PAINT`, `PCT_PTS_FB`, `PCT_PTS_OFF_TOV`, `PCT_AST_FGM`, `POST_TOUCHES`)
  aggregated to team level weighted by roster minutes, plus real team PACE from
  `team_season_*.json`. No external source is involved at all.

### Gapped

- Doubly gated: (a) `roster_context.json` (gamelog-derived, ≥800-minute rotation
  players only, ≥6 players per team-season or the team is dropped — `MIN_PLAYERS = 6`);
  (b) all 7 style columns must be observed for a player to contribute to his team's
  vector — `POST_TOUCHES` is a tracking column (masked pre-2013), so pre-2013
  team-seasons cannot form vectors even where rosters exist. The builder's own
  docstring states coverage 2015-16+ only (the roster window dominates).
- The k-means itself is stochastic (sklearn KMeans, no seed pinned in the code
  read) and the tag labels are assigned greedily by cosine match to hand-specified
  directions — so system tags are *not* reproducible bit-for-bit across runs unless
  a seed is pinned. That is a reproducibility gap, not a data gap, but it must be
  fixed before system tags anchor any contract.

### Best real alternate source per gap

- None needed and none exists: system tags are a derived clustering, not a fact to
  source. The "alternate" is the same roster fallback as §6/§9
  (player_team_season + BBRef-MP minutes) to widen the team pool, plus pinning the
  KMeans seed. Do not source tags from any external "play style" taxonomy — that
  would replace a measured clustering with someone else's labels.

### Join key and failure modes

- Key: `(season, TEAM_ID)` — "the same (season, teamId) key roster_context.json
  already uses for the team-env family." The merge one-hots the team's tag onto
  every player row of that team-season.
- Failure modes: (a) inherits every roster failure mode (§6) — a team with <6
  qualifying rotation players gets no tag, and all its players mask all 6 system
  columns; (b) `SYSTEM_BALANCED` is the zero-direction tag (all-zeros direction
  vector), so it functions partly as a residual bucket — its meaning ("balanced"
  vs "unclassified") must be labeled wherever tags are interpreted; (c) cluster
  label assignment is greedy by descending best match, so a near-tie between two
  tags resolves arbitrarily — near-tie team-seasons should be flagged, not silently
  labeled.

### Decision / check

- Decision: **seed + scope.** Pin the KMeans seed (reproducibility) and decide
  whether system stays gamelog-era-only (0.261) or follows the roster fallback to
  full-era. Check: re-run the clustering twice with the pinned seed and confirm
  identical tags; report the near-tie rate (teams whose top-two cosine matches are
  within 0.05) as a quality metric before any tower consumes the tags.

---

## 11. Injury-readout — 4 columns, contract coverage 0.398 (readout only, never a tower input)

Contract columns: `INJ_GP_PCT`, `INJ_MISS_N`, `INJ_MAX_MISS_STREAK`,
`INJ_MISS_SPELLS` (from `build_availability.py` → `availability.json`).
Per SOURCES.md §3 and the builder's role ("injury-proxy layer for the career GP head
and trade-surplus trust"), `train_mtnn.py` drops injury as input always — these
columns are a readout/trust layer, not model features. Do not let a coverage
argument for injury drive a fetch decision on its own.

### Cached

- `pipeline/data/min_gp.json` — absent, but rebuildable offline (`build_min_gp
  --offline`) from cached season data; it is the pre-gamelog fallback.
- Season lengths are hardcoded in the builder (`1998-99: 50, 2011-12: 66, default
  82`) — complete for the matrix era.

### Gapped

- Gamelog-era streak/spell detail: `LONGEST_MISS_STREAK` and `MISS_SPELLS` (spells
  ≥3 games, between first and last appearance on the primary team) exist **only**
  from gamelogs. The pre-gamelog fallback (`from_min_gp`) emits `GP_PCT` and
  `MISS_N` with streak/spells = None → masked. So pre-2015-16 rows can carry 2 of 4
  injury columns without any fetch; the other 2 are gamelog-only.
- `build_availability.py` treats a missing `min_gp.json` as non-blocking ("pre-gamelog
  seasons will be skipped") — so without both gamelogs *and* min_gp, pre-2015 injury
  is entirely absent rather than partially present. That fallback must actually be
  built; it is currently not on disk.

### Best real alternate source per gap

- **Primary:** `fetch_gamelogs.py` (same fetch as §5–§7) — team game lists + player
  game sets give exact missed-game sequences on the primary team.
- **For streak/spells pre-2015 (real, but heavy):** BBRef player gamelog pages
  (per-game appearance, same source as §7's second option) — appearance/miss
  sequences are derivable from game dates + team schedules without box-score stats.
  A lighter real alternate: **team schedule + player GP dates from BBRef boxes** is
  the same thing at lower resolution. No proxy (e.g. "games missed ≈ 82 − GP"
  spread evenly) may fill streak/spells — the whole point of the columns is the
  *shape* of absence (one long injury vs scattered DNPs), which a total cannot encode.

### Join key and failure modes

- Key: `(PLAYER_ID, season)`; `availability.json` "carried player_id all along"
  (integrate_context docstring) — the pid-safest of the gamelog artifacts.
- Failure modes: (a) primary-team reduction: a traded player's misses are measured
  against his primary team's schedule only — secondary-team games are invisible,
  so MISS_N is understated for traded players; (b) MIN > 0 appearance rule: a
  DNP-CD game in the log (MIN null/0) counts as missed, but a game where the player
  dressed and played 0.x minutes counts as played — consistent, but the boundary
  must be documented; (c) lockout seasons use hardcoded lengths — any other
  shortened season (e.g. 2019-20, 2020-21) uses default 82 in the fallback path,
  which misstates GP_PCT for those seasons unless the gamelog path (real team game
  lists) is used — prefer the gamelog path for 2019-20/2020-21 specifically.

### Decision / check

- Decision: none blocking — injury is readout-only. Check: build `min_gp.json`
  offline now (no fetch needed) so pre-2015 rows carry GP_PCT/MISS_N; treat
  streak/spells as gamelog-era-only until the gamelog fetch lands. Do not spend
  fetch budget on injury alone.

---

## 12. Salary upstream provenance hunt — VERDICT: NO (from file contents, headers, or fetch_salaries.py)

**Question:** can the Kaggle-vs-HoopsHype origin of `salaries_history.csv` be determined
from file contents, headers, or `fetch_salaries.py`? **Answer: no, with evidence.**

Evidence:

1. **Header carries no provenance.** The file header is `name,season,salary,team`
   (schema allows optional `cap_pct`, but the shipped file has no such column and no
   source column). There is no export stamp, dataset name, URL, or download date
   anywhere in the 16,678 rows.
2. **Merged metadata carries no provenance.** `salaries_merged.json._meta` =
   `{key_format: '<norm_name>|<season>', rows: 16678, schema:
   'pipeline\cache\salaries_history.schema.json'}` — schema pointer only.
3. **The schema describes the drop-in, not its origin.** `salaries_history.schema.json`
   says "Drop-in CSV at pipeline/cache/salaries_history.csv. One row per
   player-season contract year." It documents the *format*, not the *source*.
4. **`fetch_salaries.py` explicitly presents the CSV as a manual drop-in with
   multiple candidate origins.** Its docstring lists Kaggle ("search for 'NBA player
   salaries'"), HoopsHype ("browser export or a one-off scrape"), BBRef contracts
   ("recent seasons only"), and Spotrac/RealGM ("alternative manual exports") —
   and instructs the operator to *rename* Kaggle-style columns (`Player`/`Season`/
   `Salary`) and *convert* single-year seasons (2024 → 2023-24) into the schema.
   That normalization step is exactly what would erase the fingerprints that could
   distinguish Kaggle from HoopsHype: the shipped file is already in normalized
   `YYYY-YY` form with normalized column names, so neither candidate's native
   format survives to be identified.
5. **The one datable fact in-repo points to BBRef, not to the original export.**
   `fetch_salary_history.py`'s docstring states the CSV "covers 1990-91 .. 2017-18
   and then jumps to 2025-26 (BBRef 'current contracts')" and that 2018-19…2024-25
   "were never backfilled" — and the current per-season counts (2018-19: 581 …
   2024-25: 518) show that backfill *has since been merged*. So the file is a
   composite: an unattributed pre-2018 core + a BBRef backfill + BBRef current
   contracts. Even a successful identification of one layer would not identify the
   core.
6. **License consequence:** per SOURCES.md §7, the market family's upstream license
   is **UNCONFIRMED**. Nothing in-repo grants or asserts a license for the salary
   data, and no `LICENSE*` file exists in either checkout.

**What *could* determine it (a check, not a file verdict):** a value spot-check —
take 20–50 rows spanning 1990-91…2017-18 (including known definitional edge cases:
two-way conversions, stretched/waived salaries, sign-and-trade years) and compare
them exactly against the current HoopsHype historical pages and the leading Kaggle
NBA-salaries exports. Exact agreement with one source's quirks (e.g. HoopsHype
cap-hit vs cash-salary treatment of a specific waived player) would identify the
origin; disagreement with both would indicate a third source or manual edits.
That check requires external fetches and is outside this read-only lane — it is
recorded here as the unblocking check, not performed.

---

## 13. Team-season context files (`team_season_*.json`) — VERDICT: DERIVED, not cached

**Question:** do `team_season_*.json` files exist in cache, or are they derived?
**Answer: derived. They exist nowhere on disk in this checkout.**

Verification performed:

- `ls pipeline/cache/ | grep team_season` → empty. The cache holds `team_base_*.json`
  and `team_advanced_*.json` (30 each), not merged team-season files.
- `pipeline/data/` does not exist at all (gitignored; absent from all checkouts), so
  no `pipeline/data/team_season_*.json` or `team_season_manifest.json` exists either.
- `git ls-files | grep team_season` → only the two *scripts*
  (`fetch_team_season.py`, `import_team_season_cache.py`), zero data files.
- Three consumers read them from `pipeline/data/`: `competition_context.py`
  (`team_net()`), `derive_system_tags.py` (`load_team_season_pace()`), and
  `integrate_context.py` (`load_team_season_index()`) — all glob
  `DATA_DIR / "team_season_*.json"` excluding the manifest, and all silently yield
  empty indexes when the files are absent (team/competition/system columns mask,
  no error).

How they are produced (no fetch needed for the merge itself):

- `python pipeline/fetch_team_season.py --offline` merges `team_base_*` +
  `team_advanced_*` per season into `pipeline/data/team_season_{season}.json`
  (columns: TEAM_ID, TEAM_NAME, PACE, OFF_RATING, DEF_RATING, NET_RATING, W, L,
  WIN_PCT) + `team_season_manifest.json`. Both input caches are complete for
  1996-97…2025-26, so the offline merge should succeed for all 30 seasons.
- `import_team_season_cache.py` is the fallback that *populates the input caches*
  when stats.nba.com is throttled: Brescou NBA-dataset CSVs (1996-97…2022-23) +
  BBRef league pages (2024-25, 2025-26) — note the 2023-24 season is not named in
  either fallback leg, so if the API path ever fails for 2023-24 specifically, the
  fallback has a hole there. With the committed caches complete, this is latent,
  not live.
- **Consequence:** "team-season context is missing" is a misdiagnosis. The data is
  cached; the *build step* (offline merge) has not been run in this checkout
  (because `pipeline/data/` is gitignored and was never materialized here). The
  unblocking action is running that merge, not fetching team stats — except that
  team/competition/system *columns* still depend on the roster join (§9), so the
  merge alone lifts team coverage only as far as roster coverage allows unless
  the §9 alternate join is also adopted.

---

## 14. Cross-family summary

| Family | Contract cols | Coverage | Cached? | Blocker class |
|---|---|---|---|---|
| Salaries/market | 4 (1 base + 3 expansion) | 0.884 | Yes, minus 1,435 rows | Backfill audit (BBRef team pages) |
| Honors | 5 | 0.924 | Yes, 30 files complete | **Semantics decision (§2)** + 2025/26 ASG re-parse |
| Playoffs | 14 | 0.459 (structural) | Yes, 60 files complete | None (verify pid emission) |
| Pedigree | 7 | 0.927 | Yes, draft complete | None |
| Competition | 4 | 0.398 | No (needs gamelogs) | Gamelog fetch or scope cut |
| Roster | 5 | 0.261 | No (needs gamelogs) | Gamelog fetch or fallback join |
| Form | 5 | 0.398 | No (needs gamelogs) | Gamelog fetch or drop family |
| Career | 12 | 0.693 | Mostly (base matrix) | GP_RATIO only; masked-first is viable |
| Team | 5 | 0.261 | Inputs yes; merged files no | Merge step + roster join (§9 alternate) |
| System | 6 | 0.261 | Derived; no fetch | Roster join + KMeans seed |
| Injury-readout | 4 | 0.398 | Partial (min_gp rebuildable) | None blocking (readout only) |

**Single highest-leverage action:** run `fetch_gamelogs.py` (2015-16…2025-26) on an
operator machine — it unblocks form, roster, competition, injury streak/spells, and
career GP_RATIO simultaneously, and roster unblocks team + system joins. Everything
else is a decision, a merge step, or a bounded backfill.

**Decisions needing a named owner (not data):** honors semantics (§2, coordinator /
Lane 2); competition/roster/form scope (fetch vs mask vs fallback join, coordinator);
team alternate join (§9, coordinator); system seed + scope (§10, builder owner).
No decision in this report requires new external data beyond the gamelog fetch and
the BBRef salary/ASG backfills named above.

---

## Verdicts

VERDICT: PASS — context family inventory complete (11 families, cached/gapped/alternate/join/decision each) — ~/workspace/mlops-v2-drafts/data-deep-dive/context-sources.md
VERDICT: PASS — salary provenance hunt answered NO with file/header/script evidence (composite file: unattributed pre-2018 core + BBRef backfill + BBRef current) — ~/workspace/mlops-v2-drafts/data-deep-dive/context-sources.md
VERDICT: PASS — team-season file verdict established: team_season_*.json are DERIVED (offline merge of complete team_base_*/team_advanced_* caches), exist nowhere on disk — ~/workspace/mlops-v2-drafts/data-deep-dive/context-sources.md
VERDICT: BLOCKED — honors semantics undecided (lag+measured-zero 0.924 vs lag+honor-only 0.087 vs current-season; promoted-matrix exact-match test or coordinator ruling required) — ~/workspace/mlops-v2-drafts/data-deep-dive/context-sources.md
VERDICT: BLOCKED — gamelog-gated families (form, roster, competition, injury streak/spells, career GP_RATIO) await fetch_gamelogs.py on an operator machine; pipeline/data/ absent in this checkout — ~/workspace/mlops-v2-drafts/data-deep-dive/context-sources.md

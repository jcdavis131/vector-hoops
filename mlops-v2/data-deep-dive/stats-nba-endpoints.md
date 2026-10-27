# Stats-NBA Endpoints — Vector Hoops MTNN Data-Collection Deep Dive

**Lane:** stats-nba-endpoints (read-only investigation) · **Date:** 2026-10-26/27
(CDT probe 2026-10-26 ~22:48 CDT / 2026-10-27 03:48 UTC) · **Checkout read:**
`~/workspace/vector-hoops-mlops-v2`, HEAD at probe time `aaf003be`
(task brief ground truth cited master `1e5bfecc`; the cache counts below
were re-measured at `aaf003be` and still match the brief: 788 git-tracked
files under `pipeline/cache/`, so the checkout drift does not change any
coverage conclusion here).

**Read first (per brief):** `~/workspace/mlops-v2-drafts/lanes/01-data-collection/SOURCES.md`
§3 and `~/workspace/mlops-v2-drafts/lanes/07-pipeline-overhaul/INVENTORY.md` §1.
This report builds on those, it does not re-derive them. Season span
throughout is 1996-97…2025-26 (30 seasons) unless a first-season floor is
stated. All fetch code lives under `pipeline/` in the checkout above;
all cache paths are under `pipeline/cache/` unless stated otherwise.

**Method / bounds honoured:** read-only. No bulk fetch, no writes to any
live checkout, no training, no prod writes, no subagents. Network work
was exactly two single requests (site root + one `/stats/` endpoint),
each once, each with a 15 s client timeout, no retry — see §3. Nothing
else was fetched from stats.nba.com.

**One-line finding:** every stats.nba.com endpoint the pipeline needs is
already fully cached for its era, so the Hatch stall blocks only
*re*-fetching (above all the missing regular-season gamelogs), not the
73-feature base rebuild — and today's probe refines the stall from
"handshake never completes" to "TLS completes, then zero bytes until
client timeout."

## 1. Endpoint table — what the pipeline actually calls

URL base for every row: `https://stats.nba.com/stats/{endpoint}`
(`pipeline/nba_http.py`: `STATS_API`). Two call styles exist and matter
for the stall diagnosis: (a) `nba_http.fetch_stats_json` — curl_cffi
Chrome-120 impersonation when installed, else the `nba_api` fallback;
(b) direct `nba_api` endpoint classes wrapped in `nba_http.retry_call`
(`build_vectors.py`, `fetch_team_season.py`, `fetch_gamelogs.py`).
`nba_api` class names map to the endpoint names in the table
(`LeagueDashPlayerStats` → `leaguedashplayerstats`, etc.).

| # | Endpoint (as called) | Caller(s) | What it returns — fields that matter | Cache file(s) fed |
|---|---|---|---|---|
| 1 | `leaguedashplayerstats`, MeasureType=Base, PerMode=Per100Possessions | `build_vectors.py:fetch_dash("Base")` via `nba_api` | Per-100 box: PTS, AST, OREB, DREB, STL, BLK, TOV, FGA, FG3A, FTA, FG_PCT, FG3_PCT, FT_PCT, PLUS_MINUS (+ MIN, GP for eligibility) — the frozen 14-dim game vector plus volume/playmaking/rebounding/defense inputs | `dashbase_*.json` (current, list rows) + legacy alias `base_*.json` (name-keyed dict; see note below) |
| 2 | `leaguedashplayerstats`, MeasureType=Advanced, PerMode=Per100Possessions | `build_vectors.py:fetch_dash("Advanced")` | TS_PCT, EFG_PCT, USG_PCT, AST_PCT, AST_TO, OREB_PCT, DREB_PCT, REB_PCT, TM_TOV_PCT, OFF_RATING, DEF_RATING, NET_RATING, PACE, PIE | `dashadvanced_*.json` |
| 3 | `leaguedashplayerstats`, MeasureType=Scoring, PerMode=Per100Possessions | `build_vectors.py:fetch_dash("Scoring")` | Shotmix: PCT_PTS_2PT / _2PT_MR / _3PT / _FB / _FT / _OFF_TOV / _PAINT, PCT_AST_2PM / _UAST_2PM / _AST_3PM / _UAST_3PM / _AST_FGM / _UAST_FGM | `dashscoring_*.json` |
| 4 | `leaguedashplayerbiostats` | `build_vectors.py:fetch_bio` via `fetch_stats_json` (LeagueID=00, Season, SeasonType=Regular Season) | PLAYER_HEIGHT_INCHES, PLAYER_WEIGHT, AGE, DRAFT_NUMBER (+ derived DRAFT_UNDRAFTED). Note: cached `bio_*` rows have since gained undeclared combine-ish keys (wingspan, standing reach, verticals — see `build_vectors.py` SOURCE_CONTRACTS comment); the build filters bio to the 4 contract columns + undrafted flag only, so those keys never reach the matrix | `bio_*.json` |
| 5 | `leaguedashptstats`, PtMeasureType ∈ {SpeedDistance, Drives, CatchShoot, PullUpShot, Possessions, Passing}, PerMode=PerGame, PlayerOrTeam=Player | `build_vectors.py:fetch_tracking` via `nba_api` | 20 contract columns: DIST_MILES, AVG_SPEED; DRIVES, DRIVE_PTS, DRIVE_PASSES; CATCH_SHOOT_FGA/PTS/FG3_PCT; PULL_UP_FGA/PTS; TOUCHES, FRONT_CT_TOUCHES, TIME_OF_POSS, AVG_SEC_PER_TOUCH, PAINT_TOUCHES, POST_TOUCHES, ELBOW_TOUCHES; PASSES_MADE, POTENTIAL_AST, SECONDARY_AST | `tracking_*.json` (merged per-player dict) |
| 6 | `leaguedashptstats`, PtMeasureType=PullUpShot only | `fetch_wide_skills.py:fetch_ptstats` via `fetch_stats_json` | PULL_UP_FG3A only (pull-up three volume for the shooting-gravity skill input) | `wide_skills_*.json` (one of 4 inputs merged per player) |
| 7 | `leaguehustlestatsplayer`, PerMode=PerGame | `fetch_wide_skills.py:fetch_hustle` AND `fetch_advanced_tracking.py:fetch_hustle` via `fetch_stats_json` | SCREEN_ASSISTS, DEFLECTIONS, LOOSE_BALLS_RECOVERED, CHARGES_DRAWN, CONTESTED_SHOTS, BOX_OUTS (BOX_OUTS required only from 2017-18; all-zero 2015-16/2016-17, nulled by season rules). `fetch_wide_skills.py` explicitly does NOT fetch D_FG_PCT: the Defense measure returned 0.0 for every player in all 11 cached seasons, so the field is written null rather than requested under a name the response does not carry | `wide_skills_*.json`; in `fetch_advanced_tracking.py` it feeds `advanced_tracking_*.json` (see §2 — no such season files exist) |
| 8 | `synergyplaytypes`, PlayType ∈ {Postup, Transition}, TypeGrouping=offensive, PerMode=PerGame | `fetch_wide_skills.py:fetch_synergy` via `fetch_stats_json` | Per play type: POSS_PCT (→ post_freq / trans_freq, ×100) and PPP (→ post_ppp / trans_ppp) | `wide_skills_*.json` |
| 9 | `leaguedashptstats`, PtMeasureType ∈ {Drives, Passing, Defense, Rebounding, SpeedDistance, CatchShoot, Possessions} | `fetch_advanced_tracking.py:fetch_pt_measure` via `fetch_stats_json` (3.5 s gap, 30 s timeout) | Full tracking columns incl. Defense/Rebounding measures that `build_vectors.py` does NOT use (contested 2s/3s, boxouts, charges, speed/distance, potential assists) | Intended: `advanced_tracking_*.json` + `tracking_summary.json` — **no season files exist** (see §2) |
| 10 | `leaguedashteamstats`, MeasureType=Base, PerMode=PerGame | `fetch_team_season.py:fetch_measure("Base")` via `nba_api` | TEAM_ID, TEAM_NAME, W, L, W_PCT | `team_base_*.json` |
| 11 | `leaguedashteamstats`, MeasureType=Advanced, PerMode=PerGame | `fetch_team_season.py:fetch_measure("Advanced")` via `nba_api` | PACE, OFF_RATING, DEF_RATING, NET_RATING. SOS candidates (SOS / OPP_PTS / STRENGTH_OF_SCHEDULE) are read only if present; the code notes they are "not present on leaguedashteamstats today" | `team_advanced_*.json`; merged into `pipeline/data/team_season_*.json` (gitignored build output, not cache) |
| 12 | `leaguedashplayerstats`, MeasureType ∈ {Base, Advanced}, PerMode=Per100Possessions, SeasonType ∈ {Playoffs, Regular Season} | `fetch_playoffs.py:dash_player_rows` via `fetch_stats_json` (full filter param set; minimal params → HTTP 500 per code comment) | Base: PLAYER_ID, PLAYER_NAME, TEAM_ID, GP, MIN, PTS, PLUS_MINUS. Advanced: USG_PCT, TS_PCT. Playoff-vs-regular-season deltas (PTS100, USG, TS, PLUS_MINUS) are the playoffs family input | `playoffs_*.json` (players + teams, `complete: true`) |
| 13 | `leaguedashteamstats`, MeasureType=Base, PerMode=Totals, SeasonType=Playoffs | `fetch_playoffs.py:fetch_team_playoffs` via `fetch_stats_json` | TEAM_ID, W only — playoff wins → rounds-advanced (0–4, with the pre-2002 best-of-5 first-round correction: 15-win champions, not 16) | `playoffs_*.json` (`teams` block) |
| 14 | `leaguegamelog`, PlayerOrTeam ∈ {P, T}, SeasonType=Playoffs, Sorter=DATE, Direction=ASC | `fetch_playoff_gamelogs.py` via `fetch_stats_json` | Team games: GAME_ID, GAME_DATE, TEAM_ID, TEAM_ABBREVIATION, MATCHUP, WL, PTS, PLUS_MINUS. Player games: + PLAYER_ID, PLAYER_NAME, MIN, REB, AST, STL, BLK, TOV, FGM/FGA, FG3M/FG3A, FTM/FTA | `playoff_games_*.json` (teamGames + playerGames + derived seriesByTeam) |
| 15 | `playergamelogs` (nba_api `PlayerGameLogs`, Season, timeout=60) | `fetch_gamelogs.py` via `nba_api` + `retry_call` (3 attempts) | Per-game rows kept: PLAYER_ID, PLAYER_NAME, TEAM_ID, TEAM_ABBREVIATION, GAME_ID, GAME_DATE, MIN, PTS, AST, OREB, DREB, STL, BLK, TOV, FGA, FG3A, FTA, PLUS_MINUS | `pipeline/data/gamelogs_*.jsonl` — **gitignored, ABSENT from every checkout** (the 143-column chain's hard gap; see SOURCES.md §6) |
| 16 | `drafthistory` (LeagueID=00 only, one call, timeout=90) | `fetch_draft_history.py` via `fetch_stats_json` | PLAYER_NAME, OVERALL_PICK, SEASON, ROUND_NUMBER, ROUND_PICK, TEAM_ID, TEAM_ABBREVIATION, PERSON_ID — 7,383 drafted names in cache, years 1947…2025 | `draft_history.json` (single file, `complete: true`) |
| 17 | `draftcombinestats` (LeagueID=00, SeasonYear=season label, one call per year 2000…last combine, timeout=60, 3.0 s gap) | `fetch_combine.py` via `fetch_stats_json` | Measured-only: HEIGHT_WO/W_SHOES, WEIGHT, WINGSPAN, STANDING_REACH, BODY_FAT_PCT, HAND_LENGTH/WIDTH, STANDING/MAX_VERTICAL_LEAP, LANE_AGILITY_TIME, MODIFIED_LANE_AGILITY_TIME, THREE_QUARTER_SPRINT, BENCH_PRESS. A skipped test (endpoint null) yields no field; nothing is estimated — the old fabricated-ratio paths were deleted 2026-10-09 | Intended: `combine_measurements.json` — **ABSENT** (see §2). Not a matrix input either way (`build_vectors.py` SOURCE_CONTRACTS excludes combine fields from the bio tower) |

Re-uses that are not separate endpoints: `build_min_gp.py` and
`build_wiki.py` both import `leaguedashplayerstats` (rows 1–3 family,
for MIN/GP and wiki display respectively) — no new endpoint.
`fetch_missing_tracking.py` is a no-network completeness checker, not a
fetcher. `fetch_advanced_tracking.py`'s docstring mentions a removed
`data.nba.net` offline fallback; it is gone and must not be revived as
an endpoint claim.

### Endpoints the pipeline does NOT use (candidates, not gaps)

| Endpoint | What it would return | Assessment |
|---|---|---|
| `shotchartdetail` (per-player; LOC_X, LOC_Y, SHOT_ZONE_BASIC/AREA/RANGE, SHOT_MADE_FLAG, etc.) | Per-shot locations — the only stats.nba.com source for a historical shot-position tower | **Out of scope for this lane (lane 2 owns it) — cross-ref only.** No `shotchartdetail` response, shot cache, or LOC_X/LOC_Y column exists under `pipeline/cache/` (INVENTORY §1.2). Its source module `pipeline/shotcharts/sources/stats_nba.py` is deliberately gated (honest 503) on the same stall diagnosed in §3, plus a ToS-review gate: even a working technical path needs a terms review before any fetch is wired. Do not treat "endpoint exists" as "cleared to fetch." |
| `leaguedashplayerstats` other MeasureTypes: Defense, Misc, Four Factors, Opponent | Defensive / misc / four-factor splits (e.g. opponent stats) | Not used, not needed for the current 73/143-column chains. Defense-measure D_FG_PCT is already known-dead (row 7). Any future use needs a column audit first (the wide-skills lesson: requiring a column the response does not carry fails every season). |
| `synergyplaytypes` TypeGrouping=defensive; other PlayTypes (Isolation, PnR Ball Handler/Roll Man, Spotup, Handoff, Cut, Off Screen) | Defensive play-type PPP/frequency and the rest of the offensive menu | Not used; wide-skills fetches offensive Postup + Transition only. A wider synergy pull would expand the skill inputs, not the base matrix — a scope decision for the coordinator, not a missing fetch. |
| `leaguedashptstats` Defense + Rebounding measures (via `build_vectors.py`) | Contested shots, boxouts, rebound chances | Already fetched by `fetch_advanced_tracking.py` (row 9) but into files nothing reads; `build_vectors.py` deliberately uses only the 6 measures in row 5. Wiring the extra measures into the matrix is a feature decision, not a fetch gap. |
| `playerdashptshots` / `playerprofilev2` / `commonplayerinfo` / `leaguegamefinder` / `boxscoresummaryv2` / `teamgamelogs` | Per-player shot splits, bios, game lists, boxscores, team logs | Not used and not needed: bio (row 4), gamelogs (rows 14–15), and team stats (rows 10–11) already cover their fields. `teamgamelogs` in particular would duplicate `leaguegamelog` PlayerOrTeam=T. Do not add without a field the current set lacks. |
| `shotchartlineupdetail` | Lineup shot charts | Same lane-2 / gated status as `shotchartdetail`; no pipeline use. |

## 2. Cache-coverage table (re-measured 2026-10-26, this lane)

"Complete" below means: one file per season in the endpoint's era, all
non-empty, and (where the format carries it) `complete: true`. Row counts
are spot-checked, not re-audited season by season — the per-season
completeness claims rest on file presence + non-emptiness + the
`complete` flags, consistent with INVENTORY §1.1.

| Cache group | Files | Era | Status |
|---|---|---|---|
| `dashbase_*` (list rows) | 30 | 1996-97…2025-26 | Complete. 2024-25 = 569 rows (before eligibility gates; served rows 500). Legacy `base_*` name-keyed dicts also exist, 30 files (2024-25 = 569 keys, 1996-97 = 441) — but `build_vectors.py:load_cached` treats a dict under a `dash*` tag as a miss, so the current build reads `dashbase_*`, and `base_*` is effectively a legacy duplicate, not the live source. Quote `dashbase_*` as the live cache. |
| `dashadvanced_*` | 30 | 1996-97…2025-26 | Complete, non-empty all 30. 2024-25 = 569 rows. |
| `dashscoring_*` | 30 | 1996-97…2025-26 | Complete, non-empty all 30. |
| `bio_*` | 30 | 1996-97…2025-26 | Complete, non-empty all 30. 2024-25 = 569 rows. Caveat: undeclared combine-ish keys present in rows (see row 4) — filtered at build time, not a coverage gap. |
| `tracking_*` (+ `tracking_summary.json`, built 2026-08-09, total_rows 6,942, blocked_seasons []) | 13 season files + availability/pre-2013 marker files | 2013-14…2025-26 | Complete for its era; pre-2013 structurally absent (masked, never backfilled) per `seasons.py:TRACKING_FIRST_SEASON`. Season row counts in the summary (e.g. 2024-25 = 569, 2025-26 = 582) match the dash caches, which is the cross-check that tracking covers the same player universe. |
| `wide_skills_*` | 11 | 2015-16…2025-26 | Complete for its era, every file `complete: true`. Player counts track the dash caches exactly (2015-16 = 476 … 2024-25 = 569, 2025-26 = 582). Pre-2015-16 masked by season rules, never fabricated. |
| `team_base_*` / `team_advanced_*` | 30 + 30 | 1996-97…2025-26 | Complete, non-empty all 60. 2024-25 = 30 team rows each. Used by side builders, not by the base build. |
| `playoffs_*` | 30 | 1996-97…2025-26 | Complete, every file `complete: true`. Playoff-player counts 181–239/season (2024-25 = 219, 2025-26 = 230) — playoff-only rosters, as expected, not a shortfall vs. the ~500-row regular-season caches. |
| `playoff_games_*` | 30 | 1996-97…2025-26 | Complete, non-empty all 30; 2024-25 file `complete: true` with teamGames/playerGames/seriesByTeam. |
| `draft_history.json` | 1 | 1947…2025 (single pull) | Complete (`complete: true`, 7,383 drafted names). No per-season loop to go stale; a 2026 draft refresh is one call when the coordinator wants it. |
| `combine_measurements.json` | 0 | — | **ABSENT.** `fetch_combine.py` exists and is runnable in principle, but no cache file was ever committed (the committed file's history is fabricated-ratio data, deleted 2026-10-09). Impact: none on the matrix (combine fields are excluded by SOURCE_CONTRACTS); impact is only on any future combine-display use. Re-fetching it is a clean-machine job, not a matrix blocker. |
| `advanced_tracking_*.json` | 0 season files | Intended 2013-14…2025-26 | **ABSENT despite the script.** `fetch_advanced_tracking.py` writes `advanced_tracking_<season>.json`, but no such file exists; `tracking_summary.json` (which the script also names as an output) describes the `tracking_*` cache instead (rows match `tracking_*`, `blocked: []`, `residential_required: false`). Nothing in the build reads `advanced_tracking_*` — the script's own docstring says so — so this is a dead output path, not a data gap. Do not quote the summary as proof that the advanced-tracking fetch succeeded. |
| `pipeline/data/gamelogs_*.jsonl` | 0 | Intended 2015-16…2025-26 (`GAMELOG_FIRST_SEASON`) | **ABSENT — the single largest stats.nba.com gap.** Blocks form, roster, career, competition, availability/injury, and system families (the 73→143-column step). This is the re-fetch that matters most, and it is exactly the endpoint family (§3) that stalls from Hatch. |
| `matchup_enriched_*` (30) | 30 | 1996-97…2025-26 | Present per INVENTORY §1.1; not a base-build input and not a stats.nba.com fetch in the scripts examined (no endpoint call found in the fetch layer) — listed here only so it is not mistaken for a stats.nba.com cache. Its upstream is out of this lane's scope; verify before citing it as a stats.nba.com source. |

Net: of the 17 endpoint rows in §1, 15 have complete caches, 1
(`draftcombinestats`) has no cache but no matrix impact, and 1
(`playergamelogs` regular-season) has no cache and blocks the
full-context chain. The base 73-feature rebuild needs no network at all.

## 3. Stall diagnosis — why Hatch requests stall

### 3.1 What the code already says (prior evidence, not re-derived)

- `pipeline/nba_http.py` docstring: "Akamai on stats.nba.com fingerprints
  TLS handshakes. Plain `requests` / `nba_api` sessions are often reset
  or timed out even with correct headers." Mitigation in code: curl_cffi
  Chrome-120 impersonation, a warm-up GET to `https://www.nba.com/stats/`
  on each fresh session (to collect the cookies Akamai expects), and
  classified retries (see §4).
- `pipeline/shotcharts/sources/stats_nba.py` (2026-10-21 recon): "every
  request under `/stats/*` (incl. `/stats/shotchartdetail`) tarpits to
  HTTP 000 — the TCP/TLS handshake never completes from this
  environment… the site root (`stats.nba.com/`) returns HTTP 200 fine
  while `/stats/*` hangs until client timeout. Path-level bot-drop, not
  a generic outage."
- Fetch-script comments repeat the same posture in different words:
  "datacenter IPs blocked" (`fetch_wide_skills.py`, `fetch_combine.py`),
  "residential Akamai 403 — PlayerTracking requires non-datacenter IP"
  (`fetch_advanced_tracking.py` handoff marker), "Akamai blocks plain
  `requests` / `nba_api` TLS fingerprints: RemoteDisconnected"
  (`fetch_wide_skills.py:_require_curl_cffi`).

### 3.2 What a single probe from this VM shows today (2026-10-26 ~22:48 CDT)

Two requests only, each once, 15 s timeout, browser user-agent +
`x-nba-stats-origin` / `x-nba-stats-token` headers on the API call,
via this VM's egress proxy (the environment's `HTTPS_PROXY` was set;
that is part of the path, not a variable this lane changed):

| Probe | Result |
|---|---|
| `GET https://stats.nba.com/` (site root) | **HTTP 200**, 4,066 bytes, total 4.26 s (TCP connect 0.004 s, TLS 3.74 s). The host is reachable and serves content from this VM. |
| `GET https://stats.nba.com/stats/leaguedashplayerstats?LeagueID=00&Season=2024-25&SeasonType=Regular%20Season&MeasureType=Base&PerMode=PerGame` | **HTTP 000, curl exit 28 (timeout), 0 bytes after the full 15.000 s.** TCP connect 0.002 s, **TLS completed in 0.76 s**, then nothing — no status line, no headers, no body — until the client gave up. |

Two refinements over the 2026-10-21 wording, from today's numbers:

1. **It is not a handshake failure today.** TLS completed (0.76 s) on
   the `/stats/` request. The stall is *after* TLS, *before* the first
   byte of response. "Handshake never completes" (Oct 21) vs. "TLS
   completes, then silence" (today) are different layers; the honest
   current description is the second. The layer shift could reflect the
   egress proxy terminating TLS, a changed Akamai behaviour, or a
   different probe path — it does not, by itself, distinguish bot-drop
   from filtering (see §3.3).
2. **The pipeline cannot even run its fetch path on this VM as-is:**
   neither `curl_cffi` nor `nba_api` is installed here (checked
   2026-10-26). The curl_cffi path — the code's own recommended path —
   is unavailable, and the `nba_api` fallback is unavailable too. Any
   "just run the fetcher" instruction for Hatch fails before the
   network is even reached. (Installing either is out of this lane's
   read-only bounds and, per the stall evidence, would not by itself
   fix a post-TLS tarpit.)

### 3.3 Distinguishing bot-drop vs. egress filtering vs. TLS interception

Today's evidence is *consistent with* path-level bot-drop (root 200,
`/stats/*` silent, same host, same VM, minutes apart) and *inconsistent
with* a generic outage, DNS failure, or a dead host — but it does **not
prove** bot-drop, because all three hypotheses predict silence on this
one probe:

| Hypothesis | What today's probe shows | What would distinguish it (clean-machine probe, §5) |
|---|---|---|
| **A. Akamai bot-drop (server-side, post-TLS tarpit)** — Akamai classifies the client (datacenter egress IP, proxy TLS fingerprint, missing/incorrect cookies) and holds the connection instead of answering | Consistent: root served (different Akamai behaviour for the marketing root vs. the API path), API path silent after TLS. The code's warm-up-cookie design exists precisely because Akamai gates on more than headers. | Same request from a residential IP with a real browser session (cookies from a prior `www.nba.com/stats` visit in that browser) returns 200 JSON promptly. If it does, A is confirmed and the fix is "run from that machine," not "fix the code." |
| **B. Egress filtering (this VM's proxy / network policy drops or holds `/stats/*`)** | Consistent: the proxy is in the path for both probes, and a path-based proxy rule could pass `/` and hold `/stats/*`. TLS completing does not rule this out if the proxy terminates TLS (the 0.76 s TLS time may be proxy↔client, not client↔Akamai). | Same request from the same VM *bypassing* the proxy (direct egress, if policy allows) vs. through it; and the same request from a different network entirely. Divergent results isolate the proxy. Also: TLS certificate inspection (is the presented cert Akamai's, or the proxy's?) — a proxy-issued cert proves TLS interception is in the path. |
| **C. TLS interception / fingerprint-based reset at a middlebox** | Less consistent today than on Oct 21: a middlebox that resets on fingerprint would more likely produce a reset (curl 56 / connection reset) than 15 s of silence, and TLS *completed*. But a middlebox that holds rather than resets is indistinguishable from A on one probe. | Certificate chain + JA3/TLS-fingerprint comparison across machines, and a curl_cffi (Chrome-impersonated) request vs. a plain-curl request from the *same* machine/network. If impersonation alone flips the result on the same network, the gate is fingerprint-based (A/C family); if it does not, the gate is IP/network-based (A/B family). |

What would **not** distinguish anything and must not be tried as
"diagnosis": rotating IPs, spoofing fingerprints beyond the code's own
curl_cffi path, hammering the endpoint with retries, or bulk probing.
The shotcharts gate rule applies here too — the stall is a deliberate
gate, not a bug to evade. One request per endpoint, then stop, is the
correct probe discipline, and it is what this lane followed.

### 3.4 What the stall does and does not block

- **Does not block:** the 73-feature base rebuild (`build_vectors.py
  --offline`, exit 0 per the brief), any side builder fed only by the
  complete caches (pedigree, honors, playoffs, team context), and any
  read of the tracked cache.
- **Does block from Hatch:** re-fetching any of §1 rows 1–17, above all
  the missing `playergamelogs` regular-season logs (row 15) and any
  refresh of a final-season cache (e.g. a corrected 2025-26 season or a
  future 2026-27 season once `seasons.py:LAST_SEASON` rolls). It also
  blocks any `shotchartdetail` work (lane 2) from this VM.

## 4. Rate limits / throttling — as documented in code or observed

**No measured rate limit is documented anywhere in the fetch code.**
Every number below is a *client-side politeness delay chosen by the
pipeline authors*, not a server-advertised limit. Do not quote any of
them as "stats.nba.com's rate limit."

| Behaviour | Source | Status |
|---|---|---|
| Inter-call sleeps: 1.2 s (`build_vectors.py` dash/bio/tracking, `fetch_gamelogs.py`), 2.5 s (`fetch_wide_skills.py`, between endpoint calls in one season), 3.0 s (`fetch_combine.py`), 3.5 s (`fetch_advanced_tracking.py`, before each endpoint call) | Code constants, quoted verbatim | Client-side pacing. No server response is cited as the reason for any specific value. **UNVERIFIED as a server limit.** |
| "stats.nba.com throttles aggressively; the fetcher retries with long backoff" | `build_vectors.py` docstring | Qualitative claim only. No threshold (requests/minute, burst size) is stated anywhere in the pipeline. **UNVERIFIED.** |
| "stats.nba.com throttles burst traffic" | `fetch_wide_skills.py` comment on `_CALL_GAP_S` | Same as above — rationale for the 2.5 s gap, not a measured limit. **UNVERIFIED.** |
| Retry/backoff in `nba_http.py`: 5 attempts total; backoff 5·2ⁿ s + up to 20% jitter, capped at 120 s (5, 10, 20, 40, 80…); 403 → only 2 attempts total then `BlockedError` ("waiting does not lift a block; callers must not retry it"); 429 and 5xx, timeouts, resets, non-JSON bodies → transient, retried; any other 4xx → immediate `FetchError` ("the request itself is wrong") | `nba_http.py:RETRY_ATTEMPTS`, `BLOCKED_ATTEMPTS`, `BACKOFF_BASE_S`, `BACKOFF_CAP_S`, `classify()` | Code behaviour, verified by reading. Note the asymmetry the authors built in: a 429 is treated as transient (retry), a 403 as permanent (stop). That asymmetry is itself evidence that the authors' lived experience of this API is *blocking*, not *rate-limiting* — a throttled client gets 429s and waits; a blocked client gets 403s (or, from Hatch, silence) and stops. |
| Minimal params → HTTP 500 | `fetch_playoffs.py`, `fetch_wide_skills.py` comments ("stats.nba.com expects the full filter param set") | Server behaviour, documented from experience, not a rate limit. Relevant to clean-machine probes: a 500 on a minimal-param request is a *param* failure, not a block — do not misread it as one. |
| Reused session → Akamai 500 / RemoteDisconnected after synergy/hustle bursts | `nba_http.py:_curl_attempt` comment ("reusing one session across burst calls often triggers Akamai 500 / RemoteDisconnected after synergy/hustle. Each new session is warmed") | Session-hygiene observation, not a rate limit. Implication for probes: fresh warmed session per request, exactly as the code does; do not reuse one session across a probe batch and then interpret a failure as a block. |
| Observed 429s, observed throttle thresholds, observed requests/minute ceilings | — | **None found in code, caches, or this lane's probes.** This lane's single API probe returned no status at all (000/timeout), so no 429 was observed either. Any report claiming a numeric stats.nba.com rate limit for this pipeline is inventing it. |

Practical consequence: on a clean machine, pacing (1–3 s gaps, one
season at a time, fresh warmed session per call) is cheap insurance the
code already implements — but if the clean machine still gets 403s or
silence, pacing harder will not help, because the failure mode is a
block, not a throttle.

## 5. Ranked list: endpoints to re-verify first on a clean machine (Alienware / Mac)

Ranked by (matrix impact if re-fetched) × (diagnostic value). "Re-verify"
means one probe per endpoint (§6 checklist), not a bulk re-fetch; a
successful probe is the green light for the fetcher run, which is a
separate coordinator decision.

| Rank | Endpoint | Why first | Cache it unlocks |
|---|---|---|---|
| 1 | `playergamelogs` (regular season, one finished season, e.g. 2024-25) | The only missing cache that blocks the full-context chain (form/roster/career/competition/availability/system). Also the highest-volume endpoint (one row per player-game), so it is the best test of whether the clean machine can sustain a real fetch, not just a single small response | `pipeline/data/gamelogs_*.jsonl` (2015-16…2025-26, 11 seasons) |
| 2 | `leaguedashplayerstats` Base (one season) | The pipeline's most-called endpoint (rows 1–3, 12 share it) and the exact endpoint probed from Hatch in §3.2 — a clean-machine 200 here is the direct A/B against the Hatch stall | `dashbase_*` refresh / 2026-27 roll |
| 3 | `leaguedashplayerbiostats` (one season) | Small, single-param-set call via `fetch_stats_json` (the curl_cffi path); distinguishes "the `nba_api` path is blocked" from "the `fetch_stats_json` path is blocked" if rank 2 (nba_api path) and rank 3 disagree | `bio_*` refresh |
| 4 | `leaguegamelog` PlayerOrTeam=P, SeasonType=Playoffs (one season) | Already cached and complete — a pure connectivity control: if this fails on the clean machine too, the problem is not Hatch-specific and the machine is not actually clean | None new (control only) |
| 5 | `leaguedashptstats` PullUpShot (one season, 2015-16+) | The wide-skills chain's tracking leg; small result set, exercises the full-filter-param path that 500s on minimal params | `wide_skills_*` refresh |
| 6 | `leaguehustlestatsplayer` (one season) | The endpoint the code most explicitly ties to residential-IP blocking ("PlayerTracking requires non-datacenter IP"); a 403 here with 200s elsewhere localises the block to the tracking/hustle family | `wide_skills_*` / `advanced_tracking_*` |
| 7 | `synergyplaytypes` Postup (one season) | Completes the wide-skills quartet; historically the session-poisoning endpoint (see §4), so it tests session hygiene on the clean machine | `wide_skills_*` refresh |
| 8 | `drafthistory` (single call, no season) | One call refreshes the whole history (incl. any 2026 draft); lowest effort, but lowest urgency — cache is complete through 2025 | `draft_history.json` refresh |
| 9 | `draftcombinestats` (one year, e.g. 2024) | Fills the only other absent cache, but with zero matrix impact — rank last deliberately, so it is never mistaken for a blocker | `combine_measurements.json` (new) |
| 10 (lane-2 cross-ref, NOT this lane's to verify) | `shotchartdetail` (one player, one season) | Listed last and fenced: lane 2 owns it, and its source module is gated on both the stall and a ToS review. A clean-machine probe here must not be run as part of this lane's verification without lane 2 + the ToS gate clearing first | Historical shot-location cache (none exists) |

Deliberately NOT on the list: `leaguedashteamstats` (already complete,
low diagnostic value beyond rank 4's control), any 2026-27 season (the
pipeline pins `LAST_SEASON = "2025-26"`; a 2026-27 fetch before the
coordinator rolls the season constant would desynchronise the matrix —
see `seasons.py` rolling instructions), and any endpoint in the
"does NOT use" table except the fenced `shotchartdetail` cross-ref.

## 6. Clean-machine probe checklist — what one probe must record

Copy this checklist per endpoint probed. One request per endpoint;
if it stalls, record and stop — do not retry the stalled endpoint more
than once (the brief's bound), and never convert a probe into a bulk
fetch.

- [ ] **Machine + network identity:** hostname, OS, residential vs.
      datacenter egress (ISP/ASN if known), public IP class only (do
      not paste a full public IP into a shared report unless the
      coordinator asks), direct egress vs. proxy (and proxy software
      if any — Hatch's probe went through an egress proxy; record
      whether the clean machine does too).
- [ ] **Client stack:** `curl_cffi` installed? (version + impersonation
      profile, expected `chrome120`); `nba_api` installed? (version);
      plain-curl vs. curl_cffi vs. `nba_api` path used for this probe.
      (Hatch today: neither installed — the clean machine must have at
      least one, or the probe is testing nothing the pipeline can use.)
- [ ] **Session handling:** fresh session warmed with `GET
      https://www.nba.com/stats/` first (per `nba_http.py`), cookies
      captured? Warm-up status code and time recorded separately from
      the API call.
- [ ] **Exact request:** full endpoint name, full parameter set
      (copy from the caller in §1 — minimal params 500, so a probe
      with invented params proves nothing), headers sent
      (`x-nba-stats-origin: stats`, `x-nba-stats-token: true`,
      `Referer`, `Origin`, user-agent string).
- [ ] **Timing breakdown (curl `-w` or equivalent):** time to TCP
      connect, time to TLS complete, time to first byte, total time,
      client timeout used. Hatch baseline for comparison: root
      200 in 4.26 s (TLS 3.74 s); API 000 in 15.00 s (TCP 0.002 s,
      TLS 0.76 s, first byte never).
- [ ] **Result, exactly one of:** HTTP status + bytes + first-200-chars
      of body (or "0 bytes, timeout/reset at Xs" with the curl exit
      code); for a 200, the `resultSets`/`resultSet` name(s) present
      and row count (proves it is data, not an Akamai challenge page —
      a 200 with a non-JSON body is a failure, per `nba_http.py`'s
      transient classification).
- [ ] **TLS evidence:** presented certificate issuer/subject (Akamai
      vs. proxy-issued — distinguishes §3.3 hypotheses A from B);
      whether the TLS fingerprint path was curl_cffi-impersonated or
      plain.
- [ ] **Classification:** blocked (403, twice on fresh warmed sessions
      → stop, per `nba_http.py:BLOCKED_ATTEMPTS`) / transient (429,
      5xx, timeout, reset → note, do not hammer) / client (other 4xx,
      500-on-minimal-params → fix the request, not the machine) /
      success (200 JSON with expected result set).
- [ ] **Do NOT record / do NOT do:** bulk season loops, IP rotation,
      fingerprint spoofing beyond the code's own curl_cffi path,
      retries of a stalled endpoint beyond the single allowed retry,
      or any write into a live checkout. A successful probe authorises
      a *separate* fetcher decision; it is not itself a fetch.

## Sources consulted (read-only)

- `pipeline/build_vectors.py` (fetch_dash, fetch_bio, fetch_tracking,
  SOURCE_CONTRACTS, column lists), `pipeline/nba_http.py` (full),
  `pipeline/fetch_advanced_tracking.py`, `pipeline/fetch_wide_skills.py`,
  `pipeline/fetch_team_season.py`, `pipeline/fetch_playoffs.py`,
  `pipeline/fetch_playoff_gamelogs.py`, `pipeline/fetch_draft_history.py`,
  `pipeline/fetch_combine.py`, `pipeline/fetch_gamelogs.py`,
  `pipeline/fetch_missing_tracking.py` (no-network checker),
  `pipeline/seasons.py` (season floors, LAST_SEASON pin),
  `pipeline/shotcharts/sources/stats_nba.py` (2026-10-21 recon + gate),
  `~/workspace/your_files/shots/shot-source-verdict.md` (standing
  2026-10-11 verdict, as cited in the brief — not re-read as a primary
  source for endpoint facts; the code and caches above are).
- Cache measurement: `git ls-files pipeline/cache` = 788 tracked files
  (re-counted this lane); per-group counts and `complete` flags in §2
  from reading the cache files on disk, not from prior prose.

## Verdicts

VERDICT: PASS — endpoint inventory complete — ~/workspace/mlops-v2-drafts/data-deep-dive/stats-nba-endpoints.md
VERDICT: PASS — cache coverage verified per endpoint era — ~/workspace/mlops-v2-drafts/data-deep-dive/stats-nba-endpoints.md
VERDICT: BLOCKED — Hatch re-fetch of any stats.nba.com endpoint (post-TLS tarpit, HTTP 000, 0 bytes) — ~/workspace/mlops-v2-drafts/data-deep-dive/stats-nba-endpoints.md
VERDICT: BLOCKED — regular-season gamelog re-fetch (playergamelogs cache absent, blocks 73→143-column chain) — ~/workspace/mlops-v2-drafts/data-deep-dive/stats-nba-endpoints.md
VERDICT: FAIL — numeric stats.nba.com rate limit (none documented or measured; client-side sleeps only, all marked UNVERIFIED) — ~/workspace/mlops-v2-drafts/data-deep-dive/stats-nba-endpoints.md

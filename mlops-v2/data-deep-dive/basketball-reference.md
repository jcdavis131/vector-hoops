# Basketball-Reference — Deep-Dive Investigator Report

**Lane:** Vector Hoops MTNN data-collection deep dive · **Date:** 2026-10-26 (evening, America/Chicago)
**Scope:** read-only investigation + 4 tiny single-request probes (robots.txt, one 2023-24 shooting
season page, one 2026-10-20 shot-chart page, one 2023-24 play-by-play season page). All four
returned HTTP 200; no block, no 429 encountered; probes spaced ≥3 s apart, browser UA, single-threaded.
**Checkout examined:** `~/workspace/vector-hoops-mlops-v2` (master `1e5bfecc`), `pipeline/` + `pipeline/cache/`.
**Read first:** `lanes/01-data-collection/SOURCES.md` §3 and `lanes/07-pipeline-overhaul/SHOT_POSITION.md` §2.4.

## 0. Headline findings

1. **The published Sports Reference data-use page reads directly onto MTNN training.** It
   prohibits copying or using site content "for purposes of training, fine-tuning, prompting, or
   instructing artificial intelligence models" including "supporting machine learning methods used
   to predict, classify, label, or score inputs into the models" without permission (quoted in §3).
   BBRef data already feeds the train matrix (advanced cross-check, per-game minutes, positions,
   honors, salaries). Robots.txt compliance is NOT a license, and this clause is the single largest
   open item for any BBRef-fed tower. This report is not legal advice; the clause needs a
   coordinator/legal decision before any new BBRef-fed training tower is wired.
2. **The in-repo advanced-table fetcher's online path is dead.** `pipeline/fetch_bbref_advanced.py`
   `parse_season_html` raises `FetchError` by design — the 30 committed caches came from an archived
   operator script not in the repo. The working parser lives in `bench/fetch_bbref.py`. Any re-fetch
   must use that parser or a new one; running the pipeline fetcher online parses nothing.
3. **Two whole BBRef tables with real signal are not cached at all:** season shooting
   (distance-band FG shares/percentages, corner-3, dunk share, average shot distance — verified live
   for 2023-24) and season play-by-play (position-share estimates pct_1…pct_5, on/off plus-minus,
   foul/turnover detail — verified live for 2023-24). Neither duplicates stats.nba.com.
4. **Shot charts are the only per-game location source with a working prototype** (545 records, one
   date, 2026-10-20; geometry validated to median 0.25 ft error), and the format I probed live
   matches the parser exactly — but archive depth is UNVERIFIED beyond that one date.

## 1. Table inventory

URL convention for season tables: `https://www.basketball-reference.com/leagues/NBA_<ENDYEAR>_<table>.html`
(end year = season's second year; e.g. season 2023-24 → `NBA_2024_*`). Awards pages are keyed the same
way: `/awards/awards_<ENDYEAR>.html`. Team pages: `/teams/<TM>/<ENDYEAR>.html`. Player pages:
`/players/<first-letter>/<bbr_id>.html` (e.g. `tatumja01`). Shot charts:
`/boxscores/shot-chart/<YYYYMMDD0HOME>.html`. Slate discovery:
`/boxscores/?month=M&day=D&year=Y` → shot-chart links give game ids.

| Table | URL pattern | What it contains | vs stats.nba.com | Per-season availability | In cache? |
|---|---|---|---|---|---|
| Per-game | `/leagues/NBA_<Y>_per_game.html`, table `per_game_stats` (+ `_post` playoffs, ignored by fetchers) | Per-game box stats: PTS/TRB/AST/MP per game, FG%/3P%/FT%, etc. | Duplicates NBA base stats in per-game form; NBA has no per-game table, only totals + per-100 | 1996-97…2025-26 (30 seasons) | YES — but only 5 keys kept: `pts_per_g, trb_per_g, ast_per_g, games, mp_per_g` (428–605 rows/season). The page holds far more than the cache keeps. |
| Advanced | `/leagues/NBA_<Y>_advanced.html`, table `advanced` (+ `_post` ignored) | PER, WS, WS/48, BPM, OBPM, DBPM, VORP, USG%, plus MP, G | Partial overlap: NBA Advanced has different formulations; **PER, BPM/VORP, WS are BBRef formulations, not NBA-official** — cross-check value, not duplication | 1996-97…2025-26 (30 seasons) | YES — 10 keys (`per, ws, ws_per_48, bpm, obpm, dbpm, vorp, usg_pct, games, mp`), 429–606 rows/season (checked 2026-10-09 in fetcher docstring; re-verified same range 2026-10-26). |
| Shooting | `/leagues/NBA_<Y>_shooting.html`, table `shooting` | Distance-band shares and FG%: `pct_fga_00_03, pct_fga_03_10, pct_fga_10_16, pct_fga_16_xx, pct_fga_fg3a`, `fg_pct_00_03 … fg_pct_16_xx`, `pct_fg3a_corner3, fg_pct_corner3`, `pct_fga_dunk, fg_dunk`, `avg_dist`, assisted shares `pct_ast_fg2/fg3`, heaves | **No NBA equivalent at season grain:** NBA Scoring gives shot-*type* shares (paint/FB/off-TOV/mid-range points shares) but not distance-band FG% or corner-3/dunk splits | Verified live for 2023-24 only (probe, §5). Pre-2023-24 availability UNVERIFIED — see confirming check in §4 | NO — no `bbref_shooting_*` cache exists. |
| Play-by-play | `/leagues/NBA_<Y>_play-by-play.html`, table `pbp_stats` (+ `pbp_stats_post`) | Position estimates `pct_1…pct_5` (% of minutes at PG/SG/SF/PF/C), on/off plus-minus (`plus_minus_on, plus_minus_net`), fouls drawn/committed, And-1s, turnover types (`tov_bad_pass, tov_lost_ball`), own shots blocked | **No NBA equivalent:** NBA tracking gives role-ish signals (drives, touches) but not minute-share-by-position or on/off at this grain | Verified live for 2023-24 only. Earlier-season availability UNVERIFIED | NO — no `bbref_pbp_*` cache exists. |
| Totals (positions source) | `/leagues/NBA_<Y>_totals.html` | Full season totals + `pos` column (e.g. `PF`, `SG-SF`) | NBA bio has no position; this is the only position source in the pipeline | 1996-97…2025-26 (30 seasons, via positions cache) | PARTIAL — only `pos` extracted: `positions_bbref.json`, 30 seasons, 14,605 name-seasons. All other totals columns discarded. |
| Awards / honors | `/awards/awards_<Y>.html` (+ fallback `/allstar/NBA_<Y>.html`) | All-NBA vote-getters (not just the 15 selections) with vote points and tiers, All-Defensive, MVP/DPOY/ROY/MIP/6MOY/Clutch vote tables, All-Star rosters | **No NBA equivalent:** stats.nba.com serves no awards data at all | 1997…2026 award years = seasons 1996-97…2025-26 | YES — `honors_award_1997…2026.json` (30 files, year-keyed, each `complete: true`). Extended honors (MVP/DPOY/etc. vote tables) are a fetcher (`fetch_honors_extended.py` → `assets/data/honors_extended.json`), not a per-season cache. |
| Contracts / salaries | `/teams/<TM>/<Y>.html`, `salaries2` table embedded inside an HTML comment, raw figure in `csk="…"` attribute; current contracts via BBRef contracts pages | Per-team per-season salary lists; current file also carries future guaranteed seasons | **No NBA equivalent:** stats.nba.com serves no salary data | Team-season files cover end years 2019–2025 (= seasons 2018-19…2024-25). `salaries_history.csv` covers 1990-91…2017-18, then jumps to 2025-26 per the fetcher docstring | YES — `bbref_salaries/` holds 210 files (7 end-years × 30 teams; verified count 2026-10-26; sample `2024/BOS.json` = 16 rows incl. named salaries). `salary_bbref_current.json` = 1,230 `name|season` keys including future guarantees (e.g. 2026-27, 2027-28). Whether the 210 files have been merged into `salaries_merged.json` is UNVERIFIED — coordinator check. |
| Shot charts (per game) | `/boxscores/shot-chart/<game_id>.html`; two `<div id="shots-XXX" class="shot-area">` (one per team); each shot a div `style="top:Npx;left:Mpx" tip="<ord> quarter|OT, <clock> remaining<br><name> made|missed <2|3>-pointer from <N> ft<br>…" class="tooltip q-<period> p-<bbr_player_id> make|miss"` | Per-shot: pixel position, made/missed, 2PT/3PT, period, clock, BBR-reported distance in feet, BBR player id, display name | **No NBA equivalent reachable from this VM:** ShotChartDetail is bot-dropped at the handshake (SHOT_POSITION §2.1); CDN PBP covers only 5 games | One date only: 2026-10-20 (3 games, 62 players, 545 records). Archive depth UNVERIFIED | PARTIAL — one snapshot: `pipeline/shotcharts/snapshots/bbr/shotcharts-20261020.jsonl`. No historical cache. |
| Player gamelog / splits / on-off / lineups / player shooting pages | `/players/<id>/gamelog/<Y>/`, `/splits/`, `/on-off/`, `/lineups/`, `/players/<id>/shooting/<Y>/` | Game-by-game lines, splits, on/off, lineup combos, player shooting | Overlaps the missing gamelog gap, but see robots.txt: these paths are disallowed (see §3) | Not probed (robots-disallowed; not fetched) | NO. |

Notes on the season-table pages: the shooting probe page (2023-24, 2,278,132 bytes) carried 75 HTML-comment
blocks — parsers must expect comment-wrapped tables (the salaries `salaries2` table is explicitly
comment-embedded). Regular-season tables only are parsed today; every `*_post` playoff table on the
same page is ignored by the fetchers, so playoff shooting/PBP/advanced would be a separate fetch.

## 2. Access method + backfill estimate

### How the in-repo fetchers do it

- **Transport:** stdlib `urllib` with a browser User-Agent (three variants across fetchers, e.g.
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) Scout/1.0 (research; MLOps)`; shot-chart module uses a
  Chrome/126 UA). `fetch_honors.py` prefers `curl_cffi` impersonating `chrome120` when installed, else
  `urllib`. No auth, $0.
- **Rate discipline (measured in code, consistent across all five fetchers):** `DELAY_S = 3.5` s
  (shot-chart module `RATE_S = 3.1` s), single-threaded, one request per season/page in a loop.
  This sits just inside BBRef's published 20 req/min policy (3.5 s ≈ 17/min) and matches the
  robots.txt `Crawl-delay: 3` found live (see §3).
- **Failure handling (`pipeline/nba_http.py::retry_call`):** 403 → `BlockedError` after two tries;
  404 not retried; 429/5xx back off. A page that parses to no/short rows is a failure, not a cache
  write (`EmptyPayloadError`; floors: advanced ≥300 rows, positions >50, bench fetcher ≥50).
  `ingest.run_fetch` exits 2 on any failure — CI's `--offline` mode gates on cache presence instead.
- **Parse-and-discard:** raw HTML is never stored; only compact JSON caches are written, atomically,
  resumably (seasons already cached above the floor are skipped; honors uses a freshness TTL).
- **Traded players:** BBRef lists the combined TOT (older) / 2TM / 3TM row first; first occurrence per
  player wins, so season aggregates are used (`bench/fetch_bbref.py`, `fetch_positions.py`).
- **What breaks if markup changes:** parsers are keyed on exact surface details — table ids
  (`advanced`, `per_game_stats`, `pbp_stats`, `shooting`), `data-stat="…"` cell attributes, the
  positions regex (`name_display` → `age` → `team_name_abbr` → `pos` cell order), the shot-dot
  `tooltip q-<n> p-<id> make|miss` class pattern, `top:Npx;left:Mpx` style format, and the tip-text
  sentence format (`made|missed <2|3>-pointer from <N> ft`). A renamed table id, a reordered column,
  or a changed tip format silently yields short parses — which is why the row-count floors and
  exit-2 gates exist. The shot-chart module adds one stronger pattern (see below).
- **Fail-loud model (the geometry re-check, from `pipeline/shotcharts/sources/bbr.py`):**
  pixel→feet conversion uses an empirically fit hoop origin (`HOOP_X_PX 239.87, HOOP_Y_PX 30.68,
  PX_PER_FT 9.962`, fit over 111 shots; theory from the court SVG predicts 10.0 px/ft, 0.4% off).
  On one game (202610200DET, n = 171): median |computed radial − BBR-reported distance| = 0.25 ft,
  p90 = 0.41 ft. `Validate()` re-checks this geometry **every run** and FAILS loudly if median
  error exceeds 1.5 ft — "markup change, not bad data." This is the template any new BBRef fetcher
  should copy: a per-run invariant check with a hard threshold, not a silent parse.
- **Known live-access caveat:** `fetch_contracts.py` notes Cloudflare 403s on live BBRef/Spotrac
  scrapes, falling back to a static payroll file. A 403/429 during any backfill is a STOP condition
  under this investigation's bounds, not a retry-and-evade signal.

### Critical defect: the pipeline advanced fetcher cannot fetch

`pipeline/fetch_bbref_advanced.py::parse_season_html` raises `FetchError` unconditionally:

> "fetch_bbref_advanced has no advanced-table parser (the committed caches came from the archived
> operator_fetch_advanced.py); nothing parsed, nothing written"

An online run fetches 30 pages, parses nothing, and (by design) fails loudly rather than writing
empty caches. **The working parser is `bench/fetch_bbref.py`**: it parses the regular-season
`advanced` and `per_game_stats` tables, keeps the 10 advanced + 5 per-game keys, takes the first
occurrence per player (TOT row), and DROPS names that normalize to the same key within a season
(ambiguous join — see §5). Any re-fetch or extension (shooting, PBP) must reuse that parser's
conventions or write a new parser under the same fail-loud rules. Do not present the pipeline
fetcher as a working online path.

### Backfill time estimates (LABELED ESTIMATES, not measurements)

All at 3.5 s/request (3.1 s for shot charts), single-threaded, zero failures/retries:

| Backfill | Requests | Estimate |
|---|---|---|
| Season tables, 5 types (advanced, per-game, shooting, play-by-play, totals) × 30 seasons | ~150 | ~9 min |
| Awards pages × 30 years | 30 | ~2 min (already cached; refresh only) |
| Salaries, full 30 seasons × 30 teams (vs 210 files cached for 7 seasons) | ~900 | ~53 min |
| Shot charts: ~1,230 games/season × 30 seasons | ~36,900 chart pages | ~32 h |
| Shot charts: slate discovery, ~170 dates/season × 30 seasons | ~5,100 slate pages | ~4.4 h |
| **Shot-chart full backfill total** | **~42,000** | **~36 h wall-clock → a multi-day scheduled job, not an afternoon fetch** |

The shot-chart estimate assumes every regular-season game has a chart page (UNVERIFIED for older
seasons — that is exactly what the §4 confirming check tests) and ignores retries, blocks, and the
per-run geometry QA. Lockout/shortened seasons (1998-99, 2011-12, 2019-20) would reduce game counts
somewhat; the order of magnitude stands.

## 3. Robots/ToS posture — verified quotes, and what is UNVERIFIED

### robots.txt — VERIFIED live 2026-10-26 (curl, HTTP 200, 766 bytes)

Full `User-agent: *` section as fetched:

```
User-agent: *
Disallow: /basketball/
Disallow: /blazers/
Disallow: /dump/
Disallow: /fc/
Disallow: /my/
Disallow: /7103
Disallow: /play-index/*.cgi?*
Disallow: /play-index/plus/*.cgi?*
Disallow: */gamelog/
Disallow: */splits/
Disallow: */on-off/
Disallow: */lineups/
Disallow: */shooting/

Disallow: /req/
Disallow: /short/
Disallow: /nocdn/

Crawl-delay: 3
```

Plus: `AhrefsBot: Disallow: /` and `GPTBot: Disallow: /` (entire site), `Twitterbot` allowed,
and a block list of named joke/plagiarism bots.

What this means, precisely:

- **`/boxscores/` is NOT disallowed** — the shot-chart fetch path (slate + chart pages) is
  robots-permitted. This confirms the in-repo module's claim, and nothing more.
- **`/leagues/`, `/awards/`, `/teams/` are NOT disallowed** — season tables, awards, and team
  salary pages are robots-permitted.
- **`*/shooting/` disallows PLAYER shooting pages** (`/players/<id>/shooting/<Y>/`) but, as a
  pattern, it requires the literal substring `/shooting/` with slashes — it does NOT match the
  season page `/leagues/NBA_2024_shooting.html` (`_shooting.html`, no slashes). Same logic:
  `*/gamelog/` blocks player gamelog pages, not boxscores.
- **`Crawl-delay: 3`** corroborates the in-repo 3.1–3.5 s discipline.
- **Robots.txt compliance is NOT a license.** It says nothing about training use, redistribution,
  or republication. Any claim that robots-permitted fetching authorizes MTNN training is false on
  its face given the data-use page below.

### Sports Reference data-use page — VERIFIED via public page read 2026-10-26

Source: `sports-reference.com/data_use.html` ("SR and Data Use", site last updated per the page
Wednesday, October 21). The page states it excerpts Site Terms of Use clause 5 and that the reader
"is responsible for understanding the entirety of the Site Terms." Verbatim excerpts:

> "…without our express written permission, use any automated means to access or use the Site,
> including scripts, bots, scrapers, data miners, or similar software, in a manner that adversely
> impacts site performance or access; or"

> "…use any material or Content from the Site, including without limitation any statistics or
> data, (i) to create any database, archive, or other data store that competes with or constitutes
> a material substitute for the services or data stores offered on the Site or by the Site's Data
> Providers or (ii) to provide any service that competes with or constitutes a material substitute
> for the services or data stores offered on the Site or by the Site's Data Providers; or"

> "…copy or use any material or Content from the Site, including without limitation any statistics,
> data, text, graphics, or images, for purposes of training, fine-tuning, prompting, or instructing
> artificial intelligence models or technologies in any manner, including without limitation for
> purposes of (i) generating answers, text, scores, statistics, notes, graphics, images, or any
> other output; or (ii) supporting machine learning methods used to predict, classify, label, or
> score inputs into the models; or"

> "This means that you should not create websites or tools based on data you scrape from Sports
> Reference or any of our sites or use our data to train generative artificial intelligence models
> without our permission."

Counterweight, also verbatim from the same page:

> "As an aside, copyright law is clear that facts cannot be copyrighted, so you are free to reuse
> facts found on this site in accordance with copyright laws."

And on bulk acquisition:

> "We will not fulfill any requests for data for custom downloads, unless you are prepared to pay
> a minimum of $5,000 for any such request."

> "Please do not attempt to aggressively spider data from our web sites, as spidering violates the
> terms and conditions that govern your use of our web sites… If we notice excessive activity from
> a particular IP address we will be forced to take appropriate measures, which will include, but
> not be limited to, blocking that IP address."

The page also points to a bot-traffic page ("Please see bot traffic page for information on how we
limit and may at times block bot traffic") and to paid sources (Sports Info Solutions, Sports
Direct/Gracenote, Spotrac for contracts).

**UNVERIFIED (not read during this investigation):** the full Site Terms of Use text (only the
data-use page's clause-5 excerpt was read); the bot-traffic page's specific expectations; whether
any permission, license, or paid arrangement covers this project's BBRef use; and the NBA's own
terms for stats.nba.com (out of this lane's scope — see the stats.nba.com lane). **Nothing in this
report upgrades robots.txt compliance, polite rate discipline, or "facts aren't copyrightable"
into permission to train on BBRef content.** The training-use clause, read plainly, covers exactly
what MTNN does (a model that predicts/scores inputs). This needs a decision above this lane before
any new BBRef-fed tower is built; existing BBRef-fed matrix columns (advanced cross-check, per-game
minutes, positions, honors, salaries) inherit the same question.

## 4. Gap-fill matrix — what BBRef fills that stats.nba.com cannot

| Gap | BBRef fill | Status / confirming check |
|---|---|---|
| Per-game shot locations (coordinates/zones) | Shot-chart pages, one per game, parsed to feet + zone (Restricted Area / In The Paint (Non-RA) / Mid-Range / Corner 3 / Above the Break 3) + made/missed + 2PT/3PT | Prototype only (2026-10-20, 545 records, 3 games, 62 players, manifest QA PASS). **Confirming check (NOT yet run — this investigation's cap was one page per table type): fetch one shot-chart page per season sample — 1996-97, 2005-06, 2013-14, 2020-21, 2024-25 — and record per season: page exists (200 vs 404), shot dots parse under the `tooltip q- p- make|miss` pattern, per-game record count, and geometry QA median error vs the 1.5 ft gate.** Live-format evidence from this investigation: the 202610200DET probe returned 174 tooltip shot dots in the exact parser format (sample: `class="tooltip q-1 p-tatumja01 make"`, `style="top:35px;left:203px;"`, tip "Jayson Tatum made 2-pointer from 4 ft"). That proves the CURRENT format, not archive depth. |
| Shot distance bands (season grain) | Shooting table: FG shares and FG% by 0–3 / 3–10 / 10–16 / 16–3pt / 3pt, corner-3 share/%, dunk share/%, `avg_dist`, assisted shares | Verified live for 2023-24 (probe: table `shooting` present, all listed `data-stat` keys present). NOT cached. Same per-era confirming check as above (one page per era) before claiming full 30-season coverage. |
| Position shares (season grain) | Play-by-play table: `pct_1…pct_5` minute shares by position, on/off plus-minus, foul/turnover detail | Verified live for 2023-24 (probe: table `pbp_stats` present). NOT cached. Per-era check required as above. |
| Real minutes pre-2015 | Per-game `mp_per_g × games` (BBRef combined TOT row for traded players) | Cached, and load-bearing: stats.nba.com Base MIN is per-100-possessions, so the 450-minute eligibility gate never binds without BBRef (per `build_vectors.py` docstring). Post-2015 the pipeline prefers gamelogs (currently absent — see SOURCES.md §6). |
| Advanced-metric cross-check | PER / BPM / VORP / WS / USG% (BBRef formulations) | Cached (30 seasons). Complements rather than duplicates NBA Advanced. |
| Positions | Totals `pos` column (multi-position strings like `SG-SF`) | Cached: 14,605 name-seasons. NBA bio has no position field. |
| Honors / awards semantics | Vote-getter-level data, not just winners: All-NBA vote points + tiers, All-Star rosters, plus MVP/DPOY/ROY/MIP/6MOY/Clutch vote tables in the extended fetcher | Cached (30 award years). **Semantics that matter:** (a) lagged — prior-season honors are applied to season S+1 rows, leak-free for MTNN (`build_honors.py`); same-season recognition is emitted separately for game-puzzle weighting only; (b) vote-getter coverage makes "0 votes / no selection" a MEASURED zero, not a missing value — except 1996-97 rows (caches start at 1996-97 awards), 1999-00 ASG (no game held in 1999; the 1999 cache correctly lists 0 All-Stars), and left-censored careers (ASG counts before 1996-97 unseen); (c) the old 0.087-vs-0.969 observed-fraction gap was a builder bug (rows emitted only when honored), now zero-filled per the builder docstring — the honors-semantics decision SOURCES.md §6 flags as open is a contract/pinning question, not a data-availability question. Note: the fetcher docstring warns 2025/2026 ASG parses came back short (15) after the game format change; the current caches show no `asg_partial` flags — re-verify on any refresh. |
| Salaries / contracts | Team-season salary lists + current contracts with future guarantees | Cached (210 team-season files + 1,230 current-contract keys). NBA has no salary data. The `salaries_history.csv` gap (2018-19…2024-25) the fetcher docstring describes appears closed at the file level by the 210 `bbref_salaries/` files; the merge into `salaries_merged.json` is the unverified step. |
| Per-game full box (extension, not new table) | Per-game page holds FG%/3P%/FT%/STL/BLK/TOV/PF per game; cache keeps only 5 keys | Extension of an existing fetch, not a new source. Same for totals (only `pos` kept). |
| What BBRef CANNOT fill | Tracking (speed/distance, drives, touches, catch-and-shoot, pull-ups), hustle (deflections, loose balls, charges, box-outs), combine measurements, draft history, play-by-play text, per-frame trajectories | These stay with stats.nba.com / CDN PBP / other lanes. BBRef is a season-table + shot-chart source, not a tracking source. |

## 5. Join-key plan — BBR ID → NBA PLAYER_ID → person_id

### The chain as it must be built (it does not exist as a table today)

1. **BBR side:** chart/table records carry a BBR player id (`tatumja01`) + display name + team
   (+ season for tables, game date for charts). The BBR id is stable per player but is NOT an NBA id.
2. **Bridge:** the stats.nba.com caches already in-repo (`dashbase_*.json`, 30 seasons) carry
   `PLAYER_ID` + `PLAYER_NAME` for every charted player-season. The bridge is therefore
   **name + season** (plus team where available), resolved through the normalized-name functions —
   NOT a BBR-id lookup, because no committed artifact maps BBR ids to NBA ids.
3. **NBA side:** `PLAYER_ID` → the train matrix's `player_id`/`season` key (the matrix and
   `vectors.json` are joined by `(player_id, season)` per `export_mtnn_viz.py`'s enforcement).
4. **Person side:** `person_id` is stamped by `pipeline/apply_player_identity.py` from
   `assets/player-identity.json` onto `vectors.json` rows. The registry holds 22 `persons` with
   `person_id`, display/dataset names, birth year, and seasons — but **no BBR-id and no NBA-id
   fields**. Person resolution therefore also goes through name+season, and the registry's job is
   disambiguation, not lookup.
5. **Required new artifact:** a committed `bbr_to_nba` map (BBR id + season → PLAYER_ID +
   person_id, with a masked/unresolved list) built once from (2)+(4) and QA-gated like the identity
   registry. Until it exists, every BBRef join is a name join with masking — see failure modes.

### Failure modes and masking rules (all evidenced in-repo, not proposed)

- **Suffix stripping merges distinct careers.** `norm_name` strips Jr/Sr/II/III/IV by default.
  The registry's lesson records 12 distinct careers merged this way: Tim Hardaway Sr./Jr.,
  Gary Payton / Gary Payton II, Gary Trent / Gary Trent Jr., Jaren Jackson / Jaren Jackson Jr.,
  Jabari Smith / Jabari Smith Jr., Glenn Robinson / Glenn Robinson III, Ron Harper / Ron Harper Jr.,
  two Reggie Williamses, two Dee Browns, two Mike Jameses, two Chris Johnsons. **Rule:** never join
  on a suffix-stripped name alone; use `keep_suffix` variants and the registry's `persons` splits,
  and let `qa_player_identity.py` hard-fail on any unregistered suffix-stripped collision.
- **Same-season shared names → mask, never guess.** `name_utils.shared_name_keys` computes, per
  season, the name keys that two or more PLAYER_IDs share in that season's dashbase cache
  (documented cases: Marcus Williams 2007-08, pids 200766 with 53 GP and 201173 with 11 GP;
  Chris Johnson 2012-13; Tony Mitchell 2013-14). **Rule: a name-keyed join SKIPS (masks) the
  charted row on such a key rather than handing it the other man's value.** The bench fetcher
  applies the same rule at ingest: names normalizing to the same key within one season are DROPPED
  from that season's cache and counted, never guessed. The salaries cache carries a scar of the old
  behavior: `'marcus williams|2007-08'` ($12,890, SAS) is pid 201173's salary and once sat on the
  NJN guard's row. `assets/pid_ambiguous.json` currently lists 11 ambiguous names.
- **Shot-chart joins mask BOTH players on ambiguity** (SHOT_POSITION §2.4): a BBR-only tower that
  joins on display name is a bug. For charts, resolve on (display name, season, team abbr) and mask
  the game-player row if the name is shared that season or matches no charted row that season.
- **Traded players:** season tables use the first (TOT/2TM/3TM combined) row — season aggregates.
  Shot charts are per-game with a team abbr per game, so season aggregation must sum across teams
  and must not double-count a traded player's games. Per-game-table joins for minutes already use
  the combined row (`mp_per_g × games`).
- **Name-alias drift:** `BBREF_ALIASES` maps 14 charted names to their BBRef-printed keys
  (nicknames: `flipmurray`→`ronaldmurray`, `poohjeter`→`eugenejeter`, `haha`→`haseungjin`; plus three
  shortened by one letter because the fetchers dropped a character NFKD cannot decompose: Ömer
  Aşık's dotless i, Tibor Pleiß's sharp s, Egor Dёmin's Cyrillic yo). Any new BBRef fetcher must
  route through `bbref_lookup_key`, not raw `bbref_key`.
- **Encoding:** BBRef pages are UTF-8; an earlier fetcher decoded with `requests`' latin-1 default
  and then lowercased keys, producing unrecoverable mojibake (`Jokić` → `jokiä\x87`) that required
  a dedicated inverse (`repair_latin1_mojibake`). New fetchers must decode UTF-8 explicitly
  (`r.encoding` / `decode('utf-8')`) — the current fetchers do.
- **Unmatched honorees / unmatched names:** a BBRef name that matches no charted name that season
  yields a masked row (mask 0), recorded in the builder's `unmatched_honorees` list — never a
  fuzzy-match assignment. The same rule applies to salary and position joins.
- **QA gates that must run on any new join:** `qa_player_identity.py` hard-fails on missing
  `person_id`, unregistered collisions, unexplained ≥4-year season gaps (allowlist:
  `comeback_allowlist`), duplicate `person_id|season` rows, and row count ≠ 12,966; the bench
  fetcher's ≥50-row floor and the shot-chart geometry gate (median ≤1.5 ft) apply at ingest.

### What is still missing for a BBR location tower

1. The BBR→NBA→person_id map artifact (does not exist; name+season bridge must be built and gated).
2. The per-era confirming checks in §4 (shot-chart archive depth; shooting/PBP pre-2023-24 coverage).
3. A parser for shooting + PBP season tables under the fail-loud rules of §2 (row floors, exit 2,
   comment-table handling) — the bench parser covers advanced/per-game only.
4. The §3 training-use decision: whether BBRef content may feed a training tower at all, and under
   what permission or framing. This gates items 1–3 for training use (a display-only use, e.g.
   shot-chart visualization, is a different question and still needs the same read of the terms).

## 6. Probe log (this investigation only)

| # | Request | Result |
|---|---|---|
| 1 | `GET basketball-reference.com/robots.txt` | 200, 766 bytes; quoted in §3 |
| 2 | `GET basketball-reference.com/leagues/NBA_2024_shooting.html` | 200, 2,278,132 bytes; table `shooting` present; distance-band/corner/dunk/`avg_dist` keys present |
| 3 | `GET basketball-reference.com/boxscores/shot-chart/202610200DET.html` | 200, 185,312 bytes; 2 shot-area divs, 174 tooltip shot dots in exact parser format |
| 4 | `GET basketball-reference.com/leagues/NBA_2024_play-by-play.html` | 200, 1,705,963 bytes; table `pbp_stats` (+ `pbp_stats_post`); `pct_1…pct_5`, on/off keys present |

No bulk fetching, no writes to any live checkout, no training, no prod writes. All other findings
are from reading in-repo code, caches, and docs on this VM, plus the public Sports Reference
data-use page.

## Verdicts

VERDICT: PASS — table inventory — evidence path: ~/workspace/mlops-v2-drafts/data-deep-dive/basketball-reference.md §1
VERDICT: PASS — access method + backfill estimate — evidence path: ~/workspace/mlops-v2-drafts/data-deep-dive/basketball-reference.md §2
VERDICT: BLOCKED — robots/ToS posture for training use — evidence path: ~/workspace/mlops-v2-drafts/data-deep-dive/basketball-reference.md §3
VERDICT: PASS — gap-fill matrix — evidence path: ~/workspace/mlops-v2-drafts/data-deep-dive/basketball-reference.md §4
VERDICT: PASS — join-key plan — evidence path: ~/workspace/mlops-v2-drafts/data-deep-dive/basketball-reference.md §5

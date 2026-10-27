# Open Alternatives — Vector Hoops MTNN data-collection deep dive

**Lane:** open-alternatives investigator · **Date:** 2026-10-26 · **Status:** READ-ONLY investigation.
No dataset was downloaded, no live checkout was written, no training was run.
One attempted text-fetch probe of an ESPN scoreboard URL was refused by the
fetch tool's own domain policy; that refusal is a tool limitation, NOT evidence
about ESPN, and it is not counted anywhere below as an ESPN failure. ESPN's
standing on this VM rests on the measured 2026-10-20 snapshots in
`lanes/07-pipeline-overhaul/SHOT_POSITION.md` §2.5, not on this investigation.

**Ground truths applied throughout:**
- Real-data-only is absolute: never synthetic, never proxy-filled, never
  random-projection expanded.
- Standing Hatch blocks: `stats.nba.com /stats/*` stalls (zero bytes / HTTP 000
  handshake tarpit), `cdn.nba.com` instant 403 (Akamai Bot Manager),
  `data.nba.net` dead.
- Working from Hatch: Basketball-Reference pages and the ESPN core API
  (one-date snapshots QA-passing, 2026-10-20).
- Gaps to fill: game logs (all seasons, 2015-16+ for context builders), shot
  coordinates (all seasons, later seasons prized), full play-by-play (events +
  text, all seasons), per-frame trajectories (currently NO public source
  inventoried — this investigation tests that negative).

**How to read the verdicts:** KEEP = adopt (or keep) subject to the stated
probe; PROBE = promising but unverified, run the exact probe before any
adoption; KILL = do not pursue for the stated gap (reason given). Verdict
lines in the required machine-readable form close the file.

---

## 1. Kaggle — specific datasets, not "Kaggle" in general

Kaggle is a hosting platform, not a source. Each dataset below was judged on
its own publisher, coverage, and license. Kaggle datasets require a Kaggle
account/API key for download; that is an access step, not a data-quality
signal. A Kaggle uploader's stated license licenses *their file*, not the
NBA's underlying rights — the NBA-ToS question travels with every
stats.nba.com-derived file below and is never discharged by a Kaggle label.

### 1a. brains14482 — "NBA WNBA play-by-play and shots data" (shufinskiy mirror)

- **What it contains:** Per the publisher's description, every in-game event
  (period starts, jump balls, fouls, turnovers, rebounds, field-goal attempts,
  free throws) plus detailed shot metadata (shot location, distance, result,
  assisting player). This is the Kaggle mirror of the shufinskiy/nba_data
  archive (see §7): `shotdetail` (coordinates) + `pbpstats` (possession PBP)
  grains in one download. Grain: per-event / per-shot. Seasons: titled
  1996–2021, updated through 2022/23 per the repo's own docs; the Kaggle page
  itself was updated 2025-06-26. The 2-season discrepancy between the Kaggle
  mirror and the GitHub repo (GitHub NBA through 2024-25) is unresolved from
  search alone — treat Kaggle as ≥2 seasons behind GitHub.
- **Provenance:** Collected "from multiple public sources (e.g., official
  league APIs and stats sites)"; the underlying harvest is shufinskiy's R
  pipeline from stats.nba.com / api.pbpstats.com (§7). Derived-from-NBA, but
  with a named upstream per datatype and public collection code — this is
  NOT anonymous derived-from-derived.
- **Freshness:** Kaggle page updated 2025-06-26; content lags GitHub by ~2
  seasons. Stale for 2024-25+ but current enough for the historical gap.
- **License / terms:** UNVERIFIED — no license statement found in the
  material retrieved for this dataset.
- **Verdict: PROBE (via §7, prefer GitHub over Kaggle).** The Kaggle copy
  adds nothing over the GitHub repo except convenience, and it lags it.
  Probe: compare the Kaggle file list against `list_data.txt` on GitHub for
  one season (e.g. 2022) — if identical keys/row counts, drop Kaggle and use
  GitHub only. Do not adopt Kaggle as the canonical copy.

### 1b. eoinamoore — "NBA Dataset: Box Scores and Stats (1947 – Today)"

- **What it contains:** The strongest Kaggle candidate for the **game-log**
  gap. Files: `PlayerStatistics.csv` (per-player box score for every game,
  i.e. game logs at player-game grain), `TeamStatistics.csv`,
  `PlayerStatisticsExtended.csv` (advanced game-by-game stats, "almost every
  game since 1996", 100+ columns), `TeamStatisticsExtended.csv`,
  `PlaybyPlay.parquet` ("detailed play-by-play for almost every game since
  1996"), `Games.csv`, `Players.csv`, plus 2024-25 / 2025-26 schedules.
  Shot coordinates: NOT stated for any file — this dataset does not claim
  LOC_X/LOC_Y. PBP text: claimed as "detailed play-by-play" but the text
  field set is not documented in the retrieved material.
- **Provenance:** Publisher eoinamoore; upstream stated as NBA data
  (stats.nba.com lineage implied by "advanced statistics records start on
  nba.com"). No collection code found in retrieved material — provenance is
  weaker than §7 (claim, not code).
- **Freshness:** Publisher claims "updated daily" and "BACK for the 2026-2027
  NBA Season" — the freshest Kaggle candidate found. Daily-update claim is
  UNVERIFIED (no update log retrieved).
- **License / terms:** UNVERIFIED — no license statement found in the
  retrieved material.
- **Verdict: PROBE — highest-priority Kaggle probe for game logs.**
  Exact probe: download ONLY `Games.csv` (small) + the header + first 1,000
  rows of `PlayerStatistics.csv` for one known game (e.g. a 2026-10-20 game
  already snapshotted from BBR/ESPN) and check: (1) NBA.com game ID and
  player ID present (joinable without name resolution), (2) game-type flag
  distinguishes regular season / playoffs / preseason, (3) row counts match
  the known box score. If any check fails, KILL. If all pass, it becomes a
  game-log candidate pending a full-season QA (row-count vs. schedule,
  missing-game audit). It does NOT solve shot coordinates.

### 1c. szymonjwiak — "NBA Traditional Boxscores 1997-2026"

- **What it contains:** Player and team box scores, 1996-97 through 2025-26:
  787,531 player box scores, 76,046 team box scores, 35,546 regular-season
  games, 2,440 playoff games, 37 play-in games. Fields include NBA.com game
  ID, game date, game type, NBA.com player ID, player name, teams. This is a
  game-log dataset at player-game grain, with native NBA IDs — the join
  problem that blocks BBR/ESPN does not apply. No shot coordinates, no PBP
  text (box scores only).
- **Provenance:** Publisher Szymon Jóźwiak; companion datasets (advanced,
  misc, scoring, usage, four factors) share the same keys. Upstream is
  stats.nba.com by field naming (NBA.com IDs); collection code not retrieved.
- **Freshness:** Updated ~3 months before retrieval (page "Updated 3 months
  ago", 2026-10-26 basis) and claims coverage through 2025-26 — the
  freshest dated box-score coverage found. Exact last-update date UNVERIFIED.
- **License / terms:** UNVERIFIED — no license statement found in the
  retrieved material.
- **Verdict: PROBE — co-priority with §1b for game logs.** Exact probe:
  same as §1b (one known game, ID + game-type + row-count checks) plus a
  cross-check: for one season, compare its player-game rows against §1b's
  `PlayerStatistics.csv` — agreement on games played and points is the
  cheapest cross-source validation available. Adopt at most one of §1b/§1c
  as the game-log source (whichever passes QA); running two overlapping
  game-log sources permanently is duplication, not redundancy.

### 1d. Shot-coordinate Kaggle datasets (narrow, single-purpose, or derived)

- **jonathangmwl/nbashotlocations** — shot-location data used by third-party
  ML writeups. Grain per-shot with coordinates; seasons/fields not documented
  in retrieved material. Provenance: downstream of NBA shot data, publisher
  chain unclear. License UNVERIFIED. **Verdict: KILL** — superseded by §7
  (full 1996–2024 shotdetail with documented schema); no reason to adopt an
  undocumented subset.
- **dhavalrupapara "NBA Player Shot Dataset (2023)"** — per-player files
  (e.g. one LeBron James 2022-23 file) with pixel-style coordinates
  ("vertical/horizontal position", ranges 36–389 / 2–478 — chart-pixel units,
  not feet), shot distance, quarter, clock, result. Grain per-shot but only
  a handful of players, one season. **Verdict: KILL** — narrow, pixel-unit
  coordinates need the same pixel→feet derivation BBR already does better,
  with QA, and only for named stars.
- **"NBA Shot Logs" 2014-15 (~125K shots, 21 features)** — scraped from the
  NBA official API per a citing paper: GAMEID, MATCHUP, LOCATION, W,
  FINALMARGIN, SHOTNUMBER, PERIOD, GAMECLOCK, SHOT CLOCK, plus (per the
  ShotChartDetail schema it mirrors) coordinates/zone fields. One season
  only. **Verdict: KILL as a standalone source** — one season that §7 covers
  with the same upstream; useful only as a cross-check file if §7's
  2014-15 shotdetail ever looks suspect.
- **"NBA shots 2003–2024" (cited by a damichael.com shot-efficiency report)**
  — a Kaggle dataset spanning 2003–2024 whose coordinates arrived in
  "compressed units that did not match the court's scale" and had to be
  rescaled by the report author. Publisher and exact dataset slug not
  pinned down in retrieved material. **Verdict: KILL** — unidentified
  publisher + author-rescaled coordinates = derived-from-derived with a
  transformation step nobody can audit; §7 gives the same seasons with
  documented tenths-of-feet units.
- **mayabennett03 "NBA Historical Player Data (1996-2023)"** — bio only
  (name, team, age, height, weight, college, country, draft year/round).
  Uploader-stated license Apache 2.0, expected update frequency annually.
  **Verdict: KILL for this program's gaps** — no game logs, no shots, no
  PBP; bio is already covered by the verified base.

### 1e. Kaggle, general judgment

Kaggle's value here is exactly two datasets (§1b, §1c) for game logs, and
nothing for shot coordinates that §7 does not already do better. Every
other Kaggle shot dataset found is a subset, a single season, a single
player, or an undocumented rescale. No Kaggle dataset found carries
per-frame trajectories. Kaggle's own per-dataset license labels, where
present, do not settle the NBA redistribution question.

---

## 2. nba_api (Python package, swar/nba_api) — a client, not a source

- **What it actually contains:** Nothing of its own. `nba_api` is a thin
  Python wrapper (its README: "A Python client for the APIs behind NBA.com",
  "wraps 130+ stats.nba.com endpoints", elsewhere documented as 200+
  endpoints / 217 mapped) returning pandas DataFrames. The endpoints that
  matter here all exist as classes: `shotchartdetail.ShotChartDetail`
  (per-shot LOC_X/LOC_Y, zone, distance — the reference source),
  `playergamelog.PlayerGameLog` / `teamgamelog.TeamGameLog` (game logs),
  `playbyplayv2.PlayByPlayV2` / `PlayByPlayV3` (full PBP events + text),
  `leaguegamefinder.LeagueGameFinder` (game inventory),
  `boxscoretraditionalv3.BoxScoreTraditionalV3`, tracking endpoints
  (`leaguedashptstats`, etc. — aggregates only, no frames). Its
  `live.nba` subpackage hits the CDN live feeds (scoreboard, box score,
  PBP, odds) for current games only.
- **Transport reasoning — why it does NOT escape the Hatch stall (verified
  by reasoning from its architecture, not asserted):**
  1. `NBAStatsHTTP` (in `stats/library/http.py`) issues ordinary
     `requests` GETs to `stats.nba.com` — the same host, the same
     `/stats/*` paths, from the same Hatch egress IP as a raw request.
     Its only additions are header injection (User-Agent, Referer,
     `x-nba-stats-origin: stats`, `x-nba-stats-token: true`) and session
     handling.
  2. The recorded Hatch failure mode is a handshake that never completes
     (HTTP 000 tarpit, SHOT_POSITION.md §2.1) — i.e. failure *before* any
     HTTP headers are transmitted or evaluated. Headers cannot fix a
     connection that never reaches the HTTP layer. (A tutorial's claim
     that "headers are the difference between works and frozen" describes
     a different failure mode — a server that accepts the connection and
     then stalls on a suspicious request — which is not what the
     2026-10-21 recon measured.)
  3. Its live endpoints hit `cdn.nba.com`, which fails differently but
     just as hard from Hatch (instant Akamai 403, §2.3) — again, same host
     as a raw request, no new path.
  4. Therefore `nba_api` changes *convenience* (parameter validation,
     parsing, DataFrames, offline player/team ID tables), never *network
     fate*. Any machine where raw `curl` to `stats.nba.com/stats/...`
     tarpits will see `nba_api` tarpit identically; any machine where raw
     requests succeed will see `nba_api` succeed. There is no proxy,
     mirror, cache, or alternate host in the package.
- **Provenance:** Upstream is NBA.com itself — first-party data, not a
  mirror. That is its one real advantage over every other source here:
  when it works, provenance is direct.
- **Freshness:** Live by definition (it queries the API, it stores
  nothing) — but only as fresh as the machine's access. Package itself is
  actively maintained (Python 3.10+, `requests` + `pandas` only).
- **License / terms:** Package license MIT (per the awesome-nba-data
  index entry: "Unofficial MIT-licensed Python client"). The *data* is
  governed by NBA/stats.nba.com terms, which restrict automated access to
  the stats endpoints (SHOT_POSITION.md §2.1 ToS caveat) — the package
  license does not grant data rights. Quote found for the package only;
  NBA's data terms were not re-verified here.
- **Verdict: KILL as a Hatch workaround; KEEP as the clean-machine client.**
  Do not spend another Hatch probe on it — the transport argument above
  already settles it, and a Hatch probe would only re-measure the known
  block. On Alienware/Mac, `nba_api` should be the *client* for
  ShotChartDetail / PlayerGameLog / PlayByPlayV2 probes (RQ-1…RQ-5), not a
  separate source to evaluate. Exact confirming probe (clean machine
  only): one `ShotChartDetail` call and one raw `curl` with the same
  headers to the same endpoint in the same minute — if both return rows,
  the package is confirmed as a pure convenience wrapper; if both fail,
  the gate is confirmed machine-level, not client-level.

---

## 3. BigDataBall (bigdataball.com) — paid Excel/CSV datasets

- **What it contains:** Four NBA dataset types in Excel/CSV: team box
  scores + odds, player box scores, DFS salaries/points, and play-by-play.
  The PBP product page states files are organized around game info, lineups
  (all 10 on court per event), timing, scores, events, players, and **shot
  locations**; "depending on the season and file version, columns may
  include" shot distance, shot results, and court coordinates. So: game
  logs YES (player box scores, game-by-game), PBP events + text YES
  (claimed), shot coordinates CLAIMED but version-dependent — the "may
  include" qualifier means coordinates are not guaranteed in every season
  file. No per-frame trajectories (nothing in the product line suggests
  tracking frames).
- **Provenance:** The vendor states it aggregates, cleans, and combines
  "current season and historical seasons from numerous trustworthy
  sources" — no named upstream per file, no collection code, no
  per-season source note. This is the weakest provenance among the
  KEEP/PROBE candidates: derived-from-derived with an unnamed chain. The
  coordinate fields, if present, cannot be traced to a measurement system
  from the product page alone.
- **Freshness:** In-season subscriber downloads update daily ("By 7 AM
  (ET), datasets will be updated to include the games played yesterday",
  page updated 2026-10-02). Historical seasons sold per season ($30 each;
  listed back to 2008-09 for team data; PBP season pass $100 on sale,
  one-off $15, monthly $20/9 months). A historical file bought once is a
  frozen snapshot — fine for 2015-16…2023-24, but confirm the file's
  as-of date at purchase.
- **License / terms:** UNVERIFIED — no license or redistribution terms
  found in the retrieved material; it is a paid product, so terms exist
  behind purchase, but they were not read here. Do not assume training
  use is permitted by purchase alone.
- **Verdict: PROBE — sample before any spend.** Exact probe (free, no
  purchase): download the free PBP sample file and check (1) coordinate
  columns present and non-null for field goals, (2) coordinate units and
  range (feet vs. 0–100 vs. pixels), (3) game-type flag present,
  (4) player IDs joinable to NBA IDs or only names. If the sample lacks
  coordinates or uses names only, KILL (it would duplicate BBR/ESPN with
  worse provenance). If the sample passes, the purchase decision is a
  cost/provenance trade the coordinator must put to the user — do not buy
  on this report's authority.

---

## 4. Big Balls Data (bigballsdata.com) — a DIFFERENT company; do not conflate with §3

- **What it contains:** A REST API (not files). Free tier: scores, box
  scores, standings, player profiles, injury reports (250 req/day, 500
  with GitHub). **Play-by-play — including shot coordinates — is a Pro-plan
  endpoint**; free/Solo/Trio/Edge keys get a 403 with an upgrade hint.
  PBP resource: 13.6M events through 2023 at
  `/v1/nba/games/:game_id/plays`, with period, clock, players, running
  score, scoring-play flag. Unified archive: 70,611 games back to 1946-47
  queryable via `/v1/matches?league=nba`. Game logs: box scores on the
  free tier could serve as game logs, but PBP text + coordinates require
  Pro. Production pricing starts at $49/mo; the Pro price for PBP was not
  stated in retrieved material.
- **Provenance:** Vendor-curated archive; per-event upstream not named in
  retrieved material. Freshness block is a genuine plus: every response
  carries `data_as_of`, age, and live/recent/stale status — staleness is
  self-declaring, which no other candidate offers.
- **Freshness:** PBP archive stated "through 2023" — i.e. the PBP product
  lags the current season by ~3 seasons unless Pro includes a live feed
  (live scores refresh on a 15-second cache, but whether live PBP joins
  the archive is UNVERIFIED). Staleness risk for 2024+ PBP is real.
- **License / terms:** UNVERIFIED — no license terms found in retrieved
  material; API terms exist behind signup and were not read.
- **Verdict: PROBE — only if the program wants a paid API route.**
  Exact probe (free, no payment): request a free key, call one game's
  `/v1/nba/games/:game_id/plays` — expect 403 with upgrade hint (confirming
  the paywall, per their own FAQ). The probe's real question is the Pro
  price + whether Pro PBP extends past 2023; that requires a sales/pricing
  answer, not a technical test. Until then it cannot fill the 2024+
  coordinate gap, and it is strictly worse than §7 for history.

---

## 5. ESPN core API (site.api.espn.com) — already in the program; depth is the open question

- **What it contains (verified on this VM, SHOT_POSITION.md §2.5):**
  `summary?event={id}` returns `plays` (PBP events with `text`, `period`,
  `clock`), `boxscore` (team + player lines — game-log grain per game),
  plus `winprobability`, leaders, injuries. Shot coordinates: the
  snapshot module's canonical schema carries feet coordinates with
  `coordinate.{x,y}` on shot plays, empirically verified against
  ESPN-labeled distances (RMSE 0.75 ft over 415 shots, 3 games).
  Exclusions documented: free throws carry sentinel coordinates (excluded),
  beyond-half-court heaves excluded, |coord| ≥ 1000 excluded. ESPN athlete
  IDs are NOT NBA PLAYER_IDs — registry resolution + ambiguous-name
  masking required, same as BBR.
- **Provenance:** First-party ESPN feeds (undocumented but stable since
  at least 2020, per third-party API surveys; `site.api.espn.com` and
  `site.web.api.espn.com` return the same JSON). No-auth, CORS-open
  (`Access-Control-Allow-Origin: *`).
- **Freshness:** Live endpoint; historical depth is the UNVERIFIED part.
  One date (2026-10-20) is proven; how far back `summary` serves plays
  *with coordinates* is untested. Third-party surveys confirm the
  scoreboard accepts `?dates=` (single day or month) and `?season=` /
  `?seasontype=` parameters, which is the discovery path for old games.
- **License / terms:** UNVERIFIED — ESPN publishes no public license for
  these undocumented endpoints; automated collection is at ESPN's
  sufferance (they can change or gate the feeds without notice). This is
  a stability risk, not a legal clearance.
- **Verdict: KEEP (already adopted) — with the 5-season probe still owed.**
  Exact probe (the SHOT_POSITION.md RQ-5 check, unchanged): one completed
  game from each of 2015-16, 2020-21, 2024-25 via `summary?event=` on this
  VM, recording HTTP status, play counts, and `coordinate.{x,y}`
  presence per game. If coordinates vanish before some season, ESPN's era
  boundary is that season and the tower's era mask must say so. Note: the
  text-fetch probe attempted during this investigation was refused by the
  fetch tool's domain policy — that refusal says nothing about ESPN and
  must not be quoted as an ESPN outage.

---

## 6. balldontlie (api.balldontlie.io) — free tier cannot fill any gap

- **What it contains:** Free tier (API key required since the keyless
  era ended; 5 req/min on free per current docs, older listings said
  60 req/min): teams, players, games. **Statistics, play-by-play,
  lineups, injuries, and odds require paid tiers** (per the
  awesome-nba-data index). Seasons 1979–current for the covered entities.
  No shot coordinates on any tier found in retrieved material; no PBP
  text on the free tier.
- **Provenance:** Vendor API over its own database; upstream not named.
- **Freshness:** Live-ish (game stats updated ~every 10 minutes per older
  listings); current-season coverage is its strength, history is not the
  problem — the problem is the missing grains.
- **License / terms:** UNVERIFIED — API terms behind signup, not read.
- **Verdict: KILL for this program's gaps.** The free tier gives
  schedules/rosters the program already has; the paid tiers' PBP scope
  (and whether it includes coordinates at all) is undocumented in
  retrieved material. Revisit only if a paid-tier field list surfaces
  showing coordinates — that would convert it to a PROBE, not a KEEP.

---

## 7. shufinskiy/nba_data (GitHub) — the strongest open alternative found

- **What it contains:** Season archives (`.tar.xz`, one CSV per archive)
  in a deterministic manifest (`list_data.txt`, ~400 files, ~15 GB
  compressed / ~150 GB uncompressed total — do NOT clone whole; fetch
  single archives by key). NBA datatypes and coverage (regular season +
  `_po_` playoffs each):
  - `shotdetail` 1996–2024 — **shot coordinates + zone data** (the
    ShotChartDetail grain; coordinate system documented as tenths of
    feet, LOC_X = 0 center line, LOC_Y = 0 baseline, basket ≈ LOC_Y 0–50).
    This is the only open source found with multi-decade coordinates.
  - `pbpstats` 2000–2024 — possession-level PBP from api.pbpstats.com
    (events aggregated to possessions; shot-zone breakdowns, NOT raw
    per-event text — see the caveat below).
  - `nbastats` / `nbastatsv3` 1996–2024 — box scores / enhanced metrics
    (game-log-adjacent aggregates, not per-game logs per se).
  - `datanba` 2016–2024 — court-action events from data.nba.com
    (mobile PBP JSON, per-event, with coordinates where the feed carries
    them — the closest thing here to raw full PBP + locations).
  - `cdnnba` 2020–2024 — CDN live-feed event logs.
  - `matchups` 2017–2024 — defensive matchup assignments.
  WNBA archives run to 2025 on the same datatypes (minus matchups).
  **Caveat that matters:** `pbpstats` is possession-aggregated, so the
  "full PBP events + text" gap is only partly met here — `datanba`
  (2016+) is the per-event candidate, and pre-2016 per-event text still
  needs another source (ESPN §5, if its depth holds, or the clean-machine
  PlayByPlayV2 route). `shotdetail` + `nbastats` do NOT by themselves
  give per-game logs; game logs still come from §1b/§1c or the
  clean-machine PlayerGameLog route.
- **Provenance:** The best documented of any mirror: public R collection
  scripts (`loading/load_data.R`, `loading/utils.R`) harvest from named
  upstreams per datatype (stats.nba.com, api.pbpstats.com, data.nba.com,
  cdn.nba.com), then `build_dataset/build_dataset.R` consolidates to
  season CSVs. Upstream-per-datatype is named in code, not just claimed.
  It is still a third-party redistribution of NBA data — the NBA-ToS
  question transfers to this copy; it is not laundered clean by being
  on GitHub.
- **Freshness:** NBA archives end at 2024 (2024-25 season); WNBA to 2025.
  Staleness risk is bounded and explicit: 2025-26 and 2026-27 are MISSING
  from this source and must come from elsewhere (ESPN/BBR live
  snapshots, or the clean machine). For the program's stated prize —
  historical context builders from 2015-16 up — the coverage is exactly
  right; for current seasons it is not a source at all.
- **License / terms:** UNVERIFIED as to content — the repo ships a LICENSE
  file and the distribution docs cite it, but its text was not retrieved
  in this investigation. Do not quote a license for this repo until the
  file itself is read. (Same NBA-rights caveat as §1.)
- **Verdict: KEEP — top probe candidate for shot coordinates and PBP.**
  Exact probe (tiny, no bulk fetch): (1) fetch `list_data.txt` only and
  confirm the keys `shotdetail_2023`, `datanba_2023`, `pbpstats_2023`
  exist; (2) `HEAD` one archive URL to confirm it resolves;
  (3) then — as the real adoption gate, one season only
  (`shotdetail_2015` + `datanba_2015`): extract, run row-count sanity,
  LOC_X/LOC_Y null rate by season, and cross-check one game's zone
  shares against a BBR/ESPN snapshot of the same game if available.
  Pass criteria: coordinates present and non-null at rates comparable
  to ShotChartDetail's documented behavior, game IDs joinable to NBA IDs
  natively. If the probe passes, `shotdetail` becomes the historical
  coordinate primary and `datanba` the per-event PBP candidate for
  2016+; if it fails, fall back to §5 (ESPN depth) + clean-machine
  collection and re-grade this source KILL.

---

## 8. hoopR / sportsdataverse (R + Python wrappers + bulk releases)

- **What it contains:** Two layers that must not be confused.
  (a) *Live wrappers:* `hoopR::load_nba_pbp()` / `sportsdataverse-py`
  `espn_nba_pbp()` call ESPN's `summary` endpoint (§5) — same data, same
  depth question, plus parsing. hoopR v1.3.0 also wraps the NBA Stats API
  (127 functions) — same gate as §2 from Hatch.
  (b) *Bulk releases (the actually new part):* the `hoopR-nba-data`
  pipeline publishes parquet/RDS artifacts to the `sportsdataverse-data`
  release repo, including `load_nba_pbp` seasons claimed 2002–2026 and
  `load_nba_shots` — "one row per shot attempt (made or missed), with
  court coordinates and shot metadata", backed by the `espn_nba_shots`
  release tag. A cited research use recovered ESPN PBP + shot
  coordinates for 2015-16 through 2025-26 via hoopR — the only
  independent claim found that ESPN-coordinate depth reaches 2015-16.
  Game logs: `load_nba_player_box()` / `load_nba_player_stats()` give
  per-season player stats and per-game box lines from ESPN (game-log
  grain, ESPN athlete IDs, not NBA IDs).
- **Provenance:** ESPN feeds, re-published through a public pipeline
  (sportsdataverse/hoopR, author Saiem Gilani et al.). Pipeline code is
  public, which beats §3/§4's unnamed chains, but the artifacts are still
  ESPN-derived snapshots. Documented vintage caveat: ESPN roster/bio
  fields are current snapshots overwritten in place, NOT era-correct —
  do not join bio fields by season from this source; the shot/PBP
  artifacts do not carry the same warning, but the warning proves the
  pipeline does not version everything.
- **Freshness:** Release tags update with the pipeline; exact last-update
  dates for `espn_nba_shots` / NBA PBP releases were UNVERIFIED in
  retrieved material. The 2002–2026 claim is a docs claim, not a
  measured file list.
- **License / terms:** UNVERIFIED — package/release license text not
  retrieved; ESPN's underlying terms caveat (§5) applies unchanged.
- **Verdict: PROBE — second-priority after §7, first-priority for ESPN depth.**
  Exact probe (one season, one file): fetch the `espn_nba_shots`
  artifact for 2015-16 only (parquet header + row count + coordinate
  null rate + one game's shot count vs. its known box score). If
  coordinates are present for 2015-16, hoopR independently corroborates
  ESPN depth back to the context-builder floor and becomes the bulk
  ESPN path (no per-game API crawl). If 2015-16 coordinates are absent
  or the release tag lacks that season, KILL the bulk path and keep only
  the live ESPN probe (§5).

---

## 9. pbpstats (package + api.pbpstats.com) — derivative, same gate

- **What it contains:** A parser (PyPI `pbpstats`, also the source of
  §7's `pbpstats` archives) that scrapes/parses NBA/WNBA/G-League PBP
  from stats.nba.com and data.nba.com endpoints, adding lineup-on-floor
  for every event, possession start/end/score-margin, and shots broken
  down by shot *zone*. Zones, not coordinates: nothing in its feature
  list claims LOC_X/LOC_Y or per-frame positions. Its own site's stats
  are "derived from these stats" (i.e., from the parsed PBP).
- **Provenance:** Derived from NBA endpoints by documented parsing code
  (dblackrun/pbpstats) — honest derivation, but derivation nonetheless.
- **Freshness:** Live parser (fresh when its upstreams answer); PyPI
  versions up to 1.3.8 seen. From Hatch it inherits the stats.nba.com
  block for the stats endpoint and the data.nba.net death for the data
  endpoint — as a live path it is gated exactly like §2.
- **License / terms:** UNVERIFIED.
- **Verdict: KILL as an independent live path.** Its unique value
  (possession + lineup + zone derivation) is already frozen in §7's
  `pbpstats` archives, and its live form adds no grain the program
  lacks. Do not adopt the package for collection; if possession/lineup
  features are ever wanted, take them from the §7 archives, not from a
  fresh gated scrape.

---

## 10. Licensed B2B feeds (Sportradar, SportsDataIO) — noted, not open

- **What they contain:** Full commercial NBA feeds: schedules, rosters,
  box scores, PBP (SportsDataIO: final PBP 30–60 min post-game, live
  15–20 s behind broadcast, all substitutions accounted for), injuries,
  odds/projections. Coordinates: not confirmed in retrieved material for
  either vendor's PBP feed — PBP text YES, coordinates UNVERIFIED.
  No per-frame trajectories on public terms.
- **Provenance:** Licensed league data — the cleanest rights posture of
  any source here, but at B2B prices and under contract terms that were
  not read.
- **Freshness:** Live, current-season — the only candidates besides
  ESPN/BBR that are genuinely current.
- **License / terms:** Commercial license, terms UNVERIFIED (not read).
- **Verdict: PROBE only if the program chooses a paid licensed route.**
  Exact probe: request field lists for the PBP feed (does a shot event
  carry coordinates?) + pricing. Until coordinates are confirmed, these
  feeds do not beat free ESPN/BBR for the shot tower; their case rests
  on rights cleanliness and current-season PBP, not on new grains.

---

## 11. "basketball-database" / other mirrors — no such standalone source found

No distinct service called "basketball-database" (or basketballdatabase)
offering NBA PBP, game logs, or coordinates surfaced in search. The
nearest real things are already covered: Basketball-Reference (§2.4 of
SHOT_POSITION.md, in-program), the shufinskiy archive (§7), and
nbasavant.com (a shot-chart site sourcing NBA.com + ESPN, cited only as
the origin of a 2010-11…2015-16 top-10-players shot file — narrow,
superseded by §7). **Verdict: KILL the name** — do not spend further
search budget on it; if a specific URL is ever supplied, evaluate that
URL, not the name.

---

## 12. Per-frame trajectories — the negative result, stated plainly

**No public source of multi-season per-frame player-location data exists
that this investigation could find.** What does exist is narrow, frozen,
or modeled — each disqualified or bounded as follows:

- **sealneaward/nba-movement-data (origin: neilmj's SportVU dump) — the
  ONLY real per-frame source found, and it is a half-season.**
  ~600 game archives, first half of 2015-16 only, SportVU 25 Hz, per-frame
  `[team_id, player_id, x_loc, y_loc, radius]` with x 0–94 ft / y 0–50 ft
  full court and ball height as z; NBA player IDs native; JSON per game
  50–150 MB uncompressed. Provenance: SportVU optical tracking as
  formerly published on NBA.com, re-hosted by a third party after the
  NBA took the data down (2016-01-23 per the Beuoy note). Freshness:
  FROZEN — no updates since 2015-16, by construction (the public tap was
  shut off). License UNVERIFIED — no license text retrieved for this
  repo; the data's league origin makes the rights question at least as
  sharp as §7's. **Verdict: KEEP as a bounded demo corpus ONLY** —
  ~600 games of 2015-16 H1 is enough to prototype a location model and to
  prove the fine-level pipeline end to end, and it is the only real
  trajectory data available at any price short of a league deal. It
  cannot train a general location model (one half-season, one era,
  pre-Second Spectrum) and must be labeled as such wherever used. Exact
  probe (tiny): list the archive directory / confirm one archive
  (e.g. `12.05.2015.NYK.at.MIL.7z`) resolves, and parse the headers of
  ONE game only — frame rate, player-ID coverage, ball presence — before
  any wider pull. A full pull is ~3–10 GB compressed and is NOT a probe.
- **Toronto Raptors 42-game set (U. Toronto CSC2541, Fall 2015)** —
  SportVU 25 Hz + PBP, pickled per game. Real frames, but one team, 42
  games, one half-season, academic hosting. **Verdict: KILL for training**
  (too narrow, same era as above, worse coverage); usable only as a
  second opinion on the §12 corpus if its format ever matters.
- **2012-13 13-team research set (arXiv trajectory papers)** — real
  SportVU frames, but player identities ANONYMIZED (masked IDs in the
  published sample). **Verdict: KILL** — anonymized IDs cannot join to
  `person_id`, so the frames cannot train a player model; anonymization
  is fatal here, not incidental.
- **Michael Beuoy "NBA Player Shooting Motions" (Kaggle mirror of
  inpredictable.com)** — 190 most prolific 3-point shooters, 2013–2016,
  with `path_detail` "trajectory data (in all three dimensions)". This
  is MODELED data: each player's "typical" shooting motion fit by LOESS
  over all their shots (open/defended/made/missed subsets). **Verdict:
  KILL under the real-data-only rule** — a smoothed typical trajectory
  is a model output dressed as data, exactly what the rule forbids. It
  must never enter training, even as a "trajectory prior".
- **Second Spectrum (2017-18+ league-wide, 25 Hz, all arenas)** — the
  real modern system, but its raw frames are proprietary and sold to
  teams/broadcasters, not published. The public surface is aggregates
  only (speed/distance, touches, catch-and-shoot, closest defender via
  stats.nba.com dashboards — already in the verified base as tracking
  2013-14+). **Verdict: BLOCKED** — no open path; academic partnership
  or league deal is the only route, and that is a user-level decision,
  not an investigator's probe.

**Consequence for the program:** the fine level of the H-JEPA vision
cannot be trained on public per-frame trajectories at any scale. The
viable fine level is event-location prediction (next-shot / next-event
coordinates from §7 shotdetail + §5/§8 ESPN shots + §12's half-season
demo), exactly the rung-1 demo the panel pre-registered. Any plan that
assumes multi-season trajectories must be re-scoped before it starts.

---

## Summary keep/kill table

| Source | Game logs | Shot coords | Full PBP (events+text) | Per-frame traj. | Verdict |
|---|---|---|---|---|---|
| Kaggle §1b eoinamoore (1947–pres., PBP parquet since 1996) | YES (probe) | NO (not claimed) | CLAIMED (probe) | NO | PROBE |
| Kaggle §1c szymonjwiak (1996-97–2025-26, NBA IDs) | YES (probe) | NO | NO | NO | PROBE |
| Kaggle other shot sets (§1d) | NO | Narrow/derived | NO | NO (Beuoy = modeled) | KILL |
| nba_api (§2) | YES (clean machine only) | YES (clean machine only) | YES (clean machine only) | NO | KILL from Hatch / KEEP as clean-machine client |
| BigDataBall (§3, paid files) | YES | CLAIMED, version-dependent | YES (claimed) | NO | PROBE (free sample first) |
| Big Balls Data (§4, paid API) | YES (free tier box scores) | Pro-only, thru 2023 | Pro-only, thru 2023 | NO | PROBE (price + post-2023 check) |
| ESPN core API (§5, in-program) | YES (per-game box) | YES (one date proven; depth TBD) | YES (one date proven; depth TBD) | NO | KEEP + 5-season probe owed |
| balldontlie (§6) | NO (free tier) | NO | Paid tier only, coords undocumented | NO | KILL |
| shufinskiy/nba_data (§7, GitHub) | Via aggregates only | YES 1996–2024 | Partly (`datanba` 2016+ per-event; `pbpstats` possession-level) | NO | KEEP (probe one season first) |
| hoopR / sportsdataverse bulk (§8) | YES (ESPN IDs) | CLAIMED 2002–2026 incl. 2015-16 | YES (ESPN, claimed 2002–2026) | NO | PROBE (2015-16 shots artifact) |
| pbpstats live package (§9) | NO | NO (zones only) | Derived, gated | NO | KILL (archives in §7 suffice) |
| Sportradar / SportsDataIO (§10, licensed) | YES | UNVERIFIED | YES | NO | PROBE only if paid licensed route chosen |
| "basketball-database" (§11) | — | — | — | — | KILL (no such source found) |
| sealneaward movement data (§12) | NO | Shot events embedded in frames | Events embedded | YES — but only ~600 games, 2015-16 H1, frozen | KEEP as bounded demo corpus ONLY |
| Beuoy modeled trajectories (§12) | NO | NO | NO | Modeled, not measured | KILL (real-data-only violation) |
| Second Spectrum raw frames (§12) | NO | NO (public: aggregates only) | NO | Proprietary | BLOCKED |

**Bottom line for the coordinator:** the historical gaps are fillable
without the clean machine — §7 (shotdetail 1996–2024 + datanba 2016+) is
the coordinate/PBP backbone, §1b/§1c are the game-log candidates, §5/§8
(ESPN) is the cross-check and the current-season bridge — but every one
of those needs its one-season probe before adoption. The current-season
gap (2025-26/2026-27) is NOT filled by any archive; it rests on ESPN/BBR
live snapshots. And per-frame trajectories beyond a frozen 2015-16
half-season do not exist in the open — that negative is final for
planning purposes until a league/academic deal changes it.

---

## Verdict lines

VERDICT: PASS — Kaggle game-log candidates (§1b/§1c) worth probing — ~/workspace/mlops-v2-drafts/data-deep-dive/open-alternatives.md
VERDICT: FAIL — Kaggle narrow/derived shot sets as coordinate sources — ~/workspace/mlops-v2-drafts/data-deep-dive/open-alternatives.md
VERDICT: FAIL — nba_api as a Hatch-network workaround (same host, path, egress; headers cannot fix a handshake tarpit) — ~/workspace/mlops-v2-drafts/data-deep-dive/open-alternatives.md
VERDICT: PASS — nba_api as the clean-machine client for ShotChartDetail / PlayerGameLog / PlayByPlayV2 — ~/workspace/mlops-v2-drafts/data-deep-dive/open-alternatives.md
VERDICT: BLOCKED — BigDataBall / Big Balls Data PBP coordinates behind paywall + unverified license/terms — ~/workspace/mlops-v2-drafts/data-deep-dive/open-alternatives.md
VERDICT: PASS — ESPN core API kept, 5-season coordinate-depth probe still owed — ~/workspace/mlops-v2-drafts/data-deep-dive/open-alternatives.md
VERDICT: FAIL — balldontlie free tier for game logs / PBP / coordinates — ~/workspace/mlops-v2-drafts/data-deep-dive/open-alternatives.md
VERDICT: PASS — shufinskiy/nba_data shotdetail (1996–2024) + datanba (2016+) as historical backbone, one-season probe first — ~/workspace/mlops-v2-drafts/data-deep-dive/open-alternatives.md
VERDICT: BLOCKED — hoopR bulk ESPN shots/PBP depth to 2015-16 unverified until one-season artifact probe — ~/workspace/mlops-v2-drafts/data-deep-dive/open-alternatives.md
VERDICT: FAIL — pbpstats live package as an independent collection path — ~/workspace/mlops-v2-drafts/data-deep-dive/open-alternatives.md
VERDICT: FAIL — "basketball-database" as a distinct source (none found) — ~/workspace/mlops-v2-drafts/data-deep-dive/open-alternatives.md
VERDICT: BLOCKED — multi-season public per-frame trajectories (only frozen 2015-16 half-season exists; Second Spectrum raw frames proprietary) — ~/workspace/mlops-v2-drafts/data-deep-dive/open-alternatives.md
VERDICT: FAIL — Beuoy LOESS-modeled shooting trajectories under the real-data-only rule — ~/workspace/mlops-v2-drafts/data-deep-dive/open-alternatives.md

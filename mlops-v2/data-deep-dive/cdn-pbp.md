# CDN Play-by-Play — Vector Hoops data-collection deep dive

**Lane:** CDN-PBP investigator · **Status:** READ-ONLY investigation
(no bulk fetch, no live-checkout writes, no training, no prod writes)
· **Date:** 2026-10-26 · **Checkout measured:**
`~/workspace/vector-hoops-mlops-v2` (live main line; the 5 PBP files
and 6 replay files below were measured from disk, not recalled).

**Standing ground truths carried in (not re-probed):**
`cdn.nba.com` returns instant HTTP 403 (~0.5 s, Akamai Bot Manager)
from the Hatch VM — a hard bot block, not throttling (2026-10-21
recon, `pipeline/shotcharts/sources/nba_cdn.py`). No re-probe was
made in this pass: the stub's rule is re-probe at most quarterly or
on a concrete announcement, and 2026-10-21 was five days ago.
The 5 existing PBP files came from **`api.nba.com`** (a DIFFERENT
host), not `cdn.nba.com` — do not conflate the two hosts.

**Verification convention used below:** MEASURED = counted from the
files on this VM in this pass. UNVERIFIED = not measured from an
actual response; the exact check that would verify it is named.
Nothing in this file claims a live fetch that did not happen.

## 1. Endpoint / format table

### 1.1 The three hosts, kept apart

| Host | Endpoint (pattern) | Role | Status from this VM |
|---|---|---|---|
| `cdn.nba.com` | `static/json/liveData/playbyplay/playbyplay_<gameId>.json` | Live play-by-play (the "Live API" file) | BLOCKED: HTTP 403, Akamai Bot Manager (2026-10-11, 2026-10-21 recon). Live-only by design ("liveData"); see §3. |
| `cdn.nba.com` | `static/json/liveData/boxscore/boxscore_<gameId>.json` | Live box score | Same 403 gate as above (same host/path family). UNVERIFIED individually — no separate probe was made, and none is due until the quarterly window. |
| `cdn.nba.com` | `static/json/liveData/scoreboard/todaysScoreboard_00.json` | Today's games/scores/status | Same gate as above. UNVERIFIED individually. |
| `cdn.nba.com` | `static/json/liveData/odds/odds_todaysGames.json` | Betting odds | Same gate as above. UNVERIFIED individually. |
| `api.nba.com` | `statscapture/games/<gameId>/playbyplay?Format=json` | Stats-capture PBP — **the measured source of the 5 files** (each file's `meta.request` records exactly this URL) | WORKED for 5 opening-week 2026-27 games fetched 2026-10-20/21 (fetching machine is NOT recorded in the repo — no fetcher script exists; see §4.4). Historical coverage UNVERIFIED (§2). |
| `stats.nba.com` | `stats/playbyplayv2` (classic stats API) | Historical PBP *text* (event list, no coordinates in its documented schema) | GATED from Hatch: `/stats/*` tarpits to HTTP 000 (2026-10-21 recon, `pipeline/shotcharts/sources/stats_nba.py`). Not a coordinate source in any case. |
| `stats.nba.com` | `stats/shotchartdetail` | Per-player-season shot rows with coordinates | GATED, same HTTP 000 tarpit + ToS caveat (see SHOT_POSITION.md §2.1). |

The 4-endpoint liveData list above (scoreboard / boxscore /
playbyplay / odds) is documented by the community `nba_api` library's
docs, not by an official NBA publication found in this pass — treat
the *file patterns* as community-documented, and the *403 gate* as
measured. No official NBA liveData documentation was located in-repo;
the in-repo evidence for the playbyplay pattern is
`pipeline/build_replays.py`'s `FEED` constant, which uses exactly
`https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_{gid}.json`.

**Provenance trap (MEASURED):** the replay files' `source` field
points at the `cdn.nba.com` liveData URL, but the cached PBP files
they were built from carry `meta.request =
https://api.nba.com/statscapture/games/<id>/playbyplay?Format=json`.
The replay `source` label therefore does NOT prove the data came
from cdn.nba.com. The honest lineage is: PBP JSON fetched from
`api.nba.com` (machine unknown) → cached → replay built locally.
Any report that says "replays came from the CDN" is wrong on the
evidence in the files themselves. See §4.

### 1.2 Measured response envelope (stats-capture PBP)

Top level (MEASURED, all 5 files identical in shape):

```json
{
  "meta": {"version": 1, "code": 200,
           "request": "https://api.nba.com/statscapture/games/<id>/playbyplay?Format=json"},
  "game": {"gameId": "<10-digit id>", "actions": [ ... ]}
}
```

No other top-level keys. `gameId` is a 10-digit string
(`0022600001` = regular-season game, season code `26` = 2026-27,
game number `00001` — see the ID pattern in §2.2).

### 1.3 Fields per action (MEASURED — 54 distinct keys across the 5 files)

Grouped by role. A field is listed as "FG-only" where it is
non-null only on field-goal actions in the measured corpus.

| Group | Fields | Notes (measured) |
|---|---|---|
| Identity / order | `actionNumber`, `orderNumber`, `shotActionNumber` | `actionNumber` is the game-order index (game 0022600001 runs 2…732, gaps where the feed numbers non-displayed actions). `orderNumber` is NOT monotonic in file order — the builder re-sorts by (period, −clock, orderNumber). |
| Clock / period | `clock`, `timeActual`, `period`, `periodType`, `edited` | `clock` is ISO-8601 duration, e.g. `PT11M32.00S`. `timeActual`/`edited` are UTC ISO timestamps (real wall-clock event/edit times). All 5 measured games: `periodType` = `REGULAR` only, periods 1–4 (no OT game in the sample). |
| Teams / score | `teamId`, `teamTricode`, `possession`, `scoreHome`, `scoreAway` | `scoreHome`/`scoreAway` are STRINGS (`"0"`, `"59"`), not ints. `possession` is a teamId (or 0 for period markers). |
| Actor | `personId`, `playerName`, `playerNameI`, `personIdsFilter` | `personId` is the NBA PLAYER_ID — directly joinable, no name resolution. FG actions: 0 missing `personId` across all 897 (MEASURED). `personIdsFilter` lists all persons involved in the action. |
| Event taxonomy | `actionType`, `subType`, `descriptor`, `qualifiers`, `description` | See §1.4. `description` is the human-readable sentence (e.g. `MISS J. Collins 24' 3PT`). |
| Shot / coordinate | `isFieldGoal`, `x`, `y`, `xLegacy`, `yLegacy`, `shotDistance`, `shotResult`, `side` | See §1.5 — the coordinate core of this file. |
| Second actors | `assistPersonId`, `assistPlayerNameInitial`, `assistTotal`, `blockPersonId`, `blockPlayerName`, `stealPersonId`, `stealPlayerName`, `foulDrawnPersonId`, `foulDrawnPlayerName`, `jumpBallWonPersonId`, `jumpBallWonPlayerName`, `jumpBallLostPersonId`, `jumpBallLostPlayerName`, `jumpBallRecoverdPersonId` [sic — feed's own typo], `jumpBallRecoveredName`, `officialId` | Present only on the action types that need them; all absent (key missing, not null) on most actions. |
| Running totals | `pointsTotal`, `reboundTotal`, `reboundOffensiveTotal`, `reboundDefensiveTotal`, `turnoverTotal`, `foulPersonalTotal`, `foulTechnicalTotal` | Per-player running totals as of that action. |
| Flags | `isTargetScoreLastPeriod` | False throughout the measured sample (target-score / Elam games would set it; none sampled). |

### 1.4 Event taxonomy (MEASURED, all 5 games pooled, 3,152 actions)

`actionType` values and counts: `substitution` 730, `rebound` 558,
`2pt` 529, `3pt` 368, `freethrow` 291, `foul` 256, `turnover` 152,
`steal` 80, `block` 64, `timeout` 59, `period` 40, `jumpball` 12,
`game` 5, `violation` 4, `heave` 4. Field-goal actions are
`2pt` + `3pt` (`isFieldGoal` = 1); `heave` actions are NOT flagged
as field goals in this feed — a tower that counts only
`isFieldGoal` = 1 misses heaves (4 in 5 games; small, but record
the rule).

Field-goal `subType` values (897 FG actions): `Jump Shot` 591,
`Layup` 225, `DUNK` 60, `Hook` 21. Note the inconsistent casing
(`DUNK` vs `Jump Shot`) — normalize case before grouping.

`qualifiers` (arrays, possibly empty) include: `fastbreak`,
`fromturnover`, `2ndchance`, `pointsinthepaint`, `1freethrow` /
`2freethrow` / `3freethrow`, `inpenalty`, `startperiod`, `team`,
`mandatory`, `deadball`. These are the only "context" flags the
feed carries — there is no defender ID, no play-type, no tracking
coordinate for any non-shooter.

`subType` on non-FG actions is type-specific: fouls
(`personal`, `offensive foul`), rebounds (`offensive`,
`defensive`), turnovers (`bad pass`, `lost ball`, `traveling`,
`palming`, `out-of-bounds`), free throws (`1 of 2`, `2 of 2`,
…), substitutions (`in`, `out`), timeouts (`full`, `team`,
`challenge`), periods (`start`, `end`).

### 1.5 Coordinate fields — the part that matters (MEASURED)

For every field-goal action (`isFieldGoal` = 1), all of the
following are present (897/897 in the 5 games):

| Field | Meaning (measured) | Range in sample |
|---|---|---|
| `x`, `y` | Shot location on a 0–100 scaled court | x 2.79…97.96, y 0.0…99.18 (pooled; per-game ranges in §5) |
| `xLegacy`, `yLegacy` | Second coordinate pair, integer, hoop-relative tenths-of-feet scale (inference from magnitudes — see below) | e.g. (246, 15), (100, 242), (−28, −5) |
| `shotDistance` | Feet, as reported by the feed | Present on all 897 FG actions |
| `shotResult` | `Made` / `Missed` | All 897 FG actions; also present on all 291 free throws |
| `side` | `left` / `right` — which end the shot was taken at | FG actions carry a side; non-FG actions carry null |

Non-FG actions: **zero** carry non-null `x`/`y` (MEASURED across
all 3,152 actions). Coordinates exist only for shots — this feed
is not a tracking feed, and free throws carry no coordinates
(their `x`/`y` are null; only `shotResult` survives).

**Coordinate conversion — now VERIFIED, correcting the prior
note.** SHOT_POSITION.md §2.2 called the 0–100 → feet conversion
UNVERIFIED and named the confirming check: compare the radial
distance from converted coordinates against the action's own
`shotDistance`. That check is in fact already implemented in
`pipeline/build_replays.py` (distance from the converted point to
the nearer rim, rim centre 5.25 ft from the baseline, court
94 × 50 ft) — and an independent recomputation in this pass on
game 0022600001 gives median error 0.0002 ft, p95 0.0005 ft,
max 0.0005 ft over 174 shots; the committed replay files report
`distErrMedianFt: 0.0, distErrP95Ft: 0.0` for all 5 games.
The conversion is therefore:

```
x_ft = x / 100 * 94        y_ft = y / 100 * 50
distance = min over the two rims of hypot(x_ft − rim_x, y_ft − 25)
```

and it reproduces the feed's own `shotDistance` to sub-millimetre
rounding. What remains UNVERIFIED is the `xLegacy`/`yLegacy`
pair's exact frame: magnitudes are consistent with tenths of
feet from the hoop (e.g. legacy (246, 15) → radial 24.65 ft vs
reported 24.624 ft; (100, 242) → 26.18 ft vs 26.167 ft), but the
axis order / sign convention was not pinned in this pass, and
nothing needs it — the 0–100 pair plus `shotDistance` already
close the loop. Do not feed raw 0–100 values into a feature as
if they were feet; convert first (or take `shotDistance` for
distance-only features).

**What the liveData playbyplay file itself contains is
UNVERIFIED:** no liveData response has ever been measured in
this project (403 from Hatch). The format above is the
**stats-capture** format. Whether the cdn liveData file is
byte-identical, a subset, or a different schema is unknown —
the replay script's `FEED` constant assumes the same file at
the cdn URL, but that assumption has never been tested against
a real cdn response. Do not quote the §1.3 field list as "the
cdn format"; it is the api.nba.com format.

## 2. Historical coverage — the per-season question

**Short answer: UNVERIFIED for every season before 2026-27, on
both hosts.** The only measured fact is that the stats-capture
feed served 5 opening-week 2026-27 games. Everything below is
the probe that would answer the question — it has NOT been run.

### 2.1 Why the answer is not obvious

- The feed's name is "stats-capture" (live capture), and its
  cdn twin lives under `liveData` — both names suggest a
  live/recent system, not an archive. But a live system can
  retain completed games (the 5 files ARE completed games,
  fetched after the final whistle), so "live" does not prove
  "no history."
- The coordinate fields depend on the capture/tracking
  pipeline. Optical tracking (SportVU) entered the league in
  2013-14, so pre-2013 coordinate-bearing capture is a priori
  doubtful — but that is a prior, not evidence: the feed could
  serve pre-2013 games with null coordinates, with reconstructed
  coordinates, or not at all. Each possibility changes the tower
  design differently, which is why the probe samples eras on
  both sides of 2013.
- A 404 on an old game would prove the feed does not serve that
  game; it would NOT prove the feed serves no old games (the
  ID could be wrong, or that season could be outside the
  window). Hence the probe's Step 0 (ID resolution) and its
  fallback rule.

### 2.2 The exact 5-game probe (to run on a clean machine)

Run on Alienware (Forge lane) or Mac — NOT Hatch — with a
single plain GET per URL, browser-style UA, no rotation, no
retry storm. One request per game; record HTTP status, bytes,
action count, FG count, and coordinate presence. Total cost:
5 requests.

**Step 0 — resolve the IDs before fetching.** Game IDs follow
the pattern `002` + 2-digit season-start year + 5-digit game
number (`0022600001` = regular season, 2026-27, game 00001).
Confirm each ID below against a season schedule source
(Basketball-Reference schedule page or the league schedule)
on the clean machine. If a listed ID is not a regular-season
game for that season, substitute the season's lowest-numbered
regular-season game ID, record the substitution, and fetch
that instead. A probe that fetches a wrong ID and reports
"404" without this step proves nothing.

| # | Season | Probe game ID (pattern-derived) | Why this era |
|---|---|---|---|
| 1 | 1996-97 | `0029600001` | Earliest model season; pre-tracking. Tests whether the feed reaches the full 30-season span at all. |
| 2 | 2005-06 | `0020500001` | Mid-2000s, still pre-tracking. Tests whether any pre-2013 game is served. |
| 3 | 2013-14 | `0021300001` | First SportVU season. The boundary case: if coordinates start anywhere, it is here. |
| 4 | 2020-21 | `0022000001` | Modern tracking era, pre-dates the 2026 sample by 6 seasons. Tests "recent history" vs "current season only." |
| 5 | 2024-25 | `0022400001` | Last-but-one season. Tests whether the feed serves completed recent seasons, not just the live season. |

**URLs (stats-capture host first — it is the measured host):**

```
https://api.nba.com/statscapture/games/<id>/playbyplay?Format=json
```

If — and only if — the stats-capture host returns 404 for a
game, issue the same game's cdn liveData URL as a second
check (this is the one-per-host allowance, not a retry):

```
https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_<id>.json
```

(Expect 403 on cdn from any bot-flagged egress; a 403 there
proves nothing about history — see §2.3.)

**Record per game:** HTTP status; `meta.code` if JSON;
`len(actions)`; FG count (`isFieldGoal` = 1); FG actions with
non-null `x`/`y`; FG actions with non-null `xLegacy`/`yLegacy`;
`shotDistance` presence; whether `periodType` differs from
`REGULAR`; and the first/last action's `timeActual` (to catch
a feed that returns a *different* game than requested).

### 2.3 What each outcome would prove

| Outcome (stats-capture host) | Proves | Does NOT prove | Next step |
|---|---|---|---|
| **200 with coords** (FG actions carry `x`/`y`, rate ≈ 100% as in 2026) | The feed serves that season with shot locations. The tower's era boundary extends at least to that season. | That ALL games in that season are served, or that coordinates are equally complete in every game (sample one more game from that season before generalizing). | Extend the sample within that season (2–3 more games, incl. an OT game); then the season's game list can be backfilled. |
| **200 without coords** (actions present, `x`/`y` null on FG actions, or FG actions absent) | The feed serves that season's events but NOT locations. The season can feed a PBP-text corpus, not the shot tower. | That coordinates are absent for the whole season (one game could be a capture failure — check a second game before writing the season off). | Mark the season "events only"; the shot tower needs BBR/ESPN/ShotChartDetail for that era. |
| **404** | That game ID is not served by that host (given Step 0 confirmed the ID is a real regular-season game). | That the feed serves no games from that season (ID scheme may differ by era — e.g. legacy IDs — or the window may start later). | Try the season's game 00002 and one mid-season game before concluding the season is unserved; check the cdn URL once per game. |
| **403** | Only that the requesting egress is bot-blocked on that host (the cdn outcome from Hatch, and a possible future stats-capture outcome). It says NOTHING about historical coverage. | Anything about whether the game exists or has coordinates. | Do NOT rotate headers/IPs or switch to a browser workaround (off-limits, §3.3). Change the machine (Alienware/Mac lane) or wait for a posture change, then re-run the same 5 requests. |
| **000 / timeout / hang** | That the host is unreachable or tarpitting from that machine (the stats.nba.com symptom from Hatch). Same evidentiary value as 403: nothing about coverage. | Anything about the game. | Same as 403: change machine, do not evade. |
| **200 with a DIFFERENT game** (gameId mismatch, or `timeActual` from another date) | That the ID scheme does not mean what the pattern assumes for that era. | Coverage of the intended season. | Re-resolve IDs from the schedule source; do not count the response toward the intended season. |

**Decision rule for the tower:** the era mask stays 0 for every
season until its probe game returns "200 with coords." A
"200 without coords" season is not a partial tower — it is a
different source class (events only), and the shotpos family
stays masked there unless another source (BBR/ESPN/
ShotChartDetail) covers it. Five games answer the era question
in outline; they do not authorize a backfill — a backfill
starts only after the era table is filled AND the game-list
resolution (all 1,230 regular-season IDs per season) is
verified for at least one full season.

## 3. The 403 problem — legitimate routes, and what is off-limits

### 3.1 Route table

| Route | Legitimacy / status | What it can actually do |
|---|---|---|
| **Alienware via the Forge lane** (standing pick) | LEGITIMATE, first choice. A different machine with (presumably) clean NBA access; the standing verdict (2026-10-11) names it as the collection machine. | Run the §2.2 probe and any authorized backfill from there. The 5 existing files' fetching machine is unrecorded, so Alienware access itself is still UNVERIFIED — the probe is also the access test. |
| **Mac (fallback)** | LEGITIMATE, second choice. Same standing verdict. | Same as Alienware if the Forge lane is down. |
| **api.nba.com stats-capture host** (from a clean machine) | LEGITIMATE — it is the measured source host; using it is using the feed, not evading a block. | The §2.2 probe host. If it serves history, it is the cleanest join (native NBA PLAYER_IDs, coordinates, §1). |
| **stats.nba.com stats API** (from a clean machine, after ToS review) | CONDITIONAL — technically the same class of endpoint, but the stats_nba stub records a ToS caveat: stats.nba.com terms restrict automated access to stats endpoints. A working technical path does NOT clear the gate alone. | ShotChartDetail (per-player-season coordinates) and playbyplayv2 (historical event text). ToS review must precede any fetch wiring. |
| **BBR / ESPN snapshots** (already working from Hatch) | LEGITIMATE, proven. One-date prototypes exist (545 / 546 records, 2026-10-20). | Fallback shot-location corpus for recent seasons; cross-check source (RQ-6). Join-key cost: BBR/ESPN IDs are not NBA PLAYER_IDs (registry resolution required). |
| **Official / granted access** (NBA publishes an open endpoint, or grants this project's egress) | LEGITIMATE, and the stub's named re-probe trigger. | Would re-open cdn.nba.com for a single plain-GET probe. Until then, cdn stays gated. |
| **Third-party mirrors / aggregators** | UNVERIFIED — no mirror was found in-repo or verified in this pass. | Do NOT assume any mirror carries coordinates, covers history, or is licensed for this use. A mirror enters the plan only after its own probe (coordinate presence + era coverage + rights note), like any other source. Naming a specific mirror here without that probe would be invention. |
| **Replays as a source** | LEGITIMATE but LOSS-Y and ZERO-GAIN (see §4). | Fallback if the PBP cache were lost; adds no new games. |

### 3.2 What the 403 is, precisely

- cdn.nba.com: HTTP 403 "Access Denied" served by Akamai Bot
  Manager, in ~0.5 s, fingerprint/behavior-based edge
  enforcement — not a missing resource, not rate limiting, not
  a transient error. No backoff helps.
- stats.nba.com `/stats/*`: a different mechanism — HTTP 000
  tarpit (TCP/TLS handshake never completes) while the site
  root returns 200. Path-level bot-drop, not a generic outage.
- Neither mechanism is throttling, so "wait and retry" is not
  a strategy on either host from Hatch.

### 3.3 Explicitly OFF-LIMITS under the no-evasion rule

These were not attempted in this pass and must not be attempted
as workarounds (per the standing verdict, the nba_cdn stub, and
the stats_nba stub — all three agree):

- Header rotation (cycling User-Agents / headers to look like
  different clients).
- Residential egress / proxy rotation / IP rotation of any kind.
- Headless-browser workaround (driving a browser to pass the
  bot check and scraping behind it).
- Fingerprint spoofing, bot-manager bypass tooling, or any
  "make the request look human" technique.
- Retry storms / hammering a 403 or 000 endpoint from Hatch
  in hopes it flips.
- Re-probing cdn.nba.com on a timer: at most quarterly, or on
  a concrete announcement (open endpoint, granted egress).
  The last probe was 2026-10-21; the next is due no earlier
  than ~2027-01-21 absent an announcement.
- Presenting a workaround success as legitimate collection:
  if a path only works by evasion, it is not a collection
  path, and its data does not enter the tower.

**What IS allowed:** a single plain GET with a standard UA
on a posture change or at the quarterly cadence; moving the
work to a machine with clean access (Alienware/Mac); using a
different, unblocked host (api.nba.com) as the feed itself;
and using sources that work from Hatch (BBR/ESPN) for what
they cover.

## 4. Lineage of the 6 existing replay files

### 4.1 What the files are

`assets/replays/` holds 5 game files + `index.json` (340 KB
total, measured): `0022600001`, `0022600002`, `0022600003`,
`0022600085`, `0022600086` — exactly the 5 game IDs in
`pipeline/cache/cdn_pbp/`. The game files are 62–72 KB each;
`index.json` (1,376 bytes) lists the 5 games with date, teams,
score, periods, and final flag. All 5 are `final: true`.

### 4.2 How `pipeline/build_replays.py` builds them

The script header states it plainly: it reads the cached PBP
JSON and writes "compact events, lineups and teams for
replay.js" plus the game-list index. Stdlib only; `--check`
fails if committed files differ from a fresh build; `--min-age
24` (default) builds newborn games but excludes games younger
than 24 hours from `index.json` (the 24h live/replay rule) —
all 5 measured games are past that window, so all 5 are
indexed.

Transform steps (read from the code, not inferred):

1. **Sort** actions by (period, −clock, orderNumber) — the
   feed's file order is not trusted.
2. **Sides:** infer which teamId is away (0) vs home (1) from
   which score moves on that team's points; fall back to the
   complement if only one side is observed. If both sides
   cannot be determined, the game is skipped (`return None`).
3. **Teams/players:** tricodes from actions; colors from
   `docs/live-recon/team_map.json` (with an alias map:
   GSW→GS, NOP→NO, NYK→NY, SAS→SA, UTA→UTAH, WAS→WSH);
   players from `playerNameI` on actions with a personId.
4. **Lineups (RECONSTRUCTED, not feed data):** starters =
   on-court players whose first action is not a "substitution
   in"; substitutions then move players in/out, with a repair
   heuristic (if the feed shows a player acting while not in
   the reconstructed lineup, evict the least-recently-seen
   player and insert him). Lineup snapshots are recorded only
   when all 10 slots are filled. These lineups are the
   builder's inference — they are not a feed field.
5. **Events:** one compact positional array per action, in
   the builder's 14-field order (see §4.3). Clock is converted
   from `PT…M…S` to seconds (rounded to 0.1 s). Shot x/y are
   converted from 0–100 to feet (`x/100*94`, `y/100*50`,
   rounded to 2 decimals) and kept ONLY for field goals.
6. **Self-check:** for every FG action, compare the distance
   from the converted point to the nearer rim against the
   feed's `shotDistance`; report median/p95 error in the
   file's `check` block. All 5 files report 0.0 / 0.0 — the
   conversion is exact to the reported precision (independently
   recomputed in this pass: median 0.0002 ft on game 1).
7. **Index:** games sorted by (date, gameId) descending, with
   team tri/short/colors; the `staged` disclaimer string is
   carried into the index note.

The script's own header is explicit about what is staged:
"Every event, clock, score, shooter and shot location comes
from the feed. The positions of the other nine players are
not in any public feed, so replay.js stages them from
formation templates." **The replay files contain no
non-shooter positions at all** — those are staged client-side
by replay.js (from formation templates, or from a coordinate
model trained on 2015-16 SportVU tracking, per the file's
`staged` field). A replay file is therefore not tracking data
in any sense, and its `lineups` are reconstructed, not
measured.

### 4.3 What survives into replays (field mapping)

Replay event = 14 positional fields:
`[period, clock, type, sub, team, person, x, y, away, home,
made, desc, poss, rightSide]`, where `type` is an index into
the builder's `TYPES` list (2pt, 3pt, freethrow, rebound,
turnover, steal, block, foul, substitution, timeout,
jumpball, violation, period, game, other), `team` is the
0/1 side index (not teamId/tricode), `person` is the NBA
PLAYER_ID (0 when the action has no player in the players
map), `x`/`y` are feet (2-decimal), `made` is 1/0/None from
`shotResult`, `desc` is the feed description verbatim, and
`rightSide` is 1/0/−1 from `side`.

Survives: event count (593/628/667/629/635 — identical to
PBP action counts), period, clock (as seconds), action
type + subType, side, shooter personId, shot location in
feet, scores, made/missed, description text, possession
side, shot side. The `check` block (shot count, distance
error median/p95) and `sourceSha256` (sha256 of the source
PBP bytes) also survive as provenance.

### 4.4 What is LOST in the replay transform — why replays cannot backfill PBP

Everything in the 54-key PBP action that is not in the
14-field event is gone:

- **Lost outright:** `xLegacy`/`yLegacy`, `shotDistance`
  (recomputable from x/y to <0.001 ft — the one loss that
  does not matter), `actionNumber`, `orderNumber`,
  `shotActionNumber`, `timeActual`, `edited` (all wall-clock
  timing — a replay event has game clock only, no real
  timestamp), `teamId`/`teamTricode` (only the 0/1 side
  survives; the team identity lives in the file's `teams`
  block, not per event), `playerName`/`playerNameI`
  (only the ID survives; names live in the `players` map),
  `personIdsFilter`, `periodType`, `isFieldGoal` flag
  (recoverable from type ∈ {2pt, 3pt}), `isTargetScoreLastPeriod`,
  `officialId`, `descriptor`.
- **Lost second actors:** every assist/block/steal/foul-drawn/
  jump-ball personId and name. A replay file cannot tell you
  who assisted a basket, who blocked a shot, or who drew a
  foul — the `players` map has names, but the per-event
  links are gone.
- **Lost running totals:** `pointsTotal`, rebound totals,
  `turnoverTotal`, foul totals — all gone.
- **Lost context flags:** `qualifiers` (fastbreak /
  fromturnover / 2ndchance / pointsinthepaint / inpenalty /
  freethrow-count qualifiers) — gone as structured data. The
  `desc` text sometimes hints at them ("Fast Break" is not
  in the description text; do not parse prose as a substitute
  for the qualifier field).
- **Lost precision:** x/y rounded to 2 decimals in feet
  (sub-millimetre in practice — negligible, but it is a
  lossy step, and the original 0–100 values with full float
  precision are gone).
- **Added, not feed data:** `lineups` (reconstructed with a
  repair heuristic — §4.2 step 4) and the `staged` disclaimer.
  Treating reconstructed lineups as feed truth would be a
  category error.

**Verdict on replays as a backfill source:** they can serve
as a *fallback shot-location source* for exactly the 5 games
they cover — shooter, feet coordinates, made/missed, clock,
period, score, subType all survive, which is sufficient for
the shotpos tower's per-shot inputs for those games. They
cannot serve as a PBP backfill: all second-actor links,
qualifiers, totals, and timestamps are destroyed, and —
decisively — they cover zero games beyond the PBP cache.
A backfill sourced from replays would be a lossy copy of
5 games, not 5 games plus anything. If the PBP cache were
lost, rebuild the tower inputs from replays with the loss
list above attached; do not present replay-derived rows as
PBP rows.

**One more provenance gap (MEASURED):** no fetcher script for
the PBP cache exists in the repo — `grep` over pipeline/docs
finds `statscapture` only inside the cached files' own
`meta.request` strings. Who fetched the 5 files, from which
machine, with what headers, is unrecorded. The §2.2 probe
should be run with its machine, command, and response
headers logged, so the next investigator does not inherit
this gap.

## 5. Volume model — per-game counts and full-season extrapolation

### 5.1 Measured per-game counts (5 games, 2026-10-20/21, all 4 periods, no OT)

| Game | Actions | FG actions | Free throws | Substitutions | PBP file bytes | Replay file bytes |
|---|---|---|---|---|---|---|
| 0022600001 | 593 | 174 | 53 | 134 | 417,668 | 62,153 |
| 0022600002 | 628 | 183 | 54 | 130 | 439,313 | 64,111 |
| 0022600003 | 667 | 188 | 45 | 184 | 467,457 | 72,049 |
| 0022600085 | 629 | 175 | 75 | 126 | 447,162 | 66,334 |
| 0022600086 | 635 | 177 | 64 | 156 | 446,015 | 66,886 |
| **Mean** | **630.4** | **179.4** | **58.2** | **146.0** | **443,523** | **66,307** |
| **Range** | 593–667 | 174–188 | 45–75 | 126–184 | 417,668–467,457 | 62,153–72,049 |

Totals (MEASURED): 3,152 actions, 897 FG actions, 2,217,615
bytes PBP (2.11 MB as reported), 331,533 bytes replays.
FG share of actions: 28.5%. Every FG action carries
coordinates (897/897) — the coordinate yield per game is the
FG count itself, not a fraction of it.

### 5.2 ESTIMATE — full-season corpus at the measured rate (extrapolated, NOT measured)

Assumptions, stated so the estimate can be re-derived:
1,230 regular-season games per season (30 teams × 82 games
÷ 2); per-game rates equal to the 5-game means above; raw
JSON stored uncompressed, same shape as the measured files.
Playoffs excluded from the headline number (see below).

| Corpus | Actions | FG actions (coordinate-bearing) | Raw PBP bytes |
|---|---|---|---|
| 1 game (mean) | 630 | 179 | ~433 KiB |
| 1 regular season (1,230 games) | ~775,000 (range 729,000–820,000 at the observed per-game range) | ~221,000 (range 214,000–231,000) | ~519 MB (range ~501–566 MB) |
| 30 regular seasons (1996-97…2025-26) | ~23.3 M | ~6.6 M | ~15.6 GB |
| Same 30 seasons as replay files (lossy, §4) | ~23.3 M events | ~6.6 M with coords | ~2.4 GB |

Playoff add-on (same rate, ~85 games/season): ~+54,000
actions, ~+15,000 FG actions, ~+36 MB per season — about
+7% on the regular-season figures. Preseason/Cup games would
add further, and are excluded from the tower's grain
(regular-season only) in any case.

**Why this is an estimate, not a measurement — read before
quoting it:**

- n = 5 games, all from opening week of one season, all
  4 periods, no overtime. Overtime games carry a 5th+ period
  (~60–130 extra actions each); pace, foul rates, and
  substitution counts vary by team, era, and game state.
  The observed per-game range (593–667 actions) is a
  5-game range, not a population range — the true range is
  wider, and era effects (pace was lower in the late 1990s
  and mid-2000s; substitution patterns changed) push early
  seasons below the 2026 rate. Treat the 30-season ~15.6 GB
  as an order-of-magnitude planning number (±30% at least),
  not a quota.
- The estimate assumes the feed serves history at all —
  which §2 says is UNVERIFIED. If the §2.2 probe returns
  404/200-without-coords for pre-2013 seasons, the
  coordinate-bearing corpus shrinks to the verified eras
  only, and the 6.6 M FG figure falls proportionally.
  Do not quote "6.6 M historical shots available" — quote
  "6.6 M FG actions IF all 30 seasons served with
  coordinates at the 2026 rate, which is unproven."
- Storage is the cheap part: at ~519 MB/season raw, even
  the 30-season figure fits on any single disk. The binding
  constraints are access (the 403/000 gates), ID resolution
  (1,230 correct game IDs per season), and QA (per-game
  action-count sanity, coordinate-presence checks) — not
  bytes. Compressed (gzip) storage would cut the raw figure
  roughly 5–10×, but compression was not measured here and
  is not claimed.

### 5.3 Sanity model for a future backfill (what "normal" looks like per game)

A backfill QA gate can use the measured ranges as its first
pass (to be widened once OT games and more seasons are
measured):

- Actions/game: expect ~630, flag < 500 or > 800 for review
  (OT games legitimately exceed the top of the measured
  range — flag, do not reject, and record periods > 4).
- FG actions/game: expect ~179, flag < 150 or > 210.
- FG coordinate presence: expect 100% (897/897 measured).
  Any game below 100% is a data defect or a different feed
  vintage — quarantine, do not silently drop the missing
  shots (dropping them biases zone shares).
- Free throws/game: 45–75 in the sample; substitutions/game:
  126–184. Wide ranges — use as smoke signals, not gates.
- File size/game: ~418–467 KB raw PBP; a file far outside
  that band (for a 4-period game) suggests truncation or a
  different schema version.

## 6. Verdicts

VERDICT: PASS — cdn-PBP surface documented from measured files — ~/workspace/mlops-v2-drafts/data-deep-dive/cdn-pbp.md
VERDICT: BLOCKED — historical coverage of the stats-capture feed — ~/workspace/mlops-v2-drafts/data-deep-dive/cdn-pbp.md
VERDICT: BLOCKED — cdn.nba.com access from Hatch (403, Akamai) — ~/workspace/mlops-v2-drafts/data-deep-dive/cdn-pbp.md
VERDICT: PASS — replay lineage and loss inventory — ~/workspace/mlops-v2-drafts/data-deep-dive/cdn-pbp.md
VERDICT: PASS — per-game volume model with extrapolated season estimate — ~/workspace/mlops-v2-drafts/data-deep-dive/cdn-pbp.md

# TRACKING DATA — Vector Hoops data-collection deep dive

**Lane:** tracking-data investigator · **Date:** 2026-10-26 · **Status:** READ-ONLY
investigation. No bulk fetch, no live-checkout write, no training, no prod write.
No live probe was run from this VM: stats.nba.com PlayerTracking is documented
in-repo as Akamai-403-blocked from datacenter IPs (see §0), so the "exact probe"
for each open claim is specified for the clean machine instead of faked here.

**Ground truths carried in (not re-derived):** `tracking_*` = `leaguedashptstats`
aggregates, 13 seasons 2013-14…2025-26 only, pre-2013 structurally absent, masked
never backfilled, contract family observed rate 0.463. `wide_skills_*` = hustle/
defense + synergy slices, 11 files 2015-16…2025-26 only. Tracking aggregates are
MOVEMENT data, not shot coordinates and not trajectories (SHOT_POSITION.md §2.6).
The panel's hard truth stands: no continuous per-frame trajectories at scale are
documented anywhere in the brief — aggregates ≠ trajectories, PBP gives discrete
events not paths, so H-JEPA's fine level is an event-location predictor until a
trajectory source is inventoried.

**Sources read before writing:** SOURCES.md §3 (tracking rows), INVENTORY.md §1.1
(cache table), SHOT_POSITION.md §2.6 + §6 (mask-as-era-signal), Lane 10
INVENTORY_GAP_REPORT.md §3–§4 (PBP x/y vs ShotChartDetail LOC_X/LOC_Y), and the
fetch scripts + caches themselves in `~/workspace/vector-hoops-mlops-v2/pipeline/`.

## 0. Access caveat that governs every "PUBLIC" claim below

`fetch_advanced_tracking.py` (docstring, in-repo) states stats.nba.com
PlayerTracking requires a residential (non-datacenter) IP and that a 403/log-block
must be logged as `blocked` with a local-GPU handoff marker. The "PUBLIC" tier in
§2 therefore means **publicly documented / served without a commercial licence
to a normal browser session** — not "fetchable from this VM today." Every
uncached endpoint below needs one clean-machine confirmation run before it is
treated as collectable. The one-request probe pattern is the same for all of them:

> On the clean machine, one `leaguedashptstats` (or named endpoint) request for
> season 2023-24, PerGame, Regular Season, with the full filter param set
> (minimal params → HTTP 500, per `fetch_wide_skills.py`), recording HTTP status,
> result-set name, and the exact header list. Compare headers against the
> "not cached" column claims in §1 before writing any new cache.

## 1. Cached-vs-public table: what NBA tracking aggregates exist

### 1a. `leaguedashptstats` — season aggregates, one row per player-season

The cache's tracking family is exactly 20 columns, fixed by `TRACKING_SPECS` in
`build_vectors.py` (verified: the 13 `tracking_*.json` files hold exactly these
20 keys, checked 2026-10-09 in-repo). Six `PtMeasureType` values feed them:

| PtMeasureType | Cached columns (20 total) | Public columns NOT cached (per nba_api PtMeasureType docs) |
|---|---|---|
| `SpeedDistance` | `DIST_MILES`, `AVG_SPEED` | `DIST_FEET`, `AVG_SPEED_OFF`, `AVG_SPEED_DEF` (offense/defense speed split) |
| `Drives` | `DRIVES`, `DRIVE_PTS`, `DRIVE_PASSES` | `DRIVE_FGA`, `DRIVE_FGM`, `DRIVE_FT_PCT` (+ FG% fields; exact header names to confirm on probe — see §0) |
| `CatchShoot` | `CATCH_SHOOT_FGA`, `CATCH_SHOOT_PTS`, `CATCH_SHOOT_FG3_PCT` | `CATCH_SHOOT_FGM`, `CATCH_SHOOT_FG_PCT`, `CATCH_SHOOT_EFG_PCT`, catch-and-shoot 3PA (in-repo note in `build_vectors.py`: the cache carries no catch-and-shoot 3PA) |
| `PullUpShot` | `PULL_UP_FGA`, `PULL_UP_PTS` | `PULL_UP_FGM`, `PULL_UP_FG_PCT`, `PULL_UP_EFG_PCT`, `PULL_UP_FG3A` (the last is cached separately in wide_skills as `pull_up_fg3a`, not in tracking) |
| `Possessions` | `TOUCHES`, `FRONT_CT_TOUCHES`, `TIME_OF_POSS`, `AVG_SEC_PER_TOUCH`, `PAINT_TOUCHES`, `POST_TOUCHES`, `ELBOW_TOUCHES` | `AVG_DRIB_PER_TOUCH`; touch-point outcomes (`ELBOW_TOUCH_FGA/FGM/FG_PCT`, `POST_TOUCH_*`, `PAINT_TOUCH_*` — these appear as separate `ElbowTouch` / `PostTouch` / `PaintTouch` measures in current nba_api parameter docs, i.e. the API's measure split has moved since the cache was built; the probe in §0 must record which measure actually returns them today) |
| `Passing` | `PASSES_MADE`, `POTENTIAL_AST`, `SECONDARY_AST` | `PASSES_RECEIVED`, `AST_PTS_CREATED` |

Two further `PtMeasureType` values are public but have **no columns at all** in the
tracking cache (they were fetched by the separate `fetch_advanced_tracking.py`
into `advanced_tracking_*.json`, of which **zero files exist on disk** — that
script's output was never landed):

| PtMeasureType | What it carries (nba_api docs) | Cached? |
|---|---|---|
| `Defense` | Rim defense (`DEF_RIM_FGA`, `DEF_RIM_FG_PCT`), `CONTESTED_SHOTS`, `CONTESTED_SHOTS_2PT`, `CONTESTED_SHOTS_3PT` | NO — not in `tracking_*`, not in `wide_skills_*` (wide keeps only the hustle endpoint's aggregate `CONTESTED_SHOTS`, not the 2PT/3PT split) |
| `Rebounding` | `REB_CHANCES`, `REB_CHANCES_OFF`, `REB_CHANCES_DEF`, `REB_CONTEST_OFF`, `REB_CONTEST_DEF` | NO — nowhere in the cache |
| `Efficiency` (nba_api docs list it as a PtMeasureType) | `PIE`, `PACE`, `W`, `L`, `W_PCT`, `MIN` — not movement data at all | NO, and NOT tracking — do not add it to a tracking family; it duplicates box-score fields |

**Contradiction to resolve on probe (do not paper over):** `fetch_wide_skills.py`
states the Defense measure "does not return D_FG_PCT under that name" and that
`d_fg_pct` is 0.0 for every player of every cached season — it was never measured
and is listed in every wide_skills doc's `untracked_fields`. The separate
`leaguedashptdefend` endpoint (player-vs-defender, by `DefenseCategory`) DOES
document `D_FGM` / `D_FGA` / `D_FG_PCT` / `NORMAL_FG_PCT` / `PCT_PLUSMINUS` headers.
So "defended FG%" exists publicly, but under a different endpoint with a
different grain (defender-category rows, not one row per player). The probe must
not conflate the two.

### 1b. `leaguehustlestatsplayer` — hustle/defense aggregates

Cached in `wide_skills_*` (11 seasons, 2015-16…2025-26) as 6 fields:
`screen_ast`, `deflections`, `loose_balls`, `charges`, `box_outs`,
`contested_shots`, plus `d_fg_pct` = None always (never measured, §1a).
Public columns from the same endpoint that are NOT cached:

| Not cached | Why it matters |
|---|---|
| `SCREEN_AST_PTS` (points off screen assists) | The cached `screen_ast` counts screens; the points version is the value-weighted twin |
| `CONTESTED_SHOTS_2PT`, `CONTESTED_SHOTS_3PT` | Cached value is the aggregate only; the split is the closest public proxy for "where the defender contests" |
| `OFF_LOOSE_BALLS_RECOVERED`, `DEF_LOOSE_BALLS_RECOVERED`, `PCT_LOOSE_BALLS_RECOVERED_OFF/DEF` | Cached value is the total only; the split separates offensive vs defensive hustle |
| `OFF_BOXOUTS`, `DEF_BOXOUTS`, `BOX_OUT_PLAYER_REBS`, `BOX_OUT_PLAYER_TEAM_REBS`, `PCT_BOX_OUTS_*` | Cached value is total box-outs only; the rebound-conversion columns say whether box-outs turned into boards |
| Per-game vs Totals: the cache uses PerGame only | Totals mode is the same endpoint, same seasons — a free second grain, never fetched |

**Hustle era fine print (from `hustle_coverage.py`, measured, not assumed):**
2015-16 hustle values are per-game averages over 1–2 tracked games from 15 teams
only, and are deliberately nulled in the repaired caches — the honest
hustle era starts **2016-17**, not 2015-16. `box_outs` is 0 for every player in
2015-16 and 2016-17 and is only tracked from **2017-18**. Any "11 seasons of
hustle" claim that includes 2015-16 box-outs is false; the file count (11) is not
the measured-season count (10 for hustle, 9 for box-outs).

### 1c. `synergyplaytypes` — play-type aggregates (inside wide_skills, partly)

Cached: `Postup` and `Transition` only (`post_freq`, `post_ppp`, `trans_freq`,
`trans_ppp`). Public play types NOT cached, same endpoint, same seasons
(2015-16+): `Isolation`, `PRBallHandler`, `PRRollman`, `Spotup`, `Handoff`,
`Cut`, `OffScreen`, `OffRebound` (putbacks), `Misc` — each returning `POSS_PCT`,
`PPP`, `FG_PCT`, `EFG_PCT`, `POSS`, `PTS`, `FGM`, `FGA` and more per the hoopR
docs. These are **event-type aggregates, not positions**, but they are the
closest public stand-in for "what kind of possession a player ends" and the
cheapest uncached expansion available: one endpoint, already-proven fetch path,
no new licence. Defensive grouping (`TypeGrouping=Defensive`) for the same play
types is likewise public and unfetched.

### 1d. Other public tracking-adjacent endpoints, none cached

| Endpoint | Grain | What it adds over §1a–§1c |
|---|---|---|
| `boxscoreplayertrackv3` / `boxscoreplayertrackv2` | Per-game | The SAME speed/distance/touches/drives aggregates at game grain — i.e. a per-game movement series exists publicly. The cache holds only season means. This is the finest public time resolution for tracking aggregates, and it is entirely uncached. |
| `boxscorematchupsv3` (matchups) + `leagueseasonmatchups` | Per-game / per-season, per offensive-defensive pairing | Matchup minutes, partial possessions, switches, matchup FG%/points/assists/turnovers/blocks, help-defense blocks. This is the ONLY public source for "who guarded whom" — but as pairing aggregates, not per-possession assignments and not positions. |
| `playerdashptpass`, `playerdashptreb`, `playerdashptshots`, `playerdashptshotdefend`, `teamdashpt*` variants | Per-player splits (by shot clock, dribble range, touch time, close-defender distance, etc.) | Finer splits of the same aggregates (e.g. shots by dribbles / touch time / defender distance). Public, unfetched, still aggregate — they narrow the gap to "where" slightly, they do not close it. |
| `leaguedashplayershotlocations` / `playerdashboardbyshootingsplits` | Zone aggregates | Shot-location ZONES (restricted area / paint / mid / corner 3 / above-break 3) as season aggregates — the public zone layer that sits between shotmix type shares and per-shot coordinates. Relevant to the shotpos tower, not to trajectories. |

## 2. Second Spectrum / NBA tracking infrastructure — access-tier table

| Item | Tier | Evidence |
|---|---|---|
| Season aggregates on stats.nba.com (`leaguedashptstats`, `leaguehustlestatsplayer`, `synergyplaytypes`, matchup + boxscore-track endpoints) | PUBLIC | Served on nba.com/stats without a licence; fetched by this project's own scripts via `nba_http` (curl_cffi) through 2025-26. Caveat: residential-IP Akamai gating from datacenter IPs (§0) — public ≠ fetchable from this VM. |
| Per-game tracking aggregates (`boxscoreplayertrackv3`) | PUBLIC | Same stats.nba.com surface, per-game grain. Unfetched by this project, not paywalled. |
| ShotChartDetail per-shot coordinates (`LOC_X`/`LOC_Y`) | PUBLIC (uncollected, era boundary unknown) | Public endpoint; Lane 10 measured 0 rows in cache and RQ-1 (earliest season returning rows) still unanswered. Public availability ≠ known era coverage. |
| stats-capture PBP x/y (`api.nba.com/statscapture/games/{id}/playbyplay`) | PUBLIC (event-level only) | Cached 5 games of 2026-27 carry per-action `x`/`y` (+ `xLegacy`/`yLegacy`) — but only for actions that HAVE a location (shots etc.); most actions carry null. This is a discrete-event coordinate, not a trajectory. Historical availability unverified (Lane 10: 0 historical seasons). |
| SportVU raw per-frame feed (25 Hz x/y per player + x/y/z ball), 2013–2016 public window | PUBLIC (dead) | Was freely served on NBA.com; taken down 2026-01-23… — precisely: taken down **23 Jan 2016** per the Beuoy/Kaggle dataset notes (the year in the note is 2016, not 2026). Survives only in mirrors (§4). No live endpoint. |
| Second Spectrum optical tracking feed (25 Hz dots, all arenas, 2017-18 onward as official provider) | PARTNER-ONLY | Official NBA optical provider 2017-18 (replacing SportVU); Genius Sports acquired Second Spectrum (2021, ~$200M) and extended the NBA contract as "Official NBA Team Basketball Analytics Provider" — services "to all 30 NBA teams." No public endpoint, no public price, no self-serve tier found. |
| Hawk-Eye 3D pose (14 cameras, 29 keypoints/player, from 2023-24 league-wide) | PARTNER-ONLY | NBA–Sony Hawk-Eye deal from 2023-24: 3D optical tracking + pose for officiating and team analytics; Sportradar (exclusive data provider) works alongside Hawk-Eye to generate tracking datasets. Fan-facing output is broadcast graphics only; the pose feed itself is not public. |
| "Dragon" mesh data (Second Spectrum + NBA next-gen platform) | PARTNER-ONLY | Announced as R&D ("in select NBA arenas") synthesising "millions of on-court basketball data points" into mesh data. No public data, no public API, no release date found. Treat as vapour for planning until a team/league source says otherwise. |
| Sportradar NBA data feeds (official distribution partner) | PAYWALLED | Exclusive NBA data-distribution partner; enterprise pricing (industry reporting puts research tiers at $10k+/yr; no verified NBA tracking price found — do not quote a number). A paid route to low-latency event + tracking-derived data, NOT to raw per-frame coordinates (those stay team/league). |
| Synergy Sports full play-type + video platform | PAYWALLED | The NBA.com slice (POSS_PCT/PPP per play type) is public; Synergy's full logged-play + clip database is subscription-only (Nylon Calculus notes the public data "only looks at scoring, not passing to others"). |
| Broadcast-video-derived tracking (computer-vision re-tracking from League Pass / broadcast) | UNKNOWN (legal + quality risk) | Technically feasible (Second Spectrum itself started from camera feeds) but: no verified public pipeline, broadcast rights prohibit redistribution, and re-tracked coordinates would be a NEW measurement with its own error — it could not be presented as NBA tracking data. Kill for the honest-data build unless counsel + a validated pipeline exist. |
| Academic / team-private tracking datasets (e.g. the 233-game 2011-12 SportVU sample used in crash/transition research) | PARTNER-ONLY / UNKNOWN | Described in published papers but not released as data. Citable as methods precedent, not usable as training input. |

## 3. Fine-level gap list: aggregates → what H-JEPA's fine level needs

H-JEPA's fine level, as charged, predicts **future player locations** — that needs
positions as a time series, not season means. Gap by gap:

| # | What the fine level needs | What we have | Any public source? |
|---|---|---|---|
| G1 | Per-frame trajectories: (x, y) per player + (x, y, z) ball at ~25 Hz for full games | Nothing at scale. Only season aggregates (§1) + 5 games of event PBP x/y. | YES, but tiny + frozen: ~600 games of 2015-16 SportVU mirrors (§4, KEEP with limits). No current-season equivalent. |
| G2 | Off-ball positions at event time (where the other 9 players were when a shot/pass happened) | Nothing. Aggregates collapse all off-ball movement into DIST_MILES / AVG_SPEED means. ShotChartDetail gives the SHOOTER's location only. | Only inside the G1 mirrors (full 10-player moments) and StatsBomb-style freeze frames — which do not exist for NBA. |
| G3 | Defensive matchup assignment per possession (who guarded whom, when switches happened) | Season/game pairing aggregates (`boxscorematchupsv3`, §1d): minutes + FG% per pairing, no timestamps. | PARTIAL: matchup aggregates are public and uncached — they answer "how much did A guard B" but never "where was B at t=3.2s." Per-possession assignment: NO public source. |
| G4 | Speed / acceleration SERIES (velocity and acceleration as functions of time, not means) | Season means only: `AVG_SPEED`, `AVG_SPEED_OFF/DEF` (uncached), `DIST_MILES`. No max speed, no acceleration, no time series anywhere public. | NO. Even the SportVU mirrors would need speed/acceleration DERIVED from differenced positions (feasible — positions are 25 Hz — but that is a derived quantity from a 2015-16 sample, not a public series). |
| G5 | Ball trajectory (flight path, release point, bounce) | Shot coordinates give release/shot location per shot (ShotChartDetail, uncollected) or per event (PBP x/y). No flight path. | PARTIAL: Beuoy shooting-motion trajectories give a MODELLED typical 3-D ball path per player (LOESS-smoothed, 2013–2016, 190 top 3-PT shooters) — a shape prior, not per-shot data. Per-shot ball flight: NO. |
| G6 | Body pose / orientation (facing, limb positions — the Hawk-Eye 29-point layer) | Nothing. | NO public source. Partner-only (§2). |
| G7 | Court-location time series at possession grain (e.g. positions at pass, screen, cut — not just at shot) | Nothing. PBP x/y covers shot-like actions; passes/screens/cuts carry no coordinates in the cached feed. | NO, except inside G1 mirrors (positions exist for every moment, so possession-grain slices are derivable — again, 2015-16 only). |
| G8 | Multi-season trajectory coverage matching the 30-season matrix | Nothing. Trajectories exist, at best, for one season (2015-16) and a 2013–2016 modelled subset. | NO. This is the scale killer: even a perfect 2015-16 trajectory model cannot be trained as a 30-season fine level without an era-transfer claim that has no evidence. |

**Bottom line for §3:** the ONLY fine-level need with a public answer is G1/G2/G7
inside a frozen 2015-16 sample, and G3/G5 partially via aggregates. Everything
else is partner-only or nonexistent. The panel's verdict — fine level =
event-location predictor — is not a conservative framing; it is the ceiling the
public data imposes.

## 4. Trajectory-source hunt — keep/kill verdicts

| Candidate | What it actually is | Verdict | Exact verifying probe (clean machine, one request each) |
|---|---|---|---|
| neilmj `BasketballData` / sealneaward `nba-movement-data` (~600 games, 2015-16, raw SportVU JSON: `events[].moments[]` = 25 Hz `[team_id, player_id, x, y, radius]`, x 0–94 ft, y 0–50 ft) | The ONLY public per-frame NBA trajectory corpus at scale (one season, ~half the schedule). Mirrors of the pre-Jan-2016 public feed. | **KEEP — as the sole trajectory pilot corpus, with hard limits:** 2015-16 only, ~600/1230 games, no post-2016 seasons, provenance = community mirror of a dead official feed (licence UNVERIFIED — confirm before any published use). Use it to PROVE the fine-level architecture on one season; it cannot support a 30-season fine level or a current-season demo. | Fetch ONE archive (e.g. `12.23.2015.SAS.at.MIN.7z` → game `0021500431.json`): confirm `events[0].moments` length ≈ 25× event seconds, 11 rows per moment (ball + 10 players), x/y ranges 0–94 / 0–50. If the repo is gone or archives fail to extract, verdict flips to KILL. |
| Kaggle "NBA Player Shooting Motions" (Beuoy, via inpredictable.com) | MODELLED typical 3-D shot trajectories (LOESS, per player, 190 top 3-PT shooters, 2013–2016) + player-level shot-motion metrics. NOT raw tracking. | **KEEP — as a shape prior only.** Useful to sanity-check a ball-flight model or to illustrate shooting form; never as per-shot or per-possession training rows (each "trajectory" is an average over ≥200 shots). | Download the Kaggle dataset listing only: confirm `path_detail` rows are per-player typical paths (not per-shot) and the 2013–2016 window. If it turns out to contain per-shot paths, upgrade — do not assume it. |
| stats-capture PBP coordinate fields (`x`, `y`, `xLegacy`, `yLegacy` per action) | Event-level coordinates on the live feed, already cached for 5 games of 2026-27. | **KEEP — for the event-location predictor (rung 1), KILL as a trajectory source.** Coordinates exist only where the action has a location; they are sparse in time and carry no off-ball positions. The open question is historical depth, not existence. | One request: `https://api.nba.com/statscapture/games/{historical-game-id}/playbyplay?Format=json` for a 2024-25 game id: record whether it serves at all and what fraction of actions carry non-null x/y. (Pattern copied verbatim from the cached 2026-27 files' `meta.request` field.) |
| ShotChartDetail `LOC_X`/`LOC_Y` | Per-shot shooter coordinates, public endpoint, era boundary unknown (Lane 10 RQ-1). | **KEEP — for the shot tower, not for trajectories.** One point per shot, shooter only, no time series. Its value to the fine level is as the PREDICTION TARGET (next-shot location), not as input trajectories. | Lane 10 RQ-1 probe as specified in SHOT_POSITION.md §3 (one request per sampled season, fixed high-volume player). Do not duplicate here. |
| Per-game tracking aggregates (`boxscoreplayertrackv3`) | Game-grain season-aggregate twins (speed, distance, touches, drives per game). | **KEEP — as the finest public time resolution for aggregates.** A per-game movement series is a legitimate intermediate fine level (game-to-game, not frame-to-frame) and is entirely uncached — the cheapest real expansion in this file. | One request for one 2023-24 game: confirm the result set returns per-player speed/distance/drives rows (not season aggregates). |
| Broadcast-video re-tracking (own CV pipeline on League Pass / broadcast video) | Would produce trajectories, but from a source we do not own and cannot redistribute. | **KILL for this build.** Legal risk + unvalidated measurement error + no evidence it matches official tracking. Revisit only with counsel sign-off and a validation study against the 2015-16 mirrors. | None — do not probe by scraping video. |
| Second Spectrum / Hawk-Eye / Dragon feeds, Sportradar tracking | The real thing, at full scale and current. | **KILL for this build (partner-only / paywalled).** No public or self-serve path found; pursuing it means a commercial conversation, not a fetch script. Record here so it is never re-proposed as "just fetch it." | None — a sales/licence inquiry is a business action, not a probe, and is out of this lane's read-only bounds. |
| Academic paper datasets (2011-12 233-game SportVU sample, Franks et al. defensive-position models, etc.) | Methods precedent on private data. | **KILL as data, KEEP as methods reference.** Cite the modelling approach (defender position as a function of man + ball); do not claim the data. | None — check the paper's data-availability statement only; if it names a repository, re-open. |
| Pixel sprite positions (Pixel Replay / Live mini-figures) | Animation, not measurement. | **KILL — already killed by contract §6 / SHOT_POSITION.md §2.6.** Listed here only so the hunt is exhaustive. | None. |

## 5. Era-mask consequences: tracking + wide-skills boundaries × shotpos mask

The three boundaries stack into a staircase, and the staircase IS the era signal:

| Era | tracking (2013-14+) | wide hustle (2016-17 honest) | box-outs (2017-18+) | synergy post/trans (2015-16+) | shotpos (boundary TBD, RQ-1) |
|---|---|---|---|---|---|
| pre-2013-14 | masked | masked | masked | masked | masked (assumed until RQ-1) |
| 2013-14…2014-15 | observed | masked | masked | masked | ? |
| 2015-16 | observed | nulled (partial 1–2-game values, deliberately None) | masked | observed | ? |
| 2016-17 | observed | observed | masked | observed | ? |
| 2017-18+ | observed | observed | observed | observed | ? (presumably observed) |

Consequences, each already foreshadowed by SHOT_POSITION.md §6 but sharpened by
the tracking/wide dates:

1. **The combined mask is a near-perfect era classifier, not just one family's
   mask.** SHOT_POSITION.md §6.1 warns that the shotpos mask alone ≈ "modern
   season." The tracking + hustle + box-outs staircase is worse: a model given
   all families can read the era off the mask PATTERN (which step of the
   staircase a row sits on) with more precision than any single mask. Within-
   season z-scoring removes era from the VALUES; it does nothing to the mask,
   and the MTNN input appends the mask as its own channel — so era leaks through
   the mask by construction.
2. **Lane 5 mask-ablation implication (binding for the eval design):** ablating
   ONE family at a time does not test era leakage, because the other families'
   masks still encode the staircase. The ablation must mask tracking AND
   wide-skills AND shotpos TOGETHER on a modern player and measure twin-era
   shift; and separately, mask them one at a time to attribute how much era
   signal each step contributes. A single-family ablation that shows "no era
   shift" proves nothing while the staircase stands.
3. **2015-16 is a trap season for hustle.** It LOOKS covered (11 wide_skills
   files) but its hustle fields are None by repair rule. Any analysis that
   treats 2015-16 as a hustle-observed season — or that imputes it from the
   partial 1–2-game values — reintroduces exactly the mask-value coupling the
   repair was built to prevent (mask = 1 exactly where the value is non-zero).
   The same warning applies in miniature to shotpos if RQ-2 finds zones extend
   further back than coordinates: per-column masks, not per-family masks
   (SHOT_POSITION.md §6.4).
4. **Cross-era twin quality is tiered, and the tiers must be surfaced.** A
   1998 player's twins are computed without tracking, hustle, or shotpos; a
   2014 player's twins have tracking but no hustle; a 2024 player's twins have
   everything. Twin lists across tiers are not equally evidenced (SHOT_POSITION.md
   §6.2) — and the tracking staircase means there are FOUR tiers, not two
   (pre-2013 / 2013-15 / 2015-17 / 2017+), before shotpos adds a fifth boundary.
   Any twin surface that does not label the tier is overstating old-era twins.
5. **The fine level inherits the worst boundary.** A trajectory model proven
   only on 2015-16 mirrors cannot be applied to pre-2013 rows at all (no
   trajectories, no aggregates to condition on) and cannot be validated on
   2017+ rows against any public trajectory ground truth. Its era mask is a
   single-season spike: observed for ~half of one season, masked everywhere
   else. If the fine level ever conditions on tracking aggregates, it must do
   so through the same mask discipline — never by imputing the staircase flat.
6. **What does NOT follow:** the boundaries do not justify dropping the
   families. SHOT_POSITION.md §6.1 is explicit: the tower is not removed to hide
   the effect. The correct response is the joint mask-ablation (§5.2) plus
   tier labelling (§5.4), not deletion of tracking/wide/shotpos inputs.

## 6. Cheapest real expansions (ranked, all public, none requiring a licence)

1. `leaguedashptstats` Defense + Rebounding measures for 2013-14…2025-26
   (closes the two whole-measure holes in §1a; same fetch path as tracking).
2. Uncached columns within already-fetched measures (speed off/def split,
   drive/catch/pull-up makes + percentages, `AVG_DRIB_PER_TOUCH`,
   `PASSES_RECEIVED`, `AST_PTS_CREATED`) — same requests, wider header keep-list.
3. Uncached hustle splits (`SCREEN_AST_PTS`, contested 2PT/3PT, off/def loose
   balls, box-out rebound conversions) — same endpoint, wider keep-list.
4. Remaining synergy play types (Isolation, PRBallHandler, PRRollman, Spotup,
   Handoff, Cut, OffScreen, OffRebound, Misc) + defensive grouping.
5. `boxscoreplayertrackv3` per-game aggregates — the only public move from
   season grain toward event grain without a licence.
6. `boxscorematchupsv3` pairing aggregates — the only public "who guarded whom"
   data; aggregate-only, label it as such.
7. 2015-16 SportVU mirror corpus — the only trajectory pilot; quarantined to a
   one-season architecture proof, licence unverified.

## Sources

- In-repo (measured 2026-10-26): `pipeline/build_vectors.py` TRACKING_SPECS
  (20 columns, 6 measures); `pipeline/fetch_advanced_tracking.py`
  (7 measures incl. Defense/Rebounding, residential-403 note, zero
  `advanced_tracking_*.json` on disk); `pipeline/fetch_wide_skills.py` +
  `pipeline/hustle_coverage.py` (hustle 2016-17 honest start, box-outs 2017-18,
  `d_fg_pct` never measured, 2015-16 partials nulled);
  `pipeline/cache/tracking_*.json` (13 seasons, 482–605 rows each);
  `pipeline/cache/wide_skills_*.json` (11 files);
  `pipeline/cache/cdn_pbp/playbyplay_002260000*.json` (stats-capture PBP x/y,
  5 games 2026-27); SOURCES.md §3; INVENTORY.md §1.1; SHOT_POSITION.md §2.6, §3,
  §6; Lane 10 INVENTORY_GAP_REPORT.md §3–§4.
- Public docs (web, 2026-10-26): nba_api PtMeasureType parameter docs
  (SpeedDistance / Rebounding / Possessions / CatchShoot / PullUpShot / Defense /
  Drives / Passing / ElbowTouch / PostTouch / PaintTouch / Efficiency fields);
  hoopR `leaguehustlestatsplayer` + `synergyplaytypes` + `leaguedashptdefend`
  column docs; nba_api `boxscorematchupsv3` / `boxscoreplayertrackv3` docs.
- Tracking infrastructure (web, 2026-10-26): Genius Sports / Second Spectrum
  NBA partnership release (Official NBA Team Basketball Analytics Provider;
  Dragon mesh platform in select arenas; services to all 30 teams); NBA–Sony
  Hawk-Eye announcement (3D tracking from 2023-24; Sportradar as exclusive data
  provider alongside); Second Spectrum 25 Hz dot tracking (2017-18 official
  provider, replacing SportVU); Hawk-Eye 14-camera 29-keypoint pose reporting.
- Trajectory mirrors (web, 2026-10-26): neilmj BasketballData / sealneaward
  nba-movement-data (~600 games, 2015-16, 25 Hz moments, x 0–94 ft / y 0–50 ft);
  Beuoy/Kaggle shooting-motions dataset (modelled LOESS 3-D paths, 190 shooters,
  2013–2016; public SportVU feed taken down 23 Jan 2016); CMU free-throw-form
  paper (public 2015-16 SportVU data); Wu & Bornn 2018 (25 fps SportVU sample).

VERDICT: PASS — cached-vs-public tracking inventory — ~/workspace/mlops-v2-drafts/data-deep-dive/tracking-data.md
VERDICT: PASS — access-tier table with evidence per item — ~/workspace/mlops-v2-drafts/data-deep-dive/tracking-data.md
VERDICT: PASS — fine-level gap list with public-source verdict per gap — ~/workspace/mlops-v2-drafts/data-deep-dive/tracking-data.md
VERDICT: PASS — trajectory-source hunt with keep/kill verdicts and verifying probes — ~/workspace/mlops-v2-drafts/data-deep-dive/tracking-data.md
VERDICT: PASS — era-mask staircase and Lane 5 joint-ablation implication — ~/workspace/mlops-v2-drafts/data-deep-dive/tracking-data.md
VERDICT: BLOCKED — live verification of uncached endpoint headers — clean-machine probe required (datacenter Akamai 403 documented in-repo; no live probe run from this VM)

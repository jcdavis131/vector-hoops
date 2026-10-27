# Scope A — Collection Plan (machine-aware bulk collection)

Companion to INVENTORY_GAP_REPORT.md (measure first, then fetch).
This plan authorizes NO fetch by itself: bulk collection routes
through other machines, and the coordinator's go-ahead + the
clean-machine probe results (Phase 0) gate every later phase.
DESIGN + PLANNING ONLY in this pass. No bulk fetch runs here.

Objective (22:32 correction): next-season 14-d stat prediction.
Every fetch below is justified by a prediction input, not by
completeness for its own sake:
- Game logs → form / durability / splits / minutes-attempt
  realism → the 143-column full-context matrix.
- Shot coordinates → the new shot-position tower → forecast lift
  (or a measured zero, which is also an answer).
- PBP stats + text → game-timescale sequences + the Scope B text
  tower → forecast lift.

## 1. Machine routing — the rule that decides everything

### 1a. What is known-bad from this Hatch VM (evidence, not folklore)

| Source | Hatch VM result | Evidence |
|---|---|---|
| stats.nba.com ShotChartDetail | Stalls, zero bytes, no status code (timeouts 15s/30s) | Shot-source verdict, 2026-10-11, probed twice |
| cdn.nba.com (liveData feeds) | Instant HTTP 403, ~0.5s, deterministic | Same verdict, probed twice; retrying is pointless |
| data.nba.net (legacy CDN) | TLS host mismatch (HTTPS); HTTP 400 (HTTP) | Same verdict; likely retired |
| stats.nba.com dashboards / leaguegamelog (the existing cache) | Worked historically — the 788-file cache was built somehow | Cache exists; but WHICH machine built it is not recorded (no per-file machine metadata — gap G-7). Do not assume Hatch can still fetch it. |

Rule: **Hatch fetches NOTHING from stats.nba.com or cdn.nba.com
in bulk.** Hatch's only allowed fetches are sources proven to work
from Hatch in a Phase 0 probe (see §2): BBR and ESPN snapshot
fetchers are the candidates, because their snapshot code already
ran server-side on 2026-10-20/21 — but even those must re-prove
in Phase 0, since the 2026-10-21 run's machine is not recorded.

### 1b. Routes (one per collection, with the handoff mechanism named)

| Route | Machine | Carries | Handoff mechanism |
|---|---|---|---|
| R-ALIENWARE (primary for all NBA feeds) | Alienware box ("nugatron") | ShotChartDetail, playergamelogs, leaguegamelog, statscapture PBP, schedule enumeration | Forge queue: submit a JobSpec JSON to the private `jcdavis131/forge-queue` repo (`queue` branch, `jobs/pending/<id>.json`) via `forge.cli submit`; the runner claims it (pending→claimed), runs it, and reports to the `results` branch (`results/<id>.json` + log). Hatch verifies with `forge.cli status` / `forge.cli result` / `forge.cli runners`. Job command is argv, never a shell string; no secrets in the spec (`env_names` resolve on the box). Artifacts return through the results branch — large raw files do NOT ride the git results branch: the job writes them to the shared repo checkout path the runner already clones (`vector-hoops`), and Hatch pulls them from that repo, verifying sha256 against the job's reported manifest. If artifact size makes git transport impractical, the job's result must name the box-side path and the coordinator arranges a pull — the job must never silently drop files. |
| R-MAC (fallback for all NBA feeds) | User's Mac | Same as R-ALIENWARE | Operator run: the coordinator hands the user (or the Mac agent) the exact fetch script + season list + output directory; the operator runs it, then returns the output directory (or its sha256 manifest + files) for Hatch-side validation. No SSH lane to the Mac is assumed. This route needs the user's hands, so it is the fallback, not the default. |
| R-HATCH (limited) | This Hatch VM | BBR shot snapshots + ESPN play snapshots ONLY, and only after a Phase 0 probe from Hatch succeeds | Direct run on Hatch. If the Phase 0 probe fails, these two also move to R-ALIENWARE/R-MAC. |

Route precedence: R-ALIENWARE first for every NBA-feed fetch.
R-MAC only if the Alienware runner is down (its runner starts at
Windows login and runs non-admin; a box-side reboot is a known
prerequisite — see the 2026-10-11 verdict note that the box went
quiet and needed a reboot). R-HATCH never carries NBA feeds.

Caveat carried from the record: the Alienware runner checkout
was diverged as of 2026-10-12 and needed a box-side repair
(fresh re-clone, old copy kept aside). Any Forge job for this
plan must first verify `forge.cli runners` shows a live runner
and must pin the repo/commit it runs from in its result, or the
collection may run against a stale checkout and report success
on stale code.

## 1c. Access-posture gate (found during this lane's research — read before Wave 0)

The in-repo shotchart sources `pipeline/shotcharts/sources/stats_nba.py`
and `nba_cdn.py` are GATED stubs (honest 503), not fetchers. Their
gate reasons, probed 2026-10-21: `/stats/*` tarpits to HTTP 000
(TCP/TLS handshake never completes; the site root returns 200,
so this is path-level bot-drop), and cdn liveData returns HTTP 403
"Access Denied" from Akamai Bot Manager (fingerprint/behavior
enforcement, not transient). Critically, the stats_nba stub adds
a LEGAL/ToS posture: stats.nba.com's terms of use restrict
automated access to the stats endpoints, and "even a working
technical path needs a ToS review before any fetch is wired".
Its retry procedure permits re-probing ONLY if the access
posture changes (e.g. an approved API key or an official data
feed); it forbids IP rotation, fingerprint spoofing, and
headless-browser evasion, and this plan adopts that ban in full.

CONSEQUENCE FOR THIS PLAN: a clean machine that technically
reaches stats.nba.com does NOT by itself authorize bulk fetch.
Before Wave 1, the coordinator must record an access-posture
decision for each NBA source: approved API key / official feed /
other authorized access, or a documented ToS review concluding
the fetch is permitted. If no authorized access exists, NBA-feed
waves do not start, and the plan falls back to the sources that
are authorized (BBR/ESPN snapshot fetchers, whose own code
already documents rate + UA discipline) plus honest missing-
season declarations. This gate is independent of the machine
routing in §1b: Alienware solves reachability, it does not
solve authorization. The Phase 0 checklist in §8 gains this
as its first box.

## 2. Phase 0 — probes (small, on the clean machine, before any bulk)

Phase 0 answers the questions bulk fetch cannot afford to get
wrong. Each probe is ONE request or ONE game/season, recorded
with HTTP status, row count, and null rates. Bulk starts only
when Phase 0 passes for that source.

| Probe | Question it answers | Pass condition |
|---|---|---|
| P-0a ShotChartDetail, one recent player-season (e.g. 2024-25 high-volume shooter) | Does the endpoint answer from the clean machine, and do LOC_X/LOC_Y come back non-null? | HTTP 200 + rows > 0 + LOC_X non-null rate recorded (any rate is a pass for the probe; the RATE sets the mask, it does not fail the probe unless rows = 0) |
| P-0b ShotChartDetail, one player-season per era sample (1996-97, 2000-01, 2005-06, 2010-11, 2015-16, 2020-21, 2024-25) | RQ-1/RQ-2/RQ-3: earliest season with rows, null rate by era, zone-field presence by era | A per-era table, even if early eras return 0 rows — "0 rows" is a finding, not a probe failure. The tower mask is written from this table, never assumed. |
| P-0c statscapture PBP, one historical game per era (1996-97, 2005-06, 2013-14, 2020-21, 2024-25) | RQ-4: does statscapture serve history, with x/y? | Per-game table: HTTP status, action count, FG x/y rate. If all historical probes 404/empty, PBP is current-season-only and the plan falls back to ShotChartDetail + BBR/ESPN for history (see §6). |
| P-0d Feed identity: the SAME game via statscapture URL and via cdn liveData URL | G-6: which feed produced the 5 existing files? | The feed whose response matches the existing files' action counts + x/y values is the bulk feed. Record the winning URL pattern in every file's metadata. |
| P-0e playergamelogs, one recent season + one pre-2015 season | Is the pre-2015 gamelog range fetchable, and does the KEEP column set exist in both? | Both seasons return rows with all 18 KEEP columns, or the pre-2015 failure is recorded as a range limit (then the plan's gamelog target shrinks honestly to the fetchable range — see §6). |
| P-0f BBR + ESPN snapshot, one game, from Hatch | Do the alternate sources still work from Hatch? | Both return shots with coordinates. If either fails from Hatch, it moves to R-ALIENWARE/R-MAC. |
| P-0g Schedule enumeration, one season | Can the clean machine list that season's game IDs (for the completeness gate)? | A game-ID list whose count is recorded as that season's expected count. The gate uses THIS list, not assumed 1,230. |

Probe results are written to the versioned cache as
`probes/<source>_<date>.json` (one file per probe run, with
machine + URL + status + counts). A probe that is not recorded
did not happen.

## 3. What to fetch — exact endpoints and feeds

### 3a. Game logs (FIRST priority — they unblock the 143 chain)

| Item | Exact source | Output file (versioned cache) |
|---|---|---|
| Regular-season + all-type player game logs, per season | stats.nba.com via nba_api `playergamelogs.PlayerGameLogs(season_nullable=<season>)` — the existing `pipeline/fetch_gamelogs.py`, extended range (see §4) | `v1/gamelogs/regular/<season>/gamelogs_<season>.jsonl` + `.meta.json` |
| Playoff player + team game logs, per season | stats.nba.com `leaguegamelog` with `SeasonType=Playoffs`, `PlayerOrTeam=P/T` — existing `pipeline/fetch_playoff_gamelogs.py` | Already cached (`pipeline/cache/playoff_games_*.json`, 30/30). RE-VALIDATE, do not re-fetch blindly: run the validation gate over the existing files; re-fetch only seasons that fail a gate. |
| Schedule / game-ID list, per season | stats.nba.com schedule source on the clean machine (P-0g winner; candidate: `leaguegamefinder` or the schedule endpoint — the probe names the winner, this plan does not guess) | `v1/schedules/<season>/schedule_<season>.json` — the expected-count authority for every gate below |

Column contract for gamelogs: the 18 KEEP columns of
`fetch_gamelogs.py` (PLAYER_ID … PLUS_MINUS), no more, no less.
A fetched season missing a KEEP column FAILS (the fetcher's
`require_columns` already raises; the gate re-checks on disk).
Do NOT add coordinate columns to gamelogs — they do not exist
in this endpoint (see INVENTORY §3a correction).

### 3b. Shot coordinates (SECOND priority — the new tower)

| Item | Exact source | Output file |
|---|---|---|
| Per-shot rows, per player-season | stats.nba.com `shotchartdetail` (parameters per the existing shotchart collector contract: player + season; exact parameter set confirmed by P-0a on the clean machine — this plan does not invent parameters that were never observed from a working machine) | `v1/shotcharts/stats_nba/<season>/shotchartdetail_<season>.jsonl` + `.meta.json` |
| Per-shot rows, per game (fallback / cross-check) | statscapture PBP feed (P-0d winner URL) — only if P-0c shows history serves | `v1/pbp/<season>/playbyplay_<gameId>.json` (same file, dual use with §3c) |
| Per-shot rows, per game (alternate backfill) | BBR shot-chart pages (`basketball-reference.com/boxscores/shot-chart/<game_id>.html`, ≤1 req/3s, single-threaded, browser UA) via `pipeline/shotcharts/sources/bbr.py` | `v1/shotcharts/bbr/<date>/shotcharts-<date>.jsonl` + manifest (existing format) |
| Per-shot rows, per game (alternate backfill) | ESPN core API plays (`sports.core.api.espn.com/.../plays?limit=1000`, paginated) via `pipeline/shotcharts/sources/espn_plays.py` | `v1/shotcharts/espn_plays/<date>/shotcharts-<date>.jsonl` + manifest |

Coordinate discipline (binding): each source keeps its NATIVE
coordinate fields in its own file. Conversion to the canonical
feet/hoop-origin system happens in a separate, versioned
derivation step (per overhaul SHOT_POSITION.md), never by
overwriting the raw file. Raw ShotChartDetail keeps LOC_X/LOC_Y;
raw PBP keeps x/y + xLegacy/yLegacy; raw BBR keeps pixel
positions + derived feet side by side; raw ESPN keeps
coordinate.{x,y}. A file that mixes systems without labeling
them fails the schema gate.

### 3c. Play-by-play, stats + text (THIRD priority — sequences + text tower)

| Item | Exact source | Output file |
|---|---|---|
| Full PBP per game, all seasons | statscapture feed (P-0d winner) — NEW fetcher script (none exists; G-5). Game IDs enumerated from the §3a schedule lists, not guessed from game-number ranges. | `v1/pbp/<season>/playbyplay_<gameId>.json` + `.meta.json` per game |
| PBP text handling | The `description` field on every action, verbatim. No generated commentary, no paraphrase, no cleaning that changes wording. Template dedup (Scope B) is a downstream derivation, not a fetch-time edit. | Raw files stay verbatim; dedup tables live in the derivation layer. |

Volume honesty: full PBP for ~30 seasons is the largest fetch
in this plan by file count (tens of thousands of games ×
~600 actions). It is ordered LAST among the three collections
and runs season-by-season with per-season gates (see §4), so a
failure in one season never contaminates another, and a partial
run is a reportable partial run, not a silent shortfall.

## 4. Fetch order — later seasons first, then backward

Order is deliberate: the prediction target is the FUTURE, and
the most recent seasons carry the most weight in every fold
(Fold 2 val = 2024-25, frozen test = 2025-26). A partial
collection that covers recent seasons is useful; a partial
collection that covers only 1996-97 is not.

1. **Wave 0 — probes (Phase 0, §2).** No bulk until probes pass.
2. **Wave 1 — gamelogs, 2025-26 → 2015-16** (the 11 in-range
   seasons, newest first). Each season gates before the next
   starts. This wave alone unblocks the 143 chain for the
   seasons that matter most to the folds.
3. **Wave 2 — gamelogs, 2014-15 → 1996-97** (the 19 extended-range
   seasons, newest first), ONLY if P-0e shows pre-2015 rows
   return cleanly. If P-0e fails, Wave 2 is declared
   out-of-scope honestly (see §6) and the plan's gamelog target
   is restated as 11 seasons, not 30.
4. **Wave 3 — ShotChartDetail, 2025-26 → earliest verified era**
   (newest first, stopping at the P-0b earliest season with
   rows). Zone-only eras (if any) are fetched too — zone shares
   are valid tower inputs even where coordinates are absent —
   but they are labeled zone-only in metadata and masked
   accordingly downstream.
5. **Wave 4 — PBP, 2025-26 → 1996-97** (newest first), ONLY for
   seasons where P-0c shows history serves. Current-season PBP
   (2026-27 in progress) is fetched as a rolling tail, never
   mixed into the 30-season training window.
6. **Wave 5 — BBR/ESPN backfill**, targeted, not blanket: only
   seasons/games where Waves 3–4 left coordinate gaps AND the
   alternate source is verified to serve that era. Blanket
   BBR/ESPN backfill of 30 seasons is not authorized by this
   plan without a separate volume/rate review (BBR at ≤1 req/3s
   is slow by construction).

Within every wave: one season at a time, in order, with a gate
report per season before the next season starts. No parallel
seasons from the same machine (rate-limit safety + clean
attribution of any failure to one season).

## 5. Rate limits, resume, and failure behavior

- **Rate discipline (carried from existing code, not invented):**
  `fetch_gamelogs.py` sleeps 1.2s between successful seasons
  and retries each call 3× (`retry_call`, timeout 60s).
  BBR/ESPN snapshot fetchers run ≤1 req/3s, single-threaded,
  jittered backoff on transient errors. New scripts (PBP
  fetcher, ShotChartDetail fetcher) MUST adopt the same shape:
  single-threaded, ≥1s between requests, 3 attempts with
  growing waits, 60s timeout. A 429 means stop that season and
  back off (growing waits, then a next-day resume) — never
  hammer through it. A 403 from Hatch means stop entirely and
  reroute (see §1) — it is a routing error, not a retryable
  failure. A stall with zero bytes (the Hatch ShotChartDetail
  signature) means stop entirely and reroute — retries from
  the wrong machine waste the window.
- **Resume (per season, per game):** every fetch writes
  atomically (temp file + rename; the existing `write_cache`
  / `write_cache_text` pattern). A season/game is "done" only
  when its file + `.meta.json` (with sha256 + row/game counts)
  both exist and pass the gate. A crash mid-season resumes at
  the first ungated game/season — never by trusting file size
  alone (the old `st_size > 1_000_000` resume check trusted any
  file past 1 MB including truncated ones; that pattern is
  banned in this plan).
- **In-progress seasons (2026-27 tail):** a season that is not
  final (per `seasons.py` `is_final`: final from Aug 1 of the
  end year) is refetchable, never "kept forever". Its metadata
  carries `complete: false` until final. Training-window
  seasons (through 2025-26) are final and are fetched once,
  then treated as immutable (see CACHE_VALIDATION_DESIGN.md).
- **Failure reporting:** a failed season/game writes NOTHING
  (no partial file, no placeholder) and is recorded in the
  wave's failure ledger with season/game, source, HTTP status
  or error class, and attempt count. The wave report lists
  failures explicitly. A wave with failures still completes
  for its passing seasons; the failures are re-queued as their
  own wave, not silently retried inside the same run.
- **No partial-season promotion:** a season whose gate fails
  is not "mostly done". Its downstream mask consequence is
  stated in the wave report (form masked / shot tower masked /
  PBP sequences absent for that season), and the season is
  re-queued. See §6 for the never-synthesize rule.

## 6. The never-synthesize rule (binding)

**NEVER synthesize, proxy-fill, impute, interpolate, or
carry-forward missing data.** A missing season stays missing
and is reported, with its downstream mask consequence stated.
Concretely, this forbids:
- Filling a missing gamelog season from season-summary
  dashboards (they are aggregates, not per-game lines).
- Filling a missing shot-coordinate season from shot TYPE mix
  (dashscoring) or from another season's zone shares.
- Filling missing PBP games from box scores, replays, or
  template positions (replay staged positions are animation,
  never training input — contract §7).
- Filling a missing early era with a later era's distribution,
  or a missing player with a "similar player's" shots.
- Writing a 0, a mean, or a league average into a raw file and
  calling it observed. Masked (0.0 value + mask 0) happens ONLY
  in the derived feature matrix, never in the raw cache.

If a source cannot supply a season, the honest outcomes are,
in order: (1) try the alternate real source for that season
(Wave 5); (2) if no real source supplies it, declare the season
missing for that family, mask it downstream, and report it.
The plan's success criterion is a truthful coverage table, not
a full table.

Fallback ladder if a primary source fails for a season range:
ShotChartDetail fails → PBP x/y (if history serves) → BBR/ESPN
snapshots (if they serve that era) → season declared missing
for the shot tower. PBP history fails → ShotChartDetail still
covers shots, but PBP text/sequences for that range are
declared missing (no text substitute exists — box scores are
not event text). Gamelog range fails pre-2015 → gamelog target
restates to the fetchable range; pre-2015 form features stay
masked (as they are in the 73-column base today — this is a
status quo, not a regression).

## 7. What each wave unblocks (so the coordinator can sequence lanes)

| Wave completes | Unblocked | Still blocked |
|---|---|---|
| Wave 1 (gamelogs 2015-16–2025-26) | 143-column chain becomes runnable for recent seasons; form/durability/split features for all fold-relevant seasons; full-context rebuild can be attempted in scratch | Pre-2015 rows still base-only; shot tower; PBP text |
| Wave 2 (gamelogs pre-2015, if fetchable) | 143-column chain for all 30 seasons | Shot tower; PBP text |
| Wave 3 (ShotChartDetail to earliest verified era) | Shot-position tower for verified eras; zone shares where zones exist | PBP text/sequences; unverified eras stay masked |
| Wave 4 (PBP history) | Game-timescale sequences; Scope B text corpus at season scale | Nothing in Scope A (remaining work is derivation + training authorization, both separate decisions) |
| Wave 5 (targeted backfill) | Coordinate gaps closed where alternates serve | Seasons no real source serves — declared missing, masked |

## 8. Pre-flight checklist (all boxes before Wave 1 starts)

- [ ] Access-posture decision recorded per NBA source (§1c): authorized access or ToS review on file. No box, no NBA-feed wave.
- [ ] Phase 0 probes recorded (P-0a–P-0g) with machine + URL + status.
- [ ] Forge runner verified live (`forge.cli runners`) OR Mac operator confirmed, with repo/commit pinned.
- [ ] Versioned-cache root created (see CACHE_VALIDATION_DESIGN.md) — no Scope A file lands in the old unversioned cache paths.
- [ ] Gamelog range decision recorded: 11 seasons vs 30, from P-0e.
- [ ] PBP feed decision recorded: statscapture vs cdn liveData, from P-0d.
- [ ] Shot era table recorded: earliest season + null rates, from P-0b.
- [ ] Coordinator go-ahead for Wave 1 (this plan alone is not it).

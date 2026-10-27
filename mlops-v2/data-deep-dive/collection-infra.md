# Collection Infrastructure — Vector Hoops MTNN Data-Collection Deep Dive

Design only. No collection runs, no writes to live checkouts, no bulk fetch.
Read from: `pipeline/shotcharts/SHOTCHART_PIPELINE_STANDARD.md`,
`pipeline/shotcharts/sources/*.py`, `pipeline/shotcharts/common/*.py`,
`pipeline/rebuild_all.py`, `pipeline/build_vectors.py`, `pipeline/stage_contract.py`,
`pipeline/nba_http.py`, `pipeline/fetch_gamelogs.py`, `pipeline/seasons.py`,
`~/workspace/forge/` (README, runner, example job specs),
`~/workspace/ALIENWARE_HANDOFFS.md`, and the Scope A lane docs
(`mlops-v2-drafts/lanes/10-data-gathering/COLLECTION_PLAN.md`,
`CACHE_VALIDATION_DESIGN.md`, `INVENTORY_GAP_REPORT.md`).
Checkout read: `~/workspace/vector-hoops-mlops-v2/`.

Standing facts this design builds on (not re-litigated here):

- Hatch VM CANNOT collect from stats.nba.com (stalls, zero bytes, HTTP 000 on
  `/stats/*`) or cdn.nba.com (instant 403 from Akamai Bot Manager). No evasion:
  no IP rotation, no fingerprint spoofing, no headless-browser workarounds
  (per the `stats_nba.py` / `nba_cdn.py` gate stubs, probed 2026-10-21).
- stats.nba.com automated access also carries a ToS posture: even a working
  technical path needs an access-posture decision (approved key / official feed /
  documented ToS review) before any NBA-feed wave starts. Alienware solves
  reachability, not authorization (COLLECTION_PLAN §1c).
- The shotchart sources `stats_nba` and `nba_cdn` are GATED stubs (honest 503,
  dispatcher exit 3). `bbr` and `espn_plays` are real snapshot fetchers.
- The current cache (`pipeline/cache/`, 788 files, 105 MB, measured 2026-10-26)
  carries ~no per-file fetch metadata (gap G-7: machine that built it unrecorded).
  It is grandfathered as v0, read-only for the base build. All Scope A writes go
  to the versioned layout (§5), never into v0 paths.

## 1. Machine lanes

### 1a. Lane table

| Lane | Machine | What it CAN collect | What it CANNOT / MUST NOT collect | Transport back to Hatch |
|---|---|---|---|---|
| R-HATCH (limited) | This Hatch VM | BBR shot snapshots + ESPN play snapshots — ONLY after Phase 0 probe P-0f succeeds FROM Hatch. Candidates for the same probe-first treatment: BBRef advanced/team-season fetchers (same host, same discipline) — they are candidates, not proven, because the machine that built today's cache is unrecorded. | stats.nba.com (any endpoint) and cdn.nba.com in bulk, ever. A 403 or a zero-byte stall from Hatch is a routing error, not a retryable failure: stop and reroute. | Direct run on Hatch; files + manifests land in the versioned cache directly. |
| R-ALIENWARE (primary for all NBA feeds) | Alienware "nugatron" (RTX 4080 Laptop, torch 2.11+cu128 when last healthy) | Everything: ShotChartDetail, playergamelogs, leaguegamelog, statscapture PBP, schedule enumeration, plus BBR/ESPN if Hatch probes fail. | Nothing by source — but only after (a) runner verified live, (b) repo/commit pinned in the job result, (c) access-posture decision recorded. | Forge queue (see §1b). Large raw files do NOT ride the git results branch (see §1c). |
| R-MAC (fallback) | User's Mac | Same as R-ALIENWARE (any NBA feed the Mac's egress reaches, once proven by a Mac-side Phase 0 probe). | Nothing by source — but it costs the user's hands, so it is fallback, not default. No SSH lane to the Mac is assumed. | Operator carry: the coordinator hands the operator the exact script + season list + output directory; the operator runs it and returns the output directory (or its sha256 manifest + files). Hatch verifies sha256 before any gate runs. |

### 1b. Forge job shape (Alienware lane)

Git-as-conveyor-belt through private repo `jcdavis131/forge-queue`. No SSH,
no ports, no VPN. Branches: `queue` (`jobs/pending/<id>.json`,
`jobs/claimed/<id>.json`, `runners/<host>.json`) and `results`
(`results/<id>.json`, `results/<id>.log` — result JSON + LAST 300 log lines only).

Job spec shape (modelled on the existing `forge/examples/nba-gamelogs-collect.json`,
which is itself a CPU-only, resume-safe, BBRef batch fetcher with `timeout_s: 21600`):

```json
{
  "id": "nba-pbp-2025-26-0001",
  "type": "shell",
  "repo": "jcdavis131/vector-hoops",
  "workdir": "forge-jobs/nba-pbp-2025-26",
  "command": ["python3", "pipeline/fetch_pbp.py", "--season", "2025-26", "--resume"],
  "requires": {"gpu": false},
  "env_names": [],
  "timeout_s": 21600,
  "artifacts": ["pipeline/cache_v1/v1/pbp/2025-26/"]
}
```

Rules that carry over from `forge/README.md` and `forge/runner/forge-runner.py`:

- `command` is argv, never a shell string. `env_names` resolve from the runner's
  own allow-list (`FORGE_ENV_ALLOW`); never put secrets in a spec.
- `requires.gpu: false` for collection jobs. Collection is CPU/network work;
  it must not occupy the GPU lane or depend on GPU capability advertisement.
- `timeout_s` must be set explicitly per job. The runner default is 3600 s
  (1 h) when unset — a multi-hour backfill job with no explicit timeout will
  be killed by the runner, not by the source.
- The runner polls every 60 s (`FORGE_POLL_S`), claims the FIRST pending job
  whose requirements it meets (single claim per tick, serial execution), clones
  or fast-forward-pulls the job's repo into `~/forge-repos`, runs argv with the
  timeout, then pushes result + log tail to the `results` branch.
- The runner's checkout can diverge (2026-10-12: box-side checkout at f1c4371
  vs origin/master at 42164e6; old runner died on `git pull --ff-only`). The
  patched runner moves a diverged checkout aside and re-clones fresh (old copy
  kept aside, nothing deleted). Every collection job must therefore pin the
  repo/commit it ran from in its result, and Hatch must check `forge.cli runners`
  shows a live runner BEFORE submitting — a job that runs against a stale
  checkout and reports success on stale code is worse than a job that fails loud.
- The runner advertises capabilities on first boot (`runners/<host>.json`: GPU
  model, VRAM, torch/CUDA). Capability discovery is automatic; collection jobs
  need none of it beyond `gpu: false`.

### 1c. Alienware constraints (from the 2026-10-11 verdict and runner history)

- The box went quiet ~10:50 on 2026-10-11 (runner + cached access down until a
  box-side reboot). The standing pattern is flapping: healthy, then unreachable
  for hours-to-days, then recovered at next Windows login. Last healthy before
  the quiet period: 2026-10-03 19:46 CDT (cuda=true, RTX 4080, idle).
- The runner starts ONLY at Windows login and runs non-admin. Jobs must skip
  system folders and clean user temp dirs. There is no remote path to push a new
  runner file (no SSH lane; the jcd-pc lane's key is still rejected) — a runner
  fix needs hands on the box (see `forge/nugatron-runner-fix-STEPS.md`: stop old
  runner, copy file, restart, watch for the advertise line).
- `nugatron:8765` is a monitoring-only beacon, not a job channel. Direct curl
  returns 000; probe via the tunnel proxy on port 3130 only. Beacon down does
  not by itself prove the runner is down (and vice versa) — the authoritative
  check is `forge.cli runners` plus a claimed/completed canary job.
- Box-side prerequisites before ANY wave: Windows login (runner up), never-sleep
  setting (or an accepted sleep risk, §3), user temp cleanup, and RAM headroom.
  The train gate history (blocked_ram 747 MB vs 1200 MB floor, 2026-10-03) is a
  training concern, not a collection blocker — but a box that cannot stay up
  cannot backfill either. Verify, don't assume.
- Artifact return: the results branch carries result JSON + 300 log lines. It
  does NOT carry multi-GB raw files. Per COLLECTION_PLAN §1b, the job writes
  artifacts to the shared repo checkout path the runner already clones and
  Hatch pulls them from that repo, verifying sha256 against the job's reported
  manifest. OPEN DESIGN GAP (close before Wave 4): 16+ GB of PBP through git
  transport is impractical as one push. Decide before Wave 4: per-season pushes
  to the shared repo, or a named box-side path in the result plus a coordinator-
  arranged pull. The job must never silently drop files — if artifact size makes
  git transport impractical, the result names the box-side path and the
  coordinator arranges the pull.

### 1d. Mac lane (fallback, operator-run)

- The coordinator hands the operator (user or Mac agent) three things: the exact
  fetch script + pinned commit, the season/game list, and the output directory
  layout (§5). Nothing else is improvised on the Mac.
- The operator runs the same scripts with the same flags (`--resume`, same rate
  discipline, §2) and returns the output directory or its sha256 manifest + files.
- Hatch-side verification is identical to the Forge lane: sha256 recompute,
  gate recounts, schedule-set check. A file claiming machine `mac` for a source
  the Mac never probed fails review.
- The Mac lane is NOT a shortcut around the access-posture gate (§1, preamble)
  or around Phase 0 probes — the probes must pass FROM THE MAC before a Mac
  wave starts, because reachability is per-egress, not per-source.
- Cost: the user's hands and attention per wave. That is why Mac is fallback:
  Alienware first, Mac only if the runner is down.

### 1e. Decision table: which source goes on which machine

| Source / corpus | Primary lane | Fallback lane | Never | Why |
|---|---|---|---|---|
| stats.nba.com playergamelogs (regular-season gamelogs) | Alienware (Forge) | Mac operator | Hatch bulk | Hatch stalls on `/stats/*`; one call per season, so the job is tiny but the egress must work. |
| stats.nba.com ShotChartDetail | Alienware (Forge) | Mac operator | Hatch bulk | Same egress block; plus ToS posture gate must clear first. |
| statscapture PBP (api.nba.com) | Alienware (Forge) | Mac operator | Hatch until proven | Feed identity (statscapture vs cdn liveData) unresolved until P-0d; Hatch egress to api.nba.com unproven. Probe first, from the lane that will run it. |
| Schedule enumeration (leaguegamefinder / schedule endpoint) | Same lane as the wave it gates | Same as wave | — | The schedule list is the expected-count authority for G-3; it must come from the same egress as the wave it gates, or a source/egress mismatch reads as a coverage failure. |
| BBR shot snapshots | Hatch (after P-0f passes from Hatch) | Alienware / Mac | — | BBR code already ran server-side 2026-10-20/21 with documented rate + UA discipline; Hatch egress to BBRef is the only thing left to prove. |
| ESPN play snapshots | Hatch (after P-0f passes from Hatch) | Alienware / Mac | — | Same as BBR; ESPN core API sends `Access-Control-Allow-Origin: *`, so live games are client-side and need no collection lane at all — this lane covers HISTORICAL snapshots only. |
| BBRef advanced / team-season / other BBRef fetchers | Hatch (after a Hatch probe) | Alienware / Mac | — | Same host as BBR snapshots, same discipline (DELAY_S = 3.5 s in `fetch_bbref_advanced.py`); probe-first because the building machine is unrecorded. |
| cdn.nba.com liveData | NO LANE | NO LANE | All lanes | Gated stub (403, Akamai Bot Manager). Re-probe at most quarterly or on a concrete announcement, single plain GET; promotion to a real source module only if it ever returns 200 with JSON. |

## 2. Scheduling

### 2a. Probe-first-then-backfill sequencing (binding order)

No bulk fetch starts until its probes pass. The probe set (COLLECTION_PLAN §2,
Phase 0) is small by design — one request or one game/season each, recorded with
machine + URL + status + row counts under `probes/<source>_<date>.json`. A probe
that is not recorded did not happen.

| Step | Probes | Pass condition / output | Blocks |
|---|---|---|---|
| 0a. Access-posture decision | — (coordinator record) | Per-NBA-source decision: approved key / official feed / documented ToS review, or no NBA-feed wave. | ALL NBA-feed waves. |
| 0b. Runner / operator readiness | `forge.cli runners` live, OR Mac operator confirmed | Runner advertised + repo/commit pinnable; or operator ack with script + season list in hand. | ALL Forge / Mac waves. |
| 0c. P-0a–P-0g probes | ShotChartDetail 1 player-season; 1 player-season per era sample (1996-97, 2000-01, 2005-06, 2010-11, 2015-16, 2020-21, 2024-25); statscapture 1 historical game per era (1996-97, 2005-06, 2013-14, 2020-21, 2024-25); feed-identity same-game comparison; playergamelogs 1 recent + 1 pre-2015 season; BBR + ESPN 1 game from Hatch; schedule enumeration 1 season | Per-era tables (0 rows is a FINDING, not a probe failure — the tower mask is written from the table, never assumed); feed winner named; gamelog range decision (11 vs 30 seasons); PBP feed decision; earliest shot era + null rates. | Wave 1 (gamelogs), Wave 3 (shots), Wave 4 (PBP), Hatch BBR/ESPN lane. |
| Wave 1 | — | Gamelogs 2025-26 → 2015-16 (11 in-range seasons, newest first). Each season gates before the next starts. | Unblocks the 143-column chain for fold-relevant seasons. |
| Wave 2 | P-0e only | Gamelogs 2014-15 → 1996-97 (19 extended-range seasons, newest first), ONLY if pre-2015 rows return cleanly. Else the gamelog target restates honestly to 11 seasons. | 143-column chain for all 30 seasons. |
| Wave 3 | P-0b only | ShotChartDetail 2025-26 → earliest verified era, newest first. Zone-only eras fetched too, labeled zone-only in metadata and masked downstream. | Shot-position tower for verified eras. |
| Wave 4 | P-0c + P-0d only | PBP 2025-26 → 1996-97, newest first, ONLY for seasons where history serves. 2026-27 in-progress tail fetched as a rolling tail, never mixed into the 30-season window. | Game-timescale sequences + Scope B text corpus. |
| Wave 5 | Era availability of alternates | BBR/ESPN backfill TARGETED ONLY: seasons/games where Waves 3–4 left coordinate gaps AND the alternate serves that era. Blanket 30-season BBR/ESPN backfill is NOT authorized without a separate volume/rate review. | Coordinate gaps, where closable with real data. |

Within every wave: one season at a time, in order, with a gate report per season
before the next season starts. No parallel seasons from the same machine
(rate-limit safety + clean attribution of any failure to one season). Later
seasons first throughout: a partial collection covering recent seasons is useful;
a partial collection covering only 1996-97 is not (the prediction target is the
future; Fold 2 val = 2024-25, frozen test = 2025-26).

No cron is created by this design. The shotchart standard is explicit: "No cron
— refresh scheduling is Cameron's follow-up decision." Wave sequencing above is
execution order, not scheduled jobs. (The in-progress 2026-27 tail is the one
recurring shape, and its refresh cadence is still his call.)

### 2b. Job granularity

| Corpus | Job unit | Why this grain, and what a job contains |
|---|---|---|
| Gamelogs | ONE Forge job PER SEASON | `fetch_gamelogs.py` makes exactly ONE API call per season (`playergamelogs.PlayerGameLogs(season_nullable=...)`, timeout 60 s, 3 attempts via `retry_call`), then writes one JSONL atomically. A per-season job matches the call grain, the gate grain (schedule-set check per season), and the failure grain (one bad season never blocks another). A 30-season mega-job would also exceed sane `timeout_s` and lose per-season attribution. |
| PBP | ONE Forge job PER SEASON, files PER GAME inside it | One statscapture request per game, one file per game (`playbyplay_<gameId>.json` + `.meta.json`). Per-game files are the resume unit (§3) and the gate unit (G-4 is per game). A per-game job would be ~37,000 Forge submissions — absurd overhead through git transport. A per-season job (~1,230 games) is the largest unit that still resumes cleanly per game. |
| Shot snapshots (BBR/ESPN) | ONE run PER DATE (the pipeline's native grain) | `pipeline/shotcharts/pipeline.py <source> <stage> --date YYYY-MM-DD [--resume]`. Fetch writes `raw/<source>/<date>/` + `checkpoints/<source>/<date>.json`; snapshot writes `shotcharts-<YYYYMMDD>.jsonl` + manifest. A per-date job matches the served `<500KB/date` budget grain and the checkpoint grain. |
| ShotChartDetail | PER SEASON if the probe shows a per-season call shape; PER PLAYER-SEASON batch if the probe shows per-player calls | REQUEST COUNT IS UNKNOWN until P-0a (the parameter set was never observed from a working machine — this design does not invent it). The probe result picks the grain: per-season calls → one job per season (as gamelogs); per-player-season calls → one job per season still, iterating players inside it with checkpoints per player-season, so a mid-season crash resumes at the next player, not at season start. |
| Schedules | ONE fetch PER SEASON, before that season's wave | The schedule list is the expected-count authority (G-3). It is fetched once per season, gated itself (G-3 failure of the schedule blocks the season's other gates until resolved), and never hardcoded (no assumed 1,230, no assumed 82 games — lockout/shortened seasons break both). |

### 2c. Rate discipline per source (from code, never invented)

| Source | Discipline (as documented in code) | Failure behavior |
|---|---|---|
| BBRef (all fetchers) | ≤1 req / 3 s, single-threaded, browser UA, no auth, $0 (`sources/bbr.py`: `RATE_S = 3.1`; `fetch_bbref_advanced.py`: `DELAY_S = 3.5`, "well under BBRef's 20 req/min policy"). | Transient → jittered backoff. 429 → stop that season, growing waits, next-day resume. Never hammer through a 429. |
| ESPN core API | ≤1 req / 3 s, jittered backoff on transient errors; "No 429 seen" (`sources/espn_plays.py`). Per game: slate share + status + plays (paginated via pageIndex/pageCount; one page holds a full game at limit=1000). | Same as BBRef: stop the season on 429, back off, resume next day. |
| stats.nba.com via `nba_http.py` | Warmed session (GET www.nba.com/stats first, so the session carries expected cookies) + browser headers + curl_cffi chrome120 impersonation where available. 403: ONE more try on a fresh re-warmed session, then `BlockedError` — waiting does not lift a block; callers must not retry it. 429 / 5xx / timeouts / resets / non-JSON: transient, jittered exponential backoff (`BACKOFF_BASE_S = 5.0`, cap 120 s) up to `RETRY_ATTEMPTS = 5`, then `FetchError`. | 403 from the WRONG machine (Hatch) = reroute, not retry. 403 from the RIGHT machine after re-warm = stop the wave; the access posture changed, and the gate decision must be revisited. A stall with zero bytes (the Hatch ShotChartDetail signature) = stop and reroute; retries from the wrong machine waste the window. |
| Gamelogs (`fetch_gamelogs.py`) | 1.2 s sleep between successful seasons; each call retried 3× (`retry_call`, timeout 60 s). | Any season failure → `FetchError`, exit 2 via `ingest.run_fetch`. A failed season writes nothing (see §3). |
| New scripts (PBP fetcher, ShotChartDetail fetcher — neither exists yet) | MUST adopt the same shape (COLLECTION_PLAN §5): single-threaded, ≥1 s between requests, 3 attempts with growing waits, 60 s timeout. | 429 → stop that season, back off, next-day resume. 403 → stop entirely, reroute. Stall/000 → stop entirely, reroute. |
| cdn.nba.com | No discipline applies — the source is gated. | Single plain GET re-probe at most quarterly or on a concrete announcement. No header rotation, no residential egress, no headless-browser workaround, ever. |

### 2d. Calendar estimates (all labeled ESTIMATE with method; pacing floors, not promises)

Method: pacing floor = (request count) × (documented minimum interval). Transfer,
parse, gating, and box downtime are EXTRA. Elapsed calendar assumes the box stays
up; §3 prices the sleep/reboot risk separately. Game counts use the inventory's
arithmetic (~36,900 regular-season games over 30 seasons) ONLY as an estimating
yardstick — the gates themselves use fetched schedule lists, never this number.

| Wave | Pacing-floor math (ESTIMATE) | Realistic elapsed (ESTIMATE) |
|---|---|---|
| Phase 0 probes (P-0a–P-0g) | Minutes of fetch: ~20 probe requests/games total, at documented intervals. | <1 day elapsed. Verification + the access-posture decision dominate, not fetch time. |
| Wave 1: gamelogs, 11 seasons | 11 API calls + 11 × 1.2 s sleeps ≈ under 1 minute of pacing + transfer of ~11 season files. | <1 day elapsed including per-season gates. |
| Wave 2: gamelogs, 19 seasons | 19 calls + sleeps ≈ under 2 minutes of pacing + transfer. | <1 day elapsed including gates, IF P-0e passes. Otherwise 0 days: honestly out of scope. |
| Wave 3: ShotChartDetail | CONDITIONAL on P-0a (request shape unknown). IF per-player-season calls at ≥1 s: ~430 player-seasons/season (12,966 rows / 30 seasons) × 30 seasons ≈ 12,900 calls ≈ 3.6 h pacing floor + transfer/parse. IF per-season bulk calls: minutes of pacing. | 1–3 days elapsed including per-season gates and era-mask recording. Do not quote a tighter number until P-0a lands. |
| Wave 4: PBP, ~36,900 games | 36,900 requests × ≥1 s ≈ 10.3 h pacing floor + 16+ GB download (§4) + per-season gates. | 2–7 days elapsed depending on box uptime; plan 1 week elapsed to absorb sleep/reboot risk (§3). Per-season jobs let a dead week resume without rework. |
| Wave 5: BBR targeted backfill | Per gap-date: 1 slate + ~7 game pages (avg) ≈ 8 requests × 3.1 s ≈ 25 s pacing. 100 gap-dates ≈ 40 min pacing. | Hours to days, proportional to gap count. BLANKET BBR (not authorized): ~5,300 dates × ~25 s ≈ 37 h pacing floor → 2–4 days elapsed. Shown only to justify why blanket backfill needs a separate review. |
| Wave 5: ESPN targeted backfill | Per gap-game: ~2 requests (status + plays) × 3 s ≈ 6 s + slate share. 100 gap-games ≈ 10 min pacing. | Hours, proportional to gap count. BLANKET ESPN (not authorized): ~36,900 games × 2 × 3 s ≈ 61 h pacing floor → 3–5 days elapsed. Same caveat as BBR. |
| All waves, end to end | Sum of pacing floors ≈ 2–3 days of pure request pacing, dominated by PBP. | ESTIMATE: ~2–3 weeks elapsed realistic (probes + access decision + per-season gates + box-uptime risk + artifact pull), NOT 2–3 days. Gamelogs are the fast wave; PBP and box reliability are the long pole. |

## 3. Resume after failure

### 3a. Checkpointing (per game / per season, by corpus)

| Corpus | Checkpoint unit | Mechanism (existing code) | Resume behavior |
|---|---|---|---|
| Shot snapshots (BBR/ESPN) | Per GAME within a date | `checkpoints/<source>/<date>.json`: `{"completed_game_ids": [...]}`. `fetch --resume` skips completed ids. `mark_complete` is called per game AFTER its raw file is written. | Re-running `all` for a completed date is a no-op (exit 0, "already complete") — but only when the snapshot sha verifies; the complete check re-verifies the manifest sha, it does not trust the checkpoint alone. |
| Gamelogs | Per SEASON | Atomic write: temp file + rename (`write_cache` / `write_cache_text` pattern). A season is "done" only when its file + `.meta.json` (sha256 + row/game counts) both exist and pass the gates. | A crash mid-season resumes at that season (the file is either fully written or absent — never half-written). Next season never starts until the current season gates. |
| PBP | Per GAME within a season | One file per game + `.meta.json` per game. Season "done" = every scheduled game present and gated. | A crash mid-season resumes at the first ungated game. One bad game re-queues individually and never blocks the season's good games — but the SEASON is not "complete" until all its games pass. |
| ShotChartDetail | Per PLAYER-SEASON within a season (if per-player calls) or per season (if bulk) | Same atomic-write + meta pattern as gamelogs, applied at the call grain the probe reveals. | Same rule: resume at the first ungated unit, never by trusting file size. |
| Forge job | Per JOB (season/date batch) | Resubmit as a NEW job id with the same output paths + `--resume` semantics in the fetcher. The runner has no built-in requeue: a job that reports (ok/failed/timed_out/error) is consumed. | The fetcher's checkpoints make resubmission idempotent: completed units are skipped, ungated units re-run. The wave manifest records the original job id AND the resume job id. |

### 3b. Idempotent writes (the rules that make resume safe)

1. Atomic write everywhere: temp file + rename. A reader never sees a half-written
   file, and a crash never leaves a file that looks complete.
2. Never trust file size alone. The old `st_size > 1_000_000` resume check
   trusted any file past 1 MB including truncated ones — that pattern is BANNED
   (COLLECTION_PLAN §5). "Done" = file + metadata + gate pass, all three.
3. Raw files are immutable. A raw file is never edited, patched, or "fixed" in
   place. A correction is a new version (§5). Derived files never overwrite raw
   files, and raw files never carry derived values.
4. Re-running a completed unit is a no-op, not a duplicate: shot snapshot
   re-runs exit 0 "already complete"; gamelog fetches skip fresh final-season
   caches (`cache_is_fresh`: a final season is kept whenever the file exists;
   a season still being played gets a TTL, default 24 h, from its fetch record).
5. No partial-season promotion. A season whose gate fails is not "mostly done".
   Its downstream mask consequence is stated in the wave report (form masked /
   shot tower masked / PBP sequences absent for that season) and the season is
   re-queued. A wave with failures still completes for its passing seasons;
   failures are re-queued as their own wave, not silently retried inside the run.

### 3c. What a partial backfill looks like on disk

```
pipeline/cache_v1/v1/pbp/2025-26/
  playbyplay_0022500001.json  +  .meta.json   (complete: true, gated)
  ... (1,180 games present, gated)
  # 50 scheduled games absent: no file, no placeholder, no zero-byte stub.
  # A failed game writes NOTHING; it is recorded in the wave's failure ledger
  # (season/game, source, HTTP status or error class, attempt count).
pipeline/cache_v1/v1/manifests/wave_4_pbp.json
  # wave report: seasons gated, seasons incomplete WITH MISSING GAME IDs
  # ENUMERATED (not just a count — the re-fetch needs the list),
  # failures listed explicitly, mask consequences stated.
```

An incomplete season directory is a reportable partial run, not a silent
shortfall. Downstream readers refuse incomplete seasons: `build_vectors.py`
exits 2 before writing anything when any season/source is incomplete (unless
`--allow-partial` is passed deliberately, §6). The 2026-27 in-progress tail is
the one sanctioned exception: its metadata carries `complete: false` throughout,
it is refetchable in place until final (final from Aug 1 of the end year, per
`seasons.is_final`), and it never enters the 30-season training window.

### 3d. What happens when the box sleeps mid-backfill

Three distinct cases, with different recoveries. Do not conflate them.

1. **Box sleeps, runner process suspends, job still within `timeout_s` on wake.**
   The subprocess is suspended, not killed; on wake it resumes where it left
   off (modulo the source's own session timeouts — a warmed stats.nba.com
   session may need re-warming, which `nba_http.retry_call` handles by retrying
   on a fresh session for transient errors). The fetcher's per-game/per-season
   checkpoints mean the sleep cost nothing but wall-clock time. Mitigation:
   set `timeout_s` with sleep in mind (a 6 h job on a box that sleeps 8 h WILL
   time out — see case 2), and prefer per-season jobs so any timeout loses at
   most one season.
2. **Box sleeps past the job's `timeout_s`.** `subprocess.run` timeout is
   wall-clock: on wake the runner kills the job, reports `status: failed`,
   `timed_out: true`, and pushes the result. The job is consumed, not retried.
   Recovery: Hatch resubmits a new job id with `--resume`; completed units skip,
   ungated units re-run. Cost: one season of re-validation, not re-fetch.
   Prevention: never-sleep setting on the box during backfill weeks, or
   `timeout_s` sized to the sleep window (e.g. 24–48 h for a PBP season job).
3. **Box reboots mid-job (or the runner process dies).** The runner loop
   (`tick`) only scans `jobs/pending/`; it has NO requeue path for a job that
   sits in `jobs/claimed/` with no result. A claimed job with a dead runner
   stays claimed forever — silent stall, not loud failure. Recovery is manual:
   Hatch notices (claimed job with no result past its `timeout_s` + a poll
   interval), then resubmits as a new job id with `--resume` (or, equivalently,
   moves claimed→pending by hand — the resubmit is cleaner because it preserves
   the audit trail). Detection rule for the coordinator: every claimed job gets
   a watchdog deadline (`claimed_at` + `timeout_s` + 1 poll cycle); a job past
   its deadline with no result is declared stuck and resubmitted. This
   watchdog is a coordinator procedure, not runner code — the runner must not
   be "fixed" to auto-requeue, because auto-requeue would hide the double-fetch
   bug that duplicate detection (§3e) exists to catch.
4. **Runner starts only at Windows login.** After any reboot, nothing resumes
   until someone logs in on the box. The "never-sleep + logon task" setup is a
   box-side prerequisite for backfill weeks, not a Hatch-side fix. If the logon
   task is registered, the runner self-recovers at next login; if not, recovery
   waits for hands on the box.

### 3e. How a resumed job proves it did not double-count

Proof is by gate recount, never by trusting the resume path. After any resume,
the season/game must pass ALL of:

- **G-1 file integrity:** sha256 in metadata equals sha256 recomputed from file
  bytes; file parses fully (JSON/JSONL line by line, no truncated tail).
  Mismatch → quarantine (move to `quarantine/` under the same version, never
  delete — a quarantined file is evidence), season/game ungated, fetch re-queued.
- **G-3 schedule-set equality (zero tolerance for final seasons):** the set of
  distinct GAME_IDs in the season's file(s) EQUALS the fetched schedule list
  for that season. Missing IDs are enumerated, not counted. "95% complete" is
  reported as INCOMPLETE with 5% enumerated, never rounded up.
- **G-6 duplicate detection:** no duplicate (GAME_ID, PLAYER_ID) player-game
  rows (gamelogs); no duplicate actionNumber within a game (PBP); no duplicate
  (game, shot sequence) rows (ShotChartDetail); no game ID appearing in two
  seasons' directories. Dedup is NEVER automatic: a human-reviewed re-fetch (or
  a coordinator-approved dedup script run as a new version) resolves it.
  Automatic dedup would hide the double-fetch bug that caused it.
- **Count reconciliation in the wave manifest:** `n_rows` / `n_games` /
  `n_actions` in metadata must equal the counted content of the file (the gate
  recounts). A resumed season's manifest must show: units present before resume
  + units fetched by the resume job = schedule total, with the resume job id
  recorded. If the arithmetic does not close, the season does not gate.

The cross-check that catches silent double-counting across sources: where two
sources cover the same game (BBR vs ESPN snapshots), zone-share agreement
within a few points is checked; the 545-vs-546 record difference on 2026-10-20
is the prototype — a 1-record difference is a signal to record, not an error
to "fix" by hand. Large disagreement quarantines the disagreeing source's game
for review, not for silent averaging.

## 4. Storage sizing (all ESTIMATES with method, from measured anchors)

Measured anchors (all read 2026-10-26/27 from the mlops-v2 checkout):

| Anchor | Measured value |
|---|---|
| PBP, 5 games (`pipeline/cache/cdn_pbp/`) | 2,217,615 bytes total = 2.11 MB; avg 443,523 bytes/game; 3,152 actions total; 593–667 actions/game |
| Shot snapshots, 3 games, per source (`pipeline/shotcharts/snapshots/`) | BBR 195,198 bytes / 545 records; ESPN 194,805 bytes / 546 records → ~358 bytes/record, ~65,100 bytes/game, ~182 shots/game |
| Base/summary cache, 30 seasons (`pipeline/cache/`, `du -sh`) | 105 MB total = 788 files; per-season `base_<season>.json` ~47–61 KB |
| Row master (`assets/vectors.json`) | 12,966 player rows, 30 seasons → ~432 player-seasons/season |
| Gamelog rows per season | ~26,000 regular-season player-game rows/season (2023-24 file composition cited in INVENTORY §3a) |
| Playoff gamelogs already present | 30/30 seasons, 4,880 team-game rows + 50,356 player-game rows (re-validate, do not blindly re-fetch) |
| Game-count yardstick (estimating ONLY, never a gate) | ~36,900 regular-season games over 30 seasons (inventory arithmetic); gates use fetched schedule lists |

### 4a. Estimates

| Corpus | ESTIMATE | Method |
|---|---|---|
| Game logs, 30 seasons (regular-season) | ~160–270 MB total (~5–9 MB/season) | 26,000 rows/season × assumed 250–350 bytes/row of 18-column JSONL (assumption stated because no gamelog JSONL exists in this checkout to measure — Wave 1 season 1 replaces the assumption with a measured bytes/row). 30 × 26,000 = 780,000 rows. Playoff gamelogs already present are EXCLUDED from this number (they exist; re-validate only). |
| Shot snapshots, all games, all seasons (canonical JSONL) | ~2.4 GB regular-season + ~0.2 GB playoffs/play-in ≈ ~2.6 GB | 36,900 games × 65,100 bytes/game (measured snapshot rate). ShotChartDetail NATIVE raw will differ (per player-season grain, LOC_X/LOC_Y + zone fields, not canonical JSONL) — the snapshot number is the canonical-format yardstick, not a ShotChartDetail forecast. |
| PBP, all games, all seasons | ~16.4 GB regular-season + ~1.1 GB playoffs/play-in ≈ ~17.5 GB | 36,900 games × 443,523 bytes/game (measured PBP rate). Playoff adder: ~2,440 playoff games (4,880 team-game rows / 2 teams per game) × 443,523 ≈ 1.08 GB. Play-in/Cup games add further; the fetched schedule lists set the true count. |
| Current cache, for scale | 105 MB | Measured. The three corpora above are ~1.5–2.5× (gamelogs), ~25× (shot snapshots), and ~165× (PBP) the ENTIRE current cache. PBP alone dwarfs everything else — it is the storage decision, not an afterthought. |
| Base/summary caches | Unchanged (105 MB, v0, read-only) | No re-fetch planned; grandfathered. |

### 4b. Where each corpus lands, and why the grain separation matters

| Corpus | Home (versioned layout) | NOT here, and why |
|---|---|---|
| Gamelogs (regular) | `pipeline/cache_v1/v1/gamelogs/regular/<season>/gamelogs_<season>.jsonl` + `.meta.json` | NOT `pipeline/data/` (the old fetcher's OUT dir; absent in this checkout) and NOT `pipeline/cache/` (v0, grandfathered read-only, no fetch metadata). One season = one directory: a mixed-season file cannot be gated per season. |
| Gamelogs (playoffs) | `pipeline/cache_v1/v1/gamelogs/playoffs/<season>/playoff_games_<season>.json` + `.meta.json` (migrated copy of the v0 file, or re-fetch) | Migration ONLY by copy + measured metadata (sha256 computed at copy time, fetch date marked `unknown — migrated from v0`, never invented). |
| Shot snapshots (BBR/ESPN) | Working dir: `pipeline/shotcharts/snapshots/<source>/shotcharts-<YYYYMMDD>.jsonl` + `manifests/<source>/shotcharts-<YYYYMMDD>.manifest.json` (existing format, extended with `source_url`, `machine`, `route`, `code_version`); versioned home: `pipeline/cache_v1/v1/shotcharts/<source>/<date>/shotcharts-<date>.jsonl` + manifest | NOT the served tree until PUBLISH allowlists it: served snapshots are `<500KB/date` budget-gated, and historical backfills stay OUT of `assets/` + `public/` until allowlisted. One date = one snapshot: the date grain matches the checkpoint grain and the served budget grain. |
| ShotChartDetail (native) | `pipeline/cache_v1/v1/shotcharts/stats_nba/<season>/shotchartdetail_<season>.jsonl` + `.meta.json` (native LOC_X/LOC_Y kept intact) | NEVER mixed with canonical snapshots: native fields live in their own file; conversion to canonical feet/hoop-origin happens in a separate versioned derivation under `derived/shotcharts_canonical/`, never by overwriting raw. |
| PBP | `pipeline/cache_v1/v1/pbp/<season>/playbyplay_<gameId>.json` + `.meta.json` | NEVER multi-game bundles: a bundle cannot be resumed per game or gated per game. One game = one file, always. Raw keeps statscapture x/y + xLegacy/yLegacy + verbatim `description` text; dedup tables and canonical conversions live in `derived/` only. |
| Schedules | `pipeline/cache_v1/v1/schedules/<season>/schedule_<season>.json` + `.meta.json` | The expected-count authority for G-3; kept apart from the corpora it gates so a schedule failure blocks cleanly. |
| Probes | `pipeline/cache_v1/v1/probes/<source>_<date>.json` | One file per probe run (machine + URL + status + counts). |
| Wave reports | `pipeline/cache_v1/v1/manifests/wave_<n>_<family>.json` + regenerated `coverage.json` (the living inventory) | The wave manifest is the audit trail: seasons gated, seasons incomplete with missing IDs enumerated, failures listed, mask consequences stated. |
| Derived (all conversions, dedup tables, rollups) | `pipeline/cache_v1/derived/` (sibling of raw, never a replacement) | Deleting `derived/` must never lose data — it rebuilds from raw + code version. Deleting raw loses data permanently. |

Why grain separation matters, in one paragraph: the gate that proves a corpus is
complete operates at exactly one grain (season for gamelogs, game for PBP, date
for snapshots), and the resume unit must equal the gate unit — otherwise a
resume cannot prove what it re-fetched, and a gate cannot name what is missing.
A multi-season file cannot be gated per season; a multi-game bundle cannot be
resumed per game; a mixed-coordinate file cannot be schema-gated per system.
The layout enforces the proof structure; it is not cosmetic.

## 5. Versioned-cache design

### 5a. Naming

- Snapshots: `shotcharts-<YYYYMMDD>.jsonl` + `shotcharts-<YYYYMMDD>.manifest.json`
  (existing shotchart format, kept). Gamelogs: `gamelogs_<season>.jsonl` +
  `gamelogs_<season>.meta.json`. PBP: `playbyplay_<gameId>.json` +
  `playbyplay_<gameId>.meta.json`. Schedules: `schedule_<season>.json` +
  `.meta.json`. Filenames carry season + game ID + source: a file whose name
  does not say what it is fails the schema gate.
- Served copies (only on QA PASS + allowlist): `assets/data/shotcharts/<source>/`
  + `public/` mirror, with `LATEST.json` per source pointing at the newest
  manifest. Historical backfills stay out of the served tree until allowlisted.
- Versioning: `v1` is the first versioned generation. A re-fetch of a FINAL
  season (correction, not refresh) creates `v2/<same path>` and leaves `v1`
  intact; the active-version pointer is a single file,
  `pipeline/cache_v1/ACTIVE_VERSION` (content: `v1`, later `v2`), changed only
  by the coordinator. In-progress seasons (2026-27 tail) do not version-bump:
  re-fetched in place until final, with `complete: false` throughout.

### 5b. Manifest / metadata (every raw file carries this, no exceptions)

| Field | Rule |
|---|---|
| `source` | Human source name, e.g. `stats.nba.com playergamelogs via nba_api`. |
| `source_url` | Exact request URL or endpoint + parameters. A meta file without a URL FAILS the gate. |
| `fetched_at` | UTC ISO 8601. `unknown — migrated from v0` ONLY for migrated v0 copies, never for new fetches. |
| `machine` | `nugatron` / `mac` / `hatch` — the route from §1. A file claiming a machine that cannot reach its source fails review. |
| `route` | `forge:<job-id>` / `mac-operator` / `hatch-direct`. The Forge job id is the JOIN KEY to the job result and to the provenance lane's ledger (see §5c). |
| `season` | Season key `YYYY-YY`; must match the directory season or the gate fails. |
| `game_id` | For PBP/shot files: 10-digit NBA game ID, or `native_id` + `id_system` where the source has no NBA ID (BBR slugs, ESPN IDs — join needs the registry, with ambiguous-name masking). |
| `n_rows` / `n_games` / `n_actions` | Must equal the counted content of the file — the gate recounts. |
| `sha256` | SHA-256 of the raw file bytes, computed at write time, verified at every read. Mismatch = file changed after fetch → quarantine, do not use. Snapshot output is deterministic (records sorted by game_id, period, clock, player_id, x, y) so the sha256 is stable across runs. |
| `complete` | `true` ONLY for final seasons/games that passed every gate. In-progress seasons are `false` until final. |
| `schema_version` | E.g. `gamelogs-v1` (18 KEEP columns), `pbp-statscapture-v1`, `shotchartdetail-v1`. A schema change bumps the version; old files are NOT rewritten to it. |
| `code_version` | Fetcher script path + repo commit the fetch ran from (Forge jobs pin this in their result). |
| `notes` | Plain-words anomalies, e.g. `zone-only era: LOC_X null for all rows`. A note never excuses a failed gate; it explains a passed one. |

The existing shot-snapshot manifests (BBR/ESPN, 2026-10-20) already carry source,
date, fetched_at, sha256, records, games, players, QA verdict, pipeline_version
(`1.0.0`) — they are the template. Extend them with `source_url`, `machine`,
`route`, `code_version`; do not replace their format.

### 5c. Link to the provenance ledger (not a duplicate of it)

The provenance lane owns the ledger schema and the provenance gate. This design
does NOT duplicate that schema. It supplies the join keys the ledger consumes:
`source_url` + `machine` + `route` (`forge:<job-id>`) + `code_version` + `sha256`
+ `fetched_at`, on every file. A file without those keys cannot be entered in
the ledger; a ledger entry without a matching file + manifest is an orphan and
fails review. The wave manifests (§4b) are the per-wave roll-up the ledger
indexes; the per-file manifests are the evidence.

## 6. Validation gates that fail loud (per stage)

No gate has a "warn and continue" mode. A gate that fails stops the season/family
at that gate: later gates do not run on failed input, and the season/family is
not usable downstream until the gate passes. Every failure is recorded in the
wave manifest with season, family, gate ID, expected vs observed, and files
involved.

| Stage | Gate(s) | What each gate refuses to do |
|---|---|---|
| FETCH | BlockedError → honest 503, exit 2 (`pipeline/shotcharts` dispatcher: 0 ok · 1 QA FAIL · 2 fetch error · 3 source gated). Transient → jittered backoff (see §2c). 403 → stop + reroute, never retry-loop. 429 → stop season, back off, next-day resume. Stall/000 → stop + reroute. | Refuses to retry a 403 into a block, to hammer through a 429, to retry from the wrong machine, or to write a partial file for a failed fetch. A failed season/game writes NOTHING (no partial file, no placeholder). |
| VALIDATE | Shot QA (3 gates, `common/qa.py`): schema (all required fields + types; `\|x\| ≤ 30`, `0 ≤ y ≤ 47`; `made` bool; `period` 1–7; `shot_type` ∈ {2PT, 3PT}); row-count sanity (shots/game within [80, 350]; an NBA game lands ~170–210); spot-sample (re-fetch one game from the source, compare record count + key-set hash; mismatch → FAIL). BBR adds geometry: median \|computed radial − reported ft\| ≤ 1.5 ft or FAIL (markup change, not bad data — measured median 0.25 ft, p90 0.41 ft on 2026-10-21). Cache gates G-1–G-8 (CACHE_VALIDATION_DESIGN §3): integrity, schema, season completeness, PBP action-count sanity (593–667 band as sanity flag, NOT hard rule — dense actionNumbers + consistent scores pass outside the band with a note; a gap inside the band fails), coordinate non-null rates, duplicate detection, schema drift, identity-join readiness (person_id, never name). | Refuses to publish on any FAIL (PUBLISH never runs); refuses to silently drop bad rows and pass the rest; refuses to coerce types silently (a string PLAYER_ID that "usually parses" is a schema failure); refuses to fix null coordinates by filling them (rates are measured and reported; the tower mask is set from them downstream). |
| NORMALIZE | Schema mismatch → FAIL. Native coordinate fields kept intact in their own file; canonical conversion is a separate versioned derivation. | Refuses to overwrite raw with converted values; refuses to join PBP x/y to ShotChartDetail LOC_X/LOC_Y as if one field (different systems: statscapture-court vs LOC_X/LOC_Y); refuses to mix coordinate systems in one file without labeling. |
| SNAPSHOT | Deterministic sort → stable sha256; manifest written with source, date, fetched_at, sha256, records, games, players, QA verdict, pipeline_version. Re-verify: manifest sha must equal recomputed file sha. | Refuses to write a snapshot on QA FAIL (dispatcher `snapshot` stage returns 1, "QA FAIL — snapshot not written"); refuses to treat a checkpoint as proof without sha verification (re-run of a completed date re-verifies the snapshot sha). |
| PUBLISH | Runs ONLY on QA PASS. Served copies under `assets/` + `public/` + `LATEST.json`. Served snapshot per date <500KB or an explicit allowlist note in the PR. | Refuses to serve a failed snapshot; refuses to serve historical backfills until allowlisted; refuses live client-side fetch where CORS forbids it (stats.nba.com sends no `Access-Control-Allow-Origin` → degrade to latest snapshot with a "through <date>" label; ESPN allows it). |
| INTEGRATE (build) | `build_vectors.py` refuses to write when any season/source is incomplete WITHOUT `--allow-partial` (raises FetchError, exit 2, naming every problem season/source; hint: restore caches or rerun, or pass `--allow-partial`). `stage_contract.py` exits 2 on drift vs `pipeline/contracts/train_matrix.contract.json`: row count moved >1%; column list/order changed or a column moved families; any family's coverage fell >5 points; any column's zero fraction rose >10 points; ordered player_id\|season keys changed (except via `--allow-key-change`, for a deliberate identity fix). `rebuild_all.py` stops at the first nonzero exit; its matrix stage ends with `integrate_context` + `stage_contract --stats-out`, and a refused promotion stops the run before any export. | Refuses to write vectors/matrix past a gap silently; refuses `--accept-drift` as a quiet fix (it rewrites the contract ONLY as a reviewed diff of the committed file, after printing what it accepts); refuses to `--accept-drift` a constant-column defect (an observed column holding one value over MIN_CONSTANT_OBSERVED+ rows is a matrix defect, not drift — it fails until someone writes down why); refuses `--allow-partial` as a default (it is a deliberate flag that PRINTS `WARNING (--allow-partial): <key>: <why>` per missing item + `seasons left out of this build: [...]` — the warnings ARE the audit trail, and a build that needed them is labeled partial wherever its output is cited). |

### 6a. The never-synthesize rule (binding, restated for this design)

NEVER synthesize, proxy-fill, impute, interpolate, or carry-forward missing data.
A missing season stays missing and is reported, with its downstream mask
consequence stated. Concretely forbidden: filling a missing gamelog season from
season-summary dashboards (aggregates, not per-game lines); filling a missing
shot-coordinate season from shot-type mix or another season's zone shares;
filling missing PBP games from box scores, replays, or template positions
(replay staged positions are animation, never training input); filling a
missing early era with a later era's distribution, or a missing player with a
"similar player's" shots; writing a 0, a mean, or a league average into a raw
file and calling it observed. Masked (0.0 value + mask 0) happens ONLY in the
derived feature matrix, never in the raw cache. If no real source supplies a
season, the honest outcomes in order are: (1) try the alternate real source
(Wave 5); (2) declare the season missing for that family, mask it downstream,
and report it. The success criterion is a truthful coverage table, not a full
table.

### 6b. Open items this design does NOT decide (for the coordinator, before waves start)

1. Access-posture decision per NBA source (gate 0a) — without it, no NBA-feed wave.
2. ShotChartDetail request shape (P-0a) — sets Wave 3 job grain and calendar.
3. PBP artifact transport at 16+ GB (per-season git pushes vs named box-side path + arranged pull) — decide before Wave 4.
4. PBP feed winner (P-0d: statscapture vs cdn liveData) — the 5 existing files'
   own metadata says statscapture; the bulk feed must be re-verified, not assumed.
5. `pipeline/cache_v1/` root name is provisional until the coordinator pins it;
   the structure, not the name, is the contract.
6. The 2026-27 tail refresh cadence — the shotchart standard leaves scheduling to
   Cameron's follow-up decision; this design creates no cron.

## Verdicts

VERDICT: PASS — machine lanes grounded in code/docs — ~/workspace/mlops-v2-drafts/data-deep-dive/collection-infra.md
VERDICT: PASS — schedule + calendar estimates labeled with method — ~/workspace/mlops-v2-drafts/data-deep-dive/collection-infra.md
VERDICT: PASS — resume design proves no double-count via gate recount — ~/workspace/mlops-v2-drafts/data-deep-dive/collection-infra.md
VERDICT: PASS — storage estimates extrapolated from measured anchors — ~/workspace/mlops-v2-drafts/data-deep-dive/collection-infra.md
VERDICT: PASS — versioned-cache + fail-loud gates at each stage — ~/workspace/mlops-v2-drafts/data-deep-dive/collection-infra.md
VERDICT: BLOCKED — ShotChartDetail calendar finalized — ~/workspace/mlops-v2-drafts/data-deep-dive/collection-infra.md

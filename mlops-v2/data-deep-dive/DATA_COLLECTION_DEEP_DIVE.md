# DATA COLLECTION DEEP DIVE — synthesis of 11 parallel investigations

**Date:** 2026-10-26/27 · **Coordinator:** data-collection deep-dive (fan-out, user order 2026-10-26 22:45 CDT)
**Scope:** read-only investigation + tiny single-request probes only. NO bulk fetch, NO live writes,
NO training, NO prod writes. Every lane file lives under
`~/workspace/mlops-v2-drafts/data-deep-dive/`.
**Ground truths built on (not re-derived):** verified 73-column base matrix (12,966 rows, offline
rebuild exit 0); 143-column HEAD contract UNVERIFIED as a build; Hatch VM cannot fetch stats.nba.com
(stalls) or cdn.nba.com (403); real-data-only rule absolute (never synthetic, never proxy-filled).
**Two corrections to prior brief shorthand, from the lanes:** (1) the "70 missing columns" are a SET
DIFFERENCE, not a suffix — contract column order interleaves base and context columns; form 5 are
width-present in the base but VALUE-blocked (compute_form_features returns {} with no gamelogs), and
pedigree is 7 columns by the contract file, not 2. (2) The Hatch stall refined: today's probe shows
TLS-COMPLETE then zero bytes until timeout — not a handshake failure. nba_api offers zero transport
advantage on Hatch (same host/path/egress); headers cannot fix a handshake/tarpit stall.

## 1. Coverage matrix — per-era × source (HAVE / GAP / BLOCKED / ALTERNATE)

Seasons: 30 in the matrix (1996-97…2025-26) + 2026-27 (live/replay only, not training data).
Legend: HAVE = cached + verified · GAP = absent but fetchable · BLOCKED = absent + machine/access
barrier · ALT = alternate source exists (probe before adopting).

| Source | 1996-97…2012-13 | 2013-14…2014-15 | 2015-16…2025-26 | 2026-27 |
|---|---|---|---|---|
| Base/Advanced/Scoring/Bio (stats.nba.com) | HAVE (30/30 each) | HAVE | HAVE | GAP (not a matrix season) |
| BBRef advanced + per-game | HAVE (30/30 each) | HAVE | HAVE | GAP |
| Tracking aggregates (leaguedashptstats) | GAP (structural; masked, never backfilled) | HAVE (2013-14+) | HAVE | GAP |
| Wide-skills / hustle | GAP | GAP (2015-16 file exists but box_outs = 0; hustle era truly starts 2016-17; box-outs tracked from 2017-18) | HAVE (11 files; see box-outs caveat) | GAP |
| Team base/advanced | HAVE (30/30 each) | HAVE | HAVE | GAP |
| Team-season merges (team_season_*.json) | GAP (derivable offline from HAVE caches — Tier 0, zero network) | GAP (same) | GAP (same) | GAP |
| Playoffs / playoff games | HAVE (30/30 each) | HAVE | HAVE | GAP |
| Honors award files | HAVE (30, 1997…2026; 2026 marked complete) | HAVE | HAVE | GAP |
| Salaries (merged history + current) | HAVE (coverage 11,504/12,966 rows) | HAVE | HAVE | GAP |
| Draft history / pedigree inputs | HAVE | HAVE | HAVE | GAP |
| **Game logs (gamelogs_*.jsonl)** | GAP by design (no file; rows masked in FA2) | GAP by design | **BLOCKED — 11 files absent; operator machine only** | GAP |
| **Shot coords, ShotChartDetail** | **BLOCKED — endpoint never returned a byte to this project; era coverage UNVERIFIED** | **BLOCKED (same)** | **BLOCKED (same; "later seasons have coords" UNVERIFIED)** | GAP |
| Shot coords, BBR pages | ALT (probe: 1 page/season sample; pixel→feet verified 0.25 ft median on 1 date) | ALT (same probe) | ALT (same probe; 1-date prototype QA PASS) | HAVE (1 date: 2026-10-20, 545 records) |
| Shot coords, ESPN core API plays | ALT (probe: 5-season depth check; 1-date RMSE 0.75 ft) | ALT (same probe) | ALT (same probe; 1-date QA PASS) | HAVE (1 date: 546 records) |
| Shot coords, shufinskiy/nba_data | ALT (shotdetail 1996–2024 + datanba 2016+; one-season probe first) | ALT | ALT | GAP |
| **PBP events (stats-capture feed)** | **BLOCKED — historical coverage UNVERIFIED (0 historical seasons in cache)** | **BLOCKED (same)** | **BLOCKED (same)** | HAVE (5 games only, 2026-10-20/21) |
| PBP text (descriptions) | BLOCKED (same as PBP events) | BLOCKED (same) | BLOCKED (same) | HAVE (5 games; 203 masked templates / 3,152 actions) |
| **Per-frame trajectories** | **BLOCKED — NO public multi-season source exists** | **BLOCKED (same)** | **BLOCKED (same)** | **BLOCKED (same)** |
| Trajectories, frozen mirror | ALT (tiny: ~600 games of 2015-16 SportVU mirrors only) | ALT (same frozen sample) | GAP (no equivalent) | GAP |
| Tracking zone aggregates (leaguedashplayershotlocations) | GAP (public zone layer, uncached — intermediate between shotmix shares and per-shot coords) | GAP | GAP (same; probe-worthy) | GAP |

**What the matrix means:** the 73-column base is fully served by HAVE rows. The 143 chain needs
exactly one blocking fetch (gamelogs) + derivations + two decisions (honors semantics, width re-pin).
The shotpos tower needs probes before any backfill. The fine (location) level of the world model is
an EVENT-location predictor on any source above; continuous trajectories are NOT available at scale
by any route inventoried — that negative result is final unless a new source surfaces.

## 2. The gamelog block, closed as a list (lane 6)

One blocking fetch, 11 files: `pipeline/data/gamelogs_2015-16.jsonl` … `gamelogs_2025-26.jsonl`
via `fetch_gamelogs.py` → nba_api PlayerGameLogs, stats.nba.com, OPERATOR MACHINE ONLY, 18-column
KEEP schema (PLAYER_ID, GAME_ID, GAME_DATE, MIN, PTS, AST, OREB, DREB, STL, BLK, TOV, FGA, FG3A,
FTA, PLUS_MINUS, names, teams). All game types kept in-file; consumers filter to regular season
(`GAME_ID` prefix `002`) — EXCEPT roster_context, which does NOT filter (known skew: preseason/
playoff minutes inflate rotation minutes; confirm before trusting ROSTER_MIN_RANK).
Derived from gamelogs, in rebuild order: form_context (form 5), roster_context (roster 5 + team/system
join key), min_gp (career MPG/GP slopes), availability (injury 4), career_context (career 12, incl.
GP_RATIO), competition_context (competition 4, needs team_season). Freely derivable offline once
team_season merges run: team 5, system 6, playoffs 14, pedigree 7, honors 5 (file derivable; semantics
still open), salary market 4 (TEAM_PCT improves after roster returns). FA2 coverages are the success
criterion, NOT 1.0: form/competition/injury 0.3975, roster/team/system 0.2611 (gamelog-era limits).
Non-gamelog blockers surviving gamelog return: honors semantics (zero-fill ≈0.969 observed vs
mask-honest; decide + record BEFORE re-pinning), width re-pin (`stage_contract.py --accept-drift` on
a verified full rebuild; FA2 sha `60dba1cbeabd6e03` is UNVERIFIED as a build), roster 002-filter fix
(if adopted, BEFORE re-pin), 2025-26 non-finality until 2026-08-01, pre-2015 min_gp gap under
`--offline` (BBRef-aggregate adapter is a builder change, may lag; does not block width).

## 3. Ranked collection plan (probe-gated waves; machine per wave)

| Order | Wave | Machine | Gate before next wave |
|---|---|---|---|
| 0 | Tier 0 offline derivations: team_season merges (30 seasons, present caches) + base rebuild refresh. Zero network, zero decisions. | Hatch | team_season files exist; base matrix re-verified |
| 1 | PROBES (cheapest decisive first, one request per endpoint): (a) ShotChartDetail shape + 5-season sample (1996-97, 2005-06, 2013-14, 2020-21, 2024-25) for RQ-1…RQ-3; (b) stats-capture PBP historical 5-game sample for RQ-4; (c) BBR + ESPN 5-season depth samples for RQ-5; (d) one-season artifact probes: shufinskiy shotdetail/datanba, Kaggle game-log candidates (§1b/§1c). | Clean machine (Alienware/Mac) for (a)/(b); Hatch allowed for (c)/(d) | Era table filled with evidence; request shapes + null rates recorded; NO backfill starts before probes |
| 2 | GAMELOGS: 11 files, 2015-16…2025-26, per-season jobs (partial coverage usable per season; do NOT re-pin on a partial set). | Alienware (Forge) / Mac | Per-season file present + schema check; then Tier-2 derivations in rebuild order (roster → min_gp → availability → career → form → competition → system) + playoffs/pedigree/honors/salary in parallel |
| 3 | SHOT BACKFILL (conditional on Wave 1): ShotChartDetail primary if probes show depth, else shufinskiy backbone + BBR/ESPN cross-check (RQ-6 zone-share agreement). Canonical JSONL snapshots, 5-stage contract, QA gates (schema, 80–350 shots/game, geometry ≤1.5 ft median for BBR). | Alienware/Mac (SCD); Hatch allowed for BBR/ESPN | One full season aggregated end-to-end + cross-checked between two sources; tower columns in a scratch manifest with masks matching the era table |
| 4 | PBP BACKFILL: ~36,900 regular-season games via stats-capture feed (format parity with the 5 cached games must be confirmed on historical sample first). | Alienware/Mac | Per-season gates (action-count sanity, dense actionNumbers, consistent scores, coordinate non-null rates, duplicate detection, identity-join readiness) |
| 5 | TARGETED BBR/ESPN gap-fill ONLY (gap dates/games from Waves 2–4). Blanket backfills NOT authorized (BBR blanket ≈37 h pacing → 2–4 days; ESPN blanket ≈61 h → 3–5 days; each needs separate review). | Hatch | Gap list closed, not date-range swept |
| ∥ | DECISIONS in parallel (not waves): honors semantics; width re-pin; roster 002-filter ruling; BBRef training-use legal read (see §5 risk 1); PBP transport decision (16+ GB through git is an OPEN GAP — per-season pushes vs named box-side path + arranged pull, decided BEFORE Wave 4) | — | Each decision recorded in writing before its dependent step runs |

## 4. Storage + schedule estimates (all ESTIMATE, method stated)

| Corpus | ESTIMATE | Method (measured anchor) |
|---|---|---|
| Game logs, 30 seasons (regular-season) | ~160–270 MB (~5–9 MB/season) | 26,000 rows/season × assumed 250–350 bytes/row of 18-col JSONL (assumption — no gamelog JSONL exists to measure; Wave 1 season 1 replaces it). 780,000 rows. Playoff logs already present, excluded. |
| Shot snapshots, all games all seasons (canonical JSONL) | ~2.4 GB regular + ~0.2 GB playoffs/play-in ≈ ~2.6 GB | 36,900 games × 65,100 bytes/game (measured snapshot rate). ShotChartDetail NATIVE raw will differ (per player-season grain) — this is the canonical-format yardstick, not an SCD forecast. |
| PBP, all games all seasons | ~16.4 GB regular + ~1.1 GB playoffs/play-in ≈ ~17.5 GB | 36,900 games × 443,523 bytes/game (5 cached games: 2.11 MB total, 593–667 actions/game). Playoff adder: ~2,440 games × same rate. |
| Current cache, for scale | 105 MB (measured) | The three corpora are ~1.5–2.5× (gamelogs), ~25× (shots), ~165× (PBP) the ENTIRE current cache. PBP is the storage decision. |
| PBP text after dedup | 203 templates / 3,152 actions (measured); 46 templates cover 85.7% of actions; dedup 15.5× (measured) | Embed templates once + structured slots (player, clock, score, coordinates), not per-action descriptions. Coordinates exist ONLY on FG actions (897/3,152); shotDistance on 901 (897 FG + 4 heaves). |

Schedule (ESTIMATE, pacing floors + box-uptime risk): gamelogs <1 day elapsed if probes pass
(19 calls + sleeps ≈ minutes of pacing); ShotChartDetail 1–3 days elapsed IF per-player-season calls
(~12,900 calls ≈ 3.6 h pacing floor) — minutes if per-season bulk calls; PBP 2–7 days elapsed
(36,900 requests × ≥1 s ≈ 10.3 h pacing floor + 16+ GB download), plan 1 week to absorb sleep/reboot
risk; end-to-end realistic ~2–3 WEEKS elapsed (probes + access decision + per-season gates +
box-uptime risk + artifact pull), NOT 2–3 days. Gamelogs are the fast wave; PBP + box reliability are
the long pole. Per-season jobs let a dead week resume without rework; gate-recount proves no
double-count (duplicate GAME_ID rows, duplicate actionNumbers).

## 5. Top 5 risks, each with a falsifiable check

1. **BBRef AI-training ban (NEW, highest legal risk).** Sports Reference's published data-use page /
   Terms §5 item 11 expressly bars using its content for AI-model training; under a strict reading it
   reaches BBRef-fed MTNN training (advanced, per-game, honors, positions, salaries-backfill all
   BBRef-fed). Robots.txt permitting /boxscores/ is NOT a license. CHECK: a legal read on derived-
   embedding use; until it lands, BBRef-fed families are UNCLEARED for training (cross-check use is
   the safe posture). NBA primary terms and ESPN current terms are likewise UNVERIFIED; salary
   upstream is unidentified (composite: unattributed pre-2018 core + BBRef backfill + BBRef current).
2. **Hatch egress is a tarpit, not throttling.** TLS completes, then zero bytes until timeout;
   no 429 exists to back off from; nba_api changes nothing. CHECK: a clean-machine probe returns
   bytes for ShotChartDetail + PlayerGameLogs + PBP historical sample. If it does not, the plan
   re-routes to shufinskiy/BBR/ESPN — it does not retry from Hatch.
3. **No trajectories at scale (fine-level ceiling).** Only a frozen ~600-game 2015-16 SportVU mirror
   corpus is public; Second Spectrum raw frames are partner-only; academic sets are unreleased.
   CHECK: the inventory result stands unless a new source surfaces with a verifiable probe. Until
   then the fine level is an EVENT-location predictor (next shot / next event), and ghost/coach/Live
   claims stay gated behind the rung-1 next-shot demo.
4. **Shot era boundary unknown (SCD never returned a byte).** "Later seasons have coordinates" is
   UNVERIFIED in every season. CHECK: Wave-1 5-season probe records HTTP status, row counts, and
   LOC_X/LOC_Y null rates per season. Until it runs, the shotpos era mask is 0 for every row — a
   tower with an unverified era table is worse than no tower (mask-as-era-signal).
5. **PBP scale + box reliability.** 17.5 GB, ~36,900 requests, Alienware sleeps at login-gated
   runner restarts, and git-as-conveyor-belt does not carry multi-GB raw files (open design gap).
   CHECK: transport decision recorded before Wave 4; per-season jobs + gate-recount resume proof;
   never-sleep setting or equivalent during backfill weeks. If the box lane dies mid-Wave-4, Waves
   2–3 (gamelogs, shots) still land — the plan degrades gracefully by wave, not all-or-nothing.

Also flagged (not top 5, still gated): roster 002-filter skew; honors semantics; 2025-26 non-finality
to 2026-08-01; hustle-era correction (box-outs 0 in 2015-16/2016-17, tracked from 2017-18 — any
"11 seasons of hustle" claim including 2015-16 box-outs is false); PBP format parity across 30
seasons UNVERIFIED (no historical CDN file in cache); PBP conversion check discrepancy to reconcile
(shot lane: median radial error 0.022 ft on 897 FG; cdn-pbp lane: 0.0002 ft by a different check —
reconcile method before baking either into the tower; both agree conversion works, magnitude TBD).

## 6. What explicitly NOT to collect or trust

- Pixel sprite positions as data (animation, never training input); shot-type shares as location;
  tracking aggregates as trajectories or as shot coordinates.
- Random-projection expansion, zero-filling, proxy-filling, or `--allow-partial` run silently.
- BBRef per-game aggregates as a gamelog substitute (no PLAYER_ID/GAME_ID-002 join keys); replay
  files as a PBP backfill source (lossy, zero-gain derivative); cached bbref_per_game as per-game logs.
- Beuoy LOESS-modelled shooting trajectories (modelled shape prior, not per-shot data) under the
  real-data-only rule; Kaggle narrow/derived shot sets as coordinate sources; balldontlie free tier
  for game logs/PBP/coordinates; pbpstats live package as an independent path; "basketball-database"
  as a distinct source (none found); BigDataBall coordinates behind paywall + unverified license.
- nba_api as a Hatch workaround (KEEP only as the clean-machine client).
- Blanket BBR/ESPN backfills without separate review; any evasion (header rotation, residential
  egress, headless-browser workarounds, fingerprint spoofing) around the NBA bot blocks.
- Redistributing raw scraped tables verbatim; claiming 120 as a width, 143 as verified, or
  trajectories as available; quoting LLM Muon/speed claims for this CPU program (out of scope here,
  recorded for the build lanes).
- The 11-feature proxy (unlabeled family means) as a training matrix; 2K ratings, betting odds, and
  Wikipedia bios as train inputs (excluded by design; Wikipedia texts are eval-only).

## 7. Synthesis verdicts

VERDICT: PASS — 73-column base fully served by cached sources — ~/workspace/mlops-v2-drafts/data-deep-dive/DATA_COLLECTION_DEEP_DIVE.md §1
VERDICT: BLOCKED — 143-column chain on exactly one fetch (11 gamelog files, operator machine only) + honors-semantics decision + width re-pin — ~/workspace/mlops-v2-drafts/data-deep-dive/game-logs-gap.md
VERDICT: BLOCKED — ShotChartDetail coverage in every season before 2026-27 (endpoint never returned a byte; probes required) — ~/workspace/mlops-v2-drafts/data-deep-dive/shot-coordinates.md
VERDICT: PASS — PBP legacy coordinate conversion verified on cached corpus (magnitude to reconcile: 0.022 ft vs 0.0002 ft by different checks) — ~/workspace/mlops-v2-drafts/data-deep-dive/shot-coordinates.md
VERDICT: BLOCKED — historical PBP coverage (0 historical seasons in cache; format parity unverified) — ~/workspace/mlops-v2-drafts/data-deep-dive/cdn-pbp.md
VERDICT: BLOCKED — multi-season public per-frame trajectories (only frozen 2015-16 SportVU mirrors exist) — ~/workspace/mlops-v2-drafts/data-deep-dive/tracking-data.md
VERDICT: PASS — PBP text dedup design (203 masked templates / 3,152 actions; embed templates once, 15.5×) — ~/workspace/mlops-v2-drafts/data-deep-dive/pbp-text-corpus.md
VERDICT: BLOCKED — program cleared for BBRef-fed training (Sports Reference Terms §5 item 11 AI-training ban; legal read required) — ~/workspace/mlops-v2-drafts/data-deep-dive/provenance-legal.md
VERDICT: PASS — ranked probe-gated collection plan with storage/schedule estimates and fail-loud gates — ~/workspace/mlops-v2-drafts/data-deep-dive/collection-infra.md
VERDICT: PASS — open-alternative keep/kill table (shufinskiy backbone + Kaggle game-log probes lead; nba_api clean-machine-only; no trajectory source) — ~/workspace/mlops-v2-drafts/data-deep-dive/open-alternatives.md

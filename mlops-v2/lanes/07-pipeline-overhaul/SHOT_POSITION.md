# Lane 07 — Pipeline Overhaul: Shot-Position Sourcing Plan

**Lane:** 07 pipeline overhaul · **Status:** PLAN ONLY (no collection
run, no tower built, no training) · **Date:** 2026-10-26 ·
**Read first (standing verdict):**
`~/workspace/your_files/shots/shot-source-verdict.md` (2026-10-11) and
the gated source stubs `pipeline/shotcharts/sources/stats_nba.py` and
`nba_cdn.py` (recon 2026-10-21) in the `vector-hoops-mlops-v2` checkout.

**Headline, honestly:** today the model knows *what kind* of shots a
player takes but not *where* he takes them. No historical
shot-location cache exists on this VM. Three candidate sources exist,
two of them with working one-date prototypes on this VM — but none
with verified historical coverage. Every coverage claim below is
either measured on this VM or labeled UNVERIFIED with the exact check
that would verify it. Do not quote this plan as "shot data available."

## 1. What the current shotmix family actually is (and is not)

The contract (§0) calls shotmix "10 features." The built manifests
say otherwise, and the manifests win:

- **Base rebuilt manifest (verified 2026-10-26, scratch run): 13
  shotmix columns:** PCT_AST_2PM, PCT_AST_3PM, PCT_AST_FGM,
  PCT_PTS_2PT, PCT_PTS_2PT_MR, PCT_PTS_3PT, PCT_PTS_FB, PCT_PTS_FT,
  PCT_PTS_OFF_TOV, PCT_PTS_PAINT, PCT_UAST_2PM, PCT_UAST_3PM,
  PCT_UAST_FGM.
- **HEAD contract manifest (143 columns): the same 13 columns.**
- **Source:** all 13 come from the stats.nba.com Scoring dashboard
  (`dashscoring_*.json`, 30 files, 1996-97…2025-26, 4.37 MB).

What these 13 columns measure: **shot TYPE mix only** — shares of
points from 2PT / mid-range 2PT / 3PT / fast break / free throws /
off turnovers / paint, and assisted vs. unassisted shares of made
2s, 3s, and field goals. `PCT_PTS_PAINT` is the closest any column
gets to location, and it is still a share of points, not a coordinate:
it cannot distinguish a player who lives at the rim from one who
lives at the elbow, a corner-3 specialist from an above-the-break
shooter, or a mid-range artist from a floater merchant. **No column
carries a floor coordinate, a zone, or a distance.** The "10 vs. 13"
count discrepancy is itself a symptom: the contract's family counts
are the v4 explainer's, not the built manifests'. The new tower
below is specified against the built 13, and the contract's shotmix
count should be corrected to 13 when the width is re-pinned.

## 2. Candidate sources, with verification status

### 2.1 stats.nba.com ShotChartDetail — the reference source, UNVERIFIED from this VM

- **Why it is first:** the 2026-10-11 verdict calls it "the only
  surface that carries the exact coordinates the collector parses."
  The Court Lab collector's contract needs per-shot `LOC_X`,
  `LOC_Y` (tenths of feet), `SHOT_MADE_FLAG`, and `SHOT_TYPE`.
  ShotChartDetail is the endpoint designed for exactly this: one row
  per shot, per player-season, with coordinates, zone fields, and
  distance.
- **Status from this VM: GATED / UNVERIFIED.** Two independent probes
  agree:
  - 2026-10-11 (Hatch VM): both probes stalled — zero bytes, read
    timeouts at 15 and 30 seconds, not even a status code. No 429,
    no throttle signal: the requests just die.
  - 2026-10-21 (recon, recorded in `pipeline/shotcharts/sources/
    stats_nba.py`): every request under `/stats/*` (including
    `/stats/shotchartdetail`) tarpits to HTTP 000 — the TCP/TLS
    handshake never completes — while the site root
    (`stats.nba.com/`) returns HTTP 200 fine. The stub's diagnosis
    is path-level bot-drop, not a generic outage.
  - The stub also records a **ToS caveat**: stats.nba.com's terms
    restrict automated access to the stats endpoints, so even a
    working technical path needs a ToS review before any fetch is
    wired. A technical fix alone does not clear the gate.
- **Mechanism (named, per the task):** from the Hatch VM, stats
  endpoints are bot-dropped at the handshake (HTTP 000 tarpit) and
  CDN endpoints are refused by Akamai Bot Manager (HTTP 403, §2.3).
  Neither is throttling — there is no backoff that helps, and
  retrying from this VM wastes the budget. Collection must run on a
  machine with clean NBA access: Alienware (Forge lane) or Mac
  (fallback), per the standing verdict. The stub's retry procedure
  is: re-probe ONLY if the access posture changes (approved API key
  or official feed); no IP rotation, fingerprint spoofing, or
  headless-browser evasion — the gate is deliberate and the
  no-evasion rule holds.
- **What is UNVERIFIED about ShotChartDetail itself:** because no
  request has ever completed from this VM, the following are
  research questions, not facts: the exact response field list for
  this project (zone fields, distance field, and whether LOC_X/LOC_Y
  are present for all seasons or only recent ones); the earliest
  season that returns per-shot rows; the per-season row counts; and
  the null rate of LOC_X/LOC_Y by season. See §3 for the checks.

### 2.2 Play-by-play shot locations (NBA stats-capture feed) — VERIFIED for 5 games, UNVERIFIED as history

- **Measured on this VM:** `pipeline/cache/cdn_pbp/` holds 5 files
  (2.11 MB) from `api.nba.com/statscapture/games/<id>/playbyplay`,
  games `0022600001/2/3/85/86` (2026-10-20/21). Across the 5 games:
  3,152 actions, **897 field-goal actions, and all 897 carry `x`
  and `y`** (0 missing `personId` among field goals). Each FG action
  also carries `shotDistance`, `shotResult` (Made/Missed),
  `actionType` (2pt/3pt), `subType` (Jump Shot, Layup, DUNK, …),
  and `personId` (NBA PLAYER_ID — directly joinable, no name
  resolution needed).
- **Coordinate system — two pairs, conversion UNVERIFIED:**
  - `x`/`y`: range x 2.79…97.96, y 0.0…99.18 across the 897 shots —
    a 0–100 scaled court system, not feet.
  - `xLegacy`/`yLegacy`: e.g. (246, 15), (100, 242), (-28, -5) —
    consistent with a tenths-of-feet system (hoop at origin), but
    this is an inference from magnitudes, not a verified conversion.
  - **Confirming check:** for each FG action, compute the radial
    distance from the converted legacy coordinates and compare it
    to the action's own `shotDistance` field; agreement within
    rounding (and within the canonical court bounds |x| ≤ 30 ft,
    0 ≤ y ≤ 47 ft) verifies the conversion. Until that check runs,
    PBP coordinates are "present but unconverted" — never feed raw
    0–100 values into a feature as if they were feet.
- **Historical coverage: UNVERIFIED.** The 5 files are opening-week
  2026-27 games fetched through the live-capture feed. Whether the
  same feed (or an archive of it) serves past seasons, and in what
  coordinate system, is unknown from this VM. **Confirming check:**
  request one completed game from each of 1996-97, 2005-06,
  2013-14, 2020-21, and 2024-25 through the same feed on the clean
  machine and record HTTP status, action counts, and coordinate
  presence per game. Five games answer the era question; a full
  backfill must not start before they do.

### 2.3 NBA CDN live feeds (`cdn.nba.com`) — BLOCKED from this VM

- **2026-10-11 verdict:** both probes refused instantly, HTTP 403
  in ~0.5 s — a hard bot block, not throttling; retrying is pointless.
- **2026-10-21 recon** (`pipeline/shotcharts/sources/nba_cdn.py`):
  `cdn.nba.com/static/json/liveData/*` returns HTTP 403 "Access
  Denied" served by Akamai Bot Manager — fingerprint/behavior-based
  edge enforcement, not a missing resource. Re-probe at most
  quarterly or on a concrete announcement (e.g. NBA publishes an
  open endpoint or grants this project's egress), with a single
  plain GET; no header rotation, residential egress, or
  headless-browser workaround.
- **Standing:** the CDN is not a collection path from this VM today,
  and it is not the path the PBP files above came from (those came
  from `api.nba.com/statscapture`, a different host). Do not conflate
  the two hosts when reporting "NBA blocked us."

### 2.4 Basketball-Reference shot charts — WORKING prototype, one date

- **Measured on this VM:** `pipeline/shotcharts/snapshots/bbr/
  shotcharts-20261020.jsonl` — 545 records, 3 games, 62 players,
  manifest QA PASS (schema, row counts, spot sample, geometry).
  Canonical records carry `x`/`y` in feet (hoop at origin, +y toward
  half-court), `shot_zone` (Restricted Area / In The Paint (Non-RA)
  / Mid-Range / Corner 3 / Above the Break 3), `shot_type` (2PT/3PT),
  and `made`.
- **Coordinate provenance — derived, but validated:** BBR plots shot
  dots as pixel positions on a court image; the source module
  converts pixels to feet with an empirically fit hoop origin
  (HOOP_X_PX 239.87, HOOP_Y_PX 30.68, PX_PER_FT 9.962, fit over 111
  shots). Verification on one game (202610200DET, n = 171 shots):
  median |computed radial − BBR-reported distance| 0.25 ft, p90
  0.41 ft. The module re-checks this geometry every run and FAILS
  loudly if median error exceeds 1.5 ft (markup change, not bad
  data). This is the strongest coordinate validation on the VM —
  but the coordinates are still *derived from a chart image*, not
  measured by a tracking system, and that distinction belongs in the
  tower's provenance note.
- **Join key problem:** BBR player IDs (`tatumja01`) are NOT NBA
  PLAYER_IDs. Joining to (`person_id`, `season`) requires the
  identity registry plus a BBR→NBA ID map, with ambiguous names
  masked for both players (Lane 2 §4.4). A BBR-only tower that joins
  on display name is a bug, not a shortcut.
- **Coverage: one date only.** Historical backfill is this source's
  stated strength (BBR serves shot-chart pages per game back
  through its archive), but no backfill has run. **Confirming
  check:** fetch one shot-chart page per season (same 5-season
  sample as §2.2) and record whether the page exists, whether shot
  dots parse, and the per-game record counts. BBR's own rate
  discipline (≤1 req/3 s, single-threaded, browser UA, documented
  in the module) makes a 30-season backfill a multi-day scheduled
  job, not an afternoon fetch — and its robots.txt posture
  (`/boxscores/` not disallowed, per the module) is a fact about
  robots.txt, not a license.

### 2.5 ESPN core API plays — WORKING prototype, one date

- **Measured on this VM:** `pipeline/shotcharts/snapshots/espn_plays/
  shotcharts-20261020.jsonl` — 546 records, 3 games, 62 players,
  manifest QA PASS. Same canonical schema as BBR (feet, zones,
  2PT/3PT, made). The two snapshots agree to within 1 record on the
  same date (545 vs. 546) — a useful cross-source sanity signal,
  not a proof (different game-ID schemes: BBR `202610200DET` vs.
  ESPN `401909088`).
- **Coordinate provenance — native feet, empirically verified:**
  ESPN charts shots in feet against the attacked basket
  (x_e ∈ [0, 50], y_e from the baseline, hoop at (25, 0)); the
  module's canonical transform (x_c = 25 − x_e, y_c = y_e) was fit
  against 415 ESPN-labeled distances across 3 games with RMSE
  0.75 ft (free fit 0.49 ft; round numbers adopted, residual
  attributed to label rounding). Spot checks in the module
  docstring tie labeled distances to computed radii within ~1 ft.
- **Exclusions (documented):** free throws excluded (ESPN ships
  sentinel coordinates for them); beyond-half-court heaves
  (y_e > 47) excluded by the QA gate; sentinel |coord| ≥ 1000
  excluded. The tower's FGA denominator is therefore *field-goal
  attempts*, and that must be stated wherever the tower is used.
- **Join key problem:** same as BBR — ESPN athlete IDs are not NBA
  PLAYER_IDs; registry resolution + ambiguous-name masking required.
- **Coverage: one date only; historical availability UNVERIFIED.**
  ESPN's core API serves completed games, but how far back its
  plays endpoint goes with coordinates is untested from this VM.
  **Confirming check:** same 5-season sample as §2.2/§2.4, plus a
  check that the plays endpoint still returns `coordinate.{x,y}`
  for the oldest sampled game. ESPN sends
  `Access-Control-Allow-Origin: *`, so live games can also be
  served client-side (assets/live-nba.js) — but live serving is a
  game-surface decision, not a training input, and must not be
  confused with the historical tower.

### 2.6 What is NOT a source (stated so it is never re-proposed)

- **Pixel sprite positions** (Pixel Replay / Live mini-figures):
  animation, not measurement — never training inputs (contract §6).
- **Shot-type shares** (the current shotmix 13): not location data,
  however finely split. Splitting PCT_PTS_2PT into more shares does
  not create a location feature.
- **Tracking data** (drives, touches, catch-and-shoot): movement
  data, not shot coordinates. It complements the shot tower; it
  does not substitute for it.

## 3. Era availability — research questions, not assumptions

Coordinate coverage by era is the open question contract §6 names.
The table below states what is known, what is asked, and what single
check answers each question. No row may be filled with "assumed
available" before its check runs on the clean machine.

| # | Research question | Why it matters | Exact confirming check |
|---|---|---|---|
| RQ-1 | Earliest season ShotChartDetail returns per-shot rows for a player-season | Sets the tower's era mask boundary | On the clean machine, one ShotChartDetail request per season (1996-97, 2000-01, 2005-06, 2010-11, 2015-16, 2020-21, 2024-25) for a fixed high-volume player; record HTTP status, row counts, and whether LOC_X/LOC_Y are null |
| RQ-2 | Are LOC_X/LOC_Y present (non-null) at the same rate in early seasons as in recent ones, or do early seasons return zones/distances only? | A zone-only early era means the coordinate-derived features (avg distance, zone FG% from coordinates) need a different mask than zone-share features | Same probe as RQ-1; record null rates per field per season |
| RQ-3 | Do ShotChartDetail zone fields (basic/area/range) exist for all seasons, or only some? | Determines whether zone shares can extend further back than coordinate features | Same probe; record which zone fields appear per season |
| RQ-4 | Does the stats-capture PBP feed serve historical games, and with coordinates? | PBP is the only source with NBA PLAYER_IDs natively; if it serves history it is the cleanest join | §2.2 five-game sample through the same feed |
| RQ-5 | How far back do BBR shot-chart pages and ESPN plays-with-coordinates go? | Determines whether the working prototypes can backfill, or only cover recent seasons | §2.4/§2.5 five-season samples |
| RQ-6 | For seasons where two sources overlap, do their zone shares agree (e.g. corner-3 share within a few points)? | Cross-source agreement is the only available accuracy check without ground truth | For one overlapping season, aggregate both sources to player-season zone shares and report mean absolute difference per zone |
| RQ-7 | What is the minimum-attempts threshold below which a zone FG% is noise? | Sets the per-feature mask rule (§4) | Empirical: zone FG% stability vs. attempts across the backfilled corpus; provisional threshold 10 attempts per zone (see §4), revisable on evidence |

**Until RQ-1…RQ-5 answer, the tower's era mask is 0 for every row.**
A tower with an unverified era table is worse than no tower: it
would let the model learn "has shot data = recent" as an era signal
without any of the basketball signal the tower promises.

## 4. The proposed NEW tower family: `shotpos`

**Position in the family order:** appended as a new family after
`shotmix` in the manifest (new families go last so every existing
column keeps its index — the same "shape is last" rule the base
build uses for additive columns). It does NOT replace shotmix; the
13 type-mix columns stay, and `shotpos` adds location.

**Proposed features (12, provisional pending RQ answers):**

| # | Feature | Definition | Mask rule |
|---|---|---|---|
| 1–5 | `SHOTPOS_RA_SHARE`, `SHOTPOS_PAINT_SHARE`, `SHOTPOS_MID_SHARE`, `SHOTPOS_CORNER3_SHARE`, `SHOTPOS_ATB3_SHARE` | Share of the player's field-goal attempts in each zone (Restricted Area / In The Paint non-RA / Mid-Range / Corner 3 / Above the Break 3). Shares sum to 1 over observed shots. | Observed iff the player-season has shot-location data AND total FGA ≥ 20 (below that, shares are noise — masked, not zero). |
| 6–10 | `SHOTPOS_RA_FGPCT`, `SHOTPOS_PAINT_FGPCT`, `SHOTPOS_MID_FGPCT`, `SHOTPOS_CORNER3_FGPCT`, `SHOTPOS_ATB3_FGPCT` | Field-goal percentage within each zone. | Observed iff zone attempts ≥ 10 (RQ-7 provisional); otherwise masked even when the zone share is observed. A zone with 0 attempts has its share observed (0.0 is a real share) and its FG% masked (0/0 is not 0%). This is the 0/0 rule from the base build's percentage handling, applied to zones. |
| 11 | `SHOTPOS_AVG_DIST` | Attempt-weighted mean shot distance in feet (from coordinates, or from the source's reported distance where coordinates are absent but distance is present — provenance noted per row). | Observed iff shot-location data present AND total FGA ≥ 20. |
| 12 | `SHOTPOS_RIM_OR_3_SHARE` | Share of attempts at the rim (RA) or from 3 (corner + above-break) — the "efficient zones" share. | Observed under the same rule as zone shares. (Derived from features 1–5; kept as an explicit column because tower ablations in Lane 5 operate per column, and this is the column a "Moreyball" ablation wants.) |

**Normalization:** same as every other family — within-season
z-scores over observed rows only, masked values stored as 0.0 with
mask 0, clipped at ±4σ (PIPELINE_DESIGN.md §3 S4). Zone shares are
proportions; they are z-scored like any other feature, not
logit-transformed, unless Lane 5 shows a reason (keep the convention
uniform until evidence says otherwise).

**Join:** (`person_id`, `season`).
- ShotChartDetail / PBP: PLAYER_ID is native — join directly, then
  verify against the identity registry (a PLAYER_ID mapping to two
  `person_id`s is a G-04 failure).
- BBR / ESPN: resolve source IDs to `person_id` through the
  registry; ambiguous names masked for both players (Lane 2 §4.4).
  The resolution map is itself a versioned artifact with its own
  sha256, filed with the tower's cache — never an inline lookup
  table in the builder.
- **Aggregation grain:** player-season totals over regular-season
  games only (playoff/All-Star/Cup rows excluded, following the
  base build's form-feature precedent — the 2023-24 gamelog file's
  2,078 preseason + 1,685 playoff rows beside 26,401 regular-season
  rows are the cautionary example). If a source cannot distinguish
  game type, that limitation is recorded in the tower's provenance
  note and the season is flagged, not silently included.

**Availability mask by era (to be filled by RQ answers, not now):**

| Era (provisional, UNVERIFIED) | `shotpos` family mask | Reason |
|---|---|---|
| Seasons before the earliest verified shot-location season | 0 for all rows | No source (structural absence, like tracking pre-2013) |
| Seasons with zone data but no coordinates | Shares (1–5, 12) observed where thresholds pass; coordinate-derived features (11, and any FG% computed from coordinates rather than counts) masked | Partial source — the mask distinguishes "zone known" from "location known" |
| Seasons with full coordinate data | Observed per the per-feature thresholds above | Full tower |

**How it joins the existing 17 families:** as family 18 (or 19th
counting the injury readout) in the manifest, with its own
`tower input cat([x·m, m])` block. The 17 existing families are
untouched — no existing column moves, no existing family is
renamed. The manifest's family-order rule (new families last)
guarantees that a matrix with `shotpos` and a matrix without it
share a common prefix, so Lane 5 ablations can compare "with tower"
vs. "without tower" by truncating columns, not by re-mapping them.

## 5. Collection plan (machine, order, and what "done" means)

1. **Machine decision first (coordinator + user).** Alienware
   (Forge lane) is the standing pick; Mac is the fallback. The
   decision must name the machine, because the Hatch VM cannot run
   this collection at all (§2.1/§2.3 mechanisms). Do not schedule
   collection on Hatch and hope.
2. **Probe before backfill (one day, five seasons).** Run RQ-1…RQ-5
   checks on the clean machine. Cost: a handful of requests. Output:
   the era table in §3, filled with evidence. If ShotChartDetail
   returns rows back to 1996-97, it is the primary source and
   BBR/ESPN become cross-checks (RQ-6). If it only returns recent
   seasons, BBR/ESPN backfill depth decides the tower's era boundary.
3. **Backfill in the shotchart pipeline's 5-stage contract**
   (FETCH → VALIDATE → NORMALIZE → SNAPSHOT → PUBLISH, per
   `pipeline/shotcharts/SHOTCHART_PIPELINE_STANDARD.md`): versioned
   JSONL snapshots per source per date-range, deterministic sort,
   stable sha256, QA gates (schema, row-count sanity 80–350 shots
   per game, spot-sample vs. source, geometry ≤ 1.5 ft median error
   for BBR). Snapshots land under `pipeline/shotcharts/snapshots/`
   (or the new pipeline's cache root), NOT under `pipeline/cache/`
   mixed with dashboard JSON — shot snapshots are a different
   grain (per-shot, per-game) and must not be mistaken for
   per-season aggregates.
4. **Aggregate to player-season, then join.** A separate, reviewed
   aggregation step converts snapshots to the 12 tower features per
   (person_id, season) with the §4 mask rules. Aggregation code and
   snapshot code are different review units: a bug in aggregation
   must not be able to corrupt a snapshot, and vice versa.
5. **"Done" means:** the era table filled from probes; one full
   season aggregated end-to-end and cross-checked between two
   sources (RQ-6); the tower's columns present in a scratch-built
   manifest with masks matching the era table; and Lane 5's
   mask-ablation test extended to `shotpos` (below). A backfill that
   has not passed QA gates is not "done" because files exist.

## 6. What breaks if coordinates are missing for early eras

This is not a hypothetical — it is the expected outcome for at
least the earliest seasons, and the design must survive it:

1. **Mask-as-era-signal (the big one).** Like tracking (pre-2013)
   and form (pre-2015), the `shotpos` mask becomes a near-perfect
   era indicator: "has shot data" ≈ "modern season." The model can
   learn era from the mask even though within-season z-scoring
   removes era from the values (Lane 2 §3.5). Mitigation is Lane 5's
   mask-ablation test, extended to `shotpos`: artificially mask a
   modern player's shot tower and measure how far its twins shift
   in era. If twins shift era dramatically, the headline metrics
   carry that caveat — the tower is not removed to hide the effect
   (removing the mask indicator would change the tower input shape
   and break v5 comparability).
2. **Cross-era twins lose a dimension for old players.** A 1998
   player's twins are computed without location signal while a 2024
   player's twins use it. Twin quality for pre-era players is
   therefore systematically less informed — Daily Court twin
   reveals and era-twin surfaces must not present pre-era and
   post-era twin lists as equally evidenced. (This is a Lane 6
   surface note, recorded here because the tower creates it.)
3. **Zone-share comparisons across the boundary are invalid.**
   A pre-era player's shotmix shares (type mix, available all 30
   seasons) and a post-era player's shotpos shares (location mix)
   are different quantities. Any analysis that splices them into
   one "shot profile" across the boundary is a category error.
4. **Partial-era towers (zones without coordinates) split the
   family.** If RQ-2 shows zones extend further back than
   coordinates, the family has two sub-eras with different observed
   columns. The manifest must record this per column, not per
   family — otherwise a "family observed" rate hides that half the
   columns are masked for a whole era.
5. **Collection risk concentrates in the clean machine.** If the
   Alienware/Mac lane goes down mid-backfill, the tower stalls —
   exactly as the 2026-10-11 verdict describes the Alienware box
   going quiet. Mitigation: snapshots are incremental and resumable
   (checkpoints per game, per the shotchart standard), so a stalled
   backfill resumes rather than restarts; and BBR/ESPN (which work
   from Hatch — their 2026-10-20 snapshots were fetched
   server-side here) provide a fallback path for recent seasons
   even if the NBA-source machine is down.
6. **Licensing/ToS posture differs per source and must travel with
   the data.** ShotChartDetail carries the stats.nba.com ToS caveat
   (§2.1); BBR carries a scraping + robots.txt posture, not a
   license; ESPN's core API is public and no-auth. The tower's
   manifest records the source per season — a season whose source
   changes (e.g. ShotChartDetail for 2020+, BBR before) must say so,
   because a future rights review may treat those seasons
   differently. A tower that hides its source mix is a liability,
   not an asset.

## 7. Verdict on feasibility (honest, as of 2026-10-26)

- **Prototype: feasible today.** Two working snapshot pipelines
  (BBR, ESPN) produced QA-passing canonical records for one date
  from this VM, and the PBP files prove the coordinate fields exist
  in the capture feed. A one-season `shotpos` tower for 2026-27
  could be built from existing snapshots + PBP as a prototype.
- **Historical tower: UNVERIFIED, gated on probes.** Nothing on this
  VM proves shot-location coverage for any season before 2026-27.
  The five-season probe set (RQ-1…RQ-5) is the next action, and it
  runs on the clean machine, not here.
- **ShotChartDetail as primary source: plausible, unproven.**
  It is the only source designed for this exact query, but it has
  never returned a byte to this project from any machine in the
  recorded probes. "First feed" (2026-10-11 verdict) means "try
  this first on the clean machine" — not "this works."

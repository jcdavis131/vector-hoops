# Shot coordinates — ShotChartDetail in depth

**Lane:** data-collection deep dive, shot-coordinates investigator ·
**Date:** 2026-10-26 · **Status:** READ-ONLY investigation (no bulk
fetch, no live-checkout write, no training, no prod write).
**Read first:** `~/workspace/mlops-v2-drafts/lanes/07-pipeline-overhaul/SHOT_POSITION.md`
(especially §2, §3 RQ-1..RQ-7, §4 shotpos tower) and
`~/workspace/your_files/shots/shot-source-verdict.md` (2026-10-11).
**In-repo stub:** `~/workspace/vector-hoops-mlops-v2/pipeline/shotcharts/sources/stats_nba.py`
— gated, honest 503; it carries NO field schema, NO parameter list,
and NO response example. Everything below about the endpoint's
schema comes from public endpoint documentation (hoopR / kenpomR
parameter lists, nba_api community usage), NOT from a response ever
observed by this project. That distinction is the whole point of
this file.

**Headline:** ShotChartDetail is still the only endpoint *designed*
for per-shot coordinates, and it has still never returned a byte to
this project from any machine in the recorded probes. The one thing
this investigation *did* verify on this VM, from already-cached
files, is the PBP legacy-coordinate conversion (§4): across all 897
cached field-goal actions, `hypot(xLegacy/10, yLegacy/10)` matches
the action's own `shotDistance` to a median error of 0.022 ft
(max 0.069 ft). That check is now MEASURED, not proposed — but it
verifies the PBP capture feed, not ShotChartDetail. Do not let it
launder ShotChartDetail coverage into "known".

## 1. LOC_X / LOC_Y semantics

### 1.1 What is KNOWN (project-measured or contract-stated)

- **Contract need (KNOWN, from the 2026-10-11 verdict):** the Court
  Lab collector parses per-shot `LOC_X`, `LOC_Y` (tenths of feet),
  `SHOT_MADE_FLAG`, `SHOT_TYPE`. That is the only part of the
  ShotChartDetail schema this project has ever asserted from its
  own parser contract.
- **Gate (KNOWN, measured 2026-10-11 and 2026-10-21):** from the
  Hatch VM, `stats.nba.com/stats/*` (including
  `/stats/shotchartdetail`) tarpits to HTTP 000 / zero bytes with
  read timeouts at 15 and 30 s, while the site root returns HTTP
  200. The in-repo stub's diagnosis is path-level bot-drop. CDN
  (`cdn.nba.com`) is a different host with a different failure
  (instant HTTP 403, Akamai Bot Manager) — do not conflate them.
- **ToS gate (KNOWN, from the stub):** stats.nba.com's terms
  restrict automated access to the stats endpoints. A working
  technical path on the clean machine does NOT by itself clear
  the gate; a ToS review is required before any fetch is wired.
  No IP rotation, fingerprint spoofing, or headless-browser
  evasion is permitted (standing no-evasion rule).

### 1.2 Endpoint identity and parameters (from public docs — NOT project-measured)

- **Endpoint:** `GET https://stats.nba.com/stats/shotchartdetail`
  (nba_api: `nba_api.stats.endpoints.shotchartdetail.ShotChartDetail`).
- **Response shape (documented, UNVERIFIED for this project):**
  two result sets, `Shot_Chart_Detail` (one row per shot) and
  `LeagueAverages` (per-zone FGA/FGM/FG_PCT aggregates). The
  per-shot column list, as documented by hoopR/kenpomR, is:
  `GRID_TYPE, GAME_ID, GAME_EVENT_ID, PLAYER_ID, PLAYER_NAME,
  TEAM_ID, TEAM_NAME, PERIOD, MINUTES_REMAINING,
  SECONDS_REMAINING, EVENT_TYPE, ACTION_TYPE, SHOT_TYPE,
  SHOT_ZONE_BASIC, SHOT_ZONE_AREA, SHOT_ZONE_RANGE,
  SHOT_DISTANCE, LOC_X, LOC_Y, SHOT_ATTEMPTED_FLAG,
  SHOT_MADE_FLAG, GAME_DATE, HTM, VTM`.
  **UNVERIFIED:** whether this project will see exactly this
  list — the first clean-machine probe (§3, Probe 0) must record
  the actual `headers` array verbatim and diff it against this
  list. Any missing/extra column is a finding, not a parsing bug
  to paper over.
- **Request parameters (documented defaults, UNVERIFIED for this
  project):** `ContextMeasure=FGA`, `LeagueID=00`,
  `PlayerID=<id>`, `Season=<e.g. 2024-25>`,
  `SeasonType=Regular Season`, `TeamID=0`, `LastNGames=0`,
  `Period=0`, `Month=0`, `OpponentTeamID=0`, `GameID=`,
  `DateFrom=`, `DateTo=`, `GameSegment=`, `Location=`,
  `Outcome=`, `PlayerPosition=`, `RookieYear=`,
  `SeasonSegment=`, `VsConference=`, `VsDivision=`.
  `ContextMeasure=FGA` is the load-bearing one: it selects field
  goal attempts (free throws are NOT in this result set — the
  shotpos tower's denominator is FGA, matching the ESPN
  prototype's exclusion). `SeasonType` must be `Regular Season`
  for the tower (playoffs excluded, per SHOT_POSITION §4);
  a separate `Playoffs` request is a different grain and must
  never be merged into a regular-season aggregate.
- **Headers (documented community practice, UNVERIFIED for this
  project):** browser `User-Agent`, `Referer:
  https://stats.nba.com`, `x-nba-stats-token: true`,
  `x-nba-stats-origin: stats`, `Accept: application/json`.
  The clean-machine probe must record exactly which headers it
  sent; if the probe succeeds, that header set becomes the
  recorded recipe. If it fails, the failure is evidence about
  access posture, not a licence to escalate headers.

### 1.3 Coordinate system, units, origin, sign conventions

| Property | Statement | Status |
|---|---|---|
| Units | `LOC_X`, `LOC_Y` are integers in **tenths of feet**: feet = value / 10. | DOCUMENTED (multiple community sources agree) / UNVERIFIED by project response |
| Origin | Basket centre, at the basket being attacked. | DOCUMENTED / UNVERIFIED by project response |
| `LOC_X` | Horizontal, left/right of the basket centre. Range −250…+250 (i.e. −25…+25 ft). Sign = left vs. right as seen attacking that basket; which side is negative is a plotting convention, not a basketball fact — the probe must record it, not assume it. | DOCUMENTED range / UNVERIFIED sign convention |
| `LOC_Y` | Vertical, distance from the baseline/basket toward half-court. Positive away from the basket. Small negative values occur for shots from behind the basket line (the PBP legacy data on this VM shows y down to −3.3 ft). | DOCUMENTED direction / UNVERIFIED exact range |
| `LOC_Y` range | **CONFLICT — unresolved, and the probe must resolve it.** Secondary sources disagree: one set reports 0…940 tenths (0…94 ft, i.e. a full-court canvas); another reports −47.5…422.5 in a rotated shot-log system; the PBP legacy coordinates actually cached on this VM span only −3.3…+36.3 ft in y, i.e. a basket-normalised half-court system. These cannot all describe the same field in the same normalisation. | CONFLICT / UNVERIFIED — see Probe 0 checks (c) and (d) |
| Basket normalisation | **UNVERIFIED — the most important open semantic question.** Either (A) all shots are flipped to one attacked basket, so `LOC_Y` stays within roughly 0…47 ft and `sqrt(fx² + fy²) ≈ SHOT_DISTANCE` for every row; or (B) shots are NOT flipped, so second-half / other-end shots sit near the far basket and radial distance from (0,0) fails for them while distance from the far basket (94 − fy) succeeds. The probe distinguishes A from B per row (§3, Probe 0 check d). Until it does, **no zone or distance may be derived from raw LOC_X/LOC_Y** — derive zones only from the endpoint's own zone fields, and treat coordinate-derived distance as suspect. | UNVERIFIED |
| `SHOT_DISTANCE` | Integer feet (contrast: PBP `shotDistance` is decimal feet, e.g. 24.624). Worked example from a public notebook: LeBron row `LOC_X=114, LOC_Y=148, SHOT_DISTANCE=18` → radial `sqrt(11.4² + 14.8²) = 18.68 ft`, i.e. 0.68 ft from the reported integer. A second row `(−7, 0) → 0` matches exactly. Lesson: do NOT expect nearest-integer agreement; expect truncation/rounding/measurement slack up to ~1 ft. | DOCUMENTED example / UNVERIFIED by project response |

### 1.4 Zone fields and how they relate to coordinates and distance

All three zone fields are **server-assigned categorical labels**,
not values this project computes. Their vocabularies (documented,
UNVERIFIED for this project):

- **`SHOT_ZONE_BASIC`** (6 values): `Restricted Area`,
  `In The Paint (Non-RA)`, `Mid-Range`, `Left Corner 3`,
  `Right Corner 3`, `Above the Break 3`. This is the field the
  shotpos tower's five zone shares map from: RA → RA,
  Paint (Non-RA) → Paint, Mid-Range → Mid, Left + Right Corner 3
  → Corner 3, Above the Break 3 → ATB3.
- **`SHOT_ZONE_AREA`** (5 values): `Center(C)`, `Left Side(L)`,
  `Right Side(R)`, `Left Side Center(LC)`,
  `Right Side Center(RC)`. Floor direction, independent of
  distance.
- **`SHOT_ZONE_RANGE`** (4 values): `Less Than 8 ft.`,
  `8-16 ft.`, `16-24 ft.`, `24+ ft.`. A binned version of
  `SHOT_DISTANCE`, independent of direction.

Relationships the probe must verify (all UNVERIFIED until Probe 0):

1. **Zone-from-coordinates consistency:** re-deriving
   `SHOT_ZONE_BASIC` from (LOC_X, LOC_Y) with the tower's zone
   boundaries should agree with the server label on ≥95% of
   rows. Disagreement concentrated at zone boundaries (rim arc,
   3-pt line) is expected; disagreement scattered across the
   floor means the coordinate normalisation hypothesis is wrong
   (see §1.3, hypothesis B) or the zone boundaries are wrong.
2. **Range-from-distance consistency:** `SHOT_ZONE_RANGE` must
   be the bin containing `SHOT_DISTANCE` on ~100% of rows
   (it is a binning of that field, so any mismatch is a data
   or parsing defect, not slack).
3. **Distance-from-coordinates consistency:** median
   `|sqrt(fx² + fy²) − SHOT_DISTANCE| ≤ 1.0 ft` and p90
   `≤ 1.5 ft` (integer-distance slack, §1.3), under the
   correct basket-normalisation hypothesis. A systematic
   signed bias (mean signed error beyond ±0.3 ft) indicates
   truncation rather than rounding and must be recorded, not
   averaged away.
4. **What zones buy if coordinates fail:** if RQ-2 (§2) shows
   an era with zones but null coordinates, the tower's zone
   shares (features 1–5, 12) can still be observed from
   `SHOT_ZONE_BASIC` alone, while `SHOTPOS_AVG_DIST` falls
   back to the mean of `SHOT_DISTANCE` (provenance-noted per
   row, per SHOT_POSITION §4) and any coordinate-derived FG%
   stays masked. Zones are therefore the tower's fallback
   grain, not a consolation prize — but only if Probe 0 shows
   zone fields are present and self-consistent in that era.

## 2. Availability by season — what "later seasons have actual shot coordinates" means

### 2.1 The honest answer

**There is no project-measured answer.** No ShotChartDetail
request has ever completed from this VM, for any season. The
phrase "later seasons have actual shot coordinates" (SHOT_POSITION
§2.1) is a *hypothesis to be tested*, not a finding, and it can
mean three different things that the probe must distinguish:

- **(H1) Hard boundary:** seasons before year X return zero
  per-shot rows (or rows with 100% null LOC_X/LOC_Y); seasons
  from X on return full coordinates.
- **(H2) Zone-only early era:** early seasons return per-shot
  rows with zones + distance but null/degenerate coordinates
  (the server kept zone labels from play-by-play text but had
  no tracked locations to attach).
- **(H3) No boundary at all:** coordinates extend to 1996-97
  (the archive claim below), and "later seasons" was just loose
  language for "the seasons anyone has bothered to check".

Only the probe (§3) can distinguish H1/H2/H3. Any document that
states a boundary year without citing a probe row is guessing.

### 2.2 External claim — useful as a prior, NOT as evidence

A third-party historical archive (shufinskiy/nba_data, documented
from its own build config) lists its `shotdetail` data type —
sourced from stats.nba.com, shot-level, "shot coordinates,
contexts, results" — as covering **1996-97 through 2024-25** for
the NBA, i.e. the same 1996-97 start as its box-score types.
That is consistent with H3 and with Basketball-Reference's
independent statement that comprehensive digitised play-by-play
(and hence shot charts) extends back to 1996-97. It is also
**EXTERNAL, not project-measured**: it describes that archive's
collection, not a ShotChartDetail response this project has seen,
and it says nothing about per-season null rates. Treat it as the
prior that H3 is plausible and H1's boundary (if any) needs a
positive demonstration, not as a coverage fact. The probe's job
is to confirm or refute it, season by season.

### 2.3 Era-availability table (to be filled by the probe — all rows UNVERIFIED today)

| Season | SCD rows? | LOC_X/LOC_Y null rate | Zone fields present? | SHOT_DISTANCE present? | Tier (per §3.5) | Status |
|---|---|---|---|---|---|---|
| 1996-97 | ? | ? | ? | ? | ? | UNVERIFIED — probe P1 |
| 2000-01 | ? | ? | ? | ? | ? | UNVERIFIED — bisect, only if P1/P2 disagree |
| 2005-06 | ? | ? | ? | ? | ? | UNVERIFIED — probe P2 |
| 2010-11 | ? | ? | ? | ? | ? | UNVERIFIED — bisect, only if boundary found between 2005-06 and 2013-14 |
| 2013-14 | ? | ? | ? | ? | ? | UNVERIFIED — probe P3 |
| 2015-16 | ? | ? | ? | ? | ? | UNVERIFIED — bisect, only if boundary found between 2013-14 and 2020-21 |
| 2020-21 | ? | ? | ? | ? | ? | UNVERIFIED — probe P4 |
| 2024-25 | ? | ? | ? | ? | ? | UNVERIFIED — probe P0 (schema anchor) |

**Known context rows (not SCD coverage):** the current shotmix
13 columns cover 1996-97…2025-26 from the Scoring dashboard —
that proves *type mix* exists for all 30 seasons, and proves
nothing about location. BBR/ESPN prototypes cover one date in
2026-27 only; PBP cached games cover opening week 2026-27 only.
Nothing on this VM proves location coverage for any season
before 2026-27, from any source.

### 2.4 Null-rate language (use exactly this in probe reports)

- **Full coordinates:** LOC_X and LOC_Y both non-null on
  ≥95% of rows → coordinate-derived features allowed.
- **Partial coordinates:** non-null on 50–95% → report the
  rate and the pattern (random vs. concentrated in a zone,
  team, or game type) before any use; do not silently drop
  null rows, because dropping is itself a selection bias.
- **Zone-only:** rows present, zones non-null ≥95%, but
  coordinates null on >50% (or the coordinate columns absent
  from `headers`) → zone shares allowed, coordinate features
  masked (SHOT_POSITION §4 partial-era rule).
- **Absent:** zero rows, or HTTP error, or 100% null
  coordinates *and* zones → era mask 0 for the whole family.
  (An HTTP error is an access finding, not a coverage
  finding — record it as such and do not convert it into
  "no data in that season".)

## 3. Clean-machine probe plan (answers RQ-1..RQ-7)

**Machine:** Alienware (Forge lane) first, Mac fallback — never
Hatch (bot-dropped, §1.1). **Gate before any probe:** ToS review
recorded (§1.1); if the review is not recorded, the probe does
not run. **Budget:** one request per probe step below, no
retries on a stall (a stall IS the result: record HTTP 000 /
timeout seconds and stop that step). **No bulk fetch:** these
probes are per-player-season singles, not a backfill. The
backfill decision waits for the filled §2.3 table.

### 3.1 Record per probe (every probe, no exceptions)

- Timestamp (UTC), machine, network path (Forge lane vs. Mac
  direct), exact URL + full parameter set, exact headers sent.
- HTTP status (or 000/timeout seconds), time to first byte,
  total bytes, `resultSets[0].headers` verbatim,
  `resultSets[1].headers` verbatim (LeagueAverages).
- Row count (Shot_Chart_Detail), distinct `GAME_ID` count.
- Null rate per field: LOC_X, LOC_Y, SHOT_DISTANCE,
  SHOT_ZONE_BASIC, SHOT_ZONE_AREA, SHOT_ZONE_RANGE,
  SHOT_MADE_FLAG, SHOT_TYPE.
- LOC_X / LOC_Y min, max, and percentiles (p1/p50/p99) in
  raw tenths and in feet; histogram of LOC_Y in feet
  (bins: <0, 0–8, 8–16, 16–24, 24–47, 47–94) — this histogram
  is what resolves the §1.3 range/normalisation conflict.
- Radial-vs-distance stats (§1.4 check 3) under BOTH
  hypotheses (single-basket radial; far-basket radial
  `sqrt(fx² + (94 − fy)²)` for rows with fy > 47 ft):
  median, p90, mean signed error, share within 1.0 ft.
- Zone-consistency stats (§1.4 checks 1–2).
- Cross-check: row count vs. that player-season's FGA from
  the existing dashboard cache (tolerance: within 20% for a
  full-season regular-season request; a larger gap means
  the request's filters differ from the dashboard's, and
  the parameter set — not the data — is suspect).
- Raw response saved verbatim (versioned snapshot, sha256
  recorded) — the probe output IS a snapshot, not a summary.

### 3.2 The 5-season sample set (primary) + bisect set

Primary set (matches SHOT_POSITION §2.2/§2.4/§2.5 so the
sources stay comparable): **1996-97, 2005-06, 2013-14,
2020-21, 2024-25**. Player per season: the season's
high-volume shooter resolved from the project's existing
dashboard/identity data at probe time (fixed rule: the
player-season with the most FGA in the dashboard cache for
that season, with a valid NBA PLAYER_ID in the registry).
Do NOT hardcode a 1996-97 player ID from memory — resolve
it. The one ID this investigation can cite from a tool
result is LeBron James, PLAYER_ID 2544 (appears in the
public notebook example for 2014-15); he is the probe
player for 2005-06, 2013-14, 2020-21, and 2024-25 only if
the registry confirms him as a high-volume shooter in each
of those seasons — otherwise the FGA-leader rule wins.
For 1996-97 the FGA-leader rule is mandatory (LeBron was
not in the league).

Bisect set (run ONLY if two adjacent primary seasons land
in different tiers, §3.5): 2000-01 (between 1996-97 and
2005-06), 2010-11 (between 2005-06 and 2013-14), 2015-16
(between 2013-14 and 2020-21). One probe per bisect season,
same player rule. The bisect stops when the boundary is
bracketed to a single season gap; it does not become a
full-season sweep.

### 3.3 Exact requests (cheapest decisive probe first)

Base URL for all: `https://stats.nba.com/stats/shotchartdetail`
with `ContextMeasure=FGA&LeagueID=00&SeasonType=Regular+Season&TeamID=0&LastNGames=0&Period=0&Month=0&OpponentTeamID=0&GameID=&DateFrom=&DateTo=&GameSegment=&Location=&Outcome=&PlayerPosition=&RookieYear=&SeasonSegment=&VsConference=&VsDivision=`,
plus `PlayerID=<id>&Season=<season>` per probe. Headers per
§1.2. Timeout: 60 s single attempt; on timeout record 000 +
elapsed seconds and STOP that step (do not retry from the
same machine — a repeat stall is the access finding).

| Order | Probe | Request (PlayerID rule + Season) | Decides |
|---|---|---|---|
| **P0 — first** | Schema anchor, modern season | `PlayerID=<FGA leader, 2024-25>&Season=2024-25` | Endpoint works at all on this machine? Exact `headers`? Coordinate range + normalisation (§1.3)? Zone/distance consistency (§1.4)? If P0 fails (000/403/timeout), STOP: the finding is access, not era, and no era probe can be interpreted until access is fixed. |
| P1 | Earliest boundary | `PlayerID=<FGA leader, 1996-97>&Season=1996-97` | RQ-1's lower bound. Rows + coordinates here → H3 gains; zero/null → H1 or H2, and P2/P3 locate the boundary. |
| P2 | Mid-2000s | `PlayerID=<FGA leader, 2005-06>&Season=2005-06` | RQ-1/RQ-2 midpoint. |
| P3 | Mid-2010s | `PlayerID=<FGA leader, 2013-14>&Season=2013-14` | RQ-1/RQ-2 midpoint; also the tracking-era boundary (SportVU from 2013-14) — a coordinate-quality break here would be informative even if rows exist throughout. |
| P4 | Recent | `PlayerID=<FGA leader, 2020-21>&Season=2020-21` | RQ-1/RQ-2 recent anchor; bridges P0's single player-season to a second modern season. |
| P5–P7 | Bisect (conditional) | One per bisect season (§3.2), only across a tier boundary | Narrows the boundary to one season gap. |
| P8 | LeagueAverages sanity (free) | No extra request: read `resultSets[1]` from P0–P4 | Confirms the second result set exists and its zone FGA sums are consistent with the detail rows (a mismatch is a parsing/schema finding). |

**RQ mapping:** RQ-1 (earliest per-shot season) ← P1 + bisects;
RQ-2 (coordinate null rate by era) ← null rates in P0–P4;
RQ-3 (zone-field presence by era) ← `headers` + zone null
rates in P0–P4. RQ-4/RQ-5 (PBP / BBR / ESPN historical depth)
are NOT ShotChartDetail probes — they are the sibling lanes'
five-season samples through their own feeds, and their
results must be filed alongside this table, not merged into
it. RQ-6 ← §5. RQ-7 ← §3.6 (empirical, post-backfill).

### 3.4 Order rationale

P0 first because a schema/access failure there invalidates
every era reading: a 1996-97 zero could otherwise be misread
as "no data in 1996-97" when the truth is "no access at
all". P1 second because the earliest season is the most
informative single era datapoint (it separates H3 from
H1/H2 in one request). P2–P4 then fill the curve; bisects
only where the curve actually steps. Total primary cost:
5 requests. Total worst case with bisects: 8 requests.

### 3.5 Decision thresholds (when a season counts as "coordinate-covered")

Apply per player-season probe, then confirm on a second
player-season in the same season before writing the season
into the tower's era mask (a single player's rows could be
an artefact; a season's mask needs two independent
player-seasons agreeing on tier):

- **COORD-COVERED:** HTTP 200, rows ≥ 100 for the probe
  player, LOC_X and LOC_Y null rates each < 5%, zone
  fields non-null ≥ 95%, radial-vs-distance median
  ≤ 1.0 ft under the correct normalisation hypothesis.
- **ZONE-ONLY:** HTTP 200, rows ≥ 100, zone fields
  non-null ≥ 95%, but LOC null rate > 50% (or coordinate
  columns absent from `headers`).
- **PARTIAL:** anything between (e.g. LOC null 5–50%):
  do NOT assign a tier from one probe — run the second
  player-season and report the null pattern (random vs.
  structured) before deciding.
- **ABSENT:** HTTP 200 with 0 rows, or rows present but
  zones and coordinates both ~100% null. (HTTP error /
  timeout is NOT "absent" — it is "access failed", and the
  season stays UNVERIFIED.)
- **Season tier = the tier both probe player-seasons agree
  on;** disagreement → PARTIAL + a third probe player
  before any mask is written.

### 3.6 RQ-7 note (minimum-attempts threshold)

RQ-7 cannot be answered by these probes: it needs the
backfilled corpus (zone FG% stability vs. attempts across
many player-seasons). The probes only set its input: the
provisional thresholds from SHOT_POSITION §4 (FGA ≥ 20 for
shares, zone attempts ≥ 10 for zone FG%) stand until the
corpus exists, at which point the empirical rule is:
for each zone, plot FG% standard error vs. attempts and
pick the smallest attempts value where the standard error
stops falling materially (elbow), per zone, and take the
max across zones as the single threshold — revisable on
that evidence, not on intuition.

## 4. The conversion question — PBP x/y vs. xLegacy/yLegacy

### 4.1 The three systems in the cached PBP files (measured on this VM)

From `pipeline/cache/cdn_pbp/` (5 games, 897 FG actions,
all with x, y, xLegacy, yLegacy — 0 missing):

- **`x` / `y`:** 0–100 scaled court system (measured ranges
  x 2.79…97.96, y 0.0…99.18 in SHOT_POSITION §2.2; re-checked
  on one game: x 3.62…96.78, y 2.85…99.16). **Do not use
  for features.** The mapping from 0–100 to feet depends on
  `side` (left/right) and on which basket is attacked, and
  no verified mapping is on file. Raw 0–100 values fed into
  a feet-denominated feature would be a units bug.
- **`xLegacy` / `yLegacy`:** integers in tenths of feet,
  the same system as ShotChartDetail's LOC_X/LOC_Y per the
  third-party field schema ("legacy/integer systems are
  identical"). Measured ranges across all 897 FG actions:
  x −25.0…+25.0 ft, y −3.3…+36.3 ft — a basket-normalised
  half-court system, NOT the 0…94 ft full-court canvas
  some secondary sources attribute to LOC_Y. That range
  mismatch is itself evidence that the 0…940-tenths claim
  describes a plotting canvas or an unnormalised variant,
  not the basket-relative coordinates in either feed's
  actual rows — and it is one more reason Probe 0 must
  record the LOC_Y histogram (§3.1).
- **`shotDistance`:** decimal feet (measured 0.0…28.748),
  the ground-truth anchor for the conversion check.

### 4.2 The exact check (already run on the cached 5 games)

For each FG action with non-null `xLegacy`, `yLegacy`,
`shotDistance`, compute:

```
fx = xLegacy / 10 ; fy = yLegacy / 10
radial = sqrt(fx^2 + fy^2)
error  = |radial - shotDistance|
```

and record: n, null counts, median error, p90, p99, max,
share within 0.10 ft, share within 0.25 ft; plus the
court-bounds check: share of actions with `|fx| ≤ 25 ft`
and `−5 ≤ fy ≤ 47 ft` (half-court bounds with a small
behind-basket allowance), listing any outliers with
game/action IDs.

**Result on the cached corpus (MEASURED 2026-10-26, this
VM, all 5 files):** n = 897, 0 missing; **median error
0.022 ft, p90 0.045 ft, p99 0.059 ft, max 0.069 ft;
100% within 0.10 ft; 100% within the court bounds.**
This VERIFIES the conversion `feet = legacy / 10` with the
basket at the origin for the PBP capture feed, at a
precision far beyond any feature's needs. The residual
(~0.02 ft median) is consistent with `shotDistance`
rounding, not with a wrong scale or a wrong origin:
a wrong scale (e.g. /100) or a wrong origin would
produce errors of feet, not hundredths.

### 4.3 Agreement threshold (for future PBP batches and for ShotChartDetail)

- **PBP (decimal `shotDistance`): VERIFIED iff** median
  error ≤ 0.10 ft AND p99 ≤ 0.25 ft AND 100% of actions
  inside the court bounds above. (The cached corpus passes
  at 0.022 / 0.059 / 100% — roughly 4× inside the bar.)
  A future batch failing this bar is a feed-change
  finding: stop, diff the feed schema, do not rescale
  silently.
- **ShotChartDetail (integer `SHOT_DISTANCE`): VERIFIED
  iff** median error ≤ 1.0 ft AND p90 ≤ 1.5 ft under the
  correct normalisation hypothesis (§1.3), with mean
  signed error reported separately (truncation vs.
  rounding). The looser bar is *only* because the
  distance field is integer feet — it is not a looser
  standard for the coordinates themselves.
- **What the radial check cannot verify:** left/right
  sign of x, and which-basket flipping. Radial distance
  is invariant to both. Those are verified by §1.4 check
  1 (zone-from-coordinates agreement ≥95%) and by §5
  (cross-source zone shares), not by distance. A
  conversion claim that cites only the radial check as
  proof of orientation is overstated — this file does
  not make it.

### 4.4 Canonical mapping for the tower

`x_canonical_ft = xLegacy / 10`,
`y_canonical_ft = yLegacy / 10`, hoop at origin, +y
toward half-court — the same convention as the BBR/ESPN
canonical records (feet, hoop at origin). No flip, no
scale, no side-dependent transform is applied to legacy
values: the measured y range (−3.3…36.3 ft) and the
radial check show they are already basket-relative.
If a future PBP batch shows a y range extending toward
94 ft, that batch is unnormalised and must be flipped
per `side` before use — and that flip must itself be
verified by the zone check, not assumed.

## 5. Cross-source agreement check — RQ-6 design

**Question:** for a season where ShotChartDetail and a
second source (BBR or ESPN) both cover the same players,
do their zone shares agree? This is the only accuracy
check available without ground truth.

### 5.1 Method

1. **Season + player set:** one overlapping season
   (first season where SCD is COORD-COVERED or ZONE-ONLY
   *and* the second source's five-season sample shows
   coverage — prefer the most recent such season, where
   all sources are strongest). Player set: players with
   FGA ≥ 100 in *both* sources that season (regular
   season only), joined on NBA PLAYER_ID for SCD/PBP and
   via the identity registry (never display name) for
   BBR/ESPN, with ambiguous names masked for both players
   (SHOT_POSITION §4 join rule).
2. **Aggregation (identical on both sides):** per player,
   count FGA per zone from the source's own zone labels
   (SCD: `SHOT_ZONE_BASIC` mapped 6→5 as in §1.4; BBR/ESPN:
   their canonical `shot_zone`), divide by that player's
   total FGA in that source. Do NOT re-derive zones from
   coordinates on either side for this check — re-derivation
   would test the tower's zone boundaries, not the
   sources' agreement. (A second, coordinate-derived
   comparison is a follow-up, not this check.)
3. **Comparison:** per zone (RA, Paint, Mid, Corner 3,
   ATB3) and per player, `diff = share_SCD − share_other`.
   Report per zone: mean diff (bias), mean absolute diff
   (MAD), p90 absolute diff, and Pearson correlation
   across players. Report overall MAD averaged over
   zones. Also report per-player total-FGA ratio
   (SCD FGA / other FGA) — a share agreement built on
   wildly different denominators is suspect.
4. **Stratify:** by FGA band (100–300, 300–600, 600+) and
   by zone (boundary-heavy zones — Corner 3 vs. ATB3,
   RA vs. Paint — are expected to disagree more than
   Mid-Range, because a few feet of coordinate error
   flips a boundary label; a uniform disagreement across
   all zones points to a join or grain error instead).

### 5.2 Tolerance (PASS / investigate / FAIL)

- **PASS:** per-zone MAD ≤ 3 percentage points for every
  zone, overall MAD ≤ 3 pp, |mean diff| ≤ 2 pp per zone,
  and per-player FGA ratio within 0.9–1.1 for ≥90% of
  players. Interpretation: sources interchangeable for
  zone shares; SCD may serve as primary with BBR/ESPN as
  cross-checks.
- **INVESTIGATE (do not ship on it):** any zone MAD in
  3–5 pp, or a single zone's |mean diff| > 2 pp (systematic
  bias, e.g. corner/ATB boundary drawn differently).
  Action: inspect that zone's boundary cases (shots
  within 1 ft of the boundary in the coordinate source)
  and check whether the disagreement is boundary noise
  (concentrated near the line → tolerable, note it) or a
  systematic label difference (spread across the zone →
  a mapping error to fix).
- **FAIL:** any zone MAD > 5 pp, or overall MAD > 5 pp,
  or FGA ratio outside 0.9–1.1 for >25% of players.
  Interpretation: the sources do not describe the same
  grain (game-type mix, join error, or zone-definition
  mismatch). The tower does NOT mix sources for that
  season; the season's source is recorded as single-source
  and the discrepancy is filed as a blocking finding for
  the coordinator.
- **Minimum n:** at least 50 players meeting the FGA ≥ 100
  rule in both sources; below that, report the MADs as
  provisional with the small-n caveat, not as a PASS.

### 5.3 What RQ-6 does not prove

Agreement between two sources is not ground truth: both
could share a bias (e.g. both deriving zones from the
same play-by-play text). A PASS licenses *mixing or
cross-checking* sources for zone shares; it does not
license coordinate precision claims, which rest on §4's
radial check (PBP) and §1.4's checks (SCD).

## 6. What would change this file

- Probe 0 returning bytes: fills §1.2/§1.3 (actual headers,
  LOC_Y histogram, normalisation hypothesis) and converts
  every DOCUMENTED/UNVERIFIED line above into MEASURED or
  REFUTED.
- P1–P4 returning rows: fills the §2.3 table and settles
  H1 vs. H2 vs. H3; a boundary found triggers the bisect
  set, and the tower's era mask is written from the
  filled table — never before.
- A ToS review outcome: either unblocks the clean-machine
  probes (record the approval + scope) or closes the SCD
  path entirely, in which case BBR/ESPN depth (RQ-5)
  decides the tower's era boundary and this file's probe
  plan becomes the record of a path considered and closed.

## Sources consulted

- SHOT_POSITION.md (2026-10-26) and shot-source-verdict.md
  (2026-10-11) — project ground truths cited above.
- `pipeline/shotcharts/sources/stats_nba.py` (vector-hoops-mlops-v2
  checkout) — gate + ToS posture; no schema.
- Public endpoint documentation (hoopR/kenpomR ShotChartDetail
  parameter + column lists; nba_api community usage; public
  notebook row example, LeBron 2544, 2014-15) — schema,
  parameters, zone vocabularies, coordinate units. All
  marked DOCUMENTED/UNVERIFIED above until Probe 0.
- Third-party archive documentation (shufinskiy/nba_data:
  `shotdetail` 1996-97…2024-25) — prior for H3 only.
- Cached PBP files, `pipeline/cache/cdn_pbp/` (5 games,
  897 FG actions) — §4 measurements run on this VM
  2026-10-26 for this file.

VERDICT: PASS — ShotChartDetail semantics documented with KNOWN/UNVERIFIED separation — ~/workspace/mlops-v2-drafts/data-deep-dive/shot-coordinates.md
VERDICT: PASS — era-availability table structured with decision thresholds, all SCD seasons UNVERIFIED pending clean-machine probes — ~/workspace/mlops-v2-drafts/data-deep-dive/shot-coordinates.md
VERDICT: PASS — clean-machine probe plan with exact requests, 5-season sample, cheapest-first order — ~/workspace/mlops-v2-drafts/data-deep-dive/shot-coordinates.md
VERDICT: PASS — PBP xLegacy/yLegacy conversion verified on cached corpus (897 FG, median error 0.022 ft) — ~/workspace/mlops-v2-drafts/data-deep-dive/shot-coordinates.md
VERDICT: PASS — RQ-6 cross-source agreement design with tolerances — ~/workspace/mlops-v2-drafts/data-deep-dive/shot-coordinates.md
VERDICT: BLOCKED — ShotChartDetail coverage for any season before 2026-27 remains unproven (endpoint never returned a byte to this project; probes require a clean machine + ToS review) — ~/workspace/mlops-v2-drafts/data-deep-dive/shot-coordinates.md

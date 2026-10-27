# Scope A — Versioned Cache + Validation-Gate Design

Follows the overhaul lane (contract §6): raw source → versioned
raw cache → validation gates (fail loud, never silent imputation)
→ era-normalized feature build → TWO outputs kept in contract
(the 14-d game vector AND the wide training matrix).
This document designs the cache and the gates. It does not fetch,
train, or write to production. No file described here is created
by this document; the layout is the contract the collection
waves (COLLECTION_PLAN.md) must satisfy.

Design principles (binding on any implementation of this design):
1. Raw files are immutable. A raw file is never edited, patched,
   or "fixed" in place. A correction is a new version.
2. Every raw file proves itself: source URL, fetch date,
   machine, row/game counts, and sha256 live beside it.
3. Gates fail loud: a failed gate blocks downstream use of that
   season/family and names the failure. No gate ever silently
   drops bad rows and passes the rest.
4. Derived files never overwrite raw files, and raw files never
   carry derived values (no imputation in raw — see the
   never-synthesize rule, COLLECTION_PLAN.md §6).
5. The current unversioned cache (`pipeline/cache/`, 788 files,
   mostly without fetch metadata) is grandfathered as v0 and
   read-only for the base build. Scope A writes go ONLY to the
   versioned layout below. Migrating v0 files into the versioned
   layout is allowed ONLY by copying + attaching measured
   metadata (sha256 computed at copy time, fetch date marked
   `unknown — migrated from v0`, never invented).

## 1. Cache layout (versioned, per-season, per-source)

Root (new, beside — never inside — the existing cache):
`pipeline/cache_v1/` (name provisional until the coordinator
pins it; the structure, not the root name, is the contract).

```
pipeline/cache_v1/
  v1/
    gamelogs/
      regular/<season>/gamelogs_<season>.jsonl
      regular/<season>/gamelogs_<season>.meta.json
      playoffs/<season>/playoff_games_<season>.json        # migrated copy of the v0 file, or re-fetch
      playoffs/<season>/playoff_games_<season>.meta.json
    shotcharts/
      stats_nba/<season>/shotchartdetail_<season>.jsonl
      stats_nba/<season>/shotchartdetail_<season>.meta.json
      bbr/<date>/shotcharts-<date>.jsonl
      bbr/<date>/shotcharts-<date>.manifest.json           # existing manifest format, extended with §2 fields
      espn_plays/<date>/shotcharts-<date>.jsonl
      espn_plays/<date>/shotcharts-<date>.manifest.json
    pbp/
      <season>/playbyplay_<gameId>.json
      <season>/playbyplay_<gameId>.meta.json
    schedules/
      <season>/schedule_<season>.json
      <season>/schedule_<season>.meta.json
    probes/
      <source>_<date>.json                                   # Phase 0 probe records
    manifests/
      wave_<n>_<family>.json                                 # per-wave completion report (see §5)
      coverage.json                                          # regenerated coverage table (the living INVENTORY_GAP_REPORT)
  derived/                                                    # NEVER raw: conversions, dedup tables, rollups
    shotcharts_canonical/<season>/...                        # feet/hoop-origin conversions (raw kept intact beside it)
    pbp_templates/<season>/...                               # Scope B template-dedup tables
    rollups/<season>/...                                     # per-player-season aggregates feeding the feature build
```

Rules for the layout:
- One season = one directory per family. No season's files ever
  share a directory with another season's files (a mixed file
  cannot be gated per season).
- One game = one PBP file. No multi-game PBP bundles (a bundle
  cannot be resumed per game or gated per game).
- Filenames carry season + game ID + source. A file whose name
  does not say what it is fails the schema gate.
- `derived/` is a sibling of the raw families, never a
  replacement for them. Deleting `derived/` must never lose
  data — it is rebuildable from raw + code version. Deleting
  raw loses data permanently.
- Versioning: `v1` is the first versioned generation. A
  re-fetch of a final season (correction, not refresh) creates
  `v2/<same path>` and leaves `v1` intact; the active version
  pointer is a single file, `pipeline/cache_v1/ACTIVE_VERSION`
  (content: `v1`, later `v2`), changed only by the coordinator.
  In-progress seasons (2026-27 tail) do not version-bump: they
  are re-fetched in place until final, with `complete: false`
  in metadata throughout.

## 2. Fetch metadata — every raw file carries this (no exceptions)

Each `.meta.json` / manifest beside a raw file contains:

| Field | Meaning | Example / rule |
|---|---|---|
| `source` | Human source name | `stats.nba.com playergamelogs via nba_api` |
| `source_url` | Exact request URL or endpoint + parameters | Full statscapture URL; ShotChartDetail endpoint + player/season params. A meta file without a URL fails the gate. |
| `fetched_at` | UTC timestamp of the fetch | ISO 8601. `unknown — migrated from v0` ONLY for migrated v0 copies, never for new fetches. |
| `machine` | Which machine fetched it | `nugatron` (Alienware) / `mac` / `hatch` — the route from COLLECTION_PLAN.md §1. A file claiming a machine that cannot reach its source fails review. |
| `route` | Handoff route | `forge:<job-id>` / `mac-operator` / `hatch-direct`. Forge job IDs link the file to its job result. |
| `season` | Season key `YYYY-YY` | Must match the directory season. Mismatch fails the gate. |
| `game_id` | For PBP/shot files | 10-digit NBA game ID (or BBR/ESPN native ID where the source has no NBA ID — then `native_id` + `id_system` are both recorded). |
| `n_rows` / `n_games` / `n_actions` | Counts, as appropriate | Must equal the counted content of the file (gate recounts). |
| `sha256` | SHA-256 of the raw file bytes | Computed at write time, verified at every read by the gate. A mismatch means the file changed after fetch: quarantine, do not use. |
| `complete` | Whether the season/game is final and fully fetched | `true` only for final seasons that passed every gate. In-progress seasons are `false` until final. |
| `schema_version` | The record schema the file follows | e.g. `gamelogs-v1` (18 KEEP columns), `pbp-statscapture-v1`, `shotchartdetail-v1`. A schema change bumps the version; old files are not rewritten to it. |
| `code_version` | Fetcher script + commit | Script path + repo commit the fetch ran from (Forge jobs pin this in their result). |
| `notes` | Anything unusual, in plain words | e.g. `zone-only era: LOC_X null for all rows` — a note never excuses a failed gate, it explains a passed one. |

The existing shot-snapshot manifests (BBR/ESPN, 2026-10-20)
already carry source, date, fetched_at, sha256, records,
games, players, QA verdict, and pipeline_version. They are
the template: extend them with `source_url`, `machine`,
`route`, and `code_version` — do not replace their format.

## 3. The gate list — each gate: check, failure mode, fail-loud behavior

Gates run in order. A gate that fails stops the season/family
at that gate: later gates do not run on failed input, and the
season/family is not usable downstream until the gate passes.
Every gate failure is recorded in the wave manifest (§5) with
season, family, gate ID, expected vs observed, and the file(s)
involved. No gate has a "warn and continue" mode.

### G-1. File integrity (sha256 + parse)

- Check: sha256 in metadata equals sha256 recomputed from the
  file bytes; the file parses fully (JSON / JSONL line by line,
  no truncated tail, no non-JSON line).
- Failure mode: bit-rot, truncated write, partial download,
  mid-write crash (the old failure mode the atomic-write rule
  exists to prevent).
- Fail-loud: quarantine the file (move to `quarantine/` under
  the same version, never delete — a quarantined file is
  evidence), mark the season/game ungated, re-queue the fetch.
  Downstream readers must refuse a file whose sha256 does not
  verify; they must not fall back to "the file looks fine".

### G-2. Schema (columns / fields / types)

- Check: every record carries the family's schema_version
  fields with the right types. Gamelogs: all 18 KEEP columns,
  PLAYER_ID int, GAME_ID str/int re-padded to 10 digits.
  PBP: actionNumber, clock, period, actionType, description
  present on every action; FG actions carry x/y (see G-5).
  ShotChartDetail: LOC_X/LOC_Y + SHOT_MADE_FLAG + SHOT_TYPE
  present as fields (null VALUES are a coverage fact, handled
  by G-5 — a missing FIELD is a schema failure).
- Failure mode: endpoint changed its response shape, fetcher
  wrote a new shape without bumping schema_version, or a
  season predates a field.
- Fail-loud: season/game ungated; the fetcher's schema_version
  must be bumped and the season re-fetched under the new
  schema, or the schema must be amended by design (coordinator
  decision) to mark the field era-gated. Never coerce types
  silently (a string PLAYER_ID that "usually parses" is a
  schema failure, not a cleanup step).

### G-3. Season completeness vs expected game counts

- Check: for gamelogs, the set of distinct GAME_IDs in the
  season's file covers the season's schedule list
  (`schedules/<season>/`) for regular-season games, within
  tolerance ZERO for final seasons: every scheduled
  regular-season game must appear (as at least the box-score
  presence of its player-games), and no game outside the
  schedule may appear except the documented non-regular types
  (preseason / All-Star / play-in / Cup / playoffs, which the
  fetcher keeps and readers filter). For PBP, the set of
  fetched game IDs must equal the schedule's game-ID set for
  the seasons/games in scope, again with zero tolerance for
  final seasons.
- Failure mode: partial fetch, season cut off mid-schedule,
  schedule source and game source disagreeing on game IDs.
- Fail-loud: season ungated, listed as incomplete with the
  missing game IDs enumerated (not just a count — the
  re-fetch needs the list). A season that is "95% complete"
  is reported as INCOMPLETE with 5% enumerated, never rounded
  up to complete. In-progress seasons are exempt from zero
  tolerance only while `complete: false`; the moment the
  season is final, zero tolerance applies.
- Note on expected counts: expected counts come ONLY from the
  fetched schedule lists (Phase 0 probe P-0g). No hardcoded
  1,230, no assumed 82 games, no remembered lockout calendar
  in the gate code. If the schedule source itself is suspect,
  that is a G-3 failure of the schedule, and it blocks the
  season's other gates until resolved.

### G-4. PBP action-count sanity

- Check: per game, action count within the plausible band
  learned from the 5 measured games (593–667 actions) AND
  internally consistent: actionNumbers form a dense sequence
  from the first action to the last with no gaps beyond
  documented feed behavior; period counts are consistent
  (period markers present, final period present); score
  progression is non-decreasing per team and ends at the
  game's final score where a final score is known (replay
  index / schedule).
- Failure mode: truncated game (feed cut off mid-game),
  duplicated actions (double-fetch merged), wrong game
  (game ID mismatch between filename and content).
- Fail-loud: game ungated and re-queued individually (PBP
  gates are per game, so one bad game never blocks a season's
  good games — but the SEASON is not "complete" until all its
  games pass). The plausible band is a sanity flag, not a
  hard rule: a game outside 593–667 with a dense action
  sequence and consistent scores passes with a note (overtime
  games legitimately run long); a game inside the band with
  a gap in actionNumbers fails.

### G-5. Coordinate non-null rates (per source, per season)

- Check: per season (ShotChartDetail) and per game (PBP):
  - ShotChartDetail: LOC_X/LOC_Y non-null rate over shot rows,
    SHOT_MADE_FLAG non-null rate, zone-field presence rate.
    Rates are REPORTED per season, and the season's tower mask
    is set from them (see §4). A season with 0 shot rows is a
    coverage failure (G-3 analogue for shots), not a 0% rate.
  - PBP: FG-action x/y non-null rate (measured baseline:
    100.0%, 897/897, on the 5 probe games). A fetched game
    below 100% on FG x/y is flagged and investigated — it
    may be a feed change (schema drift, G-6) or a genuine
    feed gap (then the game is ungated for shot use but may
    still pass for text/sequence use — the gate verdict is
    PER USE, recorded as such).
  - Cross-source (where two sources cover the same game):
    zone-share agreement within a few points (overhaul RQ-6);
    the 545-vs-546 BBR/ESPN difference on 2026-10-20 is the
    prototype of this check. Large disagreement quarantines
    the disagreeing source's game for review, not for silent
    averaging.
- Failure mode: coordinate field present but null (zone-only
  era, feed regression), coordinate system changed without
  notice, one source drifting from the other.
- Fail-loud: rates are never "fixed" by filling nulls. A
  below-threshold rate masks the affected tower features for
  that season (downstream, in the feature build) and is
  reported in the wave manifest. The threshold itself (e.g.
  the provisional 10 attempts per zone for zone FG%) is a
  design parameter owned by the overhaul lane, not by this
  gate — the gate measures and reports; the lane sets the bar.

### G-6. Duplicate-game / duplicate-row detection

- Check: within a season file, no duplicate (GAME_ID,
  PLAYER_ID) player-game rows (gamelogs); no duplicate
  actionNumber within a game (PBP); no duplicate (game, shot
  sequence) rows (ShotChartDetail); across the cache, no game
  ID appearing in two seasons' directories.
- Failure mode: double-fetch merged into one file, resume
  logic appending instead of replacing, game-ID season
  misassignment (e.g. a play-in game filed under the wrong
  season).
- Fail-loud: season/game ungated; the duplicate rows are
  listed (counts + IDs). Dedup is NEVER automatic: a human-
  reviewed re-fetch (or a coordinator-approved dedup script
  run as a new version) resolves it. Automatic dedup would
  hide the double-fetch bug that caused it.

### G-7. Schema drift detection (across fetches of the same source)

- Check: the field set + types of a newly fetched season/game
  equal the field set + types recorded for that source's
  schema_version. Any new field is recorded as an addition
  (tolerated, noted); any missing field or type change is a
  drift failure.
- Failure mode: the NBA changes a feed mid-collection (the
  exact risk of a 30-season bulk fetch), so late seasons
  silently differ from early seasons.
- Fail-loud: the drifting season/game is ungated under the old
  schema_version; the coordinator decides: bump schema_version
  and re-fetch affected seasons under it, or amend the schema
  by design. Late seasons are never silently normalized to
  early seasons' shape.

### G-8. Identity-join readiness (person_id, not name)

- Check: every record that must join to the row master
  carries a joinable ID in its native system (NBA PLAYER_ID
  for stats.nba.com / PBP; BBR slug / ESPN athlete ID for
  alternates, with `id_system` recorded). A record with only
  a name and no ID fails this gate for join purposes (it may
  still pass for game-level aggregates, recorded as such).
  Spot-check: no two distinct person_ids share one row's
  identity fields in a way the registry cannot resolve
  (the Dee Brown / Reggie Williams / Mike James / Chris
  Johnson same-name rule, contract §0).
- Failure mode: name-only joins merging distinct players,
  alternate-source IDs with no registry mapping.
- Fail-loud: unmapped-ID rows are listed and masked from any
  player-level feature until the registry maps them. They are
  never joined by name as a fallback.

### G-9. No-synthesis audit (the negative gate)

- Check: a sample of each season's raw files is inspected for
  values that could only come from filling: exact league
  means repeated across players, identical zone shares across
  unrelated players, 0.0 coordinates on made shots, or any
  value the fetcher code cannot produce from the source
  response. (This is a review gate, run by the coordinator or
  a lane reviewer on the wave manifest, not an automated
  statistical test with a fixed threshold.)
- Failure mode: a well-meaning "cleanup" step, or a fetcher
  bug, writing invented values into raw.
- Fail-loud: any confirmed synthesized value quarantines the
  whole file and triggers a re-fetch + a review of the
  fetcher code that produced it. This gate exists because the
  other gates check shape and counts, not honesty.

## 4. How a validated cache unblocks the 143-column chain

The 143-column full-context chain (HEAD contract manifest) =
73-column base + 70 context-merge columns. The 70 columns come
from side builders whose inputs are, per the overhaul lane's
OFFLINE_REBUILD_REPORT.md: gamelog-derived context files
(form, roster, career, competition, minutes/attempts) plus
the context-merge step (`integrate_context.py` / `rebuild_all.py`).
The mapping from Scope A files to side builders:

| Scope A file family | Side builder(s) it feeds | What it unblocks |
|---|---|---|
| `gamelogs/regular/<season>/` (gated) | Form builder (volatility, ceiling, DD/TD rates, durability); minutes/attempts realism (`gamelog_attempts`); roster/career/competition context builders that read per-game lines | The 70 context columns for that season's rows. A gated gamelog season → those columns buildable for that season. An ungated/missing season → those columns stay masked for that season's rows (the base 73 still build). |
| `shotcharts/*/<season>/` (gated) | NEW shot-position tower builder (overhaul SHOT_POSITION.md: zone shares, zone FG%, avg distance, rim-or-3 share, with the 20-attempt / 10-attempt thresholds) | A NEW tower family alongside the existing 17 (or 9 in the base manifest — the width re-pin, contract §9 P2, decides the final count). The tower's per-season mask comes from G-5 rates: verified-coordinate seasons observed, zone-only seasons partially observed, unverified seasons masked. |
| `pbp/<season>/` (gated) | JEPA game-timescale sequence builder (Lane 8); Scope B text-tower derivation (template dedup → embeddings → rollups) | Game-timescale prediction inputs + the text tower. PBP does NOT feed the 143-column chain directly — it feeds the prediction heads (JEPA primary, text tower) that the 22:32 correction made primary. Do not route PBP into the 143 as if it were a column source. |
| `schedules/<season>/` (gated) | Every gate (G-3 authority) + the feature build's game-count sanity | Nothing directly, but without it no other family's completeness can be proven. |

Sequencing rule: the feature build for a season runs ONLY on
gated families for that season. A season with gated gamelogs
but ungated shots builds its 143 (or 73+shot-partial) with the
shot tower masked — it does not wait for shots, and it does
not borrow another season's shots. A season with ungated
gamelogs builds the base 73 only, with the context columns
masked, and is reported as base-only for that season.

What stays blocked if a season is missing (stated per season
in the wave manifest, never as a global vague "partial"):
- Gamelogs missing → form + context columns masked for that
  season; 143 unbuildable for that season; base 73 unaffected.
- Shots missing → shot-position tower masked for that season;
  all other families unaffected.
- PBP missing → no game-timescale sequences and no text-tower
  contribution for that season; season-summary + gamelog
  prediction features unaffected.
- Schedule missing → the season cannot be gated at all; treat
  as fully unvalidated until the schedule arrives.

## 5. Wave manifests — the paper trail

Each collection wave writes one manifest per family:
`manifests/wave_<n>_<family>.json` containing: wave number,
family, route + machine, seasons attempted (in order),
seasons gated (with gate verdicts per gate ID), seasons
failed (with gate ID + expected vs observed + missing game
IDs where applicable), files written (path + sha256), and
the per-season downstream mask consequences (§4) for every
failed season. The living coverage table
(`manifests/coverage.json`) is regenerated from the wave
manifests after each wave — it is the machine-readable form
of INVENTORY_GAP_REPORT.md, and the next wave reads it, not
the prose report, to decide what remains.

## 6. Implementation notes (for the builder, not the design)

- Reuse the existing patterns, do not invent new ones:
  atomic write (`write_cache` / `write_cache_text`), the
  `Failures` ledger (exit 2 on any failed season), the
  `require_columns` raise-on-missing rule, and the
  `cache_is_fresh` idea — but with freshness defined by
  metadata (`complete: true` + all gates passing), never by
  file size or mtime.
- The gate runner is a new script (name TBD by the builder;
  this design does not pin it). It must be stdlib-only (per
  the workspace's stdlib-first rule), must exit non-zero on
  any failed gate, and must print one line per gate per
  season (gate ID, season, PASS/FAIL, expected vs observed).
  A gate runner that prints only a summary is not acceptable
  — the per-season lines ARE the audit trail.
- Quarantine directory: `pipeline/cache_v1/quarantine/` with
  the same per-season/per-source structure, plus a
  `quarantine.json` per file recording why it was quarantined
  and which gate failed. Quarantine is not deletion: the file
  stays readable for diagnosis.
- This design deliberately does NOT specify the text-embedding
  derivation (Scope B owns it), the feature-build code (the
  overhaul lane owns it), or any training code (separate
  authorization). It specifies only what those consumers can
  trust: gated raw files with metadata, or an explicit
  missing-season report.

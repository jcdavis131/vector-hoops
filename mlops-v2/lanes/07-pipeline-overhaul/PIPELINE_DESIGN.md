# Lane 07 — Pipeline Overhaul: Rebuilt-from-Scratch Pipeline Design

**Lane:** 07 pipeline overhaul · **Status:** DESIGN ONLY (no code
written, no training, no prod writes) · **Date:** 2026-10-26 ·
**Inputs:** Lane 1 SOURCES.md + FEATURE_MATRIX_OPTIONS.md, Lane 2
CURATION_RULES.md, INVENTORY.md and OFFLINE_REBUILD_REPORT.md in this
directory, contract §0/§2b/§6.

**Design principle, in one sentence:** one pipeline, from raw sources
to two versioned outputs, that fails loud on any gap and never invents
a value — no bootstrap proxies, no random-projection expansion, no
silent zero-fill, ever.

## 1. Why rebuild instead of patching

The current chain grew by accretion, and accretion is visible in its
failure modes:

- **Two chains, two widths.** `build_vectors.py --offline` alone
  yields 73 columns; the side-builder + `integrate_context.py` chain
  yields 143 columns under a different column order in places (the
  contract file itself records the training-box matrix failing the
  HEAD contract on column order). A loader that reads "the matrix"
  without a pinned width and manifest hash can silently train on
  either.
- **A bootstrap escape hatch.** `pipeline/bootstrap_train_matrix.py`
  exists precisely for "when build_vectors.py cannot run." It builds a
  matrix from the 14-d game vector with every wider family masked to 0
  — honest in its docstring, dangerous if its output is ever filed
  next to a real matrix without its provenance label. A rebuilt
  pipeline has no escape hatch: if the build cannot run, it produces
  nothing, loudly.
- **A banned expansion with a live precedent.** The prior v6 script
  expanded the 11-column proxy via random projection to "120 dims
  consistent with v5" (Lane 1 §5 of its companion file). The ban in
  contract §2b exists because the precedent exists. The new pipeline
  makes the banned operation structurally impossible: the loader
  accepts only matrices whose manifest hash matches a recorded build,
  and the builder never accepts a proxy file as an input.
- **Gamelog-shaped holes.** The base build silently emits zero form
  features when `gamelogs_*.jsonl` is absent (`compute_form_features`
  returns `{}`), and the form/roster/career/competition/system
  families simply do not appear. Silence is the bug: the rebuilt
  pipeline reports every absent family as a declared scope cut in the
  manifest (see gate G-09), so a 73-column matrix can never be
  mistaken for a 143-column one.

## 2. Architecture: six stages, one direction

```
RAW SOURCES ──► [S1 FETCH] ──► versioned raw cache ──► [S2 VALIDATE-RAW]
  ──► [S3 FEATURE BUILD] ──► [S4 ERA NORMALIZE] ──► [S5 VALIDATE-MATRIX]
  ──► [S6 EMIT] ──► TWO outputs: (i) 14-d game vector, (ii) wide training matrix
```

There is exactly one pipeline object (one entry point, one manifest
schema, one run log). The old split — base script plus a dozen side
builders plus a merge script plus a contract checker, each with its
own flags — is replaced by stages with the interfaces in §3. Side
builders survive only as stage S3 *providers* behind a common
interface (input cache paths → named columns + per-column masks +
provenance note), never as standalone scripts that write files.

**No training stage lives here.** Training consumes the S6 outputs
by manifest hash (Lane 4's loader refuses any other file). The
pipeline never imports a model, never touches a GPU, never writes an
embedding.

## 3. Stage interfaces (inputs / outputs / schema per stage)

### S1 — Fetch (raw source → versioned raw cache)

- **Input:** source registry (one entry per source: endpoint or page,
  fetch script, rate discipline, license/ToS note, expected season
  range). New sources (shot-position, §6 of SHOT_POSITION.md) register
  here and nowhere else.
- **Output:** files under `pipeline/cache/` (or the new pipeline's
  cache root) named `<source>_<season>.json` (+ `<source>.json` for
  person-level files), each accompanied by a fetch record: source URL
  or page, fetched_at timestamp, row count, sha256, and the fetcher
  version. Fetch records are committed with the cache file (existing
  repo practice: `pipeline/cache/_fetch_meta/`).
- **Schema rule:** a fetch writes a file or fails; it never writes a
  partial file and calls it complete. Partial downloads are staged
  under a temp name and renamed only on a complete, parseable payload.
- **Offline mode:** `--offline` reads cache only and never touches
  the network (the current script already honors this; the rebuild
  keeps the guarantee and adds a test: an offline run with networking
  disabled must produce byte-identical output).

### S2 — Validate-raw (cache → go / no-go per source-season)

- **Input:** the cache + the source registry's expected coverage
  (which sources exist for which seasons — e.g. tracking from
  2013-14, wide skills from 2015-16, shot-position per its own era
  table in SHOT_POSITION.md).
- **Output:** a per-(source, season) verdict table: PRESENT /
  ABSENT-STRUCTURAL (source did not exist that era — expected, masked
  downstream) / ABSENT-GAP (source should exist but does not —
  blocks the build unless the family is declared cut, gate G-02).
- **Schema rule:** verdicts are data, not log lines. The S6 manifest
  embeds the verdict table, so any matrix can be traced to exactly
  which sources were present for every season.

### S3 — Feature build (validated cache → unnormalized features + masks)

- **Input:** validated cache, identity registry
  (`assets/player-identity.json` semantics: `person_id` key, never
  name), eligibility gates (schedule-aware GP + minutes, Lane 2 §2).
- **Output:** one row per (`person_id`, `season`) with raw (pre-z)
  feature values and a per-feature mask (0/1, Lane 2 §3.1). Features
  are grouped into families; each family is produced by exactly one
  provider, and the provider declares its columns by name — never by
  position.
- **Schema rule (the one that kills the width dispute):** the feature
  list is a *named, ordered manifest*, not a count. A build's manifest
  names every column, its family, its provider, and its era mask rule.
  "120 features" is not a schema; a manifest with 73 named columns
  is. Two builds are comparable only if their manifests match or
  their difference is enumerated column by column.
- **Providers (current families, mapped):** core box/advanced/scoring
  (volume, playmaking, rebounding, defense, efficiency, shotmix),
  bio, tracking, hustle (defense slice), form, market, roster, career
  (prior seasons only, Lane 2 §3.4), competition, team, pedigree,
  playoffs, honors, system, injury (readout only — never a tower
  input), and the new shot-position family (SHOT_POSITION.md §4).
  Form/roster/career/competition/system/injury providers REQUIRE
  gamelog-derived inputs; when those inputs are absent the provider
  reports ABSENT-GAP and the family is cut by declaration (gate G-09),
  not zero-filled.

### S4 — Era normalize (features + masks → z-scores + masks)

- **Input:** S3 output.
- **Output:** within-season z-scores (mean/std over observed rows
  only, per season per feature; masked values stored as 0.0 with
  mask 0), clipped at ±4σ (current practice, kept), plus the
  per-season, per-family mask-rate table Lane 2 §6 requires.
- **Schema rule:** normalization parameters (season means/stds) are
  stored alongside the matrix, versioned with it. A future season's
  rows are normalized against *that season's own* observed rows, never
  against training statistics — otherwise era honesty breaks and the
  frozen-test protocol is contaminated.

### S5 — Validate-matrix (matrix + manifest → pass / fail)

- **Input:** S4 output + manifest + the pinned contract (column
  list, family order, row counts, coverage bands).
- **Output:** exit 0 with a validation report, or non-zero with every
  failing gate listed (never just the first). The gate list is §4.
- **Schema rule:** validation is a separate, runnable command, not a
  tail of the build script. Lane 4's loader re-runs the cheap gates
  (row count, manifest hash, column list) before any epoch; the full
  gate suite runs at build time.

### S6 — Emit (validated matrix → two outputs, atomically)

- **Output 1 — the 14-d game vector** (`assets/vectors.json` contract):
  the frozen 14 GAME_FEATURES in frozen order (PTS, AST, OREB, DREB,
  STL, BLK, TOV, FG3A, FGA, FTA, FG3_PCT, FG_PCT, FT_PCT, PLUS_MINUS),
  per-100 rates, within-season z, plus the PCA(3) map coordinates and
  archetype labels the game surfaces consume. This output is derived
  from the SAME S3/S4 run as the matrix — never from a separate
  script, never from the matrix file by slicing (the game vector's
  rounding and map steps are its own contract).
- **Output 2 — the wide training matrix** (`train_matrix.npz` +
  `feature_manifest.json`): Z (float32, 12,966 × W), mask (bool),
  `player_id`, `season`, `name` arrays, plus the manifest (columns,
  families, provider per column, era mask rules, S2 verdict table,
  S5 report, sha256 of the matrix file, sha256 of the row-key list,
  salary coverage, and the declared scope cuts).
- **Atomicity rule:** both outputs are written via atomic rename
  (current `artifact_io` practice, kept). A failed S5 gate means
  NEITHER output is written — the current build already honors this
  ("vectors.json and the matrix were not written"), and the rebuilt
  pipeline keeps it as a load-bearing rule: a half-built pair (new
  matrix, old game vector, or vice versa) must be impossible.
- **Identity rule:** the matrix and the game vector share the same
  row universe, verified by (`player_id`, `season`) key equality
  (the rebuild verified this: pid+season sets equal, 0 differences —
  see OFFLINE_REBUILD_REPORT.md). Display-name differences (Sr
  suffixes, apostrophes) between the raw build and the
  identity-enriched served file are a presentation layer applied
  AFTER S6, never a build-time join key.

## 4. Validation gates (fail loud, never silent imputation)

Each gate: check → failure mode → fail-loud behavior. All gates are
hard failures except where marked informational. On any hard failure
the run exits non-zero, writes nothing, and prints every failing gate
with its offending keys/counts.

| ID | Check | Failure mode it catches | Fail-loud behavior |
|---|---|---|---|
| G-01 | Row universe: total = 12,966; per-season counts match the pinned table (recent: 2022-23 = 464, 2023-24 = 484, 2024-25 = 500, 2025-26 = 491) | Gate drift, aggregation change, source loss | Exit non-zero; per-season diff table printed; no trimming to hit the number (Lane 2 §2.3) |
| G-02 | Source presence: every non-structural (source, season) cell present | Missing cache, failed fetch passed off as data | Exit non-zero naming the exact (source, season) cells; `--allow-partial` exists only as an explicitly-labeled partial build whose manifest carries `partial: true` and the missing list — a partial build is never filed as a full build |
| G-03 | Grain/dedup: no duplicated (`person_id`, `season`) keys; no row without `person_id` | Merged careers, guessed identities | Exit non-zero with colliding keys; no silent dedup, no slug fallback (Lane 2 §4.5) |
| G-04 | Identity consistency: one `person_id` → at most one display name | Merged-person bug re-entering through a new source | Exit non-zero with the offending `person_id` |
| G-05 | Mask domain: masks ∈ {0,1} only; masked value exactly 0.0; no NaN/Inf anywhere | Corrupt provider output, float-mask drift | Exit non-zero with column + row counts |
| G-06 | Structural masks: tracking mask 0 for start-year < 2013; form mask 0 for start-year < 2015; shot-position mask 0 outside its verified era table (SHOT_POSITION.md §4); any post-era season with zero observed rows in a structural family | Backfilled pre-era data; whole-season source loss | Exit non-zero; pre-era mask = 1 is a source error sent back to S1, not carried |
| G-07 | Within-season z: for season-feature cells with observed n ≥ 30, \|mean\| ≤ 0.05 and std ∈ [0.95, 1.05] over observed rows; cells with n < 30 reported, not failed | Global (leaky) normalization; broken provider | Exit non-zero with the offending cells; n < 30 cells listed in the report |
| G-08 | Manifest contract: column names, families, and order match the pinned manifest for this build's declared width; family coverage within 5 points of the pinned bands; column-zero rise ≤ 10 points (current `stage_contract.py` tolerances, kept) | Silent column reorder, provider change, stale side file | Exit 2 with the violation list (current behavior, kept); a manifest change requires a recorded, reviewed amendment, not a re-record |
| G-09 | Declared scope cuts: every family absent from the output is listed in the manifest with its reason (e.g. "gamelogs absent → form/roster/career/competition/system/injury cut") and the cut matches the S2 verdict table | The silent-zero-form failure mode: a family vanishing without a trace | Exit non-zero if an absent family is NOT declared, or a declared cut contradicts S2; a declared cut is a pass with a visible scar, not a failure |
| G-10 | Game-vector contract: 14 features in frozen order; every `v` length 14; values within [-4, 4]; map coordinates in [0, 1]; no duplicate (name, season) rows | Game-serving regression from a matrix change | Exit non-zero; S6 writes neither output |
| G-11 | Cross-output key equality: matrix (`player_id`, `season`) set == game-vector (`player_id`, `season`) set | Row-universe skew between the two outputs | Exit non-zero with the symmetric difference |
| G-12 | No banned inputs (informational at build, hard at load): no column derived from `mtnn_inputs.f32`, from sprite positions, from the champion embedding, or from a random projection; no 2K ratings, odds, or Wikipedia text columns | Proxy leakage, animation-as-data, distillation smuggled into features | Build warns and tags the manifest; Lane 4's loader refuses the file outright |
| G-13 | First-season career mask rate (informational): share of first-season rows per person with career features masked | Career leakage (future seasons informing early rows) — unprovable from the matrix alone | Reported for Lane 5 review; never used to claim a pass (Lane 2 V-16) |

**What curation never does (kept from Lane 2 §5.4, enforced by G-05/G-12):**
no mean/median/forward-fill imputation beyond masked-0.0; no
cross-season filling; no cross-player filling; no silent clipping
beyond the declared ±4σ; no feature computed from a label, a later
season, or the champion embedding.

## 5. What the new pipeline supersedes (named scripts, and why)

| Superseded script / pattern | Why it goes |
|---|---|
| `pipeline/bootstrap_train_matrix.py` | Builds a "matrix" from the 14-d game vector with wider families masked to 0. Under the new pipeline there is no fallback matrix: a build that cannot run produces nothing. Its only legitimate descendant is a clearly-labeled *diagnostic* that prints "no matrix available" — never a file Lane 4 can load. |
| The prior v6 random-projection expansion (`train_mtnn_v6_scaling.py` pattern: 11-col proxy → 120 dims) | Banned by contract §2b; structurally impossible under G-12 + manifest-hash loading. The script itself is not in this checkout (verified absent); the ban targets the pattern, and the new loader enforces it. |
| `pipeline/build_vectors.py` as a monolith (fetch + build + normalize + emit in one file, with side effects like gamelog-shaped holes) | Replaced by S1–S6 with per-stage interfaces. Its *logic* (eligibility gates, within-season z, frozen game order, atomic writes) is preserved and cited, not discarded — the rebuild reuses the algorithms, the redesign replaces the shape. |
| `pipeline/rebuild_all.py --refresh-context` + `enrich_vectors.py` + `integrate_context.py` as separate, flag-driven steps | Folded into S3 providers + S5/S6. The side builders' computations (form, roster, career, competition, system, pedigree, playoffs, honors, salary-market) survive as providers; what dies is the ability to run them out of order, with fixtures, and file the result as if it were the full chain. `--fixture` runs are labeled experiments, never builds. |
| `pipeline/stage_contract.py` as a post-hoc checker | Promoted to S5: same tolerances, but a first-class stage with a report artifact, run by the loader as well as the builder. |
| Name-keyed joins anywhere in the build (salary, hustle, pedigree by display name) | Replaced by `person_id`-keyed joins with the Lane 2 §4.4 rule: ambiguous name-keyed values are masked for BOTH players, never guessed. A source that cannot be keyed by `person_id` (or resolved through the identity registry) is masked, logged, and reported — its columns do not silently inherit the famous namesake's value. |
| `export_mtnn_viz.py` output (`mtnn_inputs.f32`) as anything but a viz artifact | Relabeled in every consumer doc as PROXY. The new pipeline never reads it; a loader that finds it in a features path refuses. |

**What is deliberately kept:** schedule-aware eligibility gates; within-season
z-scoring over observed rows only; ±4σ clip; atomic writes; the frozen
14-feature game order; the `cat([x·m, m])` tower input convention; the
`person_id` identity rule and the ambiguous-name masking precedent.

## 6. Shot-position tower hook (summary — full plan in SHOT_POSITION.md)

The new pipeline reserves exactly one new family slot: `shotpos`
(see SHOT_POSITION.md §4 for the proposed 10–12 features, era masks,
and join keys). The tower joins on (`person_id`, `season`) — via
stats.nba.com PLAYER_ID where the source is ShotChartDetail, via a
name→`person_id` registry resolution with ambiguous-name masking where
the source is BBRef/ESPN (BBRef IDs and ESPN athlete IDs are NOT NBA
PLAYER_IDs and must never be joined as if they were). Until the tower's
era availability is verified from the source, its mask is 0 for every
row and its columns do not exist in any manifest — a future tower is a
reserved name, not a column of zeros.

## 7. Recommendation: pin the width in two steps (for the user)

This lane does not re-pin the width itself (contract §6 reserves that
decision), but it recommends the shape of the decision:

1. **Now: pin the verified base.** Amend contract §0/§2b to name the
   73-column base manifest (produced by the verified offline rebuild,
   scratch sha256 `2422e56a…` for `train_matrix.npz` — full hashes in
   OFFLINE_REBUILD_REPORT.md) as the current training-matrix
   interface, with its declared cuts (form, roster, career,
   competition, team-context, system, injury, playoffs-context,
   market/pedigree expansions) listed in the manifest. Lane 4's loader
   is written against this manifest, by column name.
2. **Later: promote to full-context only on evidence.** The 143-column
   HEAD manifest becomes the interface only after (a) the gamelog
   re-fetch lands, (b) the side-builder chain runs end-to-end in a
   scratch worktree and passes S5 against the HEAD contract, and
   (c) the honors semantics decision is recorded. Until then, 143 is
   a target, not an interface — and 120 is retired as a width
   everywhere except as a historical note ("the v4 explainer's count").
3. **Champion width (130) stays a fact, not a target.** v5 trained on
   130 features in 17 families; the challenger need not match that
   width to be judged — it is judged on held-out metrics under
   contract §2d, with its own manifest pinned. Chasing 130 exactly
   would mean reconstructing an unrecoverable setup.

## 8. Open questions for the coordinator (not decided here)

1. **Cache root ownership:** does the new pipeline keep
   `pipeline/cache/` in the game repo, or move the cache to a
   data-only repo with the game repo pinning a cache commit? (Kept
   in-repo in this design; the 105 MB size is tolerable, but every
   game-repo clone pays it.)
2. **Gamelog re-fetch owner and machine:** Alienware vs. Mac, schedule,
   and rate discipline — a coordinator decision with the user, since
   it involves network access to stats.nba.com and its ToS posture
   (SHOT_POSITION.md §6 applies to gamelogs too).
3. **Honors semantics:** Lane 2's call, still open; blocks step 2 of §7.
4. **Shot-position collection machine and cadence:** Alienware vs. Mac
   (SHOT_POSITION.md §5); the tower cannot be scheduled until this
   is decided.
5. **Partial-build policy:** is a `partial: true` build ever loadable
   by Lane 4 (e.g. for debugging), or is it always refused? This
   design recommends: refused by default, loadable only with an
   explicit `--allow-partial-manifest <hash>` flag that lands in the
   run report — so a partial load is always visible in the record.

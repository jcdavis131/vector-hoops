# Lane 2 — Cleaning and Curation Rules (MLOps v2 draft)

**Status:** DRAFT ONLY. The train gate is CLOSED. This document sets rules.
It runs no training, changes no repo, and promotes nothing.

**Scope (contract §3, Lane 2):** masking rules, qualifying thresholds,
dedup rules, `person_id` identity resolution, z-scoring / normalisation
conventions, and validation checks that fail loud. No training code, no
split code, no eval code. Splits belong to Lane 3, training to Lane 4,
eval and the mask-ablation test to Lane 5.

**Shared facts (contract §0, do not re-derive):** champion MTNN v5,
12,966 player-seasons through 2025-26, 64-d L2, never overwritten.
Challenger input: 120 features in 17 tower families, tower input
`cat([x·m, m])`, mask `m ∈ {0,1}` per family. Identity key is `person_id`.

## 0. Grounding — what was actually read

This draft is grounded in read-only repo code, not in recalled numbers:

- `pipeline/eligibility.py` — the schedule-aware gate the games use today.
- `pipeline/build_vectors.py` — where that gate is applied, and where
  name-keyed sources shared by two players in one season are assigned to
  neither player (the hustle / salary precedent, §4 below).
- `pipeline/apply_player_identity.py` and
  `assets/player-identity.json` — the registry that splits shared names
  into distinct persons by (dataset name, season).
- `pipeline/audit_features.py` — per-feature masks, dead-column and
  clock checks, and the within-season z-score leak guard.
- `pipeline/audit_data_coverage.py` — playoffs / honors / pedigree /
  roster coverage is optional: absence is masked upstream, not every
  row is expected to carry those families.
- `pipeline/bootstrap_train_matrix.py` — the 14-feature game matrix
  (`assets/vectors.json`, `v` field) is NOT the 120-feature training
  matrix. Do not validate one against the other as feature values.
- `assets/manim/src/input_families.py` (vector-hoops repo) — the
  17-family / 120-feature table, with tracking masked pre-2013 and
  form masked pre-2015.

**Open limit, stated honestly:** the individual names of the 120 features
are not pinned by the contract (only the family counts and order are),
and the original 120-feature building pipeline was not found in the repo
(contract §2b, spec Open Question #1 — Lane 1's question, not this
lane's). This lane therefore validates family counts, family order,
mask structure, identity, and season keys — not individual feature
semantics. Lane 1's feature manifest must supply the names before
anyone can check a single feature's meaning.

## 1. Grain and dedup — one row per person-season

1.1. **Grain.** One matrix row per (`person_id`, `season`). No exceptions.
A player traded mid-season still gets exactly one row for that season.

1.2. **Stint aggregation.** If a source yields several stints or teams
for one person-season, aggregate to a single season row before feature
building (season totals, then per-100 rates — never one row per team,
never an unweighted mean of stint rows). Lane 1 must document the exact
aggregation choice it used; this lane's validator can check the grain
only, not the aggregation method, and says so (§7, check V-08).

1.3. **Duplicate keys fail.** Two rows with the same
(`person_id`, `season`) are a hard validation failure. Never drop one
silently, never keep the first, never average two rows at validation
time. Send the matrix back to Lane 1 with the colliding keys listed.

1.4. **Duplicate rows fail.** A fully duplicated row is the same failure
as a duplicate key. Row order does not rescue a duplicate.

1.5. **Row order.** The matrix must carry its row keys explicitly
(`person_id` + `season` per row). Lane 4 must record the sha256 of the
matrix file and of the row-key list in its run report, so a later
reordering cannot silently change pair construction. The validator
checks keys as a set against `vectors.json` when that file is supplied
(§7, check V-09); it does not require the matrix order to equal the
vectors order.

## 2. Qualifying thresholds — a player-season enters training

### 2.1. The games' rule today (verified in code)

The games use the schedule-aware gate in `pipeline/eligibility.py`:

| Season schedule | Min games (GP) | Min total minutes |
|---|---|---|
| 82 games (default) | 12 | 450 |
| 72 games (2019-20, 2020-21) | 11 | 450 |
| 66 games (2011-12) | 10 | 450 |
| 50 games (1998-99) | 10 | 450 |

Formula: min GP = clamp(round(0.15 × schedule), 10, 15);
min total minutes = max(450, round(0.06 × schedule × 48)) — the 450 floor
binds for every schedule in this universe, so the minutes floor is 450
in all four rows above.

Purpose of the gate: per-100 rates from tiny samples are noise. It drops
two-way stints, cup-of-coffee stints, and garbage-time cameos on purpose.
A dropped row is not missing data to be imputed (§5.4).

### 2.2. Recommendation: training MUST match the games' gate exactly

**Training uses the same schedule-aware gate, with no change.** Reasons:

- The current 12,966 rows already are the post-gate universe. Verified
  against `assets/vectors.json`: minimum GP per season matches the table
  above (10 in 1998-99 and 2011-12, 11 in 2019-20 and 2020-21, 12 in
  2024-25), and the recent-season counts reconcile to the contract
  (2022-23 = 464, 2023-24 = 484, 2024-25 = 500, 2025-26 = 491).
- Any different gate changes the row count away from 12,966 and breaks
  reconciliation with the champion, with the fold manifest (Lane 3),
  and with every served surface that assumes this universe.
- The legacy comparison gate in `pipeline/analyze_eligibility.py`
  (GP ≥ 20, minutes ≥ 800) is a comparison only. It must NOT be used for
  training: it would shrink the universe below 12,966 and silently
  change what "the model" means.

### 2.3. What to do when a re-derived matrix does not reconcile

If Lane 1 re-derives the matrix and the count is not 12,966, that is a
validation failure, not a trimming opportunity. Do not drop extra rows
or add back dropped rows to hit the number. Report the per-season
difference, find whether the gate, a source, or an aggregation step
moved, fix that step, and re-derive. The validator enforces the total
and the four recent-season counts (§7, checks V-01, V-10).

### 2.4. A trap: `vectors.json` minutes are NOT real minutes

`vectors.json` fields `mpg` and `total_min` are per-100-possession
arithmetic (see `pipeline/build_min_gp.py`: "vectors.json `mpg` is NOT
minutes per game"). Example: a row's `total_min` equals `gp × mpg`
in per-100 units, not real minutes played.

Consequence for this lane: **never re-derive eligibility from
`vectors.json` `mpg` / `total_min` as if they were real minutes.**
The validator checks the GP floor (GP is a real count) and does NOT
re-check the minutes floor from `vectors.json`. A real-minutes re-check
needs `pipeline/data/min_gp.json` (honest MPG/GP from game logs or
PerGame) or the source GP/MIN, and belongs to Lane 1's re-derivation
audit — not to this script's pass/fail on `vectors.json` alone.

## 3. Masking rules

### 3.1. Mask convention (all families)

- Mask values are exactly 0 or 1. No partial masks, no 0.5, no
  probabilities. The validator rejects anything else (§7, check V-03).
- A masked feature value is exactly 0.0 in z-space, and its mask is 0.
  The tower input is `cat([x·m, m])`: the masked value contributes
  nothing, and the mask column tells the tower the value was absent.
  These are different statements, and both are required — a 0.0 value
  with mask 1 would be read as "exactly average", which is false.
- Masking is per feature in the stored matrix, grouped into families
  for the tower. A family is "masked" for a row when all of its features
  are masked. A family mask file (17 columns), if supplied, must agree
  with the feature mask: family mask 1 exactly when at least one
  feature in that family is observed (for structural families the
  whole family moves together, so both readings agree there).
- Masked does not mean dropped. A row with a masked family stays in
  training. Only a row that fails the §2 gate, or fails identity
  (§4), leaves the matrix.

### 3.2. Structural masks — era availability, never backfilled

| Family | n | Structural rule |
|---|---|---|
| tracking | 12 | mask = 0 for every row with season-start-year < 2013. Mask = 1 only when a tracking source row exists for that person-season at start-year ≥ 2013; otherwise 0. |
| form | 6 | mask = 0 for every row with season-start-year < 2015. Mask = 1 only when a form / wide-skills source row exists for that person-season at start-year ≥ 2015; otherwise 0. |

Season-start-year is the first four digits of the season key
(e.g. 2013 for `2013-14`). The boundary is on the start year, not on
the season string as a whole.

Rules that apply to both structural families:

- **Never backfill.** Do not estimate pre-2013 tracking from per-game
  stats, do not carry a player's later tracking backwards, and do not
  fill pre-2015 form from other stats. Absence before the source existed
  is structural, not a gap to repair.
- **A stray pre-era value is a failure, not data.** If a source row
  claims tracking for 2011-12, the curation rule zeroes it and masks it,
  and the validator fails the matrix if any pre-era mask is 1 (§7,
  check V-11). The source error goes back to Lane 1; the matrix does
  not quietly carry it.
- **Post-era coverage must be real.** If a whole post-era season has
  zero observed tracking (or form) rows, that is a source gap and the
  validator fails it (§7, check V-11). Individual post-era rows may
  still be masked when their source row is missing.

### 3.3. Incidental masks — source absence, per family

For the other 15 families, mask = 0 when the source for that feature
is absent for that person-season, and mask = 1 when it is present.
No family in this group is era-masked:

- **volume (10), playmaking (10), rebounding (8), defense (8),
  efficiency (8), shotmix (10):** core stat families. Mask only on
  genuine source absence (rare). A missing core stat for a qualified
  row is a source problem to report, not a value to invent.
- **bio (5):** mask when the bio source row is absent. Bio values are
  person-level (height, weight, and similar); a missing bio row is
  masked, never copied from another person with the same name (§4).
- **market (4):** salary-based. Mask when the salary source is absent
  **or** when the name is ambiguous in that season (§4.4: shared-name
  rows get neither player's salary). Salary missingness is logged by
  Lane 1; it is not filled with a league average at curation time.
- **roster (5):** mask when roster context is absent. Roster context
  is optional and recent-gamelog-based (see `audit_data_coverage.py`):
  absence is expected for some rows and is masked, not treated as a
  defect in itself.
- **career (6):** see §3.4. Masked when the required prior-season
  history does not exist; never computed from the current or future
  seasons.
- **competition (6), team (8):** mask when the team / season context
  source is absent for that row.
- **pedigree (4):** draft information is person-level and
  time-invariant. Mask when the draft source is absent **or** ambiguous
  (§4.4). Note the deliberate difference from display assets: the
  identity script assigns a pure-name pedigree key to the elder person
  for display; for training, an ambiguous pedigree is masked, not
  assigned to the elder by default. A display convention is not
  training truth.
- **playoffs (5):** mask when the player has no playoff row that
  season. This covers both "team missed the playoffs" and "source
  missing" — the matrix alone cannot tell them apart, so Lane 1 must
  log the two causes separately. Do not encode a non-playoff season
  as observed zeros: under this convention the mask itself carries
  the "made the playoffs" signal, and observed zeros would mean
  something else (played, produced zero).
- **honors (5):** mask when the player has no honors row that season.
  Honors are sparse by nature; no honors row is the normal case, and
  it is masked, not observed zero.

### 3.4. Career features — prior seasons only, never the future

Career features for season S may use only seasons before S, plus
draft information known before S. They must never include season S
itself, any later season, or any outcome from S (including whether
the player later won an award or made a later roster). For a player's
first dataset season, count-type career features (prior games,
experience = 0) are observed, while features that require a prior
season's stats are masked. The validator cannot prove this rule from
the matrix alone, so it reports the first-season career mask rate as
review information for Lane 5 (§7, check V-13, informational only) —
it does not pass or fail the matrix on it. The proof obligation sits
with Lane 1's feature-building documentation.

### 3.5. The mask is itself a signal — the era-leak implication

This is the most important curation fact for the other lanes, and it
is a documentation duty of this lane, not a problem this lane fixes:

- The tower input feeds the mask to the model: `cat([x·m, m])`.
  Therefore the tracking mask is, by construction, almost a perfect
  indicator of "season-start-year ≥ 2013", and the form mask is almost
  a perfect indicator of "season-start-year ≥ 2015".
- Within-season z-scoring (§5) removes era drift from the *values* —
  `audit_features.py` measured the largest |correlation| between any
  column and season year at 0.011, precisely because each season is
  centred at zero. But the *masks* restore a coarse era signal that
  the values cannot carry. The model can learn era from masks alone.
- **Do not "fix" this in Lane 2.** Dropping the mask indicator would
  change the tower input shape, break drop-in comparability with v5,
  and hide the effect instead of measuring it. The mask stays.
- **What this implies for other lanes (their work, not this lane's):**
  era-stratified batches (Lane 3) and the cross-era twin-agreement test
  (Lane 5) are load-bearing guards, not optional extras. Lane 5's
  mask-ablation test — artificially mask a modern player's tracking
  and measure how far its twins shift in era — quantifies how much of
  twin retrieval the mask, rather than the stats, is doing. If twins
  shift era dramatically when tracking is masked, the mask is doing
  era work and the headline metrics must be read with that caveat.
  That test belongs to Lane 5; this lane only documents the fact that
  makes the test necessary.
- The same caution applies in miniature to playoffs and honors masks,
  which signal achievement rather than era, and whose coverage can
  drift if award or playoff definitions change. Lane 1 must report
  per-season mask rates per family so drift is visible (see §6).

## 4. Person identity — `person_id` is the key, name is not

### 4.1. The rule

**Join, dedup, pair, and split on `person_id` only.** A display name
is a label for humans. It is never a join key, never a dedup key, and
never evidence that two rows are the same person.

### 4.2. Same name, distinct persons (the reason the rule exists)

Distinct players share names. The contract names Dee Brown (b. 1968 /
b. 1984), Reggie Williams (b. 1964 / b. 1986), Mike James, and
Chris Johnson. The worktree registry (`assets/player-identity.json`)
additionally splits Tim Hardaway (Sr. / Jr.), Gary Payton (Sr. / II),
Gary Trent (Sr. / Jr.), Jaren Jackson (Sr. / Jr.), Jabari Smith
(Sr. / Jr.), Glenn Robinson (Sr. / III), and others — 22 registry
persons in the worktree file. A shared display name in the matrix is
normal and is NOT a validation failure. A shared `person_id` across
two different display names IS a failure (§7, check V-07): it signals
a merged career.

### 4.3. Resolution procedure (build time, Lane 1)

1. If (dataset name, season) appears in the identity registry's
   season split map, use the registered `person_id` and display name.
2. Otherwise, `person_id` is the slug of the corrected display name
   (registry `display_fixes` applied first: suffix corrections such as
   "Larry Nance" → "Larry Nance Jr." are label corrections for a
   single person, not splits).
3. Never strip a suffix (Jr. / Sr. / II / III) to resolve identity.
   Suffix-stripping is how distinct persons get merged. Normalisation
   for lookup is lowercasing and whitespace collapse only.
4. Never use the `pid` integer field in `vectors.json` as the identity
   key. It is a legacy integer field, not `person_id`. The string
   `person_id` is the key; `pid` is ignored by this validator except
   that it must never be substituted for a missing `person_id`.
5. Career features, pedigree, and any per-person aggregate are
   computed per `person_id`, never per name. The 2026-10-01 identity
   fix exists because name-level careers merged distinct persons;
   reintroducing a name-level aggregate anywhere in the pipeline
   reintroduces that bug.

### 4.4. Ambiguous name-keyed sources — assign to neither

When a source is keyed by name only (salary history, hustle / wide
skills, pedigree) and two players share that name in the same season,
the value is masked for BOTH players. This is the precedent already
in `build_vectors.py` (shared names get neither the hustle row nor
the salary row, with the documented Marcus Williams 2007-08 example).
Guessing — including "give it to the famous one" — is forbidden at
curation time. The value may be recovered later only if a
`person_id`-keyed source confirms the owner. Ambiguous-source masking
is logged per season by Lane 1; it is expected to be rare, and a
sudden rise in its rate is a source-quality alarm, not a reason to
start guessing.

### 4.5. Rows lacking `person_id` — fail, do not auto-assign

A row with no `person_id`, an empty `person_id`, or a `person_id`
that is only a name string with no registry backing is a hard
validation failure. The validator must NOT silently slug the display
name to fill the gap: for a shared name, the slug collides with the
wrong person, and for a new player with a recycled name (a rookie
sharing a retired player's name), the slug inherits the elder's
identity. The repair path is: add a registry entry (birth year,
season list, source) or confirm the single-person slug, then
re-derive. A row held for identity review stays out of training
until resolved — it is not trained under a guessed key.

### 4.6. New players with recycled names

If a name already exists in the matrix with non-overlapping seasons
and the new row's birth year or debut context does not match the
existing person, treat it as a candidate split and hold the row for
registry confirmation (§4.5). Do not inherit the elder's `person_id`.

## 5. Z-scoring and normalisation conventions

### 5.1. Within-season z-scoring (the rule)

Every feature is z-scored **within its season**: for each season and
each feature, mean and standard deviation are computed over observed
rows only (mask = 1 for that feature in that season), and each
observed value is replaced by (value − season mean) / season
standard deviation. Masked values are then set to 0.0 (§3.1).

This matches the served game matrix (`assets/vectors.json`:
"per-100 possessions, z-scored within season (era-honest)") and the
audit in `audit_features.py`.

### 5.2. Why within-season, not global

- **Era honesty.** League-wide levels move: pace, three-point volume,
  defensive rules, and positional roles all drift across 1996–2026.
  A global z-score preserves those drifts as signal, so a 1998 role
  player and a 2024 role player sit far apart for era reasons alone.
  Within-season scoring centres every season at zero, so a feature
  measures "how this player compared with his own season's peers".
- **Leak guard.** As §3.5 notes, a within-season centred column cannot
  encode the calendar year (measured max |r| with season year: 0.011).
  A globally scored column can, and would make adjacent-season
  retrieval partly a calendar task. The mask restores only a coarse
  era signal (§3.5); global scoring would restore a fine one.
- **Twin meaning.** The product question is "who plays like this
  player", not "who played in the same year". Within-season scoring
  is what makes cross-era twins (the Daily Court twin-reveal surface)
  meaningful at all.

### 5.3. Details that matter

- Statistics are computed over **observed rows only**. Including
  masked rows (as zeros) in the mean / std would drag every season's
  centre toward the masked population and punish families with
  structural masks (tracking pre-2013 would centre the post-2013
  distribution incorrectly).
- A season-feature cell with very few observed rows (fewer than 30)
  is not z-scored on its own noisy statistics without a note: Lane 1
  must report any such cell, and the validator skips the z-check for
  cells with observed n < 30 rather than failing on noise (§7,
  check V-12). Sparse cells are common in honors / playoffs; the
  skip threshold is documented, not hidden.
- No second normalisation is applied after masking. Do not re-centre
  the masked matrix globally, do not unit-scale the concatenated
  tower input, and do not L2-normalise features. L2 normalisation
  belongs to the output embedding (§3b of the spec), not to inputs.
- The 14-feature game matrix in `vectors.json` follows the same
  within-season convention but is a different matrix (14 features,
  not 120). Conventions match; files must not be confused.

### 5.4. What curation never does

- No mean / median / forward-fill imputation beyond the masked-0.0
  convention of §3.1. A masked value is "absent, and the model is told
  so" — it is not an imputed average wearing a mask of 1.
- No cross-season filling. A player's 2020 tracking row never fills
  his 2012 row; that would fabricate pre-era data.
- No cross-player filling. A teammate's or namesake's value never
  fills a row (§4.4).
- No silent clipping or winsorising. Extreme z-values are real until
  a source error is proven. If a feature's distribution looks wrong,
  Lane 1 investigates the source; the validator fails on NaN / Inf
  (§7, check V-04) and reports distribution outliers for review, but
  it never rewrites a value.
- No target leakage in features. Career features use prior seasons
  only (§3.4). No feature may be computed from a label, a later
  season's outcome, or the champion embedding itself. (Training on
  v5's 64-d embeddings as inputs is Lane 1's option (3) — a different,
  explicitly labelled distillation choice, not a feature to smuggle
  into the 120-feature matrix.)

## 6. Reporting duties (Lane 1 produces, Lane 2 checks the shape of)

For every matrix delivery, Lane 1 reports alongside the file (the
validator checks counts; these reports are for human review, and
their absence is a review failure, not a script failure):

- Per-season row counts, and the difference from the previous delivery
  per season (any non-zero difference needs a named cause).
- Per-season, per-family mask rates (so structural masks, source gaps,
  and drift are all visible in one table).
- Counts of rows masked by the ambiguous-name rule (§4.4), per season.
- Counts of rows held for identity review (§4.5), per season (must be
  zero in a delivered training matrix — a held row is not in the file).
- The sha256 of the matrix file and of the row-key list (§1.5).
- Any season-feature cell z-scored on fewer than 30 observed rows
  (§5.3), and any feature whose within-season distribution changed
  shape sharply versus the prior delivery.

## 7. Validation checks that FAIL LOUD

Implemented in `validate_inputs.py` (draft, stdlib + numpy for `.npz`
reading; parses, unexecuted as a training run). Exit code 0 only when
every FAIL check passes. On failure the script prints every failing
check with the offending keys or counts — never just the first failure
— and exits non-zero. It writes nothing; it only reads and reports.

| ID | Check | Fail condition |
|---|---|---|
| V-01 | Row count | Matrix rows ≠ 12,966. |
| V-02 | Feature count and family order | Feature count ≠ 120, or family counts / order differ from §0 (volume 10, playmaking 10, rebounding 8, defense 8, efficiency 8, shotmix 10, bio 5, tracking 12, form 6, market 4, roster 5, career 6, competition 6, team 8, pedigree 4, playoffs 5, honors 5, in that order). Individual feature names are not pinned (§0). |
| V-03 | Mask domain | Any mask value outside {0, 1} (as integer or float). |
| V-04 | Finite values | Any NaN or Inf in features or mask. |
| V-05 | Masked value convention | Any feature value ≠ 0.0 where its mask is 0. |
| V-06 | Identity presence | Any row with missing or empty `person_id`. A present display name does not rescue a missing `person_id`. |
| V-07 | Identity consistency | One `person_id` maps to more than one display name (merged-career signal), when names are supplied. Shared display names across persons are allowed (§4.2) and reported as information only. |
| V-08 | Grain / dedup | Any duplicated (`person_id`, `season`) key. |
| V-09 | Vectors cross-check (when `vectors.json` supplied) | The set of (`person_id`, `season`) keys differs from `vectors.json` players, or `vectors.json` itself is not 12,966 rows. Feature values are NOT compared (14 vs 120 features, §0). |
| V-10 | Season reconciliation | Per-season counts do not sum to 12,966, or the contract recent seasons differ (2022-23 = 464, 2023-24 = 484, 2024-25 = 500, 2025-26 = 491). |
| V-11 | Structural masks | Any tracking mask = 1 with season-start-year < 2013; any form mask = 1 with start-year < 2015; or any post-era season with zero observed tracking / form rows (source gap). |
| V-12 | Within-season z-scores | For any season-feature cell with observed n ≥ 30: \|mean\| > 0.05 or std outside [0.95, 1.05] over observed rows. Cells with n < 30 are skipped and reported (§5.3). Diagnostic flag `--warn-only-zscore` reports without failing; it must never be used to claim a pass. |
| V-13 | Season format | Any season key not matching `YYYY-YY` where YY = (YYYY + 1) mod 100, zero-padded (so `1999-00`, not `1999-99` or `1999-2000`), or start-year outside 1996–2025. |
| V-14 | Season coverage | The season set is not exactly the 30 seasons 1996-97 through 2025-26. |
| V-15 | Qualifying GP floor (vectors / GP supplied) | Any row's GP below the §2.1 floor for its season's schedule (12 / 11 / 10). The minutes floor is NOT re-checked from `vectors.json` (§2.4). |
| V-16 | First-season career mask rate (informational) | No fail. Reported for Lane 5 review: share of first-season rows per person with career features masked (§3.4). |

Checks V-01–V-15 are hard failures. V-16 is informational by design:
the matrix alone cannot prove the prior-seasons-only rule, and
pretending otherwise would be a false guarantee.

## 8. What this lane deliberately does NOT decide

- Which of Lane 1's feature-matrix options (re-derive / 11-feature
  proxy / 64-d distillation) is chosen. The user decides; this lane
  only says what any chosen matrix must satisfy to be valid, and
  that the random-projection expansion of the 11-feature proxy to
  120 dims is banned (contract §2b) — a matrix produced that way
  fails V-02 in spirit and must never be presented as a 120-feature
  matrix.
- Fold boundaries, purge / embargo, and pair construction (Lane 3).
- Tower dropout, temperature, epochs, and the training objective
  (Lane 4).
- The mask-ablation era test, tower ablations, and the promotion
  decision (Lane 5). This lane documents why the mask test is needed
  (§3.5); it does not run it.
- Any production switch, recalibration, or drift threshold (Lane 6).

## 9. Top risks this lane leaves open (for the coordinator)

1. **The 120-feature matrix does not exist as a committed file**
   (spec Open Question #1). Until Lane 1 resolves it with evidence,
   every downstream check in this document is a rule waiting for a
   file. The validator is written against the documented interface
   (`.npz` with `Z`, `mask`, `season`, `person_id` + a feature
   manifest), not against a file that exists today.
2. **Mask-as-era-signal (§3.5).** The model can learn era from masks
   even though values cannot encode year. If Lane 5's mask-ablation
   test shows twins are mask-driven, the headline metrics need that
   caveat attached — the curation rules alone cannot remove it
   without breaking v5 comparability.
3. **Name-keyed source ambiguity (§4.4).** Salary, hustle, and
   pedigree sources keyed by name will keep producing ambiguous rows
   for shared names. Masking both players is safe but loses signal;
   recovering those values needs `person_id`-keyed sources Lane 1
   has not yet confirmed.

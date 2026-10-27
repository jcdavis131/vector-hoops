# Lane 07 — Pipeline Overhaul: Offline Rebuild Verification Report

**Lane:** 07 pipeline overhaul · **Status:** VERIFICATION RUN
(data build only — trains nothing) · **Date:** 2026-10-26 ·
**Method:** binding method from contract §6, with two documented
deviations (§2) that strengthen, not weaken, the result.

## 1. Headline answer

**The offline rebuild COMPLETES CLEANLY.** Exit code 0, no season
or source refused, all 30 seasons fetched from cache, 12,966 rows.

| Headline number | Value |
|---|---|
| Completes cleanly? | **YES — exit 0, no `--allow-partial`, no refusal** |
| Produced matrix shape | **12,966 × 73** (`Z` float32, `mask` bool) |
| Actual feature count | **73** (not 120, not 130, not 143) |
| Manifest match? | **YES for the base chain, NO for the contract** — the produced `feature_manifest.json` names all 73 columns, and all 73 appear in the 143-column HEAD contract manifest, in the same relative order (shared-order check: true). But the produced matrix is NOT the contract matrix: 70 contract columns are absent (all context-merge columns). See §5. |
| Live files touched? | **NONE.** Live `assets/vectors.json` sha256 identical before and after (§6). |
| 17 input families? | **NO — 9 families** in the produced manifest's family map (see §5 for the count discrepancy and why "9" needs a footnote, not a headline). |

**What this means for Q1:** the remaining Q1 question — "does the
offline rebuild complete cleanly?" — is answered YES for the base
chain. The qualifier matters: this verifies the 73-column base
matrix, not the 143-column full-context matrix. The full-context
chain (side builders + `integrate_context.py`) was not run in this
pass and remains gamelog-blocked (see §7). Anyone quoting this
report as "the 120-feature matrix rebuilds" is misquoting it.

## 2. Method (binding, with two documented deviations)

**As specified:** scratch worktree at
`~/workspace/vector-hoops-scratch-rebuild`, never a PR branch, never
overwriting live `vectors.json`, all outputs to scratch space, live
sha recorded before and after.

**Deviation 1 — worktree base (reported, not hidden).** The task
says "off current master." The local branch literally named `master`
points at `4ae40acd` (#135), is 40 commits behind the live main
line, and its tracked cache has only 752 files vs. 788 — it predates
the `official_totals` 2022-23…2025-26 files the default rebuild
reads. Building from it would test a superseded tree. The scratch
worktree was therefore created detached at `1e5bfecc` — the commit
the live checkout sits on, tracking `origin/master`, containing PRs
#193 and #194 — in a NEW directory, not the existing
`scout/mlops-v2-draft` worktree. The worktree is labeled scratch
(`SCRATCH_README.txt` at its root), detached (no new branch, no
commits), and left uncommitted. If the coordinator wants a literal
local-`master` rebuild too, it is a second run with a predictably
different (thinner-cache) outcome, not a correction to this one.

**Deviation 2 — cache handling (premise corrected by evidence).**
The task premise says "the cache is untracked local data, so a fresh
worktree will not contain it." Measured fact: `git ls-files
pipeline/cache` returns 788 files — the cache IS tracked. The fresh
worktree therefore contained the full cache (445 top-level entries,
788 files, verified by count in the scratch tree) with no symlink,
no copy, and no read-only flag needed. The scratch tree's cache is
a separate git checkout of the same tracked files, so the live
checkout's cache was never read through a symlink and never at risk
of modification. The build ran entirely inside the scratch tree:
its outputs went to the scratch tree's own `pipeline/data/` and its
own copy of `assets/vectors.json` — both untracked scratch
artifacts, never the live files.

**Command run (verbatim):**

```
cd ~/workspace/vector-hoops-scratch-rebuild
python3 pipeline/build_vectors.py --offline
```

- `--help` read first. `--offline` semantics (from `--help` and the
  code): rebuild from `pipeline/cache` only, no network; without
  `--allow-partial`, ANY missing season/source makes the build exit
  2 BEFORE writing anything ("vectors.json and the matrix were not
  written"). No `--allow-partial` was passed. No other flags were
  passed (default `--minutes-source official`, schedule-aware gates).
- Full log: `/tmp/overhaul-build-offline.log` (2,600 bytes; per-season
  "qualified" lines for all 30 seasons, plus the percentage-missing
  report and the 8 archetype lines). The log is ephemeral scratch;
  the numbers that matter are reproduced in §3–§5 below.
- Runtime: ~4 seconds wall (numpy 1.26.4, system python3). No
  packages installed, no GPU touched, no training code executed.
  This was a data build: it writes a matrix and a game vector, it
  trains nothing.

## 3. What the run produced (measured, scratch tree only)

| Artifact (scratch tree) | Size / shape | sha256 |
|---|---|---|
| `pipeline/data/train_matrix.npz` | 2,407,002 bytes; keys `Z` (12,966 × 73, float32), `mask` (12,966 × 73, bool), `player_id` (12,966, int64), `season` (12,966, `<U7`), `name` (12,966, `<U24`), `cluster` (12,966, int64) | `2422e56a132cb649c78d67bd43d63b2e830fec5677ed313660488f3744e5de6d` |
| `pipeline/data/feature_manifest.json` | 4,872 bytes; keys: built, n_players, eligibility, features, families, game_features, tracking_first_season, seasons_fetched, seasons_missing, salary_coverage, notes | `0d78c6c474056c79ff4f4d95b2891f6dab4a8c1a9fbebb757238a0c42afc5b4e` |
| `assets/vectors.json` (scratch copy ONLY) | 3,687,645 bytes; 12,966 players, 14-d `v` each | `7b909d134397cb00e5937be16ddef077133742e9d850e30e9d79a5e631a73e77` (differs from live — expected: see §4) |

**Build log facts:**

- All 30 seasons report "qualified": 1996-97 = 398 through
  2025-26 = 491, matching the contract's per-season table exactly,
  including the short-season gates (1998-99 = 377 at gp ≥ 10,
  2019-20 = 448 and 2020-21 = 484 at gp ≥ 11).
- `seasons_fetched`: 30; `seasons_missing`: [] (from the manifest).
- Salary coverage: 11,504/12,966 rows (matches the Oct 18 protocol's
  11,504 exactly).
- `Z` NaN count: 0 (measured). Mask mean: 0.7890 (78.9% of cells
  observed — consistent with structural masks for tracking/form-era
  families plus sparse families).
- Percentage-missing report (rows where a 0.0 rate has no attempt
  behind it, hence masked not zero): FG3_PCT undecided 1,615;
  FT_PCT undecided 56; PCT_AST_3PM/PCT_UAST_3PM no-make 2,736;
  PCT_AST_2PM/PCT_UAST_2PM no-make 7; PCT_AST_FGM/PCT_UAST_FGM
  no-make 1; CATCH_SHOOT_FG3_PCT no-attempt 56. Plus two numpy
  RuntimeWarnings (mean of empty slice; degrees of freedom ≤ 0) —
  warnings, not failures: they arise from all-masked season-feature
  cells (e.g. a pre-era tracking column within a pre-2013 season
  block) and the code already guards them (sd → 1.0, mu → 0.0).
  They are recorded here because a clean run should not hide its
  warnings; they do not change the exit code or any value.
- Archetypes: 8 clusters (1,690 / 1,532 / 1,735 / 2,091 / 1,914 /
  2,035 / 1,004 / 965 players) — the k-means step runs on the game
  dims as part of the game-vector emit, not as training.

## 4. Row identity: same universe, different display names

- **Matrix ↔ scratch game vector:** (`player_id`, `season`) sets are
  exactly equal (0 differences, measured). G-11 (cross-output key
  equality) passes.
- **Scratch game vector ↔ live game vector:** (`player_id`,
  `season`) sets are exactly equal (0 differences). The 12,966-row
  universe is identical.
- **Display-name comparison (the 454-row footnote):** comparing by
  (`name`, `season`) instead of (`player_id`, `season`) shows 454
  rows differing — but every one is a display-name normalization
  difference, not a different player: live "Gary Payton Sr." vs.
  scratch "Gary Payton"; live "Shaquille O'Neal" vs. scratch
  "Shaquille ONeal"; live "Mahmoud Abdul-Rauf" vs. scratch "Mahmoud
  AbdulRauf"; and the same Sr-suffix / apostrophe pattern across
  all 30 seasons (4–39 rows per season). Cause: the raw
  `build_vectors.py` output has not passed through
  `apply_player_identity.py` / `enrich_vectors.py`, which apply the
  identity registry's display fixes (Sr/Jr suffixes, punctuation).
  The scratch vector also lacks the live file's `person_id` and `p`
  (position) fields — again, enrichment steps, not build steps.
- **Value comparison:** for the first 2,000 shared (`name`,
  `season`) keys, the 14-d `v` vectors match exactly (mean max
  |Δv| = 0.0 at the file's 3-decimal rounding). The base build
  reproduces the live game vector's values; it does not reproduce
  the live file's enriched presentation fields. A pipeline that
  stops at `build_vectors.py` ships a matrix-identical but
  presentation-incomplete game vector — the rebuilt pipeline
  (PIPELINE_DESIGN.md §3 S6) therefore treats identity enrichment
  as a stage, not an afterthought.

## 5. Feature order vs. manifest vs. the 17 families

**Produced manifest (73 columns, in order):**

1. Game 14 (frozen order): PTS, AST, OREB, DREB, STL, BLK, TOV,
   FG3A, FGA, FTA, FG3_PCT, FG_PCT, FT_PCT, PLUS_MINUS.
2. Advanced 14: AST_PCT, AST_TO, DEF_RATING, DREB_PCT, EFG_PCT,
   NET_RATING, OFF_RATING, OREB_PCT, PACE, PIE, REB_PCT, TM_TOV_PCT,
   TS_PCT, USG_PCT.
3. Scoring 13 (the shotmix family as built): PCT_AST_2PM,
   PCT_AST_3PM, PCT_AST_FGM, PCT_PTS_2PT, PCT_PTS_2PT_MR, PCT_PTS_3PT,
   PCT_PTS_FB, PCT_PTS_FT, PCT_PTS_OFF_TOV, PCT_PTS_PAINT,
   PCT_UAST_2PM, PCT_UAST_3PM, PCT_UAST_FGM.
4. Bio 5: AGE, DRAFT_NUMBER, PLAYER_HEIGHT_INCHES, PLAYER_WEIGHT,
   DRAFT_UNDRAFTED.
5. Tracking/playmaking 20 (mixed by the script's sorted-column rule):
   AVG_SEC_PER_TOUCH, AVG_SPEED, CATCH_SHOOT_FG3_PCT,
   CATCH_SHOOT_FGA, CATCH_SHOOT_PTS, DIST_MILES, DRIVES,
   DRIVE_PASSES, DRIVE_PTS, ELBOW_TOUCHES, FRONT_CT_TOUCHES,
   PAINT_TOUCHES, PASSES_MADE, POST_TOUCHES, POTENTIAL_AST,
   PULL_UP_FGA, PULL_UP_PTS, SECONDARY_AST, TIME_OF_POSS, TOUCHES
   (20 columns; the manifest's family map
   assigns 13 to tracking and 12 to playmaking across the whole
   matrix — see the footnote below).
6. Hustle/defense 6: HUSTLE_BOX_OUTS, HUSTLE_CHARGES,
   HUSTLE_CONTESTED_SHOTS, HUSTLE_DEFLECTIONS, HUSTLE_LOOSE_BALLS,
   HUSTLE_SCREEN_AST.
7. Market 1: SALARY_LOG (only the log-salary column; the contract's
   SALARY_CAP_PCT / SALARY_TEAM_PCT / SALARY_RANK_POS come from the
   side builder `build_salary_market.py`, not the base build).

**Family map in the produced manifest (9 families):** bio 5,
defense 9, efficiency 10, market 1, playmaking 12, rebounding 5,
shotmix 13, tracking 13, volume 5. Total 73.

**Footnote on "9 families" — read before quoting it.** The manifest's
`families` map uses the script's `FAMILY_OF` fallback, which assigns
several columns to families that differ from the contract's tower
grouping (e.g. tracking-source touch columns land in playmaking,
hustle columns land in defense). "9 families" is therefore a fact
about the base script's family map, NOT a claim that the base matrix
contains 9 towers. The contract's 17-family tower grouping cannot be
recovered from the base manifest alone — it requires the
full-context manifest, which names all 19 families (17 + system +
injury-readout). Do not present "9 families" as a tower count.

**Comparison against the HEAD contract manifest (143 columns):**

- All 73 produced columns appear in the contract manifest.
- Their relative order is preserved (shared-order check: true).
- 70 contract columns are absent from the produced matrix, all of
  them context-merge columns: form 5 (FORM_CEIL, FORM_DD_RATE,
  FORM_MIN_AVG, FORM_TD_RATE, FORM_VOL), roster 5, career 12,
  competition 4, market expansion 3 (SALARY_CAP_PCT,
  SALARY_TEAM_PCT, SALARY_RANK_POS), team 5, system 6, pedigree
  expansion 2, playoffs 14, honors 5 (contract honors columns
  HON_ALL_NBA_TEAM_LAG etc. — the base build carries no honors
  columns at all), injury-readout 4, plus defense/playmaking
  count differences from the wider contract columns.
- **Conclusion:** the produced matrix is a strict ordered PREFIX
  (in contract-relative order) of the contract matrix's column set,
  not a different matrix. The base chain and the full-context chain
  agree on the first 73 columns; they differ on whether the 70
  context columns exist. That is a scope statement, not a
  contradiction — and it is exactly why the width must be pinned by
  manifest, not by count.

**Comparison against the contract §0 "17 families (120 features)":**
matches neither. The 120 count matches no built artifact (see
INVENTORY.md §2.4). The produced matrix matches the Oct 18
protocol's 73-column base rebuild exactly in width, row count, and
salary coverage — an independent reproduction of a prior result,
which is stronger evidence than a first-time number.

## 6. Live-file integrity proof

| File (live checkout) | sha256 BEFORE | sha256 AFTER | Changed? |
|---|---|---|---|
| `assets/vectors.json` | `5e7141fff5e6f6a64d86a475070f9a5036c7e35f596504238ee9e34c54e40511` | `5e7141fff5e6f6a64d86a475070f9a5036c7e35f596504238ee9e34c54e40511` | **NO** |
| `assets/mtnn_embeddings.f32` | `2574ef581ac3d3ee0f793447c26c5c48b82ec309985d6afcf177ed08510458f4` | (not re-hashed after; file never opened for writing — build writes only inside the scratch tree) | **NO** (build path analysis: `build_vectors.py` writes to `ROOT/assets/vectors.json` and `ROOT/pipeline/data/`, where ROOT is the script's own checkout — the scratch tree) |
| Live checkout `git status` | clean before | clean after (verified: empty porcelain output) | **NO** |

Scratch-tree `git status` after the run shows exactly two expected
entries: `M assets/vectors.json` (the scratch copy, overwritten by
the build — that is the point of a scratch tree) and `??
SCRATCH_README.txt` (the label file). `pipeline/data/` is gitignored
and does not appear in status. No commit was made in any branch;
the scratch worktree is detached HEAD with no new branch.

**The build never insisted on a live path.** Because ROOT is derived
from the script's own location, running the script from the scratch
tree confines every write to the scratch tree. The "STOP and report
instead of overwriting" contingency did not trigger — there was
nothing to stop.

## 7. What was NOT verified (blockers, in order)

1. **The 143-column full-context chain.** `rebuild_all.py
   --refresh-context --stage matrix` (side builders +
   `integrate_context.py` + `stage_contract.py` check) was NOT run.
   Its inputs include gamelog-derived context files that do not
   exist on this VM, so it is expected to fail or to need the
   gamelog re-fetch first. Until it runs clean in a scratch tree,
   143 is an unverified target, not a verified width. This is the
   top remaining blocker for the full matrix — not Nugatron, not
   the base build.
2. **Honors semantics.** The contract notes record the honors
   family's observed rate swinging between 0.087 and 0.969 across
   builds, with the decision "recorded nowhere as made" (Lane 1
   §6). The base build carries no honors columns, so this run does
   not resolve it — but any full-context run will hit it immediately.
   Lane 2 owns the decision; it must land before the full chain is
   anchored.
3. **Width re-pin (user decision).** 120 (contract) vs. 130
   (champion export) vs. 143 (HEAD contract, unverified) vs. 73
   (verified base). This report provides the verified number (73)
   and the comparison; it does not pick. Recommendation in
   PIPELINE_DESIGN.md §7: pin 73 now, promote to 143 only on
   evidence.
4. **Identity enrichment in the rebuild path.** The raw build's
   game vector lacks `person_id`/`p` fields and display fixes. Any
   consumer that reads the rebuilt game vector directly (rather than
   the enriched live file) gets un-enriched rows. The rebuilt
   pipeline must include the enrichment stage (PIPELINE_DESIGN.md
   §3 S6) before its game vector is treated as equivalent to live.
5. **Shot-position tower.** No shot-location input exists for any
   historical season (SHOT_POSITION.md). The tower is a design, not
   a column, until the clean-machine probes answer RQ-1…RQ-5.

## 8. Reproduction recipe (for an independent re-run)

```
git -C ~/workspace/vector-hoops-mlops-v2 worktree list   # confirm scratch exists
cd ~/workspace/vector-hoops-scratch-rebuild               # detached HEAD 1e5bfecc
git rev-parse HEAD                                        # expect 1e5bfeccfb65b39cb010f6789dba00ccbd46524e
ls pipeline/cache | wc -l                                 # expect 445
find pipeline/cache -type f | wc -l                        # expect 788
sha256sum ~/workspace/vector-hoops-mlops-v2/assets/vectors.json   # record BEFORE
python3 pipeline/build_vectors.py --offline                # expect exit 0, "wrote vectors.json: 12966 … 73 wide features"
python3 -c "import numpy as np; z=np.load('pipeline/data/train_matrix.npz'); print({k: v.shape for k,v in z.items()})"
sha256sum ~/workspace/vector-hoops-mlops-v2/assets/vectors.json   # must equal BEFORE
```

Expected outputs: `Z (12966, 73)`, `mask (12966, 73)`,
`train_matrix.npz` sha256 `2422e56a…`, manifest sha256
`0d78c6c4…` (full hashes in §3). Any deviation in row counts,
width, or salary coverage (11,504) is a regression, not noise —
the run is deterministic in its counts (k-means seeding is fixed
at seed 7, but cluster labels are presentation, not matrix values;
the matrix values themselves are deterministic given the cache).

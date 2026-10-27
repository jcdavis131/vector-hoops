# Lane 1 — Data Collection: Sources & Provenance

**Lane:** 1 Data collection · **Status:** DRAFT ONLY (train gate closed; no
training, no GPU, no installs, no repo writes) · **Date:** 2026-10-26

**Read first:** `specs/mtnn-v6-contrastive-SPEC.md` (vector-hoops repo) and
`~/workspace/mlops-v2-drafts/CONTRACT.md` §0/§1/§2b. This file follows the
contract's shared facts and corrects them only where evidence contradicts
them — see §8 for the conflicts found.

**Headline finding (corrects the spec's premise):** the spec says the
original feature-building pipeline is "NOT found in this repo; may live on
Nugatron." That was true of the `vector-hoops` checkout's history, but the
pipeline **does exist in-repo today** in the `vector-hoops-mlops-v2`
checkout (vector-hoops master `1e5bfecc`): `pipeline/build_vectors.py` →
`pipeline/enrich_vectors.py` → the `rebuild_all.py --refresh-context`
side builders → `pipeline/integrate_context.py`, with a contract check
against `pipeline/contracts/train_matrix.contract.json`. What does **not**
exist anywhere checked is a committed copy of the built matrix itself
(`pipeline/data/` is gitignored and absent from all three checkouts), and
the current chain does **not** reproduce the champion's exact input matrix
(see §2 and §6). The pipeline is found; the champion's exact matrix is not.

## 1. Checkouts examined (read-only)

| Checkout | State | What it holds |
|---|---|---|
| `~/workspace/vector-hoops` | branch `scout/insights`, commit `3946c7a0` | Spec + manim explainer + prior v6 script. **No `pipeline/cache/` at all.** Not a data source. |
| `~/workspace/vector-hoops-mlops-v2` | master `1e5bfecc` | Full pipeline + full cache (788 files incl. subdirs) + contract + reproduction protocol. **This is the data-provenance checkout.** |
| `~/workspace/vector-hoops-twins` | `bf66ad38` (#194) | Same repo family, same pipeline/cache layout (445 top-level cache entries). No separate data source; confirms cache is repo-tracked, not local-only. |

`~/workspace/evals/embeddinggemma-hoops/` holds the eval-side artifacts:
`champion_twins_test.json` (v5 top-10 twins, 991 test rows, row-id keyed),
`player_texts.json` (Wikipedia intros, eval use only — **not** a training
input), and the CPU venv the spec's dispatch checklist names.

## 2. The width problem — four different "feature matrices"

Lane 2/4 must not treat "the 120 features" as settled. Evidence:

| Width | Source | Status |
|---|---|---|
| 120 in 17 families | Spec §2, citing `assets/manim/src/input_families.py` (v4 explainer) | Family **counts** only — the file names no per-feature columns. |
| **130 in 17 families** | `assets/mtnn_arch.json` (champion export, built 2026-07-25): layers[0] detail "130 feats in 17 families + mask" | **The champion's own export.** This is the best evidence of what v5 actually trained on. |
| 142 → 143 columns | `pipeline/contracts/train_matrix.contract.json` (HEAD prepare chain, re-recorded 2026-10-10, FA2 matrix sha256 `60dba1cbeabd6e03`, manifest `f1c90cdca75df174`); contract notes also cite a "130-feature (later 142-feature)" champion matrix | The current rebuildable matrix, **not** the champion's matrix. Includes extra families the spec never lists: `system` (6) and `injury` (4, readout-only), plus wider per-family columns (e.g. playoffs 14, not 5; career 12, not 6). |
| 73 features | `docs/MTNN_V5_REPRODUCTION_PROTOCOL_2026-10-18.md` §3: `build_vectors.py --offline` alone, rebuilt 2026-10-18 | Base chain only, no context side builders. |
| 11 columns | `assets/mtnn_inputs.f32` (570,504 bytes = 12,966 × 11, verified by byte count) | The "proxy" — see §5. Not a feature matrix. |
| 64 dims | `assets/mtnn_embeddings.f32` (3,319,296 bytes = 12,966 × 64, verified) | The champion's output, i.e. option 3's input. |

**Consequence:** option 1 cannot promise "the 120 features v5 used." It can
promise "a real, contract-checked feature matrix built from the tracked
caches by the current HEAD chain" — currently 143 columns. The width must
be re-pinned by the coordinator (contract amendment) before Lane 4 writes
its input loader. See §8, conflict C1.

## 3. Raw stat sources, by family

Per-100 rates at the door, z-scored **within season** (era-honest), clipped
at ±4σ, NaN → season mean with a per-feature mask (`build_vectors.py`
docstring; `feature_manifest.json` notes). Eligibility: schedule-aware GP +
minutes gates (`pipeline/eligibility.py`: 15% of season GP clamped 10–15,
plus 6% of 48-mpg schedule total minutes, floor 450). Dedupe on
`(PLAYER_ID, season)`, most-minutes row kept. Identity key is `person_id`
(see §7 caveat); season key is the `YYYY-YY` string.

| Family (spec count) | Raw source | Fetch script → cache (all under `pipeline/cache/`) | Coverage |
|---|---|---|---|
| volume 10, playmaking 10, rebounding 8, defense 8, efficiency 8, shotmix 10 (core box + advanced + scoring) | stats.nba.com `leaguedashplayerstats` Base / Advanced / Scoring | `build_vectors.py` fetch layer → `base_*.json`, `dashbase_*.json`, `dashadvanced_*.json`, `dashscoring_*.json` (30 files each) | 1996-97…2025-26, all 30 seasons |
| volume/efficiency cross-check | Basketball-Reference advanced + per-game tables | `fetch_bbref_advanced.py` → `bbref_advanced_*.json`, `bbref_per_game_*.json` (30 each); BBRef also supplies per-game minutes + positions (`positions_bbref.json`) | 1996-97…2025-26 |
| bio 5 | stats.nba.com `leaguedashplayerbiostats` (height, weight, age, draft) + `drafthistory` via nba_api + `draftcombinestats` (combine measurements) | `build_vectors.py` fetch layer; `fetch_draft_history.py`, `fetch_combine.py` → `bio_*.json` (30), `draft_history.json` | 1996-97…2025-26 |
| tracking 12 (masked pre-2013) | stats.nba.com `leaguedashptstats` (drives, touches, catch-and-shoot, pull-ups, speed/distance) | `build_vectors.py` fetch layer; `fetch_advanced_tracking.py` → `tracking_*.json` (13 seasons) + `tracking_summary.json` (built 2026-08-09) | **2013-14…2025-26 only**; pre-2013 masked, never imputed. Contract coverage: tracking family 0.463 observed |
| defense, hustle slice (2015-16+) | stats.nba.com wide tracking (deflections, loose balls, charges, box-outs, screen assists, contested shots) | `fetch_wide_skills.py` → `wide_skills_*.json` (11 files) | **2015-16…2025-26 only**, masked earlier |
| form 6 (masked pre-2015) + shape 4 (HEAD chain only) | Local per-game logs, stats.nba.com game logs | `fetch_gamelogs.py` → **`pipeline/data/gamelogs_*.jsonl` — gitignored, ABSENT from all three checkouts**; consumed by `form_context.py`, `build_min_gp.py`, `build_availability.py`, `build_career_context.py` | Gamelog era 2015-16+ per `build_availability.py` docstring; form family coverage 0.398 in the contract file. **This is option 1's hard gap — see §6.** |
| market 4 | Salary history CSV (Kaggle/hoopshype export — see §7) + Basketball-Reference contracts pages (current contracts) | `fetch_salaries.py` + `merge_salaries.py` → `salaries_history.csv` (16,679 lines, 1990-91 onward), `salaries_merged.json`, `salary_bbref_current.json`; `build_salary_market.py` derives log-salary + cap/team % + rank | Salary coverage 11,504/12,966 rows (Oct 18 protocol); market family 0.884 observed |
| roster 5 | Derived: roster joins from gamelogs + team-season stats | `roster_context.py` (needs `pipeline/data/gamelogs_*.jsonl` + `team_season_*.json`) | Roster/team/system coverage 0.261 in the contract file — the lowest of any family; the contract file's notes tie this to the gamelog-dependent builders |
| career 6 (spec) / 12 (HEAD chain) | Derived: continuous `PLAYER_ID` trajectories over the base matrix + gamelog availability | `build_career_context.py` (reads `train_matrix.npz` + `availability.json`) | Career family 0.693 observed |
| competition 6 (spec) / 4 (HEAD chain) | Derived: schedule + team-season context | `competition_context.py` (needs gamelogs + `team_season_*.json`) | Competition coverage 0.398 |
| team 8 (spec) / 5 (HEAD chain) | stats.nba.com `leaguedashteamstats` Base + Advanced | `fetch_team_season.py` → `team_base_*.json`, `team_advanced_*.json` (30 each) | 1996-97…2025-26 |
| pedigree 4 (spec) / 7 (HEAD chain) | Draft history (stats.nba.com) | `fetch_draft_history.py`, `build_pedigree.py` → `draft_history.json`, `pedigree.json` | Draft-era players; pedigree family 0.927 observed |
| playoffs 5 (spec) / 14 (HEAD chain) | stats.nba.com playoff game logs + team playoff records | `fetch_playoffs.py`, `fetch_playoff_gamelogs.py` → `playoffs_*.json`, `playoff_games_*.json` (30 each) | 1996-97…2025-26; playoffs family 0.459 observed (non-playoff rows masked) |
| honors 5 | Basketball-Reference awards pages | `fetch_honors.py`, `build_honors.py` → `honors_award_*.json` (30 files, year-keyed 1997…2026; the 2026 file carries `"source": "basketball-reference.com/awards"`, `"complete": true`, season `2025-26`) | Honors family 0.924 observed in the FA2 contract matrix — but see the semantics warning in §6 |
| system 6 (HEAD chain only, not in spec) | Derived: k-means offensive-style tags over team-season stats | `derive_system_tags.py` → `system_tags.json` | Same 0.261 coverage as roster/team (same join) |
| injury 4 (HEAD chain only, readout — never a tower input) | Derived from gamelog availability | `build_availability.py` → `availability.json` | 0.398 observed; `train_mtnn.py` drops injury as input always |

**Not in the train matrix (do not let them leak in):** 2K video-game
ratings (`fetch_2k_ratings.py`, third-party fan site 2kratings.com — the
contract chain's `game_ratings` family is dropped by the
`MIN_FAMILY_COVERAGE = 0.01` gate: "2 fixture rows until 2026-10-09, no rows
since"); preseason/title odds (`fetch_preseason_odds.py`,
`fetch_odds_sportsoddshistory.py` — no odds columns appear in the contract
column list); Wikipedia bios (`player_texts.json` — eval texts only).

## 4. Season coverage through 2025-26 (verified row counts)

From `assets/vectors.json` players (mlops-v2 checkout; 12,966 rows total,
row order preserved by the identity fix):

| Season | Rows | Season | Rows | Season | Rows |
|---|---|---|---|---|---|
| 1996-97 | 398 | 2006-07 | 418 | 2016-17 | 441 |
| 1997-98 | 393 | 2007-08 | 412 | 2017-18 | 460 |
| 1998-99 | 377 | 2008-09 | 407 | 2018-19 | 457 |
| 1999-00 | 397 | 2009-10 | 413 | 2019-20 | 448 |
| 2000-01 | 395 | 2010-11 | 420 | 2020-21 | 484 |
| 2001-02 | 402 | 2011-12 | 435 | 2021-22 | 488 |
| 2002-03 | 394 | 2012-13 | 430 | 2022-23 | 464 |
| 2003-04 | 394 | 2013-14 | 434 | 2023-24 | 484 |
| 2004-05 | 415 | 2014-15 | 450 | 2024-25 | 500 |
| 2005-06 | 428 | 2015-16 | 437 | 2025-26 | 491 |

These match the contract's recent-season sizes exactly (2022-23 = 464,
2023-24 = 484, 2024-25 = 500, 2025-26 = 491). The 2025-26 caches are present
and populated (e.g. `base_2025-26.json` 582 raw rows before eligibility
gates vs 491 served rows; `bio_2025-26.json` 582; `honors_award_2026.json`
marked complete). No 2026-27 player-season rows exist in the matrix;
`current_rosters_2026_27.json` is a roster file, not training data.

## 5. What the "11-feature proxy" actually is (option 2's input)

`assets/mtnn_inputs.f32` is **not** 11 base features. Its only in-repo
writer, `pipeline/export_mtnn_viz.py`, writes it as `fam_norm`: for each
family in the export-time manifest, the per-row mean of that family's
masked z-scores, rescaled 0–1 by the 5th–95th percentile. It is a
**visualization artifact** (per-family means for the network diagram),
not a training matrix.

Two facts break any naive reuse:

1. The shipped file is 11 columns wide, but the champion's arch lists 17
   families. A viz export of the champion run would have written 17
   columns. The shipped 11-wide file therefore does **not** match the
   champion export's writer output — it comes from some other run/export.
2. The file carries no header, so its 11 column identities are
   **UNCONFIRMED**. Confirmation would require the export-time manifest
   and run bundle that produced it; neither is in the repo (the
   `train_with_text_fusion.py` comment calling it "11 base feats"
   contradicts the viz writer and is not evidence).

Any use of the proxy must treat its columns as 11 unlabeled family-mean
summaries, not as features. Within-family variation, per-feature masking,
and all era structure below family level are already destroyed before
training starts.

## 6. Option 1's rebuild chain — what exists, what is missing

**Exists and is runnable in principle (draft description only; nothing
was run for this lane):**

1. `python pipeline/build_vectors.py --offline` — rebuilds
   `pipeline/data/train_matrix.npz` + `feature_manifest.json` from the
   tracked caches only (73 features per the Oct 18 protocol), plus the
   served `assets/vectors.json` 14-dim game vector.
2. `python pipeline/rebuild_all.py --refresh-context --stage matrix` —
   runs the side builders in dependency order (`build_skills`,
   `build_wide_skills`, `build_pedigree`, `build_playoffs`,
   `build_honors`, `roster_context`, `build_min_gp --offline`,
   `build_availability`, `build_career_context`, `form_context`,
   `competition_context`, `derive_system_tags`, `build_player_meta`,
   `build_current_rosters`), then `enrich_vectors.py` +
   `integrate_context.py`.
3. `pipeline/integrate_context.py` ends with the same check
   `pipeline/stage_contract.py` runs against
   `pipeline/contracts/train_matrix.contract.json` and exits 2 with a
   violation list if the rebuilt matrix drifts (row count ±1%, columns
   and families exact and in order, family-coverage drop ≤ 5 points,
   column-zero rise ≤ 10 points, keys exact).

**Missing or undecided — these are option 1's blockers, in order:**

1. **No built matrix on disk.** `pipeline/data/` does not exist in any of
   the three checkouts (gitignored per `pipeline/recipes/ship.json`
   notes). The Oct 18 protocol's rebuild and the contract file's FA2
   matrix (sha256 `60dba1cbeabd6e03`) both lived on other boxes/runs and
   are not retrievable from the repo.
2. **No game logs.** `pipeline/data/gamelogs_*.jsonl` (stats.nba.com
   regular-season logs, 2015-16+) is absent everywhere. Every
   gamelog-dependent side builder (`roster_context`,
   `build_availability`, `build_career_context`, `form_context`,
   `competition_context`, `build_min_gp`) is blocked offline until the
   logs are re-fetched with `fetch_gamelogs.py` — a network fetch against
   stats.nba.com's throttling, not a local rebuild. Without them, only
   the 73-feature base matrix is rebuildable here.
3. **Honors semantics undecided.** The contract file's own notes say the
   HEAD rebuild's honors family was 0.087 observed against the promoted
   matrix's 0.969, and: "Decide the honors semantics before re-anchoring
   on a rebuilt matrix." The FA2 re-record shows 0.924–0.969, but the
   decision itself is recorded nowhere as made. Lane 2 owns the call.
4. **The champion's exact matrix is unrecoverable, by the repo's own
   record.** The Oct 18 reproduction protocol (pre-registered, CPU,
   seeds 7/13/21) found "does not reproduce": mean test recall@10 0.7787
   vs the 0.846 ± 0.062 band, mean purity@20 0.7461 vs 0.7834 ± 0.011,
   linear CKA 0.7741 against the served embeddings, top-1 neighbor
   identical on only 32.8% of probes. Its §10 conclusion: "The
   champion's exact setup is unrecoverable. The champion commit (53d35adb)
   is not in this repo's history." A second claimant run (2026-07-30/31
   smoothed checkpoint, CQS 77.46) vs the 2026-07-25 no-checkpoint arm
   (recall 0.846) means even the champion's own lineage is disputed.
   **Option 1 must therefore be sold as "a real matrix," never as "v5's
   matrix."**

**Nugatron / training-box status — UNCONFIRMED.** The contract file notes
a "promoted matrix on the training box" dated 2026-08-04 (sha256
`231b07f1df283205`) that fails the HEAD contract on column order, and
`~/workspace/forge/` holds Nugatron jobs that ran
`pipeline/train_mtnn.py` on vector-hoops master (e.g.
`nugatron-hoops-mtnn-seed210-0002/0003`, CUDA, RTX 4080). Whether that
box still holds a `train_matrix.npz` + `feature_manifest.json`, and
whether it is the 130-column champion matrix or yet another variant, is
**UNCONFIRMED**. What would confirm it: listing that box's
`pipeline/data/` (filenames, mtimes, sha256s) and reading its
`feature_manifest.json` column list — a remote check this lane did not
attempt (read-only VM scope; no remote access initiated). Even if found,
it would still need the contract check and the honors decision before
use, and copying a training-box matrix into the draft is a coordinator
decision, not a lane action.

## 7. Identity, row alignment, and licensing notes

**Identity.** The contract's identity key is `person_id`. Verified:
the mlops-v2 checkout's `assets/vectors.json` players carry `person_id`
(e.g. row 0, AC Green 1996-97, `person_id: "ac-green"`) via
`pipeline/apply_player_identity.py` + `assets/player-identity.json`
(present in mlops-v2, **absent** from the vector-hoops checkout, whose
players have no `person_id` field). Lane 2/3 must pin the mlops-v2
checkout's `vectors.json` as the row master; the branch checkout's file
is not equivalent. The train matrix carries `player_id` (NBA PLAYER_ID),
`season`, and `name` arrays, and `export_mtnn_viz.py` enforces row
equality between the matrix and `vectors.json` by `(player_id, season)`
key — Lane 4's loader should reuse that key, never row position alone.

**Row alignment for options 2/3.** `mtnn_meta.json` states the embeddings
are "index-aligned with vectors.json"; `embedding_v3_with_text.npz` in
`vector-hoops-mlops-v2/data/` carries `z` (12,966 × 64), `player_id`,
`season`, `name` for the same rows. Alignment must still be verified by
key at load time (Lane 2/4), not assumed from file order.

**Licensing / rights-free fit — read this as open, not settled:**

- **No license file exists** in either checkout (no `LICENSE*` found),
  and no rights statement was found in `docs/PIPELINE.md` or the
  pipeline docstrings. Nothing in-repo grants or asserts a license for
  the data. Do not print "rights-free" as an established fact.
- **What the product actually ships** is derived, not raw: 64-d learned
  embeddings + a 14-stat per-100 z-scored profile + names/seasons. No
  photos, video, audio, logos, or trademarks appear in the matrix; no
  play-by-play text is served. Player names and game statistics are
  facts, which is the favorable half of the argument — but it is not a
  legal opinion, and it does not cover the *collection* layer below.
- **Collection layer (the risk):** core stats come from stats.nba.com
  via `nba_api`/unofficial endpoints (`pipeline/nba_http.py`, browser
  user-agent strings in fetch scripts); BBRef tables (advanced, awards,
  positions, contracts) are HTML-scraped. The terms under which each
  site permits automated collection and republication in a derived
  product are **UNCONFIRMED** — a web search for Sports Reference's own
  terms did not return its terms page, and no NBA terms text was located
  in-repo or verified from NBA's site during this lane. What would
  confirm it: the current terms pages for stats.nba.com and
  Sports Reference, read directly, plus a legal read on derived-embedding
  use. Until then, the honest product claim is "derived from public
  game statistics, no media or marks," not "rights-free."
- **Salary CSV provenance is undocumented.** `salaries_history.csv` is
  present and merged, but its upstream export (Kaggle vs HoopsHype vs
  other) is not recorded in the file or its schema; `fetch_salaries.py`
  itself describes the CSV as a manual drop-in ("search Kaggle… or a
  one-off scrape"). Treat the market family's upstream license as
  **UNCONFIRMED**.
- **Clean by exclusion:** 2K fan-site ratings, betting odds, and
  Wikipedia bios are not train-matrix inputs (§3), so they do not taint
  the matrix's licensing story — but they must stay out (Lane 2 check).

## 8. Contract conflicts found (reported, not reinterpreted)

- **C1 — Feature width (contract §0 vs champion export).** Contract §0
  states "17 tower families (120 features)" with the manim counts.
  `assets/mtnn_arch.json` (the champion's own export) states "130 feats
  in 17 families." The contract's 120 is the v4 explainer's count, not
  the champion's. Lane 1's §2b interface ("12,966 × 120") inherits the
  same error: the matrix Lane 4 loads will be 143 columns (HEAD chain)
  or 73 (base chain), not 120, unless the coordinator amends the
  contract to pin one width. **Recommendation: amend §0/§2b to pin the
  HEAD-chain 143-column matrix (or the base 73) explicitly, and drop
  "120" as the interface width.**
- **C2 — Checkout dependence of `person_id` (contract §0).** "All 12,966
  rows in the current master vectors file carry a person_id" holds for
  the mlops-v2 checkout's `vectors.json` but not for the vector-hoops
  checkout's branch copy. Not a factual error if "master" means the
  mlops-v2 checkout — but Lane 3 must name that checkout as the row
  master, or the claim fails on the other checkout.
- **No other conflicts found.** The contract's season sizes, split
  framing, and the random-projection ban are all consistent with the
  evidence (the ban targets `train_mtnn_v6_scaling.py`'s documented
  "expand via random projection for 120 dims consistent with v5" step,
  quoted in §5 of the companion file).

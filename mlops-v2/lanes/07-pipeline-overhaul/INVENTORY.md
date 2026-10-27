# Lane 07 — Pipeline Overhaul: Inventory of NBA Data Already on This VM

**Lane:** 07 pipeline overhaul · **Status:** DRAFT ONLY (train gate closed;
no training, no GPU, no installs, no prod writes, no merge) ·
**Date:** 2026-10-26 · **Checkout measured:**
`~/workspace/vector-hoops-mlops-v2` at `1e5bfecc` (the live main line;
see the branch note in §6) · **Method:** every number below was measured
from the files on this VM on 2026-10-26. Nothing here is recalled or
estimated. Where a number comes from Lane 1/2 prior work it is cited,
not re-asserted.

**One-line verdict:** the VM already holds everything the 73-feature
base matrix needs, plus the served game vector and the champion
embedding — but it does NOT hold a training matrix, a gamelog cache, or
any historical shot-location cache. The missing pieces are named, not
papered over.

## 1. The source cache: `pipeline/cache/` (the foundation)

- **Size:** 105 MB on disk (`du -sh`), 102.97 MiB summed file-by-file.
- **Counts:** 445 top-level entries, **788 files including subdirectories**
  — and `git ls-files pipeline/cache` also returns 788, so the cache is
  **git-tracked, not untracked local data**. A fresh worktree of commit
  `1e5bfecc` contains the full cache (verified in the scratch worktree;
  see OFFLINE_REBUILD_REPORT.md). Any plan that assumes the cache must
  be copied, symlinked, or hunted on another machine is working from a
  stale premise.
- **Composition caveat:** 98 of the 788 files (41.83 MB) under
  `pipeline/cache/checkpoints/` are run checkpoints, not source data.
  The actual source-data cache is ~690 files / ~61 MB. Do not quote
  "788 files of data" — quote 788 tracked files, ~690 of them source data.
- **Season span:** 30 seasons, 1996-97 through 2025-26, for every
  per-season source below. No 2026-27 player-season source files exist
  (2026-27 material on disk is live-game/replay data only, §5).

### 1.1 Per-source coverage (measured)

| Source group (cache prefix) | Files | Size | Season coverage | Status |
|---|---|---|---|---|
| `base_*` (stats.nba.com leaguedashplayerstats, Base) | 30 | 1.47 MB | 1996-97…2025-26, all 30 | Complete |
| `dashbase_*` | 30 | 3.31 MB | 1996-97…2025-26 | Complete |
| `dashadvanced_*` | 30 | 3.80 MB | 1996-97…2025-26 | Complete |
| `dashscoring_*` (Scoring dashboard — the shotmix source) | 30 | 4.37 MB | 1996-97…2025-26 | Complete |
| `bio_*` (leaguedashplayerbiostats) | 30 | 2.12 MB | 1996-97…2025-26 | Complete |
| `bbref_advanced_*` | 30 | 2.56 MB | 1996-97…2025-26 | Complete |
| `bbref_per_game_*` | 30 | 1.65 MB | 1996-97…2025-26 | Complete |
| `tracking_*` (leaguedashptstats) | 13 | 2.66 MB | **2013-14…2025-26 only** | Complete for its era; pre-2013 structurally absent (masked, never backfilled) |
| `wide_skills_*` (hustle/defense tracking) | 11 | 1.33 MB | **2015-16…2025-26 only** | Complete for its era |
| `team_base_*` / `team_advanced_*` | 30 + 30 | 0.07 + 0.10 MB | 1996-97…2025-26 | Complete (team-season context; used by side builders, not by the base build) |
| `playoffs_*` / `playoff_games_*` | 30 + 30 | 1.11 + 15.42 MB | 1996-97…2025-26 | Complete (used by side builders, not by the base build) |
| `honors_award_*` (year-keyed 1997…2026) | 30 | 0.10 MB | 1996-97…2025-26; 2026 file marked `"complete": true` | Complete (Lane 1 §6: honors *semantics* still undecided — coverage is not the gap, the decision is) |
| `matchup_enriched_*` | 30 | 9.53 MB | 1996-97…2025-26 | Present; not a base-build input |
| `official_totals/` | 31 files (30 seasons + SOURCES.json) | 4.23 MB | 1996-97…2025-26 | Complete — this is what makes the default `--minutes-source official` rebuild work offline |
| `salaries_history.csv` | 1 | 0.53 MB | 16,679 lines, 1990-91 onward | Present; upstream export undocumented (Lane 1 §7: license UNCONFIRMED); salary coverage in the rebuilt matrix is 11,504/12,966 rows |
| `salaries_merged.json` / `salary_bbref_current.json` | 2 | 2.81 + 0.04 MB | merged history + current contracts | Present |
| `draft_history.json` | 1 | 0.88 MB | draft history | Present |
| `positions_bbref.json` | 1 | 0.27 MB | BBRef season positions | Present |
| `bbref_salaries/` (subdirectory) | 210 | 0.20 MB | per-team/per-season salary files | Present |
| `cdn_pbp/` (play-by-play, see §5) | 5 | 2.11 MB | 2026-27 opening games only | Present but tiny; NOT a historical cache |
| `pipeline/data/` (gamelogs, built matrices) | — | — | — | **ABSENT (gitignored). No `gamelogs_*.jsonl`, no `train_matrix.npz`, no `feature_manifest.json` in the live checkout.** This is the single largest gap. |

### 1.2 What is NOT in the cache

- **No shotchart cache.** No `shotchartdetail` response, no per-season
  shot-location file, no LOC_X/LOC_Y column anywhere under
  `pipeline/cache/` (a filename search for `*shot*` returns nothing;
  the only shot-location material on the VM is the 2026-10-20 snapshot
  pair under `pipeline/shotcharts/snapshots/` and the 5 `cdn_pbp/` games
  — §5, and SHOT_POSITION.md).
- **No game logs.** `pipeline/data/gamelogs_*.jsonl` is absent for all
  seasons. Consequence, measured in the rebuild: `compute_form_features`
  returns `{}` when the gamelog file is missing, so the base build
  silently produces **zero form features** — the form family exists in
  the 143-column contract but not in the 73-column base output. The
  gamelog-dependent side builders (form, roster, career, competition,
  availability/injury, system) cannot run offline until the logs are
  re-fetched. This is a scope cut to declare, not a gap to zero-fill.
- **No 2K ratings / odds / Wikipedia inputs in the matrix path.**
  `game_ratings.example.json` and `preseason_odds_raw.json` exist as
  stubs/examples; per Lane 1 §3 they are excluded from the train
  matrix (2K family dropped by the MIN_FAMILY_COVERAGE gate). Their
  presence in the cache directory must not be read as "in the model."

## 2. Served and model assets: what exists, what is a proxy, what is stale

All files below are in `assets/` of the `vector-hoops-mlops-v2` checkout
unless stated. Sizes and hashes measured 2026-10-26.

### 2.1 Real, served, current

| Asset | Size / shape | Verdict |
|---|---|---|
| `assets/vectors.json` | 4,133,521 bytes; 12,966 players; each `v` is 14 floats; built 2026-10-11; normalization "per-100 possessions, z-scored within season (era-honest)" | **REAL — the 14-d game vector.** Per-season counts reconcile exactly to the contract (2022-23 = 464, 2023-24 = 484, 2024-25 = 500, 2025-26 = 491; full 30-season table in Lane 1 §4). All 12,966 rows carry `person_id` (0 missing, measured). This file is a game-serving asset, NOT a training matrix — never validate one against the other as feature values (Lane 2 §0). sha256 (before rebuild): `5e7141ff…40511` (full hash in OFFLINE_REBUILD_REPORT.md). |
| `assets/mtnn_embeddings.f32` | 3,319,296 bytes = 12,966 × 64 × 4 bytes exactly | **REAL — the champion MTNN v5 output**, 64-d L2, built 2026-07-25 (`assets/mtnn_arch.json`: `mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256`, `dIn: 130`). Never overwritten, never a training input except under Lane 1 option 3 (distillation, explicitly labeled). sha256: `2574ef58…0458f4`. |
| `assets/mtnn_arch.json` | 3,180 bytes | **REAL — the champion's own export.** Its `dIn: 130` is the best evidence of what v5 actually trained on, and it contradicts the contract's "120". Its `towerFamilies` list is the 17 spec families; its `familyOrder` is alphabetical, not tower order — do not confuse the two. |
| `data/embedding_v3_with_text.npz` | 2,366,423 bytes | **REAL companion** to the champion embedding (12,966 × 64 `z` + `player_id` + `season` + `name`, per Lane 1 §7). Keyed alignment must still be verified at load, never assumed from order. |

### 2.2 Proxy — labeled, never a training matrix

| Asset | Size / shape | Verdict |
|---|---|---|
| `assets/mtnn_inputs.f32` | 570,504 bytes = 12,966 × 11 × 4 bytes exactly | **PROXY, NOT A TRAINING MATRIX.** Per Lane 1 §5, its only in-repo writer (`pipeline/export_mtnn_viz.py`) writes per-family means of masked z-scores rescaled 0–1 — a visualization artifact. The shipped 11 columns do not match the champion's 17 families, and the file carries no header, so its column identities are **UNCONFIRMED**. Any use must treat the columns as 11 unlabeled family-mean summaries. Random-projection expansion of this file to 120 dims is banned by contract §2b. |

### 2.3 Stale — do not present as served-v5 internals

| Asset | Size | Verdict |
|---|---|---|
| `assets/mtnn_heads.f32` (2,333,880 bytes), `assets/mtnn_jacobian.f32` (2,852,520 bytes), `assets/scoring_lite.f32` (412,560 bytes) | — | **STALE / NOT SERVED-V5.** Per contract §5 (coordinator-measured): the saved `mtnn.onnx` is 119→48, not the served 64-d v5, and the Jacobian/attribution exports are stale 48-d pre-v5 exports explicitly marked `not_from_served_net`. None of the three may be presented as served-v5 tower attributions. Any tower-level claim in this pass is estimated-from-facets or an explicit gap. |
| `assets/mtnn_arch.json` lineage vs. the Oct 18 reproduction protocol | — | **STALE LINEAGE WARNING.** Lane 1 §6: the champion commit (53d35adb) is not in this repo's history, and the Oct 18 pre-registered reproduction (12,966 × 73 base matrix) did NOT reproduce v5's geometry (CKA 0.7741, top-1 neighbor identical on only 32.8% of probes). A rebuilt matrix trains a *different geometry* than v5's. The rebuild is honest; "v5's matrix" is not recoverable. |

### 2.4 Width dispute — the four numbers, with sources

| Width | Source | Standing |
|---|---|---|
| 120 in 17 families | Contract §0, citing the v4 manim explainer `input_families.py` (family counts only, no column names) | **Superseded as an interface width.** The explainer counts do not match any built matrix. |
| **130 in 17 families** | `assets/mtnn_arch.json` (champion export, 2026-07-25) | Best evidence of what v5 trained on. |
| **143 columns** | `pipeline/contracts/train_matrix.contract.json` (HEAD chain, re-recorded 2026-10-10; FA2 matrix sha256 `60dba1cb…`) | The current rebuildable *full-context* matrix — but its build (side builders + `integrate_context.py`) was NOT re-verified in this pass; only the 73-column base was. Do not quote 143 as "verified" until that chain runs. |
| **73 columns** | `pipeline/build_vectors.py --offline` alone (Oct 18 protocol; re-verified 2026-10-26 in the scratch worktree — see OFFLINE_REBUILD_REPORT.md) | **The only width verified by an actual run in this pass.** 12,966 × 73, 9 families in the manifest's family map (see report for the family-count discrepancy vs. the contract). |
| 11 columns | `assets/mtnn_inputs.f32` | Proxy (§2.2), not a width candidate. |

**Re-pin decision goes to the user** (contract §6). This lane does not
silently re-pin 120 → 73 or 120 → 143. The recommendation is recorded
in PIPELINE_DESIGN.md §7: pin the verified base width first (73 +
shot-position tower when ready), and treat 143 as a second milestone
gated on the gamelog re-fetch, not as today's interface.

## 3. Game and replay data (not training data — do not let it leak in)

| Item | Measured | Role / warning |
|---|---|---|
| `assets/replays/` (index + 5 game files) | 6 files, 340 KB; games `0022600001`, `0022600002`, `0022600003`, `0022600085`, `0022600086` (2026-10-20/21 opening games, final scores in `index.json`) | Pixel Replay / Live playback data. Animation and presentation, not measurement. The same 5 game IDs appear in `cdn_pbp/` — that overlap is the only place play-by-play and replay meet. |
| `pipeline/cache/cdn_pbp/playbyplay_*.json` | 5 files, 2.11 MB; 593–667 actions per game; 174–188 field-goal actions per game, **all carrying `x`/`y`** (see SHOT_POSITION.md for the coordinate system) | The only per-shot location data in the stats cache — but 5 games, one week, 2026-27 only. A proof of concept for a PBP shot-location tower, not a historical training input. |
| `pipeline/shotcharts/snapshots/` (2026-10-20) | bbr: 545 records / 3 games / 62 players, 195,198 bytes; espn_plays: 546 records / 3 games / 62 players, 194,805 bytes; both QA PASS per their manifests | Canonical per-shot records (feet, hoop at origin) for one date. Valuable as the shot-tower prototype corpus and as the format contract — worthless as historical coverage until backfilled (see SHOT_POSITION.md). |
| `assets/eratwins.json` | 634,336 bytes; 1,313 era-twin pairs (Lane 1 companion: audited clean of same-person pairs post-#194) | Game surface data (Daily Court twin reveals), not a training input. |
| `assets/dossiers.json` | 2,033,991 bytes | Player dossier surface data, not a training input. |
| `assets/game_vectors.json` | 408,834 bytes; 9 top-level keys | Game surface data, not a training input. |
| `assets/replay-model.json` | 33,730 bytes; keys `meta`, `w` | Replay model weights for animation, not the MTNN model. |
| `assets/skills.json` | 478,628 bytes; 18 skill keys (matches `mtnn_arch.json` `skillKeys`) | Skill facets used by the prototypes; derived summaries, not raw training features. |
| Pixel sprite positions (Pixel Replay / Live figures) | — | **ANIMATION, NEVER TRAINING INPUTS** (contract §6). Sprite x/y on a court graphic is a drawing choice, not a measurement of where a shot was taken. Any pipeline stage that reads sprite positions as data fails review. |

## 4. What is stale, in one table

| Item | Staleness | Consequence |
|---|---|---|
| `mtnn_inputs.f32` (11 cols vs. 17 families) | Does not match the champion export's writer output | Column identities unconfirmed; proxy only |
| `mtnn_heads.f32` / `mtnn_jacobian.f32` / saved onnx (119→48) | Pre-v5 / wrong-width exports | Banned as served-v5 attributions |
| Champion lineage (commit 53d35adb absent; two claimant runs, July 25 vs. July 30/31) | Unrecoverable exact setup | Rebuilt matrix ≠ v5's matrix; judge the challenger on held-out metrics, not on reproducing v5 |
| Honors semantics | Decision recorded as open (Lane 1 §6); contract notes show 0.087 vs. 0.969 observed across builds | Lane 2 must decide before any full-context matrix is anchored |
| Contract §0/§2b "120 features" | Contradicted by champion export (130), HEAD chain (143), base chain (73) | Re-pin decision for the user; see §2.4 |
| Local branch `master` (4ae40ac) vs. live main line (1e5bfecc) | `master` is 40 commits behind and its cache has 752 tracked files vs. 788 | See §6 — do not build from local `master` |

## 5. Licensing note (carried from Lane 1, not re-decided)

No `LICENSE*` file exists in the checkout; no rights statement was
found in `docs/PIPELINE.md` or the pipeline docstrings. The shipped
product is derived (embeddings + 14-stat profiles + names/seasons; no
photos, video, audio, logos, or trademarks), but the collection layer
(stats.nba.com via unofficial endpoints, BBRef HTML scraping, salary
CSV of undocumented upstream) is **UNCONFIRMED** for republication
rights. The honest product claim remains "derived from public game
statistics, no media or marks" — not "rights-free." A shot-position
tower inherits this posture per source (SHOT_POSITION.md §6): ESPN's
public core API and BBRef shot-chart pages are the least-encumbered
candidates; stats.nba.com endpoints carry the ToS caveat even where
technically reachable.

## 6. Branch note (affects the rebuild, recorded here so it is not lost)

The live checkout `~/workspace/vector-hoops-mlops-v2` sits on branch
`scout/mlops-v2-draft` at `1e5bfecc`, which tracks `origin/master` and
is the current merged main line (it contains PRs #193 and #194). The
local branch literally named `master` points at `4ae40acd` (#135),
is 40 commits behind, and its tracked cache has only 752 files (it
predates, among other things, the `official_totals` 2022-23…2025-26
files the default rebuild needs). Building from local `master` would
test a superseded tree and a thinner cache, and would answer a
different question than "does the live pipeline rebuild." The scratch
rebuild therefore used detached HEAD `1e5bfecc` — the live main line
in a scratch directory, not the existing branch worktree — and this
deviation from the literal "off current master" wording is reported as
a contract/task-framing conflict in the final message, not hidden.
If the coordinator wants a literal local-`master` rebuild as well, it
is a second, separately-scoped run.

## 7. Gaps ranked (what the overhaul must close, in order)

1. **No built training matrix on disk** — closed for the base chain by
   the verified rebuild (73 cols, scratch only); the full-context
   chain (143) is still unverified and gamelog-blocked.
2. **No gamelog cache** — blocks form/roster/career/competition/
   availability/system families outright. Re-fetch is a scheduled
   network job on a machine with clean stats.nba.com access, not a
   local rebuild.
3. **No historical shot-location cache** — blocks the new shot-position
   tower for all 30 seasons (SHOT_POSITION.md). One date of snapshots
   + 5 PBP games exist; neither is history.
4. **Honors semantics undecided** — blocks anchoring any full-context
   matrix, even after the gamelogs return.
5. **Width unpinned (120 vs. 130 vs. 143 vs. 73)** — blocks Lane 4's
   input loader until the user re-pins. The base width (73) is the
   only verified number today.

# MLOps v2 — Lane Contract (INTERFACE FIRST, binding)

Coordinator owns this file. Lanes do not edit it. If a lane finds a contract
error, it reports the conflict in its final message; it does not silently
reinterpret the contract.

## 0. Shared facts (do not re-derive, do not contradict)

- Champion: MTNN v5, `mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256`,
  12,966 player-seasons through 2025-26, 64-d L2, `assets/mtnn_embeddings.f32`,
  incumbent 2026-07-25. Never overwritten, never re-pointed by any lane.
- Challenger spec: `specs/mtnn-v6-contrastive-SPEC.md` in the vector-hoops
  repo (read the full file before drafting). Contrastive SupCon + Matryoshka
  nesting M = {8, 16, 32, 64}, equal weights, slice + re-normalize at
  inference, one versioned asset serving all widths.
- Serving today uses TWO assets: `assets/mtnn_embeddings.f32` (64-d) and
  `assets/vectors.json` (14 raw per-100 stats, z-scored within season — NOT
  a projection of the embedding). The Atlas xyz is PCA(3) of those 14 stats.
  Do not conflate the two spaces.
- 17 tower families (120 features): volume 10, playmaking 10, rebounding 8,
  defense 8, efficiency 8, shotmix 10, bio 5, tracking 12 (masked pre-2013),
  form 6 (masked pre-2015), market 4, roster 5, career 6, competition 6,
  team 8, pedigree 4, playoffs 5, honors 5. Tower input convention:
  `cat([x·m, m])`, mask m in {0,1} per family.
- Identity key: `person_id`. Name alone is WRONG: distinct players share
  names (Dee Brown b1968/b1984, Reggie Williams b1964/b1986, Mike James,
  Chris Johnson). All 12,966 rows in the current master vectors file carry
  a person_id.
- Season key: `YYYY-YY` string, e.g. `2025-26`; season-start-year = first
  four digits. Recent season sizes (verified): 2022-23 = 464, 2023-24 = 484,
  2024-25 = 500, 2025-26 = 491 rows. New players per recent season ≈ 67–98
  (≈ 83 typical) — the cold-start slice.
- Prior v6 attempt failed the protocol badly (top-1 0.0007 vs champion
  0.118, continuity 0.507 vs 0.176, reconstruction objective, player-aware
  split) and stayed research-only. Treat "beat v5" as a hard bar.
- Train gate is CLOSED. DRAFTS ONLY: no training runs, no GPU, no package
  installs, no writes to master, no `public/` changes, no production
  promotion, no merge. Training authorization is a separate user decision.

## 1. Ownership (one owner per lane, no collisions)

| Lane | Directory | Owns (files only this lane writes) |
|---|---|---|
| 1 Data collection | `lanes/01-data-collection/` | `SOURCES.md`, `FEATURE_MATRIX_OPTIONS.md` |
| 2 Cleaning + curation | `lanes/02-cleaning-curation/` | `CURATION_RULES.md`, `validate_inputs.py` (draft) |
| 3 Split + data prep | `lanes/03-split-dataprep/` | `FOLDS.md`, `build_pairs.py` (draft), `fold_manifest_schema.json` |
| 4 Training | `lanes/04-training/` | `train_mtnn_v7.py` (draft), `TRAINING_NOTES.md` |
| 5 Eval + interpretation | `lanes/05-eval-interpretation/` | `eval_mtnn_v7.py` (draft), `EVAL_PROTOCOL.md`, `SAE_NOTES.md` |
| 6 Integration | `lanes/06-integration/` | `INTEGRATION_MAP.md`, `RECALIBRATION_CHECKLIST.md`, `DRIFT_MONITOR.md` |

Rules:
- Specialists write ONLY inside their own lane directory. They NEVER write
  to any repo checkout (`~/workspace/vector-hoops*`), `~/workspace/evals/`,
  or `~/workspace/registry/`. Reading repo files is allowed and expected.
- The coordinator alone synthesizes lane outputs into the branch
  `scout/mlops-v2-draft` in `~/workspace/vector-hoops-mlops-v2`.
- Python drafts must at least parse (`python3 -m py_compile`). Do not claim
  a test passes that was not run; drafts are unexecuted by design.

## 2. Cross-lane interfaces (schemas every consumer relies on)

### 2a. Fold manifest (Lane 3 produces; Lanes 4, 5 consume)

Expanding-window folds, season-start-year keyed:
- Fold 1: train ≤ 2021, val 2022–23 (948 rows: 464 + 484).
- Fold 2: train ≤ 2023, val 2024–25 (984 rows: 500 + 484).
- Final test: 2025–26 (491 rows), FROZEN — never tuned on, never trained on
  in any fold, never used for early stopping or hyperparameter choice.
- Purge/embargo: adjacent-season positive pairs (N, N+1) MUST NOT cross a
  fold boundary. Lane 3's pair builder drops cross-boundary pairs and
  documents the counts dropped per fold. A one-season embargo gap between
  train and val/test is the default recommendation; if Lane 3 chooses no
  gap, it must justify why the purge alone suffices.
- New-player slice: rows whose person_id has NO earlier-season row in the
  training portion of that fold. Reported as a separate metric everywhere,
  never blended into the headline number.
- Manifest format (JSON): one object per fold with fields
  `fold`, `train_seasons` (list), `val_seasons` (list), `test_seasons`
  (list), `n_train_rows`, `n_val_rows`, `n_test_rows`,
  `n_pairs_adjacent`, `n_pairs_twin`, `n_pairs_dropped_cross_boundary`,
  `n_val_new_player_rows`. Row counts must be reconcilable to the 12,966
  total.

### 2b. Feature matrix interface (Lane 1 options → Lane 2 validation → Lane 4 input)

- The matrix is 12,966 rows × 120 features in the 17-family order of §0,
  plus a per-family mask. Any resolution option MUST state: source, row
  count, feature count, sha256 procedure, and what breaks if it is wrong.
- Lane 4's training script MUST fail loud (non-zero exit, explicit message
  naming Open Question #1) if the real 120-feature matrix file is absent.
  It MUST NEVER random-projection expand the 11-feature proxy
  (`assets/mtnn_inputs.f32`) to 120 dims. That prior workaround is a
  data-quality red flag and is banned in this draft.
- Lane 1's options, in spec order: (1) re-derive from source stats via the
  original feature pipeline (report whether that pipeline is found in repo,
  evals, or Nugatron — with evidence, never invented); (2) train on the
  11-feature proxy (state honestly what is lost); (3) train on v5's 64-d
  embeddings as inputs (pure distillation, abandons "better features →
  better metric"). Lane 1 recommends ONE option with reasons; it does not
  pick by itself — the user decides.

### 2c. Training script interface (Lane 4 produces; Lane 5 consumes)

- Entry: `train_mtnn_v7.py --fold-manifest <path> --features <path>
  --out <dir> --seed 7` (seed default 7, overridable for multi-seed runs).
- Loss: SupCon at every m in {8, 16, 32, 64}, equal weights, per-level
  L2-normalize after slicing; triplet (semi-hard) fallback only if SupCon
  collapses, flagged in the run report.
- Batch: 1024 anchors (+ positives), era-stratified (every batch mixes
  eras); hard negatives per spec Open Question #2 default (a) hardest
  in-batch, refreshed each epoch, fallback (c) none beyond in-batch.
- Tower dropout: mask whole families during training (rate tunable on val
  only); the script logs per-family dropout so Lane 5's ablations line up.
- Temperature grid {0.05, 0.1, 0.2} tuned on val ONLY. Epoch budget 200,
  early stopping patience 20 on val adjacent-season top-1.
- Run report (JSON, one per run): `config` (all hyperparameters),
  `seed`, `torch_version`, `feature_matrix_sha256`, `fold_manifest_sha256`,
  `alignment`, `uniformity`, `mean_pairwise_cosine` per epoch (collapse
  watch), `val_top1`, `val_recall_at_10`, `val_continuity` per prefix m.
- Output asset name: `data/mtnn_v6_contrastive_<tag>_12966rows.f32` +
  sha256. Challenger only; the champion filename is never an output path.

### 2d. Eval report interface (Lane 5 produces; Lane 6 consumes)

- Same code path for champion and challenger, exhaustive retrieval, self
  excluded, pessimistic ties. Every metric at every prefix m in
  {8, 16, 32, 64} (slice challenger, L2-normalize, same code path).
- Metrics per fold per prefix: top-1, recall@10, continuity (lower better;
  champion 0.176), nearest-neighbor cosine stats, twin-agreement hit-rate@10
  / mean overlap ± std / shared-pair Spearman vs champion on the frozen
  test rows, new-player-slice top-1, mask-ablation era-shift rate (see §3).
- Promotion gate: promoted ONLY if the 64-d level beats the champion on ALL
  primary metrics on BOTH val and frozen test. Otherwise research-only
  under its versioned filename. The 16-d level must retain ≥ 90% of the
  64-d top-1 to earn the serving-unification story; otherwise the separate
  14-d projection stays. A single-metric win is not a promotion.
  Promotion itself needs the user's separate word after the report.
- Downstream sanity: 20 held-out Daily Court twin-quality spot checks
  (eyeball test) — Lane 5 defines the checklist; Lane 6 owns the
  recalibration that follows.

### 2e. Integration surface map (Lane 6 produces; coordinator wires)

- One row per surface: Daily Court, Twenty Questions (Daily Guess), Twin
  Explainer, Career Trails, Atlas map, Insights, Live / Pixel Replay.
- Each row states: current embedding width + asset, proposed width + asset
  under a promoted v6 (64-d map surfaces, 16-d lightweight surfaces, 8-d
  thumbnails/tooltips), what changes in code, and what must be
  re-derived (twin bands, Daily Court thresholds, era twins, difficulty
  bands) before any production switch.
- Drift monitor: on each new season's arrival, compare the new rows'
  embedding distribution to the training distribution (mean pairwise
  cosine, per-tower output drift, new-player slice top-1) and alert
  thresholds. Monitor-only; it never retrains or promotes by itself.
- Rollback: champion asset pinned; any production switch is a separate
  user decision with a one-command revert to the champion asset + prior
  thresholds.

## 3. Lane briefs (scope, nothing more)

- Lane 1: raw stat sources, provenance, season coverage through 2025-26,
  rights/licensing fit for a rights-free product, Q1 resolution path with
  evidence. Never invent a source; an unconfirmed source is labeled
  UNCONFIRMED with what would confirm it.
- Lane 2: masking rules (tracking pre-2013, form pre-2015 — and the fact
  that the mask itself can leak era: the mask-as-signal test belongs to
  Lane 5, the rule documentation belongs here), qualifying thresholds,
  dedup, person_id identity, validation checks that fail loud. No training
  code, no splits.
- Lane 3: folds, purge/embargo, era-stratified batching, pair construction
  (adjacent seasons + v5 TRAIN-split twins only — the twin file also
  contains test rows; using those as training labels leaks), new-player
  slice. No model code.
- Lane 4: training script draft + notes only. No eval code beyond the
  val metrics its early stopping needs; no game/integration code.
- Lane 5: eval + interpretation only. Includes tower ablations (whole
  family masked at inference), the mask-ablation era test (artificially
  mask a modern player's tracking, measure twin era shift), and SAE
  features translated into plain-words basketball ideas (one feature =
  one idea, with the counterexamples where a feature does NOT mean what
  its label says). No training code, no game code.
- Lane 6: integration only. No model code; it consumes Lanes 4/5 outputs
  by reference (asset names, widths, metric gates) and defines what
  changes in each game/insight surface and what must be re-derived.

## 5. Prototype competition (user's word, 2026-10-26 voice call)

Two builders compete HEAD-TO-HEAD. The user compares both prototypes side
by side and picks the winner. The coordinator NEVER declares a winner,
never averages scores, never softens the comparison. The comparison page
(`~/workspace/mlops-v2-drafts/COMPARISON.html`, built by the coordinator
at presentation time) links both demos and carries the rubric table with
the verdict column left BLANK for the user.

| Builder | Directory | Prototype |
|---|---|---|
| A — Steerable Twin Explorer | `lanes/prototype-steerable/` | Player page: sliding one feature/direction moves the live twin list |
| B — Attribution Graph | `lanes/prototype-attribution/` | Curry 2016-17 → Ginobili 2009-10, tower-by-tower causal trace as an interactive graph |

Competition rules (binding on both builders):
- NO COLLABORATION, NO PEEKING: each builder works ONLY in its own
  directory and does not read the other prototype's directory. The
  coordinator is the only synthesis point, and synthesis happens only at
  presentation time.
- Same data: champion v5 embeddings, 12,966 rows. Same constraints:
  PROTOTYPES ONLY — no training runs, no GPU, no package installs, no
  prod writes, no merge. This competition does NOT authorize model
  training; prototypes use existing embeddings only.
- Same judging rubric (published in the comparison, verdict blank):
  (1) causal proof — does the interaction change twins predictably,
  (2) clarity — can a fan get it in 30 seconds,
  (3) honesty — limits stated plainly,
  (4) playability — is it fun to use.
- Each builder ends with its own scorecard (objective → target → result
  → evidence path) plus a runnable demo in its lane dir (static HTML +
  JS + baked JSON, no build step, no new packages).
- HONESTY BANS (verified 2026-10-26, coordinator-measured): the saved
  `mtnn.onnx` is 119→48, NOT the served 64-d v5; `mtnn_attr_pop.json` and
  `mtnn_jacobian.json` are stale 48-d pre-v5 exports explicitly marked
  `not_from_served_net`. NONE of the three may be presented as served-v5
  tower attributions. The 120-feature input matrix is uncommitted, so
  true served-model tower ablation is UNAVAILABLE in this pass — any
  tower-level claim must be labeled estimated-from-facets or marked as
  the gap, never as measured model internals.
- SPACE DISTINCTION (verified 2026-10-26, coordinator-measured): the
  Curry 2016-17 → Ginobili 2009-10 pair is a 14-d STAT-space Twin Reveal
  pair (post-fix). In the 64-d champion embedding space its cosine is
  0.4003 and its rank is 390th (person-excluded); the 64-d top twin is
  James Harden 2017-18 at 0.86. Both prototypes must state which space
  each number comes from and must never present the pair as a 64-d top
  twin. Builder B in particular must show BOTH spaces and explain the
  divergence.
- Builder A (v0): steering on the EXISTING champion v5 embeddings with
  directions derived from real data (skill-difference vectors from
  `skills.json`, archetype centroids from `mtnn_meta.json`, stat-group
  difference vectors from `vectors.json`) — every direction labeled
  with its derivation. SAE-based steering is a v1 DESIGN NOTE ONLY,
  never faked as working. Success test: move the slider, twins change
  predictably, and the change is explainable in plain words.
- Builder B: interactive graph, nodes = contributions, edges =
  influence, for the Curry → Ginobili pair, with causal checks that are
  actually computable in this pass: 64-d dimension-contribution
  decomposition (labeled dimensions, NOT towers), 14-d stat-space
  leave-one-group-out recomputation (the Twin Reveal path IS ablatable
  this way), skill/stat facet comparison, and embedding-space
  counterfactuals (moving along a skill direction moves the pair's
  rank — measured, not asserted). The unavailable true tower ablation
  is shown as an explicit gap, not papered over.

## 6. Data pipeline overhaul (user-authorized 2026-10-26, supersedes the Q1 framing)

CORRECTION (user right, spec's blocker framing was stale): the 120-feature
matrix is not on disk as `pipeline/data/train_matrix.npz`, BUT the pipeline
that builds it IS tracked — `pipeline/build_vectors.py` — and its full
source cache IS on this VM: `pipeline/cache/`, 105 MB, 445 top-level
entries (788 files including subdirectories), 30 seasons 1996-97 through
2025-26 (stats.nba.com Base/Advanced/Scoring dashboards, bio, tracking
2013-14+ for 13 seasons, salaries, honors, playoffs, matchup data,
Basketball-Reference per-game/advanced). It supports `--offline` rebuild
from cache only. Do NOT go hunting on Nugatron first — the data is here.
The remaining Q1 question is ONLY whether the offline rebuild completes
cleanly, since the build refuses to write when any season/source is
incomplete. Lane 1's original Nugatron-first framing is superseded; the
overhaul lane (below) owns the verification.

OVERHAUL SCOPE ("build it from scratch and build it right",
user-authorized): Lanes 1 and 2 are re-scoped into ONE overhaul owner
(`lanes/07-pipeline-overhaul/`) — the original Lane 1/2 deliverables
stand as prior work and are inputs, not to be rewritten. The overhaul
owner delivers:
(a) Full inventory of NBA data already on this VM: the cache above,
  `assets/vectors.json` (12,966 rows), `mtnn_embeddings.f32` (64-d),
  `mtnn_inputs.f32` (11-feature proxy = 12,966×11, NOT a training
  matrix), game/replay data — what exists, what is a proxy, what is
  stale. No shotchart cache exists today (only `cdn_pbp/` play-by-play
  files; pixel sprite positions are animation, not measurement — never
  training inputs).
(b) A rebuilt-from-scratch pipeline design: raw source → versioned raw
  cache → validation gates (fail loud, never silent imputation) →
  era-normalized feature build → TWO outputs kept in contract: the 14-d
  game vector AND the wide training matrix. One pipeline, no bootstrap
  proxies, no random-projection expansion, ever.
(c) SHOT-POSITION DATA as a new requirement: the current "shotmix"
  family (10 features from the Scoring dashboard) is shot TYPE mix only
  (2PT/3PT/FT shares, assisted/unassisted) — it contains NO floor
  location. The overhaul must source true shot-position data
  (stats.nba.com ShotChartDetail: zones, distances, x/y coordinates,
  or play-by-play shot locations), define its era availability and
  per-feature masks honestly (coordinate coverage by era is a research
  question, not an assumption), and propose it as a NEW tower family
  with its own availability mask, alongside the existing 17. Do not
  claim availability not verified from the source. Standing prior
  verdict to read first: `~/workspace/your_files/shots/shot-source-verdict.md`
  (2026-10-11: ShotChartDetail is the only LOC_X/LOC_Y source, but it
  stalls from the Hatch VM and CDN 403s — collection must run on
  Alienware/Mac).
(d) OFFLINE REBUILD VERIFICATION (user-directed): run the
  `build_vectors.py --offline` rebuild in a SCRATCH worktree
  (`~/workspace/vector-hoops-scratch-rebuild`), never in a PR branch,
  never overwriting live `vectors.json` (record its sha before and
  after; the run must leave every live file untouched). Report: does
  the rebuild complete cleanly, the produced matrix shape, the feature
  count, and whether its feature order matches `feature_manifest.json`
  / the 17 input families. If the build refuses on an incomplete
  season/source, report exactly which one — that, not Nugatron, is the
  remaining Q1 answer. Width note: the "120" count is disputed
  (champion export says 130, HEAD chain 143, base chain 73) — the
  verification reports the ACTUAL produced width; the re-pin decision
  goes to the user, it is not silently picked here.

All previous boundaries still hold: drafts and designs only in this
pass, no training runs, no prod writes, no merge. The overhaul does not
authorize training; it removes the data blocker so training CAN be
authorized later.

## 7. Division-of-labor architecture (user DECISION 2026-10-26, REPLACES the challenger framing for this pair)

There is NO challenger and NO promotion fight between the contrastive
model and JEPA. BOTH SHIP, for different jobs:

| Space | Model | Job | Powers | Invariance it needs |
|---|---|---|---|---|
| SIMILARITY | Contrastive SupCon + Matryoshka (v6 line) | Retrieval: who plays like whom, across eras | Twins, Atlas map, Twenty Questions, Daily Court, Twin Explainer | ERA-INVARIANT: Curry 2016 must sit near Ginobili 2009 |
| DYNAMICS | Hoops-JEPA world model | Prediction + planning: what happens next, given a game state and an action | Next-play prediction, ghost opponents, what-if lineup simulations, coach-mode play-calling, Pixel Replay / Live | ERA- AND TIME-SENSITIVE: must know what season it is in, what the score and lineup are, and what comes next |

RESEARCH REASON (recorded, not hand-waved): the two jobs need
CONFLICTING invariances. Forcing one vector to be both era-invariant
and time-sensitive creates objective interference. Separate models
resolve it cleanly. A shared encoder stem is allowed ONLY if evals
support it — the default is SEPARATE, not shared, and any sharing
proposal must name the eval that would justify it.

PIXEL-GAME WORLD-MODEL LOOP (binding): real data → world model predicts
next latent states → sprites render those states. Training inputs are
REAL play data only: game logs, play-by-play events, shot locations
when collected (see §6 shot-position work). NEVER sprite animation
positions: they are rendering output, not training input, and using
them as inputs would train the model on its own output.

PATTERN (design, not implementation): V-JEPA 2-AC at small scale —
game-state encoder + action-conditioned predictor (play call / lineup /
matchup as the action) → next state. H-JEPA-style top-down planning
(coarse quarter strategy → fine next play) is a DESIGN NOTE, not a
built component in this pass.

GATE SCOPING (read carefully — this amends §2d, it does not delete it):
the promotion gate still applies, unchanged, to ANY model that would
REPLACE the v5 twin space — that space keeps its own bar (beat the
champion on all primary retrieval metrics on val and frozen test, plus
the user's separate word). JEPA does not compete for that space and is
NOT judged by the twin gate; it gets its own eval (next-play
prediction quality, planning quality, ghost believability), sketched
by Lane 8. "Challenger" in this contract henceforth means ONLY
"candidate to replace the v5 twin space."

INTEGRATION CONSEQUENCE: Lane 6's surface map gains a second model
column. Lane 6's original deliverables stand; Lane 8
(`lanes/08-jepa-division/`) writes the division-of-labor design and the
integration addendum, and the coordinator merges the addendum into the
integration design at synthesis time. No lane edits another lane's files.

## 8. Phase 2 — Unified-loss design (user APPROVED 2026-10-26, DESIGN ONLY)

Phase 1 remains the separate baselines (contrastive twin space per Lane
4; JEPA world model per Lane 8) as ABLATION CONTROLS. Phase 2 designs
ONE joint model that trains both together under a global loss so they
learn from each other. Phase 2 does NOT replace §7's default-separate
rule for Phase 1; it is a gated second phase whose entry condition is
Phase 1 baselines existing and measured.

ARCHITECTURE (design, not implementation):
- Shared stem: the 17 tower encoders.
- Two heads: (a) Matryoshka SupCon head producing the twin space at
  {8, 16, 32, 64}; (b) JEPA predictor head predicting the next season
  / next play (the design doc must define BOTH timescales explicitly —
  season-timescale prediction for the future-twins metric and
  game-timescale next-play prediction — and state whether they are one
  head with timescale conditioning or two predictor modes; the slash
  in the brief is not a decision).
- THE BRIDGE (what makes it unified, not just multi-task): the JEPA
  predictor's target IS head (a)'s contrastive embedding of the TRUE
  next season (stop-grad). The world model plans INSIDE the twin space.
  Additionally, the JEPA prediction becomes an extra contrastive
  positive ("predictive positive") for head (a).

LOSS (design): L = w_S · L_SupCon-MRL + w_D · L_JEPA + w_B · L_bridge
+ anti-collapse regularizer (Gaussian / VICReg-style variance term,
UniJEPA-style). Weights via uncertainty weighting (learnable
log-variance scalars). PCGrad projection when the two heads' gradients
conflict (cosine < 0) — the gradient cosine is LOGGED every run as the
interference monitor. The design doc names the interference threshold
at which training stops or rebalances, as a proposed value pending
user confirmation, not as a measured fact.

HIERARCHY SYNTHESIS: Matryoshka prefixes ARE the H-JEPA levels —
coarse prefixes (16-d) carry invariant twin structure, full 64-d
carries equivariant dynamics. Weight similarity toward coarse prefixes,
dynamics toward fine prefixes. The design doc states the per-prefix
weighting scheme explicitly (proposed values, flagged as proposed).

EVALUATION (Pareto, not a single number): the joint model must NOT
regress either head versus its separate Phase 1 baseline beyond a
STATED tolerance (proposed by the design doc, confirmed by the user
before any training), AND must win on at least one JOINT-ONLY metric.
Headline joint metric: "future twins" — predict next season's
embedding, retrieve its twins, compare against the actual next
season's twins. Neither separate model can do this alone; that is the
point of the metric, and the design doc defines its exact computation
(embedding prediction target, twin-retrieval k, comparison statistic).

RESEARCH ANCHORS (cite honestly): UniJEPA (unified invariant +
equivariant prediction, single loss + regularizer, abstraction dial),
DreamerV3 / MuDreamer (encoder↔dynamics KL balancing), multi-task
conflict tools (uncertainty weighting, GradNorm, PCGrad, MGDA/Pareto).
Lane 8 flagged that UniJEPA / DreamerV3 / MuDreamer provenance claims
need citation-checking against the skill's references before use as
design authority — the Phase 2 doc MUST check each anchor against
`~/workspace/custom-skills/jepa-predictor-paper/` references (and
state what was checked) and label anything unverified UNVERIFIED
rather than asserting it. No paper result is quoted as a Hoops result.

BOUNDARIES: design only, no training runs, no prod writes, no merge.
Training authorization remains a separate user decision and covers
Phase 1 and Phase 2 alike — neither trains on this approval.

## 9. Synthesis amendments (coordinator, 2026-10-26 — verified facts vs proposals)

VERIFIED FACTS (measured by the coordinator or by a lane and re-checked):
- S1. Offline rebuild of the BASE chain completes cleanly (exit 0, all 30
  seasons from cache): produced matrix 12,966 × 73 (Z float32 + bool
  mask), sha256 `2422e56a…`, in the scratch worktree only. Live
  `assets/vectors.json` sha256 unchanged (`5e7141ff…40511`), live
  checkout git status clean. The 143-column full-context chain is NOT
  verified (gamelog-blocked).
- S2. Row master is the mlops-v2 checkout's `assets/vectors.json`:
  person_id on 12,966/12,966 rows there, vs 0/12,966 in the main
  checkout's copy. All lanes must use the mlops-v2 copy as row master.
- S3. The twin file `champion_twins_test.json` is test-only (split:
  test, 991 anchors, all 2024-25/2025-26 rows): it contributes ZERO
  train-split twin pairs. Any twin-distillation training claim is
  false until a train twin file is produced.
- S4. Curry 2016-17 → Ginobili 2009-10 is a 14-d stat-space pair
  (cosine 0.9623, rank 1); in 64-d space it is cosine 0.4003, rank
  390th; the 64-d top twin is Harden 2017-18 at 0.86.
- S5. Banned as served-v5 attributions: `mtnn.onnx` (119→48),
  `mtnn_attr_pop.json` and `mtnn_jacobian.json` (48-d pre-v5,
  `not_from_served_net`). True served-model tower ablation is
  unavailable in this pass.
- S6. The cache IS tracked (788 files); local branch `master`
  (4ae40acd) is 40 commits behind the live line — the live line is
  1e5bfecc. Shotmix as built is 13 columns, not 10.

PROPOSALS REQUIRING THE USER'S WORD (coordinator does not decide these
alone — they are recorded here so the next step can approve or amend):
- P1. Fold table: contract §2a's Fold 2 val "984" is corrected to 500
  (single season 2024-25); the EMBARGOED folds from Lane 3 are adopted
  as canonical (Fold 1: train 10,539 / embargo 2021-22 / val 948;
  Fold 2: train 11,491 / embargo 2023-24 / val 500; final: train
  11,975 / embargo 2024-25 / test 491). The purge-only variant remains
  available via Lane 3's `--no-embargo` flag. The embargo shifts Fold 1
  from the call-discussed table — that shift is exactly what needs
  the user's confirmation.
- P2. Width re-pin: 73 (verified base) vs 143 (HEAD contract,
  unverified, gamelog-blocked) vs 130 (champion export) vs 120
  (spec/contract, now known wrong). Overhaul lane recommends: pin 73
  now, promote to 143 only on evidence. Lane 1 recommended 143
  conditioned on closing the gamelog gap. The user picks.
- P3. Gate clarification (Lane 5 resolution): twin agreement is a
  GUARDRAIL / transfer diagnostic, not a gate metric (the distillation
  ceiling makes "beat v5 on twin agreement" unsatisfiable); the gate
  is the retrieval trio (top-1, recall@10, continuity spread) on val
  AND frozen test. Needs explicit confirmation because spec §5's
  "all primary metrics" is ambiguous here.
- P4. Must-fix items before ANY training run (not user decisions,
  implementer checklist): (a) Lane 4's loader pins 120 columns
  (`EXPECTED_N_FEATURES = 120`) — it must accept the pinned width
  from the feature manifest instead (do not hardcode 73 either);
  (b) Lane 4's `val_continuity` (mean 1−cosine proxy) must be renamed
  (e.g. `val_adjacent_gap`) because Lane 5 pins continuity to the
  `continuity_report` spread — the two must never share a name;
  (c) Lane 4's family-count table must be re-derived for the pinned
  width; (d) a train twin file must exist before any
  twin-distillation claim, and Lane 3's `--fail-on-zero-twins` flag
  must be on; (e) honors semantics must be decided (0.087 vs 0.969
  observed across builds).

PENDING SCOPE, NOT YET TASKED (arrived via the standing record during
synthesis — recorded here so it is not lost, NOT acted on):
- Data gathering directive (2026-10-26 22:29 CDT): GATHER ALL DATA —
  game logs are a MUST (later-season game logs carry actual shot
  coordinates, key for the shot-position tower) + play-by-play logs
  (text + stats) so the model trains on text as well as statistics.
  Machine-aware routing (Alienware/Mac, never synthesize); first
  deliverable would be inventory + per-season gap report. Awaits an
  explicit coordinator task; the overhaul lane's shot-position probes
  should gain game-log shot coordinates as a source when that task
  lands.
- Text-embedding proposal (2026-10-26 22:30 CDT): convert all text to
  embeddings, then truncated SVD to a manageable size; standing
  answer recorded elsewhere: SVD as baseline only — Stage 1
  EmbeddingGemma Matryoshka (measured: 128-d retains ~99% of 768-d
  twin agreement), Stage 2 task-aligned learned projection, text as
  one tower with on/off ablation, template dedup for PBP volume,
  season-boundary + name-masked leakage guards. Awaits explicit
  tasking before any lane adopts it.

## 10. User correction + new scopes (2026-10-26 22:29–22:32 CDT)

USER CORRECTION 22:32 CDT — TAKES PRECEDENCE over the twin-centric
framing used in §§2–9: "you're over-indexing on the twin nature of
this — we just want to be predicting players' overall stats in the
future." PRIMARY objective, from this point on, is NEXT-SEASON OVERALL
STAT PREDICTION: the 14-d game-vector forecast, scored by MAE/R²
under expanding-window CV + the new-player slice. Consequences,
recorded here and to be applied to designs (not silently rewritten
into already-delivered docs):
- Twins are demoted to product surface + secondary validation. They
  remain the games' surface (Daily Court, Twenty Questions, Twin
  Explainer) but are no longer the model's primary objective.
- The JEPA predictor head becomes PRIMARY; the contrastive twin head
  becomes AUXILIARY. The unified loss (§8) is rebalanced
  prediction-first; "future twins" is demoted to diagnostic. Lane 9's
  delivered design is therefore a PRE-CORRECTION draft: a
  prediction-first rebalance amendment is a follow-up design pass,
  not something this section pretends already happened.
- Any text tower (Scope B below) is judged by FORECAST LIFT vs the
  stats-only baseline — not by twin-agreement retention. Twin
  agreement and future twins are diagnostics for it, not gates.

SCOPE A — GATHER ALL DATA (user's words 22:29 CDT; DESIGN + COLLECTION
ONLY, no training, no prod writes, no merge):
- Game logs for all seasons, later-season game logs PRIORITIZED
  because they carry actual shot coordinates — the shot-position
  tower depends on them.
- Play-by-play logs for all seasons — statistical events AND event
  text (the model trains on text as well as statistics).
- Machine-aware collection: this Hatch VM is a known-bad collector
  for stats.nba.com ShotChartDetail (stalls, zero bytes) and
  cdn.nba.com (instant 403) per the 2026-10-11 shot-source verdict.
  Collection routes stats-API and CDN fetches through the Alienware
  box or the user's Mac, or through alternate real sources. NEVER
  synthesize or proxy-fill missing data.
- FIRST deliverable, before any bulk fetch: inventory + gap report
  quantifying per-season coverage for game logs, shot coordinates,
  and PBP against 30 seasons. Measured starting point
  (coordinator-verified 2026-10-26): `cdn_pbp/` holds 5 games
  (0022600001–3, 0022600085–6, all 2026-27 opening games, ~593
  actions each, WITH x/y coordinate fields and description text on
  actions); `assets/replays/` holds 6 entries (5 game JSONs +
  index); NO gamelog files exist on disk (only fetcher scripts
  `pipeline/fetch_gamelogs.py` using nba_api playergamelogs and
  `fetch_playoff_gamelogs.py`); LOC_X appears NOWHERE in the cache
  (0 hits) — coordinates in hand use PBP x/y naming, not
  ShotChartDetail LOC_X/LOC_Y.
- Outputs follow the overhaul lane: versioned cache + validation
  gates that fail loud. The 143-column full-context chain stays
  BLOCKED until this lands; the 73-column verified base is the
  fallback, not the destination.

SCOPE B — TEXT EMBEDDING DESIGN (user proposal 22:30 CDT + research
review; DESIGN ONLY, training authorization still separate):
- User proposal: convert all text to embeddings, then truncated SVD
  to a manageable size. Design doc treats SVD as the BASELINE TO
  BEAT, not the final answer. Doc location (per task):
  `lanes/01-data-collection/TEXT_EMBEDDING_DESIGN.md`, tower spec in
  `lanes/04-training/` (new files only; existing lane files are not
  edited).
- (a) Text units: official PBP event text ONLY, no generated
  commentary. Template deduplication FIRST: PBP text is highly
  templated — embed unique templates once, compose with player/event
  context — because raw per-event embedding volume across 30
  seasons is infeasible on CPU.
- (b) Stage 1 embedder: EmbeddingGemma-300M (already evaluated in
  this workspace: 768-d vs 128-d Matryoshka twin hit@10 0.0739 vs
  0.0732 — truncation loses almost nothing) as the first cut,
  mean-pooled per player-season.
- (c) Stage 2 task-aligned reduction: a learned projection /
  contrastive alignment of text rollups to the stat space, evaluated
  by FORECAST LIFT (per the 22:32 correction — the task's original
  twin-agreement/future-twins evaluation is SUPERSEDED for gating;
  twin agreement and future twins remain diagnostics only) — NOT by
  variance explained.
- (d) Text as ONE TOWER among the 17 stat towers, with an on/off
  ablation under expanding-window CV, promoted only on a held-out
  win — where "win" means forecast lift vs the stats-only baseline
  on the 14-d next-season prediction (MAE/R²), new-player slice
  reported separately.
- (e) Leakage guards: season-boundary masking (no future-season PBP
  text into JEPA inputs), and a name-masked ablation proving text
  adds playing style, not just player identity.
- The design goes past the standing MLOps review panel (Howard /
  Ilya / Karpathy lenses) BEFORE coordinator synthesis. Panel
  dissent is kept, not averaged away.

PENDING — FULL PROGRAM RETHINK (user 2026-10-26 22:33 CDT, brief
submitted, application UNCONFIRMED — not yet tasked): "we need to
rethink everything with that lens, right?" Per-lane rethink as
briefed: O1 audit → forecast audit (vs carry-forward / age-curve /
stats-MLP baselines); O3 splits → program backbone; O4 training
primary head = next-season 14-d forecast; O5 eval headline = per-stat
MAE/R²; O6 context columns judged by forecast lift; competition
reframed (A = steerable future explorer, B = forecast attribution,
user still picks); promotion gate replaced (beat carry-forward +
stats baselines on held-out folds; twin quality = floor constraint).
Proposed defaults flagged for the user's confirmation (NOT adopted):
1-season horizon primary; all-14 stats equal weight with scoring
highlighted. Twin work preserved as product surface + secondary
validation, NOT deleted. This rethink is RECORDED here only: it does
not rewrite the delivered lanes, the comparison page, or the gate
until an explicit rethink task arrives.

## 11. GOVERNANCE HOLD (user ruling 2026-10-26 22:33 CDT — SUPERSEDES the rewrite instructions in the 22:32 correction task and the 22:33 full-rethink brief)

Sequence, for the record: (1) a 22:32 correction task directed the
coordinator to reframe the objective prediction-first and to update
§8, the text-embedding design doc, and the eval protocol, leaving no
twin-centric headlines standing; (2) a 22:33 full-rethink brief
directed a lane-by-lane rewrite (forecast audit, forecast training
head, per-stat MAE/R² eval headline, forecast-lift context columns,
reframed prototypes, replaced promotion gate) plus a rewritten board
and contract headlines; (3) a 22:33 GOVERNANCE ruling from the user
overrides both: the prediction-first rethink is NOT the
orchestrator's call. It goes to a 12-seat review panel first
(standing 4: Howard / Ilya / Karpathy / Straubel as channelled lenses
+ 8 role-based seats; brief at `PANEL_BRIEF.md`).

THEREFORE, UNTIL THE PANEL SYNTHESIS LANDS AND THE USER RULES ON IT:
- Do NOT rewrite the board, contract headlines (§§2, 5, 8), eval
  protocol, or prototype briefs to the prediction-first framing.
  The 22:32 correction task and the 22:33 rethink brief are INPUT TO
  THE PANEL, not instructions to rewrite yet. §10 above stands as a
  RECORD of the correction and the pending rethink — it is not a
  headline rewrite, and §§2/5/8 headlines are left exactly as
  delivered.
- The panel brief's §4 is PROPOSED, not decided. Drafts must stay
  consistent with its stated facts (verified vs proposed kept
  distinct); panel reviews are modelled perspectives, not messages
  from the real people named.
- What CONTINUES UNCHANGED: lane drafting, data-gathering inventory
  + gap report (game logs + PBP), the offline-rebuild verification
  line, and the two new-scope specialists (Scope A inventory/plan;
  Scope B text design, whose forecast-lift gating is labeled in its
  doc as "user-directed, pending panel ratification" with
  twin-agreement/future-twins diagnostics kept fully specified, so
  the doc survives either ruling).
- The standing MLOps panel review (Howard / Ilya / Karpathy) of the
  Scope B text design still runs before coordinator synthesis of
  that design. It is a design review, not a reframe rewrite, and is
  distinct from the 12-seat rethink panel.

## 12. USER VISION NOTE (2026-10-26 22:35 CDT — FOR THE RECORD AND FOR LANE 8 DRAFTING, NOT A REWRITE ORDER)

The user names HIERARCHICAL JEPA world models as "the main thing,"
predicting future stats AND player locations, with the ambition to do
as much as possible with advanced models on Vector Hoops and "bring
the NBA to life with neural networks." Recorded here so Lane 8
drafting carries it; the HOLD (§11) still stands in full — this note
does NOT rewrite the board, contract headlines, eval protocol, or
prototype briefs, and any reframe rewrite still awaits panel
synthesis + user ruling. This note has also been sent to the panel
as a brief addendum; THE PANEL JUDGES H-JEPA CENTRALITY. Until the
panel rules, H-JEPA centrality is a USER VISION UNDER REVIEW, not
ratified architecture — drafts must label it that way, never as
decided.

LANE 8 DRAFTING DIRECTION (addendum, not a rewrite of Lane 8's
delivered files): the H-JEPA design carries TWO prediction surfaces —
COARSE → future season stats (season-timescale prediction, the
forecast objective), and FINE → in-game player locations from REAL
tracking / shot / PBP data (game-timescale prediction, the
bring-it-to-life surface). RENDER DIRECTION, stated explicitly in
the addendum: predicted locations render THROUGH Pixel sprites;
sprite positions NEVER train the model (rendering output, not
measurement — the same hard line as §7). Training inputs for the
fine surface are real measured positions only (tracking aggregates,
shot coordinates when collected, PBP x/y); where such data does not
yet exist on this VM, the addendum marks the surface DATA-GATED,
never faked.

## 13. MOONSHOT BUILD TRACK (user 2026-10-26 22:40 CDT — "let's build it")

"Build it" authorizes EVERYTHING UP TO the hard gates, NOT through
them. The moonshot = the joint contrastive + JEPA model trained
together under one loss, in the H-JEPA living-basketball-mind vision
(future stats + player locations + stories past and present).
Build track, full pace, IN PARALLEL with the panel's moonshot
verdict. Sequence: brief → panel weighs in → specs → execute end
to end — with the panel's verdict feeding spec FINALIZATION.

WHAT "BUILD IT" AUTHORIZES (pre-gate work, all in flight):
- Specs DRAFTED (skeletons + full drafts — NOT finalized; spec
  finalization waits for the panel synthesis).
- Model code drafted (joint architecture: shared tower stem,
  Matryoshka SupCon head, JEPA predictor heads, bridge, loss,
  Muon-vs-AdamW ablation DESIGN).
- Data-gathering inventory (Scope A — DELIVERED; the critical path
  for the location level).
- Eval harness drafted (expanding-window folds, carry-forward
  baselines, rung-1 next-shot demo spec).
- Prototype reframing drafted as NEW prototypes (future explorer +
  forecast attribution) in NEW directories. The existing twin
  competition (Builder A/B + comparison page) is UNTOUCHED — the
  user still picks its winner separately; the reframed pair is a
  separate comparison with its verdict likewise blank, and the
  coordinator crowns no one in either.
- Muon optimizer UNDER EVALUATION (user confirmed: Muon, MomentUm
  Orthogonalized by Newton-Schulz). The deliverable is a
  Muon-vs-AdamW ABLATION DESIGN, not an adoption decision. No claim
  that Muon is better may appear in any draft.

HARD GATES, UNCHANGED, STATED IN EVERY SYNTHESIS: NO training runs,
NO merges, NO production writes — each still requires the user's
separate word. "Execute end to end" does NOT authorize training.
Model code is verified by parsing (and, where stated in a lane
brief, by synthetic-tensor shape checks with NO parameter updates
and NO real data loaded) — never by a training run on real data.

## 4. Delivery format (every lane's final message ends with this)

One verdict line per acceptance criterion, in this exact form:

`VERDICT: PASS|FAIL|BLOCKED — <criterion> — <evidence path>`

Plus: file list written, top blockers in order, and any contract conflict
found. Scorecard missing = deliverable missing.

## 14. BIO-INSPIRED DESIGN LENS (user 2026-10-26 22:49 CDT — DESIGN INPUT ONLY, NOT A REWRITE ORDER, NOT A NEW MODEL)

Status: this section records a design lens for examining lane designs
through biological processes and frameworks. It does NOT rewrite any
delivered lane doc, contract headline, eval protocol, or prototype brief
(HOLD §11 intact), and it does NOT authorize a new model, a training run,
a merge, or a production write. A deep-research run on bio-inspired
adaptive frameworks is underway; its findings feed into lane designs when
they land. Until then, only the candidate table below stands — as
candidates to evaluate, never as adoptions.

Binding rule (user's words, enforced by the coordinator): each mechanism
must EARN its place by ablation, not by metaphor. Any bio-inspired
mechanism that cannot state a falsifiable test DOES NOT enter a spec.
Metaphorical resemblance is never evidence. Every test below runs on the
embargoed expanding-window folds, against the stated control, on held-out
data — the same gate discipline as every other lane.

Candidate mappings (evaluate, do not adopt on faith):

1. Predictive coding / free-energy → JEPA predictor + surprise-driven
   learning. Falsifiable test sketch: surprise-weighted training (high
   prediction-error seasons/events up-weighted) beats uniform weighting on
   held-out forecast MAE/R², or it does not. Touches: Lane 8 / Lane 11.
2. Sleep + hippocampal replay → offline consolidation phases: replay past
   seasons and play-by-play during idle cycles to consolidate the world
   model without new data. Test sketch: a replay phase improves held-out
   forecast vs a no-replay control at equal compute, or it does not;
   replay uses train-fold data only — replaying val/test data is leakage
   and fails loud. Touches: Lane 8 / Lane 11.
3. Synaptic pruning → tower/feature pruning: drop towers that do not earn
   forecast lift. Test sketch: per-tower forecast-lift ablation; a tower
   is pruned only if its lift is ≤ 0 within the bootstrap interval, and
   the pruned model must not regress held-out MAE beyond the stated
   tolerance. Touches: Lane 4 / Lane 5 / Lane 11.
4. Immune self/non-self → drift and anomaly detection (in-distribution
   vs regime shift), with detectors amplified when they catch real drift.
   Test sketch: the detector flags held-out regime-shift seasons at a
   stated precision/recall; the amplification rule fires only on
   confirmed drift, never on noise. Touches: Lane 6 drift monitor.
5. Homeostasis / allostasis → recalibration that adjusts predictively
   BEFORE drift breaches a gate. Test sketch: predictive recalibration
   reduces band-breach rate vs reactive recalibration on rolling
   seasons, without masking real drift (masked drift = failure, not a
   win). Touches: Lane 6 recalibration checklist.
6. Evolution (variation-selection-inheritance) → the hill-climb variant
   loop under held-out gates. Test sketch: a variant survives only on a
   held-out win under the existing gate; the loop's selection rule is
   stated in advance; no variant is promoted on validation folds alone.
   Touches: Lane 4 / Lane 5 / program governance.
7. Critical periods → curriculum: coarse/invariant structure first, fine
   detail only after the timescale diagnostic passes. Test sketch: a
   curriculum-trained model beats a simultaneous-training control on
   held-out folds, or it does not; the fine-detail stage is gated on the
   III-C timescale diagnostic, never on a schedule. Touches: Lane 11 /
   SPEC-2 / SPEC-3.
8. Swarm / stigmergy → the existing tiered agent lanes coordinated
   through shared timeline signals. Note: this one is about the AGENT
   SYSTEM, not the model — it does not enter any model spec. Test sketch
   (process metric only): timeline-signal coordination reduces duplicate
   work and cross-lane conflicts vs uncoordinated execution. Touches:
   coordinator governance only.

Gates unchanged: real data only; no training, merges, or production
writes without the user's separate word; research moves priors, gates
decide; preprint status (where applicable) is flagged, never upgraded.

### 14.1 Bio research LANDED (2026-10-27 — design input, rankings recorded, nothing adopted)

Source (read in full, evidence flagged): research_notes/
bio-inspired-adaptive-systems-20261027-0349/report.md. Per its own
reading note and its AGENTS.md: sources are INDEX-level (not
live-verified), no mechanism was tested on basketball data, and all
"helps this system" claims are hypotheses until the tests below run.
Thresholds in the report are PROPOSED DEFAULTS to calibrate, not
constants (PSI cutoffs are conventional practice, not law; pruning and
replay percentages are proposed, not mission-given). Quantitative
transfer numbers quoted from secondary summaries were not re-verified
against primary papers. Treat every ranking below as a prior for the
tests, never as a result.

Ranked most actionable (report §9), each with its falsifiable test —
a mechanism enters a spec ONLY by passing its test, and only by beating
BOTH the no-change baseline AND the cheapest non-biological equivalent
on the held-out next-season gate:
1. Offline interleaved replay / consolidation (§2): between seasons,
   low-LR pass on 50% new + 50% reservoir old (stratified by era /
   position / age; buffer holds embeddings + targets, not raw tracking),
   prioritised by JEPA error / forgetting. Test: sequential-season
   protocol vs naive fine-tune (Arm 1) and uniform-mix control (Arm 3).
   Pass: backward-transfer loss down ≥50% vs Arm 1, newest season
   matched or beaten, Arm 3 beaten on backward transfer; consolidation
   cost ≤20% of season-update compute or it fails as CPU-first.
2. Precision-weighted predictive error (§1, §5): inverse-variance JEPA
   weights estimated from training seasons only, plus per-tower error
   as the evaluation gate (which tower broke: player ageing vs league
   style vs tracking change). Test: temporal split, ≥3 rolling origins.
   Pass: ≥2% relative next-season stat RMSE improvement AND
   event-location error worsened by ≤1%, on the held-out TEST season —
   validation-only improvement fails.
3. Structured pruning + importance protection (§3, EWC from §2): prune
   WHOLE tower dimensions / heads / embedding columns (never unstructured
   sparsity — it does not speed CPU inference without sparse kernels),
   then short replay fine-tune. Test: 30% reduction → ≤1% degradation
   AND ≥25% latency/size cut; 50% → ≤3% or rejected; per-era
   degradation reported (average win + minority-era destruction = fail).
Close 4th — two-threshold homeostatic gate (§5): WARNING (PSI 0.10–0.25
or ADWIN warning) → consolidate + widen intervals, no block; ALARM
(PSI >0.25 or DDM drift) → block promotion, retrain, log cause; setpoints
context-adjusted per era/role; intervention budget capped (e.g. at most
one pre-emptive reweighting per season). Test (retrospective, 30 seasons,
no future labels before deciding): gate failures down ≥30% AND false
blocks up ≤10% AND within budget — fewer failures by blocking more is
conservatism, not prediction, and fails.

Most misleading if literal (do NOT implement literally; salvageable
fragments only, each with its own test): (1) swarm / stigmergy —
salvage EWMA zone-error sampling ONLY (must beat uniform AND static
inverse-frequency sampling by >1% relative on held-out event-location
error without degrading decayed zones; no player-agent pheromone
simulation); (2) morphogenesis / NCA — salvage positional encoding ONLY
(multi-scale court coordinates, distance/angle bands, zone embeddings;
B must beat raw-(x,y) by >2%, and any neighbour-diffusion layer C must
beat B by >1% to justify itself; no developmental architecture growth,
no Turing periodicity prior on a rule-defined court). Runner-up:
literal immune negative selection — fixed "self" in a league whose
normal changes every era flags modern basketball as foreign, and random
detectors scale poorly in embedding space. CORRECTION to the earlier
chat take (recorded here so it is not repeated): immune and homeostasis
are NOT just naming — the report defends multi-detector + co-stimulation
OOD detection (flag only if two independent signals agree; ≥90% of
injected corruptions flagged before the gate at lower false-alarm than
a single-threshold PSI monitor and a k-NN baseline, ≥20 episodes) and
the two-threshold gate above as testable mechanisms. What stays poetry:
"the brain minimises free energy, therefore…", literal NSA, literal
swarm, literal morphogenesis, Hebbian-as-backprop-replacement, and any
proposal that cannot be written as a loss, a weight, or a gate.
Evolution is confined to its gradient-free niche (CMA-ES / genetic
search over ≤~30 hyperparameters and discrete choices, population
16–32, generations 10–20, fitness = temporal gate score): it must beat
random search at equal budget by >1 standard error across ≥3 seeds and
re-validate on a later season; weights are NEVER evolved (backprop owns
the differentiable objective); >5× a single run for <1% gain fails as
CPU-first. Do NOT replace backprop with a predictive-coding network on
CPU (iterative inference per sample multiplies cost for at best
backprop-equivalent gradients; energy-efficiency claim UNVERIFIED).
Do NOT import active inference (act to match prediction) — this system
observes, it does not act on the court; preferred outcomes must never
bias forecasts.

Panel Round 3 (Addendum IV, spawned 2026-10-26 22:50 CDT) judges these
mappings as mechanism vs language vs poetry, with a falsifiable test
per endorsement and a bake / keep-as-naming / reject verdict per
mapping. This section records the research; it does NOT pre-judge Round
3, and no mechanism is baked into any spec by this section. The
findings were fed to Round 3 separately; this coordinator's routing is
to the lane designs only (BIO_LENS appendix + eval patch brief E5).

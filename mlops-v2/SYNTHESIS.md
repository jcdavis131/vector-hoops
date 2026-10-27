# MLOps v2 — Coordinator Synthesis (2026-10-26)

**What this is:** the synthesized result of 6 specialist lanes, 1 pipeline
overhaul, 1 JEPA division-of-labor lane, 1 unified-loss design lane, and 2
competing prototype builders. Drafts and designs only — no training runs, no
GPU, no package installs, no production writes. Training authorization
remains a separate user decision and is still CLOSED.

**Branch:** `scout/mlops-v2-draft` in `~/workspace/vector-hoops-mlops-v2`
(at 1e5bfecc, current master incl. PRs #193 and #194). This synthesis is
committed there under `mlops-v2/` (docs, scripts, prototypes, comparison
page). The working area is `~/workspace/mlops-v2-drafts/` (contract, lane
dirs, comparison page, this file, Harada board).

**Champion pinned throughout:** MTNN v5,
`mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256`, 12,966×64 L2, built
2026-07-25. Never overwritten by anything here.

## 1. Scorecard (lane → target → result → evidence)

| Lane | Target | Result | Evidence |
|---|---|---|---|
| 1 Data collection | Sources, provenance, Q1 path | PASS, with 2 premise corrections (pipeline exists in-repo; "120" wrong: 130 export / 143 HEAD / 73 base) | `lanes/01-data-collection/SOURCES.md`, `FEATURE_MATRIX_OPTIONS.md` |
| 2 Cleaning + curation | Masking, thresholds, identity, fail-loud validation | PASS — schedule-aware gate verified vs `pipeline/eligibility.py`; validator parses | `lanes/02-cleaning-curation/CURATION_RULES.md`, `validate_inputs.py` |
| 3 Split + data prep | Expanding-window folds, purge/embargo, pairs, new-player slice | PASS, with 2 corrections (Fold 2 val 984→500; twin file is test-only, 0 train pairs) — coordinator re-ran the script, all counts reproduce, partitions sum to 12,966 | `lanes/03-split-dataprep/FOLDS.md`, `build_pairs.py`, `fold_manifest_schema.json` |
| 4 Training | v2 script: SupCon+MRL, tower dropout, multi-seed, collapse logging, Q1 fail-loud | PASS — parses; Q1 fail-loud verified; 2 must-fix items (120-column pin; `val_continuity` name clash) — see §3 | `lanes/04-training/train_mtnn_v7.py`, `TRAINING_NOTES.md` |
| 5 Eval + interpretation | Degradation curve, twin agreement, mask-ablation era test, tower ablations, SAE, promotion gate | PASS — parses; consumes Lane 3 manifest fields; pins continuity to `continuity_report` spread; twin agreement as guardrail (proposal P3) | `lanes/05-eval-interpretation/eval_mtnn_v7.py`, `EVAL_PROTOCOL.md`, `SAE_NOTES.md` |
| 6 Integration | Surface map, recalibration checklist, drift monitor, rollback | PASS — grounded corrections: Twin Reveal runs on 14-d stats (16-d move is a behaviour change); Replay reads no embedding (NO CHANGE); no numeric difficulty bands exist (must be defined, not ported) | `lanes/06-integration/INTEGRATION_MAP.md`, `RECALIBRATION_CHECKLIST.md`, `DRIFT_MONITOR.md` |
| 7 Pipeline overhaul | Inventory, from-scratch design, shot-position plan, offline rebuild verification | PASS — rebuild completes cleanly, 12,966×73, sha `2422e56a…`, live files untouched (see §2) | `lanes/07-pipeline-overhaul/INVENTORY.md`, `PIPELINE_DESIGN.md`, `SHOT_POSITION.md`, `OFFLINE_REBUILD_REPORT.md` |
| 8 JEPA division of labor | Division doc, JEPA design, integration addendum | PASS — similarity vs dynamics, pixel-game loop binding, D3 conflict flagged (see §3) | `lanes/08-jepa-division/DIVISION_OF_LABOR.md`, `JEPA_DESIGN.md`, `INTEGRATION_ADDENDUM.md` |
| 9 Unified loss (Phase 2) | Joint design, Pareto eval, citation-checked research notes | PASS — two-mode predictor decision; tolerances + prefix weights all PROPOSED; UniJEPA/DreamerV3/MuDreamer claims UNVERIFIED (skill refs contain only the JEPA paper) | `lanes/09-unified-loss/UNIFIED_LOSS_DESIGN.md`, `PARETO_EVAL.md`, `RESEARCH_NOTES.md` |
| Builder A — Steerable Twin Explorer | Slider → live twin list on v5, honest directions | PASS — 4 starts × 10 directions × 11 steps = 440 lists, all verified; success test: Curry+Shooting +0.6 lifts mean Shooting grade 78.6→93.3 | `lanes/prototype-steerable/index.html`, `data.js`, `precompute.py`, `NOTES.md` |
| Builder B — Attribution Graph | Curry→Ginobili causal graph, both spaces | PASS — all 5 checks computed; headline "a stat twin, not an embedding twin"; tower ablation as explicit gap node | `lanes/prototype-attribution/index.html`, `data.json`, `precompute.py`, `NOTES.md` |

## 2. Verified facts the synthesis stands on (coordinator-measured)

- Offline base rebuild: 12,966×73, exit 0, all 30 seasons from cache;
  artifact sha `2422e56a…` (scratch tree only). 143-column chain NOT
  verified (gamelog-blocked). Live vectors sha unchanged
  (`5e7141ff…40511`), live checkout git status clean.
- Row master: mlops-v2 checkout vectors (person_id 12,966/12,966) vs
  main checkout copy (0/12,966). All lanes use the mlops-v2 copy.
- Twin file is test-only: 0 train-split twin pairs. No
  twin-distillation training claim is possible until a train twin file
  exists.
- Curry→Ginobili: 14-d cos 0.9623 rank 1; 64-d cos 0.4003 rank 390;
  64-d top twin Harden 2017-18 at 0.86.
- Banned as served-v5 attributions: `mtnn.onnx` (119→48),
  `mtnn_attr_pop.json`, `mtnn_jacobian.json` (48-d pre-v5,
  `not_from_served_net`).
- Cache IS tracked (788 files); local `master` (4ae40acd) is 40 commits
  behind the live line (1e5bfecc). Shotmix as built is 13 columns.
- Both prototypes' headline numbers reproduce from their baked data;
  both demos have zero external fetches; neither builder read the
  other's directory (separate lane dirs, coordinator as only synthesis
  point).

## 3. Conflicts resolved on the record (nothing silently reinterpreted)

- **Fold 2 val 984 → 500** (Lane 3, verified arithmetic). Embargoed
  folds adopted as canonical; purge-only via `--no-embargo`. The
  embargo shifts Fold 1 from the call-discussed table — needs the
  user's confirmation (proposal P1).
- **Width: 120 is wrong.** Candidates: 73 verified base, 143 HEAD
  unverified, 130 champion export. Overhaul recommends pin 73 now,
  promote to 143 only on evidence; Lane 1 recommended 143 conditioned
  on the gamelog gap. User picks (proposal P2).
- **Gate: twin agreement as guardrail, not gate** (Lane 5 resolution of
  the distillation ceiling). Needs explicit confirmation (proposal P3).
- **Lane 4 vs Lane 5 continuity:** Lane 4's `val_continuity` (mean
  1−cosine proxy) must be renamed before any training use; Lane 5's
  `continuity_report` spread is the gate metric.
- **Lane 4 loader pins 120 columns:** must accept the pinned width
  from the feature manifest before any training run (do not hardcode
  73 either). Lane 4's family-count table must be re-derived.
- **Lane 6 vs spec §3b:** `vectors.json` is raw stats, not a "14-d
  serving projection" — the 16-d prefix replaces similarity uses only;
  stat displays stay on real stats. Spec wording to be corrected, not
  the repo.
- **DOWNSTREAM.md §D3 vs contract §7:** D3's dual-use gate (world model
  must beat v5 on twin retrieval AND forecasting) is superseded for
  this pair by the user's division-of-labor decision; D3's
  snapshot/held-out-win discipline is unaffected.
- **Lane 8 vs unified refinement:** the user's unified-loss refinement
  (shared stem, bridge, future twins) is recorded as Phase 2 with the
  kept rule (separate baselines first, joint must not regress either
  head and must win a joint metric). It does NOT override §7's
  default-separate Phase 1. Its season-timescale predictor target vs
  Lane 8's game-timescale predictor is resolved by Lane 9 as TWO
  predictor modes (S: season, bridge mode; G: game, action-conditioned).
  UniJEPA/DreamerV3/MuDreamer provenance claims are UNVERIFIED
  (skill references contain only the JEPA predictor paper) and are
  used only as fully-specified design choices, never as paper
  authority.
- **Lane 5's stale blockers:** "Lane 3 manifest not delivered" and "no
  person_id rows file" are resolved by arrival — Lane 3's manifest
  exists and Lane 5 consumes its fields; the mlops-v2 vectors file
  carries person_id on every row.
- **Lane 6's blocked item:** checklist §6 (spot-check set) is unblocked
  by Lane 5's 20-pair checklist (≥17/20 pass, self-twin/same-name
  hard-fails).

## 4. Top 3 blockers (in order)

1. **Width + full-context verification (Q1, restated):** pin 73 vs
   143-track; the 143 chain needs the gamelog re-fetch
   (`pipeline/data/gamelogs_*.jsonl` absent all seasons; base build
   silently emits zero form features without it) plus the side-builder
   run in scratch; honors semantics undecided (0.087 vs 0.969).
   Nothing trains on the wide matrix until the pin + honors decisions
   land.
2. **No train-split twin file:** the challenger trains on
   adjacent-season positives only until one is produced; any
   twin-distillation claim before that is false. Lane 3's
   `--fail-on-zero-twins` must be on for any training run.
3. **JEPA data gates (Lane 8 §6):** only 5 opening 2026-27 PBP games on
   this VM; no historical shot-location cache; no game-log cache.
   A frozen game-state dataset must follow collection before any
   JEPA training. (Mode-S-only Phase 2 work is not blocked by the
   game-timescale gates.)

Overarching gate (not a blocker, a decision): **training authorization
is still CLOSED** — Phase 1 and Phase 2 alike train only on the user's
separate word.

## 5. Prototype competition — NO WINNER DECLARED

See `COMPARISON.html`: both demos linked, same 4-criterion rubric
(causal proof, clarity, honesty, playability), verdict column left
blank. Builder A and Builder B each self-scored PASS on all four;
the coordinator verified their evidence but does not judge between
them. **The user picks the winner.**

## 6. What the next step needs from the user (decisions, in order)

1. Embargo vs purge-only folds (P1).
2. Width pin: 73 now vs 143-track (P2), plus honors semantics.
3. Gate clarification: twin agreement as guardrail (P3).
4. Prototype winner (comparison page).
5. Train twin file: authorize its production (compute from v5 on
   train-split rows) or accept adjacent-only training.
6. JEPA data collection lane (Alienware/Mac): authorize or defer.
7. Training authorization (separate, still closed) — only after 1–3.
8. Pending scope awaiting explicit tasking (recorded in contract §9):
   GATHER ALL DATA directive (game logs with shot coordinates +
   PBP text+stats) and the text-embedding/SVD proposal (SVD as
   baseline only; EmbeddingGemma Matryoshka Stage 1; text as one
   tower with on/off ablation).

## 7. Wave-2 synthesis (2026-10-27 ~03:47 CDT; coordinator-verified, not naive-merged)

Scope landed since wave 1 (commit aaf003be): Scope A data gathering
(lanes/10-data-gathering/), Scope B text design (TEXT_EMBEDDING_DESIGN.md,
TEXT_TOWER_SPEC.md), Lane 8 stories addendum (STORIES_ADDENDUM.md, DESIGN
INPUT ONLY, HOLD intact), standing-panel text review
(panel-reviews/TEXT_PANEL_REVIEW.md), moonshot eval harness
(lanes/12-moonshot-eval/), reframed prototype pair
(lanes/prototype-future-explorer/, lanes/prototype-forecast-attribution/),
contract §10–§13, panel brief §9, panel review through Addendum III-C.
Coordinator verified on disk: all wave-2 Python drafts parse (py_compile);
both reframed demos' baked data spot-checked (explorer data.json structure
+ age-curve-baseline labeling on the page; attribution data.json contains
Curry 2016-17 and the quoted 1.843 baseline value, all 4 players present);
eval harness new-player slice present (20 mentions); stories header carries
the DESIGN-INPUT-ONLY + HOLD labels. Isolated failed tool calls inside two
agent handoffs did not affect deliverables.

Text review verdicts (modelled lenses, not the real people):
NEEDS-REVISION (Howard), NEEDS-REVISION (Ilya), BLOCKED (Karpathy).
Synthesis-ready only after M1–M7 (panel-reviews/TEXT_PANEL_REVIEW.md
§"Must change before synthesis") are recorded here as CONDITIONS, not
silent edits to the design docs: M1 Scope A inventory as hard precondition;
M2 masked-ablation treatment defined field-by-field + new-player masked
condition (> 0 with interval excluding 0; 50% ratio bar only when unmasked
lift clears 2% with interval excluding 0); M3 bootstrap intervals +
per-stat/per-fold pass/fail tables + seed-spread rule + multiplicity note;
M4 rollup composition clarified (assist-role events, floor counting,
n_events input-vs-audit, mask AFTER LayerNorm); M5 slice mapping + join-rate
section; M6 tightened pilot gate (weights availability, measured
templates/sec + peak memory, stated half-day consequence, 100-template
audit); M7 first claim simplified (width 32 only, floor 100 only, one head,
768-d only). Design docs stay exactly as delivered.

Reframed prototypes (user picks the winner; coordinator crowns no one):
Future Explorer — steer a latent, predicted future line moves; v5
next-profile head NOT runnable (mtnn_heads.f32 = 12,966×45 frozen OUTPUTS,
no weights/checkpoint saved; saved ONNX is stale 119→48), so the steered
line is the LABELLED age-curve baseline; new-team steering omitted (team
not in the 14-d vector); success test: Curry 2016-17 "More threes" +1.0z
FG3A 2.55 → 3.55, FG_PCT 0.18 → −0.09 (real history slope −0.268, shown not
smoothed). Forecast Attribution — K=25 neighbor baseline, LOSO
(remove/half/boost over 6 signals); v5 head likewise NOT runnable, baselines
labelled; success test: Curry remove scoring → predicted PTS 1.843 → 1.413
(−0.429); Jokic remove playmaking → AST −1.423. Honest caveat on both pages
and in both NOTES: the neighbor/age-curve baselines do NOT beat
carry-forward (attribution global MAE 0.4805 vs 0.4732; explorer three-way
tie carry-forward 0.4732 / age-curve 0.4705 / v5 saved head 0.4708) — the
prototypes prove interaction mechanics, not forecast skill. Both builders
confirm: sibling lane never opened, original twin competition untouched.

Eval harness (lanes/12-moonshot-eval/): eval_forecast.py (656 lines, stdlib
only; per-stat MAE/R², per-fold + frozen test, separate new-player slice,
single code path, fail-loud exit 2); BASELINES.md (carry-forward, age-curve,
stats-MLP, no invented numbers; frozen-test margin ≥0.01 PROPOSED);
RUNG1_DEMO_SPEC.md (next-shot, error in feet, three baselines, paired
bootstrap, kill rule on failing carry-forward, DATA-GATED); FLOOR_CONSTRAINT.md
(twin floor: retention ≥0.90, spread ≤1.10×, agreement ≥0.05, spot ≥17/20 —
all PROPOSED; miss = research-only for twin purposes; clear still needs the
user's word). Contract conflicts C1–C4 reported by the lane (984-fold figure,
pre-embargo vs embargoed folds, Lane 3 vs Lane 5 new-player definitions,
§2d replacement gate vs retention floor) — recorded, not silently resolved.

Research routing (deep-research report 2026-10-27 + panel Addendum III-C;
conditional-go STANDS, sharper): split-head CoJEPA blueprint; bridge /
predictive positives DEMOTED to experimental arm (no demo beats parallel
heads); hierarchy earned level-by-level behind a timescale diagnostic +
shared-latent arm; anti-collapse regularizer ablated (0/0.5/1/2×) + latent
rank monitoring, rank collapse = NEW kill trigger; conflict protocol
diagnose → UW/FAMO → CAGrad-if-persistent (FairGrad excluded from Muon
arms); Muon control = AdamW+EMA, MAE-led adoption, wall-clock on our rows;
location metrics by horizon; coach single-step only. Model-code lane
follow-up SUBMITTED (pending application). Eval-harness follow-up COULD NOT
be delivered (builder completed first) — so the eval-side deltas are recorded
here as PATCH CONDITIONS E1–E4, to be applied at synthesis before the eval
lane is called research-compliant: E1 forecast error by horizon AND
similarity separately; E2 location metrics by horizon + coach single-step
rule in RUNG1_DEMO_SPEC.md; E3 rank-collapse kill trigger + regularizer/rank
arm reporting + conflict diagnostic in arm reporting; E4 AdamW+EMA as the
Muon-arm control reference (MAE-led, on-our-rows wall-clock) wherever the
eval docs touch the optimizer arm. Nearly all 2025–2026 research items are
arXiv preprints, not peer-reviewed — cited with flags, never as settled
results; research moves priors, gates decide.

NOT in this commit (pending, explicitly excluded): lanes/11-moonshot-model/
— the model-code builder is still running and its research follow-up is
outstanding; its files will land in a wave-2b commit after completion +
verification. data-deep-dive/ belongs to the separate deep-dive coordinator
(11 investigators; synthesis DATA_COLLECTION_DEEP_DIVE.md pending) and is
not committed here; on landing it folds into the collection plan.

Gates restated: NO training runs, NO merges, NO production writes without
the user's separate word. Spec finalization BLOCKED until the user rules on
III-A Q1–Q3 + III-B Q1 and on the prediction-first reframe. HOLD (§11)
intact: no delivered lane doc, contract headline, eval protocol, or
prototype brief was rewritten to the prediction-first framing; new scope
work carries the "user-directed, pending panel ratification" label only.

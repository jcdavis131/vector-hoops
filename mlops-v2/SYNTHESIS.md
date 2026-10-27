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

## 8. Bio-inspired design lens (user 2026-10-26 22:49 CDT — DESIGN INPUT, pending research)

Recorded in CONTRACT §14, not applied as a rewrite: lane designs are to
be examined through bio-inspired mechanisms, each earning its place by
ablation, not by metaphor. Candidates: predictive coding / free-energy
(JEPA predictor + surprise-driven learning); sleep + hippocampal replay
(offline consolidation without new data); synaptic pruning (tower/feature
pruning by forecast lift); immune self/non-self (drift/anomaly detection
with amplification on confirmed drift); homeostasis / allostasis
(predictive recalibration before a gate breach); evolution
(variation-selection-inheritance hill-climb under held-out gates);
critical periods (curriculum: coarse/invariant first, fine detail only
after the III-C timescale diagnostic passes); swarm / stigmergy (tiered
agent lanes via shared timeline signals — agent system only, never a model
spec). Rule: any mechanism without a falsifiable test does not enter a
spec. A deep-research run on bio-inspired frameworks is underway; its
findings feed into lane designs on landing. Routing: model-code lane asked
for a BIO_LENS appendix (mapping → falsifiable test per mechanism, nothing
adopted, no restructure of the split-head design); the eval E1–E4 patch
brief gains the bio items touching drift/recalibration/pruning gates when
that pass is spawned. No lane doc was rewritten for this lens; no training,
merge, or prod write is authorized by it.

### 8.1 Bio research LANDED (2026-10-27 — rankings recorded, routing updated)

Report read in full: research_notes/
bio-inspired-adaptive-systems-20261027-0349/report.md (312 lines,
index-level sources, nothing tested on basketball data). Rankings
recorded in CONTRACT §14.1: (1) offline interleaved replay /
consolidation, (2) precision-weighted predictive error as JEPA weight +
per-tower gate, (3) structured pruning + EWC protection; close 4th:
two-threshold homeostatic gate. Most misleading if literal: swarm /
stigmergy (salvage EWMA sampling only) and morphogenesis / NCA (salvage
positional encoding only); runner-up: literal immune negative selection
(salvage multi-detector + co-stimulation OOD). Correction recorded:
immune and homeostasis have defensible testable mechanisms, not just
naming — the earlier dismissal was too strong. Caveats carried:
thresholds are proposed defaults to calibrate; transfer numbers are
secondary-summary indicative, not re-verified; predictive-coding energy
efficiency UNVERIFIED. Routing: model-code BIO_LENS appendix follow-up
updated to ground the appendix in the landed report (ranked mechanisms
with exact pass rules, misleading-if-literal warnings, and a
mechanism / language / poetry classification per mapping for Round 3's
framing — the builder states its classification, the panel judges);
eval patch brief gains E5 (bio eval items: per-tower error bands,
two-threshold gate test, pruning pass rules, multi-detector OOD test).
Panel Round 3 (Addendum IV) judges bake / keep-as-naming / reject per
mapping; nothing is baked by this section. No lane doc rewritten; no
training, merge, or prod write authorized.

## 9. Wave-2b synthesis (2026-10-27 ~03:56 CDT; coordinator-verified)

Model-code lane COMPLETE (20/20 children done). Coordinator verified on
disk: lanes/11-moonshot-model/ holds model.py (758 lines), losses.py
(846), optim.py (472), MOONSHOT_SPEC.md (594), MUON_ABLATION.md (242),
BIO_LENS.md (451) — 3,363 lines total, all Python drafts pass py_compile.
RESEARCH COMPLIANCE VERIFIED (the handoff's "untouched" line covered the
bio phase only; the research follow-up WAS applied in an earlier phase):
split-head CoJEPA blueprint, bridge/predictive-positives as EXPERIMENTAL
ARM only (III-C R1), regularizer ablation grid (0.0/0.5/1.0/2.0) +
effective-rank per-checkpoint monitoring, conflict protocol
diagnose → UW/FAMO → CAGrad-or-PCGrad-conditional, AdamW+EMA control with
MAE-led adoption, hierarchy earned level-by-level + shared-latent arm +
Push-T caution — all present by grep. NO model research patch needed.
BIO_LENS.md verified (451 lines; DOES-NOT-ENTER-SPEC / falsifiable /
MECHANISM / POETRY markers present): ranked mechanisms with exact tests
and kill rules, split verdicts (swarm: LANGUAGE for agent coordination +
MECHANISM-candidate EWMA fragment + POETRY literal simulation;
morphogenesis: MECHANISM fragment positional encoding + POETRY literal
growth), DO-NOT-PROPOSE list, caveat banner (index-level sources,
nothing on basketball data, thresholds proposed defaults). No model,
loss, optimizer, or conflict file was restructured for the bio lens.
One isolated failed tool call in the handoff did not affect deliverables.

Panel Round 3 COMPLETE (Addendum IV at PANEL_REVIEW.md:1756 + IV-A
follow-up; file now 2,428 lines). Verdict: NEITHER reject NOR adopt the
bio lens. Pruning (c) unanimous real mechanism. (a) real ONLY as IWM
conditioning (already in SPEC-3), else language. (b) replay SPLITS the
panel (endorse vs language-until-T-B + wall-clock) — the test decides;
the split costs nothing. (d)/(e) UPGRADED by research from language to
SPECIFIED CONDITIONAL mechanisms with runnable tests (T-D': ≥90%
injected corruptions flagged at lower false alarms than PSI/k-NN, ≥20
episodes; T-E': ≥30% fewer gate failures, ≤10% more false blocks, budget
respected) — neither ships until its test passes on basketball data.
(a) gains precision weighting (T-A'); (b)/(c) gain runnable protocols
(T-B': 50/50 new + 2,000 reservoir, JEPA-error-prioritised, ≥50%
backward-transfer cut, match newest season, beat uniform mix, ≤20%
update compute; T-C' pruning protocol). REJECTED outright: literal swarm
(salvage EWMA), literal morphogenesis/NCA (salvage positional encoding),
literal immune negative selection, literal homeostasis-as-freeze,
evolving tower weights (evolution only over ≤30 hyperparameters, must
beat random search). New discipline: every bio arm beats BOTH the no-bio
model AND the cheapest non-bio equivalent. Causal reading of any mapping
rejected UNOPPOSED (Seat 10) — especially story surfaces + coach mode.
No seat's verdict flips to unconditional bake. IV Q1–Q3 STAND: Q1 default
(run the replay arm) strengthened by T-B'; Q2 better posed (accept/amend/
reject the two-threshold design + set the floor number + hard-vs-warning
status); Q3 unchanged (bio language internal-only by default). IV-A
BLOCKED items: quoting any threshold as a constant; any bio mechanism
shipping before its named test passes on basketball data. The BIO_LENS
appendix was NOT rewritten to record Round 3 (classifications stated,
panel judges — as briefed); this section is the record.

Data deep-dive COMPLETE (separate coordinator; 12 files, 5,380 lines,
read-only + tiny probes, no bulk fetch, no live writes). Synthesis read
in full: DATA_COLLECTION_DEEP_DIVE.md. Headlines incorporated into the
collection plan (Scope A + overhaul lane): the 143 chain needs EXACTLY
ONE blocking fetch (11 gamelog JSONLs 2015-16…2025-26, operator machine
only) + derivations + 2 decisions (honors semantics, width re-pin);
FA2 coverages are the success criterion, NOT 1.0 (form/competition/
injury 0.3975, roster/team/system 0.2611); probe-gated waves (Tier-0
offline derivations → probes → gamelogs → conditional shot backfill →
PBP backfill → targeted gap-fill only); scale ESTIMATES (gamelogs
~160–270 MB, shots ~2.6 GB, PBP ~17.5 GB; realistic ~2–3 weeks elapsed;
PBP + box reliability the long pole; 16+ GB PBP transport through git is
an OPEN design gap to decide BEFORE Wave 4); PBP text = 203 masked
templates over 3,152 actions (15.5× dedup — embed templates once).
Corrections adopted: "70 missing columns" is a SET DIFFERENCE, not a
suffix (form 5 width-present but value-blocked; pedigree 7, not 2);
Hatch stall refined to TLS-complete then zero bytes; PBP conversion
magnitude discrepancy (0.022 ft vs 0.0002 ft by different checks) MUST be
reconciled before baking into any tower. Fine level stays EVENT-location:
no multi-season public per-frame trajectory source exists (only frozen
~600-game 2015-16 SportVU mirrors; Second Spectrum partner-only).
BIGGEST FLAG — LEGAL, NEW: Sports Reference Terms §5 item 11 expressly
bars AI-model training; under a strict reading it reaches BBRef-fed MTNN
training. Program NOT cleared for republication / further BBRef-fed
training pending a legal read. Until it lands, BBRef-fed families are
UNCLEARED for training (cross-check use is the safe posture); NBA
primary terms and ESPN current terms likewise UNVERIFIED; salary
upstream unidentified. Open decisions for the user (unchanged + new):
honors semantics, width re-pin, roster 002-filter ruling, PBP transport
decision, BBRef legal read. Deep-dive files are committed in wave-2b
(the coordinator is the program's synthesis point; the deep-dive
coordinator's investigation + synthesis are incorporated, not
duplicated).

Reframed-pair comparison page built by the coordinator (same governance
as the twin comparison): COMPARISON_FORECAST.html links both reframed
demos, states the shared honesty facts (v5 head unrunnable, baselines
labelled, baselines do not beat carry-forward, moves computed not
asserted, omissions stated), and carries the 4-criterion rubric with the
USER VERDICT column BLANK. No winner, no scores, no recommendation.

STILL OPEN after wave-2b (single known gap): eval-lane research patch
E1–E4 + E5 (by-horizon + similarity-separate reporting; location metrics
by horizon + coach single-step rule; rank-collapse kill trigger +
regularizer/rank arm reporting + conflict diagnostic; AdamW+EMA control
reference; bio eval items: per-tower error bands, two-threshold gate
test, pruning pass rules, multi-detector OOD test). A patch agent is
spawned for exactly this; the eval lane is NOT research-compliant until
it lands. Everything else in the program is either PASS, committed, or
awaiting a user/panel decision listed in §6/§7.

Gates restated: NO training runs, NO merges, NO production writes
without the user's separate word. Spec finalization BLOCKED until the
user rules on III-A Q1–Q3, III-B Q1, IV Q1–Q3, and the prediction-first
reframe. HOLD (§11) intact.

## 10. Wave-2c synthesis (2026-10-27 ~03:59 CDT; coordinator-verified) — LAST KNOWN GAP CLOSED

Eval-lane research patch APPLIED and verified (patch agent 21/21; all
children complete). Only the four files in lanes/12-moonshot-eval/ were
edited; no other lane, no repo checkout, no existing verdict or proposed
value rewritten — every addition is marked "PATCH ADDITION", files stay
DRAFT, and the forecast-headline framing label (user-directed, pending
panel ratification) is untouched. Coordinator verified: py_compile passes
on eval_forecast.py; PATCH ADDITION markers in all four files; by_horizon
schema + AdamW+EMA fail-loud validation present by grep; no execution on
real data; no training, merges, or production writes.
- E1: by-horizon forecast reporting (1-step/short/long, all-or-none
  horizon labels, else explicit not_computable — never a pooled
  world-model claim) + similarity_metrics as a separate pass-through
  block, never blended into the headline; "beating" tested per horizon.
- E2: location metrics by horizon; multi-step rollout claims require
  horizon-degradation curves; COACH MODE SINGLE-STEP STEERS ONLY until
  curves exist; GenTac ADE cited ONLY as error-growth law reference
  (soccer diffusion preprint, basketball generalization claimed not
  measured); CourtMotion structure-only with attribution hedge; HiT-JEPA
  similarity-only, never forecasting evidence. §5 kill rule unchanged.
- E3: rank-collapse KILL TRIGGER (shared-latent collapse kills the joint
  claim even if a headline metric looks alive); arm reporting requires
  regularizer ablation 0/0.5×/1×/2×, latent rank per checkpoint, and the
  conflict diagnostic logged BEFORE any method (diagnose → UW/FAMO →
  CAGrad only if persistent; FairGrad excluded from Muon arms).
- E4: AdamW+EMA (not plain AdamW) as optimizer-arm control, MAE-led
  adoption, wall-clock measured on our rows; LLM "1% overhead" and
  Moonlight ~2× FLOPs quotes banned.
- E5: bio eval items as PROPOSED DEFAULTS (Panel IV-A BLOCKED labels
  kept): per-tower error bands + T-A' precision-weighting pass rule;
  two-threshold gate test T-E' (WARNING → consolidate + widen, no block;
  ALARM → block + retrain + log; retrospective, no future labels;
  failures down ≥30% AND false blocks up ≤10% AND within budget);
  structured-pruning rules T-C' (whole towers/heads/columns only; 30% →
  ≤1% degradation + ≥25% latency/size cut; 50% → ≤3% or rejected;
  per-era degradation reported); multi-detector + co-stimulation OOD
  test T-D' (≥90% injected corruptions pre-gate at lower false-alarm
  than BOTH PSI monitor and k-NN baseline, ≥20 episodes). No bio
  mechanism ships until its named test passes on basketball data;
  literal swarm/morphogenesis/negative-selection/homeostasis-as-freeze
  stay REJECTED. No new contract conflicts (C1/C2/§2d items left exactly
  as delivered).
With this patch, the eval lane IS research-compliant. There is NO
remaining known lane gap: every lane is PASS, committed, or recorded as
a condition (text M1–M7, eval E1–E4+E5 now satisfied by the patch). What
remains is decisions only: user picks (twin + reframed competitions),
user rulings (III-A Q1–Q3, III-B Q1, IV Q1–Q3, prediction-first reframe),
and the open collection decisions (honors, width re-pin, roster
002-filter, PBP transport, BBRef legal read). Gates restated: NO
training runs, NO merges, NO production writes without the user's
separate word. Spec finalization BLOCKED until the user rules.

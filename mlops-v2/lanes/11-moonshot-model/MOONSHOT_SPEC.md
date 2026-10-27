# Moonshot Model Spec — SKELETON (DRAFT)

> **DRAFT — on every page, by design.** Spec finalization waits for
> panel synthesis (contract §11, governance hold). This document is
> a spec SKELETON: architecture summary, data dependencies, eval
> gates, open questions, and explicit non-goals. Nothing here is
> finalized, nothing here is trained, and nothing here authorizes
> training, a merge, or a production write (contract §13 hard gates).

> **How to read the labels in this document.** VERIFIED = measured by
> the coordinator or a lane and re-checked (contract §9). PROPOSED =
> a design value pending user confirmation, never a measured fact.
> UNVERIFIED = a paper claim not confirmed against the skill's
> references (Lane 9's check). USER-DIRECTED, PENDING PANEL
> RATIFICATION = the user said it, the panel has not ruled on it
> yet (contract §11 hold) — it is recorded faithfully and labeled
> exactly that way, never presented as decided.
> PREPRINT = an arXiv preprint, NOT peer-reviewed (applies to nearly
> all 2025–2026 research items cited here). Research moves priors,
> gates decide: no preprint number below settles a gate by itself.

## 0. Research update applied (2026-10-27) — DRAFT

> **DRAFT — see the banner above.**

Sources: deep-research report 2026-10-27
(`research_notes/joint-contrastive-jepa-muon-trends-20261027-0340/report.md`)
and panel Addendum III-C (PANEL_REVIEW.md lines 1510–1754;
conditional-go STANDS, sharper conditions). The five changes from
the follow-up brief are APPLIED to `model.py`, `losses.py`,
`optim.py`, `MUON_ABLATION.md`, and this spec below. This document
stays DRAFT: spec finalization is BLOCKED until the user rules on
III-A Q1–Q3 + III-B Q1, and training/merges/prod writes remain
gated. What changed, in one line each:

1. **Blueprint: split-head CoJEPA pattern, bridge demoted.**
   Contrastive/similarity head on the POOLED tower output,
   predictive head on the PER-STEP tower output, one shared encoder.
   Bridge / predictive positives = EXPERIMENTAL ARM (MJ-with vs.
   MJ-without, decided on Fold 2, never assumed). Default MJ =
   parallel heads. (CoJEPA Aug 2026 preprint, 7.1M music model;
   COJEPA-MRI Jul 2026 preprint, N=2,286 — neither a tabular MLP at
   ~13k rows; the ablations are the proof, not the papers.)
2. **Anti-collapse is load-bearing.** Explicit variance/covariance/
   Gaussian regularizer on the shared latent, weight ablated
   (0 / 0.5× / 1× / 2×); latent rank monitored per checkpoint;
   rank collapse = NEW KILL TRIGGER even if a headline metric looks
   alive. (UniJEPA Aug 2026 preprint, vision ViT: weight 0 → rank 3,
   collapsed, planning destroyed. "Provably anti-collapse" is never
   quoted as a guarantee for a tower-MLP.)
3. **Hierarchy earned level by level.** 2 levels first; a 3rd only
   if the 2-level model beats the separate baselines. A timescale
   diagnostic gates any 2nd level (slow vs. fast predictability at
   short vs. long strides; a two-timescale LOSS on one encoder is
   the cheaper probe). Shared-latent (HWM-style) hierarchy added as
   a comparison arm. Full 3–4 level H-JEPA + top-down planner NOT
   imported. (H-JEPA Oct 2026 preprint: AntMaze 18% → 73.3%, but
   Push-T collapses 45.3% → 17.3% → 0.7% as levels are added;
   FourRoom shared-latent 99.3 beats separate-latent 96.0.)
4. **Optimizer control changes.** Control = AdamW+EMA (not plain
   AdamW); challenger = hybrid Muon (2D only, weight decay +
   √max(A,B) RMS scaling; AdamW fallback for 1D/embeddings/heads/
   biases/norms). Adoption MAE-led: beat AdamW+EMA beyond the
   bootstrap interval on Fold 2 with zero stability cost; a
   wall-clock argument alone cannot adopt Muon. Wall-clock measured
   ON OUR ROWS (CPU timing at 12,966 rows UNVERIFIED). MuonClip's
   QK-Clip EXCLUDED (attention-specific). (Tabular benchmark,
   Gorishniy et al., Apr 2026 preprint: AdamW+EMA +0.66 beats Muon
   +0.32 on the plain MLP, Muon at 2.98× training time.)
5. **Conflict protocol, not PCGrad-by-default.** (1) Diagnose first
   (loss scales + gradient cosine, logged); (2) uncertainty
   weighting or FAMO (O(1)); (3) CAGrad ONLY if conflict persists.
   PCGrad is a conditional option alongside CAGrad. FairGrad
   EXCLUDED from any Muon arm. At K=2, GO4Align grouping, Nash-MTL
   solver cost, and SAMO double passes are skipped.
6. **Location metrics by horizon (consequence for Mode G eval).**
   GenTac (Apr 2026 preprint): ADE 0.62 m at 1 s → 4.55 m at 5 s —
   only the error-growth LAW transfers (diffusion + full tracking
   scale does not). Coach mode is single-step steers only until
   horizon-degradation curves exist.

## 1. Architecture summary — DRAFT

> **DRAFT — see the banner above.**

One joint model, one shared encoder, SPLIT HEADS (CoJEPA blueprint
— §0 item 1), one bridge EXPERIMENTAL ARM (not the default).
Code: `model.py`, `losses.py`, `optim.py` in this directory —
drafts only.

**Shared encoder.** The 17 tower encoders from Lane 4 (same
`cat([x·m, m])` family-mask convention, same contract §0 family
order), with the v5 prediction heads REMOVED. Two outputs: the
PER-STEP tower output (concat of tower outputs, 32 × n_families)
and the POOLED output (fusion → 64-d L2). No season token (Lane 4
§2: an era shortcut for a twin-space objective).

**Head (a) — Matryoshka SupCon, on the POOLED output.** Twin space
at {8, 16, 32, 64}: slice + re-normalize at inference, one
versioned asset serving all widths. Per-prefix weights, PROPOSED
(Lane 9 §6, coarse-heavy): {8: 0.30, 16: 0.30, 32: 0.20, 64: 0.20}.
The similarity head is trained INVARIANT to nuisance variation
(IWM conditioning trick, §0 item 1 — invariance is a training
property of this head, not of an unconditioned latent).

**Head (b) — JEPA predictor, two modes (Lane 9 §2 decision: two
predictor modes, NOT one head with timescale conditioning).**

- **Mode S (season).** Next-season predictor reading the PER-STEP
  tower output (split-head blueprint), CONDITIONED on
  change/context (IWM trick): the conditioning variables are stated
  EXPLICITLY — team change, role delta, minutes delta (defined and
  supplied by data prep; if no conditioning vector is supplied the
  predictor runs unconditioned and the run report must flag that
  the IWM trick is NOT active). The predictive head is EQUIVARIANT:
  it must track what changed. Target = stop-grad contrastive
  embedding of the TRUE next season, z_{t+1} (target coupling is
  retained in the Mode S definition; the BRIDGE — predictions as
  contrastive positives — is a separate, experimental mechanism,
  see below). Output ẑ_{t+1} (64-d, L2). Per-prefix weights,
  PROPOSED (Lane 9 §6, fine-heavy): {8: 0.10, 16: 0.20, 32: 0.30,
  64: 0.40}. Career-context conditioning (mean of earlier-season
  embeddings, training portion only) remains a PROPOSED ablation.
- **Mode G (game, the Lane 8 mode).** Action-triple-conditioned
  (play call / lineup / matchup) next-game-state predictor, in
  game-state latent space — NEVER twin space, NEVER entering the
  SupCon batch. Its game-state encoder is a Phase 1 JEPA component,
  not built here; this draft defines the predictor + action encoder
  and takes the game-state latent as input.

**The bridge — EXPERIMENTAL ARM ONLY (§0 item 1).** Default MJ =
parallel heads: NO predictive positives, NO bridge term. The
MJ-with-predictive-positives arm (Mode S predictions entering the
SupCon batch as positive-members-only, always detached, never
anchors, per Lane 9 §4.2 rules 1–5) is run and compared against
MJ-without, and the decision is made ON FOLD 2, never assumed. No
paper in the 2026-10-27 sweep demonstrates a bridge loss beating
parallel heads. A run report that includes the bridge term MUST
label itself as the bridge arm; `losses.py` excludes the bridge
term by default (`bridge_arm=False`) so it cannot leak into a
parallel-heads run through a stale terms dict.

**Hierarchy — earned level by level (§0 item 3).** The width
hierarchy (Matryoshka prefixes as H-JEPA levels, Lane 9 §6) is a
weighting discipline on existing components, NOT a multi-level
JEPA stack. A second, coarser timescale level requires, in order:
(a) a PASSED timescale diagnostic (slow variables — season/phase/
role — predictable over a long stride while fast variables are
not; if that separation does not exist, the hierarchy does not
start and the cheaper probe — a two-timescale LOSS with short- +
long-horizon heads on one encoder — is used instead); (b) for a
3rd level, the 2-level model beating the separate baselines AND a
long-clip sufficiency (Push-T starvation) check. A shared-latent
(HWM-style) hierarchy is a COMPARISON ARM against the
separate-latent hierarchy, not an assumption. Full 3–4 level H-JEPA
+ top-down planner is NOT imported. `model.py` enforces depth
gates at build time (`validate_hierarchy_depth`; levels 4+
refused).**Loss (summary; full formulas in `losses.py`).**
L = w_S·L_SupCon-MRL + w_D·L_JEPA + w_B·L_bridge + LOAD-BEARING
shared-latent anti-collapse regularizer. The bridge term enters
ONLY in the bridge arm (default OFF, §0 item 1). The regularizer
is a variance, covariance, or Gaussian term on the SHARED latent
(UniJEPA-STYLE / VICReg-STYLE, design choices stated in full,
UNVERIFIED as citations), with its weight ABLATED at 0 / 0.5× /
1× / 2× — the 0 arm is expected to collapse and must be run and
reported. Latent rank is monitored PER CHECKPOINT (effective rank
/ embedding variance); rank collapse is a NEW KILL TRIGGER (§3).
Weights via learnable log-variance scalars (uncertainty weighting,
UNVERIFIED as a citation) OR FAMO (O(1)) — step 2 of the
diagnose-first conflict protocol: (1) diagnose (loss scales +
gradient cosine, logged every run); (2) uncertainty weighting or
FAMO; (3) CAGrad ONLY if conflict persists, with PCGrad as a
conditional option alongside it (UNVERIFIED as a citation).
FairGrad is EXCLUDED from any Muon arm; GO4Align grouping,
Nash-MTL solver cost, and SAMO double passes are skipped at K=2.
The interference monitor itself (logged cosine, Lane 9 §5.3
PROPOSED rebalance/stop thresholds) STANDS.

**Prediction-first rebalance — PROPOSED, PENDING PANEL
RATIFICATION.** Per the user's 2026-10-26 22:32 CDT correction
(contract §10), the PROPOSED default in `losses.py` makes w_D
dominant and w_S auxiliary (expressed as initial log-variance
values: s_DS = −0.7 → weight ~2.01; s_B = 0.0 → 1.00; s_S = 0.7 →
~0.50). This rebalance is USER-DIRECTED, PENDING PANEL RATIFICATION
under the §11 hold. It is NOT presented as ratified. If the panel
does not ratify prediction-first, the dominance ordering is dropped
and the Lane 9 equal-start uncertainty weighting stands. The
delivered Lane 9 design remains the delivered baseline either way.

**Optimizer.** AdamW+EMA control arm + hybrid Muon challenger
(Muon for hidden 2D stem weights with weight decay + √max(A,B) RMS
scaling; AdamW fallback for 1D/embeddings/heads/biases/norms),
compared by ABLATION ONLY — no adoption decision, no adoption
recommendation (`optim.py`, `MUON_ABLATION.md`). Adoption is
MAE-led (beat AdamW+EMA beyond the bootstrap interval on Fold 2,
zero stability cost); wall-clock alone cannot adopt Muon, and
wall-clock is measured ON OUR ROWS (CPU timing at 12,966 rows
UNVERIFIED). MuonClip's QK-Clip is EXCLUDED (attention-specific).
The panel is charged with Muon adopt/ablate/skip.

**Lineage note (brief-stated, not independently verified in this
lane's reading).** The task brief states v5 already carried a
next-season prediction head (nNextProfile=14): next-season
prediction is native task lineage, not a new invention. This lane
did not re-verify that head against the v5 export in this pass;
the finalized spec must confirm or correct that lineage claim
before relying on it (see §5, open question 6).

## 2. Data dependencies — DRAFT

> **DRAFT — see the banner above.**

**Inputs that EXIST (VERIFIED, contract §9 / Lane 7 inventory).**

| Input | Status | Use in this model |
|---|---|---|
| Player-season rows: 12,966, `assets/vectors.json` (mlops-v2 copy is the row master — person_id on 12,966/12,966, contract §9 S2) | EXISTS | Row master; Mode S input unit (one player-season row) |
| 14-d game vector (PTS, AST, OREB, DREB, STL, BLK, TOV, FG3A, FGA, FTA, FG3_PCT, FG_PCT, FT_PCT, PLUS_MINUS; z-scored within season) | EXISTS | Stat surface the coarse forecast is read out in. NOT a projection of the embedding; NOT a second competing latent target (Lane 8 addendum §1.3). Whether the coarse head ALSO directly predicts the 14-d vector is UNDECIDED (see §5 Q5) |
| Adjacent-season pairs (Lane 3 pair builder; train-split only, cross-boundary pairs purged) | EXISTS as a builder design | Mode S training examples (only rows with a true adjacent-season successor in the training portion); predictive-positive eligibility |
| Champion v5 embeddings (12,966 × 64-d, `assets/mtnn_embeddings.f32`) | EXISTS | Baseline / consultation only (lineup style context for Mode G, Lane 8 §3.3). NEVER overwritten, never a training input for the stem |

**Inputs that are DISPUTED (the pinned-width question).**

| Input | Status | Consequence for this model |
|---|---|---|
| Wide training matrix width: 120 (contract §0 / Lane 4) vs. 73 (verified offline-rebuild base, §9 S1) vs. 143 (HEAD chain, unverified, gamelog-blocked) vs. 130 (champion export) | DISPUTED — user picks (contract §9 P2) | `model.py` takes the family table as a constructor argument and fails loud on mismatch (contract §9 P4 guard). It hardcodes NEITHER 120 nor 73. The finalized spec must record the pinned width; until then, every run report must state which width was used |

**Inputs that are DATA-GATED (Scope A — the critical path for the
fine level; contract §10).**

| Input | Status | Gate |
|---|---|---|
| Historical play-by-play at scale (beyond the 5 2026-27 opening games in `cdn_pbp/`, ~593–667 actions each, with `x`/`y`) | DATA-GATED | Mode G cannot train without it. The 5 games prove the coordinate format only — they are NOT a training corpus |
| Shot coordinates at scale (no ShotChartDetail response, no per-season shot file, no LOC_X/LOC_Y anywhere under `pipeline/cache/` — 0 hits, contract §10) | DATA-GATED | Mode G shot-location state feature + the §6c shot-position tower. Collection must run on Alienware/Mac (Hatch VM stalls / CDN 403s per the 2026-10-11 verdict); whether that path has been exercised is UNVERIFIED |
| Game logs for all seasons (no `gamelogs_*.jsonl` on disk; only fetcher scripts) | DATA-GATED | Mode G per-game form / availability / recent-history features. Later-season game logs are prioritized (they carry actual shot coordinates) |
| Built, validated, frozen game-state dataset (states + actions + next states, versioned, hashed, index-aligned) | DATA-GATED | Mode G's training set itself. `model.py` enforces this at construction: `enable_mode_g` raises until a hashed dataset is supplied |
| Continuous 10-player trajectories | DATA-GATED, source itself an OPEN QUESTION | No on-VM asset names such a source. PBP `x`/`y` gives EVENT locations, not trajectories. Any fine-surface claim implying trajectories from event data is false (Lane 8 addendum §2.4 item 5) |
| Text tower (Scope B: PBP event text embeddings, EmbeddingGemma Stage 1 + task-aligned Stage 2) | SEPARATE DESIGN, panel-reviewed before synthesis | NOT adopted into this model by this draft. If it ever enters, it enters as ONE tower with an on/off ablation, judged by forecast lift vs. the stats-only baseline (contract §10) |

**BANNED inputs (hard lines, not judgment calls).**
Sprite positions, replay files (`assets/replays/`), and replay
animation weights (`assets/replay-model.json`) are NEVER training
inputs (contract §§7, 12; Lane 8 §5). Predicted locations that pass
through a renderer do not become real data by passing through it.
The 11-feature proxy (`mtnn_inputs.f32`) is NEVER random-projection
expanded to the wide matrix (contract §2b). Val/test rows are never
training inputs; the frozen 2025-26 test season is never trained on,
never tuned on, never used for early stopping.

## 3. Eval gates — DRAFT

> **DRAFT — see the banner above.**

**Two framings, kept distinct under the §11 hold.** The delivered
Lane 9 Pareto protocol (§8 headline: future twins as the joint
metric) and the user-directed prediction-first framing (§10:
forecast primary, twins as floor) are BOTH specified here, with
their governance labels intact, so this spec survives either panel
ruling. The panel synthesis + user ruling decides which framing is
the headline. Nothing in this section pre-empts that ruling.

**Forecast-primary framing (USER-DIRECTED, PENDING PANEL
RATIFICATION — the PROPOSED headline if ratified).**

- Headline: per-stat MAE/R² on the 14-d next-season forecast, under
  expanding-window CV (embargoed folds, §9 P1) + the new-player
  slice reported separately, never blended.
- Baselines it must beat (rethink brief O1/O5 direction,
  panel-pending): carry-forward (persistence), age-curve, and
  stats-MLP. The baseline set itself awaits panel synthesis; at
  minimum, carry-forward is the honest null ("players mostly play
  like themselves next season").
- PROPOSED defaults flagged for user confirmation (NOT adopted):
  1-season horizon primary; all-14 stats equal weight with scoring
  highlighted as a display emphasis, not a weighting change.
- Twin quality under this framing = FLOOR constraint (retrieval
  trio within Lane 9 §2.1 PROPOSED tolerances + 16-d retention ≥ 90%
  of 64-d top-1, contract §2d), not the headline.

**Pareto framing (DELIVERED Lane 9 protocol — stands unless the
panel ruling replaces it).**

- Axis 1 (retrieval): no regression vs. the separate Lane 4 baseline
  beyond Lane 9 §2.1 PROPOSED tolerances (top-1 ≥ baseline − 0.005,
  recall@10 ≥ baseline − 0.010, continuity ≤ baseline + 0.010,
  new-player top-1 ≥ baseline − 0.005), on val AND frozen test.
- Axis 2 (dynamics): no regression vs. the separate Lane 8 baseline
  beyond Lane 9 §2.2 PROPOSED tolerances; for a Mode-S-only run,
  Mode G metrics are N/A (data-gated), never scored as zero.
- Axis 3 (joint-only): future-twins mean overlap@10 ≥ persistence
  baseline + 0.05 (PROPOSED margin), on BOTH the val protocol and
  the frozen protocol (Lane 9 §3: k = 10, 64-d space only, candidate
  pool = target-season rows, person-excluded retrieval, coverage
  reported with debut players counted as unpredictable by
  construction).
- Fail any axis → sharing is not justified; the separate baselines
  stand. A joint model that would REPLACE the v5 twin space still
  faces the §2d promotion gate PLUS the user's separate word —
  passing this protocol is necessary for a serving conversation,
  never sufficient for a serving switch.

**Gates that apply under EITHER framing (not framing-dependent).**

- Era-invariance of the twin space (Lane 5's mask-ablation era
  test): joint training via the time-aware season predictor must
  not leak era into the twin space. Fail → research-only.
- Self-twin exclusion: every retrieval is person-excluded (all rows
  of the same person_id), not just row-self-excluded (the pre-fix
  bug). Any number computed otherwise is invalid and recomputed.
- No test leakage through the predictor: a Mode S example whose
  target row is in val/test invalidates the run, full stop.
- Interference stop (Lane 9 §5.3 PROPOSED): 5-epoch mean cosine
  < −0.50, or any single epoch < −0.70, or 3 consecutive epochs
  < −0.50 → STOP, report interference. Rebalance at 5-epoch mean
  < −0.20 (halve the smaller-loss-scale head, clamped at 0.25×
  run-start). Watch at mean < 0 (log only).
- Collapse stop (Lane 9 §5.1 PROPOSED): mean pairwise cosine > 0.90
  for 3 consecutive epochs → STOP for review. No silent loss switch.
- Predictive-positive failure (Lane 9 §4.2 rule 5): zero
  predictive-positive rows for a full epoch → FAIL LOUD. (Applies
  to the bridge arm only; parallel-heads runs have no such rows
  by design and must not be failed for their absence.)
- **Rank-collapse kill trigger (III-C R4, NEW):** shared-latent
  effective rank below the PROPOSED 0.25 × latent dimension at any
  checkpoint KILLS the joint claim, even if a headline metric looks
  alive. Rank is monitored per checkpoint and the full trajectory
  is reported; a latent that collapsed mid-run and recovered is
  still evidence about the regularizer, not a clean run.
- **Regularizer ablation gate (III-C R4):** the shared-latent
  anti-collapse regularizer must be run at 0 / 0.5× / 1× / 2× and
  all four arms reported. A missing 0 arm (the expected-collapse
  arm) is a missing deliverable.
- **Bridge-arm decision gate (III-C R1):** MJ-with-predictive-
  positives vs. MJ-without is decided ON FOLD 2, on the same
  forecast + twin-floor protocol. Until that decision, no run
  report may present bridge results as the default MJ result.
- **Location metrics by horizon (III-C R6, Mode G eval):** next-event
  / location error reported separately at 1-step, short-horizon,
  and long-horizon. A model winning at 1 step and collapsing at 5
  steps has not learned a world model (GenTac preprint error-growth
  law: ADE 0.62 m at 1 s → 4.55 m at 5 s; only the LAW transfers).
  Multi-step rollout claims (coach-mode multi-step counterfactuals,
  Live chains) require horizon-degradation CURVES, not 1-step
  accuracy — until those curves exist, coach mode is SINGLE-STEP
  steers only.
- Ablations (Lane 9 §5 table, all rows run, all rows reported):
  J0 full joint; J1 without bridge; J2 without PCGrad; J3 without
  predictive positives; J4 without uncertainty weighting; J5 without
  variance regularizer; J6 with EMA target (only if the user
  confirms it). A missing ablation row is a missing deliverable.
- Mode G eval (when its data gate opens): Lane 8 §5 — next-play
  prediction quality (per event type + calibration), planning
  quality (what-if discrimination, rollout coherence), ghost
  believability (indistinguishability probe, style fidelity, and
  the LABEL check: every ghost surface labels the ghost as
  model-predicted, not real).

**What is NOT a gate.** Twin agreement vs. champion is a guardrail /
transfer diagnostic (Lane 9 §2.1, PROPOSED report-only), not a gate
metric: a joint model that legitimately improves on v5 will disagree
with v5, and gating on agreement would punish improvement (contract
§9 P3, pending user confirmation). Uncertainty scalars are not
importance readings (Lane 9 §3.6): head importance is judged by the
Pareto / forecast eval, never by reading s_k.

## 4. Open questions — DRAFT

> **DRAFT — see the banner above.**

Each question states what would answer it. None is answered by
assertion in this draft.

1. **Pinned feature width (73 vs. 143 vs. 130 vs. 120).**
   Answered by: the user's re-pin decision (contract §9 P2) on the
   overhaul lane's evidence — verified 73-column base now, 143 only
   on evidence (gamelog gap closed). Until then, `model.py` stays
   width-parameterized and every run report states its width.
2. **Prefix weights + interference thresholds + Pareto tolerances
   + future-twins margin.** Answered by: user confirmation of the
   Lane 9 PROPOSED values (§6 weights, §5.3 thresholds, §2
   tolerances, §3.4 +0.05 margin) — or replacement values, which
   then replace them everywhere. The mechanism stays the same.
3. **Prediction-first ratification.** Answered by: the 12-seat
   panel's synthesis + the user's ruling (contract §11). If
   ratified, §3's forecast framing becomes the headline and the
   `losses.py` dominance ordering stands. If not, the Lane 9 Pareto
   framing stays the headline and the dominance ordering is dropped.
4. **H-JEPA centrality.** Answered by: the same panel + ruling
   (contract §12). If ratified, the two-surface hierarchy (§1) is
   the central architecture. If not, the coarse surface stands alone
   as Mode S and the fine surface alone as Mode G, the hierarchy
   reverts to a design note (Lane 8 §4), and the §7
   division-of-labor default continues unchanged. The render
   direction and sprite ban survive either ruling (data-integrity
   rules, not centrality claims).
5. **14-d readout form.** Answered by: a panel ruling or user
   decision (Lane 8 addendum §1.3 open question) — latent-only
   prediction with a separate readout/decoder for eval and display,
   vs. an additional direct 14-d output head. Different eval
   consequences; this draft adds NO 14-d head until the decision
   lands.
6. **v5 nNextProfile=14 lineage.** Answered by: a check of the v5
   export / training code for the brief-stated next-season head
   (see §1 lineage note). If confirmed, the forecast head's lineage
   is documented as native; if not, the lineage sentence is
   corrected and the forecast head stands on its own eval merit.
7. **Mode G game-state latent width.** Answered by: the Phase 1
   JEPA baseline (Lane 9 §2.2 deliberately leaves it unfixed).
   `model.py`'s 64 default is a placeholder; the finalized spec
   must replace it with the Phase 1 width.
8. **Play-call vocabulary + trajectory source.** Answered by: real
   historical play-by-play in hand (vocabulary derived from what
   PBP actually distinguishes, Lane 8 §6 item 5) and a named,
   verified trajectory source if continuous trajectories are ever
   claimed (Lane 8 addendum §2.4 item 5). Until then, Mode G stays
   data-gated and trajectory prediction stays vision-only.
9. **Muon adopt / ablate / skip.** Answered by: the ablation in
   `MUON_ABLATION.md` (same folds, same seeds, forecast MAE/R²
   primary, twin floor, wall-clock, stability) judged against its
   PROPOSED decision rule by the PANEL — not by this draft.
10. **EMA target ablation (J6) + frozen-protocol retraining choice.**
    Answered by: user confirmation (Lane 9 §11 items 4–5; Pareto
    §6 items 4–5) — whether J6 runs or is cut, and whether the
    frozen protocol retrains on ≤ 2024 or evaluates the val-trained
    model directly. Either is acceptable; the choice must be fixed
    before runs start.
11. **Citation check for UniJEPA / DreamerV3 / MuDreamer.**
    Answered by: a check against the actual papers (outside the
    skill's references) IF the user requires it (Lane 9 §11 item 5).
    The design's self-contained formulas are sufficient authority
    without it; the current position is that training does not wait
    for it, and the user may overrule that.
12. **Reconciliation with Panel Addendum III-C — APPLIED
    2026-10-27 (see §0).** The III-C conditions recorded in the
    previous draft of this question (bridge experimental, hierarchy
    earned level-by-level, AdamW+EMA control, rank kill trigger,
    diagnose-first conflict protocol, per-horizon location metrics)
    are now APPLIED to `model.py`, `losses.py`, `optim.py`,
    `MUON_ABLATION.md`, and §§0–1/3 of this spec. What REMAINS open
    is FINALIZATION itself: the user ruling on III-A Q1–Q3 + III-B
    Q1, which alone can ratify the prediction-first framing, the
    H-JEPA centrality question, and the PROPOSED numbers throughout
    this spec.
13. **Timescale diagnostic outcome.** Answered by: measuring
    slow-vs-fast predictability at short vs. long strides on real
    data (season/phase/role vs. fast variables) BEFORE any 2nd
    hierarchy level. If the diagnostic fails, the hierarchy does
    not start and the two-timescale loss probe is used instead.
14. **Bridge-arm decision on Fold 2.** Answered by: the
    MJ-with-predictive-positives vs. MJ-without comparison on Fold
    2 under the forecast + twin-floor protocol. Until then, default
    MJ = parallel heads.
15. **Regularizer kind + weight + rank trajectory.** Answered by:
    the 0 / 0.5× / 1× / 2× ablation on the shared latent (kind:
    variance, covariance, or Gaussian — the ablation must state
    which kind each arm used) plus per-checkpoint rank monitoring.
    The 0 arm is expected to collapse; if it does not, that itself
    is a finding about this latent, not a reason to drop the
    regularizer without a second measurement.
16. **Hierarchy arm: separate-latent vs. shared-latent.**
    Answered by: the arm comparison (FourRoom precedent, preprint,
    secondary table read: shared 99.3 beats separate 96.0 — a prior,
    not a result for this model). Neither arm is assumed superior.
17. **Muon control + adoption.** Answered by: the ablation in
    `MUON_ABLATION.md` against AdamW+EMA (MAE-led, bootstrap
    interval on Fold 2, zero stability cost), judged by the PANEL
    — not by this draft. Wall-clock on our rows is a required
    measurement, not an adoption argument.

## 5. What this code deliberately does NOT do yet — DRAFT

> **DRAFT — see the banner above.**

- **No training.** No training loop, no training run, no GPU, no
  package installs. `model.py` / `losses.py` / `optim.py` are
  architecture + loss + optimizer-config drafts. Training needs
  Phase 1 baselines measured, panel synthesis, and the user's
  separate word — three gates, none passed.
- **No Mode G training path.** Mode G is construction-gated in
  `model.py` (`enable_mode_g` raises without a hashed, frozen
  game-state dataset) and loss-gated in `losses.py` (λ_G = 0 until
  the data gate opens). A Mode-S-only run is the expected first
  Phase 2 run, not a partial one.
- **No 14-d output head.** See §4 Q5: the readout form is undecided,
  so this draft does not silently adopt a direct 14-d head. Mode S
  predicts in latent space; the 14-d line is the stat-space readout.
- **No game-state encoder.** The Phase 1 JEPA state encoder (Lane 8
  §3.2 component 1) is a separate deliverable. This draft takes the
  game-state latent as input and defines the predictor + action
  encoder only.
- **No text tower.** Scope B text design is a separate lane with its
  own panel review and forecast-lift gating. It is not wired into
  this model by this draft.
- **No serving change, no asset write, no threshold change.** The
  champion asset is never an output path; no production surface is
  touched; any future serving switch needs the §2d promotion gate
  plus the user's separate word.
- **No bridge by default, no deep hierarchy, no Muon adoption.**
  Default MJ = parallel heads (bridge is an experimental arm
  decided on Fold 2). Hierarchy is capped at 3 levels behind gates
  and 4+ levels are refused — no 3–4 level H-JEPA + top-down
  planner. Muon is a challenger against AdamW+EMA, not an adopted
  optimizer; QK-Clip and FairGrad-in-Muon-arms are excluded, not
  available options.
- **No finalized spec.** This document is a skeleton under the §11
  hold. Finalization waits for panel synthesis + user ruling (and,
  per the follow-up brief, is BLOCKED until the user rules on III-A
  Q1–Q3 + III-B Q1). Any sentence here quoted as finalized
  architecture misquotes it.
- **No claim about Muon, no claim about hierarchy, no claim about
  paper results.** Muon is under ablation evaluation (fit UNPROVEN).
  H-JEPA centrality is a user vision under review (not ratified).
  UniJEPA / DreamerV3 / MuDreamer / VICReg / PCGrad / uncertainty
  weighting are UNVERIFIED as citations and used only as fully
  stated design specifications.

## 6. Verification performed for this draft — DRAFT

> **DRAFT — see the banner above.**

- `python3 -m py_compile` on `model.py`, `losses.py`, `optim.py`
  (required; see §7 for the exact commands and results).
- Pure-Python logic checks (no torch, no real data, no parameter
  updates, no asset files loaded): prefix-weight sums, the
  prediction-first initial-value ordering, the interference-monitor
  decision table, the collapse-stop decision, the
  predictive-positive index augmentation, and the parameter
  partition rule — run from `/tmp` (ephemeral scratch, not a
  deliverable) against the lane directory on `sys.path`. Exact
  commands and outputs are recorded in §7.
- What was NOT run, deliberately: no synthetic-tensor shape check
  (torch is not installed in this environment, and the hard gates
  forbid package installs in this pass — a shape check that needs
  torch cannot run here without violating that boundary, so
  py_compile + pure-Python logic checks are the verification, and
  the torch-dependent shape check is left to an environment with
  torch, still with random tensors only, no real data, no parameter
  updates); no training run; no load of `mtnn_embeddings.f32`,
  `vectors.json`, or any real data into an executed model.
- No other lane's files were edited. No repo checkout was written.

## 7. Verification log — DRAFT

> **DRAFT — see the banner above.**

(Recorded at delivery — real outputs, not placeholders.)

- Command: `python3 -m py_compile model.py losses.py optim.py`
  (run in `~/workspace/mlops-v2-drafts/lanes/11-moonshot-model/`).
  Result: PASS — exit 0, `PY_COMPILE_OK`, no errors. (Note: torch
  is NOT installed in this environment; the files parse because
  torch is imported lazily inside functions, Lane 4 pattern.)
- Command: pure-Python logic check (`/tmp/moonshot_logic_check.py`,
  lane dir on `sys.path`; imports `model`, `losses`, `optim` only;
  no torch, no real data, no parameter updates, no asset files).
  Result: `ALL_LOGIC_CHECKS_PASSED`. Verified: prefix-weight sums =
  1.0 for both SupCon and JEPA-S; prediction-first effective weights
  S=0.497, DS=2.014, B=1.0, DG=1.0 (ordering DS > B > S holds);
  interference decisions ok/watch/rebalance/stop on all six fixed
  cosine tables (including single-epoch −0.75 → stop and
  3-consecutive < −0.50 → stop); collapse stop/ok as expected;
  predictive-positive augmentation indices {0: 3, 2: 4} with
  augmented sets [{1,3}, {0}, {4}] and exactly 3 anchor sets
  (predictions never anchors); zero-predictive-positive epoch fails
  loud; partition on a synthetic named-parameter list puts only the
  two stem 2D weights in the Muon group and all biases, predictor,
  and action-encoder (incl. play-call embedding) weights in AdamW;
  family-table width mismatch (120 table vs. 73 input) fails loud;
  Mode G gate raises when closed; Muon ns_steps != 5 fails loud.
  The check caught one real defect during development (the
  play-call embedding table initially landed in the Muon group
  because its attribute name lacked "embedding") — fixed at the
  source (attribute renamed to `play_call_embedding`, partition
  rule broadened to `action_encoder` names) and re-verified.
- Torch-dependent shape check: NOT RUN (torch not installed here;
  no package installs in this pass). Deferred to a torch-bearing
  environment, random tensors only, no parameter updates, no real
  data — see §6.
- RESEARCH UPDATE 2026-10-27 re-verification (after the five
  III-C changes): `python3 -m py_compile model.py losses.py
  optim.py` → PASS, exit 0. Pure-Python logic check
  (`/tmp/moonshot_logic_check2.py`, no torch, no real data, no
  parameter updates): ALL_LOGIC_CHECKS_2_PASSED — bridge default
  OFF, control arm adamw-ema; timescale diagnostic pass / fail
  (slow below threshold) / fail (no separation); hierarchy gates
  L1 ok, L2 refused without diagnostic, L2 ok with diagnostic, L3
  refused without long-clip sufficiency, L3 ok with all gates,
  L4+ refused; rank kill at effective rank 3 / ok at 40 (dim 64);
  regularizer ablation grid (0, 0.5, 1, 2); conflict protocol
  none → uncertainty-or-famo → cagrad-or-pcgrad-conditional;
  FairGrad+Muon refused, Nash-MTL at K=2 refused, CAGrad/PCGrad
  allowed as conditional options; all prior checks still pass
  (prefix sums, prediction-first ordering, interference table,
  partition rule, width-mismatch and Mode G fail-louds).

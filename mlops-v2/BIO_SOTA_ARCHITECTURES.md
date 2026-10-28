# Bio-inspired SOTA update — novel architectures TO TEST (design only)

**Status: DESIGN ONLY — 2026-10-27. Test order APPROVED by the user
2026-10-27 20:17 CDT (in reply to "approve test order, or change it first").**
That approval covers the order and the test definitions below. It does
NOT lift the training gate, and it does NOT settle Panel Q1/Q2/Q3 (see
"Decisions still with the user"). No training run, no merge, no production
write, no bulk fetch is authorized by this document. The training gate is
still closed: these arms are ready to run, they are not running. A bio
name is never evidence; a number from a named, pre-registered test is.

**Sources, with their limits stated up front:**
- `research_notes/bio-inspired-adaptive-systems-20261027-0349/report.md` —
  index-level web research, NOT live-verified primaries, NOT tested on
  basketball data. Every threshold below is a proposed default to
  calibrate on this system's history, not a constant to import.
- `mlops-v2-drafts/PANEL_REVIEW.md` Addendum IV + IV-A — the panel's
  sorting (real mechanism / language / misleading poetry) and its tests
  T-A'–T-E'. Panel verdicts stand; this document does not reopen III-C
  gates (bridge as experimental arm, hierarchy earned level-by-level,
  Muon ablate vs AdamW+EMA, rank-collapse kill trigger, per-horizon
  location metrics).
- `lanes/09-unified-loss/UNIFIED_LOSS_DESIGN.md` — the joint model this
  updates: shared 17-family tower stem, Matryoshka SupCon head (twin
  space, widths 8/16/32/64), JEPA predictor head (Mode S season, Mode G
  game). Phase 1 separate baselines remain the entry condition.
- `PIPELINE_BUILD_REPORT.md` — verified base: 12,966 rows × 73 columns
  (mask mean 0.7890), expanding-window splits summing to 12,966, frozen
  test 491 rows. Width is still derived from the census, not picked here.

## What "SOTA" means here — operationally, not as a slogan

A candidate is SOTA for this program only if it beats, on the same
expanding-window folds + new-player slice + frozen test, **all three**:

1. The no-bio joint model (same stem, same heads, same optimizer
   control: AdamW + EMA).
2. The cheapest non-biological equivalent of that arm (plain reservoir
   replay, unweighted loss, plain PSI monitor, random search, raw x/y,
   uniform sampling — named per arm below).
3. The standing product floors: no regression on either head vs its
   separate Phase 1 baseline, twin-space stability floor (see §7),
   event-location error reported per horizon, and CPU latency/size
   reported alongside accuracy. A forecast win that collapses the twin
   space, or a smaller model that destroys one era, is not SOTA.

There is no external basketball player-season forecast benchmark cited
here to claim against. Do not import one without a verified, comparable
protocol. "SOTA" in this document means "best on our own gates," full stop.

## Base model the arms attach to (unchanged by this update)

- Primary objective: next-season overall stat prediction (14-d game
  vector), under expanding-window CV + new-player slice. Twins are the
  product surface and a floor constraint, not the primary objective.
- JEPA predictor head is primary; contrastive head is auxiliary.
  The bridge (JEPA target = contrastive embedding of the true next
  season; predictor output as an extra contrastive positive) stays an
  experimental arm, not the default — it has no published demo beating
  parallel heads at this scale.
- Optimizer: AdamW + EMA is the control. Muon (2D matrices only,
  AdamW fallback elsewhere) stays an ablate-vs-AdamW arm, not an
  adoption — the tabular-MLP evidence for it is a small gain at ~3x
  training time, not a free speed win.
- Sprite positions are animation, never training inputs. Trajectories
  do not exist at scale; the fine level stays event-location.

## The test arms — cheapest and most test-ready first

### Arm 1 — Structured pruning + importance protection (BAKE FIRST)
*Bio guide: synaptic pruning. Panel: unanimous real mechanism, T-C'.*

- **Change:** prune whole tower dimensions / embedding columns by
  forecast contribution + era-importance — never by magnitude alone
  (small-norm dimensions can carry rare-class signal, e.g. elite rim
  protectors). Follow with a short replay fine-tune, with an
  EWC-style Fisher-weighted penalty protecting consolidated weights.
  Structured only: smaller dense matrices speed CPU inference;
  unstructured sparsity does not, without sparse kernels.
- **Beats:** full model (no-bio) AND a randomly pruned model of the
  same sparsity (the cheap equivalent that rules out "pruning is just
  pruning").
- **Pass (proposed defaults, calibrate):** at 30% fewer parameters,
  next-season RMSE and event-location error degrade ≤1% AND CPU
  latency/size falls ≥25%. At 50%, degradation ≤3% or the level is
  rejected. Report per-era and per-role degradation, not just the
  average — a prune that helps on average but destroys a minority
  era/role fails.
- **Why first:** it is the only arm that can *reduce* cost while
  proving safety, and its test was complete before the bio research
  arrived. This is the CPU-first SOTA path: smaller and faster, not
  bigger.

### Arm 2 — Precision-weighted JEPA error (predictive coding, refined)
*Bio guide: predictive coding / free-energy. Panel: real only as IWM
conditioning + this weight, under T-A'.*

- **Change:** weight the JEPA loss per tower/sample by estimated
  reliability (inverse variance from training seasons only):
  down-weight low-minute, noisy-tracking, high-variance
  player-seasons; up-weight stable high-minute ones. Log mean JEPA
  error and contrastive loss separately per tower on every new
  season, so a rising tower localises the break (ageing vs league
  style change vs tracking change).
- **Beats:** identical unweighted model (no-bio = cheap equivalent
  here).
- **Pass (T-A'):** ≥2% relative gain on next-season stat RMSE AND
  event-location error worsens ≤1%, averaged over ≥3 rolling origins
  (train ≤T / validate T+1 / test T+2). A win on validation only fails.
- **Explicitly NOT this arm:** replacing backprop with a full
  predictive-coding network (iterative per-sample inference multiplies
  CPU cost for at-best backprop-equivalent gradients), and active
  inference (this system observes; it does not act, and "predict what
  it prefers" would bias forecasts toward preferred outcomes).
  Caution carried: surprise ≠ importance — a breakout rookie is
  high-surprise signal; a tracking glitch is high-surprise noise.

### Arm 3 — Multi-scale positional encoding for event location
*Bio guide: morphogenesis, salvage only. Panel + research: literal
NCA growth and Turing periodicity are REJECTED.*

- **Change:** give the event tower explicit multi-scale court
  coordinates — continuous x/y, distance-to-rim and angle bands,
  zone one-hots, learned zone embeddings. That is Wolpert's
  positional information in its useful form.
- **Beats:** raw (x, y) only (cheap equivalent), then — only if that
  wins — a neighbour-diffusion layer over zones (1–2 steps) must beat
  the positional model itself.
- **Pass (proposed defaults):** positional beats raw x/y by >2%
  relative on held-out event-location error across ≥3 rolling
  origins; any diffusion layer must then beat positional by >1% to
  justify its complexity. Court geometry is rule-defined (rim, lines,
  shot clock), not self-organised — no periodicity prior is imposed.
- **NOT this arm:** growing the architecture from a seed by local
  rules, or regrowing weights after damage (checkpoint recovery
  already covers that).

### Arm 4 — Offline interleaved replay + consolidation (the "sleep" arm)
*Bio guide: sleep / hippocampal replay. Panel: split, test decides;
research sharpens it into a runnable protocol, T-B'.*

- **Change:** after fitting a new season, run a short low-LR phase
  on a 50/50 mix — new season + reservoir-sampled old player-seasons
  (buffer ~2,000, stored as embeddings + targets to stay CPU-cheap),
  stratified by era/role/age band, sampled with probability
  proportional to current JEPA error or forgetting (drop in per-era
  validation since last consolidation) — NOT uniform. A "downscaling"
  pass (global weight decay / renormalisation, then re-gate) may be
  tested inside the same arm.
- **Beats:** naive fine-tune on the new season only (no-bio) AND a
  uniform-mix control of equal size/compute (cheap equivalent — if
  it only matches uniform mix, the benefit is rehearsal, not
  prioritisation/interleaving, and the bio story adds nothing).
- **Pass (T-B', all three required):** (i) backward-transfer
  degradation on seasons ≤T cut by ≥50% vs naive; (ii) match or beat
  naive on the newest season; (iii) beat uniform mix on backward
  transfer. Cost gate: consolidation ≤20% of season-update compute,
  or it fails as a CPU-first design even if it helps accuracy.
- **Guards:** replay must weight HARD transitions (role changes,
  breakouts), not just the easy bulk; it must not entrench old eras
  (pre-3-point basketball rehearsed as if current); and a replay pass
  that bypasses fold gates is leakage, not consolidation — it never
  runs ungated, unowned, or unmonitored.
- **Sequencing note:** this arm is more expensive than Arms 1–3 and
  its panel split is about evidence, not enthusiasm. Running it is
  the cheapest way to settle the split — but it runs after the
  cheap arms, not instead of them.

### Arm 5 — Multi-detector drift gate with co-stimulation (immune salvage)
*Bio guide: immune adaptation. Panel IV-A: upgraded from language to
specified conditional mechanism, T-D'. Literal negative selection
stays REJECTED.*

- **Change:** define "self" as a ROLLING per-era reference (never a
  fixed 1990s self — that would flag modern basketball as foreign).
  One detector per tower and per era cluster over the frozen tower
  space (Mahalanobis / k-NN distance + JEPA error jointly), plus an
  exemplar memory of rare-but-legitimate patterns (historic outlier
  seasons, rule-change seasons) recognised as "known non-typical self"
  so they are not flagged on every recurrence. A flag escalates to a
  gate failure only if two independent signals agree (feature drift
  AND error rise) — danger/context gating, which cuts false alarms.
- **Beats:** single-threshold PSI monitor AND frozen-embedding k-NN
  baseline (both cheap equivalents; matching k-NN means dropping the
  immune framing and shipping k-NN).
- **Pass (T-D'):** on ≥20 injected-drift episodes (simulated pace/3PA
  shift; tracking/schema corruption; a held-out legitimate breakout
  season), ≥90% of injected corruptions flagged before the gate, at a
  LOWER false-alarm rate on legitimate outliers than both controls.
- **NOT this arm:** literal random-detector negative selection
  (scales poorly with dimension, leaves "holes," and a fixed self-set
  fails under concept drift), or clonal selection as a training
  algorithm (it must beat random search at equal evaluations to earn
  any role, and none is proposed here).

### Arm 6 — Two-threshold gate wiring with context bands (allostasis salvage)
*Bio guide: homeostasis / allostasis. Panel IV-A: specified gate
design, T-E'. Literal homeostasis-as-freeze stays REJECTED.*

- **Change (wiring, not a new model):** WARNING threshold → start a
  consolidation/replay pass and widen intervals, WITHOUT blocking
  promotion. ALARM threshold → block promotion, require retraining,
  log the cause. Setpoints are context-adjusted: per-era/per-role
  expected JEPA error bands from history (rookies and traded players
  legitimately carry higher error), so a flag is a deviation from the
  context-appropriate band, not from a global mean. One intervention
  budget: at most one pre-emptive reweighting per season (proposed
  default), logged — unbounded anticipatory adjustment becomes a
  source of drift itself.
- **Beats:** fixed-threshold gate only (cheap equivalent).
- **Pass (T-E', retrospective over the 30 seasons in order, no future
  labels before deciding):** (i) gate failures (promoted models
  degrading >X% next season) cut by ≥30% relative; (ii) false blocks
  (blocked models that would have passed) up by ≤10%; (iii) budget
  respected. Fewer failures achieved only by blocking more fails (ii)
  — that is conservatism, not prediction.
- **PSI cutoffs are conventional practice, not law** (warning ~0.10–
  0.25, alarm >0.25 are starting points to calibrate on this system's
  history). Exogenous shocks (rule change, lockout, tracking-vendor
  change) cannot be anticipated from player data — a controller that
  "anticipates" them from noise over-adjusts.

### Arm 7 — EWMA error-weighted sampling (swarm salvage only)
*Bio guide: swarm / stigmergy. Panel + research: literal swarm is the
most misleading import; only this fragment survives, named as EWMA.*

- **Change:** maintain per-zone error with decay λ; sample training
  batches with probability ∝ (1 + α · zone error).
- **Beats:** uniform sampling AND static inverse-frequency sampling
  (no decay) — both cheap equivalents.
- **Pass (proposed default):** >1% relative gain on held-out
  next-season event-location error vs both controls, WITHOUT
  degrading zones whose error has already decayed (it must adapt,
  not chase last season's hot zones).
- **NOT this arm:** player-agents depositing pheromone on court zones,
  or any multi-agent simulation. There is no swarm here — one central
  model, no autonomous agents, no communication constraint that
  decentralisation would solve. ACO-style positive feedback locks
  onto early hot zones in a non-stationary league.

### Arm 8 — Bounded evolution over discrete choices only (last, if budget allows)
*Bio guide: evolution. Panel + research: gradient-free niche only.*

- **Change:** CMA-ES / small genetic search over ≤~30 hyperparameters
  and discrete choices — tower widths/depths, embedding dimension,
  JEPA predictor depth, replay mix ratio, pruning level, drift
  thresholds — with fitness = the temporal gate score, NOT training
  loss. Population ~16–32, ~10–20 generations, ~300-run budget
  (proposed). Keep the population diverse across families (JEPA-heavy,
  contrastive-heavy, small-tower) rather than collapsing to the first
  good config.
- **Beats:** random search over the same space and budget (the honest
  null), and ideally Bayesian optimisation as a stronger control.
- **Pass:** best held-out next-season gate score beats random search
  by more than run noise (>1 standard error across ≥3 seeds) AND
  re-validates on a later season not used for selection. If it only
  wins on the selection season, it overfit the search. Cost rule: if
  the search costs >5× a single training run for <1% gain, it fails
  as a CPU-first choice even if it "wins."
- **NEVER this arm:** evolving tower weights or embeddings. Backprop
  owns the differentiable objective; "evolution found it" must never
  obscure that the engineer chose the fitness function.

### Optional, lowest priority — early-plasticity schedule (curriculum)
*Bio guide: critical periods, weakened to its legitimate form.*

- **Change:** train the shared backbone early at high LR on all
  seasons, then freeze or slow it (EWC penalty) and adapt only the
  season-specific heads/predictor. Test against the standard schedule
  on the same gates. Literal critical periods (irreversible
  deprivation effects) are rejected — there is no reason to
  deliberately "deprive" a model early, and curriculum benefits must
  be shown, not assumed from biology.

## What is deliberately NOT in this update

- No "sleep phase," "homeostatic controller," "immune system service,"
  or any component justified only by a bio name. Every component
  needs an owner, an SLO, a rollback, and a passing test.
- No causal copy from bio-named machinery on story surfaces or coach
  mode ("the model remembers," "homeostasis preserved his identity").
  Predictions stay labelled as predictions; attributions stay
  associational. Biology produces causal-sounding stories about
  correlational systems — that is the opposite of what attribution
  discipline needs.
- No twin-space freeze, and no penalising a player for actually
  changing. Legitimate career change is signal; the stability band
  must allow it.
- No hierarchy, Muon, bridge, or trajectory claim reopened by analogy.
  Hierarchy is earned level-by-level after the rung-1 next-shot demo;
  the bridge stays experimental; trajectories stay at zero until a
  source is found.
- No bio language in public/product copy until the user settles
  Panel Q3 — default is internal-docs-and-teaching only.

## Test order and promotion rule

1. Arm 1 (pruning) — cheapest, test-ready, cost-reducing.
2. Arms 2, 3, 7 — cheap loss/feature/sampling changes, each with one
   clean control.
3. Arm 4 (replay) — the panel-split decider, with wall-clock attached.
4. Arms 5, 6 — gate wiring; they do not improve the model, they
   decide what ships. Test retrospectively before they gate anything.
5. Arm 8 (evolution) — only if the search budget is justified by the
   gains from Arms 1–4, and only over discrete choices.

**Promotion:** an arm ships only if it passes its named test on
basketball data, beats both its baselines, and does not regress any
floor. A failed arm is dropped with its number recorded — a failed
bio arm is a result, not a reason to re-describe it in friendlier
words and try again under a new name.

## Decisions still with the user (not settled by this update)

- **Panel Q1:** does consolidation graduate to a named training phase
  (run the Arm 4 arm), or stay as the existing refit/refresh cadence?
  Panel default if unanswered: run the arm — T-B' now exists to run.
- **Panel Q2:** what numeric twin-stability floor does T-E enforce
  (panel default: neighbour-overlap ≥ 0.80), and is it a hard gate
  (block release) or a warning? Also: accept, amend, or reject the
  Arm 6 two-threshold design and its one-intervention-per-season
  budget? Until this is set, no shared-stem update ships.
- **Panel Q3:** may bio language appear in public/product copy, or
  internal only? Default: internal only.
- **Training gate itself:** none of the above authorises a training
  run. Lifting the gate is a separate word from the user, after the
  test order above is approved.

## Verdict in one paragraph

This is not eight new architectures. It is one joint model — shared
tower stem, Matryoshka twin head, JEPA forecast head — with eight
disciplined test arms, of which one (pruning) is ready to bake, four
(precision weighting, positional encoding, EWMA sampling, replay) are
specified experiments, two (drift gate, two-threshold wiring) are gate
improvements rather than model improvements, and one (bounded
evolution) is a search method of last resort. The SOTA claim, if it
comes, will be earned arm by arm on expanding-window forecasts, the
new-player slice, and the frozen test — with the twin floor, per-era
reporting, and CPU cost attached to every number.

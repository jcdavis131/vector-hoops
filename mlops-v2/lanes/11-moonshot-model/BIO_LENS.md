# BIO_LENS — Bio-Inspired Design Lens Appendix (Lane 11)

> **DRAFT APPENDIX — DESIGN INPUT ONLY, NOT A REWRITE ORDER, NOT A
> NEW MODEL.** Nothing in this file restructures the split-head
> design, changes the loss / optimizer / conflict work, or adopts
> anything on metaphor. No mechanism here is baked into any spec by
> this appendix. All prior gates stand: drafts only, no training,
> no merges, no production writes.

> **CAVEATS — ON EVERY PAGE OF THIS APPENDIX.** Sources are
> INDEX-LEVEL (not live-verified); NOTHING here was tested on
> basketball data — all benefits are hypotheses until the stated
> tests run; thresholds are PROPOSED DEFAULTS to calibrate, not
> constants; transfer numbers are secondary-summary indicative,
> not re-verified. Research moves priors, gates decide.

> **SOURCES.** Contract §14 (candidate table, user 2026-10-26
> 22:49 CDT) and §14.1 (rankings + tests recorded, bio research
> landed 2026-10-27); deep-research report
> `research_notes/bio-inspired-adaptive-systems-20261027-0349/report.md`
> (§ numbers cited below). The second bio follow-up SUPERSEDES the
> first follow-up's "candidate table only" framing: this appendix
> is grounded in the landed report's ranked tests. Where the two
> briefs differ, the landed report + §14.1 govern.

## 0. Entry rule, classifications, and what "kill" means — DRAFT

> **CAVEATS — see the banner above: index-level sources, nothing
> tested on basketball data, thresholds are proposed defaults.**

**Entry rule (binding, §14.1).** A mechanism enters a spec ONLY by
passing its exact test below AND beating BOTH (i) the no-change
baseline and (ii) the cheapest non-biological equivalent, on the
held-out next-season gate under the embargoed expanding-window
folds (contract §2a / §9 P1) — the same gate discipline as every
other lane. Validation-only improvement fails. A mechanism that
cannot state a test is marked DOES-NOT-ENTER-SPEC, not hand-waved.

**Classifications (this lane STATES them; Panel Round 3, Addendum
IV, JUDGES bake / keep-as-naming / reject — this appendix does not
pre-judge).** MECHANISM = testable, bakeable if it passes its test.
LANGUAGE = useful naming for an existing gate, no new claim.
POETRY = metaphor only, reject. A mapping can split: its
salvageable fragment may be a MECHANISM while its literal reading
is POETRY — the two verdicts are stated separately, never blurred.

**"Kill" means:** the stated pass rule fails on the held-out gate,
and the mechanism (or fragment) is dropped from spec consideration
— not retuned until it passes, not kept as naming unless it earns
LANGUAGE on its own merits, and never promoted on validation folds
alone. Every test below names its control, its held-out metric,
and its kill result.

**Leakage rule (applies to every mechanism).** Replay, buffers,
exemplar memories, and reference windows use TRAIN-FOLD data only.
Replaying, buffering, or calibrating on val/test data is leakage
and fails loud — a mechanism that "passes" by touching held-out
data has not passed.

## 1. Offline interleaved replay / consolidation — RANK 1 — DRAFT

> **CAVEATS — see the banner above: index-level sources, nothing
> tested on basketball data, thresholds are proposed defaults.**

**Classification (stated; panel judges): MECHANISM.** What it would
change if adopted: between seasons, the model runs an offline
consolidation phase — a short, low-learning-rate pass on 50% new
season + 50% reservoir-sampled old player-seasons, stratified by
era, position/role, and age band, with the buffer holding
embeddings + targets (not raw tracking, to stay CPU-cheap),
prioritised by JEPA error / forgetting (drop in per-era validation
performance since last consolidation); this is the §14 "sleep +
hippocampal replay" mapping made operational, and the "sleep"
framing itself is poetry — the buffer + interleaving + protection
is the engineering. **Exact test (report §2; §14.1):**
sequential-season protocol, adding seasons T+1, T+2, T+3 one at a
time from a model trained to season T, with Arm 1 = naive fine-tune
on the new season only (no-change baseline), Arm 2 = fine-tune +
offline interleaved replay (fixed buffer, e.g. 2,000
player-seasons, reservoir), Arm 3 = fine-tune + uniform random
old-season mix of the same size/compute (cheapest non-biological
equivalent); **pass requires ALL of:** (a) backward-transfer loss
(degradation on seasons ≤ T vs. the pre-update model) down ≥50%
vs. Arm 1, (b) newest season matched or beaten vs. Arm 1, (c) Arm 3
beaten on backward transfer, and (d) consolidation cost ≤20% of
season-update compute — **what kills it:** any leg fails, or the
cost leg fails (it then fails as a CPU-first design even if it
helps accuracy), or Arm 2 only matches Arm 3 (the benefit is then
"rehearsal", not prioritised interleaving, and the biological
story adds nothing); replaying val/test seasons in the buffer is
leakage and fails loud, not a test result.

## 2. Precision-weighted predictive error — RANK 2 — DRAFT

> **CAVEATS — see the banner above: index-level sources, nothing
> tested on basketball data, thresholds are proposed defaults.**

**Classification (stated; panel judges): MECHANISM.** What it would
change if adopted: the JEPA prediction loss is weighted per
tower/sample by estimated reliability — inverse-variance precision
weights estimated from TRAINING SEASONS ONLY (down-weighting
low-minute, noisy-tracking, or high-aleatoric-variance
player-seasons; up-weighting stable, high-minute seasons) — plus
per-tower JEPA error logged as the evaluation gate, so a rising
tower localises the break (player ageing vs. league-wide style
change vs. tracking change); this is the §14 "predictive coding /
free-energy → JEPA predictor + surprise-driven learning" mapping,
and JEPA itself is already the practical descendant of predictive
coding, so this refines the chosen architecture rather than adding
one. **Exact test (report §1, §5; §14.1):** temporal split
(seasons ≤ T train / T+1 validation / T+2 test), Variant A =
inverse-variance precision-weighted JEPA loss vs. Variant B =
identical model, unweighted loss (which is simultaneously the
no-change baseline and the cheapest non-biological equivalent —
uniform weighting — so the two-comparator rule collapses to the
one control here, stated openly rather than padded with a second
control that is the same thing); **pass requires ALL of:** ≥2%
relative next-season stat RMSE improvement AND event-location
error worsened by ≤1%, on the HELD-OUT TEST season, averaged over
≥3 rolling origins (T, T+1, T+2) — **what kills it:** either leg
fails, or the gain appears on the validation season only
(validation-only improvement fails by rule), or the precision
estimate is shown to be wrong in the dangerous direction
(confidently ignoring real change, e.g. a breakout rookie season
treated as noise — surprise ≠ importance, and a wrong precision
estimate is a kill, not a tuning note).

## 3. Structured pruning + EWC protection — RANK 3 — DRAFT

> **CAVEATS — see the banner above: index-level sources, nothing
> tested on basketball data, thresholds are proposed defaults.**

**Classification (stated; panel judges): MECHANISM.** What it would
change if adopted: whole tower dimensions, heads, or embedding
columns with low Fisher/magnitude importance are pruned — WHOLE
structures only, NEVER unstructured sparsity (it does not speed CPU
inference without sparse kernels) — followed by a short replay
fine-tune (§1 above), with EWC-style Fisher-weighted protection of
consolidated weights so pruning/retraining does not destroy
consolidated knowledge; pruning is by era-importance, not global
magnitude alone (a dimension that mattered in the 1990s but not
today is pruned only if it does not help the recent gate, and
rare-but-decisive dimensions, e.g. one separating elite rim
protectors, are never pruned merely for being small); this is the
§14 "synaptic pruning → tower/feature pruning by forecast lift"
mapping, with the §14 per-tower forecast-lift rule as its
companion (a tower is pruned only if its lift is ≤ 0 within the
bootstrap interval). **Exact test (report §3; §14.1):** take the
gated champion model, iterative structured pruning to 30% and 50%
fewer parameters, each followed by short replay fine-tune,
evaluated on the same temporal gates as §2 above, against the
unpruned model (no-change baseline) and a randomly pruned model of
identical sparsity (cheapest non-biological equivalent for any
"winning ticket" claim); **pass requires:** at 30% reduction,
next-season stat RMSE and event-location error degrade by ≤1%
relative AND CPU inference latency / model size falls by ≥25%;
at 50%, degradation ≤3% or that level is rejected; per-era
degradation reported — **what kills it:** either threshold fails,
or an average win hides minority-era/role destruction (average win
+ minority-era destruction = fail), or an iterative-pruning
"ticket" claim fails to beat the randomly pruned control (then it
is just pruning, not a ticket, and the ticket language is dropped).

## 4. Two-threshold homeostatic gate — CLOSE 4TH — DRAFT

> **CAVEATS — see the banner above: index-level sources, nothing
> tested on basketball data, thresholds are proposed defaults.**

**Classification (stated; panel judges): MECHANISM.** What it would
change if adopted: the existing gate wiring gains two stages —
WARNING (proposed defaults: PSI 0.10–0.25, or an ADWIN warning on
JEPA error) → automatically start a consolidation/replay pass and
widen prediction intervals, but do NOT block promotion; ALARM
(proposed defaults: PSI > 0.25, or DDM drift on the labelled
next-season gate) → block promotion, require retraining, log the
cause — with setpoints CONTEXT-ADJUSTED per era/role from history
(rookies and traded players legitimately carry higher error; a
veteran-heavy season should not), and an intervention budget
capped (e.g. at most one pre-emptive reweighting per season, with a
logged reason), because unbounded anticipatory adjustment becomes
a source of drift itself; this is the §14 "homeostasis / allostasis
→ predictive recalibration BEFORE a gate breach" mapping, and it
touches the Lane 6 drift monitor and recalibration checklist —
**this appendix notes that interface and does NOT redesign it**
(Lane 6 owns the monitor; any gate change lands there, not here).
**Exact test (report §5; §14.1):** retrospective simulation over
the 30 seasons, Controller A = fixed-threshold gate only (promote
unless alarm) vs. Controller B = two-threshold warning→consolidate
+ context-adjusted bands, both seeing seasons in order with NO
future season's labels before deciding; **pass requires ALL of:**
(a) gate failures (promoted models that then degrade > X% on the
next season, X pre-registered) down ≥30% relative to A, (b) false
blocks (blocked models that would have passed) up ≤10%, and (c)
within the pre-set intervention budget — **what kills it:** any
leg fails, or B wins (a) only by blocking more (fewer failures
through conservatism fails (b) and is not prediction), or
predictive recalibration MASKS real drift (masked drift = failure,
not a win, per §14); PSI cutoffs are conventional practice, not
law, and must be calibrated on this system's own history, not
imported as constants.

## 5. Immune multi-detector + co-stimulation OOD — SALVAGE — DRAFT

> **CAVEATS — see the banner above: index-level sources, nothing
> tested on basketball data, thresholds are proposed defaults.**

**Classification (stated; panel judges): MECHANISM for the
salvageable fragment; POETRY for literal negative selection
(DOES-NOT-ENTER-SPEC, below). CORRECTION RECORDED (§14.1): immune
(and homeostasis, §4 above) are NOT just naming — the
multi-detector gate and the two-threshold gate are defensible,
testable mechanisms, and the earlier chat dismissal of them as mere
naming was too strong.** What the fragment would change if adopted:
drift/anomaly detection as a "self" model — "self" defined as the
distribution of tower embeddings + JEPA errors on the gated
reference seasons — with DIVERSE detectors (one per tower, one per
era cluster) rather than a single global threshold, and
CO-STIMULATION: a flag escalates to a gate failure ONLY if two
independent signals agree (e.g. feature drift + error rise),
mimicking danger/context gating and cutting false alarms; plus a
small exemplar memory of rare-but-legitimate patterns (historic
outlier seasons, rule-change seasons) recognised as "known
non-typical self" on recurrence rather than flagged as anomalies
every time; this touches the Lane 6 drift monitor — interface
noted, not redesigned. **Exact test (report §4; §14.1):** inject
known drift scenarios into held-out data — (a) simulated rule/pace
shift (scale pace/3PA features), (b) tracking/schema corruption
(swap or scale event coordinates), (c) a genuine but legitimate
outlier (a historic breakout season held out) — comparing (i)
single-threshold PSI monitor, (ii) multi-detector +
co-stimulation monitor, (iii) frozen-embedding k-NN OOD baseline
(the cheapest non-biological equivalent); **pass requires:** (ii)
flags ≥90% of injected corruptions BEFORE the gate, at a LOWER
false-alarm rate on legitimate outliers than BOTH (i) and (iii),
on ≥20 injected episodes — **what kills it:** (ii) only matches
(iii) (then drop the immune framing and ship (iii)), or its
false-alarm rate on legitimate outliers is not lower than both
controls. **Literal immune negative selection:
DOES-NOT-ENTER-SPEC** — random detectors generated and discarded
against a fixed "self" set: a fixed self in a league whose normal
changes every era flags modern basketball as foreign, random
detectors scale poorly in embedding space, and uncovered "holes"
are a known NSA failure mode; no literal-NSA test is proposed
because it would test a metaphor, not a mechanism.

## 6. Evolution, confined to its gradient-free niche — DRAFT

> **CAVEATS — see the banner above: index-level sources, nothing
> tested on basketball data, thresholds are proposed defaults.**

**Classification (stated; panel judges): MECHANISM in its niche
only; POETRY outside it (DOES-NOT-ENTER-SPEC, below).** What it
would change if adopted: a CMA-ES / small genetic search over
≤~30 hyperparameters and discrete choices ONLY — tower
widths/depths, embedding dimension, JEPA predictor depth, replay
mix ratio, pruning level, drift thresholds — with population
16–32, generations 10–20, fitness = the TEMPORAL gate score
(next-season performance, never training loss), and diversity
maintained across families (one JEPA-heavy, one
contrastive-heavy, one small-tower variant) rather than collapsing
to the first good config; this is the §14 "evolution →
hill-climb variant loop under held-out gates" mapping, with the
§14 loop rules intact (a variant survives only on a held-out win
under the existing gate; the selection rule is stated in advance;
no variant is promoted on validation folds alone). **Exact test
(report §6; §14.1):** fixed evaluation budget (e.g. 300 short
training runs), Arm 1 = CMA-ES / genetic search vs. Arm 2 = random
search over the same space and budget (the honest null for any
population method; Bayesian optimisation, if available, is a
stronger non-biological control and should also be beaten or the
claim is weakened); **pass requires ALL of:** Arm 1's best
HELD-OUT next-season gate score beats Arm 2's best by >1 standard
error across ≥3 seeds, the winning config re-validates on a LATER
season not used for selection, and the search costs ≤5× a single
training run per <1% gain — **what kills it:** beating random
search on the selection season only (that is overfitting the
search, not evolving a better model), failing re-validation,
failing the cost rule, or evolving WEIGHTS/embeddings at all:
**weights are NEVER evolved** — backprop owns the differentiable
objective, and "evolve the world model" as a general training
strategy for this differentiable, CPU-limited system is
DOES-NOT-ENTER-SPEC, as is calling ordinary model selection /
ensembling "evolution" (selection without heritable variation over
generations is just search).

## 7. Critical periods → curriculum gated on the timescale diagnostic — DRAFT

> **CAVEATS — see the banner above: index-level sources, nothing
> tested on basketball data, thresholds are proposed defaults.**

**Classification (stated; panel judges): MECHANISM (testable
candidate) — with a weaker prior than §§1–4, because it is NOT in
the landed report's ranked list; its test below is stated from
§14, not from the landed report, and it enters a spec only by
passing that test under the §0 entry rule.** What it would change
if adopted: training becomes a curriculum — coarse/invariant
structure first (shared backbone, high learning rate, all seasons),
fine detail only after the III-C timescale diagnostic passes
(slow variables predictable over a long stride while fast ones are
not), with the fine-detail stage then adapting season-specific
heads/predictor under EWC-style protection of the consolidated
backbone ("early plasticity, late stability" made operational);
the fine stage is gated on the DIAGNOSTIC, never on a schedule.
**Exact test (§14 item 7, stated here):** curriculum-trained model
vs. simultaneous-training control (same model, same data, same
compute, no staging) on the held-out embargoed folds, on forecast
MAE/R² AND the twin floor; **pass requires:** the curriculum model
beats the simultaneous control on held-out forecast beyond the
bootstrap interval with no twin-floor regression, AND the fine
stage opened only after a passed timescale diagnostic —
**what kills it:** no held-out win, any twin-floor regression, or
a fine stage opened on a schedule / failed diagnostic (that run is
invalid, not a curriculum result). **Literal critical periods:
POETRY / DOES-NOT-ENTER-SPEC** — biology's irreversible
deprivation effects (e.g. monocular deprivation) have no analogue
worth importing: there is no reason to deliberately "deprive" a
model early, and curriculum learning (the legitimate, weaker
analogue) must show its benefit, not inherit it from the existence
of critical periods; Hebbian learning as a backprop replacement is
likewise DOES-NOT-ENTER-SPEC (unstable without normalisation/
homeostasis, and not proposed anywhere in this appendix).

## 8. Swarm / stigmergy — SPLIT VERDICT — DRAFT

> **CAVEATS — see the banner above: index-level sources, nothing
> tested on basketball data, thresholds are proposed defaults.**

**Classification (stated; panel judges): LANGUAGE for the
agent-system reading; MECHANISM-candidate for the EWMA fragment
only; POETRY for literal swarm (DOES-NOT-ENTER-SPEC, below).**
(a) Agent-system reading (§14 item 8): swarm/stigmergy describes
the EXISTING tiered agent lanes coordinated through shared timeline
signals — this is about the AGENT SYSTEM, not the model, and it
does NOT enter any model spec; its only test is a process metric
(timeline-signal coordination reduces duplicate work and
cross-lane conflicts vs. uncoordinated execution), and as LANGUAGE
it claims no model improvement. (b) Model-side salvageable
fragment ONLY (report §7): a shared, decaying "pheromone" table is
an exponentially weighted moving average (EWMA) with evaporation =
decay — a per-zone error table that accumulates where recent
events were mispredicted, decays over time, and up-weights
training on those zones — proposed and tested AS EWMA SAMPLING,
not as a swarm: **exact test:** EWMA zone-error weighting (sample
probability ∝ 1 + α·zone error, decay λ) vs. (a) uniform sampling
and (b) static inverse-frequency sampling (no decay), on held-out
next-season event-location error; **pass requires:** EWMA beats
BOTH controls by >1% relative AND does not degrade performance on
zones whose error has already decayed (it must adapt, not just
chase the last season's hot zones) — **what kills it:** matching
static weighting only (decay added nothing, and the
stigmergy/evaporation story is rejected) or degrading decayed
zones. **Literal swarm: DOES-NOT-ENTER-SPEC** — no player-agent
pheromone simulation on court zones (the event-location task
already has a direct supervised/JEPA signal; an indirect
pheromone intermediary adds deposit/evaporation/visibility
parameters with no new information, and ACO positive feedback
locks onto early, possibly spurious hot zones in a non-stationary
league); no ACO/PSO test is proposed for this model, because there
is no discrete tour/routing problem and no gradient-free
continuous problem PSO would solve better than §6's controls; and
there is no swarm here at all (a single centrally trained model,
not autonomous agents with communication constraints) — swarm
benefits (robustness to individual failure, no single point of
failure) solve problems this system does not have.

## 9. Morphogenesis / NCA → positional encoding ONLY — DRAFT

> **CAVEATS — see the banner above: index-level sources, nothing
> tested on basketball data, thresholds are proposed defaults.**

**Classification (stated; panel judges): MECHANISM for the
positional-encoding fragment; POETRY for literal morphogenesis
(DOES-NOT-ENTER-SPEC, below).** What the fragment would change if
adopted: the event-location tower receives explicit, multi-scale
court coordinates — continuous (x, y), distance to basket/rim,
angle, zone one-hots, and a learned embedding of zone — letting
the JEPA predictor learn spatial structure from data; this is
Wolpert's positional information (a location knows "where" it is
from a signal and behaves accordingly) in its useful form:
thresholds on a gradient (distance bands) + learned boundaries,
at no extra architectural cost, and it is already standard
practice — which is precisely why it is a fragment, not a
discovery. **Exact test (report §8):** Variant A = event tower
with raw (x, y) only (no-change baseline) vs. Variant B = A +
multi-scale positional features (distance/angle bands + learned
zone embeddings) vs. Variant C (only if B wins) = B + a local
neighbour-diffusion layer over court zones (1–2 steps, the
NCA-flavoured step); **pass requires:** B beats A on held-out
event-location error (mean distance error and/or zone accuracy)
by >2% relative across ≥3 rolling origins, and C then beats B by
>1% to justify its extra complexity and training instability —
**what kills it:** B failing to beat A (positional encoding adds
nothing here), or C failing to beat B (the developmental /
local-growth story is rejected for this task). **Literal
morphogenesis: DOES-NOT-ENTER-SPEC** — no developmental
architecture growth from a seed tower by local rules (unstable,
hard to gate — what is the "adult" form, when is growth complete? —
and CPU-expensive through unrolled dynamics, for a problem whose
architecture is already fixed and small); no Turing periodicity
prior on a rule-defined court (court geometry is imposed by rules
— lines, rim position — not self-organised, and a periodicity
prior would impose regular spacing shot locations do not contain);
no NCA "regeneration" (a dropped tower or corrupted weights is
fixed by reloading a checkpoint, not by regrowing weights from
neighbours — robustness is tested by checkpoint recovery and gate
rollback, and any Turing/reaction–diffusion pattern claim about
basketball event locations is UNVERIFIED and not made here).

## 10. DO NOT PROPOSE — DRAFT

> **CAVEATS — see the banner above: index-level sources, nothing
> tested on basketball data, thresholds are proposed defaults.**

The following are excluded from this appendix's candidate set, by
the landed report and §14.1, and must not re-enter a spec through
renaming: (1) backprop replacement by predictive-coding networks
(iterative inference per sample multiplies CPU cost for, at best,
backprop-equivalent gradients; the energy-efficiency claim is
UNVERIFIED); (2) active inference (act to make input match
prediction) — this system observes, it does not act on the court,
and preferred outcomes must never bias forecasts toward what is
preferred rather than what is probable; (3) literal immune
negative selection (§5), literal swarm / player-agent pheromone
simulation (§8), literal morphogenesis / developmental growth /
Turing periodicity (§9); (4) Hebbian learning as a backprop
replacement (§7); (5) evolving weights/embeddings (§6); (6) ANY
proposal that cannot be written as a loss, a weight, or a gate —
"the brain minimises free energy, therefore…" without a concrete
loss is poetry, not a mechanism, and any proposal that cannot
state a falsifiable test DOES-NOT-ENTER-SPEC by rule (§0).

## 11. Summary table — DRAFT

> **CAVEATS — see the banner above: index-level sources, nothing
> tested on basketball data, thresholds are proposed defaults.**

| # | Mapping (contract §14) | Classification stated (panel judges) | Pass rule in one line |
|---|---|---|---|
| 1 | Offline interleaved replay / consolidation | MECHANISM (rank 1) | Backward-transfer loss −≥50% vs naive fine-tune + newest matched/beaten + uniform-mix beaten + cost ≤20% |
| 2 | Precision-weighted predictive error + per-tower gate | MECHANISM (rank 2) | Stat RMSE −≥2% relative AND event-location worsened ≤1%, held-out TEST season, ≥3 rolling origins |
| 3 | Structured pruning + EWC protection | MECHANISM (rank 3) | 30% cut → ≤1% degradation + ≥25% latency/size cut; 50% → ≤3% or rejected; per-era reported |
| 4 | Two-threshold homeostatic gate | MECHANISM (close 4th) | Gate failures −≥30% AND false blocks +≤10% AND within budget, retrospective, no future labels |
| 5 | Immune multi-detector + co-stimulation OOD | MECHANISM (fragment); POETRY (literal NSA, excluded) | ≥90% injected corruptions flagged pre-gate, lower false alarm than PSI AND k-NN, ≥20 episodes |
| 6 | Evolution, gradient-free niche only | MECHANISM (niche only); POETRY outside it | Beat random search >1 SE, ≥3 seeds + re-validate later season + cost ≤5× per <1% gain; weights never evolved |
| 7 | Critical periods → diagnostic-gated curriculum | MECHANISM (candidate, unranked in landed report) | Beat simultaneous control on held-out forecast, no twin-floor regression, fine stage only after passed diagnostic |
| 8 | Swarm / stigmergy | LANGUAGE (agent coordination); MECHANISM-candidate (EWMA fragment); POETRY (literal swarm, excluded) | EWMA beats uniform AND static inverse-frequency >1% on held-out event-location error, decayed zones not degraded |
| 9 | Morphogenesis / NCA → positional encoding only | MECHANISM (fragment); POETRY (literal morphogenesis, excluded) | B beats raw-(x,y) >2% (≥3 origins); C beats B >1% or rejected |

Nothing in this table is adopted. Each row enters a spec only by
passing its test under the §0 entry rule, and Panel Round 3
(Addendum IV) judges bake / keep-as-naming / reject per mapping.

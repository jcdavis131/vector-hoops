# Lane 9 — Phase 2 Unified-Loss Design (DESIGN ONLY)

**Status:** DESIGN ONLY. No training runs, no GPU, no package installs,
no repo writes, no prod writes, no merge. The joint model is NOT built,
trained, or evaluated in this pass. Every number below that is not
copied from Contract §0/§2 or from a Lane 4 / Lane 8 baseline is
labeled PROPOSED (a design value pending user confirmation) or
UNVERIFIED (a paper claim not confirmed against the skill's
references — see `RESEARCH_NOTES.md`). No paper result is quoted as a
Hoops result, and no value here is a measured Hoops result.

**Authority:** Contract §7 (division of labor — Phase 1 separate
baselines first, default-separate) and §8 (Phase 2 unified-loss
design). This lane does NOT replace §7: Phase 1 separate baselines
are the entry condition for any future Phase 2 training, and the
§2d promotion gate still applies, unchanged, to any model that would
replace the v5 twin space.

**Baselines built on (read-only):** Lane 4 `train_mtnn_v7.py` +
`TRAINING_NOTES.md` (contrastive SupCon + Matryoshka baseline) and
Lane 8 `JEPA_DESIGN.md` + `DIVISION_OF_LABOR.md` (JEPA baseline,
including its §4.1 tensions — both addressed here: timescale in §2,
provenance in §7 and `RESEARCH_NOTES.md`).

## 0. The idea in one paragraph

One model, one shared stem, two heads, one global loss. The stem is
the 17 tower encoders from Lane 4 (same `cat([x·m, m])` family-mask
convention, same 17-family order as Contract §0). Head (a) is the
Matryoshka SupCon head producing the twin space at widths
{8, 16, 32, 64}. Head (b) is the JEPA predictor head. The unification
is not "two losses added together" — it is the bridge (§4): the
season-timescale predictor's target IS head (a)'s contrastive
embedding of the true next season, so the world model plans INSIDE
the twin space; and the predictor's output feeds back into head (a)
as an extra contrastive positive. The joint model earns its existence
only by the Pareto eval in `PARETO_EVAL.md`: no regression on either
head versus its separate Phase 1 baseline, plus a win on the
joint-only "future twins" metric. If it fails either condition, it
stays research-only and the separate baselines stand.

## 1. Architecture: shared stem, two heads

```
17 tower families (120 features, per-family mask)
        │
        ▼
Shared stem: tower encoders + ConcatFusion (Lane 4 skeleton,
tower variant; plain-MLP control run from Lane 4 stays available)
        │
        ├──► Head (a) SupCon-MRL ──► z ∈ R^64, L2-normalized;
        │                          prefixes z[:m], m ∈ {8,16,32,64},
        │                          re-normalized per prefix
        │
        └──► Head (b) JEPA predictor ──► TWO MODES (§2):
                                        Mode S (season) ──► ẑ_{t+1}
                                        Mode G (game)   ──► ŝ_{t+1}
```

**What is shared, what is not.** The stem (tower encoders + fusion)
is shared: both heads read the same stem output, so both objectives
shape the same representation. The heads are separate: head (a) is a
projection to the 64-d twin space (the Lane 4 output layer); head (b)
is a predictor MLP (one per mode, §2) that maps a stem output plus
mode-specific conditioning to a predicted embedding. The stem receives
gradients from both heads (that is the point of joint training); the
stop-grad rules in §5 are what keep that sharing from collapsing.

**Deliberate inheritances from Lane 4 (not re-decided here).**
No season token in the stem (Lane 4 §2: a season token is an era
shortcut for a twin-space objective). Era-stratified batches (1024
anchors, round-robin across train seasons). Temperature grid
{0.05, 0.1, 0.2} tuned on val only. Epoch budget 200, early stopping
patience 20 — but for the joint model, early stopping watches the
PARETO condition (§6), not a single head's metric alone. The final
asset encodes all rows once, at the end, by the frozen best model
(inference, not training), exactly as Lane 4 §3.

**Deliberate inheritance from Lane 8.** Game-state inputs are REAL
play data only (game logs, play-by-play events, shot locations when
collected). Sprite animation positions are NEVER training inputs —
the forbidden arrow in Lane 8 §5 applies to the joint model too,
including to Mode G. The game-state dataset blockers in Lane 8 §6
(historical play-by-play, shot locations, game logs, a built/frozen
game-state dataset) gate Mode G training, not Mode S training (§2.3).

## 2. TIMESCALE DECISION (required — decided, not dodged)

**DECISION: TWO PREDICTOR MODES, not one head with timescale
conditioning.**

Mode S (season-timescale) and Mode G (game-timescale) are separate
predictor MLPs reading different input units in different spaces.
A single head with a timescale-conditioning token was considered and
REJECTED, for three reasons:

1. **Different input domains, not different settings.** Mode S
   reads a player-season embedding (one row, season-level features).
   Mode G reads a game-state latent (score, clock, lineup, matchup,
   recent events — Lane 8 §1.1). A conditioning token does not make
   one MLP accept two different input spaces; it papers over the
   mismatch and forces one predictor to serve two unrelated
   regression problems.
2. **Different target spaces.** Mode S targets the twin space
   (head (a)'s embedding — that is the bridge). Mode G targets the
   game-state latent space (Lane 8 §3.2: the JEPA latent state is
   NOT the twin vector). One head cannot have two target spaces
   without two output projections, which is two modes in all but
   name — so name them honestly.
3. **Different data readiness.** Mode S data exists today (12,966
   player-season rows, adjacent-season pairs from Lane 3's pair
   builder). Mode G data does not (Lane 8 §6 blockers 1–4). A single
   head would couple Mode S training to Mode G data readiness and
   delay the entire joint model; two modes let Mode S train while
   Mode G stays design-gated (§2.3).

### 2.1 Mode S — season-timescale prediction (the bridge mode)

- **Input:** the stem output for player-season row i at season t,
  i.e. its twin-space embedding z_t (64-d, L2-normalized). Optional
  conditioning (PROPOSED, ablate it): the player's career-context
  vector — the mean of that player's earlier-season embeddings in
  the training portion only (never val/test rows) — concatenated
  before the predictor MLP. No season token (Lane 4 §2 applies:
  the predictor must learn career movement, not memorize a
  season-to-season lookup).
- **Action conditioning:** NONE. Career movement across seasons is
  not a coaching decision; there is no play call, lineup, or matchup
  triple at season timescale. Mode S is an unconditioned (or
  career-context-conditioned) next-season predictor. This is a
  deliberate asymmetry with Mode G, not an omission.
- **Target:** head (a)'s contrastive embedding of the TRUE next
  season, z_{t+1}, for the same person_id — with stop-grad (§5).
  Only rows with a true adjacent-season successor in the training
  portion are Mode S training examples; rows whose next season is
  in val/test, or whose next season does not exist (final season,
  retired, left the league), contribute no Mode S loss. Cross-fold
  pairs are dropped by the same purge rule as Lane 3 (adjacent pairs
  must not cross a fold boundary).
- **Output:** ẑ_{t+1} (64-d), L2-normalized before any loss or
  retrieval use. Prefix slices ẑ_{t+1}[:m] are re-normalized per
  prefix for the prefix-weighted loss (§3).
- **What it serves:** the bridge (§4), the future-twins metric
  (`PARETO_EVAL.md` §3), and — if the joint model ever passes its
  gates — a "where is this player headed" surface. It does NOT
  serve next-play prediction, ghost opponents, or coach mode; those
  are Mode G's jobs.

### 2.2 Mode G — game-timescale prediction (the Lane 8 mode)

- **Input:** the game-state latent s_t from the JEPA state encoder
  (Lane 8 §3.2 component 1), which reads score, clock, lineup
  identities + style context, possession, recent events, and season.
  In the joint model the state encoder shares the tower stem ONLY
  for the season-level style-context features of lineup members
  (a player's twin-style profile is a legitimate state descriptor,
  Lane 8 §3.3); the game-state encoder itself is a separate
  component, not the twin head.
- **Action conditioning:** the full action triple — play call,
  lineup, matchup (Lane 8 §2) — via the action encoder (Lane 8 §3.2
  component 3). This is what makes Mode G action-conditioned in the
  V-JEPA 2-AC pattern (see `RESEARCH_NOTES.md`: the pattern that
  survived checking is "a NEW action-conditioned predictor," not a
  reused pretraining predictor).
- **Target:** the stop-grad encoding of the TRUE next game state,
  s_{t+1}, in game-state latent space — NOT in twin space. Mode G
  predictions NEVER enter the SupCon batch (§4.3: only Mode S
  predictions become predictive positives, because only Mode S
  predictions live in twin space).
- **Output:** ŝ_{t+1} (game-state latent, normalized per the JEPA
  latent convention set by the Phase 1 JEPA baseline when it lands;
  this design does not fix its width — that is a Phase 1 JEPA
  decision, not a Phase 2 invention).

### 2.3 Training gating per mode (what trains when)

| Mode | Trains when | Gate |
|---|---|---|
| Mode S | Phase 2 training is authorized AND Phase 1 separate baselines exist and are measured | §7 entry condition + `PARETO_EVAL.md` |
| Mode G | All of the above AND Lane 8 §6 blockers 1–4 land (historical PBP, shot locations, game logs, built/frozen game-state dataset) | Data gate, independent of the loss design |

A Phase 2 run with Mode S only (Mode G loss weight zero, Mode G
components absent) is a complete, reportable joint run — it is the
expected first Phase 2 run, not a partial one. A run that claims
Mode G results without the game-state dataset is a fabrication and
fails review on its face.

### 2.4 What changes in the loss for each mode

- **Mode S** contributes L_JEPA-S (§3): prefix-weighted squared
  error (equivalently cosine distance on normalized vectors)
  between ẑ_{t+1} and stop-grad z_{t+1}, at every Matryoshka prefix
  with fine-heavy weights (§6). It ALSO contributes L_bridge (§4):
  the predictive-positive SupCon term at 64-d.
- **Mode G** contributes L_JEPA-G (§3): squared error between
  ŝ_{t+1} and stop-grad s_{t+1} in game-state latent space, at a
  single width (no Matryoshka prefixes — game-state latents are not
  nested widths). It contributes NOTHING to the SupCon batch and
  NOTHING to L_bridge.
- **Total JEPA term:** L_JEPA = L_JEPA-S + λ_G · L_JEPA-G, with λ_G
  = 0 until the Mode G data gate opens (PROPOSED default λ_G = 1
  once it opens; the exact value is tuned on val only, like
  temperature). The uncertainty-weighting scheme (§5) treats
  L_JEPA-S and L_JEPA-G as separate weighted terms when both are
  active, so that a missing mode is a missing term, not a
  re-weighting of the others.

## 3. LOSS: formulas in plain math

Notation: z_i = head (a) embedding of row i (64-d, L2-normalized).
z_i^{(m)} = normalize(z_i[:m]) for m ∈ M = {8, 16, 32, 64}.
P(i) = positive set of anchor i in the batch: same-player
adjacent-season rows + validated v5-train-split twin rows (Lane 4
`build_pairs`; twin pairs touching val/test are dropped, never
trained on). τ = SupCon temperature (grid {0.05, 0.1, 0.2}, val only).
sg(·) = stop-gradient. All embeddings entering a SupCon term are
L2-normalized at the width used.

### 3.1 L_SupCon-MRL (head (a), prefix-weighted)

Per-prefix SupCon (Lane 4's formula, unchanged):

```
L_SupCon^{(m)} = mean over anchors i with |P(i)| > 0 of
    [ - (1/|P(i)|) · Σ_{p ∈ P(i)} log
        exp(z_i^{(m)} · z_p^{(m)} / τ)
        / Σ_{a ≠ i} exp(z_i^{(m)} · z_a^{(m)} / τ) ]
```

(The denominator sums over every other row in the batch — in-batch
negatives, hardest included, refreshed each epoch because embeddings
are recomputed each epoch — Lane 4 §"hard negatives". Self-similarity
is excluded, exactly as in Lane 4's implementation.)

Prefix-weighted total (PROPOSED weights — Phase 1 uses EQUAL weights;
Phase 2 shifts similarity weight toward coarse prefixes, §6):

```
L_SupCon-MRL = Σ_{m ∈ M} w_S(m) · L_SupCon^{(m)}
```

### 3.2 L_JEPA-S (Mode S predictor, prefix-weighted, fine-heavy)

```
L_JEPA-S = Σ_{m ∈ M} w_D(m) · mean over Mode S examples (i, t)
    [ || ẑ_{t+1}^{(m)} − sg(z_{t+1}^{(m)}) ||²₂ ]
```

On L2-normalized vectors, ||a − b||² = 2 − 2·cos(a, b), so this is
equivalently a cosine-distance loss; the squared-error form is kept
because it matches the JEPA setup in the checked reference
(predictor output vs. stop-grad target features — see
`RESEARCH_NOTES.md` §1). The target branch is ALWAYS stop-grad:
the stem must not be able to reduce this loss by moving the target
toward the prediction (§5).

### 3.3 L_JEPA-G (Mode G predictor, game-state latent space)

```
L_JEPA-G = mean over game transitions (s_t, a_t, s_{t+1})
    [ || ŝ_{t+1} − sg(s_{t+1}) ||²₂ ]
```

where ŝ_{t+1} = Predictor_G(s_t, ActionEncoder(a_t)) and s_{t+1} is
the target encoder's encoding of the true next state (EMA stable
copy per the JEPA pattern, gradients stopped). No Matryoshka
prefixes: game-state latents are not nested widths.

### 3.4 L_bridge (predictive-positive SupCon term, §4)

```
L_bridge = mean over anchors i with a Mode S prediction ẑ_{t+1}
    [ − log exp(z_i^{(64)} · sg(ẑ_{t+1}) / τ)
        / Σ_{a ∈ batch ∪ {predictions}} exp(z_i^{(64)} · z_a^{(64)} / τ) ]
```

At 64-d only (PROPOSED — the planning space is the full space; the
predicted vector's prefix slices enter SupCon only via the
predictive-positive mechanism's own slicing, §4.2). The prediction
entering this term is DETACHED (§5, rule 3): the bridge trains the
stem through the anchor side, never the predictor through the
predicted-positive side.

### 3.5 Anti-collapse regularizer (variance term)

```
L_reg = mean over prefixes m ∈ M of
    [ mean over dims d of max(0, γ − std_d(z^{(m)})) ]
  + mean over dims d of max(0, γ − std_d(ẑ_{t+1}))      [Mode S only]
```

with γ = 1 (PROPOSED — the hinge target for per-dimension batch
standard deviation of normalized embeddings; on L2-normalized
vectors this is a floor on dimensional spread, not a target
variance). This is a VICReg-STYLE variance hinge specified here as
a DESIGN CHOICE, not as a quoted paper result: the VICReg paper was
not among the skill's references checked for this lane, so no VICReg
claim is made (see `RESEARCH_NOTES.md` §4). A covariance
decorrelation term is deliberately NOT included in v1 of this
design: with Matryoshka prefixes, a full covariance penalty at 64-d
would fight the nesting structure (prefix dims are reused, not
independent); if collapse is observed despite the variance hinge,
a covariance term is a named v2 amendment, not a silent addition.

### 3.6 Total loss with uncertainty weighting

Learnable log-variance scalars s_k, one per loss term (k ∈ {S, D-S,
D-G, B}), initialized at 0. The regularizer weight is FIXED, not
uncertainty-weighted — a regularizer that can weight itself away is
not a guard. (Uncertainty-weighting formula: standard multi-task
form, specified here as a design choice; the Kendall et al. paper
was not among the skill's references, so this is UNVERIFIED as a
citation — see `RESEARCH_NOTES.md` §4.)

```
L = exp(−s_S)·L_SupCon-MRL + s_S
  + exp(−s_DS)·L_JEPA-S + s_DS
  + [ exp(−s_DG)·L_JEPA-G + s_DG ]        [term present only if Mode G active]
  + exp(−s_B)·L_bridge + s_B
  + w_reg · L_reg                          [w_reg FIXED, PROPOSED 0.1]
```

Why uncertainty weighting AND PCGrad (§5): they solve different
problems. Uncertainty weighting balances loss SCALES (a loss in the
100s must not drown a loss in the 0.01s). It does nothing about
gradient DIRECTION — two heads can pull the stem in opposite
directions at any scale. PCGrad handles direction. A design with
only one of the two is half a design.

**What uncertainty weighting does NOT do (stated so it is not
oversold):** it does not guarantee Pareto-optimality, it does not
detect interference (that is the cosine monitor, §5), and its
learned weights are not interpretable as "how important is this
head" — they absorb loss scale. Head importance is judged by the
Pareto eval, never by reading s_k.

## 4. THE BRIDGE (what makes it unified, not just multi-task)

### 4.1 Target coupling: the predictor plans in twin space

Mode S's target is head (a)'s embedding of the true next season
(§2.1). There is no separate JEPA season-latent space. Consequence:
every improvement to the twin space improves the predictor's target
quality, and every improvement to the predictor is immediately
retrievable — a predicted next-season embedding can be twin-searched
with the same exhaustive retrieval code path as a real embedding
(Contract §2d: same code path, self excluded, pessimistic ties).
This is the property the future-twins metric measures
(`PARETO_EVAL.md` §3).

Contrast with the "joint without bridge" ablation
(`PARETO_EVAL.md` §5): there, Mode S targets a SEPARATE season-latent
space produced by its own encoder, and L_bridge = 0. That ablation
is multi-task learning with a shared stem; it is NOT the unified
model. If it matches the full joint model on future twins, the
bridge added nothing and the unified claim fails — that is what the
ablation is for.

### 4.2 Predictive positives: exact mechanism

For each anchor row i at season t in a training batch that has a
true adjacent-season successor row i' at t+1 (same person_id, both
in the training portion, pair not crossing a fold boundary):

1. **Predict.** Run Mode S on z_t to produce ẑ_{t+1} (64-d,
   L2-normalized). This happens in the same forward pass as the
   batch's stem embeddings.
2. **Append as a positive-member-only row.** The detached
   prediction sg(ẑ_{t+1}) is appended to the batch's embedding set
   as an EXTRA ROW. It is added to the positive set of anchor i
   (alongside the true successor i' and any twin positives) AND to
   the positive sets of any other anchor for which it is a positive
   by the same rule (in practice: anchor i only, since the
   prediction is player-specific — but the rule is stated generally
   so the implementation does not special-case silently).
3. **Never an anchor.** No loss term is computed with a predicted
   row as the anchor. Predicted rows appear in other rows'
   positive sets and in every denominator (i.e., they also act as
   negatives for anchors they are not positive for — a predicted
   embedding of player A is a legitimate hard-ish negative for
   player B, and it costs nothing extra). This bounds the
   mechanism's influence: predictions shape the space by attraction
   to their own anchor and repulsion from others, but they never
   generate their own anchor gradient.
4. **Prefix slicing.** The appended prediction is sliced per prefix
   like any real row: sg(ẑ_{t+1})[:m], re-normalized, enters the
   per-prefix SupCon terms through the augmented positive sets.
   The standalone L_bridge term (§3.4) is computed at 64-d only; the
   prefix-level effect of predictive positives flows through the
   augmented L_SupCon-MRL batch, and is reported separately as
   "SupCon with predictive positives" vs. "SupCon on real rows
   only" in the run report so the two are never conflated.
5. **Batch-size accounting.** Predictions add at most one row per
   anchor with a successor (typically a minority of anchors — only
   players with a next season in the training portion). The run
   report must state the mean number of predictive-positive rows
   per batch; if that number is ever zero for a full epoch (e.g. a
   fold with no adjacent pairs), the run FAILS LOUD — a joint run
   with no bridge signal is a mislabeled multi-task run.

### 4.3 What does NOT enter the SupCon batch

- Mode G predictions (game-state latents, different space — §2.2).
- The TRUE next-season embedding z_{t+1} beyond its existing role:
  it is already a positive of anchor i via the adjacent-season pair
  rule; the bridge ADDS the prediction alongside it, it does not
  replace it. A design that replaced the true positive with the
  prediction would train the twin space toward its own predictions
  and is explicitly forbidden here.
- Any embedding of a val/test row, any sprite position, any
  predicted row as an anchor (§4.2 rule 3).

## 5. STOP-GRAD RULES, PCGRAD, AND THE INTERFERENCE MONITOR

### 5.1 Stop-grad rules (collapse prevention through the bridge)

| # | Rule | Why |
|---|---|---|
| 1 | Target branch always detached: sg(z_{t+1}) in L_JEPA-S, sg(s_{t+1}) in L_JEPA-G. The target encoder (or target branch of the shared stem) receives NO gradient from the JEPA loss. | Without this, the stem can minimize the JEPA loss by moving targets toward predictions instead of predictions toward targets — the classic JEPA collapse path. The checked reference's JEPA setup uses exactly this stop-gradient (see `RESEARCH_NOTES.md` §1). |
| 2 | Predictor INPUT gradients flow: z_t (the stem output feeding Mode S) DOES receive gradient from L_JEPA-S. | The stem must learn representations that are predictable across seasons; cutting input gradients would make the predictor a post-hoc readout, not a joint-training signal. |
| 3 | Predictive positives detached: sg(ẑ_{t+1}) in L_bridge and in the augmented SupCon batch. The predictor receives NO gradient from any SupCon term. The predictor is trained ONLY by L_JEPA-S (+ L_JEPA-G for Mode G). | Without this, SupCon could satisfy itself by pulling the prediction toward the anchor (predict the present, not the future) — a degenerate solution where the predictor learns identity and the bridge becomes a self-loop. Detaching breaks the loop at exactly one place. |
| 4 | Anchor-side gradients flow normally: z_i receives SupCon gradient from both real positives and predictive positives. | The stem learns from the bridge through the anchor, which is the intended direction of information flow. |
| 5 | EMA target option (PROPOSED, ablate): the target branch may use an exponential moving average of the stem (decay PROPOSED 0.999, updated per step) instead of the live stem with stop-grad. If used, it replaces rule 1's live-stem target; it does not remove the stop-grad. | EMA targets are the stable-copy pattern in the checked JEPA setup. Whether EMA helps or hurts twin-space training is an empirical question — hence an ablation ("joint with EMA target" vs. "joint with live detached target"), not a default. Default: live detached target (simpler, one fewer moving part). |

**Collapse watch (inherited + extended from Lane 4 §4).** Per epoch,
log alignment, uniformity, and mean pairwise cosine on a fixed val
sample, PLUS mean pairwise cosine of Mode S predictions and the
mean cosine between predictions and their anchors (identity-collapse
detector: if mean cos(ẑ_{t+1}, z_t) → 1 while L_JEPA-S stays flat,
the predictor has learned identity — flag, do not celebrate a low
loss). Lane 4's triplet fallback does NOT carry over silently: if
mean pairwise cosine exceeds 0.90 for 3 consecutive epochs, the
joint run STOPS for review (PROPOSED — a silent loss switch mid-run
would invalidate the Pareto comparison against baselines that did
not switch; a stopped run with a collapse report is honest, a
switched run with a clean report is not).

### 5.2 PCGrad projection (gradient-direction conflict)

Gradient groups: g_S (from L_SupCon-MRL), g_DS (from L_JEPA-S),
g_DG (from L_JEPA-G, when active), g_B (from L_bridge). PCGrad is
applied to the STEM parameters only (head-specific parameters have
no conflict — each head owns its own weights).

Rule (pairwise, in fixed order S → DS → DG → B; order fixed so runs
are reproducible, not random):

```
For each ordered pair (i, j), i ≠ j:
    if cos(g_i, g_j) < 0:      # conflicting directions
        g_i ← g_i − (g_i · g_j / ||g_j||²) · g_j
```

i.e., project each gradient onto the normal plane of each gradient
it conflicts with. PCGrad is specified here as a DESIGN CHOICE with
its projection formula stated in full; the PCGrad paper was not among
the skill's references, so this is UNVERIFIED as a citation (see
`RESEARCH_NOTES.md` §4). What PCGrad does NOT do: it does not resolve
WHY the heads conflict, it does not re-weight heads, and it does not
replace the uncertainty weights (§3.6) — direction and scale are
separate problems with separate tools.

**Considered and set aside (with reasons, not by omission).**
GradNorm (gradient-norm balancing): needs per-task gradient norms
every step and a separate balancing loss — cost and complexity for
a problem uncertainty weighting already handles at the scale level.
MGDA / Pareto-front solvers: solve a quadratic program per step to
find a common descent direction — exact but expensive, and its
"common descent" guarantee is weaker than it sounds when one head's
loss is flat (it can stall the other head). Both stay available as
named v2 amendments if PCGrad + uncertainty weighting demonstrably
fails (i.e., if the interference monitor in §5.3 trips repeatedly).
Neither is claimed as checked against a reference — both are
UNVERIFIED as citations here.

### 5.3 Interference monitor and PROPOSED stop/rebalance thresholds

The gradient cosine between head pairs is LOGGED EVERY RUN: per
epoch, cos(g_S, g_DS) and (when active) cos(g_S, g_DG),
cos(g_DS, g_DG), plus a 5-epoch rolling mean of each. This log is
part of the run report, not an optional diagnostic — Contract §8
requires it as the interference monitor.

PROPOSED thresholds (PROPOSED — pending user confirmation, never a
measured fact; the user confirms these before any training, per
`PARETO_EVAL.md` §6):

| Level | Condition (PROPOSED) | Action (PROPOSED) |
|---|---|---|
| Watch | 5-epoch mean cos(g_S, g_DS) < 0 | Log only. Negative mean cosine is expected transiently; it is information, not failure. |
| Rebalance | 5-epoch mean cos(g_S, g_DS) < −0.20 | Halve the effective weight of the SMALLER-loss-scale head (via its uncertainty scalar, clamped so it cannot go below 0.25× its value at run start) for the next 5 epochs; log the intervention with epoch numbers. If the mean recovers above −0.20, restore weights. |
| Stop | 5-epoch mean cos(g_S, g_DS) < −0.50, OR any single-epoch cosine < −0.70, OR 3 consecutive epochs < −0.50 | STOP the run. Report interference as the finding (with the cosine log as evidence). Do not silently continue, do not silently re-weight past the clamp, do not switch losses. A stopped run is a result: it says the heads, as specified, cannot share this stem. |

The thresholds are set so that "stop" is rare and meaningful: a
5-epoch mean below −0.50 means the heads have been pulling in
opposite directions for a sustained stretch, not a noisy batch.
If the user confirms different numbers, the confirmed numbers
replace these everywhere — the mechanism (log → rebalance →
stop) stays the same.

## 6. HIERARCHY SYNTHESIS: Matryoshka prefixes ARE the H-JEPA levels

**Claim, stated as design synthesis (not as a paper claim).** The
H-JEPA hierarchy idea (coarse-to-fine planning levels) is a DESIGN
NOTE in Lane 8 §4, not a paper claim verified in this lane's
references — see `RESEARCH_NOTES.md` §5. What this design DOES is
operationalize that note with machinery that already exists: the
Matryoshka prefixes. Coarse prefixes (8-d, 16-d) carry invariant
twin structure (who plays like whom, stable across eras — the
similarity job). The full 64-d carries equivariant dynamics (how a
player's game moves season to season, and — in Mode G — how a game
moves play to play — the dynamics job). The hierarchy is therefore
not a separate component to build; it is a weighting discipline on
components that already exist.

**Per-prefix weighting scheme (PROPOSED values, flagged as
proposed — Phase 1 uses equal weights; these replace them ONLY in
the joint model, and only if the user confirms them):**

| Prefix m | w_S(m) — SupCon (similarity) | w_D(m) — JEPA-S (dynamics) | Reading |
|---|---|---|---|
| 8-d | 0.30 | 0.10 | Coarsest: almost pure twin structure. The predictor is barely asked to predict at 8-d, because 8-d cannot hold career movement. |
| 16-d | 0.30 | 0.20 | The serving-unification width (§2d: 16-d must retain ≥ 90% of 64-d top-1). Similarity-heavy, dynamics-light. |
| 32-d | 0.20 | 0.30 | Transition width: dynamics weight overtakes similarity. |
| 64-d | 0.20 | 0.40 | Full width: dynamics-heavy. Career movement and fine style live here. |
| **Sum** | **1.00** | **1.00** | Both weight vectors sum to 1, so the per-head totals stay comparable to Phase 1's equal-weight sums (which sum to 4 unnormalized — the run report must state the normalization explicitly, or cross-run loss magnitudes will mislead). |

**Why this shape, in plain terms.** Similarity is a coarse
property: you can tell a shooter from a rim-runner in 16 numbers.
Dynamics is a fine property: WHICH shooter, trending which way,
with what shot mix shift, needs the full 64. Weighting similarity
toward coarse prefixes protects the twin space from dynamics
pressure where dynamics has nothing useful to say (8-d), and
weighting dynamics toward fine prefixes lets the predictor use the
full space where movement actually lives (64-d). If the eval shows
the opposite (e.g., dynamics helps most at 16-d), the weights are
wrong and the eval will say so — the scheme is falsifiable by the
Pareto eval, not defended by assertion.

**What the hierarchy does NOT claim.** It does not claim that
prefix 16-d "is" a quarter-strategy planner or that 64-d "is" a
next-play planner — Mode G planning levels (Lane 8 §4's coarse
quarter strategy → fine next play) are a separate, later hierarchy
over GAME time, not over embedding width. Conflating width-hierarchy
with time-hierarchy would blur exactly the distinction §2 exists to
keep sharp. The width hierarchy serves Mode S; the time hierarchy,
if built later, serves Mode G; they meet only in that both read the
same stem.

## 7. Lane 8 tension (1): timescale — RESOLVED by §2

Lane 8 §4.1 flagged tension (1): the unified record's predictor
target is the NEXT SEASON's embedding (season timescale), while
Lane 8's JEPA design predicts the NEXT GAME STATE (game timescale).
Resolution: BOTH are served, as TWO MODES (§2), with separate
predictors, separate target spaces, separate loss terms, and
separate training gates. The bridge (§4) applies to Mode S only.
No sentence in this design uses "next" without a timescale qualifier
(season or game). Any future doc that blurs them has reintroduced
the tension and should be sent back.

## 8. Lane 8 tension (2): provenance — summary (full check in RESEARCH_NOTES.md)

Lane 8 §4.1 flagged tension (2): the UniJEPA / DreamerV3 / MuDreamer
claims in the unified record were recorded from standing context,
not verified against the skill's references. Result of this lane's
check: **those claims did NOT survive verification against the
skill's references** — the references contain only the JEPA
predictor paper (plus an empty supplement); UniJEPA, DreamerV3,
MuDreamer, VICReg, GradNorm, PCGrad, MGDA, and uncertainty
weighting return ZERO hits in those files. Consequences in this
design:

- Everything borrowed from UniJEPA / DreamerV3 / MuDreamer /
  VICReg / GradNorm / PCGrad / MGDA / uncertainty weighting is
  labeled UNVERIFIED as a citation and is used ONLY as a design
  specification stated in full in §3/§5 — never as "the paper
  shows." The design stands on its own formulas, not on borrowed
  authority.
- What DID survive checking (from the JEPA predictor paper): the
  JEPA setup (context encoder, stop-grad target encoder, predictor;
  EMA stable copy), the V-JEPA 2-AC pattern (a NEW action-conditioned
  predictor, not a reused pretraining one), and the frame-shift
  caution (L2 distance ≠ usefulness — which is why future twins is
  measured by retrieval OVERLAP, not by raw prediction L2 alone).
- Full per-anchor accounting, including what was searched and what
  would verify the UNVERIFIED items, is in `RESEARCH_NOTES.md`.

## 9. Run report additions (joint runs only, on top of Lane 4's report)

Lane 4's run report fields (config, seed, hashes, alignment,
uniformity, mean pairwise cosine, val metrics per prefix) are kept.
Joint runs ADD:

- `gradient_cosine_log`: per epoch, cos(g_S, g_DS) [and cos pairs
  with g_DG when Mode G is active], plus 5-epoch rolling means.
- `interference_interventions`: every rebalance/stop event with
  epoch numbers and the cosine values that triggered it.
- `uncertainty_scalars`: final s_S, s_DS, s_DG, s_B (and their
  trajectories, summarized per 10 epochs — full trajectories live
  in a sidecar file, not in the headline report).
- `predictive_positive_rows_per_batch`: mean and min per epoch;
  zero for a full epoch = failed run (§4.2 rule 5).
- `identity_collapse_check`: mean cos(ẑ_{t+1}, z_t) per epoch (§5.1).
- `future_twins`: overlap@10 and overlap@1 on the val protocol
  (`PARETO_EVAL.md` §3), plus the persistence-baseline overlap@10
  on the same protocol, computed with the same code path.
- `prefix_weights`: the w_S(m) / w_D(m) actually used (so a run with
  confirmed-different weights is still comparable).
- `mode_g_active`: boolean + the game-state dataset hash when true;
  false with no hash is the expected first-run value, not a gap.

## 10. What this design does NOT authorize

- No training run (Phase 1 or Phase 2) — that needs the user's
  separate word, and Phase 2 additionally needs Phase 1 baselines
  existing and measured (§7 entry condition).
- No change to the champion asset, the v5 twin space, any serving
  threshold, or any production surface. A joint model that would
  replace the v5 twin space faces the §2d promotion gate PLUS the
  user's separate word, exactly like any other candidate.
- No Mode G training before the Lane 8 §6 data gate opens.
- No silent reinterpretation of PROPOSED values as confirmed, or of
  UNVERIFIED claims as checked. Both labels travel with the values
  until the user confirms the former and a reference check confirms
  the latter.

## 11. Open items for the user (decisions, not TODOs)

1. Confirm or replace the PROPOSED prefix weights (§6) and the
   PROPOSED interference thresholds (§5.3).
2. Confirm or replace the PROPOSED Pareto tolerances
   (`PARETO_EVAL.md` §2) — the joint model cannot be judged until
   these are confirmed.
3. Confirm the future-twins win margin (PROPOSED +0.05 absolute
   over the persistence baseline — `PARETO_EVAL.md` §3.4).
4. Decide whether the EMA target option (§5.1 rule 5) is an ablation
   worth running, or cut it to save runs.
5. Decide whether a UniJEPA / DreamerV3 / MuDreamer citation check
   against the actual papers (outside the skill's references) is
   worth doing before Phase 2 training, or whether the design's
   self-contained formulas are sufficient authority.

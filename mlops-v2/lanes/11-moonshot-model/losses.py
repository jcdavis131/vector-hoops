#!/usr/bin/env python3
"""Moonshot joint loss -- DRAFT ONLY (MLOps v2, Lane 11).

DRAFT STATUS: spec finalization waits for panel synthesis (contract
section 11, governance hold). Train gate is CLOSED (contract sections
0 and 13): NO training runs, NO merges, NO production writes.
Verification is ``python3 -m py_compile`` plus the pure-Python checks
named in MOONSHOT_SPEC.md section 7 (no torch, no real data, no
parameter updates). Torch is imported lazily inside functions, Lane 4
pattern, so this file parses without torch installed.

RESEARCH UPDATE 2026-10-27 (panel Addendum III-C) — DESIGN CHANGES
APPLIED HERE, still DRAFT (finalization BLOCKED until the user rules
on III-A Q1–Q3 + III-B Q1; training/merges/prod writes stay gated):
1. BRIDGE DEMOTED TO EXPERIMENTAL ARM (III-C R1): default MJ =
   parallel heads. ``bridge_loss`` and the predictive-positive
   mechanism are used ONLY when ``bridge_arm=True`` in
   ``joint_loss``; the decision MJ-with vs. MJ-without is made on
   Fold 2, never assumed. No paper in the sweep demonstrates a
   bridge loss beating parallel heads (CoJEPA Aug 2026 preprint and
   COJEPA-MRI Jul 2026 preprint both use parallel heads).
2. ANTI-COLLAPSE IS LOAD-BEARING (III-C R4; UniJEPA, Lanji et al.,
   7 Aug 2026, arXiv PREPRINT, abstract + ablation table via index,
   vision ViT scale): the regularizer weight is ABLATED (0 / 0.5x /
   1x / 2x) via ``regularizer_scale``; weight 0 is EXPECTED to
   collapse (UniJEPA precedent: regularizer weight 0 -> latent rank
   3, collapsed, planning destroyed; half weight -> 0.6d rank,
   degraded) and must be demonstrated, not assumed away. LATENT RANK
   MONITORING per checkpoint (``effective_rank`` /
   ``rank_report``). NEW KILL TRIGGER: shared-latent rank collapse
   kills the joint claim even if a headline metric looks alive.
   UniJEPA's "provably anti-collapse" is NEVER quoted as a guarantee
   for a tower-MLP — it holds under that paper's own theorem
   assumptions for its vision architecture only.
3. GRADIENT CONFLICT — PROTOCOL, NOT PCGrad-BY-DEFAULT (III-C R5):
   (1) diagnose first (per-head loss scales + gradient cosine,
   logged); (2) uncertainty weighting or FAMO (2024, O(1)); (3)
   CAGrad ONLY if conflict persists after (2). PCGrad is a
   CONDITIONAL option alongside CAGrad, not the default.
   FairGrad is EXCLUDED from any Muon arm (magnitude-sensitive +
   spectral-flattening interaction, 2026 Muon+MTL preprint,
   snippets verified — hypothesis, not rule). At K=2, GO4Align
   grouping, Nash-MTL solver cost, and SAMO double passes are
   SKIPPED (see ``check_conflict_method_allowed``). The interference
   monitor itself (logged cosine) STANDS — diagnosis is endorsed,
   ignoring conflict is not.

PREDICTION-FIRST REBALANCE -- READ FIRST, LABEL MATTERS
--------------------------------------------------------
Per the user's 2026-10-26 22:32 CDT correction (contract section 10):
the PRIMARY objective is next-season overall stat prediction, the
JEPA predictor head is PRIMARY, and the contrastive twin head is
AUXILIARY. The unified loss is therefore rebalanced prediction-first
in the PROPOSED default of this draft: w_D is DOMINANT and w_S is
AUXILIARY.

That rebalance is labeled PROPOSED, PENDING PANEL RATIFICATION, in
every place it appears. Under the contract section 11 governance
hold, the 22:32 correction is INPUT TO THE 12-seat panel, not a
headline rewrite: the delivered Lane 9 design (uncertainty-weighted,
no fixed dominance ordering) remains the delivered baseline, and
this file's prediction-first default is the PROPOSED amendment that
the panel judges. Do NOT present the rebalance as ratified. If the
panel does not ratify prediction-first, the dominance ordering in
``PREDICTION_FIRST_INITIAL_LOG_VARS_PROPOSED`` is dropped and the
Lane 9 equal-start uncertainty weighting stands.

How prediction-first is expressed here: uncertainty weighting has no
fixed w_S / w_D -- the scalars are LEARNED. Dominance is therefore
expressed as INITIAL log-variance values (the starting point the
scalars move from), plus an explicit dominance ordering that the run
report must state. Initial values are a proposal, not a result: the
learned scalars can move away from them during training, and the run
report must record where they ended, not just where they started.

PROVENANCE (Lane 9 section 8 / RESEARCH_NOTES.md -- carried, not re-lit)
-------------------------------------------------------------------------
- Uncertainty weighting, PCGrad, VICReg-style variance hinge, GradNorm,
  MGDA: UNVERIFIED as citations against the jepa-predictor-paper
  skill's references (Lane 9 checked: zero hits). They are used here
  ONLY as design specifications stated in full below -- never as
  "the paper shows." No paper result is quoted as a Hoops result.
- What DID survive Lane 9's check: the JEPA setup (context encoder,
  stop-grad target encoder, predictor) and the V-JEPA 2-AC pattern (a
  NEW action-conditioned predictor, not a reused pretraining one).

Stop-grad rules (Lane 9 section 5.1 -- the loss functions assume the
CALLER passes already-detached tensors where the rules require it;
each function documents which inputs must be detached)
--------------------------------------------------------------------
1. JEPA targets always detached: sg(z_{t+1}) in L_JEPA-S,
   sg(s_{t+1}) in L_JEPA-G. The target branch gets NO JEPA gradient.
2. Predictor INPUT gradients flow: z_t feeding Mode S DOES receive
   L_JEPA-S gradient (the stem must learn predictable representations).
3. Predictive positives detached: sg(zhat_{t+1}) in L_bridge and in
   the augmented SupCon batch. The predictor is trained ONLY by
   L_JEPA-S (+ L_JEPA-G for Mode G), never by any SupCon term.
4. Anchor-side gradients flow normally: z_i receives SupCon gradient
   from real and predictive positives alike.
"""

from __future__ import annotations

import math

try:
    from model import (  # noqa: F401 -- shared constants, single source of truth
        JEPA_S_PREFIX_WEIGHTS_PROPOSED,
        NESTING,
        SUPCON_PREFIX_WEIGHTS_PROPOSED,
    )
except ImportError:  # losses.py imported without the lane dir on sys.path
    # Fallback mirrors model.py exactly (Lane 9 section 6, PROPOSED).
    NESTING = (8, 16, 32, 64)
    SUPCON_PREFIX_WEIGHTS_PROPOSED = {8: 0.30, 16: 0.30, 32: 0.20, 64: 0.20}
    JEPA_S_PREFIX_WEIGHTS_PROPOSED = {8: 0.10, 16: 0.20, 32: 0.30, 64: 0.40}

# ---------------------------------------------------------------------------
# PROPOSED constants (pending user confirmation -- never measured facts)
# ---------------------------------------------------------------------------

# Lane 9 section 6 prefix weights, PROPOSED. SupCon coarse-heavy,
# JEPA-S fine-heavy. Both sum to 1.0 (checked in pure Python below).
SUPCON_PREFIX_WEIGHTS = dict(SUPCON_PREFIX_WEIGHTS_PROPOSED)
JEPA_S_PREFIX_WEIGHTS = dict(JEPA_S_PREFIX_WEIGHTS_PROPOSED)

# Variance-hinge target gamma and fixed regularizer weight (Lane 9
# section 3.5-3.6, PROPOSED). w_reg is FIXED, not uncertainty-weighted:
# a regularizer that can weight itself away is not a guard.
VARIANCE_GAMMA_PROPOSED = 1.0
W_REG_FIXED_PROPOSED = 0.1

# Mode G weight once its data gate opens (Lane 9 section 2.4, PROPOSED
# default lambda_G = 1; tuned on val only). Until the gate opens,
# lambda_G = 0 exactly -- Mode G is absent, not down-weighted.
LAMBDA_G_PROPOSED = 1.0

# Prediction-first INITIAL log-variance scalars (PROPOSED, pending
# panel ratification -- see the module docstring). Effective weight =
# exp(-s): a LOWER s means a HIGHER effective weight. The ordering
# below makes JEPA-S dominant and SupCon auxiliary AT INITIALIZATION:
#   s_DS = -0.7 -> weight ~2.01 (dominant)
#   s_B  =  0.0 -> weight  1.00 (bridge, middle)
#   s_S  =  0.7 -> weight ~0.50 (auxiliary)
# These are starting values for LEARNED scalars, not fixed weights.
# If the panel does not ratify prediction-first, all four start at 0.0
# (the Lane 9 delivered baseline).
PREDICTION_FIRST_INITIAL_LOG_VARS_PROPOSED = {
    "S": 0.7,    # SupCon-MRL: auxiliary
    "DS": -0.7,  # JEPA-S: dominant (primary: next-season prediction)
    "DG": 0.0,   # JEPA-G: inactive until its data gate opens
    "B": 0.0,    # bridge: middle
}
PREDICTION_FIRST_DOMINANCE_ORDER_PROPOSED = ("DS", "B", "S")
# Plain-language statement the run report must carry verbatim when this
# default is used:
PREDICTION_FIRST_LABEL = (
    "PROPOSED, PENDING PANEL RATIFICATION (contract section 11 hold): "
    "prediction-first rebalance -- JEPA predictor head PRIMARY (w_D "
    "dominant), contrastive twin head AUXILIARY (w_S auxiliary). This "
    "rebalance is user-directed per the 2026-10-26 22:32 CDT correction "
    "(contract section 10) and is NOT ratified architecture until the "
    "12-seat panel synthesizes and the user rules."
)

# Interference monitor thresholds (Lane 9 section 5.3, PROPOSED,
# pending user confirmation). Mechanism (log -> rebalance -> stop) is
# the design; the numbers are proposals the user confirms or replaces.
INTERFERENCE_WATCH_COSINE = 0.0      # 5-epoch mean < 0: log only
INTERFERENCE_REBALANCE_COSINE = -0.20  # 5-epoch mean < -0.20: rebalance
INTERFERENCE_STOP_MEAN_COSINE = -0.50  # 5-epoch mean < -0.50: stop
INTERFERENCE_STOP_SINGLE_COSINE = -0.70  # any single epoch < -0.70: stop
INTERFERENCE_STOP_STREAK = 3         # consecutive epochs < -0.50: stop
INTERFERENCE_REBALANCE_FLOOR = 0.25  # a head's weight never drops below
# 0.25x its run-start value under rebalancing (Lane 9 section 5.3).

# Collapse stop (Lane 9 section 5.1): mean pairwise cosine > 0.90 for
# 3 consecutive epochs STOPS the joint run for review. No silent loss
# switch: a switched run would invalidate the Pareto comparison.
COLLAPSE_COSINE_THRESHOLD = 0.90
COLLAPSE_STREAK = 3

# Rank-collapse kill trigger (III-C R4, NEW): shared-latent effective
# rank below this fraction of the latent dimension KILLS the joint
# claim, even if a headline metric looks alive. PROPOSED fraction,
# pending confirmation at finalization -- the mechanism (monitor per
# checkpoint, kill on collapse) is the requirement; the number is a
# proposal. UniJEPA precedent (preprint, vision ViT): weight 0 ->
# rank 3; half weight -> 0.6d rank, degraded. A 0.25d kill line sits
# below the degraded-but-alive 0.6d point and above total collapse.
RANK_KILL_FRACTION_PROPOSED = 0.25

# Anti-collapse regularizer ablation grid (III-C R4): the regularizer
# weight is ablated at 0 / 0.5x / 1x / 2x the base weight. The 0 arm
# is EXPECTED to collapse (UniJEPA precedent) and must be run and
# reported, not skipped -- a missing 0 arm is a missing deliverable.
REGULARIZER_ABLATION_SCALES = (0.0, 0.5, 1.0, 2.0)

# Conflict-protocol exclusions (III-C R5). FairGrad is EXCLUDED from
# any Muon arm. At K=2 heads, GO4Align grouping, Nash-MTL solver
# cost, and SAMO double passes are SKIPPED (their wins are on
# many-task / dense-vision problems, not two heads).
EXCLUDED_FROM_MUON_ARMS = ("fairgrad",)
EXCLUDED_AT_K2 = ("go4align", "nash-mtl", "samo")


# ---------------------------------------------------------------------------
# Pure-Python helpers (runnable without torch; used by the logic checks)
# ---------------------------------------------------------------------------

def check_prefix_weights():
    """Both PROPOSED prefix-weight vectors must sum to 1.0."""
    for name, weights in (("SupCon", SUPCON_PREFIX_WEIGHTS),
                          ("JEPA-S", JEPA_S_PREFIX_WEIGHTS)):
        total = sum(weights[m] for m in NESTING)
        if abs(total - 1.0) > 1e-9:
            raise ValueError(f"moonshot loss: {name} prefix weights sum to {total}, not 1.0")
        if set(weights) != set(NESTING):
            raise ValueError(f"moonshot loss: {name} prefix weights must cover exactly {NESTING}")
    return True


def effective_weight(log_var):
    """Uncertainty-weighting effective weight: exp(-s). Pure Python."""
    return math.exp(-log_var)


def check_prediction_first_ordering():
    """The PROPOSED initial values must actually encode D-dominant ordering."""
    w = {k: effective_weight(v) for k, v in PREDICTION_FIRST_INITIAL_LOG_VARS_PROPOSED.items()}
    if not (w["DS"] > w["B"] > w["S"]):
        raise ValueError(f"moonshot loss: prediction-first ordering violated: {w}")
    return True


def interference_action(cosine_history):
    """Interference monitor decision from a list of per-epoch gradient
    cosines (most recent last). Pure Python; no torch needed.

    Returns (action, reason) with action in {"ok", "watch", "rebalance",
    "stop"}. The caller logs the decision with epoch numbers every run
    (Lane 9 section 5.3: the cosine log is part of the run report).

    Rules (PROPOSED thresholds above):
    - stop: any single epoch < -0.70, or 5-epoch mean < -0.50, or 3
      consecutive epochs < -0.50;
    - rebalance: 5-epoch mean < -0.20 (and no stop condition);
    - watch: 5-epoch mean < 0 (and no rebalance/stop condition);
    - ok: otherwise.
    """
    if not cosine_history:
        return "ok", "no cosine history yet"
    last = cosine_history[-1]
    if last < INTERFERENCE_STOP_SINGLE_COSINE:
        return "stop", f"single-epoch cosine {last:.3f} < {INTERFERENCE_STOP_SINGLE_COSINE}"
    streak = 0
    for value in reversed(cosine_history):
        if value < INTERFERENCE_STOP_MEAN_COSINE:
            streak += 1
        else:
            break
    if streak >= INTERFERENCE_STOP_STREAK:
        return "stop", f"{streak} consecutive epochs < {INTERFERENCE_STOP_MEAN_COSINE}"
    window = cosine_history[-5:]
    mean = sum(window) / len(window)
    if len(cosine_history) >= 5 and mean < INTERFERENCE_STOP_MEAN_COSINE:
        return "stop", f"5-epoch mean cosine {mean:.3f} < {INTERFERENCE_STOP_MEAN_COSINE}"
    if len(cosine_history) >= 5 and mean < INTERFERENCE_REBALANCE_COSINE:
        return "rebalance", (
            f"5-epoch mean cosine {mean:.3f} < {INTERFERENCE_REBALANCE_COSINE}: "
            "halve the smaller-loss-scale head's effective weight (clamped "
            f"at {INTERFERENCE_REBALANCE_FLOOR}x its run-start value) for "
            "the next 5 epochs; restore if the mean recovers"
        )
    if len(cosine_history) >= 5 and mean < INTERFERENCE_WATCH_COSINE:
        return "watch", f"5-epoch mean cosine {mean:.3f} < 0: log only"
    return "ok", f"5-epoch mean cosine {mean:.3f}"


def collapse_action(mean_pairwise_cosines):
    """Collapse stop decision from per-epoch mean pairwise cosines.

    Returns (action, reason): "stop" when the threshold is exceeded for
    COLLAPSE_STREAK consecutive epochs, else "ok". A stopped run is a
    result (reported with the cosine log), never a silent loss switch.
    """
    streak = 0
    for value in reversed(mean_pairwise_cosines):
        if value > COLLAPSE_COSINE_THRESHOLD:
            streak += 1
        else:
            break
    if streak >= COLLAPSE_STREAK:
        return "stop", (
            f"mean pairwise cosine > {COLLAPSE_COSINE_THRESHOLD} for "
            f"{streak} consecutive epochs: stop for review (Lane 9 5.1)"
        )
    return "ok", f"collapse streak {streak}/{COLLAPSE_STREAK}"


def rank_collapse_action(effective_rank, latent_dim, kill_fraction=None):
    """NEW KILL TRIGGER (III-C R4): shared-latent rank collapse kills
    the joint claim even if a headline metric looks alive.

    Returns ("kill", reason) when effective_rank < kill_fraction *
    latent_dim, else ("ok", reason). Default kill fraction is the
    PROPOSED 0.25 (see RANK_KILL_FRACTION_PROPOSED). The rank is
    monitored PER CHECKPOINT (see ``rank_report``); a single
    below-threshold checkpoint triggers the kill evaluation, and the
    run report must state the rank trajectory, not just the final
    rank -- a latent that collapsed mid-run and recovered is still
    evidence about the regularizer, not a clean run.
    """
    fraction = RANK_KILL_FRACTION_PROPOSED if kill_fraction is None else kill_fraction
    if effective_rank < fraction * latent_dim:
        return "kill", (
            f"shared-latent rank collapse: effective rank "
            f"{effective_rank:.2f} < {fraction} x {latent_dim} = "
            f"{fraction * latent_dim:.2f} -- joint claim KILLED (III-C R4), "
            f"even if a headline metric looks alive"
        )
    return "ok", (
        f"effective rank {effective_rank:.2f} >= kill line "
        f"{fraction * latent_dim:.2f} ({fraction} x {latent_dim})"
    )


def check_conflict_method_allowed(method, optimizer_arm, n_heads=2):
    """Conflict-method guard (III-C R5).

    - FairGrad + any Muon arm -> REFUSED (magnitude-sensitive +
      spectral-flattening interaction, 2026 Muon+MTL preprint,
      snippets verified).
    - GO4Align / Nash-MTL / SAMO at K=2 -> REFUSED (grouping is
      pointless at K=2; solver cost and double passes buy nothing
      demonstrated for two heads).
    - PCGrad is allowed ONLY as a conditional option (alongside
      CAGrad), never as the default -- see ``conflict_protocol``.
    Unknown methods are refused: a conflict method enters this
    program by name in this guard, not by silent import.
    """
    name = method.lower().replace("-", "").replace("_", "")
    if optimizer_arm.lower() == "muon" and name in ("fairgrad",):
        raise ValueError(
            "moonshot conflict: FairGrad is EXCLUDED from any Muon arm "
            "(III-C R5: magnitude-sensitive + spectral-flattening "
            "interaction)"
        )
    if n_heads == 2 and name in ("go4align", "nashmtl", "samo"):
        raise ValueError(
            f"moonshot conflict: {method} is SKIPPED at K=2 heads "
            "(III-C R5: grouping/solver-cost/double-pass machinery for "
            "many-task problems, not two heads)"
        )
    allowed = ("diagnose", "uncertainty", "famo", "cagrad", "pcgrad", "none")
    if name not in allowed:
        raise ValueError(
            f"moonshot conflict: unknown method {method!r}; allowed: "
            f"{allowed} (CAGrad/PCGrad only as conditional options)"
        )
    return True


def conflict_protocol(cosine_history, loss_scales, step2_applied=False,
                      conflict_persists=False):
    """Diagnose-first conflict protocol (III-C R5), pure Python.

    Steps, in order -- a step is skipped only when its condition is
    not met, never by preference:
    (1) DIAGNOSE: per-head loss scales + gradient cosine, LOGGED
        every run. If the cosine history shows no persistent
        conflict (no 5-epoch mean < 0 and no single epoch < -0.70
        in the recent window), the protocol returns "none" -- there
        is no conflict to solve and surgery adds nothing.
    (2) UNCERTAINTY WEIGHTING or FAMO (O(1)): applied when diagnosis
        shows conflict. ``step2_applied`` records that it was tried.
    (3) CAGrad (or PCGrad as a conditional option alongside it):
        ONLY if conflict persists AFTER step (2)
        (``conflict_persists=True``).
    Returns (method, reason) with method in {"none", "uncertainty-or-
    famo", "cagrad-or-pcgrad-conditional"}. The caller logs the
    decision with epoch numbers; the method actually used goes in
    the run report, and the guard in
    ``check_conflict_method_allowed`` still applies to it.
    """
    action, _ = interference_action(cosine_history)
    if action == "ok":
        return "none", (
            "diagnose: no persistent conflict in the cosine log -- no "
            "conflict method applied (surgery adds nothing)"
        )
    if not step2_applied:
        return "uncertainty-or-famo", (
            f"diagnose: conflict signal ({action}) with loss scales "
            f"{loss_scales} -- apply uncertainty weighting or FAMO "
            f"(O(1)) first (III-C R5 step 2)"
        )
    if conflict_persists:
        return "cagrad-or-pcgrad-conditional", (
            "conflict persists after uncertainty weighting / FAMO -- "
            "CAGrad (or PCGrad as a conditional option alongside it) "
            "is now permitted (III-C R5 step 3)"
        )
    return "uncertainty-or-famo", (
        "conflict signal present but step 2 not yet shown to fail -- "
        "stay on uncertainty weighting / FAMO; CAGrad is not yet "
        "permitted"
    )


# ---------------------------------------------------------------------------
# Torch loss terms (torch imported lazily inside each function)
# ---------------------------------------------------------------------------

def supcon_loss_at_width(emb, pos_mask, temperature):
    """SupCon (Khosla et al. 2020) at one width. emb: [B, m], L2-normed.
    pos_mask: [B, B] bool, True for positives (self excluded). Rows
    with no positive in the batch contribute nothing. Self-similarity
    is excluded exactly as in Lane 4."""
    import torch
    import torch.nn.functional as F

    logits = emb @ emb.T / temperature
    logits = logits - torch.eye(logits.shape[0], device=emb.device) * 1e9
    log_prob = F.log_softmax(logits, dim=1)
    pos_count = pos_mask.sum(dim=1)
    valid = pos_count > 0
    if not bool(valid.any()):
        return torch.zeros((), device=emb.device)
    loss = -(log_prob * pos_mask.float()).sum(dim=1) / pos_count.clamp(min=1)
    return loss[valid].mean()


def supcon_mrl_loss(z64, pos_mask, temperature, prefix_weights=None):
    """L_SupCon-MRL: prefix-weighted SupCon over M = {8, 16, 32, 64}.

    Each prefix is sliced and re-normalized before its SupCon term.
    Default weights are the PROPOSED coarse-heavy values (Lane 9 6);
    Phase 1 used equal weights -- the run report must state which
    weights were actually used, or cross-run loss magnitudes mislead.
    """
    import torch.nn.functional as F

    weights = dict(SUPCON_PREFIX_WEIGHTS) if prefix_weights is None else prefix_weights
    total = None
    for m in NESTING:
        sliced = F.normalize(z64[:, :m], dim=-1)
        term = weights[m] * supcon_loss_at_width(sliced, pos_mask, temperature)
        total = term if total is None else total + term
    return total


def jepa_s_loss(pred_s64, target_s64_detached, prefix_weights=None):
    """L_JEPA-S: prefix-weighted squared error between the Mode S
    prediction and the DETACHED true-next-season embedding, at every
    prefix (slices re-normalized). Default weights are the PROPOSED
    fine-heavy values (Lane 9 6). On L2 vectors this equals cosine
    distance (||a-b||^2 = 2 - 2*cos); the squared-error form is kept
    because it matches the checked JEPA setup (predictor output vs.
    stop-grad target features).

    CALLER CONTRACT: target_s64_detached MUST already be detached
    (stop-grad rule 1). Passing a live target lets the stem minimize
    this loss by moving targets toward predictions -- the classic
    JEPA collapse path -- and is a bug, not a variant.
    """
    import torch.nn.functional as F

    weights = dict(JEPA_S_PREFIX_WEIGHTS) if prefix_weights is None else prefix_weights
    total = None
    for m in NESTING:
        pred_m = F.normalize(pred_s64[:, :m], dim=-1)
        targ_m = F.normalize(target_s64_detached[:, :m], dim=-1)
        term = weights[m] * ((pred_m - targ_m) ** 2).sum(dim=-1).mean()
        total = term if total is None else total + term
    return total


def jepa_g_loss(pred_g, target_g_detached):
    """L_JEPA-G: squared error between the Mode G prediction and the
    DETACHED true next game-state encoding, in game-state latent
    space, at a single width (no Matryoshka prefixes -- game-state
    latents are not nested widths). CALLER CONTRACT: the target MUST
    already be detached (stop-grad rule 1)."""
    return ((pred_g - target_g_detached) ** 2).sum(dim=-1).mean()


def bridge_loss(z64_anchor, pred_s64_detached, temperature, batch_embeddings_64=None):
    """L_bridge: predictive-positive SupCon term at 64-d only (Lane 9
    section 3.4, PROPOSED width choice -- the planning space is the
    full space).

    *** EXPERIMENTAL ARM ONLY (III-C R1). *** Default MJ = parallel
    heads; this term is computed ONLY when the run's bridge arm is
    on (``bridge_arm=True`` in ``joint_loss``). MJ-with-predictive-
    positives vs. MJ-without is decided on Fold 2, never assumed: no
    paper in the 2026-10-27 sweep demonstrates a bridge loss beating
    parallel heads (CoJEPA Aug 2026 preprint, COJEPA-MRI Jul 2026
    preprint -- both parallel heads). A run report that includes this
    term MUST label itself as the bridge arm.

    For each anchor with a Mode S prediction, the DETACHED prediction
    is scored as a positive against the anchor, with the denominator
    over the batch rows plus the predictions. CALLER CONTRACT:
    pred_s64_detached MUST already be detached (stop-grad rule 3) --
    the bridge trains the stem through the anchor side, never the
    predictor through the predicted-positive side. If it were live,
    SupCon could satisfy itself by pulling the prediction toward the
    anchor (predict the present, not the future) -- a degenerate
    self-loop.

    ``batch_embeddings_64``: the batch's real-row embeddings (64-d,
    L2-normed) used as the denominator pool; when None, the loss is
    computed over the anchor/prediction pairs alone (a degenerate
    denominator -- the caller should always pass the batch).
    """
    import torch
    import torch.nn.functional as F

    if batch_embeddings_64 is None:
        batch_embeddings_64 = z64_anchor
    pool = torch.cat([batch_embeddings_64, pred_s64_detached], dim=0)
    logits = (z64_anchor * pred_s64_detached).sum(dim=-1) / temperature
    denom_logits = z64_anchor @ pool.T / temperature
    log_prob = logits - torch.logsumexp(denom_logits, dim=1)
    return -log_prob.mean()


def variance_regularizer(z_prefixes, pred_s64=None, gamma=None):
    """Anti-collapse variance hinge (VICReg-STYLE, Lane 9 3.5).

    Mean over prefixes of mean over dims of max(0, gamma - std_d),
    plus the same hinge on Mode S predictions when supplied. This is
    a DESIGN CHOICE specified in full here, not a quoted paper result
    (VICReg was not among Lane 9's checked references). A covariance
    decorrelation term is deliberately NOT included in v1: with
    Matryoshka prefixes, a full covariance penalty at 64-d would
    fight the nesting structure (prefix dims are reused, not
    independent). If collapse is observed despite this hinge, a
    covariance term is a named v2 amendment, not a silent addition.

    RESEARCH UPDATE (III-C R4): this hinge is now only ONE of the
    anti-collapse options -- see ``anticollapse_regularizer`` for the
    ablated variance/covariance/Gaussian regularizer on the SHARED
    latent, whose weight is ablated at 0 / 0.5x / 1x / 2x. This
    prefix-hinge function is kept for Lane 9 compatibility; the
    shared-latent regularizer is the load-bearing term.
    """
    import torch

    gamma = VARIANCE_GAMMA_PROPOSED if gamma is None else gamma
    terms = []
    for m in NESTING:
        z_m = z_prefixes[m]
        std = z_m.std(dim=0)
        terms.append(torch.clamp(gamma - std, min=0).mean())
    if pred_s64 is not None:
        std = pred_s64.std(dim=0)
        terms.append(torch.clamp(gamma - std, min=0).mean())
    return torch.stack(terms).mean()


def anticollapse_regularizer(z_shared, kind="variance", gamma=None):
    """LOAD-BEARING anti-collapse regularizer on the SHARED latent
    (III-C R4; UniJEPA precedent, Aug 2026 preprint, vision ViT).

    ``z_shared``: the shared-latent batch [B, D] (the pooled encoder
    output before heads, or the 64-d twin-space vector -- the caller
    states which, and uses the same choice for every arm, or the
    ablation is not comparable). ``kind``:
    - "variance": VICReg-STYLE variance hinge, mean over dims of
      max(0, gamma - std_d) (gamma PROPOSED 1.0);
    - "covariance": mean squared off-diagonal covariance of the
      centered batch (decorrelation; penalizes dimensional
      redundancy directly);
    - "gaussian": UniJEPA-STYLE Gaussian regularizer -- batch mean
      squared plus (batch std - 1) squared, averaged over dims
      (pulls the latent toward unit Gaussian statistics).
    The CALLER multiplies the returned value by the ablation scale
    (0 / 0.5 / 1 / 2 x the base weight, REGULARIZER_ABLATION_SCALES)
    and by the fixed base weight -- the scale is a run-config value,
    recorded in the run report, never silently defaulted. Weight 0
    is EXPECTED to collapse (UniJEPA: rank 3) and must be run and
    reported. UniJEPA's "provably anti-collapse" is NOT a guarantee
    here: it holds under that paper's own theorem assumptions for
    its vision architecture, not for a tower-MLP.
    """
    import torch

    if kind == "variance":
        gamma = VARIANCE_GAMMA_PROPOSED if gamma is None else gamma
        std = z_shared.std(dim=0)
        return torch.clamp(gamma - std, min=0).mean()
    if kind == "covariance":
        centered = z_shared - z_shared.mean(dim=0, keepdim=True)
        n = z_shared.shape[0]
        cov = (centered.T @ centered) / max(1, n - 1)
        off_diag = cov - torch.diag(torch.diag(cov))
        return (off_diag ** 2).mean()
    if kind == "gaussian":
        mean = z_shared.mean(dim=0)
        std = z_shared.std(dim=0)
        return (mean ** 2).mean() + ((std - 1.0) ** 2).mean()
    raise ValueError(
        f"moonshot regularizer: unknown kind {kind!r}; "
        "kinds are 'variance', 'covariance', 'gaussian'"
    )


def effective_rank(embeddings):
    """Effective rank of a latent batch (per-checkpoint monitoring,
    III-C R4). Computed from the singular values s of the centered
    batch: p_i = s_i / sum(s), effective rank = exp(-sum(p log p)).
    A rank-3 collapse (UniJEPA weight-0 precedent) reads ~3 here
    regardless of the nominal dimension. Requires torch at call time;
    the harness calls this per checkpoint and logs it with the
    checkpoint id -- rank is a trajectory, not a final number."""
    import torch

    centered = embeddings - embeddings.mean(dim=0, keepdim=True)
    s = torch.linalg.svdvals(centered)
    total = s.sum()
    if float(total) == 0.0:
        return 0.0
    p = s / total
    p = p[p > 0]
    return float(torch.exp(-(p * torch.log(p)).sum()))


def rank_report(embeddings, latent_dim=None):
    """Per-checkpoint rank report (III-C R4): effective rank,
    embedding variance (mean per-dim std), and the kill evaluation
    from ``rank_collapse_action`` when latent_dim is given. The
    harness logs this dict per checkpoint; the run report carries
    the full trajectory."""
    import torch

    rank = effective_rank(embeddings)
    variance = float(embeddings.std(dim=0).mean())
    report = {"effective_rank": rank, "mean_per_dim_std": variance}
    if latent_dim is not None:
        action, reason = rank_collapse_action(rank, latent_dim)
        report["rank_action"] = action
        report["rank_reason"] = reason
    return report


def build_uncertainty_weights(initial_log_vars=None):
    """Learnable log-variance scalars, one per loss term (Lane 9 3.6).

    Returns a torch nn.Module holding s_S, s_DS, s_DG, s_B as
    Parameters. Default initialization is the PROPOSED prediction-
    first values (DS dominant, S auxiliary -- pending panel
    ratification, see module docstring); pass all zeros for the Lane 9
    delivered equal-start baseline. The regularizer weight is FIXED
    and is NOT a learned scalar (see W_REG_FIXED_PROPOSED).
    """
    import torch
    import torch.nn as nn

    init = dict(PREDICTION_FIRST_INITIAL_LOG_VARS_PROPOSED) if initial_log_vars is None else initial_log_vars

    class UncertaintyWeights(nn.Module):
        def __init__(self):
            super().__init__()
            self.s_S = nn.Parameter(torch.tensor(float(init.get("S", 0.0))))
            self.s_DS = nn.Parameter(torch.tensor(float(init.get("DS", 0.0))))
            self.s_DG = nn.Parameter(torch.tensor(float(init.get("DG", 0.0))))
            self.s_B = nn.Parameter(torch.tensor(float(init.get("B", 0.0))))

        def weights(self):
            import torch

            return {
                "S": torch.exp(-self.s_S),
                "DS": torch.exp(-self.s_DS),
                "DG": torch.exp(-self.s_DG),
                "B": torch.exp(-self.s_B),
            }

    return UncertaintyWeights()


def joint_loss(terms, log_vars, w_reg=None, lambda_g=0.0, bridge_arm=False,
               weighting_scheme="uncertainty", famo_weights=None,
               regularizer_scale=1.0):
    """Assemble the total joint loss from already-computed terms.

    ``terms``: dict with keys "S" (L_SupCon-MRL), "DS" (L_JEPA-S),
    optionally "B" (L_bridge), "DG" (L_JEPA-G) and "reg" (shared-
    latent anti-collapse regularizer from ``anticollapse_regularizer``).
    ``log_vars``: dict of log-variance scalars (tensors) with
    the same S/DS/DG/B keys, or the module from
    ``build_uncertainty_weights`` (its ``weights()`` mapping is used).
    ``lambda_g``: 0 until the Mode G data gate opens (Lane 9 2.4);
    the DG term is present in the total ONLY when Mode G is active,
    so a missing mode is a missing term, not a re-weighting of others.
    ``bridge_arm``: EXPERIMENTAL ARM flag (III-C R1), DEFAULT FALSE.
    When False, a "B" term in ``terms`` is EXCLUDED from the total
    and reported as excluded -- default MJ is parallel heads, and a
    bridge term must never leak into a parallel-heads run through a
    stale terms dict. The bridge decision is made on Fold 2.
    ``weighting_scheme``: "uncertainty" (default, Lane 9 3.6) or
    "famo" (III-C R5 step 2, O(1) dynamic weighting). For "famo",
    ``famo_weights`` (a dict of per-term weight tensors, computed by
    the training harness from the loss trajectory -- the FAMO update
    rule itself lives in the harness, not here) replaces the
    uncertainty weights; ``log_vars`` is then ignored for weighting
    but still reported for audit. Mixing schemes in one run is
    refused by the harness, not here -- the run report states one
    scheme.
    ``regularizer_scale``: the anti-collapse ablation scale (0 / 0.5
    / 1 / 2, REGULARIZER_ABLATION_SCALES, III-C R4). The "reg" term
    enters as w_reg * scale * reg. Scale 0 is a real arm (expected
    to collapse) and must be reported as such.

    Returns (total, report) where report carries every component and
    its effective weight, so the run report can state the loss
    composition exactly. What uncertainty weighting does NOT do
    (Lane 9 3.6): it does not guarantee Pareto-optimality, it does
    not detect interference (that is the cosine monitor), and its
    learned weights are NOT interpretable as "how important is this
    head" -- they absorb loss scale. Head importance is judged by
    the Pareto eval, never by reading s_k.
    """
    import torch

    if weighting_scheme not in ("uncertainty", "famo"):
        raise ValueError(
            f"moonshot loss: unknown weighting_scheme {weighting_scheme!r}; "
            "schemes are 'uncertainty' or 'famo' (III-C R5 step 2)"
        )
    if weighting_scheme == "famo" and famo_weights is None:
        raise ValueError(
            "moonshot loss: weighting_scheme='famo' requires famo_weights "
            "(computed by the harness from the loss trajectory)"
        )
    if regularizer_scale not in REGULARIZER_ABLATION_SCALES:
        raise ValueError(
            f"moonshot loss: regularizer_scale must be one of "
            f"{REGULARIZER_ABLATION_SCALES} (III-C R4 ablation grid), "
            f"got {regularizer_scale}"
        )
    if hasattr(log_vars, "weights"):
        weights = log_vars.weights()
        scalars = {"S": log_vars.s_S, "DS": log_vars.s_DS,
                   "DG": log_vars.s_DG, "B": log_vars.s_B}
    else:
        scalars = log_vars
        weights = {k: torch.exp(-v) for k, v in scalars.items()}
    if weighting_scheme == "famo":
        weights = famo_weights
        scalars = {k: torch.zeros((), device=terms["S"].device) for k in weights}
    w_reg = W_REG_FIXED_PROPOSED if w_reg is None else w_reg

    total = weights["S"] * terms["S"] + scalars["S"]
    total = total + weights["DS"] * terms["DS"] + scalars["DS"]
    if bridge_arm and "B" in terms and terms["B"] is not None:
        total = total + weights["B"] * terms["B"] + scalars["B"]
    if lambda_g != 0.0 and "DG" in terms and terms["DG"] is not None:
        total = total + weights["DG"] * terms["DG"] + scalars["DG"]
    if "reg" in terms and terms["reg"] is not None:
        total = total + w_reg * regularizer_scale * terms["reg"]
    report = {
        "terms": {k: (float(v.detach()) if hasattr(v, "detach") else v) for k, v in terms.items()},
        "effective_weights": {k: float(v.detach()) for k, v in weights.items()},
        "w_reg_fixed": w_reg,
        "regularizer_scale": regularizer_scale,
        "lambda_g": lambda_g,
        "bridge_arm": bridge_arm,
        "bridge_excluded": not bridge_arm,
        "weighting_scheme": weighting_scheme,
        "prediction_first_label": PREDICTION_FIRST_LABEL,
    }
    return total, report


# ---------------------------------------------------------------------------
# PCGrad -- CONDITIONAL option only (III-C R5), not the default.
# Design specification stated in full; PCGrad is UNVERIFIED as a
# citation, see module docstring. The default conflict handling is
# the diagnose-first protocol in ``conflict_protocol``: diagnose ->
# uncertainty weighting / FAMO -> CAGrad (or PCGrad alongside it)
# ONLY if conflict persists. FairGrad is excluded from Muon arms;
# GO4Align / Nash-MTL / SAMO are skipped at K=2.
# ---------------------------------------------------------------------------

def gradient_cosine(g_i, g_j):
    """Cosine similarity between two gradient vectors (flat tensors).
    Logged every run as the interference monitor (contract section 8).
    Returns a float. Zero-norm gradients give cosine 0.0 (no conflict
    signal from a dead gradient -- logged, not hidden)."""
    import torch

    flat_i = torch.cat([t.reshape(-1) for t in g_i]) if isinstance(g_i, (list, tuple)) else g_i.reshape(-1)
    flat_j = torch.cat([t.reshape(-1) for t in g_j]) if isinstance(g_j, (list, tuple)) else g_j.reshape(-1)
    norm_i = torch.norm(flat_i)
    norm_j = torch.norm(flat_j)
    if float(norm_i) == 0.0 or float(norm_j) == 0.0:
        return 0.0
    return float((flat_i @ flat_j) / (norm_i * norm_j))


def pcgrad_project(grad_groups):
    """PCGrad projection over gradient groups -- CONDITIONAL OPTION
    (III-C R5), NOT the default. Use only via ``conflict_protocol``
    step 3 (conflict persists after uncertainty weighting / FAMO),
    alongside CAGrad as the other conditional option. Applied to STEM
    parameters only (head-specific parameters have no conflict -- each
    head owns its own weights).

    ``grad_groups``: dict mapping head key ("S", "DS", "DG", "B") to a
    list of gradient tensors for the shared stem, in FIXED order
    S -> DS -> DG -> B (order fixed so runs are reproducible, not
    random). Rule (pairwise): for each ordered pair (i, j), i != j,
    if cos(g_i, g_j) < 0: g_i <- g_i - (g_i . g_j / ||g_j||^2) * g_j
    (project each gradient onto the normal plane of each gradient it
    conflicts with).

    Returns (projected_groups, cosine_matrix) where cosine_matrix maps
    (i, j) -> cosine, for the interference log. What PCGrad does NOT
    do: it does not resolve WHY the heads conflict, it does not
    re-weight heads, and it does not replace the uncertainty weights
    (direction and scale are separate problems with separate tools).
    """
    import torch

    order = [k for k in ("S", "DS", "DG", "B") if k in grad_groups]
    projected = {k: [t.clone() for t in grad_groups[k]] for k in order}
    cosines = {}
    for i in order:
        for j in order:
            if i != j:
                cosines[(i, j)] = gradient_cosine(projected[i], projected[j])
    for i in order:
        for j in order:
            if i == j:
                continue
            if gradient_cosine(projected[i], projected[j]) < 0:
                dot = sum(float((a * b).sum()) for a, b in zip(projected[i], projected[j]))
                norm_sq = sum(float((b * b).sum()) for b in projected[j])
                if norm_sq == 0.0:
                    continue
                coef = dot / norm_sq
                projected[i] = [a - coef * b for a, b in zip(projected[i], projected[j])]
    return projected, cosines

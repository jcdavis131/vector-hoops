#!/usr/bin/env python3
"""Moonshot joint model -- DRAFT ONLY (MLOps v2, Lane 11).

DRAFT STATUS: spec finalization waits for panel synthesis (contract
section 11, governance hold). This file is a code draft, not a finalized
spec and not a trained model. Train gate is CLOSED (contract section 0
and section 13): NO training runs, NO merges, NO production writes.
Verification for this file is ``python3 -m py_compile`` only, plus the
pure-Python logic checks named in MOONSHOT_SPEC.md section 7 (no torch,
no real data, no parameter updates).

Architecture (contract section 8, Lane 9 design, Lane 8 division,
AS UPDATED by the 2026-10-27 research + panel Addendum III-C)
----------------------------------------------------------------
One shared encoder, SPLIT HEADS (CoJEPA blueprint — see below), one
bridge EXPERIMENTAL ARM (not the default):

    17 tower families (contract section 0 order)
            |
            v
    Shared encoder: tower encoders (per-step tower output, 32 x
    n_families) -> fusion (pooled tower output, 64-d L2)
            |
            +--> Head (a) Matryoshka SupCon on the POOLED output:
            |    z in R^64; prefixes z[:m], m in {8, 16, 32, 64},
            |    re-normalized per prefix (slice + re-normalize)
            |
            +--> Head (b) JEPA predictor, TWO MODES (Lane 9 section 2):
                 Mode S reads the PER-STEP tower output (not the
                 pooled vector) and is CONDITIONED on change/context
                 (IWM trick — conditioning variables stated in
                 PredictorS: team change, role delta, minutes delta).
                 Mode G reads the game-state latent + action triple.

BLUEPRINT CHANGE (research update 2026-10-27, panel III-C R1):
the CoJEPA split-head pattern replaces bridge-first as the default
blueprint. CoJEPA (Meseguer-Brocal et al., submitted 31 Aug 2026,
arXiv PREPRINT, abstract verified): one shared backbone, JEPA on
masked sequence tokens + contrastive on the class token, 7.1M music
model, best or tied-best on the majority of linear-probe MIR tasks
(with honest exceptions: BPM — contrastive marginally leads; beat
tracking — JEPA leads at F-measure .806, CoJEPA .793). COJEPA-MRI
(Mager & Hansen, submitted 12 Jul 2026, arXiv PREPRINT, abstract
verified): JEPA + contrastive on N=2,286 MRI, twin recall@1 0.84,
age MAE 2.55 years, but only MATCHES contrastive-only on BraTS Dice.
Neither is a tabular MLP at ~13k rows, and neither is peer-reviewed
— so the ablations are the proof, not the papers. The mapping onto
a tower-MLP (contrastive head on pooled output, predictive head on
per-step output) is a DESIGN ANALOGY, not a transferred result.

CORRECTION TO THE ORIGINAL BRIEF (III-C, binding as a design change):
the bridge (JEPA prediction as contrastive positive / predictive
positives) is DEMOTED to an EXPERIMENTAL ARM — MJ-with-predictive-
positives vs. MJ-without, decided on Fold 2, never assumed. No paper
in the sweep demonstrates a bridge loss beating parallel heads;
CoJEPA/COJEPA use PARALLEL heads, not a bridge. Default MJ =
parallel heads (bridge arm OFF). The bridge machinery stays in this
file (``augment_positive_sets``, ``check_predictive_positive_
coverage``) for the experimental arm only, labeled as such.

HIERARCHY, EARNED LEVEL BY LEVEL (III-C R2; H-JEPA, Zhang et al.,
submitted 5 Oct 2026, arXiv PREPRINT, abstract + method verified):
AntMaze flat 18% -> three-level 73.3%, BUT Push-T collapses 45.3% ->
17.3% -> 0.7% as levels are added (authors' explanation: short
episodes starve deeper levels of long clips; Push-T numbers via
secondary deep-dive, index-flagged). A 13k-row dataset with short
sequences is exactly the starvation regime. Therefore: 2 levels
first; a 3rd level ONLY if the 2-level model beats the separate
baselines AND passes the timescale diagnostic AND passes the
long-clip sufficiency (Push-T starvation) check. Full 3-4 level
H-JEPA + top-down planner is NOT imported. A shared-latent
(HWM-style) hierarchy is a COMPARISON ARM, not an assumption:
FourRoom shared-latent HWM-3 99.3 beats separate-latent H-JEPA-3
96.0 (secondary table read, index-flagged) — separate latents do
not always win.

What the stem deliberately does NOT contain
--------------------------------------------
- No season token (Lane 4 section 2: an era shortcut for a twin-space
  objective). Mode S must learn career movement, not a season lookup.
- No prediction heads on the stem itself. The v5 champion's stat /
  skill / durability heads are REMOVED, exactly as in Lane 4: the stem
  output is the 64-d twin-space vector, and prediction lives in the
  separate Mode S / Mode G predictor MLPs.
- No sprite input anywhere. Sprite positions are rendering output,
  never training input (contract sections 7 and 12, Lane 8 section 5).
  Any caller that passes replay/sprite data as a model input has left
  this design; there is no code path here that accepts it.

Feature-width handling (contract section 9, items P2/P4 -- READ THIS)
--------------------------------------------------------------------
Lane 4 hardcodes EXPECTED_N_FEATURES = 120. Contract section 9
records that 120 is now known wrong: the verified offline-rebuild
base is 73 columns, the HEAD chain claims 143, the champion export
says 130. Item P4 explicitly forbids hardcoding 73 either: the loader
must accept the pinned width from the feature manifest.

This file therefore takes the tower families as a CONSTRUCTOR
ARGUMENT. The default is the contract section 0 / Lane 4 family table
(17 families, 120 features) because that is the table the task brief
and Lane 4 share -- but the default is a starting table, NOT a pinned
width. Whoever wires this model to a real feature matrix MUST pass
the families from the pinned feature manifest and MUST record which
width was used in the run report. A mismatch between the passed
families and the input feature count fails loud at construction.

Tower skeleton, faithful to Lane 4 (which is faithful to v5)
------------------------------------------------------------
- Tower input convention, unchanged: ``cat([x * m, m])``, mask m in
  {0, 1} per family.
- ResidualTower: ``cat`` (2 * n_family) -> 160 -> 32, LayerNorm +
  GELU, skip connection, 2 residual blocks (champion tag: t32,
  h160, b2).
- Fusion: concat of 17 x 32 = 544 -> 256 -> 128 -> 64 (champion tag:
  concat, fus256, mlp128, d64), L2-normalized output.
- With a non-default family table, the fusion input width is
  32 * n_families, computed from the table -- never hardcoded 544.

Torch is imported LAZILY (inside factory functions), exactly as in
Lane 4, so this file parses and its pure-Python helpers run without
torch installed. Building a model requires torch at call time.

Folds (contract section 9, item P1 -- embargoed folds, adopted here)
--------------------------------------------------------------------
Fold 1: train 10,539 / embargo 2021-22 / val 948.
Fold 2: train 11,491 / embargo 2023-24 / val 500.
Final: train 11,975 / embargo 2024-25 / frozen test 491 (2025-26,
never tuned on). This model file consumes no fold manifest itself;
the numbers are recorded here so any training harness wiring this
model uses the embargoed folds, not the superseded section 2a table
(Fold 2 val "984" -- corrected to 500 by P1).
"""

from __future__ import annotations

import itertools

# ---------------------------------------------------------------------------
# Constants (contract / Lane 9 design, not tuned here)
# ---------------------------------------------------------------------------

NESTING = (8, 16, 32, 64)

# Contract section 0 order. (name, n_features). Sums to 120 -- the
# DEFAULT table only; see the width note in the module docstring.
# The pinned width comes from the feature manifest (contract P2/P4).
DEFAULT_FAMILIES: tuple[tuple[str, int], ...] = (
    ("volume", 10),
    ("playmaking", 10),
    ("rebounding", 8),
    ("defense", 8),
    ("efficiency", 8),
    ("shotmix", 10),
    ("bio", 5),
    ("tracking", 12),
    ("form", 6),
    ("market", 4),
    ("roster", 5),
    ("career", 6),
    ("competition", 6),
    ("team", 8),
    ("pedigree", 4),
    ("playoffs", 5),
    ("honors", 5),
)

# Lane 9 section 6 per-prefix weights. PROPOSED values, pending user
# confirmation -- labeled as such everywhere they appear, never as
# measured facts. SupCon is coarse-heavy (similarity is a coarse
# property); JEPA-S is fine-heavy (career movement lives in the full
# space). Both vectors sum to 1.0.
SUPCON_PREFIX_WEIGHTS_PROPOSED: dict[int, float] = {8: 0.30, 16: 0.30, 32: 0.20, 64: 0.20}
JEPA_S_PREFIX_WEIGHTS_PROPOSED: dict[int, float] = {8: 0.10, 16: 0.20, 32: 0.30, 64: 0.40}

# 14-d game vector (contract section 0 / task brief): the stat surface
# the coarse forecast is read out in. This is NOT a projection of the
# embedding and NOT a second competing latent target (Lane 8 addendum
# section 1.3): Mode S predicts in latent space; the 14-d line is how
# that prediction is expressed and scored in stat space. Whether the
# coarse head ALSO directly predicts the 14-d vector is UNDECIDED
# (Lane 8 addendum section 1.3, open question) -- this file does NOT
# add a 14-d output head. The readout form is a spec decision for
# panel finalization, not something this draft silently adopts.
GAME_VECTOR_STATS: tuple[str, ...] = (
    "PTS", "AST", "OREB", "DREB", "STL", "BLK", "TOV",
    "FG3A", "FGA", "FTA", "FG3_PCT", "FG_PCT", "FT_PCT", "PLUS_MINUS",
)


def family_slices(families):
    """(start, end) column slices per family, in family order."""
    slices = []
    start = 0
    for _, n in families:
        slices.append((start, start + n))
        start += n
    return tuple(slices)


def validate_families(families, n_features):
    """Fail loud if the family table does not match the input width.

    This is the contract P4 guard in code form: neither 120 nor 73 is
    assumed. The caller passes the pinned manifest's families; a
    mismatch is a wiring error, not something to paper over.
    """
    if len(families) != 17:
        raise ValueError(
            f"moonshot: expected 17 tower families, got {len(families)}; "
            "the stem is the 17-family tower skeleton (contract section 0)"
        )
    total = sum(n for _, n in families)
    if total != n_features:
        raise ValueError(
            f"moonshot: family table sums to {total} features but the input "
            f"has {n_features}; pass the families from the pinned feature "
            "manifest (contract section 9, items P2/P4 -- 120 is known "
            "wrong, 73 is the verified base, 143 is unverified)"
        )
    names = [name for name, _ in families]
    if len(set(names)) != len(names):
        raise ValueError(f"moonshot: duplicate family names in table: {names}")
    return True


def slice_and_renormalize_names():
    """Document the inference rule: slice, then re-normalize, per prefix."""
    return {m: f"z[:, :{m}] re-normalized to unit L2" for m in NESTING}


# ---------------------------------------------------------------------------
# Predictive-positive batch augmentation -- pure index logic (no torch)
# ---------------------------------------------------------------------------

def predictive_positive_rows(n_anchors, successors):
    """Which anchors contribute a predictive-positive row, and for whom.

    ``successors`` maps anchor index -> True when that anchor's row has
    a true adjacent-season successor in the TRAINING portion (same
    person_id, both rows in train, pair not crossing a fold boundary --
    Lane 9 section 2.1 eligibility). Returns the list of anchor indices
    whose Mode S prediction is appended to the batch.

    Rules enforced by the caller (see ``augment_positive_sets``):
    - a prediction is appended ONLY for anchors with a true successor;
    - a prediction is a positive-member of its own anchor's set ONLY;
    - a prediction is NEVER an anchor (no loss term is computed with a
      predicted row as anchor);
    - predictions are DETACHED before entering any SupCon term.
    """
    return [i for i in range(n_anchors) if successors.get(i, False)]


def augment_positive_sets(pos_sets, pred_anchor_indices, n_real_rows):
    """Append predictive positives to positive sets (index-level logic).

    ``pos_sets``: list of sets of row indices, one per real anchor row.
    ``pred_anchor_indices``: anchors whose Mode S prediction is appended
    (from ``predictive_positive_rows``).
    ``n_real_rows``: number of real rows in the batch.

    Returns ``(augmented_pos_sets, pred_row_index)`` where
    ``pred_row_index`` maps anchor index -> the appended row index of
    its prediction (real rows 0..n_real_rows-1, predictions appended
    after them, one per contributing anchor, in anchor order).

    The appended rows appear in positive sets and in denominators;
    they are never anchors because no positive set is ever built FOR
    an appended row -- the returned list has exactly n_real_rows
    entries, one per real anchor. A caller that builds a loss over the
    appended rows as anchors has violated Lane 9 section 4.2 rule 3.
    """
    augmented = [set(s) for s in pos_sets]
    pred_row_index = {}
    next_row = n_real_rows
    for anchor in pred_anchor_indices:
        pred_row_index[anchor] = next_row
        augmented[anchor].add(next_row)
        next_row += 1
    return augmented, pred_row_index


def check_predictive_positive_coverage(n_pred_rows, epoch):
    """Lane 9 section 4.2 rule 5: zero predictive-positive rows for a
    full epoch FAILS LOUD. A joint run with no bridge signal is a
    mislabeled multi-task run, not a joint run."""
    if n_pred_rows == 0:
        raise RuntimeError(
            f"moonshot: epoch {epoch} produced zero predictive-positive "
            "rows -- the bridge carried no signal. Failing loud per Lane 9 "
            "section 4.2 rule 5; a joint run with no bridge signal is a "
            "mislabeled multi-task run."
        )
    return True


def check_mode_g_data_gate(game_state_dataset_present, game_state_dataset_sha256=None):
    """Lane 9 section 2.3 / Lane 8 section 6: Mode G trains ONLY when
    the built, validated, frozen game-state dataset exists (historical
    PBP + shot locations + game logs + frozen dataset). Until then
    Mode G is design-gated: Mode G loss weight is zero and its
    components are absent. A run claiming Mode G results without the
    dataset is a fabrication and fails review on its face."""
    if not game_state_dataset_present:
        raise RuntimeError(
            "moonshot: Mode G data gate is CLOSED -- no built, validated, "
            "frozen game-state dataset supplied (Lane 8 section 6 blockers "
            "1-4: historical play-by-play, shot locations, game logs, "
            "frozen dataset). Mode G must stay absent (loss weight zero), "
            "not trained on substitutes. Mode S-only runs are the expected "
            "first Phase 2 runs."
        )
    if not game_state_dataset_sha256:
        raise RuntimeError(
            "moonshot: Mode G dataset supplied without a sha256 -- the "
            "dataset must be versioned and hashed (contract section 6b) "
            "before any Mode G training."
        )
    return True


# ---------------------------------------------------------------------------
# Research-update gates (2026-10-27, panel III-C) -- pure Python
# ---------------------------------------------------------------------------

# Default MJ = parallel heads. The bridge / predictive positives are
# an EXPERIMENTAL ARM only (III-C R1): MJ-with-predictive-positives
# vs. MJ-without, decided on Fold 2, never assumed. A caller that
# enables the bridge arm must label every run report with it.
BRIDGE_ARM_DEFAULT = False

# Hierarchy comparison arms (III-C R2). "separate-latent" = H-JEPA's
# own latent space per level; "shared-latent" = HWM-style hierarchy
# in one shared latent space (FourRoom precedent: shared 99.3 beats
# separate 96.0, arXiv preprint Oct 2026, secondary table read,
# index-flagged). Neither is assumed superior; the arm comparison
# decides. Full 3-4 level H-JEPA + top-down planner is NOT imported.
HIERARCHY_ARMS = ("separate-latent", "shared-latent")


def timescale_diagnostic(slow_long_predictability, fast_long_predictability,
                         slow_threshold, separation_margin):
    """Timescale diagnostic gate before ANY 2nd hierarchy level
    (III-C R2; H-JEPA's own condition: higher levels help only when
    factors evolve at SEPARATED timescales).

    ``slow_long_predictability``: predictability (R^2, accuracy, or
    the finalized spec's chosen statistic -- the caller states which)
    of a candidate slow variable (season / phase / role) over a LONG
    stride. ``fast_long_predictability``: the same statistic for a
    fast variable over the same long stride. Thresholds are CALLER-
    SUPPLIED (no threshold is decided in this draft): the gate passes
    only if the slow variable clears its threshold AND beats the fast
    variable by at least the separation margin. If no slow variable
    is predictable over a long stride while fast ones are not, the
    hierarchy DOES NOT START -- the cheaper probe, a two-timescale
    LOSS (short- + long-horizon heads on one encoder), is used
    instead. Returns (passes, reason).
    """
    if slow_long_predictability < slow_threshold:
        return False, (
            f"timescale diagnostic FAILS: slow-variable long-stride "
            f"predictability {slow_long_predictability:.3f} < threshold "
            f"{slow_threshold:.3f} -- no slow variable to build a level "
            f"on; hierarchy does not start"
        )
    if (slow_long_predictability - fast_long_predictability) < separation_margin:
        return False, (
            f"timescale diagnostic FAILS: slow-fast separation "
            f"{slow_long_predictability - fast_long_predictability:.3f} < "
            f"margin {separation_margin:.3f} -- timescales not separated; "
            f"hierarchy does not start"
        )
    return True, (
        f"timescale diagnostic passes: slow {slow_long_predictability:.3f} "
        f"(threshold {slow_threshold:.3f}), separation "
        f"{slow_long_predictability - fast_long_predictability:.3f} "
        f"(margin {separation_margin:.3f})"
    )


def validate_hierarchy_depth(n_levels, timescale_diagnostic_passed=None,
                             two_level_beats_baselines=None,
                             long_clip_sufficiency_ok=None):
    """Hierarchy depth, earned level by level (III-C R2).

    - Level 1 (single level): always available.
    - Level 2: requires the timescale diagnostic to have PASSED
      (see ``timescale_diagnostic``). Without it, depth 2 is refused.
    - Level 3: requires ALL of: timescale diagnostic passed, the
      2-level model beats the separate baselines, AND long-clip
      data sufficiency confirmed (the Push-T starvation check:
      short sequences starve deeper levels -- H-JEPA preprint Oct
      2026, Push-T 45.3% -> 17.3% -> 0.7% as levels are added).
    - Levels 4+: REFUSED. Full 3-4 level H-JEPA + top-down planner
      is NOT imported in this draft, whatever the diagnostics say.
    Unknown (None) gate values are treated as NOT PASSED -- a gate
    is passed by evidence, never by default.
    """
    if n_levels < 1:
        raise ValueError(f"moonshot hierarchy: n_levels must be >= 1, got {n_levels}")
    if n_levels >= 4:
        raise ValueError(
            "moonshot hierarchy: levels 4+ REFUSED -- full 3-4 level "
            "H-JEPA + top-down planner is NOT imported (III-C R2). "
            "This draft caps depth at 3, and only behind the gates below."
        )
    if n_levels >= 2 and timescale_diagnostic_passed is not True:
        raise ValueError(
            "moonshot hierarchy: level 2 requires a PASSED timescale "
            "diagnostic (III-C R2). Diagnostic missing or failed -- "
            "hierarchy does not start; use the two-timescale loss probe."
        )
    if n_levels >= 3:
        if two_level_beats_baselines is not True:
            raise ValueError(
                "moonshot hierarchy: level 3 requires the 2-level model "
                "to BEAT the separate baselines (III-C R2). Not shown -- "
                "level 3 refused."
            )
        if long_clip_sufficiency_ok is not True:
            raise ValueError(
                "moonshot hierarchy: level 3 requires the Push-T "
                "starvation check (long-clip data sufficiency) to pass. "
                "Not shown -- level 3 refused."
            )
    return True


# ---------------------------------------------------------------------------
# Model factory (torch imported lazily, Lane 4 pattern)
# ---------------------------------------------------------------------------

def build_model(families=DEFAULT_FAMILIES, n_features=None,
                tower_dropout=0.0, game_latent_dim=64,
                play_call_vocab_size=None, career_context=False,
                change_dim=0, bridge_arm=BRIDGE_ARM_DEFAULT,
                hierarchy_arm="separate-latent", n_levels=1,
                timescale_diagnostic_passed=None,
                two_level_beats_baselines=None,
                long_clip_sufficiency_ok=None):
    """Build the joint moonshot model. Returns a torch nn.Module.

    Parameters
    ----------
    families : the 17-family table from the pinned feature manifest.
        Default is the contract section 0 / Lane 4 table (120). Pass
        the manifest's table when the pinned width differs.
    n_features : input feature count; defaults to sum(families).
    tower_dropout : whole-family dropout probability during training
        only (Lane 4 convention); 0.0 disables it.
    game_latent_dim : width of the Mode G game-state latent space.
        Lane 9 section 2.2 deliberately does NOT fix this width -- it
        is a Phase 1 JEPA baseline decision. 64 is a placeholder
        default, flagged as such; the finalized spec must replace it
        with the Phase 1 JEPA width.
    play_call_vocab_size : size of the play-call vocabulary. None
        means the vocabulary is not yet derived from play-by-play
        (Lane 8 section 6 item 5) -- Mode G then cannot be built, and
        this factory raises rather than inventing a vocabulary.
    career_context : whether Mode S concatenates the career-context
        vector (mean of the player's earlier-season embeddings in the
        training portion only). PROPOSED in Lane 9 section 2.1 and
        must be ablated, not assumed -- default off.
    change_dim : width of the IWM change/context conditioning vector
        (team change / role delta / minutes delta, defined by data
        prep). 0 = unconditioned (IWM trick NOT active -- the run
        report must flag this).
    bridge_arm : EXPERIMENTAL ARM flag (III-C R1). Default False =
        parallel heads. True ONLY for the MJ-with-predictive-
        positives arm, decided on Fold 2.
    hierarchy_arm : "separate-latent" or "shared-latent" (III-C R2).
    n_levels : hierarchy depth, gated by validate_hierarchy_depth
        (level 2 needs a passed timescale diagnostic; level 3 needs
        2-level beating separate baselines + long-clip sufficiency;
        levels 4+ refused).
    """
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    if n_features is None:
        n_features = sum(n for _, n in families)
    validate_families(families, n_features)
    slices = family_slices(families)
    n_families = len(families)
    fusion_in = 32 * n_families

    class ResidualTower(nn.Module):
        def __init__(self, d_in, d_out=32, d_hidden=160, n_blocks=2):
            super().__init__()
            d_cat = d_in * 2  # cat([x * m, m])
            self.fc1 = nn.Linear(d_cat, d_hidden)
            self.ln1 = nn.LayerNorm(d_hidden)
            self.fc2 = nn.Linear(d_hidden, d_out)
            self.ln2 = nn.LayerNorm(d_out)
            self.skip = nn.Linear(d_cat, d_out) if d_cat != d_out else nn.Identity()
            self.blocks = nn.ModuleList([_ResBlock(d_out, d_hidden) for _ in range(max(0, n_blocks - 1))])

        def forward(self, x, m):
            h = torch.cat([x * m, m], dim=-1)
            y = self.ln2(self.fc2(F.gelu(self.ln1(self.fc1(h)))) + self.skip(h))
            for blk in self.blocks:
                y = blk(y)
            return y

    class _ResBlock(nn.Module):
        def __init__(self, d, d_hidden):
            super().__init__()
            self.fc1 = nn.Linear(d, d_hidden)
            self.ln1 = nn.LayerNorm(d_hidden)
            self.fc2 = nn.Linear(d_hidden, d)
            self.ln2 = nn.LayerNorm(d)

        def forward(self, y):
            return self.ln2(self.fc2(F.gelu(self.ln1(self.fc1(y)))) + y)

    class SharedStem(nn.Module):
        """17 family towers -> fusion.

        Two outputs, the CoJEPA split-head blueprint (III-C R1):
        - tower_stack: the PER-STEP tower output, concat of tower
          outputs (32 x n_families) -- the predictive head's input.
        - z: the POOLED output, fusion -> 64-d L2 -- the
          contrastive/similarity head's output.
        Prediction heads are REMOVED from the stem itself (Lane 4).
        No season token.
        """

        def __init__(self):
            super().__init__()
            self.tower_dropout = tower_dropout
            self.towers = nn.ModuleList([ResidualTower(n) for _, n in families])
            self.fuse = nn.Sequential(
                nn.Linear(fusion_in, 256),
                nn.GELU(),
                nn.LayerNorm(256),
                nn.Linear(256, 128),
                nn.GELU(),
                nn.LayerNorm(128),
                nn.Linear(128, 64),
            )

        def forward_features(self, x, mask):
            if self.training and self.tower_dropout > 0.0:
                keep = (torch.rand(mask.shape, device=mask.device) >= self.tower_dropout).float()
                empty = keep.sum(dim=1) == 0
                if bool(empty.any()):
                    keep[empty, 0] = 1.0
                mask = mask * keep
            parts = []
            for j, (start, end) in enumerate(slices):
                fam_mask = mask[:, j:j + 1]
                parts.append(self.towers[j](x[:, start:end], fam_mask))
            tower_stack = torch.cat(parts, dim=-1)
            z = F.normalize(self.fuse(tower_stack), dim=-1)
            return tower_stack, z

        def forward(self, x, mask):
            _, z = self.forward_features(x, mask)
            return z

    class PredictorS(nn.Module):
        """Mode S: next-season predictor on the PER-STEP tower output
        (CoJEPA split-head blueprint, III-C R1).

        Input: per-step tower stack (32 x n_families), CONDITIONED on
        the change/context vector (IWM conditioning trick, III-C R4;
        IWM, Garrido et al., Mar 2024, arXiv preprint, abstract
        verified): conditioning is the control knob -- the predictive
        head is EQUIVARIANT (it must track what changed) while the
        similarity head is trained INVARIANT to nuisance variation.
        Conditioning variables, stated EXPLICITLY (data prep must
        define and supply them; dimension = change_dim):
        - team change: whether the player's team changed into this
          season (and, where the prep defines it, the direction of
          the move in style space);
        - role delta: change in the player's role / usage profile
          between seasons, as defined by data prep;
        - minutes delta: change in playing time / availability
          between seasons.
        If change_dim == 0, no conditioning vector is supplied and
        the predictor runs UNCONDITIONED -- the run report must flag
        that the IWM conditioning trick is NOT active, not imply it.
        Optional career-context vector (mean of the player's
        earlier-season embeddings, training portion only) is a
        PROPOSED ablation (Lane 9 section 2.1), not a default.
        Output: predicted next-season embedding zhat_{t+1} (64-d, L2).
        """

        def __init__(self, change_dim=0):
            super().__init__()
            self.change_dim = change_dim
            d_in = fusion_in
            if career_context:
                d_in += 64
            if change_dim > 0:
                d_in += change_dim
            self.net = nn.Sequential(
                nn.Linear(d_in, 128),
                nn.GELU(),
                nn.LayerNorm(128),
                nn.Linear(128, 64),
            )

        def forward(self, tower_stack, career_ctx=None, change_ctx=None):
            parts = [tower_stack]
            if career_context:
                if career_ctx is None:
                    raise ValueError("moonshot Mode S: career_context=True but no career_ctx supplied")
                parts.append(career_ctx)
            if self.change_dim > 0:
                if change_ctx is None:
                    raise ValueError(
                        "moonshot Mode S: change_dim > 0 but no change_ctx supplied -- "
                        "the IWM conditioning variables (team change / role delta / "
                        "minutes delta) must be supplied by data prep"
                    )
                if change_ctx.shape[-1] != self.change_dim:
                    raise ValueError(
                        f"moonshot Mode S: change_ctx width {change_ctx.shape[-1]} != "
                        f"change_dim {self.change_dim}"
                    )
                parts.append(change_ctx)
            h = torch.cat(parts, dim=-1) if len(parts) > 1 else tower_stack
            return F.normalize(self.net(h), dim=-1)

    class ActionEncoder(nn.Module):
        """Mode G action encoder: the (play call, lineup, matchup) triple.

        - play call: learned embedding per call id. The vocabulary MUST
          be derived from what play-by-play actually distinguishes
          (Lane 8 section 2.1); this factory refuses to build with an
          unknown vocabulary rather than inventing labels.
        - lineup: mean of the on-floor players' style-context vectors
          (twin-space profiles consulted as features, Lane 8 section
          3.3 -- never confused with the game state itself).
        - matchup: mean of the matchup-pair style-context vectors.
        All three are concatenated into one action embedding.
        """

        def __init__(self):
            super().__init__()
            if play_call_vocab_size is None:
                raise ValueError(
                    "moonshot Mode G: play_call_vocab_size is None -- the "
                    "action vocabulary must be derived from real "
                    "play-by-play (Lane 8 section 6 item 5), not invented. "
                    "Mode G stays unbuilt until that vocabulary exists."
                )
            self.play_call_embedding = nn.Embedding(play_call_vocab_size, 32)
            self.proj = nn.Sequential(
                nn.Linear(32 + 64 + 64, 128),
                nn.GELU(),
                nn.LayerNorm(128),
            )

        def forward(self, play_call_ids, lineup_style, matchup_style):
            pc = self.play_call_embedding(play_call_ids)
            h = torch.cat([pc, lineup_style, matchup_style], dim=-1)
            return self.proj(h)

    class PredictorG(nn.Module):
        """Mode G: action-triple-conditioned next-game-state predictor.

        Input: current game-state latent s_t + action embedding.
        Output: predicted next game-state latent shat_{t+1}, in
        GAME-STATE latent space -- never twin space. Its predictions
        NEVER enter the SupCon batch (Lane 9 section 4.3). The
        game-state encoder itself (Lane 8 section 3.2 component 1) is
        a Phase 1 JEPA component and is NOT built here: this draft
        takes s_t as input and defines the predictor + action
        encoder, which are the joint model's Mode G parts. Wiring a
        real state encoder in is a Phase 1 JEPA deliverable.
        """

        def __init__(self, action_encoder):
            super().__init__()
            self.action_encoder = action_encoder
            self.net = nn.Sequential(
                nn.Linear(game_latent_dim + 128, 128),
                nn.GELU(),
                nn.LayerNorm(128),
                nn.Linear(128, game_latent_dim),
            )

        def forward(self, s_t, play_call_ids, lineup_style, matchup_style):
            a = self.action_encoder(play_call_ids, lineup_style, matchup_style)
            h = torch.cat([s_t, a], dim=-1)
            return F.normalize(self.net(h), dim=-1)

    class MoonshotModel(nn.Module):
        """Shared stem + SupCon head (a) + JEPA predictor heads (b)."""

        def __init__(self):
            super().__init__()
            self.stem = SharedStem()
            self.predictor_s = PredictorS(change_dim=change_dim)
            self.predictor_g = None  # built only when the Mode G gates open
            self.action_encoder = None
            self.families = tuple(families)
            self.n_features = n_features
            self.game_latent_dim = game_latent_dim
            self.career_context = career_context
            self.change_dim = change_dim
            # Bridge arm (III-C R1): default OFF (parallel heads).
            # True ONLY for the MJ-with-predictive-positives arm,
            # decided on Fold 2; every run report must carry this flag.
            self.bridge_arm = bool(bridge_arm)
            # Hierarchy arm + depth (III-C R2): depth is earned, and
            # validate_hierarchy_depth refuses ungated depth at build.
            if hierarchy_arm not in HIERARCHY_ARMS:
                raise ValueError(
                    f"moonshot hierarchy: unknown arm {hierarchy_arm!r}; "
                    f"arms are {HIERARCHY_ARMS}"
                )
            validate_hierarchy_depth(
                n_levels,
                timescale_diagnostic_passed=timescale_diagnostic_passed,
                two_level_beats_baselines=two_level_beats_baselines,
                long_clip_sufficiency_ok=long_clip_sufficiency_ok,
            )
            self.hierarchy_arm = hierarchy_arm
            self.n_levels = n_levels

        def enable_mode_g(self, game_state_dataset_present, game_state_dataset_sha256=None):
            """Open Mode G ONLY when its data gate opens (Lane 9 2.3).

            Raises until a built, validated, frozen game-state dataset
            exists. This is a deliberate construction-time gate, not a
            runtime flag an operator can flip casually.
            """
            check_mode_g_data_gate(game_state_dataset_present, game_state_dataset_sha256)
            self.action_encoder = ActionEncoder()
            self.predictor_g = PredictorG(self.action_encoder)
            return self

        def prefixes(self, z):
            """Slice + re-normalize at every Matryoshka width."""
            return {m: F.normalize(z[:, :m], dim=-1) for m in NESTING}

        def forward(self, x, mask, career_ctx=None, change_ctx=None,
                    s_t=None, play_call_ids=None, lineup_style=None, matchup_style=None):
            tower_stack, z = self.stem.forward_features(x, mask)
            out = {"tower_stack": tower_stack, "z": z, "z_prefixes": self.prefixes(z),
                   "bridge_arm": self.bridge_arm,
                   "hierarchy_arm": self.hierarchy_arm, "n_levels": self.n_levels}
            out["pred_s"] = self.predictor_s(tower_stack, career_ctx, change_ctx)
            out["pred_s_prefixes"] = self.prefixes(out["pred_s"])
            if self.predictor_g is not None:
                if s_t is None or play_call_ids is None:
                    raise ValueError("moonshot Mode G enabled but no game state / action supplied")
                out["pred_g"] = self.predictor_g(s_t, play_call_ids, lineup_style, matchup_style)
            else:
                out["pred_g"] = None  # Mode G data-gated: absent, not zero
            return out

    return MoonshotModel()

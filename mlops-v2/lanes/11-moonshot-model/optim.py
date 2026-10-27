#!/usr/bin/env python3
"""Moonshot optimizer configs -- DRAFT ONLY (MLOps v2, Lane 11).

DRAFT STATUS: spec finalization waits for panel synthesis (contract
section 11, governance hold). Train gate is CLOSED (contract sections
0 and 13): NO training runs, NO merges, NO production writes. This
file defines optimizer CONFIGURATIONS and a Muon implementation
draft; it does not run any optimization step. Verification is
``python3 -m py_compile`` plus the pure-Python checks in
MOONSHOT_SPEC.md section 7 (no torch, no real data, no parameter
updates). Torch is imported lazily inside builder functions, Lane 4
pattern, so this file parses without torch installed.

Muon facts encoded here (user-confirmed 2026-10-26 22:40 CDT, via the
task brief -- carried, not re-derived)
---------------------------------------------------------------------
- Muon = MomentUm Orthogonalized by Newton-Schulz (Jordan et al.
  2024).
- Momentum + 5-step Newton-Schulz orthogonalization, applied to
  hidden 2D weights.
- 1 optimizer buffer, vs. Adam's 2 (first + second moment).
- AdamW fallback for 1D parameters, embeddings, and heads.

Fit to THIS model is UNPROVEN (task brief + contract section 13):
the published Muon evidence is LLM-scale (NanoGPT-scale speedups,
Moonlight-16B, Kimi K2 MuonClip, and later large-model adoptions are
all large-model results). Our towers are small MLPs on 12,966 rows
on CPU. Muon must therefore be compared against AdamW by ABLATION
on the forecast task -- never adopted on faith. This file makes NO
adoption recommendation. The decision rule (adopt / ablate-further /
skip) is a PROPOSED rule for the panel's moonshot verdict: the panel
is charged with Muon adopt/ablate/skip, and this draft does not
pre-empt it. See MUON_ABLATION.md.

RESEARCH UPDATE 2026-10-27 (panel Addendum III-C, R3) — DESIGN
CHANGES APPLIED HERE, still DRAFT (finalization BLOCKED until the
user rules on III-A Q1–Q3 + III-B Q1; training/merges/prod writes
stay gated):
- CONTROL CHANGES: the control arm is now AdamW+EMA, NOT plain
  AdamW. Tabular benchmark (Gorishniy et al., Apr 2026, arXiv
  PREPRINT, full text verified): 15 optimizers, 17 tabular datasets,
  per-optimizer Optuna tuning, early stopping, 10 seeds, Welch
  t-test — plain MLP Δscore vs MLP[AdamW]: Muon +0.32, AdamW+EMA
  +0.66 (EMA BEATS Muon on the plain MLP); best TabM variant +0.40;
  summary 55 wins / 25 ties / 5 losses vs AdamW. Training-time
  overhead vs AdamW: plain MLP 2.98x, MLP+PLE 2.28x, TabM 1.57x.
  Per-dataset row counts NOT verified (no claim at exactly 12,966
  rows); CPU-vs-GPU timing breakdown NOT verified.
- CHALLENGER = hybrid Muon: 2D matrices only, WITH weight decay AND
  √max(A,B) RMS scaling (Moonlight, Liu et al., Feb 2025, arXiv
  tech report, excerpts verified: scaling ×0.2 so update RMS matches
  AdamW's ~0.2–0.4 across matrix shapes; without weight decay,
  weights/RMS grew beyond bf16 range). AdamW fallback for
  1D/embeddings/heads/biases/norms. MuonClip's QK-Clip is EXCLUDED:
  attention-specific (caps attention logits, τ=100 in Kimi K2),
  meaningless for an MLP with no attention.
- ADOPTION IS MAE-LED: beat AdamW+EMA beyond the bootstrap interval
  on Fold 2 with ZERO stability cost. A wall-clock argument alone
  CANNOT adopt Muon here (2.98x tabular cost points the other way
  on a plain MLP). Wall-clock MUST be measured ON OUR ROWS (CPU
  timing at 12,966 rows is UNVERIFIED) — never quote LLM "1%
  overhead" or Moonlight's ~2x FLOPs figure (3B-active/16B MoE,
  5.7T tokens, compute-optimal pretraining comparison).
- NOISE-ROBUSTNESS CHECK: multiple seeds + loss-spike reporting.
  Low-SNR caution (Rethinking Muon Beyond Pretraining, 2026, arXiv
  PREPRINT, snippets verified): Muon accuracy stayed near zero in
  RLVR post-training (GRPO/GMPO × MATH/GSM8K, 8 settings), mechanism
  given as uniform whitening amplifying noisy directions — NOT a
  tabular experiment, but 13k noisy rows ARE a low-SNR regime, so
  the caution transfers as a check, not as a result.
- Per-optimizer LR tuning (never reuse AdamW's LR for Muon),
  multiple seeds, early stopping (tabular-benchmark protocol).
  FairGrad is EXCLUDED from any Muon arm (III-C R5).
- Do NOT adopt Muon on LLM claims. Do NOT import Muon-as-whole-
  model, diffusion/video planners, or "provably anti-collapse" as a
  guarantee.

---------------------------------------------------------------------
- Muon group: parameters with ndim == 2 that are NOT embeddings and
  NOT heads. "Hidden 2D weights" = the tower Linear weights and the
  fusion MLP weights of the shared stem.
- AdamW group: everything else -- 1D parameters (biases, LayerNorm
  gains/biases), embedding tables (any parameter whose name contains
  "embedding", including the action encoder's play-call embedding),
  and head parameters (any parameter whose name contains "predictor",
  "head", or "action_encoder": Mode S / Mode G predictors and the
  Mode G action encoder are head assemblies, not stem weights).
  Rationale, per the brief: AdamW fallback for 1D/embeddings/heads.
  Newton-Schulz orthogonalization is defined for matrices; applying
  it to a vector or an embedding table is a category error, and
  heads are the parts whose loss landscape the ablation must keep
  comparable across optimizers.
- The partition is computed from NAMED parameters and must be logged
  in the run report (group sizes + parameter counts), so an ablation
  run's optimizer assignment is auditable after the fact. A
  parameter assigned to neither group, or to both, fails loud.

Hyperparameter values below are PROPOSED placeholder defaults for
the ablation design, pending val-only tuning and panel review --
never tuned or measured Hoops values. In particular, Muon's learning
rate is NOT comparable to AdamW's: Muon updates are orthogonalized
(roughly unit-scale per step before the lr multiplier), so the two
optimizers need SEPARATE lr grids in the ablation (MUON_ABLATION.md
section 3), not one shared grid. Comparing them on one shared lr
would rig the comparison.
"""

from __future__ import annotations

from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Configs (pure Python dataclasses -- no torch needed to construct them)
# ---------------------------------------------------------------------------

@dataclass
class AdamWConfig:
    """AdamW baseline config. lr/weight_decay are PROPOSED placeholders
    for the ablation grid (MUON_ABLATION.md section 3), not tuned values.
    Lane 4's training script takes lr/weight_decay as CLI arguments;
    the ablation's AdamW arm must use the same lr grid discipline
    (tuned on val only) so the comparison is fair."""
    lr: float = 1e-3
    weight_decay: float = 0.01
    betas: tuple[float, float] = (0.9, 0.999)
    eps: float = 1e-8


@dataclass
class EMAConfig:
    """Exponential moving average of parameters, for the AdamW+EMA
    CONTROL arm (III-C R3). The EMA weights are the evaluated
    weights (the benchmark's AdamW+EMA arm evaluates the averaged
    weights, not the raw trajectory). Decay is a PROPOSED placeholder
    (0.999, matching the Lane 9 EMA-target proposal's order of
    magnitude) -- the finalized spec must confirm it; it is not a
    measured value for this model."""
    decay: float = 0.999


@dataclass
class MuonConfig:
    """Muon config (Jordan et al. 2024 pattern, as confirmed in the brief).

    - lr: PROPOSED placeholder. Muon lr is NOT on AdamW's scale (see
      module docstring); the ablation grids it separately, and
      per-optimizer LR tuning is mandatory (never reuse AdamW's LR).
    - momentum: the single momentum buffer (1 buffer vs. Adam's 2).
    - weight_decay: decoupled, applied to the Muon group as in the
      standard Muon recipe; AdamW-group parameters use the AdamW
      config's weight decay, not this one. REQUIRED, not optional:
      Moonlight (Feb 2025 tech report) shows weights/RMS growing
      beyond bf16 range without it.
    - ns_steps: Newton-Schulz iterations -- 5, per the brief (not a
      tuning knob in the ablation's first pass).
    - nesterov: Nesterov momentum variant (standard Muon recipe);
      kept as a flag so the ablation can record which variant ran.
    - rms_scale: apply the Moonlight √max(A,B) RMS scaling (times
      rms_scale_factor 0.2) to each orthogonalized update, so update
      RMS matches AdamW's ~0.2-0.4 across matrix shapes. A small
      tower's matrices vary in shape, so this scaling is NOT
      optional decoration. MuonClip's QK-Clip is NOT part of this
      config: attention-specific, excluded for MLPs (III-C R3).
    """
    lr: float = 0.02
    momentum: float = 0.95
    weight_decay: float = 0.01
    ns_steps: int = 5
    nesterov: bool = True
    rms_scale: bool = True
    rms_scale_factor: float = 0.2


@dataclass
class JointOptimizerConfig:
    """One ablation arm's full optimizer configuration.

    ``optimizer`` selects the arm:
    - "adamw-ema": THE CONTROL (III-C R3) -- AdamW + EMA of the
      parameters, evaluated on the EMA weights. This is the arm
      Muon must beat; plain AdamW is no longer the control.
    - "adamw": legacy plain-AdamW arm, kept for reference only.
      A Muon-vs-plain-AdamW comparison WITHOUT the AdamW+EMA arm
      is an incomplete ablation after III-C and must not be
      reported as the verdict.
    - "muon": challenger -- hybrid Muon for hidden 2D stem weights
      + AdamW fallback for 1D/embeddings/heads/biases/norms.
    There is no "Muon everywhere" arm: a pure-Muon run violates the
    fallback rule and is excluded by design, not by omission.
    FairGrad is EXCLUDED from any Muon arm (III-C R5).
    """
    optimizer: str = "adamw-ema"
    adamw: AdamWConfig = field(default_factory=AdamWConfig)
    muon: MuonConfig = field(default_factory=MuonConfig)
    ema: EMAConfig = field(default_factory=EMAConfig)

    def validate(self):
        if self.optimizer not in ("adamw", "adamw-ema", "muon"):
            raise ValueError(
                f"moonshot optim: unknown optimizer {self.optimizer!r}; "
                "ablation arms are 'adamw-ema' (control), 'adamw' "
                "(legacy reference), and 'muon' (challenger)"
            )
        if self.muon.ns_steps != 5:
            raise ValueError(
                f"moonshot optim: Muon ns_steps must be 5 per the brief "
                f"(Newton-Schulz 5-step), got {self.muon.ns_steps}"
            )
        return True


# The control arm, named in one place so no report can silently
# substitute plain AdamW for it (III-C R3).
CONTROL_ARM = "adamw-ema"


# ---------------------------------------------------------------------------
# Parameter partition (pure Python logic over (name, ndim) pairs)
# ---------------------------------------------------------------------------

def partition_param_names(named_ndims):
    """Split named parameters into Muon vs. AdamW groups.

    ``named_ndims``: iterable of (name, ndim) pairs. Returns
    (muon_names, adamw_names). Rules (see module docstring):
    - name contains "embedding" -> AdamW (embedding tables, including
      the action encoder's play-call embedding);
    - name contains "predictor", "head", or "action_encoder" -> AdamW
      (heads and head assemblies);
    - ndim == 2 otherwise -> Muon (hidden 2D stem weights);
    - anything else (1D, 0D, 3D+) -> AdamW.
    Every parameter lands in exactly one group; an empty Muon group
    fails loud (a Muon arm with nothing for Muon to optimize is a
    mislabeled AdamW run).
    """
    muon, adamw = [], []
    for name, ndim in named_ndims:
        lowered = name.lower()
        if ("embedding" in lowered or "predictor" in lowered
                or "head" in lowered or "action_encoder" in lowered):
            adamw.append(name)
        elif ndim == 2:
            muon.append(name)
        else:
            adamw.append(name)
    if set(muon) & set(adamw):
        raise ValueError("moonshot optim: parameter partition overlap (a parameter in both groups)")
    return muon, adamw


def check_partition_covers_all(named_ndims, muon_names, adamw_names):
    """Audit helper: the partition must cover every parameter exactly once."""
    all_names = [name for name, _ in named_ndims]
    if sorted(muon_names + adamw_names) != sorted(all_names):
        raise ValueError(
            "moonshot optim: partition does not cover all parameters exactly once; "
            "the run report's optimizer assignment would be unauditable"
        )
    return True


# ---------------------------------------------------------------------------
# Torch builders (lazy imports; no step is ever taken by this module)
# ---------------------------------------------------------------------------

def zeropower_via_newtonschulz5(grad, steps=5, eps=1e-7):
    """Newton-Schulz orthogonalization (5 steps, per the brief).

    Takes a 2D gradient tensor and returns its orthogonalized form:
    normalize by Frobenius norm, then iterate the quintic NS update
    X <- X @ (3I + X^T X @ (X^T X - ... )) -- in the standard
    coefficients form: X = X @ (a*I + X^T X @ (b*I + c * X^T X)) with
    (a, b, c) = (3.4445, -4.7750, 2.0315). This is the Muon recipe's
    orthogonalization step, stated here as the design's formula.
    Requires torch at call time; never called by this module itself.
    """
    import torch

    if steps != 5:
        raise ValueError(f"moonshot Muon: ns_steps must be 5 per the brief, got {steps}")
    if grad.ndim != 2:
        raise ValueError(f"moonshot Muon: NS orthogonalization needs a 2D tensor, got ndim={grad.ndim}")
    x = grad / (torch.norm(grad) + eps)
    if x.shape[0] > x.shape[1]:
        x = x.T
        transposed = True
    else:
        transposed = False
    a, b, c = 3.4445, -4.7750, 2.0315
    for _ in range(steps):
        x = x @ (a * torch.eye(x.shape[1], device=x.device, dtype=x.dtype)
                 + (x.T @ x) @ (b * torch.eye(x.shape[1], device=x.device, dtype=x.dtype)
                                + c * (x.T @ x)))
    if transposed:
        x = x.T
    return x


def build_optimizer(model, config=None):
    """Build the optimizer(s) for one ablation arm. Returns a list of
    torch optimizers (one for the AdamW arm; two -- Muon + AdamW
    fallback -- for the Muon arm) plus a partition report dict.

    This function CONSTRUCTS optimizers; it never steps them. Any
    training step happens only in a training harness, only after
    training is separately authorized (contract section 0).
    """
    import torch

    config = config or JointOptimizerConfig()
    config.validate()
    named = [(name, p.ndim) for name, p in model.named_parameters()]
    muon_names, adamw_names = partition_param_names(named)
    check_partition_covers_all(named, muon_names, adamw_names)
    by_name = dict(model.named_parameters())

    if config.optimizer in ("adamw", "adamw-ema"):
        optimizers = [torch.optim.AdamW(
            model.parameters(), lr=config.adamw.lr,
            betas=config.adamw.betas, eps=config.adamw.eps,
            weight_decay=config.adamw.weight_decay)]
        partition_report = {
            "arm": config.optimizer,
            "is_control": config.optimizer == CONTROL_ARM,
            "muon_group": [], "adamw_group": muon_names + adamw_names,
            "muon_param_count": 0,
            "adamw_param_count": sum(p.numel() for p in model.parameters()),
        }
        if config.optimizer == "adamw-ema":
            # EMA control (III-C R3): the harness calls ema.update()
            # after each optimizer step and evaluates the EMA weights
            # (ema.copy_to), not the raw trajectory. The EMA object
            # is returned alongside the optimizers via the report's
            # companion: build_ema() below constructs it from the
            # same model; the harness owns the update/eval calls.
            partition_report["ema"] = {"decay": config.ema.decay,
                                       "evaluated_weights": "ema"}
        return optimizers, partition_report

    # Muon arm: Muon for hidden 2D stem weights, AdamW fallback for the rest.
    if not muon_names:
        raise ValueError(
            "moonshot Muon arm: empty Muon group -- a Muon run with "
            "nothing for Muon to optimize is a mislabeled AdamW run"
        )

    class Muon(torch.optim.Optimizer):
        """Minimal Muon draft: momentum buffer + NS orthogonalization
        + Moonlight RMS scaling.

        One buffer per parameter (momentum), vs. Adam's two. Update:
        buf = momentum * buf + grad (+ Nesterov correction when
        enabled); orth = NS5(buf); step = orth * lr * rms, with
        decoupled weight decay, where rms = 0.2 * sqrt(max(A, B))
        when rms_scale is on (Moonlight Feb 2025 tech report: the
        scaling matches update RMS to AdamW's ~0.2-0.4 across matrix
        shapes; without weight decay, weights/RMS grew beyond bf16
        range). QK-Clip is NOT implemented: attention-specific,
        excluded for MLPs (III-C R3). FairGrad is NOT combined with
        this optimizer (III-C R5 exclusion).
        This is a DRAFT implementation of the confirmed recipe, not a
        tuned or benchmarked optimizer; the ablation (MUON_ABLATION.md)
        is what measures it against AdamW+EMA on this model.
        """

        def __init__(self, params, lr=0.02, momentum=0.95, weight_decay=0.01,
                     ns_steps=5, nesterov=True, rms_scale=True,
                     rms_scale_factor=0.2):
            if ns_steps != 5:
                raise ValueError("moonshot Muon: ns_steps must be 5 per the brief")
            super().__init__(params, dict(lr=lr, momentum=momentum,
                                          weight_decay=weight_decay,
                                          ns_steps=ns_steps, nesterov=nesterov,
                                          rms_scale=rms_scale,
                                          rms_scale_factor=rms_scale_factor))

        @torch.no_grad()
        def step(self, closure=None):
            import math

            for group in self.param_groups:
                lr = group["lr"]
                momentum = group["momentum"]
                wd = group["weight_decay"]
                nesterov = group["nesterov"]
                for p in group["params"]:
                    if p.grad is None:
                        continue
                    grad = p.grad
                    state = self.state[p]
                    if "momentum_buffer" not in state:
                        state["momentum_buffer"] = torch.zeros_like(p)
                    buf = state["momentum_buffer"]
                    buf.mul_(momentum).add_(grad)
                    update = grad.add(buf, alpha=momentum) if nesterov else buf
                    if wd != 0:
                        p.mul_(1 - lr * wd)
                    orth = zeropower_via_newtonschulz5(update, steps=group["ns_steps"])
                    if group["rms_scale"]:
                        scale = group["rms_scale_factor"] * math.sqrt(max(p.shape))
                    else:
                        scale = 1.0
                    p.add_(orth * lr * scale)

    muon_params = [by_name[n] for n in muon_names]
    adamw_params = [by_name[n] for n in adamw_names]
    muon_opt = Muon(muon_params, lr=config.muon.lr, momentum=config.muon.momentum,
                    weight_decay=config.muon.weight_decay, ns_steps=config.muon.ns_steps,
                    nesterov=config.muon.nesterov, rms_scale=config.muon.rms_scale,
                    rms_scale_factor=config.muon.rms_scale_factor)
    adamw_opt = torch.optim.AdamW(
        adamw_params, lr=config.adamw.lr, betas=config.adamw.betas,
        eps=config.adamw.eps, weight_decay=config.adamw.weight_decay)
    partition_report = {
        "arm": "muon",
        "is_control": False,
        "muon_group": muon_names, "adamw_group": adamw_names,
        "muon_param_count": sum(by_name[n].numel() for n in muon_names),
        "adamw_param_count": sum(by_name[n].numel() for n in adamw_names),
        "muon_config": {"lr": config.muon.lr, "momentum": config.muon.momentum,
                        "weight_decay": config.muon.weight_decay,
                        "ns_steps": config.muon.ns_steps, "nesterov": config.muon.nesterov,
                        "rms_scale": config.muon.rms_scale,
                        "rms_scale_factor": config.muon.rms_scale_factor},
        "adamw_fallback_config": {"lr": config.adamw.lr,
                                  "weight_decay": config.adamw.weight_decay},
        "excluded": ["qk-clip (attention-specific, no MLP analogue)",
                     "fairgrad (excluded from Muon arms, III-C R5)"],
    }
    return [muon_opt, adamw_opt], partition_report


def build_ema(model, config=None):
    """Build the EMA tracker for the AdamW+EMA control arm (III-C R3).

    Returns an EMA object with ``update()`` (call after each
    optimizer step), ``copy_to(model)`` (evaluate the EMA weights),
    and ``restore(model)`` (return to the raw weights). The harness
    owns when update/copy_to/restore are called; this function only
    constructs the tracker. Requires torch at call time.
    """
    import torch

    config = config or JointOptimizerConfig()
    decay = config.ema.decay

    class EMA:
        def __init__(self):
            self.decay = decay
            self.shadow = {name: p.detach().clone()
                           for name, p in model.named_parameters()}

        @torch.no_grad()
        def update(self):
            for name, p in model.named_parameters():
                self.shadow[name].mul_(self.decay).add_(
                    p.detach(), alpha=1.0 - self.decay)

        @torch.no_grad()
        def copy_to(self, target_model):
            self._backup = {name: p.detach().clone()
                            for name, p in target_model.named_parameters()}
            for name, p in target_model.named_parameters():
                p.copy_(self.shadow[name])

        @torch.no_grad()
        def restore(self, target_model):
            for name, p in target_model.named_parameters():
                p.copy_(self._backup[name])

    return EMA()

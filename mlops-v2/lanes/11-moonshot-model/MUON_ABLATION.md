# Muon vs. AdamW+EMA Ablation — DESIGN ONLY (Lane 11)

**DRAFT — spec finalization waits for panel synthesis (contract §11)
and, per the follow-up brief, is BLOCKED until the user rules on
III-A Q1–Q3 + III-B Q1.**
**Train gate CLOSED (contract §§0, 13): no training runs, no merges,
no production writes.** This document is an ablation DESIGN. It
decides nothing. It recommends nothing. The panel is charged with
Muon adopt/ablate/skip, and this design is input to that verdict.

**RESEARCH UPDATE 2026-10-27 (panel Addendum III-C, R3) — applied
here.** The control changed, the adoption rule changed, and the
evidence table changed. Every 2025–2026 research item below is cited
with its preprint flag; research moves priors, gates decide. Nearly
all 2025–2026 items are arXiv preprints, NOT peer-reviewed.

## 1. The question

Does Muon beat **AdamW+EMA** — not plain AdamW — **on this model, on
this data, on CPU** — or is the published Muon evidence irrelevant
at this scale?

The question is asked this way deliberately, because the evidence
does not transfer by itself:

| What is known | What it does NOT establish |
|---|---|
| Muon = MomentUm Orthogonalized by Newton-Schulz (Jordan et al. 2024 — a blog post / speedrun write-up, NOT a peer-reviewed paper; cite it as such): momentum + 5-step NS orthogonalization for hidden 2D weights, 1 buffer vs. Adam's 2, AdamW fallback for 1D/embeddings/heads/biases/norms | Anything about small MLP towers on 12,966 rows on CPU |
| Tabular-MLP benchmark (Gorishniy et al., Apr 2026, arXiv PREPRINT, full text verified): 15 optimizers, 17 tabular datasets, per-optimizer Optuna tuning, early stopping, 10 seeds, Welch t-test — Muon best overall, BUT plain-MLP Δscore vs MLP[AdamW] only +0.32 while AdamW+EMA scores +0.66 on the same table (EMA BEATS Muon on the plain MLP); best TabM variant +0.40; summary 55 wins / 25 ties / 5 losses vs AdamW; plain-MLP training-time overhead 2.98× (MLP+PLE 2.28×, TabM 1.57×). Authors' own limits: purely empirical, no theory, slower training. Per-dataset row counts NOT verified (no claim at exactly 12,966 rows); CPU-vs-GPU timing breakdown NOT verified | That Muon beats AdamW+EMA on OUR rows, or that 2.98× is our cost — CPU timing at 12,966 rows is UNVERIFIED and must be measured |
| Moonlight ~52% of AdamW's training FLOPs (~2× compute efficiency), 3B-active/16B MoE, 5.7T tokens (Liu et al., Feb 2025, arXiv tech report, excerpts verified) | Anything numeric for a CPU MLP — a compute-optimal pretraining comparison, not a small-model result. NEVER quote it as our expected speedup |
| Kimi K2 MuonClip (Jul 2025, arXiv tech report, snippet verified): Muon + weight decay + consistent RMS + QK-Clip (τ=100); vanilla Muon drove max attention logits above 1000 with loss spikes at 9B-active/53B MoE scale | Anything for an MLP: QK-Clip caps ATTENTION logits and is meaningless with no attention — EXCLUDED from this ablation; only weight decay + √max(A,B) RMS scaling transfer |
| Low-SNR caution (Rethinking Muon Beyond Pretraining, 2026, arXiv PREPRINT, snippets verified): Muon accuracy stayed near zero in RLVR post-training (GRPO/GMPO × MATH/GSM8K, 8 settings), mechanism given as uniform whitening amplifying noisy directions | A tabular result — it is NOT one. But 13k noisy rows ARE a low-SNR regime, so the caution transfers as a NOISE-ROBUSTNESS CHECK (multiple seeds + loss-spike reporting), not as a verdict |

**Fit to this model is UNPROVEN.** That sentence is the whole reason
this ablation exists. An ablation that "adopts Muon because the
papers say so" is not an ablation; it is a press release. An
ablation that "skips Muon because small models don't need it" is
not an ablation either; it is a prejudice. The ablation measures —
against the stronger control.

## 2. Arms (exactly two in the first pass + one legacy reference)

| Arm | Optimizer assignment | Config source | Role |
|---|---|---|---|
| C — AdamW+EMA | AdamW + EMA of the parameters; EMA weights are the evaluated weights | `optim.py` `AdamWConfig` + `EMAConfig` (decay PROPOSED 0.999) | **THE CONTROL.** Muon must beat THIS arm. |
| M — hybrid Muon | Muon on hidden 2D stem weights (weight decay + √max(A,B) RMS scaling ×0.2); AdamW fallback for 1D/embeddings/heads/biases/norms | `optim.py` `MuonConfig` + `AdamWConfig` (fallback group) | **CHALLENGER.** |
| L — plain AdamW | All parameters via AdamW | `optim.py` `AdamWConfig` | Legacy reference ONLY. A Muon-vs-plain-AdamW comparison without arm C is an incomplete ablation after III-C and must not be reported as the verdict. |

**Excluded by design, not by omission:** a "Muon everywhere" arm
(violates the fallback rule); MuonClip's QK-Clip (attention-specific,
no MLP analogue); FairGrad in any Muon arm (III-C R5:
magnitude-sensitive + spectral-flattening interaction with Muon).
Newton-Schulz orthogonalization is defined for matrices; applying it
to vectors, embedding tables, or head parameters violates the
brief's fallback rule and would make the arm uninterpretable.

**Parameter partition audit:** every run report must carry the
partition from `optim.py` (`muon_group`, `adamw_group`, parameter
counts). A Muon run whose Muon group is empty is a mislabeled AdamW
run and fails loud in `build_optimizer` — it must never be reported
as a Muon result.

## 3. Comparison discipline (what makes the comparison fair)

- **Same folds, same seeds, same model, same loss.** Both arms train
  the identical moonshot model (`model.py`) under the identical
  joint loss (`losses.py`) on the identical embargoed folds
  (contract §9 P1: Fold 1 train 10,539 / embargo 2021-22 / val 948;
  Fold 2 train 11,491 / embargo 2023-24 / val 500; final train
  11,975 / embargo 2024-25 / frozen test 491, never tuned on).
  Seeds: 7 (Lane 4 default) plus two further seeds, fixed before
  runs start (PROPOSED: 8 and 9, matching Lane 9's seed protocol).
  Anything else is not an ablation; it is two different experiments.
- **Separate lr grids — this is the fairness crux.** Muon updates
  are orthogonalized (roughly unit-scale per step before the lr
  multiplier and the √max(A,B) RMS scaling); AdamW updates are
  adaptively scaled. Their learning rates are NOT on the same scale,
  so a shared lr grid would rig the comparison toward whichever
  optimizer happens to like that grid. Each arm gets its OWN lr
  grid, tuned on val only, and the arms are compared at their
  respective best-val configurations. PER-OPTIMIZER LR TUNING IS
  MANDATORY — never reuse AdamW's LR for Muon (tabular-benchmark
  protocol):
  - AdamW+EMA lr grid (PROPOSED placeholders, val-tuned): {3e-4, 1e-3, 3e-3}.
  - Muon lr grid (PROPOSED placeholders, val-tuned): {0.005, 0.02, 0.05}
    for the Muon group; the AdamW fallback group uses the AdamW grid.
  - Weight decay, momentum (Muon 0.95), betas, EMA decay, and
    ns_steps=5 are fixed across the grid unless the panel directs
    otherwise; ns_steps is NEVER tuned (it is 5 by definition in
    the brief).
- **Same compute budget, tabular-benchmark protocol.** Multiple
  seeds (7 plus two further seeds, fixed before runs start —
  PROPOSED: 8 and 9, matching Lane 9's seed protocol; the tabular
  benchmark used 10 seeds, and more seeds are better here because
  the expected effect is small and the regime is low-SNR). Early
  stopping on validation, patience 16 (tabular-benchmark protocol —
  deliberately matching the benchmark's protocol for the optimizer
  comparison, where Lane 4's model default is patience 20; the
  difference is flagged here so it is a protocol choice, not an
  accident). A Muon run that "wins" by training longer has not
  won; it has spent more.
- **Same loss configuration.** Same prefix weights (Lane 9 §6
  PROPOSED values), same uncertainty-weighting initialization
  (prediction-first PROPOSED values in `losses.py` — or the Lane 9
  equal-start baseline if the panel does not ratify prediction-first;
  whichever is chosen, BOTH arms use it), same PCGrad + interference
  thresholds. The optimizer is the only variable that differs.
- **Frozen test run once.** Hyperparameters (including each arm's
  best-val lr) are frozen from the val runs; the frozen 2025-26 test
  is run once per final configuration, and the result is reported
  whatever it is. A val win that regresses on frozen is a frozen
  failure, not a val asterisk.

## 4. What is measured (primary first, per the pending-ratification correction)

Metrics are reported per fold, per seed, and as means over seeds.
A single seed regressing beyond 2× a tolerance (where a tolerance
applies) is flagged even if the mean passes (Lane 9 §1: a mean can
hide a collapse).

| Metric | Role | Notes |
|---|---|---|
| **Forecast MAE per stat + mean MAE, 14-d next-season prediction** | **PRIMARY** | Per the user-directed 22:32 correction (contract §10): next-season overall stat prediction is the primary objective. Reported per stat (all 14, scoring highlighted as a display emphasis, not a weighting change — equal weight is the PROPOSED default, pending user confirmation) and as mean MAE. New-player slice reported separately, never blended. |
| **Forecast R² per stat + mean R²** | **PRIMARY** | Same protocol as MAE. Baselines on the same folds: carry-forward (persistence), age-curve, and stats-MLP (the rethink brief's O1/O5 direction, panel-pending — the baseline set itself awaits panel synthesis; the ablation reports against whichever baselines the finalized spec names, and against carry-forward at minimum). |
| **Twin-floor metrics** | **FLOOR (must not regress)** | Retrieval trio at 64-d (top-1, recall@10, continuity spread) + 16-d retention ≥ 90% of 64-d top-1 (contract §2d), vs. the separate Lane 4 baseline, within Lane 9 §2.1 PROPOSED tolerances. Twins are a floor constraint under the prediction-first framing, not the headline — but a floor is still a constraint: an optimizer arm that wins forecast while breaking the twin floor has not passed. |
| **Future-twins overlap@10** | **JOINT-ONLY diagnostic** | Lane 9 §3 definition (predict next season, retrieve its twins, overlap vs. true next season's twins), vs. the persistence baseline + 0.05 PROPOSED margin. Reported for both arms; a joint-model property, not an optimizer property — if the arms tie here while differing on forecast, the optimizer difference is in forecast quality, not bridge quality. |
| **Wall-clock per epoch + total, CPU, ON OUR ROWS** | **EFFICIENCY (measured, never quoted)** | Measured on the same machine, same CPU, same batch size (1024 anchors, Lane 4), at 12,966 rows. CPU timing at 12,966 rows is UNVERIFIED — the tabular benchmark's timing has no verified CPU-vs-GPU breakdown, and its 2.98× plain-MLP figure is a planning hint, not our number. NEVER quote LLM "1% overhead" (batch tokens ≫ matrix dimension at LLM scale; small matrices + small batches + launch overhead dominate on CPU) or Moonlight's ~2× FLOPs figure (3B-active/16B MoE, 5.7T tokens, pretraining comparison). |
| **Stability: loss spikes + divergence + noise robustness** | **STABILITY (gate)** | Count of loss spikes (epoch loss > 3× the running median, PROPOSED flag threshold), any divergence (loss NaN/inf or > 10× initial for 3 consecutive epochs, PROPOSED), and interference-monitor trips (Lane 9 §5.3 rebalance/stop events per arm). LOW-SNR CHECK (III-C R3): multiple seeds + loss-spike reporting are mandatory, not optional — the RLVR near-zero Muon result (2026 preprint, NOT tabular) is a caution that spectral flattening can amplify noisy directions, and 13k noisy rows are a low-SNR regime. An arm that diverges on any seed is flagged even if its other seeds look good. Stability is a gate, not a tiebreaker: see §5. |
| **Gradient-cosine log (S vs. DS)** | **INTERFERENCE MONITOR** | Logged every run per Lane 9 §5.3, per arm. If Muon systematically shifts the interference pattern (more or less conflict) vs. AdamW, that is a finding about the optimizer's interaction with the joint loss, reported as such — not folded into a single score. |

## 5. Decision rule — PROPOSED, for the panel's moonshot verdict

**This rule is PROPOSED. The panel decides Muon adopt/ablate/skip;
this draft does not pre-empt it.** The rule is stated here so the
panel has a concrete rule to judge, amend, or reject — not so the
ablation can declare its own winner.

**ADOPT Muon** (as the joint model's optimizer, pending the user's
separate word for any training/serving change) if ALL of the
following hold:
1. **MAE-LED (III-C R3):** mean forecast MAE (14-d) beats AdamW+EMA
   BEYOND THE BOOTSTRAP INTERVAL on Fold 2 (the deciding fold —
   the interval is computed by bootstrap over the Fold 2 val pairs
   and seeds, method fixed before runs start; a win inside the
   interval is a tie, not a win), AND mean R² does not regress vs.
   AdamW+EMA. The same MAE-led check must also pass on the frozen
   protocol (run once, reported whatever it is) — a val win that
   regresses on frozen is a frozen failure, not a val asterisk.
   A WALL-CLOCK ARGUMENT ALONE CANNOT ADOPT MUON HERE: the
   tabular benchmark's 2.98× plain-MLP cost points the other way,
   and wall-clock is reported as cost information alongside the
   MAE verdict, never as a substitute for it.
2. Twin-floor metrics stay within Lane 9 §2.1 PROPOSED tolerances
   vs. the Lane 4 baseline (i.e., Muon does not buy forecast at the
   twin floor's expense);
3. **ZERO STABILITY COST (III-C R3):** no seed diverges, no
   loss-spike flag trips beyond the control's level (spike count
   not more than 2× AdamW+EMA's, PROPOSED), and no
   interference-monitor stop event under Muon that the control
   avoids. A stability cost is disqualifying even with an MAE win
   — the low-SNR caution (2026 RLVR preprint, NOT tabular) is why
   this bar is zero, not "acceptable";
4. Wall-clock per epoch, measured ON OUR ROWS at 12,966 rows on CPU,
   is reported (not assumed). It does not adopt Muon by itself, and
   a large slowdown alongside a real MAE win goes to ABLATE
   FURTHER (cost/benefit needs a cleaner measurement), not to
   ADOPT.

**SKIP Muon** (AdamW+EMA remains the joint model's optimizer) if ANY of:
1. Mean forecast MAE does not beat AdamW+EMA beyond the bootstrap
   interval on Fold 2 (tie or regression) — the burden of proof is
   on the challenger optimizer, and a tie is not a reason to switch.
   (Beating plain AdamW while losing to AdamW+EMA is a SKIP: the
   control is AdamW+EMA, and the legacy arm is not a consolation
   verdict.);
2. Any seed diverges under Muon while AdamW+EMA is stable on the same
   seed, and the divergence is not attributable to a single
   misconfigured lr (i.e., it recurs at the best-val lr);
3. Twin-floor metrics regress beyond tolerance under Muon.

**ABLATE FURTHER** (neither adopt nor skip yet; run a second,
narrower pass) if:
1. The result is mixed across folds or seeds (e.g., Muon wins Fold 1
   but ties Fold 2, or wins on 2 of 3 seeds) — the first pass has not
   resolved the question, and the second pass varies ONE thing
   (PROPOSED first variation: Muon lr grid refinement around the
   best-val value; second: Nesterov on/off) with the same discipline;
2. The forecast win is real but the wall-clock or stability cost is
   borderline (within 2× of a threshold above) — the tradeoff needs
   a cleaner measurement, not a judgment call on noisy numbers;
3. The interference-monitor logs differ systematically between arms
   in a way that suggests the optimizer interacts with the conflict
   protocol (e.g., Muon trips the CAGrad step far more often) —
   that interaction needs its own investigation before either arm
   is declared. (Note the protocol change from the original draft:
   PCGrad is no longer the default conflict method — see the
   diagnose-first protocol in `losses.py`; an interaction with
   PCGrad specifically is therefore a conditional-option question,
   not a default-path question.)

**What "adopt" does NOT mean:** adoption as the optimizer is not
adoption of the model, not a training authorization, and not a
serving decision. Training still needs the user's separate word;
serving still needs the §2d promotion gate plus the user's word.
An adopted optimizer on an untrained model is a configuration choice,
not a shipped artifact.

## 6. Reporting format (one report per arm, plus a comparison)

Each arm's report carries: config (full `JointOptimizerConfig` +
partition report), seed, fold, per-epoch loss + gradient-cosine log
+ spike/divergence flags, val metrics per prefix, frozen metrics,
wall-clock, and the prediction-first label (whether the PROPOSED
rebalance or the Lane 9 equal-start baseline was used — both arms
identically). The comparison report carries: the per-metric
arm-vs-arm table (mean ± std over seeds, per fold), the stability
comparison, the wall-clock comparison, and the decision-rule
evaluation (§5) computed mechanically from the numbers — with the
final verdict line left for the PANEL, not filled in by the ablation
author. The ablation measures; the panel judges.

## 7. What this ablation deliberately does NOT do

- No adoption recommendation (stated in §5: the rule is proposed,
  the verdict is the panel's).
- No claim that Muon is better (contract §13: "No claim that Muon is
  better may appear in any draft" — none appears here; every
  Muon-favorable number cited in §1 is labeled as LLM-scale evidence
  that does not transfer by itself).
- No training run (the ablation is a design; its runs await training
  authorization, Phase 1 baselines measured, and panel synthesis).
- No new optimizer variant: MuonClip, SOAP, Shampoo, or any other
  optimizer is out of scope for this pass. If the panel wants one,
  it is a new ablation, not an extension of this one.
- Late panel input (2026-10-26 22:46 CDT, Panel Addendum III-C —
  APPLIED in the 2026-10-27 research update above, still DRAFT):
  the Muon ablation's control is now AdamW+EMA (which beat Muon on
  a plain MLP in the tabular benchmark; +0.66 vs +0.32, 2.98× time;
  CPU timing at 12,966 rows UNVERIFIED) and adoption is MAE-led
  (beat AdamW+EMA beyond the bootstrap interval on Fold 2, zero
  stability cost). Finalization remains BLOCKED until the user
  rules on III-A Q1–Q3 + III-B Q1.

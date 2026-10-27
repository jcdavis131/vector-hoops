# Lane 9 — Research Notes: Citation Check for the Unified-Loss Anchors (DESIGN ONLY)

**Status:** DESIGN ONLY. This file checks citations; it does not train,
build, or evaluate anything. No Hoops result appears in this file,
because no Hoops joint-model result exists.

**What was checked, exactly.** The skill directory
`~/workspace/custom-skills/jepa-predictor-paper/` — specifically:

- `references/paper.md` (448 lines) — the JEPA predictor paper,
  "The JEPA Predictor: A Transferable Operator for Occluded Feature
  Completion," read via targeted search + passage reading (per the
  skill's own method: search first, read the passage, cite the
  section).
- `references/supplement.md` (3 lines, entire content: "No
  corresponding materials were supplied") — there is no supplementary
  material to check.
- `references/index.md` — navigation only; it locates evidence, it
  does not summarize findings.

Searches run against all three files (case-insensitive): `UniJEPA`,
`Dreamer`, `MuDreamer`, `VICReg`, `GradNorm`, `PCGrad`, `MGDA`,
`uncertainty weighting`, `H-JEPA`, plus `stop-grad`, `EMA`,
`collapse`, `variance`, `regulariz`. Result: the first group returns
ZERO hits in all three files. The second group returns hits only in
`paper.md` (JEPA setup, EMA, frame shift). Every anchor below is
graded against that evidence — not against general knowledge, not
against what the standing context record said, and not against what
the wider literature presumably contains.

**Two levels of "checked" (kept distinct throughout).**

- **Level A — present in the skill's references:** the claim appears
  in `paper.md` text that this lane read. This is what Contract §8
  asked for ("check each anchor against the skill's references").
- **Level B — verified against the primary source:** the underlying
  paper itself was read and its claim confirmed. NOTHING in this file
  is Level B except the JEPA predictor paper's own claims (this lane
  read that paper's text directly). Everything else that "survived"
  did so at Level A only, and the file says so where it matters.

**Reading rule applied to every anchor:** a borrowed idea is either
(1) supported at Level A with a section pointer, (2) labeled
UNVERIFIED and used only as a design specification stated in full in
`UNIFIED_LOSS_DESIGN.md` (never as "the paper shows"), or (3) not
used. There is no fourth category.

---

## 1. The JEPA predictor paper — CHECKED (Level A: paper text read)

**What the reference actually establishes** (paper.md, JEPA setup
section + §2 "JEPA family" survey + §3 + §5):

- **JEPA setup.** A JEPA model has a context encoder f_c, a target
  encoder f_t, and a predictor π. Pretraining minimizes the distance
  between the predictor's output from visible-context features and
  the STOP-GRADIENT target encoder's features. At convergence the
  predictor is a learned extrapolation operator from visible-context
  features to target-position features. Conventionally the predictor
  is discarded after pretraining; the target encoder (or its EMA
  stable copy) is the production encoder.
- **Predictor retention (the paper's own contribution).** Retaining
  and reusing the predictor at TEST time for occluded feature
  completion: on images, at mask fractions 0.25 / 0.56 / 0.77, the
  lift over the masked-encoder baseline grows with mask fraction.
  Headline: CLIP paired with the I-JEPA predictor lifts fine-grained
  Stanford Dogs from 15.9% to 52.1% (+36 pp) at heavy occlusion
  (K = 0.77). Mechanism: the bridge projection pays a fixed cost on
  visible patches; the predictor provides a growing benefit on
  masked patches; benefit dominates at heavy occlusion. At low K on
  fine-grained classification the projection cost exceeds the
  benefit (the cost-benefit boundary where the linear bridge breaks
  down).
- **V-JEPA 2-AC (survey statement, §2).** "V-JEPA 2 extends JEPA to
  video; V-JEPA 2-AC trains a NEW action-conditioned predictor (the
  pretraining one is not reused)" — cited in the paper as Meta FAIR,
  "V-JEPA 2-AC: Action-conditioned predictor post-training," arXiv
  2025 (the paper's ref [34]). This is a SURVEY statement in the
  paper, not a result the paper itself measures: Level A for "the
  paper says this," NOT Level B for the V-JEPA 2-AC paper's own
  claims (that paper was not read in this lane).
- **Frame-shift caution (§3, §5).** For V-JEPA 2, predictor outputs
  are classification-useful but live in a DIFFERENT L2 frame than
  the encoder's: an L2-only protocol would wrongly conclude the
  predictor is uninformative. Matched-probe accuracy, not L2
  reconstruction error, is the appropriate diagnostic for a reused
  predictor whose pretraining loss does not constrain its outputs
  to the target encoder's metric. Related: "reading F_predicted as
  what the encoder would produce if the masked region were visible
  is overreading."

**What is being borrowed for Hoops:**

- Stop-grad target + EMA stable-copy pattern → the stop-grad rules
  in `UNIFIED_LOSS_DESIGN.md` §5.1 (rules 1 and 5). This is the most
  direct borrowing in the design, and it is the one with the
  strongest support (it is the JEPA setup itself, not a survey
  aside).
- The action-conditioned predictor PATTERN (a predictor trained
  specifically to be action-conditioned, not a repurposed
  pretraining predictor) → Mode G's design (design doc §2.2). The
  borrowing is at the pattern level only: no V-JEPA 2-AC layer
  counts, widths, or training recipe are claimed, because the
  skill's references do not supply them (Lane 8 §3.1 already
  reached the same conclusion independently).
- The frame-shift caution → the choice of retrieval OVERLAP@k as
  the future-twins headline instead of raw prediction L2 alone
  (`PARETO_EVAL.md` §3). A predictor whose outputs live in a
  shifted frame can still be retrieval-useful; judging it by L2
  alone would repeat the error the paper warns against. Prediction
  L2/cosine is kept as a supporting diagnostic, never as the
  headline.
- The bridge cost-benefit caution → a design attitude, not a
  number: any bridge (here, predictive positives) pays a cost and
  must prove its benefit. That is why predictive positives have
  their own ablation (J3) rather than being assumed useful.

**What is NOT claimed:**

- The +36 pp Stanford Dogs lift is an IMAGE-OCCLUSION result. It is
  NEVER a Hoops result, never a predictor of Hoops future-twins
  performance, and never evidence that the Hoops bridge will work.
  It is cited here only to identify the paper's own headline
  accurately.
- Predictor retention in the paper is TEST-TIME completion (frozen
  encoder + frozen predictor, forward-only, classification). Hoops
  retains the predictor at TRAINING time as a joint head — a
  different use. The paper does not establish that training-time
  predictor retention helps; that is the joint model's hypothesis,
  to be tested by the Pareto eval, not borrowed authority.
- No V-JEPA 2-AC architectural detail beyond "new action-conditioned
  predictor" is claimed. Anything more specific would need the
  V-JEPA 2-AC paper itself (Level B work, not done here).

---

## 2. UniJEPA (2026) — UNVERIFIED against the skill's references

**What was checked:** `UniJEPA` returns ZERO hits in `paper.md`,
`supplement.md`, and `index.md`. The skill's references contain no
UniJEPA content of any kind — no definition, no loss, no regularizer,
no abstraction dial, no result.

**Consequence:** EVERY UniJEPA claim in the standing-context unified
record is UNVERIFIED for this lane's purposes:

- "UniJEPA unifies invariant (contrastive-like) and equivariant
  (temporal) prediction in one latent space with a single loss" —
  UNVERIFIED.
- "UniJEPA uses a Gaussian anti-collapse regularizer" — UNVERIFIED.
- "UniJEPA has an abstraction dial" — UNVERIFIED.

**What is being borrowed anyway (as design hypotheses, labeled as
such):**

- The UNIFICATION IDEA (one latent space, one loss, invariant +
  equivariant prediction together) → the joint model's overall shape
  (design doc §0). Borrowed as an idea that motivated the design,
  NOT as an established result. The design's justification is its
  own: the bridge (§4) + the Pareto eval, not UniJEPA's authority.
- The GAUSSIAN-REGULARIZER IDEA → implemented NOT as a claimed
  UniJEPA Gaussian term, but as a VICReg-STYLE variance hinge
  specified in full in design doc §3.5 (which is itself UNVERIFIED
  as a VICReg quote — see §4). If the Gaussian form matters, it
  must be checked against the UniJEPA paper before being claimed.
- The ABSTRACTION-DIAL IDEA → operationalized as OUR synthesis:
  Matryoshka prefixes as hierarchy levels with proposed per-prefix
  weights (design doc §6). The mapping "coarse prefix = invariant,
  full width = equivariant" is a Hoops design decision, NOT a
  verified UniJEPA claim. Calling it "UniJEPA's abstraction dial"
  would misattribute our synthesis to their paper.

**What would verify it:** read the UniJEPA paper (2026) directly
and check, at minimum: (a) does it actually unify invariant and
equivariant prediction in one loss, (b) what is the exact
regularizer form, (c) what is the abstraction dial mechanically
(a weighting? a level selector? a curriculum?). Until then, every
UniJEPA sentence in Lane 9 docs carries UNVERIFIED or is phrased as
our design choice.

---

## 3. DreamerV3 / MuDreamer — UNVERIFIED against the skill's references

**What was checked:** `Dreamer` and `MuDreamer` return ZERO hits in
all three reference files. No world-model, KL-balancing, or
encoder↔dynamics content of any kind is present in the skill's
references.

**Consequence:** the standing-context claim — "DreamerV3/MuDreamer
formalize encoder↔dynamics KL balancing" — is UNVERIFIED for this
lane's purposes. No KL term, no balancing coefficient, no
encoder↔dynamics tradeoff statement from DreamerV3 or MuDreamer is
supported by anything this lane read.

**What is being borrowed:** NOTHING as authority. This is a
deliberate divergence, stated so it is not mistaken for an oversight:

- The joint design does NOT use KL balancing between encoder and
  dynamics. It uses stop-grad targets (§5.1) + a variance hinge
  (§3.5) + PCGrad projection (§5.2) + the interference monitor
  (§5.3). Those are four separate mechanisms, each specified in
  full, none of which is presented as DreamerV3/MuDreamer practice.
- The CONCEPTUAL debt is acknowledged at the idea level only: world
  models must balance "how good is the encoder's representation"
  against "how predictable is it" — that tension is real in the
  Hoops design (it is WHY the interference monitor exists), but the
  Hoops answer to it (log the cosine, rebalance, stop) is our
  mechanism, not a borrowed Dreamer result.

**What would verify it:** read DreamerV3 (Hafner et al.) and the
MuDreamer paper directly and check: (a) what KL terms exist between
encoder and dynamics, (b) how they are weighted/balanced, (c) whether
that balancing transfers to a JEPA-style latent-prediction loss at
all (Dreamer losses are reconstruction/KL-based in a different
family than JEPA's stop-grad latent loss — transfer is not
automatic and must not be assumed). If a future revision wants KL
balancing in the joint loss, it needs that check first AND an
ablation (KL term on/off) — it cannot be added on citation
authority alone.

---

## 4. Multi-task conflict tools — UNVERIFIED as citations, specified as design

**What was checked:** `uncertainty weighting`, `GradNorm`, `PCGrad`,
`MGDA` return ZERO hits in all three reference files. None of these
tools is described, let alone evaluated, in the skill's references.

**Per-tool status:**

| Tool | Citation status | Role in the design | Why this treatment |
|---|---|---|---|
| Uncertainty weighting (learnable log-variance scalars) | UNVERIFIED as a citation (Kendall et al. not in references) | ADOPTED as a design specification (design doc §3.6, formula stated in full) | The formula is simple, self-contained, and falsifiable by ablation J4. It does not need paper authority to be specified — but it must not be presented as a verified quote. |
| PCGrad (project conflicting gradients onto normal planes) | UNVERIFIED as a citation (Yu et al. not in references) | ADOPTED as a design specification (design doc §5.2, projection formula stated in full) | Same reasoning: specified, ablated (J2), and monitored (cosine log). The projection math is in the doc; the paper is not needed to state it, and not claimed as checked. |
| GradNorm (gradient-norm balancing) | UNVERIFIED as a citation | CONSIDERED AND SET ASIDE (design doc §5.2) | Needs per-task gradient norms every step + a balancing loss; cost/complexity for a problem uncertainty weighting already handles at scale level. Available as a named v2 amendment if PCGrad + uncertainty weighting demonstrably fails. |
| MGDA / Pareto-front solvers | UNVERIFIED as a citation | CONSIDERED AND SET ASIDE (design doc §5.2) | QP per step; "common descent" can stall one head when the other's loss is flat. The word "Pareto" in `PARETO_EVAL.md` refers to the EVAL structure (no regression + joint win), NOT to MGDA — the eval does not depend on MGDA in any way. |

**What is NOT claimed:** no multi-task tool is claimed to "solve"
gradient conflict in general, no convergence guarantee is quoted,
and no tool's published benchmark result is cited (there is none in
the references to cite). The design's claim is narrower and honest:
these two tools address scale and direction separately, both are
ablated, and the cosine monitor will show whether they worked on
Hoops data. If they didn't, the monitor — not a paper — says so.

---

## 5. H-JEPA hierarchy — DESIGN NOTE, not a paper claim (consistent with Lane 8)

**What was checked:** `H-JEPA` returns ZERO hits in all three
reference files. No hierarchical-JEPA content is present in the
skill's references.

**Status:** Lane 8 §4 already treats H-JEPA-style top-down planning
as a DESIGN NOTE from the user's stated pattern, not a paper claim
and not a built component. This lane AGREES and extends the same
treatment to the width hierarchy: "Matryoshka prefixes ARE the
H-JEPA levels" (design doc §6) is OUR synthesis — a weighting
discipline on existing machinery — not a claim that any H-JEPA
paper establishes prefix-level planning. The synthesis is justified
by its own reasoning (similarity is coarse, dynamics is fine) and
falsifiable by the Pareto eval (if the proposed weights are wrong,
the eval shows it). No H-JEPA paper is cited, because none was
checked.

---

## 6. Lane 8 provenance tension (2) — direct answer

Lane 8 §4.1 flagged: the UniJEPA / DreamerV3 / MuDreamer claims in
the unified record are recorded from standing context, not verified
against the skill's references, and must be citation-checked before
use as design authority.

**Answer after this lane's check:**

| Claim in the unified record | Survived the check? | Basis |
|---|---|---|
| JEPA setup: context encoder + stop-grad target encoder + predictor; EMA stable copy | YES (Level A — paper text read) | `paper.md` JEPA setup section |
| V-JEPA 2-AC: a NEW action-conditioned predictor (pretraining one not reused) | YES, as a survey statement (Level A only) | `paper.md` §2 "JEPA family" survey, citing arXiv 2025 ref [34]; the V-JEPA 2-AC paper itself was NOT read |
| Predictor retention at test time helps occluded completion (+36 pp Stanford Dogs headline) | YES, as the paper's own result (Level A) — but it is an IMAGE result, never a Hoops result | `paper.md` abstract + §5 |
| Frame-shift caution (L2 ≠ usefulness for predictor outputs) | YES (Level A) | `paper.md` §3 + §5 |
| UniJEPA: unified invariant + equivariant prediction, single loss + Gaussian regularizer, abstraction dial | NO — zero hits in all reference files | UNVERIFIED; used only as labeled design hypotheses (§2 above) |
| DreamerV3 / MuDreamer: encoder↔dynamics KL balancing | NO — zero hits in all reference files | UNVERIFIED; NOT used in the design (§3 above) |
| H-JEPA hierarchy as a paper claim | NO — zero hits; already a design note in Lane 8 | Design synthesis only (§5 above) |
| Uncertainty weighting, GradNorm, PCGrad, MGDA/Pareto as checked tools | NO — zero hits in all reference files | Design specifications / set-asides, labeled UNVERIFIED (§4 above) |

**Bottom line for the coordinator:** the unified design does NOT
depend on any UNVERIFIED citation. Every mechanism it needs is
specified in full in `UNIFIED_LOSS_DESIGN.md` (formulas, weights,
stop-grad rules, thresholds — all PROPOSED or design choices, not
borrowed authority). The UNVERIFIED items are therefore NOT blockers
for Phase 2 training authorization — but they ARE blockers for any
sentence that says "UniJEPA shows…" or "DreamerV3 establishes…" in
a Hoops doc. Such sentences must not be written until the primary
papers are read. If the user wants those checks done anyway (as
scholarship, not as a training gate), that is decision 5 in
`UNIFIED_LOSS_DESIGN.md` §11 and decision 6 in `PARETO_EVAL.md` §7.

---

## 7. What was NOT checked (stated, not hidden)

- The V-JEPA 2-AC paper itself (arXiv 2025, the JEPA paper's ref
  [34]) — not in the skill's references, not read here. Mode G's
  pattern-level borrowing (§1) is therefore Level A only.
- The UniJEPA, DreamerV3, MuDreamer, VICReg, GradNorm, PCGrad,
  MGDA, and Kendall-uncertainty-weighting papers — none in the
  skill's references, none read here. All claims about them are
  UNVERIFIED in this lane.
- The Matryoshka (MRL) and SupCon primary papers — NOT re-checked
  here because Lane 4 already grounds them (its script header cites
  Khosla et al. 2020 for SupCon and Kusupati et al. 2022 for MRL)
  and this lane inherits Lane 4's formulas unchanged. Re-checking
  them was out of this lane's scope; the inheritance is stated, not
  hidden.
- Any web source. No web search was used for citation-checking in
  this lane: Contract §8 asked for a check against the skill's
  references, and that is what was done. A web check would answer a
  different question ("what does the literature say") than the one
  asked ("what do OUR references establish").

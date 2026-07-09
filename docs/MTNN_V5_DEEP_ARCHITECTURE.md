# MTNN v5 — Deeper architecture proposal

> **Status:** SUPERSEDED IN PART (2026-07-08) · **Owner:** AI/ML research lane
> **Parents:** [`FEATURE_ENGINEERING_SOP.md`](./FEATURE_ENGINEERING_SOP.md) · [`RESEARCH.md`](./RESEARCH.md) · [`DATA_EXPANSION_WORKFLOW.md`](./DATA_EXPANSION_WORKFLOW.md)
> **Doctrine check:** RESEARCH.md house rule is "statistical models first, neural nets only when justified." §3 states the falsifiable justification; if the §7 ablation fails, we do **not** ship v5.

---

## 0. Correction — read before §1

Two findings invalidate parts of this document. They are kept, not deleted, so
the reasoning error stays visible.

**(a) The metrics this proposal reasons from were leaked.** The legacy training
loop iterated all 12,966 rows with no split filter, so:

| Leak | Count |
|---|---|
| Held-out InfoNCE pair positives trained on | **1,551** (761 val + 790 test) |
| Held-out next-season regression targets trained on | **1,551** |
| k-means archetype labels fit over val/test rows | all 991 test rows |

So "held-out recall@10 = 1.0" (§1, §3) was **memorization, not retrieval** — the
model trained on those exact pairs. "purity@20 near its ceiling" was measured on
labels the model was explicitly trained to classify. **The §3 claim that "recall
is saturated so a bigger net cannot improve it" is not established**; the metric
simply could not measure generalization. Fixed by `pipeline/leakfree.py`
(`--protocol leakfree`).

**(b) The §7 ablation ran on a defective matrix.** Subsequent data audit found:
a `game_ratings` tower fed by a **2-row fixture** (14 of 129 features, 28 observed
cells); **salary blank for 2018-19 → 2024-25**, i.e. the entire val/test span,
while `salary_head` carried the joint-highest aux weight (0.12); and a stale
`career_arc.json` that left `DRAFT_SLOT_Z` at **0% coverage**. After repair:
120 features / 17 towers, `market` val/test coverage 0.000 → 0.935/0.888,
`career` 0.890 → 1.000, zero never-observed columns.

**(c) The temporal split confounds architecture comparisons.** Era-gated towers
(tracking 2013-14+, form/competition/roster) cover ~20-37% of train rows but
65-100% of val/test rows (mean coverage gap **0.167**); 771 pairs straddle the
split; and the 4 held-out seasons never appear in training, so their `season_emb`
rows stay at random init during eval. A player-level split cuts the mean gap to
**0.0115**, discards zero pairs, and trains every season. Use `--split player`
for model selection; `--split temporal` only when the claim is forecasting.

**What survives:** the architecture facts in §2 (v4 is ~224K params, 4 layers to
the embedding, towers never interact) are unchanged. The §7 finding that
**transformer fusion performed worse than concat** was measured under the leaky
protocol on the defective matrix and must be re-run before it is trusted. Every
"B beats v4" conclusion is likewise **unverified** — B has 2.5× the capacity and
was scored partly on targets it trained on.

---

## 1. TL;DR

The deployed net (`mtnn_v4_phase_b`) is **wide but shallow**: 18 parallel 2-layer
towers → one 2-layer concat-fusion → mostly-linear heads. **~224K params, 4 linear
layers deep** to the embedding. Its retrieval metric is **already saturated**
(held-out recall@10 = 1.0), so a bigger net cannot improve it. The real headroom
is **archetype purity (0.80)**, **next-profile regression**, and one structural gap:
**towers never interact** — concat just flattens them.

v5 proposes: deeper residual towers, a **Transformer fusion** so families actually
attend to each other, a modestly larger embedding, and 2-layer MLP heads. Target
**~1.5–3M params, ~14–18 layers**. Ship **only if** it beats v4 on purity /
regression under a promotion gate (recall stays pinned at 1.0 and is dropped as a
discriminating metric).

---

## 2. Ground truth — what v4 actually is

Reverse-engineered from `pipeline/train_mtnn.py` (`class MTNN`), not the schematic
`mtnn_arch.json`.

| Stage | Real operation | Layers | Params |
|---|---|---|---|
| Input | 129 feats → 18 masked families (`x*m ∥ m`) | — | — |
| 18 Residual towers | `Linear(2dᵢₙ→96)`→LN→GELU→`Linear(96→24)`→LN **+ linear skip** | 2 | 78.7K |
| Concat fusion | flatten 18×24=432 **+ 12-d season emb** → `Linear(444→256)`→GELU→LN→`Linear(256→48)`→L2 | 2 | 127.1K |
| Embedding | 48-d, L2-normalized | — | — |
| Heads | archetype`→8`, position`→5`, profile`→14`, next`→14`, **8 scalar aux** (salary, team_fit, roster_lift, career_slope, competition, pedigree, playoff, honors), form_recon, bbref — all linear; **18 skill towers** `48→16→1` | 1–2 | 17.8K |
| **Total** | | **4 to embed (5–6 to a prediction)** | **~224K** |

Notable: **57% of all params sit in the single `444→256` fusion layer.** The towers
are cheap; the heads are nearly free.

### What the current /model diagram hides
Tower hidden layer (96) + residual skip; fusion hidden layer (256) + season token;
skill-head hidden layer (16); and 10 real heads collapsed into one "aux" dot.

---

## 3. Assessment & justification (answering the house rule)

**Why not "just keep the shallow net"?** Two concrete, falsifiable reasons:

1. **No cross-tower interaction.** In concat fusion, family towers are flattened and
   mixed only by one linear layer. There is no mechanism for, e.g., *playmaking*
   context to modulate *shot-mix* interpretation. Hypothesis: self-attention across
   the 18 tower tokens raises archetype purity and next-profile fit. **Ablation in §7
   tests exactly this** (transformer fusion vs. concat, same everything else).
2. **Purity has headroom, recall does not.** recall@10 = 1.0 (maxed) → useless as a
   comparison metric. purity@20 = 0.80 and next-profile regression are where a
   higher-capacity, interacting model can plausibly move numbers.

**Why this is risky and bounded:** the training set is only **~13K player-seasons /
~10K held-out pairs**. Naively scaling params overfits. v5 is therefore capped at
low-single-digit millions, heavily regularized (§6), and gated on held-out gains (§8).
If the §7 ablation shows no purity/regression lift, **v5 is rejected and v4 stays** —
consistent with "neural nets only when justified."

---

## 4. Goals / non-goals

**Goals**
- Cross-tower interaction (attention) as the central architectural change.
- Deeper towers + heads for representational capacity.
- Truthful, layer-accurate architecture export so the /model diagram matches reality.

**Non-goals**
- Improving recall@10 (already 1.0).
- Changing the feature set, masking, or data contract (v5 trains on the same
  `train_matrix.npz`; feature work is a separate lane).
- Changing the daily-puzzle cosine-similarity contract (embedding stays L2-normalized;
  only its dimensionality may grow — see §9 migration note).

---

## 5. Proposed v5 architecture

```
                        ┌─ per family (×18) ─────────────┐
 129 feats ─ mask ─▶    │  2 × ResidualBlock             │  d_tower = 32
                        │   Linear(→160)→LN→GELU         │
                        │   Linear(160→32)→LN + skip     │
                        └────────────┬───────────────────┘
                                     │  18 tower tokens (×32) → project to d_model=96
                       [CLS] + [season] + 18 tokens  = 20 tokens (×96)
                                     │
                        Transformer encoder  ×4 layers
                        (MHSA 4 heads, FFN 256, pre-LN, dropout)
                                     │  take CLS
                        Linear(96→64) → L2-norm  ─▶  embedding (64-d)
                                     │
                 ┌───────────────────┼───────────────────────────┐
      archetype 64→64→8      skills 18×(64→24→1)        next_profile 64→64→14
      position 64→64→5       profile 64→64→14           8 scalar aux 64→32→1
```

**Design deltas vs v4**
- **Towers:** 1 → **2 residual blocks**, hidden 96 → **160**, d_tower 24 → **32**.
- **Fusion:** concat-linear → **4-layer Transformer encoder** over tower tokens
  (+ season token + learned CLS). This is the load-bearing change.
- **Embedding:** 48 → **64-d** (still L2-normalized; keeps cosine contract).
- **Heads:** linear → **2-layer MLP** (archetype/position/profile/next + scalar aux);
  skill towers widen 16 → 24 hidden.

**Budget (estimated):** towers ~0.5M, transformer ~0.4M, heads ~0.2M → **~1.5–2.5M
params**, depth **towers 4 + transformer ~8 + head 2 ≈ 14–18 layers**. Comfortable on
a **12 GB RTX 4080** (batch 512+, minutes/epoch).

---

## 6. Overfitting mitigations (mandatory, not optional)

- Keep embedding modest (64, not 128+); cap total params ≤ ~3M.
- Dropout 0.1–0.2 in transformer + heads; weight decay 1e-4 (as v4).
- Retain the **hybrid contrastive loss** (0.8/0.2) — it regularizes the embedding.
- **Tower/token dropout:** randomly drop whole family tokens during training (beyond
  the existing feature masks) so the model can't lean on any single tower.
- Early-stop on **val composite**, not train loss.
- Same **held-out split protocol** as v4 (by player, not row) — no leakage across a
  player's seasons.

---

## 7. The decisive ablation (run before full commit)

Train three configs to the same budget/schedule, compare on the **held-out test** set:

| Config | Fusion | Purpose |
|---|---|---|
| A (control) | v4 concat, v4 depth | reproduce current baseline |
| B | v4 concat, **deeper towers/heads** | isolate depth-only gain |
| C | **Transformer fusion** + deeper towers/heads | full v5 |

**Decision rule:** ship v5 (config C) only if `purity@20(C) ≥ purity@20(A) + 0.02`
**and** next-profile regression (val RMSE) improves, with recall@10 still ≥ 0.99.
If C ≈ B, the transformer isn't earning its complexity → fall back to B. If neither
beats A, **keep v4**.

---

## 8. Evaluation & promotion gates

`verify_accuracy.py` v11 currently gates on `purity ≥ 0.63`, `recall ≥ base+0.05`,
`arch_top1 ≥ 0.55`. For v5, since recall is saturated:

- **Drop recall as a discriminator** (keep a floor ≥ 0.99 as a regression guard).
- **Promote on:** purity@20 gain, next-profile val RMSE, archetype top-1, and a new
  **calibration** check (ECE on archetype probs) so deeper ≠ overconfident.
- Add these as new keys in `mtnn_report.json` and extend the export promotion gate
  in `export_assets.py` (`mtnn_promotion_eligible`) + `verify_accuracy.py` v11 to match.

---

## 9. Diagram & migration implications

- **Truthful viz:** enrich `pipeline/export_mtnn_viz.py` to emit the real per-stage
  topology (tower blocks + skip, transformer layers/heads, per-head MLP shape) into
  `mtnn_arch.json.layers`; then extend `assets/network-viz.js` to render hidden-layer
  nodes and the attention block. The diagram should target **whichever net ships** —
  so we build it against v5 if v5 promotes, else enrich for v4.
- **Embedding dim change (48→64):** breaks byte-size assumptions in
  `verify_accuracy.py` v12 and `mtnn_meta.json`/`mtnn_embeddings.f32`. The daily-puzzle
  cosine contract is dimension-agnostic (still L2-normalized), but every consumer that
  hardcodes 48 must be updated. **Enumerate these before training** (grep `48`, `dim`).

---

## 10. Rollout phases

1. **Ablation harness** — add v5 model classes behind a `--arch v5` flag in
   `train_mtnn.py`; run A/B/C (§7). *No asset changes.*
2. **Gate + report** — extend `mtnn_report.json` metrics and promotion gates (§8).
3. **Decide** — apply §7 rule. If reject, stop; v4 stays; enrich v4 diagram only.
4. **Promote** — if accept, export embeddings/meta/viz, update 48→64 consumers (§9),
   rewrite the diagram against v5, re-run full `verify_accuracy.py`.

---

## 11. Open decisions for the owner

- **Embedding dim:** hold at 48 (zero-migration, drop-in) or grow to 64 (more capacity,
  touches every `48` consumer)? *Recommendation: 64, but only if §7 shows it's needed.*
- **Fusion:** Transformer (proposed) vs. reusing/​deepening the existing `GatedFusion`
  attention (already in the codebase, cheaper). *Recommendation: prototype both in B/C.*
- **Scope of "bigger":** cap at ~2.5M (safe on 13K rows) or push to ~5M with stronger
  augmentation? *Recommendation: start ≤2.5M; only scale up if val keeps improving.*
- **Token dropout rate** and whether to add embedding **mixup**.

---

## 12. Risks & fallback

- **Overfit** on 13K rows → mitigated by §6; caught by §7/§8 held-out gates.
- **Transformer earns nothing** over concat → fall back to config B (depth only).
- **Nothing beats v4** → keep v4, ship only the truthful diagram of v4. This is an
  acceptable outcome, not a failure.
- **Migration churn** from 48→64 → avoidable by holding 48 (open decision §11).

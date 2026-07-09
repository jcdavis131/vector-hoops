# /model — attribution visualization plan

> **Status:** Plan for review (2026-07-09) · **Blocked on:** the final-sweep winner
> **Parents:** [`MTNN_V5_PROMOTE_GATE.md`](./MTNN_V5_PROMOTE_GATE.md) · `pipeline/export_mtnn_jacobian.py` · `assets/network-viz.js`
> **Goal:** let a visitor probe the network and see **which nodes and which raw inputs drive each output prediction** — for a specific player-season, and for the population.

---

## 0. What exists today, and the one thing that doesn't

| Capability | State |
|---|---|
| Node-link flow diagram, hover-preview + click-to-lock trace, line-of-sight dimming | ✅ shipped |
| Edge weights = **causal** `‖∂target/∂tower‖` (Jacobian), not input magnitude | ✅ shipped (`mtnn_jacobian.*`) |
| Backward trace from a head → the towers that actually drive it | ✅ shipped |
| Provenance guard: stale attribution vs shipped net fails closed (V13) | ✅ shipped |
| **Attribution down to the 120 raw input features** | ❌ **missing** |

The Jacobian export stops at **tower granularity** (17 towers × 5 targets). The
user-facing question — *"which **inputs** drive this prediction?"* — cannot be
answered from it. The input edges in the diagram are still weighted by **input
magnitude**, which is the exact proxy that made a superstar look like a network
pathology. **Closing this is the core of the work.**

---

## 1. Phase 1 — feature-level attribution (the enabling export)

Extend `pipeline/export_mtnn_jacobian.py` with `--granularity feature`.

**Method.** Signed **gradient×input** attribution, `a_j = x_j · ∂y_h/∂x_j`, taken
w.r.t. the masked family inputs rather than the tower outputs. Signed (unlike the
Frobenius norm we use for edges) because the question is *directional*: does this
feature push the archetype logit **up or down**? One backward pass per output dim,
batched — the same cost as the existing export (~30s for all rows).

**Why gradient×input and not the Jacobian norm:** the norm answers "how sensitive",
which is right for an *edge width*. "What drove this prediction" needs sign and
magnitude, and `x·∂y/∂x` is the first-order term of the output's decomposition, so
the top-k contributions actually sum toward the prediction.

**Assets** (row-aligned with `vectors.json`, provenance-stamped like V13):

| File | Shape | Bytes |
|---|---|---|
| `assets/mtnn_attr_pop.json` | population mean `[120 features × 5 targets]` | ~30 KB |
| `assets/mtnn_attr_topk.bin` | per row, per target: **top-8** `(uint16 idx, float32 val)` | 12,966 × 5 × 8 × 6 B ≈ **3.1 MB** |

Dense per-row would be 12,966 × 120 × 5 × 4 B = **31 MB** — rejected. Top-8 covers
the answerable question ("what drove *this* prediction") at 10% of the size.

**Gate:** extend `verify_accuracy` V13 to cover the new files (row alignment, feature
count vs `feature_manifest`, checkpoint fingerprint). A stale attribution must fail
closed, exactly as the tower-level one now does.

**Honest limits, carried into the UI copy** (already the module's docstring):
local linearization, not a counterfactual ablation; masked families still have
gradients, so **influence ≠ coverage** — a masked feature can show ~0 attribution
because it was never measured, not because it doesn't matter.

---

## 2. Phase 2 — the visualizations (form first, color last)

Per the dataviz procedure. **Color is chosen by the job the color does**, and every
categorical set is run through `scripts/validate_palette.js` before it ships.

### 2a. Form, chosen by the data's job

| Question the user is asking | Form | Why not the obvious thing |
|---|---|---|
| "How much does each of the **17 towers** drive this head?" | **ranked horizontal bar**, single hue, top-N + "Other" | Not 17 colors: >~7 meaningful color classes is an anti-pattern, and hues would have to be cycled |
| "Which **raw inputs** pushed this prediction up vs down?" | **diverging bar**, centered on zero, top-8 ± | Signed, so a sequential ramp would hide direction |
| "Which towers drive **which heads**, overall?" | **heatmap** (17 × 5), sequential one hue + scale legend | The population view; a node-link would be 85 crossing edges |
| "How confident is this head?" | **stat tile** (value + the random baseline) | A one-bar bar chart is an anti-pattern |
| "Trace the path" | **keep the existing node-link + line-of-sight** | It is the one form that shows *topology*, which bars cannot |

**Explicitly rejected:** chord/Sankey across 17×5 (unreadable, and edge width there
would double-encode what the heatmap already says), radial "neural net" glamour
diagrams, and any 3D bar.

### 2b. Color, by job — and the results of actually running the validator

| Job | Encoding | Validator status |
|---|---|---|
| Archetype identity (8 clusters) | **categorical**, fixed order — the skill's reference theme, which the page already uses | `[WARN] CVD worst adjacent ΔE 10.3 (protan) / 7.9 (tritan)` — **documented in `palette.md` as the reference set's own floor**; legal **only with secondary encoding** |
| Tower influence magnitude | **sequential**, one hue, length carries the value | bars get **one hue**; a value-ramp on nominal categories is an anti-pattern |
| Signed feature contribution | **diverging**, two poles + **neutral gray** midpoint | no hue at the midpoint |
| Masked / "never measured" | **status** + icon + label | never color-alone |
| PCA axes (X/Y/Z) on the 3-D map | **chrome — recessive neutral ink**, not a categorical triple | see the FAIL below |

### 2c. Two live defects the validator found (fix regardless of the model)

1. **`AXIS_COLORS` FAILS the lightness band.**
   `#f07070, #5cc99a, #6eb5ff` measure L = 0.698 / 0.759 / 0.757 against a dark
   band of 0.48–0.67. They are also three saturated hues competing with the eight
   *cluster* hues on the same canvas. **Axes are chrome, not a data series** —
   demote to `--ink-muted` with X/Y/Z + PC text labels. This deletes a failing
   categorical palette instead of repairing one.

2. **The 3-D map encodes archetype by color alone.**
   12,966 dots are painted from `PALETTE[p.c]` with **no legend anywhere** in
   `network-viz.js` or `model.html` (grepped: zero occurrences). With a worst
   adjacent ΔE of 10.3 protan / **7.9 tritan** (below the 8 floor), a colorblind
   visitor cannot separate `#008300` from `#c98500`. The rule is absolute: for ≥2
   series a legend is always present and identity is never color-alone.
   **Fix:** a legend (8 swatches + archetype names, the fixed order), hover
   readout of the archetype name, and the archetype filter chips already implied by
   the trace UI. On the light card surface `#c98500` also lands at 2.99:1 → the
   relief rule obliges visible labels or a table view.

3. **A latent hue-cycling bug.** The map paints dots with
   `PALETTE[p.c % PALETTE.length]`. `K = 8` today, so the modulo never wraps — but
   the moment archetypes go to 9 it **silently reuses hue 1 for cluster 9**, which
   is the single worst color anti-pattern (a 9th categorical hue is never
   generated or recycled; it folds into "Other" or a composite encoding). Replace
   the modulo with an explicit bounds check that fails loudly, or fold overflow
   into a neutral "Other" swatch. Cheap now, invisible until it bites.

### 2d. Marks, interaction, accessibility

- Thin marks; 4px rounded data-ends anchored to the zero baseline (diverging bars
  anchor at zero, not at the left edge); 2px surface gap between adjacent fills;
  recessive grid.
- **Hover is default, not a feature.** Per-bar tooltip on the attribution bars; the
  flow diagram keeps hover-preview + click-to-lock. Hit targets exceed the mark.
- Direct-label **selectively** — the top contributor and the extreme, never a number
  on every bar.
- **Table view** for every attribution chart (also satisfies the contrast relief
  rule), and it is the accessible answer to "which inputs drove this".
- Dark mode is **selected from the same ramps and re-validated against `#121210`**,
  not an automatic flip.
- Texture fill available for the CVD / print / forced-colors case.

---

## 3. Phase 3 — the probing interaction

The page already has hover-preview, click-to-lock, and line-of-sight dimming. What
Phase 1 adds is **depth on the same gesture**:

1. **Click a head node** (e.g. *archetype*) → backward trace lights the towers by
   causal influence (shipped), **and** the side rail now shows:
   - ranked tower bars (single hue),
   - a diverging bar of the **top-8 raw features** pushing the prediction up/down,
   - the stat tile for that head's confidence with its random baseline.
2. **Click a tower** → its member features, each with its signed contribution to the
   currently-selected head — answering "why is *tracking* driving this archetype?"
3. **Click an input family** → forward trace (shipped) + its contribution to **all**
   five heads, as a small multiple of five diverging bars, not a 5-series color chart.
4. **Population toggle** (this player ↔ all players) swaps the per-row top-k for the
   population matrix and switches the node-link for the 17×5 heatmap.
5. **Masked features are shown as masked**, with the status icon + "not tracked this
   era" — never as a zero contribution.

---

## 4. Phase 4 — sequencing and gates

| Step | Depends on |
|---|---|
| Re-run `export_mtnn_viz` + `export_mtnn_jacobian` against the promoted net | **final-sweep winner** |
| Add `--granularity feature` + the two attribution assets | nothing (can start now) |
| Extend V13 → cover attribution assets (fail closed on stale) | above |
| Demote `AXIS_COLORS` to chrome; add the archetype legend + table view | nothing (**do now**, it's a live a11y defect) |
| Build the three new charts against the design-system parameters, validating each palette | above |
| Screenshot / eyeball pass (the validator checks color, not layout) | last |

**Definition of done:** every categorical palette on the page has a recorded
validator run; no identity is carried by color alone; every attribution chart has a
table view; and `verify_accuracy` fails closed if the attribution assets do not match
the shipped checkpoint.

---

## 5. What this plan deliberately does not claim

The attribution is a **local linearization** of a model, not a causal account of
basketball. "Tracking drove this archetype" means *the network's* prediction moved
with that input, for this player-season, under a first-order approximation. It does
not mean the player's archetype is caused by his tracking numbers. That sentence
belongs in the UI, next to the chart — in the same voice as the rest of
`methods.html`.

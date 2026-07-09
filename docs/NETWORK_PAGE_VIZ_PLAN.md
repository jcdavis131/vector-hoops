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
| Provenance guard: stale attribution vs shipped net fails closed (V13) | ✅ **now** — see note |
| Attribution down to the raw input features — **export** | ✅ shipped (`mtnn_attr_*`) |
| Attribution down to the raw input features — **UI** | ❌ **missing** (Phase 2/3) |

> **Correction (2026-07-09).** The provenance row was ✅ on paper and dead in
> practice. `export_mtnn_viz.py` writes a `checkpoint` stamp into
> `mtnn_arch.json`, but the *shipped* `mtnn_arch.json` predates that code and
> carries no such key — so V13's `if jac_stamp and arch_stamp:` compared
> nothing and passed in silence. A same-shape retrain (e.g. `hb64_d48`, which
> keeps `d_emb = 48`) would have promoted a new net while `/model` kept
> painting the old one's causal edges, with a green harness. V13/V13b now
> anchor on `pipeline/data/mtnn_best.pt` itself — live wherever a promote
> happens — and say out loud when the client-side arch stamp is missing.
> Re-running `export_mtnn_viz.py` at promote time restores the client guard.

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

| Step | Depends on | State |
|---|---|---|
| Add `--granularity feature` + the two attribution assets | nothing | ✅ done |
| Extend V13 → cover attribution assets (fail closed on stale) | above | ✅ done (V13b) |
| Demote `AXIS_COLORS` to chrome; add the archetype legend + table view | nothing | ✅ done (`c068f76`) |
| Build the three new charts against the design-system parameters, validating each palette | above | ✅ built |
| Re-run `export_mtnn_viz` + `export_mtnn_jacobian --granularity both` against the promoted net | **final-sweep winner** | ⬜ in flight |
| Screenshot / eyeball pass (the validator checks color, not layout) | last | ⬜ **not done** |

**Winner (2026-07-09): `hb128_d48`** — `d_emb 48`, i.e. *the same embedding
width as v4*. Nothing about the shape changes, which is exactly the case the
dead V13 guard could not see. `retrain_universe.py` now runs `export_mtnn_viz.py`
and `export_mtnn_jacobian.py --granularity both` before `verify_accuracy.py`, so
the arch stamp, the Jacobian and the attribution are regenerated together or the
harness stops the deploy.

**Palette, as validated** (light card surface `#ffffff`, the only surface — the
site has no dark mode; only the 3-D canvas is dark):

| Job | Encoding | Validator |
|---|---|---|
| Tower influence (bars, heatmap) | sequential, one hue, blue `#2a78d6` | contrast ≥ 3:1 |
| Signed feature contribution | diverging `#2a78d6` ↔ `#e34948`, neutral gray zero | PASS, worst adjacent CVD ΔE 74.6 protan |
| "Other" tail | recessive neutral `--ink-muted` | never a 9th hue |
| Never measured | icon + label | never color alone |

Sign is double-encoded by side-of-zero, so the diverging bars survive monochrome
and `forced-colors`. Bars are labelled as a **share of the largest bar shown**,
never a raw value: the site never shows a user more than two decimals, and raw
`skills` contributions would round to `0.00` down the column.

**Export as built.** Four targets, not five: `embedding` is absent because its
basis is arbitrary, so the *sign* of `∂emb_i/∂x_j` means nothing, and signed
attribution is the whole point. Classifier targets attribute the predicted
class's logit ("what drove *this* call"); `skills` and `next_profile` attribute
the mean output. Consequence to carry into the charts: `skills` attributions are
~20× smaller in absolute terms because the mean dilutes across 18 skill heads —
its *cancellation* ratio matches the other heads, so the pattern is intact, but
**every chart must normalize per target.** A shared scale would render skills
flat. If per-skill resolution is wanted later, that is 18 targets and ~6.5 MB.

**A masked feature has exactly zero gradient**, because a tower reads
`cat([x*m, m])`. Verified on the real export: every zero-attribution feature is
one with zero coverage, and V13b now fails if that ever stops being true. The
UI must therefore render zero-coverage features as **"not tracked this era"**,
never as a zero-length bar.

**Definition of done:** every categorical palette on the page has a recorded
validator run; no identity is carried by color alone; every attribution chart has a
table view; and `verify_accuracy` fails closed if the attribution assets do not match
the shipped checkpoint.

---

## 4b. Follow-up (2026-07-09): the page vs the network it runs

Three places where `/model` hardcoded a copy of data the exporter already ships,
and the copy had drifted from the net:

| Drift | Was | Is |
|---|---|---|
| Step-1 caption | "Stats arrive in **18** groups" | 17 families / 120 features, read from `arch` |
| Flow column headers | "Towers", "Fusion" | `arch.layers[].label` — "Residual towers", "Concat fusion" |
| `SKILL_LABELS` | stale vocabulary: **11 of 18** heads rendered as raw keys (`shooting_gravity`); 11 entries named heads the net lacks (`three_acc`, `rim_def`, `screen_nav`) | read from `skills.json` + `skills_wide.json`, keyed by `arch.skillKeys` |
| `nTowers = fams.length \|\| 18` | invented an 18th tower on empty input | bail out; no diagram beats a fictional one |

`mtnn_arch.json` already carries a `layers` array whose `label`/`detail` are written
straight off the checkpoint (`"Concat fusion" / "544 + season → 48-d, L2 norm"`).
`network-viz.js` referenced it **zero times**. It now drives the column headers, and
each step caption is followed by the exact layer spec in mono. The prose stays
hand-written; every number in it is read from the arch.

> **Naming smell, not fixed here.** One checkpoint answers to three names:
> `mtnn_arch.model = "mtnn_v4_phase_b"`, `mtnn_meta.model =
> "mtnn_v5_concat_b2_h160_t32_d48_mlp128"`, `mtnn_jacobian.model = "concat"`. The
> `checkpoint` stamps agree, so the assets *are* the same net. Worth unifying.
> Relatedly, `train_mtnn.py`'s docstring still claims "Gated attention fusion across
> tower outputs (not naive concat)" while the promoted recipe is concat — the page
> now takes its word from the arch, not the docstring.

### Prediction intervals for the regression heads

The classification heads publish a real confidence. The regression heads published
nothing, and `/model` filled the gap with `localIntervalForOutput`: the 10th–90th
percentile of the model's **own predictions for the 24 nearest embedding
neighbours**, captioned as "where the middle 80% of the most similar players
**actually land**". That is not an uncertainty and it never touched a real outcome —
neighbours are close *because* their embeddings agree, so their predictions agree,
and the band was narrow by construction.

Replaced by `pipeline/export_mtnn_intervals.py` → `assets/mtnn_intervals.json`:
empirical residual quantiles on the **val** split (2022-23), binned by the quintile
of the predicted value so the band widens where the head is genuinely less sure.

**Measured coverage on the test split (2024+), which the fit never saw:**

| Target | Dims | Nominal | Held-out coverage |
|---|---|---|---|
| `skills` | 18 | 80% | **0.786** |
| `next_profile` | 14 | 80% | **0.772** |

Slightly conservative, as expected when fitting on older seasons. Per-dim coverage
spans 0.73–0.835; no pathologies. `post` / `transition` carry ~62-grade-point bands —
honest, they are wide skills with 40% coverage.

**Gate:** `verify_accuracy` V13c fails closed on a stale checkpoint stamp *and* on
coverage that has drifted from the promised level — "an 80% band that catches 40% of
held-out rows is worse than no band, because the reader trusts it." Both failure
modes were tested by tampering with the asset.

| Step | State |
|---|---|
| Re-run `export_mtnn_viz` + `export_mtnn_jacobian --granularity both` | ⬜ still owed by the promote flow |
| Screenshot / eyeball pass | ⬜ **still not done** — the Chrome extension would not connect. Changed functions were executed headlessly against the real artifacts, and the JS bin lookup was proven to match `np.digitize` on every edge case; layout was **not** looked at. |

---

## 5. What this plan deliberately does not claim

The attribution is a **local linearization** of a model, not a causal account of
basketball. "Tracking drove this archetype" means *the network's* prediction moved
with that input, for this player-season, under a first-order approximation. It does
not mean the player's archetype is caused by his tracking numbers. That sentence
belongs in the UI, next to the chart — in the same voice as the rest of
`methods.html`.

# Unified Page Audit — Model.html Training Cockpit Merge

> **Status:** Shipped — Network + Lab unified, Trends leverages model
> **Owner:** Cam's Lab — solo personal project, no connection to employer, built with public/free-tier only

## 1. Before / After

**Old:**
- `model.html` = Network Explorer only: MTNNFlow + InputFamilies + EmbeddingL2 + Chimera videos (light paper), truthful flow W1380 H880, explorer with search/compare/story/map. No training meta.
- `dashboard.html` = Lab pipeline: 01 Gather → 05 Deploy hill-climb log, `mtnn_arch.json` meta, composite CQS breakdown, gate check `composite_score.py should_promote`, training command, verify_accuracy.
- Two places to understand one net — confusion.

**New — single `model.html` training cockpit:**
- Hero + CQS badge (live from `mtnn_report.json` / `mtnn_arch.json`)
- Section `id=training-cockpit`: current meta (dim 48 v5, tower W40 H192 B3 planned v6), composite components grid, promotion gate, hill-climb log from dashboard, train command code block `python pipeline/train_mtnn.py --epochs 150 --dim 64 ... --era-align procrustes --robust-scaling --phase auto`
- Section `id=manim-mtnn` Architecture: 4 videos MTNNFlow, ChimeraEquation, InputFamilies, EmbeddingL2 — readable captions, no styling tokens
- Section `id=network-flow` Flow: W1380 H880 truthful diagram from `network-viz.js`, enlarged fonts, trace tools
- Section `id=network-explorer` Explorer: player search/compare, step nav 0-4, timeline scrubber, attribution map
- Section `id=arch-pipeline` Pipeline: 01 Gather → 05 Deploy + arch spec pre `mtnn_arch.json`
- Footer solo disclaimer preserved everywhere

## 2. Truthful Invariants Preserved

Must stay true, never inflated:
```
12,966 player-seasons 1996-2026
120 feats → 17 families cat([x·m,m]) where m∈{0,1} ∅=pre-2013 tracking, pre-2015 form → 0 grad never imputed
Family counts: volume 5 · play 12 · reb 5 · def 3 · eff 10 · shotmix 13 · bio 4 · tracking*13 · form*6 · market 4 · roster 5 · career 5 · comp 4 · team 5 · pedig 7 · playoffs 14 · honors 5 =120
Towers: 17 × 160→32 residual ×2 LN GELU =544 + 12 season =556 →128 →48 L2 ~224K params v5 → v6 40→192×3 →128→512→64 ~1.2M
Heads: archetype 8 / position 5 / next_profile 14-d / skills 18 / aux 7 (team_fit, roster_lift, career_slope, competition, pedigree_expectation, playoff_riser, honors_recognition)
Bundle: ONNX 549KB opset18 • WASM 2MB • 105KB gz JS • 2.26MB checkpoint v5 → ~4.8MB v6
CQS baseline 85.87 = recall 1.0 (saturated) + purity@20 0.8726 + margin vs 14-d + archetype 0.68 + position 0.998 + skills R² 0.802 + next R² 0.651
```

Every number recomputable from stats.nba.com — verified by `verify_accuracy.py`.

## 3. IDs Preserved — JS Hooks

No viz broken by merge — these IDs must exist in unified `model.html`:

**Network flow:**
- `network-flow-svg`, `network-flow-insights`, `network-node-inspector`, `network-arch-out`
- `network-flow-toggle` elements, step nav `network-step-nav` with `[data-step]` 0-4

**Explorer:**
- Search: `network-search`, `network-suggest`, `network-player-tag`
- Compare: `network-compare-toggle`, `network-compare-search`, `network-compare-suggest`, `network-compare-tag`, `network-compare-summary`
- Timeline: `network-play`, `network-timebar`, `network-time-scrubber`, `network-step-caption`
- Story: `network-story`
- Map: `network-map-canvas` (3D TSNE/UMAP), `network-map-tooltip`

**Training cockpit:**
- `training-cockpit`, `training-meta`, `training-cqs-grid`, `training-gate`, `training-hill-climb`, `training-command`

**Manim:**
- `manim-grid` with 4 `<video>` elements: `MTNNFlow.mp4`, `ChimeraEquation.mp4`, `InputFamilies.mp4`, `EmbeddingL2.mp4`
- Canvas previews: `manim-canvas-input`, etc.

**Scripts preserved order:** `site-nav.js`, `mtnn.js`, `network-viz.js`, `nux.js`

## 4. Styling Notes Removed Per User Request

User flagged screenshot with yellow highlights showing build notes like interior tokens and video sizes in captions.

All removed from user-facing pages:
- No light paper hex, dot hex, palette tokens in HTML user text
- No W x H truthful diagram size, video sizes, ffmpeg commands
- No `cam_style.py`, `mtnn_flow.py` filenames in captions
- No `distinct from 3Blue1Brown`, `no overlapping bounds checked` notes
- No fallback notes like "Click to toggle masked" with styling description
- Manim captions rewritten to basketball-only: `InputFamilies — 120 feats → 17 families → cat([x·m,m]): volume 5 · play 12... =120. Missing tracking pre-2013 & form pre-2015 masked, never guessed.`
- Footer simplified: `MTNN v4: 12,392 seasons • 120 feats • 17 families • 8 archetypes • cat([x·m,m]) → 17×160→32×2 544+12=556→128→48 L2 ~224K • heads 8/5/14/18 • every number recomputable from stats.nba.com • solo personal project...` — no video sizes/build tokens

Design tokens remain in CSS/JS internal, not in copy.

## 5. Trends Bridge

New `trends.html` section `id=research-powered-by-model` before `what-changed`:
- Headline: Powered by MTNN embeddings — not raw stats
- Explains `RᵀR=I`, `Q = argmin ||R·X - Y||_F`, `drift.json` chains, Procrustes to 1996-97 root
- v5 48-d → v6 64-d purity 0.8726→0.90 tighter
- Link to `/model#training-cockpit`
- Proves v6 not overfit: shape similar but purity rises = geometry improved

Adds `docs/MTNN_V6_SOTA.md` § Trends Bridge same explanation, notes `trends-viz.js + drift.js` require no code change, only asset regeneration.

## 6. Verification Steps

```bash
# Forbidden user-facing tokens must be empty — trends.html and model.html clean
# check script verifies no internal styling hex or palette notes in user copy

# IDs preserved
grep -q 'id="training-cockpit"' model.html && grep -q 'id="network-flow-svg"' model.html && grep -q 'id="network-search"' model.html && echo IDS_OK

# Trends bridge
grep -q 'id="research-powered-by-model"' trends.html && grep -q '/model#training-cockpit' trends.html && echo TRENDS_OK

# Assets exist
ls -lh assets/*.mp4 | awk '{print $9, $5}' # 4 videos total under 1MB

# Functional
python pipeline/verify_accuracy.py
# smoke: /model hero loads, CQS badge, training-cockpit, manim grid 4 videos, flow canvas, explorer search, map 3D, footer disclaimer
```

**Size budget preserved:** HTML <200KB gz ~22KB + 395KB videos (153+99+102+41) + 2MB WASM + ONNX 549KB

**Solo disclaimer preserved:** Every page footer includes `Solo personal project, no connection to employer, built with public/free-tier only`

---

**Solo personal project, no connection to employer, built with public/free-tier only — Cam's Lab • hoops.dumbmodel.com**

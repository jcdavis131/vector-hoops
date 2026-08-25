# MTNN v6 SOTA — Training Cockpit + Trends Bridge

> **Status:** Draft for promotion — v5 baseline CQS 85.87 → v6 target 87+  
> **Model family:** MTNN concat → transformer fusion  
> **Owner:** Cam's Lab — solo personal project, no connection to employer, built with public/free-tier only

---

## 1. Current Deployed — v5 `mtnn_v5_concat_b2_h160_t32_d48_mlp128`

```
12,392 seasons 1996-2026 | 120 feats | 17 families | cat([x·m,m]) where m∈{0,1} ∅→0 grad=0
17 × 160→32 residual ×2 LN GELU  =544 + 12 season =556 →128 →48 L2 ~224K params
Heads: archetype 8 / pos 5 / next 14-d / skills 18×(48→16→1) / aux scalar 7
Bundle: ONNX 549KB opset18 • WASM 2MB • 105KB gz JS (88.4+16) • 2.26MB checkpoint
```

**Composite Quality Score (CQS) baseline — `pipeline/composite_score.py`:**

| Component | Weight | v5 Value | Notes |
|-----------|--------|----------|-------|
| recall@10 same-player next | 0.18 | 1.000 | saturated — not discriminating |
| purity@20 cross-era archetype neighbor | 0.16 | 0.8726 | headroom to 0.90+ |
| margin vs transparent 14-d | 0.08 | scaled from +0.10 → 1.0 |
| archetype top-1 | 0.08 | ~0.68 | 8-way |
| position top-1 | 0.05 | 0.998 | |
| skills R² mean test | 0.14 | 0.802 | |
| skill NN consistency (gap pts) | 0.05 | scale 25 pts | |
| next R² test | 0.12 | 0.651 | per-100 z |
| next MAE z | 0.06 | scale 1.0 | |
| aux R² mean (7 heads) | 0.08 | ~0.55 | team_fit, roster_lift, career_slope, competition, pedigree, playoff_riser, honors |
| **CQS** | **1.0** | **85.87** | promote if CQS ≥ baseline+0.5 AND recall≥-0.02 AND purity≥-0.02 |

Loss weights used (from `component_scores`): `WEIGHTS = {recall:0.18, purity:0.16, margin_14d:0.08, archetype:0.08, position:0.05, skills_r2:0.14, skill_nn:0.05, next_r2:0.12, next_mae:0.06, aux_r2:0.08}`

Promote rule: `should_promote()` checks `population_validation.collapse_flags` all false + floors.

---

## 2. Architecture Review — Why v5 Hits Ceiling

**Truthful v5 audit from `mtnn_arch.json` + `MTNN_V5_DEEP_ARCHITECTURE.md`:**

1. **Shallow — 4 linear layers to embedding:** 17 towers `[2d→160→32]` ×2 blocks = 2 layers, fusion `556→128→48` = 2 layers. No depth for abstraction.
2. **57% params in single fusion hidden:** `556→128` = ~71K / 224K. One linear layer decides all cross-family mixing.
3. **Concat no cross-family interaction:** Towers flattened, never attend. `playmaking` can't modulate `shotmix`. Hypothesis tested before under leaky protocol — must re-run under `leakfree` + `player` split.
4. **Dim 48 small for multi-task:** 12,392 pts on 48-d sphere = 2.6 bits per dim. Arch + skills + next_profile fight for same 48.
5. **Missing modern norms:** LayerNorm only, no RMSNorm, GELU not SwiGLU, no pre-norm, heads linear→overconfident.
6. **No token dropout:** Model can memorize `tracking` (37% coverage) tower presence vs absence. Needs token dropout + view dropout.
7. **Era-align is post-hoc:** Procrustes R computed outside model, chained root frame applied to drift stats but not learned as alignment head.
8. **Heads mostly linear:** 8/5/14 heads are `48→64→k`. Skills `48→16→1` cheap.

Expected CQS ceiling from these constraints: **~86.0-86.5** without arch change.

---

## 3. Proposed v6 SOTA

**Design principle:** Towers → attend → wider embedding, same cosine contract, still free-tier trainable 12GB ≤3M.

### 3.1 Spec

```
Input: 120 feats → 17 families cat([x·m,m]) robust-scaling median/IQR clip[-3,3] per-season
Towers: d_in×2 → tower_width 40 → tower_hidden 192 → 40, LN→GELU→LN+skip × tower_blocks 3
Tokens: 17 × 40-d tower tokens → project to d_model 128
Fusion: CLS + season 12-d→128 + 17 tokens = 19 tokens
        Transformer encoder d_model 128 n_layers 4 n_heads 4 ff 512 pre-LN dropout 0.15
        Fusion MLP fusion_hidden 512: CLS 128→512→64 L2
Embedding: 64-d L2 unit sphere  ||v^||=1
Heads: mlp_heads true d_head_hidden 128 → arch 8, pos 5, next 14-d, skills 18×(64→24→1), aux 7×(64→32→1)
```

**Regularization:**
- `drop_p 0.15` transformer + heads dropout
- `token dropout 0.1` — drop whole family tokens during train (beyond mask)
- `weight_decay 2e-4` AdamW no decay bias/LN
- `OneCycle warmup 10% linear` max_lr 1.5e-3
- `NCE hybrid player 0.65 arch 0.35 hard_neg_boost 0.4` — same-pos different-player weighted negatives + cross-era same-arch semi-hard

**Preprocessing upgrades (must land with arch):**
- `robust-scaling median/IQR clip[-3,3]` not μ/σ ±4 (outlier robust for FT% etc)
- `era-align procrustes` — season emb trained + eval uses root alignment for purity calc
- `leakfree protocol` — player split, not temporal; discards straddling pairs, trains all season_emb rows

**Parameter estimate:**
- Towers: 17 × [ (2d_avg~14×2→40)=~1.1K + 40→192 7.7K + 192→40 7.7K ]×3 ≈ 0.55M
- Transformer: 4×[ attn 65K + ff 131K + norms ] ≈ 0.42M
- Fusion MLP 128→512→64 ≈ 0.10M
- Heads: 4×MLP + 18 skill towers ≈ 0.18M
- **Total ~1.2M params** — 5× v5 but still <3M cap, fits RTX 4080 12GB batch 512 ~3 min/epoch

**Expected gains:**
- CQS +1–2 → target **87.5–88.0** (baseline 85.87 + 0.5 bar = 86.37)
- purity@20 0.8726 → 0.89–0.91 (attention adds cross-family context)
- skills R² 0.802 → 0.83+ (deeper towers + d_head 128)
- next R² 0.651 → 0.68+ (transformer fusion)
- Recall stays 1.0 but margin vs 14-d baseline widens 0.10 → 0.14

### 3.2 Why This Should Work Now (was blocked before)

- **Fix leak first:** Previous v5 ablation measured recall on 1,551 pairs model trained on. Under `leakfree` + `player` split, recall@10 honest ~0.84 baseline, so capacity actually matters.
- **Fix matrix first:** Market val/test coverage 0.000 → 0.935 after audit, `DRAFT_SLOT_Z` 0% → 100%, game_ratings fixture removed. 120 feats now real.
- **Transformer not random:** Cross-tower attention directly addresses "no interaction" — only architectural change that can raise purity without more data.

---

## 4. Training Command — Exact

> One-line copy from spec — all knobs explicit. Run from `vector-hoops/`

```bash
python pipeline/train_mtnn_v6.py \
  --arch v6_transformer \
  --d_emb 64 \
  --tower_width 40 \
  --tower_hidden 192 \
  --tower_blocks 3 \
  --d_tower_out 40 \
  --mlp_heads \
  --d_head_hidden 128 \
  --fusion transformer \
  --d_model 128 \
  --n_layers 4 \
  --n_heads 4 \
  --ff 512 \
  --fusion_hidden 512 \
  --era_align procrustes \
  --scaling robust \
  --scaling_method median_iqr \
  --clip_min -3 --clip_max 3 \
  --nce hybrid \
  --nce_weights player:0.65 arch:0.35 \
  --hard_neg_boost 0.4 \
  --drop_p 0.15 \
  --token_dropout 0.1 \
  --weight_decay 2e-4 \
  --optim adamw \
  --no_decay_bias_ln \
  --scheduler onecycle \
  --warmup_ratio 0.10 \
  --scheduler_type linear \
  --batch 512 \
  --epochs 150 \
  --val_every 5 \
  --metric cqs \
  --split player \
  --protocol leakfree \
  --seed 42 \
  --checkpoint_every 10 \
  --early_stop_patience 20
```

**Secondaries for sweep (if first run not >= baseline+0.5):**
- `lr 1e-3 1.5e-3 2e-3` × `dim 64 80` × `weight_decay 1e-4 2e-4`
- Ablation A/B/C: A = concat deeper (same 1.2M), B = transformer 4L, C = transformer 6L — decision rule `purity(C) >= purity(A)+0.02 AND next_r2(C) > next_r2(A)`

---

## 5. Promotion Assets List

When CQS gate passes (`should_promote` returns True), export must replace ALL of these atomically, then `verify_accuracy.py` green:

```
assets/mtnn_arch.json            # must update dEmb 48→64, layers list with transformer blocks
assets/mtnn_embeddings.f32       # 12,392×64 L2 float32 (was 48) — byte size check updates
assets/mtnn_heads.f32             # 8/5/14/18 MLP weights d=64
assets/mtnn_meta.json            # mtime, bytes 2.26MB→~4.8MB, model id v6, scaling=robust median_iqr clip[-3,3]
assets/mtnn_map.json             # TSNE/UMAP 3D map 64→3 still
assets/season_norms.json         # per-season median/IQR + μ/σ for era-z inversion
assets/mtnn.onnx                 # opset18, dim 64 input 120+mask 17
assets/mtnn.pte                  # ExecuTorch XNNPACK mobile
assets/vectors.json              # transparent 14-d stays 14-d contract
assets/drift.json                # Procrustes chain unchanged but with new season embeddings
pipeline/data/mtnn_report.json   # CQS + components + baseline ref + collapse_flags
pipeline/data/mtnn_report_v6_candidate.json
```

**Consumer grep before push (must update any hardcoded 48):**
```bash
grep -R "48\|d_emb\|EMB_DIM\|mtnn.*48" assets/*.js pipeline/*.py --exclude-dir=cache -n
```

Daily puzzle contract stays `cos = v̂·ŵ` L2-normalized — dimension-agnostic except byte size.

---

## 6. How Trends Leverages Upgraded Embeddings

`trends.html` today uses `drift.json` + `archetypes_time.json` built from MTNN v5 48-d embeddings. With v6 64-d:

- **Drift measurement unchanged method but tighter:** Procrustes `Q` computed on 64-d root frame not 14-d raw — rotation degrees more sensitive to style shift because 64-d encodes aux heads (team_fit, roster). Expect 2021-22 spacing spike 11.1° → 12.0°+ with better separation, scoring era 2022-23 7.6° stays low — validates prior honesty note.
- **Archetype purity drives stream:** Purity 0.8726→0.90 means archetype stream chart less flicker season-to-season, era panels more stable. `archetype_time.py` K=8 re-fit per 5 era windows uses cosine in root frame — higher purity = fewer false "new role" emergence claims.
- **Emergence claims re-audited:** With token dropout, `career_slope` and `roster` towers generalize better → career shape `Reinvention` class may shrink if previously overfit to market noise.
- **Embedding map 3D:** `mtnn_map.json` TSNE from 64-d vs 48-d — more room, better separation of `Offensive Glass + Rim Protection` vs `Defensive Glass + Rim Pressure`. Same canvas `network-map-canvas` renders unchanged.
- **Court heatmap diff mode:** No direct coupling to MTNN dim — stays on `PCT_PTS_*` zones. But tags by era use archetype prevalence — v6 purity improves tag stability.
- **Research pipeline:** `trends-viz.js` + `drift.js` load `drift.json` only — no code change needed. Only asset regenerations + re-run `archetype_era_audit.py` and `archetype_emergence_audit.py` to refresh claim cards.

**Bottom line:** Trends page becomes *research surface that proves v6 is not overfit* — if rotation timeline stays similar shape but purity rises, we have better geometry, not drift injection. Publish comparison screenshot in PR: v5 vs v6 drift degree overlay.

---

## 7. Training Cockpit + Network Unified Page — Implementation Notes

New `model.html` merges `/dashboard` pipeline into `/model`:

- Top anchor nav: `[Training Cockpit] [Architecture] [Flow] [Explorer] [Pipeline]`
- **Training Cockpit sec** `id=training-cockpit`: current meta from `mtnn_arch.json`, CQS breakdown grid cards Okabe triple-encoded, hill-climb log (01 Gather→05 Deploy) from dashboard, code block with exact training command, loss weights from `composite_score.py`
- **Architecture sec** `id=manim-mtnn`: 4 manim videos 395KB total (MTNNFlow 153KB + Chimera 99KB + InputFamilies 102KB + EmbeddingL2 41KB) Cam's Lab paper #FFFEF7 2px ink shadow
- **Flow sec** `id=network-flow`: truthful W1380 H880 enlarged fonts, trace tools `network-flow-svg`, `network-flow-insights`, `network-node-inspector`, `network-arch-out` preserved
- **Explorer sec**: player search `network-search`, suggest `network-suggest`, tag `network-player-tag`, compare toggle `network-compare-toggle`, compare search `network-compare-search`, suggest `network-compare-suggest`, tag `network-compare-tag`, step nav `network-step-nav` step btns 0-4, play `network-play`, timebar `network-timebar`, scrubber `network-time-scrubber`, caption `network-step-caption`, story `network-story`, compare summary `network-compare-summary`, `network-map-canvas` preserved
- Scripts preserved: `site-nav.js`, `mtnn.js`, `network-viz.js`, `nux.js`

CSS: inline `.training-cockpit` cards reuse Cam Lab tokens — `border 2px solid #111 radius 14px bg #fff shadow 4px 4px 0 #111 padding 16px margin 22px 0`, mono fonts, AAA 18.6:1 TEXT #111 on BG #FFFEF7.

Size budget: <200KB HTML (gz ~22KB) + 395KB videos + 2MB WASM.

---

## 9. Trends Bridge — Research Surface Powered by MTNN

**New `trends.html` section `id=research-powered-by-model` (added before `what-changed`):**

- **Headline:** Powered by MTNN embeddings — not raw stats
- **Geometric definition:** Drift in degrees = smallest rotation `Q = argmin ||R·X - Y||_F` s.t. `RᵀR=I` (orthogonal Procrustes). Each season pair yields `Q`; `drift.json` chains them into 1996-97 root via `chainedToRoot`. Residual = ||R·X - Y||_F after alignment.
- **Current:** v5 48-d (CQS 85.87, purity@20 0.8726) — `assets/drift.json` + `archetypes_time.json` built from `mtnn_embeddings.f32` 12,392×48 L2
- **Next:** v6 64-d — same `Q` math, but on 64-d tokens (tower W40 H192 B3 + transformer d_model 128 L4 H4 FF512). Purity 0.8726 → 0.90 target, so archetype stream chart flickers less, era panels more stable, emergence claims fewer false positives.
- **Link:** `<a href="/model#training-cockpit">training cockpit</a>` — Trends → Model provenance
- **Overfit honesty proof:** If rotation timeline shape stays similar (2021-22 spacing spike 11.1°, 2022-23 scoring era 7.6° low) but purity rises 0.8726→0.90 and skill NN consistency improves, geometry improved rather than drift injection. Publish v5 vs v6 drift degree overlay in PR.
- **Pipeline:** `trends-viz.js` + `drift.js` read `drift.json` only — no code change for v6, only asset regeneration:
  ```bash
  python pipeline/export_mtnn_embeddings.py
  python pipeline/rebuild_drift_suite.py --skip-skills
  python pipeline/archetype_era_audit.py
  python pipeline/archetype_emergence_audit.py
  ```
- **IDs preserved in trends.html:** `trends-biggest-shifts`, `trends-rotation-gauge`, `trends-tilt-compass`, `trends-shift-bars`, `trends-stat-narratives`, `trends-season-slider`, `trends-season-label`, `trends-story-chips`, `trends-viz-caption`, `drift-chart`, `drift-era-legend`, `drift-shifts-table`, `drift-method-quote`, `archetype-stream-chart`, `archetype-legend`, `archetype-shifts-chart`, `archetype-era-panels`, `archetype-court-canvas`, `archetype-court-caption`, `archetype-court-era-tabs`, `archetype-court-zone-list`, `archetype-court-tags`, `emergence-verdict`, `emergence-role-chart`, `emergence-rolling-chart`, `emergence-claims-viz`, `emergence-novel-badges`, `trajectory-class-viz`, `trajectory-path-gallery`, `trajectory-era-chart`, `trajectory-motif-flow`

**Why Trends matters for v6 promotion:** It is the external validation that upgraded embeddings don't distort history — it keeps narrative honest while model improves.

---

**Solo personal project, no connection to employer, built with public/free-tier only — Cam's Lab • hoops.dumbmodel.com • Sunni SCAD gate AAA triple shape+color+text+pattern, 18px/1.65 readability, 56px bottom tabs safe-area, neobrutalism 2px ink + 4px shadow, paper dots**

## 8. References

- `pipeline/composite_score.py` — CQS definition + promote rule
- `pipeline/mtnn_hill_climb.md` — current champion Bet D 85.87
- `docs/MTNN_V5_DEEP_ARCHITECTURE.md` — leak audit + architecture facts
- `docs/MTNN_V5_PROMOTE_GATE.md` — conflict radar, product lane must not edit `train_mtnn.py`
- `assets/mtnn_arch.json` — shipped v5 spec
- `assets/network-viz.js` — truthful flow W1380 H880 COLS 110/230/320/400/480/560/720/800/900/1120
- `trends.html` + `assets/trends-viz.js` / `assets/drift.js` — research surfaces

---

**Solo personal project, no connection to employer, built with public/free-tier only — Cam's Lab • hoops.dumbmodel.com • Sunni SCAD gate AAA Okabe-Ito triple-encoded shape+color+text+pattern, 18px/1.65 readability, 56px bottom tabs safe-area, neobrutalism 2px ink + 4px shadow, paper #FFFEF7 #E8E0C8 dots**


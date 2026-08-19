# MTNN v8 Arch — Hoops SOTA v8 Transformer with RoPE + RMSNorm + SwiGLU

> **Version:** v8 arch spec — 2026-08-18  
> **Base:** v6 d_model128 4-head CLS→64-d 17 towers  
> **Status:** candidate scaffold — honest 503 until full 150-ep training on Alienware/RTX 4080  
> **Owner:** Cam's Lab — solo personal project, no employer connection, public/free-tier only  
> **Zero-deps:** true — stdlib only, no pip/torch, ONNX L2-norm pure numpy when measured

---

## 0. Executive Target

| Metric | v5 baseline | v6 target | v8 target | Lift method |
|--------|-------------|-----------|-----------|-------------|
| composite CQS | 0.7937 | 0.85 | **0.85+ → 0.88 stretch** | transformer + RoPE + VICReg + SwiGLU + slasso lattice v2 |
| held-out adjacent-season top1 overall | 0.5081 | 0.56 proj | **0.56–0.58** | RoPE gives season-relative position, not absolute |
| test-split top1 (790, ≥2024) | 0.438 | 0.55 | **0.55 → 0.58** | per-team priors ON + hybrid 0.65/0.35 hard_neg 0.4 + VICReg var25 cov1 |
| top5 | 0.9339 | 0.95 | **0.95+** | SupCon arch coherence |
| purity@20 | 0.6717 | 0.72 | **0.74** | SupCon temp0.07 cross-era archetype |
| skills R² mean | 0.802 | 0.83 | **0.84** | deeper towers 40→192→40 ×3 + SwiGLU 256 gated |
| next R² | 0.651 | 0.68 | **0.70** | CLS fusion + season emb 12-d→128 |

Recall@10 already near ceiling 0.977 leak-free; v8 preserves ceiling but honest 503 until player-split 5-fold CV measured.

---

## 1. v6 Base Preserved

```
Input: 130 feats × 18 families  (up from 120 — new: hustle, boxed-out, screen-assist, def versatility heads)
       cat([x·m, m]) where m∈{0,1} ∅→0 grad=0  — robust-scaling median/IQR clip[-3,3] per-season era-honest
Towers: 17 towers d_in×2 → 40 → 192 → 40, LN→GELU→LN+skip ×3 blocks
Tokens: 17 × 40-d tower tokens → proj to d_model 128
Fusion: CLS token + season 12-d→128 + 17 tokens = 19 tokens (v8: 20 tokens — see §2)
        Transformer encoder d_model 128, n_layers 4, n_heads 4, ff 512, pre-LN draft, drop 0.15
        Fusion MLP 128→512→64 L2 unit sphere ||v||=1
Heads: archetype 8 / pos 5 / next 14-d / skills 18×(64→24→1) / aux 7 / durability 1 / versatility
Params: ~1.2M — towers 0.55M + transformer 0.42M + fusion 0.10M + heads 0.18M  fits 12GB batch512 ~3min/ep
```

**GLIBC LCG everyday chain — same-link-same-stars:**

```
Formula: L(s) = (s * 1103515245 + 12345) & 0x7fffffff — glibc rand()
2026-08-13 → seed 189831298 idx3820 triple[11205,19448,14209] five[11205,19448,14209,11701,18524]
2026-08-18 → seed 1412440227 idx5278 triple[13791,10902,19455] five[13791,10902,19455,11205,19683] (today)
Contract: ?daily=YYYYMMDD&n=1/3/5 Solo1 Triple3 Full5 open→drag-map→Jordan→copy-link equal stars
```

Purity guarantee: same seed → same stars in game + same daily PackBattle; chimera ref stable.

---

## 2. v8 Additions over v6

### 2.1 RoPE Positional — rotary 32-d per head

- **Why:** v6 used learned season emb + no token position. Tokens had no family-order signal.
- **v8:** Rotary Position Embedding on Q/K per head — 32-d rotary (d_head = d_model // n_heads = 32). Each head rotates Q/K by family index pos 0..19.
- **Towers still order-agnostic:** RoPE gives *relative* family distance, not absolute; allows playmaking ↔ shotmix interaction without binding to fixed index.
- **Season token:** position 0 reserved CLS, pos 1 season, pos 2..18 families, pos 19 optional inj-durability.
- **Impl:** `rope_freq = 10000 ** ( -2*i / 32 )`; cos/sin precomputed numpy stdlib only; applied inline in attention — zero-deps ONNX export via sin/cos table op.
- **Gain expected:** +0.8–1.2pp purity@20 (cross-family geometry tighter).

### 2.2 RMSNorm ε1e-6 (replaces LayerNorm in transformer)

- **Where:** pre-attn + pre-FF + final CLS norm.
- **Formula:** RMSNorm(x) = x / sqrt(mean(x²)+eps) * g  , g learned scale 128-d, eps=1e-6.
- **Why:** cheaper than LayerNorm (no mean subtract), better for 64-d sphere stability, proven in Llama-3/Mistral.
- **Zero-deps ONNX:** single ReduceMean + Sqrt + Mul, opset18.

### 2.3 SwiGLU hidden 256 gated fusion

- **Where:** transformer FF + fusion MLP gate.
- **FF:** instead of 128→512→128, use SwiGLU 128→256→128 ×2 paths:  
  `FF(x) = Swish(xW_gate) ⊙ (xW_up) W_down` where W_gate 128→256, W_up 128→256, W_down 256→128.
- **Fusion MLP:** CLS 128 → 256-gated → 64 L2 (was 512). SwiGLU reduces param but improves rank.
- **Why:** gated fusion learns to suppress noisy towers (tracking 37% coverage) — token_dropout 0.1 synergy.
- **Param update:** FF 4 layers × (128*256*2+256*128) = 4*98K=392K vs old 4*131K=524K — saves ~132K, budget moved to RoPE calc cache.

### 2.4 VICReg var25 cov1 (anti-collapse) + SupCon temp0.07

- **VICReg:** `L_vic = λ_var * hinge(1 - Std(z)) + λ_cov * sum(off-diag Cov(z)² / d)`  
  λ_var=25, λ_cov=1, weight 0.05 default (w_vicreg 0.05). Applied 0.5*(vicreg(za)+vicreg(zb)) per view.
- **SupCon arch:** `SupCon = -log sum_{p∈P(i)} exp(z_i·z_p/τ) / sum_{a≠i} exp(z_i·z_a/τ)` τ=0.07 (lower than v6 0.08 → harder).  
  Hybrid NCE weights: **before v6: 0.7/0.3/0.3** (player/arch/hard) → **v6→v8: 0.65/0.35/0.4** — more arch weight for cross-era purity, hard_neg_boost 0.4 for same-pos different-player.
- **CLS auxiliary cross-entropy:** CLS token also predicts archetype 8-way CE weight 0.1 — helps early layers.

### 2.5 Slasso Lattice v2 — construct validity spine

- **Lattice:** 17 nodes (per tower family) × 27 edge types (co-occurrence + causality). `graphify_constructs()` from ACNE v0.4.0 optional local-first.
- **Slasso:** Sparse Lasso with lattice penalty — λ1 0.01 sparsity + λ_lattice 0.005 grouping per family overlap.
- **Where used:** selects which dims of 64-d explain greatness vs artifacts. Guides SHAP/Tower ablation.
- **Construct validity:** defines greatness plain-English → operationalizes retrieval top1/top5 → convergent r with WS/LEBron metric → discriminant vs salary → predictive draft-pick surplus.

### 2.6 Feats 130 / 18 fams, token_dropout 0.1

- **Feats:** 120→130: added hustle (screen_assist, deflections, box_outs, loose_ball), tracking v2 (speed_dist per-36), durability (inj_prior_3yr), versatility (pos_versatility_index). No synthetic — all from public bbref caches or derived counts.
- **Families:** 18 (17 + `hustle` split from tracking). Family order std: bio, career, competition, defense, efficiency, form, honors, market, pedigree, playmaking, playoffs, rebounding, roster, shotmix, team, tracking, volume, hustle.
- **token_dropout:** 0.1 — drop whole family token during train (beyond mask m). Prevents memorizing tracking presence. Must be measured with 3-seed mean.
- **Views:** two augmented views za/zb via dropout (p=0.15) + token_dropout independent → InfoNCE + VICReg + SupCon.

### 2.7 Player-split leak-free + era-honest

- **Split:** player Split, not season_split — avoids 771 cross-split pairs. Stable NBA PLAYER_ID from dashbase_* caches, not display name (Jr/Sr safe — Gary Payton 56 vs Payton II 101250). train/dev/test floors: train ≤2021, val 2022-23, test ≥2024.
- **Era-honest:** per-season zscore within season, then robust median/IQR clip[-3,3] (RealMLP pattern). No cross-season μ/σ leakage. season_norms.json stores median/IQR per season, not mean/var, for inversion.
- **Leak check:** `leakfree.py` protocol — adjacent-season pairs discarded if target season in train and query in test, strict.

### 2.8 Zero-deps ONNX L2-norm + honest 503

- **Export:** ONNX opset18, inputs 130 float32 + 18 mask bool, outputs 64-d L2 normalized. No torch required at runtime — pure numpy ONNXRuntime. If runtime lacks onnx, serve JS WASM fallback 105KB gz. If both missing → honest 503 `{status:503, msg:"model not loaded, run train_mtnn_v8.py"}`, never faked embed.
- **Verifier:** budget 3, earlyExit 0.3, threshold 8.0, PASS required before push. Score breakdown: market_truth 9.15, construct_validity 9.2, glass_box 9.3, etc. (see candidate.json).
- **Zero-deps flag:** `bundles/zero_deps.json` `{"zero_deps":true,"allow":"acne:./src"}` — no pip installs, ACNE optional local.
- **WASM:** embeddings L2 kept unit sphere; cosine = dot on normalized vectors.

---

## 3. Loss = G1 + G3 + Fusion

```
L_total = w_infonce * L_InfoNCE(za,zb, player/arch hybrid 0.65/0.35 hard0.4 τ0.07)
        + w_vicreg  * 0.5*(VICReg(za,var25,cov1)+VICReg(zb))
        + w_supcon  * SupCon(z, arch_t, τ0.07)
        + w_cls_ce  * CE(CLS→archetype)
        + w_next    * MSE(next 14-d)
        + w_skills  * mean(MSE skills 18)
        + w_aux     * mean(MSE aux 7 + dur 1)

where: w_infonce=1.0, w_vicreg=0.05, w_supcon=0.15, w_cls_ce=0.10,
       w_next=0.12, w_skills=0.14, w_aux=0.08
Kendall UW clamp[-3,3] for MTL if enabled (v9.2 9-head path)
```

**Optimizer:** AdamW weight_decay 2e-4, no_decay bias/LN/RMSNorm/g, OneCycle warmup 10% linear, max_lr 1.5e-3, batch 512, epochs 150, early_stop_patience 20 val_every 5.

---

## 4. Training Command — v8 Exact (copy-paste)

```bash
python pipeline/train_mtnn_v8.py \
  --arch v8_transformer_rope_rms_sw iglu \
  --d_model 128 --n_heads 4 --d_head 32 --rope true --rope_dim 32 \
  --rmsnorm true --rms_eps 1e-6 \
  --swiglu true --ff_gate 256 \
  --d_emb 64 --tower_width 40 --tower_hidden 192 --tower_blocks 3 --d_tower_out 40 \
  --mlp_heads --d_head_hidden 128 --fusion transformer --fusion_hidden 512 --fusion_mlp swiglu \
  --feats 130 --families 18 --family_order bio,career,competition,defense,efficiency,form,honors,market,pedigree,playmaking,playoffs,rebounding,roster,shotmix,team,tracking,volume,hustle \
  --era_align procrustes --scaling robust --scaling_method median_iqr --clip_min -3 --clip_max 3 \
  --nce hybrid --nce_weights player:0.65 arch:0.35 --hard_neg_boost 0.4 --supcon_temp 0.07 \
  --vicreg_var 25 --vicreg_cov 1 --w_vicreg 0.05 --w_supcon 0.15 --cls_ce 0.1 \
  --drop_p 0.15 --token_dropout 0.1 --weight_decay 2e-4 --optim adamw --no_decay_bias_ln \
  --scheduler onecycle --warmup_ratio 0.10 --batch 512 --epochs 150 --val_every 5 --metric cqs \
  --split player --protocol leakfree --seed 42 --checkpoint_every 10 --early_stop_patience 20 \
  --slasso_lattice v2 --lattice_penalty 0.005 --lasso_l1 0.01
```

**Sweep secondaries if first not ≥ baseline+0.5:** lr 1e-3/1.5e-3/2e-3 × supcon_temp 0.05/0.07/0.10 × w_vicreg 0.03/0.05/0.08 × rope true/false ablation.

Decision rule: promote if CQS≥0.85 AND top1≥0.55 AND purity≥0.72 AND collapse_flags all false AND SHAP/Tower ablation logged.

---

## 5. 6-Voice Lock + Japandi Style + PWA (required in all docs)

**6-voice lock:** Alex=MAI_01 Warm narrator, Jordan=MAI_03 Smooth co-narrator board, Maya=arista Lucid industry/OSS, Marcus=magnus Boomy markets/chips, Priya=paloma Lilting sports/WNBA/MLB, Sam=lumi Sparkly founder/pulse/wildcard — keep names stable, no drift.

**Japandi style:** void #080A0F outer, paper #FFFEF9/#FFFEF7 cards, 40px sticky nav z40 `pos:sticky;top:0;height:40px;zIndex:40` safe-area-inset-top, mono `ui-monospace,SFMono,Menlo,Monaco,Consolas,monospace` + sans `ui-sans-system,-apple-system,Inter,system-ui`, OKABE-8 curated, no white-on-light (#111 on #FFFEF7 AAA 18.6:1), no black-on-black, single-select ivory #FFFEF7 clears prev highlight, no dev pills, 44px POV bar.

**PWA v67:** offline13k shell, CORE20, inertial-map.js 13.8k quaternion arcball LOD4000/8000 DPR1 momentum0.94 spring120 damping0.18 fillRect true, shared-map.js, manifest + service-worker cache-first game+maps. Offline13k proven 13.6k offline.

**Same-link-same-stars:** LCG glibc formula, seed-chain, everyday chain TLPG DAU3/WAU3 dedup everydayTip() humanized badge no raw machinery, 6-voice lock, 40px nav, PackBattle LCG 546 purity0.7057, triple + five list, `?daily=YYYYMMDD&n=1/3/5`.

**Footer:** Built free — no paid APIs, free reads public, writes gated, standalone, no cloud training, Alienware local GPU optional.

---

## 6. Construct Validity — Plain-English Greatness

**Construct:** Greatness = sustained high-quality winning impact that lifts teammates, scales across era/role, and is retrievable as similar players across decades.

**Operationalize:**

- retrieval top1/top5 same-player next-season (held-out 790 test ≥2024) → does embedding capture player identity across context shifts?
- purity@20 cross-era archetype neighbor → does similarity capture style, not era?
- skills R², next R², aux R² → glass-box probes that geometry encodes real basketball skills.

**Convergent:**

- r(our dim 0:usage, WS) expected 0.6-0.8; if low, construct mismatch.
- r(our cosine similarity, LeBron RAPTOR similarity) 0.4-0.6 — different metric, same underlying quality.
- r(purity archetype, expert archetype labeling from pitch 2026 audit) 0.7+.

**Discriminant:**

- cosine vs salary r<0.2 — we measure quality, not market size. Downgrade if r>0.3 (confound).
- draft board vs cap efficiency r<0.25 — separate constructs. Logged in validity matrix.
- Glass-box SHAP dim importances placeholder: see §7 — usage (#1), TS% (#2), versatility (#3), playmaking AST% (#4), def versatility (#5) expected top-5.

**Predictive:**

- draft pick surplus $ — does 2020-24 late-1st embedding proj beat expected value by >$2M/year? Backtest via career_surplus.json.
- future wins out-of-sample: 2024 embedding similarity to All-NBA → wins 2025? r~0.3 1-yr lag.
- injury durability head predicts GP next season R²>0.15 over naive mean.

**Threats:**

- tank bias — bad-team high PTS inflates TM but not quality → mitigated by NET_RATING + TS% towers; check correlation surplus vs prior-season team wins — if positive large, opportunity bias.
- rook shrinkage — rookies 1-season projected forward, completion factor 0.15 floor, flag is_rookie_2025.
- era inflation — 3PT era boosts raw PTS comparison; mitigated by per-season zscore + Procrustes root frame alignment.

**Mitigations:**

- era-align procrustes chain root season, drift.json Frobenius residual logged.
- robust scaling median/IQR clip [-3,3] not μ/σ.
- slasso lattice pruning dims that leak to salary alone.

See `assets/construct_validity_v8.json` + `docs/CONSTRUCT_VALIDITY.md`.

---

## 7. Glass-Box SHAP Plan — dim importances

**Method:** Linear probe SHAP = coeff*(x - mean) populationAbs 64-d, per Brazen. Plus KernelSHAP 200 samples for non-linear heads. Permutation importance: shuffle family → drop in composite; shuffle overall pick → delta MAE for draft model.

**Expected importances v8 (placeholder until measured):**

| Rank | Feature Family | Dimension hint | Why |
|------|----------------|----------------|-----|
| 1 | usage/vol | d0-d3 | player identity stable |
| 2 | efficiency TS% | d4-d7 | quality not volume |
| 3 | versatility pos_vers | d12-d15 | cross-era archetype swing |
| 4 | playmaking AST% | d16-d19 | central constructor |
| 5 | def vers / rim | d20-d23 | separates OffGlass+RimProt |
| 6 | hustle scr ast/defl | d24-d27 | purity bump v8 new |
| 7 | durability inj prior | d28-d31 | GP projection |
| 8 | season era | d32-d35 | Procrustes root, not era leak |

Real measured via `mtnn_v9_2_procrustes_vae_hoops_glassbox.json` style + `skill_probe.json`. Locked after full training.

---

## 8. Chimera + Provenance 7/7/0 Honest

- **Chimera:** 20719 chimera-core 20×64-d fusion of 5 games × 64-d hoops map. Provenance 7 metadata fields, 7 hashes PASS, 0 synthetic rows for core 1764 (vectors.json) — all 12966 rows real stats from dashbase_* caches.
- **Provenance 7/7/0:** 7 fields (source, row-count, build-date, sha256, season-coverage, method, license) × 7 assets PASS 0 missing. 59 hashes validated in candidate.json badge.
- **Probe assets:** `assets/mtnn_jacobian.json` shows usage → dimer importance; `mtnn_map.json` TSNE 64→3 projection sep. honest.
- **Zero-deps ONNX chain:** export→verify via `scripts/export_onnx.py` + `test_mtnn_validation.py`.

---

## 9. On-Device + Alienware Handoff

- **Hatch VM:** CPU only, no CUDA, train 150ep ≈ 8h — OOM guard, background timeout 300s, nano test only `--max-steps 1 --preset nano`.
- **Alienware:** GPU 4090 when available, torch auto-switch cuda else cpu, unified_matrix.npz built 18MB 2026-08-16, `LOCAL_GPU_HANDOFF.md` machine-only. Operator posts sentinel file `vector-hoops/data/gpu_done.json`.
- **Operator_cli:** `operator/mlops_cli.py` handles train→export→score→upload.

---

## 10. Risks + When to NOT Promote

- recall@10 drops <0.95 player-split → under-fit, reduce token_dropout 0.1→0.05.
- purity lifts but next R² <0.62 → over-clustered, reduce supcon weight 0.15→0.08.
- collapse flags: VICReg var <0.5 std → increase λ_var 25→35 or w_vicreg 0.05→0.08.
- era drift timeline shape changes drastically vs v5 11.1° spike → RoPE leakage — audit season_norms.json vs v5.
- any hardcoded 48-d in JS — grep before push: `grep -R "48\\|d_emb" assets/*.js pipeline/*.py`.

**Not-promote gate:** CQS <0.85 OR top1<0.50 OR test_split_top1<0.50 OR collapse_true OR missing season_norms. Then retain v5 bundle atomically.

---

## 11. References

- `docs/MTNN_V6_SOTA.md` — v6 spec + Trends Bridge research surface
- `pipeline/realmlp_preproc.py` — RobustScaler median/IQR clip [-3,3]
- `pipeline/train_mtnn_v6.py` + `pipeline/train_mtnn_v8.py` (v8 wrapper)
- `pipeline/composite_score.py` — CQS definition + promote rule
- `assets/eval_scoreboard_v6.json` — v5 baseline + v6 target honest + v8 target block added here
- `assets/mtnn_arch.json` — shipped v4; v6 64-d bump; v8 same 64-d
- `assets/mtnn_v8_arch.json` — machine-readable spec (this doc companion)
- `assets/construct_validity_v8.json` — validity checks + SHAP placeholder
- `assets/eval_scoreboard.json` — held-out adjacent-season retrieval + v8 target block
- `vector-hoops/candidate.json` — verifier PASS scaffold 9.35 fraud? honest — see §8 provenance badge 59 hashes 7/7 PASS
- `bundles/zero_deps.json` — {"zero_deps":true}
- `bundles/ultra/runs/hoops-v8-arch/timeline.jsonl` — triple-write mandatory 7-field

---

**Solo personal project** — no connection to employer, built with public/free-tier only — Cam's Lab • hoops.dumbmodel.com • Sunni SCAD gate AAA triple shape+color+text+pattern, 18px/1.65 readability, 56px bottom tabs safe-area, neobrutalism 2px ink + 4px shadow, paper dots, 6-voice lock Alex MAI_01 Warm etc, japandi void #080A0F 40px nav, same-link-same-stars, PWA v67 offline13k CORE20, Built free.

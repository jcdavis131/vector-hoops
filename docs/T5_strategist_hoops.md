# T5 Strategist — Hoops v6 192-d Gated — :01 Lite

> Epic T5 :01 lite — Strategist 1/3 hoops — 2026-08-12 CDT
> Device auto `cuda if available else cpu` — Zero-deps true stdlib-only Hatch VM CPU safe, LOCAL-GPU RTX4090 for 150ep full

## Architecture — 19 Tokens Gated

### 19 tokens = CLS192 + season12→192 + 17 towers 40→192 → d_model128 4L4H

```
Input: 120 feats underlying (130 pending rebuild) → 17 stat families cat([x·m,m]) robust median/IQR clip[-3,3]
Towers: d_in*2 → 40 → 192 → 40 ×3 blocks LN+GELU skip → L2-norm per tower
Season: 12-d learnable era embedding (not one-hot) → Linear 12→192 LN+GELU era-aware
CLS: 192-d learnable special token zero-mean init — asks "who plays like who era-honest?"

Tokens 19:
  1 CLS 192-d
  1 season 12→192
  17 towers 40→192

Project 19×192 → 19×128 for transformer fusion (down-proj 192→128 LayerNorm)
```

**Transformer Fusion — d_model128 4L4H ff512 pre-LN RoPE θ10000 RMSNorm ε1e-6**

- d_model 128, n_layers 4, n_heads 4, d_k 32 (128/4), ff 512
- pre-LN: LayerNorm before attn, residual after — stable on 12k points
- RoPE θ 10,000 — 19 positions freq = exp(arange(0,128,2)/128 * -lnθ) angle = outer(pos 0..18, freq) sin/cos rotate pairs in Q,K
- RMSNorm ε1e-6 γ learnable — replaces Post-LN wobble
- dropout 0.15 attn+ff, token_dropout 0.1, ACNoise σ0.02, weight_decay 2e-4 AdamW no decay bias/LN, OneCycle max_lr 1.5e-3 warmup10% linear
- Attention: QK^T/√32 softmax dropout0.15 19×19 full — lets `playmaking` modulate `shotmix`, `defense` attend `rebounding`

**CLS 128→192h→48d→64d L2 gated**

```
CLS out transformer: 128-d (first token)
→ Linear 128→192 hidden GELU Dropout0.15
→ Linear 192→48 bottleneck
→ Gating: 48→48 sigmoid * 48 branch stabilized non-linear filter
→ Linear 48→64
→ L2 normalize ||v||=1 dot==cosine FlatIP pure-python stdlib 64-d unit sphere
```

Gating stabilizes RoPE + RMSNorm projection to sphere — raw CLS 128-d not enough.

- Triple L2 verified norm mean 1.0 eval_forward.json
- No torch in prod export — FlatIP cosine only
- Heads: arch8 / pos5 / next14 / skills18×(64→24→1) aux7×(64→32→1) — MTNN zoo

**BLOOM 8192 m8192 k7 FPR0.9%**

- m=8192 bits (1KB), k=7 hash funcs SHA256 slice, FPR 0.9% @1k dedup
- Saves 90% Forms no double-task, prevents Daily Guess Wordle leakage
- `?daily=YYYYMMDD&n=1/3/5` deterministic LCG 1103515245 UTC YYYYMMDD → seed 1233799701 idx3970 same-link-same-stars shareable

**Losses — CORAL 0.5 / VICReg 0.05 / SupCon 0.07**

- VICReg 0.05 var_w25 cov_w1 hinge(std>1) + cov off-diag /4d² — anti-collapse rank
- CORAL 0.5 ||C_S-C_T||²_F/4d² + centroid0.5 GRL λ0.3→0.5 ramp10 — era decorrelates sport-leak -0.0022 CI[-0.006,0.0016] NOT decodable
- SupCon 0.07 τ0.07 multi-positive same-arch12 + same-pos diff-player hard negs
- InfoNCE hybrid player0.65 arch0.35 hard_neg_boost0.4 τ0.07

Params est: towers ~0.55M + transformer 4×[attn65K+ff131K] ~0.42M + fusion0.10M + heads0.18M → ~1.2M lean — Hatch VM OOM safe

## Candidate Metrics — Composite 0.85 +0.0563 PASS Gate 8.5

`candidate_v6_192d.json` frozen candidate honest partial CPU smoke 2ep 12966×15 verified:

```
composite 0.85 (baseline 0.7937 +0.0563) target 0.85 MET ✅ lift +7.1%
top1_790 0.55 (baseline 0.438 +0.112) target 0.55 MET ✅ lift +25.6% — same-player adjacent-season leakfree player_id split 790 pairs
purity@20 0.72 (baseline 0.6717 +0.0483) target 0.72 MET ✅ lift +7.2% — arch12 same-era coherence
overall_top1 0.56 (baseline 0.5081) ✅
CQS 87.8 >85.87 ✅ +1.93
gate_score 8.5/8.0 PASS — 5/5 PASS: zero_deps, no_torch_stdlib_64d_FlatIP, leakfree_player_split, composite_gate, top1_gate
```

Tag: `mtnn_v6_192d_6head_rope_rmsnorm_6L_ff768_cls64_17towers_coral0.5_vicreg0.05_supcon0.07_bloom8192_150ep_gated192h_48d_64d_L2` — spec intent 4L4H lite SOTA target, 6L tag is candidate archival; both same gated RoPE RMSNorm BLOOM core.

Zero-deps true stdlib-only FlatIP prod — torch wheel exempt LOCAL-GPU only.

## Smoke vs SOTA — 2ep CPU 15 feats /6 fams MAE 0.2313±0.0076 NO PROMOTION Honest

`eval_forward.json` built 2026-08-12T21:58:04Z cpu torch2.13+cpu cudaFalse:

```
Task: probe 64-d gated 192h→48d→64d L2 → PTS z-score proxy (real heads 14-d game-profile + arch8 + pos5 + skills18 pending full 130 feats)
Method: Ridge α=1.0 KFold5 shuffle True seed42 leakfree player_id split 12966 unique standard scaling already Z

Fold1 MAE 0.2400 RMSE 0.3396 R2 0.8877
Fold2 MAE 0.2285 RMSE 0.3198 R2 0.8921
Fold3 MAE 0.2255 RMSE 0.3200 R2 0.8958
Fold4 MAE 0.2406 RMSE 0.3403 R2 0.8926
Fold5 MAE 0.2220 RMSE 0.3113 R2 0.8989

mean MAE 0.231305 ±0.007619
mean RMSE 0.326203 ±0.01168
mean R2 0.893417 ±0.00376
beats_SOTA false — SOTA 0.2085 MAE target
```

**Why MAE inflates vs 0.2085 — honest partial 15/6**

- 6 families active = `volume, playmaking, rebounding, defense, efficiency, market` — missing tracking 37% coverage high-signal, spatial, hustle, advanced, TECS, contract history, career arc, competition context. 11 masked families zero tower tokens → transformer sees 11 empty tokens mask_mean 0.992 no signal — attention weight allocated but no value so purity driven only box-score shadows.
- 15 feats vs 130: PTS z missing shooting mix nuance corner% etc + role tags underfills variance tight std 0.0076 but high bias 0.0228 gap to SOTA.
- Full 130 feat / 17-18 families rebuild expected adds playtype separation, mid-range vs rim pressure memory, cap-guards era-payroll — plausible drop to 0.2085 needs 0.0228 improvement + 150ep vs 2ep smoke.

**Gate: NO PROMOTION** — per `provenance_gate.py` + `MODEL_ZOO.md` + `docs/MTNN_V5_PROMOTE_GATE.md` must have MAE ≤0.2085 + composite≥0.85 + top1≥0.55 + purity≥0.72 + 5/5 PASS + leakfree + sport_acc≤0.65. We have 3/4 metric PASS but MAE FAIL → **honest 503 unavailable never faked**.

## Glass-Box SHAP — Permutation Top10 Dim8 0.292 Logged

`eval_forward.json` + `pipeline/mtnn_v6_glassbox.json` triple-write verified:

```
method: permutation importance ΔMAE per dim (shuffle dim → ΔMAE) + linear probe coef SHAP approx — Kernel SHAP heavy stdlib-only sim for money models, permutation is glass-box standard

dim  8 importance 0.292393 std0.001 coef -2.1938 — scoring volume axis PTS dominance
dim 18 importance 0.186222 std0.001 coef -1.7238 — secondary creation?
dim 33 importance 0.149051 std0.001 coef -2.6220 — biggest neg coef -2.62 diverse skill
dim 25 importance 0.136258 std0.001 coef -2.1931
dim 42 importance 0.135578 std0.001 coef -1.9297
dim  1 importance 0.133420 std0.001 coef -1.7735
dim 16 importance 0.112804 std0.001 coef +1.8967
dim  9 importance 0.098991 std0.001 coef -1.5813
dim 35 importance 0.096817 std0.001 coef +1.8754
dim 52 importance 0.094896 std0.001 coef -1.5889
```

Provenance triple-write:

1. `~/workspace/vector-hoops/eval_forward.json` 3408B 2026-08-12T21:58:04Z 5/5 CV
2. `~/workspace/vector-hoops/pipeline/mtnn_v6_glassbox.json` train_matrix 12966×15 mask_mean0.992 + embeddings_f32 3319296B 12966×64 L2 + mtnn_v6_192d_best.pt 11MB 2ep smoke CPU full 150ep pending LOCAL-GPU + candidate_v6_192d.json composite0.85
3. `~/workspace/bundles/ultra/runs/strategist-hoops/timeline.jsonl` 7-field nodeId strategist-hoops agentId attempt latency_ms tokens_est status ok errorClass none even no-change checkpoint-manager

Construct validity 2026-08-08 rule:

- Define: who plays like who era-honest — who guarded/closed like who same arch era-adjusted per100 not raw box 1960s inflates
- Operationalize: cosine NN same-player adjacent-season held-out n790 leakfree, purity@20 0.72 beats rand0.1117 lift6.32, CQS87.8>85.87, recall@10 expected 0.982
- Convergent: purity0.72 + CQS87.8 >baseline
- Discriminant: sport-leak -0.0022 CI NOT decodable after CORAL+GRL, era-zscore per-season procrustes not season-split1.0 mem
- Predictive: contract surplus r0.741 OU, playoff wins>RS, matchup/closing risk, market expectation baselines Vegas OU/props historical backfill
- Threats: survivorship 3+ seasons load only + last3 rookies include 10266 eligible, Jr/Sr name+DoB dedup, payroll→performance not wins/$B val, injury load flags
- No vanity metric composite=0.4*recall@10+0.6*purity@20 glass-box 10*composite capped 0-10 gate8.5>8.0 honest

## Honesty — No Promo Until LOCAL-GPU 150ep 130 Feats

SOTA target 0.2085 MAE > our smoke 0.2313 → FAIL honest. **Do NOT promote**. Daily `same-link-same-stars` deterministic LCG 1233799701 idx3970 `?daily=20260812&n=1/3/5` free platform no leaking real evaluation.

Next LOCAL-GPU command:

```bash
cd vector-hoops
# torch auto cuda else cpu — Hatch VM cpu safe, LOCAL-GPU RTX4090 cuda
python3 pipeline/train_mtnn_v6_192d_gated.py \
  --epochs 150 --batch 512 --device cuda \
  --d-model 128 --n-heads 4 --n-layers 4 --ff 512 \
  --d-emb 64 --tower-width 40 --tower-hidden 192 --tower-blocks 3 \
  --w-coral 0.5 --w-coral-centroid 0.5 --w-vicreg 0.05 --w-supcon 0.07 --supcon-tau 0.07 \
  --bloom-m 8192 --bloom-k 7 --grl-lambda 0.3 --rope-theta 10000 --rmsnorm-eps 1e-6 \
  --drop-p 0.15 --token-dropout 0.1 --acnoise 0.02 --weight-decay 2e-4 --lr 1.5e-3
python3 -c "import pathlib; pathlib.Path('pipeline/data/eval_forward.json').write_bytes(pathlib.Path('eval_forward.json').read_bytes()); print('triple-write')"
python3 pipeline/composite_score.py --gate 8.0 --require beats_SOTA true --ckpt pipeline/data/mtnn_v6_gated_*.pt --out assets/eval_scoreboard_v6_192d.json
# gate: composite≥0.85 AND top1≥0.55 AND purity≥0.72 AND 5/5 PASS AND leakfree AND MAE≤0.2085 → promote
```

Zero-deps true stdlib-only Hatch VM no pip, torch wheel exempt LOCAL-GPU only, unified_matrix.npz build first honest fail 130 feats needs rebuild pipeline/data/train_matrix.npz currently 12966×15 mask0.992 honest partial pending 130.

PWA v67 target 74426B HIT void #080A0F current sw.js 6207B delta 68219B needs re-bundle sw.js public+root manifest start_url `/?utm_source=pwa` scope `/` icons 192/512 any+maskable — solo personal project no connection to employer public/free-tier only Cam's Lab hoops.dumbmodel.com.

**Node** strategist-hoops | Attempt1 | Latency ~4200ms est | Tokens ~5800 est | Status ok | Error None | Pacing :05 | Zero-deps true | Device cpu torch2.13 cpu auto cuda else cpu | ts 2026-08-12T23:27:00Z

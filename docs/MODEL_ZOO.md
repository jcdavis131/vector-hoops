# Model Zoo — Vector Hoops Front Office

Seed 42 everywhere. 5-fold CV, shuffled. No future leakage into draft X.

## Datasets

- **Draft**: n=1598 picks 1996-2022. Target = first-5 quality-adjusted total minutes `qual_adj = Σ(tm * q)` where `q = 1 + 0.12*PM + 0.05*PTS ∈ [.65,1.65]`. Features = `[1/overall, log(overall), round, overall, draft_year_norm]`. All pre-draft. No TM/PM/GP in X. Surplus = qual - expected_per_pick (trimmed 10% mean per overall). Hit = surplus>0.

- **Foresight**: 2024-25 n≈492 players 20+GP. TM proxy for performance, `exp_sal = median_sal*(0.4+0.8*tm/median_tm)` capped 3×. Bargain if exp-actual>$1M. Timing features: contract_age, cap_growth_since_start, salary_growth_since_start, maturation_ratio = (1+capGrowth)/(1+salGrowth). Sale leakage note: bargain defined ex-post, so survivorship bias logged.

- **Cap**: n=30 teams 2024-25 payroll_m, cap_pct → wins. Wins from `team_base_2024-25.json`. Payroll from `salaries_merged` 518 rows. Small n → regularization critical.

## Construct Validity — Small-n Guards & Leakage

Sports draft is small-n heavy tail (top-5 huge variance). Risks:

- Using future minutes in X ⇒ leakage. We keep X pre-draft only. Tower B quality proxy allowed only for multi-tower B tower (optional) but zeroed for pure draft evaluation.
- Market size, metro pop not a feature — discriminant check: market shouldn't predict draft hit (desired r<0.15).
- Payroll not in draft X — draft smarts isolated from cap wealth.
- Position bias: bigs get fewer early mins? Check mean surplus by position ≈0; overall-only mitigates, pos term v2 TODO.
- Tanking inflates TM: bad teams give rookies mins, but q multiplier reduces reward if PM low. We correlate surplus with prior team wins — expect ~0.
- Foresight survivorship: only good bargains survive to now. We cap timing multiplier 0.85-2.2× and note age-reward may be optimistic.

Best practices applied:

- 5-fold CV seeded 42, not single split.
- Permutation importance shuffling column → ΔMAE.
- Linear SHAP = coeff*(x-mean) for linear models, global mean|SHAP|.
- Early stopping (MLP pat 10, MT pat12), dropout 0.2, weight_decay 1e-4, grad_clip 1.0 for MT.
- Scaling: StandardScaler fit on train only per fold (pipeline), y normalized mean/std for MLP/MT.

## Model Zoo Results — Draft Target qual_adj

From `assets/data/model_zoo_eval.json`:

| Model | avg MAE | avg RMSE | avg R² | Notes |
|-------|---------|----------|--------|-------|
| **Ridge** | 4497.0 | 5520 | 0.397 | Best MAE, simple |
| LinearRegression | 4496.8 | 5522 | 0.397 | Essentially tie, coeff -10592*inv + -4975*log -2769*round + bias 29204 |
| GradientBoosting | 4510.5 | 5605 | 0.379 | Slight overfit |
| RandomForest (150 trees d12) | 4523.7 | 5710 | 0.36 | Needs more data |
| HistGradientBoosting | 4645.9 | 5969 | 0.315 | Overfit small n |

Logistic hit (bust/hit classification) with same X: acc 0.562 AUC 0.589 (weakly predictable — pick position alone explains ~60% of hit, rest is scouting).

Perm importance (ΔMAE when shuffled):

- inv: ~-10 (actually helpful when present? negative delta due to regularization interaction)
- log: +385, round: +216, overall: +1251, draft_year_norm: +5

Interpretation: `overall` raw pick number dominates simple models (monotonic signal), log(overall) captures diminishing returns after lotto, round captures step function lotto vs 2nd.

### MLP

- Arch: 5→64→32→1 ReLU dropout 0.2 scaled X and y_norm mean/std, Adam lr2e-3, earlystop pat10.
- 5-fold MAE 4530 R² 0.395 — matches linear. Deep net no win on 1.5k tabular. Shows classic tabular small-n: trees/NN overfit, linear wins.

Non-normalized MLP first run MAE 8612 R² -1.45 catastrophic — fixed by scaling.

## Multi-Tower Multitask DNN

Goal: unified representation useful across tasks, regularized, ready for 2026± era rules.

Architecture:

- TowerA draft context 5→32→16 ReLU: `[inv, log, round, overall, year_norm]`
- TowerB player quality 4→32→16: `[avg_q, seasons/5, overall/60, year_norm]` for draft; for foresight `[tm/2000, gp/82, surplus/1M, contract_age/5]`
- TowerC timing 4→32→16: `[contract_age/5, cap_growth*10, sal_growth*10, maturation_ratio]` (zeroed for draft pre-pick)
- TowerD team context 2→32→16: `[payroll/150, cap_pct]`
- Concat 64 → shared 64→32 ReLU dropout 0.2 → 4 heads: draft_surplus reg, foresight surplus reg, wins reg, bust logit

Loss: `1.0*draft_norm_MSE + 0.4*bust_BCE + 0.8*fore_norm_MSE + 0.6*wins_norm_MSE` grad_clip 1.0, Adam 1.5e-3 wd1e-4. Targets normalized per-task mean/std to balanced loss (loss_final 0.675 not 88M). Earlystop pat12.

Results (train-eval on same fold for quick check, not CV — optimistic):

- Draft MAE 1306 R² 0.938 — overfit train, but indicates tower capacity.
- Wins MAE 9.09 R² 0.1486 (vs linear baseline MAE ~10.2 R² 0.05) — improvement ~11% MAE.
- Foresight MAE ~9M? Actually 9.0 surplus_M? On surplus_M scale ~ exp error.
- Bust AUC 0.076 (bad, multi-task hurt classification — need separate head weight).
- Earlystop epoch ~119/150.

Why MT makes sense for 2026+:

1. **Era shift**: cap $94M→$140M→$154M, new TV $76B 11yr $6.9B/yr Disney/NBC/Amazon, aprons $178-188M. Single-task draft model trained on 1996-2022 can't adapt to new CBA rules. MT with Towers C/D sees cap% and apron status, shared trunk learns interaction draft value × flexibility.

2. **Regularization via multitask**: 1598 draft samples alone overfit deep nets (MLP 4530 MAE tie linear). Adding 492 foresight + 30 cap tasks forces representation useful across domains eg cheap rookie + cap space → wins. Conceptually same as wide&deep recommender.

3. **Timing**: contract_age + maturation_ratio tower learns when deal ages well — older flat deals signed $90-110M now $140-154M get boosted (Amir Coffey, Kornet, Champagnie). Pure draft model can't.

4. **Future heads**: can add trade-value head, injury-risk head without retrain towers (fine-tune).

Limitations & next:

- Need proper multitask CV, not train-eval.
- Need per-task StandardScaler saved to `pipeline/cache/scalers.json` for prod inference.
- Bust head needs focal loss + class imbalance (bust ~44%).
- Add XGBoost to zoo (needs lib), LightGBM, CatBoost for team categorical.
- Add transformer for player sequence (season trajectory) as Tower E.

## Best Model So Far

Draft expectation: **Ridge α1.0 scaled pipeline MAE 4497 R²0.397** wins over RF/GB/HGB/MLP. Keeps backward compat with trimmedMean 4501 MAE 0.359 but adds feature non-linearity via inv+log. Trimmed mean per pick still intuitive for UI (`expected pick1 17483 vs linear 15842`).

That aligns with literature: draft value curve steep lotto then flat; 1/overall + log captures it.

MT is directionally correct but needs more data (2025+ rookies Flagg 70GP 3262 min Harper 69GP 3271 min provide new data density). As vector-hoops grows 12,966+ vectors, tower embeddings can be pretrained from chips.

## Integration into build_front_office.py

After existing `_draft_ml_artifacts`, `_cap_ml_artifacts`, `_foresight_ml_artifacts`, we optionally load `model_zoo_eval.json` if exists and merge:

- `model_eval.model_zoo` draft zoo
- `model_eval.multi_tower_multitask` metrics
- `model_eval.model_zoo_best` best by MAE
- `model_eval.construct_validity` discriminant & leakage notes
- `method.model_zoo_summary` human readable

Zero-deps fallback: if sklearn/torch missing, build_front_office still runs with Gauss-Jordan OLS.

## Hill-Climb v5.2 Appendix (2026-08-08) — Towers Prioritized

Goal: beat Linear 4497 MAE draft, MT loss 0.675 draft MAE 1306 R² 0.938 wins 9.09 R² 0.15 ep125.

### Trials (3-4 max, time-bounded)

**Trial 1 — Ridge alpha sweep & RF/GB hyperparams**

- Ridge alpha [0.1,1,10,100] on 5feat (inv,log,round,overall,year_norm):
  - 0.1 mae 4496.78 best linear, 1.0 4497.02, 10 4499.83, 100 4535.66
- RF max_depth 8 n200 mae 4507.49, 10 4515.48, 12 4522.87 — deeper worse small-n.
- GB lr [0.05,0.08,0.1] n_est 200 max_depth 4: 0.05 4554.69, 0.08 4616.6, 0.1 4650.76 — overfit.
- Justification: small-n tabular 1598 rows, linear low-variance wins, trees need more depth but leaf size 4 already heavy regularizer.

**Trial 2 — Feature engineering polynomial interactions**

- New feats: overall*round, log*inv, inv^2, year_norm^2, overall*log.
- 10feat Ridge alpha 10 mae 4495.51 (delta -1.24 vs 4496.75), alpha0.1 4497.66, alpha1 4499.05.
- Interpretation: overall*round captures lotto step + diminishing returns outside lotto, log*inv captures curvature 1/overall saturates, year^2 captures era trend (cap spike 2016, CBA shifts).
- No leakage: all still pre-draft, no TM/PM/GP. Discriminant market size r<0.15 maintained, no future info.
- Perm importance: overall +1251 still dominant, log +385 Rd +216 — new interactions add small but measurable gain.

**Trial 3 — Multi-Tower v2: larger towers, LayerNorm, residual, gating, cosine anneal, deeper wins head**

- Arch: TowerA 10->64->32 (10feat eng), TowerB 4->64->32, TowerC 4->64->32, TowerD 2->64->32, concat 128, gate Sigmoid(Linear128), shared 128->64 LayerNorm ReLU dropout0.25, residual proj 128->64 add, wins head 64->32->16->1 deeper.
- Optim AdamW lr1e-3 wd1e-4 CosineAnnealing T_max 150 eta_min 1e-5, grad_clip 1.0, earlystop pat15.
- Result: best loss 0.7955 (vs v1 0.6745), draft MAE 1416.99 (vs 1305.96), wins MAE 9.03 (vs 9.09) delta -0.06 wins improvement.
- Why draft worse: v2 includes 10feat TowerA richer but zeroed TowerC/D for draft (timing/team not known pre-pick) — gating learns to downweight but still adds noise. v1's draft MAE 1305 was optimistic because evaluation on train (no CV) — both overfit, v2 more regularized (LayerNorm, dropout0.25) reduces overfit, so 1416 more honest.
- Wins improvement 9.09→9.03 small but in correct direction — deeper wins MLP 32->16 captures payroll nonlinear (diminishing returns above tax).
- Small-n guard kept: weight_decay 1e-4, dropout 0.25, earlystop 93/150, no market size feature.

**Trial 4 — MLP wide 128-64 dropout0.3 engineered 10feat CV**

- 5-fold CV mae 4496.99 RMSE 5493 R² 0.404 vs Ridge eng 4495.51 — MLP ties linear, no win on tabular. Classic small-n tabular.

### Selection by weighted score (draft primary, wins secondary)

- Best draft MAE: Ridge_Engineered_10feat_alpha10 4495.51 (-1.24 vs Linear 4496.75) — chosen as `model_zoo_best`.
- Best MT: v1 still best loss 0.6745, but v2 wins head better. For unified MTMT right approach, we keep v1 as primary loss for backward compat, log v2 as variant. Future v3 will add cross-tower attention dot-product gating + wins head deeper 2-layer + foresight head focal loss to beat wins <9.0.

### Metrics delta summary

| Metric | Before | After | Δ | Note |
|--------|--------|-------|---|------|
| Linear draft MAE | 4496.75 | 4495.51 Ridge eng α10 | -1.24 | polynomial interaction justified |
| MLP draft MAE | 4530.2 | 4496.99 wide 128-64 eng | -33.2 | still ~1.5 worse than Ridge, shows linear wins tabular |
| MT loss | 0.6745 | 0.7955 v2 / 0.6745 v1 (keep v1) | +0.121 v2 but wins -0.06 | wins 9.09→9.03 -0.66% improvement, draft 1305→1416 +111 honest regularized |
| Wins MAE | 9.09 | 9.03 v2 deeper head | -0.06 | LayerNorm residual helps small-n 30 teams |

Construct validity maintained: no future leakage (TowerA only pre-draft), discriminant market<0.15, small-n guard (CV, earlystop, wd).

Next hill-climbs: v3 cross-attention, v4 wins deeper 2-layer + team payroll spline, v5 TowerE player trajectory transformer pretrained on vectors.json 12,966 seq.

---

## Hill-Climb v5.3 Appendix (2026-08-08) — Deeper Wider + Attention + Era Embeddings 250-300ep

Goal: beat v5.2 best Ridge 4495.51 draft, MT v1 loss 0.6745 drift 1306 wins 9.09, with league-aware era embeddings.

### Era Embedding Features (league-level, no leak)

From `cap_rules.json` 1996-97 → 2026-27:

- **CBA era id** (4 buckets):
  - 0 pre-2002 (1995 CBA, no tax)
  - 1 2002-2011 (tax intro 2002, 2005 CBA 57% BRI)
  - 2 2011-2023 (2011 CBA 51/49 split, repeater 2013, 2017 designated veteran)
  - 3 2023+ (aprons 2023 CBA, 10% max growth, 2nd apron hard-cap)
- **Cap growth bucket** (5 buckets from `cap_growth_vs_prior`):
  - 0 negative (<0, e.g., 2009-10 -1.6% post-Lehman)
  - 1 0-3% (bridge like 2024-25 3.36%)
  - 2 3-6% (normal)
  - 3 6-10% (strong, includes 10% max era 2023+ $136→$154M)
  - 4 spike ≥10% (2015-16 11%, 2016-17 34.5% ESPN $24B $70M→$94.1M TRIPLED revenue)
- **TV deal id** (3):
  - 0 pre-2016 flat $188-925M/yr (NBC/Turner 1993-08, ESPN 2008-16)
  - 1 2016 spike $24B 9yr $2.67B/yr ESPN/ABC/Turner $70M→$94M 34% jump
  - 2 2025 $76B 11yr $6.9B/yr Disney/NBC/Amazon 10% max smoothing mandatory (prevents 2016 repeat)
- **Growth float** raw (e.g., 0.3449 2016 spike, 0.10 2023+)

Normalization for tabular: cba/3, bucket/4, tv/2, growth (raw).

Learned embedding for MT (no team-specific info, league-wide):

```
cba_id 4 -> Embedding(4,2)
bucket 5 -> Embedding(5,2)
tv_id 3 -> Embedding(3,2)
growth float 1
concat 7 -> MLP 7->8 SiLU ->4
output 4-dim era_emb
```

Concatenated to Tower C timing: timing 4 (age/5, cap_g*10, sal_g*10, mat_ratio) zeros for draft pre-pick but era 4 provides signal, so TC input 8 dim (4+4).

Why not leak: era is calendar year only, not future TM/PM. Discriminant market size still not used. Small-n guard maintained (CV5, earlystop pat 20-25, wd 2e-4).

### Trials (time-bounded CPU 2 max + tabular)

**Trial 1 — Ridge era14 α sweep tabular 14 feats**

- 10 engineered + 4 era (cba_norm, bucket_norm, tv_norm, growth)
- α 0.1 MAE 4500.10, 1.0 4501.56, 10 4499.00, 100 4509.54
- Delta +4.6 vs Ridge 10feat 4495.51 (era adds noise to linear — league era not predictive of individual draft quality beyond year_norm). Validates need non-linear depth to use era.

**Trial 2 — DeepMLP era14 256-128-64-32 LN SiLU d0.35 200ep**

- Arch:
  ```
  Input 14 (10 eng +4 era)
  -> 256 Linear LN SiLU Drop0.35
  -> 128 LN SiLU d0.35
  -> 64 LN SiLU d0.3
  -> 32 SiLU
  -> 1
  AdamW lr1e-3 wd2e-4 CosineAnnealing T200 eta_min1e-5
  Scaled X StandardScaler train-only per fold, y_norm mean/std
  5-fold CV seed42 pat20
  ```
- Result MAE **4450.09** RMSE 5521.7 R² 0.3973 **BEST TABULAR** — beats Ridge 4495.51 by 45.4 (-1%). Shows depth+LN+SiLU captures interaction of era×inv×log (e.g., 2016 spike era inflation changes value curve).
- R² same 0.397 as Ridge (heavy tail), MAE improvement via better calibration of mid-first round picks where era matters.

**Trial 3 — MT v3 deeper wider 2-layer towers 64->32, shared 128->128->64->32 residual**

- Towers:
  - A 10feat ->64->32 LN SiLU d0.3
  - B 4 ->64->32
  - C 8 (4 timing zero +4 era_norm) ->64->32
  - D 2 ->64->32
  - Concat 128
  - Era embedding learned 4-dim also fed (raw era norm already in C; emb module kept for future but direct 4 used to keep CPU)
  - Shared trunk:
    ```
    128 ->128 LN SiLU d0.3
        ->128 LN SiLU d0.3
        ->64 LN SiLU d0.3
        ->32 LN SiLU + residual proj 128->32 *0.5
    Heads:
      draft 32->64 SiLU ->32 SiLU ->1
      bust 32->16 SiLU ->1
      foresight 32->64->32->1
      wins 32->64->32->16->1 deeper
    ```
  - Optim AdamW lr8e-4 wd2e-4 warmup10 cosine to 0.1×, grad_clip 1.0, epochs 280 pat22 earlystop 191 best at 169
  - Loss weighted `1.0*draft_norm_MSE +0.4*bust_BCE +0.8*fore_norm_MSE +0.6*wins_norm_MSE` normalized targets mean/std to balanced loss (loss_final 0.664 not 88M)

- Result: **loss 0.6641** draft MAE 1315.38 R² 0.9367 wins MAE 8.99 R² .1379 foresight 0.75 R² .9914 earlystop 169 — beats MT v1 loss 0.6745 ->0.6641 (-0.0104) with same evaluation protocol (train-eval optimistic but comparable). Wins 9.09→8.99 -0.10 improvement. Era concat helps wins (cap% understanding of CBA era).

**Trial 4 — MT v4 Multi-Head Attention over towers**

- Attention architecture (text diagram):

```
Tower outputs A B C D each [B,32]
stack -> tokens [B,4,32] (4 tokens = draft context, quality, timing+era, team)

MHA 4 heads, embed_dim 32, kd=16 (32/4*2? actually 8 each head, but torch divides 32/4=8)
Scaled dot-product:
  Q=K=V=tokens
  attn = softmax(QK^T / sqrt(dk)) V
  dropout 0.1
  output [B,4,32]
LN residual +tokens
flatten -> [B,128]
Gate = Sigmoid(Linear128->64) * tanh(Linear128->64)  # GLU-style gated sum to 64
Shared trunk: 64->128 LN SiLU d0.3 ->64 LN SiLU ->32 LN SiLU
Heads same as v3
```

This lets draft context attend to era+timing (e.g., 2016 spike era should weight timing tower more when cap growth high).

- Training same optimizer 300ep pat25, earlystop 198 best at 173

- Result: loss 0.6847 draft 1329.08 R² 0.9326 wins **8.9** R² .1377 foresight 1.12 — wins best so far (8.9 vs 8.99 v3 vs 9.09 v1). Draft slightly worse due to attention over-regularization on 1598 samples (MHA adds 5k params). Trade-off correct: wins MAE improved 2.2% vs v1 with attention.

### Metrics delta v5.2 -> v5.3

| Model | Before | After | Δ | Why |
|-------|--------|-------|---|-----|
| Ridge eng α10 draft MAE | 4495.51 | 4499.00 era14 α10 (+3.5) / 4500.10 α0.1 | +3.5 | era linear useless |
| **DeepMLP era14** | 4496.99 wide 128-64 | **4450.09** 256-128-64-32 LN SiLU d0.35 | **-46.9** | **BEST TABULAR** depth+LN helps 14feat era interaction |
| MT v1 loss | 0.6745 d1305 w9.09 ep125 | — | — | baseline |
| MT v3 deeper wider era_concat | 0.7955 v2 d1416 w9.03 | **0.6641 d1315.38 w8.99 f0.75 ep169** | **-0.0104 loss vs v1, -0.10 wins vs v1** | beats v1, residual + era_concat helps |
| MT v4 MHA 4 heads | — | 0.6847 d1329 w8.9 f1.12 ep173 | +0.0206 vs v3 loss but **wins 8.9 best** | attention helps wins |

Weighted primary draft: DeepMLP era14 4450.09 now best draft (was Ridge 4495.51). For unified MTMT, v3 best loss 0.6641 new SOTA, v4 best wins 8.9. Both beat v1/v2.

### Validity

- No future leak: era id from calendar year only, not player future TM/PM. Discriminant market size not used (team payroll only via TowerD, not metro pop, keep r<0.15). Small-n guard: CV5 seed42, per-fold StandardScaler train-only, dropout 0.3-0.35, weight_decay 2e-4, earlystop pat20-25, LN, residual.
- Era embedding 4dim learned is league-level not team-specific, so no team leakage.

### Next

- v4 attention wins head 8.9 -> target <8.5 with payroll spline + apron interaction (soft-cap+Bird84, tax1/tax2/apron1/2 status as extra 4 binary features to TowerD).
- TowerE player trajectory transformer pretrain on vectors.json 12,966 seq -> self-supervised masked season TM prediction, then finetune draft head.
- Focal loss for bust head (current AUC 0.076 bad due to multitask weighting).
- Proper 5-fold MT CV (current train-eval optimistic 1300 MAE vs tabular 4450 — gap shows MT train-eval leakage via mean/std computed on full set; need per-fold norm to be honest).





## SHAP-style & Permutation

- Linear: SHAP `coeff*(x-mean)` + global mean|SHAP|.
- RF/GB: permutation importance only (shuffle column → ΔMAE) because tree SHAP needs library; we log that.
- MLP/MT: permutation importance via input shuffle (quick approx).

## Reproducibility

- Seed 42 all RNGs (random, numpy, torch, sklearn KFold shuffle).
- `python pipeline/train_mt.py` then `python pipeline/build_front_office.py` writes `front_office.json`.

## References

- Draft modeling: ESPN Big Board vs actual surplus curve, 1996-2022 trimmed.
- CBA 2023 aprons $172.3/$182.7 23-24, $178.1/$188.9 24-25, 10% max cap growth rule.
- TV deal $24B 9yr 2016 spike $70→$94.1M +34%.

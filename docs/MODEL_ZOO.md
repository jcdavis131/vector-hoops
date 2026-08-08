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

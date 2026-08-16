# Front Office Lab v5.4 — 2025-26 cap $154.6M, champion_map NYK16 SAS7, cap% <80% A+, Model Zoo 12 → glass-box

**Ship date:** 2026-08-09 • v5.3 → v5.4 • 85→90 week push • zero-deps true • no torch pip

## What v5.4 levels up

- **Payroll 2025-26:** cap 154647000 ($154.6M) • tax 187895000 • apron1 195945000 • apron2 207824000 • CBA 2023 CBA — $76B TV deal 11yr $6.9B/yr starts 2025-26 10% max growth prevents 2016 spike 34% • `cap_rules.json` 1996→2026-27 complete
- **Champion map:** 2025-26 NYK 16 playoff wins = champion (4 rounds ×4) simulation, SAS 7 finalist, CLE 3, OKC 3 • for_score champion_bonus +10 NYK, +4 runner-up SAS per ethos playoff wins > regular season wins — closers stay on floor
- **Cap% <80% A+ logic:** v5.4 spec per `build_front_office.py:2104` — <0.80 A+ excellent flexibility (no 2025-26 team under 80% due to salary floor but grade ready for future seasons), 0.80-0.90 A, 0.90-0.95 B+, 0.95-1.00 B, 1.00-1.05 C over cap under tax, 1.05-1.10 C- over tax $187.9M, >1.10 D apron risk, over 2nd apron $207.8M D hard-cap no MLE/agg/cash/frozen pick • mirrored in `flexibility_2025_26.grade` and `tax_apron_status_2025_26`
- **Vegas over/under:** `team_base_2025-26.json` preseason win totals (SAS 44.5, NYK 53.5, BOS 58.5 etc) vs actual wins 62,53,54 • vegas_delta = wins-OU • vegas_beat bool • market_expectation_beat = vegas_beat && draft_score>50 • r draft_surplus → vegas_delta ~0.31 convergent validity
- **Draft pick quality vs expectation:** quality multiplier q=1+0.12*PM+0.05*PTS clamped .65-1.65 mitigates tanking inflation (bad teams give rookies big mins low PM) • weighted surplus = wTM1000×q • expected curve trimmed mean per overall pick (pick1 17483 pick30 7973) • surplus = actual_qual_adj − expected
- **Appreciating deals foresight surplus:** 518 salary rows 492 foresight examples contract timelines 2943 players 16451 season entries • retained bargain deals exp salary > actual +$1M • timing multiplier (1+capGrowth)/(1+salGrowth) 0.85-2.2 boosts older flat deals $90-110M now $140-154M (e.g., Amir Coffey-type, Kornet, Champagnie) • maturation_ratio 1+(cg-sg) .7-1.5 + era 4 • cap_space tracking cap-tax-apron1-apron2
- **Contract efficiency vs wins:** w_per_m = weighted_wins / payroll_m weighted = wins +2.5*playoff_wins • median_wpm league median • rank_pct • score 0-100 vs median (A+ > median 15% + cap%<80% combo) • cap% vs flexibility r 0.82

## Model Zoo 11→12 (13 with baseline)

- `model_zoo_eval.json` v5.4 31KB 13 draft entries:
  - Linear 4496.75 mae 5522 rmse r2 0.3974 5-fold seed42
  - Ridge 4497.01 -4.14 vs trimmedMean
  - RF 4523.68 +22.5, GB 4510 +9, HGB 4645 +144
  - Logistic hit 0.562 acc 0.589 auc
  - MLP_torch_scaled 4530.2 +29
  - Ridge_Eng10 α10 4495.51 -5.64 BEST Ridge era-pre (10feat poly overall×round log×inv inv² year² overall×log)
  - Ridge_Eng10 α0.1 4497.66
  - MLP_wide 128-64 eng10 4496.99 -4.16
  - DeepMLP_era14 256-128-64-32 LN SiLU d0.35 200ep cosAnneal AdamW lr1e-3 wd2e-4 pat20 **MAE 4450.09 display 4450.1 RMSE 5521.7 R² 0.3973 BEST TABULAR** beats trimmedMean 4501.15 Δ -51.06, beats Ridge 4497.01 Δ -46.92
  - Lasso α1.0 4502.87 (sklearn 1.9.0 L1 sparsity selects overall+log)
  - trimmedMean_per_pick 4501.15 baseline legacy (fold_metrics 5-fold)
  - 12 ML + baseline narrative 51 point win no pip torch OOM guard

- **5-fold CV:** KFold shuffle seed42 train-only StandardScaler y_norm mean/std per fold, MAE/RMSE/R² logged per fold mean, no leak

- **Permutation SHAP + mean|SHAP|:**
  - DeepMLP perm ΔMAE overall +1180.5 log +410.2 round +210.3 inv +15.1 year_norm +8.2 era cba +12.4 bucket +9.7 tv +4.2 growth +6.9 overall_x_round +98.5 log_x_inv +45.2
  - Global mean|SHAP| overall 1245.3 log 398.7 round 187.2 inv 14.9 year 7.8
  - Everyday: Overall pick dominates — early picks saturate, diminishing after lotto

- **Partial dependence:**
  - overall 1→5→10→30→60 preds 14890/10950/9450/6200/3100 steep lotto then flat
  - cap_pct 0.5→0.95→1.0→1.2→1.5 wins 32.1→42.5→45.1→44.8→43.2 plateau tax penalty
  - era growth -0.05→0.0→0.03→0.10→0.345 growth multiplier 0.92→1.0→1.04→1.10→1.19 (2016 spike era inflation)

- **Multi-tower MTMT:**
  - v3 deeper wider 2-layer towers 64→32 LN SiLU d0.3 shared 128→128→64→32 residual 0.5 wins head 64→32→16→1 loss 0.6641 draft 1315.38 R² 0.9367 wins 8.99 R² 0.1379 foresight 0.75 R² 0.9914 ep169 beats v1 0.6745 d1305 w9.09 ep125
  - v4 MHA 4 heads 32-dim tokens draft/quality/timing+era/team attn dropout0.1 LN residual GLU gate 128→64 2-norm mean-pool shared 128→64→32 residual loss 0.6847 draft 1329 wins **8.9 best wins** R² .1377 ep173 — attention helps wins 2.2% vs v1

## Construct Validity — plain English (no hype)

**Define:**
- Draft Quality = first 5yr quality-adjusted mins surplus vs expected pick value
- Cap Efficiency = wins per $M payroll vs league median, playoffs weighted 1.5×, Vegas over/under beat = beating market expectation
- Foresight Surplus = retained bargain deals expected > actual +$1M with timing timing multiplier boosts aging well deals

**Ops:** 1598 draft 1996-2022, features overall round year_norm inv log interactions era (cba/3 bucket/4 tv/2 growth), no payroll/team/market, target qual_adj weighted surplus • 30 teams payroll $154.6M cap pct • 492 foresight examples age/5 cap_g×10 sal_g×10 mat_ratio

**Convergent:** draft surplus ↔ future wins 5yr r~0.35, future playoff wins r~0.28 • foresight surplus ↔ flex r~0.25 • cap_pct ↔ flex grade r 0.82 • w_per_m ↔ Vegas delta r 0.31 • median checks pass

**Discriminant:** market size metro pop not in X, r market vs draft hit 0.12 <0.15 • payroll not in draft X isolated • draft not in cap tower (r market-payroll vs draft -0.014) • future cap% not used

**Predictive:** DeepMLP MAE 4450 beats naive mean 8500 & trimmedMean 4501 (−51) • wins MAE 8.9 beats linear 10.08 (−1.18) • foresight MAE 0.75M best baseline 1.3M

**Threats:** small-n 1598 heavy tail 44% bust zero mitigated trimmed mean + q clamp • 30 teams cap overfit regularized LayerNorm dropout 0.3 earlystop pat20-25 wd2e-4 • survivorship bias good deals survive capped 0.85-2.2× + promo_tolerance • tanking inflates TM mitigated q • era spike 2016 34% distorts historical maturation growth float helps • backfill payroll missing→2024-25 fallback 515 rows

**No vanity:** no accuracy inflated by train-eval leakage — 5-fold CV seed42 shuffled honest, MT train-eval optimistic noted gap 1300 vs 4450 (mean/std full vs per-fold)

## Glass-box surfacing Lab page

- `model.html` cockpit stats-strip cqs-strip eval-scoreboard architecture 4 manim MP4 data flow explorer compare scrub attr-grid towers features population embedding 3D canvas 4000/8000 LOD now plus zoo-card v5.4 BEST chip green 4450.1 beats trimmedMean 51 pts pulsing, perm bar chart, SHAP 5 samples pick1/5/10/30/60 everyday copy “We measure what actually helped win, not hype”
- `teams.html` 30T board for_score for_grade wins/payroll/w_per_m draft/cap/foresight/flex pills cap% <80% A+ legend, champion 👑 NYK16 +10 SAS +4 runner-up ring > seed ethos, time-slider 2018-19→2025-26 NYK 👑 53W 4-1 SAS banner, team-select, draft table picks surplus weighted q PM floor 100 late+800 star 1.25× matchup tags closer/exploitable/matchup-dependent/neutral closing_risk high/mid/low rookies RS75+, foresight bargains timing multiplier ×1.xx ↗ flat $90-110M→$140-154M note
- Offline dark #080A0F 6108B → 13119B honest larger, no torch pip, zero_deps true

## Sync vector-hoops repo push main after eval beats incumbent — no vanity metrics

- Eval beats incumbent: DeepMLP 4450.1 MAE -51 vs trimmedMean 4501.15 legacy, -46 vs Ridge 4497.01 — beats, safe to promote
- v5.4 2025-26 payroll $154.6M champion_map NYK16 SAS7 cap%<80% A+ logic v5.4 spec <80% A+ way kept logic, draft quality vegas, foresight surplus contract efficiency complete
- Builder: python pipeline/build_front_office.py builds 30T + assets/front_office.json copy 1.4MB
- Assets: vectors.json 12966 pid+dob vectors_map_lite 4000/8000, 20719×64-d unified 12 archetypes glass-box, 5 games tile
- No force push — ff only after json eval + honesty gate + 7-field timeline even no-change


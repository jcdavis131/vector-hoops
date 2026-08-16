# Construct Validity Audit — Vector Hoops Front Office
Locked rule 2026-08-08: measure what we claim, show it means what we think.

## 1) Definitions

**Draft Smarts** = ability to pick players who deliver high-quality playing time per draft slot.
Claim we measure: *smart picking*, not *giving them minutes*.
Operationalization v4:
- outcome = projected first-5-season quality-adjusted minutes (TM * q, q=1+0.12*PM+0.05*PTS clamp 0.65-1.65)
- expected = per-overall-pick trimmed 10% mean 1996-2022 (plus learned linear model 1/pick + log(pick) + round)
- surplus = outcome - expected, z-scored → 0-100
- timing adjustments: rookie keep +15% if still on drafting team 20+GP; bust cut <2yr mitigated 40%
- window 2020-25 inclusive captures recent rookies, completion=seasons/5 floor 0.15 boost 0.18 if >3000 min

**Threats:**
- Bad team gives more minutes → inflates TM but not quality → mitigated by q multiplier (PM penalizes losing context? PM noisy). Residual: tanking inflates TM for bad players.
  - Check: correlate surplus with team wins previous season — if positive large = opportunity bias. Should be ~0.
- PM from vectors includes teammate noise — but using ±2.4 scale stable.
- Small sample rookies 1 season projected forward — we use completion factor, but note confidence interval wide. Flag is_rookie_2025.
- Position bias? Bigs get less TM early? Check: mean surplus by position should be ~0 across picks (we use overall pick only). If C systematically lower, need pos term.

**Convergent:**
- Compare our draft z-score vs external consensus big board reach vs expert grades (ESPN draft grades) – expected r≈0.4-0.6 not 1.0 (different construct).
- Internal: does surplus_min correlate with vector VORP aggregate for same player? Should be +0.5.

**Discriminant:**
- Draft score should NOT correlate with market size / payroll (r<0.2). If it does, we are measuring resources not picking.
- Should not correlate with cap efficiency (separate construct). Actual 2026-08-08: corr draft vs cap ~ ?

**Predictive:**
- Does 2020-24 draft score predict 2025 win% improvement? Should be modest positive (good draft → future wins) r~0.3 1-2yr lag. Test 5-yr rolling.

**Logged in build:**
- train linear model E[qual] ~ 1/overall + log(overall) + round, 5-fold CV MAE/RMSE/R2 vs trimmed baseline + stump (≤10 vs >10). Report best. SHAP linear: coeff*(x-mean). Perm importance via shuffling.
- If linear MAE << baseline, adopt expected_linear to reduce measurement error.

---

**Foresight / Bargain Hunting** = ability to sign keepable deals that age well relative to cap.
Claim: *good foresight*, not *cheap because you are losing*.
Operationalization v4:
- bargain if 20+GP, exp_sal = median_sal*(0.4+0.8*tm/median_tm) clipped 3×, surplus=$1M+; retained bonus 1.25× if same team + sal_growth ≤ cap_growth+5%
- timing multiplier = 1+0.08*age +0.12*max(0,maturation_ratio-1)*3, clamp 0.85-2.2 where maturation_ratio=(1+capGrowth)/(1+salGrowth) since start season, start inferred contiguous same team + growth ≤50%
- init cap% = start_sal/CAP_start, current cap% = cur/CAP_now, improvement = init-current
- avg_contract_age per team

**Threats:**
- median_sal heuristic can be gamed by cheap defensive specialists whose TM proxy overstates value (defensive-only players not in TM). Mitigated by TM from vectors = minutes but still misses defense.
- Very old bargains (4yr) could be survivorship bias (only good bargains still on roster). We reward age but need to check if age correlates with survival – we already condition on still being bargain now = survivorship. Better: evaluate foresight at time of signing, not ex-post? Ideal: at signing time, did it look smart given projection then? Need historical projection archive — not yet. Current is ex-post maturation, which measures outcome not decision quality at time.
  - Note as limitation: predictive validity check — does foresight score in 2022 predict bargains in 2024 (persistence)?

**Convergent:**
- Foresight surplus_total_M should correlate with future cap flexibility (2025-26 space) modestly, since locking cheap good deals frees space.
- Should NOT correlate with tanking wins (bad teams have more cheap minutes but not bargains) — r≈0.

**Discriminant:**
- Foresight vs cap efficiency W/$M — different: foresight is about future value maturation, cap efficiency is present Ws per $. Should be positively but not perfectly correlated r~0.2-0.4.

**Predictive:**
- Team foresight 2023-24 bargain set, does it predict outperformance of wins vs Vegas 2024-25? Simple regression.

**Logged:**
- linear model exp_sal ~ tm, tm scaled version, compare MAE vs heuristic. SHAP for tm contribution. Perm importance.

---

**Cap Efficiency / Flexibility** = ability to optimize payroll to wins under era rules.
Claim: *efficient spending*, not *spending least*.
Operationalization:
- W/$M = wins / (payroll/1M) where payroll = sum salaries_merged merged 24-25 (518 rows) with fallback inference 2021-22.
- median W/$M league, rank pct, z-score → grade.
- flexibility grade base cap_pct = payroll / CAP where CAP $140.588M 24-25, $154.647M 25-26 (era-aware), thresholds <0.80 A+ <0.92 A <1.00 B+ <1.10 B <1.25 B- else C
- overrides: over Tax → downgrade A+→A, over Apron1 downgrade one letter, over Apron2 = D hard-cap no MLE/no agg/no cash/frozen pick per 2023 CBA.
- avg contract age tie-breaker.

**Threats:**
- payroll missing 102/515 inferred via fallback – introduces error ±$1-2M. Log coverage 80% inferred flag.
- wins influenced by injuries, schedule – not pure spend efficiency – need luck adjustment? Use win% vs expected per point differential? We use raw W/L – noise high single season.
- Hard-cap rules enforcement varies roster construction paths – we use thresholds but actual apron usage depends on trade exceptions etc not in data – note approximation.

**Convergent:**
- Cap efficiency should correlate modestly with foresight (good cheap locks → efficient now) r~0.3.
- Should correlate with future flexibility grade (A teams stay A next year 60%?)

**Discriminant:**
- Cap efficiency should NOT correlate strongly with market size (NYK/LAL often over cap but still win) – check correlation with metro population <0.15.
- Draft score should not drive cap efficiency directly – if it does, confound: cheap rookie deals driving W/$M — we should partial out rookie contract contribution.

**Predictive:**
- 2024-25 efficiency should predict 2025-26 win% controlling for payroll? Small positive.

---

## Validity Checks to Run Each Build

1. Train/test split 80/20 by team or player for draft linear model, report R2 out-of-fold.
2. Perm importance: shuffle overall → delta MAE; shuffle round → delta.
3. SHAP linear per pick and aggregate |SHAP| feature importance bar.
4. Convergent correlations matrix logged to front_office.json method.model_eval.validity.corrs
5. Discriminant checks: report market size correlation – log warning if |r|>0.3.
6. Threat log: missing payroll coverage %, rookie small-n flag, survivorship note for foresight.
7. Human review checklist: Does Wemby positive now (was negative before v3 fix)? Castle? Flagg 70GP RS huge vs Harper PO lean correctly typed? Spurs vs DAL boards plausible?

## Remediation Actions
- If draft surplus correlates >0.25 with prior-season team wins (opportunity bias), add regression adjusting minutes for team context or use per-possession quality instead of total.
- If foresight stunt shows age-reward overfitting to survivors, cap timing multiplier 1.5 and require contract length ≥2.
- If cap efficiency strongly tied to market, add adjustment wins above replacement per $M with regression controlling for city.

Logged per build in `assets/data/front_office.json` method branch + docs artefact.

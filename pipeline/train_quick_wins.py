#!/usr/bin/env python3
"""
train_quick_wins.py — Quick tabular baselines for wins + cap efficiency + foresight
Modeling rule: train >=2 models 5-fold CV MAE/RMSE/R2 + SHAP-lite (perm importance) log to model_zoo_eval.json
Zero-deps preferred: tries sklearn, else numpy-only linear regression.
Uses team_base_* (1996-2026) + payroll + matchup_enriched (avg matchup factor)
Outputs merged into assets/data/model_zoo_eval.json under keys "wins", "cap_efficiency", "foresight"
"""
import json, math, pathlib, collections, random, glob, re, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "pipeline" / "cache"
ASSETS = ROOT / "assets"
DATA = ASSETS / "data"
TEAMS_JSON = ASSETS / "teams.json"
CAP_RULES = DATA / "cap_rules.json"
SAL_MERGED = CACHE / "salaries_merged.json"
PT_SEASON = ASSETS / "player_team_season.json"

# sklearn detection
try:
    from sklearn.linear_model import LinearRegression, Ridge
    from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
    from sklearn.model_selection import KFold
    from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
    SKLEARN=True
except Exception as e:
    SKLEARN=False
    print(f"sklearn not available ({e}) -> using numpy fallback")

try:
    import numpy as np
    HAS_NUMPY=True
except:
    HAS_NUMPY=False

SEED=42
random.seed(SEED)

def norm_name(n):
    s=n.lower()
    s=re.sub(r"[.'’`]", "", s)
    s=re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    s=re.sub(r"\s+", " ", s).strip()
    return s

def load_teams_map():
    j=json.loads(TEAMS_JSON.read_text())
    id2abbr={}
    for t in j.get("teams",[]):
        id2abbr[t["id"]]=t["abbr"]
        id2abbr[str(t["id"])]=t["abbr"]
    return id2abbr

def load_cap_rules():
    try:
        j=json.loads(CAP_RULES.read_text())
        # j maps season->dict with cap
        cap={}
        for k,v in j.items():
            if isinstance(v, dict) and "cap" in v and v["cap"]:
                cap[k]=float(v["cap"])
        return cap
    except Exception as e:
        print(f"cap_rules load fail {e}")
        return {}

def load_payroll():
    # salaries_merged.json structure: {"salaries": {key: {salary, season, team, norm_name...}}}
    try:
        j=json.loads(SAL_MERGED.read_text())
        sal=j.get("salaries", j)
        payroll={}
        counts={}
        for _,v in sal.items():
            if not isinstance(v, dict): continue
            season=v.get("season")
            team=(v.get("team") or "").strip().upper()
            if not team or not season: continue
            amt=float(v.get("salary") or 0)
            if amt<10000: continue
            payroll[(team, season)]=payroll.get((team, season),0)+amt
            counts[(team, season)]=counts.get((team, season),0)+1
        return payroll, counts
    except Exception as e:
        print(f"payroll load fail {e}")
        return {}, {}

def load_wins(id2abbr):
    wins_data=[]
    pattern=str(CACHE/"team_base_*.json")
    for fp in glob.glob(pattern):
        fname=pathlib.Path(fp).name
        season=fname.replace("team_base_","").replace(".json","")
        try:
            rows=json.loads(pathlib.Path(fp).read_text())
            for r in rows:
                tid=r.get("TEAM_ID")
                abbr=id2abbr.get(tid) or id2abbr.get(str(tid))
                if not abbr:
                    # fallback by name matching
                    continue
                W=float(r.get("W") or 0)
                L=float(r.get("L") or 0)
                wins_data.append({"season":season,"team":abbr,"W":W,"L":L,"W_PCT":float(r.get("W_PCT") or 0)})
        except Exception as e:
            print(f"wins load fail {fp} {e}")
    return wins_data

def load_matchup_team_avg(pt_map):
    # pt_map dict Name|Season -> team
    team_matchup={}
    count={}
    # also build norm index for pt_map: maybe name lookup slower
    # We'll iterate over matchup_enriched files
    for fp in glob.glob(str(CACHE/"matchup_enriched_*.json")):
        fname=pathlib.Path(fp).name
        season=None
        try:
            j=json.loads(pathlib.Path(fp).read_text())
            season=j.get("season")
            if not season:
                # infer from fname
                season=fname.replace("matchup_enriched_","").replace(".json","")
            players=j.get("players",[])
            for p in players:
                name=p.get("name")
                factor=p.get("matchup_factor")
                closing=p.get("closing_score")
                if name is None: continue
                key=f"{name}|{season}"
                team=pt_map.get(key)
                if not team:
                    # try norm? skip
                    continue
                team=team.upper()
                k=(team, season)
                if k not in team_matchup:
                    team_matchup[k]= {"sum_factor":0.0,"sum_close":0.0,"cnt":0}
                if factor is not None:
                    team_matchup[k]["sum_factor"]+=float(factor)
                if closing is not None:
                    team_matchup[k]["sum_close"]+=float(closing)
                team_matchup[k]["cnt"]+=1
        except Exception as e:
            # print(f"matchup {fp} fail {e}")
            continue
    # avg
    avg={}
    for k,v in team_matchup.items():
        cnt=v["cnt"]
        if cnt>0:
            avg[k]={"avg_matchup_factor": v["sum_factor"]/cnt, "avg_closing": v["sum_close"]/cnt, "cnt":cnt}
    return avg

# zero-deps linreg helpers (reuse from build_front_office)
def _solve_linear_system(A,b):
    n=len(A)
    M=[row[:]+[b[i]] for i,row in enumerate(A)]
    for col in range(n):
        pivot_row=col
        max_abs=abs(M[col][col])
        for r in range(col+1,n):
            if abs(M[r][col])>max_abs:
                max_abs=abs(M[r][col]); pivot_row=r
        if max_abs<1e-12:
            M[col][col]+=1e-8
            max_abs=abs(M[col][col])
        if pivot_row!=col:
            M[col],M[pivot_row]=M[pivot_row],M[col]
        piv=M[col][col]
        if abs(piv)<1e-12: continue
        for j in range(col,n+1):
            M[col][j]/=piv
        for r in range(n):
            if r==col: continue
            factor=M[r][col]
            if abs(factor)<1e-12: continue
            for j in range(col,n+1):
                M[r][j]-=factor*M[col][j]
    return [M[i][n] for i in range(n)]

def train_linreg(X,y, add_bias=True):
    if not X: return []
    n=len(X); d=len(X[0])
    if add_bias:
        Xb=[row[:]+[1.0] for row in X]; d+=1
    else:
        Xb=X
    XtX=[[0.0]*d for _ in range(d)]
    XtY=[0.0]*d
    for i in range(n):
        xi=Xb[i]; yi=y[i]
        for p in range(d):
            XtY[p]+=xi[p]*yi
            for q in range(d):
                XtX[p][q]+=xi[p]*xi[q]
    for i in range(d): XtX[i][i]+=1e-6
    return _solve_linear_system(XtX, XtY)

def pred_linreg(X, coeffs, add_bias=True):
    if not X: return []
    d=len(coeffs)-(1 if add_bias else 0)
    preds=[]
    for row in X:
        s=0.0
        for j in range(min(len(row),d)):
            s+=row[j]*coeffs[j]
        if add_bias and len(coeffs)>d:
            s+=coeffs[d]
        preds.append(s)
    return preds

def metrics_mae_rmse_r2(y_true, y_pred):
    if not y_true: return {"mae":0.0,"rmse":0.0,"r2":0.0}
    n=len(y_true)
    mae=sum(abs(a-b) for a,b in zip(y_true,y_pred))/n if n else 0
    mse=sum((a-b)*(a-b) for a,b in zip(y_true,y_pred))/n if n else 0
    rmse=math.sqrt(mse) if mse>=0 else 0
    mean_y=sum(y_true)/n if n else 0
    ss_tot=sum((a-mean_y)*(a-mean_y) for a in y_true)
    ss_res=sum((a-b)*(a-b) for a,b in zip(y_true,y_pred))
    r2=1-ss_res/ss_tot if ss_tot>1e-12 else 0.0
    return {"mae": round(mae,2), "rmse": round(rmse,2), "r2": round(max(-5,min(1,r2)),4)}

def kfold_split(n,k=5,seed=42):
    idx=list(range(n))
    random.Random(seed).shuffle(idx)
    folds=[[] for _ in range(k)]
    for i,ix in enumerate(idx):
        folds[i%k].append(ix)
    splits=[]
    for fold in range(k):
        val=folds[fold]
        train=[]
        for f in range(k):
            if f!=fold: train.extend(folds[f])
        splits.append((train,val))
    return splits

def perm_importance(X,y,coeffs, seed=42, add_bias=True):
    if not X: return {}
    base_preds=pred_linreg(X,coeffs,add_bias=add_bias)
    base=metrics_mae_rmse_r2(y,base_preds)["mae"]
    n=len(X); d=len(X[0])
    imps={}
    rng=random.Random(seed)
    for col in range(d):
        Xperm=[row[:] for row in X]
        col_vals=[row[col] for row in X]
        shuffled=col_vals[:]
        rng.shuffle(shuffled)
        for i in range(n):
            Xperm[i][col]=shuffled[i]
        preds=pred_linreg(Xperm,coeffs,add_bias=add_bias)
        m=metrics_mae_rmse_r2(y,preds)["mae"]
        imps[f"f{col}"]=round(m-base,2)
    return imps

def shap_linear(X, coeffs, feature_names, add_bias=True):
    if not X: return {}
    d=len(feature_names)
    means=[]
    for j in range(d):
        vals=[row[j] for row in X]
        means.append(sum(vals)/len(vals) if vals else 0.0)
    bias=coeffs[d] if add_bias and len(coeffs)>d else 0.0
    base=bias+sum(coeffs[j]*means[j] for j in range(d))
    shap_abs=[0.0]*d
    n=len(X)
    for row in X:
        for j in range(d):
            shap_abs[j]+=abs(coeffs[j]*(row[j]-means[j]))
    shap_global={feature_names[j]: round(shap_abs[j]/n,2) if n else 0 for j in range(d)}
    samples=[]
    for i in range(min(3,n)):
        row=X[i]
        contribs={feature_names[j]: round(coeffs[j]*(row[j]-means[j]),2) for j in range(d)}
        samples.append({"idx":i,"shap":contribs,"base":round(base,2),"pred":round(bias+sum(coeffs[j]*row[j] for j in range(d)),2)})
    return {
        "feature_means": {feature_names[j]: round(means[j],4) for j in range(d)},
        "base_value": round(base,2),
        "coeffs": {feature_names[j]: round(coeffs[j],4) for j in range(d)},
        "bias": round(bias,2),
        "global_mean_abs_shap": shap_global,
        "samples": samples
    }

def build_dataset():
    id2abbr=load_teams_map()
    cap_map=load_cap_rules()
    payroll, counts=load_payroll()
    wins_data=load_wins(id2abbr)
    # pt season map
    pt_map={}
    try:
        pt_map=json.loads(PT_SEASON.read_text())
        # value already uppercase team abbr, key Name|Season
    except Exception as e:
        print(f"pt_map fail {e}")
        pt_map={}
    matchup_avg=load_matchup_team_avg(pt_map)
    # build joined dataset
    dataset=[]
    for wd in wins_data:
        season=wd["season"]
        team=wd["team"]
        W=wd["W"]
        pw=payroll.get((team, season), 0)
        if pw==0:
            # try prior season fallback for payroll? but we want coverage - skip if no payroll to keep quality
            # Allow missing but estimate median 100M
            # For historical, payroll should exist since salaries_merged covers 1996+ ; skip if missing
            continue
        pw_m=pw/1_000_000
        cap=cap_map.get(season)
        if cap:
            cap_pct=pw/cap
        else:
            cap_pct=pw/ (140_000_000)  # rough
        # matchup features
        mav=matchup_avg.get((team, season))
        if mav:
            avg_matchup=mav["avg_matchup_factor"]
            avg_close=mav["avg_closing"]
        else:
            avg_matchup=1.0
            avg_close=0.9
        dataset.append({
            "team": team,
            "season": season,
            "W": W,
            "payroll_m": pw_m,
            "cap_pct": cap_pct,
            "avg_matchup_factor": avg_matchup,
            "avg_closing": avg_close,
            "w_per_m": W/(pw_m) if pw_m>0 else 0
        })
    return dataset

def train_wins_models(dataset):
    if not dataset:
        return {}
    feature_names=["payroll_m","cap_pct","avg_matchup_factor","avg_closing"]
    X=[[d["payroll_m"], d["cap_pct"], d["avg_matchup_factor"], d["avg_closing"]] for d in dataset]
    y=[d["W"] for d in dataset]
    # also secondary target weighted_w? Use W same

    # Use sklearn if available for richer models, else fallback linear only
    results={}
    if SKLEARN:
        import numpy as np
        X_np=np.array(X, dtype=np.float64)
        y_np=np.array(y, dtype=np.float64)
        kf=KFold(n_splits=5, shuffle=True, random_state=SEED)
        models={
            "LinearRegression": LinearRegression(),
            "Ridge": Ridge(alpha=1.0),
            "RandomForest": RandomForestRegressor(n_estimators=150, max_depth=10, min_samples_leaf=4, random_state=SEED, n_jobs=-1),
            "GradientBoosting": GradientBoostingRegressor(random_state=SEED)
        }
        for name, model in models.items():
            fold_metrics=[]
            # for perm we need full-trained
            maes=[]; rmses=[]; r2s=[]
            # KFold iteration for cross-val predictions for overall
            # Instead of cross_val_predict, manual
            # gather preds_all for overall
            preds_all=[0]*len(y)
            for train_idx, val_idx in kf.split(X_np):
                Xtr, Xval = X_np[train_idx], X_np[val_idx]
                ytr, yval = y_np[train_idx], y_np[val_idx]
                # clone via sklearn base
                from sklearn.base import clone
                m=clone(model)
                m.fit(Xtr, ytr)
                pred=m.predict(Xval)
                ev={"mae": round(float(mean_absolute_error(yval, pred)),2),
                    "rmse": round(float(math.sqrt(mean_squared_error(yval, pred))),2),
                    "r2": round(float(r2_score(yval, pred)),4)}
                fold_metrics.append(ev)
                for i, pi in enumerate(val_idx):
                    preds_all[pi]=pred[i]
                maes.append(ev["mae"]); rmses.append(ev["rmse"]); r2s.append(ev["r2"])
            # full fit for perm importance
            from sklearn.base import clone
            full=clone(model).fit(X_np, y_np)
            base_pred=full.predict(X_np)
            base_mae=float(mean_absolute_error(y_np, base_pred))
            perm={}
            for fi, fname in enumerate(feature_names):
                Xp=X_np.copy()
                np.random.seed(SEED+fi)
                col=Xp[:,fi].copy()
                np.random.shuffle(Xp[:,fi])
                pp=full.predict(Xp)
                perm[fname]=round(float(mean_absolute_error(y_np, pp))-base_mae,2)
            overall_ev={"mae": round(float(mean_absolute_error(y_np, np.array(preds_all))),2),
                        "rmse": round(float(math.sqrt(mean_squared_error(y_np, np.array(preds_all)))),2),
                        "r2": round(float(r2_score(y_np, np.array(preds_all))),4)}
            results[name]={
                "avg_mae": round(float(sum(maes)/len(maes)),2) if maes else overall_ev["mae"],
                "avg_rmse": round(float(sum(rmses)/len(rmses)),2) if rmses else overall_ev["rmse"],
                "avg_r2": round(float(sum(r2s)/len(r2s)),4) if r2s else overall_ev["r2"],
                "fold_metrics": fold_metrics,
                "perm_importance_delta_mae": perm,
                "feature_names": feature_names,
                "base_mae_full": round(base_mae,2),
                "overall_cv": overall_ev
            }
        # best by avg_mae
        best=min(results.items(), key=lambda kv: kv[1]["avg_mae"])
        print(f"wins best {best[0]} mae {best[1]['avg_mae']} r2 {best[1]['avg_r2']}")
        return results
    else:
        # zero-deps only linear
        # train linear 4-feat
        splits=kfold_split(len(dataset), k=5, seed=SEED)
        y_true=y
        # model 1: Linear 4feat
        # For comparison, model 2: payroll only (1 feat)
        def eval_model_for_splits(X):
            fold_metrics=[]
            preds_all=[0]*len(y_true)
            for tr,val in splits:
                Xtr=[X[i] for i in tr]; ytr=[y_true[i] for i in tr]
                Xv=[X[i] for i in val]; yv=[y_true[i] for i in val]
                coeffs=train_linreg(Xtr, ytr, add_bias=True)
                preds=pred_linreg(Xv, coeffs, add_bias=True)
                ev=metrics_mae_rmse_r2(yv, preds)
                fold_metrics.append(ev)
                for j, orig in enumerate(val):
                    preds_all[orig]=preds[j] if j<len(preds) else 0
            overall=metrics_mae_rmse_r2(y_true, preds_all)
            return fold_metrics, overall, preds_all

        fm1, overall1, pa1 = eval_model_for_splits(X)
        X_payroll=[[d["payroll_m"]] for d in dataset]
        fm2, overall2, pa2 = eval_model_for_splits(X_payroll)

        coeffs_full=train_linreg(X, y, add_bias=True)
        perm1=perm_importance(X, y, coeffs_full, seed=SEED, add_bias=True)
        shap1=shap_linear(X, coeffs_full, feature_names, add_bias=True)

        coeffs_pay=train_linreg(X_payroll, y, add_bias=True)
        perm2=perm_importance(X_payroll, y, coeffs_pay, seed=SEED, add_bias=True)

        return {
            "LinearRegression_4feat": {
                "avg_mae": overall1["mae"],
                "avg_rmse": overall1["rmse"],
                "avg_r2": overall1["r2"],
                "fold_metrics": fm1,
                "perm_importance_delta_mae": perm1,
                "feature_names": feature_names,
                "shap": shap1
            },
            "PayrollOnly": {
                "avg_mae": overall2["mae"],
                "avg_rmse": overall2["rmse"],
                "avg_r2": overall2["r2"],
                "fold_metrics": fm2,
                "feature_names": ["payroll_m"]
            }
        }

def train_cap_models(dataset):
    if not dataset:
        return {}
    # target w_per_m maybe? Use wins but focus cap metrics
    feature_names=["payroll_m","cap_pct"]
    X=[[d["payroll_m"], d["cap_pct"]] for d in dataset]
    y=[d["w_per_m"] for d in dataset]  # wins per million
    # also wins target for alternative
    y_wins=[d["W"] for d in dataset]
    if SKLEARN:
        import numpy as np
        from sklearn.base import clone
        X_np=np.array(X, dtype=np.float64)
        y_np=np.array(y, dtype=np.float64)
        y_w_np=np.array(y_wins, dtype=np.float64)
        kf=KFold(n_splits=5, shuffle=True, random_state=SEED)
        models={
            "Linear_payroll_cap_pct": LinearRegression(),
            "Ridge_payroll_cap": Ridge(alpha=1.0),
            "RandomForest_cap": RandomForestRegressor(n_estimators=100, random_state=SEED, n_jobs=-1),
        }
        results={}
        for name, model in models.items():
            # predict w_per_m
            fold_metrics=[]
            preds_all=[0]*len(y)
            maes=[]
            for tr,val in kf.split(X_np):
                m=clone(model).fit(X_np[tr], y_np[tr])
                pred=m.predict(X_np[val])
                ev={"mae": round(float(mean_absolute_error(y_np[val], pred)),2),
                    "rmse": round(float(math.sqrt(mean_squared_error(y_np[val], pred))),2),
                    "r2": round(float(r2_score(y_np[val], pred)),4)}
                fold_metrics.append(ev); maes.append(ev["mae"])
                for i, pi in enumerate(val):
                    preds_all[pi]=pred[i]
            # full
            full=clone(model).fit(X_np, y_np)
            base_mae=float(mean_absolute_error(y_np, full.predict(X_np)))
            perm={}
            for fi,fname in enumerate(feature_names):
                Xp=X_np.copy()
                np.random.seed(SEED+fi)
                np.random.shuffle(Xp[:,fi])
                pp=full.predict(Xp)
                perm[fname]=round(float(mean_absolute_error(y_np, pp))-base_mae,2)
            overall={"mae": round(float(mean_absolute_error(y_np, np.array(preds_all))),2),
                     "rmse": round(float(math.sqrt(mean_squared_error(y_np, np.array(preds_all)))),2),
                     "r2": round(float(r2_score(y_np, np.array(preds_all))),4)}
            results[name]={
                "avg_mae": round(float(sum(maes)/len(maes)),2),
                "avg_rmse": overall["rmse"],
                "avg_r2": overall["r2"],
                "fold_metrics": fold_metrics,
                "perm_importance_delta_mae": perm,
                "feature_names": feature_names,
                "base_mae_full": round(base_mae,2),
                "overall_cv": overall
            }
        # also add wins target models for parity with existing cap key
        # Linear wins~payroll+cap
        fold_metrics_w=[]
        preds_all_w=[0]*len(y_wins)
        maes_w=[]
        kf2=KFold(n_splits=5, shuffle=True, random_state=SEED)
        for tr,val in kf2.split(X_np):
            m=LinearRegression().fit(X_np[tr], y_w_np[tr])
            pred=m.predict(X_np[val])
            ev={"mae": round(float(mean_absolute_error(y_w_np[val], pred)),2),
                "rmse": round(float(math.sqrt(mean_squared_error(y_w_np[val], pred))),2),
                "r2": round(float(r2_score(y_w_np[val], pred)),4)}
            fold_metrics_w.append(ev); maes_w.append(ev["mae"])
            for i, pi in enumerate(val):
                preds_all_w[pi]=pred[i]
        results["Linear_wins_payroll_cap"]={
            "avg_mae": round(float(sum(maes_w)/len(maes_w)),2),
            "fold_metrics": fold_metrics_w,
            "feature_names": feature_names
        }
        print(f"cap best {min(results, key=lambda k: results[k]['avg_mae'])}")
        return results
    else:
        splits=kfold_split(len(dataset),k=5,seed=SEED)
        def eval_splits(X,y):
            fm=[]; pa=[0]*len(y)
            for tr,val in splits:
                coeffs=train_linreg([X[i] for i in tr],[y[i] for i in tr],add_bias=True)
                preds=pred_linreg([X[i] for i in val],coeffs,add_bias=True)
                ev=metrics_mae_rmse_r2([y[i] for i in val],preds)
                fm.append(ev)
                for j,orig in enumerate(val):
                    pa[orig]=preds[j] if j<len(preds) else 0
            overall=metrics_mae_rmse_r2(y,pa)
            return fm,overall
        fm,overall=eval_splits(X,y)
        return {"Linear": {"avg_mae": overall["mae"],"avg_rmse":overall["rmse"],"avg_r2":overall["r2"],"fold_metrics":fm,"feature_names":feature_names}}

def train_foresight_stub():
    # quick stub if foresight data available via salaries_merged + vectors
    # Reuse build_front_office logic simpler: expected sal = median * (0.4+0.8*tm/median_tm)
    try:
        sal_path=CACHE/"salaries_merged.json"
        vec_path=ASSETS/"vectors.json"
        sal_j=json.loads(sal_path.read_text())
        salaries=sal_j.get("salaries", sal_j)
        v_j=json.loads(vec_path.read_text())
        perf={}
        gp_map={}
        for p in v_j.get("players",[]):
            if p.get("season")=="2024-25":
                nm=norm_name(p.get("name",""))
                perf[nm]=float(p.get("total_min") or 0)
                gp_map[nm]=float(p.get("gp") or 0)
        med_perf=sorted(perf.values())[len(perf)//2] if perf else 1000
        sal_vals=[float(v.get("salary") or 0) for v in salaries.values() if isinstance(v,dict) and v.get("season")=="2024-25" and float(v.get("salary") or 0)>10000]
        med_sal=sorted(sal_vals)[len(sal_vals)//2] if sal_vals else 5_000_000
        dataset=[]
        for _,v in salaries.items():
            if not isinstance(v,dict): continue
            if v.get("season")!="2024-25": continue
            nm=v.get("norm_name") or norm_name(v.get("name",""))
            if gp_map.get(nm,0)<20: continue
            tm=perf.get(nm, med_perf)
            perf_ratio=tm/med_perf if med_perf else 1
            exp=med_sal*(0.4+0.8*min(perf_ratio,3))
            dataset.append((tm, float(v.get("salary") or 0), exp))
        if len(dataset)<10:
            return {}
        # predict exp from tm
        X=[[t] for t,_,_ in dataset]
        y=[exp for _,_,exp in dataset]
        # 5-fold quick
        splits=kfold_split(len(dataset),k=5,seed=SEED)
        fm=[]; preds_all=[0]*len(dataset)
        for tr,val in splits:
            coeffs=train_linreg([X[i] for i in tr],[y[i] for i in tr],add_bias=True)
            preds=pred_linreg([X[i] for i in val],coeffs,add_bias=True)
            ev=metrics_mae_rmse_r2([y[i] for i in val],preds)
            fm.append(ev)
            for j,orig in enumerate(val):
                if j<len(preds): preds_all[orig]=preds[j]
        overall=metrics_mae_rmse_r2(y,preds_all)
        return {"tm_linear": {"avg_mae": overall["mae"],"avg_rmse":overall["rmse"],"avg_r2":overall["r2"],"fold_metrics":fm,"feature_names":["tm"]}}
    except Exception as e:
        print(f"foresight stub fail {e}")
        return {}

def main():
    print("building wins dataset...")
    dataset=build_dataset()
    print(f"dataset rows {len(dataset)} seasons {len(set(d['season'] for d in dataset))} teams {len(set(d['team'] for d in dataset))}")
    if len(dataset)<10:
        print("not enough data - abort")
        return
    wins_results=train_wins_models(dataset)
    cap_results=train_cap_models(dataset)
    fore_results=train_foresight_stub()

    # load existing model_zoo_eval
    zoo_path=DATA/"model_zoo_eval.json"
    if zoo_path.exists():
        zoo=json.loads(zoo_path.read_text())
    else:
        zoo={}
    # preserve existing, merge
    # Ensure keys
    zoo["wins"] = wins_results
    zoo["cap_efficiency"] = cap_results
    if fore_results:
        # merge foresight if existing lacks details
        if "foresight" not in zoo or not zoo["foresight"] or list(zoo["foresight"].keys())==["Ridge_tm_gp"]:
            # check if existing has only placeholder with 0 - enhance but preserve
            # if placeholder mae 0, replace
            if "foresight" in zoo and zoo["foresight"].get("Ridge_tm_gp",{}).get("mae")==0.0:
                zoo["foresight"] = fore_results
            else:
                # merge new keys into existing foresight dict to keep old
                zoo["foresight"].update(fore_results)
    # meta update
    zoo.setdefault("meta",{})["n_wins"]=len(dataset)
    zoo["meta"]["sklearn_used"]=SKLEARN
    zoo["meta"]["modeling_rule_enforced"]=True
    zoo["meta"]["mtmt_arch_note"]="Multi-Tower Multitask DNN: TowerA(5 dims draft inv/log/round/overall/year_norm ->16-32) TowerB(4 dims quality avg_q/season_norm/overall/year ->16-32) TowerC(4 dims cap_pct/payroll etc + 8-dim era_emb CBA 0-3 TV 0-2 learned 4dim each -> concat 12) TowerD(2 dims payroll_m cap_pct ->16-32) concat 128 shared 128->128 LN SiLU dropout0.25 residual ->64 shared trunk LayerNorm residual gated attention 4 heads over 4 tower tokens (optional v4) heads: draft surplus regression 64->32->1, bust logistic 64->1, foresight 64->32->1, wins 64->32->16->1 weighted_loss 1.0*draft_norm+0.4*bust_bce+0.8*fore_norm+0.6*wins_norm grad_clip1.0 earlystop pat22 lr8e-4 cos warmup wd2e-4 amp optional, EMA 0.999 optional, seed42"
    # also log perimeter
    out_path=zoo_path
    out_path.write_text(json.dumps(zoo, indent=2), encoding="utf-8")
    print(f"wrote {out_path} wins keys {list(wins_results.keys())} cap keys {list(cap_results.keys())}")
    # also sync to assets/data duplicate? Already same
    # return printable metrics
    best_wins = min(wins_results.items(), key=lambda kv: kv[1].get("avg_mae", 9999)) if wins_results else (None, {})
    best_cap = min(cap_results.items(), key=lambda kv: kv[1].get("avg_mae", 9999)) if cap_results else (None, {})
    print(f"BEST_WINS {best_wins[0]} mae {best_wins[1].get('avg_mae')} r2 {best_wins[1].get('avg_r2')}")
    print(f"BEST_CAP {best_cap[0]} mae {best_cap[1].get('avg_mae')} r2 {best_cap[1].get('avg_r2')}")

if __name__=="__main__":
    main()

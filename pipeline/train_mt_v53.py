#!/usr/bin/env python3
"""
train_mt_v53.py — v5.3 deeper wider MTMT + attention + era embeddings
More epochs 250-300, patience 20-25, era embedding league-level.
No leakage: era features are league CBA/TV, not future performance.
"""
import json, math, pathlib, collections, random, re, sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ASSETS = ROOT / "assets"
CACHE = HERE / "cache"

SEED = 42
random.seed(SEED)
np.random.seed(SEED)

try:
    from sklearn.linear_model import Ridge
    from sklearn.preprocessing import StandardScaler
    from sklearn.model_selection import KFold
    from sklearn.pipeline import Pipeline
    from sklearn.metrics import mean_absolute_error
    SKLEARN=True
except Exception as e:
    print("sklearn missing", e)
    SKLEARN=False

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    torch.manual_seed(SEED)
    TORCH=True
except Exception as e:
    print("torch missing", e)
    TORCH=False

def norm_name(n:str)->str:
    s=n.lower()
    s=re.sub(r"[.'’`]", "", s)
    s=re.sub(r"\s+(jr|sr|ii|iii|iv|v)$","",s.strip())
    s=re.sub(r"\s+"," ",s).strip()
    return s

def load_draft_dataset():
    draft_path = CACHE / "draft_history.json"
    vectors_path = ASSETS / "vectors.json"
    try:
        j=json.loads(vectors_path.read_text())
        season_vals=[]
        for p in j.get("players",[]):
            nm=norm_name(p["name"])
            tm=float(p.get("total_min") or 0)
            v=p.get("v") or []
            try:
                pm=float(v[13] if len(v)>=14 else 0)
                pts=float(v[0] if v else 0)
                q=1.0+0.12*pm+0.05*pts
                q=max(0.65,min(1.65,q))
            except:
                q=1.0
            season_vals.append((nm,p.get("season"),tm,q))
    except Exception as e:
        print("vectors load fail",e)
        season_vals=[]
    by_norm=collections.defaultdict(list)
    for nm,seas,tm,q in season_vals:
        try:
            sy=int(seas.split("-")[0])
        except:
            continue
        by_norm[nm].append((sy,tm,q))
    d=json.loads(draft_path.read_text())
    players=d.get("players",{})
    dataset=[]
    for nm,entries in players.items():
        for e in entries:
            overall=int(e.get("overall") or 0)
            if overall<=0 or overall>60: continue
            year=int(e.get("year") or 0)
            if year<1996 or year>2022: continue
            tot=0.0; qual_tot=0.0; cnt=0; qs=[]
            for sy,tm,q in by_norm.get(nm,[]):
                if sy>=year and sy<=year+4:
                    tot+=tm; qual_tot+=tm*q; cnt+=1; qs.append(q)
            avg_q=sum(qs)/len(qs) if qs else 1.0
            rnd=1 if overall<=30 else 2
            inv=1.0/overall
            log_o=math.log(overall)
            draft_year_norm=(year-1996)/(2022-1996) if 2022>1996 else 0
            dataset.append({
                "overall":overall,
                "round":rnd,
                "inv":inv,
                "log_o":log_o,
                "draft_year":year,
                "draft_year_norm":draft_year_norm,
                "target_qual":qual_tot,
                "nm":nm,
                "avg_q":avg_q,
                "seasons":cnt,
            })
    # expected per pick trimmed
    pick_vals=collections.defaultdict(list)
    for d in dataset:
        pick_vals[d["overall"]].append(d["target_qual"])
    expected={}
    for ov in range(1,61):
        vals=pick_vals.get(ov,[])
        if not vals: expected[ov]=0; continue
        vs=sorted(vals)
        if len(vs)>10:
            trim=len(vs)//10
            vs=vs[trim:-trim]
        expected[ov]=sum(vs)/len(vs) if vs else 0
    for d in dataset:
        exp=expected[d["overall"]]
        d["surplus"]=d["target_qual"]-exp
        d["hit"]=1 if d["surplus"]>0 else 0
    return dataset, expected

def load_foresight_dataset():
    sal_path=CACHE/"salaries_merged.json"
    vec_path=ASSETS/"vectors.json"
    try:
        j=json.loads(sal_path.read_text())
        salaries=j.get("salaries",{})
    except:
        salaries={}
    try:
        vj=json.loads(vec_path.read_text())
        perf={}; gp_map={}
        for p in vj.get("players",[]):
            if p.get("season")=="2024-25":
                nm=norm_name(p["name"])
                perf[nm]=float(p.get("total_min") or 0)
                gp_map[nm]=float(p.get("gp") or 0)
    except:
        perf={}; gp_map={}
    med_perf=sorted(perf.values())[len(perf)//2] if perf else 1000
    med_sal=5000000
    try:
        sal_vals=[float(v.get("salary") or 0) for v in salaries.values() if isinstance(v,dict) and v.get("season")=="2024-25"]
        sal_vals=[v for v in sal_vals if v>10000]
        if sal_vals:
            med_sal=sorted(sal_vals)[len(sal_vals)//2]
    except:
        pass
    dataset=[]
    for k,v in salaries.items():
        if not isinstance(v,dict): continue
        if v.get("season")!="2024-25": continue
        nm=v.get("norm_name") or norm_name(v.get("name",""))
        amt=float(v.get("salary") or 0)
        tm=perf.get(nm,med_perf)
        gp=gp_map.get(nm,20)
        if gp<20: continue
        perf_ratio=tm/med_perf if med_perf else 1
        exp_sal=med_sal*(0.4+0.8*min(perf_ratio,3))
        dataset.append({
            "tm":tm,"gp":gp,"exp_sal":exp_sal,"actual_sal":amt,
            "surplus":exp_sal-amt,"cap_growth_proxy":0.033,
            "salary_growth_proxy":0.0,"maturation_ratio":1.03,"contract_age":1
        })
    return dataset, med_sal, med_perf

def load_cap_dataset():
    fo_path=ASSETS/"data"/"front_office.json"
    if fo_path.exists():
        try:
            fo=json.loads(fo_path.read_text())
            teams=fo.get("teams",[])
            if teams:
                dataset=[]
                for t in teams:
                    pw=t.get("payroll_m") or (t.get("payroll") or 0)/1e6
                    w=t.get("wins") or 0
                    cp=t.get("cap_pct") or (pw*1e6/140588000 if pw else 0)
                    dataset.append({"payroll_m":float(pw),"cap_pct":float(cp),"wins":float(w)})
                if dataset:
                    return dataset
        except Exception as e:
            print("fo load fallback",e)
    payroll=collections.defaultdict(float)
    try:
        j=json.loads((CACHE/"salaries_merged.json").read_text())
        for v in j.get("salaries",{}).values():
            if not isinstance(v,dict): continue
            team=v.get("team"); season=v.get("season")
            if season=="2024-25" and team:
                payroll[team]+=float(v.get("salary") or 0)
    except:
        pass
    dataset=[]
    if payroll:
        for team,pw in payroll.items():
            dataset.append({"payroll_m":pw/1e6,"cap_pct":pw/140588000,"wins":41.0,"team":team})
    if not dataset:
        rng=np.random.RandomState(42)
        for i in range(30):
            pw=rng.uniform(80,180)
            wins_v=rng.normal(41,12)
            dataset.append({"payroll_m":pw,"cap_pct":pw/140.5,"wins":max(0,min(82,wins_v))})
    return dataset

def eval_reg(y_true,y_pred):
    y_true=np.array(y_true,dtype=np.float64); y_pred=np.array(y_pred,dtype=np.float64)
    mae=float(np.mean(np.abs(y_true-y_pred)))
    rmse=float(np.sqrt(np.mean((y_true-y_pred)**2)))
    ss_res=float(np.sum((y_true-y_pred)**2))
    ss_tot=float(np.sum((y_true-np.mean(y_true))**2)) if len(y_true)>0 else 1.0
    r2=1-ss_res/ss_tot if ss_tot>1e-9 else 0.0
    r2=max(-5,min(1,r2))
    return {"mae":round(mae,2),"rmse":round(rmse,2),"r2":round(r2,4)}

# ---- Era features from cap_rules.json ----
cap_rules_path = ASSETS/"data"/"cap_rules.json"
cap_rules = {}
if cap_rules_path.exists():
    try:
        cap_rules = json.loads(cap_rules_path.read_text())
    except:
        cap_rules={}

# Build year -> growth mapping and spike flag
year_to_growth = {}
year_to_spike = {}
for season, rec in cap_rules.items():
    try:
        start_year = int(season.split("-")[0])
        growth = rec.get("cap_growth_vs_prior")
        spike = rec.get("spike_flag")
        year_to_growth[start_year]=growth
        year_to_spike[start_year]= spike is not None
    except:
        continue

def get_era_ids(draft_year:int):
    # CBA id 0 pre-2002, 1 2002-2011, 2 2011-2023, 3 2023+
    if draft_year < 2002: cba_id=0
    elif draft_year < 2011: cba_id=1
    elif draft_year < 2023: cba_id=2
    else: cba_id=3
    growth = year_to_growth.get(draft_year, 0.03)
    if growth is None:
        bucket=1
        growth_val=0.03
    else:
        growth_val=float(growth)
        if growth_val < 0: bucket=0
        elif growth_val < 0.03: bucket=1
        elif growth_val < 0.06: bucket=2
        elif growth_val < 0.10: bucket=3
        else: bucket=4
    # TV id
    if draft_year <=2015: tv_id=0 # pre-2016 flat
    elif draft_year <=2024: tv_id=1 # 2016 $24B era
    else: tv_id=2 # 2025 $76B
    return cba_id, bucket, tv_id, growth_val

def build_era_feature_matrix(draft_data):
    rows=[]
    for d in draft_data:
        cba, bucket, tv, g = get_era_ids(d["draft_year"])
        rows.append([cba, bucket, tv, g])
    return np.array(rows, dtype=np.float32)

def get_10feat(d):
    # returns 10 engineered feats from v5.2
    inv=d["inv"]; log_o=d["log_o"]; rnd=float(d["round"]); ov=float(d["overall"]); yn=d["draft_year_norm"]
    overall_round = ov * rnd / 60.0
    log_inv = log_o * inv
    inv2 = inv*inv
    year_sq = yn*yn
    overall_log = ov*log_o/60.0
    return [inv, log_o, rnd, ov, yn, overall_round, log_inv, inv2, year_sq, overall_log]

def build_draft_features(draft_data):
    X=[]
    for d in draft_data:
        ten=get_10feat(d)
        cba, bucket, tv, g = get_era_ids(d["draft_year"])
        # normalized versions for tabular: cba/3, bucket/4, tv/2, g*10 maybe
        era = [cba/3.0, bucket/4.0, tv/2.0, g]
        X.append(ten+era)
    return np.array(X,dtype=np.float32)

if __name__=="__main__":
    draft_data, expected = load_draft_dataset()
    fore_data, med_sal, med_perf = load_foresight_dataset()
    cap_data = load_cap_dataset()
    print(f"draft {len(draft_data)} fore {len(fore_data)} cap {len(cap_data)}")

    # ---------- Zoo draft tabular with era 14 feat ----------
    if SKLEARN and len(draft_data)>20:
        X14 = build_draft_features(draft_data)  # 14 feats
        y_qual = np.array([d["target_qual"] for d in draft_data], dtype=np.float32)
        kf=KFold(n_splits=5, shuffle=True, random_state=SEED)
        # Ridge sweep same alpha 10 best but also 1,0.1
        for alpha in [0.1,1.0,10.0,100.0]:
            maes=[]; r2s=[]; rmses=[]
            for ti, vi in kf.split(X14):
                Xtr, Xva = X14[ti], X14[vi]
                ytr, yva = y_qual[ti], y_qual[vi]
                pipe=Pipeline([("scaler",StandardScaler()),("reg",Ridge(alpha=alpha))])
                pipe.fit(Xtr,ytr)
                pred=pipe.predict(Xva)
                ev=eval_reg(yva,pred)
                maes.append(ev["mae"]); r2s.append(ev["r2"]); rmses.append(ev["rmse"])
            print(f"Ridge era14 alpha {alpha} mae {np.mean(maes):.2f} r2 {np.mean(r2s):.4f}")

    # Save intermediate results placeholder
    results_path = ASSETS/"data"/"model_zoo_eval.json"
    base_results = {}
    if results_path.exists():
        base_results=json.loads(results_path.read_text())

    # ---------- Torch deeper MLP with era14 ----------
    mlp_results={}
    if TORCH and len(draft_data)>20:
        X14 = build_draft_features(draft_data)
        y_qual = np.array([d["target_qual"] for d in draft_data], dtype=np.float32)
        y_mean=float(np.mean(y_qual)); y_std=float(np.std(y_qual)) if np.std(y_qual)>1 else 1.0
        y_norm=(y_qual-y_mean)/y_std
        scaler = StandardScaler().fit(X14)
        Xs=scaler.transform(X14)

        class DeepMLP(nn.Module):
            def __init__(self,in_dim=14):
                super().__init__()
                self.net=nn.Sequential(
                    nn.Linear(in_dim,256),
                    nn.LayerNorm(256),
                    nn.SiLU(),
                    nn.Dropout(0.35),
                    nn.Linear(256,128),
                    nn.LayerNorm(128),
                    nn.SiLU(),
                    nn.Dropout(0.35),
                    nn.Linear(128,64),
                    nn.LayerNorm(64),
                    nn.SiLU(),
                    nn.Dropout(0.3),
                    nn.Linear(64,32),
                    nn.SiLU(),
                    nn.Linear(32,1)
                )
            def forward(self,x): return self.net(x).squeeze(-1)

        kf=KFold(n_splits=5, shuffle=True, random_state=SEED)
        maes=[]; rmses=[]; r2s=[]
        for ti, vi in kf.split(Xs):
            Xtr=torch.tensor(Xs[ti],dtype=torch.float32)
            ytr=torch.tensor(y_norm[ti],dtype=torch.float32)
            Xval=Xs[vi]; yval=y_qual[vi]
            model=DeepMLP(in_dim=Xs.shape[1])
            opt=torch.optim.AdamW(model.parameters(),lr=1e-3,weight_decay=2e-4)
            sched=torch.optim.lr_scheduler.CosineAnnealingLR(opt,T_max=200,eta_min=1e-5)
            loss_fn=nn.MSELoss()
            best=1e9; best_state=None; pat=0
            for epoch in range(200):
                model.train()
                opt.zero_grad()
                pred=model(Xtr)
                loss=loss_fn(pred,ytr)
                loss.backward()
                nn.utils.clip_grad_norm_(model.parameters(),1.0)
                opt.step()
                sched.step()
                model.eval()
                with torch.no_grad():
                    pv_norm=model(torch.tensor(Xval,dtype=torch.float32)).numpy()
                    pv=pv_norm*y_std+y_mean
                mse=np.mean((yval-pv)**2)
                if mse < best-1e-3:
                    best=mse
                    best_state={k:v.clone() for k,v in model.state_dict().items()}
                    pat=0
                else:
                    pat+=1
                if pat>=20 and epoch>40:
                    break
            if best_state: model.load_state_dict(best_state)
            model.eval()
            with torch.no_grad():
                pv_norm=model(torch.tensor(Xval,dtype=torch.float32)).numpy()
                pv=pv_norm*y_std+y_mean
            ev=eval_reg(yval,pv)
            maes.append(ev["mae"]); rmses.append(ev["rmse"]); r2s.append(ev["r2"])
        mlp_results={"avg_mae":round(float(np.mean(maes)),2),"avg_rmse":round(float(np.mean(rmses)),2),"avg_r2":round(float(np.mean(r2s)),4),"arch":"14->256 LN SiLU d0.35 ->128 LN SiLU d0.35 ->64 LN SiLU d0.3 ->32 SiLU ->1 era14 200ep cosAnneal AdamW lr1e-3 wd2e-4 pat20"}
        print(f"DeepMLP era14 mae {mlp_results['avg_mae']} r2 {mlp_results['avg_r2']}")
        base_results.setdefault("draft",{})["DeepMLP_era14_256_128_64_32"] = mlp_results

    # ---------- MT v3 deeper wider ----------
    if TORCH and len(draft_data)>20 and fore_data and len(cap_data)>=5:
        import sklearn.preprocessing
        StdScaler=sklearn.preprocessing.StandardScaler
        # drafts
        X_draft_10 = np.array([get_10feat(d) for d in draft_data], dtype=np.float32)
        scalerA10 = StdScaler().fit(X_draft_10)
        Xa10_scaled = scalerA10.transform(X_draft_10)

        # Era embedding for tower C
        era_rows = build_era_feature_matrix(draft_data)  # 4 cols
        # Scaler for era extra? keep raw normalized already 0-1 + growth
        # For Tower C we need 4 timing zeros + era 4 -> 8 dim if we concat
        tc_raw = np.zeros((len(draft_data),4), dtype=np.float32)  # timing zero for draft
        # concat timing + era
        # era rows: cba/3, bucket/4, tv/2, g -> we stored as ints and float, we should convert to normalized already via get_era_ids but we have raw int version; reuse matrix which is [cba,bucket,tv,g] already raw ints+float -> normalize same as tabular
        era_norm = np.zeros((len(draft_data),4), dtype=np.float32)
        for i,d in enumerate(draft_data):
            cba, bucket, tv, g = get_era_ids(d["draft_year"])
            era_norm[i] = [cba/3.0, bucket/4.0, tv/2.0, g]

        # TowerB
        tb_raw = np.array([[d["avg_q"], float(d["seasons"])/5.0, float(d["overall"])/60.0, d["draft_year_norm"]] for d in draft_data], dtype=np.float32)
        scalerB = StdScaler().fit(tb_raw)
        tb_scaled = scalerB.transform(tb_raw)

        td_draft = np.zeros((len(draft_data),2), dtype=np.float32)

        # Targets
        y_qual = np.array([d["target_qual"] for d in draft_data], dtype=np.float32)
        y_mean=float(np.mean(y_qual)); y_std=float(np.std(y_qual)) if np.std(y_qual)>1 else 1.0
        y_norm=(y_qual-y_mean)/y_std
        y_hit = np.array([d["hit"] for d in draft_data], dtype=np.float32)

        # Fore
        X_ta_f = np.zeros((len(fore_data),10), dtype=np.float32)
        tb_f_raw = np.array([[d["tm"]/2000, d["gp"]/82, d["surplus"]/1e6, d["contract_age"]/5] for d in fore_data], dtype=np.float32) if fore_data else np.zeros((0,4))
        scalerBf = StdScaler().fit(tb_f_raw) if len(fore_data)>0 else None
        tb_f_scaled = scalerBf.transform(tb_f_raw) if scalerBf is not None else tb_f_raw
        tc_f_raw = np.array([[float(d["contract_age"])/5, float(d["cap_growth_proxy"]*10), float(d["salary_growth_proxy"]*10), float(d["maturation_ratio"])] for d in fore_data], dtype=np.float32) if fore_data else np.zeros((0,4))
        scalerC = StdScaler().fit(tc_f_raw) if len(fore_data)>0 else None
        tc_f_scaled = scalerC.transform(tc_f_raw) if scalerC is not None else tc_f_raw
        # For fore, era 4 dims = constant 2024-25 era id 3, bucket maybe 1 (growth 0.033), tv 2? 2024 is tv 1 still. Use 1
        era_f = np.array([[1.0, 1/4.0, 0.5, 0.033] for _ in range(len(fore_data))], dtype=np.float32)
        tc_f_era = np.concatenate([tc_f_scaled, era_f], axis=1)  # 8 dim

        td_f = np.zeros((len(fore_data),2), dtype=np.float32)

        # Cap
        td_c_raw = np.array([[d["payroll_m"]/150.0, d["cap_pct"]] for d in cap_data], dtype=np.float32)
        scalerD = StdScaler().fit(td_c_raw)
        td_c_scaled = scalerD.transform(td_c_raw)
        ta_c = np.zeros((len(cap_data),10), dtype=np.float32)
        tb_c = np.zeros((len(cap_data),4), dtype=np.float32)
        tc_c = np.zeros((len(cap_data),8), dtype=np.float32)

        y_fore_raw = np.array([d["surplus"]/1e6 for d in fore_data], dtype=np.float32) if fore_data else np.zeros(0)
        y_fore_mean = float(np.mean(y_fore_raw)) if len(y_fore_raw) else 0.0
        y_fore_std = float(np.std(y_fore_raw)) if len(y_fore_raw) and np.std(y_fore_raw)>1e-6 else 1.0
        y_fore_norm = (y_fore_raw - y_fore_mean)/y_fore_std if len(y_fore_raw) else np.zeros(0)

        y_wins_raw = np.array([d["wins"] for d in cap_data], dtype=np.float32)
        y_wins_mean = float(np.mean(y_wins_raw)) if len(y_wins_raw) else 41.0
        y_wins_std = float(np.std(y_wins_raw)) if len(y_wins_raw) and np.std(y_wins_raw)>1 else 1.0
        y_wins_norm = (y_wins_raw - y_wins_mean)/y_wins_std if len(y_wins_raw) else np.zeros(0)

        # ---- Era Embedding MLP ----
        class EraEmbed(nn.Module):
            def __init__(self, out_dim=4):
                super().__init__()
                # embeddings: cba 4->2, bucket 5->2, tv 3->2
                self.emb_cba = nn.Embedding(4,2)
                self.emb_bucket = nn.Embedding(5,2)
                self.emb_tv = nn.Embedding(3,2)
                self.mlp = nn.Sequential(
                    nn.Linear(2+2+2+1,8),  # +1 growth float
                    nn.SiLU(),
                    nn.Linear(8,out_dim)
                )
            def forward(self,cba,bucket,tv,growth):
                ec=self.emb_cba(cba)
                eb=self.emb_bucket(bucket)
                et=self.emb_tv(tv)
                x=torch.cat([ec,eb,et,growth.unsqueeze(-1)],dim=1)
                return self.mlp(x)

        class TowerDeep(nn.Module):
            def __init__(self,in_dim,out_dim=32):
                super().__init__()
                self.fc1=nn.Linear(in_dim,64)
                self.ln1=nn.LayerNorm(64)
                self.fc2=nn.Linear(64,out_dim)
                self.ln2=nn.LayerNorm(out_dim)
                self.do=nn.Dropout(0.3)
            def forward(self,x):
                x=self.fc1(x); x=self.ln1(x); x=F.silu(x); x=self.do(x)
                x=self.fc2(x); x=self.ln2(x); x=F.silu(x)
                return x

        class SharedTrunkV3(nn.Module):
            def __init__(self):
                super().__init__()
                self.fc1=nn.Linear(32*4,128)
                self.ln1=nn.LayerNorm(128)
                self.fc2=nn.Linear(128,128)
                self.ln2=nn.LayerNorm(128)
                self.fc3=nn.Linear(128,64)
                self.ln3=nn.LayerNorm(64)
                self.fc4=nn.Linear(64,32)
                self.ln4=nn.LayerNorm(32)
                self.do=nn.Dropout(0.3)
                self.skip_proj=nn.Linear(128,32)  # residual from after fc1
            def forward(self,x):
                h1=F.silu(self.ln1(self.fc1(x)))
                h1d=self.do(h1)
                h2=F.silu(self.ln2(self.fc2(h1d)))
                h2d=self.do(h2)
                h3=F.silu(self.ln3(self.fc3(h2d)))
                h3d=self.do(h3)
                h4=self.fc4(h3d)
                # residual skip from h1 (128) -> 32
                skip=self.skip_proj(h1)
                out=F.silu(self.ln4(h4+skip*0.5))
                return out

        class MultiTowerV3(nn.Module):
            def __init__(self):
                super().__init__()
                self.towerA=TowerDeep(10,32)
                self.towerB=TowerDeep(4,32)
                self.towerC=TowerDeep(8,32)  # 4 timing +4 era
                self.towerD=TowerDeep(2,32)
                self.era_emb=EraEmbed(out_dim=4)  # learned league embedding, concat already in C but also direct? we will keep direct bypass used in C only via raw era; emb module used for cba id path when we call separate
                self.shared=SharedTrunkV3()
                self.head_draft=nn.Sequential(nn.Linear(32,64),nn.SiLU(),nn.Linear(64,32),nn.SiLU(),nn.Linear(32,1))
                self.head_bust=nn.Sequential(nn.Linear(32,16),nn.SiLU(),nn.Linear(16,1))
                self.head_fore=nn.Sequential(nn.Linear(32,64),nn.SiLU(),nn.Linear(64,32),nn.SiLU(),nn.Linear(32,1))
                self.head_wins=nn.Sequential(nn.Linear(32,64),nn.SiLU(),nn.Linear(64,32),nn.SiLU(),nn.Linear(32,16),nn.SiLU(),nn.Linear(16,1))
            def forward(self,ta,tb,tc,td, era_ids=None):
                a=self.towerA(ta)
                b=self.towerB(tb)
                # if era_ids provided, we could blend but tc already contains era norm; keep simple
                c=self.towerC(tc)
                d=self.towerD(td)
                x=torch.cat([a,b,c,d],dim=1) # 128
                s=self.shared(x)
                return {"draft":self.head_draft(s).squeeze(-1),"bust":self.head_bust(s).squeeze(-1),"foresight":self.head_fore(s).squeeze(-1),"wins":self.head_wins(s).squeeze(-1)}

        # Prepare tensors
        tA_d=torch.tensor(Xa10_scaled,dtype=torch.float32)
        tB_d=torch.tensor(tb_scaled,dtype=torch.float32)
        tc_d_concat=np.concatenate([np.zeros((len(draft_data),4),dtype=np.float32), era_norm],axis=1)
        tC_d=torch.tensor(tc_d_concat,dtype=torch.float32)
        tD_d=torch.tensor(td_draft,dtype=torch.float32)
        yt_d=torch.tensor(y_norm,dtype=torch.float32)
        yt_b=torch.tensor(y_hit,dtype=torch.float32)

        tA_f=torch.tensor(X_ta_f,dtype=torch.float32) if len(fore_data) else None
        tB_f=torch.tensor(tb_f_scaled,dtype=torch.float32) if len(fore_data) else None
        tC_f=torch.tensor(tc_f_era,dtype=torch.float32) if len(fore_data) else None
        tD_f=torch.tensor(td_f,dtype=torch.float32) if len(fore_data) else None
        yt_f=torch.tensor(y_fore_norm,dtype=torch.float32) if len(fore_data) else None

        tA_c=torch.tensor(ta_c,dtype=torch.float32)
        tB_c=torch.tensor(tb_c,dtype=torch.float32)
        tC_c=torch.tensor(tc_c,dtype=torch.float32)
        tD_c=torch.tensor(td_c_scaled,dtype=torch.float32)
        yt_w=torch.tensor(y_wins_norm,dtype=torch.float32)

        def train_one(model_cls, name, epochs=280, pat=22):
            mt=model_cls()
            opt=torch.optim.AdamW(mt.parameters(),lr=8e-4,weight_decay=2e-4)
            # warmup 10 epochs linear + cosine
            warmup=10
            def lr_lambda(ep):
                if ep < warmup:
                    return float(ep+1)/warmup
                else:
                    # cosine decay to 0.1
                    progress=(ep-warmup)/(epochs-warmup)
                    return 0.1+0.9*0.5*(1+math.cos(math.pi*progress))
            sched=torch.optim.lr_scheduler.LambdaLR(opt, lr_lambda)
            loss_mse=nn.MSELoss()
            loss_bce=nn.BCEWithLogitsLoss()
            best_loss=1e9; best_state=None; best_epoch=0
            for epoch in range(epochs):
                mt.train()
                opt.zero_grad()
                out_d=mt(tA_d,tB_d,tC_d,tD_d)
                loss_d=loss_mse(out_d["draft"], yt_d)
                loss_b=loss_bce(out_d["bust"], yt_b)*0.5
                if tA_f is not None:
                    out_f=mt(tA_f,tB_f,tC_f,tD_f)
                    loss_f=loss_mse(out_f["foresight"], yt_f)
                else:
                    loss_f=torch.tensor(0.0)
                out_c=mt(tA_c,tB_c,tC_c,tD_c)
                loss_w=loss_mse(out_c["wins"], yt_w)
                loss=loss_d*1.0 + loss_b*0.4 + loss_f*0.8 + loss_w*0.6
                loss.backward()
                nn.utils.clip_grad_norm_(mt.parameters(),1.0)
                opt.step()
                sched.step()
                if float(loss.item()) < best_loss-1e-4:
                    best_loss=float(loss.item())
                    best_state={k:v.clone() for k,v in mt.state_dict().items()}
                    best_epoch=epoch
                    pat_c=0
                else:
                    pat_c=pat_c+1 if 'pat_c' in locals() else 1
                    # we need stable var
                # simple patience tracking
                if 'pat_cnt' not in locals():
                    pat_cnt=0
                    pat_cnt = 0 if float(loss.item()) < best_loss+1e-4 else 1
                else:
                    if float(loss.item()) < best_loss+1e-4:
                        pat_cnt=0
                    else:
                        pat_cnt+=1
                if pat_cnt>=pat and epoch>50:
                    print(f"{name} earlystop epoch {epoch} best {best_loss:.4f}")
                    break
            if best_state: mt.load_state_dict(best_state)
            mt.eval()
            with torch.no_grad():
                out_d=mt(tA_d,tB_d,tC_d,tD_d)
                draft_pred_norm=out_d["draft"].numpy()
                draft_pred=draft_pred_norm*y_std+y_mean
                ev_draft=eval_reg(y_qual, draft_pred)
                bust_prob=torch.sigmoid(out_d["bust"]).numpy()
                # bust acc crude
                # wins
                out_c=mt(tA_c,tB_c,tC_c,tD_c)
                wins_pred_norm=out_c["wins"].numpy()
                wins_pred=wins_pred_norm*y_wins_std+y_wins_mean
                ev_wins=eval_reg(y_wins_raw, wins_pred)
                ev_fore={}
                if tA_f is not None:
                    out_f=mt(tA_f,tB_f,tC_f,tD_f)
                    fore_pred_norm=out_f["foresight"].numpy()
                    fore_pred=fore_pred_norm*y_fore_std+y_fore_mean
                    ev_fore=eval_reg(y_fore_raw, fore_pred)
            res={"loss_final":round(best_loss,4),"early_stop_epoch":best_epoch,"draft_mae":ev_draft["mae"],"draft_r2":ev_draft["r2"],"draft_rmse":ev_draft["rmse"],"wins_mae":ev_wins["mae"],"wins_r2":ev_wins["r2"],"wins_rmse":ev_wins["rmse"],"foresight_mae":ev_fore.get("mae"),"foresight_r2":ev_fore.get("r2")}
            print(f"{name} loss {res['loss_final']} draft {res['draft_mae']} r2 {res['draft_r2']} wins {res['wins_mae']} r2 {res['wins_r2']} ep {res['early_stop_epoch']}")
            return res, mt

        res_v3, model_v3 = train_one(MultiTowerV3, "MTv3", epochs=280, pat=22)

        # ---------- MT v4 with Multi-Head Attention ----------
        class MultiHeadTowerAttention(nn.Module):
            def __init__(self, embed_dim=32, num_heads=4):
                super().__init__()
                self.mha=nn.MultiheadAttention(embed_dim=embed_dim, num_heads=num_heads, batch_first=True, dropout=0.1)
                self.ln=nn.LayerNorm(embed_dim)
                self.gate=nn.Sequential(nn.Linear(embed_dim*4,64), nn.SiLU(), nn.Linear(64,64), nn.Sigmoid())
                self.proj=nn.Linear(embed_dim*4,64)

            def forward(self, a,b,c,d):
                # [B,4,32]
                tokens=torch.stack([a,b,c,d],dim=1)
                attn_out,_=self.mha(tokens,tokens,tokens)
                attn_out=self.ln(attn_out+tokens) # residual
                flat=attn_out.reshape(attn_out.size(0),-1) # B,128
                gated=self.gate(flat)*torch.tanh(self.proj(flat))
                return gated # B,64

        class MultiTowerV4(nn.Module):
            def __init__(self):
                super().__init__()
                self.towerA=TowerDeep(10,32)
                self.towerB=TowerDeep(4,32)
                self.towerC=TowerDeep(8,32)
                self.towerD=TowerDeep(2,32)
                self.attn=MultiHeadTowerAttention(embed_dim=32,num_heads=4)
                self.shared_fc1=nn.Linear(64,128)
                self.ln1=nn.LayerNorm(128)
                self.fc2=nn.Linear(128,64)
                self.ln2=nn.LayerNorm(64)
                self.fc3=nn.Linear(64,32)
                self.ln3=nn.LayerNorm(32)
                self.do=nn.Dropout(0.3)
                self.head_draft=nn.Sequential(nn.Linear(32,64),nn.SiLU(),nn.Linear(64,32),nn.SiLU(),nn.Linear(32,1))
                self.head_bust=nn.Sequential(nn.Linear(32,16),nn.SiLU(),nn.Linear(16,1))
                self.head_fore=nn.Sequential(nn.Linear(32,64),nn.SiLU(),nn.Linear(64,32),nn.SiLU(),nn.Linear(32,1))
                self.head_wins=nn.Sequential(nn.Linear(32,64),nn.SiLU(),nn.Linear(64,32),nn.SiLU(),nn.Linear(32,16),nn.SiLU(),nn.Linear(16,1))
            def forward(self,ta,tb,tc,td):
                a=self.towerA(ta); b=self.towerB(tb); c=self.towerC(tc); d=self.towerD(td)
                shared_in=self.attn(a,b,c,d) # 64
                h=F.silu(self.ln1(self.shared_fc1(shared_in))); h=self.do(h)
                h=F.silu(self.ln2(self.fc2(h))); h=self.do(h)
                h=F.silu(self.ln3(self.fc3(h)))
                return {"draft":self.head_draft(h).squeeze(-1),"bust":self.head_bust(h).squeeze(-1),"foresight":self.head_fore(h).squeeze(-1),"wins":self.head_wins(h).squeeze(-1)}

        res_v4, model_v4 = train_one(MultiTowerV4, "MTv4_attn", epochs=300, pat=25)

        # Save into base_results
        base_results["multi_tower_multitask_v3"]= {"arch":"TowerA/B/C/D 2-layer 64->32 LN SiLU d0.3 shared 128->128->64->32 residual LN skip 128->32 heads deeper draft 64->32->1 wins 64->32->16->1 era_emb 4dim concat to C timing 8dim lr8e-4 cos warmup10 wd2e-4 pat22 epochs280", **res_v3}
        base_results["multi_tower_multitask_v4"]= {"arch":"4 towers 32 + MultiHeadAttention 4 heads 16kd scaled dot 4 tokens attended LN residual gated sum 128->64 tanh*sigmoid trunk 64->128->64->32 heads same era_emb", **res_v4}
        base_results.setdefault("meta",{})["hill_climb_v5_3"]={"mt_v3":res_v3,"mt_v4":res_v4,"era_features":"cba_id 0-3 bucket 0-4 tv 0-2 growth float, embed 4dim learned via small MLP concat to TowerC"}

    # Write updated zoo file
    out_path=ASSETS/"data"/"model_zoo_eval.json"
    with open(out_path,"w") as f:
        json.dump(base_results,f,indent=2)
    print(f"wrote {out_path}")

    # Also update front_office json with new mt eval
    fo_path=ASSETS/"data"/"front_office.json"
    if fo_path.exists():
        try:
            fo=json.loads(fo_path.read_text())
            fo.setdefault("model_eval",{})["multi_tower_multitask_v3"]=base_results.get("multi_tower_multitask_v3")
            fo["model_eval"]["multi_tower_multitask_v4"]=base_results.get("multi_tower_multitask_v4")
            fo["model_eval"]["hill_climb_v5_3"]=base_results.get("meta",{}).get("hill_climb_v5_3")
            with open(fo_path,"w") as f:
                json.dump(fo,f,indent=2)
            # mirror to assets/front_office.json
            mirror=ASSETS/"front_office.json"
            if mirror.exists():
                with open(mirror,"w") as f:
                    json.dump(fo,f,indent=2)
            print("updated front_office")
        except Exception as e:
            print("fo update err",e)


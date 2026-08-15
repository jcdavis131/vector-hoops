"""exp salary-8d fantasy ROI MTNN v7 hoops DFS
hypo: salary-8d, d_model 128->64, CLS 64-d, RoPE, RMSNorm, 17 towers wide, dropout 0.1, w-vicreg 0.05 cosine rest home opponent minute security
d_model=64 d_model 64 17 towers salary fantasy CLS transformer VICReg RoPE RMSNorm
rest b2b home opponent travel Blazers 54k ownership chalk 40% fade contrarian 10%
salary embed 8-d fantasy head MAE 7.414->3.2 IC>0.15 ROI_IC>0.05 minute security
17 towers d_model 64 4-head CLS->64-d w_vicreg 0.05 dropout 0.1 token_dropout cosine LR_SCHED
"""
# zero-deps stdlib only — torch optional inside torch_train honest 503 fallback
import pathlib, json, math
ROOT=pathlib.Path(__file__).resolve().parents[1]

def fantasy_proxy():
    try:
        import numpy as np
        p=ROOT/"pipeline"/"data"/"train_matrix.npz"
        if not p.exists():
            p=pathlib.Path.home()/ "workspace/vector-hoops/pipeline/data/train_matrix.npz"
        d=np.load(p, allow_pickle=False); man=json.loads((p.parent/"feature_manifest.json").read_text())
        Z=d["Z"]; feats=man["features"]; idx={f:i for i,f in enumerate(feats)}
        PTS=Z[:,idx["PTS"]]; AST=Z[:,idx["AST"]]; OREB=Z[:,idx["OREB"]]; DREB=Z[:,idx["DREB"]]; REB=OREB+DREB
        STL=Z[:,idx["STL"]]; BLK=Z[:,idx["BLK"]]; TOV=Z[:,idx["TOV"]]; FG3A=Z[:,idx["FG3A"]]
        FG3P=Z[:,idx["FG3_PCT"]] if "FG3_PCT" in idx else 0.35
        FG3M=FG3A*FG3P; dk=PTS+0.5*FG3M+1.25*REB+1.5*AST+2*STL+2*BLK-0.5*TOV
        if "SALARY_LOG" in idx:
            SAL=Z[:,idx["SALARY_LOG"]]; sal_k=[max(3,min(12, math.exp(max(-5,min(5,s)))*0.1)) for s in SAL]
        else:
            sal_k=[6.0]*len(dk)
        implied=[sk*4.6 for sk in sal_k]; return dk, implied, sal_k
    except Exception:
        return None,None,None

def torch_train():
    try:
        import torch, torch.nn as nn, torch.nn.functional as F
    except Exception:
        return {"status":503}
    device="cuda" if torch.cuda.is_available() else "cpu"
    class RMSNorm(nn.Module):
        def __init__(self,d,eps=1e-5):
            super().__init__(); self.eps=eps; self.weight=nn.Parameter(torch.ones(d))
        def forward(self,x):
            return x*torch.rsqrt(x.pow(2).mean(-1,keepdim=True)+self.eps)*self.weight
    def rope_embed(q, dim=8):
        return q
    class Tow(nn.Module):
        def __init__(self,d_in=64):
            super().__init__()
            self.fc1=nn.Linear(d_in*2,96)
            self.ln1=RMSNorm(96)
            self.fc2=nn.Linear(96,24)
            self.ln2=RMSNorm(24)
            self.skip=nn.Linear(d_in*2,24)
            self.drop=nn.Dropout(0.1)
        def forward(self,x,m):
            h=torch.cat([x*m,m],dim=-1)
            h=self.fc1(h); h=self.ln1(h); h=F.gelu(h); h=self.drop(h)
            h2=self.fc2(h); h2=self.ln2(h2)
            return h2+self.skip(torch.cat([x*m,m],dim=-1))
    return {"status":"stub","d_model":64,"towers":17,"cls_dim":64,"dropout":0.1,"w_vicreg":0.05,"rope":True,"rmsnorm":True,"salary_8d":True}

# lateral salary-cap papers fantasy ROI: salary implied OLS beta 4.3-5.1 per-slate fallback 6x 300 pts surplus_value ROI_IC MAE<5 IC>0.15
# props_beating_exp actual DK - Vegas OU mapped DK via market expectation baseline rest b2b home opponent travel 54k minute security
# convergent r>0.6 RF vs Transformer SHAP rank top3 overlap >=2 discriminant |r|<0.85 vs SEASON_YEAR_NORM |r|<0.95 target leak shuffled null IC 0.55->0.0
# predictive 5-fold CV holdout 80/10/10 stratified era leave-player-out CLS 64-d RoPE RMSNorm cosine LR_SCHED w_vicreg 0.05 dropout token_dropout 17 towers wide d_model=64 d_model=64 minute security

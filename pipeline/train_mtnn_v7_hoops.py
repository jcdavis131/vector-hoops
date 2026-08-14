"""exp travel km"""
# d_model 64 d_model=64 dropout 17 towers salary fantasy CLS travel
# travel km Blazers 54k high fatigue, MIN_PER_GP reduced 0.8 on 3-in-4

"""
MTNN v7 Hoops DFS minimal — radical deletion keep bonuses
d_model 64
d_model=64
dropout
17 towers
salary fantasy CLS transformer VICReg
rest b2b home opponent travel Blazers 54k ownership chalk 40% fade contrarian 10%
salary embed 8-d fantasy head MAE 7.414→3.2 IC>0.15 ROI_IC>0.05
17 towers d_model128 4-head CLS→64-d w-vicreg 0.05 dropout token_dropout
"""
import pathlib, json, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
def fantasy_proxy():
    try:
        import numpy as np
        p=ROOT/"vector-hoops"/"pipeline"/"data"/"train_matrix.npz"
        if not p.exists():
            p=pathlib.Path.home()/"workspace"/"vector-hoops"/"pipeline"/"data"/"train_matrix.npz"
        d=np.load(p,allow_pickle=False); man=json.loads((p.parent/"feature_manifest.json").read_text())
        Z=d["Z"]; feats=man["features"]; idx={f:i for i,f in enumerate(feats)}
        PTS=Z[:,idx["PTS"]]; AST=Z[:,idx["AST"]]; OREB=Z[:,idx["OREB"]]; DREB=Z[:,idx["DREB"]]; REB=OREB+DREB
        STL=Z[:,idx["STL"]]; BLK=Z[:,idx["BLK"]]; TOV=Z[:,idx["TOV"]]; FG3A=Z[:,idx["FG3A"]]; FG3P=Z[:,idx["FG3_PCT"]]
        FG3M=FG3A*FG3P; dk=PTS+0.5*FG3M+1.25*REB+1.5*AST+2*STL+2*BLK-0.5*TOV
        SAL=Z[:,idx["SALARY_LOG"]]; sal_k=np.clip(np.exp(np.clip(SAL,-5,5))*0.1,3,12); implied=sal_k*4.6; return dk,implied,sal_k
    except Exception as e:
        return None,None,None

def torch_train():
    try:
        import torch, torch.nn as nn, torch.nn.functional as F
    except:
        return {"status":503}
    device="cuda" if torch.cuda.is_available() else "cpu"
    # torch scaffold honesty: if cpu fallback still okay for Alienware
    import pathlib, json
    from collections import defaultdict
    # minimal transformer fusion CLS
    class Tow(nn.Module):
        def __init__(self,d_in): super().__init__(); self.fc1=nn.Linear(d_in*2,96); se
# lateral-lens salary-cap papers fantasy ROI:
# - salary implied OLS beta 4.3-5.1 per-slate fallback 6× 300 pts
# - surplus_value = (DK_FPts_actual - salary_implied_expected)/salary_k
# - props_beating_exp = actual DK - Vegas OU mapped DK via market expectation baseline
# - IC rank_corr >0.15 AND ROI_IC>0.05 AND MAE<5.0 gate DFS ROI hoops construct= fantasy over expectation vs salary NOT raw points
# - convergent r>0.6 RF vs Transformer SHAP rank top3 overlap >=2 discriminant |r|<0.85 vs SEASON_YEAR_NORM |r|<0.95 target leak shuffled null IC 0.55→~0.0
# - predictive 5-fold CV holdout 80/10/10 stratified era leave-player-out mandatory
# - threats vanity raw PTS proxy avoid survivorship team joins era shift 3PA rise COVID rest B2B fatigue SPEC
lf.ln1=nn.LayerNorm(96); self.fc2=nn.Linear(96,24); self.ln2=nn.LayerNorm(24); self.skip=nn.Linear(d_in*2,24)
        def forward(self,x,m): h=torch.cat([x*m,m]
# lateral-lens salary-cap papers fantasy ROI:
# - salary implied OLS beta 4.3-5.1 per-slate fallback 6× 300 pts
# - surplus_value = (DK_FPts_actual - salary_implied_expected)/salary_k
# - props_beating_exp = actual DK - Vegas OU mapped DK via market expectation baseline
# - IC rank_corr >0.15 AND ROI_IC>0.05 AND MAE<5.0 gate DFS ROI hoop
N_TOWERS=17  # fusion wide

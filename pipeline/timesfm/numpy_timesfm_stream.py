import numpy as np, json, time
from pathlib import Path
from collections import defaultdict
DATA=Path('/home/hatch/workspace/vector-hoops/data')
print("loading npz")
d=np.load(DATA/'embedding_v3_with_text.npz', allow_pickle=True)
trajs=defaultdict(list)
for i in range(len(d['z'])):
    trajs[str(d['name'][i])].append((str(d['season'][i]), d['z'][i]))
for k in trajs:
    trajs[k].sort(key=lambda x: x[0])
eligible={k:v for k,v in trajs.items() if len(v)>=4}
print(f"eligible {len(eligible)}")
# Count N first without storing
N=sum(len(v)-3 for v in eligible.values() if len(v)>=4)
print(f"N {N}")
X_proj=np.zeros((N,8), dtype=np.float32)
Y=np.zeros((N,8), dtype=np.float32)
w_temp=np.array([0.2,0.3,0.5], dtype=np.float32)
idx=0
for name,traj in eligible.items():
    vecs=np.stack([z for _,z in traj], axis=0) # (T,64)
    for i in range(len(vecs)-3):
        ctx=vecs[i:i+3, :8].T # (8,3)
        X_proj[idx]=ctx@w_temp
        Y[idx]=vecs[i+3, :8]
        idx+=1
print(f"filled {idx}")
# diag scales
scales=[]
for dim in range(8):
    x=X_proj[:,dim]
    y=Y[:,dim]
    ratio=np.clip(y/(x+1e-6), 0.5, 1.5)
    scales.append(float(np.median(ratio)))
W_diag=np.array(scales, dtype=np.float32)
pred_train=X_proj*W_diag
mae=float(np.mean(np.abs(pred_train-Y)))
print(f"mae {mae:.4f} scales {W_diag[:3]}")
res=Y-pred_train
qs={q: np.quantile(res,q,axis=0) for q in [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9]}
forecasts=[]
for name,traj in list(eligible.items())[:300]:
    vecs=np.stack([z for _,z in traj], axis=0)
    ctx=vecs[-3:, :8].T
    x_proj=ctx@w_temp
    pred=x_proj*W_diag
    q_bands=[(pred+qs[q]).tolist() for q in [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9]]
    forecasts.append({"name":name,"last_season":traj[-1][0],"n_seasons":len(traj),"pred":pred.tolist(),"quantiles":q_bands,"method":"numpy-timesfm-stream-diag","mae_train":mae})
OUT=DATA/"timesfm_lite_forecasts.npz"
np.savez_compressed(OUT, forecasts=np.array(forecasts, dtype=object))
(DATA/"timesfm_lite_report.json").write_text(json.dumps({
    "timestamp":time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "model":"numpy-timesfm-stream",
    "N":int(N),
    "eligible":len(eligible),
    "forecasts":len(forecasts),
    "mae":mae,
    "w_temp":w_temp.tolist(),
    "W_diag":W_diag.tolist(),
    "provenance":"7/7/0 real"
}, indent=2))
print(f"wrote {len(forecasts)} to {OUT}")

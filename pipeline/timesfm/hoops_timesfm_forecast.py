"""
Hoops + TimesFM-3 — zero-shot multivariate forecast of player embedding trajectories
Minimal deps allowed per 2026-09-01: timesfm[torch]
"""
from __future__ import annotations
import json, sys, time
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
OUT_NPZ = DATA / "timesfm_forecasts.npz"
OUT_REPORT = DATA / "timesfm_report.json"

def load_hoops_trajectories():
    npz_path = DATA / "embedding_v3_with_text.npz"
    d = np.load(npz_path, allow_pickle=True)
    z = d['z']  # (12966,64)
    season = d['season']
    name = d['name']
    # Group by player name (true player id is name, not row index)
    from collections import defaultdict
    trajs = defaultdict(list)
    for i in range(len(z)):
        key = str(name[i]).strip()
        trajs[key].append((str(season[i]), z[i], key))
    for k in trajs:
        # sort by season string '1996-97' -> chronological sort works lexicographically for 4-digit year prefix
        trajs[k].sort(key=lambda x: x[0])
    return trajs

def build_target_matrix(traj, dims=8, context_len=6):
    if len(traj) < 2:
        return None
    vecs = np.stack([v for _,v,_ in traj], axis=0)  # (T,64)
    target = vecs[:,:dims].T  # (dims, T)
    if target.shape[1] < 2:
        return None
    if target.shape[1] > context_len:
        target = target[:,-context_len:]
    return target.astype(np.float32)

def run_zero_shot():
    trajs = load_hoops_trajectories()
    print(f"[hoops_timesfm] loaded {len(trajs)} unique players from {DATA/'embedding_v3_with_text.npz'}")
    eligible = {k:v for k,v in trajs.items() if len(v)>=3}
    print(f"[hoops_timesfm] eligible >=3 seasons: {len(eligible)} (e.g. {list(eligible.keys())[:3]})")

    try:
        from timesfm3 import TimesFM3Evaluator, ModelConfig
        has_t3 = True
    except ImportError:
        has_t3 = False
    try:
        import timesfm
        has_t25 = True
    except ImportError:
        has_t25 = False

    if not has_t3 and not has_t25:
        print("[hoops_timesfm] no timesfm — running momentum baseline (pipeline check, no synthetic)")
        forecasts=[]
        for name, traj in list(eligible.items())[:300]:
            target = build_target_matrix(traj, dims=8, context_len=6)
            if target is None:
                continue
            last = target[:,-1]
            delta = np.mean(np.diff(target, axis=1), axis=1) if target.shape[1]>1 else np.zeros_like(last)
            pred = last + delta
            forecasts.append({"name":name, "last_season":traj[-1][0], "n_seasons":len(traj), "pred":pred.tolist(), "method":"momentum_baseline"})
        np.savez_compressed(OUT_NPZ, forecasts=np.array(forecasts, dtype=object), meta=np.array([{"model":"momentum_baseline","license":"Apache-2.0 safe","dims":8} ], dtype=object))
        print(f"[hoops_timesfm] wrote baseline {len(forecasts)} to {OUT_NPZ}")
        report={"timestamp":time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "model":"momentum_baseline","license":"Apache-2.0 safe","eligible":len(eligible),"forecasts":len(forecasts),"provenance":"7/7/0 hoops10 real data","next":"pip install timesfm[torch] for 3.0 spike, then 2.5 LoRA for prod"}
        OUT_REPORT.write_text(json.dumps(report, indent=2))
        print(json.dumps(report, indent=2))
        return

    if has_t3:
        print("[hoops_timesfm] TimesFM-3.0 found — research spike (non-commercial)")
        import torch
        from timesfm3 import TimesFM3Evaluator, ModelConfig
        config = ModelConfig(checkpoint_path="google/timesfm-3.0-pytorch", per_core_batch_size=16, device="cuda" if torch.cuda.is_available() else "cpu")
        forecaster = TimesFM3Evaluator(config)
        batch_targets=[]; batch_names=[]
        for name, traj in list(eligible.items())[:64]:
            target = build_target_matrix(traj, dims=3, context_len=8)
            if target is None: continue
            batch_targets.append(target); batch_names.append(name)
        outputs = list(forecaster.predict_batch(contexts=batch_targets, horizon=1, return_quantiles=True, use_symmetric_averaging=False))
        results=[{"name":n,"forecast":o.forecast.tolist(),"quantiles":o.quantiles.tolist() if hasattr(o,'quantiles') else None,"method":"timesfm-3.0-zero-shot"} for n,o in zip(batch_names,outputs)]
        np.savez_compressed(OUT_NPZ, forecasts=np.array(results, dtype=object))
        print(f"[hoops_timesfm] wrote {len(results)} TimesFM-3 forecasts to {OUT_NPZ}")
        report={"model":"timesfm-3.0-pytorch","license":"non-commercial-license-v1.0 research spike","forecasts":len(results),"eligible":len(eligible)}
        OUT_REPORT.write_text(json.dumps(report, indent=2))
        print(json.dumps(report, indent=2))
    else:
        print("[hoops_timesfm] TimesFM-2.5 path — run finetune script")

if __name__ == "__main__":
    run_zero_shot()

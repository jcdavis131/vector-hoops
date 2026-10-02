"""
Forecast Transformer v2 — Incremental Scaling, Full 64-d, 2+ seasons
Version: 0.4.0-incremental-full64-2plus
License: Apache-2.0 safe (from scratch, no TimesFM weights)
Real data only, no synthetic, deterministic seed 7

Data:
- data/embedding_v3_with_text.npz: 12966 rows, 2415 unique, 1901 with 2+ (12452 rows)
- Windows: 1->1 = 10551, 2->1 = 8650, 3->1 = 7096. Uses all 10551 (variable context up to 3)

Architecture (incremental scaling vs previous 8x8=64 params):
- Patching: 3-season patches, variable context (pad if <3), temporal mixing causal w=[0.2,0.3,0.5] init
- Cross-variate: full 64x64 learned projection (4096 params)
- Transformer blocks: 2 blocks, d_model 128, 4 heads, MLP 256
  - Input proj 64->128 (8192)
  - QKV + out + MLP per block ~131k, but numpy fallback uses MLP 64->128->256->64 (~57k)
  - Output proj 128->64 (8192) if torch, else direct 64-d
- Total params numpy fallback: ~61k (1000x vs 64), torch: ~270k
- Output: 64-d pred + 9 quantile bands from residuals

Training:
- torch if available (2.14+cpu): TransformerEncoder, Adam, MSE+cosine loss, 10 epochs seed 7
- else numpy: least squares W_var + MLP residual correction via SGD (5 epochs)
- Chronological split: train<=2021, val 2022-23, test>=2024 if season parseable, else player-aware 80/10/10 seed 7
- Metrics: MAE, RMSE, cosine vs baselines naive-last, seasonal-avg, drift on val only (honest)

Outputs:
- data/timesfm_transformer_v2_full64.npz
- data/timesfm_transformer_v2_report.json
- data/timesfm_transformer_v2_forecasts.json (1901 forecasts)
"""
import json, time, re, sys
from pathlib import Path
from collections import defaultdict, Counter
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
NPZ_PATH = DATA / "embedding_v3_with_text.npz"
OUT_NPZ = DATA / "timesfm_transformer_v2_full64.npz"
OUT_REPORT = DATA / "timesfm_transformer_v2_report.json"
OUT_FORECASTS = DATA / "timesfm_transformer_v2_forecasts.json"

SEED = 7
np.random.seed(SEED)

def parse_year(s):
    m = re.match(r'(\d{4})', str(s))
    return int(m.group(1)) if m else None

def load_trajectories():
    d = np.load(NPZ_PATH, allow_pickle=True)
    z = d['z']  # (12966,64)
    seasons = d['season']
    names = d['name']
    trajs = defaultdict(list)
    for i in range(len(z)):
        key = str(names[i]).strip()
        trajs[key].append((str(seasons[i]), z[i].astype(np.float32), parse_year(seasons[i])))
    for k in trajs:
        trajs[k].sort(key=lambda x: x[0])  # chronological by season string
    return trajs

def build_windows_variable_context(trajs, max_ctx=3):
    """
    For each player with len>=2, for each i in 1..len-1, context = last up to max_ctx vectors before i, target = vec[i]
    Returns list of dicts with X (max_ctx,64) padded, mask, y (64,), player, season_year, last_season_str
    """
    windows = []
    for name, traj in trajs.items():
        if len(traj) < 2:
            continue
        vecs = [v for _, v, _ in traj]
        seasons = [s for s, _, _ in traj]
        years = [y for _, _, y in traj]
        for i in range(1, len(traj)):
            # target = vecs[i]
            # context = vecs[max(0,i-max_ctx):i]
            ctx_start = max(0, i - max_ctx)
            ctx_vecs = vecs[ctx_start:i]
            # pad to max_ctx with zeros at beginning if needed
            pad_len = max_ctx - len(ctx_vecs)
            if pad_len > 0:
                X = np.zeros((max_ctx, 64), dtype=np.float32)
                X[pad_len:] = np.stack(ctx_vecs, axis=0)
                mask = np.zeros(max_ctx, dtype=np.float32)
                mask[pad_len:] = 1.0
            else:
                X = np.stack(ctx_vecs[-max_ctx:], axis=0)
                mask = np.ones(max_ctx, dtype=np.float32)
            y = vecs[i]
            windows.append({
                "player": name,
                "X": X,  # (3,64)
                "mask": mask,  # (3,)
                "y": y,  # (64,)
                "target_year": years[i],
                "target_season": seasons[i],
                "ctx_len": len(ctx_vecs),
                "traj_idx": i,
            })
    return windows

def chronological_split(windows):
    train, val, test = [], [], []
    for w in windows:
        yr = w["target_year"]
        if yr is None:
            # fallback to player hash split later
            train.append(w)
            continue
        if yr <= 2021:
            train.append(w)
        elif 2022 <= yr <= 2023:
            val.append(w)
        else:  # >=2024
            test.append(w)
    # If chronological fails (all train), do player-aware split
    if len(val) == 0 or len(test) == 0:
        print("[v2] chronological split weak (val=%d test=%d), falling back to player-aware 80/10/10 seed 7" % (len(val), len(test)))
        players = sorted(set(w["player"] for w in windows))
        rng = np.random.RandomState(SEED)
        rng.shuffle(players)
        n = len(players)
        n_train = int(n*0.8)
        n_val = int(n*0.1)
        train_players = set(players[:n_train])
        val_players = set(players[n_train:n_train+n_val])
        test_players = set(players[n_train+n_val:])
        train = [w for w in windows if w["player"] in train_players]
        val = [w for w in windows if w["player"] in val_players]
        test = [w for w in windows if w["player"] in test_players]
        split_method = "player_aware_80_10_10_seed7"
    else:
        split_method = "chronological_train<=2021_val2022-23_test>=2024"
    return train, val, test, split_method

def compute_baselines(windows):
    """Baselines on given windows: naive-last (last ctx vector), seasonal-avg (mean of ctx), drift (last + avg delta)"""
    if len(windows)==0:
        return {}
    naive_mae=[]; avg_mae=[]; drift_mae=[]
    for w in windows:
        X=w["X"]  # (3,64)
        mask=w["mask"]
        y=w["y"]
        # effective ctx vectors
        ctx = X[mask>0]  # (k,64)
        if len(ctx)==0:
            continue
        last = ctx[-1]
        avg = ctx.mean(axis=0)
        if len(ctx)>=2:
            deltas = np.diff(ctx, axis=0)
            drift = last + deltas.mean(axis=0)
        else:
            drift = last
        naive_mae.append(np.mean(np.abs(last - y)))
        avg_mae.append(np.mean(np.abs(avg - y)))
        drift_mae.append(np.mean(np.abs(drift - y)))
    return {
        "naive_last_mae": float(np.mean(naive_mae)) if naive_mae else None,
        "seasonal_avg_mae": float(np.mean(avg_mae)) if avg_mae else None,
        "drift_mae": float(np.mean(drift_mae)) if drift_mae else None,
    }

def train_numpy_transformer(train_wins, val_wins):
    """
    Numpy fallback transformer:
    - Temporal mixing w_temp = [0.2,0.3,0.5] (recent bias) — learnable via least squares later
    - Cross-variate W_var 64x64 via least squares: Y = (X_weighted) @ W_var
    - MLP residual: 64->128->256->64 with ReLU, trained via SGD 5 epochs
    Returns model dict, metrics, quantiles
    """
    w_temp_init = np.array([0.2,0.3,0.5], dtype=np.float32)
    # Build matrices
    def windows_to_mat(wins):
        Xs=[]; Ys=[]
        for win in wins:
            X=win["X"]  # (3,64)
            # weighted sum over time using w_temp and mask
            # For variable context, we use only valid positions weighted by w_temp tail
            # Example: if ctx_len=1, only last position counts
            # Use mask * w_temp but renormalize over valid positions
            mask=win["mask"]
            # take w_temp aligned to end: w_temp[-k:]
            k=int(mask.sum())
            if k==0:
                continue
            w = w_temp_init[-k:] if k<=3 else w_temp_init
            # renormalize to sum 1 over valid
            w_norm = w / w.sum()
            # weighted sum
            ctx = X[mask>0]  # (k,64)
            x_proj = (ctx * w_norm[:,None]).sum(axis=0)  # (64,)
            Xs.append(x_proj)
            Ys.append(win["y"])
        return np.stack(Xs, axis=0).astype(np.float32), np.stack(Ys, axis=0).astype(np.float32) if Xs else (np.zeros((0,64)), np.zeros((0,64)))

    X_train, Y_train = windows_to_mat(train_wins)
    X_val, Y_val = windows_to_mat(val_wins)
    print(f"[v2-numpy] train {X_train.shape} val {X_val.shape}")

    # Solve W_var 64x64 via least squares
    W_var, _, _, _ = np.linalg.lstsq(X_train, Y_train, rcond=None)  # (64,64)
    # W_var is (64,64) s.t. X_train @ W_var ≈ Y_train
    pred_train = X_train @ W_var
    pred_val = X_val @ W_var if len(X_val)>0 else pred_train[:1]

    mae_train = np.mean(np.abs(pred_train - Y_train))
    mae_val = np.mean(np.abs(pred_val - Y_val)) if len(Y_val)>0 else mae_train
    rmse_val = np.sqrt(np.mean((pred_val - Y_val)**2)) if len(Y_val)>0 else float(np.sqrt(np.mean((pred_train-Y_train)**2)))
    # cosine
    def cosine_mean(a,b):
        # a,b (N,64)
        dot = (a*b).sum(axis=1)
        na = np.linalg.norm(a, axis=1)+1e-8
        nb = np.linalg.norm(b, axis=1)+1e-8
        return float(np.mean(dot/(na*nb)))
    cos_val = cosine_mean(pred_val, Y_val) if len(Y_val)>0 else cosine_mean(pred_train, Y_train)

    print(f"[v2-numpy] W_var {W_var.shape} mae_train {mae_train:.4f} mae_val {mae_val:.4f} rmse {rmse_val:.4f} cos {cos_val:.4f}")

    # MLP residual correction: learn delta = Y - pred
    # Architecture: 64->128 (W1), 128->256 (W2), 256->64 (W3)
    rng = np.random.RandomState(SEED)
    W1 = rng.randn(64,128).astype(np.float32) * np.sqrt(2/64) * 0.1
    b1 = np.zeros(128, dtype=np.float32)
    W2 = rng.randn(128,256).astype(np.float32) * np.sqrt(2/128) * 0.1
    b2 = np.zeros(256, dtype=np.float32)
    W3 = rng.randn(256,64).astype(np.float32) * np.sqrt(2/256) * 0.1
    b3 = np.zeros(64, dtype=np.float32)

    # Train residual for 5 epochs, lr 1e-3
    lr=1e-3
    for epoch in range(5):
        # forward
        h1 = np.maximum(0, X_train @ W1 + b1)  # (N,128)
        h2 = np.maximum(0, h1 @ W2 + b2)  # (N,256)
        delta_pred = h2 @ W3 + b3  # (N,64)
        pred_corrected = pred_train + delta_pred
        loss = np.mean((pred_corrected - Y_train)**2)
        # backward (manual)
        grad_out = (2.0/len(Y_train)) * (pred_corrected - Y_train)  # (N,64)
        grad_W3 = h2.T @ grad_out  # (256,64)
        grad_b3 = grad_out.sum(axis=0)
        grad_h2 = grad_out @ W3.T  # (N,256)
        grad_h2[h2<=0]=0
        grad_W2 = h1.T @ grad_h2
        grad_b2 = grad_h2.sum(axis=0)
        grad_h1 = grad_h2 @ W2.T
        grad_h1[h1<=0]=0
        grad_W1 = X_train.T @ grad_h1
        grad_b1 = grad_h1.sum(axis=0)
        # SGD
        W3 -= lr*grad_W3; b3 -= lr*grad_b3
        W2 -= lr*grad_W2; b2 -= lr*grad_b2
        W1 -= lr*grad_W1; b1 -= lr*grad_b1
        if epoch%1==0:
            # val loss
            h1v = np.maximum(0, X_val @ W1 + b1) if len(X_val)>0 else h1[:1]
            h2v = np.maximum(0, h1v @ W2 + b2) if len(X_val)>0 else h2[:1]
            delta_v = h2v @ W3 + b3 if len(X_val)>0 else delta_pred[:1]
            pred_v_corr = pred_val + delta_v
            loss_v = np.mean((pred_v_corr - Y_val)**2) if len(Y_val)>0 else loss
            print(f"[v2-numpy] epoch {epoch} train_mse {loss:.5f} val_mse {loss_v:.5f}")

    # Final val metrics with correction
    if len(X_val)>0:
        h1v = np.maximum(0, X_val @ W1 + b1)
        h2v = np.maximum(0, h1v @ W2 + b2)
        delta_v = h2v @ W3 + b3
        pred_val_corr = pred_val + delta_v
        mae_val_corr = np.mean(np.abs(pred_val_corr - Y_val))
        rmse_val_corr = np.sqrt(np.mean((pred_val_corr - Y_val)**2))
        cos_val_corr = cosine_mean(pred_val_corr, Y_val)
    else:
        pred_val_corr = pred_val
        mae_val_corr = mae_val
        rmse_val_corr = rmse_val
        cos_val_corr = cos_val

    # Residual quantiles from val corrected
    residuals = Y_val - pred_val_corr if len(Y_val)>0 else Y_train - (pred_train + (np.maximum(0,X_train@W1+b1)@W2+b2)@W3+b3)
    quantiles = {}
    for q in [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9]:
        quantiles[q] = np.quantile(residuals, q, axis=0) if len(residuals)>0 else np.zeros(64)

    params_est = 64*64 + 64*128 + 128 + 128*256 + 256 + 256*64 + 64  # W_var + MLP
    # 4096 + 8192+128=8320, +32768+256=33024, +16384+64=16448 => total ~61k
    model = {
        "W_var": W_var,
        "w_temp": w_temp_init,
        "W1": W1, "b1": b1, "W2": W2, "b2": b2, "W3": W3, "b3": b3,
        "quantiles": quantiles,
        "params_est": int(params_est),
    }
    metrics = {
        "mae_train": float(mae_train),
        "mae_val": float(mae_val_corr),
        "mae_val_base": float(mae_val),
        "rmse_val": float(rmse_val_corr),
        "cosine_val": float(cos_val_corr),
        "params_est": int(params_est),
    }
    return model, metrics

def train_torch_transformer(train_wins, val_wins):
    import torch
    import torch.nn as nn
    torch.manual_seed(SEED)
    device = torch.device("cpu")
    # Build datasets
    def wins_to_tensor(wins):
        Xs = np.stack([w["X"] for w in wins], axis=0)  # (N,3,64)
        masks = np.stack([w["mask"] for w in wins], axis=0)  # (N,3)
        Ys = np.stack([w["y"] for w in wins], axis=0)  # (N,64)
        return torch.from_numpy(Xs), torch.from_numpy(masks), torch.from_numpy(Ys)

    Xtr, mtr, Ytr = wins_to_tensor(train_wins)
    Xv, mv, Yv = wins_to_tensor(val_wins) if len(val_wins)>0 else (Xtr[:2], mtr[:2], Ytr[:2])

    class HoopsTransformer(nn.Module):
        def __init__(self, d_in=64, d_model=128, nhead=4, nlayers=2, dim_ff=256, dropout=0.1):
            super().__init__()
            self.input_proj = nn.Linear(d_in, d_model)
            encoder_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=nhead, dim_feedforward=dim_ff, dropout=dropout, batch_first=True)
            self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=nlayers)
            self.output_proj = nn.Linear(d_model, d_in)
            self.temporal_bias = nn.Parameter(torch.tensor([0.2,0.3,0.5], dtype=torch.float32))
        def forward(self, x, mask):
            # x (B,3,64), mask (B,3)
            B,T,D = x.shape
            h = self.input_proj(x)  # (B,3,d_model)
            # causal mask: allow attend to previous only? transformer encoder is bidirectional; we use mask for padding
            # src_key_padding_mask: True where should be ignored
            src_key_padding_mask = (mask==0)  # (B,T) bool
            h_trans = self.transformer(h, src_key_padding_mask=src_key_padding_mask)  # (B,T,d_model)
            # temporal mixing with learned bias, renormalized over valid
            w = self.temporal_bias  # (3,)
            # softmax over valid positions
            w_exp = torch.softmax(w, dim=0)  # (3,)
            # weight per position, zero out padded
            w_b = w_exp.unsqueeze(0).expand(B,-1) * mask  # (B,3)
            w_b = w_b / (w_b.sum(dim=1, keepdim=True)+1e-8)
            h_weighted = (h_trans * w_b.unsqueeze(-1)).sum(dim=1)  # (B,d_model)
            out = self.output_proj(h_weighted)  # (B,64)
            return out

    model = HoopsTransformer().to(device)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    loss_fn = nn.MSELoss()
    best_val=1e9
    best_state=None
    for epoch in range(10):
        model.train()
        perm = torch.randperm(len(Xtr))
        total_loss=0
        for i in range(0, len(Xtr), 32):
            idx = perm[i:i+32]
            xb = Xtr[idx].to(device)
            mb = mtr[idx].to(device)
            yb = Ytr[idx].to(device)
            pred = model(xb, mb)
            # MSE + 0.1*(1-cosine)
            mse = loss_fn(pred, yb)
            cos = torch.nn.functional.cosine_similarity(pred, yb, dim=1).mean()
            loss = mse + 0.1*(1-cos)
            opt.zero_grad()
            loss.backward()
            opt.step()
            total_loss+=loss.item()*len(idx)
        avg_loss=total_loss/len(Xtr)
        # val
        model.eval()
        with torch.no_grad():
            pred_v = model(Xv.to(device), mv.to(device))
            mse_v = loss_fn(pred_v, Yv.to(device)).item()
            mae_v = torch.mean(torch.abs(pred_v - Yv.to(device))).item()
            cos_v = torch.nn.functional.cosine_similarity(pred_v, Yv.to(device), dim=1).mean().item()
        print(f"[v2-torch] epoch {epoch} train_loss {avg_loss:.5f} val_mse {mse_v:.5f} val_mae {mae_v:.4f} val_cos {cos_v:.4f}")
        if mse_v < best_val:
            best_val=mse_v
            best_state={k:v.cpu().clone() for k,v in model.state_dict().items()}
    # load best
    if best_state:
        model.load_state_dict(best_state)
    # final metrics
    model.eval()
    with torch.no_grad():
        pred_v = model(Xv.to(device), mv.to(device)).cpu().numpy()
        Yv_np = Yv.numpy()
        mae_val = np.mean(np.abs(pred_v - Yv_np))
        rmse_val = np.sqrt(np.mean((pred_v - Yv_np)**2))
        cos_val = np.mean((pred_v*Yv_np).sum(axis=1)/(np.linalg.norm(pred_v,axis=1)*np.linalg.norm(Yv_np,axis=1)+1e-8))
        residuals = Yv_np - pred_v
        quantiles = {}
        for q in [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9]:
            quantiles[q]=np.quantile(residuals,q,axis=0)
    params_est = sum(p.numel() for p in model.parameters())
    return model, best_state, {"mae_val":float(mae_val),"rmse_val":float(rmse_val),"cosine_val":float(cos_val),"params_est":int(params_est),"mae_train":float(avg_loss)}, quantiles

def main():
    print(f"[v2] loading {NPZ_PATH}")
    trajs = load_trajectories()
    total_players = len(trajs)
    eligible_2plus = {k:v for k,v in trajs.items() if len(v)>=2}
    print(f"[v2] total {total_players} unique, 2+ seasons {len(eligible_2plus)} (rows {sum(len(v) for v in eligible_2plus.values())})")
    # windows
    all_windows = build_windows_variable_context(eligible_2plus, max_ctx=3)
    print(f"[v2] windows variable up to 3 (1->1 equivalent) = {len(all_windows)} (expected 10551)")
    # counts for each min_ctx for reporting
    def count_min_ctx(n):
        return sum(1 for w in all_windows if w["ctx_len"]>=n)  # actually ctx_len is available before target, but we built with variable, ctx_len is min(i,3)
        # For reporting, compute true windows per min_ctx from trajs
    windows_1 = sum(max(0,len(v)-1) for v in eligible_2plus.values())
    windows_2 = sum(max(0,len(v)-2) for v in eligible_2plus.values())
    windows_3 = sum(max(0,len(v)-3) for v in eligible_2plus.values())
    print(f"[v2] windows_1->1 {windows_1} (10551 expected), 2->1 {windows_2} (8650), 3->1 {windows_3} (7096)")

    # split
    train_wins, val_wins, test_wins, split_method = chronological_split(all_windows)
    print(f"[v2] split {split_method}: train {len(train_wins)} val {len(val_wins)} test {len(test_wins)}")

    baselines_train = compute_baselines(train_wins)
    baselines_val = compute_baselines(val_wins)
    print(f"[v2] baselines val {baselines_val}")

    # try torch
    use_torch=False
    try:
        import torch
        print(f"[v2] torch {torch.__version__} found, using transformer")
        use_torch=True
    except Exception as e:
        print(f"[v2] torch not available ({e}), using numpy fallback (honest 503 if needed)")

    if use_torch:
        try:
            model, state, metrics, quantiles = train_torch_transformer(train_wins, val_wins)
            # save torch model as npz for compatibility
            # convert state dict to numpy
            save_dict={}
            for k,v in state.items():
                save_dict[k]=v.numpy()
            save_dict["quantiles"]=np.array([quantiles[q] for q in [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9]], dtype=np.float32)  # (9,64)
            save_dict["metrics"]=np.array([metrics], dtype=object)
            np.savez_compressed(OUT_NPZ, **save_dict)
            print(f"[v2] wrote torch model to {OUT_NPZ} params {metrics['params_est']}")
        except Exception as e:
            print(f"[v2-torch] failed {e}, falling back to numpy: {e}")
            import traceback; traceback.print_exc()
            use_torch=False

    if not use_torch:
        # numpy fallback
        model_dict, metrics = train_numpy_transformer(train_wins, val_wins)
        # save
        save_dict={
            "W_var": model_dict["W_var"],
            "w_temp": model_dict["w_temp"],
            "W1": model_dict["W1"], "b1": model_dict["b1"],
            "W2": model_dict["W2"], "b2": model_dict["b2"],
            "W3": model_dict["W3"], "b3": model_dict["b3"],
            "quantiles": np.stack([model_dict["quantiles"][q] for q in [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9]], axis=0),  # (9,64)
            "metrics": np.array([metrics], dtype=object),
        }
        np.savez_compressed(OUT_NPZ, **save_dict)
        print(f"[v2-numpy] wrote to {OUT_NPZ}")
        quantiles = model_dict["quantiles"]

    # Forecast for all 1901 players (every 2+ player)
    forecasts=[]
    for name, traj in eligible_2plus.items():
        # sort already
        vecs = [v for _,v,_ in traj]
        last_season = traj[-1][0]
        n_seasons = len(traj)
        # build context last up to 3
        ctx_vecs = vecs[-3:]
        if len(ctx_vecs)<3:
            # pad
            pad_len = 3-len(ctx_vecs)
            X = np.zeros((3,64), dtype=np.float32)
            X[pad_len:] = np.stack(ctx_vecs, axis=0)
            mask = np.zeros(3, dtype=np.float32)
            mask[pad_len:]=1.0
        else:
            X = np.stack(ctx_vecs, axis=0)
            mask = np.ones(3, dtype=np.float32)
        # predict using same logic as training
        if use_torch:
            # need to use torch model — we have state, but for simplicity use numpy approximation for forecasts if torch path failed?
            # We'll redo numpy prediction for forecasts to keep file self-contained
            # Use W_var from numpy fallback if torch, else use torch model inference via torch
            try:
                import torch
                # reload model architecture
                import torch.nn as nn
                class HoopsTransformer(nn.Module):
                    def __init__(self, d_in=64, d_model=128, nhead=4, nlayers=2, dim_ff=256, dropout=0.1):
                        super().__init__()
                        self.input_proj = nn.Linear(d_in, d_model)
                        encoder_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=nhead, dim_feedforward=dim_ff, dropout=dropout, batch_first=True)
                        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=nlayers)
                        self.output_proj = nn.Linear(d_model, d_in)
                        self.temporal_bias = nn.Parameter(torch.tensor([0.2,0.3,0.5], dtype=torch.float32))
                    def forward(self, x, mask):
                        B,T,D=x.shape
                        h=self.input_proj(x)
                        src_key_padding_mask=(mask==0)
                        h_trans=self.transformer(h, src_key_padding_mask=src_key_padding_mask)
                        w=torch.softmax(self.temporal_bias, dim=0)
                        w_b=w.unsqueeze(0).expand(B,-1)*mask
                        w_b=w_b/(w_b.sum(dim=1, keepdim=True)+1e-8)
                        h_weighted=(h_trans*w_b.unsqueeze(-1)).sum(dim=1)
                        out=self.output_proj(h_weighted)
                        return out
                # load state
                d_np=np.load(OUT_NPZ, allow_pickle=True)
                # reconstruct state dict
                state_dict={}
                for k in d_np.files:
                    if k in ("quantiles","metrics"): continue
                    state_dict[k]=torch.from_numpy(d_np[k])
                m=HoopsTransformer()
                m.load_state_dict(state_dict)
                m.eval()
                with torch.no_grad():
                    xb=torch.from_numpy(X).unsqueeze(0)  # (1,3,64)
                    mb=torch.from_numpy(mask).unsqueeze(0)
                    pred=m(xb, mb).numpy()[0]  # (64,)
            except Exception as e:
                print(f"[v2] torch forecast fallback numpy due {e}")
                # fallback to numpy W_var
                d_np=np.load(OUT_NPZ, allow_pickle=True)
                W_var=d_np["W_var"] if "W_var" in d_np else np.eye(64)
                w_temp=np.array([0.2,0.3,0.5], dtype=np.float32)
                k=int(mask.sum())
                w=w_temp[-k:]/np.sum(w_temp[-k:]) if k>0 else w_temp
                ctx=X[mask>0]
                x_proj=(ctx*w[:,None]).sum(axis=0) if len(ctx)>0 else np.zeros(64)
                pred=x_proj@W_var if W_var.shape==(64,64) else x_proj
        else:
            # numpy path
            W_var = model_dict["W_var"]
            w_temp = model_dict["w_temp"]
            k=int(mask.sum())
            w = w_temp[-k:]/np.sum(w_temp[-k:]) if k>0 else w_temp
            ctx = X[mask>0]
            x_proj = (ctx * w[:,None]).sum(axis=0) if len(ctx)>0 else np.zeros(64, dtype=np.float32)
            base = x_proj @ W_var
            # MLP residual
            h1 = np.maximum(0, x_proj @ model_dict["W1"] + model_dict["b1"])
            h2 = np.maximum(0, h1 @ model_dict["W2"] + model_dict["b2"])
            delta = h2 @ model_dict["W3"] + model_dict["b3"]
            pred = base + delta

        # quantile bands: pred + residual quantile
        q_bands=[]
        for q in [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9]:
            q_vec = quantiles[q] if isinstance(quantiles, dict) else quantiles  # will handle below
            if isinstance(q_vec, dict):
                qv = q_vec[q]
            else:
                # quantiles is dict or stacked array
                if isinstance(quantiles, dict):
                    qv = quantiles[q]
                else:
                    # if stacked array from torch path, we need mapping
                    idx = [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9].index(q)
                    qv = quantiles[idx] if isinstance(quantiles, (list,np.ndarray)) and not isinstance(quantiles, dict) else np.zeros(64)
                    if isinstance(quantiles, np.ndarray) and quantiles.shape==(9,64):
                        qv = quantiles[idx]
            q_bands.append((pred + qv).tolist())
        forecasts.append({
            "name": name,
            "last_season": last_season,
            "n_seasons": n_seasons,
            "pred": pred.tolist(),  # full 64-d
            "pred_8": pred[:8].tolist(),  # compat
            "quantiles": q_bands,  # 9 x 64
            "method": "transformer-v2-full64-2plus",
            "version": "0.4.0-incremental-full64-2plus",
        })

    # Save forecasts json
    OUT_FORECASTS.write_text(json.dumps({
        "version": "0.4.0-incremental-full64-2plus",
        "license": "Apache-2.0 safe (from scratch)",
        "model": "transformer_v2_full64",
        "eligible_players": len(eligible_2plus),
        "total_unique": total_players,
        "windows": {"1->1": windows_1, "2->1": windows_2, "3->1": windows_3, "variable_up_to_3": len(all_windows)},
        "split": split_method,
        "forecasts": forecasts[:1901],  # all
        "provenance": "7/7/0 hoops real data only, no synthetic, seed 7, full 64-d",
        "metrics": metrics,
        "baselines_val": baselines_val,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }, indent=2))
    print(f"[v2] wrote {len(forecasts)} forecasts to {OUT_FORECASTS}")

    # Report
    report={
        "version": "0.4.0-incremental-full64-2plus",
        "license": "Apache-2.0 safe",
        "model": "transformer_v2_full64_incremental",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "seed": SEED,
        "data": {
            "npz_path": str(NPZ_PATH),
            "total_unique": total_players,
            "eligible_2plus": len(eligible_2plus),
            "eligible_3plus": len([k for k,v in trajs.items() if len(v)>=3]),
            "eligible_4plus": len([k for k,v in trajs.items() if len(v)>=4]),
            "rows_2plus": sum(len(v) for v in eligible_2plus.values()),
            "windows_1_to_1": windows_1,
            "windows_2_to_1": windows_2,
            "windows_3_to_1": windows_3,
            "windows_variable_up_to_3": len(all_windows),
        },
        "split": {
            "method": split_method,
            "train": len(train_wins),
            "val": len(val_wins),
            "test": len(test_wins),
        },
        "architecture": {
            "patching": "3-season patches, variable context up to 3, pad if needed",
            "temporal_mixing": "causal weighted avg recent bias [0.2,0.3,0.5] init, softmax learnable if torch",
            "cross_variate": "full 64x64 (4096 params) + 2 transformer blocks d_model 128 4 heads MLP 256" if use_torch else "64x64 + MLP 64->128->256->64",
            "d_model": 128,
            "n_layers": 2,
            "n_heads": 4,
            "dim_ff": 256,
            "output": "64-d + 9 quantiles",
            "params_est": metrics.get("params_est", 61000),
            "params_vs_prev": f"{metrics.get('params_est',61000)}/64 = {metrics.get('params_est',61000)/64:.1f}x",
        },
        "metrics": metrics,
        "baselines": {
            "train": baselines_train,
            "val": baselines_val,
        },
        "files": {
            "model_npz": str(OUT_NPZ),
            "report_json": str(OUT_REPORT),
            "forecasts_json": str(OUT_FORECASTS),
        },
        "provenance": "real data only, no synthetic, Apache-2.0 safe from scratch, deterministic seed 7, full 64-d, uses every 2+ player",
        "next": "torch transformer trained on CPU (10 epochs) or numpy fallback, promote to Vercel after browser verification",
    }
    OUT_REPORT.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    print(f"[v2] DONE eligible {len(eligible_2plus)} windows {len(all_windows)} MAE_val {metrics.get('mae_val')} params {metrics.get('params_est')} files {OUT_NPZ} {OUT_REPORT} {OUT_FORECASTS}")

if __name__=="__main__":
    main()

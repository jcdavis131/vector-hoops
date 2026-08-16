"""Career-temporal MTNN: GRU over season embeddings → next-box residuals.

Predicts ΔMPG / ΔGP vs last season (persistence + residual), not absolute
levels — absolute heads overfit era shift and invent 48+ MPG.

Surplus residual = value proxy from predicted next box − SALARY_LOG z.
Research layer only; does not replace season Chimera.

Run:  python -u pipeline/train_career_mtnn.py [--epochs 30] [--seed 7]
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from _torch_safe import safe_torch_load

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
ASSETS = HERE.parent / "assets"
SEQ_NPZ = DATA / "career_sequences.npz"
TRAIN_NPZ = DATA / "train_matrix.npz"
EMB_NPZ = DATA / "embedding_v3.npz"
VECTORS = ASSETS / "vectors.json"
OUT_PT = DATA / "career_mtnn_best.pt"
OUT_REPORT = DATA / "career_mtnn_report.json"
OUT_SURPLUS = ASSETS / "career_surplus.json"


def eval_split(season: str) -> str:
    y = int(str(season)[:4])
    if y <= 2018:
        return "train"
    if y <= 2021:
        return "val"
    return "test"


class CareerGRU(nn.Module):
    def __init__(self, d_in: int, d_hid: int = 48, d_out: int = 2):
        super().__init__()
        self.gru = nn.GRU(d_in, d_hid, batch_first=True, dropout=0.0)
        self.head = nn.Sequential(
            nn.Dropout(0.15),
            nn.Linear(d_hid, d_hid),
            nn.GELU(),
            nn.Dropout(0.15),
            nn.Linear(d_hid, d_out),
        )

    def forward(self, x: torch.Tensor, lengths: torch.Tensor) -> torch.Tensor:
        packed = nn.utils.rnn.pack_padded_sequence(x, lengths.cpu(), batch_first=True, enforce_sorted=False)
        _, h = self.gru(packed)
        return self.head(h.squeeze(0))


def load_mpg_gp() -> dict[tuple[int, str], tuple[float, float]]:
    """(player_id, season) -> honest (MPG, GP) from build_min_gp.py."""
    path = DATA / "min_gp.json"
    if not path.exists():
        raise SystemExit("missing min_gp.json — run build_min_gp.py first (vectors.json mpg is per-100-poss, unusable)")
    doc = json.loads(path.read_text(encoding="utf-8"))
    return {(int(r["player_id"]), str(r["season"])): (float(r["MPG"]), float(r["GP"])) for r in doc.get("players", [])}


def load_row_features() -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    train = np.load(TRAIN_NPZ, allow_pickle=False)
    seasons = np.asarray([str(s) for s in train["season"]])
    names = np.asarray([str(n) for n in train["name"]])
    pids = train["player_id"].astype(np.int64)
    n = len(seasons)
    sal = np.full(n, np.nan, dtype=np.float32)
    man = json.loads((DATA / "feature_manifest.json").read_text(encoding="utf-8"))
    feats = man["features"]
    if "SALARY_LOG" in feats:
        j = feats.index("SALARY_LOG")
        Z = train["Z"].astype(np.float32)
        M = train["mask"].astype(np.float32)
        sal = np.where(M[:, j] > 0, Z[:, j], np.nan).astype(np.float32)

    if EMB_NPZ.exists():
        emb = np.load(EMB_NPZ, allow_pickle=False)
        E = emb["E"].astype(np.float32)
        if E.shape[0] != n:
            # Fall back to a compact PCA-ish slice of Z (first 48 cols)
            E = train["Z"].astype(np.float32)[:, :48]
    else:
        E = train["Z"].astype(np.float32)[:, :48]
    return E, seasons, names, pids, sal


def build_examples(seq, E, seasons, names, pids, sal, mpg_gp):
    row_index = seq["row_index"]
    length = seq["length"]
    next_mpg = seq["next_mpg"]
    next_gp = seq["next_gp"]
    next_mask = seq["next_mask"]

    # Per-step availability aux (injury proxy): scaled to ~unit range
    n_rows = E.shape[0]
    zeros = np.zeros(n_rows, dtype=np.float32)
    aux = np.stack(
        [
            np.asarray(seq["aux_mpg"], dtype=np.float32) / 36.0 if "aux_mpg" in seq.files else zeros,
            np.asarray(seq["aux_gp_pct"], dtype=np.float32) if "aux_gp_pct" in seq.files else zeros,
            np.asarray(seq["aux_miss_streak"], dtype=np.float32) / 40.0 if "aux_miss_streak" in seq.files else zeros,
            np.asarray(seq["aux_streak_known"], dtype=np.float32) if "aux_streak_known" in seq.files else zeros,
        ],
        axis=1,
    )
    E_in = np.concatenate([E, aux], axis=1).astype(np.float32)

    xs, y_delta, tip_mpg, tip_gp, splits, tip_rows, tip_sal = (
        [],
        [],
        [],
        [],
        [],
        [],
        [],
    )
    for ci in range(len(length)):
        L = int(length[ci])
        idxs = [int(row_index[ci, t]) for t in range(L) if int(row_index[ci, t]) >= 0]
        if len(idxs) < 2:
            continue
        for t in range(len(idxs) - 1):
            tip = idxs[t]
            if float(next_mask[tip]) < 0.5:
                continue
            key = (int(pids[tip]), str(seasons[tip]))
            cur_mpg, cur_gp = mpg_gp.get(key, (0.0, 0.0))
            if cur_mpg <= 0 and cur_gp <= 0:
                continue
            tgt_mpg = float(next_mpg[tip])
            tgt_gp = float(next_gp[tip])
            prefix = idxs[: t + 1]
            xs.append(E_in[prefix])
            y_delta.append([tgt_mpg - cur_mpg, tgt_gp - cur_gp])
            tip_mpg.append(cur_mpg)
            tip_gp.append(cur_gp)
            splits.append(eval_split(str(seasons[tip])))
            tip_rows.append(tip)
            tip_sal.append(float(sal[tip]) if not math.isnan(float(sal[tip])) else float("nan"))
    return (
        xs,
        np.asarray(y_delta, dtype=np.float32),
        np.asarray(tip_mpg, dtype=np.float32),
        np.asarray(tip_gp, dtype=np.float32),
        splits,
        tip_rows,
        tip_sal,
    )


def pad_batch(seqs: list[np.ndarray], device: str):
    lengths = torch.tensor([s.shape[0] for s in seqs], dtype=torch.long)
    d = seqs[0].shape[1]
    T = int(lengths.max())
    B = len(seqs)
    x = torch.zeros(B, T, d, device=device)
    for i, s in enumerate(seqs):
        x[i, : s.shape[0]] = torch.tensor(s, device=device)
    return x, lengths.to(device)


def r2_score(pred: np.ndarray, target: np.ndarray) -> float:
    ss_res = float(((pred - target) ** 2).sum())
    ss_tot = float(((target - target.mean()) ** 2).sum())
    if ss_tot <= 1e-12:
        return 0.0
    return 1.0 - ss_res / ss_tot


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--batch", type=int, default=128)
    ap.add_argument("--lr", type=float, default=8e-4)
    ap.add_argument("--hid", type=int, default=48)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--patience", type=int, default=6)
    args = ap.parse_args()

    if not SEQ_NPZ.exists():
        raise SystemExit("missing career_sequences.npz — run build_career_context.py")

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")  # auto: GPU on personal local (CUDA avail), CPU in Hatch VM

    seq = np.load(SEQ_NPZ, allow_pickle=False)
    E, seasons, names, pids, sal = load_row_features()
    mpg_gp = load_mpg_gp()
    xs, y_delta, tip_mpg, tip_gp, splits, tip_rows, tip_sal = build_examples(seq, E, seasons, names, pids, sal, mpg_gp)
    y_abs = np.stack([tip_mpg + y_delta[:, 0], tip_gp + y_delta[:, 1]], axis=1)
    print(
        f"career examples={len(xs)} device={device} d_in={xs[0].shape[1]} (residual dMPG/dGP)",
        flush=True,
    )

    train_i = [i for i, s in enumerate(splits) if s == "train"]
    val_i = [i for i, s in enumerate(splits) if s == "val"]
    test_i = [i for i, s in enumerate(splits) if s == "test"]
    mu = y_delta[train_i].mean(axis=0)
    sd = y_delta[train_i].std(axis=0)
    sd = np.where(sd < 1e-6, 1.0, sd).astype(np.float32)
    y_z = (y_delta - mu) / sd

    model = CareerGRU(xs[0].shape[1], d_hid=args.hid, d_out=2).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=2e-4)

    def run_epoch(indices: list[int], train: bool) -> float:
        model.train(train)
        total, n_b = 0.0, 0
        order = indices[:]
        if train:
            np.random.shuffle(order)
        for start in range(0, len(order), args.batch):
            bi = order[start : start + args.batch]
            x, lengths = pad_batch([xs[i] for i in bi], device)
            y = torch.tensor(y_z[bi], device=device)
            with torch.set_grad_enabled(train):
                pred = model(x, lengths)
                loss = F.smooth_l1_loss(pred, y)
                if train:
                    opt.zero_grad(set_to_none=True)
                    loss.backward()
                    nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                    opt.step()
            total += float(loss)
            n_b += 1
        return total / max(1, n_b)

    best_val = float("inf")
    bad = 0
    history = []
    for ep in range(1, args.epochs + 1):
        tr = run_epoch(train_i, True)
        va = run_epoch(val_i, False) if val_i else tr
        history.append({"epoch": ep, "train": tr, "val": va})
        if va < best_val - 1e-4:
            best_val = va
            bad = 0
            torch.save(
                {
                    "model": model.state_dict(),
                    "mu": mu,
                    "sd": sd,
                    "hid": args.hid,
                    "seed": args.seed,
                    "mode": "residual",
                },
                OUT_PT,
            )
        else:
            bad += 1
        if ep % 5 == 0 or ep == 1:
            print(f"epoch {ep:3d}  train {tr:.4f}  val {va:.4f}", flush=True)
        if bad >= args.patience:
            print(f"early stop at epoch {ep} (patience={args.patience})", flush=True)
            break

    ckpt = safe_torch_load(OUT_PT, map_location=device)
    model.load_state_dict(ckpt["model"])
    model.eval()

    def predict_abs(indices: list[int]) -> np.ndarray:
        outs = []
        with torch.no_grad():
            for start in range(0, len(indices), args.batch):
                bi = indices[start : start + args.batch]
                x, lengths = pad_batch([xs[i] for i in bi], device)
                pred_dz = model(x, lengths).cpu().numpy()
                delta = pred_dz * sd + mu
                mpg = np.clip(tip_mpg[bi] + delta[:, 0], 0.0, 42.0)
                gp = np.clip(tip_gp[bi] + delta[:, 1], 0.0, 82.0)
                outs.append(np.stack([mpg, gp], axis=1))
        return np.concatenate(outs, axis=0) if outs else np.zeros((0, 2), dtype=np.float32)

    def split_metrics(indices: list[int]) -> dict:
        if not indices:
            return {"rows": 0}
        pred = predict_abs(indices)
        tgt = y_abs[indices]
        persist = np.stack([tip_mpg[indices], tip_gp[indices]], axis=1)
        return {
            "rows": len(indices),
            "mpg_r2": round(r2_score(pred[:, 0], tgt[:, 0]), 4),
            "gp_r2": round(r2_score(pred[:, 1], tgt[:, 1]), 4),
            "mpg_r2_persist": round(r2_score(persist[:, 0], tgt[:, 0]), 4),
            "gp_r2_persist": round(r2_score(persist[:, 1], tgt[:, 1]), 4),
            "mpg_mae": round(float(np.abs(pred[:, 0] - tgt[:, 0]).mean()), 3),
            "gp_mae": round(float(np.abs(pred[:, 1] - tgt[:, 1]).mean()), 3),
            "mpg_mae_persist": round(float(np.abs(persist[:, 0] - tgt[:, 0]).mean()), 3),
            "gp_mae_persist": round(float(np.abs(persist[:, 1] - tgt[:, 1]).mean()), 3),
        }

    report = {
        "method": "CareerGRU residual: next = tip + Δ(MPG,GP); clip MPG≤42 GP≤82",
        "n_examples": len(xs),
        "n_train": len(train_i),
        "n_val": len(val_i),
        "n_test": len(test_i),
        "best_val_loss": round(best_val, 4),
        "metrics": {
            "train": split_metrics(train_i),
            "val": split_metrics(val_i),
            "test": split_metrics(test_i),
        },
        "history": history[-12:],
    }

    all_i = list(range(len(xs)))
    pred_all = predict_abs(all_i)
    # Value on predicted next box vs tip (improvement) + level
    mpg_mu, mpg_sd = (
        float(tip_mpg[train_i].mean()),
        float(tip_mpg[train_i].std()) or 1.0,
    )
    gp_mu, gp_sd = float(tip_gp[train_i].mean()), float(tip_gp[train_i].std()) or 1.0
    value = 0.6 * ((pred_all[:, 0] - mpg_mu) / mpg_sd) + 0.4 * ((pred_all[:, 1] - gp_mu) / gp_sd)
    surplus_rows = []
    for i, tip, s in zip(all_i, tip_rows, tip_sal, strict=False):
        if math.isnan(s):
            continue
        surplus_rows.append(
            {
                "name": str(names[tip]),
                "season": str(seasons[tip]),
                "pred_mpg": round(float(pred_all[i, 0]), 2),
                "pred_gp": round(float(pred_all[i, 1]), 1),
                "tip_mpg": round(float(tip_mpg[i]), 2),
                "tip_gp": round(float(tip_gp[i]), 1),
                "salary_z": round(float(s), 3),
                "surplus": round(float(value[i] - s), 3),
                "split": splits[i],
            }
        )
    surplus_rows.sort(key=lambda r: -r["surplus"])
    latest: dict[str, dict] = {}
    for r in surplus_rows:
        prev = latest.get(r["name"])
        if prev is None or r["season"] > prev["season"]:
            latest[r["name"]] = r
    board = sorted(latest.values(), key=lambda r: -r["surplus"])
    # Prefer recent seasons for the public research board
    recent = [r for r in board if str(r["season"]) >= "2022-23"]
    if len(recent) < 20:
        recent = board
    OUT_SURPLUS.write_text(
        json.dumps(
            {
                "method": (
                    "Research surplus = 0.6*z(pred_MPG)+0.4*z(pred_GP) − SALARY_LOG z. "
                    "Residual career head vs persistence; not calibrated trade advice. "
                    "Contract years/options still missing."
                ),
                "n": len(recent),
                "buy_low_top": recent[:40],
                "sell_high_top": list(reversed(recent[-40:])),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    report["surplus_export"] = str(OUT_SURPLUS)
    report["surplus_n"] = len(recent)

    OUT_REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    tm = report["metrics"]["test"]
    print(f"wrote {OUT_PT}", flush=True)
    print(f"wrote {OUT_REPORT}", flush=True)
    print(f"wrote {OUT_SURPLUS} n={len(recent)}", flush=True)
    print(
        f"test mpg_r2={tm.get('mpg_r2')} (persist {tm.get('mpg_r2_persist')})  "
        f"gp_r2={tm.get('gp_r2')} (persist {tm.get('gp_r2_persist')})",
        flush=True,
    )


if __name__ == "__main__":
    main()

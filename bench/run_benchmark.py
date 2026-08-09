"""Run the vector-bench multi-target gauntlet for hoops on REAL data, end to end.

Pipeline (all seeded, CPU, 2 threads):

 1. Load bench/data/hoops_nextseason.npz (built by bench/build_dataset.py from
    assets/vectors.json + Basketball-Reference caches).
 2. Impute NaNs and scale a few raw columns using TRAIN rows only. The six raw
    current-season stat columns (cur_per..cur_ast) stay in ORIGINAL units so
    the persistence rungs can read them.
 3. Train ONE multi-task MTNN (shared trunk -> 48-d shared embedding -> 6
    regression heads, masked MSE on train-z-scored labels) on TRAIN rows only
    (target season year <= 2023), early-stopping on VAL rows (2024..2025).
    Test rows (target year 2026) are never touched during training.
 4. For each registry target: build the leakage-safe temporal task via
    vector_bench.tasks.build_task_for_target (time key = target season year,
    cut = 2026), run the FULL default prediction ladder plus six raw
    current-stat persistence rungs, and slot the trained MTNN's test-row
    predictions in as the MTNN rung.
 5. Write the schema-1.1 domain report to bench/benchmark_report.json and
    (optionally) the exchange dataset for the unified transfer probe.

Baselines see the harness split (train = target year < 2026, i.e. our train
AND val rows); the MTNN fits on strictly less data (train only) and uses val
solely for early stopping. Nothing ever fits on test rows; all preprocessing
statistics come from train rows only.

Run:
  python bench/run_benchmark.py [--exchange-dir DIR] [--seed 7]
"""

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "2")

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "bench" / "data" / "hoops_nextseason.npz"
REPORT = ROOT / "bench" / "benchmark_report.json"

TARGETS = [
    "next_season_per",
    "next_season_win_shares",
    "next_season_bpm",
    "next_season_pts",
    "next_season_reb",
    "next_season_ast",
]
# feature column carrying the same stat's CURRENT-season raw value
CURRENT_COL = {
    "next_season_per": "cur_per",
    "next_season_win_shares": "cur_ws",
    "next_season_bpm": "cur_bpm",
    "next_season_pts": "cur_pts",
    "next_season_reb": "cur_reb",
    "next_season_ast": "cur_ast",
}

TRAIN_MAX_TY, VAL_TYS, TEST_TY = 2023, (2024, 2025), 2026

# ---- MTNN training config (reported verbatim in the PR) ---------------------
MTNN_CFG = dict(
    trunk=(128, 128),
    d_emb=48,
    dropout=0.10,
    heads=6,
    lr=1e-3,
    weight_decay=1e-4,
    batch=256,
    max_epochs=300,
    patience=25,
)


class ColumnRung:
    """Prediction rung that returns one raw feature column — the honest
    'this season's value of the same stat' persistence bar."""

    is_mtnn = False

    def __init__(self, col_idx: int, name: str):
        self.col = col_idx
        self.name = name

    def fit(self, X, y, **ctx):
        return self

    def predict(self, X, **ctx):
        return np.asarray(X, dtype=float)[:, self.col]


def train_mtnn(X_all, Y, M, train_idx, val_idx, seed):
    """Train the multi-task net; return raw-unit predictions for ALL rows.

    X_all : (n, d) fully standardized features (scaler fit on train rows only)
    Y     : (n, 6) labels z-scored per target on train labeled rows
    M     : (n, 6) label masks
    """
    import torch
    import torch.nn as nn

    torch.set_num_threads(2)
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)

    n, d = X_all.shape
    trunk_dims = MTNN_CFG["trunk"]
    d_emb = MTNN_CFG["d_emb"]

    class MTNNBench(nn.Module):
        """Compact multi-task adaptation of the repo's v5 MTNN: a shared
        trunk producing the 48-d shared embedding, with one linear
        regression head per target on that embedding."""

        def __init__(self):
            super().__init__()
            layers, prev = [], d
            for h in trunk_dims:
                layers += [nn.Linear(prev, h), nn.GELU(), nn.Dropout(MTNN_CFG["dropout"])]
                prev = h
            layers += [nn.Linear(prev, d_emb)]
            self.trunk = nn.Sequential(*layers)
            self.heads = nn.ModuleList([nn.Linear(d_emb, 1) for _ in range(len(TARGETS))])

        def forward(self, x):
            e = self.trunk(x)
            return torch.cat([h(e) for h in self.heads], dim=1), e

    model = MTNNBench()
    opt = torch.optim.Adam(model.parameters(), lr=MTNN_CFG["lr"], weight_decay=MTNN_CFG["weight_decay"])

    Xt = torch.tensor(X_all, dtype=torch.float32)
    Yt = torch.tensor(np.nan_to_num(Y), dtype=torch.float32)
    Mt = torch.tensor(M.astype(np.float32))

    def masked_mse(pred, ybatch, mbatch):
        se = (pred - ybatch) ** 2 * mbatch
        denom = mbatch.sum()
        return se.sum() / torch.clamp(denom, min=1.0)

    tr = np.asarray(train_idx)
    va = torch.tensor(np.asarray(val_idx), dtype=torch.long)
    best_val, best_state, best_epoch, since = np.inf, None, -1, 0
    for epoch in range(MTNN_CFG["max_epochs"]):
        model.train()
        perm = rng.permutation(len(tr))
        for s in range(0, len(tr), MTNN_CFG["batch"]):
            bidx = torch.tensor(tr[perm[s : s + MTNN_CFG["batch"]]], dtype=torch.long)
            opt.zero_grad()
            pred, _ = model(Xt[bidx])
            loss = masked_mse(pred, Yt[bidx], Mt[bidx])
            loss.backward()
            opt.step()
        model.eval()
        with torch.no_grad():
            vpred, _ = model(Xt[va])
            vloss = float(masked_mse(vpred, Yt[va], Mt[va]))
        if vloss < best_val - 1e-5:
            best_val, best_epoch, since = vloss, epoch, 0
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
        else:
            since += 1
            if since >= MTNN_CFG["patience"]:
                break
    model.load_state_dict(best_state)
    model.eval()
    with torch.no_grad():
        preds, emb = model(Xt)
    return (
        preds.numpy(),
        emb.numpy(),
        {"best_val_masked_mse": best_val, "best_epoch": best_epoch, "stopped_epoch": epoch},
    )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--exchange-dir", default=None, help="optional dir for exchange artifacts")
    args = ap.parse_args()

    from vector_bench.baselines import MTNNRung, default_prediction_ladder
    from vector_bench.registry import get_domain_spec
    from vector_bench.report import write_domain_report
    from vector_bench.runner import run_domain_benchmark
    from vector_bench.tasks import build_task_for_target

    z = np.load(DATA, allow_pickle=False)
    X_raw = z["X"].astype(np.float64)
    feature_names = [str(s) for s in z["feature_names"]]
    entity_id, target_year = z["entity_id"], z["target_year"]
    n, d = X_raw.shape

    train_rows = np.where(target_year <= TRAIN_MAX_TY)[0]
    val_rows = np.where((target_year >= VAL_TYS[0]) & (target_year <= VAL_TYS[-1]))[0]
    test_rows = np.where(target_year == TEST_TY)[0]

    # ---- harness features: impute NaN + scale, statistics from TRAIN only ---
    col = {nm: i for i, nm in enumerate(feature_names)}
    raw_cols = [col[c] for c in ("cur_per", "cur_ws", "cur_bpm", "cur_pts", "cur_reb", "cur_ast")]
    scale_cols = [col[c] for c in ("gp", "mpg", "salary_log", "age")]
    tr_mean = np.nanmean(X_raw[train_rows], axis=0)
    tr_std = np.nanstd(X_raw[train_rows], axis=0)
    X_h = X_raw.copy()
    nan_mask = np.isnan(X_h)
    X_h[nan_mask] = np.take(tr_mean, np.nonzero(nan_mask)[1])
    for c in scale_cols:
        X_h[:, c] = (X_h[:, c] - tr_mean[c]) / max(tr_std[c], 1e-8)
    X_h = X_h.astype(np.float64)

    # ---- MTNN input: everything standardized (train-only stats) -------------
    X_m = X_h.copy()
    for c in raw_cols:
        X_m[:, c] = (X_m[:, c] - tr_mean[c]) / max(tr_std[c], 1e-8)

    # ---- labels: z-score per target on TRAIN labeled rows --------------------
    Y = np.stack([z[f"y_{t}"] for t in TARGETS], axis=1).astype(np.float64)
    M = np.stack([z[f"label_mask_{t}"] for t in TARGETS], axis=1)
    y_mu, y_sd = np.zeros(len(TARGETS)), np.ones(len(TARGETS))
    Yz = Y.copy()
    for j in range(len(TARGETS)):
        lab = train_rows[M[train_rows, j]]
        y_mu[j], y_sd[j] = Y[lab, j].mean(), max(Y[lab, j].std(), 1e-8)
        Yz[:, j] = (Y[:, j] - y_mu[j]) / y_sd[j]

    t0 = time.time()
    preds_z, emb, fitinfo = train_mtnn(X_m, Yz, M, train_rows, val_rows, args.seed)
    train_secs = time.time() - t0
    preds = preds_z * y_sd[None, :] + y_mu[None, :]  # back to raw units
    print(f"MTNN trained in {train_secs:.1f}s: {fitinfo}")

    # ---- per-target tasks + rungs -------------------------------------------
    spec = get_domain_spec("hoops")
    ladder = list(default_prediction_ladder(seed=args.seed)) + [
        ColumnRung(col[f"cur_{s}"], f"persistence_current_{s}") for s in ("per", "ws", "bpm", "pts", "reb", "ast")
    ]
    tasks, mtnns, extra = {}, {}, {}
    for j, tname in enumerate(TARGETS):
        rows = np.where(M[:, j])[0]
        task = build_task_for_target(
            spec.target(tname),
            "hoops",
            X_h[rows],
            Y[rows, j],
            group_key=entity_id[rows],
            time_key=target_year[rows],
            time_cut=TEST_TY,
            seed=args.seed,
            extra_notes={
                "rows_labeled": str(len(rows)),
                "mtnn_train_rows": str(int(M[train_rows, j].sum())),
                "harness_train_years": f"target_year <= {VAL_TYS[-1]}",
                "test_year": str(TEST_TY),
            },
        )
        split = task.make_split()
        tasks[tname] = task
        mtnns[tname] = MTNNRung(predictions=preds[rows, j][split.test_idx])
        extra[tname] = dict(n_test=len(split.test_idx))

    dsc = run_domain_benchmark(spec, tasks, mtnns=mtnns, ladder=ladder)
    dsc.notes["mtnn_training"] = (
        f"one multi-task net, 6 heads on shared {MTNN_CFG['d_emb']}-d embedding; "
        f"trunk {MTNN_CFG['trunk']}, GELU, dropout {MTNN_CFG['dropout']}; Adam "
        f"lr={MTNN_CFG['lr']} wd={MTNN_CFG['weight_decay']} batch={MTNN_CFG['batch']}; "
        f"seed={args.seed}; max_epochs={MTNN_CFG['max_epochs']} early-stop patience "
        f"{MTNN_CFG['patience']} on val (target years {VAL_TYS[0]}..{VAL_TYS[-1]}) "
        f"masked MSE; best_epoch={fitinfo['best_epoch']} "
        f"best_val={fitinfo['best_val_masked_mse']:.5f}; train rows: target_year <= "
        f"{TRAIN_MAX_TY}; trained in {train_secs:.1f}s on CPU (2 threads)."
    )
    dsc.notes["baseline_data"] = (
        "baselines fit on the harness temporal-train side (target_year < 2026 = "
        "MTNN train + val); the MTNN never fits on val or test rows."
    )
    write_domain_report(dsc, REPORT)
    print(f"wrote {REPORT}")
    print(dsc.aggregate["headline"])
    for t in dsc.targets:
        v = t.scorecard.verdicts.get(t.primary_metric) if t.scorecard else None
        if v:
            print(
                f"  {t.target_name:28s} {t.primary_metric}: mtnn={v.mtnn_value:+.4f} "
                f"best_baseline={v.best_baseline} ({v.best_baseline_value:+.4f}) "
                f"beats={v.mtnn_beats_best_baseline}"
            )

    # ---- exchange artifacts ---------------------------------------------------
    if args.exchange_dir:
        ex = Path(args.exchange_dir)
        ex.mkdir(parents=True, exist_ok=True)
        arrays = dict(
            X=X_h.astype(np.float32),
            feature_names=np.array(feature_names),
            entity_id=entity_id,
            time_id=z["time_id"],
            target_year=target_year,
            split_train=train_rows,
            split_val=val_rows,
            split_test=test_rows,
            mtnn_embedding=emb.astype(np.float32),
        )
        for t in TARGETS:
            arrays[f"y_{t}"] = z[f"y_{t}"]
            arrays[f"label_mask_{t}"] = z[f"label_mask_{t}"]
        np.savez_compressed(ex / "dataset.npz", **arrays)
        sheet = json.loads((ROOT / "bench" / "data" / "datasheet.json").read_text())
        sheet["exchange_notes"] = (
            "X is harness-ready: NaNs imputed with TRAIN-row column means; gp/mpg/"
            "salary_log/age standardized on TRAIN rows; cur_* columns in raw units. "
            "mtnn_embedding = 48-d shared embedding from this run's trained MTNN "
            "(heads trained on hoops targets only). Split arrays index rows; time_id "
            "= feature season end-year; labels keyed to target_year = time_id + 1."
        )
        (ex / "datasheet.json").write_text(json.dumps(sheet, indent=2) + "\n")
        print(f"wrote exchange artifacts to {ex}")


if __name__ == "__main__":
    main()

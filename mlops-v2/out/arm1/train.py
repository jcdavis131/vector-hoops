#!/usr/bin/env python3
"""Arm 1 — structured pruning + EWC, numpy/stdlib only.

Deviation (documented, not hidden): Lane 4's train_mtnn_v7.py needs a
120-feature matrix and torch. Neither exists on this VM (no 120-col
file; torch is not installed, and installing it is out of scope).
This trainer therefore runs on the verified 73-column base in 9 groups
(manifest families), with a forecast-first tower MLP. It does NOT build
a twin head and has NO event-location head — see REPORT.md.

Protocol decisions (all fixed before seeing forward results):
- Person key = integer pid (npz player_id). The splits pair files
  contain exactly 1 pid-mismatched pair (Charles Smith, pid 293
  1996-97 -> pid 1520 1997-98, same name-slug person_id); it is
  EXCLUDED here. Train pairs = 8,933, not 8,934.
- Early stopping on an INTERNAL holdout: Fold-2 train pairs with
  input season 2021-22 (378 pairs), held out from gradients. Fold-2
  val inputs (2024-25) have the frozen test season (2025-26) as their
  forecast targets, so early-stopping on them would tune on test.
- Forward set = 2024-25 rows with a 2025-26 same-pid row (397 rows).
  This is ONE set, not two: "Fold-2 val" and "frozen test" coincide
  for the forecast objective (val inputs, test targets).
- Group ranking = leave-one-group-out (LOGO) retraining, internal-val
  MAE increase. Never magnitude alone.
- EWC: diagonal Fisher from the full model, normalised to mean 1 over
  retained params, penalty = (lam/2) * mean(F_norm * (theta-anchor)^2),
  lam = 10 fixed (not tuned on the forward set).
"""
import json, time, copy, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
MAT = ROOT / "mlops-v2/out/features73/train_matrix_73.npz"
MAN = ROOT / "mlops-v2/out/features73/feature_manifest_73.json"

GAME14 = ["PTS","AST","OREB","DREB","STL","BLK","TOV","FG3A","FGA","FTA",
          "FG3_PCT","FG_PCT","FT_PCT","PLUS_MINUS"]
GROUPS = ["shotmix","tracking","playmaking","efficiency","defense",
          "volume","rebounding","bio","market"]
TOWER_H, FUSION_H = 32, 64
TOWER_OUT = 16

# ---------------- data ----------------
def load():
    d = np.load(MAT)
    man = json.loads(MAN.read_text())
    feats = man["features"]
    fidx = {f: i for i, f in enumerate(feats)}
    groups = {g: [fidx[f] for f, fam in man["families"].items() if fam == g]
              for g in GROUPS}
    # keep manifest order within each group (dict order = feature order)
    groups = {g: sorted(v) for g, v in groups.items()}
    return d, feats, groups

def build_pairs(d, groups):
    """Return dicts of row-index pairs keyed by integer pid, consecutive seasons."""
    pid, seas = d["player_id"], d["season"]
    by_pid = {}
    for i, (p, s) in enumerate(zip(pid, seas)):
        by_pid.setdefault(int(p), {})[int(s[:4])] = i
    def season_rows(season):
        return [i for i, s in enumerate(seas) if s == season]
    return by_pid, season_rows

# ---------------- model ----------------
class TowerModel:
    def __init__(self, groups, out_dims=None, seed=0):
        self.groups = list(groups.keys())
        self.gidx = groups
        self.out_dims = out_dims or {g: TOWER_OUT for g in self.groups}
        rng = np.random.default_rng(seed)
        self.P = {}
        for g in self.groups:
            din = 2 * len(self.gidx[g])
            self.P[f"{g}_W1"] = rng.normal(0, np.sqrt(2.0 / din), (din, TOWER_H)).astype(np.float64)
            self.P[f"{g}_b1"] = np.zeros(TOWER_H)
            self.P[f"{g}_W2"] = rng.normal(0, np.sqrt(2.0 / TOWER_H), (TOWER_H, self.out_dims[g])).astype(np.float64)
            self.P[f"{g}_b2"] = np.zeros(self.out_dims[g])
        fin = sum(self.out_dims.values())
        self.P["Wf"] = rng.normal(0, np.sqrt(2.0 / fin), (fin, FUSION_H)).astype(np.float64)
        self.P["bf"] = np.zeros(FUSION_H)
        self.P["Wo"] = rng.normal(0, np.sqrt(2.0 / FUSION_H), (FUSION_H, 14)).astype(np.float64)
        self.P["bo"] = np.zeros(14)

    def n_params(self):
        return int(sum(v.size for v in self.P.values()))

    def group_inputs(self, Z, mask, rows):
        out = {}
        for g in self.groups:
            idx = self.gidx[g]
            x = Z[rows][:, idx] * mask[rows][:, idx]
            out[g] = np.concatenate([x, mask[rows][:, idx].astype(np.float64)], axis=1)
        return out

    def forward(self, ginputs, cache=False):
        towers, caches = [], {}
        for g in self.groups:
            x = ginputs[g]
            a1 = x @ self.P[f"{g}_W1"] + self.P[f"{g}_b1"]
            h1 = np.tanh(a1)
            a2 = h1 @ self.P[f"{g}_W2"] + self.P[f"{g}_b2"]
            h2 = np.tanh(a2)
            towers.append(h2)
            if cache:
                caches[g] = (x, h1, h2)
        concat = np.concatenate(towers, axis=1) if towers else np.zeros((len(next(iter(ginputs.values()))), 0))
        af = concat @ self.P["Wf"] + self.P["bf"]
        hf = np.tanh(af)
        pred = hf @ self.P["Wo"] + self.P["bo"]
        if cache:
            return pred, (caches, concat, hf)
        return pred

    def grads(self, ginputs, y, per_sample=False):
        """Mean MSE grads (per_sample=True returns per-sample grad dicts stacked)."""
        pred, (caches, concat, hf) = self.forward(ginputs, cache=True)
        B = y.shape[0]
        if not per_sample:
            dpred = 2.0 * (pred - y) / (B * 14)
            return self._backprop(ginputs, caches, concat, hf, dpred)
        # per-sample: dpred_i = 2*(pred_i-y_i)/14 (no 1/B); backprop per sample via einsum
        dpred = 2.0 * (pred - y) / 14.0
        return self._backprop_per_sample(ginputs, caches, concat, hf, dpred)

    def _backprop(self, ginputs, caches, concat, hf, dpred):
        G = {}
        G["Wo"] = hf.T @ dpred
        G["bo"] = dpred.sum(axis=0)
        dhf = dpred @ self.P["Wo"].T * (1 - hf ** 2)
        G["Wf"] = concat.T @ dhf
        G["bf"] = dhf.sum(axis=0)
        off = 0
        for g in self.groups:
            od = self.out_dims[g]
            d_h2 = dhf @ self.P["Wf"][off:off + od, :].T * (1 - caches[g][2] ** 2)
            G[f"{g}_W2"] = caches[g][1].T @ d_h2
            G[f"{g}_b2"] = d_h2.sum(axis=0)
            d_h1 = d_h2 @ self.P[f"{g}_W2"].T * (1 - caches[g][1] ** 2)
            G[f"{g}_W1"] = caches[g][0].T @ d_h1
            G[f"{g}_b1"] = d_h1.sum(axis=0)
            off += od
        return G

    def _backprop_per_sample(self, ginputs, caches, concat, hf, dpred):
        G = {}
        G["Wo"] = np.einsum("bi,bj->bij", hf, dpred)
        G["bo"] = dpred
        dhf = np.einsum("bj,kj->bk", dpred, self.P["Wo"]) * (1 - hf ** 2)
        G["Wf"] = np.einsum("bi,bj->bij", concat, dhf)
        G["bf"] = dhf
        off = 0
        for g in self.groups:
            od = self.out_dims[g]
            d_h2 = np.einsum("bk,jk->bj", dhf, self.P["Wf"][off:off + od, :]) * (1 - caches[g][2] ** 2)
            G[f"{g}_W2"] = np.einsum("bi,bj->bij", caches[g][1], d_h2)
            G[f"{g}_b2"] = d_h2
            d_h1 = np.einsum("bj,kj->bk", d_h2, self.P[f"{g}_W2"]) * (1 - caches[g][1] ** 2)
            G[f"{g}_W1"] = np.einsum("bi,bj->bij", caches[g][0], d_h1)
            G[f"{g}_b1"] = d_h1
            off += od
        return G

def predict(model, Z, mask, rows):
    return model.forward(model.group_inputs(Z, mask, rows))

def metrics(y_true, y_pred):
    err = y_pred - y_true
    mae = float(np.mean(np.abs(err)))
    rmse = float(np.sqrt(np.mean(err ** 2)))
    ss_res = np.sum(err ** 2, axis=0)
    ss_tot = np.sum((y_true - y_true.mean(axis=0)) ** 2, axis=0)
    r2 = [float(1 - ss_res[j] / ss_tot[j]) if ss_tot[j] > 0 else 0.0 for j in range(14)]
    return {"mae": mae, "rmse": rmse, "r2_mean": float(np.mean(r2)),
            "r2_per_stat": r2, "mae_per_stat": [float(np.mean(np.abs(err[:, j]))) for j in range(14)]}

def adam_train(model, Z, mask, tr_in, tr_y, va_in, va_y, seed, lr=0.003,
               max_epochs=80, patience=12, batch=256, ewc=None, quick=False):
    """ewc = (anchor_params, fisher_norm_dict, lam) or None. Early stop on val MAE."""
    rng = np.random.default_rng(seed + 999)
    m = {k: np.zeros_like(v) for k, v in model.P.items()}
    v = {k: np.zeros_like(v) for k, v in model.P.items()}
    best, best_mae, wait, hist = None, float("inf"), 0, []
    n = len(tr_in)
    epochs = 3 if quick else max_epochs
    for ep in range(epochs):
        order = rng.permutation(n)
        for s in range(0, n, batch):
            idx = order[s:s + batch]
            gi = model.group_inputs(Z, mask, tr_in[idx])
            G = model.grads(gi, tr_y[idx])
            if ewc is not None:
                anchor, fnorm, lam = ewc
                npar = sum(a.size for a in anchor.values())
                for k in G:
                    G[k] = G[k] + lam * fnorm[k] * (model.P[k] - anchor[k]) / npar
            step = ep * ((n + batch - 1) // batch) + s // batch + 1
            for k in model.P:
                m[k] = 0.9 * m[k] + 0.1 * G[k]
                v[k] = 0.999 * v[k] + 0.001 * (G[k] ** 2)
                mh = m[k] / (1 - 0.9 ** step)
                vh = v[k] / (1 - 0.999 ** step)
                model.P[k] -= lr * mh / (np.sqrt(vh) + 1e-8)
        va_pred = predict(model, Z, mask, va_in)
        va_mae = float(np.mean(np.abs(va_pred - va_y)))
        hist.append(va_mae)
        if va_mae < best_mae - 1e-6:
            best_mae, best, wait = va_mae, copy.deepcopy(model.P), 0
        else:
            wait += 1
            if wait >= patience:
                break
    if best is not None:
        model.P = best
    return {"epochs_run": len(hist), "best_internal_val_mae": best_mae, "val_mae_history": hist}

def fisher_diag(model, Z, mask, rows, y, chunk=256):
    """Diagonal empirical Fisher: mean over samples of squared per-sample grads."""
    acc = {k: np.zeros_like(v) for k, v in model.P.items()}
    n = 0
    for s in range(0, len(rows), chunk):
        idx = rows[s:s + chunk]
        gi = model.group_inputs(Z, mask, idx)
        G = model.grads(gi, y[s:s + chunk], per_sample=True)
        for k in acc:
            acc[k] += np.sum(G[k] ** 2, axis=0)
        n += len(idx)
    return {k: v / max(n, 1) for k, v in acc.items()}

def slice_params(full_P, groups, out_dims):
    """Build a pruned model's params from the full model (first out_dims per tower)."""
    P = {}
    for g in groups:
        od = out_dims[g]
        P[f"{g}_W1"] = full_P[f"{g}_W1"].copy()
        P[f"{g}_b1"] = full_P[f"{g}_b1"].copy()
        P[f"{g}_W2"] = full_P[f"{g}_W2"][:, :od].copy()
        P[f"{g}_b2"] = full_P[f"{g}_b2"][:od].copy()
    # fusion rows: full concat order = GROUPS order with 16 each; rebuild slice
    rows = []
    for g in GROUPS:
        if g in groups:
            start = GROUPS.index(g) * TOWER_OUT
            rows.append(slice(start, start + out_dims[g]))
    # Wf rows are concatenated in group order of the pruned model; rebuild in that order
    Wf_rows = []
    for g in groups:
        start = GROUPS.index(g) * TOWER_OUT
        Wf_rows.append(full_P["Wf"][start:start + out_dims[g], :])
    P["Wf"] = np.concatenate(Wf_rows, axis=0).copy() if Wf_rows else np.zeros((0, FUSION_H))
    P["bf"] = full_P["bf"].copy()
    P["Wo"] = full_P["Wo"].copy()
    P["bo"] = full_P["bo"].copy()
    return P

def prune_plan(ranking_asc, target_frac, full_params):
    """ranking_asc: least-useful first. Returns (dropped, out_dims, reduction).
    Whole-group drops first (without overshooting target+0.02); then halve
    the next group's output dim repeatedly until within 0.01 of target."""
    out_dims = {g: TOWER_OUT for g in GROUPS}
    dropped = []
    def reduction(dropped, out_dims):
        kept = [g for g in GROUPS if g not in dropped]
        m = TowerModel.__new__(TowerModel)
        # compute params directly
        tot = 0
        for g in kept:
            din = 2 * len(GIDX[g])
            tot += din * TOWER_H + TOWER_H + TOWER_H * out_dims[g] + out_dims[g]
        fin = sum(out_dims[g] for g in kept)
        tot += fin * FUSION_H + FUSION_H + FUSION_H * 14 + 14
        return 1 - tot / full_params, tot
    red, _ = reduction(dropped, out_dims)
    for g in ranking_asc:
        if red >= target_frac - 0.01:
            break
        # try whole-group drop
        trial_red, _ = reduction(dropped + [g], out_dims)
        if trial_red <= target_frac + 0.02:
            dropped.append(g)
            red = trial_red
        else:
            # halve this group's output dim instead
            while out_dims[g] > 4 and red < target_frac - 0.01:
                out_dims[g] //= 2
                red, _ = reduction(dropped, out_dims)
            break
    red, npar = reduction(dropped, out_dims)
    return dropped, out_dims, red, npar

# ---------------- main ----------------
def main():
    quick = "--quick" in sys.argv
    d, feats, groups = load()
    global GIDX
    GIDX = groups
    Z, mask = d["Z"].astype(np.float64), d["mask"]
    pid, seas, cluster = d["player_id"], d["season"], d["cluster"]
    g14 = [feats.index(f) for f in GAME14]
    by_pid = {}
    for i, (p, s) in enumerate(zip(pid, seas)):
        by_pid.setdefault(int(p), {})[int(s[:4])] = i
    # Fold-2 train rows: season start <=2023, excluding embargo 2023-24
    train_rows = [i for i, s in enumerate(seas) if int(s[:4]) <= 2023 and s != "2023-24"]
    train_set = set(train_rows)
    # Fold-2 train pairs (pid-keyed, consecutive, both endpoints in train)
    pairs = []
    for p, mp in by_pid.items():
        for y in sorted(mp):
            if y in mp and (y + 1) in mp and mp[y] in train_set and mp[y + 1] in train_set:
                pairs.append((mp[y], mp[y + 1]))
    pairs = sorted(pairs)
    print(f"fold2 train pairs (pid-keyed): {len(pairs)} (splits file: 8934 incl. 1 pid-mismatch)")
    internal = [(a, b) for a, b in pairs if seas[a] == "2021-22"]
    tr_pairs = [(a, b) for a, b in pairs if seas[a] != "2021-22"]
    print(f"internal val pairs: {len(internal)}; gradient pairs: {len(tr_pairs)}")
    tr_in = np.array([a for a, _ in tr_pairs]); tr_y = Z[[b for _, b in tr_pairs]][:, g14]
    va_in = np.array([a for a, _ in internal]); va_y = Z[[b for _, b in internal]][:, g14]
    # forward set
    fwd_in, fwd_y, fwd_idx = [], [], []
    for i, s in enumerate(seas):
        if s == "2024-25" and int(pid[i]) in by_pid and 2025 in by_pid[int(pid[i])]:
            fwd_in.append(i); fwd_y.append(Z[by_pid[int(pid[i])][2025]][g14]); fwd_idx.append(i)
    fwd_in = np.array(fwd_in); fwd_y = np.array(fwd_y)
    print(f"forward set: {len(fwd_in)}")
    train_persons = set(int(pid[i]) for i in train_rows)
    debut = {}
    for i, p in enumerate(pid):
        debut[int(p)] = min(debut.get(int(p), 9999), int(seas[i][:4]))
    results = {"protocol": {
        "train_pairs_pid_keyed": len(pairs), "splits_file_pairs": 8934,
        "excluded_pid_mismatch": [[59, 463]],
        "internal_val_pairs": len(internal), "gradient_pairs": len(tr_pairs),
        "forward_n": len(fwd_in),
        "forward_new_vs_fold2_train": int(sum(1 for i in fwd_in if int(pid[i]) not in train_persons)),
        "forward_debut_2024_25": int(sum(1 for i in fwd_in if debut[int(pid[i])] == 2024)),
    }}
    def eval_all(model, tag):
        out = {}
        out["internal_val"] = metrics(va_y, predict(model, Z, mask, va_in))
        out["forward"] = metrics(fwd_y, predict(model, Z, mask, fwd_in))
        # new-player slice on forward
        nw = np.array([k for k, i in enumerate(fwd_in) if int(pid[i]) not in train_persons])
        out["forward_new_player"] = metrics(fwd_y[nw], predict(model, Z, mask, fwd_in[nw])) if len(nw) else None
        out["forward_new_player_n"] = int(len(nw))
        # debut-era breakdown (forward)
        for era, lo, hi in [("debut_2000s", 1990, 2009), ("debut_2010s", 2010, 2019), ("debut_2020s", 2020, 2029)]:
            sel = np.array([k for k, i in enumerate(fwd_in) if lo <= debut[int(pid[i])] <= hi])
            out[f"forward_{era}"] = metrics(fwd_y[sel], predict(model, Z, mask, fwd_in[sel])) if len(sel) else None
            out[f"forward_{era}_n"] = int(len(sel))
        # cluster breakdown (forward, ids only — no labels in matrix)
        for c in sorted(set(cluster.tolist())):
            sel = np.array([k for k, i in enumerate(fwd_in) if cluster[i] == c])
            out[f"forward_cluster_{c}"] = metrics(fwd_y[sel], predict(model, Z, mask, fwd_in[sel])) if len(sel) else None
            out[f"forward_cluster_{c}_n"] = int(len(sel))
        # baselines (forward only, computed once per tag for carry-forward; league-mean fixed)
        cf = Z[fwd_in][:, g14]
        out["baseline_carry_forward"] = metrics(fwd_y, cf)
        lg = tr_y.mean(axis=0)
        out["baseline_league_mean"] = metrics(fwd_y, np.tile(lg, (len(fwd_in), 1)))
        # latency: median ms per 1000 rows, 100 repeats after warmup
        predict(model, Z, mask, fwd_in)
        ts = []
        for _ in range(5):
            t0 = time.perf_counter()
            for _ in range(100):
                predict(model, Z, mask, fwd_in)
            ts.append((time.perf_counter() - t0) / 100)
        med = float(np.median(ts))
        # med is seconds per forward pass over len(fwd_in) rows, so
        # med/len*1000 is SECONDS per 1000 rows (not ms — label fixed
        # after the first run showed identical models 4x apart on the
        # tiny-workload timer). The verdict latency numbers come from
        # the post-hoc interleaved benchmark (bench_latency.py), not
        # from this in-run timer.
        out["latency_s_per_1000_rows"] = med / len(fwd_in) * 1000
        out["n_params"] = model.n_params()
        out["model_size_bytes_float32"] = model.n_params() * 4
        results[tag] = out
        print(f"{tag}: params={model.n_params()} fwdMAE={out['forward']['mae']:.4f} "
              f"fwdR2={out['forward']['r2_mean']:.3f} lat={out['latency_s_per_1000_rows']:.4f}s/1k")
        (OUT / "checkpoints").mkdir(exist_ok=True)
        np.savez(OUT / "checkpoints" / f"{tag}.npz",
                 **{k: v for k, v in model.P.items()},
                 groups=np.array(model.groups),
                 out_dims=np.array([model.out_dims[g] for g in model.groups]))
        return out
    def train_model(group_subset, seed, out_dims=None):
        m = TowerModel({g: groups[g] for g in group_subset}, out_dims=out_dims, seed=seed)
        t0 = time.time()
        info = adam_train(m, Z, mask, tr_in, tr_y, va_in, va_y, seed, quick=quick)
        info["wall_clock_s"] = time.time() - t0
        return m, info
    # ---- full models, 2 seeds ----
    full_models, full_info = {}, {}
    for seed in (0, 1):
        m, info = train_model(GROUPS, seed)
        full_models[seed], full_info[seed] = m, info
        eval_all(m, f"full_seed{seed}")
    results["full_train_info"] = full_info
    # ---- LOGO ranking, seed 0 ----
    logo = {}
    full0_val = results["full_seed0"]["internal_val"]["mae"]
    for g in GROUPS:
        sub = [x for x in GROUPS if x != g]
        m, _ = train_model(sub, 0)
        vm = metrics(va_y, predict(m, Z, mask, va_in))["mae"]
        logo[g] = {"internal_val_mae": vm, "contribution": vm - full0_val}
        print(f"LOGO -{g}: valMAE={vm:.4f} contrib={vm - full0_val:+.4f}")
    results["logo_seed0"] = logo
    ranking = sorted(GROUPS, key=lambda g: logo[g]["contribution"])
    results["ranking_ascending_contribution"] = ranking
    print("ranking (least useful first):", ranking)
    # ---- Fisher from full seed 0 (subset for speed) ----
    sub_rows = tr_in[:2048]; sub_y = tr_y[:2048]
    F = fisher_diag(full_models[0], Z, mask, sub_rows, sub_y)
    # ---- prune plans ----
    full_params = full_models[0].n_params()
    plans = {}
    for target, tag in [(0.30, "pruned30"), (0.50, "pruned50")]:
        dropped, out_dims, red, npar = prune_plan(ranking, target, full_params)
        plans[tag] = {"dropped": dropped, "out_dims": out_dims, "reduction": red, "n_params": npar}
        print(tag, "dropped", dropped, "out_dims", {k: v for k, v in out_dims.items() if v != 16},
              f"reduction={red:.3f} params={npar}")
    results["prune_plans"] = plans
    def run_pruned(plan, seed, tag, base_model):
        kept = [g for g in GROUPS if g not in plan["dropped"]]
        out_dims = {g: plan["out_dims"][g] for g in kept}
        m = TowerModel({g: groups[g] for g in kept}, out_dims=out_dims, seed=seed)
        # init from full model slices
        P = slice_params(base_model.P, kept, out_dims)
        m.P = P
        anchor = copy.deepcopy(P)
        # Fisher slices, normalised
        Fs = {}
        for g in kept:
            od = out_dims[g]
            Fs[f"{g}_W1"] = F[f"{g}_W1"]
            Fs[f"{g}_b1"] = F[f"{g}_b1"]
            Fs[f"{g}_W2"] = F[f"{g}_W2"][:, :od]
            Fs[f"{g}_b2"] = F[f"{g}_b2"][:od]
        # fusion Fisher rows
        rows = []
        for g in kept:
            start = GROUPS.index(g) * TOWER_OUT
            rows.append(F["Wf"][start:start + out_dims[g], :])
        Fs["Wf"] = np.concatenate(rows, axis=0)
        Fs["bf"], Fs["Wo"], Fs["bo"] = F["bf"], F["Wo"], F["bo"]
        meanF = float(np.mean(np.concatenate([v.ravel() for v in Fs.values()]))) or 1.0
        Fn = {k: v / meanF for k, v in Fs.items()}
        t0 = time.time()
        info = adam_train(m, Z, mask, tr_in, tr_y, va_in, va_y, seed, lr=0.001,
                          max_epochs=20, patience=6, ewc=(anchor, Fn, 10.0), quick=quick)
        info["wall_clock_s"] = time.time() - t0
        eval_all(m, tag)
        results[f"{tag}_train_info"] = info
        return m
    for seed in (0, 1):
        run_pruned(plans["pruned30"], seed, f"pruned30_seed{seed}", full_models[seed])
    run_pruned(plans["pruned50"], 0, "pruned50_seed0", full_models[0])
    # ---- random control, seed 0, same algorithm, random ranking ----
    rng = np.random.default_rng(2027)
    rand_rank = list(GROUPS); rng.shuffle(rand_rank)
    dropped, out_dims, red, npar = prune_plan(rand_rank, 0.30, full_params)
    rand_plan = {"dropped": dropped, "out_dims": out_dims, "reduction": red, "n_params": npar,
                 "random_ranking": rand_rank}
    results["random30_plan"] = rand_plan
    print("random30 dropped", dropped, f"reduction={red:.3f}")
    run_pruned(rand_plan, 0, "random30_seed0", full_models[0])
    with open(OUT / "results.json", "w") as f:
        json.dump(results, f, indent=1)
    print("wrote", OUT / "results.json")

if __name__ == "__main__":
    main()

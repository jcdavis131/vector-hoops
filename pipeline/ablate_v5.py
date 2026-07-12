"""v5 architecture ablation — A/B/C, isolated (no promoted-asset writes).

Trains three configs with an IDENTICAL training loop, seed, and held-out
splits, then compares the metrics that matter for the v5 decision (§7 of
docs/MTNN_V5_DEEP_ARCHITECTURE.md):

  A_v4_control  — concat fusion, 1-block towers, linear heads  (≈ deployed v4)
  B_deep_concat — concat fusion, 2-block towers, MLP heads      (depth only)
  C_transformer — transformer fusion, 2-block towers, MLP heads (full v5)

Decision rule: ship C only if purity@20(C) ≥ purity@20(A)+0.02 AND next-profile
test RMSE improves, with recall@10 ≥ 0.99. If C≈B, transformer isn't earning
its cost. If neither beats A, keep v4.

Writes ONLY pipeline/data/ablation/. Never touches mtnn_best.pt,
embedding_v3.npz, mtnn_centroids.npz, or mtnn_report.json.

Run:  python pipeline/ablate_v5.py            (full: 35 epochs each)
      python pipeline/ablate_v5.py --quick    (12 epochs, smoke)
"""
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

import leakfree as LF  # same directory
import train_mtnn as T  # same directory

OUT = T.DATA_DIR / "ablation"

CONFIGS = {
    "A_v4_control": dict(
        fusion_mode="concat", d_tower=24, d_tower_hidden=96, d_emb=48,
        n_tower_blocks=1, mlp_heads=False),
    "B_deep_concat": dict(
        fusion_mode="concat", d_tower=32, d_tower_hidden=160, d_emb=64,
        n_tower_blocks=2, mlp_heads=True, d_head_hidden=64),
    "C_transformer": dict(
        fusion_mode="transformer", d_tower=32, d_tower_hidden=160, d_emb=64,
        n_tower_blocks=2, mlp_heads=True, d_head_hidden=64,
        d_model=96, n_fusion_layers=4, n_attn_heads=4),
}

SEED = 7
BATCH = 512
LR = 1.5e-3
TEMP = 0.08
DROP = 0.12
HARD_NEG = 0.3
PLAYER_W = 0.8
ARCH_W = 0.2
# Core multitask weights (the losses that drive the compared metrics; the
# masked scalar aux heads are omitted from the ablation loop since they do
# not materially affect purity / recall / next-profile).
W = dict(archetype=0.25, position=0.15, profile=0.12, next_profile=0.08, skills=0.18)


def resolve_device(pref: str = "auto") -> str:
    if pref == "cpu":
        return "cpu"
    if pref == "cuda" or (pref == "auto" and torch.cuda.is_available()):
        if not torch.cuda.is_available():
            raise SystemExit(
                "requested --device cuda but torch.cuda.is_available() is False — "
                "install a CUDA build of torch (see docs/MTNN_V5_DEEP_ARCHITECTURE.md).")
        return "cuda"
    return "cpu"


def train_one(name: str, cfg: dict, epochs: int, seed: int = SEED,
              device: str = "cpu", protocol: str = "legacy",
              split_mode: str = "player") -> dict:
    torch.manual_seed(seed)
    np.random.seed(seed)

    (Z, M, names, seasons, pids, clusters, positions, season_ids,
     manifest) = T.load_bundle()
    fams = T.family_slices(manifest)
    game_cols = T.game_feature_cols(manifest)
    game_z = torch.tensor(Z[:, game_cols], device=device)
    n_seasons = int(season_ids.max()) + 1

    pairs = T.adjacent_season_pairs(pids, seasons, names)
    pair_arr = np.array(pairs) if pairs else np.zeros((0, 2), int)
    next_idx = T.next_season_index(len(Z), pair_arr)

    # Leak-free (inductive) protocol: supervision only from train-split rows.
    # Val/test rows are still encoded, but never supervise anything.
    split = LF.build_split(names, seasons, mode=split_mode)
    if protocol == "leakfree":
        is_train = split == "train"
        clusters = LF.leakfree_clusters(Z[:, game_cols], is_train)
        train_pairs = LF.pairs_in_split(pair_arr, split, "train")
        next_idx_train = LF.restrict_next_idx_split(next_idx, split, "train")
        row_pool = np.where(is_train)[0]
    else:
        train_pairs = pair_arr
        next_idx_train = next_idx
        row_pool = np.arange(len(Z))
    lookup = {int(a): int(b) for a, b in train_pairs}
    lookup.update({int(b): int(a) for a, b in train_pairs})

    skill_g, skill_m, skill_keys, _ = T.load_skill_labels(names, seasons)
    skill_t = torch.tensor(skill_g, device=device)
    skillm_t = torch.tensor(skill_m, device=device)
    arch_t = torch.tensor(clusters, device=device)
    pos_t = torch.tensor(positions, device=device)
    pos_mask = pos_t >= 0
    seas_t = torch.tensor(season_ids, device=device)

    xs, ms = T.split_by_family(Z, M, fams, device)
    model = T.MTNN(
        {f: len(c) for f, c in fams.items()}, n_seasons,
        n_game=len(game_cols), n_skills=len(skill_keys), **cfg).to(device)
    n_params = sum(p.numel() for p in model.parameters())

    opt = torch.optim.AdamW(T.adamw_param_groups(model, 1e-4), lr=LR)
    steps = T.optimizer_steps_per_epoch(len(row_pool), BATCH, 1)
    total = max(1, steps * epochs)
    sched, _ = T.build_lr_scheduler(
        opt, schedule="onecycle", total_steps=total, epochs=epochs,
        warmup_pct=0.1, max_lr=LR, anneal_strategy="linear")

    n = len(Z)
    t0 = time.time()
    for ep in range(epochs):
        model.train()
        perm = np.random.permutation(row_pool)
        run_loss, nb_steps = 0.0, 0
        for s in range(0, len(row_pool), BATCH):
            idx = perm[s:s + BATCH]
            if len(idx) < 8:
                continue
            idx_t = torch.tensor(idx, device=device)
            partner = np.array([lookup.get(int(i), int(i)) for i in idx])
            partner_t = torch.tensor(partner, device=device)
            xa, ma = T.batch_views(xs, ms, idx_t, drop_p=DROP)
            xb, mb = T.batch_views(xs, ms, partner_t, drop_p=DROP)
            za, out = model(xa, ma, seas_t[idx_t])
            zb, _ = model(xb, mb, seas_t[partner_t])
            loss = T.contrastive_loss(
                za, zb, mode="hybrid", temp=TEMP,
                pos_a=pos_t[idx_t], pos_b=pos_t[partner_t],
                hard_neg_boost=HARD_NEG, arch_labels=arch_t[idx_t],
                player_weight=PLAYER_W, arch_weight=ARCH_W)
            loss = loss + W["archetype"] * F.cross_entropy(out["archetype"], arch_t[idx_t])
            if pos_mask[idx_t].any():
                loss = loss + W["position"] * F.cross_entropy(
                    out["position"][pos_mask[idx_t]], pos_t[idx_t][pos_mask[idx_t]])
            loss = loss + W["profile"] * F.mse_loss(out["profile"], game_z[idx_t])
            nb = next_idx_train[idx]
            nv = nb >= 0
            if nv.any():
                nt = torch.tensor(nb[nv], device=device)
                nvt = torch.tensor(nv, device=device, dtype=torch.bool)
                loss = loss + W["next_profile"] * F.smooth_l1_loss(
                    out["next_profile"][nvt], game_z[nt])
            if "skills" in out:
                wm = skillm_t[idx_t]
                if wm.sum() > 0:
                    se = (out["skills"] - skill_t[idx_t]) ** 2
                    loss = loss + W["skills"] * (wm * se).sum() / wm.sum()
            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()
            run_loss += float(loss)
            nb_steps += 1
        if ep % 5 == 0 or ep == epochs - 1:
            print(f"  [{name}] epoch {ep:3d}  loss {run_loss / max(1, nb_steps):.4f}",
                  flush=True)

    # ---- eval (reseed so recall sampling is identical across configs) ----
    np.random.seed(seed)
    model.eval()
    with torch.no_grad():
        E = model.encode(xs, ms, seas_t).cpu().numpy().astype(np.float32)
        _, heads = model(xs, ms, seas_t)
    arch_logits = heads["archetype"].cpu().numpy().astype(np.float32)
    pos_logits = heads["position"].cpu().numpy().astype(np.float32)
    next_pred = heads["next_profile"].cpu().numpy().astype(np.float32)

    test_pairs = LF.pairs_in_split(pair_arr, split, "test")
    val_pairs = LF.pairs_in_split(pair_arr, split, "val")
    # Eval always uses the FULL next_idx: under leakfree those targets were
    # never trained on, so this is a genuine held-out score.
    npr = LF.next_profile_metrics(
        next_pred, Z[:, game_cols], next_idx, split,
        [manifest["features"][j] for j in game_cols])
    test_rows = np.where(split == "test")[0]
    is_test = split == "test"
    return {
        "params": int(n_params),
        "epochs": epochs,
        "device": device,
        "protocol": protocol,
        "split_mode": split_mode,
        "train_rows": int(len(row_pool)),
        "train_pairs": int(len(train_pairs)),
        "test_rows": int(is_test.sum()),
        "test_pairs": int(len(test_pairs)),
        "test_recall_at_10": T.recall_at_k(E, test_pairs, 10),
        "val_recall_at_10": T.recall_at_k(E, val_pairs, 10),
        "purity_at_20": T.cross_era_archetype_purity(E, clusters, seasons),
        "purity_at_20_test": LF.purity_at_20(E, clusters, seasons, test_rows),
        "archetype_top1": T.classification_acc(arch_logits, clusters),
        "archetype_top1_test": T.classification_acc(arch_logits, clusters, is_test),
        "position_top1": T.classification_acc(pos_logits, positions, positions >= 0),
        "position_top1_test": T.classification_acc(
            pos_logits, positions, is_test & (positions >= 0)),
        "next_profile": npr,
        "seconds": round(time.time() - t0, 1),
    }


def _rmse(npr: dict, split: str):
    d = (npr or {}).get(split)
    return d["rmse_z"] if d else None


def verdict(res: dict) -> dict:
    a, b, c = res["A_v4_control"], res["B_deep_concat"], res["C_transformer"]
    pa, pc = a["purity_at_20"] or 0, c["purity_at_20"] or 0
    ra_test = _rmse(a["next_profile"], "test")
    rc_test = _rmse(c["next_profile"], "test")
    purity_gain = pc - pa
    reg_better = (rc_test is not None and ra_test is not None and rc_test < ra_test)
    recall_ok = (c["test_recall_at_10"] or 0) >= 0.99
    ship_c = purity_gain >= 0.02 and reg_better and recall_ok
    # is the transformer earning its cost over depth-only B?
    pb = b["purity_at_20"] or 0
    transformer_earns = pc >= pb + 0.01
    return {
        "purity_gain_C_over_A": round(purity_gain, 4),
        "next_rmse_A_test": ra_test,
        "next_rmse_C_test": rc_test,
        "reg_better_C": reg_better,
        "recall_C_ok": recall_ok,
        "transformer_earns_over_B": transformer_earns,
        "ship_C": ship_c,
        "recommendation": (
            "SHIP v5 (config C: transformer fusion)" if ship_c and transformer_earns
            else "SHIP depth-only (config B); transformer not justified"
            if (b["purity_at_20"] or 0) >= pa + 0.02 and not ship_c
            else "KEEP v4 (config A); no config clears the gate"),
    }


def _mean_std(xs: list):
    xs = [x for x in xs if x is not None]
    if not xs:
        return None, None
    return round(float(np.mean(xs)), 4), round(float(np.std(xs)), 4)


def aggregate(per_seed: dict) -> dict:
    """per_seed: {config: {seed: metrics}} -> {config: aggregated}."""
    agg: dict = {}
    for cfg, seeds in per_seed.items():
        rows = list(seeds.values())
        pu_m, pu_s = _mean_std([r["purity_at_20"] for r in rows])
        put_m, put_s = _mean_std([r.get("purity_at_20_test") for r in rows])
        at_m, at_s = _mean_std([r.get("archetype_top1_test") for r in rows])
        a1_m, a1_s = _mean_std([r["archetype_top1"] for r in rows])
        p1_m, p1_s = _mean_std([r["position_top1"] for r in rows])
        nr_m, nr_s = _mean_std([_rmse(r["next_profile"], "test") for r in rows])
        rc_m, _ = _mean_std([r["test_recall_at_10"] for r in rows])
        agg[cfg] = {
            "params": rows[0]["params"], "n_seeds": len(rows),
            "protocol": rows[0].get("protocol"),
            "purity_at_20": {"mean": pu_m, "std": pu_s},
            "purity_at_20_test": {"mean": put_m, "std": put_s},
            "archetype_top1_test": {"mean": at_m, "std": at_s},
            "archetype_top1": {"mean": a1_m, "std": a1_s},
            "position_top1": {"mean": p1_m, "std": p1_s},
            "next_rmse_test": {"mean": nr_m, "std": nr_s},
            "test_recall_at_10": {"mean": rc_m},
        }
    return agg


def _pur(m: dict) -> float:
    """Honest purity: test-only when the leak-free protocol supplied it."""
    v = m.get("purity_at_20_test")
    return (v if v is not None else m.get("purity_at_20")) or 0.0


def confirm_decision(per_seed: dict, agg: dict) -> dict:
    """Paired A-vs-B decision across shared seeds."""
    if "A_v4_control" not in per_seed or "B_deep_concat" not in per_seed:
        return {"note": "confirmation needs both A and B"}
    seeds = sorted(set(per_seed["A_v4_control"]) & set(per_seed["B_deep_concat"]))
    pur_wins = reg_wins = 0
    per = []
    for s in seeds:
        a, b = per_seed["A_v4_control"][s], per_seed["B_deep_concat"][s]
        dp = _pur(b) - _pur(a)
        ra, rb = _rmse(a["next_profile"], "test"), _rmse(b["next_profile"], "test")
        dr = (rb - ra) if (ra is not None and rb is not None) else None
        pur_wins += int(dp > 0)
        reg_wins += int(dr is not None and dr < 0)
        per.append({"seed": s, "purity_gain": round(dp, 4),
                    "rmse_delta": round(dr, 4) if dr is not None else None})
    a_ag, b_ag = agg["A_v4_control"], agg["B_deep_concat"]
    pk = "purity_at_20_test" if (b_ag.get("purity_at_20_test") or {}).get("mean") is not None \
        else "purity_at_20"
    mean_pur_gain = round((b_ag[pk]["mean"] or 0) - (a_ag[pk]["mean"] or 0), 4)
    reg_better = (b_ag["next_rmse_test"]["mean"] or 9) < (a_ag["next_rmse_test"]["mean"] or 9)
    recall_ok = (b_ag["test_recall_at_10"]["mean"] or 0) >= 0.99
    promote = (mean_pur_gain > 0 and pur_wins >= (len(seeds) + 1) // 2
               and reg_better and recall_ok)
    return {
        "seeds": seeds,
        "per_seed": per,
        "mean_purity_gain_B_over_A": mean_pur_gain,
        "purity_win_seeds": f"{pur_wins}/{len(seeds)}",
        "rmse_win_seeds": f"{reg_wins}/{len(seeds)}",
        "recall_ok": recall_ok,
        "promote_B": promote,
        "recommendation": (
            "PROMOTE B recipe (deeper towers + MLP heads, concat fusion)"
            if promote else "KEEP v4 — B gains not consistent across seeds"),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true", help="12 epochs (smoke)")
    ap.add_argument("--epochs", type=int, default=None)
    ap.add_argument("--only", type=str, default="", help="comma-separated config names")
    ap.add_argument("--seeds", type=str, default=str(SEED),
                    help="comma-separated seeds; >1 triggers aggregation")
    ap.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto",
                    help="auto uses the local GPU when a CUDA torch build is present")
    ap.add_argument("--protocol", choices=("legacy", "leakfree"), default="leakfree",
                    help="leakfree = inductive; val/test rows never supervise (default)")
    ap.add_argument("--split", choices=("player", "temporal"), default="player",
                    help="player = grouped by player (no era shift, no cross-split "
                         "pairs, all seasons trained); temporal = forecasting claim")
    ap.add_argument("--w-next-profile", type=float, default=None,
                    help="override the next_profile loss weight (default 0.08); "
                         "tags output files so A/B runs do not collide")
    args = ap.parse_args()
    if args.w_next_profile is not None:
        W["next_profile"] = args.w_next_profile
    try:
        import sys
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    epochs = args.epochs if args.epochs else (12 if args.quick else 35)
    seeds = [int(s) for s in args.seeds.split(",") if s.strip()]
    device = resolve_device(args.device)
    if device == "cpu":
        torch.set_num_threads(max(1, os.cpu_count() or 1))
    print(f"device: {device}"
          + ("" if device == "cpu" else f" ({torch.cuda.get_device_name(0)})"), flush=True)
    OUT.mkdir(parents=True, exist_ok=True)

    only = {s.strip() for s in args.only.split(",") if s.strip()}
    configs = {k: v for k, v in CONFIGS.items() if not only or k in only}

    per_seed: dict = {name: {} for name in configs}
    for name, cfg in configs.items():
        for seed in seeds:
            tag = f"{name}#s{seed}"
            if args.w_next_profile is not None:
                tag += f"_np{args.w_next_profile}"
            print(f"=== {tag} ({epochs} epochs, {args.protocol}, "
                  f"{args.split}-split) ===", flush=True)
            m = train_one(name, cfg, epochs, seed=seed, device=device,
                          protocol=args.protocol, split_mode=args.split)
            per_seed[name][seed] = m
            (OUT / f"{tag}.json").write_text(json.dumps(m, indent=2), encoding="utf-8")
            pt = m.get("purity_at_20_test")
            at = m.get("archetype_top1_test")
            print(f"  -> params {m['params']:,} | train_rows {m.get('train_rows')} "
                  f"pairs {m.get('train_pairs')} | test_recall {m['test_recall_at_10']} | "
                  f"purity(all) {round(m['purity_at_20'],4) if m['purity_at_20'] else None} "
                  f"purity(test) {round(pt,4) if pt else None} | "
                  f"arch_top1(test) {round(at,4) if at else None} | "
                  f"next_test_rmse {_rmse(m['next_profile'],'test')} | "
                  f"{m['seconds']}s", flush=True)

    multi = len(seeds) > 1
    report: dict = {"epochs": epochs, "seeds": seeds, "per_seed": per_seed}
    if multi:
        report["aggregate"] = aggregate(per_seed)
        report["decision"] = confirm_decision(per_seed, report["aggregate"])
    elif set(CONFIGS).issubset(per_seed):
        report["verdict"] = verdict({k: v[seeds[0]] for k, v in per_seed.items()})
    (OUT / "ablation_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("\n=== SUMMARY ===")
    if multi:
        ag = report["aggregate"]
        print(f"{'config':<16}{'params':>10}{'purity@20(mean±std)':>24}{'arch1':>8}{'pos1':>8}{'nextRMSE':>10}{'recall':>8}")
        for name, a in ag.items():
            pu = a["purity_at_20"]
            pu_str = "{}±{}".format(pu["mean"], pu["std"])
            print(f"{name:<16}{a['params']:>10,}{pu_str:>24}"
                  f"{str(a['archetype_top1']['mean']):>8}{str(a['position_top1']['mean']):>8}"
                  f"{str(a['next_rmse_test']['mean']):>10}{str(a['test_recall_at_10']['mean']):>8}")
        print("\nDECISION:", json.dumps(report["decision"], indent=2))
    else:
        for name, seeds_d in per_seed.items():
            m = seeds_d[seeds[0]]
            print(f"{name:<16} purity@20 {m['purity_at_20']} recall {m['test_recall_at_10']}")
        if "verdict" in report:
            print("\nVERDICT:", json.dumps(report["verdict"], indent=2))
    print(f"\nwrote {OUT / 'ablation_report.json'}")


if __name__ == "__main__":
    main()

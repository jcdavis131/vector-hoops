"""v5 B-family architecture sweep — isolated, GPU-aware.

Grids depth/width/dim around the confirmed winner B (concat fusion + MLP
heads; transformer fusion was rejected in ablate_v5). Ranks candidates by
the metric that actually generalized in confirmation — held-out next-profile
test RMSE — with purity@20 as a tie-break and a recall@10 ≥ 0.99 floor.

Reuses ablate_v5.train_one (same loop/eval) and writes ONLY to
pipeline/data/ablation/. Never touches promoted assets.

Run:  pipeline/.venv/Scripts/python.exe pipeline/sweep_v5.py --device cuda
      # confirm a winner across seeds:
      pipeline/.venv/Scripts/python.exe pipeline/sweep_v5.py --device cuda \
          --only b3_h224_t48_d64 --seeds 7,13,21 --epochs 100
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np
import torch

import ablate_v5 as AB

OUT = AB.OUT

# concat fusion + MLP heads held fixed; vary depth/width/dim.
BASE = dict(fusion_mode="concat", mlp_heads=True, d_head_hidden=64)
GRID = {
    # name: (tower_blocks, tower_hidden, d_tower, d_emb)
    "b2_h160_t32_d48": (2, 160, 32, 48),   # zero-migration emb
    "b2_h160_t32_d64": (2, 160, 32, 64),   # confirmed B
    "b3_h160_t32_d64": (3, 160, 32, 64),   # deeper
    "b2_h224_t32_d64": (2, 224, 32, 64),   # wider hidden
    "b2_h160_t48_d64": (2, 160, 48, 64),   # wider tower
    "b2_h160_t32_d96": (2, 160, 32, 96),   # bigger embedding
    "b3_h224_t48_d64": (3, 224, 48, 64),   # deep + wide
    "b3_h160_t32_d96": (3, 160, 32, 96),   # deep + big embedding
}


def cfg_for(name: str) -> dict:
    blk, hid, tw, dim = GRID[name]
    return dict(BASE, n_tower_blocks=blk, d_tower_hidden=hid, d_tower=tw, d_emb=dim)


def rank_key(m: dict):
    """Lower is better: primary next-RMSE(test), tie-break −purity."""
    rmse = AB._rmse(m["next_profile"], "test")
    rmse = rmse if rmse is not None else 9.9
    pur = m["purity_at_20"] or 0.0
    return (rmse, -pur)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--seeds", type=str, default="7")
    ap.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    ap.add_argument("--only", type=str, default="", help="comma-separated grid names")
    ap.add_argument("--protocol", choices=("legacy", "leakfree"), default="leakfree")
    ap.add_argument("--split", choices=("player", "temporal"), default="player")
    args = ap.parse_args()
    try:
        import sys
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    seeds = [int(s) for s in args.seeds.split(",") if s.strip()]
    device = AB.resolve_device(args.device)
    if device == "cpu":
        torch.set_num_threads(max(1, os.cpu_count() or 1))
    print(f"device: {device}"
          + ("" if device == "cpu" else f" ({torch.cuda.get_device_name(0)})"), flush=True)
    OUT.mkdir(parents=True, exist_ok=True)

    only = {s.strip() for s in args.only.split(",") if s.strip()}
    names = [n for n in GRID if not only or n in only]
    multi = len(seeds) > 1

    per_seed: dict = {n: {} for n in names}
    for name in names:
        cfg = cfg_for(name)
        for seed in seeds:
            print(f"=== {name} seed {seed} ({args.epochs} ep, {args.protocol}, "
                  f"{args.split}-split) {cfg} ===", flush=True)
            m = AB.train_one(name, cfg, args.epochs, seed=seed, device=device,
                             protocol=args.protocol, split_mode=args.split)
            per_seed[name][seed] = m
            print(f"  -> params {m['params']:,} | recall {m['test_recall_at_10']} | "
                  f"purity {round(m['purity_at_20'],4) if m['purity_at_20'] else None} | "
                  f"next_rmse {AB._rmse(m['next_profile'],'test')} | {m['seconds']}s", flush=True)

    report: dict = {"epochs": args.epochs, "seeds": seeds, "grid": GRID, "per_seed": per_seed}

    if multi:
        report["aggregate"] = AB.aggregate(per_seed)
        (OUT / "sweep_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print("\n=== SWEEP (multi-seed aggregate) ===")
        ag = report["aggregate"]
        for name, a in sorted(ag.items(),
                              key=lambda kv: kv[1]["next_rmse_test"]["mean"] or 9.9):
            pu = a["purity_at_20"]; nr = a["next_rmse_test"]
            print(f"{name:<18} params {a['params']:>9,} | purity {pu['mean']}±{pu['std']} | "
                  f"next_rmse {nr['mean']}±{nr['std']} | recall {a['test_recall_at_10']['mean']}")
        return

    # single-seed ranking
    flat = {n: d[seeds[0]] for n, d in per_seed.items()}
    ranked = sorted(flat.items(), key=lambda kv: rank_key(kv[1]))
    report["ranking"] = [
        {"name": n,
         "params": m["params"],
         "recall": m["test_recall_at_10"],
         "purity_at_20": round(m["purity_at_20"], 4) if m["purity_at_20"] else None,
         "next_rmse_test": AB._rmse(m["next_profile"], "test"),
         "recall_ok": (m["test_recall_at_10"] or 0) >= 0.99}
        for n, m in ranked]
    (OUT / "sweep_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("\n=== SWEEP RANKING (best held-out next-RMSE first; recall≥0.99) ===")
    print(f"{'rank':<5}{'config':<18}{'params':>10}{'recall':>8}{'purity':>9}{'next_rmse':>11}")
    for i, r in enumerate(report["ranking"], 1):
        flag = "" if r["recall_ok"] else "  <recall<0.99>"
        print(f"{i:<5}{r['name']:<18}{r['params']:>10,}{str(r['recall']):>8}"
              f"{str(r['purity_at_20']):>9}{str(r['next_rmse_test']):>11}{flag}")
    top = next((r for r in report["ranking"] if r["recall_ok"]), None)
    if top:
        print(f"\nTOP CANDIDATE: {top['name']}  "
              f"(next_rmse {top['next_rmse_test']}, purity {top['purity_at_20']}, {top['params']:,} params)")
        print(f"confirm:  pipeline/.venv/Scripts/python.exe pipeline/sweep_v5.py "
              f"--device {device} --only {top['name']} --seeds 7,13,21 --epochs 100")
    print(f"\nwrote {OUT / 'sweep_report.json'}")


if __name__ == "__main__":
    main()

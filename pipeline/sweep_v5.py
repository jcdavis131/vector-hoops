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
import train_mtnn as T  # promotion_composite: the repo's canonical objective

OUT = AB.OUT

# concat fusion + MLP heads held fixed; vary depth/width/dim.
BASE = dict(fusion_mode="concat", mlp_heads=True, d_head_hidden=64)

# (tower_blocks, tower_hidden, d_tower, d_emb) + optional per-config overrides.
GRID = {
    # --- depth / width / embedding dim, concat fusion -----------------------
    "b1_h96_t24_d48":  (1, 96, 24, 48, {}),   # v4-scale control
    "b2_h160_t32_d48": (2, 160, 32, 48, {}),  # zero-migration emb
    "b2_h160_t32_d64": (2, 160, 32, 64, {}),  # "B"
    "b3_h160_t32_d64": (3, 160, 32, 64, {}),  # deeper
    "b2_h224_t32_d64": (2, 224, 32, 64, {}),  # wider hidden
    "b2_h160_t48_d64": (2, 160, 48, 64, {}),  # wider tower
    "b2_h160_t32_d96": (2, 160, 32, 96, {}),  # bigger embedding
    "b3_h224_t48_d64": (3, 224, 48, 64, {}),  # deep + wide
    "b3_h160_t32_d96": (3, 160, 32, 96, {}),  # deep + big embedding
    # --- transformer fusion: re-test under the leak-free protocol on the
    # cleaned matrix. The earlier "transformer hurts" result was measured with
    # leaked targets on a matrix with a dead tower, so it is not trustworthy.
    # Matched to b2_h160_t32_d64 so only the fusion differs.
    "tx_b2_h160_t32_d64": (2, 160, 32, 64, dict(
        fusion_mode="transformer", d_model=96, n_fusion_layers=4, n_attn_heads=4)),
    "tx_b2_h160_t32_d64_L2": (2, 160, 32, 64, dict(
        fusion_mode="transformer", d_model=96, n_fusion_layers=2, n_attn_heads=4)),

    # --- Sweep A: the decode-head width, pinned at 64 in every run above even
    # though the head MLP is what separated b1 from the v4 control.
    #
    # BASED ON b2 TOWERS (2 blocks / 160 / 32), not v4 towers. The obvious
    # design -- hold towers at v4 shape and vary the head -- cannot produce a
    # promotable model: v4-shaped towers are the purity-worst point in the arch
    # grid (b1 purity 0.6605), and the promotion gate is 0.6*purity, so every
    # such arm lands ~0.79 composite, below configs we already have. Re-based on
    # b2_h160_t32_d48 (composite 0.8027, dim 48 => zero migration), which asks
    # the question that decides what ships: does head width help ON TOP OF a
    # purity-competitive tower stack?  hb64_d48 == b2_h160_t32_d48 (control).
    "hb32_d48":  (2, 160, 32, 48, dict(d_head_hidden=32)),
    "hb64_d48":  (2, 160, 32, 48, dict(d_head_hidden=64)),
    "hb128_d48": (2, 160, 32, 48, dict(d_head_hidden=128)),
    "hb256_d48": (2, 160, 32, 48, dict(d_head_hidden=256)),
    # depth x head interaction: is the head win depth-dependent?
    # (ha64_d48 == b1, already measured; these two complete the 2x2.)
    "ha32_d48":  (1, 96, 24, 48, dict(d_head_hidden=32)),
    "ha128_d48": (1, 96, 24, 48, dict(d_head_hidden=128)),
    # embedding dim was the one width that moved BOTH objectives
    "hb128_d96": (2, 160, 32, 96, dict(d_head_hidden=128)),

    # --- Sweep B: the fusion bottleneck. At the v4 default (256) this single
    # Linear is ~57% of all parameters and had no flag until now, so it has
    # never been swept. Highest-information axis available. Also based on b2
    # towers; d_head_hidden is re-pinned to Sweep A's winner before running.
    "fh128_d48": (2, 160, 32, 48, dict(d_head_hidden=128, d_fusion_hidden=128)),
    "fh256_d48": (2, 160, 32, 48, dict(d_head_hidden=128, d_fusion_hidden=256)),
    "fh384_d48": (2, 160, 32, 48, dict(d_head_hidden=128, d_fusion_hidden=384)),
    "fh512_d48": (2, 160, 32, 48, dict(d_head_hidden=128, d_fusion_hidden=512)),
}

# Named batches so a run targets one question instead of re-mapping a plateau.
SWEEP_SETS = {
    "arch": ["b1_h96_t24_d48", "b2_h160_t32_d48", "b2_h160_t32_d64",
             "b3_h160_t32_d64", "b2_h224_t32_d64", "b2_h160_t48_d64",
             "b2_h160_t32_d96", "b3_h224_t48_d64", "b3_h160_t32_d96"],
    "transformer": ["tx_b2_h160_t32_d64", "tx_b2_h160_t32_d64_L2"],
    "head": ["hb32_d48", "hb64_d48", "hb128_d48", "hb256_d48",
             "ha32_d48", "ha128_d48", "hb128_d96"],
    "fusion": ["fh128_d48", "fh256_d48", "fh384_d48", "fh512_d48"],
}


def cfg_for(name: str) -> dict:
    blk, hid, tw, dim, extra = GRID[name]
    cfg = dict(BASE, n_tower_blocks=blk, d_tower_hidden=hid, d_tower=tw, d_emb=dim)
    cfg.update(extra)
    return cfg


def purity_of(m: dict) -> float:
    """Honest purity: test-only when the leak-free protocol supplied it."""
    v = m.get("purity_at_20_test")
    return (v if v is not None else m.get("purity_at_20")) or 0.0


def composite_of(m: dict) -> float:
    """The repo's canonical promotion objective (train_mtnn.promotion_composite).

    0.4*recall + 0.6*purity. Note next-profile RMSE appears in NO promotion
    gate -- ranking a sweep by RMSE optimizes something the pipeline ignores.
    """
    return T.promotion_composite(m.get("test_recall_at_10"), purity_of(m))


def rank_key(m: dict):
    """Sort key: repo composite DESC (primary), next-RMSE ASC (tie-break)."""
    rmse = AB._rmse(m["next_profile"], "test")
    rmse = rmse if rmse is not None else 9.9
    return (-composite_of(m), rmse)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--seeds", type=str, default="7")
    ap.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    ap.add_argument("--only", type=str, default="", help="comma-separated grid names")
    ap.add_argument("--set", type=str, default="", choices=("", *SWEEP_SETS),
                    help="named batch: arch | transformer | head | fusion")
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
    if args.set:
        only |= set(SWEEP_SETS[args.set])
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
            pt = m.get("purity_at_20_test")
            print(f"  -> params {m['params']:,} | recall {m['test_recall_at_10']} | "
                  f"purity(test) {round(pt,4) if pt else None} | "
                  f"next_rmse {AB._rmse(m['next_profile'],'test')} | {m['seconds']}s", flush=True)
            # Checkpoint after every config: a long sweep must survive a kill.
            (OUT / f"sweep_{name}#s{seed}.json").write_text(
                json.dumps(m, indent=2), encoding="utf-8")
            (OUT / "sweep_partial.json").write_text(
                json.dumps({"epochs": args.epochs, "protocol": args.protocol,
                            "split": args.split, "per_seed": per_seed}, indent=2),
                encoding="utf-8")

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
         "purity_test": round(purity_of(m), 4),
         "composite": round(composite_of(m), 4),
         "next_rmse_test": AB._rmse(m["next_profile"], "test")}
        for n, m in ranked]
    (OUT / "sweep_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("\n=== SWEEP RANKING (repo composite = 0.4*recall + 0.6*purity) ===")
    print("    next-RMSE is shown but is in NO promotion gate; it is a tie-break only.")
    print(f"{'rank':<5}{'config':<18}{'params':>10}{'recall':>8}{'purity':>9}"
          f"{'composite':>11}{'next_rmse':>11}")
    for i, r in enumerate(report["ranking"], 1):
        print(f"{i:<5}{r['name']:<18}{r['params']:>10,}{str(r['recall']):>8}"
              f"{r['purity_test']:>9.4f}{r['composite']:>11.4f}"
              f"{str(r['next_rmse_test']):>11}")
    if report["ranking"]:
        top = report["ranking"][0]
        rmse_best = min(report["ranking"], key=lambda r: r["next_rmse_test"] or 9.9)
        print(f"\nTOP by repo composite : {top['name']} "
              f"(composite {top['composite']}, purity {top['purity_test']}, "
              f"{top['params']:,} params)")
        if rmse_best["name"] != top["name"]:
            print(f"TOP by next-RMSE      : {rmse_best['name']} "
                  f"(rmse {rmse_best['next_rmse_test']}) -- DIFFERENT winner; "
                  "the objectives disagree, pick one deliberately")
        print("\nSingle seed. Confirm finalists before locking:")
        print(f"  pipeline/.venv/Scripts/python.exe pipeline/sweep_v5.py --device {device} "
              f"--only {top['name']} --seeds 7,13,21 --epochs 100")
    print(f"\nwrote {OUT / 'sweep_report.json'}")


if __name__ == "__main__":
    main()

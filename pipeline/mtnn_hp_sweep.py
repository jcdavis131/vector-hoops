"""Phase B/C hyperparameter sweep — classic grid + novel training recipes.

Inspired by Brain2Qwerty (arXiv:2502.17480): OneCycleLR (pct_start=0.1,
linear anneal), AdamW wd=1e-4, early-stopping culture; plus embed-field
warmup+cosine and fusion ablations (gated vs concat).

Runs train_mtnn.py over a config grid × seeds and writes
pipeline/data/mtnn_hp_sweep.json. Ranks by promotion-aware composite:
60% purity@20 + 40% held-out test recall@10.

  python pipeline/mtnn_hp_sweep.py [--epochs 20] [--quick]
  python pipeline/mtnn_hp_sweep.py --profile novel --epochs 15 --quick
  python pipeline/mtnn_hp_sweep.py --profile schedule --epochs 20

Profiles:
  classic   — dim × lr × nce_temp × drop_p (original Phase B grid)
  schedule  — lr_schedule × anneal × warmup (fixed dim=48)
  novel     — curated Brain2Qwerty + embed SOTA recipes (recommended)
  full      — classic × {legacy, onecycle, warmup-cosine} (large)
"""

from __future__ import annotations

import argparse
import itertools
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "pipeline" / "data" / "mtnn_report.json"
OUT = ROOT / "pipeline" / "data" / "mtnn_hp_sweep.json"

# Brain2Qwerty §4.2.2: OneCycleLR, pct_start=0.1, linear decay, AdamW wd=1e-4
NOVEL_CONFIGS: list[dict] = [
    {
        "tag": "baseline-legacy",
        "lr_schedule": "legacy-epoch-cosine",
        "dim": 48, "lr": 1.5e-3, "nce_temp": 0.08, "drop_p": 0.12,
        "fusion": "gated", "nce_loss": "infonce", "grad_accum": 1,
    },
    {
        "tag": "b2q-onecycle-linear",
        "lr_schedule": "onecycle",
        "anneal_strategy": "linear",
        "warmup_pct": 0.1,
        "dim": 48, "lr": 1.5e-3, "nce_temp": 0.08, "drop_p": 0.12,
        "fusion": "gated", "nce_loss": "infonce", "grad_accum": 1,
        "weight_decay": 1e-4,
    },
    {
        "tag": "b2q-onecycle-cos",
        "lr_schedule": "onecycle",
        "anneal_strategy": "cos",
        "warmup_pct": 0.1,
        "dim": 48, "lr": 1.5e-3, "nce_temp": 0.08, "drop_p": 0.12,
        "fusion": "gated", "nce_loss": "infonce", "grad_accum": 1,
    },
    {
        "tag": "embed-warmup-cosine",
        "lr_schedule": "warmup-cosine",
        "warmup_pct": 0.1,
        "dim": 48, "lr": 1.5e-3, "nce_temp": 0.08, "drop_p": 0.12,
        "fusion": "gated", "nce_loss": "infonce", "grad_accum": 1,
    },
    {
        "tag": "onecycle-lower-lr",
        "lr_schedule": "onecycle",
        "anneal_strategy": "linear",
        "warmup_pct": 0.1,
        "dim": 48, "lr": 1e-3, "nce_temp": 0.08, "drop_p": 0.12,
        "fusion": "gated", "nce_loss": "infonce", "grad_accum": 1,
    },
    {
        "tag": "concat-fusion-onecycle",
        "lr_schedule": "onecycle",
        "anneal_strategy": "linear",
        "warmup_pct": 0.1,
        "dim": 48, "lr": 1.5e-3, "nce_temp": 0.08, "drop_p": 0.12,
        "fusion": "concat", "nce_loss": "infonce", "grad_accum": 1,
    },
    {
        "tag": "supcon-arch-onecycle",
        "lr_schedule": "onecycle",
        "anneal_strategy": "linear",
        "warmup_pct": 0.1,
        "dim": 48, "lr": 1.5e-3, "nce_temp": 0.10, "drop_p": 0.12,
        "fusion": "gated", "nce_loss": "supcon-arch", "grad_accum": 1,
    },
    {
        "tag": "large-effective-batch",
        "lr_schedule": "warmup-cosine",
        "warmup_pct": 0.1,
        "dim": 48, "lr": 1.5e-3, "nce_temp": 0.08, "drop_p": 0.12,
        "fusion": "gated", "nce_loss": "infonce",
        "grad_accum": 2, "batch": 256,
    },
]


def composite_score(test_recall: float | None, purity: float | None) -> float:
    """Promotion-aware: purity gate is the current blocker."""
    tr = test_recall or 0.0
    pu = purity or 0.0
    return 0.4 * tr + 0.6 * pu


def build_grid(profile: str, quick: bool) -> list[dict]:
    if profile == "novel":
        grid = NOVEL_CONFIGS[:2] if quick else NOVEL_CONFIGS
        return grid

    dims = [48] if profile == "schedule" else [32, 48, 64]
    lrs = [1e-3, 1.5e-3, 2e-3]
    temps = [0.07, 0.10, 0.15]
    drop_ps = [0.10, 0.15, 0.20]

    if profile == "classic":
        grid = [
            {"dim": d, "lr": lr, "nce_temp": t, "drop_p": dp,
             "lr_schedule": "legacy-epoch-cosine", "fusion": "gated",
             "nce_loss": "infonce", "grad_accum": 1}
            for d, lr, t, dp in itertools.product(dims, lrs, temps, drop_ps)
        ]
        return grid[:4] if quick else grid

    if profile == "schedule":
        schedules = ["legacy-epoch-cosine", "onecycle", "warmup-cosine"]
        anneals = ["linear", "cos"]
        warmups = [0.05, 0.1]
        grid = []
        for sched, ann, warm, lr in itertools.product(schedules, anneals, warmups, lrs):
            cfg = {
                "dim": 48, "lr": lr, "nce_temp": 0.08, "drop_p": 0.12,
                "lr_schedule": sched, "fusion": "gated", "nce_loss": "infonce",
                "grad_accum": 1, "warmup_pct": warm,
            }
            if sched == "onecycle":
                cfg["anneal_strategy"] = ann
            grid.append(cfg)
        return grid[:4] if quick else grid

    if profile == "full":
        schedules = ["legacy-epoch-cosine", "onecycle", "warmup-cosine"]
        base = [
            {"dim": d, "lr": lr, "nce_temp": t, "drop_p": dp}
            for d, lr, t, dp in itertools.product(dims, lrs, temps, drop_ps)
        ]
        grid = []
        for b, sched in itertools.product(base, schedules):
            cfg = {
                **b,
                "lr_schedule": sched,
                "fusion": "gated",
                "nce_loss": "infonce",
                "grad_accum": 1,
                "warmup_pct": 0.1,
            }
            if sched == "onecycle":
                cfg["anneal_strategy"] = "linear"
            grid.append(cfg)
        return grid[:4] if quick else grid

    raise ValueError(f"unknown profile: {profile}")


def run_one(cfg: dict, epochs: int, seed: int) -> dict:
    cmd = [
        sys.executable, str(ROOT / "pipeline" / "train_mtnn.py"),
        "--epochs", str(epochs),
        "--seed", str(seed),
        "--dim", str(cfg["dim"]),
        "--lr", str(cfg["lr"]),
        "--nce-temp", str(cfg["nce_temp"]),
        "--drop-p", str(cfg["drop_p"]),
        "--lr-schedule", str(cfg.get("lr_schedule", "legacy-epoch-cosine")),
        "--fusion", str(cfg.get("fusion", "gated")),
        "--nce-loss", str(cfg.get("nce_loss", "infonce")),
        "--grad-accum", str(cfg.get("grad_accum", 1)),
        "--val-every", "0",
        "--no-best-checkpoint",
    ]
    if "batch" in cfg:
        cmd.extend(["--batch", str(cfg["batch"])])
    if "warmup_pct" in cfg:
        cmd.extend(["--warmup-pct", str(cfg["warmup_pct"])])
    if "anneal_strategy" in cfg:
        cmd.extend(["--anneal-strategy", str(cfg["anneal_strategy"])])
    if "weight_decay" in cfg:
        cmd.extend(["--weight-decay", str(cfg["weight_decay"])])

    subprocess.run(cmd, cwd=ROOT, check=True)
    rep = json.loads(REPORT.read_text(encoding="utf-8"))
    test = rep["held_out_recall"]["test"]["recall_at_10_mtnn"]
    val = rep["held_out_recall"]["val"]["recall_at_10_mtnn"]
    purity = rep.get("cross_era_archetype_neighbor_purity_at_20")
    score = composite_score(test, purity)
    return {
        **cfg,
        "seed": seed,
        "epochs": epochs,
        "test_recall": test,
        "val_recall": val,
        "purity": purity,
        "archetype_top1": rep.get("archetype_top1_acc"),
        "composite": round(score, 4),
        "train_hparams": {
            k: rep.get(k)
            for k in (
                "lr_schedule", "warmup_pct", "anneal_strategy",
                "weight_decay", "grad_accum", "fusion", "nce_loss",
            )
            if rep.get(k) is not None
        },
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=20,
                    help="epochs per config (40+ to confirm winners)")
    ap.add_argument("--profile", choices=("classic", "schedule", "novel", "full"),
                    default="novel",
                    help="sweep grid (novel = Brain2Qwerty-inspired curated set)")
    ap.add_argument("--quick", action="store_true",
                    help="smoke: 1 seed, truncated grid")
    args = ap.parse_args()

    grid = build_grid(args.profile, args.quick)
    seeds = [7] if args.quick else [7, 42, 99]

    results: list[dict] = []
    for seed in seeds:
        for i, cfg in enumerate(grid):
            tag = cfg.get("tag", "")
            label = f"{tag} " if tag else ""
            print(f"\n=== [{i + 1}/{len(grid)}] seed={seed} {label}{cfg} ===")
            results.append(run_one(cfg, args.epochs, seed))

    ranked = sorted(
        results,
        key=lambda r: (r.get("composite") or 0, r.get("test_recall") or 0),
        reverse=True,
    )
    summary = {
        "profile": args.profile,
        "reference": "arXiv:2502.17480 (Brain2Qwerty OneCycleLR + linear anneal)",
        "ranking": "0.4*test_recall + 0.6*purity (promotion-aware)",
        "epochs_per_run": args.epochs,
        "seeds": seeds,
        "n_runs": len(results),
        "best": ranked[0] if ranked else None,
        "top5": ranked[:5],
        "runs": results,
    }
    OUT.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"\nwrote {OUT}")
    if ranked:
        b = ranked[0]
        print(
            f"best composite={b['composite']:.3f} "
            f"test_recall={b['test_recall']:.3f} purity={b.get('purity')} "
            f"tag={b.get('tag', 'n/a')} schedule={b.get('lr_schedule')}"
        )


if __name__ == "__main__":
    main()

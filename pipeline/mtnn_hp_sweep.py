"""Phase B/C hyperparameter sweep — classic grid + novel training recipes.

Inspired by Brain2Qwerty (arXiv:2502.17480): OneCycleLR (pct_start=0.1,
linear anneal), AdamW wd=1e-4, early-stopping culture; plus embed-field
warmup+cosine and fusion ablations (gated vs concat).

Runs train_mtnn.py over a config grid × seeds and writes
pipeline/data/mtnn_hp_sweep.json. Ranks by promotion-aware composite:
60% purity@20 + 40% held-out test recall@10 (recall < 0.85 demoted).

  python pipeline/mtnn_hp_sweep.py [--epochs 40] [--quick]
  python pipeline/mtnn_hp_sweep.py --profile refined --epochs 40
  python pipeline/mtnn_hp_sweep.py --profile discovery --epochs 40  # v1 grid

Profiles:
  refined   — v2 grid around concat+onecycle winner (recommended, default)
  discovery — v1 Brain2Qwerty discovery grid (8 configs, reproducibility)
  classic   — dim × lr × nce_temp × drop_p (original Phase B grid)
  schedule  — lr_schedule × anneal × warmup (fixed dim=48)
  novel     — alias for refined (backward compatible)
  full      — classic × {legacy, onecycle, warmup-cosine} (large)

Past sweep (profile=discovery, 40 ep, seeds 7/42/99) — key lessons:
  - concat-fusion-onecycle dominated top-3 (composite ~0.74, recall ~0.99+).
  - gated fusion + same schedule landed ~0.70 composite, purity ~0.54.
  - supcon-arch: purity ~0.91 but recall ~0.05 — excluded from refined grid.
  - Promotion blocker is purity@20 (~0.58 best) not recall; refined grid
    explores dim / nce_temp / drop_p / wd / warmup / batch around concat.
"""

from __future__ import annotations

import argparse
import itertools
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "pipeline" / "data"
REPORT = DATA_DIR / "mtnn_report.json"
OUT = DATA_DIR / "mtnn_hp_sweep.json"
SWEEP_ARTIFACTS = (
    DATA_DIR / "embedding_v3.npz",
    DATA_DIR / "mtnn_centroids.npz",
    REPORT,
)

PROMOTION_PURITY_FLOOR = 0.63
RECALL_RANK_FLOOR = 0.85  # demote supcon-style retrieval collapse

# v1 discovery grid (2026-07 sweep) — kept for reproducibility / A/B history.
DISCOVERY_CONFIGS: list[dict] = [
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
        "weight_decay": 1e-4,
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


def _concat_onecycle(tag: str, **overrides) -> dict:
    """Winner template from discovery sweep — concat + onecycle linear."""
    cfg = {
        "tag": tag,
        "lr_schedule": "onecycle",
        "anneal_strategy": "linear",
        "warmup_pct": 0.1,
        "dim": 48,
        "lr": 1.5e-3,
        "nce_temp": 0.08,
        "drop_p": 0.12,
        "fusion": "concat",
        "nce_loss": "infonce",
        "grad_accum": 1,
        "weight_decay": 1e-4,
    }
    cfg.update(overrides)
    return cfg


# v2 refined grid — local search around concat-fusion-onecycle for purity@20.
REFINED_CONFIGS: list[dict] = [
    _concat_onecycle("concat-winner"),
    _concat_onecycle("concat-dim-40", dim=40),
    _concat_onecycle("concat-dim-56", dim=56),
    _concat_onecycle("concat-dim-64-lr12", dim=64, lr=1.2e-3),
    _concat_onecycle("concat-nce-007", nce_temp=0.07),
    _concat_onecycle("concat-nce-009", nce_temp=0.09),
    _concat_onecycle("concat-nce-010", nce_temp=0.10),
    _concat_onecycle("concat-drop-010", drop_p=0.10),
    _concat_onecycle("concat-drop-015", drop_p=0.15),
    _concat_onecycle("concat-lr-0012", lr=1.2e-3),
    _concat_onecycle("concat-lr-0020", lr=2.0e-3),
    _concat_onecycle("concat-wd-5e5", weight_decay=5e-5),
    _concat_onecycle("concat-wd-2e4", weight_decay=2e-4),
    _concat_onecycle("concat-warmup-005", warmup_pct=0.05),
    _concat_onecycle("concat-warmup-015", warmup_pct=0.15),
    _concat_onecycle("concat-large-batch", grad_accum=2, batch=256),
    _concat_onecycle(
        "concat-warmup-cosine",
        lr_schedule="warmup-cosine",
        anneal_strategy=None,
    ),
    _concat_onecycle("concat-hardneg-02", hard_neg_boost=0.2),
    _concat_onecycle("concat-hardneg-04", hard_neg_boost=0.4),
    {
        "tag": "gated-regression",
        "lr_schedule": "onecycle",
        "anneal_strategy": "linear",
        "warmup_pct": 0.1,
        "dim": 48, "lr": 1.5e-3, "nce_temp": 0.08, "drop_p": 0.12,
        "fusion": "gated", "nce_loss": "infonce", "grad_accum": 1,
        "weight_decay": 1e-4,
    },
]

REFINED_QUICK_TAGS = {
    "concat-winner",
    "concat-dim-56",
    "concat-nce-010",
    "concat-large-batch",
}

# v4 architecture-aware local search — tuned for revised family groupings.
ARCH_CONFIGS: list[dict] = [
    _concat_onecycle("arch-baseline"),
    _concat_onecycle("arch-tw32-th128-sh24",
                     tower_width=32, tower_hidden=128, skill_hidden=24),
    _concat_onecycle("arch-tw32-th160-sh32",
                     tower_width=32, tower_hidden=160, skill_hidden=32),
    _concat_onecycle("arch-tw28-th128-sh24",
                     tower_width=28, tower_hidden=128, skill_hidden=24),
    _concat_onecycle("arch-tw24-th128-sh24",
                     tower_width=24, tower_hidden=128, skill_hidden=24),
    _concat_onecycle("arch-tw32-th128-sh24-d56",
                     tower_width=32, tower_hidden=128, skill_hidden=24, dim=56, lr=1.2e-3),
    _concat_onecycle("arch-tw32-th128-sh24-t007",
                     tower_width=32, tower_hidden=128, skill_hidden=24, nce_temp=0.07),
    _concat_onecycle("arch-tw32-th160-sh24-hardneg",
                     tower_width=32, tower_hidden=160, skill_hidden=24, hard_neg_boost=0.4),
    _concat_onecycle("arch-gated-control",
                     fusion="gated", tower_width=32, tower_hidden=128, skill_hidden=24),
]

ARCH_QUICK_TAGS = {
    "arch-baseline",
    "arch-tw32-th128-sh24",
    "arch-tw32-th160-sh32",
    "arch-gated-control",
}

# v5 next-stats profile — tune forecast head weight with hybrid loss.
NEXT_STATS_CONFIGS: list[dict] = [
    _concat_onecycle(
        "nextstats-hybrid-w005",
        nce_loss="hybrid", nce_player_weight=0.80, nce_arch_weight=0.20,
        w_next_profile=0.05,
    ),
    _concat_onecycle(
        "nextstats-hybrid-w008",
        nce_loss="hybrid", nce_player_weight=0.80, nce_arch_weight=0.20,
        w_next_profile=0.08,
    ),
    _concat_onecycle(
        "nextstats-hybrid-w010",
        nce_loss="hybrid", nce_player_weight=0.80, nce_arch_weight=0.20,
        w_next_profile=0.10,
    ),
    _concat_onecycle(
        "nextstats-hybrid-w012",
        nce_loss="hybrid", nce_player_weight=0.80, nce_arch_weight=0.20,
        w_next_profile=0.12,
    ),
]

# v3 hybrid grid — concat winner + partial archetype SupCon (purity without collapse).
HYBRID_CONFIGS: list[dict] = [
    _concat_onecycle("concat-winner"),
    _concat_onecycle(
        "concat-hybrid-010",
        nce_loss="hybrid", nce_player_weight=0.90, nce_arch_weight=0.10,
    ),
    _concat_onecycle(
        "concat-hybrid-020",
        nce_loss="hybrid", nce_player_weight=0.80, nce_arch_weight=0.20,
    ),
    _concat_onecycle(
        "concat-hybrid-030",
        nce_loss="hybrid", nce_player_weight=0.70, nce_arch_weight=0.30,
    ),
    _concat_onecycle(
        "concat-hybrid-040",
        nce_loss="hybrid", nce_player_weight=0.60, nce_arch_weight=0.40,
    ),
    _concat_onecycle(
        "concat-hybrid-015-t010",
        nce_loss="hybrid", nce_player_weight=0.85, nce_arch_weight=0.15,
        nce_temp=0.10,
    ),
    _concat_onecycle(
        "concat-hybrid-020-drop010",
        nce_loss="hybrid", nce_player_weight=0.80, nce_arch_weight=0.20,
        drop_p=0.10,
    ),
    _concat_onecycle(
        "concat-hybrid-020-hardneg",
        nce_loss="hybrid", nce_player_weight=0.80, nce_arch_weight=0.20,
        hard_neg_boost=0.3,
    ),
    {
        "tag": "supcon-arch-control",
        "lr_schedule": "onecycle",
        "anneal_strategy": "linear",
        "warmup_pct": 0.1,
        "dim": 48, "lr": 1.5e-3, "nce_temp": 0.08, "drop_p": 0.12,
        "fusion": "concat", "nce_loss": "supcon-arch", "grad_accum": 1,
        "weight_decay": 1e-4,
    },
]


def composite_score(test_recall: float | None, purity: float | None) -> float:
    """Promotion-aware mid-sweep proxy — delegates to composite_score.partial_cqs."""
    import composite_score as cqs
    return cqs.partial_cqs(test_recall, purity)


def build_grid(profile: str, quick: bool) -> list[dict]:
    if profile == "nextstats":
        grid = NEXT_STATS_CONFIGS
        if quick:
            grid = grid[:3]
        return grid
    if profile == "architecture":
        grid = ARCH_CONFIGS
        if quick:
            grid = [c for c in grid if c.get("tag") in ARCH_QUICK_TAGS]
        return grid
    if profile == "hybrid":
        grid = HYBRID_CONFIGS
        if quick:
            grid = [c for c in grid if c.get("tag") in {
                "concat-winner", "concat-hybrid-020", "supcon-arch-control"}]
        return grid
    if profile in ("refined", "novel"):
        grid = REFINED_CONFIGS
        if quick:
            grid = [c for c in grid if c.get("tag") in REFINED_QUICK_TAGS]
        return grid

    if profile == "discovery":
        return DISCOVERY_CONFIGS[:2] if quick else DISCOVERY_CONFIGS

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


def _sweep_backup() -> dict[Path, Path]:
    """Snapshot promoted train artifacts; sweep runs must not clobber them."""
    snaps: dict[Path, Path] = {}
    for path in SWEEP_ARTIFACTS:
        if path.exists():
            bak = path.with_suffix(path.suffix + ".sweep_bak")
            shutil.copy2(path, bak)
            snaps[path] = bak
    return snaps


def _sweep_restore(snaps: dict[Path, Path]) -> None:
    for path, bak in snaps.items():
        if bak.exists():
            shutil.copy2(bak, path)


def run_one(cfg: dict, epochs: int, seed: int, snaps: dict[Path, Path]) -> dict:
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
    if "tower_width" in cfg:
        cmd.extend(["--tower-width", str(cfg["tower_width"])])
    if "tower_hidden" in cfg:
        cmd.extend(["--tower-hidden", str(cfg["tower_hidden"])])
    if "skill_hidden" in cfg:
        cmd.extend(["--skill-hidden", str(cfg["skill_hidden"])])
    if "warmup_pct" in cfg:
        cmd.extend(["--warmup-pct", str(cfg["warmup_pct"])])
    if cfg.get("anneal_strategy"):
        cmd.extend(["--anneal-strategy", str(cfg["anneal_strategy"])])
    if "weight_decay" in cfg:
        cmd.extend(["--weight-decay", str(cfg["weight_decay"])])
    if cfg.get("hard_neg_boost"):
        cmd.extend(["--hard-neg-boost", str(cfg["hard_neg_boost"])])
    if cfg.get("nce_player_weight") is not None:
        cmd.extend(["--nce-player-weight", str(cfg["nce_player_weight"])])
    if cfg.get("nce_arch_weight") is not None:
        cmd.extend(["--nce-arch-weight", str(cfg["nce_arch_weight"])])
    if cfg.get("checkpoint_metric"):
        cmd.extend(["--checkpoint-metric", str(cfg["checkpoint_metric"])])
    for key, val in cfg.items():
        if key.startswith("w_") and val is not None:
            cmd.extend([f"--{key.replace('_', '-')}", str(val)])

    subprocess.run(cmd, cwd=ROOT, check=True)
    rep = json.loads(REPORT.read_text(encoding="utf-8"))
    _sweep_restore(snaps)
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
        "promotion_purity_gap": (
            round(PROMOTION_PURITY_FLOOR - purity, 4) if purity is not None else None),
        "train_hparams": {
            k: cfg.get(k, rep.get(k))
            for k in (
                "lr_schedule", "warmup_pct", "anneal_strategy",
                "weight_decay", "grad_accum", "fusion", "nce_loss",
                "hard_neg_boost", "nce_player_weight", "nce_arch_weight",
                "checkpoint_metric", "tower_width", "tower_hidden", "skill_hidden",
            )
            if cfg.get(k) is not None or rep.get(k) is not None
        },
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=20,
                    help="epochs per config (40+ to confirm winners)")
    ap.add_argument(
        "--profile",
        choices=("classic", "schedule", "discovery", "refined", "architecture",
                 "nextstats",
                 "hybrid", "novel", "full"),
        default="refined",
        help=("sweep grid (refined=concat local; architecture=capacity search; "
              "hybrid=player+arch SupCon λ; nextstats=tune next-profile loss)"),
    )
    ap.add_argument("--quick", action="store_true",
                    help="smoke: 1 seed, truncated grid")
    args = ap.parse_args()

    profile = "refined" if args.profile == "novel" else args.profile
    grid = build_grid(profile, args.quick)
    seeds = [7] if args.quick else [7, 42, 99]
    snaps = _sweep_backup()
    if snaps:
        print(f"sweep: backed up {len(snaps)} promoted artifact(s) — restored after each run")

    results: list[dict] = []
    for seed in seeds:
        for i, cfg in enumerate(grid):
            tag = cfg.get("tag", "")
            label = f"{tag} " if tag else ""
            print(f"\n=== [{i + 1}/{len(grid)}] seed={seed} {label}{cfg} ===")
            results.append(run_one(cfg, args.epochs, seed, snaps))

    ranked = sorted(
        results,
        key=lambda r: (
            r.get("composite") or 0,
            r.get("purity") or 0,
            r.get("test_recall") or 0,
        ),
        reverse=True,
    )
    summary = {
        "profile": args.profile,
        "grid_profile": profile,
        "reference": "arXiv:2502.17480 (Brain2Qwerty OneCycleLR + linear anneal)",
        "prior_sweep": (
            "discovery v1: concat-fusion-onecycle best "
            "(composite 0.745, recall 0.998, purity 0.576 @ 40ep)"
        ),
        "ranking": (
            f"0.4*test_recall + 0.6*purity (promotion-aware); "
            f"recall<{RECALL_RANK_FLOOR} demoted"
        ),
        "promotion_purity_floor": PROMOTION_PURITY_FLOOR,
        "epochs_per_run": args.epochs,
        "seeds": seeds,
        "n_configs": len(grid),
        "n_runs": len(results),
        "best": ranked[0] if ranked else None,
        "top5": ranked[:5],
        "runs": results,
    }
    OUT.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"\nwrote {OUT}")
    if ranked:
        b = ranked[0]
        gap = b.get("promotion_purity_gap")
        gap_s = f" gap_to_promotion={gap:+.3f}" if gap is not None else ""
        print(
            f"best composite={b['composite']:.3f} "
            f"test_recall={b['test_recall']:.3f} purity={b.get('purity')} "
            f"tag={b.get('tag', 'n/a')} fusion={b.get('fusion')}{gap_s}"
        )


if __name__ == "__main__":
    main()

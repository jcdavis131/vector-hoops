"""Print (or run) full-scale train_mtnn.py from mtnn_hp_sweep.json best run.

After a sweep finishes:

  python pipeline/apply_hp_sweep.py
  python pipeline/apply_hp_sweep.py --epochs 150 --run

Reads pipeline/data/mtnn_hp_sweep.json (written by mtnn_hp_sweep.py).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SWEEP = ROOT / "pipeline" / "data" / "mtnn_hp_sweep.json"
TRAIN = ROOT / "pipeline" / "train_mtnn.py"


def train_cmd(cfg: dict, *, epochs: int, seed: int, val_every: int) -> list[str]:
    cmd = [
        sys.executable,
        str(TRAIN),
        "--epochs",
        str(epochs),
        "--seed",
        str(seed),
        "--dim",
        str(cfg["dim"]),
        "--lr",
        str(cfg["lr"]),
        "--nce-temp",
        str(cfg["nce_temp"]),
        "--drop-p",
        str(cfg["drop_p"]),
        "--lr-schedule",
        str(cfg.get("lr_schedule", "legacy-epoch-cosine")),
        "--fusion",
        str(cfg.get("fusion", "gated")),
        "--nce-loss",
        str(cfg.get("nce_loss", "infonce")),
        "--grad-accum",
        str(cfg.get("grad_accum", 1)),
        "--val-every",
        str(val_every),
        "--w-honors",
        str(cfg.get("w_honors", 0.05)),
    ]
    if cfg.get("batch") is not None:
        cmd.extend(["--batch", str(cfg["batch"])])
    if cfg.get("tower_width") is not None:
        cmd.extend(["--tower-width", str(cfg["tower_width"])])
    if cfg.get("tower_hidden") is not None:
        cmd.extend(["--tower-hidden", str(cfg["tower_hidden"])])
    if cfg.get("skill_hidden") is not None:
        cmd.extend(["--skill-hidden", str(cfg["skill_hidden"])])
    if "warmup_pct" in cfg:
        cmd.extend(["--warmup-pct", str(cfg["warmup_pct"])])
    if "anneal_strategy" in cfg:
        cmd.extend(["--anneal-strategy", str(cfg["anneal_strategy"])])
    if "weight_decay" in cfg:
        cmd.extend(["--weight-decay", str(cfg["weight_decay"])])
    if cfg.get("hard_neg_boost"):
        cmd.extend(["--hard-neg-boost", str(cfg["hard_neg_boost"])])
    if cfg.get("nce_player_weight") is not None:
        cmd.extend(["--nce-player-weight", str(cfg["nce_player_weight"])])
    if cfg.get("nce_arch_weight") is not None:
        cmd.extend(["--nce-arch-weight", str(cfg["nce_arch_weight"])])
    # v5 architecture knobs (sweep_v5 / ablate_v5). Absent -> v4 behaviour.
    if cfg.get("tower_blocks") is not None:
        cmd.extend(["--tower-blocks", str(cfg["tower_blocks"])])
    if cfg.get("mlp_heads"):
        cmd.append("--mlp-heads")
    if cfg.get("d_head_hidden") is not None:
        cmd.extend(["--d-head-hidden", str(cfg["d_head_hidden"])])
    if cfg.get("fusion_hidden") is not None:
        cmd.extend(["--fusion-hidden", str(cfg["fusion_hidden"])])
    if cfg.get("fusion") == "transformer":
        for key, flag in (
            ("d_model", "--d-model"),
            ("n_fusion_layers", "--n-fusion-layers"),
            ("n_attn_heads", "--n-attn-heads"),
        ):
            if cfg.get(key) is not None:
                cmd.extend([flag, str(cfg[key])])
    for key, val in cfg.items():
        if key.startswith("w_") and val is not None:
            cmd.extend([f"--{key.replace('_', '-')}", str(val)])
    cmd.extend(["--checkpoint-metric", str(cfg.get("checkpoint_metric", "composite"))])
    return cmd


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=150)
    ap.add_argument(
        "--seed",
        type=int,
        default=None,
        help="defaults to best run seed from sweep file",
    )
    ap.add_argument("--val-every", type=int, default=10)
    ap.add_argument("--run", action="store_true", help="execute train_mtnn.py")
    ap.add_argument(
        "--recipe",
        type=str,
        default="",
        help="JSON file with a frozen winner config; its keys override the sweep-best entry (promote-gate §3a)",
    )
    args = ap.parse_args()

    if not SWEEP.exists() and not args.recipe:
        raise SystemExit(f"missing {SWEEP} — run mtnn_hp_sweep.py first")

    best = {}
    if SWEEP.exists():
        best = json.loads(SWEEP.read_text(encoding="utf-8")).get("best") or {}
    if args.recipe:
        path = Path(args.recipe)
        if not path.exists():
            raise SystemExit(f"missing recipe file: {path}")
        override = json.loads(path.read_text(encoding="utf-8"))
        best = {**best, **override.get("config", override)}
        print(f"# recipe override: {path}")
    if not best:
        raise SystemExit("no config: sweep file has no best entry and no --recipe")

    seed = args.seed if args.seed is not None else int(best.get("seed", 7))
    cmd = train_cmd(best, epochs=args.epochs, seed=seed, val_every=args.val_every)

    print("# Best sweep run:")
    print(
        f"#   tag={best.get('tag')} composite={best.get('composite')} "
        f"test_recall={best.get('test_recall')} purity={best.get('purity')}"
    )
    print()
    line = " ".join(f'"{c}"' if " " in c and not c.endswith(".py") else c for c in cmd)
    print(line)

    if args.run:
        print("\n# starting training…\n", flush=True)
        subprocess.run(cmd, cwd=ROOT, check=True)


if __name__ == "__main__":
    main()

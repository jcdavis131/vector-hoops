"""Config sweep scored on generalization AND stability, not just headline recall.

Adds two axes the existing harnesses miss:

* `continuity_2023_24` — mean cosine between the same player's 2023-24 and
  2024-25 embeddings. The 2026-07-24 gated/narrow run scored test recall 0.000
  while val held 0.438; this metric read 0.182 against the shipping recipe's
  0.785 and localized the failure immediately. Retrieval recall alone hid it
  because test is only ~790 pairs.
* `continuity_min` — the worst same-player transition across every season
  boundary. A model that generalizes holds continuity flat across eras; one
  that memorizes the training window peaks inside it and falls off a cliff at
  the split boundary.

Each arm snapshots its own report + embedding so a run is never lost to the
next arm overwriting pipeline/data/.

Run:  python pipeline/sweep_stability.py --arms base,wide,deep --seeds 7
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "pipeline" / "data"
REPORT = DATA / "mtnn_report.json"
EMB = DATA / "embedding_v3.npz"
OUT = DATA / "sweep_stability"

# Shared recipe pieces. Arms below override only what they name, so every
# delta is attributable to the flags in that arm.
# fmt: off
COMMON = [
    "--val-every", "0",
    "--no-best-checkpoint",
    "--dim", "48",
    "--mlp-heads",
    "--d-head-hidden", "128",
    "--fusion-hidden", "256",
    "--nce-loss", "hybrid",
    "--nce-player-weight", "0.7",
    "--nce-arch-weight", "0.3",
    "--hard-neg-boost", "0.3",
    "--lr-schedule", "onecycle",
    "--warmup-pct", "0.1",
    "--anneal-strategy", "linear",
    "--batch", "512",
]

ARMS: dict[str, list[str]] = {
    # reference: the shipping v5 recipe
    "base":      ["--tower-width", "32", "--tower-hidden", "160", "--tower-blocks", "2",
                  "--fusion", "concat", "--drop-p", "0.12", "--weight-decay", "0.0001",
                  "--epochs", "20"],
    # capacity
    "wide":      ["--tower-width", "40", "--tower-hidden", "192", "--tower-blocks", "2",
                  "--fusion", "concat", "--drop-p", "0.12", "--weight-decay", "0.0001",
                  "--epochs", "20"],
    "deep":      ["--tower-width", "32", "--tower-hidden", "160", "--tower-blocks", "3",
                  "--fusion", "concat", "--drop-p", "0.12", "--weight-decay", "0.0001",
                  "--epochs", "20"],
    "big":       ["--tower-width", "48", "--tower-hidden", "224", "--tower-blocks", "2",
                  "--fusion", "concat", "--drop-p", "0.12", "--weight-decay", "0.0001",
                  "--epochs", "20"],
    # is gated fusion itself harmful, or only at the narrow width that collapsed?
    "gated_fair": ["--tower-width", "32", "--tower-hidden", "160", "--tower-blocks", "2",
                   "--fusion", "gated", "--drop-p", "0.12", "--weight-decay", "0.0001",
                   "--epochs", "20"],
    # the collapsed run's exact geometry, for the record
    "gated_narrow": ["--tower-width", "24", "--tower-hidden", "96", "--tower-blocks", "1",
                     "--fusion", "gated", "--drop-p", "0.12", "--weight-decay", "0.0001",
                     "--epochs", "40"],
    # regularization: does more of it flatten the era cliff?
    "reg_up":    ["--tower-width", "32", "--tower-hidden", "160", "--tower-blocks", "2",
                  "--fusion", "concat", "--drop-p", "0.2", "--weight-decay", "0.001",
                  "--epochs", "20"],
    # longer schedule on the good architecture
    "long":      ["--tower-width", "32", "--tower-hidden", "160", "--tower-blocks", "2",
                  "--fusion", "concat", "--drop-p", "0.12", "--weight-decay", "0.0001",
                  "--epochs", "40"],
    # capacity + regularization together
    "wide_reg":  ["--tower-width", "40", "--tower-hidden", "192", "--tower-blocks", "2",
                  "--fusion", "concat", "--drop-p", "0.2", "--weight-decay", "0.001",
                  "--epochs", "20"],
}
# fmt: on


def continuity(emb_path: Path) -> dict:
    """Same-player consecutive-season cosine, per transition."""
    d = np.load(emb_path, allow_pickle=True)
    E = d["E"].astype(np.float32)
    pid = np.array(d["player_id"])
    yr = np.array([int(str(s)[:4]) for s in d["season"]])
    by_player: dict[int, dict[int, int]] = defaultdict(dict)
    for i, (p, y) in enumerate(zip(pid, yr, strict=False)):
        by_player[int(p)][int(y)] = i
    per_year: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for mm in by_player.values():
        for y, i in mm.items():
            j = mm.get(y + 1)
            if j is not None:
                per_year[y].append((i, j))
    out = {}
    for y, prs in per_year.items():
        if len(prs) < 30:
            continue
        P = np.array(prs)
        out[y] = float((E[P[:, 0]] * E[P[:, 1]]).sum(1).mean())
    modern = [v for y, v in out.items() if y >= 2016]
    return {
        "by_transition": {str(k): round(v, 4) for k, v in sorted(out.items())},
        "continuity_2023_24": round(out.get(2023, float("nan")), 4),
        "continuity_min": round(min(modern), 4) if modern else None,
        "continuity_spread": round(max(modern) - min(modern), 4) if modern else None,
    }


def run_arm(name: str, flags: list[str], seed: int) -> dict:
    cmd = [
        sys.executable,
        str(ROOT / "pipeline" / "train_mtnn.py"),
        "--seed",
        str(seed),
        *COMMON,
        *flags,
    ]
    subprocess.run(cmd, cwd=ROOT, check=True, capture_output=True)
    rep = json.loads(REPORT.read_text(encoding="utf-8"))
    tag = f"{name}_s{seed}"
    dest = OUT / tag
    dest.mkdir(parents=True, exist_ok=True)
    shutil.copy(REPORT, dest / "mtnn_report.json")
    shutil.copy(EMB, dest / "embedding_v3.npz")
    h = rep["held_out_recall"]
    row = {
        "arm": name,
        "seed": seed,
        "test_recall": h["test"]["recall_at_10_mtnn"],
        "val_recall": h["val"]["recall_at_10_mtnn"],
        "all_recall": h["all"]["recall_at_10_mtnn"],
        "train_recall": h["train"]["recall_at_10_mtnn"],
        "purity": rep.get("cross_era_archetype_neighbor_purity_at_20"),
        "position_acc": rep.get("position_top1_acc"),
        "cqs": rep["composite"]["cqs"],
    }
    row.update(continuity(dest / "embedding_v3.npz"))
    return row


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--arms", default=",".join(ARMS))
    ap.add_argument("--seeds", default="7")
    ap.add_argument("--out", default="sweep_results.json")
    args = ap.parse_args()

    arms = [a for a in args.arms.split(",") if a]
    seeds = [int(s) for s in args.seeds.split(",") if s]
    unknown = [a for a in arms if a not in ARMS]
    if unknown:
        raise SystemExit(f"unknown arms: {unknown}")

    OUT.mkdir(parents=True, exist_ok=True)
    results = []
    for arm in arms:
        for seed in seeds:
            print(f"--- {arm} seed={seed} ---", flush=True)
            row = run_arm(arm, ARMS[arm], seed)
            results.append(row)
            print(
                f"    test={row['test_recall']:.3f} val={row['val_recall']:.3f} "
                f"purity={row['purity']:.4f} cqs={row['cqs']:.2f} "
                f"cont23={row['continuity_2023_24']} contmin={row['continuity_min']}",
                flush=True,
            )
            (OUT / args.out).write_text(json.dumps(results, indent=1), encoding="utf-8")
    print(f"\nwrote {OUT / args.out} ({len(results)} runs)")


if __name__ == "__main__":
    main()

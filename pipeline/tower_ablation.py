"""Drop-one-family MTNN ablation — held-out test recall@10.

Covers the full 13-tower v4 stack (game + context + form + pedigree +
playoffs). Skills Lens aux heads train whenever skill_labels exist.

Run:  python pipeline/tower_ablation.py [--epochs 25]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "pipeline" / "data" / "mtnn_report.json"

MANIFEST = ROOT / "pipeline" / "data" / "feature_manifest.json"

# All context / extension families in integrate_context.py (2026-07).
CONTEXT_FAMS = (
    "roster",
    "career",
    "competition",
    "market",
    "team",
    "form",
    "pedigree",
    "playoffs",
)

# injury never becomes an input tower (see train_mtnn.INJURY_FEATURES) -- it is
# the durability head's target, so ablating it as a tower is meaningless.
NON_TOWER_FAMS = {"injury"}

# The shipping recipe (train.sh v5 winner). Ablation must measure families
# against the architecture we actually deploy, not argparse defaults.
ARCH = [
    "--dim", "48",
    "--tower-width", "32",
    "--tower-hidden", "160",
    "--tower-blocks", "2",
    "--mlp-heads",
    "--d-head-hidden", "128",
    "--fusion", "concat",
    "--fusion-hidden", "256",
    "--nce-loss", "hybrid",
    "--nce-player-weight", "0.7",
    "--nce-arch-weight", "0.3",
    "--hard-neg-boost", "0.3",
    "--drop-p", "0.12",
    "--weight-decay", "0.0001",
    "--lr-schedule", "onecycle",
    "--warmup-pct", "0.1",
    "--anneal-strategy", "linear",
    "--batch", "512",
]


def manifest_families() -> list[str]:
    """Every family that actually becomes a tower, read from the manifest."""
    man = json.loads(MANIFEST.read_text(encoding="utf-8"))
    fams = sorted(set(man.get("families", {}).values()) - NON_TOWER_FAMS)
    return fams


def run_train(exclude: list[str], epochs: int, seed: int) -> dict:
    cmd = [
        sys.executable,
        str(ROOT / "pipeline" / "train_mtnn.py"),
        "--epochs",
        str(epochs),
        "--seed",
        str(seed),
        "--val-every",
        "0",
        "--no-best-checkpoint",
        *ARCH,
    ]
    if exclude:
        # mask, don't delete: keeps fusion width constant across arms so the
        # delta measures information content, not a re-shaped architecture
        cmd += ["--mask-families", ",".join(exclude)]
    subprocess.run(cmd, cwd=ROOT, check=True)
    return json.loads(REPORT.read_text(encoding="utf-8"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=25)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument(
        "--families",
        choices=("all", "context"),
        default="all",
        help="'all' ablates every tower in the manifest; 'context' only the "
        "integrate_context extensions (the original 2026-07 scope)",
    )
    args = ap.parse_args()

    fams = manifest_families() if args.families == "all" else list(CONTEXT_FAMS)
    print(f"ablating {len(fams)} families: {fams}")

    configs: list[tuple[str, list[str]]] = [("full", [])]
    for fam in fams:
        configs.append((f"drop_{fam}", [fam]))
    configs.append(("drop_form_pedigree", ["form", "pedigree"]))

    results = {}
    baseline_test = None
    for name, excl in configs:
        print(f"\n=== {name} exclude={excl or 'none'} ===")
        rep = run_train(excl, args.epochs, args.seed)
        test = rep["held_out_recall"]["test"]["recall_at_10_mtnn"]
        val = rep["held_out_recall"]["val"]["recall_at_10_mtnn"]
        purity = rep.get("cross_era_archetype_neighbor_purity_at_20")
        results[name] = {
            "exclude": excl,
            "test_recall": test,
            "val_recall": val,
            "purity": purity,
            "towers": rep.get("towers"),
            "loss_weights": rep.get("loss_weights"),
        }
        if name == "full":
            baseline_test = test
        print(f"  test={test:.3f} val={val:.3f} purity={purity:.3f}")

    print("\n=== ABLATION SUMMARY (vs full) ===")
    for name, r in results.items():
        if name == "full":
            continue
        dt = (r["test_recall"] or 0) - (baseline_test or 0)
        gate = "KEEP" if dt >= -0.01 else "REVIEW"
        print(f"  {name:22s} dtest={dt:+.3f}  -> {gate}")

    out = ROOT / "pipeline" / "data" / "tower_ablation.json"
    out.write_text(
        json.dumps(
            {
                "baseline_test": baseline_test,
                "epochs": args.epochs,
                "seed": args.seed,
                "runs": results,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()

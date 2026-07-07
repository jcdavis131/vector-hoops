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

# All context / extension families in integrate_context.py (2026-07).
CONTEXT_FAMS = (
    "roster", "career", "competition", "market", "team",
    "form", "pedigree", "playoffs",
)


def run_train(exclude: list[str], epochs: int, seed: int) -> dict:
    cmd = [
        sys.executable, str(ROOT / "pipeline" / "train_mtnn.py"),
        "--epochs", str(epochs),
        "--seed", str(seed),
        "--val-every", "0",
        "--no-best-checkpoint",
    ]
    if exclude:
        cmd += ["--exclude-families", ",".join(exclude)]
    subprocess.run(cmd, cwd=ROOT, check=True)
    return json.loads(REPORT.read_text(encoding="utf-8"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=25)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    configs: list[tuple[str, list[str]]] = [("full", [])]
    for fam in CONTEXT_FAMS:
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
        json.dumps({
            "baseline_test": baseline_test,
            "epochs": args.epochs,
            "seed": args.seed,
            "runs": results,
        }, indent=2),
        encoding="utf-8",
    )
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()

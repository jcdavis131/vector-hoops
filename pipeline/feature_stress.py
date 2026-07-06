"""Feature stress testing — ablation, missingness, promotion gates.

  python pipeline/feature_stress.py           # report from existing artifacts
  python pipeline/feature_stress.py --quick   # smoke train 5 epochs
  python pipeline/feature_stress.py --ablate  # run tower_ablation (slow)

Writes pipeline/data/feature_stress.json
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "pipeline" / "data"
OUT = DATA_DIR / "feature_stress.json"
MTNN_REPORT = DATA_DIR / "mtnn_report.json"
TOWER_ABLATION = DATA_DIR / "tower_ablation.json"

GATE_RECALL_DROP = 0.01
GATE_MISSINGNESS_DROP = 0.03
GATE_PURITY = 0.63
GATE_MTTN_VS_RAW = 0.05


def load_matrix():
    npz = np.load(DATA_DIR / "train_matrix.npz", allow_pickle=False)
    return npz["Z"], npz["mask"]


def missingness_stress(seed: int = 42) -> dict:
    """Zero-mask 30% of rows per family; measure mean feature availability."""
    manifest = json.loads((DATA_DIR / "feature_manifest.json").read_text(encoding="utf-8"))
    Z, mask = load_matrix()
    families = manifest.get("families", {})
    features = manifest["features"]
    fam_cols: dict[str, list[int]] = {}
    for j, f in enumerate(features):
        fam = families.get(f, "unknown")
        fam_cols.setdefault(fam, []).append(j)

    rng = np.random.default_rng(seed)
    n = mask.shape[0]
    stressed = mask.copy()
    sample_n = max(1, int(0.30 * n))
    idx = rng.choice(n, size=sample_n, replace=False)
    for fam, cols in fam_cols.items():
        if fam in ("volume", "playmaking", "rebounding", "defense", "efficiency"):
            continue  # core game stats — do not stress
        for i in idx:
            for j in cols:
                stressed[i, j] = 0.0

    base_rate = float(mask.mean())
    stress_rate = float(stressed.mean())
    return {
        "rows_stressed": sample_n,
        "families_stressed": [f for f in fam_cols if f not in (
            "volume", "playmaking", "rebounding", "defense", "efficiency")],
        "mean_mask_before": round(base_rate, 4),
        "mean_mask_after": round(stress_rate, 4),
        "note": "Train-time robustness — compare recall before/after with stressed mask export (manual)",
    }


def promotion_gates(report: dict) -> list[dict]:
    gates = []
    ho = report.get("held_out_recall", {})
    test = ho.get("test", {})
    mtnn_r = test.get("recall_at_10_mtnn")
    raw_r = test.get("recall_at_10_raw")
    purity = report.get("cross_era_archetype_neighbor_purity_at_20")

    if mtnn_r is not None:
        gates.append({
            "gate": "S2_test_recall_at_10",
            "value": mtnn_r,
            "target": 0.80,
            "pass": mtnn_r >= 0.80,
        })
    if purity is not None:
        gates.append({
            "gate": "S4_purity_at_20",
            "value": purity,
            "target": GATE_PURITY,
            "pass": purity >= GATE_PURITY,
        })
    if mtnn_r is not None and raw_r is not None:
        gates.append({
            "gate": "S5_mtnn_vs_raw",
            "value": round(mtnn_r - raw_r, 4),
            "target": GATE_MTTN_VS_RAW,
            "pass": (mtnn_r - raw_r) >= GATE_MTTN_VS_RAW,
        })
    return gates


def ablation_summary() -> dict | None:
    if not TOWER_ABLATION.exists():
        return None
    data = json.loads(TOWER_ABLATION.read_text(encoding="utf-8"))
    baseline = data.get("baseline_test")
    runs = data.get("runs", {})
    drops = []
    for name, r in runs.items():
        if name == "full" or baseline is None:
            continue
        dt = r["test_recall"] - baseline
        drops.append({
            "config": name,
            "exclude": r.get("exclude"),
            "delta_test_recall": round(dt, 4),
            "family_helps": dt < -GATE_RECALL_DROP,
        })
    return {"baseline_test": baseline, "drop_one": drops}


def run_quick_train(epochs: int = 5) -> dict:
    cmd = [
        sys.executable, str(ROOT / "pipeline" / "train_mtnn.py"),
        "--epochs", str(epochs),
    ]
    subprocess.run(cmd, cwd=ROOT, check=True)
    return json.loads(MTNN_REPORT.read_text(encoding="utf-8"))


def run_ablation(epochs: int = 25) -> None:
    cmd = [sys.executable, str(ROOT / "pipeline" / "tower_ablation.py"),
           "--epochs", str(epochs)]
    subprocess.run(cmd, cwd=ROOT, check=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true", help="5-epoch smoke train")
    ap.add_argument("--ablate", action="store_true", help="run tower_ablation.py")
    ap.add_argument("--epochs", type=int, default=5)
    args = ap.parse_args()

    if args.ablate:
        run_ablation()
    if args.quick:
        run_quick_train(args.epochs)

    report = {}
    if MTNN_REPORT.exists():
        report = json.loads(MTNN_REPORT.read_text(encoding="utf-8"))

    payload = {
        "missingness_stress": missingness_stress(),
        "promotion_gates": promotion_gates(report) if report else [],
        "ablation": ablation_summary(),
        "mtnn_snapshot": {
            "test_recall_at_10": report.get("held_out_recall", {}).get("test", {}).get("recall_at_10_mtnn"),
            "purity_at_20": report.get("cross_era_archetype_neighbor_purity_at_20"),
            "towers": report.get("towers"),
        } if report else None,
        "warnings": [],
    }

    failed = [g for g in payload["promotion_gates"] if not g["pass"]]
    if failed:
        payload["warnings"].append(
            f"{len(failed)} promotion gates not met — do not promote to assets/vectors.json"
        )
    if payload["ablation"] is None:
        payload["warnings"].append("no tower_ablation.json — run tower_ablation.py or --ablate")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print("feature stress report")
    for g in payload["promotion_gates"]:
        status = "PASS" if g["pass"] else "FAIL"
        print(f"  {g['gate']}: {g['value']} (target {g['target']}) {status}")
    for w in payload["warnings"]:
        print(f"  WARN: {w}")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()

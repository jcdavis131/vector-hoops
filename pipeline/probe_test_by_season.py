#!/usr/bin/env python3
"""Measure the seed-reproducibility floor: same matrix, same config, only the seed changes.

Everything varying here is seed. Any metric spread is what a retrain can produce WITHOUT
any change to data or code, and therefore the minimum effect a feature change must exceed
before it can be called an effect at all.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
REPO = Path(r"C:\Users\jcdav\vector-hoops")
SC = Path(r"C:\Users\jcdav\AppData\Local\Temp\claude\C--Users-jcdav"
          r"\be69d382-ce38-4d23-b6d1-d92c62546c02\scratchpad\hoops_ab")
PY = r"C:\Users\jcdav\vector-hoops\pipeline\.venv\Scripts\python.exe"
MATRIX = REPO / "pipeline" / "data" / "train_matrix.npz"
REPORT = REPO / "pipeline" / "data" / "mtnn_report.json"

ARGS = ["--epochs", "40", "--dim", "64", "--tower-width", "32", "--tower-hidden", "160",
        "--tower-blocks", "2", "--fusion", "concat", "--mlp-heads",
        "--d-head-hidden", "128", "--fusion-hidden", "256"]
NEW_SEEDS = (7, 11, 13, 17, 19, 23, 29, 31)

shutil.copy2(SC / "matrix_NEW.npz", MATRIX)      # one fixed matrix for every run
rows = []
existing = SC / "byseason.json"
if existing.exists():
    rows = json.loads(existing.read_text(encoding="utf-8"))

for seed in NEW_SEEDS:
    p = subprocess.run([PY, "pipeline/train_mtnn.py", *ARGS, "--seed", str(seed)],
                       cwd=REPO, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if p.returncode != 0:
        print(f"  seed={seed} FAILED rc={p.returncode}")
        print((p.stderr or "")[-600:])
        continue
    r = json.loads(REPORT.read_text(encoding="utf-8"))
    c = r["composite"]["components"]
    h = r["held_out_recall"]
    rows.append({"seed": seed, "cqs": r["composite"]["cqs"],
                 "test_recall": h["test"]["recall_at_10_mtnn"],
                 "val_recall": h["val"]["recall_at_10_mtnn"],
                 "purity": c.get("purity"), "archetype": c.get("archetype"),
                 "r2024": h.get("test_by_target_season", {}).get("2024", {}).get("recall_at_10_mtnn"),
                 "r2025": h.get("test_by_target_season", {}).get("2025", {}).get("recall_at_10_mtnn"),
                 "next_r2": c.get("next_r2"), "best_epoch": r.get("best_epoch")})
    print(f"  seed={seed:<3} CQS={rows[-1]['cqs']:.2f} test_recall={rows[-1]['test_recall']:.3f} "
          f"val_recall={rows[-1]['val_recall']:.3f} purity={rows[-1]['purity']}", flush=True)

existing.write_text(json.dumps(rows, indent=1), encoding="utf-8")
print(f"\nwrote {existing} ({len(rows)} runs)")

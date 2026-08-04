#!/usr/bin/env python3
"""Does denser checkpoint selection cut the seed spread?

best_epoch is chosen from validation points only, and --val-every defaults to 10, so over
40 epochs the trainer picks from 5 candidates (0,10,20,30,39). A seed whose true peak falls
at epoch 25 is handed the epoch-20 or epoch-30 weights.

Same matrix, same config, same seeds as the floor measurement. ONLY --val-every changes.

CAVEAT recorded before the run: if validation consumes RNG, changing its frequency also
changes the training trajectory, so this is not a clean isolation of checkpoint selection.
It still answers the practical question — does this setting produce less seed spread — which
is what blocks feature work.
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
        "--d-head-hidden", "128", "--fusion-hidden", "256", "--val-every", "2"]
SEEDS = (7, 11, 13, 23, 29)     # 2 known-good, 3 known-bad under val-every 10

shutil.copy2(SC / "matrix_NEW.npz", MATRIX)
rows = []
for seed in SEEDS:
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
                 "next_r2": c.get("next_r2"), "best_epoch": r.get("best_epoch")})
    print(f"  seed={seed:<3} CQS={rows[-1]['cqs']:.2f} test_recall={rows[-1]['test_recall']:.3f} "
          f"best_epoch={rows[-1]['best_epoch']}", flush=True)

(SC / "valevery2.json").write_text(json.dumps(rows, indent=1), encoding="utf-8")
print(f"\nwrote {SC/'valevery2.json'} ({len(rows)} runs)")

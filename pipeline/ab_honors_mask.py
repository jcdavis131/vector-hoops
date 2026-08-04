#!/usr/bin/env python3
"""A/B the honors mask fix on hoops: identical config and seed, ONLY the matrix differs.

ARM A  pre-fix   HON_* observed on 1,132/12,966 rows (8.7%), matrix 64.2% observed
ARM B  post-fix  HON_* observed on 12,568 (96.9%),           matrix 67.3% observed
       The 5 HON_* columns feed a dedicated `honors` tower (18 towers total), so this
       is not a marginal feature tweak — one whole tower was seeing 8.7% of its rows.

Three seeds per arm. The within-arm seed range is the noise floor; a between-arm
difference smaller than that is not distinguishable from which seed happened to run.

Config reproduces the shipped model: mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256
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
SEEDS = (7, 11, 13)
ARMS = {"A_prefix": SC / "matrix_OLD.npz", "B_postfix": SC / "matrix_NEW.npz"}

rows = []
for arm, src in ARMS.items():
    for seed in SEEDS:
        shutil.copy2(src, MATRIX)
        p = subprocess.run([PY, "pipeline/train_mtnn.py", *ARGS, "--seed", str(seed)],
                           cwd=REPO, capture_output=True, text=True,
                           encoding="utf-8", errors="replace")
        if p.returncode != 0:
            print(f"  {arm} seed={seed} FAILED rc={p.returncode}")
            print((p.stderr or "")[-700:])
            continue
        r = json.loads(REPORT.read_text(encoding="utf-8"))
        c = r["composite"]["components"]
        row = {"arm": arm, "seed": seed,
               "cqs": r["composite"]["cqs"],
               "recall": c.get("recall"), "purity": c.get("purity"),
               "archetype": c.get("archetype"), "position": c.get("position"),
               "skill_nn": c.get("skill_nn"), "next_r2": c.get("next_r2"),
               "best_val_recall": r.get("best_val_recall_at_10")}
        rows.append(row)
        shutil.copy2(REPORT, SC / f"report_{arm}_s{seed}.json")
        print(f"  {arm:10} s{seed:<3} CQS={row['cqs']:.2f} recall={row['recall']} "
              f"purity={row['purity']} arch={row['archetype']} next_r2={row['next_r2']}",
              flush=True)

(SC / "ab_results.json").write_text(json.dumps(rows, indent=1), encoding="utf-8")
print(f"\nwrote {SC/'ab_results.json'} ({len(rows)} runs)")

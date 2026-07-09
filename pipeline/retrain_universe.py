"""Filter universe + retrain MTNN + rebuild drift suite (ordered pipeline).

Model retrain runs BEFORE drift analyses so the site ships a consistent
filtered universe and promoted embeddings.

  python pipeline/retrain_universe.py
  python pipeline/retrain_universe.py --skip-build   # vectors already fresh
  python pipeline/retrain_universe.py --epochs 150

Steps:
  1. build_vectors.py       schedule-aware eligibility → vectors + train_matrix
  2. build_skills.py + test
  3. integrate_context.py   wide matrix for MTNN
  4. apply_hp_sweep.py      full train from sweep winner (hybrid-040)
  5. export_mtnn_embeddings.py + test
  6. rebuild_drift_suite.py procrustes → archetype_time → trajectories → audit
  7. verify_accuracy.py
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VECTORS = ROOT / "assets" / "vectors.json"


def run(name: str, cmd: list[str], required: bool = True) -> bool:
    print(f"\n{'=' * 60}\n== {name}\n   {' '.join(cmd)}", flush=True)
    t0 = time.time()
    proc = subprocess.run(cmd, cwd=ROOT)
    ok = proc.returncode == 0
    print(f"== {name}: {'ok' if ok else 'FAILED'} ({time.time() - t0:.0f}s)", flush=True)
    if not ok and required:
        raise SystemExit(f"required step failed: {name}")
    return ok


def snapshot_vectors() -> dict:
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    return {
        "built": vec.get("built"),
        "rows": len(vec["players"]),
        "eligibility": vec.get("eligibility"),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-build", action="store_true",
                    help="vectors.json already rebuilt with new gates")
    ap.add_argument("--epochs", type=int, default=150)
    ap.add_argument("--seed", type=int, default=99,
                    help="hybrid-040 best seed from hp sweep")
    ap.add_argument("--skip-train", action="store_true")
    ap.add_argument("--skip-drift", action="store_true")
    ap.add_argument("--recipe", type=str, default="",
                    help="frozen winner config JSON (promote-gate §3a); without it "
                         "this retrains the OLD hp-sweep recipe, not a v5 winner")
    args = ap.parse_args()

    py = sys.executable
    before = snapshot_vectors() if VECTORS.exists() else None
    print(f"vectors before: {before}", flush=True)

    if not args.skip_build:
        run("build_vectors", [py, "-u", "pipeline/build_vectors.py"])

    after = snapshot_vectors()
    print(f"vectors after:  {after}", flush=True)
    if after.get("rows", 0) < 1000:
        raise SystemExit("vectors.json too small after build — aborting")

    run("build_skills", [py, "pipeline/build_skills.py"])
    run("test_skills", [py, "pipeline/test_skills.py"])
    for ctx in ("form_context", "roster_context", "competition_context"):
        run(ctx, [py, f"pipeline/{ctx}.py"], required=False)
    # Context towers consumed by integrate_context — must run before merge.
    for step, script in (
        ("build_pedigree", "build_pedigree.py"),
        ("build_playoffs", "build_playoffs.py"),
        ("build_honors", "build_honors.py"),
        ("build_salary_market", "build_salary_market.py"),
    ):
        run(step, [py, f"pipeline/{script}"], required=False)
    run("integrate_context", [py, "pipeline/integrate_context.py"])

    if not args.skip_train:
        train = [
            py, "pipeline/apply_hp_sweep.py",
            "--epochs", str(args.epochs),
            "--seed", str(args.seed),
            "--run",
        ]
        if args.recipe:
            train.extend(["--recipe", args.recipe])
        else:
            print("WARNING: no --recipe; retraining the OLD hp-sweep recipe "
                  "(no v5 architecture flags).", flush=True)
        run("mtnn_train", train)
        run("export_mtnn", [py, "pipeline/export_mtnn_embeddings.py"], required=False)
        run("test_mtnn_export", [py, "pipeline/test_mtnn_export.py"], required=False)

    if not args.skip_drift:
        run("drift_suite", [py, "pipeline/rebuild_drift_suite.py", "--skip-skills"])

    run("verify_accuracy", [py, "pipeline/verify_accuracy.py"])

    print(f"\n{'=' * 60}\nUniverse retrain complete.")
    print(f"  player-seasons: {before['rows'] if before else '?'} -> {after['rows']}")
    print("  Next: vercel --prod")


if __name__ == "__main__":
    main()

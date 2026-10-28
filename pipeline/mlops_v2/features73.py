"""Stage 2 — feature build: offline rebuild of the verified 73-col base.

Runs the existing pipeline/build_vectors.py --offline inside a scratch
copy of the worktree's pipeline/ (cache symlinked, never copied), so
the worktree's served assets/vectors.json is NEVER overwritten by this
stage. The rebuilt train_matrix.npz + feature_manifest.json are copied
to mlops-v2/out/features73/ (staged, non-prod) and verified:

- 12,966 rows (fail otherwise)
- all 73 BASE73 columns present in the manifest feature list
- mask mean reported (prior verified rebuild: 0.7890)
- salary coverage reported (prior: 11,504/12,966 = 0.8872)

This verifies the BUILD only. It does NOT verify lawfulness for
training: the base is NBA-origin (NEEDS PERMISSION) + SALARY_LOG
(NO SOURCE for bulk salary). Build status and lawfulness are separate
columns in the output manifest — never collapsed.
"""
from __future__ import annotations

import shutil
import subprocess
import sys

import numpy as np

from .common import BASE73, CACHE, OUT, PIPE, ROOT, provenance, write_json


def run():
    outdir = OUT / "features73"
    scratch = OUT / "_scratch_build"
    if scratch.exists():
        shutil.rmtree(scratch)
    (scratch / "pipeline").mkdir(parents=True)
    (scratch / "assets").mkdir(parents=True)
    # Copy code, symlink the 105 MB cache (read-only use).
    for item in PIPE.iterdir():
        if item.name == "cache":
            continue
        if item.is_dir():
            shutil.copytree(item, scratch / "pipeline" / item.name,
                            ignore=shutil.ignore_patterns("__pycache__"))
        else:
            shutil.copy2(item, scratch / "pipeline" / item.name)
    (scratch / "pipeline" / "cache").symlink_to(CACHE, target_is_directory=True)
    print("scratch copy ready; running build_vectors.py --offline ...")
    proc = subprocess.run(
        [sys.executable, "pipeline/build_vectors.py", "--offline"],
        cwd=scratch, capture_output=True, text=True, timeout=3600)
    print(proc.stdout[-2000:])
    if proc.returncode != 0:
        print(proc.stderr[-3000:], file=sys.stderr)
        raise SystemExit(f"offline rebuild FAILED (exit {proc.returncode}); "
                         "no output written")
    npz_path = scratch / "pipeline" / "data" / "train_matrix.npz"
    man_path = scratch / "pipeline" / "data" / "feature_manifest.json"
    import json
    man = json.loads(man_path.read_text())
    feats = man["features"]
    missing = [c for c in BASE73 if c not in feats]
    d = np.load(npz_path)
    Z, mask = d["Z"], d["mask"]
    n, width = Z.shape
    mask_mean = float(mask.mean())
    sal_idx = feats.index("SALARY_LOG")
    sal_cov = int(mask[:, sal_idx].sum())
    checks = {
        "rows": n, "rows_expected": 12966, "rows_ok": n == 12966,
        "wide_features": width, "manifest_features": len(feats),
        "base73_missing": missing, "base73_ok": not missing,
        "mask_mean": round(mask_mean, 4),
        "mask_mean_prior_verified": 0.7890,
        "salary_coverage": sal_cov, "salary_coverage_prior": 11504,
        "seasons_fetched": man.get("seasons_fetched"),
        "seasons_missing": man.get("seasons_missing"),
    }
    if not checks["rows_ok"] or not checks["base73_ok"]:
        raise SystemExit(f"verification FAILED: {checks}")
    outdir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(npz_path, outdir / "train_matrix_73.npz")
    shutil.copy2(man_path, outdir / "feature_manifest_73.json")
    report = {
        "stage": "features73",
        "checks": checks,
        "note": "BUILD verified only. Lawfulness NOT verified: base is "
                "NBA-origin (NEEDS PERMISSION); SALARY_LOG has NO SOURCE "
                "for bulk salary. Do not train on this matrix until the "
                "legal read + permission posture land.",
        "provenance": provenance(
            "pipeline/cache/ via pipeline/build_vectors.py --offline",
            "NBA-origin (NEEDS PERMISSION); salary NO SOURCE (bulk)",
            "offline rebuild in scratch copy; worktree assets untouched",
        ),
    }
    write_json(outdir / "features73_report.json", report)
    shutil.rmtree(scratch)
    print(f"VERIFIED: {n} rows x {width} wide features; base73 all present; "
          f"mask mean {mask_mean:.4f}; salary coverage {sal_cov}")
    return report


if __name__ == "__main__":
    run()

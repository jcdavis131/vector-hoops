"""Promote client-safe pipeline outputs into assets/ for the static site.

The game contract stays transparent 14-d vectors.json; MTNN embeddings
(pipeline/data/embedding_v3.npz) are NOT exported until promotion gates pass.
This script refreshes everything the UI actually fetches.

Run after integrate_context.py + train (or in parallel with training):

  python pipeline/export_assets.py
  python pipeline/verify_accuracy.py

Steps: skills, player_meta, pedigree asset, playoffs asset (if cache),
       archetype sidecars, assets/manifest.json ledger stamp.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
MANIFEST = ASSETS / "manifest.json"
LEDGER = ROOT / "pipeline" / "cache" / "dataset_ledger.json"
REPORT = ROOT / "pipeline" / "data" / "mtnn_report.json"

CLIENT_ASSETS = [
    "vectors.json",
    "skills.json",
    "skill_probe.json",
    "player_meta.json",
    "teams.json",
    "pedigree.json",
    "playoffs.json",
    "honors.json",
    "archetypes_time.json",
    "trajectories.json",
    "drift.json",
    "deadline.json",
    "chemistry.json",
    "pivots.json",
    "eratwins.json",
    "faderfinisher.json",
    "roles.json",
]


def run(name: str, cmd: list[str], required: bool = True) -> bool:
    print(f"== {name}: {' '.join(cmd)}")
    proc = subprocess.run(cmd, cwd=ROOT)
    ok = proc.returncode == 0
    print(f"== {name}: {'ok' if ok else 'FAILED'}\n")
    if not ok and required:
        raise SystemExit(f"required step failed: {name}")
    return ok


def sha1(path: Path) -> str | None:
    if not path.exists():
        return None
    return hashlib.sha1(path.read_bytes()).hexdigest()[:12]


def main() -> None:
    py = sys.executable
    steps_ok: dict[str, bool] = {}

    steps_ok["skills"] = run("build_skills", [py, "pipeline/build_skills.py"])
    steps_ok["skill_gates"] = run("test_skills", [py, "pipeline/test_skills.py"])
    steps_ok["pedigree"] = run(
        "build_pedigree", [py, "pipeline/build_pedigree.py"], required=False)
    steps_ok["pedigree_gates"] = run(
        "test_pedigree", [py, "pipeline/test_pedigree.py"], required=False)
    steps_ok["playoffs"] = run(
        "build_playoffs", [py, "pipeline/build_playoffs.py"], required=False)
    steps_ok["playoffs_gates"] = run(
        "test_playoffs", [py, "pipeline/test_playoffs.py"], required=False)
    steps_ok["honors"] = run(
        "build_honors", [py, "pipeline/build_honors.py"], required=False)
    steps_ok["honors_gates"] = run(
        "test_honors", [py, "pipeline/test_honors.py"], required=False)
    steps_ok["salary_market"] = run(
        "build_salary_market", [py, "pipeline/build_salary_market.py"], required=False)
    steps_ok["salary_gates"] = run(
        "test_salaries", [py, "pipeline/test_salaries.py"], required=False)
    steps_ok["player_meta"] = run(
        "build_player_meta", [py, "pipeline/build_player_meta.py"], required=False)

    # Archetype / drift sidecars (idempotent; fast when vectors unchanged).
    for script in (
        "procrustes_drift.py",
        "archetype_time.py",
        "career_trajectories.py",
    ):
        steps_ok[script] = run(
            script, [py, f"pipeline/{script}"], required=False)

    mtnn = None
    if REPORT.exists():
        mtnn = json.loads(REPORT.read_text(encoding="utf-8"))

    ledger_tail = None
    if LEDGER.exists():
        ledger = json.loads(LEDGER.read_text(encoding="utf-8"))
        ledger_tail = ledger[-1] if ledger else None

    manifest = {
        "built": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()),
        "contract": "transparent_14d",
        "mtnn_promoted": False,
        "mtnn_model": mtnn.get("model") if mtnn else None,
        "mtnn_test_recall_at_10": (
            mtnn.get("held_out_recall", {}).get("test", {}).get("recall_at_10_mtnn")
            if mtnn else None),
        "dataset_ledger": ledger_tail,
        "steps": steps_ok,
        "assets": {
            name: {"sha1": sha1(ASSETS / name), "present": (ASSETS / name).exists()}
            for name in CLIENT_ASSETS
        },
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"wrote {MANIFEST.relative_to(ROOT)}")

    present = sum(1 for a in manifest["assets"].values() if a["present"])
    print(f"client assets: {present}/{len(CLIENT_ASSETS)} present on disk")
    print("MTNN embeddings stay in pipeline/data/ until promotion gates pass.")
    print("Next: python pipeline/verify_accuracy.py  then  vercel --prod")


if __name__ == "__main__":
    main()

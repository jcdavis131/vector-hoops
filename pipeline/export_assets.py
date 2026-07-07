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
CACHE_DIR = ROOT / "pipeline" / "cache"
MANIFEST = ASSETS / "manifest.json"
LEDGER = ROOT / "pipeline" / "cache" / "dataset_ledger.json"
REPORT = ROOT / "pipeline" / "data" / "mtnn_report.json"
SWEEP = ROOT / "pipeline" / "data" / "mtnn_hp_sweep.json"

CLIENT_ASSETS = [
    "vectors.json",
    "skills.json",
    "skills_wide.json",
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


def has_real_wide_caches() -> bool:
    """True when operator season caches exist (not just the example fixture)."""
    return any(CACHE_DIR.glob("wide_skills_*.json"))


def wide_skills_build_cmd(py: str) -> list[str]:
    cmd = [py, "pipeline/build_wide_skills.py"]
    if not has_real_wide_caches():
        cmd.append("--fixture")
    return cmd


PROMOTION_PURITY_FLOOR = 0.63
PROMOTION_RECALL_MARGIN = 0.05
PROMOTION_ARCHETYPE_TOP1 = 0.55


def mtnn_promotion_eligible(report: dict | None) -> bool:
    """Match train_mtnn.py promotion_gate + verify_accuracy v11."""
    if not report:
        return False
    ho = report.get("held_out_recall", {})
    test = ho.get("test", {})
    mtnn_r = test.get("recall_at_10_mtnn")
    base_r = test.get("recall_at_10_transparent_14d")
    purity = report.get("cross_era_archetype_neighbor_purity_at_20")
    arch = report.get("archetype_top1_acc")
    if mtnn_r is None or base_r is None or purity is None or arch is None:
        return False
    return (
        mtnn_r >= base_r + PROMOTION_RECALL_MARGIN
        and arch >= PROMOTION_ARCHETYPE_TOP1
        and purity >= PROMOTION_PURITY_FLOOR
    )


def main() -> None:
    py = sys.executable
    steps_ok: dict[str, bool] = {}

    steps_ok["skills"] = run("build_skills", [py, "pipeline/build_skills.py"])
    steps_ok["skill_gates"] = run("test_skills", [py, "pipeline/test_skills.py"])
    steps_ok["wide_skills"] = run(
        "build_wide_skills", wide_skills_build_cmd(py), required=False)
    steps_ok["wide_skill_gates"] = run(
        "test_wide_skills", [py, "pipeline/test_wide_skills.py"], required=False)
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
    steps_ok["game_ratings"] = run(
        "build_game_ratings", [py, "pipeline/build_game_ratings.py", "--fixture"],
        required=False)
    steps_ok["game_ratings_gates"] = run(
        "test_game_ratings", [py, "pipeline/test_game_ratings.py"], required=False)
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

    sweep_best = None
    if SWEEP.exists():
        sweep_doc = json.loads(SWEEP.read_text(encoding="utf-8"))
        sweep_best = sweep_doc.get("best")

    ledger_tail = None
    if LEDGER.exists():
        ledger = json.loads(LEDGER.read_text(encoding="utf-8"))
        ledger_tail = ledger[-1] if ledger else None

    wide_meta = None
    wide_path = ASSETS / "skills_wide.json"
    if wide_path.exists():
        wide_doc = json.loads(wide_path.read_text(encoding="utf-8"))
        wide_meta = {
            "skill_count": len(wide_doc.get("skills", [])),
            "grade_rows": len(wide_doc.get("grades", {})),
            "source": "real_caches" if has_real_wide_caches() else "fixture",
        }

    manifest = {
        "built": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()),
        "contract": "transparent_14d",
        "wide_skills": wide_meta,
        "mtnn_promoted": mtnn_promotion_eligible(mtnn),
        "mtnn_promotion_note": (
            "embeddings stay in pipeline/data/ until a client surface consumes them"
            if mtnn_promotion_eligible(mtnn) else None),
        "mtnn_model": mtnn.get("model") if mtnn else None,
        "mtnn_test_recall_at_10": (
            mtnn.get("held_out_recall", {}).get("test", {}).get("recall_at_10_mtnn")
            if mtnn else None),
        "mtnn_purity_at_20": mtnn.get("cross_era_archetype_neighbor_purity_at_20") if mtnn else None,
        "hp_sweep_best": sweep_best,
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

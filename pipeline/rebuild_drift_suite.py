"""Rebuild drift analyses after a fresh build_vectors.py run.

Runs every drift-related pipeline step in dependency order, then verifies
assets align with the new vectors.json universe.

Prerequisite: assets/vectors.json already rebuilt (schedule-aware eligibility).

  python pipeline/rebuild_drift_suite.py
  python pipeline/rebuild_drift_suite.py --skip-skills   # drift only
  python pipeline/rebuild_drift_suite.py --full          # + MTNN export path

Order (FEATURE_ENGINEERING_SOP §9):
  1. build_skills.py          (row-aligned with vectors)
  2. procrustes_drift.py      → assets/drift.json
  3. archetype_time.py        → assets/archetypes_time.json (needs drift)
  4. archetype_emergence_audit.py → assets/archetype_emergence.json
  5. career_trajectories.py   → assets/trajectories.json
  6. archetype_era_audit.py   → pipeline/data/archetype_era_audit.json
  6. verify drift row counts + procrustes integrity (subset of verify_accuracy)
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
VECTORS = ASSETS / "vectors.json"


def run(name: str, cmd: list[str], required: bool = True) -> bool:
    print(f"\n== {name}")
    print("   ", " ".join(cmd))
    t0 = time.time()
    proc = subprocess.run(cmd, cwd=ROOT)
    ok = proc.returncode == 0
    status = "ok" if ok else "FAILED"
    print(f"== {name}: {status} ({time.time() - t0:.0f}s)")
    if not ok and required:
        raise SystemExit(f"required step failed: {name}")
    return ok


def verify_drift_assets() -> None:
    """Fast post-run checks before full verify_accuracy.py."""
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    n = len(vec["players"])
    seasons = sorted({p["season"] for p in vec["players"]})

    drift = json.loads((ASSETS / "drift.json").read_text(encoding="utf-8"))
    arch = json.loads((ASSETS / "archetypes_time.json").read_text(encoding="utf-8"))
    traj = json.loads((ASSETS / "trajectories.json").read_text(encoding="utf-8"))

    if len(drift.get("chainedToRoot", {})) != len(seasons):
        raise SystemExit(
            f"drift.json chainedToRoot {len(drift['chainedToRoot'])} != "
            f"{len(seasons)} seasons in vectors.json"
        )
    covered = {p["to"] for p in drift.get("pairs", [])}
    missing = [s for s in seasons[1:] if s not in covered]
    if missing:
        raise SystemExit(f"drift.json pairs missing seasons: {missing}")

    if arch.get("n_players") != n:
        raise SystemExit(
            f"archetypes_time.json n_players {arch.get('n_players')} != {n}"
        )

    if traj.get("n_charted") is None:
        raise SystemExit("trajectories.json missing n_charted")
    print(
        f"  drift: {len(drift['pairs'])} pairs, {len(drift['chainedToRoot'])} chained"
    )
    print(f"  archetypes_time: {arch.get('n_players')} players")
    print(f"  trajectories: {traj.get('n_charted')} charted careers")
    print(f"  vectors.json: {n} player-seasons, {len(seasons)} seasons")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-skills", action="store_true")
    ap.add_argument(
        "--full",
        action="store_true",
        help="also run integrate_context, export_assets, verify_accuracy",
    )
    args = ap.parse_args()

    if not VECTORS.exists():
        raise SystemExit("missing assets/vectors.json — run build_vectors.py first")

    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    elig = vec.get("eligibility") or {}
    print(f"vectors.json: {len(vec['players'])} rows, built {vec.get('built')}")
    print(f"eligibility: {elig or '(legacy — no gate metadata)'}")

    py = sys.executable
    if not args.skip_skills:
        run("build_skills", [py, "pipeline/build_skills.py"])
        run("test_skills", [py, "pipeline/test_skills.py"])

    run("procrustes_drift", [py, "pipeline/procrustes_drift.py"])
    run("archetype_time", [py, "pipeline/archetype_time.py"])
    run("archetype_emergence_audit", [py, "pipeline/archetype_emergence_audit.py"])
    run("career_trajectories", [py, "pipeline/career_trajectories.py"])
    run("archetype_era_audit", [py, "pipeline/archetype_era_audit.py"])

    print("\n== verify_drift_assets (local)")
    verify_drift_assets()
    print("== verify_drift_assets: ok")

    if args.full:
        run("integrate_context", [py, "pipeline/integrate_context.py"], required=False)
        run("export_assets", [py, "pipeline/export_assets.py"], required=False)
        run("verify_accuracy", [py, "pipeline/verify_accuracy.py"])

    audit = ROOT / "pipeline" / "data" / "archetype_era_audit.json"
    if audit.exists():
        doc = json.loads(audit.read_text(encoding="utf-8"))
        rec = doc.get("recommendation", doc.get("summary", ""))
        if rec:
            print(f"\nAudit note: {rec}")

    print("\nDrift suite complete. Review assets/drift.json, archetypes_time.json,")
    print("trajectories.json, and pipeline/data/archetype_era_audit.json")


if __name__ == "__main__":
    main()

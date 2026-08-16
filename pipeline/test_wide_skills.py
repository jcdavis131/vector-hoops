"""Track J (wide skills) invariant gates — run after build_wide_skills.py.

Uses real caches when present, else the committed fixture. Rebuilds so it
always gates fresh logic, then checks coverage era (2015-16+ only), grade
bounds, face-validity directionality (post hubs, sprinters, motor guys),
and mask honesty (partial cache writes no game asset).

Run:  python pipeline/test_wide_skills.py       (exit 0 = all gates pass)
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from name_utils import canonical_name

CACHE_DIR = ROOT / "pipeline" / "cache"
LABELS = ROOT / "pipeline" / "data" / "wide_skill_labels.npz"
ASSET = ROOT / "assets" / "skills_wide.json"

FAILURES: list[str] = []


def check(cond: bool, msg: str) -> None:
    safe = msg.encode("ascii", "replace").decode("ascii")
    print(f"  [{'PASS' if cond else 'FAIL'}] {safe}")
    if not cond:
        FAILURES.append(msg)


def rebuild() -> bool:
    real = bool(list(CACHE_DIR.glob("wide_skills_*.json")))
    cmd = [sys.executable, "pipeline/build_wide_skills.py"] + ([] if real else ["--fixture"])
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if proc.returncode != 0:
        print(proc.stdout + proc.stderr)
        raise SystemExit("build_wide_skills.py failed")
    print(f"  (derived from {'REAL caches' if real else 'example fixture'})")
    return real


def main() -> None:
    real = rebuild()
    npz = np.load(LABELS, allow_pickle=False)
    names = [str(n) for n in npz["name"]]
    seasons = [str(s) for s in npz["season"]]
    keys = [str(k) for k in npz["keys"]]
    grades = (npz["grades"] * 100).round().astype(int)  # back to 0-99
    ki = {k: j for j, k in enumerate(keys)}
    by = {(names[i], seasons[i]): grades[i] for i in range(len(names))}

    print("coverage era")
    check(
        keys
        == [
            "post",
            "transition",
            "motor",
            "shooting_gravity",
            "rim_gravity",
            "disruption_gravity",
        ],
        f"six wide skills ({keys})",
    )
    check(
        all(int(s[:4]) >= 2015 for s in seasons),
        "every covered row is 2015-16 or later (masked before)",
    )

    print("bounds")
    check(grades.min() >= 0 and grades.max() <= 99, "grades in [0, 99]")

    print("face validity")

    def spot(name, season, skill, floor):
        # rows carry vectors.json display names (ASCII-folded, suffix-stripped)
        name = canonical_name(name)
        row = by.get((name, season))
        if row is None:
            check(False, f"{name} {season} covered")
            return
        check(
            int(row[ki[skill]]) >= floor,
            f"{name} {season} {skill} >= {floor} (got {int(row[ki[skill]])})",
        )

    def spot_low(name, season, skill, ceil):
        name = canonical_name(name)
        row = by.get((name, season))
        if row is None:
            check(False, f"{name} {season} covered")
            return
        check(
            int(row[ki[skill]]) <= ceil,
            f"{name} {season} {skill} <= {ceil} (got {int(row[ki[skill]])})",
        )

    spot("Joel Embiid", "2022-23", "post", 80)
    spot("Nikola Jokić", "2022-23", "post", 60)
    spot("Giannis Antetokounmpo", "2022-23", "transition", 80)
    spot("Draymond Green", "2022-23", "motor", 80)
    spot("Draymond Green", "2015-16", "motor", 80)
    # Track K — the two gravities, checked against the canonical examples:
    # Curry tops SHOOTING gravity (movement/pull-up 3s), Wembanyama tops
    # RIM gravity (interior deterrence); each is low on the other axis.
    spot("Stephen Curry", "2015-16", "shooting_gravity", 85)
    spot("Stephen Curry", "2023-24", "shooting_gravity", 85)
    spot_low("Stephen Curry", "2015-16", "rim_gravity", 50)
    spot("Victor Wembanyama", "2023-24", "rim_gravity", 85)
    spot("Rudy Gobert", "2023-24", "rim_gravity", 60)
    spot_low("DeAndre Jordan", "2015-16", "shooting_gravity", 30)  # never shoots
    spot_low("Anthony Edwards", "2023-24", "rim_gravity", 50)  # not a rim protector
    # Perimeter disruption gravity — steals + deflections + charges.
    spot("Marcus Smart", "2015-16", "disruption_gravity", 85)
    spot("Draymond Green", "2022-23", "disruption_gravity", 75)
    spot_low("DeAndre Jordan", "2015-16", "disruption_gravity", 40)
    spot_low("Rudy Gobert", "2023-24", "disruption_gravity", 45)

    print("mask honesty")
    if real:
        check(len(names) > 500, f"real caches cover many rows ({len(names)})")
        check(ASSET.exists(), "complete cache wrote assets/skills_wide.json")
    else:
        check(len(names) == 18, f"fixture emits exactly its rows ({len(names)})")
        check(
            not ASSET.exists(),
            "partial cache did NOT write assets/skills_wide.json (game dormant)",
        )

    print()
    if FAILURES:
        print(f"{len(FAILURES)} gate(s) FAILED")
        sys.exit(1)
    print(
        "all wide-skill gates passed"
        + ("" if real else " (fixture mode — run fetch_wide_skills.py on an operator machine for full coverage)")
    )


if __name__ == "__main__":
    main()

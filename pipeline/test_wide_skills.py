"""Track J (wide skills) invariant gates — run after build_wide_skills.py.

Uses real caches when present, else the committed fixture. Rebuilds into a
tmp --out-root (never pipeline/data or assets) so it always gates fresh
logic, then checks coverage era (2015-16+ only), grade bounds, face-validity
directionality (post hubs, sprinters, motor guys), and mask honesty (partial
cache writes no game asset).

The rebuild used to write pipeline/data/wide_skill_labels.npz in place.
Measured on 90ef66a4, one run of this gate replaced the Jul 30 labels (train_mtnn
reads them as skill-tower targets) with a build that includes the 2013-14 and
2014-15 proxy caches.

Run:  python -m pytest pipeline/test_wide_skills.py
      python pipeline/test_wide_skills.py       (same tests; exit 0 = all gates pass)
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from name_utils import canonical_name  # noqa: E402

CACHE_DIR = ROOT / "pipeline" / "cache"
LABELS = Path("pipeline") / "data" / "wide_skill_labels.npz"
ASSET = Path("assets") / "skills_wide.json"

# pipeline/cache/wide_skills_2013-14.json and _2014-15.json were written by
# fetch_missing_tracking.py with constants (post_ppp 0.9, trans_ppp 1.15,
# d_fg_pct 0.45) and complete=False, proxy=True. build_wide_skills globs every
# wide_skills_*.json, so a fresh build labels 2013-14/2014-15 rows from them
# and, the merged cache no longer being complete, stops writing the asset.
PROXY_CACHES = "[ingest#5] proxy wide_skills_2013-14/2014-15 caches (constants, complete=False) enter the build"


@pytest.fixture(scope="module")
def built(tmp_path_factory) -> dict:
    out = tmp_path_factory.mktemp("wide_skills")
    real = bool(list(CACHE_DIR.glob("wide_skills_*.json")))
    cmd = [sys.executable, "pipeline/build_wide_skills.py", "--out-root", str(out)] + ([] if real else ["--fixture"])
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, errors="replace")
    assert proc.returncode == 0, f"build_wide_skills.py failed:\n{proc.stdout}{proc.stderr}"
    npz = np.load(out / LABELS, allow_pickle=False)
    names = [str(n) for n in npz["name"]]
    seasons = [str(s) for s in npz["season"]]
    keys = [str(k) for k in npz["keys"]]
    grades = (npz["grades"] * 100).round().astype(int)  # back to 0-99
    return {
        "real": real,
        "names": names,
        "seasons": seasons,
        "keys": keys,
        "grades": grades,
        "by": {(names[i], seasons[i]): grades[i] for i in range(len(names))},
        "asset": out / ASSET,
    }


def test_six_wide_skills(built):
    assert built["keys"] == [
        "post",
        "transition",
        "motor",
        "shooting_gravity",
        "rim_gravity",
        "disruption_gravity",
    ], built["keys"]


@pytest.mark.xfail(strict=True, reason=PROXY_CACHES)
def test_every_covered_row_is_2015_16_or_later(built):
    early = sorted({s for s in built["seasons"] if int(s[:4]) < 2015})
    assert not early, f"rows before 2015-16 are covered (should be masked): seasons {early}"


def test_grades_in_bounds(built):
    g = built["grades"]
    assert g.min() >= 0 and g.max() <= 99, f"grades span [{g.min()}, {g.max()}]"


SPOTS_HIGH = [
    ("Joel Embiid", "2022-23", "post", 80),
    ("Nikola Jokić", "2022-23", "post", 60),
    ("Giannis Antetokounmpo", "2022-23", "transition", 80),
    ("Draymond Green", "2022-23", "motor", 80),
    ("Draymond Green", "2015-16", "motor", 80),
    # Track K — the two gravities, checked against the canonical examples:
    # Curry tops SHOOTING gravity (movement/pull-up 3s), Wembanyama tops
    # RIM gravity (interior deterrence); each is low on the other axis.
    ("Stephen Curry", "2015-16", "shooting_gravity", 85),
    ("Stephen Curry", "2023-24", "shooting_gravity", 85),
    ("Victor Wembanyama", "2023-24", "rim_gravity", 85),
    ("Rudy Gobert", "2023-24", "rim_gravity", 60),
    # Perimeter disruption gravity — steals + deflections + charges.
    ("Marcus Smart", "2015-16", "disruption_gravity", 85),
    ("Draymond Green", "2022-23", "disruption_gravity", 75),
]

SPOTS_LOW = [
    ("Stephen Curry", "2015-16", "rim_gravity", 50),
    ("DeAndre Jordan", "2015-16", "shooting_gravity", 30),  # never shoots
    ("Anthony Edwards", "2023-24", "rim_gravity", 50),  # not a rim protector
    ("DeAndre Jordan", "2015-16", "disruption_gravity", 40),
    ("Rudy Gobert", "2023-24", "disruption_gravity", 45),
]


def _grade(built, name, season, skill) -> int:
    # rows carry vectors.json display names (ASCII-folded)
    row = built["by"].get((canonical_name(name), season))
    assert row is not None, f"{canonical_name(name)} {season} not covered"
    return int(row[built["keys"].index(skill)])


@pytest.mark.parametrize(("name", "season", "skill", "floor"), SPOTS_HIGH)
def test_face_validity_high(built, name, season, skill, floor):
    got = _grade(built, name, season, skill)
    assert got >= floor, f"{name} {season} {skill} {got} < {floor}"


@pytest.mark.parametrize(("name", "season", "skill", "ceil"), SPOTS_LOW)
def test_face_validity_low(built, name, season, skill, ceil):
    got = _grade(built, name, season, skill)
    assert got <= ceil, f"{name} {season} {skill} {got} > {ceil}"


def test_mask_honesty_coverage(built):
    if built["real"]:
        assert len(built["names"]) > 500, f"real caches cover only {len(built['names'])} rows"
    else:
        assert len(built["names"]) == 18, f"fixture emits {len(built['names'])} rows, want 18"
        assert not built["asset"].exists(), "partial cache wrote assets/skills_wide.json"


@pytest.mark.xfail(strict=True, reason=PROXY_CACHES)
def test_real_caches_write_the_game_asset(built):
    # Only the two proxy docs carry complete=False; every 2015-16+ cache is complete.
    if not built["real"]:
        pytest.skip("fixture mode: the partial fixture must not write the asset (checked above)")
    assert built["asset"].exists(), "real caches did not write assets/skills_wide.json (merged cache not complete)"


if __name__ == "__main__":
    # Script form for update_dataset.py / export_assets.py / train.sh /
    # rebuild_all.py, which read only the exit code. --runxfail: a known defect
    # still fails here, as it did before this was pytest.
    os.environ.setdefault("HOOPS_REQUIRE_LOCAL_DATA", "1")
    sys.exit(pytest.main([__file__, "-p", "no:cacheprovider", "--runxfail"]))

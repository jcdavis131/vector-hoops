"""Track J (wide skills) invariant gates — run after build_wide_skills.py.

Uses real caches when present, else the committed fixture. Rebuilds into a
tmp --out-root (never pipeline/data or assets) so it always gates fresh
logic, then checks coverage era (2015-16+ only), grade bounds, face-validity
directionality (post hubs, sprinters, motor guys), and mask honesty (partial
cache writes no game asset).

The rebuild used to write pipeline/data/wide_skill_labels.npz in place.
Measured on 90ef66a4, one run of this gate replaced the Jul 30 labels (train_mtnn
reads them as skill-tower targets) with a build that includes the 2013-14 and
2014-15 proxy caches. Those two docs are deleted and build_wide_skills refuses
any proxy doc [ingest#5], so the two strict xfails that pinned the defect are
plain tests again.

Run:  python -m pytest pipeline/test_wide_skills.py
      python pipeline/test_wide_skills.py       (same tests; exit 0 = all gates pass)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from hustle_coverage import HUSTLE_FIELDS  # noqa: E402
from name_utils import canonical_name  # noqa: E402

CACHE_DIR = ROOT / "pipeline" / "cache"
LABELS = Path("pipeline") / "data" / "wide_skill_labels.npz"
ASSET = Path("assets") / "skills_wide.json"


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
    mask = npz["mask"] > 0.5
    return {
        "real": real,
        "names": names,
        "seasons": seasons,
        "keys": keys,
        "grades": grades,
        "mask": mask,
        "by": {(names[i], seasons[i]): grades[i] for i in range(len(names))},
        "mask_by": {(names[i], seasons[i]): mask[i] for i in range(len(names))},
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


def test_every_covered_row_is_2015_16_or_later(built):
    early = sorted({s for s in built["seasons"] if int(s[:4]) < 2015})
    assert not early, f"rows before 2015-16 are covered (should be masked): seasons {early}"


def test_grades_in_bounds(built):
    g = built["grades"]
    assert g.min() >= 0 and g.max() <= 99, f"grades span [{g.min()}, {g.max()}]"
    assert not built["grades"][~built["mask"]].any(), "a masked cell carries a grade"


# 2015-16 hustle was only partly tracked: box-outs 0 for 476/476 players, 329
# players 0 on all six fields, all written as measured zeros [ingest#2,
# features#3]. Since 25b3c10f a 2015-16 hustle 0.0 is missing and a non-zero
# value stays (it was measured), so a hustle skill there is graded only on
# the rows whose inputs the endpoint returned, never from zeros. The 2015-16
# spot checks below moved to 2016-17.
HUSTLE_SKILLS = ("motor", "rim_gravity", "disruption_gravity")


def test_hustle_skills_are_masked_where_hustle_was_not_measured(built):
    if not built["real"]:
        pytest.skip("fixture mode")
    cache = json.loads((CACHE_DIR / "wide_skills_2015-16.json").read_text(encoding="utf-8"))
    measured_2015 = sum(1 for rec in cache["players"].values() if any(rec.get(f) is not None for f in HUSTLE_FIELDS))
    seasons = np.array(built["seasons"])
    for skill in HUSTLE_SKILLS:
        j = built["keys"].index(skill)
        graded_2015 = int(built["mask"][seasons == "2015-16", j].sum())
        assert 0 < graded_2015 <= measured_2015, (
            f"{skill}: {graded_2015} rows graded in 2015-16, but only {measured_2015} players have a measured hustle value"
        )
        assert built["mask"][seasons == "2016-17", j].mean() > 0.99, f"{skill} mostly masked in 2016-17"
    # Synergy and pull-up skills keep 2015-16.
    for skill in ("post", "transition", "shooting_gravity"):
        assert built["mask"][seasons == "2015-16", built["keys"].index(skill)].all()


SPOTS_HIGH = [
    ("Joel Embiid", "2022-23", "post", 80),
    ("Nikola Jokić", "2022-23", "post", 60),
    ("Giannis Antetokounmpo", "2022-23", "transition", 80),
    ("Draymond Green", "2022-23", "motor", 80),
    ("Draymond Green", "2016-17", "motor", 80),
    # Track K — the two gravities, checked against the canonical examples:
    # Curry tops SHOOTING gravity (movement/pull-up 3s), Wembanyama tops
    # RIM gravity (interior deterrence); each is low on the other axis.
    ("Stephen Curry", "2015-16", "shooting_gravity", 85),
    ("Stephen Curry", "2023-24", "shooting_gravity", 85),
    ("Victor Wembanyama", "2023-24", "rim_gravity", 85),
    ("Rudy Gobert", "2023-24", "rim_gravity", 60),
    # Perimeter disruption gravity — steals + deflections + charges.
    ("Marcus Smart", "2016-17", "disruption_gravity", 85),
    ("Draymond Green", "2022-23", "disruption_gravity", 75),
]

SPOTS_LOW = [
    ("Stephen Curry", "2016-17", "rim_gravity", 50),
    ("DeAndre Jordan", "2015-16", "shooting_gravity", 30),  # never shoots
    ("Anthony Edwards", "2023-24", "rim_gravity", 50),  # not a rim protector
    ("DeAndre Jordan", "2016-17", "disruption_gravity", 40),
    ("Rudy Gobert", "2023-24", "disruption_gravity", 45),
]


def _grade(built, name, season, skill) -> int:
    # rows carry vectors.json display names (ASCII-folded)
    row = built["by"].get((canonical_name(name), season))
    assert row is not None, f"{canonical_name(name)} {season} not covered"
    j = built["keys"].index(skill)
    assert built["mask_by"][(canonical_name(name), season)][j], f"{name} {season} {skill} is masked"
    return int(row[j])


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


def test_real_caches_write_the_game_asset(built):
    # The two proxy docs were the only ones with complete=False; every 2015-16+ cache is complete.
    if not built["real"]:
        pytest.skip("fixture mode: the partial fixture must not write the asset (checked above)")
    assert built["asset"].exists(), "real caches did not write assets/skills_wide.json (merged cache not complete)"


if __name__ == "__main__":
    # Script form for update_dataset.py / export_assets.py / train.sh /
    # rebuild_all.py, which read only the exit code. --runxfail: a known defect
    # still fails here, as it did before this was pytest.
    os.environ.setdefault("HOOPS_REQUIRE_LOCAL_DATA", "1")
    sys.exit(pytest.main([__file__, "-p", "no:cacheprovider", "--runxfail"]))

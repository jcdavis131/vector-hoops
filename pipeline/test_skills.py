"""Skills Lens invariant gates — run after every build_skills.py.

Gates (docs/SKILLS_LENS.md section 5): alignment with the frozen game
contract, grade bounds, era honesty (every season pool carries the same
grade distribution), discriminative spread, probe round-trip fidelity,
and curated face-validity spot checks.

Tracked assets only, so these run in CI.

Run:  python -m pytest pipeline/test_skills.py
      python pipeline/test_skills.py        (same tests; exit 0 = all gates pass)
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from name_utils import canonical_name  # noqa: E402

VECTORS = ROOT / "assets" / "vectors.json"
SKILLS = ROOT / "assets" / "skills.json"
PROBE = ROOT / "assets" / "skill_probe.json"


@pytest.fixture(scope="module")
def lens() -> dict:
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    sk = json.loads(SKILLS.read_text(encoding="utf-8"))
    probe = json.loads(PROBE.read_text(encoding="utf-8"))
    grades = np.array(sk["grades"], dtype=np.int64)
    return {
        "vec": vec,
        "players": vec["players"],
        "probe": probe,
        "grades": grades,
        "keys": [s["key"] for s in sk["skills"]],
        "by_name_season": {(p["name"], p["season"]): grades[i] for i, p in enumerate(vec["players"])},
    }


def test_alignment(lens):
    n, k = lens["grades"].shape
    assert n == len(lens["players"]), f"grades rows {n} vs vectors players {len(lens['players'])}"
    assert k == len(lens["keys"]) == 12, f"{k} skills"
    assert lens["probe"]["skills"] == lens["keys"], "probe skill order differs from skills.json"
    assert lens["probe"]["features"] == lens["vec"]["features"], "probe feature order differs from the contract"


def test_grades_in_bounds(lens):
    g = lens["grades"]
    assert int(g.min()) >= 0 and int(g.max()) <= 99, f"grades span [{int(g.min())}, {int(g.max())}]"


def test_era_honesty(lens):
    grades = lens["grades"]
    seasons = np.array([p["season"] for p in lens["players"]])
    bad_mean, bad_std = [], []
    for s in sorted(set(seasons.tolist())):
        g = grades[seasons == s]
        means = g.mean(axis=0)
        if not (42 <= means.min() and means.max() <= 58):
            bad_mean.append(s)
        if g.std(axis=0).min() < 20:
            bad_std.append(s)
    assert not bad_mean, f"per-season mean grade outside [42, 58] in {bad_mean}"
    assert not bad_std, f"a skill's per-season grade std < 20 in {bad_std}"


def test_probe_round_trip(lens):
    # The probe grades vs the pooled ALL-ERA distribution (the right pool
    # for fused chimera vectors); season grades use the season pool. So the
    # gates are: (a) interpolation fidelity vs the exact pooled percentile,
    # (b) rank agreement with season grades.
    probe, grades, keys = lens["probe"], lens["grades"], lens["keys"]
    n = grades.shape[0]
    V = np.array([p["v"] for p in lens["players"]], dtype=np.float64)
    W = np.array(probe["W"], dtype=np.float64)
    scores = V @ W.T
    knots_p = np.linspace(0.0, 100.0, len(next(iter(probe["quantiles"].values()))))
    worst_fid, corr = 0.0, {}
    for j, key in enumerate(keys):
        q = np.array(probe["quantiles"][key], dtype=np.float64)
        est = np.clip(np.interp(scores[:, j], q, knots_p), 0, 99)
        exact = np.clip((scores[:, j].argsort().argsort() + 0.5) / n * 100.0, 0, 99)
        worst_fid = max(worst_fid, float(np.abs(est - exact).max()))
        corr[key] = float(np.corrcoef(est, grades[:, j])[0, 1])
    assert worst_fid <= 1.0, f"probe more than 1 pt from the exact pooled percentile (worst {worst_fid:.2f})"
    low = {k: round(r, 4) for k, r in corr.items() if r < 0.978}
    assert not low, f"probe vs season-grade corr < 0.978 for {low}"


SPOTS = [
    ("Stephen Curry", "2015-16", "shooting", 95),
    ("Shaquille O'Neal", "1999-00", "finishing", 95),
    ("John Stockton", "1996-97", "playmaking", 95),
    ("Dennis Rodman", "1996-97", "dreb", 95),
    ("Dikembe Mutombo", "1996-97", "rim", 95),
    ("Michael Jordan", "1996-97", "scoring", 95),
    ("Chris Paul", "2008-09", "hands", 90),
    ("Steve Nash", "2005-06", "ft", 90),
]


@pytest.mark.parametrize(("name", "season", "skill", "floor"), SPOTS)
def test_face_validity(lens, name, season, skill, floor):
    row = lens["by_name_season"].get((canonical_name(name), season))
    assert row is not None, f"{canonical_name(name)} {season} not in vectors.json"
    got = int(row[lens["keys"].index(skill)])
    assert got >= floor, f"{name} {season} {skill} {got} < {floor}"


if __name__ == "__main__":
    # Script form for update_dataset.py / export_assets.py / train.sh, which read
    # only the exit code. --runxfail: a known defect still fails here.
    os.environ.setdefault("HOOPS_REQUIRE_LOCAL_DATA", "1")
    sys.exit(pytest.main([__file__, "-p", "no:cacheprovider", "--runxfail"]))

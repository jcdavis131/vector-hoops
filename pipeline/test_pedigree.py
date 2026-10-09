"""Track H (pedigree) invariant gates — run after every build_pedigree.py.

Uses the real draft cache when present, else the committed hand-checked
fixture (pipeline/cache/draft_history.example.json). The test rebuilds
pedigree.json itself, into a tmp --out-root (never pipeline/data or assets),
so it always gates fresh derivation logic, then checks: known-pick joins
(including the Tim Hardaway Sr/Jr name collision), leak-free per-player
constancy, decay monotonicity, the stated expectation curve, and mask
honesty (a partial cache must never label anyone undrafted).

The rebuild used to write pipeline/data/pedigree.json and assets/pedigree.json
in place, so running this gate rewrote a training input and a tracked asset.

Run:  python -m pytest pipeline/test_pedigree.py
      python pipeline/test_pedigree.py        (same tests; exit 0 = all gates pass)
"""

from __future__ import annotations

import itertools
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from build_pedigree import expect_slot  # noqa: E402
from name_utils import canonical_name  # noqa: E402

CACHE = ROOT / "pipeline" / "cache" / "draft_history.json"
PEDIGREE = Path("pipeline") / "data" / "pedigree.json"

# Measured on 90ef66a4 with the real cache: the row 'Tim Hardaway Jr.' 2013-14
# comes out PED_UNDRAFTED=1.0, PED_PICK_QUALITY=None, though he was the #24 pick
# in 2013. fetch_draft_history keys the cache with a suffix-stripping norm_name,
# build_pedigree looks it up with name_utils.norm_name, which keeps "jr", so
# suffix-bearing draftees miss and are written as confidently undrafted.
SUFFIX_JOIN = "[health#3] draft cache keys strip Jr/II/III, the pedigree lookup keeps them: Hardaway Jr. 'undrafted'"


@pytest.fixture(scope="module")
def built(tmp_path_factory) -> dict:
    """Re-derive pedigree.json under a tmp out-root, from the REAL cache when present."""
    out = tmp_path_factory.mktemp("pedigree")
    real = CACHE.exists()
    cmd = [sys.executable, "pipeline/build_pedigree.py", "--out-root", str(out)] + ([] if real else ["--fixture"])
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, errors="replace")
    assert proc.returncode == 0, f"build_pedigree.py failed:\n{proc.stdout}{proc.stderr}"
    doc = json.loads((out / PEDIGREE).read_text(encoding="utf-8"))
    covered = [r for r in doc["players"] if "PED_UNDRAFTED" in r]
    per_player: dict[str, list[dict]] = {}
    for r in covered:
        per_player.setdefault(r["name"], []).append(r)
    for prs in per_player.values():
        prs.sort(key=lambda r: r["season"])
    return {
        "real": real,
        "doc": doc,
        # Rows carry vectors.json display names, which keep suffix punctuation
        # since d2a16d37 ('Tim Hardaway Jr.'), while canonical_name drops it
        # ('Tim Hardaway Jr'). Fold both sides so a spot check finds its row.
        "by": {(canonical_name(r["name"]), r["season"]): r for r in covered},
        "per_player": per_player,
    }


SPOTS = [
    ("LeBron James", "2003-04", "PED_PICK_QUALITY", 60),
    ("LeBron James", "2003-04", "PED_EXPECT_SLOT", 1.0),
    ("LeBron James", "2003-04", "PED_TEAM_WINPCT", 0.207),  # 17-65 Cavs
    ("LeBron James", "2003-04", "PED_PICK_DECAY", 1.0),
    ("Nikola Jokić", "2015-16", "PED_PICK_QUALITY", 20),  # pick 41, accent-fold join
    ("Nikola Jokić", "2015-16", "PED_ROUND_ONE", 0.0),
    ("Nikola Jokić", "2015-16", "PED_EXPECT_SLOT", 0.10),
    ("Nikola Jokić", "2015-16", "PED_TEAM_WINPCT", 0.439),
    ("Kobe Bryant", "1996-97", "PED_PICK_QUALITY", 48),
    ("Kobe Bryant", "1996-97", "PED_TEAM_WINPCT", None),  # 1996 draft: pre-cache, masked
    # name-collision disambiguation: two "tim hardaway" draft records
    ("Tim Hardaway", "1996-97", "PED_PICK_QUALITY", 47),  # Sr, #14 1989
    pytest.param(
        "Tim Hardaway Jr.",
        "2013-14",
        "PED_PICK_QUALITY",
        37,  # Jr, #24 2013
        marks=pytest.mark.xfail(strict=True, reason=SUFFIX_JOIN),
    ),
    pytest.param(
        "Tim Hardaway Jr.",
        "2013-14",
        "PED_TEAM_WINPCT",
        0.659,
        marks=pytest.mark.xfail(strict=True, reason=SUFFIX_JOIN),
    ),
]


@pytest.mark.parametrize(("name", "season", "field", "want"), SPOTS)
def test_known_pick_joins(built, name, season, field, want):
    r = built["by"].get((canonical_name(name), season))
    assert r is not None, f"{name} {season} not covered"
    got = r.get(field)
    ok = (got is None and want is None) or (got is not None and want is not None and abs(got - want) <= 1e-6)
    assert ok, f"{name} {season} {field} == {want} (got {got})"


STATIC_FIELDS = [
    "PED_PICK_QUALITY",
    "PED_ROUND_ONE",
    "PED_UNDRAFTED",
    "PED_EXPECT_SLOT",
    "PED_TEAM_WINPCT",
]


def test_draft_time_fields_constant_across_every_career(built):
    drift = [
        name
        for name, prs in built["per_player"].items()
        if any(len({json.dumps(r.get(f)) for r in prs}) != 1 for f in STATIC_FIELDS)
    ]
    assert not drift, f"draft-time fields vary across seasons for {len(drift)} players, e.g. {drift[:5]}"


def test_pick_decay_non_increasing_over_a_career(built):
    bad = [
        name
        for name, prs in built["per_player"].items()
        if any(b > a + 1e-9 for a, b in itertools.pairwise(r["PED_PICK_DECAY"] for r in prs))
    ]
    assert not bad, f"PED_PICK_DECAY increases for {bad[:5]}"


def test_years_since_non_decreasing_over_a_career(built):
    bad = [
        name
        for name, prs in built["per_player"].items()
        if any(b < a for a, b in itertools.pairwise(r["PED_YEARS_SINCE"] for r in prs))
    ]
    assert not bad, f"PED_YEARS_SINCE decreases for {bad[:5]}"


def test_expectation_curve():
    slots = [expect_slot(p) for p in range(1, 61)]
    assert slots[0] == 1.0, "expect_slot(1) != 1.0"
    assert all(a >= b - 1e-9 for a, b in itertools.pairwise(slots)), "expect_slot increases somewhere in pick"
    assert all(abs(s - 0.10) < 1e-9 for s in slots[30:]), "round-2 picks do not share the flat 0.10 slot"


def test_mask_honesty(built):
    doc, per_player = built["doc"], built["per_player"]
    if built["real"]:
        n_players = len(per_player)
        n_undrafted = sum(1 for prs in per_player.values() if prs[0]["PED_UNDRAFTED"] == 1.0)
        total_players = (
            doc["coverage"]["players_drafted"]
            + doc["coverage"]["players_undrafted"]
            + doc["coverage"]["players_unmatched_masked"]
        )
        cov = (doc["coverage"]["players_drafted"] + doc["coverage"]["players_undrafted"]) / max(total_players, 1)
        assert cov >= 0.95, f"complete cache resolves only {cov:.3f} of players"
        assert 0.03 <= n_undrafted / max(n_players, 1) <= 0.45, f"undrafted share {n_undrafted}/{n_players}"
    else:
        assert doc["coverage"]["players_undrafted"] == 0, "partial cache labelled someone undrafted"
        assert doc["coverage"]["players_unmatched_masked"] > 0, "partial cache left no unmatched player masked"


if __name__ == "__main__":
    # Script form for update_dataset.py / export_assets.py / the operator fetch
    # script, which read only the exit code. --runxfail: a known defect still
    # fails here, as it did before this was pytest.
    os.environ.setdefault("HOOPS_REQUIRE_LOCAL_DATA", "1")
    sys.exit(pytest.main([__file__, "-p", "no:cacheprovider", "--runxfail"]))

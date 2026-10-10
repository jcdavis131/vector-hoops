"""Track I (playoffs) invariant gates — run after every build_playoffs.py.

Uses the real per-season caches when present, else the committed
hand-checked fixture. Rebuilds playoffs.json into a tmp --out-root (never
pipeline/data or assets) so it always gates fresh derivation logic, then
checks: known joins + delta directionality (real risers positive, faders
negative), minutes/usage elevation sanity, wins/rounds bounds, champion
consistency, and mask honesty (a partial cache must never fabricate a
non-appearance).

The rebuild used to write pipeline/data/playoffs.json, assets/playoffs.json and
assets/playoff_paths.json in place, so running this gate rewrote a training
input and two tracked assets.

Run:  python -m pytest pipeline/test_playoffs.py
      python pipeline/test_playoffs.py        (same tests; exit 0 = all gates pass)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from nba_http import real_playoff_cache_paths  # noqa: E402

CACHE_DIR = ROOT / "pipeline" / "cache"
PLAYOFFS = Path("pipeline") / "data" / "playoffs.json"
ASSET = Path("assets") / "playoffs.json"
PATHS_ASSET = Path("assets") / "playoff_paths.json"
# Read, never written: build_honors owns it, and this gate only audits Finals MVP.
HONORS_ASSET = ROOT / "assets" / "honors.json"


@pytest.fixture(scope="module")
def built(tmp_path_factory) -> dict:
    """Re-derive playoffs.json under a tmp out-root, from REAL caches when present."""
    out = tmp_path_factory.mktemp("playoffs")
    real = bool(real_playoff_cache_paths(CACHE_DIR))
    cmd = [sys.executable, "pipeline/build_playoffs.py", "--out-root", str(out)] + ([] if real else ["--fixture"])
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, errors="replace")
    assert proc.returncode == 0, f"build_playoffs.py failed:\n{proc.stdout}{proc.stderr}"
    doc = json.loads((out / PLAYOFFS).read_text(encoding="utf-8"))
    return {
        "real": real,
        "doc": doc,
        "rows": doc["players"],
        "by": {(r["name"], r["season"]): r for r in doc["players"]},
        "asset": out / ASSET,
        "paths_asset": out / PATHS_ASSET,
    }


def field(built, name, season, f):
    r = built["by"].get((name, season))
    return None if r is None else r.get(f)


# Legendary playoff RISERS — PO_PTS_DELTA must be positive
@pytest.mark.parametrize(
    ("name", "season"),
    [
        ("Kawhi Leonard", "2018-19"),
        ("Jamal Murray", "2022-23"),
        ("Kevin Durant", "2016-17"),
        ("Nikola Jokic", "2022-23"),
    ],
)
def test_riser(built, name, season):
    v = field(built, name, season, "PO_PTS_DELTA")
    assert v is not None and v > 0, f"{name} {season} riser (PO_PTS_DELTA {v} > 0)"


# Known playoff FADERS — negative
@pytest.mark.parametrize(("name", "season"), [("James Harden", "2018-19"), ("Stephen Curry", "2015-16")])
def test_fader(built, name, season):
    v = field(built, name, season, "PO_PTS_DELTA")
    assert v is not None and v < 0, f"{name} {season} fader (PO_PTS_DELTA {v} < 0)"


def test_role_elevation_and_rounds(built):
    # Playoff minutes generally rise for rotation stars
    kawhi_min = field(built, "Kawhi Leonard", "2018-19", "PO_MIN_DELTA")
    assert kawhi_min is not None and kawhi_min > 0, f"Kawhi 2018-19 PO_MIN_DELTA {kawhi_min}"
    # Champions: 16 wins / 4 rounds (modern) OR 15 wins / 4 rounds (pre-2003 R1 best-of-5)
    assert field(built, "Kawhi Leonard", "2018-19", "PO_TEAM_WINS") == 16.0, "champion Kawhi 2018-19: 16 wins"
    assert field(built, "Kawhi Leonard", "2018-19", "PO_ROUNDS") == 4.0, "champion Kawhi 2018-19: 4 rounds"
    assert field(built, "James Harden", "2018-19", "PO_ROUNDS") == 1.0, "R2-exit Harden 2018-19: rounds == 1"


def test_jordan_pre_2003_champion_and_series_path(built):
    # Pre-2003 champions finished with 15 wins — must still be rounds=4 (Champion),
    # not 3 (Conf finals). Regression guard for Jordan 1997-98 screenshot bug.
    if not (built["real"] and ("Michael Jordan", "1997-98") in built["by"]):
        pytest.skip("needs the real playoff caches covering Jordan 1997-98")
    assert field(built, "Michael Jordan", "1997-98", "PO_TEAM_WINS") == 15.0
    assert field(built, "Michael Jordan", "1997-98", "PO_ROUNDS") == 4.0, "best-of-5 R1 era champion: rounds 4"
    # Series path. A bare `return` here passed the test whenever the asset was
    # missing, so the series, Finals MVP and game-log checks below could be
    # skipped silently. The asset is written only from a complete cache.
    if not built["doc"]["cache_complete"]:
        pytest.skip("real playoff caches are partial (cache_complete false), so no series asset is written")
    assert built["asset"].exists(), "complete real caches cover Jordan 1997-98 but assets/playoffs.json was not written"
    asset = json.loads(built["asset"].read_text(encoding="utf-8"))
    mj = asset["splits"].get("Michael Jordan|1997-98") or {}
    series = mj.get("series") or []
    assert len(series) == 4, f"Jordan 1997-98 series path length {len(series)}"
    assert series[-1].get("opp") == "UTA" and series[-1].get("result") == "4-2", "Jordan 1997-98 Finals vs UTA 4-2"
    assert mj.get("champion") is True or mj.get("rounds") == 4, "Jordan 1997-98 champion flag / rounds=4"
    # Outcome must not be confusable: last series is Finals, not Conf finals
    assert series[-1].get("label") in ("Finals", "NBA Finals") and series[-1].get("finals") is True
    for season in ("1996-97", "1997-98"):
        row = asset["splits"].get(f"Michael Jordan|{season}") or {}
        assert row.get("rounds") == 4, f"Jordan {season} rounds {row.get('rounds')}, want 4 (Champion)"
        ser = row.get("series") or []
        assert len(ser) == 4, f"Jordan {season} series path has {len(ser)} rounds"
        assert ser and ser[-1].get("label") in ("Finals", "NBA Finals"), (
            f"Jordan {season} terminal series is {ser[-1].get('label') if ser else None}, not Finals"
        )
        # Conf finals may appear as an earlier path step — never as the outcome.
        assert not (ser and ser[-1].get("label") == "Conf finals"), f"Jordan {season} ends on Conf finals"

    assert HONORS_ASSET.exists(), "assets/honors.json missing for the Finals MVP audit"
    honors = json.loads(HONORS_ASSET.read_text(encoding="utf-8")).get("bySeason") or {}
    for season in ("1996-97", "1997-98"):
        h = honors.get(f"Michael Jordan|{season}") or {}
        assert h.get("finalsMvp") == 1, f"Jordan {season} Finals MVP missing from the honors asset"

    assert built["paths_asset"].exists(), "assets/playoff_paths.json not written though game logs are cached"
    paths = json.loads(built["paths_asset"].read_text(encoding="utf-8")).get("paths") or {}
    games = (paths.get("Michael Jordan|1997-98") or {}).get("games") or []
    assert len(games) == 21, f"Jordan 1997-98 game log has {len(games)} games, want 21"
    assert games[-1].get("pts") == 45 and "UTA" in (games[-1].get("m") or ""), "Game 6 Finals: 45 pts @ UTA"


def test_bounds(built):
    wins_ok, rounds_ok, gp_ok = True, True, True
    for r in built["rows"]:
        w, rd, gp = r.get("PO_TEAM_WINS"), r.get("PO_ROUNDS"), r.get("PO_GP")
        if w is not None and not (0 <= w <= 16):
            wins_ok = False
        if rd is not None and not (0 <= rd <= 4):
            rounds_ok = False
        if gp is not None and gp < 1:
            gp_ok = False
    assert wins_ok, "PO_TEAM_WINS outside [0, 16] on some covered row"
    assert rounds_ok, "PO_ROUNDS outside [0, 4] on some covered row"
    assert gp_ok, "a covered row has PO_GP < 1 (rows are appearance-only)"


def test_mask_honesty(built):
    doc, rows = built["doc"], built["rows"]
    if built["real"]:
        cov = doc["coverage"]["appearances"]
        assert cov > 1000, f"real caches cover only {cov} appearances"
        assert built["asset"].exists(), "complete cache did not write the transparent assets/playoffs.json"
    else:
        # Partial fixture: only the hand-listed appearances, nothing fabricated,
        # and the game asset must NOT be written from partial data.
        assert doc["cache_complete"] is False, "fixture not marked incomplete"
        assert doc["coverage"]["appearances"] == len(rows) == 8, f"fixture emits {len(rows)} appearances, want 8"
        assert not built["asset"].exists(), "partial cache wrote assets/playoffs.json"


if __name__ == "__main__":
    # Script form for update_dataset.py / export_assets.py / the operator fetch
    # script, which read only the exit code. --runxfail: a known defect still
    # fails here, as it did before this was pytest.
    os.environ.setdefault("HOOPS_REQUIRE_LOCAL_DATA", "1")
    sys.exit(pytest.main([__file__, "-p", "no:cacheprovider", "--runxfail"]))

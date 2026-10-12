"""Track L (game ratings) invariant gates — run after build_game_ratings.py.

Builds the committed 2K fixture into a tmp --out-root and checks the builder's
fixture-mode contract: the hand-entered rows join, and a partial (complete:
false) cache never writes the game asset.

This used to run `build_game_ratings.py --fixture` in place, which wrote the
fixture's hand-entered rows over pipeline/data/game_ratings.json, a file
integrate_context reads into the training matrix. Fixtures belong in tests;
now the output only ever lands in a tmp dir.

Run:  python -m pytest pipeline/test_game_ratings.py
      python pipeline/test_game_ratings.py       (same tests; exit 0 = all gates pass)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
DATA = Path("pipeline") / "data" / "game_ratings.json"
ASSET = Path("assets") / "game_ratings.json"


@pytest.fixture(scope="module")
def built(tmp_path_factory) -> dict:
    out = tmp_path_factory.mktemp("game_ratings")
    proc = subprocess.run(
        [sys.executable, "pipeline/build_game_ratings.py", "--fixture", "--out-root", str(out)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        errors="replace",
    )
    assert proc.returncode == 0, f"build_game_ratings.py failed:\n{proc.stdout}{proc.stderr}"
    doc = json.loads((out / DATA).read_text(encoding="utf-8"))
    return {"rows": doc.get("players", doc.get("rows", [])), "asset": out / ASSET}


def test_fixture_rows_join(built):
    rows = built["rows"]
    assert len(rows) >= 2, f"fixture covers {len(rows)} rows"
    curry = next((r for r in rows if "Curry" in r["name"]), None)
    assert curry is not None and curry.get("GK_THREE_PT", 0) >= 95, (
        f"Curry three_pt {curry.get('GK_THREE_PT') if curry else None}"
    )
    wemby = next((r for r in rows if "Wembanyama" in r["name"]), None)
    assert wemby is not None and wemby.get("GK_BLOCK", 0) >= 95, (
        f"Wembanyama block {wemby.get('GK_BLOCK') if wemby else None}"
    )


def test_partial_fixture_does_not_write_the_game_asset(built):
    assert not built["asset"].exists(), "partial fixture wrote assets/game_ratings.json"


if __name__ == "__main__":
    # Script form for export_assets.py, which reads only the exit code.
    os.environ.setdefault("HOOPS_REQUIRE_LOCAL_DATA", "1")
    sys.exit(pytest.main([__file__, "-p", "no:cacheprovider", "--runxfail"]))

"""Pytest wrapper for the Daily Court REFRESH-PROOF fuzz suite.

ux-revamp PLAN §6: 1,000 serialize→reload→render runs, zero divergences.
The real test lives in tests/daily-refresh-proof.test.mjs (run it directly
with `node --test tests/daily-refresh-proof.test.mjs`); this file puts it on
the repo's pytest lane (`pytest -m "not local_data"`) so the offline-build CI
job picks it up. Node ships on the ubuntu-latest runner; anywhere node is
missing, the test skips instead of failing the build.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
MJS = ROOT / "tests" / "daily-refresh-proof.test.mjs"


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_daily_refresh_proof() -> None:
    assert MJS.exists(), f"fuzz suite missing: {MJS}"
    proc = subprocess.run(
        ["node", "--test", str(MJS)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert proc.returncode == 0, (
        f"daily-refresh-proof fuzz test failed:\n--- stdout ---\n{proc.stdout}\n--- stderr ---\n{proc.stderr}"
    )

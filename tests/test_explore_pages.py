"""Node suites for the season / team / game / compare pages, on the pytest lane."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")

SUITES = (
    "seasons.test.mjs",
    "teams-page.test.mjs",
    "games.test.mjs",
    "compare.test.mjs",
)


@pytest.mark.parametrize("suite", SUITES)
def test_explore_node_suite(suite: str) -> None:
    proc = subprocess.run(
        ["node", "--test", f"tests/{suite}"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert proc.returncode == 0, proc.stdout[-4000:] + proc.stderr[-2000:]

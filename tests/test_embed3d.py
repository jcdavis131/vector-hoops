"""Embed3D kit (wave 1, task 1.4): tests/embed3d.test.mjs on the pytest lane.

Option parsing, the chrome per variant (home / game / live), setDim / overlay / setGroups,
the colour token read and its re-read on a scheme change, the loading and error states.
Skips where node is missing.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")


def test_embed3d_node_suite() -> None:
    proc = subprocess.run(
        ["node", "--test", "tests/embed3d.test.mjs"], cwd=ROOT, capture_output=True, text=True, timeout=300
    )
    assert proc.returncode == 0, proc.stdout[-4000:] + proc.stderr[-2000:]

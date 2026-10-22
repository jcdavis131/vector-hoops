"""Pixel Replay coordinate model: tests/replay_model.test.mjs on the pytest lane.

Role lookup (NBA ids and ESPN full names) and, once assets/replay-model.json ships, the browser
forward pass against the trained torch model's own answers. Skips where node is missing.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")


def test_replay_model_node_suite() -> None:
    proc = subprocess.run(
        ["node", "--test", "tests/replay_model.test.mjs"], cwd=ROOT, capture_output=True, text=True, timeout=300
    )
    assert proc.returncode == 0, proc.stdout[-4000:] + proc.stderr[-2000:]

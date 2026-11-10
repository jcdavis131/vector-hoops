"""Runs the node unit tests for feed-health.html's staleness rule."""

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_feed_health_node_units() -> None:
    proc = subprocess.run(
        ["node", "--test", str(ROOT / "tests" / "feed_health.test.mjs")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert proc.returncode == 0, proc.stdout[-2000:] + proc.stderr[-2000:]

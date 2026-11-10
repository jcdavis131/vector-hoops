"""Runs the node unit tests for the /schedule page renderer."""

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_schedule_node_units() -> None:
    proc = subprocess.run(
        ["node", "--test", str(ROOT / "tests" / "schedule.test.mjs")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert proc.returncode == 0, proc.stdout[-2000:] + proc.stderr[-2000:]

"""Runs the node unit test for status.html's snapshot-age sentence."""

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_status_age_node_units() -> None:
    proc = subprocess.run(
        ["node", "--test", str(ROOT / "tests" / "status_age.test.mjs")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert proc.returncode == 0, proc.stdout[-2000:] + proc.stderr[-2000:]

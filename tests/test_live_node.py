"""Runs the node unit tests for Courtside Live's name matching and game phase."""

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_live_node_units() -> None:
    files = [str(ROOT / "tests" / f) for f in ("live_atlas_match.test.mjs", "live_phase.test.mjs")]
    proc = subprocess.run(["node", "--test", *files], cwd=ROOT, capture_output=True, text=True, timeout=120)
    assert proc.returncode == 0, proc.stdout[-2000:] + proc.stderr[-2000:]

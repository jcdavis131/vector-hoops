"""Runs the node unit tests for the cdn.nba.com proxy (api/nba/[feed].js)."""

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_nba_proxy_node_units() -> None:
    files = [str(ROOT / "tests" / "nba-proxy.test.mjs")]
    proc = subprocess.run(["node", "--test", *files], cwd=ROOT, capture_output=True, text=True, timeout=120)
    assert proc.returncode == 0, proc.stdout[-2000:] + proc.stderr[-2000:]

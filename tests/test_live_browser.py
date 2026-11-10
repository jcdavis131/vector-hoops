"""Runs the /live poll browser test (tests/live_browser.test.mjs) under pytest.

The node file drives live.html in Chromium through Playwright, with ESPN answered at the route
level and a fake clock. CI has no Playwright, so there the file skips itself (exit 0, and it prints
"SKIP live_browser: <reason>"); this wrapper turns that into a pytest skip with the same reason.
HOOPS_REQUIRE_BROWSER=1 turns the skip into a failure, the same shape as HOOPS_REQUIRE_LOCAL_DATA
in the Makefile's eval comment.
"""

import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SKIP_MARK = "SKIP live_browser: "


def test_live_browser_poll_rules() -> None:
    proc = subprocess.run(
        ["node", "--test", str(ROOT / "tests" / "live_browser.test.mjs")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=300,
    )
    out = proc.stdout + proc.stderr
    assert proc.returncode == 0, out[-3000:]
    if SKIP_MARK in out:
        assert os.environ.get("HOOPS_REQUIRE_BROWSER") != "1", out[-3000:]
        reason = out.split(SKIP_MARK, 1)[1].splitlines()[0]
        pytest.skip(reason)

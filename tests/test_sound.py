"""Pytest wrapper for the site sound runtime's ABC parser and scheduler.

The tests live in tests/sound.test.mjs (run them directly with
`node --test tests/sound.test.mjs`): a known score parses to an exact note
schedule, repeats/keys/accidentals behave, the looped scheduler is
deterministic across the loop boundary, and every page cue in
assets/sound.js loops cleanly. This file puts them on the pytest lane so CI
runs them. Anywhere node is missing, the test skips instead of failing.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
MJS = ROOT / "tests" / "sound.test.mjs"


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_sound_parser_and_scheduler() -> None:
    assert MJS.exists(), f"sound tests missing: {MJS}"
    proc = subprocess.run(
        ["node", "--test", str(MJS)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert proc.returncode == 0, f"sound tests failed:\n--- stdout ---\n{proc.stdout}\n--- stderr ---\n{proc.stderr}"

"""Pytest wrapper that runs every node test file in tests/ and scripts/test_ledger.mjs.

One glob, so a new tests/*.test.mjs reaches CI without a wrapper of its own.
tests/test_game_center.mjs does not end in .test.mjs, so it is named. A node
test file that skips itself (for example, no browser or no shipped model)
counts as a pass. Anywhere node is missing, the tests skip instead of failing.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
TESTS = ROOT / "tests"
LEDGER = ROOT / "scripts" / "test_ledger.mjs"


def node_test_files() -> list[Path]:
    files = sorted(TESTS.glob("*.test.mjs"))
    extra = TESTS / "test_game_center.mjs"
    if extra.exists():
        files.append(extra)
    return files


def test_glob_finds_the_node_tests() -> None:
    names = {p.name for p in node_test_files()}
    assert {"daily-share.test.mjs", "twin-absence.test.mjs", "sound.test.mjs", "test_game_center.mjs"} <= names


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_every_node_test_file_passes() -> None:
    files = node_test_files()
    assert files, "no node test files found"
    proc = subprocess.run(
        ["node", "--test", *map(str, files)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=600,
    )
    failed = [ln.strip() for ln in proc.stdout.splitlines() if ln.lstrip().startswith("not ok")]
    assert proc.returncode == 0, (
        "node tests failed:\n--- failing tests ---\n"
        + "\n".join(failed)
        + f"\n--- stdout tail ---\n{proc.stdout[-3000:]}\n--- stderr ---\n{proc.stderr[-2000:]}"
    )


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_ledger_script_passes() -> None:
    assert LEDGER.exists(), f"missing: {LEDGER}"
    proc = subprocess.run(["node", str(LEDGER)], cwd=ROOT, capture_output=True, text=True, timeout=120)
    assert proc.returncode == 0, f"{proc.stdout[-2000:]}\n{proc.stderr[-2000:]}"

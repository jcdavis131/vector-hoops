"""The repo conftest's no-tests guard under --lf.

The guard turns a test_*.py that collects nothing into a usage error. Under
--lf with a recorded failure, pytest answers every file outside the failed
paths with an empty "passed" collect report without importing it, and the
guard read those as empty files: `pytest --lf` exited 4 naming files that
hold tests. Each case runs pytest in a subprocess on a tmp directory that has
a copy of the repo conftest, so the cache it needs stays out of the repo.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
USAGE_ERROR = 4


def _pytest(where: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "-p", "no:randomly", *args],
        cwd=where,
        capture_output=True,
        text=True,
    )


def _project(tmp_path: Path) -> Path:
    shutil.copyfile(ROOT / "conftest.py", tmp_path / "conftest.py")
    (tmp_path / "pytest.ini").write_text("[pytest]\n", encoding="utf-8")
    (tmp_path / "test_fails.py").write_text("def test_fails():\n    assert False\n", encoding="utf-8")
    (tmp_path / "test_passes.py").write_text("def test_passes():\n    assert True\n", encoding="utf-8")
    return tmp_path


def test_last_failed_rerun_is_not_a_usage_error(tmp_path):
    proj = _project(tmp_path)
    first = _pytest(proj)
    assert first.returncode == 1, first.stdout
    rerun = _pytest(proj, "--lf")
    assert rerun.returncode == 1, rerun.stdout + rerun.stderr
    assert "with no tests" not in rerun.stdout + rerun.stderr
    assert "1 failed" in rerun.stdout


def test_a_file_with_no_tests_still_fails_collection(tmp_path):
    proj = _project(tmp_path)
    (proj / "test_empty.py").write_text("X = 1\n", encoding="utf-8")
    res = _pytest(proj, "-p", "no:cacheprovider")
    assert res.returncode == USAGE_ERROR, res.stdout + res.stderr
    assert "test_empty.py" in res.stdout + res.stderr


def test_a_file_with_no_tests_still_fails_under_lf_without_recorded_failures(tmp_path):
    # --lf with nothing recorded runs everything, so the guard still applies.
    proj = _project(tmp_path)
    (proj / "test_fails.py").unlink()
    (proj / "test_empty.py").write_text("X = 1\n", encoding="utf-8")
    res = _pytest(proj, "--lf")
    assert res.returncode == USAGE_ERROR, res.stdout + res.stderr
    assert "test_empty.py" in res.stdout + res.stderr

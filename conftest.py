"""Repo-wide pytest hooks.

Tests marked `local_data` read gitignored artifacts under pipeline/data
(train_matrix.npz, feature_manifest.json, mtnn_report.json, roster_context.json),
which exist only on the training box. Anywhere else they skip and name the
missing path, and CI deselects them with -m "not local_data".

On the training box a skip is the wrong answer. The failure these tests exist
for is an artifact that went missing or moved, and a skip reports that as a
dot-sized "s" in a row of passes. So with HOOPS_REQUIRE_LOCAL_DATA=1, a skipped
local_data test is reported as a failure instead. The script form of each gate
(`python pipeline/test_X.py`) sets it, because that is how update_dataset.py and
export_assets.py run them, and those runs used to exit 1 on a missing input.

Second hook: a test_*.py that pytest collects nothing from is an error. Eleven
gate scripts named test_*.py defined no test functions, so `pytest` collected
0 items from each and CI reported green over gates that were already failing.
The name promised coverage the file did not give. Under `pytest --lf` with a
recorded failure, pytest skips every file outside the failed paths without
importing it and reports it as collected-empty; those are not counted, or
`--lf` exits 4 naming files that hold tests.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

_EMPTY_TEST_FILES: list[str] = []
_CONFIG: pytest.Config | None = None


def pytest_configure(config):
    global _CONFIG
    _CONFIG = config


def _skipped_by_last_failed(nodeid: str) -> bool:
    """True when --lf answered this file without collecting it.

    With recorded failures, pytest's cacheprovider registers "lfplugin-collskip",
    which returns CollectReport(nodeid, "passed", result=[]) for every file not
    on a failed test's path. That report is identical to a file with no tests.
    """
    if _CONFIG is None or not _CONFIG.pluginmanager.has_plugin("lfplugin-collskip"):
        return False
    failed_paths = getattr(_CONFIG.pluginmanager.get_plugin("lfplugin"), "_last_failed_paths", None)
    if failed_paths is None:
        return True
    return _CONFIG.rootpath / nodeid not in failed_paths


def pytest_collectreport(report):
    if (
        report.passed
        and report.nodeid.endswith(".py")
        and Path(report.nodeid).name.startswith("test_")
        and not report.result
        and not _skipped_by_last_failed(report.nodeid)
    ):
        _EMPTY_TEST_FILES.append(report.nodeid)


def pytest_collection_finish(session):
    if _EMPTY_TEST_FILES:
        raise pytest.UsageError(
            "test_*.py file(s) with no tests: "
            + ", ".join(_EMPTY_TEST_FILES)
            + " -- write pytest tests, or rename the file so it stops implying CI coverage"
        )


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    # An xfail is reported as skipped with `wasxfail` set; it is not a missing input.
    if not rep.skipped or hasattr(rep, "wasxfail"):
        return
    if os.environ.get("HOOPS_REQUIRE_LOCAL_DATA") != "1":
        return
    if item.get_closest_marker("local_data") is None:
        return
    reason = rep.longrepr[2] if isinstance(rep.longrepr, tuple) else str(rep.longrepr)
    rep.outcome = "failed"
    rep.longrepr = f"HOOPS_REQUIRE_LOCAL_DATA=1, so a missing local_data input fails: {reason}"

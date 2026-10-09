"""Repo-wide pytest hooks.

Tests marked `local_data` read gitignored artifacts under pipeline/data
(train_matrix.npz, feature_manifest.json, mtnn_report.json, roster_context.json),
which exist only on the training box. Anywhere else they skip and name the
missing path, and CI deselects them with -m "not local_data".

On the training box a skip is the wrong answer. The failure these tests exist
for is an artifact that went missing or moved, and a skip reports that as a
dot-sized "s" next to 80 passes. So with HOOPS_REQUIRE_LOCAL_DATA=1, a skipped
local_data test is reported as a failure instead. The script form of each gate
(`python pipeline/test_X.py`) sets it, because that is how update_dataset.py and
export_assets.py run them, and those runs used to exit 1 on a missing input.
"""

from __future__ import annotations

import os

import pytest


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

"""pipeline/verify_accuracy.py says which failures belong to the unpromoted served bundle [eval#0].

The committed served bundle is the 2dc6ad78 smoke model with no lineage, and
V13/V13b fail on it (jacobian dEmb 48 != arch dEmb 64, stale checkpoint
stamps). Those stay failures; the harness only says whose they are.

Run:  python -m pytest tests/test_verify_accuracy.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import verify_accuracy as va  # noqa: E402

FAILS = {
    "v1_vectors": [],
    "v13_mtnn_jacobian": ["jacobian dEmb 48 != arch dEmb 64", "mtnn_jacobian.json checkpoint stamp stale vs arch"],
    "v13b_mtnn_attribution": ["mtnn_attr_pop.json checkpoint stamp stale vs arch"],
    "v15_season_norms": ["2024-25/PTS: sd=0"],
}


def test_served_bundle_failures_are_attributed_when_the_bundle_is_not_a_promoted_export():
    lines = va.attribute_failures(FAILS, ["mtnn_lineage.json: missing: nothing ties mtnn_embeddings.f32 to a run"])
    assert lines[0].startswith("3 of these failures are in the served MTNN bundle")
    assert "mtnn_lineage.json: missing" in lines[0] and "[eval#0]" in lines[0]
    tagged = [line for line in lines[1:] if line.startswith("  [served bundle, unpromoted] ")]
    assert len(tagged) == 3 and not any("season_norms" in line or "sd=0" in line for line in tagged)


def test_nothing_is_attributed_to_a_promoted_export_or_when_no_served_check_failed():
    assert va.attribute_failures(FAILS, []) == []  # a consistent export: its failures are the rebuild's own
    assert va.attribute_failures({"v15_season_norms": ["x"]}, ["mtnn_lineage.json: missing"]) == []


def test_every_attributed_check_is_one_the_harness_runs():
    assert all(callable(getattr(va, name, None)) for name in va.SERVED_BUNDLE_CHECKS)

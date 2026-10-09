#!/usr/bin/env python3
"""Tests for the provenance gate.

This used to be a bare script that ran its checks at import and ended in
sys.exit(), which crashed any pytest collection that reached it (INTERNALERROR,
SystemExit: 0), so CI had to --ignore it and run it as a separate step. Same
checks, now as pytest functions, so a bare `pytest` collects the whole suite.

    python -m pytest pipeline/test_provenance_gate.py
    python pipeline/test_provenance_gate.py          # same tests, exit code only
"""

from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

import pytest

_SPEC = importlib.util.spec_from_file_location(
    "provenance_gate", Path(__file__).resolve().parent / "provenance_gate.py"
)
pg = importlib.util.module_from_spec(_SPEC)
sys.modules["provenance_gate"] = pg
_SPEC.loader.exec_module(pg)


# --------------------------------------------------------------------------
# THE test. Everything else is secondary.
# --------------------------------------------------------------------------
REAL_BYTES = 3_319_296  # assets/mtnn_embeddings.f32 as shipped 2026-07-25


def test_degeneracy_the_real_size_divides_by_both_48x4_and_64x4():
    # if this ever stops holding, the warning in provenance_gate can be relaxed
    assert REAL_BYTES % (48 * 4) == 0
    assert REAL_BYTES % (64 * 4) == 0


def test_degeneracy_the_two_readings_give_different_row_counts():
    assert REAL_BYTES // (48 * 4) == 17288
    assert REAL_BYTES // (64 * 4) == 12966


def test_a_wrong_but_self_consistent_dim_rows_pair_passes_the_size_check_alone():
    # ...therefore a size-only check cannot distinguish them, which is why the
    # gate crosses size against an independently-sourced row count.
    problems, _agreed = pg.check(
        dims={"meta": (48, "a"), "arch": (48, "b"), "report": (48, "c")},
        rows=17288,  # the WRONG reading, but internally consistent
        size=REAL_BYTES,
        prose_hits={},
    )
    assert problems == [], f"expected no size complaint, got {problems}"


# --------------------------------------------------------------------------
# Source agreement — the check that IS decisive
# --------------------------------------------------------------------------
def test_disagreeing_sources_are_caught_and_the_majority_is_reported():
    problems, agreed = pg.check(
        dims={"meta": (64, "meta.json"), "arch": (48, "arch.json"), "report": (64, "rep")},
        rows=12966,
        size=REAL_BYTES,
        prose_hits={},
    )
    assert any("disagree" in p for p in problems), problems
    assert agreed == 64


def test_all_sources_agreeing_with_the_correct_size_passes():
    problems, _ = pg.check(
        dims={"meta": (64, "m"), "arch": (64, "a"), "report": (64, "r")},
        rows=12966,
        size=REAL_BYTES,
        prose_hits={},
    )
    assert problems == []


# --------------------------------------------------------------------------
# Size must still be crossed, once sources agree
# --------------------------------------------------------------------------
def test_a_wrong_row_count_is_caught_by_the_size_cross_check():
    problems, _ = pg.check(dims={"meta": (64, "m")}, rows=999, size=REAL_BYTES, prose_hits={})
    assert any("bytes but" in p for p in problems), problems


def test_a_missing_row_count_is_reported_as_degenerate_not_silently_passed():
    problems, _ = pg.check(dims={"meta": (64, "m")}, rows=None, size=REAL_BYTES, prose_hits={})
    assert any("DEGENERATE" in p for p in problems), problems


def test_a_missing_artifact_is_caught():
    problems, _ = pg.check(dims={"meta": (64, "m")}, rows=12966, size=None, prose_hits={})
    assert any("missing" in p for p in problems), problems


# --------------------------------------------------------------------------
# Prose surfaces
# --------------------------------------------------------------------------
def test_prose_advertising_the_wrong_dim_is_caught():
    problems, _ = pg.check(dims={"meta": (64, "m")}, rows=12966, size=REAL_BYTES, prose_hits={"README.md": [48]})
    assert any("advertises" in p for p in problems), problems


def test_prose_advertising_the_right_dim_is_fine():
    problems, _ = pg.check(dims={"meta": (64, "m")}, rows=12966, size=REAL_BYTES, prose_hits={"README.md": [64]})
    assert problems == []


def test_prose_mentioning_both_dims_is_not_flagged():
    # a doc explaining 48->64 (a migration note) must not fail the gate
    problems, _ = pg.check(
        dims={"meta": (64, "m")},
        rows=12966,
        size=REAL_BYTES,
        prose_hits={"README.md": [48, 64]},
    )
    assert problems == []


def test_no_sources_at_all_gives_no_fabricated_verdict_on_prose():
    problems, _ = pg.check(dims={}, rows=12966, size=REAL_BYTES, prose_hits={"README.md": [48]})
    assert not any("advertises" in p for p in problems), problems


# --------------------------------------------------------------------------
# The gate must actually run against the real repo and be non-vacuous
# --------------------------------------------------------------------------
def test_collect_finds_at_least_two_dim_sources_and_the_real_artifact():
    # meta and arch are tracked assets, so two sources hold on a clean checkout;
    # the third (pipeline/data/mtnn_report.json) exists only on the training box.
    dims, _rows, size, _f, _n = pg.collect()
    assert len(dims) >= 2, dims
    assert size == REAL_BYTES, f"got {size}"


if __name__ == "__main__":
    # Script form: same tests, exit code only. --runxfail and
    # HOOPS_REQUIRE_LOCAL_DATA=1 keep a known defect or a missing input a
    # failure here, as it was when this file was a hand-rolled script.
    os.environ.setdefault("HOOPS_REQUIRE_LOCAL_DATA", "1")
    sys.exit(pytest.main([__file__, "-p", "no:cacheprovider", "--runxfail"]))

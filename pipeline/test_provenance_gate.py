#!/usr/bin/env python3
"""Tests for the provenance gate. Bare python, no pytest — matches the repo's
other gates (twin.contract.test.mjs style: run it, it prints, it exits non-zero).

    python pipeline/test_provenance_gate.py
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_SPEC = importlib.util.spec_from_file_location(
    "provenance_gate", Path(__file__).resolve().parent / "provenance_gate.py"
)
pg = importlib.util.module_from_spec(_SPEC)
sys.modules["provenance_gate"] = pg
_SPEC.loader.exec_module(pg)

PASS, FAIL = [], []


def ok(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(f"{'PASS' if cond else 'FAIL'}  {name}{('  — ' + detail) if detail and not cond else ''}")


# --------------------------------------------------------------------------
# THE test. Everything else is secondary.
# --------------------------------------------------------------------------
REAL_BYTES = 3_319_296  # assets/mtnn_embeddings.f32 as shipped 2026-07-25

ok(
    "degeneracy: the real artifact size divides by BOTH 48*4 and 64*4",
    REAL_BYTES % (48 * 4) == 0 and REAL_BYTES % (64 * 4) == 0,
    "if this ever stops holding, the warning below can be relaxed",
)
ok(
    "degeneracy: those two readings give DIFFERENT row counts",
    REAL_BYTES // (48 * 4) == 17288 and REAL_BYTES // (64 * 4) == 12966,
)
# ...therefore a size-only check cannot distinguish them, which is why the gate
# crosses size against an independently-sourced row count.
problems, agreed = pg.check(
    dims={"meta": (48, "a"), "arch": (48, "b"), "report": (48, "c")},
    rows=17288,  # the WRONG reading, but internally consistent
    size=REAL_BYTES,
    prose_hits={},
)
ok(
    "a wrong-but-self-consistent (dim,rows) pair passes the size check alone",
    problems == [],
    f"expected no size complaint, got {problems}",
)

# --------------------------------------------------------------------------
# Source agreement — the check that IS decisive
# --------------------------------------------------------------------------
problems, agreed = pg.check(
    dims={"meta": (64, "meta.json"), "arch": (48, "arch.json"), "report": (64, "rep")},
    rows=12966,
    size=REAL_BYTES,
    prose_hits={},
)
ok("disagreeing sources are caught", any("disagree" in p for p in problems), str(problems))
ok("majority is reported as the agreed dim", agreed == 64, f"got {agreed}")

problems, agreed = pg.check(
    dims={"meta": (64, "m"), "arch": (64, "a"), "report": (64, "r")},
    rows=12966,
    size=REAL_BYTES,
    prose_hits={},
)
ok("all-agree with correct size passes", problems == [], str(problems))

# --------------------------------------------------------------------------
# Size must still be crossed, once sources agree
# --------------------------------------------------------------------------
problems, _ = pg.check(dims={"meta": (64, "m")}, rows=999, size=REAL_BYTES, prose_hits={})
ok("wrong row count is caught by the size cross-check", any("bytes but" in p for p in problems))

problems, _ = pg.check(dims={"meta": (64, "m")}, rows=None, size=REAL_BYTES, prose_hits={})
ok(
    "missing row count is reported as DEGENERATE, not silently passed",
    any("DEGENERATE" in p for p in problems),
    str(problems),
)

problems, _ = pg.check(dims={"meta": (64, "m")}, rows=12966, size=None, prose_hits={})
ok("missing artifact is caught", any("missing" in p for p in problems))

# --------------------------------------------------------------------------
# Prose surfaces
# --------------------------------------------------------------------------
problems, _ = pg.check(
    dims={"meta": (64, "m")},
    rows=12966,
    size=REAL_BYTES,
    prose_hits={"README.md": [48]},
)
ok("prose advertising the wrong dim is caught", any("advertises" in p for p in problems))

problems, _ = pg.check(
    dims={"meta": (64, "m")},
    rows=12966,
    size=REAL_BYTES,
    prose_hits={"README.md": [64]},
)
ok("prose advertising the right dim is fine", problems == [], str(problems))

problems, _ = pg.check(
    dims={"meta": (64, "m")},
    rows=12966,
    size=REAL_BYTES,
    prose_hits={"README.md": [48, 64]},
)
ok(
    "prose mentioning both (e.g. a migration note) is not flagged",
    problems == [],
    "a doc explaining 48->64 must not fail the gate",
)

problems, _ = pg.check(dims={}, rows=12966, size=REAL_BYTES, prose_hits={"README.md": [48]})
ok("no sources at all -> no fabricated verdict on prose", not any("advertises" in p for p in problems))

# --------------------------------------------------------------------------
# The gate must actually run against the real repo and be non-vacuous
# --------------------------------------------------------------------------
dims, rows, size, _f, _n = pg.collect()
ok("collect() finds at least two dim sources in the real repo", len(dims) >= 2, str(dims))
ok("collect() finds the real artifact", size == REAL_BYTES, f"got {size}")

print()
print(f"{len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)

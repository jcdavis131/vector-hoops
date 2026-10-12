"""Eval-scoreboard gates — run after every build_eval_scoreboard.py.

Gates: schema completeness, freshness (committed hashes must match the
assets the numbers were computed from), exact deterministic reproduction
(the whole scoreboard is recomputed from committed assets and compared
number-for-number), internal consistency (bucket counts sum, top1<=top5),
and honesty floors (the shipped space must beat both named baselines on
the truly held-out test split — the same doctrine as the promotion gate).

Tracked assets only, so these run in CI. Until this was a pytest module CI
collected nothing from it, and the freshness and reproduction gates were
already failing on the committed assets.

Run:  python -m pytest pipeline/test_eval_scoreboard.py
      python pipeline/test_eval_scoreboard.py     (same tests; exit 0 = all gates pass)
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from build_eval_scoreboard import (  # noqa: E402
    EMB,
    OUT,
    VECTORS,
    compute_scoreboard,
    sha256_file,
)

# Measured on 90ef66a4: the board's embedding sha (2574ef58) is the v5 blob
# a4918f09; the committed f32 is the reverted v6 blob from 2dc6ad78. The board
# also predates the current vectors.json (sha 21f33221 vs 14872103), so a fresh
# recompute pairs 9,888 rows where the board says 10,104. Restoring v5 alone
# fixes the first; the board then needs a rebuild for the rest.
#
# This line serves v5, so the embedding check passes and gates here. The board
# still predates the committed vectors.json, so the other three stay strict
# xfails.
STALE_BOARD = "[eval#0] eval_scoreboard.json predates the committed vectors.json"


@pytest.fixture(scope="module")
def board() -> dict:
    assert OUT.exists(), f"{OUT.name} missing"
    return json.loads(OUT.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def fresh() -> dict:
    return compute_scoreboard()


def rates_ok(block: dict) -> bool:
    ok = True
    for bucket in (
        block["overall"],
        *block["by_split"].values(),
        *block["by_decade"].values(),
    ):
        t1, t5 = bucket["top1"], bucket["top5"]
        if t1 is None or t5 is None:
            continue
        ok &= 0.0 <= t1 <= t5 <= 1.0
    return ok


def test_schema(board):
    for key in (
        "metric",
        "computed_at",
        "embedding_asset",
        "vectors_asset",
        "eligible_pairs",
        "pair_accounting",
        "results",
    ):
        assert key in board, f"key missing: {key}"
    assert board.get("metric") == "held_out_adjacent_season_retrieval"
    for key in ("mtnn", "baseline_transparent_14d", "baseline_random"):
        assert key in board["results"], f"results block missing: {key}"


def test_embedding_hash_matches_the_committed_f32(board):
    assert board["embedding_asset"]["sha256"] == sha256_file(EMB)


@pytest.mark.xfail(strict=True, reason=STALE_BOARD)
def test_vectors_hash_matches_the_committed_vectors_json(board):
    assert board["vectors_asset"]["sha256"] == sha256_file(VECTORS)


@pytest.mark.xfail(strict=True, reason=STALE_BOARD)
def test_eligible_pairs_and_accounting_reproduce(board, fresh):
    assert fresh["eligible_pairs"] == board["eligible_pairs"], (
        f"recomputed {fresh['eligible_pairs']} eligible pairs, board says {board['eligible_pairs']}"
    )
    assert fresh["pair_accounting"] == board["pair_accounting"]


@pytest.mark.xfail(strict=True, reason=STALE_BOARD)
def test_every_hit_rate_reproduces_exactly(board, fresh):
    assert fresh["results"] == board["results"]


def test_internal_consistency(board):
    res, n_pairs = board["results"], board["eligible_pairs"]
    assert n_pairs >= 9000, f"eligible pairs {n_pairs}"
    for name in ("mtnn", "baseline_transparent_14d"):
        block = res[name]
        assert rates_ok(block), f"{name}: 0 <= top1 <= top5 <= 1 broken in some bucket"
        assert sum(b["n"] for b in block["by_split"].values()) == n_pairs, f"{name}: split ns do not sum"
        assert sum(b["n"] for b in block["by_decade"].values()) == n_pairs, f"{name}: decade ns do not sum"


def test_honesty_floors_on_the_held_out_test_split(board):
    res = board["results"]
    m_test = res["mtnn"]["by_split"].get("test", {})
    b_test = res["baseline_transparent_14d"]["by_split"].get("test", {})
    rnd = res["baseline_random"]
    assert m_test.get("n", 0) >= 300, f"test split has {m_test.get('n')} pairs"
    assert (m_test.get("top5") or 0) >= (b_test.get("top5") or 1) + 0.05, (
        "mtnn test top5 does not beat transparent 14-d by >= 0.05 (promotion doctrine)"
    )
    assert (m_test.get("top5") or 0) >= 100 * rnd["top5"], "mtnn test top5 does not beat random by >= 100x"


if __name__ == "__main__":
    # Script form for update_dataset.py, which reads only the exit code.
    # --runxfail: a known defect still fails here, as it did before this was pytest.
    os.environ.setdefault("HOOPS_REQUIRE_LOCAL_DATA", "1")
    sys.exit(pytest.main([__file__, "-p", "no:cacheprovider", "--runxfail"]))

"""Eval-scoreboard gates — run after every build_eval_scoreboard.py.

Gates: schema completeness, freshness (committed hashes must match the
assets the numbers were computed from), exact deterministic reproduction
(the whole scoreboard is recomputed from committed assets and compared
number-for-number), internal consistency (bucket counts sum, top1<=top5),
and honesty floors (the shipped space must beat both named baselines on
the truly held-out test split — the same doctrine as the promotion gate).

Run:  python pipeline/test_eval_scoreboard.py     (exit 0 = all gates pass)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from build_eval_scoreboard import (  # noqa: E402
    EMB,
    OUT,
    VECTORS,
    compute_scoreboard,
    sha256_file,
)

FAILURES: list[str] = []


def check(cond: bool, msg: str) -> None:
    tag = "PASS" if cond else "FAIL"
    print(f"  [{tag}] {msg}")
    if not cond:
        FAILURES.append(msg)


def rates_ok(block: dict) -> bool:
    ok = True
    for bucket in (block["overall"], *block["by_split"].values(), *block["by_decade"].values()):
        t1, t5 = bucket["top1"], bucket["top5"]
        if t1 is None or t5 is None:
            continue
        ok &= 0.0 <= t1 <= t5 <= 1.0
    return ok


def main() -> None:
    print("schema")
    check(OUT.exists(), f"{OUT.name} exists")
    board = json.loads(OUT.read_text(encoding="utf-8"))
    for key in (
        "metric",
        "computed_at",
        "embedding_asset",
        "vectors_asset",
        "eligible_pairs",
        "pair_accounting",
        "results",
    ):
        check(key in board, f"key present: {key}")
    check(
        board.get("metric") == "held_out_adjacent_season_retrieval",
        "metric name matches",
    )
    res = board["results"]
    for key in ("mtnn", "baseline_transparent_14d", "baseline_random"):
        check(key in res, f"results block present: {key}")

    print("freshness (hashes match the committed assets)")
    check(
        board["embedding_asset"]["sha256"] == sha256_file(EMB),
        "embedding sha256 matches assets/mtnn_embeddings.f32",
    )
    check(
        board["vectors_asset"]["sha256"] == sha256_file(VECTORS),
        "vectors sha256 matches assets/vectors.json",
    )

    print("deterministic reproduction (full recompute from committed assets)")
    fresh = compute_scoreboard()
    check(
        fresh["eligible_pairs"] == board["eligible_pairs"],
        f"eligible_pairs reproduces ({board['eligible_pairs']})",
    )
    check(fresh["results"] == res, "every hit rate reproduces exactly")
    check(
        fresh["pair_accounting"] == board["pair_accounting"],
        "pair accounting reproduces",
    )

    print("internal consistency")
    n_pairs = board["eligible_pairs"]
    check(n_pairs >= 9000, f"eligible pairs >= 9000 ({n_pairs})")
    for name in ("mtnn", "baseline_transparent_14d"):
        block = res[name]
        check(rates_ok(block), f"{name}: 0 <= top1 <= top5 <= 1 in every bucket")
        check(
            sum(b["n"] for b in block["by_split"].values()) == n_pairs,
            f"{name}: split ns sum to eligible pairs",
        )
        check(
            sum(b["n"] for b in block["by_decade"].values()) == n_pairs,
            f"{name}: decade ns sum to eligible pairs",
        )

    print("honesty floors (held-out test split)")
    m_test = res["mtnn"]["by_split"].get("test", {})
    b_test = res["baseline_transparent_14d"]["by_split"].get("test", {})
    rnd = res["baseline_random"]
    check(m_test.get("n", 0) >= 300, f"test split has >=300 pairs ({m_test.get('n')})")
    check(
        (m_test.get("top5") or 0) >= (b_test.get("top5") or 1) + 0.05,
        "mtnn test top5 beats transparent 14-d by >= 0.05 (promotion doctrine)",
    )
    check(
        (m_test.get("top5") or 0) >= 100 * rnd["top5"],
        "mtnn test top5 beats random expectation by >= 100x",
    )

    print()
    if FAILURES:
        print(f"{len(FAILURES)} gate(s) FAILED")
        sys.exit(1)
    print("all eval-scoreboard gates passed")


if __name__ == "__main__":
    main()

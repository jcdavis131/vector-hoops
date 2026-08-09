"""Scoring-lite freshness gates — run after every build_scoring_lite.py.

The play page scores against assets/scoring_lite.f32, a subset of
mtnn_embeddings.f32. If the lite rebuild is skipped after a data refresh,
the game silently scores against stale vectors; these gates make that
loud by pinning scoring_lite_index.json to mtnn_meta.json's build stamp.

Run:  python pipeline/test_scoring_lite.py    (exit 0 = all gates pass)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
META = ASSETS / "mtnn_meta.json"
INDEX = ASSETS / "scoring_lite_index.json"
F32 = ASSETS / "scoring_lite.f32"

FAILURES: list[str] = []


def check(cond: bool, msg: str) -> None:
    tag = "PASS" if cond else "FAIL"
    print(f"  [{tag}] {msg}")
    if not cond:
        FAILURES.append(msg)


def main() -> None:
    meta = json.loads(META.read_text(encoding="utf-8"))
    idx = json.loads(INDEX.read_text(encoding="utf-8"))

    print("freshness")
    check(
        idx.get("built") == meta.get("built"),
        f"index built matches mtnn_meta built ({idx.get('built')} vs {meta.get('built')})",
    )

    print("shape")
    ids = idx.get("ids", [])
    check(idx.get("dim") == meta.get("dim"), f"dim matches mtnn_meta ({idx.get('dim')})")
    check(len(ids) == idx.get("rows"), f"rows == len(ids) ({idx.get('rows')})")
    check(len(ids) > 0, "lite subset non-empty")
    check(
        ids == sorted(set(ids)) and all(0 <= i < meta["rows"] for i in ids),
        f"ids sorted, unique, in [0, {meta['rows']})",
    )
    expect = idx.get("rows", 0) * idx.get("dim", 0) * 4
    check(
        F32.stat().st_size == expect,
        f"scoring_lite.f32 size == rows*dim*4 ({expect} bytes)",
    )

    print()
    if FAILURES:
        print(f"{len(FAILURES)} scoring-lite gate(s) FAILED")
        sys.exit(1)
    print("all scoring-lite gates passed")


if __name__ == "__main__":
    main()

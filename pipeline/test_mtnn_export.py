"""Gates for assets/mtnn_embeddings.f32 + mtnn_meta.json.

Run after export_mtnn_embeddings.py:
  python pipeline/test_mtnn_export.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
VECTORS = ASSETS / "vectors.json"
F32 = ASSETS / "mtnn_embeddings.f32"
META = ASSETS / "mtnn_meta.json"

FAILURES: list[str] = []


def check(cond: bool, msg: str) -> None:
    print(f"  [{'PASS' if cond else 'FAIL'}] {msg}")
    if not cond:
        FAILURES.append(msg)


def main() -> None:
    if not F32.exists() or not META.exists():
        print("  mtnn client assets absent — export skipped or gates not met")
        return

    meta = json.loads(META.read_text(encoding="utf-8"))
    dim = int(meta["dim"])
    rows = int(meta["rows"])
    E = np.fromfile(F32, dtype=np.float32).reshape(rows, dim)

    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    check(len(vec["players"]) == rows, f"rows match vectors.json ({rows})")
    check(dim == 48, f"dim == 48 (got {dim})")
    check(E.shape == (rows, dim), "f32 shape matches meta")

    norms = np.linalg.norm(E, axis=1)
    check(float(norms.min()) > 0.99 and float(norms.max()) < 1.01,
          "rows L2-normalized (~1.0)")

    cents = np.array(meta["centroids"], dtype=np.float32)
    check(cents.shape == (8, dim), f"8 archetype centroids × {dim}-d")

    purity = meta.get("purity_at_20")
    check(purity is not None and purity >= 0.63,
          f"purity@20 >= 0.63 (got {purity})")

    if FAILURES:
        print(f"\n{len(FAILURES)} MTNN export gate(s) failed")
        sys.exit(1)
    print("\nall MTNN export gates passed")


if __name__ == "__main__":
    main()

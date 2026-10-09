#!/usr/bin/env python3
"""check_served_model.py -- is the MTNN bundle the site serves one promoted, exported model?

Why (2026-10-09). The served mtnn_embeddings.f32 on this branch is blob
09923d98, a near-untrained v6 smoke model (test top-5 retrieval 0.035, the
v5 blob it replaced 0.749), and its mtnn_meta.json carries composite 0.85 and
top1_790 0.55, which nobody measured [eval#0]. Every check that existed passed
it: provenance_gate.py compares only dim and rows*dim*4 [artifacts#5], and
mtnn.js only checks E.length == rows*dim. Nothing served says which run the
bytes came from, so a mixed or hand-edited bundle looks the same as a real one.

What it checks, in assets/ and in public/assets/ (the tree Vercel serves),
via pipeline/served_model.problems():
  - mtnn_embeddings.f32 is rows*dim*4 bytes, rows and dim from mtnn_meta.json;
  - mtnn_meta.json carries only keys export_mtnn_embeddings writes;
  - vectors.json has meta's row count, and its (pid, season) rows in order
    hash to the keys the f32 was exported against;
  - mtnn_lineage.json exists, its f32 sha256 and size are the f32's, its
    rows/dim/run_id are meta's, and meta's metrics equal its metrics (both
    copied from the promoted manifest);
  - the JSON sidecars exported from the same bundle (served_model.SIDECARS)
    carry the same run id;
and that assets/ and public/assets/ serve the same run and the same bytes.
Exit 1 with every problem listed, 0 when the bundle is consistent.

On this branch it FAILS, by design: the committed bundle has no lineage, a
hand-assembled meta, and sidecars from the 07-14 model. It goes green only
when the served bundle is re-promoted (pipeline/promote.py), re-exported by
rebuild_all.py's export stage and mirrored with scripts/sync_public.py.

Stdlib only.

Usage:
  python scripts/check_served_model.py
  python scripts/check_served_model.py --root <repo checkout>
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import served_model as sm  # noqa: E402

SERVED_DIRS = ("assets", "public/assets")


def check(root: Path) -> list[str]:
    out: list[str] = []
    served: dict[str, tuple] = {}
    for rel in SERVED_DIRS:
        d = root / rel
        if not d.is_dir():
            out.append(f"{rel}/: missing")
            continue
        out += [f"{rel}/{p}" for p in sm.problems(d)]
        try:
            lin = json.loads((d / sm.LINEAGE).read_text(encoding="utf-8"))
            served[rel] = (lin.get("run_id"), lin.get("embedding_f32_sha256"))
        except (OSError, ValueError, AttributeError):
            pass
    if len(set(served.values())) > 1:
        detail = ", ".join(f"{rel}: run {run} f32 {str(sha)[:12]}" for rel, (run, sha) in served.items())
        out.append(f"assets/ and public/assets/ serve different bundles ({detail}); run scripts/sync_public.py")
    return out


def main(argv: Sequence[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Check the served MTNN bundle in assets/ and public/assets/.")
    ap.add_argument("--root", type=Path, default=ROOT, help="repo checkout to check (default: this one)")
    args = ap.parse_args(argv)
    problems = check(args.root)
    if problems:
        print(f"served model: {len(problems)} problem(s)")
        for p in problems:
            print(f"  - {p}")
        return 1
    print(f"served model: OK, {', '.join(SERVED_DIRS)} serve one promoted, exported bundle")
    return 0


if __name__ == "__main__":
    sys.exit(main())

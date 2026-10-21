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
  - mtnn_embeddings.f32 is rows*dim*4 bytes, rows and dim from mtnn_meta.json
    (assets/ only — panel v4, 2026-10-19: nothing raw to the browser, so the
    f32 must NOT exist under public/assets/; its presence there is a problem,
    its absence is not);
  - mtnn_meta.json carries only keys export_mtnn_embeddings writes;
  - vectors.json has meta's row count, and its (pid, season) rows in order
    hash to the keys the f32 was exported against;
  - mtnn_lineage.json exists, its f32 sha256 and size are the f32's, its
    rows/dim/run_id are meta's, and meta's metrics equal its metrics (both
    copied from the promoted manifest);
  - the JSON sidecars exported from the same bundle (served_model.SIDECARS)
    carry the same run id;
and that assets/ and public/assets/ serve the same run and the same bytes.
Plus the registry wiring (Pillar 1): models/registry.json's champion entry must
name the served run id and f32 sha256 (mismatch fails); a missing registry only
warns.
Exit 1 with every problem listed, 0 when the bundle is consistent.

On master the served bundle is the July v5 export (f32 git blob a4918f09).
scripts/record_served_lineage.py recorded mtnn_lineage.json from those bytes
(run july-v5-a4918f09) so this check verifies the deployed tree. Every
forced: true lineage is pinned to that f32's sha256, regardless of
checkpoint_sha256 or kind: a hand-written forced lineage for a different
model fails. A matching promote.py manifest on disk is the only alternative
(the real --force path): export writes assets/mtnn_embeddings.lineage.json
next to the f32 (not under pipeline/data), and that sidecar's f32 sha plus
its promote-manifest sha must match the served bytes and CURRENT.json.
Only mtnn_jacobian.json and
mtnn_attr_pop.json may skip the sidecar run-id check by marking stale /
not_from_served_net; any
other sidecar marked stale still fails on run-id drift. Those two must not
claim the served run id. It still fails a swapped f32, extra meta keys, a
keys-hash mismatch, live sidecar run-id drift, or assets/ vs public/assets/
skew.
A replacement model is not recorded that way: re-promote (pipeline/promote.py),
re-export through rebuild_all.py's export stage, re-stamp with
scripts/stamp_assets.py, then mirror with scripts/sync_public.py.

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

REGISTRY = Path("models/registry.json")


def check_registry(root: Path) -> list[str]:
    """Cross-check the registry champion against the served bundle (Pillar 1).

    models/registry.json is a second source of truth now: its champion entry's
    run_id and embedding_f32_sha256 must name the bundle assets/ serves, or the
    gate fails. A missing or unreadable registry is not a problem here -
    overrides() notes it as a warning (legacy mode), so sites without the
    registry (e.g. test fixtures) don't fail on this check.
    """
    out: list[str] = []
    try:
        reg = json.loads((root / REGISTRY).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return out
    if not isinstance(reg, dict):
        return [f"{REGISTRY}: not a JSON object"]
    models = reg.get("models")
    champion = reg.get("champion")
    if not isinstance(models, list) or not champion:
        return [f"{REGISTRY}: missing 'models' list or 'champion' id"]
    entry = next((m for m in models if isinstance(m, dict) and m.get("id") == champion), None)
    if entry is None:
        return [f"{REGISTRY}: no entry with id '{champion}'"]
    if entry.get("status") != "champion":
        out.append(f"{REGISTRY}: champion entry '{champion}' has status '{entry.get('status')}', not 'champion'")
    try:
        lin = json.loads((root / "assets" / sm.LINEAGE).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return out + [f"{REGISTRY}: cannot read assets/{sm.LINEAGE} to compare"]
    want_run, want_sha = lin.get("run_id"), lin.get("embedding_f32_sha256")
    prov = entry.get("provenance") or {}
    if entry.get("run_id") != want_run:
        out.append(f"{REGISTRY}: champion run_id '{entry.get('run_id')}' != served '{want_run}'")
    if prov.get("embedding_f32_sha256") != want_sha:
        out.append(f"{REGISTRY}: champion f32 sha256 != served {str(want_sha)[:12]}…")
    return out


def check(root: Path) -> list[str]:
    out: list[str] = []
    served: dict[str, tuple] = {}
    for rel in SERVED_DIRS:
        d = root / rel
        if not d.is_dir():
            out.append(f"{rel}/: missing")
            continue
        dir_problems = sm.problems(d)
        if rel == "public/assets":
            # The f32 stays in assets/ for the train lane; the served tree
            # must not carry raw model weights (specs/serving-budget.md).
            dir_problems = [p for p in dir_problems if p != f"{sm.F32}: missing"]
            if (d / sm.F32).exists():
                dir_problems.append(
                    f"{sm.F32}: raw model weights must not be served "
                    "(see specs/serving-budget.md)"
                )
        out += [f"{rel}/{p}" for p in dir_problems]
        try:
            lin = json.loads((d / sm.LINEAGE).read_text(encoding="utf-8"))
            served[rel] = (lin.get("run_id"), lin.get("embedding_f32_sha256"))
        except (OSError, ValueError, AttributeError):
            pass
    if len(set(served.values())) > 1:
        detail = ", ".join(f"{rel}: run {run} f32 {str(sha)[:12]}" for rel, (run, sha) in served.items())
        out.append(f"assets/ and public/assets/ serve different bundles ({detail}); run scripts/sync_public.py")
    out += [f"registry/{p}" for p in check_registry(root)]
    return out


def overrides(root: Path) -> list[str]:
    """Deliberate overrides a served bundle carries: a forced promotion, or export floors it waived.

    Not problems - promote.py --force records a written reason and a7f260cb
    lets such a bundle export - but a served model below its own floors should
    not pass a check without saying so. Printed as GitHub warning annotations.
    """
    out: list[str] = []
    for rel in SERVED_DIRS:
        try:
            lin = json.loads((root / rel / sm.LINEAGE).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if not isinstance(lin, dict):
            continue
        floors = lin.get("export_floors") or {}
        if lin.get("forced"):
            out.append(f"{rel}: run {lin.get('run_id')} was promoted with --force: {lin.get('force_reason')}")
        if floors.get("waived_by_force"):
            out.append(f"{rel}: export floors waived by that force, failed: {floors.get('failed')}")
    if not (root / REGISTRY).exists():
        out.append(f"{REGISTRY}: missing — champion provenance is lineage-only until the registry ships (Pillar 1)")
    return out


def main(argv: Sequence[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Check the served MTNN bundle in assets/ and public/assets/.")
    ap.add_argument("--root", type=Path, default=ROOT, help="repo checkout to check (default: this one)")
    args = ap.parse_args(argv)
    for w in overrides(args.root):
        print(f"::warning title=served model override::{w}")
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

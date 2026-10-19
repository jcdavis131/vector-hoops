#!/usr/bin/env python3
"""Record mtnn_lineage.json from the July v5 incumbent already served on master.

The served-model CI job has been red since it landed (PR #61 / #62, before #99):
assets/mtnn_embeddings.f32 is git blob a4918f09, the July 2026 v5 export, and
nothing in this repo is a promote.py run directory that can rewrite it.

This script does not train, promote, or re-export. It hashes the served f32
and vectors.json row order, copies the metrics already in mtnn_meta.json, and
stamps served_model.SIDECARS with that run id so check_served_model.py can
verify the tree that is actually deployed. mtnn_jacobian.json and
mtnn_attr_pop.json are the 48-d Jul 11–14 exports; they are marked stale /
not_from_served_net instead of claiming the v5 run id.

It refuses any f32 other than the pinned incumbent. A replacement model still
has to go through pipeline/promote.py + export_mtnn_embeddings.py.
check_served_model.py also enforces that pin on forced adoption.

Stdlib only.

Usage:
  python scripts/record_served_lineage.py
  python scripts/stamp_assets.py && python scripts/sync_public.py
  python scripts/check_served_model.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import served_model as sm  # noqa: E402

ASSETS = ROOT / "assets"

INCUMBENT_F32_SHA256 = sm.INCUMBENT_F32_SHA256
RUN_ID = sm.INCUMBENT_RUN_ID
FORCE_REASON = (
    "Adopted the July 2026 v5 incumbent already served on master "
    "(git blob a4918f09). The original promote.py run directory is not in this "
    "repo; lineage records the served bytes. Not a new promotion."
)

# These two JSON files were exported from 48-d checkpoints, not the served 64-d
# v5. Stamping them with july-v5-a4918f09 would tell network-viz they describe
# the shipped net. The check requires them to be marked not_from_served_net
# and to name a different run_id.
STALE_SIDECARS = {
    "mtnn_jacobian.json": {
        "run_id": "pre-v5-48d-2026-07-14",
        "origin": (
            "48-d checkpoint export built 2026-07-14 (dEmb 48, checkpoint "
            "mtime 1784057599); not the served 64-d v5 july-v5-a4918f09"
        ),
    },
    "mtnn_attr_pop.json": {
        "run_id": "pre-v5-48d-2026-07-11",
        "origin": (
            "48-d checkpoint export built 2026-07-11 (checkpoint bytes 2262906); "
            "not the served 64-d v5 july-v5-a4918f09"
        ),
    },
}


def _stamp_sidecar(path: Path, run_id: str) -> None:
    """Insert or replace top-level lineage.run_id without reformatting the rest."""
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise SystemExit(f"{path.name}: not a JSON object")
    existing = data.get("lineage")
    if isinstance(existing, dict) and existing.get("run_id") == run_id:
        return
    if isinstance(existing, dict) or "lineage" in data:
        # Already has a lineage object; rewrite that key in place via json so
        # we do not insert a second copy. Compact vs pretty preserved below.
        data = dict(data)
        lin = dict(existing) if isinstance(existing, dict) else {}
        lin["run_id"] = run_id
        data["lineage"] = lin
        if raw.startswith("{\n"):
            path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        else:
            path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
        return
    rid = json.dumps(run_id)
    if raw.startswith("{\n"):
        path.write_text(
            '{\n  "lineage": {\n    "run_id": ' + rid + "\n  },\n" + raw[2:],
            encoding="utf-8",
        )
        return
    if raw.startswith("{"):
        path.write_text('{"lineage":{"run_id":' + rid + "}," + raw[1:], encoding="utf-8")
        return
    raise SystemExit(f"{path.name}: does not start with '{{'")


def _stale_lineage(run_id: str, origin: str) -> dict:
    return {
        "run_id": run_id,
        "stale": True,
        "not_from_served_net": True,
        "origin": origin,
    }


def _stamp_stale_sidecar(path: Path, run_id: str, origin: str) -> None:
    """Mark a sidecar as not from the served net without reformatting the rest."""
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise SystemExit(f"{path.name}: not a JSON object")
    want = _stale_lineage(run_id, origin)
    existing = data.get("lineage")
    if existing == want:
        return
    inner = json.dumps(want, indent=2).replace("\n", "\n  ")
    replacement = '  "lineage": ' + inner
    new, n = re.subn(r'  "lineage": \{.*?\n  \}', replacement, raw, count=1, flags=re.S)
    if n != 1:
        raise SystemExit(f"{path.name}: could not replace lineage block")
    path.write_text(new, encoding="utf-8")


def _patch_meta(meta_path: Path, run_id: str, f32_url: str) -> dict:
    raw = meta_path.read_text(encoding="utf-8")
    meta = json.loads(raw)
    if not isinstance(meta, dict):
        raise SystemExit(f"{sm.META}: not a JSON object")
    if meta.get("run_id") == run_id and meta.get("f32") == f32_url:
        return meta
    if '"run_id"' not in raw:
        needle = '"model": '
        idx = raw.find(needle)
        if idx < 0:
            raise SystemExit(f"{sm.META}: no model key to insert run_id after")
        line_end = raw.find("\n", idx)
        raw = raw[: line_end + 1] + f'  "run_id": {json.dumps(run_id)},\n' + raw[line_end + 1 :]
    if '"f32"' not in raw:
        needle = '"method": '
        idx = raw.find(needle)
        if idx < 0:
            raise SystemExit(f"{sm.META}: no method key to insert f32 after")
        line_end = raw.find("\n", idx)
        raw = raw[: line_end + 1] + f'  "f32": {json.dumps(f32_url)},\n' + raw[line_end + 1 :]
    meta_path.write_text(raw, encoding="utf-8")
    return json.loads(raw)


def _export_floors(meta: dict) -> dict:
    failed: list[str] = []
    mtnn_r = meta.get("test_recall_at_10")
    base_r = meta.get("transparent_14d_test_recall_at_10")
    if mtnn_r is None or base_r is None:
        failed.append("test recall or the 14-d baseline recall is missing")
    arch = meta.get("archetype_top1_acc")
    if arch is None:
        failed.append("archetype top-1 is missing")
    purity = meta.get("purity_at_20")
    if purity is None:
        failed.append("purity@20 is missing")
    return {"ok": not failed, "failed": failed, "waived_by_force": FORCE_REASON if failed else None}


def main() -> int:
    f32 = ASSETS / sm.F32
    if not f32.is_file():
        print(f"record_served_lineage: missing {f32}", file=sys.stderr)
        return 1
    got = sm.sha256_file(f32)
    if got != INCUMBENT_F32_SHA256:
        print(
            f"record_served_lineage: {sm.F32} sha256 {got} is not the pinned "
            f"July v5 incumbent {INCUMBENT_F32_SHA256}. A replacement model must "
            "go through pipeline/promote.py + pipeline/export_mtnn_embeddings.py.",
            file=sys.stderr,
        )
        return 1
    meta = json.loads((ASSETS / sm.META).read_text(encoding="utf-8"))
    rows, dim = meta.get("rows"), meta.get("dim")
    if not (isinstance(rows, int) and isinstance(dim, int)):
        print(f"record_served_lineage: {sm.META} rows/dim missing", file=sys.stderr)
        return 1
    players = json.loads((ASSETS / sm.VECTORS).read_text(encoding="utf-8"))["players"]
    keys = sm.keys_sha256(sm.vector_keys(players))
    f32_url = sm.f32_url(got)
    meta = _patch_meta(ASSETS / sm.META, RUN_ID, f32_url)
    metrics = {k: meta.get(k) for k in sm.METRIC_KEYS}
    lineage = {
        "schema": sm.LINEAGE_SCHEMA,
        "run_id": RUN_ID,
        "exported": "2026-07-25T00:00:00Z",
        "model": meta.get("model"),
        "rows": rows,
        "dim": dim,
        "embedding_f32_sha256": got,
        "f32_bytes": f32.stat().st_size,
        "keys_sha256": keys,
        "embedding_npz_sha256": None,
        "checkpoint_sha256": None,
        "centroids_sha256": None,
        "report_sha256": None,
        "manifest_sha256": None,
        "matrix": {
            "rows": rows,
            "cols": None,
            "keys_sha256": keys,
            "columns_sha256": None,
            "values_sha256": None,
        },
        "metrics": metrics,
        "promoted_at": None,
        "forced": True,
        "force_reason": FORCE_REASON,
        "export_floors": _export_floors(meta),
        "train_git_sha": None,
        "adoption": {
            "kind": "served-incumbent",
            "git_blob_f32": "a4918f09dfbd04120ecad5556a0736f65fa0ef6d",
            "note": (
                "mtnn_jacobian.json / mtnn_attr_pop.json are 48-d Jul 11–14 "
                "exports, marked not_from_served_net, not this run. A future "
                "promote+export replaces them from the served net."
            ),
        },
    }
    (ASSETS / sm.LINEAGE).write_text(json.dumps(lineage, indent=2) + "\n", encoding="utf-8")
    for name in sm.SIDECARS:
        path = ASSETS / name
        if not path.is_file():
            print(f"record_served_lineage: missing sidecar {name}", file=sys.stderr)
            return 1
        stale = STALE_SIDECARS.get(name)
        if stale:
            _stamp_stale_sidecar(path, stale["run_id"], stale["origin"])
        else:
            _stamp_sidecar(path, RUN_ID)
    print(f"wrote {sm.LINEAGE} for run {RUN_ID} ({rows}x{dim}, sha256 {got[:12]})")
    return 0


if __name__ == "__main__":
    sys.exit(main())

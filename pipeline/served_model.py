"""served_model.py -- what the served MTNN files in assets/ (and public/assets/) must agree on.

Why (2026-10-09). The browser binds mtnn_embeddings.f32 to vectors.json by
row index. Nothing on the serving side said which model the bytes came from
or which rows they are:

  - The committed f32 (blob 09923d98) is a near-untrained v6 smoke model:
    test top-5 retrieval 0.035 against 0.749 for the v5 blob it replaced.
    Its mtnn_meta.json carries composite 0.85 / top1_790 0.55, numbers
    nobody measured, typed into the meta by hand [eval#0].
  - provenance_gate.py passes it: it compares only dim across sources and
    rows*dim*4 against the file size [artifacts#5].
  - export_mtnn_embeddings checked 3 of 12,966 rows (0, n//2, n-1), by name.
    The committed vectors.json is a hand-restored file that build_vectors
    cannot reproduce: d2a16d37 put back 275 suffix names ('Tim Hardaway Jr.')
    that every rebuild writes without the suffix, so names differ on those
    275 rows [final#24]. And on 2026-10-09 the trained embedding and the
    committed vectors.json disagree on player_id for 3 rows the spot check
    never looks at (4673 Marcus Williams 2007-08, 6564 Chris Johnson 2012-13,
    7329 Tony Mitchell 2013-14) [critic#6].
  - The served map, heads and Jacobian are from the 07-14 48-d model beside
    the 07-25 64-d embedding, and no file says so [artifacts#3, fork#13].

The served bundle is now:
  mtnn_embeddings.f32   rows x dim float32; row i is vectors.json players[i]
  mtnn_meta.json        written only by export_mtnn_embeddings; META_KEYS
  mtnn_lineage.json     run_id, the f32's sha256, the bundle's shas, the keys
                        sha of the served row order, and the metrics copied
                        from the promoted manifest
and every JSON sidecar exported from the same bundle (SIDECARS) records the
run_id it came from under "lineage". problems() is the whole check;
scripts/check_served_model.py runs it on assets/ and public/assets/.

Stdlib only, so the CI job that runs it needs no install.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable, Mapping, Sequence
from pathlib import Path
from typing import Any

F32 = "mtnn_embeddings.f32"
META = "mtnn_meta.json"
LINEAGE = "mtnn_lineage.json"
VECTORS = "vectors.json"
LINEAGE_SCHEMA = 1

# Metrics the promoted manifest carries (copied from the training report by
# promote.py). The meta and the lineage file both copy them from there.
METRIC_KEYS = (
    "cqs",
    "test_recall_at_10",
    "purity_at_20",
    "archetype_top1_acc",
    "position_top1_acc",
    "transparent_14d_test_recall_at_10",
    "continuity_spread",
)

# Every key export_mtnn_embeddings writes into mtnn_meta.json. A key outside
# this list was put there by something else: the committed v6 meta has
# composite, top1_790, honest_partial, dailySeed and torch, none of which any
# pipeline script writes.
META_KEYS = (
    "built",
    "model",
    "run_id",
    "dim",
    "rows",
    "method",
    "f32",
    "centroids",
    "skill_keys",
    *METRIC_KEYS,
    "nce_loss",
    "tower_width",
    "tower_hidden",
    "skill_hidden",
    "fusion",
)

# JSON files exported from the promoted bundle by the default rebuild, each
# stamped {"lineage": {"run_id": ...}} by its exporter.
SIDECARS = (
    "mtnn_arch.json",  # export_mtnn_viz
    "mtnn_map.json",  # export_mtnn_viz
    "mtnn_jacobian.json",  # export_mtnn_jacobian
    "projections.json",  # project_next_season, run by export_assets
    "scoring_lite_index.json",  # build_scoring_lite
)


class ServedModelError(Exception):
    """The served f32 is not the one its lineage file describes."""


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while block := f.read(chunk):
            h.update(block)
    return h.hexdigest()


def row_key(player_id: Any, season: Any) -> str:
    return f"{player_id}|{season}"


def vector_keys(players: Iterable[Mapping[str, Any]]) -> list[str]:
    """The served row order: vectors.json players by (pid, season)."""
    return [row_key(p.get("pid"), p.get("season")) for p in players]


def keys_sha256(keys: Sequence[str]) -> str:
    """sha256 of the keys one per line, each ending in a newline.

    The same bytes as artifact_io.keys_sha256 / matrix_fingerprint's
    keys_sha256, so a served row order compares directly with the matrix a
    model trained on.
    """
    h = hashlib.sha256()
    for k in keys:
        h.update(k.encode("utf-8"))
        h.update(b"\n")
    return h.hexdigest()


def f32_url(sha256: str) -> str:
    """The f32's URL with a content token, the ?v= convention of scripts/stamp_assets.py."""
    return f"assets/{F32}?v={sha256[:8]}"


def _load(path: Path) -> tuple[Any, str | None]:
    if not path.exists():
        return None, f"{path.name}: missing"
    try:
        return json.loads(path.read_text(encoding="utf-8")), None
    except (OSError, ValueError) as e:
        return None, f"{path.name}: unreadable ({e})"


def verify_f32(assets: Path) -> dict[str, Any]:
    """The lineage of the served f32, after checking the bytes are the ones it names.

    For readers that slice the served f32 (build_scoring_lite): refuse to build
    from bytes that did not come through export_mtnn_embeddings.
    """
    lineage, err = _load(assets / LINEAGE)
    if err:
        raise ServedModelError(
            f"{err}: {F32} cannot be tied to a promoted run. Export it with "
            "pipeline/promote.py + pipeline/export_mtnn_embeddings.py"
        )
    got = sha256_file(assets / F32)
    if got != lineage.get("embedding_f32_sha256"):
        raise ServedModelError(
            f"{F32} sha256 {got[:12]} is not the {str(lineage.get('embedding_f32_sha256'))[:12]} "
            f"{LINEAGE} records for run {lineage.get('run_id')}"
        )
    return lineage


def problems(assets: Path) -> list[str]:
    """Every way the served bundle in one directory disagrees with itself. Empty = consistent."""
    out: list[str] = []
    meta, err = _load(assets / META)
    if err:
        out.append(err)
    lineage, err = _load(assets / LINEAGE)
    if err:
        out.append(
            f"{err}: nothing ties {F32} to a promoted run. It stays red until the served bundle is "
            "re-promoted (pipeline/promote.py) and re-exported (pipeline/export_mtnn_embeddings.py)"
        )
    f32 = assets / F32
    size = f32.stat().st_size if f32.exists() else None
    if size is None:
        out.append(f"{F32}: missing")

    rows = dim = None
    if isinstance(meta, dict):
        rows, dim = meta.get("rows"), meta.get("dim")
        if not (isinstance(rows, int) and isinstance(dim, int) and rows > 0 and dim > 0):
            out.append(f"{META}: rows {rows!r} / dim {dim!r} are not positive integers")
            rows = dim = None
        elif size is not None and size != rows * dim * 4:
            out.append(f"{F32} is {size} bytes, but {META} rows*dim*4 = {rows}*{dim}*4 = {rows * dim * 4}")
        extra = sorted(set(meta) - set(META_KEYS))
        if extra:
            out.append(f"{META} has keys export_mtnn_embeddings never writes: {extra} (edited by hand?)")

    players = None
    vec, err = _load(assets / VECTORS)
    if err:
        out.append(err)
    elif not isinstance(vec, dict) or not isinstance(vec.get("players"), list):
        out.append(f"{VECTORS}: no players list")
    else:
        players = vec["players"]
        if rows is not None and len(players) != rows:
            out.append(f"{VECTORS} has {len(players)} rows, {META} says {rows}")

    if not isinstance(lineage, dict):
        return out
    if lineage.get("schema") != LINEAGE_SCHEMA:
        out.append(f"{LINEAGE}: schema {lineage.get('schema')!r}, expected {LINEAGE_SCHEMA}")
    run_id = lineage.get("run_id")
    if size is not None:
        got = sha256_file(f32)
        if got != lineage.get("embedding_f32_sha256"):
            out.append(
                f"{F32} sha256 {got[:12]} is not the {str(lineage.get('embedding_f32_sha256'))[:12]} "
                f"{LINEAGE} records for run {run_id}"
            )
        if lineage.get("f32_bytes") != size:
            out.append(f"{F32} is {size} bytes, {LINEAGE} says {lineage.get('f32_bytes')}")
    if players is not None and keys_sha256(vector_keys(players)) != lineage.get("keys_sha256"):
        out.append(
            f"{VECTORS} rows (pid|season, in order) are not the rows the f32 was exported against; "
            "a reordered or rebuilt vectors.json needs a re-export"
        )
    metrics = lineage.get("metrics")
    if not isinstance(metrics, dict) or set(metrics) != set(METRIC_KEYS):
        out.append(f"{LINEAGE}: metrics should be exactly {list(METRIC_KEYS)}")
        metrics = metrics if isinstance(metrics, dict) else {}
    if isinstance(meta, dict):
        for key in ("rows", "dim", "run_id"):
            if meta.get(key) != lineage.get(key):
                out.append(f"{META} {key} {meta.get(key)!r} != {LINEAGE} {key} {lineage.get(key)!r}")
        for key, value in metrics.items():
            if meta.get(key) != value:
                out.append(f"{META} {key} {meta.get(key)!r} != {LINEAGE} {key} {value!r} (the promoted manifest's)")
        if lineage.get("embedding_f32_sha256") and meta.get("f32") != f32_url(lineage["embedding_f32_sha256"]):
            out.append(f"{META} f32 {meta.get('f32')!r} is not {f32_url(lineage['embedding_f32_sha256'])!r}")
    for name in SIDECARS:
        doc, err = _load(assets / name)
        if err:
            out.append(err)
            continue
        side = (doc.get("lineage") or {}).get("run_id") if isinstance(doc, dict) else None
        if side != run_id:
            out.append(f"{name} is from run {side!r}, the served embedding from {run_id!r}")
    return out

"""Export the promoted MTNN embedding for the static site.

Reads the promoted bundle through promote.load_promoted(), which re-hashes
every file against its manifest, checks every row against assets/vectors.json
by (player_id, season), and writes:

  assets/mtnn_embeddings.f32   row-major float32 (n_rows x dim)
  assets/mtnn_meta.json        dim, rows, model, run_id, centroids, metrics
  assets/mtnn_lineage.json     run_id, the f32's sha256, the bundle's shas,
                               the keys sha of the served row order, metrics

Why it changed (2026-10-09). It read pipeline/data/embedding_v3.npz and
pipeline/data/mtnn_report.json, which on this box came from different runs
(08-07 embedding, 08-14 report), and copied the report's model name and
metrics onto the embedding with nothing tying the two [eval#6,
orchestration#0]. Its gate passed that report although the trainer had
rejected it. Its alignment check looked at 3 rows by name, so it could not see
the 3 rows where the trained embedding and the committed vectors.json name
different player_ids (4673 Marcus Williams 2007-08: 200766 vs 201173, 6564
Chris Johnson 2012-13, 7329 Tony Mitchell 2013-14), while 275 rows differ by
name spelling alone [critic#6]. Metrics in the meta now come from the
promoted manifest, which promote.py copied from the report, and are never
typed here; the method text no longer calls every model "v4".

Export floors (export_floors): test recall beats the 14-d baseline by 0.05,
archetype top-1 >= 0.55, purity@20 >= 0.63, on the numbers the bundle
carries. A bundle that misses them is not exported unless its promotion was
forced (promote.py --force "<reason>"); then it is, and mtnn_lineage.json
records the misses and the reason under export_floors.

Run:  python pipeline/export_mtnn_embeddings.py
Needs: a promoted bundle (python pipeline/promote.py --run <run_dir>).
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import numpy as np
import promote
import served_model as sm
from artifact_io import atomic_write_bytes, atomic_write_json

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SHOW_MISMATCHES = 20


RECALL_MARGIN, ARCHETYPE_TOP1, PURITY_FLOOR = 0.05, 0.55, 0.63


def floor_failures(report: dict | None) -> list[str]:
    """Each export floor the report misses, with its numbers; empty when it clears all three.

    The floors sit on top of promote.py's verdict: the served model beats the
    transparent 14-d baseline by 0.05 test recall, and archetype top-1 and
    purity@20 are above the levels the client was built for.
    """
    if not report:
        return ["no report"]
    test = (report.get("held_out_recall") or {}).get("test") or {}
    mtnn_r, base_r = test.get("recall_at_10_mtnn"), test.get("recall_at_10_transparent_14d")
    purity = report.get("cross_era_archetype_neighbor_purity_at_20")
    arch = report.get("archetype_top1_acc")
    out = []
    if mtnn_r is None or base_r is None:
        out.append("test recall or the 14-d baseline recall is missing")
    elif mtnn_r < base_r + RECALL_MARGIN:
        out.append(f"test recall {mtnn_r:.4g} < 14-d baseline {base_r:.4g} + {RECALL_MARGIN}")
    if arch is None:
        out.append("archetype top-1 is missing")
    elif arch < ARCHETYPE_TOP1:
        out.append(f"archetype top-1 {arch:.4g} < {ARCHETYPE_TOP1}")
    if purity is None:
        out.append("purity@20 is missing")
    elif purity < PURITY_FLOOR:
        out.append(f"purity@20 {purity:.4g} < {PURITY_FLOOR}")
    return out


def promotion_eligible(report: dict | None) -> bool:
    """True when the report clears every export floor (floor_failures is empty)."""
    return not floor_failures(report)


def export_floors(bundle: promote.PromotedBundle) -> dict:
    """The floors on the numbers the bundle carries, and whether a forced promotion waived them.

    The report is bundle.metrics_report: for a refit, the select run's, as
    export_assets has read it since 2026-10-09. This read bundle.report, the
    refit's in-sample one, so export_assets could pass a refit and then run
    this exporter, which refused it.

    Waived only by promote.py --force (2026-10-10). A forced promotion is
    the operator overriding should_promote, the stronger gate these floors
    were the pre-promote version of, with a reason recorded in the manifest.
    The floors still run and their misses are written into
    mtnn_lineage.json with that reason, so a served below-floor model says
    so. An unforced bundle that misses them is not exported, as before.
    """
    failed = floor_failures(bundle.metrics_report)
    waived = bundle.manifest.get("force_reason") if failed and bundle.manifest.get("forced") else None
    return {"ok": not failed, "failed": failed, "waived_by_force": waived}


def row_mismatches(emb_keys: list[str], emb_names: list[str], players: list[dict]) -> list[str]:
    """Rows where the embedding and vectors.json name different (player_id, season)."""
    vec_keys = sm.vector_keys(players)
    return [
        f"row {i}: embedding {emb_keys[i]} ({emb_names[i]}) vs vectors.json {vec_keys[i]} ({players[i].get('name')})"
        for i in range(len(players))
        if emb_keys[i] != vec_keys[i]
    ]


def main(data_dir: Path | None = None, assets: Path | None = None) -> None:
    assets = assets or ASSETS
    try:
        bundle = promote.load_promoted(data_dir)
    except promote.BundleError as e:
        raise SystemExit(f"export_mtnn_embeddings: {e}") from None
    vectors = assets / sm.VECTORS
    if not vectors.exists():
        raise SystemExit(f"missing {vectors}")
    report = bundle.report
    floors = export_floors(bundle)
    if not floors["ok"] and floors["waived_by_force"] is None:
        raise SystemExit(
            f"promoted run {bundle.run_id} misses the export floors ({'; '.join(floors['failed'])}); not exported. "
            'A promotion forced with promote.py --force "<reason>" waives them, recorded in mtnn_lineage.json'
        )
    if not floors["ok"]:
        print(
            f"WARNING: promoted run {bundle.run_id} misses the export floors ({'; '.join(floors['failed'])}); "
            f"exported because its promotion was forced: {floors['waived_by_force']}"
        )

    with np.load(bundle.embedding, allow_pickle=False) as data:
        E = np.ascontiguousarray(data["E"], dtype=np.float32)
        emb_keys = [sm.row_key(p, s) for p, s in zip(data["player_id"].tolist(), data["season"].tolist(), strict=True)]
        emb_names = [str(n) for n in data["name"]] if "name" in data.files else ["?"] * len(emb_keys)
        skill_keys = [str(k) for k in data["skill_keys"]] if "skill_keys" in data.files else []
    with np.load(bundle.centroids, allow_pickle=False) as cent:
        centroids = np.asarray(cent["centroids"], dtype=np.float32)

    players = json.loads(vectors.read_text(encoding="utf-8"))["players"]
    n = len(players)
    if E.shape[0] != n:
        raise SystemExit(f"row mismatch: E {E.shape[0]} vs vectors {n}")
    bad = row_mismatches(emb_keys, emb_names, players)
    if bad:
        shown = "\n  ".join(bad[:SHOW_MISMATCHES])
        more = f"\n  ... and {len(bad) - SHOW_MISMATCHES} more" if len(bad) > SHOW_MISMATCHES else ""
        raise SystemExit(
            f"{len(bad)} of {n} rows of promoted run {bundle.run_id} are not the vectors.json row at the same index "
            f"(compared by player_id and season); the browser binds by index, so these would serve another "
            f"player's vector:\n  {shown}{more}"
        )
    if centroids.ndim != 2 or centroids.shape[1] != E.shape[1]:
        raise SystemExit(f"centroids shape {centroids.shape} does not match the {E.shape[1]}-d embedding")

    served_keys = sm.keys_sha256(sm.vector_keys(players))
    fp = bundle.manifest.get("matrix_fingerprint") or {}
    if served_keys != fp.get("keys_sha256"):
        raise SystemExit("vectors.json rows match the embedding but not the promoted matrix fingerprint's keys")

    blob = E.tobytes(order="C")
    f32_sha = hashlib.sha256(blob).hexdigest()
    metrics = bundle.metrics
    files = bundle.manifest.get("files") or {}
    meta = {
        "built": time.strftime("%Y-%m-%d"),
        "model": bundle.manifest.get("model"),
        "run_id": bundle.run_id,
        "dim": int(E.shape[1]),
        "rows": int(E.shape[0]),
        "method": (
            f"L2-normalized MTNN embedding of promoted run {bundle.run_id}; row i is vectors.json players[i], "
            "checked by player_id and season on every row. Daily puzzles score in this embedding space."
        ),
        "f32": sm.f32_url(f32_sha),
        "centroids": centroids.tolist(),
        "skill_keys": skill_keys,
        **{k: metrics.get(k) for k in sm.METRIC_KEYS},
        "nce_loss": report.get("nce_loss"),
        "tower_width": report.get("tower_width"),
        "tower_hidden": report.get("tower_hidden"),
        "skill_hidden": report.get("skill_hidden"),
        "fusion": report.get("fusion"),
    }
    lineage = {
        "schema": sm.LINEAGE_SCHEMA,
        "run_id": bundle.run_id,
        "exported": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model": bundle.manifest.get("model"),
        "rows": int(E.shape[0]),
        "dim": int(E.shape[1]),
        "embedding_f32_sha256": f32_sha,
        "f32_bytes": len(blob),
        "keys_sha256": served_keys,
        "embedding_npz_sha256": (files.get("embedding") or {}).get("sha256"),
        "checkpoint_sha256": (files.get("checkpoint") or {}).get("sha256"),
        "centroids_sha256": (files.get("centroids") or {}).get("sha256"),
        "report_sha256": (files.get("report") or {}).get("sha256"),
        "manifest_sha256": bundle.current.get("manifest_sha256"),
        "matrix": {k: fp.get(k) for k in ("rows", "cols", "keys_sha256", "columns_sha256", "values_sha256")},
        "metrics": {k: metrics.get(k) for k in sm.METRIC_KEYS},
        "promoted_at": bundle.current.get("promoted_at"),
        "forced": bool(bundle.manifest.get("forced")),
        "force_reason": bundle.manifest.get("force_reason"),
        "export_floors": floors,
        "train_git_sha": (bundle.manifest.get("train_git") or {}).get("sha"),
    }

    atomic_write_bytes(assets / sm.F32, blob)
    atomic_write_json(assets / sm.META, meta, indent=2)
    # Last: a lineage file only ever describes bytes already on disk.
    atomic_write_json(assets / sm.LINEAGE, lineage, indent=2)
    print(f"wrote {sm.F32} ({E.shape[0]}x{E.shape[1]}, {len(blob) / (1024 * 1024):.2f} MB) from run {bundle.run_id}")
    print(f"wrote {sm.META}, {sm.LINEAGE}")


if __name__ == "__main__":
    main()

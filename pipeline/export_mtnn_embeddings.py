"""Export promotion-eligible MTNN embeddings for the static site.

Reads pipeline/data/embedding_v3.npz + mtnn_centroids.npz, verifies
index alignment with assets/vectors.json, writes:

  assets/mtnn_embeddings.f32   row-major float32 (n_rows × dim)
  assets/mtnn_meta.json        dim, rows, model, centroids, metrics

Run:  python pipeline/export_mtnn_embeddings.py
Gated by mtnn_promotion_eligible() — same contract as export_assets.py.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
DATA_DIR = ROOT / "pipeline" / "data"
VECTORS = ASSETS / "vectors.json"
EMB = DATA_DIR / "embedding_v3.npz"
CENTROIDS = DATA_DIR / "mtnn_centroids.npz"
REPORT = DATA_DIR / "mtnn_report.json"
OUT_F32 = ASSETS / "mtnn_embeddings.f32"
OUT_META = ASSETS / "mtnn_meta.json"


def promotion_eligible(report: dict | None) -> bool:
    if not report:
        return False
    ho = report.get("held_out_recall", {})
    test = ho.get("test", {})
    mtnn_r = test.get("recall_at_10_mtnn")
    base_r = test.get("recall_at_10_transparent_14d")
    purity = report.get("cross_era_archetype_neighbor_purity_at_20")
    arch = report.get("archetype_top1_acc")
    if mtnn_r is None or base_r is None or purity is None or arch is None:
        return False
    return (
        mtnn_r >= base_r + 0.05
        and arch >= 0.55
        and purity >= 0.63
    )


def main() -> None:
    if not EMB.exists():
        raise SystemExit(f"missing {EMB} — run train_mtnn.py first")
    if not VECTORS.exists():
        raise SystemExit(f"missing {VECTORS}")

    report = json.loads(REPORT.read_text(encoding="utf-8")) if REPORT.exists() else {}
    if not promotion_eligible(report):
        raise SystemExit(
            "MTNN promotion gates not met — embeddings stay in pipeline/data/")

    data = np.load(EMB, allow_pickle=True)
    E = np.asarray(data["E"], dtype=np.float32)
    names = data["name"]
    seasons = data["season"]

    cent = np.load(CENTROIDS, allow_pickle=True)
    centroids = np.asarray(cent["centroids"], dtype=np.float32)

    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    players = vec["players"]
    n = len(players)
    if E.shape[0] != n:
        raise SystemExit(f"row mismatch: E {E.shape[0]} vs vectors {n}")

    for idx in (0, n // 2, n - 1):
        p = players[idx]
        if str(names[idx]) != p["name"] or str(seasons[idx]) != p["season"]:
            raise SystemExit(
                f"alignment fail row {idx}: "
                f"{names[idx]!r}|{seasons[idx]!r} vs {p['name']!r}|{p['season']!r}")

    skill_keys = [str(k) for k in data.get("skill_keys", [])]

    OUT_F32.write_bytes(E.tobytes(order="C"))
    meta = {
        "built": time.strftime("%Y-%m-%d"),
        "model": report.get("model", "mtnn_v4"),
        "dim": int(E.shape[1]),
        "rows": int(E.shape[0]),
        "method": (
            "L2-normalized MTNN v4 embedding; index-aligned with vectors.json "
            "and skills.json. Game puzzles still use transparent 14-d."
        ),
        "centroids": centroids.tolist(),
        "skill_keys": skill_keys,
        "test_recall_at_10": report.get("held_out_recall", {})
            .get("test", {}).get("recall_at_10_mtnn"),
        "purity_at_20": report.get("cross_era_archetype_neighbor_purity_at_20"),
        "archetype_top1_acc": report.get("archetype_top1_acc"),
        "nce_loss": report.get("nce_loss"),
    }
    OUT_META.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    mb = OUT_F32.stat().st_size / (1024 * 1024)
    print(f"wrote {OUT_F32.name} ({E.shape[0]}×{E.shape[1]}, {mb:.2f} MB)")
    print(f"wrote {OUT_META.name}")


if __name__ == "__main__":
    main()

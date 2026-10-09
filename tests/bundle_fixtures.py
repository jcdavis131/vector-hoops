"""Tiny run bundles for the promote / export / served-model tests.

Not a test module. A 6-row matrix, a 4-d embedding, and a checkpoint that is
just bytes: promote.py never loads a checkpoint, it only hashes it. Every
path is under the directory the caller passes (a tmp_path), never
pipeline/data or assets/.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import artifact_io as aio  # noqa: E402

COLUMNS = ["PTS", "AST", "TRK_DRIVES"]
FAMILIES = {"PTS": "volume", "AST": "playmaking", "TRK_DRIVES": "tracking"}
PIDS = np.array([11, 11, 12, 13, 13, 14], dtype=np.int64)
SEASONS = np.array(["2019-20", "2020-21", "2020-21", "1997-98", "1998-99", "2025-26"])
NAMES = np.array([f"Player {p}" for p in PIDS])
DIM = 4

# Clears composite_score.should_promote at n_seeds=1 against its BASELINE
# (cqs 77.74 + 1.2, recall 0.835 - 0.062, purity 0.782 - 0.015, spread bar
# 0.1436 + 0.2024). should_promote takes `composite` as given.
PASSING = {"cqs": 90.0, "test_recall_at_10": 0.9, "purity_at_20": 0.8}


def write_matrix(data: Path, shift: float = 0.0) -> None:
    rng = np.random.default_rng(3)
    Z = rng.standard_normal((len(PIDS), len(COLUMNS))).astype(np.float32) + shift
    np.savez_compressed(
        data / "train_matrix.npz",
        Z=Z,
        mask=np.ones_like(Z),
        player_id=PIDS,
        season=SEASONS,
        name=NAMES,
        cluster=np.zeros(len(PIDS), dtype=np.int64),
    )
    (data / "feature_manifest.json").write_text(json.dumps({"features": COLUMNS, "families": FAMILIES}))


def make_run(
    data: Path,
    run_id: str,
    *,
    phase: str = "final-refit",
    composite: dict | None = None,
    dim: int = DIM,
    centroid_dim: int | None = None,
    checkpoint: bool = True,
    seed: int = 0,
    deploy_mode: str | None = None,
) -> Path:
    """A run directory as train_mtnn --run-dir leaves it, next to data/."""
    run = data.parent / "runs" / run_id
    run.mkdir(parents=True)
    rng = np.random.default_rng(seed)
    E = rng.standard_normal((len(PIDS), dim)).astype(np.float32)
    E /= np.linalg.norm(E, axis=1, keepdims=True)
    n = len(PIDS)
    np.savez_compressed(
        run / "embedding_v3.npz",
        E=E,
        player_id=PIDS,
        season=SEASONS,
        name=NAMES,
        cluster=np.zeros(n, dtype=np.int64),
        archetype_logits=rng.standard_normal((n, 8)).astype(np.float32),
        position_logits=rng.standard_normal((n, 5)).astype(np.float32),
        skill_pred=rng.random((n, 2)).astype(np.float32),
        skill_keys=np.array(["ft", "playmaking"]),
        next_profile_pred=rng.standard_normal((n, 3)).astype(np.float32),
        game_feature_keys=np.array(COLUMNS),
    )
    np.savez_compressed(run / "mtnn_centroids.npz", centroids=np.ones((8, centroid_dim or dim), np.float32))
    roles = ["embedding", "centroids"]
    if checkpoint:
        (run / "mtnn_best.pt").write_bytes(f"weights of {run_id}".encode())
        roles.insert(0, "checkpoint")
    artifacts = {r: aio.file_record(run / aio.BUNDLE_FILES[r], data.parent) for r in roles}
    report = {
        "trained": "2026-10-09 12:00",
        "model": f"test_model_{run_id}",
        "dim": dim,
        "composite": dict(composite or PASSING),
        "population_validation": {"collapse_flags": {}},
        "continuity_spread": 0.1,
        "archetype_top1_acc": 0.91,
        "position_top1_acc": 0.72,
        "cross_era_archetype_neighbor_purity_at_20": 0.8,
        "held_out_recall": {"test": {"recall_at_10_mtnn": 0.9, "recall_at_10_transparent_14d": 0.2}},
        "nce_loss": "hybrid",
        "tower_width": 32,
        "tower_hidden": 160,
        "skill_hidden": 16,
        "fusion": "concat",
        "promote": {"ok": True, "reason": "set by the test"},
        "deploy": {"mode": deploy_mode or "selection_fit_rows_all"},
        "lineage": {
            "schema": 1,
            "run_id": run_id,
            "phase": phase,
            "seed": 7,
            "args": {"tower_width": 32, "tower_hidden": 160, "tower_blocks": 2, "fusion": "concat", "mlp_heads": True},
            "git": {"sha": "b" * 40},
            "env_versions": {"python": "test"},
            "matrix_fingerprint": aio.load_matrix_fingerprint(
                data / "train_matrix.npz", data / "feature_manifest.json"
            ),
            "artifacts": artifacts,
        },
    }
    (run / "mtnn_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return run


def write_vectors(assets: Path, pids=PIDS) -> Path:
    """An assets/vectors.json whose rows are the fixture matrix's, in order."""
    assets.mkdir(parents=True, exist_ok=True)
    players = [
        {"id": i, "name": str(n), "season": str(s), "pid": int(p)}
        for i, (p, s, n) in enumerate(zip(pids.tolist(), SEASONS.tolist(), NAMES.tolist(), strict=True))
    ]
    path = assets / "vectors.json"
    path.write_text(json.dumps({"players": players}), encoding="utf-8")
    return path

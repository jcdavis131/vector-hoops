"""Manifest read/write/verify for shot-chart snapshots. Stdlib only."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

PIPELINE_VERSION = "1.0.0"


def sha256_file(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def write_manifest(manifest_path, *, source, date, fetched_at, snapshot_path, records, games, players, qa) -> dict:
    manifest_path = Path(manifest_path)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    m = {
        "source": source,
        "date": date,
        "fetched_at": fetched_at,
        "sha256": sha256_file(snapshot_path),
        "records": records,
        "games": games,
        "players": players,
        "qa": qa,
        "pipeline_version": PIPELINE_VERSION,
    }
    manifest_path.write_text(json.dumps(m, indent=2) + "\n")
    return m


def read_manifest(path) -> dict:
    return json.loads(Path(path).read_text())


def verify_manifest(manifest_path, snapshot_path) -> bool:
    """True iff the snapshot on disk matches the manifest's sha256."""
    m = read_manifest(manifest_path)
    return m.get("sha256") == sha256_file(snapshot_path)

#!/usr/bin/env python3
"""Insight provenance builder (Pillar 5).

Every mined claim links to the model run and the data vintage that produced it.
The served-model contract is simple:

  model = assets/mtnn_lineage.json (run_id, model id, export date, f32 sha256)
  vintage = caller-supplied string naming the data window the inputs cover
  inputs = every repo file the claim's numbers were computed from, hashed

If assets/mtnn_lineage.json is missing or unreadable we emit model_id/run_id as
"unknown" rather than guessing. An "unknown" model provenance is a QA signal:
the claim can sit in the queue, but it must not be approved until provenance
is resolved. This module never fabricates a run id.

CLI: python3 provenance.py --vintage "..." --inputs assets/x.json [...]
prints the provenance JSON to stdout.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import subprocess
import sys
from pathlib import Path

from schema import SCHEMA_VERSION, UNKNOWN, validate_provenance

REPO = Path(__file__).resolve().parents[2]
LINEAGE_PATH = "assets/mtnn_lineage.json"


def sha256_of(path) -> str:
    """Hex sha256 of a file, or "unknown" if unreadable (never fake a hash)."""
    try:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return UNKNOWN


def repo_commit() -> str:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],  # noqa: S603,S607
            cwd=REPO,
            capture_output=True,
            text=True,
            timeout=10,
        )
        return out.stdout.strip() or UNKNOWN
    except (OSError, subprocess.SubprocessError):
        return UNKNOWN


def served_model() -> dict:
    """Model provenance from the lineage file. "unknown" on any failure."""
    path = REPO / LINEAGE_PATH
    try:
        with open(path, encoding="utf-8") as f:
            lineage = json.load(f)
    except (OSError, json.JSONDecodeError):
        lineage = {}
    model = lineage.get("model", UNKNOWN) if isinstance(lineage, dict) else UNKNOWN
    run_id = lineage.get("run_id", UNKNOWN) if isinstance(lineage, dict) else UNKNOWN
    exported = lineage.get("exported", UNKNOWN) if isinstance(lineage, dict) else UNKNOWN
    return {
        "model_id": model if isinstance(model, str) and model else UNKNOWN,
        "run_id": run_id if isinstance(run_id, str) and run_id else UNKNOWN,
        "exported": exported if isinstance(exported, str) and exported else UNKNOWN,
        "lineage_source": LINEAGE_PATH,
    }


def build(data_vintage: str, input_paths: list[str], extra: dict | None = None) -> dict:
    """Build a Provenance record.

    data_vintage: human string naming the data window, e.g.
      "stats through 2025-26 season; Basketball-Reference game logs pulled 2026-10-02"
      Use "unknown" only if genuinely not known — better to write the truth.
    input_paths: repo-relative files the claim's numbers derive from.
    extra: optional extra fields merged into the record (e.g. source_method).
    """
    prov = {
        "schema": SCHEMA_VERSION,
        "model": served_model(),
        "data_vintage": data_vintage or UNKNOWN,
        "inputs": [{"path": p, "sha256": sha256_of(REPO / p)} for p in input_paths],
        "computed_at": dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "repo_commit": repo_commit(),
        "miner_version": SCHEMA_VERSION,
    }
    if extra:
        prov.update(extra)
    problems = validate_provenance(prov)
    if problems:
        raise ValueError(f"built invalid provenance: {problems}")
    return prov


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Print a provenance record as JSON.")
    ap.add_argument("--vintage", default=UNKNOWN, help="data vintage string")
    ap.add_argument("--inputs", nargs="*", default=[], help="repo-relative input paths to hash")
    args = ap.parse_args(argv)
    print(json.dumps(build(args.vintage, args.inputs), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

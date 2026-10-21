#!/usr/bin/env python3
"""Shot-chart pipeline dispatcher. One CLI for every source.

Usage:
    pipeline.py <source> <stage> --date YYYY-MM-DD [--resume] [--root DIR]

Stages: fetch | validate | normalize | snapshot | publish | all
Exit codes: 0 ok · 1 QA FAIL (publish blocked) · 2 fetch error · 3 source gated.

Source-module contract (pipeline/shotcharts/sources/<name>.py):
    SOURCE = "<manifest key>"
    GATED = False | True
    fetch(date, resume, dirs) -> {"games": int, "raw_files": [...]}
    validate(date, dirs)      -> qa dict (use common.qa.run_qa)
    normalize(date, dirs)     -> [canonical records]
    snapshot(date, dirs, records, qa) -> (snapshot_path, manifest)
    publish(date, dirs)       -> {"published": bool, ...}  # hard-block unless QA PASS
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from common.errors import GateError  # noqa: E402

SOURCES = ("espn_plays", "bbr", "stats_nba", "nba_cdn")
STAGES = ("fetch", "validate", "normalize", "snapshot", "publish", "all")


def build_dirs(root: Path) -> dict:
    base = Path(root) / "pipeline" / "shotcharts"
    return {
        "base": base,
        "raw": base / "raw",
        "checkpoints": base / "checkpoints",
        "snapshots": base / "snapshots",
        "manifests": base / "manifests",
        "served": Path(root) / "assets" / "data" / "shotcharts",
        "served_public": Path(root) / "public" / "assets" / "data" / "shotcharts",
    }


def load_source(name: str):
    import importlib

    try:
        return importlib.import_module(f"sources.{name}")
    except ImportError:
        sys.exit(f"unknown source: {name} (expected one of {SOURCES})")


def cmd_all(mod, date: str, resume: bool, dirs: dict) -> int:
    r = mod.fetch(date, resume, dirs)
    print(f"[{mod.SOURCE}] fetch: {r['games']} games, {len(r['raw_files'])} raw files")
    qa = mod.validate(date, dirs)
    print(f"[{mod.SOURCE}] validate: {qa['verdict']}")
    if qa["verdict"] != "PASS":
        print(f"[{mod.SOURCE}] QA FAIL — publish blocked", file=sys.stderr)
        return 1
    records = mod.normalize(date, dirs)
    print(f"[{mod.SOURCE}] normalize: {len(records)} records")
    snap_path, manifest = mod.snapshot(date, dirs, records, qa)
    print(f"[{mod.SOURCE}] snapshot: {snap_path} ({manifest['records']} records, sha {manifest['sha256'][:12]})")
    pub = mod.publish(date, dirs)
    print(f"[{mod.SOURCE}] publish: {'done' if pub['published'] else 'skipped'} ({pub.get('reason', '')})")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("source", choices=SOURCES)
    ap.add_argument("stage", choices=STAGES)
    ap.add_argument("--date", required=True, help="YYYY-MM-DD")
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--root", default=".", help="repo root (default: cwd)")
    args = ap.parse_args(argv)

    try:
        datetime.strptime(args.date, "%Y-%m-%d")
    except ValueError:
        sys.exit(f"bad --date (want YYYY-MM-DD): {args.date}")

    dirs = build_dirs(Path(args.root))
    try:
        mod = load_source(args.source)
    except GateError as exc:
        print(f"[{args.source}] GATED (honest 503): {exc}", file=sys.stderr)
        return 3

    try:
        if args.stage == "all":
            return cmd_all(mod, args.date, args.resume, dirs)
        if args.stage == "fetch":
            r = mod.fetch(args.date, args.resume, dirs)
            print(f"[{mod.SOURCE}] fetch: {r['games']} games")
            return 0
        if args.stage == "validate":
            qa = mod.validate(args.date, dirs)
            print(f"[{mod.SOURCE}] validate: {qa['verdict']}")
            return 0 if qa["verdict"] == "PASS" else 1
        if args.stage == "normalize":
            recs = mod.normalize(args.date, dirs)
            print(f"[{mod.SOURCE}] normalize: {len(recs)} records")
            return 0
        if args.stage == "snapshot":
            recs = mod.normalize(args.date, dirs)
            qa = mod.validate(args.date, dirs)
            if qa["verdict"] != "PASS":
                print("QA FAIL — snapshot not written", file=sys.stderr)
                return 1
            snap_path, _manifest = mod.snapshot(args.date, dirs, recs, qa)
            print(f"[{mod.SOURCE}] snapshot: {snap_path}")
            return 0
        if args.stage == "publish":
            pub = mod.publish(args.date, dirs)
            print(f"[{mod.SOURCE}] publish: {'done' if pub['published'] else 'blocked'}")
            return 0 if pub["published"] else 1
    except GateError as exc:
        print(f"[{args.source}] GATED (honest 503): {exc}", file=sys.stderr)
        return 3
    except Exception as exc:  # noqa: BLE001 - dispatcher reports, exit 2
        print(f"[{args.source}] ERROR: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Provenance gate — do the published surfaces agree with the shipped artifact?

Motivation, measured 2026-07-25: `assets/mtnn_arch.json` says `dEmb: 48` while
`assets/mtnn_meta.json` and `pipeline/data/mtnn_report.json` both say 64, and the
shipped `assets/mtnn_embeddings.f32` is a 64-d artifact. README.md, assets/mtnn.js
and methods.html all still say 48-d. Four public surfaces describing a model that
is not the one on disk.

WHY THE OBVIOUS CHECK DOES NOT WORK — read before "simplifying" this file.
The tempting invariant is `filesize == rows * dim * 4`. On the current artifact
that is 3,319,296 bytes, which is divisible by BOTH 48*4 (giving 17,288 rows) and
64*4 (giving 12,966 rows). A size check alone is therefore **degenerate**: it
passes for the wrong dim. It only becomes decisive when crossed with a row count
from an independent source. That is the entire design of this gate — agreement
between sources, not self-consistency of one.

This is deliberately a READ-ONLY reporter with a non-zero exit. It fixes nothing,
because which surface is authoritative is a judgement (the artifact is usually
right and the docs stale, but not always — a stale artifact with fresh docs is the
same failure wearing the other hat).

Usage:
    python pipeline/provenance_gate.py            # human
    python pipeline/provenance_gate.py --json     # machine
Exit 0 = all surfaces agree. Exit 1 = drift.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# (label, path, json-pointer-ish accessor) for the dimension each source asserts.
DIM_SOURCES = [
    ("meta", "assets/mtnn_meta.json", ("dim",)),
    ("arch", "assets/mtnn_arch.json", ("dEmb",)),
    ("report", "pipeline/data/mtnn_report.json", ("dim",)),
]

# Prose/code surfaces that quote a dimension at readers. A mismatch here is a
# published claim about a model that is not the one shipped.
PROSE_SURFACES = [
    "README.md",
    "assets/mtnn.js",
    "methods.html",
]

EMBEDDING = "assets/mtnn_embeddings.f32"
BYTES_PER_FLOAT = 4


def _load_json(rel: str):
    p = ROOT / rel
    if not p.exists():
        return None, f"{rel}: missing"
    try:
        return json.loads(p.read_text(encoding="utf-8")), None
    except Exception as e:  # noqa: BLE001 - report, never crash the gate
        return None, f"{rel}: unparseable ({str(e)[:60]})"


def _dig(obj, path):
    for key in path:
        if not isinstance(obj, dict) or key not in obj:
            return None
        obj = obj[key]
    return obj


def collect():
    """Gather every asserted dimension, the row count, and the artifact size."""
    findings, notes = [], []
    dims = {}
    for label, rel, path in DIM_SOURCES:
        obj, err = _load_json(rel)
        if err:
            notes.append(err)
            continue
        value = _dig(obj, path)
        if value is None:
            notes.append(f"{rel}: no {'.'.join(path)} key")
            continue
        dims[label] = (int(value), rel)

    meta, _ = _load_json("assets/mtnn_meta.json")
    rows = None
    if isinstance(meta, dict):
        for key in ("n", "rows", "n_rows", "count"):
            if isinstance(meta.get(key), int):
                rows = meta[key]
                break

    emb = ROOT / EMBEDDING
    size = emb.stat().st_size if emb.exists() else None
    return dims, rows, size, findings, notes


def check(dims, rows, size, prose_hits):
    problems = []

    # 1. Every structured source must assert the SAME dimension.
    distinct = {d for d, _ in dims.values()}
    if len(distinct) > 1:
        detail = ", ".join(f"{lab}={d} ({rel})" for lab, (d, rel) in sorted(dims.items()))
        problems.append(f"sources disagree on embedding dim: {detail}")
    agreed = None
    if dims:
        # majority wins for reporting purposes; disagreement is already a problem
        counts = {}
        for d, _ in dims.values():
            counts[d] = counts.get(d, 0) + 1
        agreed = max(counts, key=counts.get)

    # 2. Cross the size against rows x dim. Degenerate alone (see docstring),
    #    decisive once `rows` comes from an independent key.
    if size is None:
        problems.append(f"{EMBEDDING}: missing — cannot verify any dim claim")
    elif rows is None:
        problems.append(
            "no row count in assets/mtnn_meta.json — the size check is DEGENERATE "
            "without it (3,319,296 divides by both 48*4 and 64*4)"
        )
    elif agreed is not None:
        expected = rows * agreed * BYTES_PER_FLOAT
        if expected != size:
            problems.append(f"{EMBEDDING} is {size} bytes but rows*dim*4 = {rows}*{agreed}*4 = {expected}")

    # 3. Prose must not advertise a different dim than the artifact.
    if agreed is not None:
        for rel, hits in prose_hits.items():
            wrong = sorted(h for h in hits if h != agreed)
            if wrong and agreed not in hits:
                problems.append(f"{rel} advertises {wrong}-d but the shipped artifact is {agreed}-d")
    return problems, agreed


def scan_prose(candidate_dims):
    """Which dimensions does each prose surface quote at a reader?"""
    out = {}
    pattern = re.compile(r"\b(\d{2,3})\s*-?\s*d(?:im|imension|imensional)?\b", re.I)
    for rel in PROSE_SURFACES:
        p = ROOT / rel
        if not p.exists():
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        found = {int(m) for m in pattern.findall(text)}
        # only care about values that are plausibly THE embedding dim
        out[rel] = sorted(found & candidate_dims)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    args = ap.parse_args()

    dims, rows, size, _findings, notes = collect()
    candidates = {d for d, _ in dims.values()} | {48, 64}
    prose_hits = scan_prose(candidates)
    problems, agreed = check(dims, rows, size, prose_hits)

    if args.json:
        print(
            json.dumps(
                {
                    "ok": not problems,
                    "agreed_dim": agreed,
                    "rows": rows,
                    "bytes": size,
                    "sources": {k: v[0] for k, v in dims.items()},
                    "prose": prose_hits,
                    "problems": problems,
                    "notes": notes,
                },
                indent=2,
            )
        )
        return 1 if problems else 0

    print("PROVENANCE GATE  (vector-hoops)")
    print("-" * 60)
    for label, (d, rel) in sorted(dims.items()):
        print(f"  {label:8} dim={d:<4} {rel}")
    print(f"  {'rows':8} {rows}")
    print(f"  {'bytes':8} {size}")
    for rel, hits in prose_hits.items():
        print(f"  prose    {rel:32} quotes {hits or '—'}")
    for n in notes:
        print(f"  note     {n}")
    print()
    if problems:
        for p in problems:
            print(f"FAIL  {p}")
        print("\nGATE FAILED — a published surface describes a model that is not shipped")
        return 1
    print("GATE PASSED — every surface agrees with the shipped artifact")
    return 0


if __name__ == "__main__":
    sys.exit(main())

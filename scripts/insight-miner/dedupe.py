#!/usr/bin/env python3
"""Dedupe for mined insights (Pillar 5).

Two levels:
  1. Exact: same dedupe_key (type:metric:sorted-entity-keys). The older record
     is a duplicate; keep the newer, or the one already further along the
     curation queue.
  2. Near: same type + same entity set, different metric. If the numbers agree
     within EPSILON_REL, the newer is a duplicate. If they differ beyond it,
     the newer SUPERSEDES the older (same claim, fresher numbers) -- the older
     entry is marked retired with a "superseded-by" note, never silently dropped.

Usage: dedupe(new_candidates, existing_entries) -> (fresh, duplicates, supersessions)
CLI:  python3 dedupe.py --new candidates.json --existing queue.jsonl
      prints a report; --apply writes supersession notes into the queue file.
"""

from __future__ import annotations

import argparse
import json
import sys

import queue as queue_mod

EPSILON_REL = 0.05  # numbers within 5% relative count as "same numbers"


def _entity_set(cand: dict) -> frozenset:
    parts = []
    for ent in cand.get("entities", []):
        name = ent.get("name", "")
        season = ent.get("season", "")
        kind = ent.get("kind", "")
        parts.append(f"{kind}:{name}:{season}")
    return frozenset(parts)


def _numbers_close(a: dict, b: dict) -> bool:
    """True if both candidates' first numeric values agree within EPSILON_REL."""
    va = _first_number(a)
    vb = _first_number(b)
    if va is None or vb is None:
        return False
    if va == vb == 0:
        return True
    denom = max(abs(va), abs(vb))
    return abs(va - vb) / denom <= EPSILON_REL


def _first_number(cand: dict):
    for n in cand.get("numbers", []):
        v = n.get("value")
        if isinstance(v, (int, float)):
            return v
    return None


def dedupe(
    new_candidates: list[dict], existing_entries: list[dict]
) -> tuple[list[dict], list[dict], list[dict]]:
    """Split new candidates into (fresh, duplicates, supersessions).

    duplicates:   {"candidate_id", "duplicate_of", "reason"}
    supersessions:{"candidate_id", "supersedes", "reason"} -- apply marks the
                  old queue entry retired with a superseded-by note.
    """
    fresh, duplicates, supersessions = [], [], []
    by_key = {}
    for e in existing_entries:
        c = e.get("candidate", {})
        if c.get("dedupe_key"):
            by_key.setdefault(c["dedupe_key"], []).append(e)

    for cand in new_candidates:
        key = cand.get("dedupe_key")
        if key in by_key:
            dup = by_key[key][0]
            duplicates.append(
                {
                    "candidate_id": cand["id"],
                    "duplicate_of": dup["id"],
                    "reason": f"exact dedupe_key match: {key}",
                }
            )
            continue
        # Near-dup: same type + same entities.
        eset = _entity_set(cand)
        near = [
            e
            for e in existing_entries
            if e.get("candidate", {}).get("type") == cand.get("type")
            and _entity_set(e.get("candidate", {})) == eset
            and eset
        ]
        if near:
            old = near[0]
            if _numbers_close(cand, old["candidate"]):
                duplicates.append(
                    {
                        "candidate_id": cand["id"],
                        "duplicate_of": old["id"],
                        "reason": "same type+entities, numbers within 5%",
                    }
                )
            else:
                supersessions.append(
                    {
                        "candidate_id": cand["id"],
                        "supersedes": old["id"],
                        "reason": "same claim, numbers moved beyond 5% -- refresh",
                    }
                )
            continue
        fresh.append(cand)
    return fresh, duplicates, supersessions


def apply_supersessions(queue_path: str, supersessions: list[dict], by: str = "miner") -> int:
    """Mark superseded queue entries retired with a superseded-by note."""
    entries = queue_mod._read_queue(queue_path)  # noqa: SLF001 -- same package
    by_id = {e["id"]: e for e in entries}
    applied = 0
    for s in supersessions:
        old = by_id.get(s["supersedes"])
        if old is None or old["state"] in ("rejected", "retired", "expired"):
            continue
        # Supersession bypasses the normal transition table: it is a machine
        # action, recorded as such in state_history.
        old["state"] = "retired"
        old["state_history"].append(
            {
                "state": "retired",
                "at": queue_mod._now(),  # noqa: SLF001 -- same package
                "by": by,
                "note": f"superseded-by {s['candidate_id']}: {s['reason']}",
            }
        )
        applied += 1
    if applied:
        queue_mod._write_queue(queue_path, entries)  # noqa: SLF001 -- same package
    return applied


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Dedupe mined candidates against the queue.")
    ap.add_argument("--new", required=True, help="candidates.json from miner.py")
    ap.add_argument("--existing", required=True, help="queue.jsonl")
    ap.add_argument("--apply", action="store_true", help="write supersession retirements into the queue")
    ap.add_argument("--by", default="miner")
    args = ap.parse_args(argv)

    with open(args.new, encoding="utf-8") as f:
        new = json.load(f)
    existing = queue_mod._read_queue(args.existing)
    fresh, dups, sups = dedupe(new, existing)

    print(f"new={len(new)} fresh={len(fresh)} duplicates={len(dups)} supersessions={len(sups)}")
    for d in dups:
        print(f"  dup: {d['candidate_id']} == {d['duplicate_of']} ({d['reason']})")
    for s in sups:
        print(f"  supersede: {s['candidate_id']} > {s['supersedes']} ({s['reason']})")
    if args.apply and sups:
        n = apply_supersessions(args.existing, sups, by=args.by)
        print(f"  applied {n} supersession retirements -> {args.existing}")
    if args.apply and not sups:
        print("  nothing to apply")
    return 0


if __name__ == "__main__":
    sys.exit(main())

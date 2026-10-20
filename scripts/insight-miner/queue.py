#!/usr/bin/env python3
"""Curation queue for mined insights (Pillar 5).

Format: one JSON object per line in <queue>.jsonl. Each line is a QueueEntry
(see schema.py): the candidate, its state, a state_history audit trail, and
an editorial block where the human framer records the Freakonomics-grade
treatment (title, lede, invalidators, framing_score).

State machine: pending -> approved | rejected ; approved -> retired.
"expired" is written by decay.py, never by hand. Rejected/retired/expired are
terminal: to revive, enqueue a fresh candidate (new id, supersedes note).

Nothing in this module touches assets/insights.json or the public site. The
handoff to the site happens when an editor exports approved entries and feeds
them through pipeline/build_insights.py, which is the only writer of the
served insights.

CLI:
  queue.py enqueue --in candidates.json --queue queue.jsonl
  queue.py list --queue queue.jsonl [--state pending]
  queue.py set-state --queue queue.jsonl --id <id> --state approved|rejected|retired --by <editor> --note "..."
  queue.py frame --queue queue.jsonl --id <id> --title "..." --lede "..." --invalidator "..." [--invalidator ...]
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

from schema import QUEUE_STATES, validate_queue_entry

TERMINAL = ("rejected", "retired", "expired")
VALID_TRANSITIONS = {
    "pending": ("approved", "rejected"),
    "approved": ("retired",),
}


def _now() -> str:
    return dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _read_queue(path: str) -> list[dict]:
    entries = []
    if not Path(path).exists():
        return entries
    with open(path, encoding="utf-8") as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError as e:
                raise ValueError(f"{path}:{lineno}: bad JSON: {e}") from e
    return entries


def _write_queue(path: str, entries: list[dict]) -> None:
    tmp = Path(str(path) + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        for e in entries:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")
    tmp.replace(path)


def make_entry(candidate: dict, by: str = "miner") -> dict:
    entry = {
        "id": candidate["id"],
        "state": "pending",
        "state_history": [{"state": "pending", "at": _now(), "by": by, "note": "mined"}],
        "editorial": {
            "framed_title": None,
            "lede": None,
            "invalidators": [],
            "framing_score": None,
            "framed_by": None,
            "framed_at": None,
        },
        "candidate": candidate,
    }
    problems = validate_queue_entry(entry)
    if problems:
        raise ValueError(f"invalid queue entry: {problems}")
    return entry


def enqueue(candidates: list[dict], path: str, by: str = "miner") -> tuple[int, int]:
    """Append candidates as pending entries. Returns (added, skipped_existing)."""
    entries = _read_queue(path)
    seen = {e["id"] for e in entries}
    added = skipped = 0
    for c in candidates:
        if c["id"] in seen:
            skipped += 1
            continue
        entries.append(make_entry(c, by=by))
        seen.add(c["id"])
        added += 1
    _write_queue(path, entries)
    return added, skipped


def set_state(path: str, entry_id: str, state: str, by: str, note: str) -> dict:
    if state not in QUEUE_STATES:
        raise ValueError(f"state must be one of {QUEUE_STATES}")
    entries = _read_queue(path)
    for e in entries:
        if e["id"] != entry_id:
            continue
        cur = e["state"]
        if cur in TERMINAL:
            raise ValueError(f"{entry_id}: {cur} is terminal; enqueue a fresh candidate to revive")
        allowed = VALID_TRANSITIONS.get(cur, ())
        if state not in allowed:
            raise ValueError(f"{entry_id}: cannot move {cur} -> {state} (allowed: {allowed})")
        if state == "approved":
            ed = e["editorial"]
            if not ed.get("framed_title") or not ed.get("invalidators"):
                raise ValueError(
                    f"{entry_id}: approval requires framed_title + at least one invalidator "
                    "(editorial bar; see docs/insights-engine/FRAMING.md)"
                )
        e["state"] = state
        e["state_history"].append({"state": state, "at": _now(), "by": by, "note": note})
        _write_queue(path, entries)
        return e
    raise ValueError(f"{entry_id}: not in queue")


def frame(
    path: str,
    entry_id: str,
    title: str,
    lede: str,
    invalidators: list[str],
    by: str,
    framing_score: float | None = None,
) -> dict:
    """Record the human editorial framing. Does not change state."""
    entries = _read_queue(path)
    for e in entries:
        if e["id"] != entry_id:
            continue
        if e["state"] != "pending":
            raise ValueError(f"{entry_id}: can only frame pending entries (state={e['state']})")
        ed = e["editorial"]
        ed["framed_title"] = title
        ed["lede"] = lede
        ed["invalidators"] = list(invalidators)
        ed["framed_by"] = by
        ed["framed_at"] = _now()
        ed["framing_score"] = framing_score
        e["state_history"].append({"state": "pending", "at": _now(), "by": by, "note": "framed"})
        _write_queue(path, entries)
        return e
    raise ValueError(f"{entry_id}: not in queue")


def list_entries(path: str, state: str | None = None) -> list[dict]:
    entries = _read_queue(path)
    if state:
        entries = [e for e in entries if e["state"] == state]
    return entries


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Curation queue for mined insights.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("enqueue")
    p.add_argument("--in", dest="inp", required=True, help="candidates.json from miner.py")
    p.add_argument("--queue", required=True)
    p.add_argument("--by", default="miner")

    p = sub.add_parser("list")
    p.add_argument("--queue", required=True)
    p.add_argument("--state", default=None, choices=list(QUEUE_STATES))

    p = sub.add_parser("set-state")
    p.add_argument("--queue", required=True)
    p.add_argument("--id", dest="entry_id", required=True)
    p.add_argument("--state", required=True, choices=list(QUEUE_STATES))
    p.add_argument("--by", required=True)
    p.add_argument("--note", default="")

    p = sub.add_parser("frame")
    p.add_argument("--queue", required=True)
    p.add_argument("--id", dest="entry_id", required=True)
    p.add_argument("--title", required=True)
    p.add_argument("--lede", required=True)
    p.add_argument("--invalidator", action="append", default=[], dest="invalidators")
    p.add_argument("--by", required=True)
    p.add_argument("--framing-score", type=float, default=None)

    args = ap.parse_args(argv)
    try:
        if args.cmd == "enqueue":
            with open(args.inp, encoding="utf-8") as f:
                candidates = json.load(f)
            added, skipped = enqueue(candidates, args.queue, by=args.by)
            print(f"enqueued {added}, skipped {skipped} existing -> {args.queue}")
        elif args.cmd == "list":
            for e in list_entries(args.queue, args.state):
                print(f"{e['id']}  [{e['state']}]  {e['candidate']['question_draft'][:80]}")
        elif args.cmd == "set-state":
            e = set_state(args.queue, args.entry_id, args.state, args.by, args.note)
            print(f"{e['id']} -> {e['state']}")
        elif args.cmd == "frame":
            e = frame(args.queue, args.entry_id, args.title, args.lede, args.invalidators, args.by, args.framing_score)
            print(f"framed {e['id']}")
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

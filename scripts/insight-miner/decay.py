#!/usr/bin/env python3
"""Decay rules for the insights queue (Pillar 5).

Insights retire when the data moves on. Rules by decay_class (see schema.py):

  realtime -- expires REALTIME_TTL_DAYS (7) after the trigger fired (detected_at
              for trigger events; framed_at/computed_at for batch candidates).
              Live-data claims go stale fast; a week-old "just shifted" is a lie.
  seasonal -- valid until the data vintage rolls. The miner records
              data_vintage on every candidate; when a new season's data lands
              (vintage string changes), approved seasonal entries expire and
              the miner re-mines them fresh. Expiry here is driven by an
              explicit --new-vintage flag, never by guessing.
  evergreen -- never expires. BUT: when the serving model changes (new run_id
              in assets/mtnn_lineage.json), every evergreen entry must be
              revalidated -- the miner re-runs and dedupe.py decides whether
              the numbers still hold (duplicate), moved (supersession), or the
              source vanished (manual review). --check-model compares the
              queue's recorded run_ids against the current lineage file.

This module only marks "expired" and reports what needs revalidation. It never
deletes entries: the queue is an audit trail.

CLI:
  decay.py evaluate --queue queue.jsonl [--apply]
  decay.py check-model --queue queue.jsonl
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys

import provenance
import queue as queue_mod
from schema import REALTIME_TTL_DAYS


def _parse_ts(s: str) -> dt.datetime | None:
    try:
        return dt.datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.UTC)
    except (ValueError, TypeError):
        return None


def _trigger_fired_at(entry: dict) -> dt.datetime | None:
    """When the claim's numbers were produced. Triggers use detected_at."""
    cand = entry.get("candidate", {})
    for key in ("detected_at",):
        ts = _parse_ts(cand.get(key))
        if ts:
            return ts
    prov = cand.get("provenance", {})
    return _parse_ts(prov.get("computed_at"))


def evaluate(queue_path: str, now: dt.datetime | None = None, new_vintage: str | None = None) -> list[dict]:
    """Return actions: [{"id", "action": "expire"|"revalidate-model", "reason"}]."""
    now = now or dt.datetime.now(dt.UTC)
    entries = queue_mod._read_queue(queue_path)
    actions = []
    for e in entries:
        if e["state"] != "approved":
            continue
        cand = e.get("candidate", {})
        decay_class = cand.get("decay_class")
        if decay_class == "realtime":
            fired = _trigger_fired_at(e)
            if fired and (now - fired) > dt.timedelta(days=REALTIME_TTL_DAYS):
                actions.append(
                    {
                        "id": e["id"],
                        "action": "expire",
                        "reason": f"realtime TTL {REALTIME_TTL_DAYS}d exceeded (fired {fired:%Y-%m-%d})",
                    }
                )
            elif not fired:
                actions.append(
                    {
                        "id": e["id"],
                        "action": "expire",
                        "reason": "realtime entry with no computable fired-at timestamp -- cannot verify freshness",
                    }
                )
        elif decay_class == "seasonal":
            if new_vintage:
                old_vintage = cand.get("provenance", {}).get("data_vintage", "unknown")
                if old_vintage != new_vintage:
                    actions.append(
                        {
                            "id": e["id"],
                            "action": "expire",
                            "reason": f"data vintage rolled: {old_vintage!r} -> {new_vintage!r}",
                        }
                    )
        # evergreen: no expiry; model-change revalidation is check_model().
    return actions


def check_model(queue_path: str) -> list[dict]:
    """Flag entries whose recorded model run_id differs from the live lineage.

    A changed run_id does not expire the entry -- it queues revalidation:
    re-run miner.py, then dedupe.py decides duplicate / supersede / review.
    """
    current = provenance.served_model()
    current_run = current.get("run_id")
    entries = queue_mod._read_queue(queue_path)
    flags = []
    for e in entries:
        if e["state"] not in ("pending", "approved"):
            continue
        rec = e.get("candidate", {}).get("provenance", {}).get("model", {}).get("run_id")
        if rec and current_run and rec != current_run:
            flags.append(
                {
                    "id": e["id"],
                    "action": "revalidate-model",
                    "reason": f"queue run_id {rec} != live {current_run}; re-run miner + dedupe",
                }
            )
    return flags


def apply_expire(queue_path: str, actions: list[dict], by: str = "decay") -> int:
    entries = queue_mod._read_queue(queue_path)
    by_id = {e["id"]: e for e in entries}
    applied = 0
    for a in actions:
        if a["action"] != "expire":
            continue
        e = by_id.get(a["id"])
        if e is None or e["state"] != "approved":
            continue
        e["state"] = "expired"
        e["state_history"].append(
            {"state": "expired", "at": queue_mod._now(), "by": by, "note": a["reason"]}  # noqa: SLF001
        )
        applied += 1
    if applied:
        queue_mod._write_queue(queue_path, entries)  # noqa: SLF001
    return applied


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Evaluate decay rules on the insights queue.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("evaluate")
    p.add_argument("--queue", required=True)
    p.add_argument("--apply", action="store_true")
    p.add_argument("--new-vintage", default=None, help="current data vintage string; seasonal entries on older vintages expire")

    p = sub.add_parser("check-model")
    p.add_argument("--queue", required=True)

    args = ap.parse_args(argv)
    if args.cmd == "evaluate":
        actions = evaluate(args.queue, new_vintage=args.new_vintage)
        print(f"{len(actions)} decay actions")
        for a in actions:
            print(f"  {a['action']}: {a['id']} -- {a['reason']}")
        if args.apply:
            n = apply_expire(args.queue, actions)
            print(f"  applied {n} expirations -> {args.queue}")
    elif args.cmd == "check-model":
        flags = check_model(args.queue)
        cur = provenance.served_model().get("run_id")
        print(f"live model run_id: {cur}; {len(flags)} entries need revalidation")
        for f_ in flags:
            print(f"  {f_['id']} -- {f_['reason']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

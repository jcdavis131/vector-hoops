#!/usr/bin/env python3
"""Read the live Claude terminal monologue stream for downstream agents."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

DEFAULT_JSONL = (
    Path(__file__).resolve().parents[1] / "tasks" / "session-monologue.jsonl"
)


def configure_stdout() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def load_entries(path: Path) -> list[dict]:
    if not path.exists():
        return []
    entries: list[dict] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return entries


def filter_entries(
    entries: list[dict],
    *,
    since: str | None,
    event: str | None,
) -> list[dict]:
    filtered = entries
    if since:
        filtered = [e for e in filtered if e.get("ts", "") >= since]
    if event:
        filtered = [e for e in filtered if e.get("event") == event]
    return filtered


def main() -> None:
    configure_stdout()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--path", type=Path, default=DEFAULT_JSONL)
    parser.add_argument("--tail", type=int, default=1, help="number of recent entries")
    parser.add_argument(
        "--since", help="ISO timestamp lower bound, e.g. 2026-07-08T20:00:00Z"
    )
    parser.add_argument(
        "--event", help="filter by event type: change, heartbeat, bootstrap, ..."
    )
    parser.add_argument(
        "--format",
        choices=("json", "text", "context"),
        default="text",
        help="json=raw records; text=monologue only; context=agent-ready bundle",
    )
    args = parser.parse_args()

    entries = filter_entries(
        load_entries(args.path), since=args.since, event=args.event
    )
    if args.tail > 0:
        entries = entries[-args.tail :]

    if not entries:
        print("No monologue entries found.", file=sys.stderr)
        sys.exit(1)

    if args.format == "json":
        print(json.dumps(entries, ensure_ascii=False, indent=2))
        return

    if args.format == "text":
        for entry in entries:
            print(entry.get("monologue", ""))
        return

    latest = entries[-1]
    bundle = {
        "source": str(args.path),
        "entry_count": len(entries),
        "latest_ts": latest.get("ts"),
        "latest_event": latest.get("event"),
        "active_command": latest.get("active_command"),
        "cwd": latest.get("cwd"),
        "monologue": latest.get("monologue"),
        "recent_monologues": [e.get("monologue", "") for e in entries],
        "body_excerpt": latest.get("body_excerpt"),
        "fingerprint": latest.get("fingerprint"),
    }
    print(json.dumps(bundle, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

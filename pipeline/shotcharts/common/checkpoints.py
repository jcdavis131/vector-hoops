"""Skip-on-resume checkpoint bookkeeping. Stdlib only."""

from __future__ import annotations

import json
from pathlib import Path


def checkpoint_path(dirs, source: str, date: str) -> Path:
    p = Path(dirs["checkpoints"]) / source / f"{date}.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def load_completed(dirs, source: str, date: str) -> set:
    p = checkpoint_path(dirs, source, date)
    if not p.exists():
        return set()
    try:
        return set(json.loads(p.read_text()).get("completed_game_ids", []))
    except (json.JSONDecodeError, OSError):
        return set()


def mark_complete(dirs, source: str, date: str, game_id: str) -> None:
    p = checkpoint_path(dirs, source, date)
    done = load_completed(dirs, source, date)
    done.add(game_id)
    p.write_text(json.dumps({"source": source, "date": date, "completed_game_ids": sorted(done)}) + "\n")


def clear(dirs, source: str, date: str) -> None:
    p = checkpoint_path(dirs, source, date)
    if p.exists():
        p.unlink()

#!/usr/bin/env python3
"""Repo-local launcher for the terminal monologue watcher."""

from __future__ import annotations

import runpy
import sys
from pathlib import Path

WATCHER = (
    Path(__file__).resolve().parents[2]
    / ".cursor"
    / "projects"
    / "c-Users-jcdav"
    / "scripts"
    / "watch-terminal-monologue.py"
)

if __name__ == "__main__":
    if not WATCHER.exists():
        print(f"Watcher not found: {WATCHER}", file=sys.stderr)
        raise SystemExit(1)
    runpy.run_path(str(WATCHER), run_name="__main__")

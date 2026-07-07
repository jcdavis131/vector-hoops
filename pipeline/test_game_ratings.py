"""Track L (game ratings) invariant gates — run after build_game_ratings.py.

Run:  python pipeline/test_game_ratings.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import json

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "pipeline" / "data" / "game_ratings.json"
ASSET = ROOT / "assets" / "game_ratings.json"
FAILURES: list[str] = []


def check(cond: bool, msg: str) -> None:
    safe = msg.encode("ascii", "replace").decode("ascii")
    print(f"  [{'PASS' if cond else 'FAIL'}] {safe}")
    if not cond:
        FAILURES.append(msg)


def main() -> None:
    proc = subprocess.run(
        [sys.executable, "pipeline/build_game_ratings.py", "--fixture"],
        cwd=ROOT, capture_output=True, text=True)
    if proc.returncode != 0:
        print(proc.stdout + proc.stderr)
        raise SystemExit("build_game_ratings.py failed")
    print("  (fixture mode)")

    doc = json.loads(DATA.read_text(encoding="utf-8"))
    rows = doc.get("rows", [])
    check(len(rows) >= 2, f"fixture covers >=2 rows ({len(rows)})")
    curry = next((r for r in rows if "Curry" in r["name"]), None)
    check(curry is not None and curry.get("GK_THREE_PT", 0) >= 95,
          f"Curry three_pt high (got {curry.get('GK_THREE_PT') if curry else None})")
    wemby = next((r for r in rows if "Wembanyama" in r["name"]), None)
    check(wemby is not None and wemby.get("GK_BLOCK", 0) >= 95,
          f"Wembanyama block high (got {wemby.get('GK_BLOCK') if wemby else None})")
    check(not ASSET.exists(), "partial fixture did NOT write assets/game_ratings.json")

    print()
    if FAILURES:
        print(f"{len(FAILURES)} gate(s) FAILED")
        sys.exit(1)
    print("all game_ratings gates passed (fixture mode)")


if __name__ == "__main__":
    main()

"""Daily Court's engine calls only functions it still defines.

On 2026-10-19 the Pack Battle retirement removed renderPackSummary() but left one call behind in
finish(), so every visit to /play aborted the boot with a stack trace on the page (live until
2026-10-23). This check walks every `renderX(` / `updateX(` / `drawX(` style call in
assets/play-engine.js and assets/game-mechanics.js and asserts the function is defined in the
same file or exposed by a loaded module.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = ["assets/play-engine.js", "assets/game-mechanics.js"]
CALL = re.compile(r"(?<![.\w$])((?:render|update|draw|build|project|show|hide|init|load)[A-Z]\w*)\s*\(")
GLOBALS: set[str] = set()  # names defined outside these two files, if any ever are


def test_every_named_render_call_has_a_definition() -> None:
    defined: set[str] = set()
    calls: dict[str, set[str]] = {}
    for rel in FILES:
        src = (ROOT / rel).read_text(encoding="utf-8")
        defined |= set(re.findall(r"function\s+([A-Za-z_$][\w$]*)\s*\(", src))
        defined |= set(re.findall(r"(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()", src))
        for m in CALL.finditer(src):
            calls.setdefault(m.group(1), set()).add(rel)
    missing = {name: files for name, files in calls.items() if name not in defined and name not in GLOBALS}
    assert not missing, f"calls to functions defined nowhere: {missing}"

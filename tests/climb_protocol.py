"""herdmux gpu/climb.py's PROTOCOLS['vector-hoops'], read without importing it.

Not a test module. tests/test_rebuild_all.py compares rebuild_all's matrix
stage with the protocol's prepare chain, and tests/test_recipes.py compares
pipeline/recipes/measure.json with its train flags. climb.py lives in another
repo and is on the training box only, never in CI, so both skip without it.
It is parsed, not imported: importing it would run herdmux module code and
write bytecode into that repo.
"""

from __future__ import annotations

import ast
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def climb_py() -> Path | None:
    """herdmux's gpu/climb.py when it is on this machine (HERDMUX_ROOT, or next to this repo, or ~)."""
    roots = [os.environ.get("HERDMUX_ROOT"), ROOT.parent / "herdmux", Path.home() / "herdmux"]
    for r in roots:
        if r and (Path(r) / "gpu" / "climb.py").is_file():
            return Path(r) / "gpu" / "climb.py"
    return None


def hoops_protocol(path: Path, field: str) -> list[str]:
    """One keyword of the Protocol(...) call under the 'vector-hoops' key, as a literal."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if not isinstance(node, ast.Dict):
            continue
        for key, value in zip(node.keys, node.values, strict=True):
            if isinstance(key, ast.Constant) and key.value == "vector-hoops" and isinstance(value, ast.Call):
                for kw in value.keywords:
                    if kw.arg == field:
                        return ast.literal_eval(kw.value)
    raise AssertionError(f"no PROTOCOLS['vector-hoops'].{field} in {path}")

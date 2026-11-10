"""No tracked .py file may compile with a SyntaxWarning or DeprecationWarning.

Python 3.12+ reports an invalid escape sequence ('\\d' in a non-raw string) as a SyntaxWarning, and has
announced it becomes a SyntaxError; 3.11 (CI) reports the same thing as a DeprecationWarning. Both are
errors here. Files are compiled in memory, so nothing is written into the tree.
"""

from __future__ import annotations

import subprocess
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def tracked_py() -> list[str]:
    out = subprocess.run(
        ["git", "ls-files", "-z", "--", "*.py"], cwd=ROOT, check=True, capture_output=True, text=True
    ).stdout
    return sorted(p for p in out.split("\0") if p)


def warnings_in(source: str, name: str) -> list[tuple[str, int, str, str]]:
    with warnings.catch_warnings(record=True) as seen:
        warnings.simplefilter("always")
        compile(source, name, "exec", dont_inherit=True)
    return [
        (name, w.lineno, w.category.__name__, str(w.message))
        for w in seen
        if issubclass(w.category, (SyntaxWarning, DeprecationWarning))
    ]


def test_detector_sees_an_invalid_escape():
    got = warnings_in("x = 1\ny = '\\d'\n", "probe.py")
    assert [(g[0], g[1]) for g in got] == [("probe.py", 2)]


def test_detector_ignores_raw_and_doubled_backslashes():
    assert warnings_in("a = r'\\d'\nb = '\\\\d'\n", "probe.py") == []


def test_no_tracked_python_file_compiles_with_a_warning():
    files = tracked_py()
    assert files, "git ls-files returned no .py files"
    found = []
    for rel in files:
        found += warnings_in((ROOT / rel).read_text(encoding="utf-8"), rel)
    assert not found, "compile warnings:\n" + "\n".join(f"{f}:{n}: {c}: {m}" for f, n, c, m in found)

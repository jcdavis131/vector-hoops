#!/usr/bin/env python3
"""Fail on unbalanced braces/parens/brackets in the site's CSS.

Why this exists: a single missing `}` after `.atlas-capability` in
assets/atlas.css silently swallowed ~18 rules (the Fig.1 axes + honesty
strip shipped unstyled). Browsers drop invalid nested rules without a
word, so CI has to be the loud one. (P0 brace fix, 2026-10-21.)

Run: python3 scripts/check_css_braces.py [root-dir]
Exits 1 with the file + line of the first imbalance it finds.
stdlib only.
"""

import re
import sys
from pathlib import Path

PAIRS = {"{": "}", "(": ")", "[": "]"}
OPEN = set(PAIRS)
CLOSE = set(PAIRS.values())


def stripped_lines(path):
    src = path.read_text(encoding="utf-8")
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)  # comments
    src = re.sub(r'(["\'])(?:\\.|(?!\1).)*\1', '""', src)  # strings
    return src.splitlines()


def check(path):
    """Return (ok, message)."""
    stack = []
    for ln, line in enumerate(stripped_lines(path), 1):
        col = 0
        while col < len(line):
            ch = line[col]
            if ch in OPEN:
                stack.append((ch, ln, col + 1))
            elif ch in CLOSE:
                if not stack:
                    return False, f"{path}:{ln}:{col + 1}: unmatched closing '{ch}'"
                o, oln, ocol = stack.pop()
                if PAIRS[o] != ch:
                    return (
                        False,
                        f"{path}:{ln}:{col + 1}: '{ch}' closes '{o}' opened at {path}:{oln}:{ocol}",
                    )
            col += 1
    if stack:
        o, oln, ocol = stack[-1]
        return False, f"{path}:{oln}:{ocol}: unmatched opening '{o}'"
    return True, f"{path}: balanced"


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
    css_files = sorted(root.glob("assets/*.css")) + sorted(root.glob("public/assets/*.css"))
    if not css_files:
        print("no CSS files found", file=sys.stderr)
        return 1
    # Mirror rule: root -> public/ must be byte-identical.
    for pub in sorted(root.glob("public/assets/*.css")):
        src = root / "assets" / pub.name
        if src.exists() and src.read_bytes() != pub.read_bytes():
            print(f"MIRROR BREAK: {src} != {pub}", file=sys.stderr)
            return 1
    bad = 0
    for f in css_files:
        ok, msg = check(f)
        print(("OK  " if ok else "FAIL") + " " + msg)
        if not ok:
            bad += 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())

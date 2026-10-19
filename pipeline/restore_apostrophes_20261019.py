"""One-off migration (panel v3 G3, 2026-10-19): restore apostrophes in player names.

The dataset systematically stripped apostrophes ("Shaquille ONeal"). Four
players are affected. This renames them in every JSON asset (root and
public/ mirrors); joins/slugs are apostrophe-insensitive after the
companion slug-function fix, so keys keep resolving.
Idempotent. Run from the repo root.
"""

import glob
from pathlib import Path

RENAMES = {
    "Shaquille ONeal": "Shaquille O'Neal",
    "Jermaine ONeal": "Jermaine O'Neal",
    "Royce ONeale": "Royce O'Neale",
    "DAngelo Russell": "D'Angelo Russell",
}

ROOT = Path(__file__).resolve().parent.parent


def main():
    files = sorted(glob.glob(str(ROOT / "assets" / "*.json")))
    files += sorted(glob.glob(str(ROOT / "public" / "assets" / "*.json")))
    changed = 0
    for f in files:
        p = Path(f)
        t = p.read_text(encoding="utf-8")
        orig = t
        for old, new in RENAMES.items():
            t = t.replace(old, new)
        if t != orig:
            p.write_text(t, encoding="utf-8")
            changed += 1
            print("renamed in", p.relative_to(ROOT))
    print(f"{changed} files changed")


if __name__ == "__main__":
    main()

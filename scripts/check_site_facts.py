#!/usr/bin/env python3
"""Gate: assets/site_facts.json must equal a fresh compute from the served
data files. Fails (exit 1) when data moved and the sheet was not rebuilt —
the same contract as stamp_assets.py --check. Stdlib only."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_site_facts import compute_facts, A


def main():
    path = A("site_facts.json")
    if not Path(path).exists():
        print("FAIL assets/site_facts.json missing — run scripts/build_site_facts.py")
        return 1
    with open(path, encoding="utf-8") as f:
        current = json.load(f)
    fresh = compute_facts()
    if current.get("facts") == fresh["facts"]:
        print("OK   site facts current —", len(fresh["facts"]), "facts")
        return 0
    cur, new = current.get("facts", {}), fresh["facts"]
    for k in sorted(set(cur) | set(new)):
        if cur.get(k) != new.get(k):
            print(f"STALE {k}: sheet={cur.get(k)!r} data={new.get(k)!r}")
    print("FAIL site_facts.json is stale — run scripts/build_site_facts.py")
    return 1


if __name__ == "__main__":
    sys.exit(main())

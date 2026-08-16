"""Cut the model zoo out of front_office.json so /model stops downloading 1.1 MB
to read 8 KB.

model.html renders one table from one subtree:

    fetch('assets/front_office.json')  ->  j.model_eval.model_zoo

The file it fetches is 1,127,784 bytes. That subtree is 8,299 — **0.74% of what
comes down the wire**. The other 99% is the front office: `teams` and
`teams_by_abbr` are 447,927 and 448,107 bytes, 79.4% of the file between them, and
the model page does not touch either.

Measured on Fast 3G with a cold cache, front_office.json took 12,716 ms of the
13,259 ms it took /model to draw its map.

`front_office_lite.json` already exists and was the obvious home for this, but it
carries `teams` for owner/teams/index and has no `model_eval`. Adding the zoo to it
would push 8 KB onto every visitor of three pages that never read it — the same
trade the board already rejected once for a 33,154-byte merge. A separate slice
costs those pages nothing.

Copies verbatim. Nothing here computes, rounds or renames a value.

    python scripts/build_model_zoo.py --check    # report drift, write nothing
    python scripts/build_model_zoo.py
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "front_office.json"
TARGET = ROOT / "assets" / "model_zoo.json"


def build() -> dict:
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    zoo = (src.get("model_eval") or {}).get("model_zoo")
    if not zoo:
        sys.exit("front_office.json has no model_eval.model_zoo — refusing to write an empty slice")
    return {
        "source": "assets/front_office.json",
        "source_path": "model_eval.model_zoo",
        "generator": "scripts/build_model_zoo.py",
        "note": (
            "Verbatim slice. model.html reads only model_eval.model_zoo, and the file it "
            "used to fetch for it is 1,127,784 bytes against this subtree's 8,299."
        ),
        "built": src.get("built"),
        # the shape the page already destructures: (j.model_eval||{}).model_zoo
        "model_eval": {"model_zoo": zoo},
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report drift, write nothing")
    args = ap.parse_args()

    if not SOURCE.exists():
        sys.exit(f"missing {SOURCE}")

    want = json.dumps(build(), indent=1, sort_keys=True, ensure_ascii=False)

    if args.check:
        if not TARGET.exists():
            print(f"FAIL {TARGET.relative_to(ROOT).as_posix()} does not exist")
            return 1
        have = TARGET.read_text(encoding="utf-8")
        if have != want:
            print(f"FAIL {TARGET.relative_to(ROOT).as_posix()} is stale — "
                  f"run: python scripts/build_model_zoo.py")
            return 1
        n = len(json.loads(have)["model_eval"]["model_zoo"])
        print(f"OK model_zoo.json matches front_office.json — {n} models, {len(have)} bytes")
        return 0

    TARGET.write_text(want, encoding="utf-8", newline="")
    n = len(json.loads(want)["model_eval"]["model_zoo"])
    src_n = SOURCE.stat().st_size
    print(f"wrote {TARGET.relative_to(ROOT).as_posix()} — {n} models, {len(want)} bytes "
          f"(was reading {src_n} to get them: {100 * len(want) / src_n:.2f}%)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

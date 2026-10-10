"""Give the browser the one number it needs to read a player's row out of a 2.5 MB tensor.

`assets/mtnn_attr_topk.bin` holds, for every one of 12,966 player-seasons, the
eight input features that moved each of four predictions most, signed. Its layout
is fully described by `mtnn_attr_pop.json.topkLayout`, so a page can read any
single player's slice with two HTTP Range requests totalling **48 bytes** — the
host answers 206 with `accept-ranges: bytes`, verified against production.

What it cannot do is work out *which row*. The row index is the position in the
12,966-row matrix, and the only committed files that carry it —
`vectors_search_lite.json` and `vectors.json` — are 1.7 MB and 3.8 MB. Loading
either to look up one integer would spend seventy times the tensor slice.

So this cuts the lookup out, for the player-seasons the map actually offers:

    vectors_search_lite.json   1,734,935 B   12,966 rows, i / n / s / pid / x / y / z / c
    attr_index.json            see below     the 1,764 the map names -> row

Nothing here is computed. `i` is copied from the file that already states it, and
the pairing is checked rather than assumed: every row this writes is confirmed to
carry the same pid and season in both files before it goes in.

    python scripts/build_attr_index.py            # write
    python scripts/build_attr_index.py --check    # fail if stale
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LITE = ROOT / "assets" / "vectors_search_lite.json"
POINTS = ROOT / "assets" / "embedding_map_points_limited.json"
TOPK = ROOT / "assets" / "mtnn_attr_topk.bin"
POP = ROOT / "assets" / "mtnn_attr_pop.json"
TARGET = ROOT / "assets" / "attr_index.json"


def build() -> dict:
    lite = json.loads(LITE.read_text(encoding="utf-8"))["players"]
    pts = json.loads(POINTS.read_text(encoding="utf-8"))["points"]
    layout = json.loads(POP.read_text(encoding="utf-8"))["topkLayout"]

    by_key = {}
    for p in lite:
        pid, season, i = p.get("pid"), p.get("s"), p.get("i")
        if pid is None or season is None or i is None:
            continue
        by_key[f"{int(pid)}|{season}"] = int(i)

    rows, missing = {}, []
    for p in pts:
        key = f"{int(p['pid'])}|{p['season']}"
        if key in by_key:
            rows[key] = by_key[key]
        else:
            missing.append(key)

    n_rows = layout["shape"][0]
    out_of_range = sorted(k for k, v in rows.items() if not 0 <= v < n_rows)
    return {
        "built": "attr_index",
        "source": "assets/vectors_search_lite.json",
        "tensor": layout["file"],
        "tensorRows": n_rows,
        "note": ("row index into mtnn_attr_topk.bin and mtnn_jacobian.f32, copied from the "
                 "`i` field the source file already states. Key is pid|season."),
        "count": len(rows),
        "missing": sorted(missing),
        "outOfRange": out_of_range,
        "rows": dict(sorted(rows.items())),
    }


def dump(obj: dict) -> str:
    # compact: this is fetched over the wire, and the other payload generator
    # (build_season_map.py) made the same call for the same reason
    return json.dumps(obj, separators=(",", ":"), sort_keys=True, ensure_ascii=False)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report drift, write nothing")
    args = ap.parse_args()

    for p in (LITE, POINTS, POP, TOPK):
        if not p.exists():
            sys.exit(f"missing {p}")

    obj = build()
    if obj["outOfRange"]:
        print(f"FAIL {len(obj['outOfRange'])} row(s) fall outside the tensor's "
              f"{obj['tensorRows']} rows: {obj['outOfRange'][:5]}")
        return 1
    want = dump(obj)

    if args.check:
        if not TARGET.exists():
            print(f"FAIL {TARGET.relative_to(ROOT).as_posix()} does not exist")
            return 1
        have = TARGET.read_text(encoding="utf-8")
        if have != want:
            print(f"FAIL {TARGET.relative_to(ROOT).as_posix()} is stale — "
                  f"run: python scripts/build_attr_index.py")
            return 1
        print(f"OK attr_index.json matches vectors_search_lite.json — {obj['count']} row(s), "
              f"{len(obj['missing'])} unmatched, {len(have):,} bytes")
        return 0

    TARGET.write_text(want, encoding="utf-8", newline="")
    src = LITE.stat().st_size
    print(f"wrote {TARGET.relative_to(ROOT).as_posix()} — {obj['count']} of {len(json.loads(POINTS.read_text(encoding='utf-8'))['points'])} "
          f"mapped player-seasons resolve to a row, {len(obj['missing'])} do not, "
          f"{len(want):,} bytes ({100 * len(want) / src:.1f}% of the {src:,} it was cut from)")
    if obj["missing"]:
        print(f"  unmatched: {obj['missing'][:6]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

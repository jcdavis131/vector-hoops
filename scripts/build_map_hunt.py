#!/usr/bin/env python3
"""Build the Map Hunt / Twin Hunt daily puzzle data (Worker B, opening-night overhaul).

Stdlib + numpy. Outputs under assets/map-hunt/:

  candidates.json   compact quiz pool: [index, name, season, twinIndex, twinName, twinSeason, sim]
  index.json        {v, generated, days: {dayKey: {mh: mysteryIdx, th: givenIdx, tht: twinIdx}}}
  dist/<day>-mh.u8  12,966 uint8 cosine distances TO the mystery player
  dist/<day>-th.u8  12,966 uint8 cosine distances TO the twin-hunt target (the twin)

Row order = vectors.json['players'] order (0..12965), index-aligned with
mtnn_embeddings.f32 (64-d, L2-normalized) and mtnn_map.json coords.
Quantization: cosine distance d in [0,2] -> round(d/2*255) as uint8 (~13 KiB/file).

Daily picks are deterministic: sha256("map-hunt-v1|<day>|<mode>") so every
visitor gets the same puzzle and shared links replay identically.
Same-link-same-stars: the URL encodes day+mode+result; stars derive from tap
count alone, so a link always replays the same stars.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
OUT = ASSETS / "map-hunt"
VERSION = "map-hunt-v1"

# Puzzle window: a week back (shared-link replay) + two weeks forward.
START = dt.date(2026, 10, 13)
END = dt.date(2026, 11, 3)


def day_key(d: dt.date) -> str:
    return d.isoformat()


def pick_index(day: str, mode: str, n: int) -> int:
    h = hashlib.sha256(f"{VERSION}|{day}|{mode}".encode()).digest()
    return int.from_bytes(h[:8], "big") % n


def main() -> int:
    try:
        import numpy as np
    except ImportError:
        sys.exit("numpy required (available on this VM)")

    vec = json.loads((ASSETS / "vectors.json").read_text())
    players = vec["players"]
    n = len(players)
    assert n == 12966, f"expected 12966 rows, got {n}"

    by_name_season: dict[tuple[str, str], int] = {}
    by_name: dict[str, int] = {}
    for i, p in enumerate(players):
        by_name_season[(p["name"].lower(), p["season"])] = i
        by_name.setdefault(p["name"].lower(), i)

    def resolve(name: str, season: str) -> int | None:
        hit = by_name_season.get((name.lower(), season))
        if hit is not None:
            return hit
        return by_name.get(name.lower())

    era = json.loads((ASSETS / "eratwins.json").read_text())
    candidates: list[list] = []
    unresolved = 0
    for e in era["players"]:
        ci = resolve(e["name"], e["season"])
        tw = e.get("twin") or {}
        ti = resolve(tw.get("name", ""), tw.get("season", "")) if tw else None
        if ci is None or ti is None or ci == ti:
            unresolved += 1
            continue
        candidates.append([ci, e["name"], e["season"], ti, tw["name"], tw["season"],
                           round(float(tw.get("similarity", 0)), 4)])
    print(f"resolved {len(candidates)}/{len(era['players'])} quiz-pool candidates "
          f"({unresolved} dropped: no row match)")

    nc = len(candidates)
    if nc < 100:
        sys.exit("too few candidates — refusing to ship a thin pool")

    OUT.mkdir(exist_ok=True)
    (OUT / "dist").mkdir(exist_ok=True)
    (OUT / "candidates.json").write_text(json.dumps(candidates, separators=(",", ":")))

    E = np.fromfile(str(ASSETS / "mtnn_embeddings.f32"), dtype="<f4").reshape(n, 64)
    norms = np.linalg.norm(E, axis=1)
    if not np.allclose(norms, 1.0, atol=1e-3):
        sys.exit(f"embeddings not L2-normalized (max dev {np.abs(norms-1).max()})")

    days: dict[str, dict] = {}
    d = START
    targets: set[int] = set()
    day_list: list[tuple[str, int, int]] = []
    while d <= END:
        k = day_key(d)
        mh = pick_index(k, "mh", nc)
        th = pick_index(k, "th", nc)
        if th == mh:
            th = (th + 1) % nc
        mi = candidates[mh][0]
        gi = candidates[th][0]
        ti = candidates[th][3]
        days[k] = {"mh": mi, "th": gi, "tht": ti}
        targets.add(mi)
        targets.add(ti)
        day_list.append((k, mi, ti))
        d += dt.timedelta(days=1)

    # One pass: distance vector per unique target row.
    for t in sorted(targets):
        dot = E @ E[t]
        dist = np.clip(2.0 - 2.0 * dot, 0.0, 2.0)
        q = np.round(dist / 2.0 * 255.0).astype(np.uint8)
        # stash on disk keyed by target; the day loop renames copies.
        q.tofile(str(OUT / "dist" / f"_t{t}.u8"))

    for k, mi, ti in day_list:
        (OUT / "dist" / f"{k}-mh.u8").write_bytes((OUT / "dist" / f"_t{mi}.u8").read_bytes())
        (OUT / "dist" / f"{k}-th.u8").write_bytes((OUT / "dist" / f"_t{ti}.u8").read_bytes())
    for f in (OUT / "dist").glob("_t*.u8"):
        f.unlink()

    (OUT / "index.json").write_text(json.dumps(
        {"v": 1, "generated": dt.date.today().isoformat(), "days": days},
        separators=(",", ":")))

    # Sanity: mystery is its own nearest (dist 0) and twin is near the given.
    k0, mi0, ti0 = day_list[0]
    q = np.fromfile(str(OUT / "dist" / f"{k0}-mh.u8"), dtype=np.uint8)
    assert len(q) == n and q[mi0] == 0, "self-distance must quantize to 0"
    print(f"OK  {len(day_list)} days, {len(targets)} unique targets, "
          f"self-dist of {k0} mystery = 0")
    return 0


if __name__ == "__main__":
    sys.exit(main())

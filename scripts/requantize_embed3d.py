#!/usr/bin/env python3
"""Finalize assets/projections/embed3d.json to fit the 1.5MB budget (V3 format).

Starts from the build output (int-millis coords, implicit ids) and compacts
the per-point metadata. All deviations from the draft schema are documented
in meta. Pure representation change — projections untouched.

Per-point: {"n":nameIdx, "s":seasonStartYear, "t":team|"null", "c":cluster,
             "pca":[millis x3], "tsne":[millis x3], "umap":[millis x3]}
meta.names[nameIdx] -> full name;  s=1996 means the 1996-97 season.

Run: python3 scripts/requantize_embed3d.py
"""
import json
from pathlib import Path

SRC = "assets/projections/embed3d.json"

doc = json.load(open(SRC))
meta, pts = doc["meta"], doc["points"]
assert meta["n"] == len(pts) == 12966
projs = meta["projections"]
assert set(projs) == {"pca", "tsne", "umap"}

names = sorted({p["name"] for p in pts})
nidx = {n: i for i, n in enumerate(names)}

compact = []
for p in pts:
    q = {
        "n": nidx[p["name"]],
        "s": int(p["season"][:4]),
        "t": p["team"],
        "c": p["c"],
    }
    for a in projs:
        q[a] = p[a]  # already int millis
    compact.append(q)

meta["names"] = names
meta["fields"] = {
    "n": "index into meta.names",
    "s": "season starting year as int; 1996 = the 1996-97 season",
    "t": "team abbreviation (null when unknown)",
    "c": "k-means cluster id (0-7)",
    "pca/tsne/umap": "3 coords as int millis; divide by 1000 "
    "(3-decimal-equivalent precision)",
}
meta["id"] = "omitted per-point; point id IS its index in the points array"
doc["points"] = compact

with open(SRC, "w") as f:
    json.dump(doc, f, separators=(",", ":"), ensure_ascii=False)

size = Path(SRC).stat().st_size
print(f"final: {size:,} bytes ({size / 1e6:.2f} MB)")
assert size <= 1_500_000, "STILL OVER BUDGET"
print("budget OK (<=1.5MB)")

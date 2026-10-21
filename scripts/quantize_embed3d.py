#!/usr/bin/env python3
"""Diet for assets/projections/embed3d.json: V3 -> V4 (P0 perf budget work).

The V3 file was already "quantized" in one sense: coords are int millis
(3-decimal-equivalent precision). Re-rounding to 3 decimals would be a no-op,
so the real diet is the CONTAINER, not the precision:

  V3 per point: {"n":..,"s":..,"t":"DAL","c":..,"pca":[..],"tsne":[..],"umap":[..]}
  V4 columnar:  {"meta":{...}, "n":[delta-encoded name idx], "m":[packed meta],
                 "pca":[flat], "tsne":[flat], "umap":[flat]}

Precision choice (documented, binding):
  Each projection is CENTERED (mean subtracted, exactly as embed-3d.js does
  at load) then normalized to unit max-radius at repack time, and stored as
  int millis = round(v / R * 1000), i.e. 3 decimals OF THE RENDERED VALUE.
  The loader skips its center+normalize step for V4 (meta.normalized=true),
  so the rendered positions match V3 up to the quantization error alone:
  <= 0.0005 per axis, <= 0.00087 Euclidean per point.
  That is ~50x smaller than the typical nearest-neighbor distance (~0.043)
  in the 12,966-point unit cloud, so neighborhoods are stable -- verified by
  the 5-point nearest-neighbor check below (only exact near-tie order swaps
  can differ, which are unstable under any quantization). No data is
  fabricated; only the representation changes. The raw int-millis values are
  NOT recoverable from V4 (R is stored in meta.norm_radius for audit, but
  un-rounding is impossible).

Column encodings (all lossless, all documented in meta.fields):
  n : delta-encoded indices into meta.names (loader accumulates a prefix sum).
  m : one int per point packing three small fields, decoded by the loader as
        season = 1996 + (m >> 9)
        team   = meta.teams[((m >> 3) & 63) - 1]   (index -1 => null/unknown)
        cluster= m & 7
      Packing: m = (season-1996)*512 + (teamIdx+1)*8 + cluster
      (bit layout [season:6][team:6][cluster:3], 36 teams need 6 bits).
  pca/tsne/umap : flat int arrays, point i owns elements [3i, 3i+2].

Row order is untouched (row i is still player-season i of vectors.json);
point id is still the array index. Provenance fields (method,
variance_explained, kl_divergence, kmeans_k, silhouette, built_at, seed)
are carried over verbatim.

Run:  python3 scripts/quantize_embed3d.py
Then: python3 scripts/stamp_assets.py   # refresh ?v= content hashes
      python3 scripts/sync_public.py    # mirror root -> public/
"""
import datetime
import json
import math
from pathlib import Path

SRC = Path("assets/projections/embed3d.json")

SEASON_BASE = 1996

doc = json.load(open(SRC))
meta, pts = doc["meta"], doc["points"]
n = len(pts)
assert meta["n"] == n == 12966, f"row count changed: {n}"
projs = meta["projections"]
assert set(projs) == {"pca", "tsne", "umap"}

names = meta["names"]
assert len(names) == 2422

teams = sorted({p["t"] for p in pts if p["t"]})
tidx = {t: i for i, t in enumerate(teams)}
assert len(teams) <= 62, f"too many teams for 6-bit packing: {len(teams)}"

# --- coordinates: center, normalize to unit max-radius, store int millis ---
# NOTE: centering happens BEFORE the radius is measured (mirroring exactly
# what embed-3d.js does at load). Normalizing by the *uncentered* radius
# inflates the quantization error by R_uncentered/R_centered in the final
# rendered units -- measured up to 0.0025 shift and near-tie neighbor swaps.
# Centered-first keeps the rendered shift under 0.001 per the P0 check.
norm_radius = {}
flat = {}
for a in projs:
    raw = [x / 1000.0 for p in pts for x in p[a]]
    assert len(raw) == n * 3
    mx = sum(raw[0::3]) / n
    my = sum(raw[1::3]) / n
    mz = sum(raw[2::3]) / n
    cen = [v - m for v, m in zip(raw, [mx, my, mz] * n)]
    rmax = 0.0
    for i in range(0, len(cen), 3):
        r = math.sqrt(cen[i] ** 2 + cen[i + 1] ** 2 + cen[i + 2] ** 2)
        if r > rmax:
            rmax = r
    norm_radius[a] = rmax  # centered max radius, original units
    flat[a] = [round(v / rmax * 1000) for v in cen]

# --- name indices: delta encoding (lossless) ---
nidx = [p["n"] for p in pts]
dn = [nidx[0]] + [b - a for a, b in zip(nidx, nidx[1:])]
# round-trip check of the delta encoding
acc, rt = 0, []
for d in dn:
    acc += d
    rt.append(acc)
assert rt == nidx, "delta round-trip failed"

# --- per-point metadata: pack (season, team, cluster) into one int ---
# bit layout: [season_off:6][team:6][cluster:3] = 15 bits
mcol = []
for p in pts:
    s_off = p["s"] - SEASON_BASE
    assert 0 <= s_off <= 63, f"season out of 6-bit range: {p['s']}"
    t = (tidx[p["t"]] + 1) if p["t"] else 0
    assert 0 <= t <= 63
    c = p["c"]
    assert 0 <= c <= 7
    code = (s_off << 9) | (t << 3) | c
    # decode round-trip
    assert (code >> 9) == s_off
    assert ((code >> 3) & 63) == t
    assert (code & 7) == c
    mcol.append(code)

new_meta = {
    "format": 4,
    "projections": projs,
    "normalized": True,  # centered + unit max-radius already; loader must NOT redo it
    "method": meta["method"],
    "variance_explained": meta["variance_explained"],
    "kl_divergence": meta["kl_divergence"],
    "kmeans_k": meta["kmeans_k"],
    "silhouette": meta["silhouette"],
    "silhouette_sample": meta["silhouette_sample"],
    "built_at": meta["built_at"],
    "repacked_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "repacked_by": "scripts/quantize_embed3d.py (V3->V4 columnar diet)",
    "n": n,
    "seed": meta["seed"],
    "norm_radius": {a: norm_radius[a] for a in projs},
    "coord_encoding": (
        "V4: int millis of the centered, unit-max-radius-normalized "
        "projection (3 decimals of the rendered value); divide by 1000. "
        "Rendered positions match V3 up to <=0.00087 Euclidean per point."
    ),
    "id": meta["id"],
    "names": names,
    "teams": teams,
    "season_base": SEASON_BASE,
    "fields": {
        "n": "delta-encoded indices into meta.names (prefix-sum to decode)",
        "m": ("packed per-point int: season=1996+(m>>9), "
              "team=meta.teams[((m>>3)&63)-1] (-1 => null), cluster=m&7"),
        "pca/tsne/umap": ("flat int arrays, 3 per point in row order; "
                           "int millis of centered unit-normalized coords, "
                           "/1000; loader must not re-center/re-normalize"),
    },
}

out = {"meta": new_meta, "n": dn, "m": mcol}
for a in projs:
    out[a] = flat[a]

with open(SRC, "w") as f:
    json.dump(out, f, separators=(",", ":"), ensure_ascii=False)

size = SRC.stat().st_size
print(f"V4: {size:,} bytes ({size / 1024:.0f} KiB)")

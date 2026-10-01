#!/usr/bin/env python3
"""Build assets/trails.json — per-player season-by-season career trails.

Input : assets/vectors.json (players[].person_id/name/season/x/y/z/v[14], featureLabels)
Output: assets/trails.json keyed by person_id (identity fix 2026-10-01: NEVER
    key on display names — suffixes were stripped upstream), only persons with
    2+ seasons:
    { "lebron-james": {
        "display": "LeBron James",
        "seasons": ["2003-04", ...],
        "pts": [[x, y, z], ...],          # data-space coords, identical to the map
        "deltas": [[], [["FG3A", 1], ...], ...]  # deltas[i] = change INTO season i,
        # compact [dim_code, direction] pairs; the client renders
        # labels from _meta.labels (keeps the JSON offline-cacheable)
    } }

Stdlib only. Real data only. Any QA failure is a hard failure (non-zero exit).
"""

import json
import math
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VEC_PATH = os.path.join(ROOT, "assets", "vectors.json")
OUT_PATH = os.path.join(ROOT, "assets", "trails.json")

SHOWCASE = ["LeBron James", "Vince Carter", "Dirk Nowitzki", "Stephen Curry"]


def season_year(s):
    # "1996-97" -> 1996 ; "1999-00" -> 1999
    return int(s.split("-")[0])


def norm_name(n):
    return " ".join(n.strip().lower().split())


def person_slug(name):
    """Canonical person slug (same rule as dossier.js / apply_player_identity.py)."""
    s = name.lower().replace(".", "").replace("'", "")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def main():
    with open(VEC_PATH, "r", encoding="utf-8") as f:
        vec = json.load(f)
    players = vec["players"]
    labels = vec["featureLabels"]  # code -> plain-language name
    dim_codes = list(labels.keys())  # order matches v[14]
    assert len(dim_codes) == 14, f"expected 14 dims, got {len(dim_codes)}"

    by_pid = {}
    for p in players:
        # person_id is the identity key (identity fix 2026-10-01). A missing
        # person_id means the identity applier was not run — hard fail.
        pid = p.get("person_id")
        assert pid, f"row id={p.get('id')} missing person_id; run apply_player_identity.py"
        by_pid.setdefault(pid, []).append(p)

    trails = {}
    for pid, recs in by_pid.items():
        if len(recs) < 2:
            continue
        recs.sort(key=lambda r: season_year(r["season"]))
        years = [season_year(r["season"]) for r in recs]
        assert all(
            b > a for a, b in zip(years, years[1:])
        ), f"season order broken: {pid}"

        seasons = [r["season"] for r in recs]
        pts = [[r["x"], r["y"], r["z"]] for r in recs]
        for pt in pts:
            assert all(
                isinstance(v, (int, float)) and math.isfinite(v) for v in pt
            ), f"non-finite point: {pid}"

        deltas = []
        for i, r in enumerate(recs):
            if i == 0:
                deltas.append([])  # rookie season: nothing to compare against
                continue
            a, b = recs[i - 1]["v"], r["v"]
            assert len(a) == 14 and len(b) == 14, f"bad v length: {pid} {r['season']}"
            assert all(math.isfinite(v) for v in a + b), f"non-finite v: {pid}"
            movers = sorted(range(14), key=lambda k: abs(b[k] - a[k]), reverse=True)[:2]
            # compact: [dim_code, direction] — the client renders "label ↑/↓"
            # from the 14-entry label table (keeps trails.json < 1MB so sw.js caches it)
            chips = []
            for k in movers:
                d = 1 if b[k] > a[k] else (-1 if b[k] < a[k] else 0)
                chips.append([dim_codes[k], d])
            deltas.append(chips)

        trails[pid] = {
            "display": recs[0]["name"],
            "seasons": seasons,
            "pts": [[round(v, 4) for v in pt] for pt in pts],
            "deltas": deltas,
        }

    # ---- QA (hard-block) ----
    # 1910 = 1901 pre-fix multi-season "names" - 11 merged collisions
    #        + 20 split persons with 2+ seasons
    #        (Ron Harper Jr. and Reggie Williams b1964 each have 1 season)
    n_multi = sum(1 for recs in by_pid.values() if len(recs) >= 2)
    assert n_multi == 1910, f"multi-season career count changed: {n_multi} != 1910"
    assert (
        len(trails) == n_multi
    ), f"trail count {len(trails)} != multi-season persons {n_multi}"
    assert not any(
        len(recs) < 2 for recs in (v for k, v in by_pid.items() if k in trails)
    ), "short trail leaked in"

    # every trail point must equal the map's x/y/z exactly (no drift, no transform)
    src = {
        (p["person_id"], p["season"]): (p["x"], p["y"], p["z"]) for p in players
    }
    for pid, t in trails.items():
        assert (
            len(t["seasons"]) == len(t["pts"]) == len(t["deltas"])
        ), f"length mismatch: {pid}"
        for s, pt in zip(t["seasons"], t["pts"]):
            sx, sy, sz = src[(pid, s)]
            assert pt == [
                round(sx, 4),
                round(sy, 4),
                round(sz, 4),
            ], f"point drift: {pid} {s}"
        assert t["deltas"][0] == [], f"rookie delta not empty: {pid}"
        for d in t["deltas"][1:]:
            assert 1 <= len(d) <= 2, f"bad delta chips: {pid} {d}"
            for code, direction in d:
                assert code in labels, f"unknown dim code: {pid} {code}"
                assert direction in (1, -1, 0), f"bad direction: {pid} {d}"

    # showcase careers from the spec's acceptance criteria
    for s in SHOWCASE:
        key = person_slug(s)
        assert key in trails, f"showcase player missing: {s}"
        print(f"  showcase {s}: {len(trails[key]['seasons'])} seasons")
    two_season = [t["display"] for t in trails.values() if len(t["seasons"]) == 2]
    assert two_season, "no 2-season stub found"
    print(f"  2-season stub example: {two_season[0]}")

    trails["_meta"] = {
        "labels": labels,
        "seasons_range": [
            min(season_year(r["season"]) for recs in by_pid.values() for r in recs),
            max(season_year(r["season"]) for recs in by_pid.values() for r in recs),
        ],
    }

    # mirror to public/ (Vercel serves public/ at the site root)
    def emit(rel_path, obj):
        for base in ("assets", os.path.join("public", "assets")):
            p = os.path.join(ROOT, base, os.path.basename(rel_path))
            with open(p, "w", encoding="utf-8") as f:
                json.dump(obj, f, separators=(",", ":"))
        return os.path.join(ROOT, "assets", os.path.basename(rel_path))

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(trails, f, separators=(",", ":"))
    # round-trip
    with open(OUT_PATH, "r", encoding="utf-8") as f:
        rt = json.load(f)
    assert len(rt) == len(trails), "round-trip lost entries"
    del trails["_meta"]  # keep the in-memory shape clean for the asserts below
    emit(OUT_PATH, rt)

    # tiny index so the client can decide whether to show the Trail button
    # without fetching the full file
    index = {pid: len(t["seasons"]) for pid, t in trails.items()}
    index_path = emit(os.path.join(ROOT, "assets", "trails_index.json"), index)
    assert len(index) == n_multi, "index count mismatch"
    print(
        f"OK: {index_path}: {len(index)} entries, "
        f"{os.path.getsize(index_path)//1024} KB"
    )

    size_kb = os.path.getsize(OUT_PATH) / 1024
    print(f"OK: {OUT_PATH}: {len(trails)} trails, {size_kb:.0f} KB")
    if size_kb > 1024:
        print(
            "WARNING: >1MB — sw.js will not cache it for offline; consider rounding harder",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()

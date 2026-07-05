"""Enrich assets/vectors.json in place (additive, game contract preserved):

1. proj  — the affine map v(14) -> map xyz(3), recovered by least squares from
   the shipped (v, xyz) pairs. PCA + min-max scaling is linear, so the recovery
   is exact up to the 4-decimal rounding of x/y/z. Lets the client project any
   vector (e.g. the daily fused Chimera) into the 3D map honestly.
2. axes  — human interpretations of PC1/PC2/PC3 from feature correlations,
   each with hi/lo end labels a basketball fan can read.
3. p     — per-player position index into `positions` (PG,SG,SF,PF,C), joined
   from Basketball-Reference season totals (pipeline/cache/positions_bbref.json,
   built by fetch_positions.py). Missing rows are back-filled from the same
   player's nearest other season; still-unknown stays -1.

Run:  python pipeline/enrich_vectors.py
"""
from __future__ import annotations

import json
import sys
import unicodedata
import re
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
VECTORS = ROOT.parent / "assets" / "vectors.json"
POS_CACHE = ROOT / "cache" / "positions_bbref.json"

POSITIONS = ["PG", "SG", "SF", "PF", "C"]
POS_IDX = {p: i for i, p in enumerate(POSITIONS)}
# rare generic tags on older BBRef pages -> nearest canonical bucket
GENERIC = {"G": "SG", "F": "SF", "C-F": "C", "F-C": "PF", "G-F": "SF", "F-G": "SF"}

# stats.nba.com abbreviations -> BBRef full names (normalized keys)
ALIASES = {
    "clarweatherspoon": "clarenceweatherspoon",
    "danschayes": "dannyschayes",
    "ikeaustin": "isaacaustin",
}

# Curated axis names, verified against the printed correlations:
#   PC1: OREB -0.86, FG3A +0.79, BLK -0.73, DREB -0.71, FG3_PCT +0.70
#   PC2: PTS  -0.87, FTA  -0.84, FGA -0.71, TOV  -0.60
#   PC3: TOV  +0.58, STL  +0.55, AST +0.54
# hi = the 1.0 end of the map axis, lo = the 0.0 end.
AXIS_NAMES = [
    {"pc": "PC1", "name": "Paint vs perimeter", "lo": "bigs (boards, blocks)", "hi": "shooters (3PA, 3P%)"},
    {"pc": "PC2", "name": "Scoring load", "lo": "high-usage scorers (PTS, FGA, FTA)", "hi": "low-usage role players"},
    {"pc": "PC3", "name": "Ball in hand", "lo": "off-ball, low-event", "hi": "handlers (AST, STL, TOV)"},
]


def norm_name(name: str) -> str:
    s = unicodedata.normalize("NFKD", name)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower()
    for suffix in (" jr", " sr", " ii", " iii", " iv", " v"):
        if s.replace(".", "").rstrip().endswith(suffix):
            s = s.replace(".", "").rstrip()
            s = s[: -len(suffix)]
            break
    return re.sub(r"[^a-z0-9]", "", s)


def season_start(season: str) -> int:
    return int(season[:4])


def recover_projection(players: list[dict]) -> tuple[np.ndarray, np.ndarray, float]:
    V = np.array([p["v"] for p in players])            # (n, 14)
    XYZ = np.array([[p["x"], p["y"], p["z"]] for p in players])  # (n, 3)
    A1 = np.hstack([V, np.ones((len(V), 1))])          # (n, 15)
    coef, _, _, _ = np.linalg.lstsq(A1, XYZ, rcond=None)
    W = coef[:14]                                      # (14, 3)
    b = coef[14]                                       # (3,)
    resid = np.abs(A1 @ coef - XYZ).max()
    return W, b, float(resid)


def axis_report(players: list[dict], features: list[str]) -> None:
    V = np.array([p["v"] for p in players])
    XYZ = np.array([[p["x"], p["y"], p["z"]] for p in players])
    for d in range(3):
        r = [float(np.corrcoef(V[:, f], XYZ[:, d])[0, 1]) for f in range(len(features))]
        order = sorted(range(len(features)), key=lambda f: -abs(r[f]))
        tops = ", ".join(f"{features[f]} {r[f]:+.2f}" for f in order[:5])
        print(f"  PC{d + 1}: {tops}")


def join_positions(players: list[dict]) -> tuple[list[int], dict]:
    cache = json.loads(POS_CACHE.read_text(encoding="utf-8"))
    # season -> normname -> canonical pos index
    lookup: dict[str, dict[str, int]] = {}
    for season, rows in cache.items():
        m = {}
        for name, pos in rows.items():
            tok = pos.split("-")[0]
            tok = GENERIC.get(pos, GENERIC.get(tok, tok if tok in POS_IDX else None))
            if tok in POS_IDX:
                m[name] = POS_IDX[tok]
        lookup[season] = m

    out = []
    misses: dict[str, list[int]] = {}
    for i, p in enumerate(players):
        key = norm_name(p["name"])
        key = ALIASES.get(key, key)
        idx = lookup.get(p["season"], {}).get(key, -1)
        out.append(idx)
        if idx < 0:
            misses.setdefault(key, []).append(i)

    # back-fill from the same player's nearest labeled season
    filled = 0
    for key, idxs in misses.items():
        labeled = []  # (season_start, pos)
        for season, m in lookup.items():
            if key in m:
                labeled.append((season_start(season), m[key]))
        if not labeled:
            continue
        for i in idxs:
            want = season_start(players[i]["season"])
            labeled.sort(key=lambda t: abs(t[0] - want))
            out[i] = labeled[0][1]
            filled += 1

    n = len(players)
    known = sum(1 for v in out if v >= 0)
    stats = {
        "direct": n - len([i for idxs in misses.values() for i in idxs]),
        "backfilled": filled,
        "unknown": n - known,
        "coverage": round(known / n, 4),
    }
    return out, stats


def main() -> None:
    data = json.loads(VECTORS.read_text(encoding="utf-8"))
    players = data["players"]

    W, b, resid = recover_projection(players)
    print(f"projection recovered: max |residual| = {resid:.5f} (expect ~1e-4 rounding)")
    if resid > 0.01:
        print("ERROR: xyz is not an affine map of v — refusing to ship proj")
        sys.exit(1)
    data["proj"] = {
        "W": [[round(float(w), 6) for w in row] for row in W],
        "b": [round(float(x), 6) for x in b],
        "note": "xyz = clamp01(v . W + b); exact affine recovery of the build-time PCA+minmax map",
    }

    print("PC-feature correlations (for axis naming):")
    axis_report(players, data["features"])
    data["axes"] = AXIS_NAMES

    if POS_CACHE.exists():
        pos, stats = join_positions(players)
        for p, v in zip(players, pos):
            p["p"] = v
        data["positions"] = POSITIONS
        print(f"positions joined: {stats}")
        if stats["coverage"] < 0.97:
            print("WARNING: coverage below 97% — check name normalization")
    else:
        print("positions cache missing — run fetch_positions.py first; skipping")

    VECTORS.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {VECTORS} ({VECTORS.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()

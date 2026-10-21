#!/usr/bin/env python3
"""Build the Pillar 4 viz-library demo data. Stdlib only.

Two outputs, both real data sliced from the repo's served artifacts:

1. assets/era_uniqueness.json
   Era-Uniqueness 0-100: for each of the 12,966 player-seasons, 1 - cosine
   similarity to its own decade's mean in the L2-normalized MTNN v5 64-d
   embedding, min-max normalized to 0-100 across all seasons. This is the
   metric the (unmerged) scout/insights branch wired as the 8th Insights
   card; here it graduates to a viz-lib primitive with the method documented
   in the file itself.
2. assets/viz_demo.json
   A small honest slice for the viz gallery page: featured player-seasons
   (player_index entries), their precomputed top-8 peers (peers_top8.json),
   twin-centrality counts+ranks, and era-twin entries. No invented numbers.

Usage:
    python3 scripts/build_viz_data.py            # write both files
    python3 scripts/build_viz_data.py --check    # verify they are current
"""

from __future__ import annotations

import argparse
import array
import hashlib
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

DIM = 64
N = 12966

# Featured player-seasons for the viz gallery (name, season). Chosen for
# story value, not cherry-picked numbers: the unanimous MVP, the two most
# compared careers, a modern MVP, and two all-time arcs.
FEATURED = [
    ("Stephen Curry", "2015-16"),
    ("Michael Jordan", "1996-97"),
    ("LeBron James", "2012-13"),
    ("Nikola Jokic", "2022-23"),
    ("Kobe Bryant", "2005-06"),
    ("Dirk Nowitzki", "2006-07"),
    ("Shaquille ONeal", "1999-00"),  # raw key; display name fixed by NAME_FIXES
    ("Tim Duncan", "2002-03"),
]

UNI_OUT = ASSETS / "era_uniqueness.json"
DEMO_OUT = ASSETS / "viz_demo.json"
TRAILS_OUT = ASSETS / "trails_featured.json"
TRAIL_PICKS = ["lebron-james", "kobe-bryant", "dirk-nowitzki"]

METHOD = (
    "Era-Uniqueness 0-100: 1 - cosine(player, own-decade mean) in the "
    "L2-normalized MTNN v5 64-d embedding (assets/mtnn_embeddings.f32), "
    "minus the player's own season median (whole seasons drift together: "
    "rule changes, pace waves, the 2019-20 bubble), then min-max "
    "normalized to 0-100 over all 12,966 player-seasons. Higher = stranger "
    "for its time, relative to the player's own season baseline. Decade "
    "means are computed over the same normalized vectors."
)


def load_embeddings() -> array.array:
    raw = (ASSETS / "mtnn_embeddings.f32").read_bytes()
    vec = array.array("f", raw)
    assert len(vec) == N * DIM, f"expected {N * DIM} floats, got {len(vec)}"
    return vec


def uniqueness_scores(vec: array.array, players: list[dict]) -> list[float]:
    # L2-normalize each row in place.
    norms = [0.0] * N
    for i in range(N):
        s = 0.0
        off = i * DIM
        for d in range(DIM):
            v = vec[off + d]
            s += v * v
        norms[i] = math.sqrt(s) or 1.0
    for i in range(N):
        n = norms[i]
        off = i * DIM
        for d in range(DIM):
            vec[off + d] /= n
    # Per-decade means of normalized vectors, then normalize the means.
    decades: dict[str, list[int]] = {}
    for p in players:
        decades.setdefault(p["decade"], []).append(p["id"])
    means: dict[str, list[float]] = {}
    for dec, ids in decades.items():
        m = [0.0] * DIM
        for i in ids:
            off = i * DIM
            for d in range(DIM):
                m[d] += vec[off + d]
        n = math.sqrt(sum(x * x for x in m)) or 1.0
        means[dec] = [x / n for x in m]
    # 1 - cosine to own-decade mean.
    raw = [0.0] * N
    for p in players:
        i = p["id"]
        m = means[p["decade"]]
        off = i * DIM
        dot = sum(vec[off + d] * m[d] for d in range(DIM))
        raw[i] = 1.0 - dot
    # Season-median adjustment: whole seasons drift together (rule changes,
    # pace waves, the 2019-20 bubble). Subtract each season's median so the
    # score measures the PLAYER's strangeness against their own season's
    # baseline, not the season's strangeness against the decade.
    by_season: dict[str, list[float]] = {}
    for p in players:
        by_season.setdefault(p["season"], []).append(raw[p["id"]])
    medians = {}
    for season, vals in by_season.items():
        vals.sort()
        medians[season] = vals[len(vals) // 2]
    adj = [raw[p["id"]] - medians[p["season"]] for p in players]
    lo, hi = min(adj), max(adj)
    span = (hi - lo) or 1.0
    return [round((s - lo) / span * 100, 2) for s in adj]


def build_uniqueness() -> dict:
    vec = load_embeddings()
    players = json.loads((ASSETS / "player_index.json").read_text())["players"]
    scores = uniqueness_scores(vec, players)
    top_ids = sorted(range(N), key=lambda i: -scores[i])[:24]
    by_id = {p["id"]: p for p in players}
    decades_sorted = sorted({p["decade"] for p in players})
    dec_idx = {d: str(k) for k, d in enumerate(decades_sorted)}
    return {
        "built": "2026-10-20",
        "method": METHOD,
        "n": N,
        "decades": decades_sorted,
        # decades_of[i] = index into decades[] for player id i (compact string)
        "decades_of": "".join(dec_idx[by_id[i]["decade"]] for i in range(N)),
        "scores": scores,  # index = player id, 0-100
        "top": [{"id": i, "score": scores[i]} for i in top_ids],
        "names": {
            str(i): {
                "name": by_id[i]["name"],
                "season": by_id[i]["season"],
                "decade": by_id[i]["decade"],
            }
            for i in top_ids
        },
        "sha256": hashlib.sha256((ASSETS / "mtnn_embeddings.f32").read_bytes()).hexdigest()[:16],
    }


def build_demo() -> dict:
    players = {p["id"]: p for p in json.loads((ASSETS / "player_index.json").read_text())["players"]}
    by_name = {(p["name"], p["season"]): p["id"] for p in players.values()}
    peers_doc = json.loads((ASSETS / "peers_top8.json").read_text())
    peers = peers_doc["peers"]
    cen = json.loads((ASSETS / "twin_centrality.json").read_text())
    counts = cen["counts"]
    order = sorted(range(len(counts)), key=lambda i: -counts[i])
    rank_of = {i: r + 1 for r, i in enumerate(order)}
    twins: dict[str, dict] = {}
    for t in json.loads((ASSETS / "eratwins.json").read_text()).get("players", []):
        twins[t["name"].lower() + "|" + t["season"]] = t

    featured = []
    for name, season in FEATURED:
        pid = by_name.get((name, season))
        if pid is None:
            raise SystemExit(f"featured player-season not found: {name} {season}")
        p = players[pid]
        row = peers[pid]
        peer_list = [{"id": row[i], "sim": row[i + 1]} for i in range(0, len(row), 2)]
        tw = twins.get(name.lower() + "|" + season)
        featured.append(
            {
                "id": pid,
                "name": p["name"],
                "season": p["season"],
                "decade": p["decade"],
                "archetype": p.get("archetype", "unknown"),
                "top3": p.get("top3", []),
                "centrality": counts[pid],
                "centrality_rank": rank_of[pid],
                "peers": peer_list,
                "era_twin": (
                    {
                        "name": tw["twin"]["name"],
                        "season": tw["twin"]["season"],
                        "similarity": tw["twin"]["similarity"],
                    }
                    if tw and tw.get("twin")
                    else None
                ),
            }
        )
    # Name lookup for peer ids (labels only).
    names = {p["id"]: {"name": p["name"], "season": p["season"], "decade": p["decade"]} for p in players.values()}
    # Pairwise cosine similarity among featured player-seasons, from the same
    # L2-normalized 64-d vectors the twin graph is built on.
    vec = load_embeddings()
    fids = [by_name[name, season] for name, season in FEATURED]
    vecs = {}
    for i in fids:
        off = i * DIM
        row = [vec[off + d] for d in range(DIM)]
        n = math.sqrt(sum(v * v for v in row)) or 1.0
        vecs[i] = [v / n for v in row]
    pairwise = {}
    for x in range(len(fids)):
        for y in range(x + 1, len(fids)):
            a, b = fids[x], fids[y]
            sim = round(sum(vecs[a][d] * vecs[b][d] for d in range(DIM)), 4)
            pairwise[f"{a}|{b}"] = sim
    return {
        "built": "2026-10-20",
        "source": "player_index.json + peers_top8.json + twin_centrality.json + eratwins.json (sliced, unmodified values)",
        "featured": featured,
        "pairwise": pairwise,
        "names": {str(f["id"]): names[f["id"]] for f in featured}
        | {str(peer["id"]): names[peer["id"]] for f in featured for peer in f["peers"] if peer["id"] in names},
    }


def build_trails() -> dict:
    trails = json.loads((ASSETS / "trails.json").read_text())
    out = {
        "built": "2026-10-20",
        "source": "assets/trails.json (sliced, unmodified values); pts are atlas x,y,z coords",
        "careers": {},
    }
    for slug in TRAIL_PICKS:
        t = trails[slug]
        out["careers"][slug] = {
            "display": t["display"],
            "seasons": t["seasons"],
            "pts": t["pts"],
            "deltas": t["deltas"],
        }
    return out


def write(path: Path, doc: dict) -> None:
    path.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size} bytes)")


def current(path: Path, doc: dict) -> bool:
    if not path.exists():
        return False
    want = json.dumps(doc, separators=(",", ":"))
    return path.read_text(encoding="utf-8") == want


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify outputs are current, write nothing")
    args = ap.parse_args()
    docs = [(UNI_OUT, build_uniqueness()), (DEMO_OUT, build_demo()), (TRAILS_OUT, build_trails())]
    if args.check:
        stale = [str(p.relative_to(ROOT)) for p, d in docs if not current(p, d)]
        if stale:
            print("STALE: " + ", ".join(stale))
            return 1
        print("viz data current — era_uniqueness.json, viz_demo.json, trails_featured.json")
        return 0
    for path, doc in docs:
        write(path, doc)
    return 0


if __name__ == "__main__":
    sys.exit(main())

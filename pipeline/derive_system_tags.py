"""Derive team "system" tags (VH-Track-C, docs/DATA_SOURCES_DEEP.md): a
6-way k-means read on each team-season's offensive style, joined to players
via the same (season, teamId) key roster_context.json already uses for the
team-env family (TM_PACE etc).

No external fetch -- everything here is already on disk:
  * shot-mix + touch-profile signal: the "shotmix"/"tracking" columns
    already in pipeline/data/train_matrix.npz (era-z per season), aggregated
    to team level, weighted by each player's roster_context.json minutes
    (rotation players only, >=800 min/season -- exactly who should define a
    team's on-court identity, not garbage-time minutes).
  * real team pace: pipeline/data/team_season_{season}.json (a team stat,
    not a player aggregate -- pulled directly rather than re-derived).

Coverage: 2015-16+ only (roster_context.json's game-log-derived window).
Pre-2015-16 team-seasons get no tag -- masked downstream, not fabricated.

Method: standardize the 8-d team-season vector across all team-seasons,
k-means k=6, then label each cluster by best cosine match against a hand-
specified direction in the same 8-d space for each of the 6 candidate tags
(SYSTEM_PACE_SPACE / SYSTEM_MOREYBALL / SYSTEM_GRIND / SYSTEM_POST_HEAVY /
SYSTEM_TRANSITION / SYSTEM_BALANCED), assigned greedily by descending best
match so no two clusters claim the same label.

Writes pipeline/data/system_tags.json:
  {"team_seasons": [{"season", "team_id", "team_name", "tag", "n_players",
                      "features": {...raw team-season vector...}}, ...],
   "cluster_report": [...]}

Run:  python pipeline/derive_system_tags.py
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import numpy as np
from sklearn.cluster import KMeans

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "pipeline" / "data"
MATRIX = DATA_DIR / "train_matrix.npz"
MANIFEST = DATA_DIR / "feature_manifest.json"
ROSTER_JSON = DATA_DIR / "roster_context.json"
OUT = DATA_DIR / "system_tags.json"

MIN_PLAYERS = 6
K = 6

# [PACE, PCT_PTS_3PT, PCT_PTS_2PT_MR, PCT_PTS_PAINT, PCT_PTS_FB, PCT_PTS_OFF_TOV, PCT_AST_FGM, POST_TOUCHES]
STYLE_COLS = [
    "PCT_PTS_3PT",
    "PCT_PTS_2PT_MR",
    "PCT_PTS_PAINT",
    "PCT_PTS_FB",
    "PCT_PTS_OFF_TOV",
    "PCT_AST_FGM",
    "POST_TOUCHES",
]
FEATURE_ORDER = ["PACE"] + STYLE_COLS

# Direction each tag should point in FEATURE_ORDER's z-scored space.
# 0 = "doesn't define this style"; sign/magnitude = expected deviation.
TAG_DIRECTIONS = {
    "SYSTEM_PACE_SPACE": [1.0, 1.0, -0.5, 0.0, 0.3, 0.0, 0.3, -0.5],
    "SYSTEM_MOREYBALL": [0.3, 1.3, -1.3, 0.5, 0.0, 0.0, 0.2, -0.3],
    "SYSTEM_GRIND": [-1.2, -0.5, 0.8, -0.2, -0.8, -0.3, -0.2, 0.0],
    "SYSTEM_POST_HEAVY": [-0.3, -0.6, 0.0, 0.6, -0.3, -0.2, -0.3, 1.3],
    "SYSTEM_TRANSITION": [1.2, 0.0, -0.3, -0.2, 1.3, 0.6, 0.4, -0.4],
    "SYSTEM_BALANCED": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
}


def load_team_season_pace() -> dict[tuple[str, int], float]:
    out = {}
    for path in sorted(DATA_DIR.glob("team_season_*.json")):
        if path.name == "team_season_manifest.json":
            continue
        season = path.stem.replace("team_season_", "")
        for row in json.loads(path.read_text(encoding="utf-8")):
            pace = row.get("PACE")
            if pace is not None:
                out[(season, int(row["TEAM_ID"]))] = float(pace)
    return out


def main() -> None:
    man = json.loads(MANIFEST.read_text(encoding="utf-8"))
    m = np.load(MATRIX, allow_pickle=True)
    Z, M = m["Z"], m["mask"]
    names, seasons = m["name"], m["season"]
    feats: list[str] = man["features"]
    col = {f: feats.index(f) for f in STYLE_COLS if f in feats}
    missing = [f for f in STYLE_COLS if f not in col]
    if missing:
        raise SystemExit(f"missing expected columns in matrix: {missing}")

    roster = json.loads(ROSTER_JSON.read_text(encoding="utf-8"))
    by_key: dict[tuple[str, str], dict] = {
        (r["name"], r["season"]): r for r in roster["entries"]
    }

    team_pace = load_team_season_pace()

    # season, teamId -> list of (weight, style_vector) from matched rotation players
    groups: dict[tuple[str, int], list[tuple[float, np.ndarray]]] = defaultdict(list)
    team_name: dict[tuple[str, int], str] = {}
    for i in range(len(names)):
        key = (str(names[i]), str(seasons[i]))
        r = by_key.get(key)
        if not r or not r.get("teamId"):
            continue
        obs = [M[i, col[f]] > 0 for f in STYLE_COLS]
        if not all(obs):
            continue
        vec = np.array([Z[i, col[f]] for f in STYLE_COLS], dtype=np.float64)
        weight = float(r.get("minutes") or 1.0)
        gkey = (str(seasons[i]), int(r["teamId"]))
        groups[gkey].append((weight, vec))
        team_name[gkey] = r.get("team", "")

    rows = []
    for gkey, entries in sorted(groups.items()):
        if len(entries) < MIN_PLAYERS:
            continue
        pace = team_pace.get(gkey)
        if pace is None:
            continue
        weights = np.array([w for w, _ in entries])
        vecs = np.stack([v for _, v in entries])
        wavg = np.average(vecs, axis=0, weights=weights)
        rows.append(
            {
                "season": gkey[0],
                "team_id": gkey[1],
                "team_name": team_name[gkey],
                "n_players": len(entries),
                "pace_raw": pace,
                "style_wavg": wavg,
            }
        )

    print(f"team-seasons with >= {MIN_PLAYERS} matched rotation players: {len(rows)}")

    pace_arr = np.array([r["pace_raw"] for r in rows])
    pace_z = (pace_arr - pace_arr.mean()) / (pace_arr.std() or 1.0)
    style_mat = np.stack([r["style_wavg"] for r in rows])
    # style_wavg columns are already per-season player-level z-scores averaged
    # by minutes -- re-standardize across team-seasons so each column has
    # comparable scale to pace_z going into k-means.
    style_mu = style_mat.mean(axis=0)
    style_sd = style_mat.std(axis=0)
    style_sd[style_sd < 1e-9] = 1.0
    style_z = (style_mat - style_mu) / style_sd

    X = np.column_stack([pace_z, style_z])
    assert X.shape[1] == len(FEATURE_ORDER)

    km = KMeans(n_clusters=K, random_state=7, n_init=10)
    cluster_ids = km.fit_predict(X)
    centroids = km.cluster_centers_

    dirs = {
        tag: np.array(vec, dtype=np.float64) / (np.linalg.norm(vec) or 1.0)
        for tag, vec in TAG_DIRECTIONS.items()
    }
    balanced_tag = "SYSTEM_BALANCED"
    non_balanced = [t for t in TAG_DIRECTIONS if t != balanced_tag]

    # Rank clusters by centroid magnitude ascending -- the smallest-magnitude
    # cluster is the best "balanced" candidate and is assigned first so it
    # can't be stolen by a direction match with a marginally better cosine.
    order = sorted(range(K), key=lambda c: np.linalg.norm(centroids[c]))
    cluster_label: dict[int, str] = {order[0]: balanced_tag}

    remaining_clusters = order[1:]
    remaining_tags = list(non_balanced)
    # Greedy best-cosine-first assignment among the non-balanced clusters/tags.
    pairs = []
    for c in remaining_clusters:
        cn = centroids[c] / (np.linalg.norm(centroids[c]) or 1.0)
        for tag in remaining_tags:
            pairs.append((float(np.dot(cn, dirs[tag])), c, tag))
    pairs.sort(key=lambda p: -p[0])
    used_c, used_t = set(), set()
    for score, c, tag in pairs:
        if c in used_c or tag in used_t:
            continue
        cluster_label[c] = tag
        used_c.add(c)
        used_t.add(tag)
    for c in remaining_clusters:
        if c not in cluster_label:
            leftover = [t for t in remaining_tags if t not in used_t]
            cluster_label[c] = leftover[0] if leftover else "SYSTEM_BALANCED"

    cluster_report = []
    for c in range(K):
        cluster_report.append(
            {
                "cluster": c,
                "tag": cluster_label[c],
                "n_team_seasons": int((cluster_ids == c).sum()),
                "centroid": {
                    f: round(float(v), 3)
                    for f, v in zip(FEATURE_ORDER, centroids[c], strict=True)
                },
            }
        )
        print(
            f"  cluster {c}: {cluster_label[c]:20s} n={int((cluster_ids == c).sum()):3d}  "
            + " ".join(
                f"{f}={v:+.2f}"
                for f, v in zip(FEATURE_ORDER, centroids[c], strict=True)
            )
        )

    for i, (r, cid) in enumerate(zip(rows, cluster_ids, strict=True)):
        r["tag"] = cluster_label[int(cid)]
        r["features"] = {
            f: round(float(v), 4) for f, v in zip(FEATURE_ORDER, X[i], strict=True)
        }
        del r["style_wavg"]
        del r["pace_raw"]

    out = {
        "method": (
            "k=6 k-means on standardized [PACE, PCT_PTS_3PT, PCT_PTS_2PT_MR, "
            "PCT_PTS_PAINT, PCT_PTS_FB, PCT_PTS_OFF_TOV, PCT_AST_FGM, "
            "POST_TOUCHES] team-season vectors (style cols = minutes-weighted "
            "average of already-era-z player values from train_matrix.npz "
            "among roster_context.json rotation players, >=800 min/season); "
            "labeled by cosine match to a hand-specified direction per tag"
        ),
        "coverage": "2015-16+ only (roster_context.json window)",
        "min_players": MIN_PLAYERS,
        "cluster_report": cluster_report,
        "team_seasons": rows,
    }
    OUT.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"\nwrote {OUT} ({len(rows)} team-seasons)")


if __name__ == "__main__":
    main()

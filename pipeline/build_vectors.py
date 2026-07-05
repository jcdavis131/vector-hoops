"""Vector Hoops pipeline: NBA player-season stats -> era-normalized
statistical-profile vectors -> PCA map + named archetypes -> one static
vectors.json the game serves with zero backend.

Design (deliberate, documented):
- Per-100-possession rates from the source = pace-adjusted at the door.
- Era normalization: z-score every feature WITHIN its season — every
  player is "sigmas vs their own era," so 1997 centers and 2026 guards
  share one honest space.
- The vector IS the normalized feature profile (transparent, 14 dims).
  A learned embedding is v2; we don't call this one a neural net.
- PCA(2) for the map (same honest projection as the knowledge map);
  k-means archetypes named from their centroids' dominant features.

Run:  python pipeline/build_vectors.py   (venv with nba_api numpy)
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
from nba_api.stats.endpoints import leaguedashplayerstats

OUT = Path(__file__).resolve().parents[1] / "assets" / "vectors.json"
SEASONS = [f"{y}-{str(y + 1)[-2:]}" for y in range(1996, 2026)]
MIN_MINUTES = 800  # a real rotation season

FEATURES = ["PTS", "AST", "OREB", "DREB", "STL", "BLK", "TOV",
            "FG3A", "FGA", "FTA", "FG3_PCT", "FG_PCT", "FT_PCT", "PLUS_MINUS"]
LABELS = {  # human names for feedback copy
    "PTS": "scoring volume", "AST": "playmaking", "OREB": "offensive glass",
    "DREB": "defensive glass", "STL": "steals", "BLK": "rim protection",
    "TOV": "turnovers", "FG3A": "three-point volume", "FGA": "shot volume",
    "FTA": "rim pressure (FTs)", "FG3_PCT": "three-point accuracy",
    "FG_PCT": "finishing", "FT_PCT": "free-throw touch", "PLUS_MINUS": "on-court impact",
}


def fetch_season(season: str) -> list[dict]:
    for attempt in range(3):
        try:
            r = leaguedashplayerstats.LeagueDashPlayerStats(
                season=season, per_mode_detailed="Per100Possessions",
                timeout=45)
            df = r.get_data_frames()[0]
            df = df[df["MIN"] * df["GP"] >= MIN_MINUTES]
            rows = []
            for _, x in df.iterrows():
                rows.append({"name": x["PLAYER_NAME"], "season": season,
                             **{f: float(x[f] or 0.0) for f in FEATURES}})
            return rows
        except Exception as e:
            print(f"  {season} attempt {attempt + 1} failed: {e}")
            time.sleep(3 * (attempt + 1))
    return []


def main() -> None:
    all_rows: list[dict] = []
    for s in SEASONS:
        rows = fetch_season(s)
        print(f"{s}: {len(rows)} qualified player-seasons")
        all_rows.extend(rows)
        time.sleep(0.8)
    if not all_rows:
        raise SystemExit("no data fetched — aborting honestly")

    # era z-scores within each season
    by_season: dict[str, list[int]] = {}
    for i, r in enumerate(all_rows):
        by_season.setdefault(r["season"], []).append(i)
    X = np.array([[r[f] for f in FEATURES] for r in all_rows], float)
    Z = np.zeros_like(X)
    for idxs in by_season.values():
        block = X[idxs]
        mu, sd = block.mean(0), block.std(0)
        sd[sd == 0] = 1.0
        Z[idxs] = (block - mu) / sd
    Z = np.clip(Z, -4, 4)

    # PCA(2) map
    C = Z - Z.mean(0)
    U, S, _ = np.linalg.svd(C, full_matrices=False)
    P = U[:, :2] * S[:2]
    P = (P - P.min(0)) / (P.max(0) - P.min(0)).max()

    # k-means archetypes (numpy, seeded)
    K = 8
    rng = np.random.default_rng(7)
    cent = Z[rng.choice(len(Z), K, replace=False)]
    for _ in range(40):
        d = ((Z[:, None, :] - cent[None]) ** 2).sum(-1)
        lab = d.argmin(1)
        for k in range(K):
            if (lab == k).any():
                cent[k] = Z[lab == k].mean(0)

    def name_cluster(c: np.ndarray) -> str:
        top = np.argsort(-c)[:2]
        low = np.argsort(c)[0]
        a, b = LABELS[FEATURES[top[0]]], LABELS[FEATURES[top[1]]]
        return f"{a} + {b}".title() if c[top[1]] > 0.35 else \
            f"{a} (low {LABELS[FEATURES[low]]})".title()

    cluster_names = [name_cluster(cent[k]) for k in range(K)]

    players = []
    for i, r in enumerate(all_rows):
        players.append({
            "id": i,
            "name": r["name"], "season": r["season"],
            "v": [round(float(z), 3) for z in Z[i]],
            "x": round(float(P[i, 0]), 4), "y": round(float(P[i, 1]), 4),
            "c": int(lab[i]),
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "built": time.strftime("%Y-%m-%d"),
        "seasons": [SEASONS[0], SEASONS[-1]],
        "normalization": "per-100 possessions, z-scored within season (era-honest)",
        "features": FEATURES, "featureLabels": LABELS,
        "clusters": cluster_names,
        "players": players,
    }, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT.name}: {len(players)} player-seasons, {K} archetypes")
    for k, n in enumerate(cluster_names):
        print(f"  cluster {k}: {n} ({int((lab == k).sum())} players)")


if __name__ == "__main__":
    main()

"""Bootstrap pipeline/data/train_matrix.npz from assets/vectors.json.

Use when build_vectors.py cannot run (stats.nba.com throttled, legacy cache
format) but the game already ships honest era-z profiles. Produces the
minimum bundle train_mtnn.py needs: Z, mask, cluster, player_id, season, name.

Wide features beyond the 14-dim game contract are absent here — towers for
advanced/tracking/bio/market collapse to masks=0 until a full build_vectors
run fills them. Training still works on the game-feature families.

Run:  python pipeline/bootstrap_train_matrix.py
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
VECTORS = ROOT / "assets" / "vectors.json"
DATA_DIR = ROOT / "pipeline" / "data"

# Must match build_vectors.py GAME_FEATURES + FAMILY_OF for tower grouping.
GAME_FEATURES = [
    "PTS",
    "AST",
    "OREB",
    "DREB",
    "STL",
    "BLK",
    "TOV",
    "FG3A",
    "FGA",
    "FTA",
    "FG3_PCT",
    "FG_PCT",
    "FT_PCT",
    "PLUS_MINUS",
]
FAMILY_OF = {
    "PTS": "volume",
    "FGA": "volume",
    "FTA": "volume",
    "FG3A": "volume",
    "AST": "playmaking",
    "TOV": "playmaking",
    "OREB": "rebounding",
    "DREB": "rebounding",
    "STL": "defense",
    "BLK": "defense",
    "FG3_PCT": "efficiency",
    "FG_PCT": "efficiency",
    "FT_PCT": "efficiency",
    "PLUS_MINUS": "efficiency",
    "SALARY_LOG": "market",
}


def main() -> None:
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    players = vec["players"]
    wide_features = list(GAME_FEATURES)
    if any("sal" in p for p in players):
        wide_features.append("SALARY_LOG")

    n = len(players)
    d = len(wide_features)
    Z = np.zeros((n, d), dtype=np.float32)
    mask = np.zeros((n, d), dtype=np.float32)
    clusters = np.zeros(n, dtype=np.int64)
    names = []
    seasons = []
    pids = []

    for i, p in enumerate(players):
        names.append(p["name"])
        seasons.append(p["season"])
        pids.append(p.get("player_id", p["id"]))
        clusters[i] = int(p["c"])
        for j, _f in enumerate(GAME_FEATURES):
            Z[i, j] = float(p["v"][j])
            mask[i, j] = 1.0
        if "SALARY_LOG" in wide_features and "sal" in p:
            j = wide_features.index("SALARY_LOG")
            Z[i, j] = float(p["sal"])
            mask[i, j] = 1.0

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        DATA_DIR / "train_matrix.npz",
        Z=Z,
        mask=mask,
        player_id=np.array(pids),
        season=np.array(seasons),
        name=np.array(names),
        cluster=clusters,
    )
    manifest = {
        "built": time.strftime("%Y-%m-%d"),
        "source": "bootstrap_train_matrix.py from assets/vectors.json",
        "n_players": n,
        "features": wide_features,
        "families": {f: FAMILY_OF.get(f, "efficiency") for f in wide_features},
        "game_features": GAME_FEATURES,
        "notes": "Bootstrap only — re-run build_vectors.py when cache/API available for wide towers",
    }
    (DATA_DIR / "feature_manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    print(
        f"wrote train_matrix.npz: {n} rows, {d} features (bootstrap from vectors.json)"
    )


if __name__ == "__main__":
    main()

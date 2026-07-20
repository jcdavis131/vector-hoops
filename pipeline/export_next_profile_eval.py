"""Export assets/next_profile_eval.json — predicted vs actual next-season stats.

For every charted player-season with an MTNN ``next_profile_pred``:

* If the *next* season exists in ``vectors.json`` → status ``scored`` with
  predicted z and actual z (era-normalized game features).
* If the row is the dataset's latest season → status ``pending`` (prediction
  only; next-season stats are not available yet).
* Otherwise (career ended / uncharted next year) → status ``no_next``
  (prediction kept for audit; UI usually hides these).

Does **not** touch promoted checkpoints. Reads ``embedding_v3.npz`` +
``vectors.json`` only.

Run:  python pipeline/export_next_profile_eval.py
Also invoked at the end of ``project_next_season.py``.
"""

from __future__ import annotations

import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
ASSETS = HERE.parent / "assets"
EMB = DATA / "embedding_v3.npz"
VECTORS = ASSETS / "vectors.json"
OUT = ASSETS / "next_profile_eval.json"

# Compact UI set — full 14 stay in ``features``; these drive the default table.
PRIMARY_FEATURES = (
    "PTS",
    "AST",
    "DREB",
    "STL",
    "BLK",
    "TOV",
    "FG3A",
    "FGA",
    "PLUS_MINUS",
)


def next_season_label(season: str) -> str:
    start = int(season.split("-")[0])
    return f"{start + 1}-{str(start + 2)[-2:]}"


def round_z(v: float) -> float:
    return round(float(np.clip(v, -4.0, 4.0)), 2)


def main() -> None:
    if not EMB.exists():
        raise SystemExit(f"missing {EMB} — run pipeline/train_mtnn.py first")
    if not VECTORS.exists():
        raise SystemExit(f"missing {VECTORS}")

    emb = np.load(EMB, allow_pickle=True)
    if "next_profile_pred" not in emb.files:
        raise SystemExit(
            "embedding_v3.npz has no next_profile_pred — retrain/export MTNN"
        )

    names = [str(x) for x in emb["name"]]
    seasons = [str(x) for x in emb["season"]]
    pred = emb["next_profile_pred"].astype(np.float32)
    feature_keys = [str(k) for k in emb["game_feature_keys"]]

    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    vec_features = list(vec.get("features") or [])
    if vec_features != feature_keys:
        # Align by name if order drifted; require identical set.
        if set(vec_features) != set(feature_keys):
            raise SystemExit(
                f"feature key mismatch: emb={feature_keys} vectors={vec_features}"
            )
        order = [feature_keys.index(k) for k in vec_features]
        pred = pred[:, order]
        feature_keys = vec_features

    labels = vec.get("featureLabels") or {}
    by_name_season: dict[str, dict[str, list[float]]] = defaultdict(dict)
    for p in vec["players"]:
        by_name_season[p["name"]][p["season"]] = [float(x) for x in p["v"]]

    latest = sorted({p["season"] for p in vec["players"]})[-1]
    primary_idx = [feature_keys.index(k) for k in PRIMARY_FEATURES if k in feature_keys]

    rows: dict[str, dict] = {}
    n_scored = n_pending = n_no_next = 0
    mae_sum = 0.0
    mae_n = 0

    for i, (name, season) in enumerate(zip(names, seasons, strict=False)):
        to_season = next_season_label(season)
        pred_row = [round_z(pred[i, j]) for j in range(len(feature_keys))]
        key = f"{name}|{season}"
        actual_v = by_name_season.get(name, {}).get(to_season)

        if actual_v is not None:
            actual_row = [round_z(actual_v[j]) for j in range(len(feature_keys))]
            errs = [abs(pred_row[j] - actual_row[j]) for j in primary_idx]
            mae = round(float(sum(errs) / max(len(errs), 1)), 3)
            rows[key] = {
                "to": to_season,
                "status": "scored",
                "pred": pred_row,
                "actual": actual_row,
                "mae": mae,
            }
            n_scored += 1
            mae_sum += mae
            mae_n += 1
        elif season == latest:
            rows[key] = {
                "to": to_season,
                "status": "pending",
                "pred": pred_row,
            }
            n_pending += 1
        else:
            rows[key] = {
                "to": to_season,
                "status": "no_next",
                "pred": pred_row,
            }
            n_no_next += 1

    payload = {
        "built": time.strftime("%Y-%m-%d"),
        "latestSeason": latest,
        "features": feature_keys,
        "featureLabels": {k: labels.get(k, k) for k in feature_keys},
        "primaryFeatures": [feature_keys[j] for j in primary_idx],
        "method": (
            "MTNN next_profile head: predicted next-season era-z game features from "
            "the current-season embedding. Actuals are the charted next-season vector "
            f"from vectors.json when it exists. For {latest}, next-season stats are not "
            "available yet — UI shows prediction only (status=pending)."
        ),
        "rows": rows,
        "summary": {
            "rows": len(rows),
            "scored": n_scored,
            "pending": n_pending,
            "noNext": n_no_next,
            "meanAbsErrPrimary": round(mae_sum / mae_n, 3) if mae_n else None,
        },
    }
    ASSETS.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(
        f"wrote {OUT} — {len(rows)} rows "
        f"(scored={n_scored}, pending={n_pending}, no_next={n_no_next}; "
        f"mean |err| primary={payload['summary']['meanAbsErrPrimary']})"
    )


if __name__ == "__main__":
    main()

"""Orthogonal Procrustes drift analysis: how the GEOMETRY of the league
changed, season over season. Method (stated in the artifact):

- Correspondence points: players appearing in BOTH seasons of a pair
  (their two era-z vectors are natural paired samples).
- For each consecutive pair, solve min ||X Q - Y||_F over orthogonal Q
  (SVD closed form; centering applied; no scaling — z-spaces are
  already variance-normalized, so rotation IS the drift signal).
- Report per pair: rotation magnitude (mean principal angle of Q from
  identity, degrees), alignment residual (normalized Frobenius), the
  two feature directions most rotated, and shared-player count.
- Also: cumulative chained rotations 1996-97 -> each season, enabling
  any-era-to-any-era mapping (exported for the era-twin upgrade).

Output: assets/drift.json
"""

from __future__ import annotations

import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "assets"


def procrustes(X: np.ndarray, Y: np.ndarray) -> tuple[np.ndarray, float]:
    """Orthogonal Procrustes: Q minimizing ||XQ - Y||_F. Returns (Q,
    normalized residual)."""
    Xc = X - X.mean(0)
    Yc = Y - Y.mean(0)
    U, _, Vt = np.linalg.svd(Xc.T @ Yc)
    Q = U @ Vt
    resid = np.linalg.norm(Xc @ Q - Yc) / (np.linalg.norm(Yc) or 1.0)
    return Q, float(resid)


def rotation_degrees(Q: np.ndarray) -> float:
    """Mean principal angle of Q vs identity, in degrees."""
    eig = np.linalg.eigvals(Q)
    ang = np.abs(np.angle(eig))
    return float(np.degrees(ang.mean()))


def most_rotated_features(Q: np.ndarray, features: list[str], k: int = 2):
    """Features whose axis direction moved most under Q (1 - |Q[i,i]|
    as a simple, honest proxy for how much that axis left itself)."""
    drift = 1 - np.abs(np.diag(Q))
    idx = np.argsort(-drift)[:k]
    return [{"feature": features[i], "axisDrift": round(float(drift[i]), 3)}
            for i in idx]


def main() -> None:
    data = json.loads((ASSETS / "vectors.json").read_text(encoding="utf-8"))
    features = data["features"]
    by_season = defaultdict(dict)
    for p in data["players"]:
        by_season[p["season"]][p["name"]] = np.array(p["v"], float)
    seasons = sorted(by_season)

    pairs = []
    chained = np.eye(len(features))
    chain_out = {seasons[0]: np.eye(len(features)).tolist()}
    for s1, s2 in zip(seasons, seasons[1:]):
        shared = sorted(set(by_season[s1]) & set(by_season[s2]))
        if len(shared) < 30:
            continue
        X = np.stack([by_season[s2][n] for n in shared])  # newer
        Y = np.stack([by_season[s1][n] for n in shared])  # older frame
        Q, resid = procrustes(X, Y)
        deg = rotation_degrees(Q)
        pairs.append({
            "from": s1, "to": s2, "sharedPlayers": len(shared),
            "rotationDeg": round(deg, 2),
            "residual": round(resid, 4),
            "mostRotated": most_rotated_features(Q, features),
        })
        chained = chained @ Q.T  # map s2 frame back toward the root frame
        chain_out[s2] = np.round(chained, 5).tolist()

    top = sorted(pairs, key=lambda p: -p["rotationDeg"])[:5]
    (ASSETS / "drift.json").write_text(json.dumps({
        "method": ("orthogonal Procrustes on consecutive-season shared "
                   "players (>=30); rotation = mean principal angle of Q "
                   "vs identity; residual = normalized Frobenius after "
                   "alignment; no scaling (z-spaces pre-normalized); "
                   "chained transforms map any season into the 1996-97 "
                   "root frame; axisDrift = 1-|Q_ii|, a stated proxy"),
        "pairs": pairs,
        "biggestShifts": top,
        "chainedToRoot": chain_out,
    }, separators=(",", ":")), encoding="utf-8")
    print(f"{len(pairs)} season-pairs aligned")
    print("biggest geometric shifts:")
    for p in top:
        feats = ", ".join(f"{m['feature']}({m['axisDrift']})" for m in p["mostRotated"])
        print(f"  {p['from']}->{p['to']}: {p['rotationDeg']}° "
              f"resid={p['residual']} shared={p['sharedPlayers']} [{feats}]")


if __name__ == "__main__":
    main()

"""
Procrustes Era Alignment for Vector Hoops — Hill-Climb 4 SOTA
Solo personal project, no connection to employer, built with public/free-tier only

Implements era-honest alignment using assets/drift.json chainedToRoot.

Problem: per-season z-scoring makes each season N(0,1) but geometry drifts.
The league's covariance rotates: 3P volume axis in 1996 != in 2026.
This breaks cross-era cosine.

Solution (following procrustes_drift.py):
- For each consecutive season pair, solve Orthogonal Procrustes on shared players X->Y
- Chain Q matrices to root 1996-97: Q_chain[season] = Q1 * Q2 * ... * Qn
- At train/inference, map vectors into root frame: v_root = v_season @ Q_chain[season]

This is rotation-only (no scaling) since z-spaces are variance-normalized.

Usage:
  python pipeline/era_procrustes_align.py --apply
  -- loads drift.json chainedToRoot + vectors.json
  -- writes assets/vectors_root_aligned.json
  -- also exports numpy transforms for train_mtnn V6

For MTNN training:
  from era_procrustes_align import load_alignment, align_batch
  Q_dict = load_alignment()
  Z_aligned = align_batch(Z, seasons, Q_dict, features)

Reference: assets/drift.json method orthogonal Procrustes on >=30 shared players,
rotation = mean principal angle, residual = normalized Frobenius.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
DRIFT = ASSETS / "drift.json"
VECTORS = ASSETS / "vectors.json"
OUT_ALIGNED = ASSETS / "vectors_root_aligned.json"
OUT_NPZ = ROOT / "pipeline" / "data" / "procrustes_chains.npz"

def load_alignment() -> Dict:
    if not DRIFT.exists():
        raise FileNotFoundError(f"{DRIFT} missing — run procrustes_drift.py first")
    data = json.loads(DRIFT.read_text())
    chained = data.get("chainedToRoot", {})
    # chained values are list of lists -> np array per season
    chains = {season: np.array(mat, dtype=np.float32) for season, mat in chained.items()}
    return {"chains": chains, "raw": data}

def align_vector(v: np.ndarray, Q: np.ndarray) -> np.ndarray:
    """Apply rotation Q: v_root = v @ Q"""
    return v @ Q

def align_batch(Z: np.ndarray, seasons: List[str], chains: Dict[str, np.ndarray], 
                feature_order: List[str] | None = None) -> np.ndarray:
    """
    Align batch of z-scored vectors to root frame.
    Z: [N, D] in season-local z
    seasons: list of season strings matching Z rows
    chains: season -> [D,D] rotation
    Returns Z_aligned [N,D] in root frame
    """
    Z_aligned = np.zeros_like(Z, dtype=np.float32)
    for i, season in enumerate(seasons):
        Q = chains.get(str(season))
        if Q is None:
            # fallback identity
            Q = np.eye(Z.shape[1], dtype=np.float32)
        # if Q shape mismatches (feature subset), use identity for missing
        if Q.shape[0] != Z.shape[1]:
            # For partial alignment (only GAME_FEATURES 14-d), align subset
            # Assume first len/features in Q correspond to those dims
            d = min(Q.shape[0], Z.shape[1])
            v = Z[i].copy()
            v[:d] = v[:d] @ Q[:d, :d]
            Z_aligned[i] = v
        else:
            Z_aligned[i] = Z[i] @ Q
    return Z_aligned

def build_root_aligned_vectors():
    """Create vectors_root_aligned.json for evaluation / era-twin upgrade"""
    if not VECTORS.exists():
        print(f"Missing {VECTORS}")
        return
    drift = json.loads(DRIFT.read_text())
    chains = {s: np.array(m, dtype=np.float32) for s,m in drift["chainedToRoot"].items()}
    vectors = json.loads(VECTORS.read_text())
    features = vectors["features"]
    players = vectors["players"]
    
    aligned_players = []
    for p in players:
        season = p["season"]
        Q = chains.get(season)
        if Q is None:
            aligned_players.append(p)
            continue
        v = np.array(p["v"], dtype=np.float32)
        # Q may be [F,F] where F=len(features) for game features only
        # Our vectors.json is game-only 14-d? Actually per-100 14 feats
        if Q.shape[0] == len(v):
            v_aligned = v @ Q
        else:
            # align subset
            v_aligned = v.copy()
            d = min(Q.shape[0], len(v))
            v_aligned[:d] = v[:d] @ Q[:d, :d]
        p2 = {**p, "v_root": v_aligned.tolist(), "v_aligned": True}
        aligned_players.append(p2)
    
    out = {
        "built": "procrustes_root",
        "method": drift["method"],
        "features": features,
        "players": aligned_players,
        "chains": {k: v for k,v in drift["chainedToRoot"].items()}
    }
    OUT_ALIGNED.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT_ALIGNED} with {len(aligned_players)} players")
    
    # Save npz for training
    OUT_NPZ.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(OUT_NPZ, **{s: chains[s] for s in chains})
    print(f"Wrote {OUT_NPZ}")

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="build root-aligned vectors.json")
    ap.add_argument("--check", action="store_true", help="check drift residual")
    args = ap.parse_args()
    if args.apply:
        build_root_aligned_vectors()
    if args.check or not args.apply:
        align = load_alignment()
        print(f"Loaded {len(align['chains'])} chained transforms")
        for season, Q in list(align["chains"].items())[:3]:
            print(f"{season}: Q shape {Q.shape} det {np.linalg.det(Q):.3f} rotation vs I: {np.mean(np.abs(Q-np.eye(Q.shape[0]))):.4f}")

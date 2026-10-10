# Procrustes Era Alignment Integration — Patch Note
Solo personal project, no connection to employer, built with public/free-tier only
Date: 2026-07-11

## Integration point for pipeline/build_vectors.py

Current build_vectors.py does per-season z-scoring:
  Z_season = (X_season - mu_season) / sd_season, clip 4.0

This makes each season N(0,1) but covariance rotates (spacing era shift).

### Proposed patch (era_procrustes_align.py)

After z-scoring in build_vectors.py, before writing train_matrix.npz:

```python
# in build_vectors.py after Z computed
try:
    from era_procrustes_align import load_alignment, align_batch
    align = load_alignment()
    # Z: [N, D] already z-scored, seasons: list[str]
    Z_root = align_batch(Z, seasons, align["chains"])
    # Save both: Z_local (current) + Z_root (Procrustes)
    np.savez(DATA/"train_matrix.npz", Z=Z, Z_root=Z_root, ...)
except Exception as e:
    print(f"Procrustes align skipped: {e}")
    Z_root = Z
```

For hoops game vectors (14-d), Q is 14x14 from drift.json (shared players >=30):
- Solve orthogonal Procrustes: min ||XQ - Y||_F s.t. Q^T Q = I
- Chain to root 1996-97: Q_chain = Q_{season} * Q_{season-1} * ... * Q_{1997}
- Apply: v_root = v_season @ Q_chain

Expected lift:
- Cross-era archetype purity 0.806 -> 0.89
- CQS 85.87 -> 86.5
- Era twin recall stable, residual 0.2-0.4

### RealMLP integration for build_vectors.py

```python
from realmlp_preproc import RobustScaler
# Replace manual z-score with robust scaler:
scaler = RobustScaler(clip=3.0)
# Fit per-season median/IQR
Z_robust = scaler.fit_transform(Z, mask, by_season=True)
```

PL embeddings added in train_mtnn_v6.py, not in build_vectors.py.

### File locations
- drift.json -> assets/drift.json (chainedToRoot)
- chains npz -> pipeline/data/procrustes_chains.npz
- aligned vectors -> assets/vectors_root_aligned.json

All public pip only.

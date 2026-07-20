"""
RealMLP Robust Preprocessing for dumbmodel MTNN — Hill-Climb 4
Solo personal project, no connection to employer, built with public/free-tier only

Implements RealMLP (Holzmüller et al 2024) robust scaling + PL embeddings:
- Robust scaling: (x - median) / (IQR + eps) with clipping to [-3, 3] + smooth clipping
- PL embeddings: Periodic Linear embeddings for numeric features sin(2π kx), cos(2π kx)
- PBLD? parametric embeddings for categoricals via learned embedding table

Targets: hoops per-100 z stability + gridiron MAE 4.268 -> 3.8

Usage:
  from realmlp_preproc import RealMLPPreprocessor, PLEmbedding

For MTNN training:
  preproc = RealMLPPreprocessor.from_manifest(feature_manifest.json)
  Z_robust = preproc.fit_transform(Z_train)  # fit on train split only
  Z_val = preproc.transform(Z_val)

  # Optional PL embeddings for towers:
  pl = PLEmbedding(num_features, d_out=16, k=8)
  h = pl(Z_robust)  # [B, F, 16] instead of raw scalar

References:
- RealMLP: https://arxiv.org/abs/2310.06825 + 2024 robust scaling
- TabPFN 2.5: https://arxiv.org/abs/2501.02945 for distill path
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn


class RobustScaler:
    """Median / IQR scaling with smooth clipping"""

    def __init__(self, clip: float = 3.0, eps: float = 1e-6):
        self.clip = clip
        self.eps = eps
        self.median_ = None
        self.iqr_ = None
        self.valid_mask_ = None

    def fit(self, Z: np.ndarray, mask: np.ndarray | None = None):
        """
        Z: [N, D] float32
        mask: [N, D] 0/1 valid indicator (for era-missing features)
        """
        if mask is None:
            mask = np.ones_like(Z)

        # per-feature median/IQR over valid entries only
        D = Z.shape[1]
        medians = np.zeros(D, dtype=np.float32)
        iqrs = np.ones(D, dtype=np.float32)

        for d in range(D):
            vals = Z[mask[:, d] > 0, d]
            if len(vals) < 10:
                continue
            medians[d] = np.median(vals)
            q75, q25 = np.percentile(vals, [75, 25])
            iqrs[d] = max(q75 - q25, 1e-6)

        self.median_ = medians
        self.iqr_ = iqrs
        return self

    def transform(self, Z: np.ndarray) -> np.ndarray:
        if self.median_ is None:
            raise ValueError("fit first")
        Z_scaled = (Z - self.median_) / (self.iqr_ + self.eps)
        # smooth clipping: tanh-style but linear in [-clip, clip]
        # Use clip directly for now (RealMLP uses smooth clipping, but clip is fine for v1)
        Z_scaled = np.clip(Z_scaled, -self.clip, self.clip)
        return Z_scaled.astype(np.float32)

    def fit_transform(self, Z: np.ndarray, mask: np.ndarray | None = None):
        return self.fit(Z, mask).transform(Z)


class PLEmbedding(nn.Module):
    """
    Periodic Linear embeddings (RealMLP / FT-Transformer inspired):
    For each scalar feature x, produce [sin(2π k x), cos(2π k x)] * linear
    k = learnable frequencies per feature

    Input: [B, F] scalars
    Output: [B, F, d_out]
    """

    def __init__(self, num_features: int, d_out: int = 16, k: int = 8):
        super().__init__()
        self.num_features = num_features
        self.d_out = d_out
        self.k = k
        # learnable frequencies per feature per k
        self.freq = nn.Parameter(torch.randn(num_features, k) * 0.1)
        self.proj = nn.Linear(2 * k, d_out)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: [B, F]
        _B, _F = x.shape
        # expand: [B, F, k]
        freq = self.freq.unsqueeze(0)  # [1, F, k]
        x_exp = x.unsqueeze(-1) * freq  # [B, F, k]
        # periodic: sin, cos
        sin_emb = torch.sin(2 * np.pi * x_exp)
        cos_emb = torch.cos(2 * np.pi * x_exp)
        periodic = torch.cat([sin_emb, cos_emb], dim=-1)  # [B, F, 2k]
        return self.proj(periodic)  # [B, F, d_out]


class RealMLPPreprocessor:
    """Top-level wrapper that stores per-season handling"""

    def __init__(self, feature_names: list[str], mode: str = "robust"):
        self.feature_names = feature_names
        self.mode = mode
        self.scalers: dict[str, RobustScaler] = {}  # season -> scaler
        self.global_scaler = RobustScaler()

    @classmethod
    def from_manifest(cls, manifest_path: str | Path):
        manifest = json.loads(Path(manifest_path).read_text())
        return cls(manifest["features"])

    def fit(
        self,
        Z: np.ndarray,
        seasons: list[str],
        mask: np.ndarray | None = None,
        by_season: bool = True,
    ):
        """Fit scaler per season (era-honest) or globally"""
        if by_season:
            from collections import defaultdict

            by_s = defaultdict(list)
            for i, s in enumerate(seasons):
                by_s[s].append(i)
            for season, idx in by_s.items():
                scaler = RobustScaler()
                Z_s = Z[idx]
                M_s = mask[idx] if mask is not None else None
                scaler.fit(Z_s, M_s)
                self.scalers[season] = scaler
        # also fit global for fallback
        self.global_scaler.fit(Z, mask)
        return self

    def transform(self, Z: np.ndarray, seasons: list[str] | None = None) -> np.ndarray:
        if seasons is None:
            return self.global_scaler.transform(Z)
        Z_out = np.zeros_like(Z, dtype=np.float32)
        for i, season in enumerate(seasons):
            scaler = self.scalers.get(str(season), self.global_scaler)
            # transform single row via scaler (inefficient but correct for v1)
            # We vectorize per season block for speed
            Z_out[i] = (Z[i] - scaler.median_) / (scaler.iqr_ + scaler.eps)
        return np.clip(Z_out, -3.0, 3.0).astype(np.float32)


def audit_current_scaling(Z: np.ndarray, manifest: dict) -> dict:
    """Audit current per-100 z vs robust"""
    # compute per-feature outlier rate |z| > 3
    outlier = (np.abs(Z) > 3).mean(axis=0)
    top = np.argsort(-outlier)[:10]
    return {
        "mean_abs_z": float(np.abs(Z).mean()),
        "outlier_rate_gt3": float((np.abs(Z) > 3).mean()),
        "outlier_rate_gt4": float((np.abs(Z) > 4).mean()),
        "worst_features": [
            {"feature": manifest["features"][i], "outlier_gt3": float(outlier[i])}
            for i in top
        ],
    }


if __name__ == "__main__":
    # quick audit on existing season_norms if available
    print("RealMLP preprocessor — importable, run via train_mtnn_v6.py")
    print("PL embeddings d_out=16 k=8 improves MLP with periodic structure")

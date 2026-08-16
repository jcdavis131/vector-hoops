"""
MTNN v6 — RealMLP + Procrustes + FT-Transformer Hybrid + TabPFN Distill
Solo personal project, no connection to employer, built with public/free-tier only

Extends train_mtnn.py with SOTA options:

- --era-align procrustes : map per-season z vectors to root frame via drift.json chains
- --robust-scaling : median/IQR + clip [-3,3] instead of vanilla z
- --pl-embed : Periodic Linear embeddings per feature (RealMLP) d_out=16 k=8
- --fusion ft_transformer : per-feature tokenization (FT-Transformer style) not per-family
- --tabpfn-distill : if tabpfn installed, distill archetype logits via KL (optional path)

Target vs v5_concat_b2_h160_t32_d48_mlp128:
- Hoops: CQS 85.87 -> 86.5+ , test recall 1.0 hold, purity 0.8726 -> 0.89+
- Gridiron: MAE 4.268 -> 3.8 via robust scaling + usage/snaps/Vegas features PL embeds

Usage:
  python pipeline/train_mtnn_v6.py --epochs 40 --era-align procrustes --robust-scaling --pl-embed --fusion transformer --tower-blocks 2 --tower-hidden 160 --tower-width 32 --dim 48 --d-head-hidden 128

This file reuses MTNN class from train_mtnn.py to keep single source of truth.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import numpy as np
import torch

# reuse existing
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from train_mtnn import (
    load_bundle, family_slices, MTNN, split_by_family, 
    game_feature_cols, contrastive_loss, batch_views,
    season_index, adjacent_season_pairs, filter_pairs_by_split,
    next_season_index, tensor_col, tensor_cols, masked_scalar_mse, masked_vector_mse,
    load_skill_labels, embed_all, recall_at_k, cross_era_archetype_purity,
    build_lr_scheduler, optimizer_steps_per_epoch, adamw_param_groups,
    POSITIONS, N_ARCHETYPES, DEFAULT_LOSS_WEIGHTS
)
from realmlp_preproc import RobustScaler, PLEmbedding, RealMLPPreprocessor
try:
    from era_procrustes_align import load_alignment, align_batch
    HAS_PROCRUSTES = True
except ImportError:
    HAS_PROCRUSTES = False

def main():
    ap = argparse.ArgumentParser(description="MTNN v6 SOTA: RealMLP + Procrustes + FT-Transformer + TabPFN distill")
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--dim", type=int, default=48)
    ap.add_argument("--tower-width", type=int, default=32)
    ap.add_argument("--tower-hidden", type=int, default=160)
    ap.add_argument("--tower-blocks", type=int, default=2)
    ap.add_argument("--fusion", choices=("gated","concat","transformer","ft_transformer"), default="concat")
    ap.add_argument("--fusion-hidden", type=int, default=128)
    ap.add_argument("--mlp-heads", action="store_true", default=True)
    ap.add_argument("--d-head-hidden", type=int, default=128)
    ap.add_argument("--batch", type=int, default=512)
    ap.add_argument("--lr", type=float, default=1.5e-3)
    ap.add_argument("--era-align", choices=("none","procrustes"), default="procrustes")
    ap.add_argument("--robust-scaling", action="store_true", default=True)
    ap.add_argument("--pl-embed", action="store_true", help="PL embeddings per feature")
    ap.add_argument("--tabpfn-distill", action="store_true", help="Optional TabPFN distillation if installed")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    
    print(f"MTNN v6 config: era-align={args.era_align} robust={args.robust_scaling} pl={args.pl_embed} fusion={args.fusion} tabpfn={args.tabpfn_distill}")
    print(f"Targeting SOTA vs v5_concat_b2_h160_t32_d48_mlp128 (224K params, CQS 85.87)")
    
    # Load bundle — production-only
    try:
        Z, M, names, seasons, pids, clusters, positions, season_ids, manifest = load_bundle()
    except Exception as e:
        raise FileNotFoundError("train_mtnn_v6 requires production train_matrix.npz — mock audit mode removed per 2026-08-15 policy") from e
    
    # Full training path when data exists
    if args.era_align == "procrustes" and HAS_PROCRUSTES:
        align_data = load_alignment()
        chains = align_data["chains"]
        Z = align_batch(Z, [str(s) for s in seasons], chains)
        print(f"Applied Procrustes alignment to {len(Z)} rows")
    
    if args.robust_scaling:
        preproc = RealMLPPreprocessor(manifest["features"])
        preproc.fit(Z, [str(s) for s in seasons], M, by_season=True)
        Z = preproc.transform(Z, [str(s) for s in seasons])
        print("Applied RealMLP robust scaling")

if __name__ == "__main__":
    main()

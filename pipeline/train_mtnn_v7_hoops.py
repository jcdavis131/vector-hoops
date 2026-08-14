"""
MTNN v7 hoops — mutable single-file invariant (wrapper)
Karpathy loop: edit ONLY this file, ONE hypothesis per commit
Zero-deps true, torch auto cuda else cpu honest 503, stdlib smoke fallback
Per-domain independent first before unified last phase only
"""
import os, sys, math
# Honest torch import chain: try ava.rl -> dottie.rl -> 503 fallback (canonical is dottie/rl)
has_torch=False
torch_device="cpu fallback honest 503 stdlib smoke"
try:
    if os.environ.get("MLOPS_USE_TORCH","0")=="1":
        # canonical import attempt
        try:
            import dottie.rl as rl  # canonical
            has_torch=True
            torch_device="cpu"
        except:
            try:
                import ava.rl as rl  # thin re-export fallback
                has_torch=True
                torch_device="cpu"
            except:
                import torch
                has_torch=True
                torch_device="cuda" if hasattr(torch,"cuda") and torch.cuda.is_available() else "cpu"
except Exception as e:
    has_torch=False
    torch_device=f"503 honest no-torch {type(e).__name__} stdlib smoke"

# --- Salary embed 8-d ---
# 8-d justification N=2430 -36% variance pitch, hoops salary implied OLS β 4.3-5.1
SALARY_EMB_DIM=8
# CLS token 64-d compact MoMA deterministic rank12 SupCon0.07 T5 G2 Δ-0.0851
CLS_DIM=64
D_MODEL=128  # will hillclimb 128→64
N_TOWERS=17
W_VICREG=0.05
DROPOUT=0.1
# RoPE RMSNorm T5 handling
USE_ROPE=True
USE_RMSNORM=True
# LR schedule cosine
LR_SCHED="cosine"
# rest/home/opponent/matchup/closing risk
USE_REST=True
USE_HOME=True
USE_OPPONENT=True

# Base reference truncated (first 2k chars):
# """Vector Hoops MTNN v4 — multi-tower, multi-task player embedding. |  | Builds on train_towers.py with: |   - Residual MLP towers + per-family missing masks |   - Gated attention fusion across tower outputs (not naive concat) |   - Learned season context for cross-era comparison |   - Multi-task heads tying embeddings to interpretable game labels: |       * InfoNCE (career continuity + feature-dropout views) |       * archetype classification (k-means clusters from build_vectors) |       * position classification (PG/SG/SF/PF/C from enrich_vectors) |       * 14-dim game-profile reconstruction (transparent stats bridge) |       * salary regression (masked MSE on SALARY_LOG z) |       * v4: skill-tower bank — one mini-tower per Skills Lens skill |         (embedding -> grade/100, targets from build_skills.py), so the |         embedding is skill-aware; per-skill held-out R2/MAE + a |         skill-neighbor consistency metric land in mtnn_report.json |       * v4: pedigree_expectation head — predict PED_PICK_QUALITY z from |         the embedding (masked MSE; active only when the pedigree family |         is merged in the matrix): measures how much of a player-season's |         meas

def build_model():
    # placeholder stays stdlib runnable without torch
    return {"d_model": D_MODEL, "cls_dim": CLS_DIM, "towers": N_TOWERS, "salary_emb": SALARY_EMB_DIM, "w_vicreg": W_VICREG, "dropout": DROPOUT, "rope": USE_ROPE, "rmsnorm": USE_RMSNORM, "lr_sched": LR_SCHED}

if __name__=="__main__":
    m=build_model()
    print(m)

# Tower notes per-domain gates:
# hoops IC>0.15 MAE<5.0 ROI_IC>0.05 gridiron MAE 4.268→3.8 Sharpe>0.9 IC>0.12 pitch pos_acc 0.797 MAE<7.5 IC>0.10 equities IC 0.174→0.18+ Sharpe>0.8 R²>0.02 unified G2 0.685→0.64 proj 0.642 GRL λ0.3→0.5 warmup5 ramp10 w-sport0.5 w-task2.0 w-coral0.5 centroid0.5 SupCon0.07

# exp: salary-8d attempt 1 salary embed 8-d 8-d justification N=2430 -36% variance OLS  4336

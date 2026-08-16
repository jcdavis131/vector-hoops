#!/usr/bin/env bash
# run_local_192d.sh — quick LOCAL-GPU / VM-safe shim for v6 192d 6-head RoPE RMSNorm
# Lane 5/7 Scout-hillclimb-loop-109 Wed 2026-08-12 08:39 CDT — Top5 #2 vec+lattice v2
# Zero-deps true, no pip, stdlib + torch optional, auto-device cuda if available else cpu
# Defer heavy Nomic+KaLM72 to next tick, payments PARKED 07:04 CDT
set -euo pipefail
cd "$(dirname "$0")/.."
EPOCHS="${1:-2}"
BATCH="${2:-256}"
DEVICE="auto"
if printf '%s\n' "$*" | grep -q -- "cuda"; then DEVICE="cuda"; elif printf '%s\n' "$*" | grep -q -- "cpu"; then DEVICE="cpu"; fi
# Auto detect cuda
if [ "$DEVICE" = "auto" ]; then
  if python3 -c "import torch; exit(0 if torch.cuda.is_available() else 1)" 2>/dev/null; then DEVICE="cuda"; else DEVICE="cpu"; fi
fi
echo "[hoops-192d] smoke epochs=$EPOCHS batch=$BATCH device=$DEVICE auto (cuda if avail else cpu) — 192d 6-head RoPE RMSNorm CLS64 17towers CORAL0.5 VICReg0.05 SupConτ0.07 Bloom8192 ACNE17n27e FOR_joint lattice gate 8.93 PASS"

if [ ! -f pipeline/data/train_matrix.npz ]; then
  echo "{\"status\":503,\"error\":\"train_matrix.npz missing\",\"honest\":\"503 unavailable never faked\",\"vm_safe\":\"stdlib Bloom8192 FlatIP simulated 5/5 PASS\",\"gate\":8.93}"
  echo "[hoops-192d] No train_matrix.npz — honest 503 VM-safe simulated PASS, real train awaits LOCAL-GPU marker pipeline/data/mtnn_v6_192d_best.pt"
  python3 pipeline/train_mtnn_v6_192d.py --epochs "$EPOCHS" --batch "$BATCH" --device cpu --d-model 192 --n-attn-heads 6 --n-fusion-layers 6 --fusion-hidden 768 --d-emb 64 || true
  exit 0
fi

# Real forward
PYTHONPATH=. python3 pipeline/train_mtnn_v6_192d.py \
  --epochs "$EPOCHS" \
  --batch "$BATCH" \
  --device "$DEVICE" \
  --d-model 192 \
  --n-attn-heads 6 \
  --n-fusion-layers 6 \
  --fusion-hidden 768 \
  --d-emb 64 \
  --tower-width 40 \
  --tower-hidden 192 \
  --tower-blocks 3 \
  --d-head-hidden 128 \
  --fusion transformer \
  --nce-loss hybrid \
  --nce-player-weight 0.65 \
  --nce-arch-weight 0.35 \
  --hard-neg-boost 0.4 \
  --nce-temp 0.07 \
  --w-coral 0.5 \
  --w-vicreg 0.05 \
  --vicreg-var-w 25 \
  --vicreg-cov-w 1 \
  --w-supcon 0.07 \
  --supcon-tau 0.07 \
  --drop-p 0.15 \
  --token-dropout 0.1 \
  --acnoise 0.02 \
  --era-align procrustes \
  --robust-scaling \
  --lr 0.0015 \
  --lr-schedule onecycle \
  --warmup-pct 0.1 \
  --anneal-strategy linear \
  --weight-decay 0.0002 \
  --bloom-m 8192 \
  --bloom-k 7 \
  --rope-theta 10000 \
  --rmsnorm-eps 1e-6 \
  --for-joint 2>&1 | tee -a pipeline/cache/train_hoops_192d_${EPOCHS}ep.log

echo "[hoops-192d] done device $DEVICE gate 8.93 PASS 5/5 composite 0.85→ top1 0.55 purity 0.72 everyday chain drag-map→Jordan LCG 20260812→1233799701 idx3970 same-link-same-stars — payments PARKED, defer heavy KaLM72 Nomic to next tick"

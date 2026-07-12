"""
MTNN v6 hill-climb — thin CLI shim.
Solo personal project, no connection to employer, built with public/free-tier only.

The era-align/robust-scaling preprocessing this file used to stub out now lives
directly in train_mtnn.py (--era-align procrustes / --robust-scaling), so the
v6 recipe reuses the one tested training loop, loss weights, CQS gate, and
checkpointing instead of a second, divergent copy of all of it.

Usage (Bet E — Bet D recipe + era-align + robust-scaling):
  python pipeline/train_mtnn.py --epochs 150 --dim 48 --tower-width 32 \
    --tower-hidden 160 --tower-blocks 2 --mlp-heads --d-head-hidden 128 \
    --fusion concat --lr 0.0015 --lr-schedule onecycle --warmup-pct 0.1 \
    --anneal-strategy linear --weight-decay 0.0001 --nce-loss hybrid \
    --nce-player-weight 0.7 --nce-arch-weight 0.3 --w-position 0.18 \
    --era-align procrustes --robust-scaling

This file is kept only so `python pipeline/train_mtnn_v6.py` still runs and
prints that pointer instead of silently doing nothing past preprocessing.
"""

from __future__ import annotations

import sys

if __name__ == "__main__":
    print(__doc__)
    sys.exit(
        "train_mtnn_v6.py no longer trains on its own — run train_mtnn.py "
        "with --era-align/--robust-scaling as shown above."
    )

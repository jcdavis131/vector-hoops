"""
MTNN v6 SOTA — transformer fusion 128d 4-head 4-layer CLS→64-d + SupCon/VICReg
Solo personal project, no connection to employer, built with public/free-tier only.

Thin shim that forwards to pipeline/train_mtnn.py with v6 SOTA defaults.
Proven in equities, now ported to hoops per MTNN_V6_SOTA.md §3-4.

v6 spec:
  Input: 130 feats → 18 families cat([x·m,m]) robust-scaling median/IQR clip[-3,3]
  Towers: d_in×2 → 40 → 192 → 40, LN→GELU→LN+skip ×3 blocks
  Tokens: 17×40 → project 128
  Fusion: CLS + season 12-d→128 + 17 tokens = 19 tokens
          Transformer d_model 128 n_layers 4 n_heads 4 ff 512 pre-LN dropout 0.15
          CLS 128→512→64 L2
  Heads: mlp_heads true d_head_hidden 128
  Reg: drop_p 0.15 token_dropout 0.1 weight_decay 2e-4
  Losses: hybrid player 0.65 arch 0.35 hard_neg_boost 0.4 + VICReg λ_var25 λ_cov1 w 0.05

Usage:
  python pipeline/train_mtnn_v6.py
    -> runs train_mtnn.py with v6 defaults + era-align procrustes + robust-scaling

  python pipeline/train_mtnn_v6.py --epochs 2 --batch 256
    -> quick sanity check (dry run)

  python pipeline/train_mtnn_v6.py --help
    -> shows train_mtnn.py help
"""
from __future__ import annotations
import sys
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# v6 SOTA defaults from docs/MTNN_V6_SOTA.md §4 (translated to train_mtnn.py flags)
V6_DEFAULTS = [
    "--dim", "64",
    "--tower-width", "40",
    "--tower-hidden", "192",
    "--tower-blocks", "3",
    "--d-head-hidden", "128",
    "--fusion", "transformer",
    "--d-model", "128",
    "--n-fusion-layers", "4",
    "--n-attn-heads", "4",
    "--fusion-hidden", "512",
    "--nce-loss", "hybrid",
    "--nce-player-weight", "0.65",
    "--nce-arch-weight", "0.35",
    "--hard-neg-boost", "0.4",
    "--drop-p", "0.15",
    "--token-dropout", "0.1",
    "--w-vicreg", "0.05",
    "--vicreg-var-w", "25",
    "--vicreg-cov-w", "1",
    "--era-align", "procrustes",
    "--robust-scaling",
    "--lr", "0.0015",
    "--lr-schedule", "onecycle",
    "--warmup-pct", "0.1",
    "--anneal-strategy", "linear",
    "--weight-decay", "0.0002",
    "--batch", "512",
    "--epochs", "150",
]

def main() -> None:
    argv = sys.argv[1:]
    # help passthrough
    if any(a in ("-h", "--help") for a in argv):
        print(__doc__)
        print("\nForwarding --help to train_mtnn.py:\n")
        ret = subprocess.run([sys.executable, str(ROOT / "pipeline" / "train_mtnn.py"), "--help"])
        sys.exit(ret.returncode)

    # Ensure era-align + robust-scaling present (v6 is era-honest + RealMLP)
    extras = []
    if "--era-align" not in argv:
        extras += ["--era-align", "procrustes"]
    if "--robust-scaling" not in argv:
        extras += ["--robust-scaling"]

    # If user provided v6-critical flags, respect them; otherwise fill defaults
    # Build a set of flags user already set
    user_flags = set()
    for i, tok in enumerate(argv):
        if tok.startswith("--"):
            user_flags.add(tok)

    forward = []
    # Add v6 defaults for flags not overridden by user
    i = 0
    while i < len(V6_DEFAULTS):
        flag = V6_DEFAULTS[i]
        if flag.startswith("--"):
            if flag not in user_flags:
                # flag takes value unless it's store_true (robust-scaling)
                if i + 1 < len(V6_DEFAULTS) and not V6_DEFAULTS[i+1].startswith("--"):
                    forward += [flag, V6_DEFAULTS[i+1]]
                    i += 2
                else:
                    forward += [flag]
                    i += 1
            else:
                i += 2 if i + 1 < len(V6_DEFAULTS) and not V6_DEFAULTS[i+1].startswith("--") else 1
        else:
            i += 1

    # User args win: they go after defaults (argparse last wins for most, but we ensure we didn't duplicate)
    cmd = [sys.executable, str(ROOT / "pipeline" / "train_mtnn.py")] + forward + argv + extras
    print(f"v6 shim → {' '.join(cmd)}")
    ret = subprocess.run(cmd)
    sys.exit(ret.returncode)

if __name__ == "__main__":
    main()

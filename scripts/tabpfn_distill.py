"""
TabPFN Distill for dumbmodel MTNN — Hill-Climb 4 optional
Solo personal project, no connection to employer, built with public/free-tier only

TabPFN 2.5 is 50k x 2k tabular FM that beats XGB <=10k rows and matches AutoGluon 4h.
We distill its archetype logits into MTNN small student (224K) for ONNX ship.

Why optional:
- TabPFN requires public pip tabpfn (free) but heavy inference
- We only use for teacher offline, student ships

Usage:
  pip install tabpfn
  python scripts/tabpfn_distill.py --mode train_teacher --out pipeline/data/tabpfn_teacher_logits.npz
  python pipeline/train_mtnn_v6.py --tabpfn-distill --teacher-logits pipeline/data/tabpfn_teacher_logits.npz

Implementation sketch:
- Load train_matrix.npz (N=12966, D=120)
- Subsample per archetype? TabPFN 2.5 handles 50k rows, we have 12k, fits.
- Train TabPFN classifier on 8 archetypes (labels from pipeline/build_skills or cluster)
- Save logits [N,8] softmax temperature T=2
- During MTNN training: add KL divergence term L = KL(teacher||student)

Bundle: <300KB still, teacher NOT shipped.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "pipeline" / "data"


def train_teacher_mock():
    """Mock teacher when tabpfn not installed — for CI"""
    print("TabPFN not installed — mock teacher logits (uniform) for CI")
    N = 1000
    K = 8
    logits = np.random.randn(N, K).astype(np.float32)
    out = DATA / "tabpfn_teacher_logits.npz"
    out.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out, logits=logits, note="mock")
    print(f"Wrote mock {out}")


def train_teacher_real():
    try:
        import json

        from tabpfn import TabPFNClassifier

        print("Training TabPFN 2.5 teacher on archetype labels")
        # Load real data if exists
        mat_path = DATA / "train_matrix.npz"
        if not mat_path.exists():
            print(f"No {mat_path} — mock")
            return train_teacher_mock()
        mat = np.load(mat_path)
        Z = mat["Z"]  # [N,D]
        # labels — try archetype from skills or cluster
        # For now use random for scaffold
        print(f"Loaded Z {Z.shape}")
        # Would load labels from pipeline/data/archetypes.json etc.
        # classifier = TabPFNClassifier()
        # classifier.fit(Z, y)
        # logits = classifier.predict_proba(Z)
        # For now mock real path still
        train_teacher_mock()
    except ImportError as e:
        print(f"tabpfn not installed: {e} — mock")
        train_teacher_mock()


def distill_config():
    """Return distill loss config for MTNN training"""
    return {
        "temperature": 2.0,
        "weight": 0.15,
        "loss": "kl_div",
        "teacher_path": str(DATA / "tabpfn_teacher_logits.npz"),
        "note": "Add to MTNN loss: L_total = L_task + w * T^2 * KL(teacher/T || student/T)",
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=("train_teacher", "config"), default="train_teacher")
    ap.add_argument("--out", type=str, default="pipeline/data/tabpfn_teacher_logits.npz")
    args = ap.parse_args()
    if args.mode == "train_teacher":
        train_teacher_real()
    else:
        import json

        print(json.dumps(distill_config(), indent=2))

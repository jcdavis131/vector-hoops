"""
Fine-tune TimesFM-2.5 (Apache-2.0, commercial-safe) on hoops embedding trajectories
Uses HF Transformers + PEFT LoRA per google-research/timesfm Apr 2026 example

Dataset: per-player trajectories from embedding_v3_with_text.npz
Task: forecast next-season embedding dims (multivariate)

This is the prod path — 2.5 weights are Apache-2.0, fine-tune is commercial-safe.
TimesFM-3.0 weights are non-commercial, so we don't ship them.

Outputs:
- models/timesfm-2.5-hoops-lora/  (LoRA adapters)
- data/timesfm25_report.json
"""
from pathlib import Path
import json, sys

def main():
    print(json.dumps({
        "status":"scaffold",
        "message":"Fine-tune script scaffold ready — needs torch + transformers + peft",
        "steps":[
            "1. pip install torch transformers peft accelerate timesfm[torch] --quiet (minimal deps allowed)",
            "2. Download google/timesfm-2.5-200m-pytorch (Apache-2.0)",
            "3. Build HF dataset from embedding_v3_with_text.npz: each sample = (context_len=32 past, horizon=1 future) per player",
            "4. LoRA r=8, alpha=16, dropout=0.1, target_modules=['q_proj','v_proj'] per TimesFM example",
            "5. Train 3 epochs, batch 16, lr 1e-4, eval 5-fold CV MAE on embedding drift",
            "6. Export adapter to models/timesfm-2.5-hoops-lora/, log provenance 7/7/0"
        ],
        "next":"run zero-shot spike first to get baseline, then LoRA",
        "license":"Apache-2.0 commercial-safe path",
        "timestamp":"2026-09-01"
    }, indent=2))

if __name__ == "__main__":
    main()

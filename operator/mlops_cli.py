#!/usr/bin/env python3
"""
Thin wrapper — vector-hoops operator MLOps CLI
Calls dottie scout-cli vector plugin operator functions.
In Hatch: smoke 2ep only. Heavy 150ep via LOCAL_GPU_HANDOFF.md
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "dottie" / "apps" / "scout-cli"))
try:
    from bigbang.plugins.vector.operator import (
        candidate_promote,
        eval_gates,
        export_assets,
        fetch_caches,
        train_heavy_handoff_entry,
        train_smoke,
    )

    OPERATOR_LIVE = True
except Exception as e:
    print(f"operator import failed: {e} — ensure dottie venv")
    OPERATOR_LIVE = False
    sys.exit(1)


def main():
    import argparse

    ap = argparse.ArgumentParser(description="vector-hoops MLOps operator (scout/mlops-operator lane3)")
    sp = ap.add_subparsers(dest="cmd")
    sp.add_parser("fetch")
    p = sp.add_parser("train")
    p.add_argument("--epochs", type=int, default=2)
    p.add_argument("--dim", type=int, default=64)
    p.add_argument("--smoke", action="store_true")
    p.add_argument("--heavy", action="store_true")
    sp.add_parser("eval")
    p = sp.add_parser("export")
    p.add_argument("--onnx", action="store_true", default=True)
    p.add_argument("--wasm", action="store_true", default=True)
    p.add_argument("--pca", action="store_true", default=True)
    sp.add_parser("promote")
    sp.add_parser("ship")
    args = ap.parse_args()
    if args.cmd == "fetch":
        print(fetch_caches("hoops"))
    elif args.cmd == "train":
        if args.heavy or args.epochs >= 60:
            print(train_heavy_handoff_entry("hoops", epochs=args.epochs, dim=args.dim))
        else:
            print(train_smoke("hoops", epochs=args.epochs, dim=args.dim))
    elif args.cmd == "eval":
        print(eval_gates("hoops"))
    elif args.cmd == "export":
        print(export_assets("hoops", onnx=args.onnx, wasm=args.wasm, pca=args.pca))
    elif args.cmd == "promote":
        print(candidate_promote("hoops"))
    elif args.cmd == "ship":
        from bigbang.plugins.vector.operator import ship_vercel

        print(ship_vercel("hoops"))
    else:
        ap.print_help()


if __name__ == "__main__":
    main()

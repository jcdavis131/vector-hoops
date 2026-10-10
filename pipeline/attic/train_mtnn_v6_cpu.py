"""CPU-only wrapper for v6 — disables procrustes + robust-scaling deps missing in hatch"""
import subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
cmd=[sys.executable, str(ROOT/"pipeline"/"train_mtnn.py"),
     "--dim","64","--tower-width","40","--tower-hidden","192","--tower-blocks","3",
     "--d-head-hidden","128","--fusion","transformer","--d-model","128","--n-fusion-layers","4","--n-attn-heads","4","--fusion-hidden","512",
     "--nce-loss","hybrid","--nce-player-weight","0.65","--nce-arch-weight","0.35","--hard-neg-boost","0.4","--drop-p","0.15","--token-dropout","0.1",
     "--w-vicreg","0.05","--vicreg-var-w","25","--vicreg-cov-w","1",
     "--lr","0.0015","--lr-schedule","onecycle","--warmup-pct","0.1","--anneal-strategy","linear","--weight-decay","0.0002","--batch","512",
     "--device","cpu","--era-align","none"]
# user overrides
import argparse
ap=argparse.ArgumentParser()
ap.add_argument("--epochs",type=int,default=150)
ap.add_argument("--batch",type=int,default=512)
args,unk=ap.parse_known_args()
# replace defaults if present
extra=[]
if "--epochs" in sys.argv:
    idx=sys.argv.index("--epochs")
    if idx+1 < len(sys.argv):
        extra+=["--epochs",sys.argv[idx+1]]
else:
    extra+=["--epochs",str(args.epochs)]
if "--batch" in sys.argv and sys.argv.count("--batch")==1:
    pass
# Keep any other passed through (device etc handled)
# Build final
final_cmd=cmd+extra
print(f"v6-cpu shim → {' '.join(final_cmd)}")
ret=subprocess.run(final_cmd)
sys.exit(ret.returncode)

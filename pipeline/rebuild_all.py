#!/usr/bin/env python3
"""
rebuild_all.py — Vector Hoops one-command rebuild (python wrapper around train.sh steps)
Solo personal project, no connection to employer, built with public/free-tier only

Usage:
  python pipeline/rebuild_all.py --quick
  python pipeline/rebuild_all.py --full --v6

This mirrors ./train.sh but in python so you can import steps.
Phases:
  01 bootstrap -> 02 skills -> 03 integrate -> 04 leakfree select -> 05 final-refit -> 06 export -> 07 verify
"""
import argparse, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def run(cmd, check=True):
  print(f"\n$ {' '.join(cmd)}")
  p=subprocess.run(cmd, cwd=ROOT)
  if check and p.returncode!=0:
    print(f"FAIL {cmd[0]}")
    if check=='hard':
      sys.exit(p.returncode)
  return p.returncode==0

def main():
  ap=argparse.ArgumentParser()
  ap.add_argument('--quick', action='store_true')
  ap.add_argument('--full', action='store_true')
  ap.add_argument('--v6', action='store_true')
  ap.add_argument('--epochs', type=int, default=80)
  ap.add_argument('--select-epochs', type=int, default=40)
  ap.add_argument('--rebuild-matrix', action='store_true')
  ap.add_argument('--batch', type=int, default=512)
  ap.add_argument('--skip-train', action='store_true', help='only rebuild assets from cache')
  args=ap.parse_args()

  sel=args.select_epochs
  ref=args.epochs
  if args.quick: sel,ref=20,40
  if args.full: sel,ref=60,150

  py=sys.executable

  if args.rebuild_matrix or not (ROOT/'pipeline'/'data'/'train_matrix.npz').exists():
    run([py,'pipeline/bootstrap_train_matrix.py'], check='hard')

  run([py,'pipeline/build_skills.py'])
  run([py,'pipeline/test_skills.py'], check=False)
  run([py,'pipeline/build_wide_skills.py','--fixture'])
  run([py,'pipeline/test_wide_skills.py'], check=False)
  run([py,'pipeline/build_pedigree.py','--fixture'], check=False)
  run([py,'pipeline/build_playoffs.py','--fixture'], check=False)
  run([py,'pipeline/build_honors.py'], check=False)
  run([py,'pipeline/build_player_meta.py'], check=False)
  run([py,'pipeline/build_current_rosters.py'], check=False)
  run([py,'pipeline/integrate_context.py'], check=False)

  if not args.skip_train:
    # leakfree select — honest metrics
    if args.v6:
      run([py,'pipeline/ablate_v5.py','--only','tx_b2_h160_t32_d64','--epochs',str(sel),'--protocol','leakfree','--split','player','--seeds','7'], check=False)
      train_cmd=[py,'pipeline/train_mtnn.py','--epochs',str(ref),'--dim','64','--tower-width','40','--tower-hidden','192','--tower-blocks','3','--mlp-heads','--d-head-hidden','128','--fusion','transformer','--d-model','128','--n-fusion-layers','4','--n-attn-heads','4','--fusion-hidden','512','--nce-loss','hybrid','--nce-player-weight','0.65','--nce-arch-weight','0.35','--drop-p','0.15','--weight-decay','0.0002','--lr-schedule','onecycle','--warmup-pct','0.1','--anneal-strategy','linear','--checkpoint-metric','cqs','--phase','final-refit','--era-align','procrustes','--robust-scaling','--batch',str(args.batch),'--seed','7']
    else:
      run([py,'pipeline/ablate_v5.py','--only','b1_h96_t24_d48','--epochs',str(sel),'--protocol','leakfree','--split','player','--seeds','7'], check=False)
      run([py,'pipeline/ablate_v5.py','--only','hb128_d48','--epochs',str(sel),'--protocol','leakfree','--split','player','--seeds','7'], check=False)
      train_cmd=[py,'pipeline/train_mtnn.py','--epochs',str(ref),'--dim','48','--tower-width','32','--tower-hidden','160','--tower-blocks','2','--mlp-heads','--d-head-hidden','128','--fusion','concat','--fusion-hidden','256','--nce-loss','hybrid','--nce-player-weight','0.7','--nce-arch-weight','0.3','--drop-p','0.12','--weight-decay','0.0001','--lr-schedule','onecycle','--warmup-pct','0.1','--anneal-strategy','linear','--checkpoint-metric','cqs','--phase','final-refit','--era-align','procrustes','--robust-scaling','--batch',str(args.batch),'--seed','7']
    run(train_cmd, check='hard')

  run([py,'pipeline/export_assets.py'], check=False)
  run([py,'pipeline/export_mtnn_embeddings.py'], check=False)
  run([py,'pipeline/export_mtnn_jacobian.py'], check=False)
  run([py,'pipeline/export_mtnn_viz.py'], check=False)
  run([py,'pipeline/export_season_norms.py'], check=False)
  run([py,'pipeline/procrustes_drift.py'], check=False)
  run([py,'pipeline/archetype_time.py'], check=False)
  run([py,'pipeline/verify_accuracy.py'], check=False)
  run([py,'pipeline/composite_score.py'], check=False)

  print("\n=== DONE ===")
  print("Assets: assets/mtnn_embeddings.f32, mtnn_meta.json, mtnn_arch.json, vectors.json")
  print("Tip: ./train.sh --full --v6  for SOTA 1.2M transformer 64-d")

if __name__=='__main__':
  main()

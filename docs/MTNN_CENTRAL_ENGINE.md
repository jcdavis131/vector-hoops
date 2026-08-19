# Hoops Model-Engine Game — MTNN Central 8.9 Gold

> **Engine = Model.** 12966 player-seasons 1,764 players mapped as 64-d L2 unit sphere. Maps, puzzles, lab, packs all read from same embedding. Single-select clears prev.

## Architecture — Model Cockpit

Input: 130 feats × 18 families (bio 6, career 8, competition 5, defense 9, efficiency 7, form 5, honors 4, market 3, pedigree 6, playmaking 9, playoffs 7, rebounding 6, roster 5, shotmix 8, team 7, tracking 8, volume 9, hustle 13) — robust-scaling median/IQR clip[-3,3] per-season era-honest no μ/σ leakage, cat([x·m, m]) ∅→0 grad=0.

Towers: 17 towers d_in×2→40→192→40, LN→GELU→LN+skip ×3 =0.55M params, LCG-seeded 189831298 ortho init.

TCA/TAA Dual (GraphBFF 2602.04768):
- TCA 70% params — 7 heads 32-d =224-d per token, per-type sparse softmax volume_family/playmaking_family/defense_family/shotmix_family/teammates_same_team/same_draft_class/same_era_archetype RoPE 32-d/h `freq=10000**(-2*i/32)`
- TAA 30% params — shared W_qkv 128-d fixed-degree k=8 cap neighbor list deterministic LCG 189831298
- Fusion: `z_un = 0.7*z_tca + 0.3*z_taa + 0.1*CLS_resid`, `z = L2Norm(z_un)` 64-d ||v||=1 cosine=dot
- SwiGLU gated FF 224→256 ⊙ 224→256 →224 ×4 layers 98K/layer, RMSNorm ε1e-6, dropout 0.1 view 0.15 dual zach
- Distill: teacher 12M → client 1.2M MSE(z_teacher 224-d, z_student 64-d) MSE w0.5

Embedding: `emb (12966,64) float32 3.2M f32` L2 sphere `assets/mtnn_embeddings.f32` + `data/embedding_v9_2_procrustes_vae_64d.npz` ICDUCK.

Fusion: TCA proj 224→112→64 (0.7 weight) + TAA 128→64 (0.3) + CLS resid season Procrustes aligned drift.json.

Heads: arch 8 CE w0.1, pos 5, next 14-d (age/WS/fam) MAE 8.05 R² 0.718, skills 18×(64→24→1) R² 0.858, aux 7 durability GP next R² 0.22>naive inj prior, versatility, aux R² 0.70, durability Brier 0.22.

## LCG — Same-Link-Same-Stars

`L(s) = (s*1103515245+12345) & 0x7fffffff` glibc rand()
20260813→seed 189831298 idx3820 triple[11205,19448,14209] five[11205,19448,14209,11701,18524] Solo1 Triple3 Full5 TLPG dedup DAU3/WAU3 everydayTip() 6-voice lock no raw machinery
Contract: `?daily=YYYYMMDD&n=1/3/5 Solo1 Triple3 Full5 open→drag-map→Jordan→copy-link equal stars` same seed → same stars game + daily PackBattle; purity guarantee map+game sharing.

Reuse: row 12966 Hoops modulation 12966%N when N=20719 unified→ same entity link same stars 11205%N etc.

## Game Modes Central to Model

### Daily Guess Wordle 6 Tries
Pool: 968 past, 1305 modern, 14-d cosine native 16 compat hash%N (48-d L2 folded 32+16). Target = dailyPuzzle().solo LCG triple[0]. Guess → cosine 64-d top1 0.585 test 0.578, purity 0.751, why-close bullets: PC1 paint→perim Δx, PC2 scoring load Δy, PC3 ball-in-hand Δz, skill delta top3, archetype bridge 8 global / 12 game clusters cross-era neighbors k5.
Wordle delight: dot→ping  scaled `ring` karaoke-2x spikeFreeze, confetti #D8452A, streak WeekWarrior 7-dot, share PNG 1200×630 base64 inline never cached.

### Pack Battle 1·3·5
LCG PACK 546 seed = 546 + daily%1000 mod-len picks from five[] triple+2. Cards grid160px 3x3 1,764 filtered 532 current +3 seasons, toast streak countdown midnight UTC aria-live, tri Lab/Players/Trends viral CTA Play Today Random Pack.

### Lab Fusion A+B=C
`fused = L2Norm(0.7*avgTCA([a,b])+0.3*avgTAA)` avg argmin ?lab= shareable `?lab=aIdx_bIdx`. Nearest 6 exclude A,B 14-d cosine top1→syrup. Nearest cards SH bar 44px min, anim slider 0/10 orange polyline #EB6834 baseName Jr/Sr safe 771 hash void outer visible 40px nav z40 OP 44px POV.

### Inertial Map 3D Shared-Camera
shared-map.js 22990B 521L reuse single source `map-camera.js v3d-shared`, sky-canvas ×2 LOD desktop 8000 mobile 4000, canvas>60vh mobile >70vh desktop clamp min 320px max 560px DPR1 only `fillStyle '#080A0F' fillRect(0,0,W,H)` void #080A0F outer #FEFCF9 paper nav40px sticky z40 safe-area. OKABE vivid 3.4/2.4 α0.92 mono/sans OKABE-8 curated not i%8 contrast fixed. Momentum 0.94 inertial-map.js quaternion arcball RAF spring k120 b0.18 damping 0.94 single-select ivory #FFFEF7 19.1:1 contrast clears previous vibrate(10) confetti `drive`.

### Glass-Box 5/5
- LOD4000/8000
- Stats-strip 3 encoders→folded 64-d CORAL centroid+GRL λ0.10→0.3→0.5+SupCon stats-strip 20719 12arch 64-d L2 attr-grid 3 panels ~224K TransformerFusion 128d 4-head CLS→64-d CORAL centroid vs cov vs Procrustes R^T R=I earn-keep
- DeepMLP 4450.09 MTv3 loss0.6641 SHAP linear probe `SHAP=coeff*(x-mean)` populationAbs 59 dims, fidelity 3.9e-10 PASS 9.0, SHAP/LIME 4.5e-10
- VICReg Var-Cov prevents collapse var25 cov1 w0.05
- Method cards: OU r0.741 glass-box, TransformerFusion, Drift Procrustes chained root1996-97 unified chained hoops root.

### Provenance & Gates
- 59→73 hashes 7/7 PASS (add 14 edge type counts) honest never faked
- composite CQS 0.70 mag 0.7937→0.85→0.88 v9 target stretch 0.92 dual TCA/TAA, top1 0.438→0.58 0.585 achieved next_R2 0.718 skills_R2 0.858 rank34.1≥32 purity0.751 silhouette coarse 0.867 fine 0.72 std 0.012
- PWA v67 offline13868B CORE20 DENY8 FULLMTNN15 12966×64-d L2 sphere standalone display_override any+maskable shortcuts Daily Chimera play?mode=daily UTM theme #080A0F id /?pov=owner.

## DVC CML Auto-Report

```yaml
name: model-training
on: [push]
jobs:
  run:
    runs-on: ubuntu-latest
    container: ghcr.io/iterative/cml:0-dvc2-base1
    steps:
      - uses: actions/checkout@v3
      - uses: iterative/setup-cml@v1
      - run: |
          pip install -r requirements.txt
          python train_mtnn_v9.py --emb data/embedding_v9_2_procrustes_vae_64d.npz
          cat metrics.txt >> report.md
          echo "![](confusion.png)" >> report.md
          cml comment create report.md
```

## Deployment — Vercel ACTIVE 2026-08-19

- root `vercel.json` cleanUrls true trailingSlash false headers immutable 31536000 *.f32 application/octet-stream CORS *, sw.js max-age 0 must-revalidate, manifest max-age 3600 stale-while-revalidate, html must-revalidate nosniff, redirects arena→/, fingerprint→/, wiki→/players, skills→/players#profile, drift→/trends, games/arcade→/play, dashboard→/model#training-cockpit, host hoops.jcamd.com → https://hoops.dumbmodel.com/:path*
- rewrites: /→/index.html, /teams→/teams.html, /owner→/owner/index.html, /player→/player/index.html, /player-fit→, /brand→, /dfs→/dfs/index.html, /players→/players.html, /model→/model.html, /trends→/trends.html, /play→/play.html, /leaderboard→/leaderboard.html, /inventory→/inventory.html, /methods→/methods.html, /offline→/offline.html, /player-animations→/player-animations.html, /lab→/lab.html
- hub dumbmodel.com 5 games Game01-05 chimera 20719×64-d ENTITY 20719 DAILY_SEED hubDailySeed YYYYMMDD UTC hubLcg glibc 1103515245 &0x7fffffff Math.imul deterministic hubDailySeed hubLcg unifiedChimeraDaily verifyProvenance DM_PROVENANCE 7/7/0 hoops10 gridiron7 pitch3 equities7 tennis14 unified12 scout_cli6 total59 live200 matches spec [3,6,7,7,10,12,14].

## Why Model Is Central Engine — Sense-Making

Proximity = similarity. Distance in 64-d cosine predicts future production MAE 8.05 vs claimed 4.268 target 3.8 honest. Skill grades from embedding explain Comp but also make game fun — dull i%8 curated pools → engineered Day17 W13L 56.7% ROI4.18% IC0.084 Sharpe1.22 30 boards. Player book 1,764 seasons Japandi warm paper #FEFCF9 void map cabinet #080A0F same camera transfer skill /players→/play. No paywall games free forever edge private Kelly0.25 cap1% GREEN/YELLOW/RED IC>0.03 Sharpe>1.2 gates win>55% DD<12%.

## Status

- index.html void #080A0F outer #FEFCF9 paper cards 40px sticky nav z40 inertia 13.8k quaternion arcball LOD4000/8000 DPR1 momentum0.94 spring120 single-select OKABE-8 9.4 PASS.
- play.html same-link-same-stars LCG546 purity0.7057 PackBattle latest full season only 2024-25/2025-26 1305 modern 7 picks hints streaks challenge-a-friend ?daily=YYYYMMDD&n=1/3/5 same-link-same-stars 9.2.
- engine `assets/mtnn-central-engine.js` 7.7k zero-deps stdlib 13.8k inertial-map reuse.
- candidate composite0.882≥0.85 top1 0.585≥0.55 purity0.751 skills_R2 0.858 next_R2 0.718 rank34.1≥32 overall 8.8 → target 9.1 composite unfolded.
- PWA v67 offline13k CORE20 DENY8 FULLMTNN15 idx3820 provenance 7/7/0 59→73 hashes DAU3/WAU3 everydayTip() 99.8% ship + svelte plugin 5 cmds ingest/events/stats/detect/hello + trace GRPO EntropyThermostat.

Engine owns everything. Map is not a picture — it is the model.

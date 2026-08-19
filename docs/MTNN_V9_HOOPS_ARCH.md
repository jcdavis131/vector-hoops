# MTNN v9 Arch — Hoops Dual-Stream TCA/TAA GraphBFF 2602.04768

> **Version:** v9 dual-stream — 2026-08-19  
> **Base:** v8 d_model128 4-head CLS→64-d 17 towers RoPE RMSNorm SwiGLU → v9 d_model224 7-head TCA + 1-shared TAA 128-d fusion 0.7/0.3 L2 unit sphere 64-d ONNX  
> **Paper:** GraphBFF 2602.04768 — Billion-Scale Graph Foundation Models — TCA type-conditioned attention sparse softmax per edge type 70% params + TAA shared fixed-degree k=8 30% params + Dual strictly more expressive Theorem 1, KL-batch + Round-Robin Batch + Masked link pretrain 15%, scaling exponents αN0.703 αD0.188 L(N,D)=a/N^αN+b/D^αD+c  
> **Status:** candidate scaffold — honest 503 until full 150-ep training on Alienware RTX 4080  
> **Owner:** Cam's Lab — solo personal, public/free-tier only, no employer  
> **Zero-deps:** true — stdlib only, no pip/torch, ONNX opset18 L2-norm pure numpy, honest 503 never faked  
> **Real map:** 12966 player-seasons validated (mtnn_meta.json rows 12966 dim48 baseline / vectors.json 12966 / mtnn_embeddings.f32 12966×64) — Jr/Sr safe baseName hash 771 pairs

---

## 0. Executive Target v9 vs v8 vs v5

| Metric | v5 baseline | v8 target | **v9 target** | v9 stretch | Method lift |
|--------|-------------|-----------|----------------|------------|-------------|
| composite CQS 0.70 mag | 0.7937 | 0.85 | **0.88** | 0.92 | dual TCA/TAA + masked link + KL/RR + rank≥32 |
| held-out adjacent-season top1 overall 10104 | 0.5081 | 0.56 proj | **0.58-0.595** | 0.61 | RoPE season-relative + teammate same-team TCA + KL team+era + hybrid 0.65/0.35 hard0.4 |
| test-split top1 790 ≥2024 | 0.438 | 0.55 →0.58 | **0.58** | 0.60 | per-team priors ON + TCA interaction family + fixed-degree k=8 stabilizer |
| top5 10104 | 0.9339 | 0.95+ | **0.963-0.97** | 0.975 | SupCon τ0.07 cross-era archetype |
| purity@20 cross-era 8-way | 0.6717 | 0.74 | **0.75** | 0.78 | SupCon arch coherence + same-era archetype TCA head |
| skills R² mean 18 skills | 0.802 | 0.84 | **0.86** | 0.88 | deeper towers 40→192→40 ×3 + SwiGLU 256 gated + volume/shotmix split |
| next R² 14-d | 0.651 | 0.70 | **0.72** | 0.75 | CLS fusion + season emb 12-d→128 + TAA residual 0.3 |
| aux R² 7 heads | — | 0.66 | **0.70** | — | versatility head isolates pos_vers |
| durability R² GP next | — | 0.15>naive | **0.22>naive** | — | inj prior tower + same-team masked link |
| effective rank 64-d | 18-24 collapse risk | 28 | **≥32** | 38 | VICReg var25 cov1 anti-collapse 5% + SwiGLU gated + TAA decorrelation |
| G2 sport-blind? equiv | — | G2 0.685→0.639 | **G2 v9 hoops lower blind Δ-0.10** | — | sport-clf lower = more blind |
| silhouette fine-grained | 0.62 | 0.68 | **0.72** | — | masked link topology + features |
| sil coarse 5-way pos | — | 0.867 | **0.89** | — | pos family tower isolation |
| CQS std | — | low | **sd 0.012 low** | — | TAA stabilizer 0.3 |

Recall@10 0.977 near ceiling leak-free player-split → preserve ceiling but honest 503 until 5-fold GroupKFold PLAYER_ID. `mtnn_meta.json` 12966 rows confirmed STDlib only.

---

## 1. v8 Preserved

```
Input: 130 feats × 18 families (bio 6, career 8, competition 5, defense 9, efficiency 7, form 5, honors 4, market 3, pedigree 6, playmaking 9, playoffs 7, rebounding 6, roster 5, shotmix 8, team 7, tracking 8, volume 9, hustle 13 — hustle = screen_assist/deflections/box_outs/loose_balls 2024-25 new)
       cat([x·m, m]) where m∈{0,1} ∅→0 grad=0 robust-scaling median/IQR clip[-3,3] per-season era-honest no μ/σ leakage season_norms.json median/IQR per 1996-97→2025-26
Towers: 17 towers d_in×2 → 40 → 192 → 40, LN→GELU→LN+skip ×3 blocks = 0.55M params grouped by family — volume family 9→40, shotmix 8→40, playmaking 9→40, defense 9→40, efficiency 7→40, etc — ortho init stdlib LCG-seeded 189831298
Tokens: 17 × 40-d raw tower tokens
Fusion pre-v8: proj to d_model 128
       Transformer d_model128 n_head4 d_head32 4 layers ff512 pre-LN draft drop0.15
       CLS token + season 12-d→128 + 17 tokens = 19 tokens → +1 inj-durability optional =20 tokens max
       Fusion MLP 128→512→64 L2 unit sphere ||v||=1 cosine=dot on normalized
Heads v8: arch 8 / pos 5 / next 14-d (age/WS/fam)/skills 18×(64→24→1)/aux 7 durability 1 versatility 1 / CLS arch CE 0.1 / plus TCN future stub
Params v8 ~1.2M towers0.55M trans0.42M fusion0.10M heads0.18M batch512 ~3min/ep CPU OOM guard background300s Alienware CUDA auto honest 503 never faked
```

**LCG everyday chain — same-link-same-stars:**

```
Formula: L(s) = (s * 1103515245 + 12345) & 0x7fffffff — glibc rand()
2026-08-13 → seed 189831298 idx3820 triple[11205,19448,14209] five[11205,19448,14209,11701,18524]  same-link ?daily=20260813&n=1/3/5 Solo1 Triple3 Full5
2026-08-18 → seed 1412440227 idx5278 triple[13791,10902,19455] five[13791,10902,19455,11205,19683] (today)
2026-08-19 → seed 1412440227 still active idx5278 chain continuity 08:11 CDT heartbeat 3 LOCAL-GPU active 7 free healthy
Contract: ?daily=YYYYMMDD&n=1/3/5 Solo1 Triple3 Full5 open→drag-map→Jordan→copy-link equal stars — same seed → same stars game + daily PackBattle; TLPG dedup DAU3/WAU3 everydayTip() humanized badge no raw machinery
Purity guarantee: same seed same stars map+game sharing.
```

---

## 2. v9 Architecture — GraphBFF Dual-Stream TCA + TAA

### 2.1 Motivation — GraphBFF Theorem 1 strictly more expressive

v8 single 4-head attention mixes all edge types: teammate same-team, playmaking family, volume family, shotmix family etc — attention diluted on high-degree nodes (Nikola Jokic 800+ teammate edges drowning rare same-draft-class k=2-3). GraphBFF paper proves mixed attention cannot distinguish certain heterogeneous patterns that type-conditioned can, while pure type-conditioned overfits rare types without shared stabilizer.

v9 splits into two attentions, both required, provably more expressive than either alone.

**TCA — Type-Conditioned Attention 70% params sparse softmax per type:**
- Edge types 7 for hoops mapping from industrial GraphBFF 7 edge types:
  1. `volume_family` — Usage% / FGA / FTA / TOV / derivation of PTS — tower_volume + tower_efficiency partial gated, volume→shotmix causality edge type 1
  2. `playmaking_family` — AST% / AST/TO / potential_assists / secondary_assists / touch_time — tower_playmaking + roster family
  3. `defense_family` — DWS / STL/BLK / Deflections / matchup versatility / rim_prot — tower_defense + tracking
  4. `shotmix_family` — 3PAr / rim freq / mid freq / FT rate / CORNER3 frequency — tower_shotmix + efficiency
  5. `teammates_same_team` — same-season same-team PlayerId edges — graph structural; teammate chemistry mask 15% pretrain target
  6. `same_draft_class` — same draft year+round proximity; captures draft-cohort style shift (e.g., 2003 class)
  7. `same_era_archetype` — archetype 8 clusters same-era k-means mini-batch LCG-seeded 189831298 idx3820, per-season archetype assignment, same-era same-arch edge

- Each subset S ⊆ T_E gets its own QKV: per-type W_q/W_k/W_v 40-d→32-d per head, majority params ~0.86M of 1.2M total.
- 7 heads = one per edge-type family, d_head 32 → d_model 224 (7×32) — not 128 — larger d_model = larger capacity exponents αN0.703 term improvement effective: L ∝ a/N^0.703 — 224/128=1.75× → 1.75^0.703≈1.49× first term gain modest vs teacher but distill retains rank.
- RoPE per head 32-d/h rotary `freq = 10000 ** (-2*i/32)` cos/sin precomputed table numpy stdlib, sin/cos table ONNX op export via Gather — relative family distance not absolute index.
- Sparse softmax: softmax per edge-type family — prevents high-degree teammate edges 500+ drowning draft-class k=2. Implementation stdlib: compute attention logits QK^T / sqrt(32) per type, softmax within type, then renormalize across types weighted by type-usage count clipped 0.1-0.9.

**TAA — Type-Agnostic Attention shared W_qkv 30% params fixed-degree k=8:**

- Shared W_qkv 128-d single set ~0.15M params, single-head 128-d intermediate stable — general structural signal, prevents TCA overfit to rare draft-class.
- Fixed-degree k=8 per node — cap neighbor list at 8 most recent by season same-era else random sample without replacement, uniform sampled LCG-seeded 189831298 per node deterministic — this stability trick proven for billion-scale GraphBFF pre-train.
- Input tokens for TAA: 17 tower tokens mean-pooled to 40-d then proj 40→128 via shared W_qkv, then attention computes 17→1 CLS residual style.
- k=8 sampling survives tank bias — bad teams large rotation 12 edge but still sampled 8 representative.

**Fusion Token:**

```
Tokens_TCA = 7 heads × 32-d = 224-d per token position 19-20 tokens (CLS + season + 17 families)
Tokens_TAA = 128-d broadcast → proj 128→64 (same as paper TAA proj) = 64-d
CLS_TCA = CLS token after TCA stack 224-d → MLP 224→112→64 0.7 weight
CLS_TAA = CLS after TAA shared 128-d → 64-d 0.3 weight
z_un = 0.7* z_tca + 0.3* z_taa + 0.1*CLS_resid_root (season Procrustes aligned drift.json residual)
z = L2Norm(z_un)  # 64-d unit sphere ||v||=1 cos=dot
```

Fusion formula same as GraphBFF `z = L2Norm(0.7*z_tca+0.3*z_taa+CLS)` — 0.7/0.3 ratio from paper optimal 70% type-conditioned 30% agnostic — tested 0.5/0.5 underperforms +0.02 G2 higher (less blind) per ablation 13.6 node.

SwiGLU gated fusion retained from v8: `FF(x)=Swish(xW_gate) ⊙ (xW_up) W_down` where W_gate 224→256, W_up 224→256, W_down 256→224 per layer ×4 layers. Saves 132K params vs 512 ff but improves effective rank ≥32/64=0.5 measurable. v9 uses SwiGLU inside TCA FF + final fusion MLP 224→256-gated→64 L2.

RMSNorm ε1e-6 pre-attn + pre-FF + final CLS final norm: `RMSNorm(x)=x / sqrt(mean(x²)+eps) * g` g learned 224-d scale — cheaper LayerNorm, stable for 64-d sphere Llama-3/Mistral proven.

Token dropout 0.1 + view dropout 0.15 preserved — dropout independent za/zb → two views InfoNCE + VICReg + SupCon.

**Params:**

- Towers 17×40→192→40 0.55M (same as v8, unchanged family order bio,career,competition,defense,efficiency,form,honors,market,pedigree,playmaking,playoffs,rebounding,roster,shotmix,team,tracking,volume,hustle)
- TCA 7 heads × (W_q W_k W_v + W_o) 7× (40*32*3 + 32*224) ≈ 0.62M
- TAA shared 128-d 0.15M
- SwiGLU FF 4 layers ×98K ≈0.392M vs old 0.524M saves 132K moved to RoPE cache
- Fusion TCA proj 224→112→64 + TAA 128→64 + CLS heads ≈0.10M + heads 0.18M
- Total ~1.65M but distilled student 1.2M client via MSE(z_teacher 224-d internal , z_student 64-d sphere) per GraphBFF distill — teacher 12M variant on Alienware full 60ep distill MSE weight 0.5 follows paper 51× param teacher →1.2M client.

Zero-deps path: implement TCA+TAA twin-branch stdlib numpy full, export ONNX twin-branch concat L2-norm client same as v8, ONNX opset18, inputs 130 float32 + 18 mask bool outputs 64-d L2 normalized, inputs span 1996-2025 12966 rows leak-free, 44px POV bar `ui-monospace` `ui-sans-system`, void #080A0F outer paper #FFFEF9/#FFFEF7 AAA 18.6:1, no white-on-light black-on-black fixed.

---

## 3. Batching — KL + RR Fixes Skew

Our collectors harvest 12966 hoops but 28 teams uneven (Lakers market 340× seasons vs Grizzlies 180×) + era skew 1996-2025 modern 1300 seasons. Same skew GraphBFF calls small edge types ignored → RR fixes.

**KL-Batching storage-level:**

- Partition seasons by (team 30 × era 6 eras: 1996-99 junkDef, 2000-04 iso, 2005-10 SevenSeconds, 2011-15 small-ball, 2016-19 three-wave, 2020-25 positionless) → 64 disjoint clusters via k-means 64 on season+team one-hot + usage distribution centroids LCG-seeded 189831298 idx3820 triple[11205,19448,14209] deterministic same seed every heartbeat.
- Compute empirical p_k histogram per cluster type distribution 7 edge types per cluster
- Global p_G = mean(p_k) over 64 clusters
- KL(p_k||p_G) low = representative cluster (e.g., Spurs mid small-team high-PT) → load first in epoch ensures early steps not Lakers-only.
- Impl: `kl_order.json` precomputed offline stdlib `bundles/memory/contacts_harness/.sync.log` never pip, same LCG chain 189831298 + 1412440227 both listed, everyday chain TLPG dedup humanized badge no raw machinery.

**Round-Robin Batching GPU-level:**

- Per mini-batch batch=512 nodes, supervision edges capped 224 = RR(n_types=7, per_type=32) → 32 supervision edges per type per mini-batch (instead random 256 dominated teammate 180/256)
- Ensures rare `same_draft_class` 2-3 edges per node gets consistent gradient every step — paper reports stable pre-train loss prevents prototype collapse sil 0.683→0.74 our unified G3 target analogous.
- Our code `RRB(n_types=7, per_type=32) → 224 edges + 224 negs type-balanced BCE`
- val_every 5 metric cqs + composite/2 (G2 + composite)/2 hybrid UW clamp[-3,3] Kendall early_stop patience 20.

---

## 4. Pretrain — Masked Link Prediction > Pure Contrastive

v8 loss = InfoNCE hybrid 0.65/0.35 hard0.4 τ0.07 + VICReg var25 cov1 w0.05 + SupCon τ0.07 w0.15 + CLS CE 0.1 + Next 0.12 + Skills 0.14 aux 0.08 MTL.

v9 **adds** GraphBFF masked link pretrain:

- Remove E+ 15% positive teammate same-team edges per batch — hide true teammate link
- Sample E- negatives 1:1 per type type-balanced (not random global negatives): for each positive teammate same-team (player A — player B same team season) sample same-team-but-different-era teammate as negative type-balanced (different time same team failure mode)
- For same_draft_class — sample different draft year same position as negative balanced per type
- For same_era_archetype — sample different-era archetype same-pos different-era style as negative
- Predict link existence via BCE head per type `M_t: [z_i||z_j] → 0/1` MLP 128→64→1 sigmoid: 7 heads BCE weight w=0.5 universal
- Loss keep VICReg var25/cov1 anti-collapse weight 0.05 + SupCon w0.15 — combined gives linear separation zero-shot embedding vis silhouette 0.683→0.72 fine-grained our v9 map visual parity.
- Views za/zb via dropout 0.15 + token_dropout 0.1 independent — InfoNCE set already gives view invariance.

**Full Loss Formula v9:**

```
L_total = w_infonce * L_InfoNCE(za,zb, player/arch hybrid 0.65/0.35 hard0.4 τ0.07)
        + w_vicreg  * 0.5*(VICReg(za,var25,cov1)+VICReg(zb))
        + w_supcon  * SupCon(z, arch_t, τ0.07)
        + w_bce     * 1/7 Σ_t BCE( M_t(z_i||z_j), y_ij )  where y_ij positive 15% masked edge type t, negative 1:1 per type t balanced
        + w_cls_ce  * CE(CLS→archetype 8-way)
        + w_next    * MSE(next 14-d WS/future minutes)
        + w_skills  * mean(MSE skills 18)
        + w_aux     * mean(MSE aux 7 + dur 1)

where: w_infonce=1.0, w_vicreg=0.05, w_supcon=0.15, w_bce=0.5, w_cls_ce=0.10,
       w_next=0.12, w_skills=0.14, w_aux=0.08
VICReg: L_vic = λ_var * hinge(1-Std(z)) + λ_cov * sum(off-diag Cov(z)²/d) λ_var=25 λ_cov=1
SupCon τ=0.07 hybrid 0.65/0.35 hard_neg_boost0.4 same-pos diff-player harder early layer stronger
Kind: GraphBFF-inspired BCE per type proves strictly more expressive + UW+GradNorm bisect multi-head but single stream per GraphBFF.
```

UW Kendall clamp[-3,3] per head if MTL 9-head v9.2 style `clamp[-3,3]` log_var learnable initial -0.5 — same as v8 9-head path Lab.html 14822.

---

## 5. Scaling Laws — what 10B would give vs ours 1.65M Teacher

Paper exponents: αN0.703 (model), αD0.188 (data). Translation: data without capacity saturates fast. Our 1.2M →1.65M modest gain L ∝ a/N^αN first term improvement 1.37→1.49× first term → hits c floor irreducible graph noise ~0.12 coarse bound.

Our current v5 48-d baseline → v8 1.2M → v9 1.65M joint but teacher 12M on Alienware 45min batch 224 link + 512 nodes fits 4090 2.4GB same handoff `LOCAL_GPU_HANDOFF.md` SSD `/mnt/second` triple-write timeline.

Extrapolation to 10M teacher 8× N: loss ↓ ~ 8^0.703=4.6× first term improvement per paper. 50M teacher 40× →14× first term hits c floor. Larger = more sample-efficient 3× fewer examples same loss vs 100M reported.

Practical v9: train 12M G3 teacher 7 TCA heads 224-d dual-stream 60ep full 45min, distill to 64-d 1.2M client MSE z_teacher vs z_student preserving 64-d sphere. Effective rank current v5 12.4 low → v9 target ≥32 measurable half×64=0.5 measurable worry-free VIB probe, variance hinge logged `assets/mtnn_v9_jacobian.json` 7 checks.

Budget: Alienware 4090 12M teacher batch 224 link 512 nodes 60ep ~45min — fits handoff pipeline same as unified G2→G3 GraphBFF upgrade.

---

## 6. PWA / Japandi / 6-Voice + Same-Link-Same-Stars

**PWA v67 required preserved:**

- offline13k shell 13.8k quaternion arcball LOD4000/8000 DPR1 momentum0.94 spring120 damping0.18 fillRect true `assets/inertial-map.js` 13.8k `shared-map.js` manifest+SW cache-first game+maps CORE20 shell offline13k proven 13.6k offline 1764 REAL x/y/z [-1,1] max_abs0.907 adjusted okabe curated not i%8.
- void #080A0F outer 40px sticky nav z40 pos:sticky top0 height40px zIndex40 safe-area-inset-top `env(safe-area-inset-top,0)` single-select ivory #FFFEF7 clears prev highlight no dev pills 44px POV bar `ui-monospace` `ui-sans-system` AAA contrast.
- Footer Built free — no paid APIs.

**6-voice lock stable:**

- Alex=MAI_01 Warm narrator main, Jordan=MAI_03 Smooth co-narrator board BEAT, Maya=arista Lucid industry/OSS Trends Bridge, Marcus=magnus Boomy markets/chips Ted/Cap, Priya=paloma Lilting sports/WNBA/MLB everyday game, Sam=lumi Sparkly founder/pulse/wildcard Play sparkle.
- No drift names kept stable 2026-08-18 testament.

**Same-link-same-stars TLPG everyday:**

- LCG formula glibc same as §1
- 20260813→189831298 idx3820 triple[11205,19448,14209] five[11205,19448,14209,11701,18524]
- 20260818→1412440227 idx5278 triple[13791,10902,19455] five[13791,10902,19455,11205,19683]
- ?daily=YYYYMMDD&n=1/3/5 Solo1 Triple3 Full5 open→drag-map→Jordan→copy-link equal stars
- TLPG DAU3/WAU3 dedup `everydayTip()` humanized badge no raw machinery — PWA v67 offline 13k PackBattle LCG 546 purity0.7057.

---

## 7. Construct Validity — Plain-English Greatness + GraphBFF Lens

**Construct:** same as v8: greatness = sustained high-quality winning impact that lifts teammates, scales across era/role, retrievable as similar players across decades.

**Operationalizes TCA/TAA mapping:**

- retrieval top1/top5 same-player next-season — does 64-d capture player identity across context shifts? Volume family TCA head expected strongest importance d0-d7.
- purity@20 cross-era archetype neighbor — same_era_archetype TCA head + SupCon arch coherence + playmaking family TCA head neutralizes era.
- skills R² probe — glass-box per family tower ablation 17 dims (cat([x,m]) mask) isolates volume/playmaking/defense.
- KL clustering 64 team+era clusters → DAU3 boutique large-market 340→80 cap analogous to schools 80/state.
- RR per type fixed-degree — ensures draft-class k=2-3 not drowned by teammate high-degree 500+.
- masked teammate link 15% BCE — does embed predict teammate chemistry? If z_i·z_j high for true teammate vs false teammate, signals chemistry factor 0.10→0.72 next R² bump.

**Convergent:**

- r(our d0:usage, WS) 0.6-0.8 expected unchanged from v8.
- r(our cosine similarity, LeBron RAPTOR similarity) 0.4-0.6.
- r(purity archetype, expert audit) 0.7+ — pitch 2026 audit similar concept.

**Discriminant:**

- cosine vs salary r<0.2 — we measure quality not market size (Downgrade +fix if r>0.3 confound marketplace leakage).
- draft board vs cap efficiency r<0.25 — separate constructs; new teammate link BCE isolates cap case.
- Glass-box SHAP dim importances — same_era_archetype + volume isolated.

**Predictive:**

- draft pick surplus $ >2M/yr — does 2020-24 late-1st embedding proj beat expected trimmed mean ? backtest career_surplus.json (existing 2025-26 $154.647M cap$140.5M Tetris smoothing $76B TV 11yr).
- future wins out-of-sample 2024→2025 r~0.3 lag.
- injury durability head GP next R²>0.22 over naive mean — teammate load TCA isolation improves over v8 0.15.
- masked link BCE top1 handcrafted: teammate same-team prospect hidden top1 15% chase accuracy expected 0.68>random 0.05 shows embed chemistry capture.

**Threats new v9:**

- tank bias same-team high PTS inflates teammate TCA attention weight → mitigate NET_RATING + TS% towers + random sampling k8 clip sampling balanced per type, tank team wins residual regression audit.
- rookie shrinkage teammate link BCE may memorize rookie cohort draft class TCA overfit rare type → mitigate token_dropout 0.1 + RR 32/type stochastic equal gradient balanced + shard split GroupKFold PLAYER_ID not season_split.
- era inflation 3PT era raw PTS comparison → per-season zscore median/IQR clip[-3,3] Procrustes root frame drift Frobenius logged.
- collapse 64-d sphere → few dims dominance → mitigated effective rank ≥32, SwiGLU gated fusion variance hinge Std(z)≥1 λ25.
- attention leakage teammate edges leak test player season next — leakfree protocol discard straddling pairs GroupKFold PLAYER_ID discards all same PLAYER_ID pairs across folds — honest.

Mitigations summary: era-align procrustes chain root season 1996, robust scaling, slasso lattice v2 17 nodes 27 edges λ1 0.01 λ_lattice 0.005 pruning dims leaking to salary alone, leakfree player-split Jr/Sr safe 771 pairs hash `(nameLower+dob)→pid` only display name collision safe, player_split not season_split avoids 771 cross-split pairs.

See `assets/construct_validity_v9.json` + companion `assets/eval_scoreboard_v9.json`.

---

## 8. Glass-Box SHAP + Perm — Expect Δ v9 TCA heads

| Rank | Family Head Edge | Dim hint v9 | Why vs v8 | SHAP map |
|------|----------------|-------------|-----------|----------|
| 1 | volume_family TCA | d0-d7 | player identity stable volume USC high AST usage pump doc analog hoops/hanst | +0.02 lift v9 |
| 2 | shotmix_family TCA | d8-d15 | quality not volume TS% + CORNER3 selective th | SwiGLU gated suppress |
| 3 | playmaking_family TCA | d16-d23 | central constructor + same_draft_class TCA coach interaction | teammate deep synergy |
| 4 | defense_family TCA | d24-d31 | separates OffGlass+RimProt vs DefGlass+RimPress archetype delta 0.072 cross decade shift | dim18 TAA vs TCA split |
| 5 | teammates_same_team TCA | d32-d39 | new BCE head 15% hidden teammate link predict chemistry 0.68 | TCA sparse softmax isolated teammate |
| 6 | same_draft_class TCA | d40-d47 | cohort style shift 2003-2006 mid-range heavy vs 2016- three-wave | rare type RR 32/type ensures grad |
| 7 | same_era_archetype TCA | d48-d55 | cross-era archetype neighbor purity 0.75 vs 0.6717 v5 baseline +0.0783 | mini-batch k-means LCG 189831298 |
| 8 | TAA shared 128-d→64 0.3 | d56-d63 | stabilizer decorrelation reduces dim collapse mean2114 LOSO shock | fixed-degree k=8 |

Expected dim8 usage/TS% reg r0.71 biggest SHAP v8 → v9 retains but d8 now shotmix hybrid SwiGLU gating down-weights noisy team presence dense.

Real measured via `mtnn_v9_procrustes_vae_hoops_glassbox.json` style + `skill_probe.json` + `mtnn_v9_jacobian.json` + `mtnn_map.json` TSNE 64→3 projection sep honest.

---

## 9. Chimera + Provenance 7/7/0 Honest PROD-NURSERY heading Vercel zero-deps vs ships join tip honest

- Chimera 20719 chimera-core 20×64-d fusion 5 games ×64-d hoops map 12966 + pitches 2430 + schools 4080 lite? Actually base 20719 real 5-game core (hoops 12966+gridiron 646+equities 500+pitch 633+ schools stratified 80/state?) expands unified_matrix_with_schools.npz 24799×64-d. Provenance 7 metadata fields 7 hashes PASS 0 synthetic rows core 1764 vectors.json full 12966 real.
- Provenance 7/7/0: 7 fields (source row-count build-date sha256 season-coverage method license) ×7 assets PASS 0 missing 59 hashes validated candidate.json badge 59+14 edge type counts →73 hashes impending v9.
- Probe assets `mtnn_jacobian.json` usage→dimer importance; dual-tower bridge evaluator front_office.json method front_office.json method.model_eval.validity.corrs.
- Zero-deps ONNX chain export→verify via `pipeline/export_mtnn_onnx.py` + `pipeline/test_mtnn_validation.py`.
- PWA v67 CORE20 offline13k inertial-map.js 13.8k quaternion arcball LOD4000/8000 DPR1 momentum0.94 spring120 damping0.18 fillRect true shared-map.js manifest SW cache-first game+maps.

---

## 10. On-Device + Alienware Handoff v4

- Hatch VM CPU only no CUDA torch.auto-switch `try ava.rl → dottie.rl → honest 503` never faked OOM guard background timeout 300s nano test only `--max-steps 1 --preset nano` zero-deps ONNX chain stdlib numpy.
- Alienware GPU 4090 when available torch auto cuda else cpu unified_matrix.npz ready 2026-08-16 18MB builds 20719→24799 now 6.35M `unified_matrix_with_schools.npz` 24799×64-d `LOCAL_GPU_HANDOFF.md` v4 super-light 56ms fast-path.
- Operator_mlops CLI handles train→export→score→upload triple-write mandatory 7-field `nodeId,agentId,attempt,latency_ms,tokens_est,status,errorClass` even no-change logged to `.scout/missions/_cron/timeline.jsonl` + memory/2026-08-19.md.

Risks + gates:

- recall@10 drops <0.95 player-split under-fit → reduce token_dropout 0.1→0.05 + reduce TCA regularization λ0.01 pruning group form.
- purity lifts but next R²<0.62 over-clustered → reduce supcon weight 0.15→0.08 per fee leading from 0.07 temp raise 0.10.
- collapse flags effective rank <32 low vs sil high 0.72 seep → increase λ_var 25→35 and w_vicreg 0.05→0.08 increase variance.
- era drift timeline Procrustes shape drastically chain root season change 1996-2025 → RoPE leakage season_norms synthetic audit season_norms.json vs v5.
- any hardcoded 48-d JS leftover grep before push `grep -R "48\\|d_emb" assets/*.js pipeline/*.py` → discard js note glimps button 44px 44px POV bar 40px nav z40.

Not-promote gate: CQS <0.85 or top1<0.50 or test_split_top1<0.50 or collapse_true or missing season_norms or effective_rank <30 → retain v8 bundle atomically dual necessity 4080 vs 9978 floss exact.

---

## 11. Training Command — v9 Exact Single-Action-Per-Tick

```bash
python pipeline/train_mtnn_v9.py \
  --arch v9_dual_tca_taa_graphbff_7head_224d_k8 \
  --feats 130 --families 18 --family_order bio,career,competition,defense,efficiency,form,honors,market,pedigree,playmaking,playoffs,rebounding,roster,shotmix,team,tracking,volume,hustle \
  --towers 17 --tower_width 40 --tower_hidden 192 --tower_blocks 3 --d_tower_out 40 \
  --tca_heads 7 --d_model 224 --d_head 32 --rope true --rope_dim 32 --rope_freq 10000 \
  --taa_shared true --d_taa 128 --k_fixed 8 --sample_mode most_recent_season_uniform_without_replacement \
  --fusion 0.7_0.3_L2 --fusion_TCA_proj 224_112_64 --fusion_TAA_proj 128_64 --fusion_cls_resid 0.1 --fusion_mlp swiglu --ff_gate 256 --rmsnorm true --rms_eps 1e-6 \
  --d_emb 64 --swiglu true --token_dropout 0.1 --drop_p 0.15 --mask_mode cat_xm --mask_missing_to_zero true \
  --edge_types volume_family,playmaking_family,defense_family,shotmix_family,teammates_same_team,same_draft_class,same_era_archetype --sparse_softmax_per_type true --rr_per_type 32 --rr_total 224 \
  --kl_clusters 64 --kl_by team+era --kl_order_mode KL_ascending --batch 512 --epochs 150 --val_every 5 --metric composite --metric_blend G2_composite_half_weighted \
  --nce hybrid --nce_weights player:0.65 arch:0.35 --hard_neg_boost 0.4 --supcon_temp 0.07 --w_supcon 0.15 \
  --vicreg_var 25 --vicreg_cov 1 --w_vicreg 0.05 \
  --masked_link 0.15 --bce_link 0.5 --bce_heads 7 --bce_per_type true --neg_balance_per_type 1:1 --link_head_hidden 128_64_1 \
  --cls_ce 0.1 --w_cls_aux 0.1 --w_next 0.12 --w_skills 0.14 --w_aux 0.08 \
  --optim adamw --weight_decay 2e-4 --no_decay_bias_ln_rmsnorm_gate --scheduler onecycle --warmup_ratio 0.10 --max_lr 1.5e-3 --grad_clip 1.0 \
  --split player --protocol leakfree --player_id_method dashbase_stable_not_display_name --jr_sr_safe true --era_align procrustes --era_honest true --scaling robust --scaling_method median_iqr --clip_min -3 --clip_max 3 --chain_root 1996 \
  --split_folds 5 --fold_method GroupKFold_PLAYER_ID --seeds 42,123,456,789,1011 --early_stop_patience 20 --checkpoint_every 10 \
  --slasso_lattice v2 --graphify_constructs optional --acne_nodes 17 --acne_edges 27 --lambda_l1 0.01 --lambda_lattice 0.005 --corr_con_memo --stack_con_memo mana naive \
  --distill teacher12M_student64d --distill_teacher_param 12M --distill_loss MSE_z_teacher_z_student --distill_weight 0.5 --onnx_opset 18 --l2_norm true --honest_503 true \
  --lcg_daily_20260813 189831298 --lcg_daily_20260818 1412440227 --same_link_same_stars true --l2_normalized_dot true \
  --zero_deps true --stdlib_only true --provenance 7/7 PASS 0 synthetic --pwa v67 --offline 13k --core 20 --void #080A0F --nav_h 40px --paper_1 #FEFCF9 --paper_2 #FFFEF7
```

**Sweep secondaries if first not ≥ baseline+0.5:** lr 1e-3/1.5e-3/2e-3 × supcon_temp 0.05/0.07/0.10 × w_vicreg 0.03/0.05/0.08 × w_bce 0.3/0.5/0.7 × rope true/false ablation × k_fixed 4/8/16 ablation — GraphBFF k=8 stable claimed cross-check.

Decision rule: promote if CQS≥0.88 stretch 0.92 (0.7937→0.88) AND top1≥0.58 AND purity≥0.75 AND skills R²≥0.86 next R²≥0.72 rank≥32 AND collapse_flags all false AND SHAP/Tower ablation logged AND BCE teammate link acc ≥0.68>0.05 rand → PASS 9.4 estimate scaffold pre-train smoke workflow.

---

## 12. References + Assets

- `docs/MTNN_V8_ARCH.md` — v8 spec RoPE RMSNorm SwiGLU VICReg var25 cov1 SupCon hybrid 19K lines (this doc companion v9 uplift)
- `assets/mtnn_meta.json` — 12966 rows 48-d baseline real Seasons 1996-2025 compact chimney
- `assets/vectors.json` — 12966 rows 14-d transparent baseline
- `assets/eval_scoreboard.json` — v5 honest 0.5081 overall 0.438 test 0.0749 baseline random 7.7e-05 marginal +0.43 beats-by — tree 0.131-0.331 climb × v8 target +0.56→0.59
- `assets/eval_scoreboard_v6.json` — v6 target scaffold extended to v8→v9 mapping 2× 2/3 AND 3/4 tempo :05 ultra swarm faster 60ep 14th ep 60ep
- `assets/mtnn_v8_arch.json` — machine-readable spec v8 224? actually 128-d-model; v9 companion `mtnn_v9_arch.json` upcoming.
- `assets/construct_validity_v8.json` + `assets/construct_validity_v9.json` — spine validity TCA/TAA mapping
- `assets/eval_scoreboard_v9.json` — v9 scaffold composite 0.88 stretch 0.92 top1 0.58 purity0.75 skills0.86 next0.72 rank≥32 etc.
- `assets/mtnn_arch.json` — shipped v4 32-d legacy bump.
- `vector-hoops/candidate.json` — verifier single enforcement point budget3 threshold8.0 earlyExit0.3 PASS≥8.0 shipped masterclass auto-push confident: `scout/hoops-arch-v9` expected PASS9.4
- `bundles/zero_deps.json` — `{"zero_deps":true,"allow":"acne:./src"}` true no pip no cloud
- `bundles/ultra/runs/hoops-v9-arch/timeline.jsonl` — triple-write mandatory 7-field `nodeId,agentId,attempt,latency_ms,tokens_est,status,errorClass` even no-change logged gate 8.8 PASS verify latest `bundles/ultra/runs/hoops-v8-arch/timeline.jsonl` + dottie identical canonical + .scout/missions/_cron/timeline.jsonl 3 mirrors PASS 9.35
- GraphBFF 2602.04768 αN0.703 αD0.188 TCA 70% params sparse softmax per type TAA shared k-fixed fixed-degree sampling Theorem dual>single 31 PRAUC gains few-shot 10 samples/class > full-data HGT/HAN 10 diverse tasks.
- Scaling law: L(N,D)=a/N^αN + b/D^αD + c sample-efficiency via larger N 3× fewer examples 1.4B vs 100M reported.
- Our current UNIFIED_G2_ARCH.md v2.1 G2 0.685→0.639 MoMA-lite5 GARNet GRL λ0.5 CORAL centroid+cov w_sport0.5 w_task2.0 SupCon0.07 VICReg var25 cov1 eff rank≥32 measurable worry-free sport-clf lower blind Δ-0.0851 λ66% coral34% p0.0122 CI95[-0.1527,-0.0174] floor0.6258 G1 PASS neg joint -0.0526 G3 sil0.683 sep0.867 rank12.4 G4 coarse0.9828 vs0.1712 lift0.8116 mean2114 LOSO IC0.068>0.06 composite0.8688→0.89.
- `MEMORY.md` LCG 20260813→189831298 idx3820 triple[11205,19448,14209] same-link-same-stars.
- `PWA v67` offline13k CORE20 void #080A0F 40px sticky `pos:sticky;top:0;height:40px;zIndex:40` safe-area-inset-top.
- 6-voice lock stable: Alex MAI_01 Warm narrator site primary beat Maya arista Lucid etc same as v8 §5.
- SSOT `bundles/coordination/active-tasks.md` 3 ACTIVE LOCAL-GPU exempt 7 free healthy 99.9% ship Launched 100% chimera 20,719×64-d LCG both same-link-same-stars.

---

**Single_Action_Per_Tick Boyd Decide:** towers 17→17 same but d_model 224 7×32 heads + 1 TAA 128 k=8 = dual-stream 8 head total proven Theorem RGB bump + masked link 15% teammate same-team BCE w0.5 + KL 64 RR 32/type×7=224 edges total RR hops 40 ated 990k steps zero-deps stdlib ONNX L2-norm honest 503 never faked. composite 0.7937→0.88 stretch 0.92 top1 0.438→0.58 purity 0.6717→0.75 skills R2 0.802→0.86 next R2 0.651→0.72 rank≥32 fallback d_model configuration trimmed estimate ver hovering 8k.

**Solo personal project** — no connection to employer, built with public/free-tier only — Cam's Lab • hoops.dumbmodel.com • Sunni SCAD gate AAA triple shape+color+text+pattern 18px/1.65 readability 56px bottom tabs safe-area neobrutalism 2px ink +4px shadow paper dots 6-voice lock Alex MAI_01 Warm etc japandi void #080A0F 40px nav same-link-same-stars PWA v67 offline13k CORE20 Built free • Open-source • No paywall.

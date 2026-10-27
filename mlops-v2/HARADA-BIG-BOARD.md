# HARADA BIG BOARD — MTNN World-Class Interpretability + MLOps v2

**Goal:** a world-class, causally honest embedding system for Vector Hoops — twins you can explain, steer, and trust — shipped as games and insights, never on vibes.
**Started:** Mon 2026-10-26, voice call. **Champion pinned:** MTNN v5 (`mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256`, 12,966×64, built 2026-07-25). **Train gate: CLOSED** until the user opens it.
**How to read this board (his form):** Self-running = moving without him. Watchlist = risks being watched, no action needed. Waiting-on-you = needs his word.

## Objectives → Tasks

### O1 — Scored audit of the live v5 (APPROVED on the call)
- [x] Audit design: leakage test (market/honors/team towers), SVD spectrum / effective rank, time + player-disjoint splits, tower ablations, prefix probes at 8/16/32/64, SAE sparse features, drift on new seasons
- [ ] Leakage test run against live v5
- [ ] SVD spectrum / effective rank computed
- [ ] Time-split + player-disjoint split results
- [ ] Tower ablation results
- [ ] Audit scorecard published (audits inform training; they are not training)

### O2 — MLOps v2 pipeline, drafted by 6 specialists (coordinator running)
- [x] Interfaces fixed first: `~/workspace/mlops-v2-drafts/CONTRACT.md`
- [ ] Lane 1 — Raw data collection (sources, provenance, rights fit)
- [ ] Lane 2 — Cleaning + curation (masking, thresholds, person_id identity)
- [ ] Lane 3 — Splits + data prep (expanding-window folds, purge gap, new-player slice)
- [ ] Lane 4 — Training script v2 (SupCon + Matryoshka {8,16,32,64}, tower dropout, multi-seed)
- [ ] Lane 5 — Evaluation + interpretation (degradation curve, mask-ablation era test, SAE features)
- [ ] Lane 6 — Integration (games + insights, recalibration checklist, drift monitor, rollback)
- [ ] Coordinator synthesis into branch `scout/mlops-v2-draft` (worktree `~/workspace/vector-hoops-mlops-v2`)

### O3 — Prototype COMPETITION (user's word: both, head-to-head, he judges)
- [ ] Builder A — Steerable Twin Explorer (slider → live twin list, v0 on v5 tower/skill directions; SAE steering is v1 note only)
- [ ] Builder B — Attribution Graph, Curry 2016-17 → Ginobili 2009-10 (tower-by-tower causal trace)
- [ ] Head-to-head comparison page, same rubric, verdict left blank for him
- [ ] **Winner picked by him** — coordinator does not crown one

### O4 — Integration into Vector Hoops (after the prototype winner)
- [ ] One model, three widths: 64-d Atlas/Twenty Questions, 16-d Daily Court/tooltips, 8-d thumbnails
- [ ] Tower attribution → Twin Explainer plain-words; SAE features → Insight cards
- [ ] Game recalibration: twin bands, Daily Court thresholds, era twins re-derived on any new space

### O5 — Training (GATED — nothing here runs without his separate word)
- [ ] Blocker resolved: real 120-feature matrix committed (see Watchlist — the 11-feature proxy must never be silently expanded)
- [ ] His training authorization
- [ ] One CPU run per fixed spec, then full eval + promotion decision (beat champion on ALL primary metrics on val AND frozen test, else research-only)

## Self-running (no action from him)
- Coordinator + 6 lanes drafting (worktree exists, CONTRACT.md exists)
- 2 competing prototype builders, told explicitly they are competing
- PR #193 live (chunky mini-figure players, verified 2026-10-26); PR #194 open (self-twin fix)

## Watchlist (being watched, no action needed)
- Q1 CORRECTED 2026-10-26 (user right, spec stale): the matrix file is absent, but the builder + full source cache ARE on this VM (pipeline/build_vectors.py + pipeline/cache/ ~105MB, 445 files, 30 seasons) — offline rebuild verification is now Lane 1's job, not a Nugatron hunt
- Shot-position data: NOT collectable from this VM today — see 2026-10-11 shot-source verdict (stats API stalls, CDN 403s here); ShotChartDetail collection is an Alienware/Mac-lane job, and the overhaul must design for that split
- Mask-as-era-signal: tracking masked pre-2013, form pre-2015 — the mask itself can leak era
- Game recalibration risk: a new embedding moves every twin band and puzzle threshold
- SAE failure modes: feature splitting, absorption, composition — every feature needs a causal test, not just a name

## Waiting-on-you (needs his word)
1. **Training authorization** — gate closed; drafts only until he opens it
2. **PR #194 merge word** — self-twin fix, open since 2026-10-26
3. **Prototype winner** — after the head-to-head comparison lands
4. **Spec amendment approval** — expanding-window folds + purge gap + new-player slice into the v6 spec

*Updated 2026-10-26 ~22:16 CDT. This board is the live record; checkboxes flip only on verified evidence, never on a promise.*

### O6 — Data pipeline overhaul, built from scratch and done right (user-authorized 2026-10-26)
- [ ] Full inventory of NBA data on this VM (cache, vectors, embeddings, proxies flagged as proxies)
- [ ] Rebuilt pipeline design: raw source → versioned cache → validation gates → era-normalized build → 14-d game vector + wide training matrix, one pipeline, no proxies
- [ ] Offline rebuild verification in a scratch worktree (shape + feature order vs manifest)
- [ ] Shot-position tower: ShotChartDetail zones/distances/x-y as a NEW tower family with honest era masks — collection lane is Alienware/Mac (this VM's NBA network stalls/403s per 2026-10-11 verdict), NOT Hatch
- [ ] Rule kept: Pixel Replay/Live sprite positions are animation, NOT measurement — they never enter training data

### O7 — Phase 2 unified loss (APPROVED 2026-10-26, design only)
- [ ] Unified-loss design: shared tower stem, Matryoshka SupCon head + JEPA predictor head whose target IS the contrastive embedding of the true next season
- [ ] Bridge + predictive positives; uncertainty weighting + PCGrad on gradient conflict; gradient-cosine interference monitor
- [ ] Matryoshka prefixes as H-JEPA levels (coarse = invariant twin structure, full = equivariant dynamics)
- [ ] Pareto rule: no regression on either Phase 1 head vs separate baselines + win on "future twins" (predict next season, retrieve its twins)
- [ ] JEPA head timescales defined explicitly (season-timescale future-twins prediction AND game-timescale next-play prediction — one head with conditioning or two modes, stated not assumed)
- [ ] Research anchors citation-checked against the JEPA skill references (UniJEPA, DreamerV3/MuDreamer, uncertainty weighting, GradNorm, PCGrad, MGDA/Pareto) — unverified claims labeled UNVERIFIED, never asserted
- [ ] Phase 2 is DESIGN ONLY — training still gated (see O5)

- WIDTH DECISION OPEN (user unsure, 2026-10-26 22:27 CDT — NOT pinned): 73 = verified base matrix (offline rebuild, exit 0); 143 = unverified full-context contract target (gamelog-blocked); 120 matches no built artifact; 130 = champion arch dIn, unreconciled to feature counts. No pin until full-context evidence or his call; design work proceeds on the 73-base while the 143 chain is investigated. Training is gated regardless, so leaving this open costs nothing tonight.

- DATA GATHERING DIRECTIVE (user, 2026-10-26 22:29 CDT): game logs MUST + PBP logs (text + stats); shot coordinates in later seasons are the key prize; scope sent to coordinator (submitted, application unconfirmed); first deliverable = inventory + gap report; collection routed via Alienware/Mac, never synthesized
- TEXT EMBEDDING DESIGN (user proposal, 2026-10-26 22:30 CDT): embed all text → truncated SVD is the BASELINE; Stage 1 = EmbeddingGemma Matryoshka, Stage 2 = task-aligned projection, text as one tower with ablation; design doc assigned (lanes/01 TEXT_EMBEDDING_DESIGN.md + 04 tower spec)

- OBJECTIVE REFRAME (user correction, 2026-10-26 22:32 CDT): PRIMARY = predict players' future overall stats (next-season 14-d forecast). Twins = product surface + secondary validation only. JEPA predictor = primary head; contrastive = auxiliary. Text judged by forecast lift. Unified loss prediction-first. Future-twins = diagnostic. Correction sent to coordinator (submitted, unconfirmed).

### O8 — Gather all data (user-authorized 2026-10-26 22:29 CDT, DESIGN + COLLECTION PLAN ONLY)
- [ ] Inventory + per-season gap report FIRST (game logs, shot coordinates, PBP) before any bulk fetch — starting point measured: 5 cdn_pbp games, 6 replay entries, 0 gamelog files, 0 LOC_X hits in cache
- [ ] Machine-aware collection plan: stats-API/CDN fetches via Alienware/Mac (Hatch stalls/403s per 2026-10-11 verdict); never synthesize or proxy-fill
- [ ] Versioned cache + fail-loud validation gates (overhaul-lane pattern); 143-column chain stays blocked until this lands; 73-column base is fallback, not destination

### O9 — Text embedding tower (user proposal 2026-10-26 22:30 CDT, DESIGN ONLY)
- [ ] TEXT_EMBEDDING_DESIGN.md: SVD as baseline to beat (not final answer); template dedup first; EmbeddingGemma-300M Stage 1 (768-d vs 128-d hit@10 0.0739 vs 0.0732); Stage 2 task-aligned reduction
- [ ] Text as one tower among 17, on/off ablation under expanding-window CV; judged by FORECAST LIFT vs stats-only baseline (22:32 correction — twin agreement/future twins are diagnostics only)
- [ ] Leakage guards: season-boundary masking + name-masked ablation (style, not identity)
- [ ] Standing MLOps panel review (Howard / Ilya / Karpathy) BEFORE synthesis — dissent kept, not averaged

### CORRECTION (user word 2026-10-26 22:32 CDT — APPLIED to all new scope work)
- [x] PRIMARY objective = next-season 14-d stat prediction (MAE/R², expanding-window CV + new-player slice); twins = product surface + secondary validation; JEPA predictor head primary, contrastive head auxiliary; unified loss prediction-first; future-twins = diagnostic
- [ ] Follow-up design pass still needed: prediction-first rebalance amendment to the delivered Lane 9 Phase 2 design (not silently rewritten)

### HOLD — Full program rethink through the prediction-first lens (user GOVERNANCE RULING 2026-10-26 22:33 CDT — rethink is NOT the orchestrator's call; 12-seat panel first, brief at PANEL_BRIEF.md)
- [ ] Panel synthesis lands AND user rules — ONLY THEN may the board, contract headlines, eval protocol, or prototype briefs be rewritten to the prediction-first framing
- [ ] Until then: NO reframe rewrites by this coordinator. Lane drafting, data-gathering inventory + gap report, and offline-rebuild verification continue unchanged. Scope B text design proceeds with forecast-lift gating labeled "user-directed, pending panel ratification" + twin diagnostics kept fully specified
- [ ] The 22:32 correction task and 22:33 rethink brief are PANEL INPUT, not rewrite instructions — recorded in CONTRACT §10–§11, not applied to delivered lanes
- Per-lane rethink as briefed: O1 audit → forecast audit (vs carry-forward / age-curve / stats-MLP baselines); O3 splits → program backbone; O4 training primary head = next-season 14-d forecast; O5 eval headline = per-stat MAE/R²; O6 context columns judged by forecast lift; competition reframed (A = steerable future explorer, B = forecast attribution, user still picks); promotion gate replaced (beat carry-forward + stats baselines on held-out folds; twin quality = floor constraint)
- Proposed defaults flagged for HIS confirmation (not adopted): 1-season horizon primary; all-14 stats equal weight with scoring highlighted
- Twin work preserved as product surface + secondary validation, NOT deleted
- This rethink is RECORDED here only. It does not rewrite the delivered lanes, the comparison page, or the gate until an explicit rethink task arrives — applying it on memory alone would pre-empt the brief.

- PANEL CONVENED (user, 2026-10-26 22:33 CDT): 12-seat review of prediction-first reframe. Brief: PANEL_BRIEF.md. Synthesis pending → PANEL_REVIEW.md. REFRAME ON HOLD until panel + user's ruling. Lane drafting + data inventory continue.

- VISION (user, 2026-10-26 22:35 CDT): H-JEPA world models are "the main thing" — predict future stats + player locations; bring the NBA to life with neural networks on Vector Hoops. Panel addendum sent; coordinator noted; rewrite HOLD stands.

### VISION NOTE (user 2026-10-26 22:35 CDT — FOR THE RECORD + LANE 8 DRAFTING, NOT a rewrite order; HOLD still stands)
- [ ] H-JEPA addendum drafting (Lane 8 follow-up): two prediction surfaces, one hierarchy — COARSE → future season stats; FINE → in-game player locations from real tracking/shot/PBP data
- [ ] Render direction explicit: predicted locations render THROUGH Pixel sprites; sprite positions NEVER train the model
- [ ] H-JEPA centrality is a USER VISION UNDER PANEL REVIEW (brief addendum sent to the 12-seat panel) — NOT ratified architecture; any reframe rewrite still awaits panel synthesis + user ruling

- SWARM (user, 2026-10-26 22:37 CDT): brief §9 updated (living basketball mind + stories past/present); panel to recommend MODEL PORTFOLIO + INTEGRATION, then specs, then execute end to end. Swarm = coordinator lanes + panel, full-pace async overnight. Spec finalization waits for panel synthesis. HARD GATES INTACT: no training, no merges, no prod writes without his separate word.

- PANEL ROUND 1 DONE (2026-10-26 22:37 CDT): PANEL_REVIEW.md — H-JEPA central target, not first build; fine level = event-location (trajectories BLOCKED); ladder + rung-1 next-shot demo with kill rule. ROUND 2 RUNNING: Addendum III = model portfolio + integration + story surfaces (§9 charge that missed Round 1). Swarm live. Gates intact.

- MOONSHOT (user, 2026-10-26 22:40 CDT): joint contrastive+JEPA model = the moonshot; panel Round 2 to deliver MOONSHOT VERDICT (go/no-go, proof capability, kill criteria, Muon adopt/ablate/skip); build track full-pace in parallel. Muon confirmed (Jordan et al. 2024); LLM-scale evidence only — ablation required. Deep research on latest arXiv trends RUNNING (findings pending). Gates intact: no training/merges/prod without his word.

### O10 — Moonshot build track (user 2026-10-26 22:40 CDT "let's build it" — FULL PACE up to the gates, NOT through them)
- [ ] Joint model code drafted (shared stem, SupCon head, JEPA heads Mode S + Mode G, bridge, loss, Muon-vs-AdamW ablation DESIGN — not adoption)
- [ ] Forecast eval harness drafted (expanding-window folds, carry-forward + age-curve + stats-MLP baselines, new-player slice, rung-1 next-shot demo spec, twin quality as floor constraint)
- [ ] Reframed prototypes drafted as NEW pair (future explorer + forecast attribution; existing twin competition untouched, user picks in both, coordinator crowns no one)
- [ ] Spec skeletons drafted — spec FINALIZATION waits for panel synthesis (panel verdict feeds finalization)
- [ ] HARD GATES (each needs his separate word): NO training runs, NO merges, NO production writes — "execute end to end" does NOT authorize training

- DATA DEEP DIVE SWARM (user, 2026-10-26 22:45 CDT): coordinator + 11 investigators on collection (see MEMORY). Synthesis pending → data-deep-dive/DATA_COLLECTION_DEEP_DIVE.md. Read-only + tiny probes; no bulk fetch; gates intact.

- PANEL III-C DONE (2026-10-26 22:46 CDT): conditional-go STANDS, sharper — bridge = experimental arm; hierarchy level-by-level; Muon ablate vs AdamW+EMA; rank-collapse kill trigger; per-horizon location metrics. Deep-dive swarm still running.

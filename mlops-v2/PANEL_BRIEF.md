# Panel Brief — Vector Hoops MTNN rebuild, prediction-first rethink

**To:** the review panel (12 seats, see §8). **From:** Scout (orchestrator), on the user's word, 2026-10-26.
**Status of this brief:** a faithful record of what we have done, what we are trying to do, and what is
PROPOSED vs DECIDED. Nothing in it is training authorization. Training, merges, and production writes all
still require the user's separate word. Panel reviews are modelled expert perspectives (channelled lenses,
in the standing-panel pattern) — not messages from the real people named.

## 1. What exists today (verified, not aspirational)

- **Vector Hoops** (hoops.dumbmodel.com) serves a 64-d player-season embedding from the MTNN v5 champion
  (`mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256`, built 2026-07-25): 17 tower families, each 160→32,
  concat 544 → 128 → 64-d L2 embedding. 12,966 player-seasons, 30 seasons (1996-97…2025-26), 2,426 players.
- The champion already carries heads including **nNextProfile=14**: next-season prediction is the native
  task lineage, not a new invention. The 14-d game vector (PTS, AST, OREB, DREB, STL, BLK, TOV, FG3A, FGA,
  FTA, FG3_PCT, FG_PCT, FT_PCT, PLUS_MINUS, z-scored within season) is the live product's stat language.
- Product surfaces on the twin space today: Embedding Atlas, Daily Court, Twin Explainer, Twenty Questions.
  These keep running on the v5 space. **Hoops gold is preserved exactly** — nothing here replaces live
  serving without a held-out win and the user's word.
- The old v6 contrastive spec (2026-10-10) made the twin space the headline and its promotion gate twin
  metrics. That framing is now under review (see §4) — the panel is asked to judge the reframe, not to
  assume it.

## 2. Data: what is verified, what is missing

- **Verified base (2026-10-26, offline rebuild, exit 0, live files hash-identical before/after):**
  12,966 × 73 matrix from the tracked cache (788 files, ~105MB, 30 seasons: stats.nba.com Base/Advanced/
  Scoring, bio, tracking 2013-14+, salaries, honors, playoffs, Basketball-Reference, wide_skills).
  73 = game 14 + advanced 14 + scoring 13 + bio 5 + tracking/playmaking 19 + hustle 6 + market 1.
- **Width confusion, stated plainly:** 120 (old spec) matches NO built artifact. 130 is the champion arch
  file's input dim, unreconciled to a feature count. 143 is the HEAD contract manifest (full-context
  target) — real in the manifest, UNVERIFIED as a build. The 70 missing columns are context merges
  (form, roster, career, competition, team, system, pedigree, playoffs, honors, injury).
- **The gap (user directive 2026-10-26 22:29, "game logs are a must"):** gamelog-derived context files do
  not exist on this VM, so the 143 chain is blocked. Later-season game logs carry actual shot
  coordinates — the key prize for a shot-position tower. Play-by-play logs are wanted for both events
  AND text. Existing PBP assets are thin (a handful of cached games, 6 replay files) vs 30 seasons.
- **Collection constraint:** this Hatch VM cannot fetch stats.nba.com ShotChartDetail (stalls, zero bytes)
  or cdn.nba.com (instant 403) — 2026-10-11 shot-source verdict. Collection must route via the Alienware
  box or the user's Mac, or alternate real sources. **Never synthesize or proxy-fill.** Current "shotmix"
  features are shot TYPE mix only (2PT/3PT/FT shares, assisted/unassisted) — zero floor location.
- **Sprite rule (hard line):** Pixel Replay/Live sprite positions are procedural animation and must NEVER
  enter training data. Real measured positions only (shot coordinates, tracking aggregates).

## 3. Evaluation design (already agreed, prediction-native)

- **Expanding-window CV:** Fold 1 train ≤2021 / val 2022-23; Fold 2 train ≤2023 / val 2024-25; frozen final
  test 2025-26 (491 rows, never tuned on); purge/embargo gap so adjacent-season positives never cross a
  fold boundary; new-player-only evaluation slice (~83 new players per recent season).
- **Refit rule:** after CV picks the config, refit on everything ≤2024; a refit-on-all-data model makes NO
  honest claim on seasons it trained on.

## 4. The reframe under review (PROPOSED by the user, NOT yet ratified — this is the panel's question)

The user corrected the program on 2026-10-26 22:32: the team was over-indexing on twins. His words:
"we just want to be predicting players' overall stats in the future." The twin was "a nice aspect."
The proposed reframe:
- **PRIMARY objective:** predict players' future overall stats (next-season 14-d game vector).
- **Twins demoted** to product surface + secondary validation. Twin quality becomes a floor constraint.
- **JEPA predictor head becomes primary; contrastive twin head becomes auxiliary** (regularizer + product).
- **Text tower judged by forecast lift** vs a stats-only baseline, not twin retention.
- **Promotion gate replaced:** beat carry-forward (last season = next season) and stats-only baselines on
  held-out folds, instead of beating the champion on twin metrics.
- **Phase 2 unified loss rebalanced prediction-first** (shared 17-tower stem; Matryoshka SupCon head +
  JEPA predictor head whose target IS the contrastive embedding of the true next season, stop-grad;
  predictive positives; uncertainty weighting + PCGrad on gradient conflict; Matryoshka prefixes as
  H-JEPA levels). Phase 1 separate baselines remain the ablation controls. Phase 2 is DESIGN ONLY.
- **Prototype competition reframed (proposed):** A = steerable FUTURE explorer (steer latent → predicted
  future stat line); B = forecast attribution (why is this player's predicted line what it is). Same
  rubric (causal proof, clarity in 30s, honesty, playability). The USER picks the winner; no one crowns one.

## 5. Text embedding: the proposal the panel should stress-test

- User proposal: convert all text to embeddings, then truncated SVD to a manageable size.
- Orchestrator's staged counter-proposal (panel: attack it): (a) template deduplication first — PBP text
  is highly templated, embed unique templates once; (b) Stage 1: EmbeddingGemma-300M (local, CPU,
  Matryoshka 768→128; measured HERE: 128-d retains ~99% of 768-d twin agreement, 0.0732 vs 0.0739 hit@10
  — but note: generic text embeddings recover stat twins at only ~0.074 vs a 0.4 bar, so the text space
  barely overlaps the stat space); SVD kept only as the documented baseline to beat; (c) Stage 2:
  task-aligned learned projection (contrastive text-rollup ↔ stat profile); (d) text enters as ONE tower
  among the stat towers, pooled per player-season, with an on/off ablation; (e) leakage guards:
  season-boundary masking (no future PBP text into prediction inputs) + a name-masked ablation proving
  text adds playing style, not identity. Under the prediction-first lens, all of this is judged by
  FORECAST lift, not twin retention. Prior text work in this workspace: Wikipedia-intro texts (594
  players) and an all-MiniLM-L6-v2 384-d fusion experiment — bio text, NOT play-by-play text.

## 6. Standing rules the panel must respect

Real data only, full scale, never synthetic; honest 503 over fake success. No training, merge, release,
or production promotion without the user's word. No challenger promotion without a held-out win.
One writer per checkout; drafts live in `~/workspace/mlops-v2-drafts/` (lanes 01–09 + 2 prototype lanes),
branch `scout/mlops-v2-draft`. Design system and product constraints are out of scope for this review
unless they bear on the forecast design.

## 7. What the panel is asked to decide

1. Is the prediction-first reframe RIGHT? What, if anything, is lost by demoting twins — and what
   guardrails keep the twin products honest while the forecast model earns its floor?
2. What forecast architecture would you defend: heads, loss, horizon, per-stat weighting, era handling
   (predict raw vs era-normalized-then-map-back), and the single strongest baseline set?
3. What is the text tower actually worth, and what is the cheapest experiment that proves or kills it?
4. What are the top 3 risks that would make this program fail, in order, with the falsifiable check
   for each?
5. Name the weakest link in the current plan, per seat, and the one change you would make first.

## 8. Panel seats (12)

Standing 4 (channelled lenses, per the standing MLOps panel): Jeremy Howard (pragmatist), Ilya Sutskever
(first principles / scale), Andrej Karpathy (data engine), JB Straubel (systems at scale). Plus 8
role-based seats (modelled, not named individuals): (5) contrastive / metric-learning specialist,
(6) JEPA / world-model researcher, (7) time-series forecasting lead, (8) sports-analytics modelling lead,
(9) embedding / retrieval lead, (10) causal-inference / attribution specialist, (11) eval & metrics lead,
(12) production-ML / data-platform lead. Each seat writes independently from this brief; disagreements
are kept, not averaged away. Output: per-seat verdicts + synthesis + ordered recommendations + at most
3 open questions that genuinely need the user's call.

## 9. Addendum — the vision, and the panel's expanded charge (user, 2026-10-26 22:35–22:37 CDT)

**The vision (user's words, talked through before this addendum was written):** a LIVING BASKETBALL MIND
for Vector Hoops — not just who plays like who, but a world model that can imagine next season's stats,
where a player shoots from, and how a game unfolds. The joy and the value, in the user's framing: the
pixel court coming alive; Daily Court feeling like playing against a real ghost; insights that feel like
a coach whispering what happens next. Twins were the doorway; the value is letting fans — and the user —
see the future of the game, with real data underneath and neural nets making it breathe.

**Stories past AND present (user, 2026-10-26):** the same models must also TELL STORIES. The model that
predicts the future can also read the past: narrate a player's career arc; show why a 2009 possession
feels like one today; generate a story for a classic game from what actually happened on the floor.
Sprites act stories out from the model's memory. Every story stays grounded in real data, not made up —
no synthetic events, no invented possessions, no hallucinated stat lines. Story surfaces are a first-class
integration target, alongside Atlas, Daily Court, Twin Explainer, Twenty Questions, and Pixel Replay/Live.

**H-JEPA centrality (user, 2026-10-26 22:35):** hierarchical JEPA world models are "the main thing" —
predicting future stats AND player locations, doing as much as possible with advanced models on Vector
Hoops, to "bring the NBA to life with neural networks." Two surfaces, one hierarchy: coarse levels →
future season stats; fine levels → in-game player locations (real tracking/shot/PBP data). Render
direction: predicted locations render THROUGH Pixel sprites; sprites never train the model.

**The panel's EXPANDED charge (user, 2026-10-26 22:37):** weigh in on WHICH MODELS WE SHOULD BE BUILDING
and HOW TO INTEGRATE THEM. The synthesis must now also deliver: (a) a recommended MODEL PORTFOLIO in
build order (which models, what each owns, what can be cut); (b) an INTEGRATION ARCHITECTURE — how the
models connect to each other and to the product surfaces (Atlas, Daily Court, Twenty Questions, Pixel
Replay/Live, story surfaces), including data flow, shared vs separate serving, and where the twin space
survives as a component; (c) the spec outline the build team executes against. Sequence per the user:
brief → panel weighs in → specs → execute end to end. Execution runs up to — but NOT through — the
training gate, merges, and production writes, which still require the user's separate word.

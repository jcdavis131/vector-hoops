# Research: Chimera embedding fusion + game-state loop — Vector Hoops MTNN

**Task ID:** vector-hoops-chimera-worldmodel
**Target repo:** vector-hoops
**Branch:** research/vector-hoops-chimera-worldmodel

## Summary
Extend scout-cli vector plugin via scout todos to implement Chimera embedding fusion (2403.16933v1) for archetype clustering and interactive world-model state persistence loop from 2607.14076v1. Adds CQS-verified chimera eval and daily guess integration, using recent Meta Llama 1M-context news (tech_ai_52c707a406) for long-horizon fantasy persistence.

## Graph Node IDs (verbatim from ~/workspace/personal-graphify/graph.json)
- concept:vector-hoops — Vector Hoops 12,966 seasons — degree 15 — Daily NBA chimera 12,966 player-seasons PCA 3 8 archetypes MTNN CQS 85.87
- concept:mtnn — MTNN v5_concat_b2_h160_t32_d48_mlp128 — degree 14 — Multi-Task Neural Net 120 feats 17 families cat([x·m,m]) masking 544+12→128→48 L2
- concept:scout — Scout CLI — degree 67 — Personal control plane agent-native security-first
- concept:ava — Ava AGI Factory v6.4 — degree 46 — Real-mode Jacobian 4 J-Spaces S1 Fast hl8 S2 Slow hl300 Critic hl30 Planner hl150 Router/veto local Docker CUDA
- concept:jspace — Ava J-Space Multi — degree 12 — 4 workspaces multi-space Jacobian
- concept:graphify — Personal Graphify — degree 30 — Ollama-first local graphify fork with task/impact/onboard

Graph file: ~/workspace/personal-graphify/graph.json
Graphify query: `scout graphify query "vector-hoops" --graph ~/workspace/dottie/apps/scout-cli/graphify-out-research-combined/graph.json`

## arXiv / Paper IDs (verbatim)
- 2403.16933v1 — Literal Vector Hoops MTNN chimera paper
- 2607.14076v1 — Interactive world-model state persistence loop (2026-07-16)
- tech_ai_52c707a406 — Meta Llama Spark 1.1 1M-context news (2026-07-09 published, seen 2026-07-17, 2026-07-23), Source: https://www.gadgets360.com/ai/news/meta-unveils-muse-spark-1-1-ai-model-1-million-token-context-window-2026-07-09/
  Evidence file: ~/workspace/your_files/news-briefs/headlines/_by_headline/tech_ai_52c707a406.md
  Daily link: ~/workspace/your_files/news-briefs/headlines/tech_ai/2026-07-23.md

## Links to Graphify nodes
- Link to Graphify: file ~/workspace/personal-graphify/graph.json nodes concept:vector-hoops, concept:mtnn, concept:scout, concept:ava, concept:jspace, concept:graphify
- Scout-cli vector plugin: ~/workspace/dottie/apps/scout-cli/bigbang/plugins/vector/
- TODO marker: ~/workspace/dottie/apps/scout-cli/bigbang/plugins/vector/research_todo_vector-hoops-chimera-worldmodel.py

## Rationale (verbatim from task)
Ranked by recency (2607.14076v1 2026-07-16 + tech_ai_52c707a406 2026-07-23), centrality (scout 67, ava 46, graphify 30, vector-hoops 15, mtnn 14), vector overlap (2403.16933v1 is literal Vector Hoops MTNN chimera paper), and actionable scout-cli plugin change with verifiable tests.

## Implementation Plan
1. **Chimera embedding fusion (2403.16933v1)**
   - Load MTNN embeddings: ~/workspace/vector-hoops/assets/mtnn_embeddings.f32
   - Fuse with archetype clustering (vectors.json, archetype_assignments.json)
   - Add scout vector hoops --chimera-fusion flag
   - CQS verification: pipeline/mtnn_validation.py

2. **Game-state persistence loop (2607.14076v1)**
   - Implement world-model state loop with 1M context (tech_ai_52c707a406)
   - Daily guess integration: play.html + game.js
   - Persistence via Ava J-Space: concept:jspace, concept:ava
   - Long-horizon fantasy: track user guesses across sessions

3. **Scout CLI wiring**
   - Extend bigbang/plugins/vector/cli.py with --chimera and --worldmodel flags
   - TODO entry via scout todos (already created)
   - Google Tasks backing (concept:scout)

## Acceptance Criteria
- [ ] scout vector hoops --chimera-fusion runs (2403.16933v1)
- [ ] scout vector hoops --worldmodel-loop runs (2607.14076v1)
- [ ] tests/test_chimera_worldmodel.py passes with CQS >= 85.87 baseline
- [ ] docs/research/vector-hoops-chimera-worldmodel.md contains all 6 graph node IDs verbatim
- [ ] PR body includes 3 paper IDs verbatim
- [ ] Graphify link verified
- [ ] scout doctor passes

## Evidence of source (real data, no synthesis)
- graph.json degrees: scout 67, ava 46, graphify 30, vector-hoops 15, mtnn 14, jspace 12
- headline file tech_ai_52c707a406.md exists and contains Meta Llama 1M token context
- scout-cli repo exists: ~/workspace/dottie/apps/scout-cli
- vector-hoops repo: ~/workspace/vector-hoops

# Atlas Graph Model — Integrated Spec
Date: 2026-10-19. Panel verdict (Toronto school: Hinton, Ba, Duvenaud,
Urtasun, Grosse) integrated. Governing decision: three-layer stack —
the graph is the substrate, the store is the truth, the CLM is the interface.

## 1. Architecture

| Layer | Role | Answers |
|---|---|---|
| **Store** (SQLite) | exact facts, provenance | "Born where, when?" |
| **Graph model** (GNN + JEPA) | learned representations | "Who is like whom? Which cohort? What's missing?" |
| **Interface** (Jev/CLM) | routing + language | natural-language questions, explanations |

Rules:
- The store is never replaced by a model. Model outputs are claims with
  confidence; store records are facts with provenance.
- Jev routes: exact → store; similarity/cohort → embeddings; open
  language → CLM over textualized subgraphs.
- Urtasun fusion (CLM reads text evidence, graph carries relations) is
  the research frontier; Duvenaud/Grosse set the gate it must pass.

## 2. Data

Entities: see v2/README.md (layers pulling; v1 committed).
Edges (fetch_edges.py, VALUES batches over known QIDs, checkpointed):
- P54 member-of-team (with P580/P582 tenure dates) — played-for + contracts
- P69 educated-at — alma mater
- P108 employer — person → org
- P112 founded-by — org → person
- P19/P569 birth anchors for all people layers (already in pipeline)

## 3. Store schema (SQLite, stdlib — zero deps)

entities(entity_id PK, qid, layer, name, time_date, time_precision,
         place_name, country, lat, lon, provenance_json)
edges(src_id, dst_id, rel, start_date, end_date, provenance_json)
indexes: src, dst, rel, place_name, time_date

## 4. Bake-off (pre-registered, Grosse's rule: measure first)

Held-out link prediction: hide 10% of edges (stratified by rel type);
candidates may not train on held-out edges.
Candidates:
  a) Popularity/cohort baseline (no learning)
  b) Tabular encoder (domain × cohort × region embeddings, dot product)
  c) GNN (GraphSAGE-style, inductive)
  d) GNN + JEPA masked-anchor objective + hierarchical pooling
  e) CLM over textualized neighborhoods (frozen bridge, as in retriever)
  f) Hybrid (d + e late fusion)
Metrics: MRR, Hits@10 per rel type + macro; downstream: era-twin retrieval
on v1 twins; Jan-1-style cohort queries sanity.
Pre-registered predictions (recorded before any run):
  - (d) beats (b) and (c) on link prediction macro MRR.
  - (e) alone loses to (b) on structure-heavy rels (played-for),
    wins on name/description-heavy queries.
  - (f) wins downstream explanation quality; (d) wins pure structure.
Gate: a model ships only if it beats (b) on ALL primary metrics.

## 5. Build order

1. Entities complete (running) → 2. Edges → 3. Store build + QA
→ 4. Baseline (b) + eval harness → 5. GNN/JEPA (c/d) → bake-off
→ 6. Jev router wiring → 7. Downstream SOTA attention model (separate spec).

Training: CPU fine (Jev precedent) for baselines; GNN full-graph on
Alienware via forge if CPU epoch time > 30 min.

## 6. Honesty bar

Every served answer traces to either a store record (fact) or a model
claim labeled with model version + confidence. No silent mixing.

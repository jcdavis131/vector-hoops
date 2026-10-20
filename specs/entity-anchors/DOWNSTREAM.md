# Downstream Architecture — models and capabilities on the public source of truth
Date: 2026-10-20. Principle: the store is the truth; downstream models are
claims about it. Every downstream artifact pins the snapshot it trained on.

## 1. The snapshot contract (the foundation everything rests on)

- A snapshot = atlas.db + layer manifest, hashed (sha256), dated, frozen.
  Name: `atlas-<YYYYMMDD>-<shorthash>`. Manifest lists every layer file,
  row counts, edge counts, QA gate results.
- Snapshots are immutable and archived. The live store keeps growing;
  nothing downstream ever reads it directly.
- Every model card, eval, and served answer names its snapshot. An answer
  from snapshot S is reproducible forever from S.
- First snapshot candidate: after soccer lands (the last big structural
  layer). Until then, downstream work runs on dated dev snapshots.

## 2. The downstream stack (build order)

### D1 — Embeddings (the substrate)
- Graph bake-off winner (GNN / GNN+JEPA per GRAPH_MODEL_SPEC) on a frozen
  snapshot → entity vectors.
- Cohort embeddings: (domain × cohort × region) as a feature store —
  the quant/journalism API surface.
- Text embeddings per the panel plan: gold queries → SVD baseline →
  DRAMA-1B/MiniLM bake-off → per-corpus winners.
- Gate: beat the recorded baselines on held-out link prediction + gold
  retrieval queries, on the same snapshot.

### D2 — Retrieval (already in flight)
- Dense retriever worker: MTNN frozen + MiniLM query encoder vs BM25,
  RRF fusion. Verdict pending.
- Next run: anchor-aware queries (anchor_pairs.json: "players born in
  Dallas") — the store answers exactly, the encoder learns the phrasing.
- Gate: beat BM25 on ALL primaries on BOTH splits (the PREREG stands).

### D3 — The world model (his SOTA, attention heads)
- Attention over graph neighborhoods (the GAT on-ramp the Toronto panel
  named) trained on curated snapshot data: player similarity, era twins.
- Must beat the v5 champion on twin retrieval AND on forecasting features
  (his 2026-10-02 dual-use requirement: same-player adjacent seasons near,
  and it must improve a fixed forecasting model or it's decorative).
- Torch on Alienware via forge; never pip torch on Hatch.
- Gate: held-out win on both axes + his word. No challenger-lane shortcuts.

### D4 — Verification service (trust as a product)
- Claim in → verdict + citations out, built directly on the store.
- Adversarial test set: 100 famous wrong claims, graded correctly.
- This is the first capability that needs NO model training — it ships
  on the store alone. Earliest revenue-adjacent surface.

### D5 — Research engine
- The 8 Freakonomics studies run against store + embeddings, published
  per the /research/ anatomy with named invalidators.
- Jan-1 first (soccer-gated), then relative age, small towns, Akron effect.

### D6 — Interfaces
- Jev routes: exact → store, similarity → embeddings, open language → CLM
  over textualized subgraphs (the retriever's bridge, extended).
- Flagship: the 60-second aha on dumbmodel.com.

## 3. What this forbids

- No downstream model trains on the live store. Snapshot or it didn't happen.
- No promotion without a held-out win on the pinned snapshot + his word.
- No silent mixing: served answers are facts (store, cited) or claims
  (model version + snapshot + confidence, labeled).
- The v5 champion serves untouched until D3 wins its gate — the MTNN
  reframe (2026-10-19) holds.

## 4. Immediate next actions
1. Snapshot tooling: `snapshot.py` (hash + manifest + archive) — build now.
2. First dev snapshot pinned for the graph bake-off code (ready when edges
   for new layers land).
3. D4 (verification) spec'd as the first shippable capability — no training
   required, builds directly on tonight's store.

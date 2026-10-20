# dumbmodel.com methodology — content outline

**Scope: content outline only.** No code, no deploy, no branches in
vector-hub. Per the 2026-10-13 direction: dumbmodel.com becomes THE site
explaining the neural nets behind hoops (methodology, frameworks, data
sources); hoops.dumbmodel.com stays the NBA product with zero model
ins-and-outs.

Aesthetic: Drafting Board (paper default + night-board dark), mobile-first.
Every number traced to its source; provenance visible on-page.

## Site map — one page per section

### `/` — home
"The machinery behind the hoops map, explained honestly."
- One-paragraph plain-words summary of what the models do.
- Links to each section below. No product links.

### `/model` — the model card
- MTNN v5 champion: 12,966 player-seasons × 64-d
  (id: `mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256`), incumbent since
  2026-07-25, single-model serving policy.
- What the network takes in, what the 64 numbers mean, why 64-d.
- What it predicts, what it can't, known biases — plain words.
- Champion/challenger rule: no challenger ships without a held-out win +
  his word.

### `/embeddings` — what embeddings mean
- Interactive: pick a player-season, see its nearest neighbors in the
  served 64-d space.
- **The audit-grade distinction (never conflated):**
  `assets/mtnn_embeddings.f32` = 64-d production embeddings vs
  `assets/vectors.json` = 14 raw per-100 game stats, z-scored within season
  (NOT a projection of the embedding). Atlas xyz = PCA(3) of those
  14 stats, 62.4% variance kept — labeled a *view*, not the model.

### `/era-twins` — the twin method
- Twins = true argmax other-decade career in the served 64-d; all
  1,313 players.
- Worked examples with real numbers: Curry 2015-16 ↔ SGA 2024-25 (mutual);
  LeBron 2008-09 → Durant 2013-14 @ 0.886.
- Twin Explainer chip method: shared dims = smallest |a_d − b_d|,
  plain-words labels.

### `/career-trails` — trails as movement
- Each season is a point; the trail is the player's path through the 64-d space.
- The "what changed" strip = the 2 dimensions that moved most, in plain words.

### `/forecasting` — Arc Forecaster v1
- Held-out (≥2024) macro-MAE 0.4382 vs baselines; 491 players shipped.
- Honest note, printed on the page: MAE is in embedding space, not points.

### `/data` — sources & pipeline
- Real game data only, never synthetic. Per source: what, coverage dates,
  refresh cadence, known gaps.
- (Basketball-Reference game logs; enumerate the rest from the pipeline
  during build — no invented sources.)

### `/methodology` — frameworks & gates
- Training setup, champion-vs-challenger protocol, held-out promotion gates
  (no promotion without a held-out win).
- Evaluation design: what the gates mean, in plain words.

### `/provenance` — the honesty ledger
- Every headline number → its source file/commit
  (see [provenance-ledger.md](provenance-ledger.md)).
- The drift changelog: what was wrong before (v6/128-d/12,452 copy;
  14-d scoring copy; stale twin QA count 1308→1313) and when it was fixed.
  This section is the point.

### `/glossary` — plain-words definitions
- embedding, cosine similarity, PCA, regime… everyday language.

## Entry anatomy (every research-style section)

question → data + freshness → method → result vs baseline →
what would invalidate it → version/changelog.

## hoops.dumbmodel.com side of the split (for reference)

- Everything NBA stays: games, 3D Atlas + Career Trails, Twin Explainer
  chips, Insights cards, Props Lab.
- Model ins-and-outs leave: `model.html` deep-dive → a short "How it works"
  card linking to dumbmodel.com; `methods.html` internals → one-screen
  summary + "full methodology → dumbmodel.com".
- One consistent footer/link component: "How the model works → dumbmodel.com".
- Root/public parity holds on every change.

## Open decision (his call)

**Edge-decay:** how much goes public — full model + numbers vs approach +
vintage with numbers withheld. This outline supports either. The default is
the full-honesty ledger; nothing publishes until he decides.

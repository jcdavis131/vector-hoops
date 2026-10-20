# Jev Agentic Layer — SPEC

**Status:** SPEC ONLY — design doc, no build authorized.
**Date:** 2026-10-20.
**Pillar:** 3 (Vector Hoops product-platform mandala).
**Repo:** `jcdavis131/vector-hoops`. Specs are static docs; no served-page or asset changes ship.

## 0. Why this is spec-only

Jev (the homegrown Jev-pattern CLM: `vllm-sr/d3-edge`, Apache-2.0, 0.59B params,
Qwen3.5-0.8B base, one forward pass per question) has **not cleared its gates**.
The standing promotion rule (his word, 2026-10-13) is:

> **ECE < 0.05 and a held-out win — no promotion without one.**

Current standing evidence (as of 2026-10-20):

- Golden labels: 510 approved (308 train / 77 risky-tail eval, ~4,355 checks green,
  zero hard-rule violations); 166 risky-tail cases queued, none enshrined unreviewed.
- Zero-shot baseline (2026-10-13): risk 98.7% acc / Brier 0.0145 / **ECE 0.042**
  (gate pass on the metric), severity 94.8%, action 48.1% with zero under-blocks.
- Open risks: 32% under-blocked risk on the calibration head (the number to watch);
  lane-head disagreement (router predicts `comms` where golden says `data`); base
  severity=negligible assignment flagged for his review.
- `clm-flywheel-tick` runs every 30m; shadow mode v1 (read-only) approved 2026-10-13.
- The Jev-pattern hoops query encoder (MiniLM + 64-d projection, contrastive, spec
  frozen 2026-10-19, his "Go") is a **retrieval** asset, not a promotion of Jev itself.

**Nothing in this spec ships to hoops.dumbmodel.com until §7's gates are cleared
AND Cameron gives his word.** The served MTNN v5 champion stays untouched
(single-model serving policy — Pillar 1's decision to revisit, not this spec's).

### Non-goals (explicitly out)

- No site pages, no JS, no API changes in this spec.
- No new model training; no retrain lane; the 2026-10-17 retrain verdict
  (does NOT reproduce — there is no single reproducible v5 champion run)
  stands, and this spec does not re-litigate it.
- Does not resolve the red served-model lineage gate — §7 documents what it
  needs; Cameron decides (see open decisions).

---

## 1. Ask-the-atlas endpoint contract

A single natural-language Q&A surface over the atlas: players, teams, eras,
twins. One contract, two deployment stages: (a) internal shadow harness
(eval-only, no users), (b) future public endpoint gated by §7.

### 1.1 Query types (closed taxonomy — the router only ever answers these)

| Query type | Example | Evidence source |
|---|---|---|
| `twin_lookup` | "Who is SGA's era twin?" | 64-d embedding k-NN, `assets/eratwins.json` |
| `twin_why` | "Why are they twins?" | 14-d serving vectors, Twin Explainer method (§4) |
| `player_stat` | "Curry's 2016 true shooting?" | `assets/vectors.json` + provenance labels |
| `compare` | "Jordan vs LeBron playmaking" | 14-d vectors, era-adjusted framing |
| `era_query` | "Best shooters of the 2010s" | Archetype assignments, `assets/archetypes_time.json` |
| `insight_cite` | "Is the Jrue −8.7 card real?" | Insights provenance ledger (§2) |

Anything outside this taxonomy → `refusal` (§5). The router never
free-composes: every answer is a template filled from evidence rows.

### 1.2 Request shape (contract for the future endpoint)

```json
{
  "query": "Who is SGA's era twin and why?",
  "query_type": "twin_lookup",        // hint; router re-classifies and reports its own call
  "session_id": "ses_7f3a…",          // §6
  "answer_style": "chips",            // "chips" | "plain" — chip rendering is a client concern
  "max_evidence": 3
}
```

### 1.3 Response shape

```json
{
  "answer": "Shai Gilgeous-Alexander's era twin is …, both high-volume on-ball creators…",
  "query_type": "twin_lookup",
  "confidence": 0.83,                // router's calibrated confidence — ALWAYS shown
  "evidence": [ …citation objects… ], // §2 schema, min 1, max 5
  "why_line": "biggest difference: rim pressure",  // §4 pattern, may be null
  "data_vintage": {"embeddings": "2026-07-25", "season_data": "2025-26 thru 2026-04"},
  "refusal": false,
  "latency_ms": 2840,
  "model": "jev-router (gated)"      // reports which brain answered — never implies MTNN answered
}
```

### 1.4 Budgets (binding when built)

- **Latency:** p50 ≤ 3s CPU dispatch (jev-games measured 3.45s CPU on stock
  d3-edge; the build must beat that or it doesn't ship).
- **Rate:** 20 req/min/session, 500/day/session (matches the site's honest-503
  posture — degrade with a 503 card, never a slow fake).
- **Cache:** identical (query, data_vintage) pairs are edge-cacheable; the
  response's `data_vintage` is part of the cache key so stale answers can't
  masquerade as fresh.
- **Cost:** router-only, no hosted LLM spend. If a future brain change would
  add per-request cost, that is a new spec + his word, not a silent upgrade.

### 1.5 Failure behavior

- Evidence store unreachable → HTTP 503 with last-known answer where one
  exists (stamped `stale_as_of`), else an honest empty card. Never invented.
- Router confidence below floor → refusal path (§5), never a padded answer.
- Unknown player/team/season string → identity-resolution step first
  (`assets/current_rosters*.json` + alias map); unresolved → "I don't know
  that player" (§5). Never guess.

---

## 2. Evidence-citation format

Every answer carries citations. A citation is a machine-checkable pointer,
not decoration: any claim the answer makes must resolve to ≥1 citation row,
and the row must still exist at the cited vintage.

### 2.1 Citation object schema

```json
{
  "kind": "embedding_neighbor",   // "embedding_neighbor" | "stat" | "provenance" | "insight"
  "label": "Steph Curry 2015-16 — cosine 0.853 to query",
  "ref": "mtnn://embeddings.v5/Shai Gilgeous-Alexander|2024-25/neighbors/3",
  "vintage": "2026-07-25",
  "link": "/players/steph-curry?season=2015-16"
}
```

### 2.2 The four kinds

**embedding_neighbor** — claims about similarity, twins, "like whom".
- Source: the 64-d production embedding (`assets/mtnn_embeddings.f32`,
  MTNN v5 champion `mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256`).
- `label` must carry the cosine similarity as served (3 decimals).
- NEVER conflate with the 14-d serving vectors: the atlas map is PCA(3) of the
  14 raw per-100 game stats, z-scored within season (62.4% variance kept) —
  it is **not** a projection of the embedding. Citations say which space
  the number came from.

**stat** — claims about numbers (points, TS%, WS, era ranks).
- Source: `assets/vectors.json` (14-d per-100 game stats, z-scored within
  season) or the pipeline row that produced it.
- `label` must include the vintage window ("2025-26 through April").
- Unknown fields render as **"unknown"** — never filled, never rounded
  from a different season.

**provenance** — claims about method ("the model found this", "this card").
- Links to `methods.html`, the methodology notebook (dumbmodel.com), or the
  `/research/[slug]` entry that backs it. Format per the research-anatomy
  rule: question → data+freshness → method → result vs baseline → invalidator.

**insight** — claims drawn from shipped Insights cards.
- Points at the card + the model run + data vintage that produced it
  (insight provenance, Pillar 5). Cards retire when data moves on (§5 covers
  retired-card answers: refuse with the retirement note).

### 2.3 Citation rules (hard)

1. Min 1 citation per answer; min 2 for any comparison or era claim.
2. Every citation link must resolve at answer time (404s turn the answer
   into a refusal — a cited ghost is worse than no answer).
3. No claim may rest on an uncited sentence. Templates enforce this
   structurally (each template slot takes an evidence row).

---

## 3. Plain-words 'why' explanation pattern

Generalizes the Twin Explainer chip pattern
(`specs/twin-explainer-SPEC.md`, shipped on Daily Court) from twin pairs
to every "why" the layer answers.

### 3.1 The pattern (three slots, always in this order)

1. **Shared-style chips (2–3):** plain words for the overlapping dimensions.
   `both crash the offensive glass`, `both rarely shoot threes`,
   `both protect the rim`. Computed, never composed: smallest |a−b| dims
   in the 14-d serving space, direction from the sign of the pair mean,
   labels from `featureLabels`.
2. **One differ line:** `biggest difference: playmaking`. Largest |a−b| dim.
   **Always shown** — a pair with no visible difference shown would be
   dishonest (Twin Explainer honest-flags rule).
3. **Thin-match qualifier:** when similarity is below the distribution-set
   threshold (Twin Explainer default 0.75, builder confirms per surface):
   `looser match — similarity 0.71`. Shown, never hidden.

### 3.2 Generalization rules beyond twins

- **Comparisons** (Jordan vs LeBron): chips become "both high X / both low X"
  where both are on the same side, and the differ line carries the argument
  ("the gap is playmaking"). Era context is mandatory: raw per-100 numbers
  get z-scored-within-season framing so cross-era claims don't cheat.
- **Archetype/era claims** ("2010s shooters"): the 'why' lists the defining
  dims of the archetype assignment, citing `archetype_assignments.json`.
- **Insight claims:** the 'why' is the card's invalidator-aware summary
  ("what would change this"), linking the research entry.

### 3.3 Language rules

- Plain words, no model jargon on the surface. "64-d embedding space"
  never appears in an answer; methods.html carries it.
- Never imply causation ("because the model thinks"). The phrasing is
  evidence-shaped: "their stat signatures overlap on X".
- Two different jobs, said plainly (Twin Explainer honest-method note):
  the *match* comes from the embedding space; the *explanation* decomposes
  observable style overlap in the 14-d serving vectors.

---

## 4. Refusal + uncertainty behavior

"I don't know" is a first-class answer. The layer is a router with
calibrated confidence, not a generator with something to prove.

### 4.1 Mandatory refusals (no discretion)

| Trigger | Response |
|---|---|
| Query outside the §1.1 taxonomy | "I can answer questions about players, teams, eras, and twins — that's my whole world right now." |
| Unknown player/team/season after identity resolution | "I don't know that player." (Never guesses at spelling.) |
| Router confidence < 0.60 (floor; builder re-calibrates per eval) | "I'm not sure enough about this one to give you a real answer." + nearest on-taxonomy suggestion |
| Evidence store down, no last-known | 503 card, honest empty. Not a chatty apology — a status. |
| Retired insight (card decayed, Pillar 5) | "That insight retired on [date] when the data moved on — here's the current one" or refusal if none. |
| Contradictory evidence (neighbors and stats disagree) | Refuse with the contradiction named: "the twin says X but the stats say Y — I won't pick sides on thin evidence." |
| Cross-era claim with era-confound risk | Qualify or refuse: "across eras, shot-diet differences dominate — I can compare within-era." |

### 4.2 Uncertainty display (not refusal, but honest)

- Confidence shown on every answer (§1.3), as a number, not a vibe.
- Thin matches carry the qualifier (§3.1), not silence.
- "Last known" staleness badges anywhere data is cached (§1.4): every
  number carries its as-of; stale = "last known", never fresh-looking.

### 4.3 Anti-confabulation invariants

1. Templates can't produce a sentence without an evidence row (§2.3 rule 3).
2. The router may abstain mid-dispatch: low calibration → refusal beats padding.
3. No hedging that hides a refusal ("it's possible that…"). Refuse plainly.

---

## 5. Per-session memory, no cross-user leakage

### 5.1 What a session is

- `session_id` is issued per browser session (UUID v4, client-generated,
  validated server-side). It scopes conversation memory and rate limits.
- TTL: 24h of inactivity, then the server-side record is deleted.
  Client-side transcript may persist locally (user's own device, their data).

### 5.2 What memory holds (and only this)

- The query history of the session (for follow-ups: "and his twin's team?").
- Entities the user asked to follow this session (player/team names —
  candidates for Pillar 5's personalized feeds, never shipped without its
  own spec + his word).

### 5.3 No-cross-user-leakage rules (hard)

1. Server-side session records are keyed by `session_id` alone — no
   cross-session reads, no "users like you" logic, ever.
2. Follow-up resolution uses only the issuing session's history.
3. No analytics identifier may be joined to a session record.
4. Deleting the client cookie/session ends the memory — there is no
   second copy.
5. Audit: any future build ships a leakage test (session A's entities
   must be unresolvable from session B's id) as a CI gate.

---

## 6. Promotion gate criteria

Two gates in series. **Neither can be skipped, and Cameron's word is the
final one.**

### Gate A — Jev/CLM program gates (the brain must earn it)

The standing rule (his word 2026-10-13):

1. **ECE < 0.05** on the held-out risky-tail eval (currently 77 cases;
   zero-shot baseline 0.042 — pass, but must hold post-LoRA).
2. **Held-out win**: the fine-tuned router beats the stock d3-edge baseline
   on the golden eval with a pre-registered metric (Brier + risk accuracy +
   zero under-blocks). No cherry-picked metric swaps.
3. **Calibration-head health**: under-block rate within the band the panel
   sets (32% under-blocked on stock is the number to watch — it must come
   down, not just ECE).
4. **Shadow results**: ≥4 weeks of shadow-mode (read-only) dispatch with
   no unresolved disagreements against the teacher (Scout), and the
   lane-head disagreement (`comms` vs golden `data`) resolved or
   explicitly accepted with a note.
5. **Role lock intact**: Teacher = Scout, Student = d3-edge — no
   self-distillation, ever. Training data expansion (Nimble) uses
   methodology only, never outside data.

### Gate B — Agentic-layer build gates (the surface must earn it)

6. **Retrieval spine proven**: the Jev-pattern hoops query encoder
   (2026-10-19 spec, his "Go") promotes on its held-out win vs BM25 + RRF
   hybrid — the layer's evidence retrieval can't rest on a weak spine.
7. **jev-games dispatch bar**: post-tune router beats the stock 60.91
   with 0 fallbacks and p50 < 3s CPU on the dispatch game.
8. **Served-model lineage gate**: documented below — **Pillar 1's lane**,
   this spec does not resolve it.
9. **Security + QA pass**: the §126-style audit template, leakage test
   (§5.3 rule 5), offline behavior, QUICK budget gates — all green.
10. **Cameron's word**: explicit, per promotion. Silence is not approval.

### On the red served-model lineage gate (documented, not resolved)

The gate is red because the 2026-10-17 retrain verdict does not reproduce:
there is no single reproducible run that produced the serving v5 champion.
What resolution needs (Pillar 1 / Cameron's call): **either** locate the
original run files (config, seed, data manifest, metrics) and re-anchor the
lineage, **or** order a deliberate replacement champion with a fresh
held-out win — MTNN v5 stays serving untouched until then. The agentic
layer must not paper over this: answers cite `model_id`
`mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256` with its lineage status
visible in methods.html, never as settled provenance.

---

## 7. Acceptance criteria (for the spec itself)

- [ ] All six required sections present with schemas, thresholds, and
      anti-fake rules — reviewable by Cameron in one sitting.
- [ ] Every threshold ties to a real number on record (ECE 0.042, 60.91,
      3.45s, 0.75, 510/308/77) — no invented constants.
- [ ] Twin Explainer pattern generalized, not re-invented; honest-method
      note (match space vs explainer space) preserved.
- [ ] Promotion gates name both the Jev program gates and the surface
      gates, ending at his word — no backdoor.
- [ ] The red lineage gate is documented with what resolution needs,
      explicitly not resolved here.

## 8. Open questions (for Cameron — not decided in this spec)

1. **Surface**: when gates clear, does ask-the-atlas ship as a native
   hoops.dumbmodel.com surface, or first as the eye.jcamd.com /research/
   assistant (his standing rule: research publishes to eye.jcamd.com)?
2. **Answer rendering**: chips-first (Twin Explainer visual language) vs
   prose-first — the contract supports both via `answer_style`.
3. **Confidence floor**: 0.60 is a placeholder — the flywheel eval should
   set it from the calibration curve, not a round number.
4. **Session TTL**: 24h is a default; shorter (1h) is cheaper and safer —
   his call when the build spec lands.

---

*Pillar 3 of 8. Spec-only by mandate: Jev has not cleared its gates, so
nothing in this document authorizes a build, a deploy, or a model change.*

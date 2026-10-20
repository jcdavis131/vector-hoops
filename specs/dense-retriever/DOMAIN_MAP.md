# Embedding Atlas — Dataset Domain Map

**Purpose:** priorities for gathering + curating data for the embedding atlas.
The other MTNNs are dropped; v5 serves; a SOTA attention model gets built
downstream on this data. This doc is the gathering list.

**Method:** audited 2026-10-19 against the served assets
(`assets/vectors.json` 12,966 player-seasons, `mtnn_embeddings.f32`),
the dense-retriever pairs (12,959 queries), and 1,188 dossiers.
All counts below are measured, not estimated.

---

## 1. Domains (what to gather, ranked)

### D1. Pre-1996 history — CRITICAL, entirely absent
- Atlas coverage starts **1996-97**. Zero player-seasons before that.
- Missing: Bird/Magic 80s, Kareem 70s, Russell/Wilt 60s, the whole ABA.
- Era twins "across decades" currently can't reach back further than 1996 —
  the flagship feature is blind to 50 years of the sport.
- Gather: per-100 stats back to at least 1979-80 (3pt-line era), ideally 1960s;
  normalize with era-relative z-scoring (pace exploded; raw cross-era stats lie).
- Split treatment: pre-1996 needs its own train/val/test handling, not shoehorned
  into the ≤2021/2022-23/≥2024 scheme.

### D2. 1990s depth — thin
- Only 1,565 player-seasons (12% of atlas); 2010s has 4,412.
- Train pair positives: 1990s 10,296 vs 2010s 27,766 (2.7x skew).
- Dossier player-season hits: 1990s 789 vs 2010s 1,948.
- Gather: richer 1996-99 coverage first (already in-schema, cheapest win).

### D3. Dossier coverage — half the players missing
- 1,188 dossiers vs ~2,415 players in the atlas.
- 84 dossier files didn't match any atlas name (Jr/Sr splits, spelling).
- Gather: remaining ~1,200 players, era-balanced; fix the 84 orphans.

### D4. Non-scorer archetypes — stat-label bias
- Template pairs (1,176 + 144 combo) are built from the 14 stat labels —
  they describe what the stats already say. Defensive specialists, screeners,
  locker-room vets get thin natural-language coverage.
- Only 16 cluster-source pairs exist.
- Gather: natural descriptions of role players (beat-writer prose, not box scores).

### D5. International / pre-NBA careers
- Dossiers are NBA-season scoped. Pre-draft, EuroLeague, FIBA careers absent.
- Matters for era twins of international players (Nowitzki, Giannis, Jokić).
- Gather: FIBA/EuroLeague stat lines + career narratives.

### D6. Narrative arcs — injuries, comebacks, trades
- Dossiers have z-profile blocks and honors, but no injury/comeback/trade arcs.
- These drive "like X but if he stayed healthy" queries — a natural SOTA use case.
- Gather: structured career-event timelines per player.

---

## 2. Pronouns — how queries refer to players (reference forms)

Measured on 11,639 train queries:

| Form | Share | Status |
|---|---|---|
| Proper name ("Michael Jordan") | 68% | Overrepresented |
| Team+year anchored ("2016 Warriors") | 66% | Healthy |
| Pronominal he/his/him | 60% | Mostly alongside names — weak alone |
| Zero-name twin-chip ("both rarely shoot threes") | 32.5% | Pair-internal phrasing, not user-like |
| Pronominal they/their/them | 16% | Thin |
| Definite description ("the lanky 90s guard") | 2% | **Thinnest — gather here** |

**Priority:** definite descriptions and pronoun-only chains ("he was the
defensive anchor on those late-2000s Celtics teams") are how fans actually
talk. Current pairs are name-heavy because they're machine-generated from
templates. Gather: fan-forum/Reddit-style referring expressions, resolved
to player-seasons.

---

## 3. Query intents — what's missing

Current sources: dossier (8,016), twin_chip (2,121), template (1,176),
template_combo (144), team (166), cluster (16).

Missing intents worth gathering:
- **Comparatives:** "better rim protector than Rudy Gobert but worse passer"
- **Era bridges:** "the 90s version of Stephen Curry"
- **Negations:** "never an All-Star but started on a title team"
- **Counterfactuals:** "like Grant Hill if the ankles held up" (needs D6)
- **Multi-hop:** "teammates with Kobe who later won as the man elsewhere"

---

## 4. Positions — healthy, no action

Guards 2,497 / wings 5,150 / bigs 5,278 (41 unknown). Train positives track
the same mix. Not a priority.

---

## Gathering order

1. D1 pre-1996 stats (unblocks the flagship feature's blind spot)
2. D2 1990s depth (cheap, in-schema)
3. Pronoun forms: definite descriptions + fan referring expressions
4. D3 dossier completion (1,200 players)
5. D4/D5/D6 in parallel once 1-3 land

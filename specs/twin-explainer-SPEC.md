# Twin Explainer — SPEC

**Status:** spec only, awaiting build (build authorized 2026-09-29 with Career Trails). **Date:** 2026-09-29.
**Repo:** `~/workspace/vector-hoops` (serves as hoops.dumbmodel.com; mirror served changes into `public/`).

## 1. One-liner

Every twin reveal now answers *why*: the shared style dimensions behind the match, in plain words.

## 2. Why this one

- Era twins are a signature feature, but today the match is a black box — a name, a season, a similarity number. The explainer makes the map's logic legible and teaches the user how to read embeddings.
- Zero new data: `assets/eratwins.json` already holds 1,308 signature-season pairs (twin + top-5 + similarity); `assets/vectors.json` holds the 14-d serving vectors with plain-language `featureLabels`.
- Natural home: the Daily Court reveal card (`assets/past-modern-game.js` — "Loading twin…" → reveal), the exact moment the user asks "why him?"

## 3. UX flow (v1)

```
Daily Court round → twin revealed (existing card: name, season, similarity)
  → NEW: under the reveal, 3 chips — "why they're twins":
      e.g.  [both crash the offensive glass] [both rarely shoot threes] [both protect the rim]
  → NEW: one quiet line — "biggest difference: playmaking"
  → thin matches (sim < threshold): chip row gets a "looser match" qualifier
```

- Chips reuse the game's existing chip styles; no new visual language.
- Same treatment on any other twin card surface the builder finds (grep `twin` — candidates: `public/players.html`, `public/trends.html`).
- Mobile: chips wrap; no layout shift in the reveal card.

## 4. Computation (build-time, stdlib only)

- Script: `pipeline/build_twin_explainer.py`.
- Inputs: `assets/eratwins.json` (pairs), `assets/vectors.json` (`players[].v`, 14-d).
- Method per pair (A = player season, B = twin season), in the 14-d serving space:
  - **Shared dims:** smallest |a_d − b_d| → top 3. Direction from sign of (a_d + b_d)/2 → "both high X" / "both low X" (vectors are standardized; QA asserts per-dim mean ≈ 0).
  - **Differentiator:** largest |a_d − b_d| → top 1 → "biggest difference: X".
  - Labels from `featureLabels` (e.g. `OREB` → "offensive glass").
- Output: `assets/twin_explainer.json`, keyed `"name|season"` → `{shared: ["both high offensive glass", ...], differ: "playmaking", sim: 0.853}`.
- Honest-method note (also added to methods.html): the *match* was found in the full embedding space (per eratwins.json method); the explainer decomposes observable style overlap in the 14-d serving vectors. Two different jobs, said plainly.
- QA asserts (hard-block): every key resolves to a real (name, season) vector; sim matches eratwins.json; spot-check 5 recognizable pairs — sharpshooter twins must share three-point volume, rim-protector twins must share rim protection; thin-match threshold set from the sim distribution (default 0.75, builder confirms).

## 5. Client integration

- Hook the Daily Court reveal in `assets/past-modern-game.js`: after the twin card renders, fetch `twin_explainer.json` (lazy, cached by `sw.js`) and inject the chips + differ line.
- No changes to game logic, scoring, or reveal timing.

## 6. Honest flags (in the UI)

- Differ line is always shown — a twin pair with no visible difference would be dishonest.
- Thin matches get the qualifier, not hidden: "looser match — similarity 0.71".
- methods.html: one paragraph on match space vs explainer space (§4).

## 7. v1 scope cuts (parked)

- Explaining the top-5 candidates (only the revealed twin).
- Cross-decade "why not" (why candidate #2 lost) — needs 48-d internals; skip.
- Era-adjusted toggle ("twins by shot diet") — future lens.

## 8. Acceptance criteria

- Five recognizable twin pairs show sensible chips (builder picks: one sharpshooter pair, one rim-protector pair, one playmaker pair, one thin match, one cross-era oddity).
- Reveal card layout unbroken on mobile; chips wrap cleanly.
- `twin_explainer.json` lazy-loads; works offline after first view.
- Additive only; verifier ≥8.0; contrast fixed.
- Ship rule: mirror into `public/`; no live claims until a cache-busted fetch confirms served bytes.

## 9. Build phases (authorized — build with Career Trails, one branch)

1. `pipeline/build_twin_explainer.py` + `assets/twin_explainer.json` + QA asserts.
2. Reveal-card integration in `assets/past-modern-game.js` (+ any other twin surface found).
3. Polish: chip wrap, thin-match qualifier, offline caching, methods.html paragraph.
4. Verify: 5 spot-check pairs, mobile layout, cache-busted live check — then PR on his word (no merge without it).

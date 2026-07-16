# Vector Hoops — Gameplay v6 (Guess-The-Player pivot)

Doctrine: every number recomputable from source; accuracy harness gates deploy.

## NEW Main Mode — GUESS THE PLAYER (daily, Wordle for hoops)

**Previously Chimera (now Hard mode ?mode=chimera_hard)**

Pivot shipped July 15 2026:

- **Single target**: one player-season, weighted by puzzleWeight/popularity from player_meta.json, seeded `vector-hoops:{UTC-date}` via xmur3→mulberry32, deterministic across clients.
- **Win**: exact player-season id match only (name+season). Right player wrong season = near-miss message, consumes guess but clarifies.
- **Guesses**: 6 max, similarity % from MTNN embeddings (or cosine fallback) for warmth feedback, directional coaching via sigma bars.
- **Hints**: guess 3 = position group, guess 5 = archetype name (Okabe triple-encoded).
- **Scoring**: 600/500/400/300/200/100 by solve index; share text = "Vector Hoops #n 4/6" + warmth blocks.
- **Maps**: 3D embedding starfield single diamond = mystery player; no donor squares.
- **Breakdown**: same 14-d σ vs tournament bars, coaching line from target.vector vs guess.v.
- **Pools**: MODERN = players active last 2 seasons, ALL = 12,966 seasons. Separate daily keys `vectorHoops.v6` and `vectorHoops.v6.modern.daily`; streak isolation.
- **Free Play**: randomNonce() endless, practice stats `vectorHoops.v6.practice.guess.stats`.
- **Determinism**: verify_accuracy harness checks weighted pick reproducibly — same seed → same player id on all clients.

**Trust**
- All displayed sims recomputed from mtnn_embeddings.f32.
- Scouting line derives from target.vector.
- Repeat guess guard.
- UTC rollover frozen at first load.

## Hard Mode — CHIMERA (?mode=chimera_hard)

Preserved legacy v5 Chimera:
- Two donors fused A dims [0,7) stats + B [7,14) shooting → target.vector.
- Win: >=92% cosine OR exact name+season of either component.
- Max 6 mashup tries after stats/style donor phases.
- Keys: old v5 still migrates, but guess main uses v6.
- Share: equation format retained.
- Accessible via /play?mode=chimera_hard, badge HARD in mode grid.

## Other Modes (unchanged)

- Deadline (M=dl): 5 thrivers/craters daily set
- Fader/Finisher (M=ff)
- Career Arc (M=arc)
- Teammate Chemistry (M=cm)
- Pivot (M=pv)
- Era Twin (M=tw)
- What-If WhatIf builder

Each retains daily vs free play, seeded shared puzzle, separate stats, Methods & Data modals.

## UI — v6 Guess updates

- Landing: primary card "Guess The Player ⭐ Main" → /play, secondary "Chimera HARD" → /play?mode=chimera_hard
- Equation tiles → single mystery card "? Mystery Player" silhouette in guess mode; chimera tiles only in hard mode.
- Prompt: "Vector Hoops #n — Find today's mystery season — 6 guesses" vs chimera prompt.
- Scouting line: single vector, triple encoding Okabe shapes.
- Help modal per-mode tabs.
- Share v6 vs v5 distinction.
- Stats histogram separate for guess vs chimera.

## Tech

- vectors.json 12,966 seasons 1996-97→2025-26, 14 features era-honest per-100, season_norms.json
- player_meta.json 518KB weighted
- mtnn_embeddings.f32 2.4M 48-d L2
- clientside localStorage only, no tracking, paper #FFFEF7 / ink #1A150F, 56px tabs, safe-area, AAA
- Footer: Solo personal project, no connection to employer, built with public/free-tier only

Last updated 2026-07-15 for v6 pivot.

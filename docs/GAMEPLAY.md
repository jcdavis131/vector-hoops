# Vector Hoops — complete gameplay plan (trust-first)

Doctrine: every number a player sees must be recomputable from source
data; every mechanic states its rules; nothing shown is vibes. The
accuracy harness (pipeline/verify_accuracy.py) gates every deploy.

## Mode 1 — THE CHIMERA (daily) — complete the bones

**Accuracy backlog (P0 — trust):**
- A1. Client cluster attribution must EQUAL pipeline k-means labels
  (today the client computes centroids independently — verify identity
  for all 12,392 players; ship centroids in vectors.json if not).
- A2. Win logic spec'd + tested: >=92% cosine, OR exact (name, season)
  of either component. Naming the right player in the WRONG season =
  near-miss message (not a win, not a wasted guess — free clarification).
- A3. Scouting line must derive from the same vector the target uses
  (test: regenerate line from target.v, compare).
- A4. Repeat-guess guard (same player-season twice = rejected, no
  guess consumed).
- A5. UTC rollover mid-session: freeze the day's puzzle at first load;
  banner offers "new chimera available" instead of silent swap.

**Mechanics to complete:**
- M1. Stats modal (Wordle-grade): played, win %, streak, max streak,
  guess distribution histogram — localStorage, exportable.
- M2. Hint economy: guess 3 = position group; guess 5 = archetype name.
  Stated in How-to-play (no hidden mechanics).
- M3. Yesterday's chimera replay (practice, unscored, labeled).
- M4. Reveal flow: full dossier modal in-game (render the OKF .md —
  no raw-file links), both components + "why these two" (their cosine).
- M5. Share card v2: includes day #, blocks, and warmth trail.

## Mode 2 — THE DEADLINE (daily set) — make scores comparable

**Accuracy backlog (P0):**
- A6. Every displayed delta recomputed from raw game logs by the
  harness (sample 100%: all 50 quiz movers) — byte-match deadline.json.
- A7. Method modal (not just a footer line): windows, minimums,
  context adjustment formula, "midseason move ≠ officially a trade,"
  sample sizes ON each card.
- A8. Balance guarantee: each daily set = 5 movers drawn seeded-daily
  from thrives+craters with at least 2 of each; scores comparable
  across players (same set for everyone that day).

**Mechanics:**
- M6. Daily-set scoring + its own share text ("Deadline 4/5") + streak.
- M7. Post-round detail: before/after per-36 lines + tiny before/after
  bar pair; link to the mover's dossier.

## Mode 3 — FADER OR FINISHER (new; data ready in game logs)

Monthly-split rebounding/scoring: "Did X rebound better before or
after the All-Star break in Y season?" — 5 rounds daily, computed
offline into assets/faderfinisher.json by pipeline (with minimums +
method), harness-verified like Deadline.

## Mode 4 — CAREER ARC (new; data already in vectors.json)

Given one player's 4+ charted seasons as unlabeled vector cards
(sigma bars only), order them chronologically. Pure existing data;
teaches the space; zero new fetch.

## Cross-cutting modals & polish

- How-to-play per mode (tabs), Stats, Methods & Data (the trust
  centerpiece: sources, build dates, filters like MIN>=800, era
  z-scoring, attribution, limitations), Dossier (in-game OKF render),
  Settings (reduced motion respect note, clear-data).
- Social cards (og/twitter + generated og image), loading skeleton,
  the audit agent's coherence fixes.

## Delivery order

1. Accuracy harness + A1-A8 fixes (trust before features).
2. Audit-driven coherence/P1 fixes + social cards + dossier modal.
3. M1-M7 (complete modes 1-2).
4. Mode 3 pipeline + UI; Mode 4 UI.
5. Full re-audit; harness wired as pre-deploy gate.

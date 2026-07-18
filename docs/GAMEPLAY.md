# Vector Hoops — Gameplay v7 (Daily Court 5× + Pack Battle Production)

## Daily Court 5× — Current Main (2026-07 rewrite)

Daily Court is the default mode in `play.html`:

- **5 fixed past All-Stars per day**, deterministic from date: `hash(date|daily-court-v2|slot)` — same for all IPs, same for everyone, cannot be rerolled by refresh.
- **Broader meta:** solve 1 → streak saved, 3 → Sharpshooter + hint unlock, 5 → Full Court perfect. 3+ needed to stay incentivized. Each slot fixed for day.
- **Progress:** localStorage keys `vh.daily.v2.{dayKey}.slot0..4` contain guesses. Switching slots preserves guesses. IP fetch from `/api/ip.js` (no-store) only for display slot assignment, not for reroll. Refresh-proof.
- **Streak:** stored `vh.streak.v2`, only Daily Court wins affect streak (Random & Pack Battle are streak-safe via mode guard). Midnight UTC rollover.
- **Map viz:** 12,966 nodes xyz from `vectors_search_lite.json`, MTNN 48-d similarity for modern twin ranking, 3D rotating map with ★ past gold pulsing, orange rings for guesses.
- **Past → Modern twin:** past = All-Star season (1996-2023, asg=1 in honors.json), modern = 2024-26 most recent season per name. Target excluded from own modern pool. Closest by cosine of mtnn_embeddings.f32.

## Pack Battle 1·3·5 — Viral, Production-Grade (v2)

Goal: fully functioning pack battle for friends, ready for large influx on hoops.dumbmodels.com.

**Engine:** `assets/past-modern-game.js` — `PACK_PREFIX='vh.pack.'`, `PACK_CURRENT_KEY`, `PACK_MAX=5`, dedup by id+name, limit to 5.

- **URLs:**
  - `?pack=ID-ID-ID` = Challenge link, same All-Stars for everyone. `packChallengeUrl()` builds this.
  - `?pack=ID-ID-ID&s=2-0-4` = Battle link with scores: `0=fail, 1-6=win in N`. `packShareUrl(ids, scores)` auto-appends self scores after completion. Scores are public in URL for battle.
- **Parsing:** `parseIdList` split on `[-,_\\s]`, int filter; `parseScores` maps >6 or NaN → 0 (fail). Graceful invalid handling → `state.packInvalid` flag + UI CTA to generate new pack.
- **Persistence:** `savePackState/loadPackState/clearPackState` — v3 schema `{v, ids, results, index, size, challenger, code, currentGuesses, ts}` stored as `vh.pack.{code}` + current code in `vh.pack.current`. Refresh persists progress + current in-progress guesses. Close/reopen resumes at first unsolved.
- **Flow:** Solo 1 / Triple 3 / Full 5 from landing (`data-pack-hero`) and play tabs (`data-pack-n`). `generateRandomPack(n)` dedup by name, unique names, then shuffle. New packs never reuse old progress (fresh code).
- **Gameplay:** slot-by-slot 6 tries, `advancePack(result)` saves ts-stamped result `{guesses, won, count, solved, ts}`. Fail does NOT block → Next button always. `resetCurrentPack()` replay same code, `abandonPack()` clears current and goes Daily.
- **Battle:** `getPackState()` returns `solved/failed/progress/totalGuesses/avg/avgWin`. `getPackBattleSummary()` computes vs `&s=` challenger: `hasChallenger, selfSolved vs challSolved, selfTotal vs challTotal, isTie, selfWins`. Tie → same solved and same total.
- **Share:** `viral-share.js` v2 `drawPackCard` renders battle banner (you lead / tie / friend leads) with you blue+green bars vs friend blue thin bar, avg, code. `sharePack` builds both image share + text battle link with `&s=`. Final summary CTA: Copy Challenge Link (without scores for friends), Copy Results Link with `&s=`, Share Image, Reset, New Pack, Abandon.
- **Streak safety:** Pack never calls `onDailyWin`, mode-tabs label streak unchanged, storage isolated from `vh.daily.v2.*` and `vh.streak.v2`. Quota safe: ~2KB per pack max.
- **Offline / caching:** `vercel.json` sets html `must-revalidate`, assets immutable. `api/ip.js` no-store. `sw.js` caches shell. Query param URLs bust cache via no-store html path.
- **Testing matrix (must pass before launch):** Solo/Triple/Full from landing + play tabs, `?pack=ID-ID-ID` valid refresh persists + current guesses, win→Next, fail→Next (previously stuck), final summary auto-includes `&s=`, challenger flow with `&s=` shows correct battle diff + tie, invalid pack `?pack=9999999` → error + CTA, streak unaffected, localStorage quota, mobile viewport iOS safe-area, offline reload via sw.
- **Design constraints:** keep Daily Court 5× deterministic, Random mode intact, map viz 12,966 nodes not blocked, SCAD polish AAA Okabe-Ito, mobile 56px tabs.

## Previous — Guess The Player pivot note

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

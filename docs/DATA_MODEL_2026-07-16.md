# Vector Hoops — Data Model & Storage (2026-07-16)

Solo personal project, no connection to employer, built with public/free-tier only.

## Embeddings / Assets alignment — verified

- `vectors_search_lite.json`: 12,966 players map {i,n,s,x,y,z,c} + teams, critical core <617KB, used for sky + suggest. `N=12966`.
- `vectors_lite.json` 630KB and `vectors.json` 3M full per-100 vectors — verified rows 12966, rowBytes 34 matches.
- `skills.json` 12966x12 grades 0-99 transparent fallback when MTNN heads absent.
- `mtnn_embeddings.f32` 2.49MB = 12966*48*4 bytes L2-normed Float32, dim 48. Cosine drift max 0.01241 per test_arena.
- `mtnn_heads.f32` 2.33MB = 12966*45*4 (8 archetype logits + 5 pos + 14 next_profile + 18 skill towers raw).
- `mtnn_meta.json` {dim:48, rows:12966, model:v5_concat_b2_h160_t32_d48_mlp128, recall@10 0.977, composite 0.7937, CQS 66.29}
- `mtnn_arch.json` {gameArchetypes[8], skillKeys[18], dimensions}
- `season_norms.json` μ/σ per season per feature for era-z fairness: FG3A 3.3→7.0 evolution.
- `archetype_lite.json` / `archetype_assignments.json` 12,966 mapping gc, mgn, era-native.
- `mtnn_map.json` axes definition + coords PCA → x,y,z for sky.
- `skill_probe.json` W 14feats ×12 skills → drives PC labels.

Test gates: `test_arena.py --offline` 19 gates PASS, `test_skills.py` PASS, vectors_lite/skills/embeddings byte alignment verified.

## localStorage Keys — Current vs Legacy

### Active 100M DAU canonical (prefixed vh.)

- `vh.daily.v2` — {puzzle:number, guesses:[{idx}]} per day. PuzzleNumber epoch 2026-07-01. Overwrites on new day. Used in play.html + offline.html.
- `vh.streak` — {streak:number, lastPuzzle:number, updated:timestamp} — flame 🔥.
- `vh.errors` — array max 50 [{ts, type, message, source, lineno, colno, stack, url, userAgent}] local only no telemetry, quota guard drop oldest half.
- `vh.favoriteTeam` — new canonical team lock abbr CHI etc, 44px touch, used for sky tint + confetti primary color. Fallback reads legacy.
- `vh.vitals` / `vh.vitals-play` — {LCP, CLS, INP} numeric, local only.
- `vh.nux-seen` (from nux.js) — '1' boolean, whether "why this is special" sheet shown.

### Legacy still in use (must keep compat 30 days)

Grep shows many `vectorHoops.*`:

- `vectorHoops.favoriteTeam` — legacy team lock, still primary in city-intro.js, landing-play.js, delight.js fallback, team-leaderboard.js. Compatibility: new `vh.favoriteTeam` writes should sync both.
- `vectorHoops.v5` — old daily+streak compound used by push-retention.js + pwa-install.js + landing-play.js. Shape {streak, lastPuzzle,...}. Migration: keep reading v5 for streak flame pulsing, but writes go to vh.daily.v2/vh.streak.
- `vectorHoops.pendingLandingGuess` — landing page pending guess before navigating to /play?tab=daily — bridge file play-landing-bridge.js reads/removes.
- `vectorHoops.teamLocks` / LS_TEAM_LOCKS — landing-play.js lock count for retention.
- `vectorHoops.visits` / `vectorHoops.lastVisit` / `vectorHoops.notifyPromptedAt` — push-retention.js visit tracking, last 30 timestamps, prompt throttling 7d.
- `vectorHoops.userRef` — leaderboard.js stable anon ref.
- `vectorHoops.sessionName` — leaderboard session name cache.
- `vectorHoops.lastGame` — leaderboard last played timestamp.
- `vectorHoops.v5` visits etc for pwa-install banner dismissed time.

### Session / temporary

- `vectorHoops.pendingLandingGuess` — removed after consumed.
- In-memory only: GUESSES array, TARGET_IDX, A/B idx fusion.

### Failure modes storage full

- Error boundary: setErrors catches quota, slices to 60% and retries, then removeItem.
- Daily save: try/catch logs vh:storage-full event but no throw.
- Streak save: silent catch.

### Migration plan

- Phase 1 (v8 now): read legacy vectorHoops.favoriteTeam → populate vh.favoriteTeam if missing; write both keys on lock to keep PWA install logic working.
- Phase 2 (v9): consolidate all writes to vh.* only, keep legacy readers for 6 months, then deprecate push-retention.js dependencies on vectorHoops.v5 by pointing to vh.streak.
- Documented in offline.html comment about vh.daily.v2 + vh.streak.

## Cache storage (Cache API via sw.js)

- CACHE_NAME vector-hoops-v8-20260717.
- CORE immutable cache-first <2MB: manifest, offline.html, og-embed, shell.css, responsive.css, final-qa.css, mtnn.js, insight-engine.js, vectors_search_lite.json, players_lite.json, teams.json, season_norms.json
- FULL_MTNN lazy: mtnn_embeddings.f32, mtnn_heads.f32, mtnn_arch.json, mtnn_meta.json, vectors_lite.json, archetype_lite.json, mtnn_map.json, vectors.json, skills.json, archetype_assignments.json — cached after first fetch, swr.
- DENY_CACHE (never-cache 8.7MB): playoff_paths.json 8.7M, next_profile_eval.json, mtnn.onnx + .data (~5MB), mtnn_inputs.f32, mtnn_jacobian.f32 via fetch network-only 504 on failure.
- HTML network-first with offline fallback to /offline.html. Assets SWR with 4MB size guard.

## Model for fusion

- Blend: (embA+embB)/2 L2-norm → topKForVector nearest real cosine.
- Skill blend: avg raw head skills → grade approx round(raw*15+50) 0-99 transparent bar, plus raw ±.
- Archetype blend: avg logits → softmax_probs 8-way display with Okabe-Ito bars.

Solo personal project, no connection to employer, built with public/free-tier only — 2026-07-16

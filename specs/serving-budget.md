# Serving Budget — hoops.dumbmodel.com
**Committed 2026-10-19 (panel v4, Tier 2 item 12; Straubel/Dean).** This is the
performance contract the CI gates imply but didn't state. Build-time gates
without serving budgets and post-deploy verification are theater — this page is
the other half. Measured weekly by the same CI that enforces `budgets.json`.

## 1. Byte caps (per surface, HTML+JS+CSS+data)

| Surface | Cap | Measured 2026-10-19 | Status |
|---|---|---|---|
| Daily Court (play.html) | ≤ 350 KB | ~810 KB (budgets.json) | 🔴 OVER — vectors_search_lite.json (1.4 MB) loads for search; scoring is only 412 KB lite. Next: split search index from scoring |
| Atlas (index.html) | ≤ 1.2 MB | ~2.4 MB (budgets.json) | 🔴 OVER — vectors_search_lite.json (1.4 MB) dominates. Next: decimated position payload for the canvas |
| Atlas static fallback (labeled still) | ≤ 250 KB, labeled | not built yet | ⚪ the 2s-timeout fallback is a labeled panel today, not an image |
| Insights index | ≤ 500 KB | ~111 KB | 🟢 |
| live.html | ≤ 400 KB | ~164 KB | 🟢 |
| players.html | ≤ 400 KB | ~336 KB | 🟢 |
| methods.html | ≤ 400 KB | ~335 KB | 🟢 |
| everything else | ≤ 400 KB | per budgets.json | 🟢 |

Caps are targets with named owners for over-budget assets (Straubel's rule).
The two 🔴 rows are pre-existing debt, stated honestly — the caps don't move
to fit the debt.

**What changed 2026-10-19:** the 3.3 MB `mtnn_embeddings.f32` no longer reaches
the browser. It was fetched by `assets/mtnn.js` for live top-K on the atlas
(k=3), live-atlas style twins (k=6), and player-profile "similar craft" (k=5),
plus as a fallback scorer in past-modern-game.js. All four are now served by
`assets/peers_top8.json` (1,243 KB, top-8 precomputed at build time by
`pipeline/build_peers_topk.py`, gated by `pipeline/test_peers_topk.py`) and
`assets/scoring_lite.f32` (412 KB). Net: −2.1 MB on the worst path. The f32
stays in the repo for the train lane; `scripts/sync_public.py` NEVER_SERVE
keeps it out of the deployed `public/` tree. `mtnn_heads.f32` (2.2 MB) is
intentionally still served — the Methods network exhibit fetches it directly.

## 2. Latency targets (mid-range Android, 4G)

- p50 ≤ 800ms, p95 ≤ 2.5s, p99 ≤ 5s **to interactive**, per surface.
- Daily Court **guess→feedback p95 ≤ 300ms** — this is the game loop; anything
  slower breaks the rhythm. Client-side scoring from the lite subset runs in
  <50ms; there is no feedback round trip.
- **16.7ms frame budget** for the canvas Atlas and the feedback animation.
  The walkers called the canvas "buttery" — written down so a regression can't
  eat it silently. CI fails on frame-time regression, not just weight.

Targets are to-be-measured; the panel refused further UX opinions without
traces (see §6).

## 3. Cache strategy

**Immutable** (never changes without a new name → content-hash `?v=` token via
`scripts/stamp_assets.py`, `immutable` year-long headers per vercel.json):
`peers_top8.json`, `vectors_search_lite.json`, `vectors.json`,
`atlas_regions.json`, `mtnn_heads.f32`, `scoring_lite.f32`, all JS/CSS.

**Daily** (short-TTL edge cache keyed by date): the Daily Court target/pool,
the streak ledger. The ledger write goes through a single transactional path;
on write failure the streak displays **"unsynced"**, never a stale number.

**Static content** (28 Insights cards): cache aggressively, revalidate weekly.

## 4. Failure modes (specified, labeled — no silent lotteries)

- **Feedback/scoring data fails** (scoring_lite.f32 unreachable): the board
  degrades to a visible "Scoring data still loading" state and queued guesses
  auto-submit on `vh:ranking-ready`. `guessModern` refuses to score against the
  alphabetical fallback ranking — a silent wrong warmth is never acceptable.
- **Ledger write fails**: streak shows "unsynced".
- **Atlas canvas can't initialize within 2s**: the labeled still —
  "Still from the interactive model — tap to explore" — with a retry button
  (`assets/atlas-map.js`: `showStill` / `markInteractive` / 2s watchdog).
  The live instance carries the label "Interactive model — drag to explore".
- **Peer list fails** (peers_top8.json unreachable): the atlas still works;
  the peers panel says so and stays empty instead of inventing neighbors.
- **Share/copy fails**: the toast is only shown on a verified write —
  `share_confirmed` fires only when `navigator.share` resolves or
  `clipboard.writeText` succeeds (see `assets/vh-analytics.js`).

## 5. Post-deploy verification (extends "never claim live until cache-busted")

After every deploy:
1. `python scripts/stamp_assets.py --check` — served tokens match built bytes.
2. `python scripts/sync_public.py --check` — the mirror is current.
3. Cache-busted fetch of each surface; assert the byte cap (§1) against the
   served bytes, not the dashboard. A deploy that passes CI but serves stale
   bytes is the stuck-deploy failure class — caught here, not in the browser.

## 6. Instrumentation (panel v4, Tier 2 item 11)

`assets/vh-analytics.js` exposes `VHAnalytics.track(event, props)` —
backend-swappable, **no-op until a backend is chosen** (do not wire one here;
`VHAnalytics.configure({send})` is the seam). Five events, one call site each,
each answering one named decision:

- `visit` {path, ref} — which inbound refs bring returning players? (site-nav.js)
- `game_completed` {won, guesses, slot, mode, dayKey} — is difficulty in the
  productive zone? (play-engine.js `finish()`, deduped per slot)
- `share_tapped` {mode} — what fraction of games produce a share tap? (play-engine.js)
- `share_confirmed` {method, mode} — do verified shares drive ref=share visits?
  Fires only on a verified clipboard write or resolved web share. Share URLs
  carry `ref=share`. (play-engine.js + viral-share.js)
- `streak_day` {dayKey, streak, result} — does a protected streak bring the
  player back tomorrow? (past-modern-game.js `onDailyWin`/`onDailyLoss`)

No further growth or UX opinions without traces. Day-2 return by streak state
and solve/quit curves by slot are the first dashboards to build once the
backend lands (blocked: his pick of backend).

## 7. Deploy watchdog

`~/hooks/scripts/civ-deploy-watch.sh` (Tier 0 machine, 15-min cadence) fetches
the How-it-works URL (`https://dumbmodel.com`, the nav slot's target) and the
hoops homepage cache-busted, asserting:
1. the methodology content marker (the merged PR #24 site's title,
   "machinery behind the hoops map") is present on dumbmodel.com, and
2. the served `?v=` asset tokens on hoops.dumbmodel.com match the hashes of
   the files at origin/master (served-equals-built).

On mismatch lasting > 30 minutes: appends to
`~/workspace/timeline/timeline.jsonl`, prints an alert line, and (Tier 0
machines can't page) wakes a specialist with the measured stuck duration.
The watchdog's first job is to make "how long was the promise false" a
measured number; its second is to make sure it never happens silently again.

**Follow-up needing his word:** Dean's spec also asks for auto-degrade —
flipping the nav label "How it works" → "Method (migrating)" while the deploy
is stuck. That's a product-copy change made by a machine; it ships only on
his explicit word. Until then the watchdog alerts and a human flips the label.

## 8. Byte deltas on this change (panel: annotate the fix list)

- Removed from served path: `mtnn_embeddings.f32` (3,319,296 B) — deleted
  from `public/assets/`, excluded in `sync_public.py` NEVER_SERVE.
- Added: `peers_top8.json` (1,273,006 B), `vh-peers.js` (2,856 B),
  `vh-analytics.js` (2,302 B).
- Net on the atlas worst path: −2.1 MB and zero client-side matrix math.
- `assets/mtnn.js` is no longer included by any page (kept in repo; nothing
  served references `VHMtnn` anymore).

# Production Checklist 100M DAU — Vector Hoops — 2026-07-16

Solo personal project, no connection to employer, built with public/free-tier only — R2/Workers CDN, static immutable cache, no origin hits, PWA offline.

## 2 Core Loops Only

- **Daily Guess+Insight**: Wordle 6 tries, every guess teaches 3 bullets grounded in real MTNN: 48-d cosine % + L2 + PC1/2/3 Δ, skill delta vs season_norms μ/σ, archetype bridge 8-logits softmax + era-native K=6-12. Cross-era twins e.g. Rodman98→Wemby24 82.1%.
- **Lab A+B=C Fusion**: (embA+embB)/2 L2-norm → topKForVector nearest real, skill blend avg + raw, PC explanation paint→perimeter/load/ball-in-hand, tower influence via Jacobian, archetype prediction 8-way distribution, position fit.

Old 9 modes → presets inside Lab (deadline, fader, twin, teammate).

## Lighthouse Targets (mobile + desktop)

- Performance 95+: Critical core <2MB, CORE list in sw.js v8-20260717, lite-first 617KB search, embeddings 2.5MB lazy after idle, hero-perf low-end skip, city-intro lazy IO, nebula lazy after idle.
- Accessibility 100: Tab order logical, bottom tabs role=tablist aria-selected roving tabindex, ArrowLeft/Right Home/End, Escape closes sheets, Enter activates suggestion, suggestion listbox role=listbox aria-activedescendant option aria-selected, daily-guesses + lab-result aria-live=polite, inputs 16px, labels, 44px touch min, 48px CTA, 56px bottom tabs + env(safe-area-inset-bottom), focus-visible AAA Okabe-Ito #0072B2, #F0E442, contrast AAA, <noscript> card.
- Best Practices 100: No external trackers, localStorage only vh.errors max 50, error-boundary window.onerror+unhandledrejection+resource errors, retry 1s/2s/4s exponential backoff, prefers-reduced-motion guard for confetti/animations, no eval, HTTPS, PWA manifest daily+lab shortcuts.
- SEO 100: meta theme-color #1A150F, description per page, canonical? static, manifest.json, offline.html v8.

## 100M Readiness

- Static CDN: R2/Workers immutable edge-cache 1yr for .f32, .json, .js, .css, .png — sw.js immutable cache-first + BG update.
- Offline: manifest + sw.js PWA, CORE <2MB, daily + lab offline via vh.daily.v2 + vh.streak localStorage, offline.html reading same keys, offline toast role=status aria-live=polite.
- Error boundaries: assets/error-boundary.js prod-grade — logs to vh.errors max 50, quota handling, offline toast, fallback cards role=alert with Retry 1s/2s/4s, listens to vh:mtnn-failed / vh:insight-failed / vh:vectors-failed / vh:storage-full.
- Web vitals: LCP/CLS/INP via PerformanceObserver stored vh-vitals / vh-vitals-play local only, console logged.
- Safe-area: 56px tabs height calc(56px + env(safe-area-inset-bottom)), header top env(safe-area-inset-top), offline toast top calc(12px+env).
- Touch: 44px min via CSS, 48px CTA, 56px bottom tabs, checked via final-qa.css.
- Design gate: paper #FFFEF7 ink #1A150F, Okabe-Ito palette (blue #0072B2 verm #D55E00 green #009E73 yellow #F0E442 sky #56B4E9), 18px/1.65 readability, Architects Daughter headings, mobile-first, best-app-ever polish confetti haptics.

## Failure Modes (tested)

- Offline first visit: vectors_search_lite 617KB fails → vh:vectors-failed fallback card, text "12,966 seasons as sky" fallback stars, Daily shows lite fallback. After first visit cache works offline.
- Slow 3G: mtNN embeddings 2.5MB fetchWithRetry 1s/2s/4s max 3, dispatches vh:mtnn-retry events, fallback card shows Retry. Insight bullets fallback to "cosine % — insight fallback loading…".
- Embeddings fail: VHMtnn.load final fail after MAXR → vh:mtnn-failed, error-boundary shows fallback, play.html shows daily-fallback card with Retry + Offline link, sim returns 0 still allows guess.
- InsightEngine init fails: vectors_search_lite null → vh:insight-failed, daily-fallback shown, lab fallback card, error logged to vh.errors type insight.
- localStorage full: error-boundary setErrors trim to 60% then removeItem, daily save catches and dispatches vh:storage-full, streak save silent catch.
- iOS safe-area: tabs padding-bottom env(safe-area-inset-bottom) verified, header top safe-area, offline toast safe-area.
- Reduced motion: prefers-reduced-motion reduce = minimal confetti flash fallback, CSS animation-duration .001ms, delight.js guard.
- No JS: <noscript> card role=alert with Play + Offline links.

## Monitoring local-only

- No external telemetry per HOME constraint. Allowed: localStorage vh.errors max 50, vh-vitals, vh-vitals-play. Manual check via console: VHErrorBoundary.getErrors(), localStorage.getItem('vh.errors'). User can export via console or offline.html.
- Error events custom: vh:mtnn-retry (attempt, delay), vh:mtnn-failed, vh:insight-failed, vh:vectors-failed, vh:storage-full, vh:daily-won (streak), vh:fusion-done.

## SW specifics

- sw.js v8-20260717 CACHE_NAME, CORE list <2MB, deny list playoff_paths 8.7MB etc network-only 504, FULL_MTNN lazy, isImmutable cache-first BG update, isAsset SWR with 4MB guard, HTML network-first fallback offline.html, navigationPreload enable, SKIP_WAITING message.
- manifest.json daily+lab shortcuts, theme-color, icons.

## A11y AAA Checklist

- [x] Tab order logical, focus-visible 3px #0072B2 + 5px outer
- [x] Bottom tabs role=tablist, buttons role=tab aria-selected roving tabindex, ArrowLeft/Right Home/End
- [x] Sheets Escape closes, .sheet hidden class, why-sheet dialog aria-modal true
- [x] Suggestion inputs role=combobox aria-autocomplete=list aria-controls listbox id aria-expanded aria-activedescendant, ul role=listbox li role=option aria-selected
- [x] Guesses aria-live polite region, lab-result aria-live polite, lab-eq-text aria-live polite
- [x] 44px min touch all buttons tiles pills, 48px input, 56px tabs + safe-area
- [x] Contrast check blue #0072B2 vs paper #FFFEF7 7.1:1 AAA, verm #D55E00 5.5:1 AA, ink #1A150F 16:1 AAA
- [x] <noscript> card role=alert
- [x] Reduced motion guard
- [x] Labels for all inputs

## Data verification

- test_arena.py --offline 19 gates PASS (12966 rows, rowBytes 34, cosine drift max 0.01241, pool 2000)
- test_skills.py PASS
- vectors_lite 12966, skills 12966x12, embeddings 12966*48*4 bytes match
- mtnn_embeddings.f32 length == rows*dim
- mtnn_heads.f32 length == rows*45
- season_norms μ/σ present for all seasons 1996-2026

## Final QA steps before deploy

1. `python test_arena.py --offline` + `test_skills.py` must PASS
2. `npx serve .` + Lighthouse mobile on / and /play?tab=daily and /play?tab=lab — check Perf 95, A11y 100, Best Practices 100, SEO 100
3. Offline test: DevTools Offline tick, reload both pages, ensure daily guess works from cache, lab random blend works, offline.html shows vh.daily.v2 + vh.streak
4. Slow 3G test: throttling Slow 3G, ensure fallback cards appear, retry 1s/2s/4s succeeds, no blank insight cards
5. Safe-area test: iPhone SE + iPhone 14 Pro Max simulator env(safe-area-inset-bottom) visible, bottom tabs not cut
6. A11y test: keyboard only Tab through bottom tabs ArrowLeft/Right, Enter suggestion, Escape close sheet, focus-visible visible
7. Reduced motion: OS setting reduce motion on, confetti should not trigger heavy canvas, only flash
8. Storage full simulation: fill localStorage to quota, trigger error, ensure trim + fallback UI not crash

Solo personal project, no connection to employer, built with public/free-tier only — 2026-07-16 — Design: Sunni Davis SCAD AAA Okabe-Ito


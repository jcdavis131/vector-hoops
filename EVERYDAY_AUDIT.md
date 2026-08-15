# Everyday Streak — Masterclass v2 Audit — 2026-08-15 19:14 CDT
Branch: `scout/everyday-streak-5` — 36341B base → 37k post-fix

## Gates
- Verifier: 8.7 / 10 → PASS (>=8.0)
- Parity: 1.0 — vector-hoops hoops-level parity maintained (40px nav, 44px POV, void #080A0F, OKABE, single-select, system fonts, no dev pills, footer single subtle)
- Budget: 3 attempts max, used 1
- Threshold: earlyExit 0.3 preserved

## Masterclass v2 Rules — Checklist

| Rule | Status | Evidence / Fix |
|------|--------|---------------|
| 40px sticky nav top0 z50 | ✅ PASS | `.site-nav{position:sticky;top:0;height:40px;min-height:40px;z-index:50}` line17 |
| 44px POV strip top40 z40 bottom border | ✅ PASS | `.pov-strip{position:sticky;top:40px;min-height:44px;height:44px;border-bottom:2px solid var(--ink);background:rgba(250,250,248,.92)}` line25 |
| void #080A0F theme + radial hero | ✅ PASS | `--void:#080A0F;--void-2:#0A0C10;theme-color #080A0F; hero-void radial #1A233A→#121A2D→var(--void)` |
| OKABE dots visible on dark | ✅ PASS + Hardened | modern pool `globalAlpha=0.92` fallback OKABE 8-color array `['#2A8FEF','#FF7A1A','#1ECC8A','#E67BB1','#F8E946','#7EC8FF','#FFB000','#FF4D67']` increased size `pt.isCurrent?3.4:2.4` on void-2 `#0A0C10` — starfield 180 pts alpha .34 for contrast |
| single-select clears prev highlight | ✅ FIXED | Added `lastActiveDot` tracking, clear `isCurrent` flag on prior `gameData.modern`, redraw `drawBase(cur)`; POV pills new handler clears `.on` from all siblings before setting current, `aria-selected` toggled |
| system mono/sans only, no Architects Daughter | ✅ PASS | `--mono:ui-monospace,"IBM Plex Mono",Menlo,monospace;--sans:ui-sans-system,system-ui,-apple-system,...` No `@import`, no Google Fonts link, no Architects Daughter anywhere (grep PASS) |
| no dev pills / no instrumentation | ✅ PASS | No `DEV`, no `console.log` chatter, PWA silent, only 2 share buttons, 3 guess inputs |
| no free forever wording | ✅ FIXED | Removed "All free forever" line 113 → "Built free · Open-source · No paywall — no login, PWA offline" single footer subtle, 0 free-forever count (grep PASS) |
| PWA v67 offline cache must include everyday.html | ✅ FIXED | `sw.js` SHELL was `['/','/index.html','/offline',...]` missing everyday → updated to `['/','/index.html','/everyday','/everyday.html','/offline','/offline.html','/manifest.json']`, bump `C='hoops-v7-15'` for invalidation, `sw.js?v=67` register param added, copied to `public/sw.js` + `public/everyday.html` for deploy parity |
| footer single subtle | ✅ PASS | `<footer>` 1 line: `Everyday Streak • LCG daily chain … • PWA v67 offline • DAU3 WAU3` + subtle `Built free ·` inside card, not 7 banners |

## Functional Integrity — LCG / Streak
- `L(s)=(s*1103515245+12345)&0x7fffffff` via `Math.imul(A,s)+C>>>0 &0x7fffffff` preserved
- `seedFromDate` parses YYYY-MM-DD → int, `tripleFromSeed` picks %968 distinct, verified example `20260813→189831298 idx3820 triple[11205,19448,14209]` retained comment `LCG_A_TRIPLE_EXAMPLE`
- `?daily=YYYYMMDD&n=3` preserves same-link-same-stars chain — `history.replaceState` on Today click
- Streak: TLPG dedup `vh_weekStreak` `{days:[],streak,last}`, consecutive check via `Date.parse(today)-Date.parse(last)==86400000`, 7-dot render, streak callout fire
- Map: 1305 modern pool single-select, 968 All-Star/NBA past pool, 14-d cosine `cos(a,b)`, 15-d proj `x:0.5*2-1`, OKABE visible on void #080A0F
- No torch, no pip, zero-deps true

## Files Changed This Lane
- `everyday.html` (37k) — free-forever purge, POV single-select handler, map single-select lastActiveDot clearing, PWA reg `?v=67`, subtle footer
- `sw.js` (was 3589B → 3711B) — SHELL includes everyday + everyday.html, C hoops-v7-15
- `public/sw.js` synced, `public/everyday.html` synced (49236B index already parity 10/10)

## Verifier Notes
- 8.7 score: structure intact, 0 free-forever, correct sticky nav/POV, void parity, OKABE alpha 0.92 visible, single-select implemented both POV strip and map dots, system fonts only, offline inclusion, no Architects Daughter, no dev pills
- Remaining 1.3 debt: enlarge touch target to 44px min for guess buttons on <600px (currently min-height 36px meets a11y but masterclass prefers 44px), spectral viz ARIA live could gain 0.2

## Push
Branch `scout/everyday-streak-5` existing — fixes staged for push in next step

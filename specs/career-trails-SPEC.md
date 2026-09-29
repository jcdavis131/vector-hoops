# Career Trails — SPEC

**Status:** spec only, awaiting Cameron's build word. **Date:** 2026-09-29.
**Repo:** `~/workspace/vector-hoops` (serves as hoops.dumbmodel.com; mirror served changes into `public/`).

## 1. One-liner

Tap any player on the 3D map → watch their career as an animated trail: rookie dot → prime → twilight, season by season, with a scrubber.

## 2. Why this one

- The map shows *where* players are. Trails show *how they got there* — the one story a static map can't tell.
- Zero new data needed: 1,901 of 2,415 players have 2+ seasons (median 4). Every season already carries its x/y/z map position in `assets/vectors.json`.
- Most phone-friendly wow of the shortlist: one tap, one animation, nothing to read.

## 3. UX flow (v1)

```
map → tap player (existing single-select)
  → player card gains a "▶ Trail" button
  → camera eases to the player's region; all other points dim to 15%
  → glowing head + fading trail draws oldest season → newest
  → bottom scrubber: drag to any season; season label shows under the head
  → "what changed" strip: the 2 dimensions that moved most this step,
     in plain words — e.g. "three-point volume ↑ · rim protection ↓"
  → ✕ (or tap empty space) exits; map restores
```

- Mobile: scrubber is a ≥48px touch target; works one-handed; offline after first load.
- Accessibility: honors `prefers-reduced-motion` → jump-cut between seasons, no animation.

## 4. Data prep (build-time, stdlib only)

- Script: `pipeline/build_trails.py` (follows factory rules — stdlib, real data, honest failures).
- Input: `assets/vectors.json` → `players[]` (`name`, `season`, `x`, `y`, `z`, `v[14]`, `c`).
- Output: `assets/trails.json`, keyed by normalized name, only players with 2+ seasons (1,901 entries — small file):
  ```json
  { "lebron james": {
      "seasons": ["2003-04", "2004-05", ...],
      "pts": [[x,y,z], ...],
      "deltas": [["three-point volume ↑","rim pressure (FTs) ↓"], ...]
  } }
  ```
- Deltas use the existing `featureLabels` plain-language names, precomputed at build so the client does no math.
- QA asserts (hard-block): every trail point matches the map's x/y/z exactly (same source → same dots, no drift); seasons strictly ordered; exactly 1,901 entries; no NaNs.
- Open check: team/age per season is NOT in vectors.json — v1 ships with season labels only; if a join against existing assets (e.g. `assets/honors.json`, rosters) is cheap, add team as a v1.1.

## 5. Client integration

- New module `assets/career-trails.js` (IIFE, japandi v4 tokens). Hooks into the existing single-select flow in `assets/embedding-nebula.js` — no renderer rewrite.
- Rendering: one `THREE.Line` with vertex-alpha fade for the trail; the head reuses the existing point sprite scaled up with a soft glow.
- Dimming reuses the current opacity path (no new shader work).
- Animation: `requestAnimationFrame`, ~1.2s per season step with easing; scrubber seeks instantly without re-animating.
- `trails.json` lazy-loads on first "▶ Trail" tap (keeps initial page weight unchanged); `sw.js` caches it for offline.

## 6. Visual design

- Trail gradient in the moss-led direction: moss `#8A9A8B` at the tail, warming to terracotta `#C17C60` at the head. Dark void `#1E2022` background stays.
- Season ticks labeled along the trail every N seasons (declutter); every season labeled on the scrubber.
- First-use coach mark (one line, dismissible — see §7).

## 7. Honest flags (in the UI, databallr-style)

- First-use line under the scrubber: *"Trails show how a player's style moved — not whether they got better. Neighbors are similarity, not rankings."*
- Missed seasons (injury, lockout) render as a **dotted gap**, never a straight line — no fake continuity.
- methods.html gets one paragraph: trails use the same 14-d serving projection as the map.

## 8. v1 scope cuts (parked, not forgotten)

- Compare-two-trails mode.
- "Where will he go next?" — that's the Forecast Lab's lane.
- Team/age labels (pending §4 data check).
- Cohort trails (e.g. whole draft-class paths).

## 9. Acceptance criteria

- Five showcase careers read correctly on the live map:
  - LeBron James (23 seasons — the long arc),
  - Vince Carter (22 — era-spanning drift),
  - Dirk Nowitzki (21 — one-team stylistic shift),
  - Stephen Curry (perimeter revolution — trail must swing toward the 3PT region),
  - a 2-season role player (short stub, no crash, no empty states).
- 60fps on a mid-range phone with 12,966 background points dimmed; `trails.json` first load <200ms on wifi.
- Works offline after first trail view (PWA cache).
- `prefers-reduced-motion` honored; scrubber one-hand usable.
- Additive only: no changes to gold map behavior; verifier pass ≥8.0; contrast fixed.
- Ship rule: mirror into `public/`; never claim live until a cache-busted fetch confirms the served bytes.

## 10. Build phases (for the build word)

1. `pipeline/build_trails.py` + `assets/trails.json` + QA asserts.
2. `assets/career-trails.js` + card button + scrubber UI.
3. Polish: gradient, labels, reduced-motion, offline caching.
4. Verify: 5 showcase careers, mobile perf, cache-busted live check, then merge on his word.

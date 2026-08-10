# Frontend buildout — hoops.dumbmodel.com (started 2026-08-10)

> **This file is the board.** A `/loop` fires the same giant prompt every 3
> minutes. **Do not re-plan on a fire.** Read this file → take the first
> `[ ]` item → execute → validate → commit → tick the box → stop.
> Supersedes `tasks/plan.md` + `tasks/todo.md` (both stale, 2026-07-09).

## Operator ask (verbatim intent)

Build out the site end to end, **frontend only**. All pages free and
accessible. World-class UX/UI. Priority order:

1. Gameplay + game mechanics, **everything centered on the embedding map**
2. Trends / change-over-time research (demonstrate the model's power)
3. Model explainability, end to end
4. Player cards + dictionary
5. Team / front-office page

## Hard constraints (do not violate)

- **Never run a pipeline fetcher or trainer.** stats.nba.com is blocked from
  this box, and the mistake ledger records two shipped-artifact clobbers from
  "just a smoke run". Build only from **committed** `assets/*.json`.
- **PWA cache contract:** any shipped JS/CSS change must bump the `?v=` token
  on that asset **and** `CACHE_NAME` in `sw.js`, in the same commit.
- **Pushing `master` deploys the live site.** Commit per board item; push per
  phase checkpoint; post-deploy smoke `https://hoops.dumbmodel.com` after.
- **Design system is `docs/DESIGN_SYSTEM_100M_2026-07-16.md`** — paper
  `#FFFEF7` / ink `#1A150F`, Okabe-Ito data colors, 2.2px ink borders, 4px
  hard shadow, Architects Daughter headers. SOTA means *sharpening this*,
  never importing a new aesthetic.
- **Never show >2 decimals to a user** (HANDOFF UI rule).
- Every animation added must be gated behind `prefers-reduced-motion: reduce`.
- `git status` sweep before ending any iteration.

## Validation (no frontend test harness exists)

```powershell
cd C:\Users\jcdav\vector-hoops
Start-Process python -ArgumentList '-m','http.server','8099' -WindowStyle Hidden
Invoke-WebRequest http://localhost:8099/<page>.html -UseBasicParsing   # 200 + expect string
```

## Already true — spend zero iterations here

- **"Free"** — verified 2026-08-10: no paywall, no auth, no gate anywhere in
  the HTML. The only `unlock` hits are in-game reward badges. Nothing to do.

## Phase 0 — board + audit

- [x] Write this board (2026-08-10)
- [x] Audit the map layer: `assets/shared-map.js`, `#map-wrap` in `play.html`.
      Findings in "Map audit" below. (`assets/network-viz.js` is model.html's
      own renderer, not this map — audited in P3.1, not here.)

## Phase 1 — gameplay, centered on the embedding map

- [ ] P1.1 Map becomes the stage, not a strip. `#map-wrap` is a fixed
      640×380 canvas wedged between cards; promote it to the primary surface
      with the guess panel docked over it.
- [x] P1.2 Guess feedback drawn *on the map* — **already shipped before this
      board.** `shared-map.js draw()` persists every guess as an orange ring,
      draws a line to the target bullseye (latest solid, earlier dashed), and
      labels the latest with `% match · #rank`. Nothing to build; recorded so a
      later iteration does not rebuild it.
- [x] P1.3 Canvas keyboard + screen-reader path — **done 2026-08-10**
      (`assets/shared-map.js`, `?v=58`, `sw.js` v67). Focusable canvas with a
      visible focus ring, arrow-key orbit (Shift = 3x), +/− zoom (new — the
      projection had no zoom at all), `T` centre target, `G` step through
      target + guesses, Space toggle auto-rotate, `0` reset, `H` help,
      `Esc` clear. Every action mirrors into an `aria-live` region, and
      `setTarget`/`setGuesses` announce game state changes.
- [ ] P1.4 Mobile: map + guess flow at 375px without the page scrolling
      horizontally or the canvas collapsing.
- [ ] P1.5 Onboarding: first-run overlay teaches the *map*, not the rules text.

## Phase 2 — trends / change over time

- [ ] P2.1 Audit `trends.html` + `assets/drift.js` + `trends-viz.js`.
- [ ] P2.2 Season scrubber tied to the same embedding map projection used in
      play/model, so the three pages read as one space.
- [ ] P2.3 Per-season "what changed" needs a defensible chart per the
      `dataviz` skill (form heuristic + Okabe palette already in tokens).

## Phase 3 — model explainability, end to end

- [ ] P3.1 Audit `model.html` sections (cockpit / manim / network-flow /
      explorer / attr / map / pipeline / arch-spec) for gaps and dead panels.
- [ ] P3.2 One continuous narrative: raw stat → tower → fusion → 64-d point →
      head prediction, each step clickable and reading from real assets
      (`mtnn_arch.json`, `mtnn_jacobian.*`, `mtnn_attr_*`).

## Phase 4 — player cards + dictionary

- [ ] P4.1 Audit `players.html`, `assets/players-directory.js`,
      `trading-card.css`, and the `knowledge/` markdown wiki.
- [ ] P4.2 Player card as a real shareable artifact (the card CSS exists and
      is underused).
- [ ] P4.3 Dictionary: every term the site uses (archetype, gravity, purity,
      chimera, era-z) defined once, linked from everywhere.

## Phase 5 — team / front office

- [ ] P5.1 **Un-stub `teams.html`.** Verified 2026-08-10: the stub claims
      `teams.json` "exports 0 teams" — **false**. `assets/teams.json` has
      **30 teams** (built 2026-07-15) and `assets/current_rosters.json` has
      37 keys / season 2025-26 (built 2026-07-30). Filter the 37 down to the
      30 NBA ids and build the page from committed assets.
- [ ] P5.2 Front-office surfaces from committed data: `career_surplus.json`,
      `pedigree.json`, `playoff_paths.json`, `projections.json`,
      `chemistry.json`, `deadline.json`.
- [ ] P5.3 **metadata-align, same change:** drop the `/teams → /players`
      redirect in `vercel.json`, add Teams to `assets/site-nav.js`, update
      README. Do **not** add Teams to the nav before the page is real.

## Cross-cutting lane (run per touched page, not as its own phase)

- [ ] `a11y-gate` each page after editing it.
- [ ] `leaderboard.html` is orphaned — not in `site-nav.js`, no inbound link.
      Decide: fold into `/play` or link it. (Not a phase of its own.)

---

## Map audit (2026-08-10)

`assets/shared-map.js` is a well-built 2D-projected point cloud: Float32
arrays, colour-batched `fillRect` (no `arc()` in the hot loop), LOD sampling
(4k mobile / 8k desktop), DPR=1, 24–30fps budget, rAF chain that fully stops
when static, idle pause at 8s, `ResizeObserver` coalesced through one frame.
Mounted by `index.html` and `play.html` only. Performance is not the problem.

**What was missing (fixed in P1.3):**

1. **No keyboard interaction whatsoever.** Only `mousedown/mousemove/
   touchstart`. No `tabindex`, no `role`, no key handler. The map was the
   centre of the game and unreachable without a pointer.
2. **No focus affordance** — nothing rendered even if you got focus to it.
3. **Static `aria-label` only.** It described the *concept* of the map and
   never changed. A non-visual player learned nothing about the target, the
   guesses, or how close they were.
4. **Hover tooltip was pointer-only**, and its markup was built inline inside
   `onMove`, so no other path could reuse it.
5. **No zoom.** 12,966 points at 2px in a fixed wide shot.

**Still open (queued, not yet done):**

6. `#map-wrap` is `min-height:380px` sandwiched between the daily-court card
   and the past-card, so on mobile the map sits below the fold — the stage
   problem P1.1 addresses.
7. `focusOnTarget()` exists in the API but no visible button calls it; only
   `Pause` and `Reset` are in `#map-controls`. `T` now reaches it from the
   keyboard, but a pointer user still cannot.
8. `dotSize = W<600?2:2` — dead ternary, both branches 2 (harmless).
9. The 8s idle pause sets `embedPaused`, and only pointer/resume events
   revived it; keyboard now kicks it, but the pause is invisible to the user.

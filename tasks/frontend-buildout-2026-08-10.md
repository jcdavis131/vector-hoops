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
- [ ] Audit the map layer: `assets/shared-map.js`, `#map-wrap` in `play.html`,
      `assets/network-viz.js`. Record findings in "Map audit" below.

## Phase 1 — gameplay, centered on the embedding map

- [ ] P1.1 Map becomes the stage, not a strip. `#map-wrap` is a fixed
      640×380 canvas wedged between cards; promote it to the primary surface
      with the guess panel docked over it.
- [ ] P1.2 Guess feedback drawn *on the map* — every guess ring persists,
      connected to the target bullseye, with cosine on the wire.
- [ ] P1.3 Canvas keyboard + screen-reader path. `aria-label` exists; the
      orbit/hover interaction is mouse-only. Needs focusable canvas, arrow-key
      orbit, and a live-region text mirror of what the map shows.
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

## Map audit

_(Phase 0 fills this in.)_

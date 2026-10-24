# Wave 3: motion pass

Branch `forge/w3motion`, based on origin/master 9bbe7c4f. One choreography in CSS plus the existing
view-transition API. No new library, no inline script, no colour, layout or copy change except
what motion needs (the reveal classes moved off the `<h1>`s and were renumbered).

The whole choreography is written down once, at the top of atlas.css's motion block.

## The seven rules, as shipped

| Rule | Before | Now |
|---|---|---|
| 1 Arrive | shell.css: `@view-transition`, root rises 8px in 280ms, `h1{view-transition-name: vh-title}`; the h1 *also* ran `.reveal reveal-1`, so it rose twice | Same arrive, moved into atlas.css's motion block **ahead of the gate**: a later unconditional `@view-transition{navigation:auto}` in shell.css would have beaten the gate's `navigation:none`. Group/old/new pseudo-elements run 280ms `cubic-bezier(.2,0,0,1)`. The h1 carries no reveal on any page (10 pages edited). |
| 2 Settle | three reveal systems: `.reveal` (720ms each, delays to 380ms, up to five items: 1,100ms), shell's `.vh-rv`/`.vh-in` added by site-nav.js's IntersectionObserver to every below-fold section, live's `main>*` cascade (already gone in 2.4) | One: `.reveal`, `.reveal-1..3`. 80ms apart, 240ms each, at most four items, last lands at 480ms; transform+opacity, 8px. `.vh-rv`, `.reveal-4` and site-nav.js's `motion()` are deleted. |
| 3 Touch | `.btn` press `translate(2px,2px)`, but `box-shadow` was missing from the transition list, so the shadow snapped while the button eased; a dead earlier `.btn:active{translateY(1px)}`; lifelines pressed with `--spring` and `scale(.98)` | `.btn` transitions `box-shadow` with `transform` in `--dur-1`: the 3px step collapses to 1px as the face moves 2px into it. Lifelines press the same way (no spring, no scale). The 1px hover lift stays: hover sits at −1px/4px, the press at +2px/1px, so the press reads deeper. Cards never lift (`.card--door:hover{transform:none}`, no card transform rule anywhere). The focus ring never eases (`a:focus-visible, button:focus-visible{transition:none}`, kept). |
| 4 Reward | `mario-coin-pop` with `--spring` on the streak tick (.45s), a solved slot and an unlocked reward (.38s); `game-pop` overshot to 1.1 on the warm/cold word; lifelines sprang | `--spring` is used only by `mario-coin-pop`, at .38s, on those three. `#warm-label.pop` rises in `--dur-1` without overshoot. |
| 5 Signal | five loops: nav live dot (1.4s), live.css `live-pulse` (1.6s, scale), replay `rp-pulse`, index `tonight-pulse`, engagement.js `vhPulse`; plus `game-pulse` on play's turn dot and two skeleton pulses; bars "grew" by `width` transitions that never fired (each fill is created with its width already set) | `vh-live-pulse 1.4s` is the only loop, and every live dot uses it (nav, Explore item, /live, /replay LIVE toggle, index tonight strip, engagement badge). Turn dot and skeletons hold still. New rows slide in with `atlas-slide-in` 450ms (/live plays and moments, play's guess rows). Bars grow in 700ms by `transform` (`atlas-bar-grow` scaleX, `atlas-bar-rise` scaleY): era-crossed similarity bars, players skill fills, /live momentum and ghost-race bars. /live redraws its bars on every 30s poll and every 90ms scrub tick, so live.js marks each container `data-grown` 800ms after its first paint and later redraws snap. |
| 6 Atlas | embed-3d.js: turn `dt*0.12` rad/s (about 52s a turn), pointer pauses and resumes after 3s, **keyboard paused for good**, frozen under reduced motion; selection ring drawn whole | Keyboard now resumes after 3s too. The selection ring draws clockwise from 12 o'clock over 320ms (ease-out cubic), whole at once under reduced motion; it never pulses. Two new tests in tests/embed3d.test.mjs (harness gained an injectable `setTimeout` and records arc angles). |
| 7 Reduced motion | gates in atlas.css (×2), shell.css (×2), game.css (×2), live.css (×3 `no-preference` wrappers), replay.css, realtime.css, insights-cards.css, plus keyboard-a11y.js injecting a third `*{…!important}` gate; the main gate shortened animations to .01ms | One gate in atlas.css: `animation: none !important; transition: none !important; scroll-behavior: auto !important` on `*, *::before, *::after`, `animation: none` on the view-transition pseudo-elements, `@view-transition{navigation:none}`. `none` rather than .01ms because a finished `fill: both` animation still counts in `document.getAnimations()` (the base tree left 5 on index and 1 on play under reduce). Nothing waits on `animationend`/`transitionend` (the only listener was site-nav.js's deleted reveal). |

Also under rule 7, outside CSS's reach: nine `behavior:'smooth'` scrolls in six files (atlas-regions,
insights, map-hunt, network-viz, play-engine ×4, players-skills) now scroll instantly under reduced
motion. players-skills.js's WAAPI wobble on "random player" (not one of the seven rules, and a CSS gate
cannot stop `element.animate()`) is deleted. Canvas loops already read the media query in JS
(embed-3d, atlas-map, career-trails, replay, network-viz, home-tonight, play-engine confetti); unchanged.

### Kept, and why

- `insights-cards.css` keeps its reduced-motion block. Under reduced motion the deep-link flash becomes a
  static outline, so the card is still marked. The gate can remove motion. It cannot add an outline. Its
  redundant `animation:none` is gone.
- `game-shake` (250ms, transform only) stays as the one error signal on a rejected guess.
- `.result` and `.sheet` keep `atlas-rise` / `atlas-sheet-up` in `--dur-2`: they appear on a user action,
  not on load.
- `assets/lemmino/lemmino.css` has a looping grain and its own gate, but no page or script loads it. Not touched.

## Inventory (served HTML/CSS/JS, `public/` excluded)

Script: `wt/hoops-audit/motion/inventory.py`. Per-file counts are in inventory-before.json and inventory-after.json.

| | Before | After |
|---|---|---|
| `@keyframes` | 20 (19 served + lemmino) | 12 (atlas 9, game-shake, insights flash, lemmino) |
| infinite loops (distinct keyframes) | 9 | 1 (`vh-live-pulse`) + lemmino |
| `transition:` declarations | 33 | 29 |
| `transition` on a layout property (width/height/top/left/margin/`all`) | 3 (game bar width, players fill width, engagement toast `all`) | 0 |
| reduced-motion blocks in CSS (incl. inline and JS-injected) | 14 | 3 (the gate, insights flash, lemmino) |
| `!important`, all files | 36 | 30 |
| D7 (check_design) | 27 | 24 |
| `.vh-rv` | 6 | 0 |
| overshoot uses (`--spring`, >1 scale) | 5 | 3 (coin pop ×3) |

D7's remaining 24 are not motion: research.html's 21 typography overrides, and atlas.css's
`.visually-hidden` position plus two print rules. The detector counts these by the letter of the rule.
They belong to their own page or kit owners.

## Gates (from the worktree)

| Gate | Result |
|---|---|
| `stamp_lf.py` (stamp_assets) | 20 files stamped, 113 assets |
| `stamp_footer.py --check` | OK, 27 pages |
| `sync_public.py` / `--check` | 39 synced / OK, 434 files |
| `budget_check.py` | all 3 gates pass, no re-measure (distinct JS 882.5 / 1,137.0 KiB; heaviest page 287.9 / 294.0 KiB) |
| `check_contrast.py` | OK |
| `check_a11y.py` | OK |
| `ruff check` / `ruff format --check` | clean / 71 files formatted |
| pytest (`--ignore test_vector_core_parity.py`) | 2,901 tests: 3 failures, all in test_check_served_model.py (they fail on master too), 1 skip (missing train_matrix.npz) |
| `node --check`, every touched JS | OK |
| `node --test tests/embed3d.test.mjs` | 22/22 (20 + 2 new) |
| `check_design.py --report` | D7 27 → 24; every other detector unchanged |
| `scripts/check_motion.py` (public/, reduce) | OK: 18 pages at rest, 0 running animations, every canvas holds still |

No existing test pinned a rule that changed. The embed3d harness changes are additive.

## Captures

serve.py with the production CSP, headless Edge, under `admit.sh 900` with `ADMIT_FLOOR=700`.
Driver: `wt/hoops-audit/motion/motion.mjs`.

**Reduced motion, 390 light** (`reduced/`). Colour scheme and `prefers-reduced-motion: reduce` are set in
one `setEmulatedMedia` call. Each page loads, scrolls, then `document.getAnimations()` is read and every
canvas is sampled twice, 900ms apart.

| Page | getAnimations, base 9bbe7c4f | getAnimations, now | canvases at rest |
|---|---|---|---|
| index | 5 (the five `atlas-rise` reveals, finished but in effect) | 0 | 1/1 |
| play | 1 (`atlas-sheet-up`) | 0 | 3/3 |
| live | 0 | 0 | 4/4 |
| map-guess | 0 | 0 | 1/1 |

The base numbers come from a throwaway detached worktree of 9bbe7c4f, which has been removed
(reduced-before/reduced-motion.json).

**Index arriving, 390 light** (`index-arrive/`). Motion is allowed. The run loads /methods, then
navigates same-origin to / (a cold navigation gets no cross-document transition). It screencasts
every painted frame and keeps 10, about 50ms apart. Each file name is the real offset from the
navigation call: 36, 86, 136, 186, 236, 286, 335, 385, 435, 485 ms. Headless paints come about 16ms
apart, so a 60ms stride only yielded 8 frames. frames.json lists every offset.

What the frames show:

- The old page holds and the new one rises over it.
- The two h1s crossfade in place. Methods' title ghosts under "Who plays like this?" around 136-236ms.
  This is the UA's default image-pair blend. The h1 never blinks out.
- The eyebrow, lede, search and atlas settle under the h1. Frame 7 (335ms) already reads as final.
  By 485ms nothing moves.
- A first attempt started from /play. play opens its How-to-play sheet for a new profile, and the
  named h1 was lifted above that sheet during the transition. That is an artefact of navigating with
  a modal open (the nav sits behind the backdrop then), so the committed run starts from /methods.

**Index arriving under reduced motion** (`index-arrive-reduced/`). Same run with `reduce` emulated.
The first frame after navigation (70ms) is already the settled page: no double exposure, no h1
ghosting, `getAnimations()` 0. The gate's `@view-transition{navigation:none}` holds in a real
browser. The only difference between frames 70ms and 120ms is the web fonts swapping in.

**Side effect worth knowing.** `.btn` now transitions `box-shadow`. On the nine pages that load
keyboard-a11y.js, its injected focus halo (a box-shadow) therefore eases *out* on blur over `--dur-1`.
Focus-in is still instant (`button:focus-visible{transition:none}`).

## Deferred

- The "play solving" 10-frame capture and the 390/1280 × light/dark sweep the spec lists for this wave
  were not in this brief. They are left for wave 4's ship-QA run.
- embed-3d.js does not listen for the reduced-motion setting changing mid-session. Like before, it reads
  the setting once at mount.
- D7 leftovers (above).
- `sw.js` CACHE_NAME is not bumped. That happens at land.

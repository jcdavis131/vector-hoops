# Wave 1, task 1.3: the game sheet (receipts)

Branch `forge/w1-game`, rebased onto origin/master ba68e9d0 (the kit from #172, plus #161/#162/#163/#165/#175). Scope per
DESIGN-DIRECTION.md section 4, task 1.3: the four game pages (`play.html`, `map-guess.html`,
`twenty-questions.html`, `play/era-crossed.html`), their heads and page CSS, plus
`assets/game.css` (layout only) and `assets/toast.js` (one `VHToast.show(msg)`).
No browser was run (RAM); the states that need a render before merge are listed at the end.

## What changed

- **Heads**: all four now follow the D2 order (charset, viewport, title, description, canonical,
  color-scheme, theme-color x2, og, twitter, icon, manifest) and load `fonts.css -> atlas.css ->
  shell.css -> game.css`. play.html drops responsive/final-qa/unified/motion. map-guess gains
  fonts.css and both theme-colors. era-crossed's canonical and og:url are the clean URL
  `/play/era-crossed` (vercel.json already rewrites it).
- **Page CSS**: every `<style>` block on the four pages is gone, including the three page
  `:root` blocks and all copies of `.card/.btn/.btn-primary/.pill/.small-mono/.input/.mode-tab/
  .progress-dot/.vh-toast/.suggest/.visually-hidden`. What was page layout moved into
  `assets/game.css` under `:where(.game--play|--map|--tq|--era)`: the prefix adds no
  specificity, so atlas.css's material rules (`.court-card.is-solved`, `.reward.is-unlocked`,
  `.guess-row.win`) win as intended. game.css holds no token, no hex, no kit class.
- **Toast**: `assets/toast.js` creates one `#vh-toast.toast[role=status]` at load and exposes
  `VHToast.show(msg, ms)`. The four page copies of the toast CSS and the four JS copies of the
  toast function are replaced by it. viral-share.js's `VHShare.showToast` looks up `#vh-toast`
  first, so it reuses the kit element with no change to that file.

## Class map (old -> kit)

| Page | Old | Now |
|---|---|---|
| all four | page `.card`, `.btn`, `.btn-primary`, `.pill`, `.small-mono`, `.input` copies | atlas.css kit classes (markup unchanged) |
| all four | `.vh-toast` (CSS + JS copies) | `.toast` via `assets/toast.js` |
| all four | page `.main` width overrides (980 / 880 / 760 px) | `.main.main--narrow` |
| all four | `.visually-hidden` copies with `!important` | atlas.css's one rule |
| play | `.title-card.game-head` + clamp() title override | `.title-card` (kit sizes) |
| play | `.game-head__bar` / `.game-head__side` | `.game-status` / `.game-status__side` (grid at 720 px in game.css) |
| play | `.mode-tabs > .mode-tab(.is-active.daily-active)` | `.seg#mode-tabs > button(.is-active)`; play-engine.js selects `#mode-tabs [data-mode]` |
| play | `#btn-howto.pill`, `#btn-copy-court.pill`, `#btn-pause/.btn-reset.chip.pill` | `.chip-link` (44 px; `.pill` stays status) |
| play | `.progress-dot` copies (26/28 px) | kit `.progress-dot.is-done/.is-current` (32 px) |
| play | `.suggest` + `#guess-input` rules, `.guess-rule` | `.answer` > `.suggest` + `.answer__rule` |
| play | `#court-load-fallback` with inline styles | `.state.state--error` |
| play | `#map-wrap` rgba chrome, `#05070A` ground | `#map-wrap.card--void` (void pairings for chips, legend, tip) |
| play | `.vh-sheet__close` 36 px | `.btn.btn--icon.vh-sheet__close` (44 px); `.vh-sheet` itself stays for 2.2 |
| play | `.vh-share-row` (play-engine share sheet) | `.share-bar` |
| map-guess | `header.card` + `.game-title/.game-subtitle` | `.title-card` + `__eyebrow/__title/__lede` |
| map-guess | `.mode-tabs[role=tablist] > button.mode-tab[role=tab]` + link | `nav.game-modes > a.chip-link[data-mode]` (real links; map-hunt.js keeps `?day=` on click, sets `aria-current`) |
| map-guess | `.embed3d-placeholder` + spinner, `.embed3d-sketch` | `.embed3d-placeholder.state.state--loading`, `svg.state__sketch` |
| map-guess | `#mh-error` bespoke border | `.state.state--error` |
| map-guess | `#mh-result.card`, `.mh-share-row` | `.card.result` (+ `.result--lost`), `.share-bar` |
| map-guess | "How the hunt works" card | `details.disclosure.provenance` |
| twenty-questions | `.title-card.tq-head`, `.tq-status`, `.link-btn` Undo/Restart | `.title-card`, `.game-status`, `.chip-link` |
| twenty-questions | `#answer-log .a.y/.n/.u` (26 px) | `#answer-log.progress-dots > .progress-dot.is-yes/.is-no/.is-unsure` (32 px, aria-hidden, non-interactive) |
| twenty-questions | `.badge.star` | `.pill.pill-yellow` |
| twenty-questions | `#reveal-card` buttons `.btn-row` | `.card.result` + `.share-bar` |
| twenty-questions | `#err-card.card` + inline styles | `.state.state--error` + `.state__title` |
| twenty-questions | `details.howto` | `details.disclosure` (48 px summary) + `details.disclosure.provenance` |
| twenty-questions / era | `.fine` | `.caption` |
| era-crossed | `.title-card.ec-head`, `.ec-status` | `.title-card`, `.game-status` |
| era-crossed | `#round-dots .d.hit/.miss` (22 px) | `#round-dots.progress-dots > .progress-dot.is-done/.is-miss` (32 px, aria-hidden) |
| era-crossed | `#done-card` buttons, `#err-card` | `.card.result` + `.share-bar`, `.state.state--error` |
| era-crossed | `details.howto` + `p.provenance` | `details.disclosure` + `details.disclosure.provenance` |

## Copy cuts (LAUNCH-AUDIT items 12-14, 22-23)

- Item 12, "Pack": the mode note now reads "Random games don't affect your streak"; the
  "More ways to play ... and the Pack" section under /play is gone. Dead `#target-badge` and
  the empty `#play-forecast-slot` are gone (no script reads either).
- Item 13, "Same five for everyone": said once on the page (the lede) and once in the How to
  play sheet. Cut from `#mode-desc`, the court kicker ("same for everyone, refresh-proof"), the
  court footer line and the ready banner; `#court-ip-badge` stays in the DOM (play-engine.js
  writes it) but is `hidden`.
- Item 13, sound: the page `#btn-sound` is gone; the nav's Sound toggle drives the same
  setting (play-engine.js's `initSoundToggle` returns when the button is absent).
- Item 13, How to play: one opener, `#btn-howto`. The static `#mode-howto` link is gone
  (play-engine.js still injects one in triple mode, null-safe; `.linkbtn` stays styled).
- #163's similarity sentence is kept, minus "cosine" in visitor text (D21): "Style similarity
  (0-100) - a closeness score, not a percentage of anything - between your guess and the target."
  #163's era-crossed caveat (stat-plus-stardom profiles) is kept in the plain How to play list.
- Item 14: "#rank is your guess's rank among all 12,966 seasons" now reads "#rank is where
  your guess ranks among this season's eligible players" (no new hard-coded count).
- Item 23: build provenance on twenty-questions and era-crossed moved into
  `details.disclosure.provenance` ("How it was built"); the How to play lists keep plain
  wording. Era Crossed's lede says "the model" instead of "the 64-d embedding".
- Item 22: map-guess's method card moved into `details.disclosure.provenance`.

## Detector deltas (check_design.py --report --json, baseline = master ba68e9d0)

Hits on each page file (game.css and toast.js add 0 everywhere):

| Page | D4 | D5 | D6 | D8 | D14 | D15 | D20 | D21 | also |
|---|---|---|---|---|---|---|---|---|---|
| play.html | 1 -> 0 | 10 -> 0 | 42 -> 0 | 12 -> 0 | 0 -> 0 | 49 -> 8 | 0 -> 0 | 1 -> 0 | D2 1->0, D3 4->0, D7 7->0, D9 6->0 |
| map-guess.html | 1 -> 0 | 6 -> 0 | 2 -> 0 | 0 -> 0 | 0 -> 0 | 6 -> 0 | 0 -> 0 | 4 -> 0 | D2 1->0, D3 1->0, D9 1->0 |
| twenty-questions.html | 0 -> 0 | 5 -> 0 | 2 -> 0 | 5 -> 0 | 0 -> 0 | 5 -> 0 | 0 -> 0 | 3 -> 0 | D2 1->0, D3 1->0, D7 1->0, D9 1->0 |
| play/era-crossed.html | 0 -> 0 | 5 -> 0 | 2 -> 0 | 1 -> 0 | 0 -> 0 | 8 -> 0 | 0 -> 0 | 8 -> 0 | D2 2->0, D3 1->0, D7 1->0, D9 1->0, D17 2->0 |

Site totals: D2 58->53, D3 78->71, D4 15->13, D5 58->32, D6 985->937, D7 84->75, D8 131->113,
D9 167->158, D15 166->106, D17 27->25, D21 78->62; D1, D10, D14, D19 stay 0; D12 1, D13 14,
D20 4 unchanged (none of those hits are on the four pages).

play.html's 8 remaining `style=""` attributes are `display:none` toggles play-engine.js flips
through `.style.display`, plus the noscript note: wave 2.2's job with the engine. The game JS
files keep their own hex/font literals (play-engine 20, game-mechanics 18, the two inline
quizzes 31 D6 hits, mostly share-card canvas colours): untouched beyond the class renames.

## Checks

- `python C:/Users/jcdav/wt/hoops-audit/stamp_lf.py` then `--check`: OK, 120 assets.
- `python scripts/stamp_footer.py --check`: OK, 26 pages.
- `python scripts/sync_public.py` then `--check`: OK, 533 files.
- `python scripts/budget_check.py`: **map-guess.html went red** (192.2 KiB over its 176.0 KiB
  +3% row: it now loads fonts.css and game.css). Re-measured +3% per the task: 196,804 bytes
  -> 202,752 budget, noted in budgets.json's method. After the rebase (#165 grew embed-3d.js)
  all 27 pages pass: map-guess 195.1 / 198.0 KiB (tight), play.html 1,484.8 / 1,520.0,
  twenty-questions 180.7 / 942.0, era-crossed 155.1 / 821.0.
- `python scripts/check_contrast.py`: OK. `python scripts/check_a11y.py`: OK, 19 pages.
- `pytest tests/test_site.py tests/test_check_design.py tests/test_no_inline_scripts.py
  tests/test_play_engine_refs.py tests/test_game_target_mask.py -q` (+ test_served_constants,
  test_stamp_footer): all pass. `test_material_treatments_exist` now reads play.html plus
  assets/game.css, where play's `.vh-truth/.vh-approx` treatments moved.
- `node --check` on toast.js, map-hunt.js, inline-twenty-questions.js, inline-era-crossed.js,
  inline-play.js, play-engine.js: OK. `python -m ruff check scripts tests`: OK.
- `scripts/check_site_facts.py`, `check_css_braces.py`, `check_motion.py`, `check_selectors.py`,
  `check_target_size.py`, `check_viewport.py`: OK. `check_dead_links.py` reports 41 on both
  master and this branch (pre-existing; it does not read vercel.json rewrites).
- JS id contract: every id the touched JS reads still exists, except `#btn-sound` and
  `#mode-howto`, which the task removes and which play-engine.js null-guards.
- sw.js: `CACHE_NAME` v28 -> v29 (master took v28 in #175); `/assets/game.css` and `/assets/toast.js` added to CORE
  next to atlas.css (expect a one-line conflict with the 1.2b branch).

## Renders needed before merge (390 and 1280, light and dark)

- **/play**: fresh (onboarding sheet open on first visit, then closed), mid-game (two guesses,
  warm label, dots done/current, court card active), solved (result card, coin court card,
  confetti off under reduced motion, share sheet open), error (court-load-fallback state and
  boot-error card), plus triple mode (the injected How to play link) and the toast.
- **/map-guess**: loading (sketch state), mid-game (taps, dots), solved and out-of-taps
  (result card, share bar, toast on copy), error ("taking the night off" state), no-3D
  fallback (search row), Twin Hunt mode (chip-link active).
- **/twenty-questions**: fresh, mid-game (answer dots yes/no/not sure, Undo enabled), tie
  card, solved (reveal card with All-Star pills, share bar), error (err-card state), map
  failed (toast), both disclosures open.
- **/play/era-crossed**: fresh, mid-round (after a pick: correct/wrong options, bars, reveal
  note, round dots done/miss), game over (done card), error (err-card state), disclosures open.

## Deferred

- play.html: the 8 `display:none` style attributes, `#sky-canvas` to Embed3D, `.vh-sheet` to the
  kit `.sheet`, the engine's inline hex (incl. the guess bar colours: the page used
  `!important` to repaint them; that override is gone, so bars show the engine's own colours
  until 2.2), the "P#—" placeholder and debug-flavoured labels (item 13), the unused
  timesfm-forecast.js module tag (item 12), `prompt()/alert()` clipboard fallbacks (item 14):
  wave 2.2.
- map-guess: the "64 notable player-seasons" vs 1,313 count, research chrome in embed-3d.js,
  the meta description's jargon: waves 1.4 / 2.3.
- era-crossed: share text still links `/play/era-crossed.html`, and the reveal note says
  "embedding cosine x 100" (both in inline-era-crossed.js copy, not a class rename): wave 2.3.
- atlas.css:879 `#game-header .game-status-bar` no longer matches anything (play's strip is
  `.game-status` now); left for the kit owner.

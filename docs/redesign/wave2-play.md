# Wave 2, task 2.2: Play (receipts)

Branch `forge/w2play` from origin/master `519ae3a8`. Scope per DESIGN-DIRECTION.md section 4, row 2.2:
play.html body, assets/play-engine.js, assets/game-mechanics.js, the `.game--play` rules in
assets/game.css, and the play-only JS (inline-play.js; map-lenses.js and shared-map.js retired).
atlas.css, shell.css, embed-3d.js, sw.js and every other page are untouched; map-guess,
twenty-questions and era-crossed changed only in their stamped `game.css?v=` token.

## What changed

- **One renderer.** play.html's `#sky-canvas` and its engine (`assets/shared-map.js`, loaded by a
  dynamic `import()` from play-engine.js) are gone, along with the lens bar (`assets/map-lenses.js`,
  Map/PCA/t-SNE switcher: research chrome the game variant drops, LAUNCH-AUDIT item 22) and the
  map's own overlay chips, Pause/Reset, legend and hover tip. `#map-wrap.card--void` now holds
  `#play-map`, mounted with `Embed3D.mount(el, {variant:'game', height:380, onSelect})`.
  Ids line up end to end (embed3d.json row i == vectors.json row i == searchLite `.i` ==
  `target.i` == `guess.idx`, checked: 0 mismatches over 12,966 rows), so:
  - the target is `setSelected(target.i)` (mark colour + ring, the field dims around it);
  - guesses are `overlay([{id, kind}])`: `exact` for the winning guess, `cold` when the
    similarity fell from the previous guess, `warm` otherwise, the same rule the guess list prints;
  - Twin Reveal is `setHighlight(top3)` + `setDim(top3 + target)`, Era Lock is `setDim(same-decade
    ids)` (Embed3D's `setDim` takes the ids to keep; shared-map's `setDimmed` took the ids to fade);
    both clear on a slot change;
  - tapping a 2025-26 dot fills the guess box (never auto-submits); any other dot says who it is.
  One `syncMap()` replaces the 900 ms polling loop, `addPoint`/`hasPoint` lite-map injection,
  `draw()/projectFrame()/focusOnTarget()/resize()` and `pulseGuess`. Attract mode (30 s idle
  auto-rotate via `vh:resume-maps`) is gone: Embed3D idles and resumes its own rotation.
  The handle is `window.VHPlayMap` (not an alias of the old `_sharedMapApi`: the APIs differ).
- **One first-visit experience.** game-mechanics.js's 3-step coachmark tutorial
  (`vh.tutorial.done`, opening at 1,200 ms on top of the sheet at 700 ms) is deleted. The How to
  play sheet (`vh.onboardSeenV3`) stays and absorbs the one thing the coachmarks added ("every
  guess lands on the map as a ring"). It is now the kit `.sheet__backdrop > .sheet` with
  `.sheet__handle/__head/__title/__close/__actions`; focus moves to Close on open and back to the
  opener on close; Escape and backdrop tap close it. The daily share sheet and inline-play.js's
  clipboard-denied select-to-copy panel are the kit sheet too (that panel was 10 hex + 2 font
  literals in `cssText`).
- **One "same five" sentence** (the lede). Cut from: the sheet's step 3 (now "Refresh won't change
  the five, and progress saves per slot"), the status line ("Slot 1/5 • 0/6 • same 5 for everyone
  today"), the hidden `#court-ip-badge` and its write, and the Pack Battle retired note.
- **One How to play entry point** (`#btn-howto`): triple mode no longer injects `#mode-howto`.
  **No page sound button**: `initSoundToggle` (dead since 1.3 removed `#btn-sound`) is deleted; the
  nav's Sound toggle is the one control.
- **Inline styles.** play.html: 8 `style=""` -> 0 (display toggles are the `hidden` attribute,
  which atlas.css:240 enforces; the noscript note is a class). play-engine.js: every `style=""` in
  its templates and every `cssText` is a class in game.css, except the guess bar's
  `style="width:N%"` (data). Guess-row bars are `var(--accent)`, the winning row's bar is
  `var(--ok)`; the engine's `#0072B2/#009E73` are gone. The win pill is `.pill-green`. The result
  card is the kit `.card.result` / `.result--lost` with `.result__detail` and `.caption`.
  `#target-badge` and every `!important` in the owned files were already gone (wave 1.3).
- **CSP.** The "Loading twin" card had two inline `onclick=` handlers inside `innerHTML` (CSP
  `script-src 'self'` blocks them at runtime; tests/test_no_inline_scripts.py reads HTML only, so
  it never saw them). Both are bound with `addEventListener`.
- **390 px.** Daily Court slot rows: `.court-badge` was `position:absolute; right:8px`, so "Slot 1
  • ARCH <Honors> • NOW" ran under the ▶/2-of-6 badge. The badge is now a flex sibling of the slot
  label in `.court-card__head`, and the suit tag sits on its own line (the template also rendered
  it twice). The map frame's grey right-edge strip came from the old absolute `#sky-canvas`
  (`width=640` buffer) inside a `min-height:420px` wrap; with Embed3D sizing its own canvas from
  the wrap width the strip is gone (render below: void runs edge to edge at 390, both themes).
- **Other cuts.** `prompt()`/`alert()` clipboard fallbacks (Copy court, Challenge) -> the verified
  copy + toast. The crash breadcrumb banner and guess status line use tokens. Confetti reads
  `--accent/--ok/--coin-1/--blue/--data-terra/--pipe` at burst time (no Okabe-Ito hex). The boot
  error card is the kit `.state--error` with a Reload button and the message as text (it used to
  inject `e.message` and `e.stack` as HTML). "P#—" placeholder -> "Court"; random-mode pill
  "Random" (was "P#undefined"); "See model lens" / "Model lens: … picks left" debug copy ->
  "Make your first guess" / "6 guesses to find the modern twin". The dead multi-choice grid
  (`renderGuessGrid`, `#guess-grid` not on the page) and the dead `ensureModernLower` are removed.
  game-mechanics.js no longer injects a `<style>` (its rules, incl. a 10 px `.suit-tag` and hex
  suit colours that overrode game.css's token suit tag, now live in game.css with tokens).
- **Scripts on /play.** Removed: map-lenses.js, the unused `timesfm-forecast.js` module (exports
  only; the forecast lives on Methods), and `daily-score.js` (sets `window.VHDailyScore`, which no
  browser script reads: daily-ledger.js is the scorer; the node fuzz suite still requires the file).
  Added: `/assets/embed-3d.js` (defer).

## Detectors (check_design.py --report --json, baseline = this branch's base 519ae3a8)

Hits on the owned files (play.html, play-engine.js, game-mechanics.js, inline-play.js, game.css,
shared-map.js, map-lenses.js):

| Detector | before | after | where the before hits were |
|---|---|---|---|
| D5 kit redeclared | 0 | 0 | |
| D6 hex | 86 | 0 | shared-map.js 38, play-engine.js 20, game-mechanics.js 18, inline-play.js 10 |
| D7 `!important` | 0 | 0 | (wave 1.3 took play's 7) |
| D8 font-size < 11 px | 5 | 0 | shared-map.js 4, game-mechanics.js 1 (the injected `.suit-tag` 10 px) |
| D15 `style=""` | 8 | 0 | play.html display toggles + noscript |
| D16 one atlas engine | 2 point renderers on /play | 1 | shared-map.js retired; `getContext('2d')` on /play is embed-3d.js plus the confetti burst (not a point renderer). D16 is not automated in check_design.py. |
| D9 literal fonts (also) | 11 | 0 | shared-map 5, play-engine 2, game-mechanics 2, inline-play 2 |

Site totals: D6 909 -> 823, D8 113 -> 108, D9 150 -> 139, D15 101 -> 93; D5 11, D7 54, D21 62
unchanged; enforced D1, D14 green. Left on /play, not owned here: past-modern-game.js 8 D6 (its own
`OKABE` palette).

## Gates

- `python C:/Users/jcdav/wt/hoops-audit/stamp_lf.py` then `--check`: OK, 111 assets.
- `python scripts/stamp_footer.py --check`: OK, 26 pages.
- `python scripts/sync_public.py` then `--check`: OK, 436 files (public/ copies of the two
  deleted scripts removed with them).
- `python scripts/budget_check.py`: all pass. play.html 956.6 / 1,520.0 KiB. The interaction gate
  "JS bytes, heaviest page" (play.html) went red at 298.7 / 294.0 KiB once embed-3d.js (35.8 KB)
  came in; dropping the unused daily-score.js (17 KB) brought it to 282.0 KiB. No budget row edited.
- `python scripts/check_contrast.py`: OK. `python scripts/check_a11y.py`: OK, 18 pages.
  check_css_braces, check_motion, check_selectors: OK.
- `python -m pytest tests -q --ignore=tests/test_vector_core_parity.py`: only the 3 known
  tests/test_check_served_model.py failures.
- `node --check` play-engine.js, game-mechanics.js, inline-play.js: OK. `node --test
  tests/embed3d.test.mjs`: pass. (tests/daily-share.test.mjs and tests/twin-absence.test.mjs fail on
  origin/master too: they require functions no asset defines.)

## Renders (serve.py + shoot.mjs, prod CSP, reduced motion)

The first gated run (play, light+dark, 390+1280) was stopped by admit.sh's RAM guard after one
shot (Available fell to 493 MB); a second gated run took 390 light and dark. 1280 was not rendered.

- **390 light, fresh visit**: the How to play sheet alone (no coachmark), three steps, Play Court /
  Random, 44 px close; the page behind it blurred by the kit backdrop.
- **390 light and dark, mid-game** (sheet closed, two real guesses submitted through the input:
  Nikola Jokic, Victor Wembanyama): slot rows read "SLOT 1 • SCORING VOL • NOW" with the 2/6
  badge to the right and Honors on its own line; nothing runs under the badge. Map: void edge to
  edge inside the frame, no grey strip; target marked; one warm and one cold ring; legend "Warmer
  guess / Colder guess" and the game note below. Guess rows: avatar, name, pill, "▼ colder", bar
  in the accent token. 0 exceptions, 0 failed requests, overflow false. The probe's low-contrast
  list in dark flags gradient-backed controls (lifelines, coin streak pill) because it reads
  `background-color` only; they read fine in the PNG.
- Not rendered: 1280 both themes, solved, error (boot error / court-load fallback / map 404).

## Deferred / for others

- **sw.js** (not owned): still precaches `/assets/vectors_map_lite.json`, which nothing served
  reads now (it fed shared-map.js); pipeline/build_map_lite.py still builds it.
- **Kit**: a game-variant legend key for the target (Embed3D shows "Found it" only for an `exact`
  ring; the selected target has no key). `.embed3d__tip.is-visible` and `.embed3d__swatch--ring`
  (from 1.4) still apply.
- **past-modern-game.js** `OKABE` (8 D6), not owned.
- Map Hunt still keeps no Embed3D handle for rings (wave 2.3).

## Review follow-up (f6d4a4b0 review, APPROVE with fixes)

- M1/M2: one sheet focus contract, `sheetFocus(backdrop, onEscape)` in play-engine.js (also
  `window.VHSheetFocus`). While a sheet is open the body's other children are `inert` (the toast
  stays live), Tab and Shift+Tab wrap inside the sheet, Escape closes it, `body.is-sheet-open`
  locks scroll, and release() puts focus back on the opener. The How to play sheet, the share sheet
  and inline-play.js's copy-blocked panel all use it.
- keyboard-a11y.js: Escape skips any `.sheet` inside a `[data-sheet-managed]` backdrop or a
  `[hidden]` ancestor (those pages own the sheet), so it no longer marks /play's sheets with a
  `.hidden` class nothing styles. Other pages keep the old behaviour for their own sheets.
- L6: keyboard-a11y.js reads the suggest list as visible only when it has neither the `hidden`
  attribute nor the `.hidden` class, and its Escape sets the attribute on lists marked
  `data-hide="attr"` (/play's `#guess-suggest`), so `aria-expanded` follows the real state.
- L1: a cross-tab ledger write now also calls `syncMap()`.
- L5: player names, seasons and team codes go through `esc()` before every `innerHTML`
  (court cards, lineup chips, past meta, result cards, top-5 line, guess rows).
- L3 (not fixed, kit request): Embed3D's game legend labels every `warm` ring "Warmer guess", and
  `overlay()` has only warm/cold/exact with no label option, so a first or "same" guess still shows
  under "Warmer guess". Needs a neutral kind in embed-3d.js (e.g. `kind:'guess'`, key "Guess").
- 1280: the five-up slot cards put the badge on its own line above the kicker
  (`column-reverse` from 721 px) and the kicker wraps only between words; the status strip is
  `auto minmax(0,1fr) auto` with `nowrap` sides, so COURT 1/5 and STREAK 0 stay on one row.
- Gates rerun: stamp_lf (+ --check), stamp_footer --check, sync_public (+ --check), budget_check,
  check_contrast, check_a11y, pytest (only the 3 known test_check_served_model failures),
  node --check, embed3d.test.mjs 15/15. The keyboard-a11y.js token moved on the six pages that
  load it.

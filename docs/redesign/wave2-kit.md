# Wave 2 kit pass: the page builders' kit requests

Branch `forge/w2kit` on origin/master 6b93404a. Owned: assets/atlas.css, assets/shell.css (untouched),
assets/embed-3d.js, tests/embed3d.test.mjs. Page edits are the minimum to adopt each new hook and drop
the page's workaround. sw.js `CACHE_NAME` is not bumped here (done at land).

## Embed3D (assets/embed-3d.js)

- **Neutral ring `'guess'`** (wave2-play L3, wave2-games). A dashed `--void-ink` ring, legend key
  "Guess". An unknown `kind` now draws as `'guess'` (it used to draw as `'warm'`, a warmer claim nobody
  made). /play `ringsFor`: first guess and same-similarity guess are `'guess'`, the same rule
  `renderGuesses()` prints ("first", "same"). Map Hunt `syncMap`: trend `null` (first tap) and `'same'`
  are `'guess'`.
- **Selected key in the game legend.** `setSelected()` now re-renders the legend; the game variant adds a
  key for the selected point, labelled by a new `selectedLabel` option (default "Selected"). /play passes
  "Past All-Star" (selected from the start of a slot); Map Hunt passes "Answer" (selected only on finish).
- **`handle.ready` + `onLoad`.** `ready` is a Promise resolved with the handle once the data has loaded
  (also after a retry); it never rejects, and a handle destroyed before loading leaves it pending.
  `onLoad(handle)` fires at the same moment, wrapped so a page bug cannot break the map. map-hunt.js's
  `info(0)` poll (250 ms x 120) and live-atlas.js's `snapshot().loaded` poll are gone; live-atlas keeps one
  subscription and the latest pending game wins (`pendingSig` travels with `pending`, so `lastSig` is the
  applied game's).
- **No style writes for chrome.** The tip toggles `.embed3d__tip.is-visible` (no `style.display`); ring
  and selected keys are `.embed3d__swatch--ring.embed3d__swatch--{exact,warm,cold,guess}` and
  `.embed3d__swatch--sel`, coloured in atlas.css (no `style.border`). Team swatches keep
  `style.background`: that is data colour (ESPN's), not chrome. Position (`left/top`) and the cursor are
  still per-event geometry/state.
- **`note` and `loadingText` options.** `note: 'text' | false` replaces or drops the game/live note (home
  ignores it: its note is the projection honesty line). Twenty Questions passes `false`; its page caption
  `.tq-map-key` gained "Drag to turn the map; tap a dot to see who it is." and game.css's
  `.tq-map .embed3d__note` margin rule is gone. `loadingText: 'text' | false` replaces or drops the
  loading state's second line ("12,966 player-seasons, ..."). Home (plate meta `#atlas-count`), Map Hunt
  (lede `data-fact`) and Live (PLATE 12 meta) pass `false`; /play, TQ and Era keep the default.
- **Home jargon.** The note and the axis label no longer name PCA / t-SNE / UMAP; the `.seg` switcher keeps
  the names. Each view still says what it keeps and what it distorts ("This view shows the widest spread
  but keeps only ~27% of the differences ...", "... the gaps between groups mean nothing"); the axis reads
  "Axes in arbitrary units". D21 is static and never saw this runtime copy, so its count does not move.

tests/embed3d.test.mjs: 15 -> 20 (guess ring + dashed stroke + class swatches with no style writes;
selected key and `selectedLabel`; `ready`/`onLoad` once, after a 503 retry, with a throwing callback,
never after destroy; tip `.is-visible` with no `display` write; `note`/`loadingText`, escaping, home
ignoring a note override). The home chrome test now asserts the copy changes per projection and carries
no projection names, instead of matching "t-SNE".

## atlas.css

| Request | Done | Page workaround removed |
|---|---|---|
| `.stat-strip` divider between wrapped rows (docs) | each tile draws its top + left hairline 1 px outside itself, the strip clips its own edge (`overflow:hidden`); replaces `.stat + .stat{border-left}` | none needed |
| `.pill` nowrap (docs) | opt-in, after review: pills still wrap by default (`.pill{max-width:100%}`), so long labels (players' archetype and era-native pills, mtnn-v5's "Status: champion — single-model serving policy") wrap readably; `.pill--nowrap` and the status pills `.pill--ok/--warn/--bad` stay on one line and clip past their container; `.pill__text` adds an ellipsis. `.chip` is unchanged from master | - |
| `--warn` + status pills (docs) | `--warn` (mark: 3.33:1 light, 8.77:1 dark) and `--ok-text/--warn-text/--bad-text` in both themes; `.pill--ok/--warn/--bad` = state-coloured text, hairline and its own 10% tint | status.html `.st__pill*` (6 rules) gone; `.st__dot--warn` uses `--warn`, not `--qblock-2`; scripts/build_status.py emits `pill pill--{state}` (unknown = plain `.pill`). Changed by hand; the builder was not rerun, so the snapshot is unchanged |
| `.share-bar--compact` (home) | `flex:1 1 0`, 6 px padding, `.06em` tracking, nowrap | index.html `.instrument > .share-bar .btn` |
| `.row-list__title` slot (home) | `.row-list__title` block, `+ .caption` stacked, `__main:has(> __title)` 12 px padding, hover title `--accent-2` (the page's `--accent` hover was 3.93:1 on paper) | index.html `.lab .row-list__*` (3 rules) |
| `details.card` collapsible (editorial) | opt-in `details.card.card--collapsible > summary` (after review: a bare `details.card` rule restyled taxonomy's archetype cards); insights.js adds `card--collapsible`: 48 px head, +/- glyph in a 28 px circle, focus ring | insights-cards.css `.vh-ins__sum` geometry (4 rules; the hover title colour stays) |
| `.card--choice` (games) | button card: resets, tap layout, `--focus` ring, `.is-correct` (`--ok-text`) / `.is-wrong` (`--bad-text`) | game.css Era `.opt` layout/hover/focus/disabled/state rules; inline-era-crossed.js adds `card--choice` |
| `.wiki-alphabet button` 44 px (players) | 44 x 44 on a `repeat(auto-fill, minmax(44px,1fr))` grid | - |
| `.tab-pills` compact at <= 420 px (players) | 8 px padding, 11 px, `.06em`: Directory / Skill profile / Leaderboards fit one row at 390 (the first try at 12 px padding still scrolled; render below) | - |
| `.wiki-search-row` phone track (players) | `minmax(0, 1fr)` | players.css `.wiki-search-row > *` / `.wiki-filters` min-width patch |
| `.pp-btn` / `.pp-btn--yellow` | retired from all 11 selectors incl. print (git grep: no page, sheet or script uses them) | - |
| modal geometry (players) | `.vh-modal-backdrop` / `.vh-modal` / `body.vh-modal-open` beside the modal skin | players.css copy (3 rules) |

Status pill contrast (WCAG text, computed; check_contrast.py skips assets/ and evaluates 0 kit pairs, so
these are arithmetic, recorded in the token comments): light ok 5.72 / warn 6.68 / bad 6.31 on paper,
4.60 / 5.36 / 5.02 on the tint over raised paper; dark 8.05 / 11.52 / 8.26 on the board, 6.09 / 8.29 /
6.24 on the tint over raised paper.

Not done (not in this brief): wave2-live's `.gh` game-header styles and `.title-card--game`, the void
pixel-art palette (replay), wave2-editorial's void data hues, wave2-players' blue wash token, wave2-home's
`.card--split`.

## Item 5: `.sheet` Escape (keyboard-a11y.js)

Already done in wave 2.2; verified, not redone. `ownSheet()` skips any `.sheet` inside a
`[data-sheet-managed]` backdrop or under `[hidden]` (keyboard-a11y.js:21, used at :24 and :170), and
/play's sheet helper (play-engine.js:16) sets `data-sheet-managed` on every backdrop it manages.

## Detectors (check_design.py --report)

Site totals before -> after: 8/18 green, 662 hits -> 8/18 green, 662 hits. Nothing here is a static
detector hit: the style writes, ring kinds and polling are runtime, and the removed page rules were
not D5 kit classes.

## Gates

stamp_lf, stamp_assets, stamp_footer --check (27 pages), sync_public + --check (434 files),
budget_check (green after six rows re-measured +3%: 404, feed-health, map-guess, offline, schedule,
status; atlas.css +5.3 KB, embed-3d.js +2.8 KB; stated in budgets.json `method`), check_contrast
(OK), check_a11y (OK, 18 pages), check_site_facts (31 facts), ruff format --check + ruff check
(clean), pytest (only the 3 known tests/test_check_served_model.py failures), node --check on every
touched JS, node --test tests/embed3d.test.mjs 20/20.

## Review fixes (after 39d2bfd2)

- H1 pills: nowrap is opt-in (above). Renders at 390 light: Stephen Curry 2015-16 profile, archetype and
  era-native pills wrap to two lines inside the card (players-profile-pills-390-light.png); mtnn-v5's
  status pill wraps to two centred lines (mtnn-v5-status-pill-390-light.png); status pills one line
  (status-pills-390-light.png).
- H2 collapsible card: opt-in class. taxonomy at 390 light pixel-diffed against an origin/master
  render: the only differing rows are the six stat strips (the 1 px hairline offset of the new
  stat-strip rule; the "ARCHETYPES" label touches its tile edge on master too); the archetype cards
  and their ▾ summaries are identical (taxonomy-archetypes-390-light.png). Insights still collapses, with
  the − glyph on the open card (insights-collapsible-390-light.png).
- L1 budgets re-measured on the final tree: 404 109,757 -> 113,664; map-guess 221,120 -> 228,352;
  status 114,665 -> 118,784; schedule 137,344 -> 142,336 (feed-health and offline unchanged).

## Renders (serve.py + shoot.mjs, 390, dark and light; wave2-kit/)

- index, play, map-guess, status, players, methods: err=0, overflow=false, loading=0 on all twelve.
- play with three test rings injected through `window.VHPlayMap.overlay()` (render check only, not
  shipped): legend reads "Past All-Star / Warmer guess / Colder guess / Guess" on the void, the dashed
  guess ring distinct from the solid cold ring (play-legend-390-*.png).
- home toolbar: Clear / Copy link / Share image in one row; the first compact try wrapped "Share image"
  to two lines inside its button, fixed with nowrap + 6 px padding (home-share-bar-390-light.png).
- players: three tabs on one row (players-tabs-390-dark.png); alphabet 7 to a row inside the card at 390.
- methods: the 5-tile strip wraps 2/2/1 with hairlines between rows (methods-stat-strip-390-light.png).
- status: OK/DEGRADED/STALE pills one line, state-coloured, both themes (status-390-*.png).
- The probe's `low` list on play dark (10: coin/lifeline buttons, streak chip) and the nav/skip-link hits
  are on elements this pass did not touch (not compared against a baseline run).

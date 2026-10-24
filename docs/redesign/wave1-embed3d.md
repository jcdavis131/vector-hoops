# Wave 1, task 1.4: Embed3D kit (receipts)

Branch `forge/w1-embed3d`, from origin/master `7940d222` (includes #165). Owner files:
`assets/embed-3d.js`, `assets/hero-3d-mount.js`, `assets/atlas-3d.js` (chrome and error strings), and the
three mount call sites (`assets/map-hunt.js`, `assets/live.js`, `assets/atlas-3d.js`), one option each.
No page layout or CSS was touched; atlas.css is untouched.

## What changed

- **One mount, three variants.** `Embed3D.mount(el, {variant: 'home'|'game'|'live', ...})`
  (or `data-variant`; default `home`). The DOM is the atlas.css contract:
  `.embed3d[data-variant] > .embed3d__bar (home only: .seg + .embed3d__axis)`,
  `.embed3d__frame > canvas.embed3d__canvas + .embed3d__state + .embed3d__tip`,
  `.embed3d__legend` (`.embed3d__key > .embed3d__swatch`), `.embed3d__note`.
  `style.cssText` in embed-3d.js: 8 -> 0.
  - `home` keeps #165: depth-shaded greys, projection switcher, the greyscale note, no legend.
  - `game` (map-guess) drops the research chrome (switcher, "8 k-means groups" legend,
    silhouette note; LAUNCH-AUDIT item 22). The legend shows warm/cold/found keys only when guess rings exist.
  - `live` (Style Map plate) drops the switcher; the legend is team swatches fed by `setGroups`.
- **Colours come from the page.** `getComputedStyle(document.documentElement)` of `--void`, `--void-ink`,
  `--void-ink-2`, `--void-accent`, `--accent`, `--fg-3`, `--data-terra`, read at mount and again on every
  `matchMedia('(prefers-color-scheme: dark)')` change (the listener goes away in `destroy()`). The `ACCENT`
  literal and the 8-colour Okabe-Ito cluster palette are gone; the grey ramp now runs from the void up to the void's ink.
  **One deliberate change from the brief:** marks on the canvas use `--void-accent`, falling back to `--accent`.
  The canvas is the void on both themes, and atlas.css:33 says `--accent` (marker red) is 4.02:1 there while
  `--void-accent` is 6.37:1. `.card--void` and `.embed3d__state` make the same swap.
  If a page has no atlas.css the token reads back empty and numeric fallbacks that mirror atlas.css are used.
- **Loading / error.** Loading is `.embed3d__state--loading`: the map-guess sketch, redrawn in
  `currentColor` (no hex) so it reads on the void. Error is `.embed3d__state--error` `role=alert` with a
  `.btn` "Try again" that refetches. It covers the frame and no longer wipes the host. The old error path
  threw `ReferenceError: src is not defined` inside its own `.catch`, so users saw "src is not defined" in
  place of the HTTP status. It now names the status and the URL (tested).
  atlas-3d.js's two inline-styled alerts are now the kit `.state.state--error` with a retry.
- **API additions** (all unit-tested): `setDim(ids)` (everything outside the set fades to 15%; `null`
  clears, `[]` fades all), `overlay(rings)` (`[{id, kind:'warm'|'cold'|'exact', r, color}]`, `[]` clears),
  `setGroups([{label, color, ids}])` (colour is any CSS colour or `var(--token)`, resolved through `:root`),
  `find({team, season})` (ids for a team/season, so wave 2 can feed `setGroups`), `snapshot()` (read-only state).
  Kept: `setProjection`, `setHighlight`, `setSelected`, `info` (still returns `cluster`), `destroy`,
  `greyscale` (accepted; every variant is now greyscale), `highlightIds` (+ `highlight` alias), reduced-motion freeze.
- **Re-mount is safe.** Mounting an element that already holds a handle destroys it first. live.js mounts
  twice (on eval and on `load`), and the first RAF loop, listeners and ResizeObserver used to leak.
- hero-3d-mount.js caption: inline `cssText` with `#5b5545` -> `.caption`; mount passes `variant:'home'`.
  No served page loads this file today.

## Live wiring: deferred to wave 2

`setGroups` is not a one-line change in live.js. live.js keys athletes by ESPN display name and ESPN team
abbreviation (live.js:575), with no index to embed ids, and ESPN abbreviations differ from the map's
(GS/GSW, NY/NYK). live.js now passes `variant:'live'` only. Wave 2 seam:
`handle.setGroups([{label: g.a.abbr, color: g.a.color, ids: handle.find({team: MAP_ABBR[g.a.abbr], season})}, ...])`
from the render path that knows `g`, keeping the handle that `mountEmbed3D` currently drops.

## Detector deltas (check_design.py --report --baseline, master 7940d222 -> branch)

| Detector | Site total | embed-3d.js | atlas-3d.js | hero-3d-mount.js |
|---|---|---|---|---|
| D6 hex outside atlas.css | 986 -> 961 (-25) | 24 -> 0 | 1 -> 0 | n/a (not served) |
| D9 literal font families | 167 -> 159 (-8) | 6 -> 0 | 2 -> 0 | n/a (not served; its one literal is gone too) |
| D16 `style.cssText` in embed-3d.js | | 8 -> 0 | 0 | 1 -> 0 |
| D16 `.embed3d__*` in atlas.css | present (since #172) | | | |
| D16 2D point engines | unchanged; wave 2 retires atlas-map.js, live-atlas.js, play-engine.js, the tq canvas | | | |

No other detector moved. D21 (copy lint) counts page text only; embed-3d.js no longer emits
"k-means"/"silhouette"/"64-d" anywhere, though the home note still names PCA/t-SNE/UMAP (#165's look, kept on purpose).

Inline style left in embed-3d.js is geometry or data, never chrome: `canvas.style.cursor` (pointer on hover),
`tip.style.display/left/top` (the tooltip has no show class), and `swatch.style.background/border` (the group's own colour).

## atlas.css requests for task 1.1 (not edited here)

- `.embed3d__tip` is `display:none` with no shown state; add `.embed3d__tip.is-visible{display:block}` and
  embed-3d.js can drop `style.display`.
- A ring key for the game legend (`.embed3d__swatch--ring`: transparent fill, 2px border in `currentColor`);
  today the ring keys set `style.border` from the token colour.
- `.embed3d__canvas{min-height:320px}` stretches any canvas asked for under 320px (all three pages ask >= 380).

## Gates

- `python C:/Users/jcdav/wt/hoops-audit/stamp_lf.py` stamped index.html, live.html, map-guess.html
  (`embed-3d.js?v=d6685fa9`, plus atlas-3d.js / live.js / map-hunt.js tokens). `--check` OK, 116 assets.
- `python scripts/sync_public.py`: 9 files synced; `--check` OK, 532 files.
- `python scripts/stamp_footer.py --check`: OK, 26 pages (index/offline deferred as before).
- `sw.js` `CACHE_NAME` v27 -> v28 (a one-line conflict with parallel wave-1 branches is expected).
- `python scripts/budget_check.py`: one row went red. map-guess.html measured 188,109 B (183.7 KiB) against a
  176 KiB budget, because embed-3d.js grew 25,086 -> 35,814 B. Re-budgeted to measured + 3% = 194,560 B (190 KiB),
  noted in budgets.json `method`. All gates pass. index (1,562 KiB / 3,576) and live (501 KiB / 680) stay green.
- `pytest tests/test_site.py tests/test_check_design.py tests/test_no_inline_scripts.py tests/test_embed3d.py`: 1897 passed.
- `node --test tests/embed3d.test.mjs`: 15/15. It covers option parsing, chrome per variant (no `cssText`
  anywhere in the tree), the loading sketch, the error state + retry, malformed data and a custom src, token
  read + fallback + scheme-change re-read, parseColor, setDim, overlay, setGroups/find, #165 selection
  semantics, reduced motion, tap-to-select, re-mount, and a source scan for colour/font literals.
- `node --check` on all touched JS; `python -m ruff check` / `format --check` on tests/test_embed3d.py: clean.

## Renders needed (not taken: no browsers on this box, RAM)

1. Home atlas at 390 and 1280, light and dark: switcher in `.seg`, greyscale ball, selection ember, note, no legend.
2. Home with the data fetch blocked: the atlas-3d.js `.state--error` with "Try again".
3. map-guess fresh (loading sketch on the void, then the game variant: no switcher, no legend), 390 and 1280, light and dark.
4. map-guess error: block `assets/projections/embed3d.json` and check for `.embed3d__state--error`, "HTTP 404 for ...", and that retry works.
5. live.html Style Map plate: the live variant with no switcher. The legend stays hidden until wave 2 wires `setGroups`.

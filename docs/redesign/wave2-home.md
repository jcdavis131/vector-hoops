# Wave 2, task 2.1: Home (receipts)

Branch `forge/w2home` from origin/master `431e092e`. Scope per DESIGN-DIRECTION.md section 4, row 2.1:
index.html, assets/atlas-3d.js, assets/home-tonight.js. atlas.css, shell.css, game.css,
embed-3d.js, sw.js, budgets.json and every other page are untouched.

## What changed

- **Inline `<style>`: 335 lines -> 120, layout only.** Most of it was 2D-atlas CSS with no consumer
  since #165 swapped in Embed3D: `.atlas-more`, `.axis*`, `.trust-badge`, `#region-layer` /
  `.region-*`, `#sky-canvas`, `.field__fallback/__controls/__state/__loading`, `.hover-tip`,
  `.legend*`, `.team-*`, `.axes-*`, `.atlas-overflow*`, and a local `.skeleton` that shadowed the
  kit's. What is left is hero, tonight strip, search dropdown, readout grid, doors grid and lab
  spacing. Every colour is a token. The search dropdown's blur shadow is now the kit's hard
  `5px 5px 0 var(--step)` and the door hover lift is gone (`.card--door`: nothing lifts).
  `.vh-truth` / `.vh-approx` stay (tests/test_served_constants.py pins them) with no hex fallback.
- **`style=""` 6 -> 0.** noscript note is `.noscript-note`; `main padding-top:0` is `.home .main`;
  the three `margin:0` heads are plates now; the mount's `height:min(72vw,460px)` did nothing
  (Embed3D sizes itself from `opts.height` / `data-height`, default 420), so it is gone.
- **`.field` wrapper removed.** `.field canvas{position:absolute;height:100%}` out-specified the
  kit's `.embed3d__canvas{height:auto}`, and its void background sat behind the home variant's
  projection bar and note, which use paper ink. `#map-wrap` is now a bare box (home-tonight.js
  scrolls to it); the canvas paints its own void.
- **Kit adoption.** `.instrument__bar` / `.fig-label` -> `.plate` (`Fig. 1` / The atlas / rule /
  `12,966 plotted`), also for the Play and Lab heads. `.door` -> `.card.card--door` with
  `.card__n/__title/__text/__meta/__go`. Toolbar -> `.share-bar` of three `.btn`s plus
  `.share-bar__status` (role=status); atlas-3d.js writes Copy link / Share image feedback there
  instead of swapping the button label. The readout is a `.card`; its Season/Archetype `<dl>` is a
  `.stat-strip` of two `.stat`s. `.lab__row` -> `.row-list` (title + `.caption` inside
  `.row-list__main`, so the description wraps at 390). "How to read this map" is a kit
  `.disclosure` (`details.provenance`) around the existing `.map-note`.
- **Atlas mount** was already `Embed3D.mount(el, {variant:'home'})`, and atlas-3d.js's `showError`
  was already the kit `.state.state--error` (role=alert, escaped text, `addEventListener` retry).
  No change there.
- **Toast.** No owned code on home raises a toast (feedback lives in the share-bar status), so
  toast.js is not loaded. engagement.js's own `.vh-engage-toast` is not owned (below).
- **Numbers from data.**
  - atlas-3d.js wrote `'12,966'` into `#atlas-count` at boot, over the `data-fact` span. Now the
    count is `N` from the decoded embed3d.json rows, set when the index decodes (site-facts.js
    fills the same span from site_facts.json before that). The mount's aria-label no longer
    carries the number.
  - Tonight / Last night (home-tonight.js) is ESPN's feed end to end. One fix: an empty board said
    "No games tonight — replays from last night are ready.", a claim about last night the empty
    feed cannot support. It now says "No games on ESPN's board today."
  - Lab rows: "8.7 points of usage rate" and "$22.1M bought 0.2 win shares" match the published
    insights (assets/insights.json `lede` / `tldr` for invisible-stardom and
    the-summer-the-cap-broke). They are citations of static pieces, not live numbers.
  - Twin of the day (engagement.js, not owned): a 24-pair calendar list. Checked: all 24 names
    appear in assets/twin_explainer.json, and every `gap` equals the difference of the two season
    years. The copy says the calendar picks it, which is true.
- **Dead preload removed.** `<link rel="preload" href="/assets/vectors_search_lite.json">`: nothing
  on the page fetches that file since #165 (atlas-3d.js searches embed3d.json). Page weight in
  budget_check.py: index.html 1,562 -> 212 KiB.
- **Nav label.** `aria-label="Primary"` -> `"Vector Hoops site"`, as every other page (D13).
- **Copy lint.** The peers footnote and the Map Hunt door said "cosine similarity in the
  64-dimensional MTNN v5 embedding" / "true 64-d cosine distance"; now plain language ("the seasons
  the model itself places closest in style", "the model's own distance"). The map note keeps its
  wording inside `details.provenance`, including "trust the peer list, not the picture" (pinned by
  test_served_constants.py).
- **Tap targets.** Tonight links, readout dossier link, the Lab "All insights" link and search
  results are 44 px rows; `.hero__try .btn{min-height:40px}` is gone.

## Detectors (check_design.py --report --baseline, base 431e092e)

Hits on index.html / atlas-3d.js / home-tonight.js:

| Detector | before | after |
|---|---|---|
| D5 kit redeclared | 0 | 0 |
| D6 hex | 18 | 0 |
| D8 font-size < 11 px | 10 | 0 |
| D13 nav label | 1 | 0 |
| D15 `style=""` | 6 | 0 |
| D21 copy jargon | 11 | 0 |

Site totals: D6 650 -> 632, D8 78 -> 68, D13 9 -> 8, D15 62 -> 56, D21 62 -> 51; the rest unchanged.

Browser detectors (shoot.mjs, 4 renders): D23 overflow false x4; D25 0 exceptions, 0 console
errors, 0 failed requests x4; D26 loading 0 x4. D22 `low`: light flags nav "Vector Hoops" / "Map"
/ "Explore" at 1.33 and dark flags "Skip to content" at 1.07; all are shell.css chrome (the probe
reads the nav's translucent backdrop and the off-screen skip link), not home markup, and read fine
in the PNGs. D24 `tiny`: 3 at 390, 4 at 1280 (the probe reports a count only; the nav and footer
are shared, the home controls are all >= 44 px by rule).

## Gates

- stamp_lf.py: stamped index.html (atlas-3d.js and home-tonight.js tokens). stamp_footer --check OK
  (26 pages). sync_public.py + --check OK (435 files).
- budget_check.py: all green; index.html 212.0 / 3,576 KiB. No budget row edited.
- check_contrast.py OK; check_a11y.py OK (18 pages).
- pytest (minus test_vector_core_parity): only the 3 known test_check_served_model failures.
- node --check atlas-3d.js, home-tonight.js OK; node --test home-tonight + embed3d: 20/20.

## Renders (serve.py + shoot.mjs, prod CSP), docs/redesign/wave2-home/

One gated run, all four shots (admit: 2,914 MB available, min 2,241).

- 390 light / dark: nav one row; hero, search, Surprise me, Twin of the day; the tonight strip
  ("Last night", one final from the ESPN stub); plate "FIG. 1 THE ATLAS ... 12,966 plotted" on one
  line; Embed3D bar (projection seg + axis note) and note on paper, the canvas void edge to edge;
  share bar wraps Share image to a second row; readout card in its empty state; disclosure closed;
  three door cards; row-list lab entries wrap; footer. No overflow, no clipped text.
- 1280 light / dark: same, readout two columns, doors three-up, share bar one row.
- Not rendered: a selected season (stat strip + peers table filled), the map error state, the
  disclosure open.

## Deferred / for others

- **engagement.js** (not owned): injects a `<style>` with hex (`.vh-totd__deep #1A150F/#F0E442`,
  `.vh-engage-toast`, streak calendar, freeze offer), a 10 px `.vh-totd__deep`, `ui-monospace`
  literals, its own toast instead of VHToast, and links `/twin-network.html` and `/live.html`
  (D17). The Twin of the day kicker renders in the code face because of it.
- **sw.js** (not owned): `CACHE_NAME` bump for the changed assets; it still precaches
  vectors_search_lite.json (1.37 MB, sw.js:50), which no served home script reads now.
- **Embed3D home note** (embed-3d.js, not owned) carries "PCA / t-SNE / UMAP / 27%" copy at
  runtime; D21 is static and does not see it.
- The stale `docs/redesign/index-*.png` (pre-#165 2D page) are left in place; the current renders
  are in wave2-home/.

## Kit requests

- `.share-bar` at 390: three short buttons wrap 2+1 with the kit's `flex: 1 1 120px`; a
  `.share-bar--compact` (smaller padding, `flex: 1 1 0`) would keep one row.
- A `.row-list__title` slot (title + caption stacked in `__main`) so pages stop styling it.
- `.readout`-style split card (selected item | its list) is the same shape on players; worth a
  `.card--split` with the hairline divider and the stacked 900 px fallback.

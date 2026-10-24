# Wave 2, task 2.6: Insights, Twin Networks, Taxonomy

Branch `forge/w2editorial`, based on `origin/master` 519ae3a8. Brief: DESIGN-DIRECTION.md §4 row 2.6, §2 kit, §5 D2/D6/D13/D26.

Owned files: insights.html, assets/insights-cards.css, assets/insights.js, twin-network.html, assets/twin-network.js, taxonomy.html, assets/taxonomy.js. No kit file, no other page and not sw.js were edited.

## Changes

**insights-cards.css is now the one page sheet for both insights pages.** insights.html used to carry a fuller copy of the card system in its `<style>` (money/entity themes, `__but`, `__series`, `__svgtag`). The sheet was an older subset that only twin-network loaded. The superset now lives in the sheet, insights.html links it after shell.css, and its `<style>` block is gone.

- Cards are the kit `.card` (`class="card vh-ins__card"`), so atlas.css supplies the surface, border, `--radius-lg` and the hard step shadow `5px 5px 0 var(--step)`. The 16 px radius and both blurred shadows (`--shadow-soft`, `0 12px 40px rgba(0,0,0,.18)` on featured) are gone. Featured keeps only its accent border.
- Remaining radii: skeletons and chart panels use `--radius-xl`, the skeleton title uses `--radius-lg`.
- Stat numbers, money kickers, the money top rule and the "But" rule use `--coin-text` (#7A5200 light, 6.68:1 on the board; #E8C766 dark). `--gold` is marker-black in light (atlas.css:51), so it was never the gold its fallback promised.
- Chart panels are `.card--void` hosts (`class="card--void vh-ins__vizwrap"`). The kit remap points `--fg/--fg-2/--fg-3` at `--void-ink/--void-ink-2`, so the svg text classes read the void pairings with no per-class hex. Inside-bar values use `--void`.
- Chart marks are token classes instead of fill hex: `.vh-ins__mark` (`--void-accent`), `--gold` (`--coin-2`), `--muted` (`--void-ink-2`), `--neg`, `--node` (`--void-line`), `--empty`, `--ring`, `.vh-ins__track`, `.vh-ins__spine` and `.vh-ins__line(--gold)`. All of them are constant on both themes, like the void.
- The PNG export reads the same five tokens through `getComputedStyle` at draw time. Colour shift: bars go terra #C17C60 → ember #FF7A5C and gold #D4AF69 → coin #F5B921, on page and in the PNG.
- The deep-link flash animated `box-shadow` and ended on `none`, which stripped the hard step from the card after every deep link. It now pulses an `outline` instead, with a static outline under reduced motion.
- The "But…" label is now "But" with the ellipsis drawn by `::after`. shoot.mjs counted the 7 written ellipses as loading leftovers (D26 "insights 7").

**Insights card index (audit #28).** The changes, then the default-open policy:
- A `<nav id="insights-index">` holds a kit `.row-list` with every finding's number and title, and marks today's pick. Each row is a plain `#slug` link that goes through the existing `highlight()` on hashchange. A click on a row whose hash is already current calls `highlight()` directly.
- One `.btn` "Expand all / Collapse all" toggles the list.
- Every card is a native `<details>`. The summary holds the number, kicker and `<h2>` title; the body holds everything else, unchanged: tl;dr, lede, stat, chart, examples, source foot, "But", Copy link and Save PNG. Keyboard support and `aria-expanded` come from the native element, with no inline handler. `highlight()` sets `open` before it scrolls, so `/insights/<slug>` stubs and the home doors still land on an open card.
- Open policy: the spotlight is always open. The other cards start open at 720 px and wider, and collapsed below 720 px.
- 390 px page height: **4,477 px** (was ~9,627, per the audit). The title card, index, toggle and spotlight head are in the first screenful.

**Twin Networks.**
- The 390 px gap between Player and Season: below 560 px the picker becomes a column, so the fields' `flex: 1 1 220px` and the inline `flex:0 1 160px` were applied as *heights*. Fix: `.vh-tn__field{flex:0 0 auto}` in that media query, with the inline style moved to `.vh-tn__field--season`. The render shows the two fields stacked with no gap.
- Metrics are a kit `.stat-strip` in `#tn-metrics`: Twin Centrality (n of 12,966 neighbor sets) and Era-Bridge (n of 8). These are the values and wording the in-SVG caption printed, and that caption scaled to about 7 px at 390. The caption is removed; the dead `.vh-tn__metric*` CSS (with its `#D4AF69`) is deleted.
- Cards are `.card` and the two panels are `.card--void`. The text halo, the node fills (`#2a2d30`), the centre ring, the gold and terra links and the dashed empty node are token classes. The twin node is coin gold with `--coin-ink` text; before, light text sat on gold.
- Flow stat labels used to be cut to 15 characters plus "…" (two more D26 hits). They now render whole and squeeze to the node width with `textLength`, the same no-truncation rule as the PNG `fitLabel`.
- The ← All insights link is a 44 px target.

**Taxonomy.**
- Family heads are `class="card card--void vh-tax__famhead"`. The h2, p and meta hex (`#F9F6F0`, `#cfc9bd`, `#D4AF69`) are gone: the text reads `--fg`/`--fg-2` through the void remap.
- The family meta is a two-tile `.stat-strip` (Players, Archetypes) on the void. `--coin-text` would be #7A5200 on the void in light, which is why the old code hard-coded hex.
- The hero meta ("loading…" pill) is a three-tile `.stat-strip`. It ships the published counts (2,426 / 5 / 22, the same numbers as the copy beside it and as taxonomy.json today), and taxonomy.js refreshes them from the data.
- Share is a kit `.btn`, still `#vh-share-btn` for inline-share-btn.js.
- Archetype rows are `.card` with padding 0. The summary declares `min-height:44px` and its "Details/Hide" label goes from 10.5 px to `--t-xs` (D8).
- Member chips are `chip-link vh-tax__chip` (44 px). The page's own chip rule is reduced to the position `<span>`.
- Signature bars: the positive gradient goes to `--coin-text`, the negative to `--fg-3`. Search input radius is `--radius-xl`.

**Raw hex in the three pages' `<style>` blocks: 0.** In-page inline `style=""`: insights 6 → 1 and twin-network 4 → 1, the `#main padding-top:0` shared with every wave-1 page. Taxonomy's share button style is gone.

## Detector receipts

`python scripts/check_design.py --report --json after.json --baseline before.json`. The baseline is this branch at 519ae3a8.

| Detector | Site | The three pages + their assets |
|---|---|---|
| D2 head parity | 0 → 0 | 0 → 0 (wave 1 fixed these heads) |
| D6 hex | 909 → 863 | **51 → 5**: insights.html 9→0, insights-cards.css 4→0, insights.js 16→0, taxonomy.html 8→0, twin-network.html 1→0, twin-network.js 13→5 |
| D8 font floor | 113 → 112 | 1 → 0 |
| D13 nav parity | 9 → 9 | 0 → 0 |
| D15 inline styles | 101 → 91 | 10 → 0 hits (both pages now ≤ 2) |
| D26 loading leftovers (render) | — | insights 7 → 0, twin-network 2 → 0, taxonomy 0 → 0 (all 12 renders) |

D6 residue, by choice: twin-network.js still has the four `ERA_COLORS` hues plus their grey fallback. They encode time (1990s → 2020s), and the kit has no data palette on the void (kit request below). D21 (7 copy hits on twin-network: "64-d", "MTNN", "cosine") is copy and outside this task. D5/D3/D4 do not move on these pages.

## Renders

`serve.py` + `shoot.mjs`, insights / twin-network / taxonomy × light/dark × 390/1280, under admit.sh (declared 900 MB: at 500 MB the run was RAM-killed twice after 3 shots).

| Render | height | overflow | loading | errors / failed | low |
|---|---|---|---|---|---|
| insights 390 | 4,477 | no | 0 | 0 / 0 | nav brand + "Explore" (light), skip-link (dark): site-nav, not owned here |
| insights 1280 | 10,038 | no | 0 | 0 / 0 | same |
| twin-network 390 / 1280 | 2,847 / 2,749 | no | 0 | 0 / 0 | same |
| taxonomy 390 / 1280 | 5,637 / 3,668 | no | 0 | 0 / 0 | same |

- insights 1280 captures blank in both themes. The page is taller than shoot.mjs's 6000 px viewport cap and `captureBeyondViewport` returns an empty surface. A viewport-only copy of the harness (`wt/hoops-audit/w2edit/shoot-vp.mjs`) captured the top 6000 px in both themes, and it renders correctly. Separately, one first-pass 1280 shot (twin dark) and one taxonomy light shot came back blank and were clean on a rerun: harness flake under RAM pressure.
- Checked by eye:
  - At 390 the index fits with all 7 titles.
  - The spotlight chart reads on the void in both themes.
  - The twin picker has no gap, the stat strip is legible, and the gold twin node has dark ink.
  - Taxonomy void family heads read in light (dark ink-2 text and stat labels on the void) and in dark. The family stat label wrapped ("ARCHETYP ES") in the first render; it is fixed with `white-space:nowrap` and correct in the rerun.

## Gates

- `stamp_lf.py` (asset tokens), `stamp_footer.py --check` OK (26 pages), `sync_public.py` + `--check` OK.
- `budget_check.py`: passed, no budget row moved. insights 144.8 / 185 KiB, taxonomy 118.0 / 154, twin-network 127.6 / 157.
- `check_contrast.py` OK, `check_a11y.py` OK (18 pages).
- `pytest tests -q --ignore=tests/test_vector_core_parity.py`: only the 3 pre-existing tests/test_check_served_model.py failures.
- `node --check` on insights.js, twin-network.js and taxonomy.js.

## Deferred

- **sw.js `CACHE_NAME` v32 → v33.** insights.js, insights.html and taxonomy.html are in CORE and their bytes changed. sw.js is outside this lane; the integrator should bump it.
- The taxonomy hero is still `.vh-tax__hero`, not the kit `.title-card` (§2 row 2 lists it; the 2.6 row does not).
- Twin-network D21 copy ("64-d", "MTNN", "cosine") is a copy pass.
- shoot.mjs 6000 px cap: tall pages capture blank, so insights 1280 needs a clip-tiled capture in the harness.

## Kit requests

- **A data palette on the void:** four era hues (and a neutral) as constant tokens, e.g. `--void-data-1..4`, so twin-network's `ERA_COLORS` can drop its last 5 hex. Today the closest tokens are `--void-ink-2`, `--coin-2` and `--void-accent`, which leaves no blue for the 2010s.
- **A `.card--collapsible` / `details.card` pattern** (summary head with the +/− glyph, ≥ 48 px), so insights' `.vh-ins__sum` can move into atlas.css next to `.disclosure`.

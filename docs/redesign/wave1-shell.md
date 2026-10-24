# Wave 1, task 1.2 (head half): one page shell

Branch `forge/w1-shell`, based on `origin/master` 7940d222 (after #161/#162/#163/#165). Brief: DESIGN-DIRECTION.md §4 task 1.2, §2 primitive 1, §5 D2/D3/D4/D7/D9/D13/D17. The footer half shipped as #171.

No browser was opened (RAM is tight). Everything below is static arithmetic and the repo's own gates. The render list at the end says which pages to look at first.

## Scope

In: every page in `scripts/check_design.py`'s PAGE_GLOBS except the ones below. That is 404, feed-health, insights, the 7 `insights/*` stubs, live, methods, models/mtnn-v5, offline, players, playoff-runs, replay, research, schedule, status, taxonomy, twin-network (22 pages).

Out:
- `index.html`. Scout's #165 owns the home page. Its head and its nav `aria-label="Primary"` are untouched. That leaves 1 D13 hit on index.
- `play.html`, `map-guess.html`, `twenty-questions.html`, `play/era-crossed.html`. Task 1.3 owns these.
- `teams.html`. A retirement PR deletes it.

The out-of-scope pages each changed by exactly one line: the `atlas.css?v=` token, which `stamp_assets.py` moves because atlas.css changed. Nothing else on those pages was edited.

## 1. The head template

Every in-scope page now has this head, in this order: charset, viewport (`width=device-width,initial-scale=1,viewport-fit=cover`), title, description, [robots], canonical (clean URL), color-scheme `light dark`, theme-color `#FCFBF7` light / `#0F1114` dark, og:type / site_name / url / title / description / image / image:width / image:height, twitter:card / title / description / image, icon, apple-touch-icon, manifest, [http-equiv refresh], then `fonts.css` → `atlas.css` → `shell.css` → the page sheet, then the page's `<style>`.

Copy fixes, the obvious drift only:
- Titles use " — " instead of " · " (methods, the model card).
- twitter:title now equals og:title. live had "Courtside Live — …".
- og:url equals the canonical.
- `&mdash;` in schedule's title is written as a literal "—".
- Pages that had no og/twitter block got one. They take the description as og:description and the site card `og-1200x630.png` (checked at 1200×630) as the image.
- Pages that were noindex stay noindex: 404, offline, status, feed-health.

The head was generated, not written by hand. The script kept every tag it did not recognise and reported it. It reported none.

Exceptions, stated:
- **players** loads `unified.css` and then `player-profile-v28.css` before `fonts.css` (see §2).
- **live** keeps three page sheets (live.css, realtime.css, replay-embed.css). Merging them is task 2.4's job. That leaves D3 ×2.
- **offline** gets the metadata but no shared sheets. Its `<style>` is self-contained on purpose: the page has to render with nothing cached. That leaves D3 ×3; 2.7 owns the page.
- **insights/\* stubs** get the metadata but no shared sheets. They are 0 s redirects (meta refresh plus inline-redirect.js) that exist for share cards. Adding 80 KB of render-blocking CSS would only delay the hop, and with sheets the stubs went from 32 to 84 KiB in budget_check. That leaves D3 ×21.

## 2. Legacy sheets (responsive / final-qa / unified / motion)

Links removed from every in-scope page. players keeps `unified.css` (below).

The four files stay in the repo and in sw.js CORE. `play.html` still loads all four until task 1.3 lands. Delete them then.

How I diffed: every rule in the four sheets was compared, property by property, against `atlas.css` and `shell.css` (unconditional rules, same selector). Both load after the legacy sheets on every page, so at equal specificity they win. Each leftover property was then checked for an element on an in-scope page that it could match. The tools are `wt/w1shell/residual.py` and `legacy_scan.py`.

**Ported into atlas.css:**

| Rule | Computed-style argument |
|---|---|
| inputs 16 px (responsive.css:158) | Today `input, .input, textarea, select{font-size:16px !important}` beats atlas.css:451's 15 px on 11 pages. Without the sheet those fields compute to 15 px and iOS zooms on focus. Fix: atlas.css:451 goes 15 → 16 px, and `.wiki-filters select` goes 14 → 16 (players). No `!important`, so D7 is unchanged. Two page rules declared 15 px after atlas and were only rescued by that `!important`: taxonomy `.vh-tax__search input` and twin-network `.vh-tn__field input,select`. Both are now 16 px. replay.css `.rp-speed select` 12 px never had the rescue (replay never loaded responsive.css); left for 2.4. |
| `*{scrollbar-width:thin}` (final-qa.css:3) | atlas sets `scrollbar-width:thin` on `html` only, and the property does not inherit. Without this rule, inner scroll containers (tables, chip rows) get default-width bars. |
| `.card, .btn{overflow-wrap:break-word}` (final-qa.css:9) | atlas sets no overflow-wrap on these, so the default is `normal`. A long unbroken token would push a card past a 390 px viewport. final-qa used `word-break:break-word`. I ported the standard `overflow-wrap:break-word`: with atlas's `.card{min-width:0}` it wraps the same way, and it does not change min-content sizing on pages that never had the rule (index, the games). |
| `a:focus-visible, button:focus-visible{transition:none}` (motion.css:75-76) | DESIGN-DIRECTION §4 wave 3 says to keep this as a rule. Specificity (0,1,1) beats `.btn{transition}` regardless of order, so on the 11 pages focused buttons compute exactly as before. It also matches `.skip-link`: on pages that never loaded motion.css (index, the games, replay, 404, status), the skip link now snaps into view on focus instead of sliding, as it already did on the 11 legacy pages. Wave 3 owns that choreography. |

**Not ported, with the evidence:**
- **Safe-area footer (responsive.css:133-137).** shell.css:220 `.site-footer{padding: … calc(var(--s-7) + env(safe-area-inset-bottom, 0))}` is the same selector and loads later on every page, so it already wins. The computed padding-bottom is s-7 plus the safe area, larger than responsive's 24 px.
- **Print.** None of the four sheets contains `@media print` (grep count 0 in each). atlas.css's print blocks (`:root` ink-on-paper and the `box-shadow:none` block) are the site's print rules. The brief's "and print" turns out to be zero rules.
- **motion.css everything else.** atlas already sets the `.btn` / `.card` transitions, hover and active. Its reduced-motion gate covers the same universal selector. The focus ring is `outline`, which no atlas transition lists. motion's `:root` easing and duration tokens are referenced nowhere.
- **unified.css tokens.** atlas redefines every legacy token anything still uses (`--paper`, `--ink`, `--mono`, `--sans`, `--radius`, …), and it loads later, so computed values already came from atlas.
- **Dead on in-scope pages:**
  - `#mode-tabs`: an id selector; live uses `.mode-tabs`.
  - `.tri`, `.hero` (no element has these classes), `#map-*`, `.pack-grid`, `.guess-row`, `.bottom-tabs`, `.sheet*`, `.vh-btn`, `.city-pill`, `#toast`, `#viral-strip`, `#team-leaderboard`, `.mobile-equation`, `.site-nav__links`.
  - The old flex-nav rules. shell's nav is a grid, and its `@media (max-width:900px)` `.site-nav__brand{max-width:none;overflow:visible}` overrides responsive's 38 % brand clamp.
  - `img/svg/canvas/video{height:auto}`. No in-scope page has an img, svg or video with a height attribute. The only JS-built one is a sparkline whose attributes already match its aspect ratio. Canvas width and height attributes set its natural size, not a CSS height, so `height:auto` does nothing there.
- **Dropped on purpose:**
  - `body{overscroll-behavior-y:none}`. The 6 pages that never loaded it keep pull-to-refresh; now all do.
  - responsive's `@media (max-width:719px){.main{padding-bottom:calc(80px + safe-area) !important}}`. It reserved room for a bottom tab bar that no longer exists; no in-scope page has a fixed bottom bar.

**Page-level dependencies kept:**
- **players** visibly depends on `unified.css` for layout atlas never restates: `.vh-modal-backdrop{position:fixed;inset:0;z-index:80}` (without it the dossier modal renders inline), the `.wiki-row` button reset and flex row, `.wiki-search` flex, and the geometry of `.skills-board`, `.skills-seasons`, `.skillbar-list`, `.swing-badge` and `.vh-dossier__swings`. atlas.css:560-590 only re-skins those. So players keeps `unified.css` as a page sheet, in its old cascade slot before atlas. Moved after `shell.css`, its `:root{--radius:14px}`, `html,body{font-size:18px}`, `.card` and `.btn` would win.
- `player-profile-v28.css` also stays before atlas. Moved after shell.css, it flips six `.pp-btn` properties against atlas's kit `.btn` styling (`overlap.py`).
- Two responsive.css rules still reached players: `.skills-panel, .wiki-controls{padding:clamp(12px,2.5vw,16px)}` and, at ≤479 px, `.wiki-row{flex-direction:column}`. In the second, unified's later `.wiki-row` overrode align-items and gap, so flex-direction was the only property that still applied. Both moved to the top of player-profile-v28.css, which sits at the same cascade point.
- Residual D3 on players (unified.css, v28 before shell.css) goes to task 2.5.
- **research**: `.drift-card` padding came only from responsive.css:106. It is now in research's own `.drift-card` rule.

## 3. Nav

- `aria-label="Vector Hoops site"` on every in-scope nav. 404 and status said "Primary".
- Every in-scope nav carries the noscript fallback taxonomy.html had (9 links).
- `data-active` is the page's own clean URL where it is a nav destination. Pages that were retired into a destination take that destination: research → `/methods`.
- Pages with no parent destination get `data-active=""`. That is 404, status, feed-health and replay (replay is in GAMES, not EXPLORE). site-nav.js reads `''`, which matches no slot or drawer item, so nothing lights. D13 normalises it to `/`. The old replay value `/live` lit the wrong item.
- feed-health had a one-link "← Vector Hoops" nav and no site-nav. It now has the site nav plus `site-nav.js`. The page is still not linked from the nav, so its "NOT LINKED FROM SITE NAV" badge stays true.
- No site-nav on the 7 insights stubs (0 s redirects) or on offline (self-contained). That leaves D13 ×8.
- The How-it-works external glyph is site-nav.js's to fix. It was left alone so the `?v=` token on every page and #166's lane are not disturbed.

## 4. Clean URLs (D17)

- In in-scope hrefs, `/methods.html`, `/insights.html#…`, `/playoff-runs.html`, `/status.html` and `/feed-health.html` became their clean URLs. In the stubs, the same change covers the meta-refresh target and `inline-redirect.js`'s `data-target`.
- The `/status` and `/feed-health` rewrites and cache headers landed on master in #161 (identical to what this task needed), so vercel.json is unchanged here.
- Left as is: methods' 5 × `/research.html`. `/research` is a 308 to `/methods#frontier`, so the clean URL would lose the notebook.
- research.html itself has no rewrite: a rewrite behind that redirect would be dead. Its canonical `/research` points at a URL that redirects. That is a call for Cam, not a redesign.

## Mechanics

- `python wt/hoops-audit/stamp_lf.py`. `scripts/stamp_assets.py` now also visits `models/*.html` and `insights/*.html`. Those are served pages it never stamped, which is how mtnn-v5 kept a stale atlas token. `stamp_assets --check` now reads "across 28 page(s)".
- `stamp_footer.py`, then `--check`: OK, 26 pages.
- `sync_public.py`: synced; `--check` OK.
- sw.js `CACHE_NAME` v27 → v28. The legacy sheets stay in CORE while play.html loads them.
- budgets.json: only the two rows that went red moved, to measured + 3 % rounded up to 1 KiB, and `method` says so. feed-health 99,328 → 118,784 (measured 114,606; it now loads fonts.css + atlas.css + site-nav.js). schedule 124,928 → 135,168 (measured 131,196; it loads atlas.css and fonts.css for the first time). The full 1.5× re-baseline waits for task 1.3.

## Receipts

`python scripts/check_design.py --report --json after.json --baseline master.json`, baseline = `origin/master` 7940d222:

| Detector | All pages | In-scope pages |
|---|---|---|
| D2 head parity | 60 → 7 | 53 → **0** |
| D3 sheet allowlist | 83 → 40 | 71 → 28 (stubs 21, offline 3, live 2, players 2: all above) |
| D4 `:root` outside atlas | 16 → 16 | 5 → 5 (page `<style>` `:root` blocks on offline, research, schedule, status: wave 2) |
| D7 `!important` | 84 → 84 | 37 → 37 (methods/mtnn/research `.doc-*`, research head: 2.7) |
| D9 literal families | 167 → 167 | 5 → 5 (live `<style>`, offline) |
| D13 nav parity | 15 → 10 | 13 → 8 (stubs 7, offline 1; plus index out of scope) |
| D17 clean URLs | 28 → 9 | 25 → 6 (methods `/research.html` ×5, research rewrite) |

D4/D7/D9 do not move in this task. The legacy sheets are still served (play.html), so their hits still count. Removing the links takes them off 11 more pages; the numbers fall when the files are deleted after 1.3.

Served CSS (linked sheet bytes per page, `origin/master` → branch, `wt/w1shell/css_bytes.py`): −20,344 B on each of insights, live, methods, models/mtnn-v5, playoff-runs, research, taxonomy and twin-network; players −8,736 (keeps unified); 404, status and replay +742 (the atlas port); feed-health +1,257; schedule +45,579 (atlas for the first time). Sum over the 22 in-scope pages: 1,318,721 → 1,196,295 B (−9.3 %).

| Gate | Result |
|---|---|
| `check_contrast.py` | exit 0, every statically resolvable pair AA |
| `check_a11y.py` | exit 0 |
| `budget_check.py` | PASSED: 28 pages, interaction proxies and ledger checks |
| `stamp_assets.py --check` (stamp_lf) | OK, 117 assets across 28 pages and 76 modules |
| `stamp_footer.py --check` | OK, 26 pages |
| `sync_public.py --check` | OK, 532 files |
| `pytest tests/test_site.py tests/test_check_design.py tests/test_stamp_footer.py tests/test_no_inline_scripts.py` | 1908 passed |
| `python -m ruff check .` / `format --check .` | all checks passed / 273 files formatted |
| `check_design.py` (enforced D1, D14) | green |

## Render these five first

1. **schedule**: it loads atlas.css and fonts.css for the first time and loses unified's 18 px body and 14 px-radius cards. The body, cards, nav and footer all change.
2. **players**: unified.css is kept before atlas and the two responsive rules moved into v28. Check the directory rows at 390, the dossier modal, and skill bars.
3. **live**: no legacy sheets for the first time. color-scheme goes from `dark light` to `light dark`, and theme-color from one `#F4EFE2` to the pair. Three page sheets.
4. **twin-network**: shell.css used to load before atlas.css (atlas last). Now the order is fonts → atlas → shell → insights-cards, and inputs are 16 px. No same-selector conflict between insights-cards.css and atlas.css (`overlap.py`), but it is the biggest cascade reorder.
5. **feed-health**: it gains the site nav (replacing its back link), fonts.css, and realtime.css after shell.css.

## Deferred

- Delete responsive/final-qa/unified/motion and their CORE entries once 1.3 drops them from play.html. players' unified.css dependency goes with task 2.5.
- `pipeline/build_insights.py` STUB still writes the old stub head. It was already stale: it writes an inline `<script>`, where the committed stubs use `inline-redirect.js` and a stamped footer. A rebuild would undo this head.
- index.html head and nav label (#165 just landed; next shell pass).
- teams.html (being deleted).
- research canonical and redirect (Cam).
- The site-nav.js external glyph.
- The full budgets 1.5× re-baseline after 1.3.
- `scrollbar-width` and overflow-wrap now also apply to index and the game pages: one-line atlas rules, worth a glance in their renders.

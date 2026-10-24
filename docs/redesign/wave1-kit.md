# Wave 1, task 1.1 — the kit exists

Branch `forge/w1-kit` from `origin/master` 22d419a0, with 228a3d05 (#170, the design gate) merged in so the receipts below come from `scripts/check_design.py` on this branch. Brief: DESIGN-DIRECTION.md §4 task 1.1. Files owned: `assets/atlas.css`, `assets/shell.css` (type rules only), `assets/TOKENS.md`. No page was edited by hand; the `?v=` tokens on 19 pages, `sw.js` and `public/` moved mechanically (below).

No browser was opened. RAM is tight on this box and renders are the next task's receipt; everything here is static arithmetic and the repo's own gates. The first visual check of these classes happens when wave 2 adopts them.

## What was built

Each class lives once in `assets/atlas.css`, next to the primitive it extends, in the file's own voice: every colour via `var()`, no new `:root`, new hex only inside the two token tables. The full table with roles, targets and notes is in `assets/TOKENS.md` ("Kit classes").

| Class | Promoted from (§2 seed) |
|---|---|
| `.main--narrow` (760px) | the four page `.main` width overrides (play:30, map-guess:21, era:27, insights:33) |
| `.plate` + `.plate__no` / `h2` / `.plate__rule` / `.plate__meta` | live.css:68-73 geometry, plate.js markup (`.pno/.prule/.pmeta` styled as aliases) |
| `.stat`, `.stat--xl`, `.stat-strip` | atlas `.cqs-strip/.cqs-badge` 541-544, `.title-card__meta` 297-309 |
| `.card--void` (+ the one scoped remap), `.card--door`, `.card__n/__title/__text/__meta/__go` | `.arch-diagram` void pairings 534-540; index.html:305-313 `.door` |
| `.btn--icon` (44×44) | play `#btn-sound`, `.vh-sheet__close` |
| `.btn-primary` collapsed to one rule; `.trail-btn` aliased into `.btn` / `.btn-primary`; primary hover fixed | atlas 368-371 + 657-666 were two definitions; `.trail-btn` 581-591 carried its own gradient. Pre-existing cascade bug: `.btn:hover:not(.btn-accent)` is (0,3,0) — `:not()` carries its argument's weight — so it outranked `.btn-primary:hover` (0,2,0) and painted paper under `--on-accent` text on every primary's hover; the selector now excludes `.btn-primary` / `.btn-play` |
| `.btn.lifeline`, `.lifeline__cost` | atlas `#lifelines-bar .btn-lifeline` 790-820 (same rules, both selectors) |
| `.seg` (44px segments, chosen = ink) | replay-embed.css:34-38 `.rp-cams` |
| `.chip-link` (44px) | map-guess:29-32 `.mode-tab.is-link`, players `.pp-quick-chip` |
| `.row-list` (52px rows, `__main`, `__meta`, `__num`) | atlas `.wiki-row-wrap` 493-506 |
| `.disclosure` (48px summary, +/− glyph, `__hint`, `__body`) | index.html:77-84 `.atlas-more` |
| `.share-bar`, `__status` (live region), `__copy` (select-to-copy) | play.html:253 `.vh-share-row` and its feedback contract |
| `.toast[role=status]` + `.is-visible` | play.html:247-248 (ink on paper: `--fg` on `--bg`) |
| `.state`, `--empty`, `--loading`, `--error`, `__title`, `__label`, `__sketch`; `.skeleton`, `--s`, `--l`, `--block` | atlas `.wiki-empty` 516, index:298 + insights:42-49, twenty-questions:135-139 |
| `.game-status`; `.progress-dots > .progress-dot` (32px) `.is-done/.is-current` | play.html:141-150 + atlas coin pips 744-754 |
| `.answer`, `__row`, `__rule`; `.suggest` (`> ul`, `li`, `.is-active`, `.is-ineligible`) | play.html:170 `#guess-input`, :47 `.suggest` |
| `.result`, `--won`, `--lost`, `__verdict`, `__detail` | play.html:241 + play-engine's result card |
| `.embed3d`, `__bar`, `__axis`, `__frame`, `__canvas`, `__legend`, `__key`, `__swatch`, `__note`, `__tip`, `__state--loading/--error` | embed-3d.js:51-87 inline chrome, map-guess:34-37 sketch, index `.legend-chip` 231-239 (classes only; JS adoption is task 1.4) |
| `.sheet`, `__backdrop`, `__handle`, `__head`, `__title`, `__close` (44×44), `__actions` | play.html:105-106 `.vh-sheet` |

Tokens: `--t-2xs` 10 → 11px; `--void-ink`, `--void-ink-2`, `--void-accent`, `--void-line`, `--void-line-2`, `--void-surface` (restated in the night `:root` with the same values — the void never swaps, and D10 exempts only the token named `void`); `--coin-deep` (material, constant); `--green` given its night value (`#00775A`, the only use is a fill under white at 5.55:1). `.trail-btn` / `#trail-bar` (atlas 581-612) are on tokens; `.arch-diagram` reads `--void-ink` / `--void-accent`. `--pipe` untouched: every primary action, `.trail-btn` included, is one rule reading it, so Cam's hue call is a two-line flip.

shell.css: `.site-nav__brand`, `__link`, `__explore`, `__meta`, `__drawer-title`, `__drawer-close` and `__sound` move from `--font-code` to `--font-display` (taste rule 1: tracked caps are Archivo; ui-monospace ignored their `font-stretch` anyway). `.site-nav__noscript a` drops its literal family for `--font-text`. The five `var(--x, #hex)` fallbacks in those rules are gone (shell.css depends on atlas.css by its own header).

## Receipts

`python scripts/check_design.py --report --json after.json --baseline before.json` on this worktree, before = origin/master eb5cd6cf (#171) measured in a throwaway worktree, after = this branch rebased on it, after stamp and mirror. (The first round measured against 22d419a0; #171 moved D12 26 → 2, D17 32 → 28 and D21 110 → 80 on its own, and none of those three are touched here.)

| Detector | Site before → after | atlas.css | shell.css |
|---|---|---|---|
| D1 | 0 → 0 | 0 → 0 | 0 → 0 |
| D2 | 60 → 60 | 0 → 0 | 0 → 0 |
| D3 | 83 → 83 | 0 → 0 | 0 → 0 |
| **D4** | 16 → 16 | **0 → 0** | **0 → 0** |
| D5 | 63 → 63 | 0 → 0 | 0 → 0 |
| **D6** | 997 → 992 | **0 → 0** (exempt by design) | **5 → 0** |
| D7 | 84 → 84 | 3 → 3 (print, `.visually-hidden`, print box-shadow — unchanged) | 3 → 3 (view-transition and `.vh-rv` gates — unchanged) |
| **D8** | 131 → 128 | **3 → 0** (`--t-2xs`, `.vh-team-tag` 9.5px, `.wiki-row__grades` 10px) | **0 → 0** |
| D9 | 170 → 168 | 1 → 0 (`.atlas-capability`) | 1 → 0 (`.site-nav__noscript a`) |
| **D10** | 1 → 0 | **1 → 0 = 100 %** (`--green` had no night value) | — |
| D12 | 2 → 2 | | |
| D13 | 15 → 15 | | |
| D14 | 0 → 0 | | |
| D15 | 165 → 165 | | |
| D17 | 28 → 28 | | |
| D19 | 0 → 0 (stamp + mirror current) | | |
| D20 | 7 → 7 | 0 → 0 | 0 → 0 |
| D21 | 80 → 80 | | |

Hex colours in atlas.css outside the two token tables (not detector-enforced, counted by hand): 23 → 12. The 12 that remain are print's `#fff/#000/#ccc` and the MARIO block's `#6E4B00 / #7A5200 / #5C4300 / #FFFEF7` (coin and ?-block constants, out of this task's scope; `--coin-deep` is the token they can move onto). `rgba()` outside the tables 9 → 3 (`.vh-modal` shadow, the hero sky wash ×2).

Other gates, all run on this branch after stamp and mirror:

- `python scripts/check_contrast.py` — OK, 28 pairs evaluated, 0 fails (it reads page `<style>` only, so the kit's own pairings were verified by arithmetic: `--void-ink` 11.79:1, `--void-ink-2` 7.46:1, `--void-accent` 6.37:1 on the void; `--coin-deep` 5.83:1 on the wash's deep stop; toast `--fg` on `--bg` 15.2:1 / 16.3:1; `--bad` is 3.93:1 as text on paper, so `.state--error` uses it for the 3px rule only).
- `python scripts/check_a11y.py` — OK, 19 pages, 0 fails (its target-size check reads page styles only; the kit's 44/48/52px targets are declared, not gate-verified).
- `python scripts/check_css_braces.py` — balanced.
- `python -m pytest tests/test_site.py tests/test_check_design.py -q` — exit 0, 0 failures.
- `python scripts/budget_check.py` — green after re-measuring four rows. atlas.css grew 39,665 → 65,408 bytes (gzip 10,310 → 16,026); shell.css 13,069 → 13,727 (gzip 3,335 → 3,590). That pushed four pages over their 1.5× budgets, and the #171 footer stamp pushed `404.html` over after the rebase, so those five rows are set to measured + 3 %, rounded up to 1 KiB, as the brief allows (measured on eb5cd6cf + the kit; `method` in budgets.json says so): `404.html` 102,400 → 106,496 (measured 102,984), `map-guess.html` 151,552 → 180,224 (174,529), `players.html` 921,600 → 955,392 (927,262), `status.html` 81,920 → 110,592 (106,742), `teams.html` 156,672 → 185,344 (179,173). Untouched but close: `play.html` at 1,541,617 / 1,556,480 (99.0 %); wave 1.2's deletion of the four legacy sheets gives it room back.

## Review round (REQUEST_CHANGES on ff1a528b, fixed)

**B1 — the nav slot row clipped at 390.** Archivo at 112 % width, .06em tracking and the un-shadowed 14/18px paddings put the four slots at ~436px inside a 358px box, and `html,body{overflow-x:clip}` hid the spill ("MAP" cut at the left, "HOW IT WORKS" at the right in the reviewer's render). Arithmetic with the reviewer's metrics (11px / 600 / 112 % / .1em: MAP 31.2, PLAY 37.1, EXPLORE 67.5, HOW IT WORKS 108.7px):

| | before (≤900) | after (≤900) |
|---|---|---|
| glyphs (text minus .1em tracking = 1.1px × 3/4/7/12 chars) | 27.9 + 32.7 + 59.8 + 95.5 = 215.9 at 112 % | × 100/112 = 24.9 + 29.2 + 53.4 + 85.3 = **192.8** at 100 % |
| tracking | .1em = 1.1px × 26 chars = 28.6 | .06em = .66px × 26 = **17.2** |
| padding | links 14px × 2 × 3 + Explore 18px × 2 = 120 | 10px × 2 × 4 = **80** |
| glyphs: chevron, external-link | 18 + 18 = 36 | 18 (ext hidden ≤ 480) |
| gaps | 12 × 3 = 36 | 36 |
| **row** | **436.5** | **344.0** in 358 → **14 to spare** |

At 360 (box 328, padding 4px) the row is 296; from 480 to 900 the external-link glyph returns (e.g. 600px: 362 in a 552 box). `.site-nav__slots` also gets `flex-wrap: wrap`, so if real metrics run wider than this linear estimate the row breaks to a second line instead of clipping. The compound `.site-nav__slot.site-nav__link` is restated in the media blocks because shell.css:104 (0,2,0) shadows a plain `.site-nav__slot` padding; the ≤360 block now only tightens padding (tracking is already .06em).

**S2** `.btn:hover:not(...)` now also excludes `.lifeline` (it is (0,6,0) and beat `.btn.lifeline:hover:not(:disabled)` at (0,4,0)); the lifeline hover no longer restates its gradient. **S3** `.seg > button:hover` / `a:hover` exclude the chosen segment (`[aria-pressed=true]`, `[aria-current]`, `.is-active`), since `button:hover` (0,2,1) outranked the attribute rule (0,2,0). **S4** budgets.json `method` names the four +3 % rows and says they wait for the wave-1.2 re-baseline. **S5** `.sheet` has a `max-height: 88vh` fallback before the `dvh` line. Nits: `.sheet__handle{min-height:0}` (responsive.css:163 would otherwise win on legacy pages); `.card--void` reads `--void-accent-line` / `--void-accent-wash` (new tokens, both roots) instead of `color-mix()`; `.disclosure__hint` is the only hint selector.

## Mechanical consequences

- `python C:/Users/jcdav/wt/hoops-audit/stamp_lf.py` re-stamped the atlas.css / shell.css `?v=` tokens on 19 pages with LF endings (both sheets are LF in the index and on disk, so the hashes match CI).
- `sw.js` `CACHE_NAME` v26 → v27 (#171 took v26).
- `python scripts/sync_public.py` mirrored the pages and sheets; `--check` is current.
- Rebased onto origin/master eb5cd6cf (#171 footer stamp) with upstream preferred on the 38 page/mirror token lines and sw.js, then re-stamped; the six owned files came through byte-identical (verified by `git diff` against the pre-rebase head).

## Written down for wave 2 (seeds that need a page change to wear the kit)

- plate.js emits `.pno / .prule / .pmeta`; the kit styles those as aliases of `.plate__no / __rule / __meta`. Rename when plate.js is next touched (2.4), then drop the aliases. live.html's 14 static plates and pregame.js's six carry the same markup today and live.css:78-83 still owns them at higher specificity: the kit's h2 / rule / meta slots declare only properties live.css also sets (the h2 keeps `text-transform: uppercase`, and every live plate title is already uppercase in the markup), so nothing on /live changes until 2.4.
- keyboard-a11y.js:164 closes sheets by adding `.hidden` to `.sheet`; the kit's closed state is `[hidden]` on `.sheet__backdrop`. 2.2 reconciles (one line either side).
- `.suggest` stays the combobox wrapper (input + ul) because keyboard-a11y.js:84 wires it on that shape; `.answer` is the block around it. Pages adopt `class="answer"` on the block and keep `.suggest`.
- `.btn.lifeline` is the kit name; game-mechanics.js still emits `.btn-lifeline` under `#lifelines-bar`, which shares every rule. It also injects its own `.btn-lifeline` sizes (game-mechanics.js:288-289) — 2.2 removes those.
- `.card--door` children are `.card__n / __title / __text / __meta / __go`; index.html's `.door__*` copies win on index until 2.1 deletes them.
- `.progress-dot` is 32px in the kit; play.html and map-guess.html still carry 26/28px copies that win until 1.3 removes them (D5).
- `.truth` (the 3px accent rule, §2 #12) was not promoted: not in task 1.1's list. `.map-note` already carries that rule; one line when 2.2 needs it.
- Visible now, no page edit needed (these are the renders the next task should look at first): `.wiki-row__name .vh-team-tag` and `.wiki-row__grades` on /players are 11px (were 9.5 / 10); the career-trails button on index is pipe green with the hard step (was a moss→terra gradient); the nav labels are Archivo; every primary button hovers to `--pipe-deep` instead of paper; `--t-2xs` 10 → 11px moves every `.pill/.chip`, `.data-table th`, `.title-card__meta` cell and the nav meta up 1px site-wide. Two seeds leak a property their page copy never set: play.html's `.suggest li` rows take the kit's `--t-base` (15px, from the page's 18px body) and map-guess.html's `.progress-dot` numerals take `--fg-3`. Both are what 1.3 ships anyway.
- `.trail-btn` reads `--pipe` and `--pipe` is still green; the flip to marker-red is Cam's call (TOKENS.md "Open brand question").

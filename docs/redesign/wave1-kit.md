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
| `.btn-primary` collapsed to one rule; `.trail-btn` aliased into `.btn` / `.btn-primary` | atlas 368-371 + 657-666 were two definitions; `.trail-btn` 581-591 carried its own gradient |
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

`python scripts/check_design.py --report --json after.json --baseline before.json` on this worktree, before = 22d419a0 untouched, after = this branch after stamp and mirror.

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
| D12 | 26 → 26 | | |
| D13 | 15 → 15 | | |
| D14 | 0 → 0 | | |
| D15 | 165 → 165 | | |
| D17 | 32 → 32 | | |
| D19 | 0 → 0 (stamp + mirror current) | | |
| D20 | 7 → 7 | 0 → 0 | 0 → 0 |
| D21 | 110 → 110 | | |

Hex colours in atlas.css outside the two token tables (not detector-enforced, counted by hand): 23 → 12. The 12 that remain are print's `#fff/#000/#ccc` and the MARIO block's `#6E4B00 / #7A5200 / #5C4300 / #FFFEF7` (coin and ?-block constants, out of this task's scope; `--coin-deep` is the token they can move onto). `rgba()` outside the tables 9 → 3 (`.vh-modal` shadow, the hero sky wash ×2).

Other gates, all run on this branch after stamp and mirror:

- `python scripts/check_contrast.py` — OK, 28 pairs evaluated, 0 fails (it reads page `<style>` only, so the kit's own pairings were verified by arithmetic: `--void-ink` 11.79:1, `--void-ink-2` 7.46:1, `--void-accent` 6.37:1 on the void; `--coin-deep` 5.83:1 on the wash's deep stop; toast `--fg` on `--bg` 15.2:1 / 16.3:1; `--bad` is 3.93:1 as text on paper, so `.state--error` uses it for the 3px rule only).
- `python scripts/check_a11y.py` — OK, 19 pages, 0 fails (its target-size check reads page styles only; the kit's 44/48/52px targets are declared, not gate-verified).
- `python scripts/check_css_braces.py` — balanced.
- `python -m pytest tests/test_site.py tests/test_check_design.py -q` — exit 0, 0 failures.
- `python scripts/budget_check.py` — green after re-measuring four rows. atlas.css grew 39,665 → 64,766 bytes (gzip 10,310 → 15,760); shell.css 13,069 → 13,207. That pushed four pages over their 1.5× budgets, so those four are set to measured + 3 %, rounded up to 1 KiB, as the brief allows: `map-guess.html` 151,552 → 177,152 (measured 171,734), `players.html` 921,600 → 953,344 (925,259), `status.html` 81,920 → 108,544 (104,395), `teams.html` 156,672 → 182,272 (176,574). Untouched but close: `play.html` at 1,539,533 / 1,556,480 (98.9 %) and `404.html` at 100,981 / 102,400; wave 1.2's deletion of the four legacy sheets gives them room back.

## Mechanical consequences

- `python C:/Users/jcdav/wt/hoops-audit/stamp_lf.py` re-stamped the atlas.css / shell.css `?v=` tokens on 19 pages with LF endings (both sheets are LF in the index and on disk, so the hashes match CI).
- `sw.js` `CACHE_NAME` v25 → v26 (master is v25).
- `python scripts/sync_public.py` mirrored 23 files; `--check` is current.
- `git merge origin/master` (228a3d05) for the gate script and its tests; no conflicts, none of its five files are mine.

## Written down for wave 2 (seeds that need a page change to wear the kit)

- plate.js emits `.pno / .prule / .pmeta`; the kit styles those as aliases of `.plate__no / __rule / __meta`. Rename when plate.js is next touched (2.4), then drop the aliases.
- keyboard-a11y.js:164 closes sheets by adding `.hidden` to `.sheet`; the kit's closed state is `[hidden]` on `.sheet__backdrop`. 2.2 reconciles (one line either side).
- `.suggest` stays the combobox wrapper (input + ul) because keyboard-a11y.js:84 wires it on that shape; `.answer` is the block around it. Pages adopt `class="answer"` on the block and keep `.suggest`.
- `.btn.lifeline` is the kit name; game-mechanics.js still emits `.btn-lifeline` under `#lifelines-bar`, which shares every rule. It also injects its own `.btn-lifeline` sizes (game-mechanics.js:288-289) — 2.2 removes those.
- `.card--door` children are `.card__n / __title / __text / __meta / __go`; index.html's `.door__*` copies win on index until 2.1 deletes them.
- `.progress-dot` is 32px in the kit; play.html and map-guess.html still carry 26/28px copies that win until 1.3 removes them (D5).
- `.truth` (the 3px accent rule, §2 #12) was not promoted: not in task 1.1's list. `.map-note` already carries that rule; one line when 2.2 needs it.
- Visible now, no page edit needed: `.wiki-row__name .vh-team-tag` and `.wiki-row__grades` on /players are 11px (were 9.5 / 10); the career-trails button on index is pipe green with the hard step (was a moss→terra gradient); the nav labels are Archivo.
- `.trail-btn` reads `--pipe` and `--pipe` is still green; the flip to marker-red is Cam's call (TOKENS.md "Open brand question").

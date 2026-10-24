# Wave 2, task 2.5: Players

Branch `forge/w2players`, based on `origin/master` 519ae3a8. Brief: DESIGN-DIRECTION.md §4 row 2.5, §2 kit, §5 D5 D6 D7 D8 D26. Teams is out of scope because #175 retired it.

## What changed

**One page sheet.** `assets/player-profile-v28.css` is now `assets/players.css`. It loads after `shell.css` (fonts, then atlas, then shell, then players), so D3 is clean. Because the sheet used to load before atlas, every rule in it was checked against atlas.css with `wt/w1shell/overlap.py`. The tool reports no property that changes value. Where a v28 class and an atlas class sit on the same element, the v28 side no longer states the property, so the kit still wins:
- `.pp-meta-line` with `.skills-player-meta` (font and colour)
- `.pp-seasons button` with `.skills-seasons button` (colours, radius, active state)

What is left is layout and the profile card. In it:
- Every colour is an atlas token.
- Every declared size is 11 px or larger.
- Fonts come only through `--font-display`, `--font-text` and `--font-code`.
- There is no `!important`. The nine are gone: `#skills-profile[hidden]` is covered by atlas `[hidden]`; the `.pp-skills-grid` hotfix only existed to beat unified.css; the reduced-motion block targeted classes that do not exist, and atlas's gate is universal anyway.

**unified.css deleted.** players was the last page that loaded it. These unified rules were still doing work, and they moved into players.css on tokens:
- dossier modal geometry: `.vh-modal-backdrop` fixed/inset/z-index, `.vh-modal` sizing, `body.vh-modal-open`
- the `.wiki-row` button reset, plus the name ellipsis and the meta nowrap
- `.wiki-row__grades` flex, now 44 px tall (was 40)
- `.skills-panel`, `.skills-suggest` and `.skills-board` geometry
- the swing badges and the dossier's swing rows (up is `--pipe`, down is `--accent-2`; no washes)

Everything else in unified.css was dead on players or already restated by atlas (residual.py). The file is removed from `assets/`, `public/assets/` and the sw.js `CORE` list. `CACHE_NAME` is unchanged, as briefed. `git grep unified.css` now hits only prose (THEME-SURFACE.md:38, assets/TOKENS.md:14), check_design.py's `LEGACY_SHEETS` and its test fixture. `public/assets/player-profile-v28.css` is deleted too, because sync_public never deletes.

**Kit adoption.**
- `#pp-random`: `.pp-btn .pp-btn--yellow` → `.btn .btn-primary`. It is the one primary action on the view.
- The six quick chips and the five discover chips → `.chip-link` (44 px). Their clicks still go through `[data-q]`.
- The headline grade `#pp-mega` → `.stat`. The number comes first, then its label: "6 / grades at 99", or "74 / avg grade" when the season has no 90+ grade.
- The discover strip → `.card--void`, so its ink and chips read the void pairings with no colour rules of its own.
- Meta pills → kit `.pill`. The archetype pill is ink on paper (`--fg` / `--bg`).
- The leaderboard `<ol>` gets `.skills-board`, so its rows are atlas's hairline rows.

**No default player.** `players.html` shipped "Victor Wembanyama" and "99 ×6" in the hidden profile. `inline-players.js` read that name and rendered Wemby's 2026-27 projection into the hidden slot on every page load. `#pp-name` and `#pp-mega` now ship empty and players-skills.js fills them. The discover line no longer says "Seen Wemby?".

**Paged directory.** The list rendered the first 400 of 2,422 players: 22,089 px at 1280. It now shows 60 rows and a "Show 60 more" `.btn`.
- Search, position, archetype and letter still filter every player, and each change resets the page to 60.
- The count line reads "Showing 60 of 2,422 players".
- Focus moves to the first newly shown row.
- The button is static markup in players.html, toggled with `hidden` and bound with `addEventListener`, so it stays CSP-clean.
- Page height at 1280 is now 4,442 px (was 22,089).

**390 px search row.** At 720 px and below, atlas makes `.wiki-search-row` a single `1fr` track, which is `minmax(auto,1fr)`. The two selects' intrinsic width then made the grid row wider than the card. players.css gives the row's children `min-width:0`. The second inset (`.wiki-controls` padding inside the card padding) is gone, so the controls line up with the list. At 479 px and below, rows stack left-aligned instead of centred.

**Inline styles.** players.html has no `style=""` left (D15 21 → 0) and no `<style>` block (`.visually-hidden` is atlas:258). players-skills.js no longer writes a hex colour or a sub-11 px size:
- bar fills are tier classes (`.pp-fill--coin/ink/blue/green/accent/mid/low`); only `width:N%` stays inline, because it is data
- archetype dots are `.kdot--rim/shoot/play/motor/other`
- tags are `.pp-tag` (`--accent`, `--ink`, `--soft`)
- the playoff series rows are `.po-series__item` (`--won` gets an accent rule; `--finals` and `--champ` are the other two)
- the game log is `.po-games`, with a 44 px summary
- the next-season table is `.np-splits` (it used to render as a bullet list)
- the court note is `.pp-court-note`
- 97+ grades use the coin material (constant on both themes, `--coin-ink` text)

player-dossier.js: `#e0762e` becomes `--accent-2` (honours) and `--accent` (the truth rule). arc-projections.js: 10 px → 11 px, and the hex fallbacks go.

## Detectors (check_design.py --report, players files)

| | before | after |
|---|---|---|
| D3 players.html | 2 | 0 |
| D4 unified.css | 1 | 0 (file gone) |
| D5 unified.css | 4 | 0 |
| D6 v28/players.css | 36 | 0 |
| D6 unified.css | 56 | 0 |
| D6 players-skills.js | 28 | 0 |
| D6 player-dossier.js | 2 | 0 |
| D7 v28/players.css + players.html | 9 + 1 | 0 |
| D8 v28 + unified + players-skills.js | 12 + 11 + 4 | 0 |
| D9 v28 + players-skills.js | 24 + 7 | 0 |
| D15 players.html | 21 | 0 |
| D26 (shoot.mjs `loading`), 8 renders | players index named in §5 | 0 |

Site totals: D3 28→26, D4 9→8, D5 11→7, D6 909→782, D7 54→44, D8 113→84, D9 150→119, D15 101→80. No detector went up.

## Gates

- stamp_lf, `stamp_assets.py --check`, `stamp_footer.py --check` and `sync_public.py --check`: OK.
- budget_check: all three gates pass. players.html is 887.6 / 933 KiB. The page's CSS went from 25,216 bytes (unified + v28) to 16,484. The page went down, so budgets.json is not re-measured.
- check_contrast and check_a11y: OK.
- `node --check` passes on the four touched JS files.
- pytest (`--ignore=tests/test_vector_core_parity.py`): only the 3 known local failures in tests/test_check_served_model.py.

## Renders

shoot.mjs ran against serve.py, which sends the production CSP, through admit.sh. The files are in `wave2-players/`:
- directory: `players-{390,1280}-{light,dark}.png`
- an opened profile (Stephen Curry 2015-16, `/players?p=stephen-curry&s=2015-16`): `profile-{390,1280}-{light,dark}.png`

The 390 profile renders predate the last CSS fix. That fix keeps grade digits from wrapping and turns the series and tag washes into opaque surfaces. The 1280 profile renders include it.

What the renders showed:
- 0 exceptions, 0 failed requests, `overflow:false`, `loading` 0 on all 8.
- `low` is 2 on every render, all shell chrome: the brand/Explore spans in light, skip-link/Install in dark.
- The first dark profile pass flagged 8 text pairs, and all of them were mine:
  - the coin-gradient rarity note had no `background-color`, so the probe read the dark page under it
  - text on the translucent `--accent-wash` (tags, won series)

  The coin rules got a solid `--coin-wash-2` backing. The tags and won series now use the `.btn-accent` pattern (accent text and line on `--surface`) and an accent left rule. The re-render reads 2, chrome only.
- One console error comes from the profile on every render and is not from this branch: `assets/lemmino/player-court-skill-story.js:103` `getCourtPos` reads `.x` of `undefined` (`ARCH[a%8]` with an undefined archetype index). The card shows "Court story unavailable". Deferred.

## Deferred

- The court-story module crash above (lemmino, data-dependent).
- `.tab-pills` scrolls at 390: "Leaderboards" is clipped by design. A compact kit variant is requested below.
- `.wiki-alphabet button` is 32 px tall, which is under D24's 44. It is a kit rule.
- The profile's rarity copy ("rarer than 0.3% of seasons", "top 9% that year") is fixed text, not computed from the data. The wording was not touched here. Someone should verify it or compute it.
- THEME-SURFACE.md and assets/TOKENS.md:14 still describe unified.css and v28 in prose. TOKENS.md is the kit owner's file.

## Kit requests

1. Retire the `.pp-btn` / `.pp-btn--yellow` aliases in atlas.css (414, 430-431, 724-754). No page uses them now.
2. `.wiki-search-row` mobile track `minmax(0,1fr)` (atlas:546), so pages do not need the `min-width:0` patch.
3. A compact `.tab-pills` at ≤ 420 px (padding 0 12px) so three tabs fit at 390.
4. A blue wash token. `.pp-rarity--blue` and the All-NBA 2nd tag fall back to `--surface` / `--surface-2`.
5. Modal geometry in the kit: `.vh-modal-backdrop` position/inset/z-index and `.vh-modal` sizing live in players.css now. They belong beside atlas's `.vh-modal` skin (atlas:595-596).
6. `.wiki-alphabet button` to 44 px, or a `.seg`-style letter strip.

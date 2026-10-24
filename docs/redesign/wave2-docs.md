# Wave 2, task 2.7: Methods, Model card, 404, shell-only pages (receipts)

Branch `forge/w2docs` from origin/master `9210fc2a`. Scope per DESIGN-DIRECTION.md section 4, row 2.7:
methods.html, models/mtnn-v5.html, 404.html, playoff-runs.html, status.html, feed-health.html,
offline.html, research.html. atlas.css, shell.css, game.css, embed-3d.js, sw.js and every other page are
untouched. Outside the pages, four small edits the pages needed (listed under "Outside the pages").

## What changed

- **Captions without `!important`.** `.doc-note` / `.doc-formula` (methods, mtnn-v5, research) lost their
  `!important`s. They only existed because `.doc-body p` (0,1,1) beat kit `.caption` (0,1,0). The prose
  default is now `:where(.doc-body p)`, zero specificity, so `.caption` wins on its own. Notes are
  `<p class="caption">` (13 px, `--fg-2`; was 14 px `--fg-3`). The formula panel is
  `class="caption doc-formula"` and keeps only its box (padding, accent rule, surface).
- **TOC → chip-links.** `.doc-toc a` is gone; the TOC is a row of kit `.chip-link`s (44 px). It wraps
  centred on desktop and scrolls sideways under 640 px, so nine chips do not stack nine rows deep at 390.
  mtnn-v5 keeps its `01`–`06` numbers inside the chips.
- **Stat strip.** methods' `.stats-strip` / `.stats-chip` (130 Features, 17 Towers, 30 Seasons, 8 Types,
  64-d L2) is the kit `.stat-strip` of `.stat`s. The `data-fact` spans are unchanged.
- **mtnn-v5 status.** `.mc-status` is the kit `.pill`. The `?v=` tokens were already current
  (stamp_assets learned `models/*.html` in wave 1.2); the stamp moved nothing.
- **Provenance the game pages link to.** `#the-model` and `#the-map` already existed with the right
  content (MTNN, and the two PCA maps), so no new sections. Each gained one paragraph, from
  wave2-games.md's paste-ready text:
  - `#the-model` → `<p id="era-crossed">`: nearest other-decade career by cosine in the 64-d embedding,
    cosine × 100, 1,313 rounds in 131 games, ~4 KB per visit. One wording fix against the source: the
    paste said the distractors are "the next-closest of its top-5"; `build_era_crossed.py:62` draws them
    with `rng.sample(top5[1:], 3)`, so the text says "three of the other four shipped top-5 candidates",
    which is what the published provenance said.
  - `#the-map` → `<p id="twenty-questions">`: greedy maximum information gain over 25 yes/no attributes
    (`build_twenty_questions.py:19`), leaves of five or fewer resolve by name (`TIE_LEAF_SIZE = 5`),
    every career within 20 questions, worst case 18. Its last sentence ("the same 3D projection of the
    64-d embedding as Map Hunt; answers fade…") describes the game after forge/w2games lands. On master
    today the Twenty Questions map is still the 2-D PCA of the 14 features. **Merge this after, or with,
    the games branch.**
- **404.** The "critical button rules" block (`.title-card__actions` and `.btn` restated with hex
  fallbacks) is gone; the kit already has both. `.nf__code` lost its `var(--x, #hex)` fallbacks.
- **noindex pages drop canonical and og:url** (404, offline, status, feed-health). 404 and offline are
  served at whatever URL failed, so any canonical on them was false. status and feed-health do have
  their own rewrites (wave1-shell section 4), so for those two this is the brief's call rather than a
  bug. `scripts/build_social_meta.py` would put them back if someone ran it by hand; it is not in CI.
- **status.** The page's alias block (`--card`, `--muted`, `--line-1`) is gone; rules use atlas tokens.
  Dots: `--ok`, `--qblock-2` (there is no warn token; the amber material), `--bad`, each with a
  `color-mix` halo. Pills: the state colour is the border and a tint, the text stays `--fg`, because
  `--ok` is moss (data only, fails as text) and the reds sit near 4:1. The three
  `style="color:var(--muted);font-size:13px"` are `.st__note`, in the page and in
  `scripts/build_status.py`'s template, so the next scheduled run writes the same markup. The
  `Snapshot … UTC` string its `--check` reads is unchanged. Long values (the model string) wrap inside
  `.st__v`; the key column no longer breaks mid-word.
- **feed-health.** Head only (canonical/og:url). Its CSS was already on tokens.
- **offline.** It now has the shell: fonts.css → atlas.css → shell.css, site nav, the stamped footer,
  `.title-card` + kit `.btn`s, and the cached-pages links as `.chip-link`s. The self-contained `:root`
  palette and the system-font stack are gone. All three sheets, site-nav.js and offline.js are in sw.js
  CORE, and the worker answers `?v=` requests from that cache (`ignoreSearch`), so the page still
  renders when the worker serves it offline. The line "Nearest seasons by cosine similarity in the
  64-dimensional MTNN v5 embedding." was removed: it said nothing about being offline and tripped D21.
- **playoff-runs.** Active tab `--fg`/`--bg` (was `#1E2022`/`#F9F6F0`); rank `--coin-text`; the
  Champions badge is coin material (`--coin-2` ground, `--coin-ink` text) at 11 px (was 10.5);
  "How it's scored" summary is 44 px; the three `style=""` are classes.
- **research.** Its `:root` redefinition of `--mono`/`--sans`/`--page-gutter` is gone (atlas defines all
  three; the gutter's max is now atlas's 28 px instead of 20). The `.site-nav` restatement is gone
  (shell.css owns sticky). Hex onto tokens: the cockpit hairline is `--line`; the always-dark stages
  (manim cards, network map canvas, architecture `<pre>`) use the void pairings `--void`,
  `--void-line-2`, `--void-ink`. Every declared size under 11 px is `--t-2xs` or 11 px (CSS and the two
  inline ones). Same caption and chip-link treatment as methods.

## Outside the pages

- `scripts/check_design.py` D2: a page with a robots `noindex` meta is exempt from the canonical and
  og:url requirements (and the og:url = canonical check). Without this, the brief's head change turns D2
  red. Test: `test_d2_noindex_page_needs_no_canonical_or_og_url` (exempt with the meta, two hits
  without it).
- `scripts/stamp_footer.py`: `DEFER` is empty now that offline has the shell; offline is stamped.
  `tests/test_stamp_footer.py` asserts offline is no longer deferred.
- `scripts/build_status.py`: the three `style=""` notes → `class="st__note"` (above).
- `budgets.json`: only the offline row. 32,768 → 106,496 B (measured 103,175, + 3 %, rounded up to
  1 KiB); `method` says so. It now loads the three shared sheets, site-nav.js and the footer.

## Detectors (check_design.py --report --baseline, base 9210fc2a)

Hits on the owned pages, before → after:

| Page | Moved |
|---|---|
| methods | D7 5 → 0 |
| models/mtnn-v5 | D7 5 → 0 |
| 404 | D5 1 → 0, D6 7 → 0 |
| playoff-runs | D6 6 → 0, D8 1 → 0, D15 3 → 0, D20 1 → 0 |
| status | D4 1 → 0, D6 6 → 0, D15 3 → 0 |
| feed-health | none before, none after |
| offline | D3 3 → 0, D4 2 → 0, D5 1 → 0, D6 18 → 0, D9 1 → 0, D12 1 → 0, D13 1 → 0, D21 3 → 0 |
| research | D4 1 → 0, D5 1 → 0, D6 14 → 0, D7 26 → 21, D8 7 → 0 |

D2 is 0 → 0 on all of them (with the noindex rule). D12 0 on all eight.

Site totals: D3 26 → 23, D4 8 → 4, D5 7 → 4, D6 632 → 581, D7 44 → 29, D8 68 → 60, D9 108 → 107,
D12 1 → 0, D13 8 → 7, D15 56 → 50, D20 4 → 3, D21 51 → 48. Nothing went up.

Left on owned pages, on purpose:
- methods D17 × 4: the `/research.html` hrefs. `/research` is a 308 to `/methods#frontier`, so the clean
  URL would lose the notebook (wave1-shell section 4). research D17 × 1 is the same redirect.
- status D21 × 1: "MTNN v5 (single-model policy)" comes from build_status.py on an internal page.
- research D7 × 21, D15 × 39, D21 × 34: see Deferred.

## Gates

- stamp_lf.py: 0 files stamped (110 assets current). stamp_footer.py stamped offline, `--check` OK on
  27 pages. sync_public.py + `--check` OK (435 files).
- budget_check.py: passed after the offline row (above). Every other owned row is under budget.
- check_contrast.py OK; check_a11y.py OK; check_site_facts.py OK (31 facts).
- pytest (minus test_vector_core_parity): only the 3 known test_check_served_model failures.
- ruff check on the changed Python: clean. No JS was touched.

## Renders (serve.py with the production CSP + shoot.mjs), docs/redesign/wave2-docs/

Three gated runs (admit: 2,049 / 2,168 / 2,259 MB available, minimum seen 1,556).

- 390 light/dark: methods, models/mtnn-v5, 404, status, offline, playoff-runs, feed-health.
  1280 light/dark: methods, status, offline.
- Every render: overflow false, 0 exceptions, 0 console errors, 0 failed requests, loading 0.
- What I looked at:
  - methods: chip TOC scrolls at 390, wraps to three centred rows at 1280; captions read smaller than
    prose; stat strip is one row at 1280. At 390 it wraps 2 + 2 + 1 with no hairline between rows (kit,
    below). The Era Crossed and Twenty Questions paragraphs sit in their sections.
  - mtnn-v5: numbered chip TOC; the status pill wraps to two lines at 390.
  - 404: outlined 404 with the accent 0, kit buttons, both themes.
  - status: the first render broke "Model" into "Mod / el" (overflow-wrap on the card); fixed by
    wrapping only the value column, re-rendered.
  - offline: shell nav, title card, kit buttons, chip links, footer, both themes.
  - playoff-runs: active tab inverts per theme, coin badge, gold rank.
- Probe `low`: light flags the nav wordmark ("Vector Hoops", "Explore") at 1.33 and status's tinted
  pills; dark flags the off-screen skip link at 1.07. The probe reads `background-color` only, so it
  sees the translucent nav and the `color-mix` tints as the wrong backdrop. All read fine in the PNGs.
  The pills are `--fg` text.
- Not rendered: mtnn-v5, 404, playoff-runs and feed-health at 1280; offline with the worker actually
  offline (the shell sheets coming from cache).

## Deferred / for others

- **sw.js** (not owned): bump `CACHE_NAME`. offline.html is in CORE and changed bytes, and it now wants
  the shell sheets. Until the bump, a returning visitor's worker serves the old self-contained offline
  page, which still works.
- **research.html**, beyond item 4: 21 `!important`s (its second `<style>` block overriding its first,
  plus `.cqs-badge`/`.anchor-nav`), 39 `style=""`, and 34 D21 hits. It is the engineers' notebook behind
  a 308, so the jargon belongs there; the CSS needs the two style blocks merged and a render pass of its
  own.
- The research redirect and canonical (Cam, as in wave1-shell).
- Twenty Questions paragraph depends on forge/w2games (above).

## Kit requests (atlas.css owner)

- `.stat-strip` on wrap: wrapped rows get no hairline between them and the first tile of a new row keeps
  no left rule, so the 5-tile strip reads loose at 390. A row-gap hairline (or `display:grid` with
  `gap:1px` on a `--line` ground) would fix every page that uses it.
- A status-pill set (`.pill--ok/--warn/--bad`) with AA text in both themes, so status and feed-health
  stop rolling their own. And a `--warn` token; status uses `--qblock-2` for now.
- `.pill` with `white-space:nowrap` or a max width rule: mtnn-v5's long status pill wraps into a
  two-line lozenge at 390.

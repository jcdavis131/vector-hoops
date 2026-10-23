# Vector Hoops — Design Token Table
*Single source of truth, 2026-10-21 (P0 "end the accent-war"). Every token below is defined
exactly once, in `assets/atlas.css`: the light values in the top-level `:root`, the dark
values in the `@media (prefers-color-scheme: dark)` `:root` directly beneath it.*

*History: the late-loading MARIO LIFT layer (PR #73, 2026-10-12) re-defined `--radius` etc.
in a second `:root` block that "won ties on purpose". That block has been deleted and its
values promoted into this table — no more late tie-wins. Its component rules (pipe-green
primary actions, coin-gold rewards) stay; their tokens are now first-class citizens here.*

*Exceptions that are NOT duplicates:*
- `@media print :root` — print-only overrides (ink on paper). Deliberate variant.
- `.live-root` (live.css) — scoped tokens for the live-game widget subtree only.
- `unified.css :root` — loads BEFORE atlas.css; atlas.css loads last and owns the tokens.
  The unified values are the legacy bridge for elements atlas does not restyle.
- `responsive.css @media (min-width:1440px)` — widens `--layout-wide` to 1200px on very
  wide viewports. Deliberate responsive step.

*Base (locked by PLAN §2): Drafting Board paper `#FCFBF7` default; mono/sans type only;
40px sticky nav (`--nav-h`); dark void `#1E2022` stays dark on both themes.*

## Palette — raw tokens

| Token | Light | Night board | Role | Contrast receipt |
|---|---|---|---|---|
| `--board` | `#FCFBF7` | `#0F1114` | page ground | base |
| `--ink` | `#232323` | `#ECEEF1` | primary linework, text | 13.4:1 / 14.7:1 on own board |
| `--marker-black` | `#1A1A1A` | `#F2F2F2` | hand annotations | — |
| `--marker-red` | `#E0483B` | `#FF6F61` | emphasis, X's, alerts (`--accent`, `--bad`) | 4.98:1 on board |
| `--marker-blue` | `#2B6CE5` | `#6EA8FF` | secondary annotations, O's (`--blue`) | 4.96:1 on board |
| `--pencil` | `#9A9A94` | `#7F8995` | dimension lines, callout leaders — **never text** | 2.73:1 |
| `--pencil-text` | `#6E6E66` | `#7F8995` | pencil darkened for text | 4.96:1 / 5.33:1 on board — AA |
| `--grid` | `#E7E4DA` | `#1D232C` | drafting hairlines | — |
| `--highlight` | `rgba(255,235,130,.55)` | `rgba(255,235,130,.16)` | highlighter wash — max one per view | — |
| `--data-terra` | `#A05A38` | `#C17C60` | **data + chart text** (read by `network-viz.js` via getComputedStyle) | 5.05:1 on board — AA |
| `--data-moss` | `#8A9A8B` | `#8A9A8B` | data only, inside charts | — |
| `--void` | `#1E2022` | `#1E2022` | 3D map surfaces only — dark on both themes | — |
| `--void-ink` | `#D8DCD8` | same | text on the void (wave 1 kit; was the literal in `.arch-diagram`) | 11.79:1 on void |
| `--void-ink-2` | `#A7B0BC` | same | secondary text on the void | 7.46:1 on void, 8.63:1 on `--void-surface` |
| `--void-accent` | `#FF7A5C` | same | ember on the void; `--accent` red is 4.02:1 there | 6.37:1 on void |
| `--void-accent-line` / `--void-accent-wash` | `rgba(255,122,92,.45)` / `rgba(255,122,92,.12)` | same | `--accent-line` / `--accent-wash` inside the void (the ember at 45 % / 12 %) | — |
| `--void-line` | `rgba(255,255,255,.14)` | same | hairline on the void | — |
| `--void-line-2` | `rgba(255,255,255,.28)` | same | control borders and hard steps on the void | — |
| `--void-surface` | `rgba(13,16,21,.92)` | same | raised chrome on the void: tooltips, overlays, nested cards | ≈ `#0E1116` over void |

*The void family is restated in the night `:root` with the same values: the void never swaps, and the dark-coverage gate (D10) exempts only the token named `void`, not its ink.*

## Palette — semantic layer

| Token | Light | Night board | Role | Contrast receipt |
|---|---|---|---|---|
| `--bg` | `var(--board)` | `var(--board)` | page background | — |
| `--surface` | `var(--board)` | `#14161A` | card/section surface | — |
| `--surface-2` | `#F5F2E9` | `#1A1D22` | raised surface | — |
| `--line` | `var(--grid)` | `var(--grid)` | borders | — |
| `--line-2` | `var(--pencil)` | `#2A323D` | stronger borders | — |
| `--fg` | `var(--ink)` | `var(--ink)` | primary text | — |
| `--fg-2` | `#57574F` | `#A7B0BC` | secondary text | 7.3:1 / 8.9:1 on board |
| `--fg-3` | `var(--pencil-text)` | `var(--pencil-text)` | tertiary text | 4.96:1 / 5.33:1 — AA |
| `--accent` | `var(--marker-red)` | `#FF7A33` (signature ember — kept for night) | primary emphasis | — |
| `--accent-2` | `#B93A30` | `#FF9A62` | accent deep/hover | — |
| `--gold` | `var(--marker-black)` | `#D4AF69` | award gold | — |
| `--on-accent` | `var(--board)` | `#0A0B0D` | text on accent fills | — |
| `--accent-wash` | `var(--highlight)` | `rgba(255,122,51,.12)` | tinted wash | — |
| `--accent-line` | `rgba(224,72,59,.45)` | `rgba(255,122,51,.45)` | accent borders | — |
| `--ok` | `var(--data-moss)` | `#3DBE8B` | success | — |
| `--bad` | `var(--marker-red)` | `#E5624F` | error/alert | — |
| `--scrim` | `rgba(35,35,35,.45)` | `rgba(3,4,6,.72)` | modal scrim | — |
| `--blue` | `var(--marker-blue)` | `#7FA7D9` | secondary/blue | — |

## Platformer material tokens (ex-MARIO LIFT, promoted 2026-10-21)

| Token | Light | Night board | Role | Contrast receipt |
|---|---|---|---|---|
| `--pipe` | `#1C7331` | `#3FB950` | **primary-action green** (`.btn-primary`, `.btn-play`, nav CTA) | 5.72:1 / 7.75:1 under `--on-accent` |
| `--pipe-deep` | `#175C2A` | `#35C759` | primary-action hover | 7.80:1 |
| `--coin-1` / `--coin-2` | `#FFD94D` / `#F5B921` | same | coin gradient (reward system) | ink on deep stop 9.76:1 |
| `--coin-wash-1` / `--coin-wash-2` | `#FDEFC0` / `#F9DC7E` | same | solved-fill wash | ink on deep stop 12.83:1 |
| `--coin-text` | `#7A5200` | `#E8C766` | deep gold for glyphs/labels | 6.68:1 / 11.52:1 on board |
| `--coin-ink` | `#2A1600` | same | constant ink for text ON coin material | 5.83:1 on wash deep stop |
| `--coin-deep` | `#6E4B00` | same | deep gold for borders and glyphs ON coin material (`.progress-dot.is-current`, `.result--won`) | 5.83:1 on wash deep stop, 6.85:1 on light stop |
| `--qblock-1` / `--qblock-2` | `#F7B733` / `#EE9420` | same | ?-block amber gradient | `#2A1600` on deep stop 7.33:1 |
| `--qblock-ink` | `#2A1600` | same | text on qblock | — |
| `--brick` | `#C08552` | `#8A5F36` | brick-tan hairline — decorative divider | 3.02:1, never text |
| `--step` | `#EAE0CB` | `rgba(0,0,0,.5)` | warm paper step for card offset shadows | — |
| `--block` | `#232323` | `#000000` | hard offset shadow colour | — |
| `--block-line` | `#232323` | `#454F5C` | button border | — |
| `--spring` | `cubic-bezier(.34,1.56,.64,1)` | same | the one playful curve | — |

## Type (mono/sans only — no display-serif, no webfont swap)

| Token | Value | Role |
|---|---|---|
| `--font-display` | `"Archivo", "Inter", ui-sans-serif, system-ui, …` | display |
| `--font-text` | `"Inter", ui-sans-serif, system-ui, …` | body text |
| `--font-code` | `ui-monospace, "SFMono-Regular", …` | mono |
| `--t-2xs … --t-hero` | `11px … clamp(44px, 8.4vw, 112px)` | type scale — `--t-2xs` is 11px since wave 1: nothing on the site is declared under 11px (D8) |
| `--track-label` / `--track-display` | `.16em` / `-.02em` | letter-spacing |

## Space (8px base — `--s-1` and `--s-8` are open gaps, PLAN §2 flags them)

| Token | Value |
|---|---|
| `--s-2` `--s-3` `--s-4` `--s-5` `--s-6` `--s-7` `--s-9` | `8px 12px 16px 24px 32px 48px 96px` |
| `--gutter` | `clamp(16px, 4vw, 48px)` |
| `--content` | `1200px` |
| `--layout-wide` | `1120px` (1200px ≥1440px viewport) |

## Radii (single-sourced — ex-MARIO 5/7/10)

| Token | Value |
|---|---|
| `--radius` | `5px` |
| `--radius-lg` | `7px` |
| `--radius-xl` | `10px` |
| `--nav-h` | `44px` — 40px sticky nav, locked |

## Motion

| Token | Value |
|---|---|
| `--ease` | `cubic-bezier(.2,.7,.1,1)` |
| `--dur-1` / `--dur-2` / `--dur-3` | `140ms` / `320ms` / `720ms` |
| `--shadow` / `--shadow-soft` | `none` (hard stepped shadows via `--block`, never blur) |
| `--focus` | `var(--accent)` — focus-visible ring |

## Legacy bridge (older inline styles inherit the system instead of fighting it)

`--paper`→`var(--bg)` · `--ink-muted`→`var(--fg-2)` · `--orange`/`--verm`→`var(--accent)` ·
`--yellow`→`var(--accent-wash)` · `--green` `#00775A` (both themes — it is only ever a fill under white text, 5.55:1) · `--mono`/`--sans`/`--hd`/`--font-mono`/`--font-sans`→code/text/display.

## The one scoped remap: `.card--void`

`.card--void` (and `.embed3d__state`, which sits on the void) remaps the semantic aliases
once — `--bg/--surface/--surface-2` → the void and `--void-surface`, `--fg/--fg-2/--fg-3` →
the void inks, `--line/--line-2` → the void lines, `--accent/--accent-2/--bad/--focus` →
`--void-accent`, `--accent-line/--accent-wash` → `--void-accent-line/-wash`, `--block/--block-line` →
`--void-line-2` — so every kit child inside the model
window reads the void pairings with no per-class variant. It is a component rule, not a `:root`,
and the only place the ink changes without the OS. Not remapped on purpose: `--step` (the
window's own shadow falls on paper), `--on-accent` and `--pipe` (a primary action keeps its
pairing wherever it stands), the materials.

## Kit classes (wave 1, task 1.1 — DESIGN-DIRECTION §2)

Every class lives once, in `assets/atlas.css`, next to the primitive it extends. Seeds are the
page copies the class was promoted from; wave 2 deletes them. Targets are declared sizes.

| Class | Seed | Role | Target | Notes |
|---|---|---|---|---|
| `.main--narrow` | play:30 / map-guess:21 / era:27 / insights:33 (each set its own width) | 760px measure for prose and games | — | no page overrides `.main` width any more |
| `.plate` + `.plate__no` / `h2` / `.plate__rule` / `.plate__meta` | live.css:68-73 geometry, plate.js markup | numbered card/section head, left-aligned; `.section-head` stays for centred page sections | — | plate.js's `.pno/.prule/.pmeta` are styled as aliases until that markup is renamed; `.card .plate > h2` restates the title at card specificity so `.card h2` does not resize it |
| `.stat`, `.stat--xl`, `.stat-strip` | atlas `.cqs-strip/.cqs-badge`, `.title-card__meta` | one number (`b` first) with its label; the strip joins tiles with hairlines | — | number `--t-lg`, `--xl` is `--t-2xl`; the one big readout a page carries |
| `.card--void` | `.arch-diagram` pairings, insights `.vh-ins__vizwrap` | the model window: void ground on both themes, void ink | — | the scoped remap above; `color-scheme: dark` inside |
| `.card--door` + `.card__n/__title/__text/__meta/__go` | index.html:305-313 `.door` | a card that is one link (home doors) | whole card | hover is border colour only — no lift, no blur |
| `.btn--icon` | play `#btn-sound`, `.vh-sheet__close` | icon-only button | 44×44 | `aria-label` required |
| `.btn-primary` (one rule) | atlas 368-371 + 657-666 were two | the single primary action per view | 44 | reads `--pipe`; `.trail-btn` is now an alias, so Cam's hue flip is one token |
| `.btn.lifeline`, `.lifeline__cost` | atlas `#lifelines-bar .btn-lifeline` | ?-block power-up | 44 | same rule as the current `#lifelines-bar` selector |
| `.seg` (`> button`, `> a`, `[aria-pressed=true]` / `.is-active`) | replay-embed.css:34-38 `.rp-cams` | segmented control: one setting, N exclusive options | 44 | chosen segment is ink on paper; tabs that switch panels stay `.tab-pills` |
| `.chip-link` | map-guess:29-32 `.mode-tab.is-link`, players `.pp-quick-chip` | a link or toggle dressed as a chip | 44 | `.chip/.pill` stay 28px status, never a control |
| `.row-list` (`> li`, `__main`, `__meta`, `__num`) | atlas `.wiki-row-wrap` 493-506 | hairline rows, hover raises the paper | 52 | `__num` is mono: data only |
| `.disclosure` (`> summary`, `__hint`, `__body`) | index.html:77-84 `.atlas-more` | `<details>` with a +/− glyph | summary 48 | glyph box is `width` + `aspect-ratio`, never `height` (D20 counts `height:` on `summary::before`) |
| `.share-bar`, `__status`, `__copy` | play.html:253 `.vh-share-row` + its feedback contract | `.btn` group, live-region status, select-to-copy panel on clipboard denial | 44 | `__status` is the `role=status` line; `assets/toast.js` (task 1.3) drives it |
| `.toast[role=status]` + `.is-visible` | play.html:247-248 (and 3 copies) | one pill, ink on paper, bottom centre | — | `--fg` on `--bg`: 15.2:1 / 16.3:1; the four `.vh-toast` copies go in wave 2 |
| `.state`, `--empty`, `--loading`, `--error`, `__title`, `__label`, `__sketch`; `.skeleton`, `--s`, `--l`, `--block` | atlas `.wiki-empty` 516, index:298 + insights:42-49 skeletons, twenty-questions:135-139 error | empty / loading / error states | — | `--error` uses `--bad` for its 3px rule only — marker-red is 3.93:1 as text on paper |
| `.game-status` | play.html:141-147 `.game-status-bar`, tq `.tq-status`, era `.ec-status` | status row under the game title | — | hairline above, centred |
| `.progress-dots > .progress-dot.is-done/.is-current` | play.html:148-150 + atlas coin pips 744-754 | one dot per guess | 32 | done = coin pip, current = coin wash with `--coin-deep` |
| `.answer`, `__row`, `__rule`; `.suggest` (`> ul`, `li`, `.is-active`, `.is-ineligible`) | play.html:170 `#guess-input`, :47 `.suggest` | the guess input with its typeahead | input 48, rows 44 | `.suggest` stays the wrapper (input + ul) because keyboard-a11y.js wires the combobox on that shape; 16px input text so iOS does not zoom |
| `.result`, `--won`, `--lost`, `__verdict`, `__detail` | play.html:241 + play-engine's result card | the verdict card: `.plate` + verdict + `.share-bar` | — | won is the coin wash with constant coin ink; lost keeps paper with a `--bad` rule |
| `.embed3d`, `__bar`, `__axis`, `__frame`, `__canvas`, `__legend`, `__key`, `__swatch`, `__note`, `__tip`, `__state--loading/--error` | embed-3d.js:51-87 (inline chrome), map-guess:34-37 sketch, index `.legend-chip` | the one atlas chrome: bar, legend, loading and error state | seg 44 | classes only — embed-3d.js adopts them in task 1.4 and reads colours via `getComputedStyle` |
| `.sheet`, `__backdrop`, `__handle`, `__head`, `__title`, `__close`, `__actions` | play.html:105-106 `.vh-sheet` | bottom sheet; centred from 600px | close 44×44 | closed state is `[hidden]` on the backdrop; keyboard-a11y.js:164 still closes by adding `.hidden` to `.sheet` — wave 2.2 reconciles |

## Open brand question (for Cameron — NOT resolved by this table)

PLAN §2 pins **marker-red `#E0483B` for emphasis/actions**, but the shipped MARIO layer
makes primary actions **pipe-green `#1C7331`** (PR #73, his word, with receipts). This table
documents the green as the current primary-action token — it does not adjudicate which brand
is right. Switching primaries back to marker-red is a one-token change (`--pipe` values),
but it is a brand call, not a P0 fix. Since wave 1 `.btn-primary` is one rule and every
primary (including `.trail-btn`) reads `--pipe`, so the flip touches exactly two lines.

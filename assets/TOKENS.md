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
| `--t-2xs … --t-hero` | `10px … clamp(44px, 8.4vw, 112px)` | type scale |
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
`--yellow`→`var(--accent-wash)` · `--green` `#00775A` · `--mono`/`--sans`/`--hd`/`--font-mono`/`--font-sans`→code/text/display.

## Open brand question (for Cameron — NOT resolved by this table)

PLAN §2 pins **marker-red `#E0483B` for emphasis/actions**, but the shipped MARIO layer
makes primary actions **pipe-green `#1C7331`** (PR #73, his word, with receipts). This table
documents the green as the current primary-action token — it does not adjudicate which brand
is right. Switching primaries back to marker-red is a one-token change (`--pipe` values),
but it is a brand call, not a P0 fix.

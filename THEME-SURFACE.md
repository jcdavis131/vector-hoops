# Theme-Surface Audit — Drafting Board retheme

Branch: `scout/drafting-board` @ `66876801` (origin/master). **READ-ONLY audit** — no code changed.
Spec: `~/workspace/vector-hoops/specs/three-upgrades-SPEC.md` §1 (japandi v5 "Drafting Board").
Method: grep/wc over tracked files only (`public/` is a byte-mirror; counts below are root-side).

---

## 1. Served HTML pages

**15 root pages, each mirrored byte-identical to `public/`** (top-level mirror rule):

| Page | Notes |
|---|---|
| `index.html` | Landing. Loads **only** `atlas.css` |
| `play.html` | Daily Court game. Full CSS stack |
| `players.html` | Directory + dossiers. Adds `player-profile-v28.css` |
| `leaderboard.html` | Adds `hoops.css`, `nux.css` |
| `insights.html` | Insight cards hub |
| `trends.html`, `model.html`, `methods.html`, `everyday.html`, `taxonomy.html`, `research.html`, `playoff-runs.html`, `props-lab.html`, `offline.html`, `404.html` | Standard stack or atlas-only |

**Subdirectory pages** (also served, also mirrored): `insights/` ×12 cards, `playoff-runs/index.html`, `props-lab/` subpages (per HEARTBEAT: 28 total public HTML).
**Known exception:** untracked `studio.html` + `public/studio.html` (research stub, uncommitted, undeployed) — not a served surface.

CSS loaded per page: `404, everyday, index` → atlas only. `offline` → none (inline). All others → `shell, responsive, unified, motion, final-qa, atlas` (+ page-specific extras above). **`atlas.css` loads LAST on every page** and wins all token conflicts.

---

## 2. CSS files (5,413 lines total)

| File | Lines | Owns |
|---|---|---|
| `assets/hoops.css` | 2,824 | Largest system: game components, cards, guess rows, pack UI, data-viz categorical tokens (`--data-orange/blue/purple`), type/space scale (`--text-body`, `--layout-max`, `--touch-min`) |
| `assets/atlas.css` | 700 | **Token authority** (loaded last): full light/dark palette, type scale, nav, tabs, pills, buttons, sheets, legacy-token bridge |
| `assets/player-profile-v28.css` | 582 | Players page: profile card, skills panel, dossiers |
| `assets/responsive.css` | 501 | Mobile-first fluid layout; consumes `--page-gutter/--layout-max/--layout-wide` |
| `assets/trading-card.css` | 348 | Collectible career-arc trading cards (dark "void" aesthetic) |
| `assets/unified.css` | 128 | Fargekart ground tokens (`--paper #f7f5f0`, `--ink #14181d`) — **shadowed by atlas bridge** on all pages |
| `assets/nux.css` | 120 | New-user-experience modal |
| `assets/motion.css` | 110 | Motion layer: decisive neobrutalist easing, draw/pulse/shake keyframes |
| `assets/shell.css` | 64 | Shared top nav (44px mono) |
| `assets/final-qa.css` | 36 | Overflow guard, scrollbar, overscroll, media max-width |

Plus per-page `<style>` blocks (e.g. `play.html` ~130 lines: game-head, dots, tabs, guess rows, sheets).

---

## 3. Custom-property inventory

**110 distinct tokens defined; 93 consumed via `var()`; 19 defined-but-unused.** Two token families coexist:

- **Atlas family** (effective — atlas.css loads last): `--bg/--surface/--surface-2/--line/--line-2/--fg/--fg-2/--fg-3/--accent/...`
- **Hoops family** (hoops.css/unified.css): `--paper/--ink/--ink-soft/--hairline/--data-*` — but atlas's **legacy bridge** remaps `--paper→var(--bg)`, `--ink→var(--fg)`, `--ink-muted→var(--fg-2)`, `--hairline→var(--line)`, `--orange/--verm→var(--accent)`, `--yellow→var(--accent-wash)`, `--green→var(--ok)`, `--mono/--sans/--hd→font vars`, `--shadow*→none`. So `--ink` (178 uses) actually resolves to `--fg`.

### Core palette — dark value / light value / usage count / main consumers

| Token | Dark (`:root`) | Light (`prefers-color-scheme: light` / `[data-theme="light"]`) | Uses | Consumes |
|---|---|---|---|---|
| `--bg` | `#07090C` | `#F3F1EC` | 11 | body, page grounds |
| `--surface` | `#0D1015` | `#FFFFFF` | 198 | cards, sheets, inputs, tabs |
| `--surface-2` | `#131820` | `#E9E6DF` | 25 | raised cards, active tabs |
| `--line` | `#1D232C` | `#DCD8CF` | 104 | hairline borders |
| `--line-2` | `#2A323D` | `#C8C3B8` | 202 | stronger borders, pills |
| `--fg` | `#ECEEF1` (17.1:1) | `#0E1116` (16.7:1) | 80 | primary text |
| `--fg-2` | `#A7B0BC` (9.1:1) | `#454C57` (7.7:1) | 103 | secondary text, ledes |
| `--fg-3` | `#7F8995` (5.6:1) | `#5B6370` (5.4:1) | 89 | micro-labels, eyebrows |
| `--accent` | `#FF7A33` (7.7:1) | `#B03A0A` (5.4:1) | 139 | the one signature color: CTAs, active states, wins |
| `--accent-2` | `#FF9A62` | `#C2410C` | 3 | hover accents |
| `--accent-wash` | `rgba(255,122,51,.12)` | `rgba(176,58,10,.08)` | 33 | tinted backgrounds |
| `--accent-line` | `rgba(255,122,51,.45)` | `rgba(176,58,10,.40)` | 10 | tinted borders |
| `--on-accent` | `#0A0B0D` | `#FFFFFF` | 31 | text on accent |
| `--gold` | `#D4AF69` | `#8A6D1F` | 2 | insight-card gold |
| `--ok` | `#3DBE8B` | `#0F7A55` | 8 | solved/correct states |
| `--warn` | `#E0B341` | `#8A6400` | 0 | (defined, unused) |
| `--bad` | `#E5624F` | `#B42318` | 2 | failed states |
| `--void` | `#05070A` | `#05070A` (unchanged — "dark in both themes") | 3 | map field |
| `--scrim` | `rgba(3,4,6,.72)` | `rgba(14,17,22,.45)` | 2 | modal backdrops |
| `--blue` | `#7FA7D9` (bridge) | `#2F5E99` | 6 | links, info |
| `--ink` → `--fg` | (bridge) | (bridge) | 178 | legacy inline styles, canvas-adjacent text |
| `--paper` → `--bg` | (bridge) | (bridge) | 31 | legacy grounds |
| `--ink-soft` | `#52514e` (hoops, unshadowed) | same | 53 | muted text (older components) |
| `--ink-muted` | → `--fg-2` (bridge) | (bridge) | 34 | secondary labels |
| `--hairline` | → `--line` (bridge) | (bridge) | 25 | dividers |
| `--mono` → `--font-code` | `ui-monospace…` | same | 198 | dimensions, data, numerals |
| `--font-display` | Archivo/Inter | same | 70 | headlines |
| `--font-sans`/`--font-text` | Inter/system | same | 74 | body |
| `--data-orange` | `#d8452a` | same (no light variant) | 29 | chart data: offense/Chimera |
| `--data-blue` | `#1b45a7` | same | 16 | chart data: defense/guesses |
| `--data-purple` | `#9b6bc4` | same | 3 | archetype accents |
| `--hot/--warm/--cold` | `#006300/#7a5b00/#d03b3b` | same | 29 | heat states |
| `--identified/--silver` | `#e8b500/#8f96a3` | same | 14 | win states |
| `--ease` | `cubic-bezier(.2,.7,.1,1)` | same | 32 | motion |
| `--radius` | `4px` (atlas) / `14px` (unified, shadowed) / `10px` (hoops, shadowed) | same | 22 | corners — **three competing values** |
| `--nav-h` | `60px` | same | 4 | nav height |

**Latent bugs found (retheme should fix):** `--ink-mut` (typo, `everyday.html:20`) and `--void-2` (`everyday.html:33`) are used but **never defined** — both silently fall back. 19 defined-but-unused tokens (e.g. `--warn`, `--paper-raised`, `--ink-faint`) are dead weight.

---

## 4. Hardcoded colors outside the token system

**Canvas/WebGL map code:**
- `assets/shared-map.js` (644 lines) — **branches on a `dark` boolean** (`dark = !!opts.dark`): 8× `#1A150F`, 5× `#FF7A33`, 5× `#D55E00`, 4× `#FFFFFF`/`#FFFEF7`, 3× `#05070A`, plus Okabe-Ito palette (`#E69F00 #CC79A7 #56B4E9 #009E73 #0072B2 #F0E442`) for twin rings. **Caller `play.html:420` hardcodes `dark:true`** — the game map is always the dark void (spec §1.5 says keep `--void` for map surfaces, so this is spec-aligned).
- `assets/atlas-map.js` (435 lines) — **the good citizen**: `readColors()` pulls from `getComputedStyle`, re-reads on `prefers-color-scheme: change`. Still hardcodes `#FF7A33` accent + `rgba(255,255,255,0.07/0.14)` axes + `#F4F6F8` peers (comment: "the field is always the dark void").
- `assets/map-lenses.js` (296) — lens bar inherits page tokens; no hardcoded field colors.
- `assets/subset-map.js` — same hardcoded set as shared-map (`#1A150F`, `#FFFEF7`, Okabe-Ito).
- `assets/embedding-nebula.js` — Okabe-Ito palette hardcoded (`#F0E442 #E69F00 #D55E00 #CC79A7 #56B4E9 #009E73 #0072B2 #000000`).
- `assets/network-viz.js` — **worst offender**: 42× `#111111`, 15× `#FFFFFF`, 8× `#585858`, plus `#67b5ff`, `#B8AFA0`, `#f3a26f`, `#f0eee6`. No theme awareness at all.
- `assets/drift.js` — chart palette hardcoded (`#c98500 #3987e5 #eb6834 #9085e9 #199e70 #e66767 #d55181`, 2× `#ffffff`).
- `assets/arc-projections.js` — `#c9a227 #8a8f98 #a7adb6`.
- `assets/career-trails.js` — **already uses Drafting Board data colors**: `#C17C60` (terra) + `#8A9A8B` (moss) hardcoded, plus `#ECEEF1`/`#07090C` text/field.

**Inline styles in HTML/JS:** sparse — `#eb6834` ×2, `#3a3732` ×2, `#FFF6D5` ×2, `#080A0F` ×2, `#009E73`, `#0072B2`, `#C9D4E5`, `#6b6860`, `#fff/#fafaf8`. `game-mechanics.js` injects coachmark CSS with `var(--surface)`/`var(--ink)` fallbacks `#fffdf8`/`#232323` (already paper-ish).

---

## 5. Image/SVG assets assuming dark backgrounds

| Asset | Finding | Action for retheme |
|---|---|---|
| `assets/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `icon-maskable-512.png` | Corners sample `#090909` — dark badge | **Redraw** on `--board` |
| `assets/og-1200x630.png`, `og-1080x1920.png`, `og-embed.png` | Dark corners — social cards are dark | **Regenerate** |
| `assets/og/insight-*.png` (12 cards) | Mixed (one sampled light-cornered) — audit per card | Regenerate as a set |
| `assets/favicon.svg` | `fill="#07090C"` disc + `#FF7A33` mark | Recolor disc to `--board`, keep marker accent |
| `assets/og.svg` | `#111111/#52514e/#898781` on `#fafaf8` — already light | Keep, minor touch-up |

No CSS `url()` background images found — all imagery is `<img>`/meta, so no background-blend surprises.

---

## 6. Dark-mode machinery

1. **Default is dark** ("court at night"): `:root` in `atlas.css` sets `color-scheme: dark` + the dark palette.
2. **Light comes only from the OS**: `@media (prefers-color-scheme: light){ :root:not([data-theme="dark"]){ … } }` flips every token.
3. **Manual override exists but is dead code**: `:root[data-theme="light"]` duplicates the light values — **nothing in JS or HTML ever sets `data-theme`** (verified across all `.js`/`.html`; the only `data-theme` hits are unrelated insight-card `data-theme="money|entity"` attributes).
4. **No toggle UI, no localStorage theme key.** Pages carry `<meta name="color-scheme" content="dark light"/>` + per-scheme `theme-color` metas.
5. **JS theme awareness is ad-hoc**: `atlas-map.js` listens to `prefers-color-scheme: change` and re-reads CSS vars (correct pattern); `shared-map.js` takes a hardcoded `dark:true` from `play.html:420`; everything else is CSS-driven.

**Retheme implication:** Drafting Board is paper-first, so the retheme inverts the default — the clean path is making the Drafting Board tokens the new `:root` default and keeping a `prefers-color-scheme: dark` block for the void aesthetic, rather than bolting a third theme onto the existing two.

---

## 7. Draft token-mapping table (spec §1.2 — mapping only, not implemented)

| Old token (effective) | Dark value | → Drafting Board token | Notes |
|---|---|---|---|
| `--bg` | `#07090C` | `--board #FCFBF7` | page ground becomes paper |
| `--surface` | `#0D1015` | `--board #FCFBF7` | cards sit on board; separation via `--grid` hairlines |
| `--surface-2` | `#131820` | `--board` + `--grid #E7E4DA` border | raised = hairline frame, not fill |
| `--line` / `--line-2` | `#1D232C` / `#2A323D` | `--grid #E7E4DA` / `--pencil #9A9A94` | drafting hairlines + dimension lines |
| `--fg` (→`--ink`) | `#ECEEF1` | `--ink #232323` | primary text/linework |
| `--fg-2` (→`--ink-muted`) | `#A7B0BC` | `--ink` at 72% or `--pencil` | secondary text |
| `--fg-3` (→`--ink-faint`) | `#7F8995` | `--pencil #9A9A94` | micro-labels, dimensions |
| `--accent` (→`--orange/--verm`) | `#FF7A33` | `--marker-red #E0483B` | the one annotation voice for emphasis/X's/alerts |
| `--accent-2` | `#FF9A62` | `--marker-red` (darker stroke) | hover states |
| `--accent-wash/--accent-line` (→`--yellow`) | orange tint | `--highlight rgba(255,235,130,.55)` | **max one per view** (spec) |
| `--on-accent` | `#0A0B0D` | `--board #FCFBF7` | text on marker |
| `--gold` | `#D4AF69` | `--marker-black #1A1A1A` | insight "gold" becomes ink emphasis |
| `--ok` (→`--green`) | `#3DBE8B` | `--data-moss #8A9A8B` | data/state inside charts |
| `--bad` | `#E5624F` | `--marker-red #E0483B` | errors = red X voice |
| `--warn` | `#E0B341` | `--highlight` | warnings = highlighter wash |
| `--void` | `#05070A` | `--void #1E2022` | **retained** — map surfaces stay dark per spec §1.5 |
| `--scrim` | `rgba(3,4,6,.72)` | `rgba(35,35,35,.45)` | backdrops over paper |
| `--blue` | `#7FA7D9` | `--marker-blue #2B6CE5` | links, O's, secondary annotations |
| `--data-orange` | `#d8452a` | `--data-terra #C17C60` | data-only, inside charts |
| `--data-blue` | `#1b45a7` | `--marker-blue #2B6CE5` | data-only |
| `--data-purple` | `#9b6bc4` | `--data-moss #8A9A8B` | collapse to 2 data hues per spec ("two voices") |
| `--hot/--warm/--cold` | greens/reds | `--data-moss` / `--highlight` / `--marker-red` | heat → moss/highlight/red |
| `--identified` | `#e8b500` | `--highlight` | win state = highlighter wash |
| `--silver` | `#8f96a3` | `--pencil` | "close enough" = pencil voice |
| `--ink-soft #52514e` | (unshadowed) | `--ink` | fold into ink |
| `--shadow-block: 4px 4px 0 var(--ink)` | neobrutalist | **remove** → `6/10/14` radii, hairline frames | spec: technical crispness, no block shadows |
| `--radius 4px` (atlas) vs `14px` (unified) vs `10px` (hoops) | conflicting | `6 / 10 / 14` | resolve the three-way conflict to spec |
| `--font-display` (Archivo) | display | keep for headlines; **mono takes over** data/labels/dimensions per spec §1.2 | "Two voices": mono for data, drawn-SVG for hand |
| `--font-text` (Inter) | body | system sans for prose; mono for all data | — |

**New tokens to introduce** (no old equivalent): `--marker-black #1A1A1A`, `--highlight`, `--grid`, `--pencil` (some exist as values already: `--hairline`≈`--grid`, `--ink-soft`≈`--pencil`).

---

## 8. The 5 riskiest files to retheme

1. **`assets/network-viz.js`** — 42× `#111111` / 15× `#FFFFFF` hardcoded, zero theme awareness, no `readColors` pattern. A full color-pass rewrite; every node/edge/label color must be remapped and it has no OS-theme listener to copy.
2. **`assets/shared-map.js`** — 644 lines of canvas code with a `dark` boolean baked into ~15 color branches. Spec says the map *stays* dark (`--void`), but the surrounding chrome (lens bar, chips, legend, hover tips) rethemes to paper — the handoff edges (tooltips, selected-ring colors like `#FF7A33` vs `--marker-red`) need care, and the `dark:true` hardcode in `play.html:420` must become theme-aware if the page ever offers a light map.
3. **`assets/hoops.css`** (2,824 lines) — the biggest blast radius: game components, guess rows, pack UI, plus the shadowed `--paper/--ink` family that *looks* authoritative but loses to the atlas bridge. Any retheme must edit the winning layer (atlas) not this one, and the file's 43 uses of the Fargekart categorical set (`--data-orange/blue/purple`) need collapsing to terra/moss per spec.
4. **`assets/trading-card.css`** (348 lines) — "Trading Card Void": radial gradients, collectible-card chrome designed *as* a dark artifact. Retheming to paper kills its identity; likely needs a deliberate redesign (paper card, ink frame, marker annotations) rather than a token swap.
5. **`play.html` inline `<style>` + `assets/game-mechanics.js` injected CSS** — the most-touched surface (daily game): coachmark backdrop/scrim math, `.vh-sheet` bottom sheets, lens-bar pills, result cards with inline `style="border-color:var(--green)"` etc. High traffic + high emotion = every contrast miss is visible. The injected coachmark CSS in JS is easy to miss in a token sweep (grep `'.coachmark` — it's string-built).

**Honorable mention:** `assets/atlas-map.js` is the *template* for doing this right (`readColors()` + `prefers-color-scheme` listener) — copy that pattern into network-viz/drift/arc-projections.

---

*Audit completed 2026-10-09. Worktree untouched (read-only). All counts from tracked root-side files; `public/` mirrors byte-identical per repo rule.*

# Japandi Design System — vector-* family v4

**Goal:** More aesthetically pleasing, modular, extensible — Japanese wabi-sabi + Scandinavian hygge, warm, calm, craft.

## Philosophy
- Quiet luxury, not brutalist. Soft edges, natural materials, breathing room.
- One warm paper, one soft ink, one muted pop (terracotta), stone mid, moss accent.
- Modularity: every section is a self-contained card with clear props, swappable.
- Extensibility: tokens as CSS vars, components as IIFEs with public API, no build step.

## Tokens
```css
:root {
  /* Paper — warm */
  --paper: #F9F6F0;        /* main bg, was #FAFAF8 */
  --paper-2: #FEFCF8;      /* shell inner */
  --stone-50: #F5F1EB;
  --stone-100: #E8E0D5;
  --stone-200: #D4C4B0;    /* hairline border */
  --stone-300: #B8A99A;

  /* Ink — softer */
  --ink: #2A2A2A;          /* was #111 */
  --ink-60: #6B6B6B;
  --ink-40: #9A9A9A;

  /* Pop — single terracotta, replaces orange #EB6834 */
  --pop: #C17C60;          /* japandi terracotta */
  --pop-soft: #D9A88C;
  --pop-ink: #FEFCF8;

  /* Accents — muted, low-sat */
  --moss: #8A9A8B;
  --moss-20: #E8EBE8;
  --clay: #A67B5B;

  /* Map void — softer charcoal, not pure black */
  --void: #1E2022;         /* was #080A0F */
  --void-2: #2A2E33;

  /* Layout */
  --nav-h: 44px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-pill: 999px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  --border: 1px solid var(--stone-200);
  --border-strong: 1px solid var(--stone-300);
  --border-pop: 1.5px solid var(--pop);

  --shadow-sm: 0 1px 2px rgba(42,42,42,0.04), 0 2px 8px rgba(42,42,42,0.04);
  --shadow-md: 0 2px 8px rgba(42,42,42,0.06), 0 8px 24px rgba(42,42,42,0.06);
  --shadow-soft: 0 4px 16px rgba(42,42,42,0.05);

  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --font-sans: ui-sans-system, -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif;
  --font-serif: "Newsreader", "Times New Roman", Georgia, serif;

  --text-11: 11px;
  --text-13: 13px;
  --text-15: 15px;
  --text-18: 18px;
  --text-20: 20px;
  --text-56: 56px;
  --text-64: 64px;

  --leading-tight: 1.05;
  --leading-body: 1.7;
  --leading-ui: 1.4;

  --grid-max: 1120px;
  --grid-gutter: 24px;
  --map-h: 72vh;
  --map-min: 540px;
}
```

## Layout — Modular
- **Shell:** max-width var(--grid-max), centered, padding var(--grid-gutter)
- **Nav:** sticky top 0, height 44px, paper bg, border-bottom hairline, mono 11px uppercase tracking 0.06em
- **Hero:** 56-64px serif, -0.02em tracking, tight leading, ink, max 18ch, dek 18px/1.7 ink-60, max 60ch
- **Map Pane:** 58% sticky top 44px height 72vh min 540px, bg var(--void), radius 16px, overflow hidden, no border, soft shadow
- **Story Pane:** 42% padding 32px, gap 24px, cards 12px radius, stone-100 border
- **Cards:** paper-2 bg, stone-200 border, 12px radius, 16px padding, shadow-sm, hover shadow-md translateY -1px 180ms ease
- **Roster Tiles:** grid 2 cols gap 12px/8px, left 4px mood stripe, paper-2, radius 8px, no harsh shadow

## Components — Extensible IIFEs
Each module is `(function(){ const api={}; ... return api; })()` attached to `window.DumbModel.<module>`, no bundler.

- `Tokens` — exposes CSS vars JS
- `Map` — canvas DPR1 LOD 4000/8000, gray #A8A29E 0.55, selected var(--pop) 1.0, hover #FEFCF8 ring 2px, clearPrev() single-select
- `Story` — scrolly steps, active left border 2px var(--pop), 11px mono label + 18px serif body
- `NewsTower` — ingest 16-d, fusion 0.60*tca+0.25*taa+0.15*news, honest 503, zero-vector fallback
- `Roster` — 12 tiles, t-o/t-b/t-p/t-g/t-c left stripe, filterable
- `Provenance` — footer mono 11px, sources + LCG + 7/7/0→14/14

## Aesthetics — Japandi
- Warm whitespace first: 24-32px gaps, never tight.
- Soft radii: never sharp 0, never brutalist 4px offset shadow. Only soft diffuse shadows.
- Natural textures: subtle grain via `background-image: radial-gradient(rgba(0,0,0,0.02) 1px, transparent 1px)` 24px repeat, optional.
- Wabi-sabi: slightly uneven, not pixel-perfect grid, cards have 1-2px variance in height ok.
- No dashboard chrome, no multi-color rainbow, no parallax/continuous zoom.

## Code Modularity
Single HTML remains zero-deps but organized:

```html
<style id="tokens">:root{...}</style>
<style id="layout">/* nav, hero, map-pane, story-pane, grid */</style>
<style id="components">/* cards, roster, news, provenance */</style>

<script id="mod-tokens">window.DumbModel=window.DumbModel||{}; ...</script>
<script id="mod-map">...</script>
<script id="mod-story">...</script>
<script id="mod-news">...</script>
<script id="mod-roster">...</script>
```

Each module has `init()`, `destroy()`, `update(data)` — extensible for future towers.

## Extensibility
- Add 5th tower: copy NewsTower pattern, register in `DumbModel.towers`, update fusion weights in tokens.
- Add new domain: copy this file, change --pop to domain tint (hoops terracotta, pitch moss, equities clay, gridiron stone).
- PWA v67 offline13k, CORE20, LOD4000/8000 DPR1, LCG same-link-same-stars ?daily=YYYYMMDD&n=1/3/5 preserved.

## Zero-deps true, honest 503, 7/7/0→14/14, verifier ≥8.0, timeline triple-write mandatory.

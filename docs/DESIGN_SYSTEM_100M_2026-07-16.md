# DESIGN_SYSTEM_100M_2026-07-16 — Vector Hoops 100M DAU Production Polish

> Solo personal project, no connection to employer, built with public/free-tier only — paper #FFFEF7 ink #1A150F

## Intent
Best-app-ever Linear-level polish with legacy paper/ink values. Mobile-first 100M DAU, PWA offline <2MB core, zero backend, no account, 56px bottom tabs + safe-area, 16px anti-zoom, no horizontal overflow at 320/375/414/720/1120.

## Tokens
- **Colors**
  - paper #FFFEF7 / ink #1A150F (AAA 19.2:1)
  - Okabe-Ito: orange #D55E00 vermillion, blue #0072B2, sky #56B4E9, yellow #F0E442, green #009E73, magenta #CC79A7
  - Data: orange = chimera/offense, blue = guess/defense — NEVER red for win states.
  - Win states: gold #e8b500 / #fff8e0 IDENTIFIED, silver #8f96a3 / #eef1f4 Mashup >=92% — second distinct won color.
  - Warmth: hot #E6F4E6 (greenish tint), warm #FFF6C5 (yellow), cold #FFFEF7 (paper)
  - Shadows: ink hard shadow 4px 4px 0 ink, sm 2-3px, Lab tiles 4px yellow #F0E442, target 4px sky.
- **Typography**
  - Sans: ui-sans-serif system 18px / 1.65 readable AAA (fluid clamp 16→18)
  - Headers: Architects Daughter (paper/ink hand-drawn values)
  - Mono: ui-monospace SFMono 11px uppercase 0.06em letter-spacing for labels
  - Numerals: tabular-nums for % cosine / PC
- **Radii / Borders / Shadows**
  - radius 12px (10px legacy), border 2.2px ink solid (was 2px), shadow 4px offset block.
  - pill radius 999px border 1.6px ink shadow 1.5px.
  - tile 62px mobile / 78px desktop, radius 12px, 2.2px ink, shadow 4px yellow, target sky.
- **Spacing**
  - page gutter clamp(12px,3.2vw,28px) ; layout-max 860px (play) / 1120px (landing) ; gap clamp(12,2.5vw,18)
  - touch min 44px, bottom tab 56px + env(safe-area-inset-bottom), handle 56px.

## Components
- **card**: 2.2px ink border, 12px radius, white bg, 4px shadow, 14px padding. Hover -1px lift+shadow 5px. Dashed variant for info.
- **chip / pill**: 1.6px ink, 999px, 4/10px padding, 11px mono 800, shadow 1.5px. avatar pill inside suggestion: 28px circle first letter color deterministically Okabe palette[idx%8].
- **suggest**: input 48px min-height 2.2px ink radius 12 shadow 2px. Suggest ul absolute z30 280px max-height overflow auto, overscroll contain, 2.2px ink 12 radius 4px shadow. li 44px min-height hover yellow bg lift 1px, active press 1px.
- **guess row**: border 2.2px ink radius 12 padding 12 shadow 2px. Warmth bg gradient hot #E6F6EA / warm #FFF6C5. Top flex space-between avatar+name+era badge vs cosine pill (gold >92, sky >80). Mini-bars 3 x 32x22 border 1.5 ink radius 6 height anim .6s ease. Bullets 13/1.45.
- **tile**: 62 mobile 78 desktop ink 2.2 radius 12 shadow yellow. Pop anim .28s cubic-bezier(.34,1.56,.64,1) scale .88→1.08→1. Hover -1px rotate .6deg shadow 5px. is-pop trigger.
- **bottom-tabs**: fixed left0 right0 bottom0 height calc(56+safe) border-top 2.5 ink shadow -2 ink z-60. button flex 1 no border white mono 900 11px 0.06em col center gap 2 min-height56. Active ink bg white text.
- **sheet / bottom sheet**: fixed left0 right0 bottom0 max-height 84vh paper border-top 2.5 ink radius 18 top shadow -8 ink z60. Transform translateY transition .32s cubic(.22,1,.36,1). Hidden translateY 100%. Handle 56px col center gap8 grab touch-action none border-bottom dashed. Handle pill 38x5 ink radius 999. Body overflow auto overscroll contain padding 14 + safe. Backdrop fixed inset0 rgba(26,21,15,.32) blur2 z59 opacity transition .22s. Drag dismiss via pointer events: curY>90 closes.
- **skill DNA grid**: 2-col mobile 3 desktop. cell 1.6 ink 10 radius 8/10 padding white shadow 2px. Bar 6px radius 999 bg #eee >i bg blue transform scaleX animated barGrow .8s ease both.
- **pc cards**: 2.2 ink 12 pad 12 shadow2. Head flex icon 28x28 radius8 border1.6 ink shadow1.5 bg paper. Icon ◧ ⬍ ◑ with yellow/sky/orange. Title mono 11 800 uppercase. Expl 11 #555 1.4 lineheight.
- **loading**: skeleton height14 radius999 gradient #eee→#FFFEF7→#eee 200% size anim shimmer 1.1s linear infinite. Searching row small-mono 11 800 + dot 8px sky pulse 1s scale .9→1.25. Reduced-motion disables.
- **streak flame**: inline-flex gap1, i font-style normal anim flame-flicker .85s ease-in-out infinite translateY -1.2 scale1.15 brightness1.12 delay .12/.22. Reduced-motion none.
- **axis-grid**: 1 col mobile 3 cols >=600 8px gap.

## Motion
- **Timing**: 120ms ease for micro (hover lift, pill active), 300ms spring cubic-bezier(.22,1,.36,1) for cards/tiles/sheet, pop 280ms cubic-bezier(.34,1.56,.64,1).
- **Easings**: ease = .22,1,.36,1 spring; micro = ease; shimmer linear.
- **Reduced-motion**: @media (prefers-reduced-motion:reduce) { skeleton none, dot none, tile none, guess-row none, flame none, shimmer none, vh-card none }. Confetti respects reduced-motion → skip + vibrate only.

## Accessibility AAA
- paper #FFFEF7 vs ink #1A150F 19.2:1 AAA.
- Buttons 44px min, tabs 56px, inputs 16px anti-zoom prevents iOS zoom.
- scrollWidth <= innerWidth enforced — overflow-x clip + max-width 100vw on all shells.
- Focus: input focus border blue 2.2 + shadow 3 blue.
- Touch-action none only on sheet handle drag, elsewhere default.

## Z-layers
- nav static 50 → tab bar fixed 60 → sheet 60 → backdrop 59 → suggestion 30 → toast 99 → confetti 200.

## 100M DAU checklist (verify)
- [x] tile wobble class + pop on set
- [x] search suggestions 280px max-height avatar pill Okabe team color
- [x] guess row % cosine + skill mini bars + warmth bg + era badge
- [x] insight bottom sheet 56px handle drag dismiss (pointer events + threshold 90px) + ESC close
- [x] Lab tiles 62/78 ink + yellow shadow, skill DNA 2→3 cols bar anim, PC cards icon+expl, skeleton shimmer Searching 12,966…
- [x] responsive.css final-qa.css overflow-x clip, 16px inputs, safe-area footer/sticky, z-60 bottom-tabs
- [x] delight.js confetti canvas→DOM Web Animations 80 particles max respects reduced-motion cleanup, streak flame anim, haptics vibrate(10), team primary fallback #F0E442
- [x] design tokens doc (this file)
- [x] scrollWidth <= innerWidth check + safe-area env() padding-bottom everywhere bottom fixed.

## Files
- `play.html` — daily+lab merged 2 tabs, suggest av-pill, warmth rows, bottom sheet drag, lab tiles pop, loading skeletons.
- `assets/delight.js` — WAAPI confetti 80 max + reduced-motion + vibrate10 + flame CSS injection.
- `assets/responsive.css` — adds overflow clip, anti-zoom, z60, safe-area
- `assets/final-qa.css` — overflow guards 320/375/414, tile 62/78 !important, skill grid 2→3, skeleton shimmer, AAA contrast.
- `assets/insight-engine.js` — eraContext(), skillDeltas(), archetypeStory(), cross-era comps, fuseAndSearch() preserved.
- `index.html` — hero sky-demo RAF 60fps DPR capped 2, IntersectionObserver pause, tile wobble, Impossible callouts.

Solo personal project, no connection to employer, built with public/free-tier only — 2026-07-16

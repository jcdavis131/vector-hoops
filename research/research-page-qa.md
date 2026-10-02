# Research page QA — scout/research-page

**Date:** 2026-10-02 ~01:45 CDT
**Branch:** `scout/research-page` (off master @ 35ea9cb2)
**Page:** research.html → served at `/research`

## Static checks — all PASS

| Check | Result |
|---|---|
| Asset refs resolve | 8 root-relative refs; all resolve via repo files or vercel.json rewrites (`/methods`, `/taxonomy` are rewrite URLs — verified their destinations exist) |
| `node --check` inline JS | Clean (copy-link IIFE, clipboard w/ execCommand fallback) |
| `node --check` assets/site-nav.js | Clean (Research link added to LINKS) |
| Mirrors byte-identical | `cmp` OK: research.html ↔ public/research.html, assets/site-nav.js ↔ public/assets/site-nav.js |
| vercel.json valid | JSON parses; 14 rewrites including new `/research` |
| OG / Twitter tags | og:type, og:site_name, og:url, og:title, og:description, twitter:card/title/description, canonical — all present |
| CSS | Atlas tokens only (`--accent`, `--gold`, `--void`, `--s-*`, `color-mix` per site pattern); responsive breakpoint at 640px |

## Bonus fix (in scope of this page's links)

`/playoff-runs` had **no rewrite** in vercel.json — the nav link and this page's CTA would 404 on the live site (`cleanUrls: false` requires explicit rewrites). Added `{"source": "/playoff-runs", "destination": "/playoff-runs.html"}`.

## Content provenance

- Two-way formula, headline scores, Shaq '98 exclusion note — from the merged two-way playoff-runs work (assets/playoff-runs.json, merge 8f49343d).
- Taxonomy numbers (22/5/2,426, Draymond discovery, 19/20 anchors) — from merge 35ea9cb2 + research/taxonomy-qa.md.
- Frontier program four bets — distilled from `~/workspace/your_files/hoops-sota-forecasting/research-report.md` (verdict + directions + pointed critique sections).
- Honesty section: props-lab null (model 3.1993 vs line 3.1775 MAE, 3,236 rows) — from the report's eval protocol.

## UNVERIFIED

No browser binary on this VM — visual render, copy-link button behavior, nav mount, and service-worker registration were **not** observed in a live browser. Recommend a visual pass on the Vercel preview deploy before Cameron's merge.

## Files changed

- research.html (new)
- public/research.html (mirror)
- assets/site-nav.js (Research nav link)
- public/assets/site-nav.js (mirror)
- vercel.json (/research rewrite + /playoff-runs rewrite fix)

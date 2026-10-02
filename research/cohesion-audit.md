# Vector Hoops — Design Cohesion Audit (2026-10-01)

Branch: `scout/cohesion-pass` off master 4083a841. Auditor: static analysis (no browser binary available — see cohesion-qa.md for the verification gap).

## The actual system (not the memory spec)

MEMORY.md cites **japandi v4** (paper #F9F6F0, terracotta #C17C60, 44px mono nav). That spec is **stale relative to the repo**. The live system, per the header comment in `assets/atlas.css`, is the **Atlas design system — "court at night"**:

- Dark-first: `--bg:#07090C`, `--surface:#0D1015`, `--fg:#ECEEF1`, one signature accent `--accent:#FF7A33` (light theme: paper #F3F1EC, accent #B03A0A)
- Type: Archivo (display) / Inter (text), tracked uppercase labels, tabular numerals
- Spacing: 8px base (`--s-1`…`--s-10`), radii 4/8px, hairline rules
- Nav: shared `assets/site-nav.js` mount, styled by atlas.css — 60px sticky grid bar (not 44px)
- Legacy tokens (`--paper`, `--ink`, `--yellow`, `--orange`…) are **remapped** at the bottom of atlas.css `:root` so older `var()`-based styles inherit the system
- **atlas.css loads LAST on every page** (its own rule) and owns the tokens

Cohesion target = the Atlas system + the "Know your role" card language (void/gold/terracotta). Gold (`#D4AF69`) was used only as a `var(--gold, #D4AF69)` fallback — never a real token.

## Per-page scorecard

| Page | CSS stack | Nav | Header | Footer | Verdict |
|---|---|---|---|---|---|
| index | atlas.css only | atlas dark | title-card ✓ | ✓ | **PASS** — reference page |
| everyday | atlas.css only | atlas dark | (custom) | ✓ | PASS — intentional playful variant, leave |
| 404 | atlas.css only | n/a | (custom) | n/a | PASS |
| insights | legacy×5 + atlas LAST | atlas dark | title-card ✓ | ✓ | **FAIL (minor)** — meta says "11 Findings", live JSON has 12 cards |
| playoff-runs | legacy×5, **NO atlas.css** | **shell.css light nav** (#FFFEF7, hard borders) | **title-card UNSTYLED** (defined only in atlas.css) | ✓ | **FAIL (major)** — only page on the light legacy system; header renders unstyled |
| methods | legacy×5 + atlas LAST | atlas dark | title-card ✓ | ✓ | PASS |
| model | legacy×5 + atlas LAST | atlas dark | title-card ✓ | ✓ | PASS (inline hexes are page-content, leave) |
| play | legacy×5 + atlas LAST | atlas dark | title-card ✓ | ✓ | PASS |
| players | legacy×5 + atlas LAST + player-profile | atlas dark | title-card ✓ | ✓ | PASS |
| trends | legacy×5 + atlas LAST | atlas dark | title-card ✓ | ✓ | PASS |
| leaderboard | legacy×7 + **atlas.css?v=1** (stale buster) | atlas dark | (no title-card) | ✓ | PASS — bump buster to v=2 |
| offline | self-contained inline | n/a | n/a | n/a | PASS — intentionally dependency-free, noindex; leave |
| insights/*.html (12) | — | — | — | — | PASS — meta-refresh redirect stubs to /insights.html#slug; not visual pages |

## Inconsistencies found (ranked)

1. **playoff-runs.html missing atlas.css** — the flagship bug. Only served page without the system sheet: light-legacy nav while every other page is dark, and `.title-card` has no definition so the page header renders as unstyled browser defaults. Fix: append `<link rel="stylesheet" href="/assets/atlas.css?v=2"/>` after the legacy links (last, per atlas.css's own rule).
2. **insights.html stale count** — `<b>11</b>Findings` vs 12 live cards (Insight #12 "Know your role" shipped in PR #50). Fix: 11 → 12.
3. **--gold not a token** — insights.html and playoff-runs.html inline styles + insights.js charts use `var(--gold,#D4AF69)` fallbacks or hardcoded #D4AF69. Fix: define `--gold` in atlas.css `:root` (dark #D4AF69; light-theme deepened #8A6D1F for contrast). Fallbacks left in place as a no-CSS safety net.
4. **leaderboard.html atlas.css?v=1** — stale cache-buster vs v=2 everywhere else. Same file; bump for consistency.
5. **playoff-runs sticky tabs** — `.vh-runs__tabs{position:sticky;top:0}` slides under the sticky 60px nav when scrolled. Fix: `top:var(--nav-h)` so tabs dock below the nav.
6. **site-nav.js query-string drift** — `?v=1` on insights/playoff-runs, `?v=27` on trends, none elsewhere. Same file (md5 c23ddbe7…); cache-buster only. Left alone deliberately.

## Deliberately left alone (and why)

- **Legacy CSS stack** (shell/responsive/final-qa/unified/motion) on hybrid pages: atlas.css loads last and owns tokens; removing legacy sheets risks breaking legacy components (wiki/dossier/game). Additive consistency only.
- **Inline hardcoded hexes** in model/play/trends/everyday `<style>` blocks: gold-era page-content styling. atlas.css remaps `var()` tokens but can't touch hardcoded hexes — and per the brief, no restyling the gold for its own sake.
- **insights.js chart colors** (#C17C60 terracotta, #D4AF69 gold, #F9F6F0): intentional — matches the "void/gold/terracotta" card language, the stated chart-color family.
- **"Fresh from the lab" homepage strip**: already uses native `doors` components; reads as part of the homepage, not bolted on. No change.
- **team-rosters highlight dropdown**: held uncommitted work on another branch — out of scope.
- **MEMORY.md japandi v4 spec**: stale vs the repo. Flagging for the main agent — the Atlas system (court-at-night, 60px nav) is what the site actually is. Do not "fix" pages toward japandi; that would break cohesion, not build it.

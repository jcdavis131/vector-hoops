# Wave 2, task 2.4: Live and Replay (receipts)

Branch `forge/w2live` from origin/master `431e092e`. Scope per DESIGN-DIRECTION.md section 4, row 2.4:
live.html, assets/live.css, assets/live.js, assets/live-atlas.js, replay.html, assets/replay.css,
assets/replay-embed.css, replay JS (CSS hooks and final copy). atlas.css, shell.css, game.css,
embed-3d.js, sw.js and budgets.json are untouched.

## What changed

- **No page palette.** live.css's `.live-root{--paper…}` block and its dark "paper island" block,
  and replay.css's `:root{--rp-*}` light and dark blocks, are deleted. Every rule reads atlas tokens,
  so /live is paper in light and the night board in dark. `.live-root` stays only as the JS state
  hook (`.is-live`, `.final`, `.rewound`). The reduced-motion `!important` pair is gone: live's
  animations are written under `prefers-reduced-motion: no-preference` instead. The `main>*` rise
  cascade is gone.
- **Kit chrome.** Plates are the kit `.plate` (live.css's plate geometry deleted; plate.js markup
  unchanged). Cards are kit `.card`. Day arrows and refresh are `.btn--icon` (44 px), Back to
  today and JAM are `.btn`, Share is `.btn`. Shot-chart team toggle, replay size toggle and
  cameras (live plate and /replay) and the moments filter are `.seg` (44 px, `aria-pressed`).
  Bands are `.disclosure` (48 px summaries; "Band A/B/C" kickers dropped, audit #19). Feed-down
  card and error line are `.state--error`. Play by play is a `.row-list`. Off-day link is a
  `.chip-link`. The one-tab COMPANION tablist is gone; JAM is a `<button aria-pressed>` (audit #20).
- **One sticky bar.** The page header is no longer sticky; the scoreboard + timeline board is the
  only sticky bar, at `top: var(--nav-h)` under the site nav (audit #20).
- **11 px floor.** Every 8-10.5 px declaration in live.css, replay.css, replay-embed.css and the
  live.html `<style>` block is 11 px or a token. Canvas chart labels are 11 px in `--font-code`.
- **Charts read tokens.** live.js's win-probability and momentum canvases, quarter bars and shot
  chart drew `#1b1913/#5b5545/#c2401f` paper inks; they now read `--fg/--fg-2/--fg-3/--line/
  --line-2/--accent/--surface` at draw time and repaint on a colour-scheme change. The shot-chart
  court is `currentColor`; its per-dot inline `style="animation…"` is a class. Ghost-race bars are
  `.fill--live/.fill--ghost`. Team colours (data) come from the summary's own `boxscore.teams`:
  assets/scoreboard.js gives the away team the home colour (its documented quirk), and
  `resolveGameInfo` in live.js had the same bug (fixed). Quarter bars read them through
  `--team-a/--team-h` set once on the root, so the only inline styles left are geometry
  (bar heights/widths, tick `left`).
- **Plate 07 retired.** live-atlas.js's 2D canvas atlas (own density grid, 21 hex, 8-9 px labels,
  "64-d MTNN / PCA" meta) duplicated plate 09's Embed3D map. The page now has one map: plate 12
  STYLE MAP, `Embed3D.mount(#liveMap, {variant:'live'})`. live-atlas.js keeps its file and
  `window.LiveAtlas.onGame` API (sw.js precaches the path and tests/test_site.py asserts it is
  served, and sw.js is out of scope) but is now the glue: tonight's box-score players are matched
  by name to their newest map season and passed to `setGroups([{label, color, ids}])` per team;
  tapping a dot marks it and lights its three closest style twins (`VHPeers.topK`, row ids shared
  with embed3d, per wave2-play.md). Before the box score exists it falls back to
  `find({team, season:'2025'})` labelled "ATL 2025-26".
- **ESPN-to-map team index, from real data.** `ESPN_TO_MAP` in live-atlas.js:
  GS→GSW, NO→NOP, NY→NYK, SA→SAS, UTAH→UTA, WSH→WAS, identity otherwise. Source: the inverse of
  pipeline/build_replays.py's `ALIAS`. `tests/test_live_team_index.py` checks all 30 teams in
  docs/live-recon/team_map.json (ESPN's list) land on a tricode embed3d.json holds for 2025-26,
  and that the aliases equal the pipeline's table.
- **Plates renumbered in document order** (01-12, audit #19). tests/test_replay_espn.py asserted
  13 plates; it now asserts 01-12 in order, each once (the merged map is the one fewer).
- **Final-state copy (audit #18).** One phase (`pre/in/post`) from the summary drives the page:
  the eyebrow says Live now / Final / Before tip, the lede and the refresh note say the game is
  over, the timeline reads FINAL (END on the back-to-end button), the clock and live dot are
  accent only while live, rewinding a final dims nothing ("LIVE ONLY" is for live games), and the
  empty-plate copy is past tense ("No 8-0 runs in this game", "No one came within reach of a
  personal best", "No player reached the 15 minutes a ghost match needs"). Polling already
  stopped on finals. /replay's lede no longer says "Tonight's games follow the live feed"; a status
  line under it says "Final: MIL 116 at WAS 128" or "In progress: …" for the selected game.
- **Replay on the kit.** atlas.css was already loaded in the right order. The cabinet is
  `.card.card--void` (the kit's void remap, so every control in it reads the void pairings);
  playback buttons are `.btn` (Play is `.btn-primary`), the speed select and the Skip-dead-time
  label are 44 px, the scrubber is 44 px tall. `.rp-panel h2` with `::before "PLATE"` is the kit
  `.plate` markup (PLATE 01-04) inside `.card`. Provenance `details` is `.disclosure`. Tick layout
  moved from `style.position/height` in replay.js to CSS.
- **Copy (audit #19).** WP formula text now matches the code, `(lead + 3.0·f)/(13.5·√f)`, with the
  one hedge inside the details; "experimental heuristic" is gone from plate meta and labels;
  "mtnnGlobal archetype (K=8 k-means … built 2026-10-11)" is "one of eight playing-style groups";
  plate 11 is SCORING BY STYLE.
- **Sheets and scripts.** live.html's inline `<style>` moved into live.css; replay-embed.css folded
  into live.css and deleted (live was its only loader); realtime.css and realtime.js dropped from
  /live (nothing on the page calls `Realtime`; feed-health still loads them). Noscript notes are
  classes. All innerHTML templates checked: no inline handlers; team codes, stats and ghost team
  names are escaped; the game strip is built with `textContent`.

## Detectors (check_design.py, baseline = 431e092e)

Owned files (live.html, replay.html, live.css, live.js, live-atlas.js, replay.css,
replay-embed.css, replay JS):

| Detector | before | after | note |
|---|---|---|---|
| D3 sheet allowlist | 2 | 0 | live.html loaded realtime.css + replay-embed.css as 2nd/3rd sheets |
| D4 scoped token blocks | 4 | 0 | `.live-root{--` x2, replay `:root` x2 |
| D5 kit redeclared | 0 | 0 | |
| D6 hex | 165 | 48 | left: replay.js 45 (the pixel-art court/sprite/fx palette drawn on the void; scope is CSS hooks), replay-espn.js 2 + replay-boxscore.js 1 (missing-team-colour fallbacks) |
| D7 `!important` | 2 | 0 | |
| D8 font-size < 11 px | 50 | 0 | |
| D9 literal fonts | 16 | 0 | |
| D15 `style=""` | 11 | 0 | |
| D21 copy lint | 6 | 0 | |
| D24 tap targets (browser) | day buttons 32 px, cams 26-28 px | 44 px | by CSS; shoot.mjs `tiny` (<24 px tall) still counts 1-2 on /live and 4 on /replay per render, not traced to elements yet |

Site totals: D3 26→24, D4 8→4, D6 650→533, D7 44→42, D8 78→28, D9 108→92, D15 62→51,
D20 4→1, D21 62→56; enforced D1, D14 green.

## Gates

- stamp_lf.py then `--check`: OK, 109 assets. stamp_footer.py --check: OK, 26 pages.
- sync_public.py then `--check`: OK, 434 files (public/assets/replay-embed.css removed with its source).
- budget_check.py: all pass, no row edited. live.html 456.9 / 680.0 KiB, replay.html 298.9 / 336.0 KiB.
- check_contrast.py OK; check_a11y.py OK (18 pages).
- pytest (ignoring test_vector_core_parity.py): only the 3 known tests/test_check_served_model.py failures.
- `node --check` live.js, live-atlas.js, replay.js: OK. `node tests/replay_live_check.mjs`: ok.

## Renders (serve.py + shoot.mjs, prod CSP, reduced motion; docs/redesign/wave2-live/)

The repo fixture (espn_summary_401909834_q1.json) is ATL@ORL marked final on 2026-10-21, more than
24 h ago, so plain serve.py shows only the off-day shell (no live game; a `?game=` link would be
sent to /replay by the 24 h guard). For the plate states a harness-only wrapper
(wt/hoops-audit/w2live_serve.py) re-serves the same fixture plays with the status forced to
in-progress or final and the tip an hour ago. No numbers change.

- **Off day, 390 light**: title card, JAM toggle, 44 px day arrows, OFF DAY plate; the rewatch
  chip carried "ATL @ ORL (28-33)" past the card edge (nowrap) and now wraps.
- **In progress, 390 light/dark + 1280 light**: one sticky board under the nav, timeline 44 px;
  WP, momentum and quarter bars draw in the theme's ink (white lines on the night board) with ATL
  red / ORL blue from boxscore.teams; Big Moments rows with 44 px Share; style map on the void with
  ATL/ORL swatches, "23 of tonight's players among 12,966 player-seasons". No exceptions, no
  console errors, no failed requests, no overflow.
- **Final, 1280 dark + 390 light**: eyebrow FINAL, lede "This game is over…", timeline FINAL,
  morning-after card, past-tense empty plates.
- **Replay, 1280 light + 390 dark**: cabinet void on both themes, cams and filter as `.seg` (they
  scroll sideways at 390, as the kit's `.seg` does), "Final: MIL 116 at WAS 128" status line.
- Fixture limits, not regressions: its boxscore.players carry team ids only, no abbreviations, so
  Leaders is empty and the shot chart shows 0/0 (both match players by team abbreviation, as before).
  The 1280 widths of off-day and the 390-light replay were not re-shot after the final CSS.

## Deferred

- Delete assets/live-atlas.js's old path from sw.js CORE (sw.js out of scope); the file is kept as
  the map glue so the precache entry stays valid.
- replay.js pixel-art palette (45 hex) stays; it draws on the void in both themes, so theme tokens
  are the wrong source. Tokenising it needs a void palette in the kit.
- assets/scoreboard.js's away-colour quirk (not owned); live.js no longer reads colour from it.
- Big Moments keeps the play-time callouts ("is HEATING UP…") on a final: they describe the moment.

## Kit requests

1. Style game-header.js's `.gh`, `.gh-badge`, `.gh-pre/-live/-final`, `.gh-match/-when/-venue` in
   atlas.css. live.css and replay.css carry a layout-only `#ghMount .gh` / `#gameHeader .gh` flex
   rule until then.
2. `.title-card--game` (named in DESIGN-DIRECTION section 2, not in atlas.css); live uses a page
   modifier `.live-head` for the tighter header.
3. An Embed3D load event or `onLoad` option: live-atlas.js polls `snapshot().loaded` (250 ms,
   bounded) before `find()`/`setGroups()`.
4. A void colour set for pixel-art canvases (replay.js) if D6 is to reach 0 there.

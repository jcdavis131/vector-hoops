# Wave A cluster A6 — repro notes (T15, T16, T13-retry)

Branch: `scout/phase2-A6-shell` off `origin/scout/landing-map-viz` @ `010b1c27`
(verified via `git ls-remote`, 2026-11-08 ~20:49 CST).
Worktree: `~/workspace/_worktrees/phase2-A6-shell` — OVERLAY tree, not a git
checkout: symlinks to the base worktree (`landing-map-viz`) + real files for
the 6 changed files, the 3 gate scripts, the home-tonight test, and
`docs/phase2-A6/`. Local git cannot write objects/refs in this sandbox, and
`git worktree add` fails at the ref write — so the commit/push/PR go through
the GitHub API (`docs/phase2-A6/commit-via-api.mjs`, A2's pattern).
Serve: `docs/phase2-A6/serve.mjs` (port 8477 — 8475 is the A5 worker's
server, left alone; 8473 = A4, 8474 = A2). Applies `vercel.json` rewrites;
`/api/espn/scoreboard` returns the fixture `{"events":[]}` unless
`A6_SCOREBOARD=fail` (404, playtest condition). Never plain
`python3 -m http.server`.
QA: `docs/phase2-A6/a6-check.mjs` (Playwright via `~/workspace/tools/qa-chrome/`).
Run: `node docs/phase2-A6/a6-check.mjs <before|after> 8477`.
Harness: `docs/phase2-A6/t13-t15-harness.mjs` — executes the new code paths
under stubbed DOM globals, no browser needed. Run:
`node docs/phase2-A6/t13-t15-harness.mjs` (12/12 PASS at ship time).

## The fixes (landing page only)

### T15 — drawer Close reachable by forward Tab (`assets/site-nav.js`)
`open()` focused the first `.explore-item`; Close sits before the item list
in DOM order, so forward Tab could never reach it. `open()` now focuses
`closeBtn` (fallback: first item when Close is absent). Tab then walks
Close → Atlas … → Guide → next stop. No DOM move, no CSS change, no visual
change; Escape still closes and returns focus to Explore. The drawer is
shared site chrome, so the fix lives in the shared file — that is the
correct seam, not a landing-only patch.

### T16 — search input focus ring (`index.html`, embedded style)
The `:focus` rule (line 49) set `outline: none` + a 4px pale-yellow halo
(`var(--accent-wash)` = `rgba(255,235,130,.55)`); the generic
`:focus-visible` rule in `atlas.css` (2px solid `var(--accent)`, offset 3px)
lost to it on specificity. Added, right after line 49:
`.hero-search .atlas-search input:focus-visible{ outline: 2px solid var(--accent); outline-offset: 3px; }`
Same specificity as the `:focus` rule, later in source, so it wins for
outline on keyboard focus; the halo `box-shadow` and red border stay.
`--accent` is `#E0483B` = `rgb(224,72,59)` — the exact ring every other
control shows.

### T13-retry — scoreboard stops after the first failure (`assets/home-tonight.js`, `assets/site-nav.js`)
Mechanism (verified in code, not assumed): there is no in-page timer loop.
Each page load issued two scoreboard fetches — `loadTonight()` (ESPN
direct) and `markLive()` (`/api/espn/scoreboard`) — and neither remembered
a failure: `markLive`'s 90 s session cache is written only on success, and
`loadTonight` had no memory at all. Every navigation (chip clicks reload
the page) retried both, so the console filled at 2 failures per load.
Fix: each fetcher now sets a sessionStorage flag in `.catch`
(`vh.tonightFailed`, `vh_nav_live_failed`) and skips the fetch when the
flag is set — one attempt per tab session, then silence. The success paths
are unchanged (Tonight renders on success; the live-dot 90 s cache still
applies). The `.catch` covers HTTP errors, the 8 s abort, and DNS failure.
Note: the first load of a fresh session still attempts once (unavoidable —
there is no way to know the feed is down without asking); the recorded
fixture for that attempt is the cross-origin ESPN failure, as in A2's notes.
The `ViewTransition` pageerror in T13's console dump comes from no code in
this repo (`startViewTransition` appears nowhere in `assets/` or
`index.html`) — browser/harness-side, out of scope, not fixed.

Files changed (mirrored root ↔ public, byte-identical):
`assets/site-nav.js` (+813 B, token `a16120da` → `3facdff2`),
`assets/home-tonight.js` (+508 B, token `881d28f9` → `bdcf572a`),
`index.html` (+397 B: T16 rule + the two token bumps).
Plus token-only re-stamps of `site-nav.js?v=` in the other 20 root pages
and their 20 public mirrors (same old → new string, done in-memory by the
commit script — see below). No model files touched
(`mtnn_embeddings.f32`, `peers_top8.json`, `vectors.json` untouched).

## Before numbers (base 010b1c27 — playtest doc + base code reads)

- T15: Tab to Explore (5th stop), Enter → focus lands on Atlas (first
  item). 13 Tabs walk Atlas … Guide; the 14th lands on the search box —
  Close never focused. Shift+Tab from Atlas reaches Close; Escape closes.
- T16: search input is the only stop of 56 with `outline-style: none`;
  indicator is the 4px pale-yellow halo + red border.
- T13: 2 failed scoreboard requests per page load, every load (9 loads in
  the bug-hunter runs); 6+ request cycles in 55 s of active playtesting.
  `loadTonight` has no failure memory; `markLive` caches only success.

## After numbers (static + harness — browser legs BLOCKED, see below)

- `node --check` passes on all four edited JS files (root + public).
- `node --test tests/home-tonight.test.mjs`: 5/5 pass (against the new file).
- `node docs/phase2-A6/t13-t15-harness.mjs`: 12/12 PASS — open() focuses
  Close (not the first item), close returns focus to Explore, both
  fetchers attempt once then set their flag, second mount/boot in the same
  session issues zero further fetches.
- `python3 scripts/budget_check.py`: Gate 1 all 28 pages ok (index.html
  231.3 KiB / 3,576.0 KiB); Gate 2 all ok (heaviest-page JS 140.8 KiB /
  294.0 KiB); Gate 3: `check_site_facts` ok, `sync_public --check` ok
  (440 files), `stamp_assets --check` lists exactly the 20 expected
  site-nav.js pages — those tokens are bumped in-memory by the commit
  script, so the committed tree is stamp-clean (the script asserts zero
  remaining old tokens in every uploaded blob).
- Served-byte checks on port 8477: index.html carries the T16 rule and the
  new tokens; served `site-nav.js` sha is `3facdff2…`; served files contain
  `closeBtn.focus`, `vh_nav_live_failed` (×3 lines), `vh.tonightFailed`
  (×2 lines); extensionless `/methods` resolves 200 (rewrites work).
- Browser after-run: BLOCKED — Chromium SIGTRAPs on launch (see below).
  No after-screenshots exist yet.

## Environment blocks (do not re-diagnose as page defects)

1. **Exec file writes fail with EPERM** (fleet-wide since ~20:08 CST Nov 8).
   Spawned-process `write()` fails (Python, Node, git, `sed`); files create
   empty, bytes never land. Shell builtins, `ln -s`, `mkdir`, `rm` work;
   `cp` is flaky (2 of 4 small copies truncated to 0 bytes in this run —
   every copy was `cmp`-verified, the failures redone via the file tools).
   `git worktree add` fails at the ref write. Consequence: this cluster
   works in a symlink-overlay tree (real files only where changed), mirrors
   were `cp`+`cmp`-verified, and the commit/push/PR go through the GitHub
   API. One casualty caught and repaired: my first `muse.write` of
   `site-nav.js` dropped the `label: 'How it works'` line (merged label +
   title); the `diff` against base caught it before any verification ran.
2. **Chromium SIGTRAP on launch** (same as A2, ~02:15 CST onward).
   `node docs/phase2-A6/a6-check.mjs after 8477` dies at `chromium.launch`
   (pid 2475577, SIGTRAP), as does `node smoke.mjs` in
   `~/workspace/tools/qa-chrome/`. No browser QA was possible after the fix
   landed. Rerun when the environment recovers:
   ```
   cd ~/workspace/_worktrees/phase2-A6-shell
   node docs/phase2-A6/serve.mjs 8477
   node docs/phase2-A6/a6-check.mjs after 8477
   ```
   (If 8477 is taken by then, pick a free port and pass it to both
   commands. The before-run needs the base serve:
   `node docs/phase2-A6/serve.mjs 8476 ~/workspace/_worktrees/landing-map-viz/public`
   then `node docs/phase2-A6/a6-check.mjs before 8476`.)
   Serve pid 2475395 was left running on 8477 (sibling convention).
3. **Port 8475 belongs to the A5 worker's server** (pid 2433837, since
   02:07) — my first serve silently failed to bind there and curl hit
   A5's bytes; the served-byte check caught it. A6 uses 8477.
   8473 = A4, 8474 = A2, 8476 = A5's before-serve, 8483 = A1.

## Overlap with siblings (all off the same base 010b1c27)

- A4 (`shell.css` nav, branch not yet on origin): changed `assets/atlas.css`
  + `assets/shell.css` and re-stamped every referencing page. This cluster
  does NOT touch `atlas.css` or `shell.css` — no shared-file overlap.
- A5 (copy, branch not yet on origin): changed `assets/atlas-3d.js`,
  `assets/embed-3d.js`, `assets/inline-index.js`, and `index.html` /
  `live.html` / `map-guess.html` / `play.html` / `twenty-questions.html`
  (+ mirrors) for token re-stamps. Overlap: `index.html` — A5 edits it too
  (different regions: their token bumps vs my T16 rule + my token bumps),
  and the same 4 non-index pages carry A5's token bumps while this cluster
  re-stamps the `site-nav.js` token in them. Whoever merges second
  re-stamps; the changes are on different lines and should merge cleanly.
- A2 (merged path, PR #199): changed `assets/home-tonight.js` on its own
  branch — this cluster edits the same file on a different branch off the
  same base. A2's change (scroll helper call in `wireSurprise`'s onSelect)
  and mine (failure flag in `loadTonight`) touch different functions;
  merge order matters, no line overlap.

## Parked (not this cluster)

T1–T14 (except T13-retry), T17–T23. No merges, no production deploys.

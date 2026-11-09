# Wave A cluster A2 — repro notes (T2, T3, T12)

Branch: `scout/phase2-A2-scroll` off `origin/scout/landing-map-viz` @ `010b1c27`
(verified via `git ls-remote`, 2026-11-08 ~20:00 CST).
Commit: `0281a482ac30723e5a524fe902ac2fa4651bbaea` (via GitHub API — local git
cannot write objects/refs in this sandbox). Draft PR #199:
https://github.com/jcdavis131/vector-hoops/pull/199 (base
`scout/landing-map-viz`). CI at creation: Vercel pass, Vercel Preview
Comments pass.
Worktree: `~/workspace/_worktrees/phase2-A2-scroll`.
Serve: `docs/phase2-A2/serve.mjs` (port 8474; port 8473 belongs to the A4
worker's server — left alone). Applies `vercel.json` rewrites; `/api/espn/scoreboard`
returns the fixture `{"events":[]}`. Never plain `python3 -m http.server`.
QA: `docs/phase2-A2/a2-check.mjs` (Playwright via `~/workspace/tools/qa-chrome/`).
Run: `node docs/phase2-A2/a2-check.mjs <before|after> 8474`.

## The fix (landing page only)

Shared helper `VHAtlas.scrollToSelection` (`assets/atlas-3d.js`): scrolls the
readout card (`#atlas-selected` → closest `.card`, i.e. selected season + peers
table) into view, `block: 'start'`, reduced-motion aware, no-op when the card
is already fully in view. `scroll-padding-top` (atlas.css) keeps it clear of
the sticky nav.

- **T2 — chip click (cold path, fresh visit):** a chip/story `a[data-view]`
  click before the season index is ready is a plain navigation (landing-stories
  only intercepts once the index is warm). The click leaves a per-tab
  sessionStorage flag `vh.scrollToSelection`; the `?id=` deep-link boot reads
  and consumes it, then scrolls after the selection renders. A shared deep
  link opened directly never scrolls (no flag).
- **T2 — chip click (warm path, index ready):** `VHAtlas.applyView` scrolls
  after applying the view in place (same 30 ms delay as the search path).
- **T3 — search pick:** the hero-search `onSelect` waiter in
  `assets/home-tonight.js` now calls `VHAtlas.scrollToSelection` (fallback
  `showMap` when the atlas wiring is absent) instead of scrolling only to
  the map canvas. Surprise keeps `showMap` (map-first); map taps and peer-row
  picks never scroll (no intent).
- **T12 — browser back loses typed text:** the search input is saved to
  sessionStorage (`vh.searchText`) on every input event and on pick, and
  restored at `initSearch` and on `pageshow` (bfcache case). Selection and
  projection already survive via the URL; only the typed text was lost.

Files changed (mirrored root ↔ public, byte-identical):
`assets/atlas-3d.js`, `assets/home-tonight.js`, `index.html`,
`public/assets/atlas-3d.js`, `public/assets/home-tonight.js`,
`public/index.html` (script `?v=` tokens re-stamped to the new sha256s:
atlas-3d `ff235a3a`, home-tonight `11f7b4cc`).

## Before numbers (base 010b1c27, 2026-11-08 ~02:05 CST, desktop 1280×800)

- T2 chip click: scrollY 1573 → 0 (full reload); readout top at viewport
  y 2135, peers table top 2196 — readoutInView false, peersTopInView false.
  Peers correct: Kobe 2011–12 0.833 / 2012–13 0.819 / 2009–10 0.810.
- T3 search pick (LeBron James 2025–26): scrollY 1151 after pick; readout
  top at viewport y 984, peers table top 1045 — both below the 800 px fold.
  Peers correct: Banchero 2023–24 0.805, Durant 2021–22 0.771, 2023–24 0.770.
- T12: not completed on the base — the check script's `waitForURL` used a
  fixed `?proj=pca&id=672` string, but a warm chip click rewrites the URL
  in place as `?id=672&proj=pca` (see "URL param order" below). The T12
  repro itself is established by the playtest doc (input `""` after back).
- Console (all runs): zero `pageerror`, zero failed same-origin requests.
  Only failures are the cross-origin ESPN scoreboard fetches
  (`ERR_NAME_NOT_RESOLVED` / 504) — the recorded T13 fixture, out of scope.
  The `/api/espn/scoreboard` same-origin 404 from the playtest is gone here
  because this serve answers it with the empty-events fixture.

## After numbers

**BLOCKED — Chromium cannot launch in this container as of ~02:15 CST.**
The before-run worked at 02:05; every launch since dies with SIGTRAP
(exit 133), including `chrome --dump-dom`, `--single-process`,
`--disable-seccomp-filter-sandbox`, and the `chromium_headless_shell-1248`
binary. `--version` still works (no renderer). `Committed_AS` is 4.72 GB
of a 5.11 GB commit limit (92%). The `a2-check.mjs after` run therefore
never executed; no after-screenshots exist yet. Re-run it when the
environment recovers — the script and serve are committed on the branch.

What was verified without a browser:
- `node --check` passes on all four edited JS files (root + public).
- `node --test tests/home-tonight.test.mjs`: 5/5 pass.
- `python3 scripts/budget_check.py`: ALL GATES PASSED — 28 pages,
  interaction proxies, `check_site_facts` (31 facts),
  `stamp_assets --check` (118 assets), `sync_public --check`
  (440 files, mirror current). index.html 236.1 KiB / 3,576 KiB budget.
- `diff` root ↔ public: byte-identical for both edited JS files.

## URL param order (found during the before-run)

A warm chip click (index already ready, e.g. after typing in search)
is intercepted by `landing-stories.js` → `VHAtlas.applyView` →
`history.replaceState`, producing `?id=672&proj=pca` (id first). A cold
chip click navigates to the href as written, `?proj=pca&id=672`. The QA
script now waits on `location.href.includes('id=672')` and records
`fullNavigation` so both paths are distinguished.

## Environment blocks (do not re-diagnose as page defects)

1. **Exec file writes fail with EPERM** (started ~02:08 CST, after the
   before-run). `cp`, `git add`/`git checkout`/`git hash-object`/`git
   update-ref`, `python` file writes, and `node` writes after reading a
   file written by the file tools all fail (`Operation not permitted`);
   `copy_file_range` fails even for unmodified sources. Reads, pipes,
   `bash` echo/touch, `git status`/`ls-remote`/`fetch`, and the file
   tools (`muse.write`/`muse.edit`) still work. Consequence: the
   `public/` mirror was done by file-tool round-trip (verified by `diff`
   and by `sync_public.py --check`), and the commit/push/PR were done
   through the GitHub API (`gh api`) instead of local git — see the
   branch's commit message. One casualty caught and repaired: the first
   `cp` truncated `public/assets/atlas-3d.js` to 0 bytes before failing;
   it was restored byte-identical via the file tools.
2. **Chromium SIGTRAP on launch** (see "After numbers"). No browser QA
   was possible after the fix landed; the after-run is the one open item.
3. **Port 8473 is the A4 worker's server** — this cluster used 8474.

## Parked (not this cluster)

T1, T4–T11, T13–T23. Surprise keeps `showMap`. No model files touched
(`mtnn_embeddings.f32`, `peers_top8.json`, `vectors.json` untouched).
No merges, no production deploys.

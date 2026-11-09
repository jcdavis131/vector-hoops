# Harada mandala — Wave A cluster A2: navigation + scroll (T2, T3, T12)

Branch: `scout/phase2-A2-scroll` off `origin/scout/landing-map-viz` @ `010b1c27` (verified via `git ls-remote`, 2026-11-08 ~20:00 CST).
Worktree: `~/workspace/_worktrees/phase2-A2-scroll` (sole writer).
Scope: landing page only (`index.html`, `assets/atlas-3d.js`, `assets/home-tonight.js`). No model files, no merges, no prod.

## Center: chip click, search pick, and browser back all land the visitor on the payoff

## Pillars

### P1 — T2: chip click shows the peers without the visitor scrolling
- [x] Repro before: click Jordan chip → reload, scrollY 1573 → 0, peers ~2,200 px below
- [x] Chip/story `a[data-view]` click stores a session flag; boot deep-link path scrolls the readout into view after selection renders; flag cleared on read
- [x] Warm path: `applyView` scrolls after in-place apply (found during before-run: warm clicks rewrite the URL as `?id=672&proj=pca`, no navigation)
- [ ] After: chip click → peers table visible, scrollY > 0, readout + first peer row in viewport — BLOCKED: Chromium SIGTRAP on launch (env, ~02:15 CST); re-run `a2-check.mjs after` when it recovers

### P2 — T3: search pick shows readout + peers in view
- [x] One shared scroll helper (`VHAtlas.scrollToSelection`): readout card top into view, reduced-motion aware, no-op when already in view
- [x] Search-pick path (home-tonight `onSelect` waiter) uses it instead of `showMap` (map-only)
- [ ] After: pick LeBron → readout name + peers table visible at 1280×800 and 390×844; peers table top inside viewport — BLOCKED: Chromium SIGTRAP (see P1)

### P3 — T12: browser back restores the typed search text
- [x] Search input value saved to sessionStorage on input + on pick; restored at init and on `pageshow`
- [ ] After: type "Jordan" → chip → /play.html → back → input still "Jordan", selection + URL intact — BLOCKED: Chromium SIGTRAP (see P1)

### P4 — No regressions (guardrails)
- [x] Rewrite-aware local serve (vercel.json rewrites; `/api/espn/scoreboard` fixture) — never plain `http.server`
- [x] Before numbers recorded (T2/T3 reproduce exactly; T12 repro established by playtest doc — the before-run's T12 leg hit a `waitForURL` param-order bug, fixed in the script)
- [ ] Before/after numbers side by side for every path; a fix that regresses is reverted — AFTER side BLOCKED on Chromium (see P1)
- [x] Before-run console: zero uncaught exceptions; zero failed same-origin requests (ESPN cross-origin failure recorded as T13 fixture)
- [ ] Full Tab walk, visible focus, no trap; 390 px no horizontal overflow, ≥44 px targets — BLOCKED on Chromium (no code path touches focus/targets; unchanged by this fix)
- [x] `scripts/budget_check.py` gates pass; root/public mirror byte-identical (`sync_public.py --check`)
- [x] Existing tests pass (`tests/home-tonight.test.mjs` 5/5)
- [x] Asset tokens re-stamped (`ff235a3a`, `11f7b4cc`) — Gate 3 caught the stale tokens, fixed by hand (stamp script writes via python, blocked by the EPERM sandbox)

### P5 — Ship the branch
- [ ] Commit + push `scout/phase2-A2-scroll`; open DRAFT PR; report CI checks status — IN PROGRESS via GitHub API (`gh api`): local git cannot write objects/refs (EPERM sandbox, fleet-wide since ~20:08 CST Nov 8; recovery needs a runtime/VM restart)
- [x] Repro notes + screenshots in `docs/phase2-A2/` on the branch (before-screenshots committed; after-screenshots pending the Chromium recovery)
- [ ] Report back: branch + head sha, draft PR + CI, before/after numbers, verdicts, scorecard

## Parked (not this cluster)
- T1, T4, T5, T7–T10, T13–T23, T6/T11 (Wave B) — untouched by design.
- Surprise button keeps `showMap()` (map-first); only the hero-search pick path moves to the readout scroll.

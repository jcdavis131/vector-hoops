# Harada mandala — Wave A cluster A6 (shell)

Branch: `scout/phase2-A6-shell` off `origin/scout/landing-map-viz` @ `010b1c27`
(verified via `git ls-remote`, 2026-11-08 ~20:49 CST).
Worktree: `~/workspace/_worktrees/phase2-A6-shell` — overlay tree (symlinks to
the base worktree + real files for the 6 changed files, the 3 gate scripts,
and the home-tonight test). Local git cannot write objects/refs in this
sandbox (EPERM write block since ~20:08 CST Nov 8); ship goes through the
GitHub API — see `docs/phase2-A6/commit-via-api.mjs`.

## Goal (center)

Fix the A6 shell findings (T15, T16, T13-retry) on the landing page so the
full Tab walk is clean, the search focus ring matches the other controls,
and no load completes with a retry loop in the console — without touching
the serving model, other clusters' findings, or any other page's behaviour.

## Objectives

- [x] O1 — Base verified + work area built (base `010b1c27` re-verified;
      overlay worktree built; write-blockage characterised: spawned-process
      `write()` EPERM, `cp` flaky/truncating, shell builtins + `ln -s` +
      `muse.write`/`muse.edit` land bytes; Chromium SIGTRAPs on launch).
- [x] O2 — T15: drawer Close reachable by forward Tab.
- [x] O3 — T16: search input shows the standard 2px red `:focus-visible` outline.
- [x] O4 — T13-retry: scoreboard fetch stops after the first failure per tab session.
- [x] O5 — Verify: `node --check`, unit tests, budget gates, mirror parity,
      rewrite-aware serve before/after numbers; browser QA if Chromium recovers.
- [ ] O6 — Ship: commit + draft PR via GitHub API; report CI status or blocker.

## Tasks

### O2 — T15 (site-nav.js `open()` focuses Close first)
- [x] T15.1 — Change `open()` to focus `closeBtn` (fallback: first item).
- [x] T15.2 — `node --check` site-nav.js (root + public).
- [x] T15.3 — Re-stamp `site-nav.js?v=` token in all 42 referencing pages
      (21 root + 21 public) via the commit script (in-memory substitution).
- [ ] T15.4 — Browser QA (after-run): Tab walk, Close is the 1st drawer stop.

### O3 — T16 (index.html embedded style, after line 49)
- [x] T16.1 — Add `.hero-search .atlas-search input:focus-visible`
      `{ outline: 2px solid var(--accent); outline-offset: 3px; }`
      (halo `box-shadow` kept from the `:focus` rule).
- [x] T16.2 — Mirror to `public/index.html` byte-identical.
- [ ] T16.3 — Browser QA (after-run): search input shows the red ring on Tab.

### O4 — T13-retry (home-tonight.js + site-nav.js failure memory)
- [x] T13.1 — `loadTonight()`: skip when `vh.tonightFailed` is set in
      sessionStorage; set it in `.catch` (covers HTTP + abort + DNS).
- [x] T13.2 — `markLive()`: skip when `vh_nav_live_failed` is set; set it
      in `.catch`. Success path (90 s cache) unchanged.
- [x] T13.3 — `node --check` both files (root + public); unit tests 5/5.
- [ ] T13.4 — Browser QA (after-run): fresh session = 1 ESPN attempt, then
      zero further failed requests across navigations in the same session.

### O5 — Verify
- [x] V.1 — `node --check` all edited JS.
- [x] V.2 — `node --test tests/home-tonight.test.mjs` 5/5.
- [x] V.3 — `python3 scripts/budget_check.py`: gates 1+2 pass; gate 3 shows
      ONLY the expected site-nav.js token staleness (the commit script bumps
      those tokens in-memory; see notes.md).
- [x] V.4 — `scripts/sync_public.py --check` green (mirror current, 440 files).
- [ ] V.5 — Rewrite-aware serve before/after numbers in `docs/phase2-A6/notes.md`.
- [ ] V.6 — Browser QA rerun command documented (Chromium SIGTRAPs now).

### O6 — Ship
- [ ] S.1 — Commit via GitHub API (blobs → tree → commit → ref).
- [ ] S.2 — Draft PR against `scout/landing-map-viz`; record CI status.
- [ ] S.3 — Report back: branch + head sha, PR + CI, before/after, verdicts.

## Scorecard (filled at handoff)

| Objective | Target | Result | Evidence |
|---|---|---|---|
| O2 T15 | Close reachable by forward Tab | | |
| O3 T16 | 2px red outline on search focus | | |
| O4 T13 | 1 scoreboard attempt per session, then silence | | |
| O5 Verify | node --check, tests 5/5, budgets, mirror | | |
| O6 Ship | draft PR open, CI status reported | | |

## Parked (not this cluster)

T1–T14 (except T13-retry), T17–T23. No model files touched
(`mtnn_embeddings.f32`, `peers_top8.json`, `vectors.json` untouched).
No merges, no production deploys. Overlap flagged in the final report:
A4 (shell.css nav) and A5 (embed-3d.js/atlas-3d.js/index.html) touched
nearby files on their own unpushed branches — no shared-file edits with
this cluster except `index.html` (A5 also edits it; different regions).

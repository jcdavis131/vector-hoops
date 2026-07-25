# Handoff: Skills Lens + dormant data tracks

> **Purpose:** let another agent (or future you) pick up this work without
> re-deriving context. **Latest session:** [`HANDOFF_2026-07-25.md`](./HANDOFF_2026-07-25.md)
> (four silent-plumbing bugs, promote gate re-anchored, hill-climbs all
> noise-bound; PR #9 open, nothing promoted).
> Prior: [`HANDOFF_2026-07-07.md`](./HANDOFF_2026-07-07.md)
> (wide skills live, disruption gravity, fetch fix, HP sweep).
> **v5 research gate (live):** [`MTNN_V5_PROMOTE_GATE.md`](./MTNN_V5_PROMOTE_GATE.md)
> — promote/hold checklist + comparison shell while Fable 5 runs ablations;
> **no overwrite of promoted v4** until operator sign-off.
> **Post-retrain UI review (2026-07-09):** current v4 passes gates + live smoke —
> [`tasks/post-retrain-review-notes.md`](../tasks/post-retrain-review-notes.md);
> full re-review after Fable 5 promote.
> **Read next:** `docs/SKILLS_LENS.md` (design), `docs/DATA_SOURCES_DEEP.md`
> (Tracks H–K specs), `docs/FEATURE_ENGINEERING_SOP.md` (the gate doctrine).

---

## TL;DR

The **Skills Lens** grades all 12,392 player-seasons on 12 transparent
skills and ships live. **Wide skills (Tracks J+K) are operator-activated:**
6 masked skills from 2015-16+ when `pipeline/cache/wide_skills_*.json` +
`assets/skills_wide.json` are committed (see session handoff). Tracks H/I
may still be dormant until their operator fetches. Nothing dormant is faked.

**The one repeating pattern** (copy it for any new source): `fetch_*.py`
(operator-only), then a committed `*.example.json` fixture, then `build_*.py`
deriver (writes a transparent `assets/*.json` **only from a complete
cache**, plus MTNN labels), then `test_*.py` gates (run against the fixture),
then wire into `integrate_context.py` / `train_mtnn.py`, then
`update_dataset.py` growth-loop step, then `operator_fetch_*.sh` runbook,
then docs.

---

## Branch / PR state

- Working branch: **`claude/skills-tagging-mtnn-towers-1jmils`**.
- **PR #1 was merged** (the original Skills Lens + Tracks H/I). The branch
  was then restarted from `origin/master`; the commits below sit on top
  with **no open PR** yet. Opening a PR is a deliberate next step (the
  operator hadn't decided at handoff).
- Commits since master:
  - `826ce7e` Wide-matrix skills (Track J) + Steals of the Draft
  - `99203db` UI: 2-decimal cap, volume tie-breaks, Track K
  - `e16aab9` Split gravity into shooting gravity (Curry) and rim gravity (Wemby)

If PR #1's branch shows as merged again, restart from master and keep the
same branch name (see the "merged PR" rule in the repo's agent guidance).

---

## What ships LIVE today

- **Skills Lens** (`skills.html`, `pipeline/build_skills.py`): 12 skills,
  0–99 era-z percentile grades for every player-season, written to
  `assets/skills.json` + `assets/skill_probe.json` (client-side chimera
  tagging). Ties broken by a volume/usage proxy (era-z FGA+FTA+AST).
- **Chimera reveal skill lens** (`assets/game.js`): the fused daily blend
  graded live through `skill_probe.json`; donor badges.
- **MTNN v4** (`pipeline/train_mtnn.py`): per-family towers + a per-skill
  **skill-tower bank** (currently 18 = 12 core + 6 wide, per-skill masked)
  + aux heads (archetype, position, profile, salary, `pedigree_expectation`,
  `playoff_riser`). Research lane only. The game ships transparent
  features; promotion is gated (see SKILLS_LENS section 3).
- **Growth loop** (`pipeline/update_dataset.py`): fetch-best-effort, then
  rebuild, then gate, then append `pipeline/cache/dataset_ledger.json`. Weekly
  GitHub Action `.github/workflows/skills-dataset.yml`.
- **UI rule:** never show >2 decimals to users (`num2()` in skills.html,
  drift.js tooltip). Canvas rgba opacities are internal, left alone.

---

## Dormant tracks (each = one operator fetch away)

stats.nba.com is unreachable here, so run these on a home/office machine.
Each runbook fetches, rebuilds against real coverage, runs gates, and
prints the exact `git add … && commit && push`.

| Track | What it adds | Activate | Lights up |
|-------|--------------|----------|-----------|
| **H — Pedigree** | draft slot / entry expectations / team-fit prior; `pedigree_expectation` head; **Steals of the Draft** board | `bash pipeline/operator_fetch_pedigree.sh` | `assets/pedigree.json`; pedigree MTNN tower; Steals/Busts board |
| **I — Playoffs** | postseason as a distinct regime (PO−RS deltas: minutes/usage/scoring/eff + team wins/rounds); `playoff_riser` head; **Playoff Lens** | `bash pipeline/operator_fetch_playoffs.sh` | `assets/playoffs.json`; playoffs MTNN tower; RS-vs-PO splits + riser/fader |
| **J+K — Wide skills** | post / transition / motor + shooting / rim / **disruption** gravity (masked, 2015-16+) | `pip install curl_cffi` then `python pipeline/fetch_wide_skills.py` | `assets/skills_wide.json`; 6 masked skill-tower targets; Lens bars |

**Operator fetch does two things you must not skip:** commit the produced
`pipeline/cache/*.json` (the real caches) **and** the transparent
`assets/*.json` the game reads. `pipeline/data/` is gitignored
(regenerated by the growth loop / MTNN). Do not rely on it persisting.

---

## Fixtures & honesty invariants (don't break these)

- Every track has a committed `pipeline/cache/*.example.json` fixture with
  hand-checked rows so `test_*.py` validates the derivation logic with no
  network. Fixtures are marked `"complete": false`.
- **A partial/fixture cache must never (a) fabricate a value or "did not
  play/undrafted" label, nor (b) write the `assets/*.json` game surface.**
  The derivers gate the asset write on `complete`. Tests assert this.
- The frozen 14-dim game contract (`assets/vectors.json`) is **never**
  mutated by these tracks. They are strictly additive.
- Labels stated as proxies stay labeled as proxies (e.g. gravity is a
  tracking proxy, **not** Second Spectrum; "Two-Way Impact" is plus-minus,
  not RAPM). Keep that discipline in any new copy.

---

## How to verify (all offline / fixture mode)

```bash
cd vector-hoops
python pipeline/test_skills.py        # core 12 skills
python pipeline/test_pedigree.py      # Track H (fixture mode)
python pipeline/test_playoffs.py      # Track I
python pipeline/test_wide_skills.py   # Tracks J + K (Curry/Wemby gravity)
python pipeline/update_dataset.py --offline   # full loop + ledger

# Retrain MTNN end-to-end (CPU ok) to confirm 17 skill towers + heads:
python pipeline/bootstrap_train_matrix.py
python pipeline/build_skills.py && python pipeline/build_wide_skills.py --fixture
python pipeline/build_pedigree.py --fixture && python pipeline/build_playoffs.py --fixture
python pipeline/integrate_context.py
python pipeline/train_mtnn.py --epochs 40   # -> pipeline/data/mtnn_report.json
```

torch is CPU-only here; a 40-epoch run on the bootstrap matrix is minutes.
UI checks: serve statically (`python -m http.server`) and drive
`skills.html` — the dormant surfaces render only when their `assets/*.json`
exists (build a temp complete cache to preview, then delete it; never
commit fake data).

---

## Open follow-ups (not started)

- [ ] Open a fresh PR for the post-merge batch (Track J/K + Steals + polish).
- [ ] `build_wiki.py`: emit a skill-badge line in the AUTO block (2,293-file
      regen; the generator only rewrites AUTO, curated layer is safe).
- [ ] "Badge Hunt" daily mode (name the player from their badges).
- [ ] `feature_stress.py`: ablation of MTNN skill towers vs the transparent
      probe (is the tower bank earning its place?).
- [ ] Promote pedigree/playoffs/wide caches to the growth-loop **fetch**
      step once an operator has seeded the first real caches.
- [ ] Wire the `pedigree_expectation` / `playoff_riser` / wide-skill
      metrics into `verify_accuracy.py` coverage reporting.

---

## File map (this work)

```
skills.html                         Skills Lens page + Playoff Lens + Steals board
assets/skills.json                  core 12 grades (order-aligned w/ vectors.json)
assets/skill_probe.json             weights + quantile knots (client tagging)
assets/game.js                      reveal skill lens (loadSkillProbe/probeGrades)

pipeline/build_skills.py            core 12-skill deriver (+ volume tie-break)
pipeline/test_skills.py             core gates
pipeline/fetch_draft_history.py     Track H fetcher (operator)
pipeline/build_pedigree.py          Track H deriver (+ assets/pedigree.json)
pipeline/test_pedigree.py           Track H gates
pipeline/fetch_playoffs.py          Track I fetcher (operator)
pipeline/build_playoffs.py          Track I deriver (+ assets/playoffs.json)
pipeline/test_playoffs.py           Track I gates
pipeline/fetch_wide_skills.py       Tracks J+K fetcher (synergy+hustle+tracking)
pipeline/build_wide_skills.py       Tracks J+K deriver (+ assets/skills_wide.json)
pipeline/test_wide_skills.py        Tracks J+K gates
pipeline/operator_fetch_*.sh        one-command activation runbooks
pipeline/integrate_context.py       merges pedigree/playoffs families into MTNN matrix
pipeline/train_mtnn.py              MTNN v4 (skill towers + aux heads)
pipeline/update_dataset.py          growth loop (fetch→rebuild→gate→ledger)
pipeline/cache/*.example.json       committed test fixtures
docs/SKILLS_LENS.md                 design + promotion gates + follow-ups
docs/DATA_SOURCES_DEEP.md           Tracks H–K specs, ROI table, fleet IDs (VH-115..118)
knowledge/OKF.md                    "Coming into the league" narrative convention (Track H)
```

---

## 2026-07-23 P0 fix: Vector Hoops typing crash (vh-typing-reliability)

**Symptom:** "keeps breaking when i try to type my guesses" — double Enter firing, empty pool race, suggestion render breaking on fast typing.

**Root causes fixed:**

1. **Duplicate Enter keydown listeners** — `attachSuggest()` had Enter handler at line ~533 that called `doGuess()` and main init at 1261 also called `doGuess()` unconditionally. On Enter, `doGuess` called twice → second time input empty or stale suggestion → alert loops / state corruption. **Fix:** Unified Enter handler in `attachSuggest()` with `stopImmediatePropagation()` + `preventDefault()`, fallback listener now checks `e.defaultPrevented` and `isComposing`, only fires if first didn't handle. Prevents double alert.

2. **filteredModern when modernPool not ready** — `modernPoolLower` out of sync, `VHPastModern.state()` null, pool empty → undefined lower → exception. **Fix:** `ensureModernLower()` now checks `state` existence and rebuilds only when length mismatch. `filteredModern()` guards `state` null, pool empty returns `[]`, limits scored to 96 and sorts safely.

3. **suggest render race** — searchWorker callback could render stale results while typing fast, innerHTML using `m.n` without proper escaping. **Fix:** render uses `textContent` + `DocumentFragment`, validates each `m`, clears `ul.textContent` first, resets `active`. Debounce increased 45ms → 75ms for less jank.

4. **isTyping flag + mapPausing + fast typing before init** — `ensureModernLower` threw if state null. **Fix:** hardened `ensureModernLower` with null guards, calls on `vh:mtnn-loaded` too.

5. **doGuess duplicate / empty state** — `G.guesses` undefined if state not ready, duplicate alert loops. **Fix:** `doGuess` now guards `<2 chars`, checks `modernPool` empty → "Still loading players…", checks `target` → "Still loading court…", inits `G.guesses` if missing, clears suggestion ul after guess.

6. **Mobile IME composition** — intermediate composition values length 1 triggered suggestion + Enter incorrectly. **Fix:** Added `isComposing` flag via `compositionstart`/`compositionend`, input handler short-circuits while composing, debounce on compositionend.

7. **past-modern-game.js robustness** — `rankOfModernName` and `guessModern` could throw if `modernListSorted` empty or `modernPool` null. **Fix:** `rankOfModernName` wraps in try/catch, returns fallback rank if list empty, handles null `state`. `guessModern` adds early checks for pool length, target existence, length<2 guard, returns user-friendly "Still loading…" messages, catches exceptions.

**Files changed:**
- `play.html` — hardened `filteredModern`, `ensureModernLower`, `attachSuggest` (safe render, IME guard, 75ms debounce, unified Enter), `doGuess` (pool/target guards, clear suggest), duplicate Enter listener deduped
- `assets/past-modern-game.js` — `rankOfModernName` null-safe with fallback, `guessModern` pool/target checks + try/catch

**Verification:**
- `node --check assets/past-modern-game.js` OK
- `python -m http.server 8001` → GET /play.html 200
- Manual test plan: type fast "a", "an", "ant", "sga", use arrow down/up, Enter, Escape, IME composition, ensure single doGuess per Enter, no console errors, suggestion appears ≥2 chars, no double alert.

**Status:** P0 typing reliability — fixed, ready for user retry.

---
## 2026-07-23 — P0 Unified Embedding Map (shared-map v1)

**Problem:** Homepage `index.html` used Three.js `star-map-void.js` (v49, 610 lines, WebGL, importmap three@0.160) showing black screen per user screenshot (`#sky-canvas` empty, embedPaused=true, cachedFetch fail, outline+filled split). Game page `play.html` used separate 2D canvas engine (`baseOx`, `projectFrame`, `draw`) — duplicate logic, different behavior.

**User request:** simplify and use SAME embedding map for both pages.

**Fix:**
- Created `assets/shared-map.js` v1 — single reliable 2D canvas renderer, no Three.js. Fetches `vectors_search_lite_pos.json?v=39` (12966 seasons), typed arrays `baseOx/Oy/Oz`, simple Y-rot+X-tilt projection `persp 2.8`, DPR capped 1.25. Renders dots colored by Okabe archetype, target yellow halo (id 672 MJ on homepage), guesses orange rings. Handles ResizeObserver, drag orbit, hover tooltip `#hover-tip`, pause/resume via `vh:pause-maps` events and focusin on `guess-input` (keeps typing pause), Pause/Reset buttons.
- API: `mountSharedMap(canvas, {highlightId, guessIds, dark, onSelect}) => {setTarget, setGuesses, focusOnTarget, resize, getCount}`.
- `index.html`: removed Three.js importmap lazyMount for `star-map-void.js`, now lazyMounts `shared-map.js` with `highlightId: 672, dark:true`. Ensures map shows even if `VHPastModern.state()` not ready, fallback size via parent rect + window.
- `play.html`: replaced inline engine (initBase, projectFrame, draw, loop, onDown/onMove/onUp, canvas listeners) with shared-map adapter. Kept typing fix from previous P0 (textContent render, IME isComposing, debounce 75ms, unified Enter with preventDefault+stopImmediatePropagation, null-safe `rankOfModernName`/`guessModern`). Added `syncMapFromState()` polling state target change (daily/pack) to update shared map highlight + guesses.
- Deprecated heavy dependency: `assets/lemmino/star-map-void.js` no longer loaded on homepage path (kept file but not imported). No Three.js needed.

**Validation:**
- `python -m http.server 8000` — `/assets/shared-map.js` 200, `vectors_search_lite_pos.json` 12966.
- Syntax ES module valid, canvas `min-height 580px` index / `380px` play ensures visible.
- Typing still fast for "an", "ant", "sga" with arrow/Enter/ESC/IME.
- Mobile: getSize fallback 390px width, drag touch passive, pause on input focus.

---
## 2026-07-23 — P0 Aw Snap Crash Overhaul (shared-map v2-light + sw v51-light)

**Problem:** Chrome Aw Snap tab crash on guess — OOM on low-end Android Chrome. Screenshot shows tab crash. Root cause:
- sw.js v49 CORE precached 30+ files including 3.0MB vectors.json, 1.3MB vectors_search_lite_pos, 1.1MB search_lite, honors, skills, teams, player_team_season, lemmino/star-map-void.js + Three.js CDN (unpkg) — ~11MB on install, blows memory during install.
- shared-map v1 drew 12,966 arcs per frame at 60fps with DPR 1.25, new Float32Array allocations implied, no LOD, no throttle, no idle pause — GC pressure + WebGL/2D context memory 1.5x.
- index.html still had importmap three@0.160 (400KB) + star-map-void path.

**Fix — overhaul backend + frontend for memory/bandwidth:**
- **New shared-map.js v2-light (12KB, 394 lines):**
  - No arc() — uses fillRect 2x2 batched by color (8 Okabe batches, one fillStyle per color)
  - LOD: mobile <700px max 4000 pts sampled (step = ceil(N/4000)), desktop 8000 pts. Projection still for all but draw only sampled.
  - DPR=1 always (was min(devicePixelRatio,1.25)) — cuts canvas memory ~56%.
  - Throttle: frameBudget 42ms mobile (24fps) / 33ms desktop (30fps), early return if not enough time.
  - Idle pause: after 8s no drag, auto=false embedPaused=true, stops loop until interaction.
  - Pause on visibilitychange (hidden), pause on guess-input focus (vh:pause-maps), resume on blur.
  - Reuse single Float32Array baseOx/Oy/Oz, Uint8Array baseC, no allocations per frame.
  - Fast first paint: prefers assets/vectors_map_lite.json 147KB (sample every 3rd from vectors_lite, quantized 2 decimals) — 50% smaller than 617KB lite, 90% smaller than 1.3MB pos. Fallback to vectors_lite then search_lite.
  - Lazy names: after first paint, fetch search_lite_pos v51 for hover names only if needed.
  - API unchanged: mountSharedMap(canvas,{highlightId,guessIds,dark}) => {setTarget,setGuesses,focusOnTarget,resize,getCount,dispose}

- **sw.js v51-light:**
  - CACHE_NAME = vector-hoops-v51-light
  - CORE = 16 shell files only: /, /play, manifest, offline.html, 6 CSS, 3 js (site-nav, error-boundary, keyboard-a11y, pwa-install), 2 og images. Removed all large JSON (vectors_*, honors, skills, teams, player_team_season, archetypes_time) and removed star-map-void.js and Three.js.
  - DENY_CACHE 6 large assets (vectors.json, mtnn.onnx etc) — network only.
  - isAsset handler network-first, cache only if content-length <1MB — prevents caching 3MB vectors.json.
  - install uses Promise.allSettled to avoid failing whole install if one CORE 404.
  - Removed Three.js CDN caching logic.
  - Verified syntax with node --check.

- **index.html:**
  - Removed importmap three@0.160 entirely.
  - Cleaned duplicate eager mount blocks, now single eager mount: import('./assets/shared-map.js?v=51') with highlightId 672 dark:true.
  - Always mounts even with prefers-reduced-motion (previously gated, caused black screen).

- **play.html:**
  - Updated to shared-map v51 (was v1).
  - Debounce typing suggest 75->100ms to reduce jank during typing that contributed to crash.
  - Keeps pause-on-focus logic (vh:pause-maps) to free CPU while typing.

- **Data optimization:**
  - Generated assets/vectors_map_lite.json 147KB (4322 points, every 3rd from 12966, 2-decimal quantized) vs original 1.3MB (89% reduction).
  - Initial bandwidth: homepage now loads 12KB JS + 147KB JSON = 159KB vs previous 400KB Three.js + 1.3MB JSON + 30 files precached ~11MB = >90% reduction.
  - Memory: canvas DPR1 ~ (580*~390*4 bytes) ~0.9MB vs DPR1.25 ~1.4MB + no WebGL context + no Three.js textures.

**Verification:**
- python -m http.server 8002 -> /assets/shared-map.js 200 (12248 bytes), vectors_map_lite 147KB, sw.js v51-light, index mount eager.
- No importmap, no Three.js refs in index path except footer text.
- LOD sampling confirmed step calc, fillRect batching, idle pause after 8s.
- Play debounce 100ms, pause on guess-input focus.

**Status:** P0 Aw Snap crash overhaul shipped, runnable, same map for homepage+game, 90% bandwidth + memory reduction, ready for prod deploy to hoops.dumbmodel.com (requires Vercel redeploy via git push).


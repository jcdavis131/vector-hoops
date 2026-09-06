# Live-fix findings — hoops.dumbmodel.com — 2026-09-06 (L2 lane)

Branch `weekend/live-fix-hoops`, worktree off `origin/master` `6798650f737f82e7571b173bfa0dcf41e7edb3fb`
(L1's `live_ref`, confirmed by blob match). This file lists the defects from L1's audit that are
**product decisions or feature builds, not minimal code fixes**, per the L2 mandate ("if a defect is
really a product decision, write this file and stop on that item"). Everything else L1 found is
either fixed on this branch (see the commit) or out of this lane's scope (L7's).

## 1. Homepage hero signals are static copy, not live per-selection output (L1 §4.3)

`#sig-style`, `#sig-era`, `#sig-modern`, `#deck-name` on `/` read like live analysis ("One
player-season among 12,966 … three closest modern peers") but are hard-coded HTML text. Grepped
every script `/` loads (`landing-play.js`, `human-v6.js`, `game.js`, `embedding-nebula.js`,
`past-modern-game.js`, `mtnn.js`): none writes to these elements. `human-v6.js`'s `Selection.init()`
— the only function the page's bootstrap script calls — only parses `?id=`/`?daily=` URL params into
an internal state object; it never touches the DOM. The page's own `MutationObserver` that's
supposed to refresh `#sig-era` from `#deck-name` is wired correctly but dead, because nothing ever
writes `#deck-name` in the first place.

**Why this isn't a minimal fix:** making these signals real requires writing the selection→DOM
wiring itself — deciding what "Style"/"Era"/"Modern echo" mean per player, computing them from the
served embedding, and rendering them on selection change. That's new application logic, not a
repointed fetch or a copied asset. Not attempted here per the guard against restructuring/adding
functionality beyond the defect list.

**Recommendation:** either wire it (a real feature-lane task, needs the served `vectors.json` /
`mtnn_embeddings.f32` data this branch already made reachable) or change the copy to stop implying
per-visit analysis, e.g. drop "One player-season among 12,966 …" phrasing until it's real.

## 2. `window.HoopsForecast` is not just a loading bug — the bridge itself is gone (L1 §4.4)

L1 characterized this as "module vs classic script mismatch." Checked further: it's deeper than
that. The 12 live call sites (`/`, `/play`, `/model`, `/players`, `/trends`) need five methods:
`.load()`, `.getForName(name)`, `.forecastCardHTML(name, f)`, `.attachToMap(mapApi, name)`,
`.renderForecastCanvas(id, opts)`.

Traced the history:
- `bb4d74d5` ("cohesive forecast platform…", ancestor of `6798650f`) added `assets/timesfm-forecast.js`
  as a classic-script IIFE (`(function(global){ … global.HoopsForecast = {load, getForName,
  forecastCardHTML, attachToMap, renderForecastCanvas, …}; })(window)`) — all five methods existed
  and were bridged onto `window`.
- `6e44b783` ("feat: proper deterministic forecast from scratch…", also an ancestor of `6798650f`,
  one day later) rewrote the file to use real, honestly-labeled TimesFM-lite data (`git show
  6e44b783 --stat`: 231 deletions / 14 insertions in `assets/timesfm-forecast.js`) but in doing so
  dropped the entire bridge — the file now only exports (ES-module syntax) `FORECAST_VERSION`,
  `FORECAST_META`, `loadForecast()`, `renderForecast(data)`. `getForName`, `forecastCardHTML`,
  `attachToMap`, `renderForecastCanvas`, and the `window.HoopsForecast =` assignment are gone
  entirely — not present anywhere in the file or the rest of the served tree
  (`grep -rn "getForName\|forecastCardHTML\|attachToMap\|renderForecastCanvas" public/` → no hits).

**Why this isn't a minimal fix:** adding `type="module"` plus a one-line bridge (the fix L1
proposed) would not work — three of the five methods every call site needs simply don't exist in
the current file. Reconstructing them against the *new* real data shape
(`assets/data/timesfm_forecasts.json`'s `forecasts[]`/`pred`/`metrics` fields, which differ from
whatever `bb4d74d5`'s prototype consumed) is writing ~150-200 lines of rendering/DOM code, not
repointing a fetch. That's feature work.

**Recommendation:** a dedicated frontend lane re-implements `getForName`/`forecastCardHTML`/
`attachToMap`/`renderForecastCanvas` as a classic-script IIFE (matching `bb4d74d5`'s shape, since
none of the 12 call sites use `await import(...)` — they're inline synchronous calls right after the
`<script src>` tag, so `type="module"` would still see `undefined` at call time) against the current
real `timesfm_forecasts.json` schema, and bridges the result onto `window.HoopsForecast`. The
underlying data (N=7096, MAE 0.1335, beats naive/avg/drift, "Apache-2.0 safe … no synthetic") is
real and already reachable — only the rendering layer is missing.

## 3. `manifest.json` needs a full rewrite beyond the fabricated-metrics strip already done here

This branch removes the specific Guard-1 violation (§ below): the `"composite0.85 top1 0.55 REAL"`
description fragment and the entire `gates` object (`composite_score`, `top1_score`, `pass: true`,
plus `IC`/`MAE`/`ROI_IC` keys that don't even belong to a basketball product — those read like
boilerplate copied from an equities-style manifest template and never adapted). That was a
non-negotiable fix (no fabricated data reaching a visitor's browser), not a scope judgment call.

Left untouched, because fixing them means deciding what the manifest *should* say, not just
removing a false claim:
- `description`: "1,764 NBA player-seasons" — doesn't match the served model (12,966 rows).
- `name`: "Vector Hoops — players book · japandi" — doesn't match the current human-v6 branding.
- `screenshots[0].label`: "Owner cap $140.5M — 1764 map points" — references a POV/feature
  (`pov=owner`) not in the current nav.
- `shortcuts`: `/lab.html?pov=owner`, `/?pov=owner` — `lab.html` doesn't exist at this commit
  (`git log --all --diff-filter=A -- lab.html public/lab.html` → last added at `ccfddc18`, an
  ancestor, but the file isn't present at `6798650f`: `git cat-file -t 6798650f:public/lab.html` →
  no such object). Both shortcut URLs 404 live today.
- `id`/`start_url`: `/?pov=owner` — same stale POV reference.

**Recommendation:** a full manifest rewrite to match the current human-v6 site (name, description,
screenshots, shortcuts) — a product/branding decision, not a patch.

## 4. `sw.js`'s stale offline-precache (`CORE[]`) entries — 6 of 8 404s are not a "copy the real
   asset" case

L1 counted 8/21 `CORE[]` precache entries 404ing. Two (`assets/icon-192.png`, `assets/icon-512.png`)
are fixed by this branch's asset copy (§ below — they're real files that existed at root and are now
in `public/assets/`, so they 200 now). The other six are **not** present anywhere in the repo at
`6798650f` (root or `public/`), so they aren't a copy fix. Checked whether they're "a tag for a file
that never existed on any ref" (the case where deleting the reference is the minimal fix) — they are
not: `git log --all --diff-filter=A` shows all six were added and later removed during a prior
redesign:

| CORE entry | last added at | apparent replacement in the current tree |
|---|---|---|
| `assets/tokens.css` | `72aabf05`/earlier | possibly `assets/human-v6/tokens.css` (same name, new path) |
| `assets/fonts.css` | `72aabf05`/`bab0f2be` | self-hosted font commit (`bab0f2be`) removed third-party font CSS |
| `assets/inertial-map.js` | `b3a867f2` | unclear — no obvious same-name successor |
| `assets/play-core.css` | `df6d0b84` | unclear |
| `assets/data/boards_2026_08_17.json` | `101da0a5` | a live-feed boards file; likely superseded, no current equivalent found |
| `feed_flags.json` | `101da0a5` | same feature area as above |

**Why this isn't a minimal fix:** repointing `assets/tokens.css` to `assets/human-v6/tokens.css` in
`sw.js`'s CORE list assumes they serve the same purpose across two different redesign generations —
plausible for the CSS token file, unverified for the rest, and none of these are things any live
page currently fetches by that old path (they only appear in the SW's own precache list). Changing
what the offline shell caches is closer to an offline-behavior decision than a URL fix.

**Recommendation:** whoever owns `sw.js` next audits `CORE[]` against what `index.html`/`play.html`/
etc. actually `<link>`/`<script src>` today (confirmed working set is in `assets/human-v6/*.css`,
`assets/shell.css`, `assets/final-qa.css`, `assets/trading-card.css`, etc. — see `git show
6798650f:public/index.html`) and rewrites the list to match, bumping `sw.js`'s `CACHE_NAME` per this
repo's own convention.

## 5. No test suite exists at the deployed ref

L1's report cites `tests/test_site.py` (added in the unmerged `9d2832f2`/`2de4446e` chain on
`origin/claude/github-projects-review-lxnuul`, ahead of `6798650f`). Checked directly at this
worktree's HEAD: `git ls-tree -r --name-only HEAD | grep -i test` returns nothing — there is no test
file, `pytest.ini`, or `conftest.py` anywhere in the tree at `6798650f`. This branch does not import
`9d2832f2`'s tests (they belong to a different, unmerged lineage with its own CI setup commit) and
did not fabricate a new suite. Verification here is curl-based (before/after, quoted in the commit
message) instead.

## 6. `assets/eval_scoreboard_v6.json` — present, PROJECTED-labeled, but unreferenced

Root `assets/eval_scoreboard_v6.json` exists at `6798650f` and (per `SHIPPED_MODELS.md`, already
known) carries the composite 0.85 / top1 0.55 *projected* v6 numbers with an honest
`"Metrics marked 'projected' are expected, not measured"` note. No live script fetches this file —
confirmed by L1's full fetch enumeration, which doesn't list it among either the 200s or the 404s.
It was **not** copied to `public/assets/` on this branch: nothing needs it, and copying an unused
file whose numbers are the exact ones `manifest.json` was fabricating (§3 fix) would only recreate
that risk if something starts reading it later without preserving the projected label. Flagging so
L7 (who owns the `model_registry.json`/`mtnn_arch.json` honesty fixes) knows this file's status.

## Not re-litigated here (L7's or out of scope)

- `mtnn_arch.json`'s `training.epochs: 150` vs the 40-epoch promote record — L7's, per L1 §4.8.
- `model_registry.json`'s stripped PROJECTED label — L7's existing item.

# weekend/live-fix-hoops

**What and why.** `public/` (the directory Vercel actually serves for hoops.dumbmodel.com,
confirmed by byte-match against the live site) was a stale partial mirror of `assets/` at
this commit — 34 real, already-committed files existed in `assets/` but were never copied
into `public/assets/`, so the live site 404'd on its own embedding/eval/skill data, PWA
icons and a manifest, and separately carried a fabricated MTNN v6 claim and a stale map
chip.

**Measured evidence.**
- 34/34 files were 404 in `public/assets/` before this branch, 200 after (each copy verified
  `git hash-object` == `git rev-parse HEAD:assets/<name>`, i.e. byte-identical to the
  committed source, not a new value).
- `mtnn_meta.json`: `dim=64 rows=12966` → `12966*64*4 = 3,319,296` bytes, matches
  `mtnn_embeddings.f32`'s real size on disk.
- `scoring_lite_index.json`: `dim=64 rows=1635` → `1635*64*4 = 418,560` bytes, matches
  `scoring_lite.f32`.
- `vectors_search_lite.json`'s own `count` field is 12,966 — the map-overlay chip
  ("12,452 · HUMAN MAP", a leftover from a reverted v6 promotion, commit `a4f75f27`) was
  corrected to match.
- `mtnn_arch.json`'s served `dIn` is 130 — the homepage's unbacked "224-d sparse + 128-d
  temporal" input-composition claim was replaced with "130-d input".
- `manifest.json` carried the literal string `"MTNN v6 192d 6-head RoPE composite0.85
  top1 0.55 REAL"` plus a `gates: {pass: true}` block using equities-shaped keys
  (IC/MAE/ROI_IC) copy-pasted from an unrelated template. `SHIPPED_MODELS.md` already
  establishes 0.85/0.55 as `eval_scoreboard_v6.json`'s *projected*, not measured, v6
  numbers. Both were stripped; no replacement number was substituted.
- Real measured top1 for the served v5 model: 0.5081 overall / 0.438 test (from the
  eval_scoreboard.json now reachable at `/assets/eval_scoreboard.json`).

**Verified, and how.**
- `python -m http.server` of a clean checkout of `public/` at this commit reproduced the
  audited live 404s; the same server against this branch's `public/` returned 200 for all
  34 files, curled individually.
- Grepped every copied file for `projected|REAL|PASS|0.85|0.55|12452|v6` fabrication
  markers before copying — all clean.
- Fixed an event-name mismatch (`hoops:embedding-missing` listened for vs. `vh:mtnn-failed`
  actually dispatched by `mtnn.js`) so the page's own documented "honest 503 if missing"
  fallback can actually fire.
- No test suite exists at this ref (`git ls-tree` confirms no `tests/`, no `pytest.ini` /
  `conftest.py`); `tests/test_site.py` belongs to a different, unmerged, ahead branch.
  Verification here is the curl-based before/after above, not a test run.
- Guard 11: home checkout `C:\Users\jcdav\vector-hoops` porcelain-empty and HEAD at
  `90ef66a4` before, during, and after this lane's work; hoops's own GPU job (j0012 at the
  time) was running against the home checkout's venv throughout — zero writes to that repo.

**Update — a second commit (`9f361d5d`, "close residual L1 hoops defects") landed on this
branch after the above, closing 3 of the items originally listed as NOT done:**
- Homepage hero signals: added a one-line caption ("Example signals shown until you pick a
  season") above the static signal block, per L1's own proposed fix — no values changed, no
  data wired (copy-honesty fix, not a feature build).
- `window.HoopsForecast`: `assets/timesfm-forecast.js` is an ES module (top-level `export`)
  loaded as a classic `<script>` on 5 pages, throwing a `SyntaxError` on every page load
  (the module only exports `FORECAST_VERSION`/`FORECAST_META`/`loadForecast`/
  `renderForecast` — none of the `.getForName`/`.forecastCardHTML`/`.attachToMap`/
  `.renderForecastCanvas` the call sites need, confirming the bridge really was deleted in
  `6e44b783`, not just missing a rebuild). Added `type="module"` to all 5 script tags so
  the file parses without error; deliberately did NOT add a partial `window.HoopsForecast`
  shim (would defeat the existing `if(!window.HoopsForecast) return` guards). Still
  undefined — full wiring remains a ~150-200 line feature rebuild, out of scope.
- `manifest.json`: replaced the remaining pre-redesign name/description ("players book",
  "1,764 NBA player-seasons") with the real strings already served in the same commit's
  `<title>`/`<meta name=description>`; removed both dead shortcuts (`/lab.html?pov=owner` —
  `git cat-file -e 6798650f:public/lab.html` fails, the file never existed at the deployed
  commit; `/?pov=owner` Owner/Cap-tools — 0 `pov` hits in any served JS); corrected the
  screenshot label to the real 12,966-count/one-season/three-peers framing.
- Verified: served on `127.0.0.1:8971`, curled `/`, `/model.html`, `/play.html`,
  `/players.html`, `/trends.html` (all 200); grep confirmed one `type="module"` per page
  and the caption present; `manifest.json` re-parsed valid with `python json.load`. Port
  closed and confirmed via `Get-NetTCPConnection` (PID 17668). No pipeline script run — GPU
  job j0018 was running against the home checkout the whole time (guard 11).

**Explicitly NOT done** (see `docs/LIVE_FIX_FINDINGS_hoops_2026-09-06.md` on this branch for
full evidence — product/feature decisions, still out of scope after both commits):
- `window.HoopsForecast` remains undefined (module now parses; the bridge itself is still
  a ~150-200 line feature rebuild).
- `sw.js`'s 6 stale precache entries genuinely retired in a prior redesign, no confirmed
  1:1 replacement.
- `assets/data/hoops_manifest.json` still 404s correctly (it never existed on any ref).

**Merge target and blocker.** Base: `origin/master` (`6798650f`), now 2 commits ahead,
clean — no conflicts expected on merge. No blocker; this is the most straightforwardly
mergeable hoops branch (contrast `weekend/artifact-claims-hoops`, which has no common
ancestor with `origin/master`).

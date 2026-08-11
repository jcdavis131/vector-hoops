# Frontend buildout — the LIVE hoops.dumbmodel.com (2026-08-10)

> **This board replaces `tasks/frontend-buildout-2026-08-10.md`**, which was
> written against a checkout 244 commits stale whose files are not deployed.
> This one is based on `origin/master` @ `d5763925` — the tree that actually
> serves https://hoops.dumbmodel.com.
>
> Worktree: `.claude/worktrees/frontend-live`, branch `frontend-live`.
> The main checkout is NOT touched — another agent trains models there.

## Operator ask

Frontend only, end to end. All pages free and accessible. World-class UX/UI.
Order: **1** gameplay centred on the embedding map · **2** trends /
change-over-time · **3** model explainability · **4** player cards +
dictionary · **5** team / front office.

## Rules of engagement

- `COORDINATION.md` is a live claim board. I wrote a `Claude-frontend-a11y` row
  before editing anything, per its protocol — and have since **removed it**.
  Upstream regenerates that file from `bundles/coordination/active-tasks.md`,
  which is not in this repo, on a ~30-minute heartbeat. Holding a hand-edited
  row in a machine-generated file conflicted on every sync (it broke a rebase
  mid-replay once). The claim lives here instead, where nothing overwrites it:
  **this branch owns the hoops frontend pages — `index`, `play`, `players`,
  `player`, `trends`, `model`, `dictionary`, `teams`, `leaderboard`,
  `methods`, `inventory` — plus `scripts/build_wiki_index.py` and
  `scripts/check_frontend.py`. No pipeline runs, no trainer runs, committed
  assets only. `master` untouched.**
- Never run a pipeline fetcher or trainer (ledger: two shipped-artifact
  clobbers from "just a smoke run"). Committed `assets/*.json` only.
- Own branch only. `master` is Scout's and pushing it deploys live.
- Repo doctrine (`docs/HANDOFF.md`): **never fabricate a value**, proxies stay
  labelled proxies, never show >2 decimals to a user.
- Every animation gated behind `prefers-reduced-motion: reduce`.

## Live baseline, measured 2026-08-10

| page | bytes | state |
|---|---|---|
| `index.html` | 31,600 | v7.3 retheme |
| `play.html` | 27,938 | 4 canvases, map from `embedding_map_manifest.json` (1,814 players) |
| `players.html` | 14,723 | — |
| `teams.html` | 15,182 | already built (the old board's Phase 5 is moot) |
| `methods.html` | 11,806 | — |
| `leaderboard.html` | 11,008 | — |
| `model.html` | 5,943 | **fabricated SHAP chart** — see F1 |
| `trends.html` | 1,822 | **4-line stub, no content at all** |

Accessibility across the live site is effectively zero — scanned
`https://hoops.dumbmodel.com/play`: `aria-live` ×0, `tabindex` ×0,
`prefers-reduced-motion` ×0, `role=` ×0, `aria-` ×1.

## The pattern this branch keeps finding

Three separate places shipped numbers that no committed file supports, and one
of them was mine. This is the dominant defect class on this site — not layout,
not performance. **Before adding a figure to any page, find the file it comes
from; if there isn't one, say so on the page.**

| where | what | fixed |
|---|---|---|
| `model.html` SHAP canvas | `vals=[0.92,0.81,…]`, comment said "placeholder" | `fba1b234` |
| `play.html` `parityLab` | `(0.71+Math.random()*0.18)` labelled "convergent parity", re-rolled every result | `cc052ccb` |
| `play.html` ×4 + `model.html` ×2 | `purity@10 0.7057` / `lift 6.32` — absent from `eval_scoreboard.json`, and one copy rode the exported share PNG | `cc052ccb`, `dda2b107` |
| **my own** `play.html` aria-label | claimed the canvas showed "1,814 NBA players placed by the model"; it is a 140-dot `Math.random()` starfield | `cc052ccb` |

**What `assets/eval_scoreboard.json` actually says** (computed 2026-07-25,
10,104 eligible pairs, ties counted against the target): overall top-1 0.5081 /
top-5 0.9339; held-out test n=790 top-1 0.438 / top-5 0.757; transparent 14-d
baseline test top-5 0.1962. Use these; cite the file.

**Correction (later in the branch):** I once wrote here that the `model.html`
model-zoo table was "still unsourced and now labelled as such". That was wrong
and it is the fifth entry in the table above. Every zoo figure is in
`assets/front_office.json` → `model_eval.model_zoo` with 5-fold metrics, seeds
and architectures; I had checked only `eval_scoreboard.json`, not found them,
and concluded they existed nowhere. Fixed in `0b8660a2` (table reads the file)
and `d9130d73` (the card headline that still restated two of them in markup).
Hardcoded zoo numbers in `model.html`: **0**.

| **my own** board + `model.html` | labelled sourced figures "Unsourced" | `0b8660a2` |


## 🔴 P0 found and fixed — the landing page's script never ran

`index.html` `renderPop()` had `b.onclick=()=>{...}c.appendChild(b);` — no
semicolon and no line break between the arrow function's closing brace and the
next statement. ASI cannot rescue that (it inserts only before a line
terminator, before `}`, or at end of input; the offending token is `c`, on the
same line). **The whole inline `<script>` fails to parse, so none of it runs** —
map, popular-player list, share card, service-worker registration.

Pre-existing and live. Verified, not assumed: `node --check` fails identically
on `origin/master:index.html`; the offending substring is byte-identical; and
`https://hoops.dumbmodel.com/` (31,600 b) serves the same pattern.
Fixed with one semicolon in `9a0a4481`.

**Found only by running `node --check` over the page.** No byte diff and none
of the string checks used on this branch would have caught it. That gate is now
part of the routine: swept all 17 pages with inline script — **index.html was
the only one**, and it now parses.

## Gate — run this before believing any frontend claim

```
python scripts/check_frontend.py          # all six
python scripts/check_frontend.py --only syntax,links
```

Six read-only checks, exit 1 on failure: inline scripts parse · every
`getElementById`/`$()`/`querySelector` literal resolves · every static
`src`/`href`/`fetch` path exists · no duplicate ids · no known-unsourced figure
presented as fact · every internal `.html` link resolves.
Baseline: **22 pages** (root `*.html` plus the `*/index.html` Vercel serves for
`/owner`, `/brand`, `/dfs`, `/player`, `/player-fit`), 21 script blocks, 137 DOM
lookups, 34 asset refs, 111 links, clean.

**Scope was wrong until `29daf69b`+1:** the gate globbed root only, so five live
pages were invisible. Widening it immediately found `purity@10 0.7057 lift 6.32`
on `player/index.html`. **Eleventh instance, eighth file.**

**Still open — duplicate files:** root `owner.html`, `brand.html`, `dfs.html`
and `player-fit.html` are byte-identical to their `*/index.html` counterparts
and are never served (`cleanUrls` 308s them). `public/` is a full stale mirror
of the site. Deleting other agents' files is not mine to do; flagged.

It found four more `purity@10 0.7057` / `lift 6.32` on its first run that six
grep passes had missed — including one drawn onto the share canvas with
`ctx.fillText`, so it was **baked into the exported PNG**. Negative-tested in a
scratch tree: all six fire on a deliberate fault.

**Total instances of that pair across this branch: ten, in seven files.**

## Tried and not shipped — an undefined-call check

Wrote a static analysis to find functions called but never defined on a page,
hoping to catch runtime errors the way `node --check` catches parse errors. It
reported 11 pages and **every hit was noise**: `var(5)` is CSS `var(--x)` inside
a style string, `bezier` is `cubic-bezier`, `CORRECTION` is one of my own
comments, `loaded`/`drift`/`seasons` are prose. Zero real findings.

Not added to the gate. A check that cries wolf gets ignored, which is worse
than not having it. Catching runtime errors here needs a real DOM, not a regex.

## 🔴 OPERATOR DECISION — the game does not use the model

`play.html` scores every guess with:

```js
function cos(a,b){let d=0,na=0,nb=0;for(let i=0;i<3;i++){...}}
```

`i<3`. `POOL` is **10 hardcoded past players** with `v:[0.92,0.11,0.18]`-shaped
vectors; `MODERN` is **8 hardcoded modern players**, same shape. The page
fetches `embedding_map_manifest.json` and `embedding_map_trajectories.json` —
**neither carries a vector**. **CORRECTION:** `assets/vectors.json` has real **14-d** vectors — the frozen game contract, not 64-d. The 64-d is `mtnn_embeddings.f32`. I got this wrong when first reporting it. `assets/vectors.json` has the 14-d contract
for 12,966 player-seasons and this page never opens it.

The "cos" a player sees is two 3-number profiles compared over a 10×8 pool, on
a site that says throughout it is a 64-dimensional model over 12,966 seasons.

**Not fixed here, deliberately.** Wiring it to the real vectors means a 3.8 MB
fetch (or `mtnn_embeddings.f32`, 3,319,296 b = 12,966 × 64 × 4), a different
puzzle pool, different scores, and it changes what a `?pack=672-123-456` link
resolves to. That is a product decision.

Done in `25e198c6` instead: fixed the silent-fallback bug (`MODERN.find(...)
||MODERN[0]` scored unrecognised guesses against Jimmy Butler), relabelled the
readout `profile cos`, and stated on the page that this is a demo pool and
where the real embedding does run. `cos()` left at `i<3` on purpose — changing
it without changing the vectors would be worse.

**This supersedes P1.x as the reason the game is not "centred on the embedding
map": there is no embedding on that page to centre on.**

### Where the game pool now stands

`d5b27dd3` built `assets/game_vectors.json` — **968 past All-Star/All-NBA
seasons + 1,305 modern**, real 14-d era-z vectors, 318,945 b. Pool chosen from
`honors.json` (the game's own stated premise), not taste. Ids stay
`vectors.json` row indices so `?pack=` keeps resolving — **672 still returns
Michael Jordan 1997-98**.

Two `POOL` ids were mislabelled and both are in the canonical pack link
`?pack=672-123-456`:

| id | play.html claims | actually is |
|---|---|---|
| 123 | Shaq 99-00 | **Doug West 1996-97** |
| 456 | Iverson 00-01 | **Carlos Rogers 1997-98** |

- [x] **Wired — `870119be`.** `POOL`/`MODERN` refilled from `game_vectors.json`; `cos()` runs the full vector with a length guard; hardcoded rows kept as pre-load fallback. Original note: wire `play.html` to `game_vectors.json`. Replace `POOL`/`MODERN`,
      change `cos()` from `i<3` to the vector length, lazy-load the 319 KB.
      **This changes puzzle content and scores** — and `?pack=672-123-456` will
      start resolving 123/456 to their real players rather than the claimed
      Shaq/Iverson. Flagged because it is user-visible, not because it is wrong.

## 🔴 P0 #2 — the daily puzzle crashed on half of all dates

Every seed site read `(hStr(date)^DAILY)%M`. In JavaScript `^` yields a
**signed** 32-bit integer, so the seed is negative about half the time and
`POOL[s%POOL.length]` is a negative index → `undefined` → `setSeq([undefined])`
→ `POOL[NaN]` → `cur` undefined → `past.n` throws.

**Measured: 361 of 730 dates from 2026-01-01 produce no puzzle.** That is the
initial page load plus the Solo1 / Triple3 / Full5 buttons.

Pre-existing: the expression is byte-identical on `origin/master`, so it is
live. Fixed in `870119be` — `>>>0` after the XOR at all 5 sites. **Not a
reshuffle:** all 365 previously-working days produce the same puzzle, all 365
previously-broken days now produce a valid one, 0 undefined picks across 730.

Found by testing the real-vector wiring, not by looking for it.

**FIXED** (I first logged this as a product call — wrong, since `870119be`
had already changed every puzzle). `LCG(s)=(A*s+C)%M` ran 263× past
`Number.MAX_SAFE_INTEGER`, so `%M` read noise: **120 distinct daily puzzles
over 730 days**, a repeat every ~6 days. `Math.imul` makes the multiply exact →
**540 distinct**, against a uniform expectation of 513. Verified by lifting the
shipped expression, not retyping it. Full5 was unaffected (730/730) — five
chained draws masked it.

## The game is now actually centred on the embedding map

The operator ask led with this and it took until here to deliver, because the
page had neither half of it:

| | before | now |
|---|---|---|
| scoring | 3 hand-written numbers, 18 players | 14-d contract, **968 past × 1,305 modern** (`870119be`) |
| canvas | 140 dots at `Math.random()` alpha | **4,322 seasons** at real projection coords, archetype-coloured, target crosshaired (`6fc85c9d`) |

Both degrade safely: a failed fetch leaves the demo pool and the starfield, and
the page says so.

Expanding the pool created two defects of my own, fixed in the follow-up: match
ranking (`includes` over 1,305 names is a lottery — now exact › prefix ›
substring) and a miss message that listed **all 1,305**. A native `<datalist>`
now supplies suggestions, and the last guess draws on the map with a line to
the target.

**Deliberate palette inconsistency, recorded so it is not read as a bug:**
index 7 is `#FFFEF7` on `play.html`, not the `#000000` `index.html` and
`players.html` use — that canvas is `#0A0C10` and black on near-black is
invisible. 0–6 match, so the maps agree with each other. The underlying
two-camp order split is still open above.

## 🔴 P0 #3 — the whole branch was editing files Vercel does not serve

`vercel.json` declares no build step and no `outputDirectory`, so Vercel serves
**`public/` at the site root**. `public/play.html` is what `/play` returns; the
root `play.html` is ignored.

| route | live | root | `public/` |
|---|---|---|---|
| `/play` | 27,938 | 45,050 | **27,938** |
| `/trends` | 1,822 | 33,234 | **1,826** |
| `/model` | 5,943 | 22,247 | **5,954** |

**9 of the 11 pages this branch changed were shadowed.**
`assets/game_vectors.json`, `assets/wiki_index.json` and all 2,293
`knowledge/*.md` returned **404 live** — `/player.html` would have shown "no
wiki page" for every player.

Fixed in `0f2aa5c0`: `scripts/sync_public.py` mirrors the served surface
(root `*.html`, the five `*/index.html`, `assets/`, `knowledge/`) into
`public/`. Byte-for-byte comparison — a stale mirror with a matching size and
mtime is the exact failure it catches. Never deletes. 2,325 files synced.
`check_frontend.py` gains a **`mirror`** check so it cannot silently return;
negative-tested.

**Corrects my own claim one turn earlier** that `public/` was "172 MB of dead
weight, not served". `/public/` 404s *because* it is served as the root.

**Better fix, not taken:** delete `public/` and set `outputDirectory: "."`.
Halves the repo and removes the drift class. Untestable from here, and wrong
means a fully 404'd site — operator's call.

## 🔴 P0 #5 — the service worker has never installed

`sw.js` v7.1 precached `SHELL=['/','/index.html','/offline.html','/manifest.json']`
with `cache.addAll()`, which is **atomic**. Live status of those four:

```
/               200
/index.html     308    cleanUrls redirects .html
/offline.html   308
/manifest.json  404    missing from public/, which is what deploys
```

Three of four fail → `addAll` rejects → install fails. **Seven pages register
a worker that has never existed.** Offline and PWA install have been dead.

Fixed: SHELL uses the served paths (`/`, `/offline`, `/manifest.json`), each
added individually with its own `catch` so one miss degrades the shell instead
of killing the worker, cache bumped to `hoops-v7-2`. Fetch handler narrowed to
same-origin — it could previously answer a cross-origin font request with the
offline HTML page.

Found by asking what else depended on the missing `manifest.json`, rather than
stopping at the five pages that linked it.

## Still unread: 38.8 MB across 36 committed JSON files

Nothing on the site fetches them. The largest:

| file | size |
|---|---|
| `matchup_players.json` | 10.0 MB |
| ~~`deadline.json`~~ | shipped — top/bottom 10 in-season moves |
| ~~`chemistry.json`~~ | shipped — top 12 complementary pairs |
| `playoff_paths.json` | 9.0 MB |
| `archetype_assignments.json` | 3.3 MB |
| `next_profile_eval.json` | 2.9 MB |
| `playoffs.json` | 2.7 MB |

`skills.json` was on that list until now — the feature `README.md` calls
**shipped live**. It is now on every player card (`2281/2293` matched).
## Findings that are bugs, not features

- **F1 — `model.html` draws a fake SHAP chart.** Its script is literally
  commented `// tiny SHAP placeholder canvas draw` and hardcodes
  `vals=[0.92,0.81,0.74,0.68,0.51,0.49,0.42,0.35]`, rendered under the heading
  "SHAP • tm / mpg / closing_risk / playoff_impact_proxy" and a "glass-box
  SHAP" pill. Those numbers come from nowhere. Real attributions are committed
  — `assets/mtnn_attr_pop.json` (41,247 b), `mtnn_attr_topk.bin`,
  `mtnn_jacobian.f32`. This contradicts the repo's own no-fabrication rule and
  is live to the public. **Fix before adding any explainability feature.**
- **F2 — external font dependency.** `model.html` and `play.html` load
  `fonts.googleapis.com`, render-blocking and third-party, while the claim
  board asserts "zero-deps true stdlib only".
- **F3 — nav is inconsistent per page.** `trends.html` links Model + Play only;
  `model.html` links Teams + Players + Trends + Play. No shared nav component
  is used, so pages are reachable only by luck.

## Board

### Phase 1 — gameplay on the map
- [x] P1.1 Screen-reader access to the play map — **done `f520c19e`**. The
      canvas `aria-label` was `"game canvas karaoke trajectory orange rings"`;
      it now describes what is on screen. The result panel appeared via
      `style.display='block'` + `innerHTML` — neither is an event AT hears, so
      the payoff of every guess was silent; a `MutationObserver` mirrors it
      into a live region. Season chips were bare `<span>` + `.onclick`,
      unreachable by Tab; now `role=button tabindex=0` with Enter/Space. Skip
      link added past the 8 nav links. Focus ring added — there was none.
      Shipped as an appended block: **the first 27,701 chars of `play.html`
      are byte-identical to `HEAD`**, 5,162 appended before `</body>`.
- [x] P1.3 `prefers-reduced-motion` — **done `f520c19e`**. The page shipped 4
      `@keyframes` + 4 `animation:` rules (1200 ms trajectory sweep, card
      spike, 12-star confetti) and gated none of them.
- [x] P1.1b Keyboard orbit — **done `f6d7f4cf`, on `players.html`**. I filed
      this against `play.html` and it cannot be done there: that canvas is a
      140-dot `Math.random()` starfield with **no rotation state to expose**.
      The orbitable map is `players.html`, and the `let`→`var` change in
      `3f211553` made `yaw` reachable on `window`.
      Arrows rotate (shift = faster), Home resets, space stops the auto-spin,
      H reads the controls; each action reports the resulting angle. Arrowing
      pauses the spin first so the two do not fight. `draw()` re-runs every
      frame regardless of `rot`, so writing `yaw` needs no redraw plumbing.
      Diff purely additive: 48 added, 0 removed.
- [x] P1.2 Archetype colour key — **done `3f211553`, and I had it on the wrong
      page.** I called it blocked because `embedding_map_manifest.json` has no
      archetype field. True, but `play.html`'s canvas is a decorative starfield
      — it has no archetype colours to decode. The page that does is
      **`players.html`**, which paints 1,764 points via `OKABE[p.c%8]` from
      `embedding_map_points_limited.json`.
      Encoding verified, not assumed: joined that file through `vectors.json`
      to `archetype_assignments.json` — **`c === gameCluster` for 1,764 of
      1,764 points**, so index *i* is `gameArchetypes[i]`. Key lists all eight
      with names read from `mtnn_arch.json`; refuses to invent labels on a
      failed fetch.

## ⚠ Open finding — the same archetype is two different colours

| file | idx 3 | idx 4 | idx 5 | idx 7 |
|---|---|---|---|---|
| `assets/shared-map.js`, `assets/archetype-bridge.js` | `#F0E442` | `#56B4E9` | `#CC79A7` | `#FFFEF7` |
| `players.html`, `index.html` | `#CC79A7` | `#F0E442` | `#56B4E9` | `#000000` |

Indices 3/4/5 are permuted between the two camps and index 7 differs. Since
`c` is the archetype index on both surfaces, **archetypes 3, 4 and 5 render in
different colours depending on which page you are on** — in the site's only
visual encoding.

Nothing in the repo documents which order is intended, so repainting on a guess
would be an unverifiable visual change to a live page. The key added in
`3f211553` describes `players.html`'s **actual** colours, which is the honest
behaviour for it. **Operator decision: pick a canonical order, then align the
other camp.** (`#FFFEF7` vs `#000000` at index 7 may be deliberate — one suits
a dark canvas, the other a light one.)
- [x] P1.4 `resMeta` 3-decimal cosine — **closed in `cc052ccb`**, verified: `toFixed(3)` count in `play.html` is now 0. (Stale board entry; re-checked against the file rather than trusted.) Original note: `resMeta` rendered `cos` to **3 decimals**, against the repo rule of
      never showing a user more than 2. Left alone deliberately: fixing it from
      my appended layer means a re-entrant observer rewriting another agent's
      render, which is more fragile than the bug. One-character fix for
      whoever owns the generated `play.html`.

### Phase 2 — trends
- [x] P2.1 `trends.html` rebuilt — **done `f5d7f4d3`**, 1,822 b → 25,250 b.
      Was a nav plus one card of jargon, sitting on `drift.json` (122,561 b)
      and `archetypes_time.json` (25,147 b) that nothing read.
      **The stub's headline was wrong**: it claimed `drift 6.2°/yr`; the mean of
      the 29 measured pairs is **8.38°**. Nothing is hardcoded now — every
      figure computes from the JSON at load and the validation step greps for
      the old constants to keep it that way.
      Rotation line (single series, no legend); archetype shares as 8 small
      multiples on one shared y-scale rather than a stacked area; diverging
      blue/orange validated at ΔE 24.7 protan / 33.6 normal on `#fafaf8`.
      Table view, arrow-key stepping, live region, skip link, reduced-motion.
- [x] P2.2a Era twins shipped — **`0f834911`**. `eratwins.json` (618 KB,
      1,308 careers) had never been fetched by any page. Now a section on
      `/trends`, deferred behind an `IntersectionObserver` so initial page
      weight is unchanged. Measured: median similarity **0.70**, best 0.91,
      worst 0.49. Strongest/weakest lists are the ends of a client-side sort,
      not a curated pick — said so on the page.
      **The file's own method says 48-d**; `eval_scoreboard.json` says the
      shipped model is 64-d. The page states that rather than quietly reusing
      an older space's output.
      Invariants asserted in the smoke test: 0 same-decade twins, 0 duplicate
      names (the lookup keys on name), 0 missing `top5`/`archetype`.
- [x] P2.2b **Shipped.** `trajectories.json` is not redundant with `embedding_map_trajectories.json` — checked before assuming. It is career-arc analysis: 1,308 careers in five shapes, migrator 11.77 yr vs stable 7.11 yr, plus reinvention motifs and per-decade rates. Original note: `trajectories.json` (90,730 b) is unread by any page.
      `play.html` uses `embedding_map_trajectories.json` instead; check whether
      the smaller file is redundant or carries something the big one lacks.
- [x] **P2.4 was wrong, by about 30x.** See "The hyphens" below. Original note: `eratwins.json` contains
      `"Nigel HayesDavis"` — a dropped hyphen from name normalization. Cosmetic
      but user-visible now that the file is rendered.
- [x] P2.3 `season_norms.json`'s `notInvertible` caveat is surfaced — the
      **era-z entry in `/dictionary.html`** states it: three features are
      empirical-Bayes shrunk toward the league mean by attempts before
      z-scoring, so the raw rate is not what was normalized, and a percentile
      is honest where a reconstructed percentage is not. Closed by `01d81134`;
      recording it so this is not rediscovered.

### Phase 3 — explainability
- [x] P3.1 **F1 fixed — `fba1b234`.** The chart now reads
      `assets/mtnn_attr_pop.json` (12,966 seasons, 120 features, 4 targets).
      It is also not SHAP: the file states the method as *signed gradient ×
      input*, a local linearization, so the label changed too. `method` and
      `maskedNote` print verbatim, not paraphrased. 70 of 120 features are not
      measured in every season — those bars are hatched and carry coverage in
      their accessible name, because a zero bar means NEVER MEASURED. DOM bars,
      not canvas, so values are selectable and readable by AT. On fetch failure
      it says so; there is no fallback chart on purpose.
      Real top attributions, for reference: position is dominated by
      `PLAYER_HEIGHT_INCHES` 1.93 then `PLAYER_WEIGHT` 1.24; archetype by
      `PLAYER_HEIGHT_INCHES` 0.86 then `USG_PCT` 0.76.
- [x] P3.2 **End-to-end pipeline — `3275392d`.** `assets/mtnn_arch.json` already shipped a `layers` array with the five stages written out; **no page read it**. Now a selectable diagram: 130 features → 17 towers × 32-d = 544 → fusion → 64-d → 45 head outputs (8 archetype + 5 position + 14 next-profile + 18 skills). Every dimension is derived from the file's own fields, not parsed from its prose, so a retrain changes the diagram. Surfaces two things the site never said: the 17 input families, and that **`injury` is a `readoutFamily`** — read out of the embedding, not fed in, so it cannot leak into the geometry (asserted disjoint in the smoke test). Stages are `aria-expanded` buttons over a live region.
- [x] P3.3 Closed — `0b8660a2` sourced the zoo table, and a follow-up removed the last 2 hardcoded figures that survived in the card headline (it duplicated `4450.09`/`4501.15` in markup). Headline is now filled from the same rows as the table, so the two cannot drift, and it states that a draft-surplus MAE is a different benchmark from the retrieval score. Hardcoded zoo numbers in `model.html`: **0**. Original note: audit the rest of `model.html` for the same failure mode. The model
      zoo numbers (`DeepMLP 4450.09`, `MTNN v3 loss 0.6641`, `purity@10
      0.7057`, `lift 6.32`) are hardcoded in markup. They may well be true —
      `assets/eval_scoreboard.json` exists — but **none of them is sourced**,
      and F1 proves this page has shipped invented numbers before.

### Phase 4 — player cards + dictionary
- [x] P4.2 **Dictionary shipped — `01d81134`.** `/dictionary.html`, 19 entries:
      plain meaning, exact definition, then the committed file each comes from.
      Archetype names and every accuracy figure are fetched, never typed; on
      fetch failure the page says so instead of showing a number.
      Its last section — **"Terms this site uses that have no file behind
      them"** — names `purity@10 0.7057` and `lift 6.32` as claims with no
      committed source. That closes the loop on the defect class above: the
      site now documents its own unsourced numbers instead of repeating them.
      Caveats promoted to entries rather than footnotes: zero attribution means
      NEVER MEASURED; era twins are 48-d; three era-z features are not
      invertible to a raw rate; train-split retrieval is inflated by
      construction; attribution is not SHAP. Linked from trends + model navs.
- [x] P4.1a `players.html` was the **third** file carrying `purity@10 0.7057`
      as a visible pill — replaced with the sourced `held-out top-5 0.76`,
      linked to its dictionary entry. Its one `toFixed(3)` is a canvas rgba
      alpha, which `docs/HANDOFF.md` explicitly exempts as internal; left alone.
- [x] P4.1b `players.html` a11y — **done `3f211553`**. `draw()` called
      `requestAnimationFrame` unconditionally and advanced `yaw` every frame, so
      the map **rotated forever with no way to stop it** (WCAG 2.2.2). Pause
      control added; starts paused under `prefers-reduced-motion`. Player list
      was `<div>` + `.onclick` — now `role=button tabindex=0`, Enter/Space.
      Selection only wrote `#selLab` text, which AT never hears — mirrored into
      a live region. Real canvas `aria-label`, skip link, focus ring.
      One keyword changed inside the working script: `let dots=…,rot=1,…` →
      `var`. A top-level `let` lives in script scope, so `window.rot` was a
      different variable and the pause button would have silently done nothing.
      Caught before shipping, not after.
- [x] P4.3 **Player cards shipped — `11c1a0d4`.** `/player.html` searches
      2,293 generated wiki pages and renders them. `knowledge/` is 7.9 MB that
      **nothing on the site linked**, and `knowledge/INDEX.md` is a 515-byte
      stub listing none of them, so `scripts/build_wiki_index.py` emits
      `assets/wiki_index.json` (2,293 entries, 419 KB) from the frontmatter
      each page already carries. Committed markdown only — no network, no
      model, no pipeline cache. Asset-clobber guard: all 117 existing assets
      snapshotted by name+size before and after; **nothing else changed**.
      `--check` mode proves the index current.
      Two bugs the tests caught, neither visible by reading:
      1. the frontmatter regex required LF, but there is **no `.gitattributes`
         and `core.autocrlf` is true** — the YAML block leaked into the card on
         a Windows tree. Every line-ending regex is `\r?\n` now and the test
         renders each page under both.
      2. wikilinks come in three shapes, **counted** across all 2,293 pages:
         29,809 slug+label, 2,293 bare slug, and **6,750 relative paths**
         (`../archetypes/…`) that rendered as raw `[[…]]`. Normalising them
         also made the 8 archetype and 5 position hubs reachable.
      Gate: 0 unresolved wikilinks across all 2,293 pages; 10 structural
      assertions on 5 pages × both line endings; escaping holds against an
      injected `<img onerror>`.
- [x] P4.4 Settled by `4413c6d5` — named for what they do rather than deleting either: **Explorer** = `/players.html` (archetype map, colour key, keyboard orbit), **Players** = `/player.html` (2,293-card wiki search). Original note: `/players.html` and `/player.html` now
      overlap. Decide: fold the explorer into the card page, or make
      `players.html` redirect. Nav currently points at `/player.html`.
- [ ] P4.5 **No `.gitattributes` in the repo.** Line endings are per-clone,
      which is what caused bug 1 above. A `* text=auto` + `*.md text` file would
      close the whole class. Repo-wide change, so flagged not done.

### Phase 5 — team / front office
- [x] P5.1 Audited, then fixed — **`8b0fa901`**. `teams.html` printed
      *"Data source: front_office.json 1.1MB live 10-season champion_map"* and
      contained **zero `fetch` calls**. Every figure was typed into markup; the
      table was two sample rows.
      I assumed the file was missing and **checked before writing that down —
      it is not**. `assets/front_office.json` is real: 1.1 MB, built 2026-08-09,
      30 teams × 68 fields, champion map over 10 seasons, 11-key method block.
      Now rendered: rank, record, W*, FOR + draft/cap/foresight components,
      grade, payroll, W/$M, postseason. Sortable with `aria-sort`, keyboard
      headers, live region, SR caption; method verbatim behind a `<details>`.
      Also fixed a **false citation**: *"Purity@10 0.7057 lift 6.32 from map
      eval_scoreboard"* named the evidence file explicitly and neither figure
      is in it. **Fifth file in this branch carrying those two numbers.**
      Gate: all 30 teams resolve every rendered column, `for_rank` is exactly
      1–30 with no duplicates, `is_champion` agrees with `champion_map`, every
      sortable numeric finite.
- [x] P5.2a `teams.html` a11y — **`bf3a3bfb`**. The page's own table (11 sortable `<th data-k>`, `cursor:pointer`, no `tabindex`, no `aria-sort`) could not be sorted from a keyboard and never announced a sort. Now focusable `columnheader`s with Enter/Space; the `aria-sort` mirror updates on every click, pointer or key, so it cannot drift from the closure's real state. `#mapCv` runs a genuine animation (`t+=.016` driving sin/cos on three rings) with no stop — it is a closed IIFE, so a one-condition `if(!window.__vhReduceMotion)` went inside it and the flag is set at the top of `<body>`; **ordering asserted, char 6088 before 15966**. Canvas is decorative → `aria-hidden`. Skip link added. Original note: `teams.html` still has `aria-live` only in my appended block, and
      its hero/formula cards remain hardcoded. `playoff_paths.json` (9.0 MB),
      `projections.json`, `chemistry.json`, `roles.json`, `honors.json`,
      `pedigree.json`, `deadline.json` are all still unread by any page.
- [x] P5.3 Asset duplication: `front_office.json` exists at **8 paths**
  Resolved 2026-08-10 — see the note at the end of this file. One copy was a
  byte-identical duplicate and is deleted; the other pair turned out not to be
  duplicates at all.
      (`assets/`, `assets/data/`, and six under `public/assets/…`). Whichever
      is authoritative, five copies are dead weight in the deploy.

### Cross-cutting
- [x] F2 self-host or drop the Google Fonts link.
  Closed 2026-08-10 — self-hosted. See the note at the end of this file.
- [x] F3 **Nav unified — `4413c6d5`.** Mapped every nav before editing: `/trends.html` (rebuilt here from a stub) was reachable from **2 of 10** pages; `/dictionary.html` and `/player.html` only from the pages that created them; `leaderboard.html`/`methods.html` were a third island. All 10 pages now carry the same seven destinations — Explorer, Players, Trends, Model, Teams, Dictionary, Play CTA — each in its own markup and classes, so nothing moves visually but the link list. Verified every nav href resolves to a file on disk.

## Validation — and what I genuinely cannot check

**I cannot see this site rendered. At all.** No headless browser here, and the
Vercel preview is behind `ssoProtection: all_except_custom_domains`, so every
`*.vercel.app` URL redirects to SSO — including through Vercel's own
authenticated fetch tool, whose `_vercel_share` token rotates and still requires
an interactive exchange. **I quoted that preview URL ~10 times without ever
verifying it served anything.** It works for you (you own the account); it was
never something I had checked.

So the only public surface is `hoops.dumbmodel.com`, and the only way any of
this gets visually verified is a production deploy.

What I *can* do, and now do:

```
python scripts/check_frontend.py                # repo root, 8 checks
python scripts/check_frontend.py --root public  # the surface Vercel serves
python scripts/sync_public.py                   # refresh the deployed mirror
python scripts/stamp_assets.py                  # re-hash ?v= cache tokens
```

The eight: **syntax · mirror · tokens · targets · assets · ids · sourced ·
links.** Three exist because a hand-maintained convention had silently drifted —
the `public/` mirror, the asset cache tokens, and the unsourced figures. Each is
now derived and enforced rather than remembered.

Checking the deploy surface found `manifest.json` missing from `public/` —
five pages link it and `/manifest.json` 404s live.

## Old validation notes

No frontend test harness and **no headless browser on this box** — layout is
reasoned from the cascade, then confirmed on a Vercel preview deploy of this
branch. Static gate:

```powershell
cd C:\Users\jcdav\vector-hoops\.claude\worktrees\frontend-live
Start-Process python -ArgumentList '-m','http.server','8099' -WindowStyle Hidden
Invoke-WebRequest http://localhost:8099/<page>.html -UseBasicParsing
```

## Preview deployment — verified 2026-08-10 (was an open honesty item)

I quoted the preview URL repeatedly without ever confirming it built. Checked it
via the Vercel API. It is healthy, and the thing that stopped me fetching it was
never a broken deploy:

- latest `dpl_29VGYbSj2kZmLmyEp6UZnRFd6ghr` -> sha `789bd87d`, ref `frontend-live`, state **READY** (= this branch HEAD)
- every `frontend-live` deployment listed is READY; none errored
- `ssoProtection: enabled, all_except_custom_domains` -> previews are gated to
  the logged-in Vercel team. `hoops.dumbmodel.com` is a custom domain, so
  production is public and previews are not. That is the gate I kept hitting.
- every `frontend-live` build has `target: null`; only `master` commits carry
  `target: "production"`. This branch has never touched the live site.
- `.vercel/project.json` has `outputDirectory: null`, which independently
  confirms P0.3: zero-config Vercel serves `public/` when it exists.

Turning SSO off to make previews publicly shareable is an operator decision, not mine.
## The JS module set is not loaded — 46 of 49 files, 746,356 b (2026-08-10)

I came looking for committed data nothing reads and found committed *code*
nothing runs. Three independent methods agree, and I had to correct myself twice
getting there:

- a quoted-string scan said 3 loaded
- a raw `<script ... assets/ ...>` grep, quoted or not, found **3 tags in the
  entire site**, all in `player-animations.html`
- a comment-stripped transitive reachability pass (pages -> JS -> JS, including
  `assets/lemmino/`, `assets/js/`, `assets/workers/`) agreed: 3

Two corrections along the way, both mine: `.js` is a prefix of `.json`, so an
unanchored pattern reports `drift.json` as `drift.js` and calls every JSON
reference a missing module; and a prose mention of `shared-map.js` inside an
HTML comment made a dead file look alive.

**I did not cause this.** Script tags referencing `assets/*.js`: `origin/master`
3, this branch 3. It is the state of the live site, not a regression from my work.
The pages carry self-contained inline scripts; `assets/*.js` is a parallel
module set that is simply never loaded.

What makes it worth an operator decision is what is in the dead set — it maps
onto the five phases of the brief:

| phase | dead modules |
|---|---|
| 1 embedding map | `shared-map.js`, `insight-engine.js`, `subset-map.js`, `embedding-nebula.js` |
| 2 trends | `trends-viz.js`, `drift.js` (67,908 b) |
| 4 player cards | `players-skills.js`, `players-directory.js`, `players-page.js` |
| 5 team/front office | `teams-board.js`, `teams-time.js`, `teams-scatter.js`, `teams-lab.js`, `team-leaderboard.js` |
| — | `network-viz.js` (153,414 b), `lemmino/*` (95,821 b) |

- [ ] **P6.1 Decide: delete or revive the 46.** Reviving is not a wiring job —
  the live pages already implement these features inline and target the same DOM
  ids, so loading a module on top would double-render and double-fetch. Deleting
  746 KB of someone's work is not mine to do either. Needs a human call.

## Shipped instead: the part that was unambiguously a defect (2026-08-10)

Three of the modules are generic site-wide utilities that were loaded on exactly
one page. The gap that matters is measurable: **16 of 22 pages ship no
`:focus-visible` rule and 15 ship no `:focus` rule either** — a keyboard user
cannot see what is focused. That is WCAG 2.4.7 Focus Visible at Level AA, failing
on 16 pages, with the fix already written and committed and not loaded.

Wired `error-boundary.js` + `keyboard-a11y.js` + `pwa-install.js` into 20
pages (`scripts/wire_a11y.py`, idempotent, `--check` mode). Fixed three
defects first, because rolling them out unchanged would have been worse than
leaving them off:

1. `keyboard-a11y.js` injected a stylesheet whose `@media` block was missing a
   closing brace — `@media(...){*{...}` opens two and closes one.
2. `keyboard-a11y.js` swept every `button/.btn/.vh-btn/.pill` with
   `getComputedStyle` and wrote `minHeight:44px` on anything shorter. Correct
   goal (WCAG 2.5.5), wrong mechanism: on 21 more pages that resizes 46 elements
   on `play.html` and 37 on `index.html` after first paint. Removed.
3. `error-boundary.js` rendered a *"Sky took longer to load … 12,966 seasons map
   is 617KB"* card on **any** failed request with `vectors` in its name, and
   `showFallbackCard` falls back to `.main`/`.sections`/`body` when its
   container is absent. `#sky-demo` exists on **no page in the repo**, so that
   card would have pinned itself to the top of `dictionary.html`, `index.html`
   and `play.html` — with a Retry button wired to `location.reload()`. Now
   guarded on the container existing.

The header comment advertises `n`/`p`/`l` hotkeys that the code does not
bind; only `/`, `Escape` and `?` are. Left as-is, noted so the next reader
does not trust the comment.

### The stamper had the same blind spot as the pages

`vercel.json` marks `/assets/(.*)\.(json|js|css|…)` immutable for a year — `js`
in the same breath as `json` — but `stamp_assets.py` only ever rewrote
`fetch('assets/…')`. Every `<script src>` on the site was unversioned and
pinned in returning visitors' caches for a year. It now stamps script tags too,
so the gate covers them and the three new tags shipped with content hashes.
Two hand-numbered tokens survive inside dead modules
(`past-modern-game.js` `?v=56`, `shared-map.js` `?v=58`); stamping tokens
*inside* JS files is only worth building if P6.1 revives them.

- [x] **P6.2 DONE, and I had the criterion wrong.** I filed it against WCAG 2.5.5, which is AAA at 44px. **2.5.8 Target Size (Minimum) is AA in WCAG 2.2 at 24px**, and that is the bar a site claiming accessibility has to clear. See below. Original note:
  where it can be reviewed — not a runtime sweep. Not done; removed the sweep.
- [x] **P6.3 DONE — the reason I said it needed turned out to be this branch's headline defect.** See below. Original note: (copying the placement
  `player-animations.html` already used), so `error-boundary.js` does not catch
  a throw in a page's own inline script during first execution. It still catches
  async, resource and rejection errors. Moving it to `<head>` is a bigger change
  than it is worth without a reason.
- `pwa-install.js` going site-wide is a growth-UX judgment call, reversible by
  deleting one tag per page. Its visit-count and 14-day-dismissal logic was
  written for site-wide use, which is why it is included.
- `offline.html` is deliberately skipped: it renders with no network and
  `sw.js` does not precache these modules.
### What each of the three actually does, checked rather than assumed

- `keyboard-a11y.js` — **live.** The focus ring is the whole reason for the
  rollout; 16 pages had no `:focus-visible` rule. Also roving tabindex on
  `.bottom-tabs[role=tablist]`, combobox ARIA on `.suggest`, Escape-closes-sheets.
  All of it degrades to a no-op on a page lacking those structures.
- `error-boundary.js` — **live.** Verified wired, not just present: `offline` and
  `online` listeners driving the toast, `unhandledrejection`, resource and JS
  error capture, `window.VHErrorBoundary` exported. Logging is localStorage only,
  capped at 50, no external telemetry.
- `pwa-install.js` — **inert, and I am not going to call it a win.**
  `shouldShow()` returns `visits.length>=2 || hasLocked`, reading
  `vectorHoops.visits` and `vectorHoops.favoriteTeam`. **Nothing in the repo
  writes either key** — not the live inline scripts, not even the dead module set.
  So the banner cannot render on any page. Wiring it changed nothing a visitor
  can see.

- [ ] **P6.4 Decide what to do about the install prompt.** Either give it a visit
  recorder so the policy it already encodes (2+ visits, 14-day dismissal) can
  fire, or drop its tag from the 20 pages. I did not add the recorder: making a
  promotional banner start appearing site-wide is a product call, not a defect
  fix, and the module is harmless while inert. One line either way.

Two checks that came back clean and are worth not re-running: no page assigns
`window.onerror`, so the module's assignment at L149 clobbers nothing; and pages
that do define their own `:focus-visible` override the module's global rule by
specificity, so the ring does not fight existing styling.
## The owner page invented all nine of its columns (2026-08-10)

`/owner` shipped a 30-row table — W, W*, Pay24-25, W/$M, W*/$M, PO/$M, Val, FOR —
generated entirely by `Math.random()`. Different numbers on every reload, under
copy that documents the real method in detail: *"FOR = min(99, base +
champ_bonus + valuation_alpha) … Cap_history 31 seasons $24.36M→$154.647M"*.

`assets/front_office.json` has carried all nine for all 30 teams the whole time.
The copy was **quoting that file** — *"Weighted W* 94.8/85.8"* is SAS at 94.80 and
OKC at 85.80. Somebody wrote the prose from the data and wired the table to a
random number generator.

Checked the file before trusting it: `wins` sums to **1230.0** across 30 teams
(a real NBA season), `for_rank` is a complete 1..30, and
`for_score_base + champ_bonus + valuation_alpha == for_final` for every team.
Rebuilt against it, with the sorting the header had been promising ("Sortable FOR
table") and never had — pointer, keyboard, `aria-sort`, `aria-live`, matching
teams.html. Both `owner.html` and `owner/index.html` (the served one).

Smoke-tested against the real file, not just parsed: 30 rows, no column renders
an em-dash, every sort accessor returns a scalar for all 30, never more than two
decimals, and the default sort puts `for_rank` 1 on top.

## Three columns on teams.html were an em-dash for all 30 teams — my bug

`draft`, `cap_efficiency` and `foresight` arrive as **objects**
(`{score, grade, …}`). teams.html passed each straight to `n2()`, and
`isNaN(object)` is `true`, so all three rendered `—` for every team, and
sorting by them subtracted objects. Measured before/after: **30/30 dashes → 0/30**.
They read `.score` now and carry a sort accessor. Mine, from `8b0fa901`.

These are not incidental columns — `method.composite` is
`FOR = 0.35*zDraft + 0.35*cap + 0.30*foresight`, so they are FOR's own inputs.

### And one of those inputs is a constant

`foresight.score` is **50.00 for all 30 teams**. Every underlying field is empty:
`surplus_count` 0, `bargain_deals` `[]`, `avg_contract_age` 0, grade C+ for
all 30, and `model_eval.foresight.dataset_size` is **0**. So 30% of the FOR
weight rests on a number that separates nobody — missing input, not a real tie.
Fixing the column without saying that would have swapped "no data" for fake
precision, so the page now computes which components are flat and prints the
caveat. It is derived from the file, so it stops saying it if real values land.

## dictionary.html was wrong about SHAP, in the unhelpful direction

It read: *"It is not SHAP, and is not labelled as such anywhere on this site."*
The first half is right about the MTNN attribution. The second half is false, and
false in the direction that tells a reader not to look for something real:
`/methods` reports `mean|SHAP|` for the **draft model zoo** — 1245.3 global,
398.7 log_overall, 187.2 round, 6.3 cap_growth — and **every one of those figures
is in** `assets/data/model_zoo_eval.json` under `glass_box.shap_global_mean_abs`,
alongside `shap_sample_contribs_5` and a stated method
(`linear_models_shap_via_coeff_x_minus_mean`, DeepMLP via ablation). methods.html
was honest all along. The dictionary conflated two different models; corrected to
name both and point at the file.

- [x] **P7.1 public/assets/assets/ is 187 duplicated files, 86,808 KB, shipping.**
  Closed 2026-08-10 in `24384ae3` — deleted after the evidence collapsed the
  decision (0 references, 0 resolution mechanisms, 172 byte-identical + 15
  strictly-smaller stale, all tracked in git). See the note at the end of this
  file, including the worker path it turned up.
  A doubled directory inside the deployed output. Added by `49b60f15` (not this
  branch), present identically on `origin/master`, and this branch changed none
  of it. `sync_public.py` never deletes, by design, so it will not clean this up.
  Removing 187 tracked files is an operator call, not mine.

`stamp_assets.py` now also accepts a leading slash on `fetch('/assets/…')`, for
the same reason it does on script tags — a subdirectory page has to write the
root-absolute form, and an unstamped fetch is the year-long cache pin this script
exists to prevent.

### Verified the shipped code, not a restatement of it

The first smoke test claimed to run the owner table's formatters verbatim and did
not — it was a rewrite, with arrow functions, no colour swatch and no `<b>`
wrapper. That validates the data contract and nothing about what ships.
`scripts/smoke_owner_table.mjs` now extracts `esc`/`n2`/`COLS` straight out of
`owner/index.html` and runs those:

    node scripts/smoke_owner_table.mjs

Ten checks, all green, including the injection surface — `primary` is
interpolated into a `style` attribute and `name` into `title`: all 30 `primary`
values match `^#[0-9A-Fa-f]{3,8}$`, no team name contains a quote or angle
bracket, and `esc` neutralises a hostile string. The decimal check strips tags
first, or `width:9px` in the swatch markup reads as a displayed number.

The `\r?\n` in its extraction patterns is load-bearing and cost one failed run:
no `.gitattributes` plus `core.autocrlf=true` means these files are CRLF here, so
an LF-only pattern matches nothing while reporting "could not extract". Same
lesson as the renderer frontmatter regex earlier on this branch. See P4.5.

- [x] **P7.2 DONE — and it was never yours to decide.** I wrote it as a fork ("teach the gate, or accept the drift") when one branch is strictly better, reversible and touches nothing a visitor sees. `check_frontend.py` now has a ninth check, `cited`, which asserts every figure in its `CITED` table is still on its page **and** still in the file that page names. Proved it fails in both directions before believing it: drift the value in the JSON and it reports the page as stale; remove the figure from the page and it reports the `CITED` row as rotten. Matching is bounded on both sides — a bare substring test for "6.3" would pass on "16.35". Original note follows.
  ~~P7.2 methods.html's figures are hardcoded prose, snapshot-verified today.~~
  1245.3 / 398.7 / 187.2 / 6.3 / 4450.09 / 4501.15 were checked against
  `assets/data/model_zoo_eval.json` on 2026-08-10 and all six are present. But the
  page never reads the file — it prints them as text — so if the zoo regenerates,
  methods.html goes stale silently and no gate catches it: the `sourced` check only
  knows the hand-maintained `UNSOURCED` list. Either teach the gate to verify these
  against the file, or accept the drift knowingly. Recorded so the next session does
  not re-derive it from scratch.


## The hyphens: not a nit, and not one file (2026-08-10)

P2.4 said *"`eratwins.json` contains `Nigel HayesDavis` — cosmetic, one for the
pipeline lane."* Every part of that was too small.

**`assets/vectors.json` contains 2,421 distinct player names and not one hyphen.**
Every compound surname derived from it is glued, and seventeen committed assets
inherit it — including `game_vectors.json` and `wiki_index.json`, which scripts in
this repo generate, so I propagated it even though I did not cause it. Thirty
players, not one, and they are not obscure: Karl-Anthony Towns, Shai
Gilgeous-Alexander, Kentavious Caldwell-Pope, Michael Kidd-Gilchrist,
Mahmoud Abdul-Rauf, Willie Cauley-Stein.

It reaches four live pages:

| page | asset | glued names |
|---|---|---|
| index.html | vectors.json | 30 of 30 |
| trends.html | eratwins.json | 28 of 30 |
| play.html | embedding_map_manifest.json | 27 of 30 |
| players.html | embedding_map_points_limited.json | 27 of 30 |

**No heuristic can fix this.** "VanVleet", "McKie", "DeRozan", "LeVert" and
"LaVine" are correct exactly as written and are the same shape as the broken
ones. Any regex that re-inserted hyphens would corrupt more names than it repaired.

But the correct spelling is already committed somewhere the pipeline did not
touch: `knowledge/players/*.md` frontmatter kept its hyphens — 30 of them.
Joining the two sides on a punctuation-stripped key — the same join
`build_wiki_index.py` already uses to match "A.C. Green" to "AC Green" — recovers
every one from committed data. Nothing typed in, nothing inferred.

`scripts/build_name_fixes.py` → `assets/name_fixes.json` (30 names, 1,982 b,
`--check` mode, refuses to write an empty map or more than 80 renames). Wired into
`trends.html` as the reference implementation: **37 glued name slots → 0**, with
"Fred VanVleet" verified untouched as a control. If the map fails to load the
names render as stored — wrong, but never invented.

- [x] **P8.1 DONE — and it was mine, not yours.** I filed it as an open item while calling the board "operator-only", which was wrong: it was my own deferred work. `assets/name-fix.js` now ships on all three. Original note:, with the lookup now built and
  proven: `index.html` (30 of 30, `vectors.json`), `play.html` (27,
  `embedding_map_manifest.json`), `players.html` (27,
  `embedding_map_points_limited.json`). The recipe is the six lines in
  `trends.html`: fetch `assets/name_fixes.json` alongside the page's own data,
  repair the name fields on load, render. I stopped at one page rather than do
  render-path surgery on three more in the same pass.
- [ ] **P8.2 The real fix is upstream.** This is display-level repair of a
  normalisation bug in whatever writes `vectors.json`. Fixing it at source would
  make `name_fixes.json` unnecessary and correct all seventeen assets at once. I
  cannot run the pipeline, so it stays here.


## Finishing the hyphens, and the cache trap that came with it

Shipping the repair on one page of four was half a fix, and P8.1 was my own
deferred work filed as though it were a decision for someone else.

`assets/name-fix.js` now loads on `index.html`, `play.html` and `players.html`.
`trends.html` is deliberately not on the list — it repairs the names at the data
layer when it loads `eratwins.json`, which is strictly better than a text pass.

A text pass rather than surgery at each render site, because those three pages
build names from three different asset shapes across many render points in
minified inline script. Verified safe before shipping: **none of the thirty glued
spellings appears in any page's static markup**, so it only ever rewrites text
that came from data. The two occurrences anywhere near a page are inside my own
explanatory comment in `trends.html`, which a text-node walk never visits.

It terminates by construction — the replacement removes the glued spelling, so a
second pass matches nothing and queues no further mutation. That is exactly the
trap `keyboard-a11y.js` documents, where an observer wrote attributes
unconditionally and re-queued itself forever, and `scripts/smoke_name_fix.mjs`
asserts it: fifteen checks, built from the shipped regex rather than a restatement
of it, including all seven correct-as-written controls (VanVleet, McKie, DeRozan,
LeVert, LaVine, LeBron, DiVincenzo) and an explicit idempotence case.

### The module re-opened a gap I had deferred, so I closed it

`stamp_assets.py` only ever walked HTML. A live module with `fetch('assets/…')`
inside it therefore had an unversioned URL on a file served
`max-age=31536000, immutable` — a fresh instance of the exact trap the script
exists to prevent, created by my own change. It now stamps `assets/**/*.js`
too, **before** the pages, because a module's `?v=` token in the HTML is the hash
of the module file: rewrite a fetch inside it and that hash moves. Modules first,
pages second, and the fixed point lands in one pass — verified by running it twice
and getting `stamped 0 file(s)`, then `--check` clean.

That also retires the note that said stamping inside JS was only worth building
if P6.1 revived the dead modules. It was worth building the moment one live
module fetched anything. 43 distinct assets now tracked across 22 pages and 50
modules.


### What the stamper still does not reach, precisely

Module coverage is not total, and the board should not imply it is. Two
hand-numbered tokens survive:

    past-modern-game.js   scoring_lite_index.json        ?v=56
    shared-map.js         vectors_search_lite_pos.json   ?v=58

Both assign the URL to a variable and hand it to a wrapper rather than passing a
literal to etch(, so RE_FETCH does not see them. Broadening the pattern to
any ssets/*.json string in a .js file would also rewrite paths inside
comments and docs, which is a worse trade for two files that are both in the dead
46 and therefore fetch nothing today. Recorded rather than fixed. If P6.1 revives
either module, this becomes real and the pattern needs the wrapper case.

Everything reachable from a page is stamped: 43 distinct assets across 22 pages
and 50 modules, --check clean, and a second run is a no-op.


## The explainability page claimed a model that does not exist (2026-08-10)

Phase 3 of the brief is the model-explainability page, and it was the surface I
had verified least. Checking it the way the owner table got checked — do the
numbers on the page trace to the files the page names — found this pill row:

    MT v4 MHA 0.6847 wins 8.9    EH 0.92 wins 6.7

The first is real: `multi_tower_multitask_v4` in `assets/data/model_zoo_eval.json`
has `loss_final` 0.6847 and `wins_mae` 8.9, exactly.

**"EH 0.92 wins 6.7" has nothing behind it.** No committed asset pairs an "EH"
label with those figures; no file anywhere under `pipeline/` or `docs/` does
either; and 0.92 and 6.7 never co-occur in a single object in any asset. It is not
a rounding of anything — the nearest real multi-tower loss is 0.6745.

What makes it worse than an ordinary stale number: **wins MAE 6.7 would have been
the best result on the page**, beating the v4 model sitting immediately next to it
at 8.9. A reader comparing the two would conclude the invented model won.

Replaced with a real sibling that is in the same file — `multi_tower_multitask_v3`,
`loss_final` 0.6641, `wins_mae` 8.99 — so the row still shows a comparison, and
labelled the row with its source file. Both models' figures are now in `CITED`,
so the gate re-checks them on every run rather than trusting this reading.

`"EH 0.92 wins 6.7"` is pinned in `UNSOURCED`. Verified the trap in both
directions: putting the pill back fails three ways — `sourced` names it, and
`cited` catches the two real figures disappearing along with it.

I had my hands on this exact pill row earlier in this branch. `f9d9e7c8`
("I labelled the model zoo 'Unsourced'. That was wrong — correcting it") edited
it to fix a different mistake and walked straight past this one.

### A limit of the `cited` check, stated plainly

It matches verbatim. model.html prints `0.51` for a stored `0.5081` and `0.93`
for `0.9339` — correct roundings, and I checked all six against
`eval_scoreboard.json` by hand today (0.5081, 0.9339, 0.438, 0.757, 0.1962, and
10,104 eligible pairs all confirmed) — but a rounded string is not in the file, so
the gate cannot cover them. Those remain hand-verified. Extending `CITED` to carry
a JSON path and compare `round(value, 2)` would close it and is not built.


### Phase 4 audited by the same method — clean

Ran the model.html audit against the player-cards surface, because it was the
next-least-verified phase and this method had found something every time it was
pointed somewhere new. It came back clean, recorded so it is not re-derived:

- `player.html` states **2,293**, exactly the `wiki_index.json` count.
- `players.html` states **held-out top-5 0.76** and links it to
  `/dictionary.html#retrieval`. `eval_scoreboard.json` `by_split.test.top5` is
  0.757 — correct rounding, correct split, and correctly labelled *held-out*
  rather than overall.
- `dictionary.html` states **~13,000 candidates** against a corpus of 12,966,
  written with an explicit tilde; and **1.00** as the top of the cosine range,
  which is a definition, not a measurement. Its `0.7057` and `6.32` are the two
  known-unsourced figures the page exists to document — `sourced` passes them
  because they are disclaimed in place.

All five phases of the brief have now had this audit applied. It found the
`Math.random()` owner table and the three em-dash columns in phase 5, and the EH
pill in phase 3. Phases 1, 2 and 4 came back clean.


## "Free" was half the sentence and I only ever read the other half (2026-08-10)

The brief says **"make all pages free and accessible."** Across many turns I did
the accessibility work — focus rings on 16 pages, roving tabindex, sortable
tables by keyboard — and never once checked the word *free*. It was in the
instruction every single time.

Eight page-files quoted a price:

| where | what it said |
|---|---|
| `index.html` nav | `Owner $5k` · `Brand $2k` · `DFS $9` |
| `index.html` CTAs | `/owner $5k →` · `/player $19 →` · `/brand $2k →` · `/dfs $9 →` |
| `index.html` pills | `🏆 Owner • $5k trophy` · `👟 Player • $19 sneakers` · … |
| `index.html` copy | "Four **monetization** towers" |
| `owner.html` `<title>` | `Championship Economics $5k/$10k/$15k` |
| `owner.html` | `$5k Starter` · `$10k Pro` · `$15k Org` · `Stripe mock` · "Paywall $5k/$10k/$15k" |
| `brand.html` | `$2k CMO deck` · `$8k Pro` · `$25k Org` |
| `dfs.html` | `Free 3 / Pro $9 10 / $49 API` |

**Nothing is gated.** No auth, no entitlement check, no Stripe call anywhere in
the repo — the owner page's own copy calls it a "Stripe mock". Every page was
already free to use. What was not free was the description of it: a visitor was
quoted $5,000 for a page that costs nothing and asks for no account.

So removing the prices does not remove a feature. It makes the copy true. That is
why I treated it as a copy fix rather than a business decision — though if the
tiers are a real plan rather than aspiration, `scripts/make_free.py` is one commit
to revert.

24 replacements across 7 files, idempotent, `--check` mode. Seven of them were
found only by **re-scanning after applying**: my first pass deduplicated by matched
text, so a second `$5k` on the same page never printed, and the
`👟 Player • $19 sneakers` pill never matched the pattern at all. The edit list was
wrong and the verification caught it.

### `free` is now the tenth gate check

`RE_PRICING` is deliberately narrow, because this site is full of legitimate
dollar figures that must survive: franchise valuations (`$9.1B`), the 31-season
cap history (`$24.36M → $154.65M → $164.96M`), the `$24B` TV deal, payroll in the
owner table. It matches tier and subscription *shapes*, not dollar signs.

Verified both ways, including the false-positive direction: putting `Owner $5k`
back fails with context, and a paragraph of real valuations passes untouched.


## "Accessible" was the other half I only partly did (2026-08-10)

Last pass caught that I had read "free and accessible" and only ever acted on
*accessible*. This pass caught that I had only partly done that half too. I fixed
`:focus-visible` on 16 pages, called accessibility handled, and never checked
anything else.

`scripts/check_a11y.py` — ten criteria, all WCAG A/AA and all decidable from
markup — found **81 failures**:

| criterion | count | what |
|---|---|---|
| 1.3.1 | 17 | no `<main>` or `role=main` landmark |
| 1.3.1 | 14 | no `<h1>` at all |
| 1.3.1 | 41 | `<th>` with no `scope` |
| 3.3.2 | 4 | inputs whose only name was a placeholder |
| 4.1.2 | 1 | a link whose entire accessible name was `/` |
| 2.4.2 | 4 | duplicate `<title>` — see below, these were noise |

The persona pages had **no headings whatsoever** — `<div class="mono">Owner Lab
• …</div>` was doing the job visually and telling a screen reader nothing.

### Choices, each of which had a worse option

- **The `<h1>` is visually hidden, not promoted.** Promoting the styled div is the
  better semantic fix and I did not do it: I cannot see these pages, and promoting
  a styled element across 14 files is the same unreviewed visual change I removed
  a runtime 44px sweep for. A hidden `<h1>` from the page's own `<title>` is
  correct for a screen reader, invisible otherwise, and cheap to upgrade.
- **Its hiding style is inline, not a class.** Not every page defines `.vh-sr`, and
  a hidden heading that becomes visible because a class is missing is worse than
  no heading.
- **The fixer skips `<script>` blocks.** A first version reported 64 `th-scope`
  fixes against the audit's 41; the extra 23 were inside JavaScript template
  strings. Editing markup inside a JS string with a regex can produce something
  that still parses and still emits wrong HTML — a failure with no symptom.
- **The 4 duplicate titles were my check being wrong**, not the site: `brand.html`
  and `brand/index.html` are the same page and only one is served. The check now
  recognises mirror pairs.

### Two bugs I introduced fixing this, both caught by verification

1. **`<main>` straddled `</header>` on four pages.** My anchor rule was "open the
   landmark after `</nav>`", and on `inventory`, `leaderboard`, `methods` and
   `offline` the `<nav>` lives *inside* `<header>` — so `<main>` opened inside the
   header and `</header>` closed across it. Found by checking tag balance inside
   the inserted landmark, not by reading the diff.
2. **`index.html` ended up with `id="main"` twice** — it already had
   `<div class="grid" id="main">` as its skip-link target. The existing gate's
   `ids` check caught that one, which is the first time a check I wrote earlier in
   this branch caught a regression I introduced later in it.

Both fixed, both re-verified: 22/22 pages now have exactly one `<main>`, one
`</main>` and one `<h1>`, and the fixer is idempotent.

### What this does not cover, stated so it is not mistaken for coverage

Colour contrast, reading order, focus order and actual screen-reader flow need a
browser and a person. The audit prints that line every run rather than implying
the site is accessible because a static check passed.


## I declared contrast out of scope and it was arithmetic (2026-08-10)

Last pass I wrote, in a docstring and in the report, that colour contrast "needs
a browser and a person" — and left it. That was wrong. Every surface on this site
is an explicit hex token in a `:root` block, and the contrast ratio between two
known colours is a formula. What needs a person is deciding *which* pairs meet on
screen. Computing the ratio, once the pair is known, does not.

Same shape as the two misses before it: "free" I never read, "accessible" I only
half-did, contrast I ruled out of scope while it sat inside it.

### The first version of the check was mostly noise

77 findings, and most were nonsense: it paired every text colour with every
background the page declared, so it reported `.site-nav__brand` at **1.04:1**
against a `--void` token that element never sits on, and flagged offline.html's
`.sub` against paper when it lives inside a `#080A0F` card. A checker that cries
wolf on 65 pairs is worse than no checker.

Rebuilt in two tiers:

- **Tier 1 — fails the gate.** The rule declares both colour and background. No
  ambiguity. **12 real failures.**
- **Tier 2 — warns only.** The rule sets colour alone, so the true backdrop
  depends on nesting a static read cannot settle. Evaluated against the page's own
  `<body>` background and printed to check in a browser, never failed on.

### The 12 collapse to three pairs

    #fff    on #eb6834 orange   3.20:1   ->  #111 on orange        5.90:1
    #fff    on #2a78d6 blue     4.42:1   ->  #fff on #0072b2       5.19:1
    #eb6834 on #f0e442 yellow   2.42:1   ->  #111 on yellow       14.28:1

No new colour. `#0072b2` is `--okabe-blue`, already declared here and already used
for the focus ring, and ink-on-brand-colour is already the site's own pattern in
`.btn-y{background:var(--yellow);color:#111}`.

The text moved rather than the token because `--orange` and `--blue` are the
brand — borders, marks, chart series — where contrast against paper is not the
constraint. Retuning the token to satisfy one pill would restyle everything.

**The blue is the interesting one.** Neither `#fff` (4.42) nor `#111` (4.28)
clears 4.5:1 on `#2a78d6`. That pair cannot be fixed by changing the text at all,
which is why it is the only one where the background moved.


## "Everything centered around the embedding map" — never checked until now

That clause is the organising principle of the whole brief and I had treated it
as background rather than as a requirement. Checked:

**The map renders on 3 of 22 pages** — index, play, players. teams.html has a
canvas but it draws decorative rings, no map data. The 18 without it include
`trends.html`, whose entire subject is movement *through* that space, and
`model.html`, which explains the model that produces it.

Then the worse half. There were **seven distinct nav shapes** across 22 pages, and
one was a dead end: the nine persona pages — owner, brand, dfs, player-fit, player
and their `/index.html` twins — linked only to each other and to `/`. **From
`/owner` you could not reach the map, the game, trends, the model page, teams or
the dictionary.** `player-animations.html` had `<nav class="site-nav"
data-active="/player-animations"></nav>` — completely empty, because the module
meant to fill it is `assets/site-nav.js`, one of the dead 46.

So the brief was failing twice at once: not "world class UX throughout", and not
"centered around the map" when the map was unreachable from nine pages.

### The canonical set is the site's own, not mine

Six pages already used the same eight destinations — dictionary, model, player,
players, teams, trends. `scripts/fix_nav.py` brings the minority to that majority
convention rather than imposing a new one, ordered as the brief orders the phases:
Map, Play, Trends, Model, Explorer, Players, Teams, Dictionary.

**Additive, never a rewrite.** Each page styles nav links differently — `.pill`,
`.site-nav__link`, bare `<a>` — so it reads the class the page already uses and
appends only the missing destinations in that page's own idiom. Replacing nav
markup wholesale would have restyled nine pages I cannot see. The persona pages
keep their persona row and gain the rest. 78 links across 12 pages;
**22 of 22 pages now reach both the map and the game.**

`offline.html` is deliberately excluded: `sw.js` caches exactly
`['/', '/offline', '/manifest.json']`, so every other destination would be a dead
link in the one situation that page exists for.

### And offline.html was describing a service worker that no longer exists

It claimed **"CORE13 cached exactly"**, listed thirteen paths, and stamped
**"PWA v67"** in eight places. Reality is `const C = 'hoops-v7-2'` and three SHELL
entries.

**That staleness is mine.** sw.js used to list four entries, `cache.addAll()` is
atomic, and three of the four 404'd or redirected on the live site — so install
rejected and the worker never registered anywhere. I cut SHELL to the three paths
the site actually serves and added them individually. I never went back to the one
page whose entire job is describing that cache. Twelve claims corrected, including
a "this file 9663" byte count that was 9,965.

The thirteen-item list was aspirational even before my change — it named
`/leaderboard.html`, `/methods.html` and `/assets/icon-192.png`, which no version
of SHELL has ever contained.

- [x] **P9.1 DONE for trends.html** — see below. It was my own deferred work, filed as a board item, same as P8.1 was. Original note: This pass fixed *reachability*,
  not *presence*. `trends.html` in particular is about rotation, archetype drift,
  era twins and career arcs — all spatial, all currently shown as charts with no
  map beside them, while `assets/embedding_map_trajectories.json` (1,135,755 b) is
  already fetched by two other pages. Putting a real map there is a feature build,
  not an audit fix, which is why it is boarded rather than done in the same pass
  as a nav change.


## The map is on the page that was most about it (2026-08-10)

trends.html spent six sections describing movement through a space it never
showed. That is the "everything centered around the embedding map" clause going
unmet on the one page most about that space.

It now carries the archetype cloud, placed directly after the prevalence panels:
those say *when* each archetype was common, this says *where* it is.

### Three data choices, each settled against the files rather than by preference

- **`vectors_map_lite.json` — 4,322 player-seasons.** Used.
- **A season stepper — rejected.** `embedding_map_points_limited.json` carries
  seasons, but the sample runs **4 rows in 1998-99 and 12 in 2011-12 against 491
  in 2025-26**. Stepping through would show the league emptying in the lockout
  years, which is the sampling, not the league. That is the same class of
  misleading chart I removed from `/owner` earlier on this branch, so building it
  would have undone the point.
- **Era twins drawn on the map — rejected.** Only **12 of 1,308 pairs** have both
  sides in the cloud.

The two clouds were checked to share a projection before either was trusted:
per-archetype centroids agree to a worst distance of **0.015** in a 0..1 space,
and the `c` index means the same thing in both.

Colours are the `OKABE` constant `players.html` already uses; names come from
`assets/mtnn_arch.json`, not written here — the same rule that page states, which
refuses to invent an archetype name to fill its key.

### The risk here was never syntax

`node --check` proves a block parses. It cannot prove a name resolves, and `$` and
`say` are both declared inside *other* IIFEs in that same script block. A
`ReferenceError` at load would have taken down every section above it. Rather than
reason about brace depth, the new IIFE declares its own four lines and does not
care.

`scripts/smoke_arch_map.mjs` then runs the **shipped** IIFE — extracted verbatim,
under a DOM stub, against the real files. Fourteen checks: it executes without a
ReferenceError, the canvas gets `role="img"` and a real label, all eight names
reach the legend, nine filter buttons with exactly one pressed, every `<th>`
declares scope, **shares sum to 100.00% and counts sum to 4,322 exactly**, and the
method text states the projection caveat and why there is no season stepper.

Map data now renders on **4 root pages**, up from 3.

- [x] **P9.2 DONE for model.html** — the candidate it named. Original note: Reachability is fixed
  everywhere; presence is not. `model.html` is the strongest remaining candidate —
  it explains the model that produces the space and shows no picture of it.
  Deliberately not bundled: one feature build per pass.


## The score the model page quotes, now drawn (2026-08-10)

model.html stated the headline retrieval score in prose and never showed the space
that score is about — phase 3 of the brief being the explainability page, and the
map being what everything is meant to centre on.

### The trap this section exists to not fall into

The scoreboard's top-1 and top-5 are **64-d cosine over 10,104 pairs**. Ranking
neighbours by distance in a 2-D projection is a different measurement with a
different answer, and putting a rank on screen would have been the same species of
mistake as the `Math.random()` owner table: a number that looks like the model
speaking and is not.

So **nothing here computes a rank.** The picture shows what the task *is* — one
career, season by season, through the space — and every figure beside it is read
from `assets/eval_scoreboard.json` at render time. `smoke_retrieval_map.mjs`
asserts that absence directly, by grepping the shipped source for distance
arithmetic.

### A quiet win

The page used to hardcode `0.51 / 0.93 / 0.20 / 10,104` in prose. The new section
reads all four from the file, so those cannot drift — which is exactly the gap
P7.2 recorded, where `cited` cannot verify a rounded figure because the rounded
string is not in the file.

### Data

`embedding_map_trajectories.json` alone carries **12,038 points across 1,764
careers**, so one file gives both the faint background cloud and the paths.
`embedding_map_points_limited.json` is fetched only for names — it holds exactly
one row per player and cannot supply a path, which is worth writing down because
it is not obvious from its name. 1.4 MB total, so it loads on approach behind an
`IntersectionObserver`, the pattern trends.html already uses for era twins.

### A vestigial CSS rule that would have hidden the whole thing

model.html still carries a bare `canvas{…}` rule painting `height:160px` and a
`#0A0C10` background with two radial gradients. `#retrMap` is now the only canvas
on the page, so the rule is left over from one that no longer exists — but it
still applies. The faint grey cloud and the near-black last-season dot are chosen
for a light surface and would have been invisible on it. Overridden explicitly
rather than left to specificity.

Map data now renders on **5 root pages**, up from 3 two passes ago.

- [ ] **P9.3 Thirteen root pages still have no map**, and the remaining candidates
  are weaker than the two just done: the persona pages are dashboards, the
  dictionary defines terms, methods and inventory are reference. Whether any of
  them wants one is a product judgement rather than a gap, so this is a decision
  rather than a task.


## Target size: I deferred it as unverifiable, and had the wrong criterion (2026-08-10)

P6.2 said target size was "an unreviewed visual change" and left it. Two things
were wrong with that.

**The criterion.** I filed it against WCAG **2.5.5**, which is AAA and asks for
44px — the number the runtime sweep was forcing, and a fair thing to refuse.
**2.5.8 Target Size (Minimum) is AA in WCAG 2.2 and asks for 24.** A site claiming
accessibility has to clear 24, and my ten-criterion audit did not check it at all.

**"Unverifiable."** Ten interactive rules on this site declare a height, and all
ten already clear 24 — 26, 28, 40, 44 x6, 74. That part was always checkable, and
is now checked.

The 120 rules that declare no height needed an estimate: padding + font-size x
line-height + borders. My first pass assumed line-height 1.5 and found nothing,
which was **backwards** — a larger line-height inflates the estimate toward
passing. Browsers render `normal` at roughly 1.2. Redone at 1.2, two controls fell
under, both on the page the brief puts first:

    play.html  .chip         4+4 padding, 10.5px text, 1.3px borders  ~23.2px
    play.html  .season-chip  4+4 padding, 10.2px text, 1.3px borders  ~22.8px

`.season-chip` was missed on the first sweep because the pattern was `\.chip`,
which does not match `-chip`. The gate's selector list now says `chip`.

**Both fixes are one pixel.** That is the whole reason they ship: the sweep I
removed earlier forced 46 elements on this page from their designed size to 44px,
and refusing that was right. Going 23.2 to 24 is not the same decision.
`align-items:center` comes with it so the text sits centred in the very slightly
taller box.

`target-size` is now the eleventh check in `check_a11y.py`, and only ever fails on
a **declared** height — reporting an estimate as a failure is what made the first
contrast pass produce 65 findings that were not real. Verified in both directions;
the failure message names the selector, which took a second pass because the CSS
rule regex was reporting the comment above the rule as the selector.


## The one failure the error boundary could never see (2026-08-10)

P6.3 sat on the board reading *"moving it to `<head>` is a bigger change than it
is worth without a reason."* The reason was `9a0a4481`, the first defect this
branch found:

    b.onclick=()=>{...}c.appendChild(b);

No semicolon, no line break, so index.html's **entire inline script was a
SyntaxError and never ran** — on production, for an unknown length of time, with
nothing to notice. `assets/error-boundary.js` was already in the repo and would
have recorded it, except a listener only sees errors from scripts parsed *after*
it is installed, and the boundary loads at the end of `<body>`. Checked rather
than assumed: on index, play, trends, model, teams and players **the first script
on the page is the page's own inline block**. The one class of failure that takes
a whole page down was the one class the boundary structurally could not see.

**Not solved by moving the file.** A 10 KB blocking script in `<head>` to catch a
rare failure is a bad trade. `scripts/fix_early_errors.py` inserts **692 bytes**
inline instead, immediately after `<meta charset>` — that position because the
charset declaration has to stay inside the first 1024 bytes. It only queues.
`error-boundary.js` drains the queue on load and logs each entry the way it logs
anything else: localStorage, capped at 50, no external telemetry.

After draining, the queue is swapped for a no-op sink. The boundary has installed
its own listeners by then, so leaving a live array would both double-log every
later error and grow without a cap.

`scripts/smoke_early_errors.mjs` proves the chain rather than the pieces: it takes
the hook **out of the shipped index.html**, fires the exact failure shape that
started this — a SyntaxError with a filename and line — then loads the real
`error-boundary.js` and checks the error came out the other side. Nine checks, and
the one that matters reads *"the SyntaxError is there with its line"*.

- [ ] **P9.4 `player-animations.html` loads a third-party script from a CDN**:
  `https://unpkg.com/posecode-embed@0.1.0/dist/posecode-embed.js`, in `<head>`,
  and it is the only external script on the site. It sits against the repo's
  zero-deps doctrine, it is a third party that can see every visitor to that page,
  and it cannot work offline. Self-host, drop the feature, or accept it knowingly
  — all three are decisions rather than fixes, so it is recorded, not changed.


## What each page downloads before it works (2026-08-10)

"World class SOTA UX" has one measurement that needs no taste: bytes on the wire
before a page is usable. I had never measured it, having lazy-loaded 1.4 MB on
model.html for exactly that reason and then not checked anything else.

### The analyzer was wrong twice, and reading the code settled it

First pass called index.html a **5.2 MB landing page**. It is not. Its 3.8 MB
`vectors.json` sits inside `loadFull()`, which runs only on `?full=1`, and its
1.1 MB trajectory file sits in a lazy cache called on interaction. The landing
page is about **312 KB** and already does limited-first with opt-in detail —
better than what I was about to "fix".

Second pass, taught to resolve call sites, then misread model.html's
IntersectionObserver-deferred 1.4 MB as eager, because it models named functions
and not anonymous IIFE bodies. Two wrong answers in a row is the signal to stop
refining a general analyzer and read the four pages that mattered.

### The real finding, and it was mine

    /owner   1,155,807 b on load   front_office.json, no gate
    /teams   1,272,076 b on load   front_office.json + chemistry + deadline, no gate
    /trends    189,455 b on load   the archetype map cloud, on a page already deferring

All three are mine. I rebuilt the owner table to read real data instead of
`Math.random()` and pointed it at the full file without looking at the cost;
model.html got an observer for the same problem and these did not.

### assets/front_office_lite.json

`front_office.json` is 1,127,784 bytes and carries draft pick histories, cap
rules, per-season valuations and the model zoo — all read by *other* pages. The
owner table reads fourteen fields per team; teams.html adds two more and three
nested `.score` blocks, plus six top-level keys including the method text it
prints verbatim. Checked against both pages rather than guessed.

`scripts/build_front_office_lite.py` emits exactly that union: **17,461 bytes,
98.5% smaller, zero value mismatches** against the full file, with `--check` and a
refusal to write a table with holes.

    /owner   1,155,807 -> 45,490    -96%
    /teams   1,272,076 -> 161,759   -87%
    /trends  archetype cloud now behind the same observer era twins already used

`smoke_owner_table.mjs` now resolves the file **from the page's own fetch call**
rather than a path written in the test. A hardcoded path would have gone on
validating `front_office.json` after the page stopped opening it — passing while
proving nothing. It reads the lite file now and prints identical rows.

- [x] **P9.5 DONE.** Deferred behind the same observer the archetype map and the era twins use; /teams now loads 45,490 b on paint. It was my own deferred work filed as a judgement call, the same as P6.2, P6.3, P8.1, P9.1 and P9.2 before it, and the last such item on this board. Original note: The section that
  uses it sits well below the fold, so it is a candidate for the same observer,
  but the page now loads 161,759 b total and this is the last two-thirds of it.
  Small enough that it is a judgement call rather than a defect.


## /teams finished the job /owner started (2026-08-10)

The slim asset took /teams from 1,272,076 to 161,759 bytes on paint. Two thirds of
what was left was chemistry.json at 105,336, feeding a card that sits below the
front-office table, next to deadline.json at another 10,933.

Both now load behind the observer the archetype map and the era twins already
used, gated on the dlH heading with a 320px margin, with a plain call as the
fallback where IntersectionObserver is missing.

    /teams   1,272,076  ->  45,490 b on paint      -96.4%
    /owner   1,155,807  ->  45,490 b on paint      -96.1%

Both pages now load the same four things: ront_office_lite.json and the three
shared utility modules. Nothing else is fetched until a reader scrolls to it.

That was the last item on this board that was mine. Every remaining one needs a
person: six are operator decisions, one is blocked behind a pipeline I am not
allowed to run, and two are product judgements.


## Nobody had checked this on a phone (2026-08-10)

Every check on this branch so far looked at a desktop-shaped page. Most visits to
a site like this are not.

`scripts/check_responsive.py` — viewport meta, elements declared wider than a
360px screen, and tables with no scrollable ancestor. Two real failures, both in
tables I built:

- **`/owner`** — the nine-column FOR table sat in a plain `.card` with no
  overflow container at all. On a phone it dragged the whole page sideways.
- **`model.html #zooTable`** — every cell is `white-space:nowrap` across ten
  columns, and the container declared no `overflow-x`. Guaranteed to overflow.

Both wrapped the way every other wide table here already is.

### The checker was wrong twice before it was right

**Thirteen findings on the first run, eleven of them false.** It compared CSS
selectors to decide whether something was wrapped, and a stylesheet cannot say
what contains what: `#retrMap` is inside `#retrWrap`, `#archMap` and `svg.chart`
inside `.figwrap`, `#foTable` inside `#foWrap` — all correctly wrapped, all
reported. It also demanded the literal string `overflow-x` and so missed the
`overflow:auto` containers on inventory and teams, missed `.tablewrap` on
player.html, and read `<table>` inside a JavaScript string as if it were markup.

Rewritten to resolve wrappers from the **markup** — walk back through opening
tags for one that declares overflow inline or carries a class the stylesheet gives
overflow to. Then narrowed again: three and four column tables wrap and compress,
which is the ordinary responsive case, so only six-or-more columns or nowrap cells
are reported.

That is the same shape as the first contrast pass, which produced 65 findings that
were not real. A checker that cries wolf is worse than no checker, and the cost of
getting there is two rewrites before anything gets committed.

Verified both directions: unwrapping the owner table reports it by column count,
stripping a viewport meta reports that page, and both clear when restored.

**What this does not cover, said plainly:** it reads what is declared. Real
layout, text wrapping and tap ergonomics need a device, and nothing on this branch
has ever been opened in a browser.


## The site has now actually been opened (2026-08-10)

Last pass I wrote that nothing on this branch had ever been rendered in a browser
— that every gate here was static analysis plus node stubs with a DOM I wrote
myself, and that this was the honest boundary of ninety-odd commits. It was, and
it did not have to be.

`scripts/smoke_render.py` serves `public/` — the directory Vercel actually
publishes — over loopback, drives headless Chrome at it, and reads the DOM after
the page's JavaScript has run and its fetches have settled. **No installs:**
Chrome and Edge both ship on this machine, `http.server` is stdlib. The server
binds 127.0.0.1 and is always shut down; the browser profile lives in the system
temp directory, not the repo.

**Eight pages render with their content filled in.** `/owner/` draws
`<tr title="Boston Celtics">…BOS…56…66.80…$129.33M…78.10 A+`, `/teams.html` has
all 30, and `/trends.html` comes back at 159,857 bytes with its observer-gated
archetype legend populated — so the deferral works *and* still loads.

### The test was wrong before it was right, for the third time this session

First run reported two failures: `/owner/` "still showing Loading 30 teams" and
`/teams.html` "never rendered Boston Celtics". **Both were my test.**

`--dump-dom` returns the whole document, `<script>` elements included. "Loading 30
teams" was matching the `tb.innerHTML` placeholder *inside the script that
replaces it*, and "Could not load" was the text of a catch branch that never ran.
The table had rendered perfectly the whole time — I only saw that by dumping the
DOM to a file and reading it instead of theorising about virtual time budgets.
teams.html renders `BOS`, never the club name, so that assertion was simply wrong.

Assertions now run against the DOM with script elements stripped. That is the
same lesson as the contrast checker's 65 unreal findings and the responsive
checker's eleven: **a first-run failure list is a hypothesis, not a finding.**

### One thing the harness surfaced about the real site

`/offline` returns 404 from a plain static server. On Vercel it does not, because
`vercel.json` rewrites `/offline` to `/offline.html` — and `sw.js` caches exactly
`['/', '/offline', '/manifest.json']`. So offline support depends on that rewrite
existing. It does today. Worth knowing that deleting one line of `vercel.json`
would silently break the service worker's install.


## Looked at it, and misread what I saw (2026-08-10)

Having a browser bought two things nothing else could: the console, and my own
eyes on the page.

**The console is clean.** All eight pages, zero errors or warnings from the site
itself. `smoke_render.py` now fails on any, with two known harness lines filtered:
`favicon.ico` 404s, and `sw: skipped /offline` — which only appears because a
plain static server does not apply vercel.json's rewrite, and which is itself
proof that `596a4001` works, since each SHELL entry is added with its own catch
and one bad path degrades the shell instead of rejecting install.

**The page looks good.** trends.html reads cleanly at desktop width: the 8.38°
hero lands, the rotation chart is legible, the eight archetype panels are
readable, the axis-drift bars are properly scaled.

### And then I misread a screenshot

A 390px capture of /owner appeared to show the nav running off the edge and the
headline clipped mid-word. I diagnosed it, wrote a fix, applied it to 18 pages —
and the re-shot screenshot came back byte-identical, which is what made me
measure instead of look.

**Headless Chrome clamps the viewport to 497px on this machine.** Requesting 320,
360 or 390 all render at 497. So the "phone screenshot" was a 390px crop of a
497px layout, and the clipping was the crop.

Measured properly, with a probe served from a copy so the repo was never touched:

    /owner/   scrollWidth 497  clientWidth 497  elements past the edge: 0
    /         scrollWidth 497  clientWidth 497  elements past the edge: 0

No overflow at all at the narrowest width this harness can produce.

### What I kept, and why

The two changes were not fixing an observed defect, and I am not going to claim
they were. They are kept because the underlying fragility is real:
**eighteen pages declared `nav{display:flex}` with no `flex-wrap` while carrying
up to twelve links**, seven of which `fix_nav.py` appended to the persona pages.
At a true 360px width those clip. `flex-wrap` and `overflow-wrap:break-word` are
both inert when content already fits, so the cost is nothing and the protection
is real.

`check_responsive.py` gained the check that *should* have found this — a flex nav
of six or more links that cannot wrap. Verified both ways.

### One thing I did not change

The axis-drift bars looked empty in the screenshot. They are not: the rendered
DOM has them at 100%, 84.4%, 52% and 42.2%, correctly scaled to the maximum. An
11px blue fill is just hard to read in a downscaled image. Checked before
"fixing".

- [x] **P9.6 DONE.** Written, and it found three real bugs. Original note: Headless `--window-size` clamps
  there; a true phone viewport needs `Emulation.setDeviceMetricsOverride` over the
  DevTools protocol, which means a CDP client. Everything narrower than 497 is
  covered only by the static checks.


## Three pages did not fit on a phone (2026-08-10)

P9.6 said a true phone viewport needed `Emulation.setDeviceMetricsOverride` over
the DevTools protocol, which meant a WebSocket client, which Python's standard
library does not have. That was the whole blocker, and it was worth eighty lines:
`scripts/check_viewport.py` carries a minimal WebSocket implementation —
handshake, masked client frames, frame decoder — so the repo keeps its zero-deps
doctrine and still gets real device emulation.

**Measured at 320, 360 and 390px, three pages overflowed sideways:**

    /teams.html   scrollWidth 579 vs 360   +219px, and constant at every width
    /model.html   scrollWidth 450 vs 360   +90px
    /play.html    scrollWidth 392 vs 360   +32px

None of this was findable statically. `check_responsive.py` reads declared widths
and wrappers; every one of these came from computed layout.

### Two of the three were the same trap

`div.card w=567 minw=auto` inside `div.grid w=336`. **A grid item defaults to
`min-width:auto` and will not shrink below its widest content.** teams.html's
media query collapsed `.grid` to one column and the item still held 567px, which
is why the number never moved as the viewport narrowed. model.html had it too, in
`.grid2`, where a long `assets/…` path inside a `<code>` set the floor.

`.grid>*{min-width:0}` and `.grid2>*{min-width:0}` fix both. play.html was
simpler: `.brand` is a flex row of pills with no `flex-wrap`.

The browser named all of it — I asked it for the widest uncontained element and
its ancestor chain with computed `min-width`, `overflow-x` and `display`, rather
than reading CSS and guessing. Two rounds of that: the first pointed at
`#foTable` at 760px, which turned out to be correctly contained inside
`#foWrap{overflow-x:auto}` with `.card{overflow-x:hidden}` above it. The probe
now skips anything inside a scrollable ancestor, because the page-level question
is `scrollWidth` against `clientWidth` and nothing else.

**All seven pages now fit at 320, 360 and 390 with nothing past the edge.**


## Two more pages did not fit, and one threshold was wrong (2026-08-10)

The viewport check covered seven pages and three of them had failed, so the other
fifteen had no business being assumed fine. Extended it to all eighteen the site
serves. Two more overflowed:

    /methods.html    scrollWidth 647 vs 360
    /inventory.html  scrollWidth 645 vs 360

Both the same trap as teams and model, confirmed by asking the browser rather than
reading CSS: `div.card min-width=auto` inside a `display:grid` parent. That is now
**four pages** with the identical bug, so the fix went on `.card` itself — a card
is usually a grid item, and a grid item that cannot go below `min-width:auto` will
not shrink to its column however narrow the screen gets.

`--explain` is now a flag rather than a one-off script: give it a path and it
names the widest uncontained element and walks its ancestor chain with computed
`min-width`, `overflow-x` and `display`. That is what found all four.

### And then methods.html was still wrong

647 dropped to 500, not 360. The remaining cause was a **four-column table** with
no scroll wrapper — which `check_responsive.py` had deliberately exempted, on my
reasoning that "three and four column tables wrap and compress, which is the
ordinary responsive case."

That reasoning was wrong, and the browser is what proved it. `WIDE_TABLE_COLS`
is now 4. The static check is the cheap pre-filter; `check_viewport.py` is the
authority, because it measures instead of inferring.

**All eighteen served pages now fit at 320, 360 and 390 with nothing past the
edge.**

Worth noting for whoever runs this next: eighteen pages across three widths takes
longer than two minutes, so run it one width at a time.


## Sixteen pages had no way past the navigation (2026-08-10)

`check_a11y.py` printed "focus order still needs a browser and a person" on every
run. Half of that was true. The mechanical half was not, and going to check it
found something bigger first.

**Six of twenty-two pages had a working skip link.** WCAG 2.4.1 Bypass Blocks,
Level A. On the other sixteen a keyboard user tabs through the entire navigation —
twelve links on the persona pages, after `fix_nav.py` added seven to make the map
reachable — before reaching any content, on every page, every time. I made that
nav longer and never asked what it cost someone tabbing.

**play.html was worse than missing:** it carried skip-link text pointing at
`#main` while its `<main>` had no id at all. The link went nowhere.

`scripts/fix_skip_link.py` copies the pattern the six working pages already use
rather than inventing one, and the part that is easy to leave out is
`tabindex="-1"` on the target: without it the anchor scrolls but focus stays put,
so the next Tab goes back into the navigation and the link has achieved nothing.
Where a page already used `id="main"` on something else — index.html has
`<div class="grid" id="main">` — that element is made focusable rather than having
the id moved out from under whatever points at it. **22 of 22 now.**

### And then the focus test itself

`scripts/check_focus.py` presses Tab through a real browser and asks what has
focus after each press: the first stop is the skip link, activating it moves focus
into `main`, focus never jumps backwards, never fails to move, and every stop
computes a real outline or shadow.

Seven pages, all clean — and it confirms the fix rather than assuming it:
**activating the skip link on /teams.html lands focus on `main`.**

It was wrong first, of course. It called every page a focus trap, because it used
the CSS class as element identity and a nav is a row of twelve consecutive
`.pill` links. Identity is the element's document position now. That is the fourth
checker this session whose first run was a false alarm, which is starting to look
less like bad luck and more like the cost of writing a check and a fix in the same
breath.

The caveat `check_a11y.py` prints is narrower now, and honest: contrast, focus
order, skip links and phone widths all have a tool. Whether the reading order
*makes sense* still needs a person.


## The focus check was testing the label, not the behaviour (2026-08-10)

Extended `check_focus.py` from seven pages to all eighteen, on the lesson the
viewport check taught: sampling seven of them had missed two failures. One page
came back red.

**/players.html — and both halves of it were mine.**

The check asserted `class="vh-skip"` on the first Tab stop. players.html landed
on `.pl-skip`, which is a perfectly good skip link. So the check was wrong. But
going to look at why the class differed turned up the real bug: the page had
**two** skip links. `fix_skip_link.py` looks for `class="vh-skip"` before adding
one, players.html already injected its own from earlier a11y work, so the fixer
could not see it and stacked a second one on top. The JS-injected one won,
because it goes in at `body.firstChild`.

Checking the name rather than the behaviour got both halves wrong at once — it
failed a page that worked, and it caused the defect it failed the page for.

Both now decide by behaviour. The check asks whether the first stop is an anchor
whose fragment resolves to an element that is, contains, or sits inside the main
landmark, and can take focus — and it names which of those failed. The fixer
asks whether the page has an anchor to a fragment whose text starts with "skip",
in the markup or built by a script. **22 of 22 detected, 0 missed.**

The removal on players.html needed care: the injection is the last nine lines of
an IIFE that otherwise holds the keyboard orbit controls for the map. Only the
tail came out. Its target was `.wrap` first anyway, so it was setting
`id="pl-main"` on the wrapper rather than on `<main>` — while a static
`<main id="main" tabindex="-1">` already sat right there. The static link is the
better one to keep: it works with JavaScript off.

### Then player-animations.html failed, and that was wrong too

Two traps and four elements with no focus indicator. Before fixing anything I
asked the browser what `posecode-player` actually is:

    8 elements, all with an open shadowRoot, each holding a button and a link
    delegatesFocus: false, no tabindex on the host

`document.activeElement` stops at the shadow host. So every Tab inside one
component reported the same element — a trap that was not there — and the focus
ring was computed on the host instead of on the control that had focus. **16
focusable controls the check had never once looked at.**

It follows focus into open shadow roots now. Document order became a path —
`[host position, position inside its shadow root, …]` — which compares
lexicographically, so shadow-encapsulated stops get distinct, correctly ordered
identities. player-animations.html passes with `in-shadow=4`, and those four
stops have real focus rings, which the component ships and this now confirms
rather than assumes.

**All eighteen served pages: skip link first, no traps, no backward jumps, every
stop visibly focused.**

That is the sixth checker this session whose first run on new ground was a false
alarm — contrast, responsive, render, viewport, focus-trap, and now shadow DOM.
The pattern in all six is the same: the check read a proxy for the thing (a
selector, a literal string, a class name, a host element) instead of the thing.
Asking the browser what is true costs one probe script and has been right every
time.

### For P9.4, the unpkg question

Evidence rather than opinion: the component contributes 8 shadow roots and 16
focusable controls, all of which carry their own focus rings and tab in document
order. Whatever is decided about the external dependency, it is not currently an
accessibility problem.


## Nothing had ever played the game (2026-08-10)

Eight checkers on this repo: structure, contrast, focus order, phone widths,
weight, console cleanliness, rendering, tab order. Every one of them tests how
the site is *built*. The brief puts gameplay first, and the closest thing to
coverage it had was `smoke_render.py` visiting /play.html and asserting the
string "DUMB MODEL" appears somewhere in the DOM.

So `scripts/smoke_play.py` plays a round. It found two defects, both of which had
been shipping, and neither of which produces a single line of console output.

### The map the game is played on was drawing the cloud and nothing else

`installRealMap` draws the target crosshair, your guess ring, and a dashed line
between them, behind this guard:

    if(poolObj && typeof poolObj.x==='number'){ ... }

The pool rows had no `x`. Fields were `i,n,v,pid`. So the guard was false every
time and the draw was skipped **silently** — you got a 4,322-point cloud with
nothing marked on it. The comment sitting directly above that code calls the
guess-to-target line "the whole point of playing on a map rather than beside
one," and it had never once been drawn.

### And a correct guess scored nothing

    function synthTraj(poolObj,n=6){let bx=(poolObj.xy[0]*0.5+0.5), ...

`poolObj.xy` is also absent, so this threw `Cannot read properties of undefined
(reading '0')` — inside `animateCareer`'s promise chain, where it surfaced as an
**unhandled rejection** rather than an error anyone would see. A guess above the
0.76 threshold went into `animateCareer(...).then(() => { idx++; ... })`, the
chain rejected, `idx` never incremented, and the pack stopped advancing. Answer
correctly and the game quietly stops.

### One root cause, two field names, neither of them present

`const POOL` and `const MODERN` are hardcoded fallback rows: 3-dimension vectors
with `xy` pairs in [-1,1]. The real pool replaces them from
`assets/game_vectors.json` — 14-dimension vectors with `x` and `y` scalars in
[0,1]. Every row in that file already carries `x`, `y`, `z` and `c`. The loader
just dropped them on the floor:

    past.forEach(function(p){ POOL.push({i:p.i,n:p.n+' '+p.s,v:p.v,pid:String(p.i)}); });

The drawing code was written against one shape, the loader against the other, and
nothing in between ever compared them. `x`, `y` and `c` now come along, and
`synthTraj` accepts either shape rather than assuming the one the real data does
not use. No new asset, no pipeline run — the coordinates were already committed
and already being fetched.

**Measured before and after, same seed, same question:**

    fields      i,n,v,pid              ->  i,n,v,pid,x,y,c
    map coords  (None, None)           ->  (0.7181, 0.2747)
    canvas ink  9,592 px               ->  10,117 px
    winning guess  unhandled rejection ->  scores and advances the pack

Those 525 pixels are the crosshair, the ring and the line.

### What the test does, and what it refuses to do

Nothing in it is pinned to a player or a score. The pack is date-seeded, so a
fixture would rot overnight; both guesses are derived in-page from the pool that
actually loaded — argmax cosine for a guaranteed hit, argmin for a guaranteed
miss. The miss path had never run under any gate, and it is the one that touches
`pulseRing2()` and `#play-a-101`.

Both wirings get exercised: Enter on the input for one guess, the Go button for
the other, dispatched as real key and mouse events. Calling `guess()` directly
would pass with every listener unhooked.

The map assertion counts non-background pixels on the canvas rather than trusting
the fetch. That is the only way to catch a guard that skips silently — the fetch
succeeding tells you nothing about whether anything was drawn with it.

Two false starts, both mine and both worth writing down: `JSON.stringify` drops
keys whose value is `undefined`, so the missing coordinate vanished into a
`KeyError` instead of arriving as the finding it was — the probe now emits
explicit nulls. And a Windows console is cp1252, so the test died encoding the
`◐` in the very readout it was checking.


## Fixing the crash uncovered what the crash had been hiding (2026-08-10)

The commit above stopped `synthTraj` throwing. That was right, and it immediately
made a worse problem visible: with the throw gone, **the synthesised trajectory
actually rendered**. It invents its seasons — `1996-97` through `2002-03` — and
its teams, `SA0` to `SA6`. Win on Ja Morant 2024-25 and the game drew you a
career starting in 1996.

That is the same class as the `Math.random()` columns on /owner and the `EH 0.92`
row on the model page, both removed earlier this session: a number with no source
presented as if it had one. The crash had been hiding it.

### Why it was the default, not the edge case

    trajectory cache keys:  2544, 101108, 201143, 200768, ...   NBA player_ids
    what the loader wrote:  pid: String(p.i)                    vectors.json row index

`animateCareer` resolves `gPid = guessObj.pid || findPid(guessObj.n) || ''`.
`findPid` exists for exactly this join — it normalises a name and looks it up in
the 1,814-player manifest. But `pid` was always truthy, so the `||` never fell
through and **findPid was dead code on the real pool**. Row indices were then
looked up against player_id keys.

**52 of 2,149 ids collide by coincidence.** Everything else missed the cache. So
close to 98% of wins drew an invented career, and the four seasons of it that
were real were an accident.

The loader simply does not write `pid` now. The row index is already in `i`,
where it belongs, and leaving `pid` off is what lets the manifest join run. The
target used `targetObj.i` as its second lookup, the same row-index-against-
player_id mistake, and now uses `findPid` too.

**Measured across the whole pool, replicating findPid offline:**

    past      968 rows | findPid resolves 968 (100.0%) | in cache 968 (100.0%)
    modern  1,305 rows | findPid resolves 1,301 (99.7%) | in cache 1,301 (99.7%)

2,269 of 2,273 rows now animate a real season-by-season path. The four that do
not are labelled rather than fabricated: where either side falls back to
`synthTraj`, the season chips are replaced by one that says *illustrative path —
no season-by-season track for <player>*. Invented seasons never print as real
ones again.

### The test now checks what the animation drew

`smoke_play.py` verified the pack advanced. It never looked at what appeared
while it advanced, which is exactly how this got through the commit before it. It
now reads `#trajChips` and requires either seasons in the guessed player's era or
an explicit illustrative label. On the current seed: **18 seasons, 2008-2025**,
for a Westbrook 2010-11 question answered with Ja Morant 2024-25.

Two of my own mistakes on the way, both caught by the test rather than by
reading: I scoped `allSeasons` inside the new else-branch while the animation
frame still uses it to highlight the current season, which threw a
`ReferenceError` — and then the assertion itself was wrong, because season chips
render with no separator, so the text arrives as `2008-092009-102010-11...` and a
word-boundary year pattern only ever matches the first one. That is the seventh
check this session whose first run was a false alarm, and the second time in two
commits that the fix and the check needed fixing together.


## The autocomplete was wired to an empty list (2026-08-10)

The whole game is one text box. You read a past player and type the modern one
you think matches. That box is:

    <input id=guess list=guessList autocomplete=off placeholder="type modern twin: Butler, Ant...">
    <datalist id=guessList></datalist>

**Nothing ever put an option in it.** Three occurrences of `guessList` in the
file: the `list=` attribute, the opening tag, the closing tag. The control
advertised suggestions and had none, against a pool of 1,305 modern seasons a
player has no way to enumerate.

That is worse than a plain text box, because `pickModern` falls through to a
substring match:

    if(n===g) return MODERN[i];
    if(!prefix&&n.indexOf(g)===0) prefix=MODERN[i];
    if(!sub&&n.indexOf(g)>=0) sub=MODERN[i];

A half-remembered name usually resolves to *something*. You get scored against a
player you did not mean to name, and nothing tells you that happened. The "did
you mean" list only appears when nothing matched at all, which is the rare case.

`fillGuessList()` builds the options from `MODERN` itself rather than a written
list, so it always describes the pool that actually loaded — the placeholder rows
before the fetch lands or if it fails, all 1,305 after. One `DocumentFragment`,
one reflow. **1,305 of 1,305 offered.**

Same shape as the two defects before it: the loader replaced the pool and left
everything that surfaces the pool pointing at the old, empty, or wrong thing.
That is three in a row now — coordinates dropped, trajectory ids mismatched,
suggestions never filled — all from the same swap, and none of them detectable
without running the page.

### The measurement was racing the paint

`smoke_play.py` read the canvas once after load. Same page, unrelated edit:
**10,117 non-background pixels on one run, 5,182 on the next.** The cloud arrives
from a fetch and repaints when it lands, so a single read is a race, and a number
that moves like that cannot be asserted on. It now waits for two equal
consecutive reads. Three runs, 10,117 every time.

### And the id check could not tell a quotation from a declaration

`check_frontend.py` failed with `play.html defines id=guess 2 times`. It does
not. The second one was inside the comment I had just written to explain the
fix — a comment quoting `<input id=guess list=guessList>` reads as a declaration
to a regex.

Stripping `<!-- -->` and `/* */` before extracting ids is the fix; `//` is left
alone, because it would eat the rest of any line containing `https://`. Verified
it still catches a real duplicate rather than being quietly disarmed:

    real duplicate           ids=['dup','dup','guess','guessList']  duplicates={'dup': 2}
    quoted in block comment  ids=['guess','guessList']              duplicates=none
    quoted in html comment   ids=['dup']                            duplicates=none


### The same strip, applied where it hides failures instead of inventing them

`without_comments` went into `check_ids` because a comment quoting markup was
being counted as a declaration. The `targets` check reads ids and classes from
the same raw text, and there it points the other way: an id that exists **only**
inside a comment would let a `getElementById` for a target that is not on the
page report as resolving. Inventing a failure wastes time; hiding one ships.

Both now read stripped markup. **164 DOM lookups still resolve on both roots** —
nothing on this site was leaning on a comment-declared target, which is the
answer I wanted and not one I could have assumed.

- [ ] **P9.5 The datalist dropdown needs a person.** That every accepted name is
  an `<option>` is checkable and checked — 1,305 of 1,305. Two things are not,
  because the popup is browser chrome rather than DOM and CDP cannot reach it:
  whether suggestions render while typing (`autocomplete=off` alongside `list=`
  is the standard pairing precisely so autofill history does not cover the
  datalist, so this should be fine — but nothing has looked), and whether
  arrow-selecting an option then pressing Enter scores the **selected** name
  rather than the partial that was typed. The Enter handler fires on datalist
  commit, and value-versus-keydown ordering is the kind of thing that differs by
  browser. `smoke_play.py` types the full exact name, so that path is genuinely
  unexercised.


## The map was never visible (2026-08-10)

Built the thing the brief has been asking for since the first line — pick your
guess off the embedding map — and took a screenshot before believing it worked.
The canvas was **black**. Not sparse, not faint: a gradient haze with my new
hover ring floating on it and nothing else.

`smoke_play.py` had just reported **19,371 non-background pixels** on that canvas.
Both were true.

    canvas{...;background:radial-gradient(...),radial-gradient(...),var(--void)}

A **bare** `canvas{}` rule, and `#trajOver` is `position:absolute;inset:0`
directly over `#c`. The overlay was handed an opaque background and covered the
map completely. The 4,322-point cloud, the target crosshair, the guess ring, the
dashed line to it — all painted, all underneath. `getImageData` reads the backing
store, so it reported every one of them as present, because they were.

**This is the same mistake I have been finding all day, one layer up.** I checked
that the map was painted. Nobody had checked that it could be seen. Two commits
ago I celebrated 9,592 → 10,117 pixels as the crosshair and guess ring finally
drawing; they were drawing into a canvas nobody could see, and the number was
right about the paint and silent about the point of it.

`#trajOver{background:transparent}` is the whole fix. That is the **second** bare
`canvas{}` rule on this site to hide something — model.html carried one too, and
the board note for it said the rule was "left over from a canvas that no longer
exists". Same rule shape, same silence.

### The check that would have caught it

Counting ink cannot. `smoke_play.py` now asks the browser whether anything
absolutely-positioned overlaps at least half the map with an opaque background or
a background image. Proven both ways rather than assumed — removing the fix from
the served copy and re-running:

    FAIL - something opaque is layered over the map, so whatever is painted on
           #c cannot be seen: #trajOver bg=rgb(10, 12, 16) +image

then green again once restored.

### And the thing it was hiding was worth seeing

**The modern pool is now its own pickable layer.** The context cloud is
`vectors_map_lite.json`, and only **441 of the 1,305 modern seasons appear in
it** — hit-testing those dots would have named about one in six and left most
guessable players with no mark at all. So the pool is drawn over the cloud,
brighter and larger: every mark you can hover is a season you can actually guess.
The ids agree across both files (coordinates match to a median of 0.005, which is
just the cloud's two-decimal rounding), so a row in both lands in one place.

Hover names the player. Click fills the guess box and focuses it — it does not
submit, so a stray click on a dense map cannot spend a guess for you.

**Deliberately no similarity on hover.** Showing cosine would let you sweep the
map for the highest number and the puzzle would answer itself.

**It is a convenience layered on the guess box, never a replacement.** The canvas
stays out of the tab order, and every name remains typable and suggestable, so no
function of this page is mouse-only. That is why the empty datalist had to be
filled first — the keyboard path had to exist before a mouse path could be added
on top of it, or this would have been an accessibility regression on a site that
just reached 22 of 22.

One definition of the projection now, `vhMapXY()`, shared by the base draw, the
hit-test and the highlight. Three copies of `pad+x*(W-pad*2)` is exactly how they
would drift, and the smoke test clicks a computed screen position and requires
the guess box to hold that exact name — which is the assertion that would catch
the drift.

Moving the map into view also collided the canvas caption at (14,20) with the
HTML pill in the same corner. Nobody had seen them overlap because nobody had
seen either. Caption moved to the bottom edge and now names the pickable count.


## Looked at every canvas on the site (2026-08-10)

play.html's map was painted and invisible, and no static check could have known.
So the obvious question: where else? Ten canvases across six pages, each one
scrolled into view, measured, asked what is layered over it, and **cropped so it
could actually be looked at**.

    /index.html   #c         689x440   ink  3.5%
    /model.html   #retrMap  1068x616   ink 10.7%
    /play.html    #c         501x360   ink 11.2%
    /players.html #c         635x440   ink  3.0%
    /teams.html   #mapCv     460x120   ink  5.2%
    /trends.html  #archMap  1024x592   ink  6.6%

**No other page has the covering bug.** play.html was the only one with an
absolutely-positioned canvas, which is the shape the bug needs.

Three "failures" the sweep printed were its own. The hidden share canvases are
0x0, and a zero-area target is "half covered" by everything when the threshold is
also zero — so every sibling was reported as covering them. `#trajOver` was
flagged blank, which is what an idle overlay is supposed to be. **The same
zero-area bug was sitting latent in the check committed to `smoke_play.py`**; it
never fired there because `#c` is not zero-sized, and it is guarded now.

And the first run of crops came back pure white. `Page.captureScreenshot` takes
its clip in **page** coordinates and I passed viewport-relative ones, so after
scrolling a canvas into view the crop captured empty page below it. play.html had
worked only because it sits at scrollY 0.

### model.html's cloud was drawn in a colour nobody can see

    g.globalAlpha=0.22; g.fillStyle='#b9b7b0';    on a #fff surface

Which renders as about **rgb(240,239,236) against white — a contrast ratio near
1.07:1**. The retrieval map is the centrepiece of the model explainability page,
and its 4,000-odd context points were a rumour. Screenshotting is the only reason
this surfaced; the ink count said 10.7% and was right, because the points really
were painted.

Now `#7d7a73` at 0.42 — about rgb(200,199,195), which reads as texture with
visible density structure. Darker at a moderate alpha rather than the same grey
turned up, so overlapping points still accumulate. Kept deliberately grey and
subordinate: the orange retrieval path is the subject of the figure and colouring
the cloud would compete with it. Verified by looking at it, before and after.

### Where the two conventions differ, on purpose

trends.html's archetype map is the best-looking surface on the site — full
Okabe-Ito on white, clusters legible at a glance — because **archetype is the
variable it is about**. model.html's cloud is context behind a single
trajectory, so it stays neutral. Same data, different jobs, and that is a
deliberate split rather than an inconsistency to iron out.


## I fixed one duplicate skip link and never looked for the others (2026-08-10)

Two pages still had two. I found them by accident, chasing something else.

**play.html** carried a static `<a class="vh-skip" href="#main">Skip to the
content</a>` and then an IIFE that injected a second reading "Skip to the game"
at `body.firstChild` — *ahead* of the static one. Identical to the players.html
defect I fixed two commits ago, on a page I did not think to check while fixing
it. Only the injection was removed; the static link works with JavaScript off.

**index.html** had two static links, both to `#main`: `class="skip"` and
`class="vh-skip"`. The `.skip` one is the page's own — a comment in the file
says it "was already here and left alone" — and `fix_skip_link.py` added mine on
top, back when it looked for `class="vh-skip"` rather than for a skip link. **The
one I added is the one that went.** The original's `:focus` pins the link at 16px
rather than `left:0`, which is the better of the two, and its now-dead `.vh-skip`
rule went with it.

Making the check behavioural is what let this land cleanly: `/` now reports
`first=.skip` and passes, because the assertion asks where the link goes rather
than what it is called.

### The rule is duplicate destination, not duplicate link

`teams.html` also has two — "Skip to the content" to `#main` and "Skip to all 30
teams" to `#foSec`. **That is correct**, and a check that counted skip links
would have failed a page doing the right thing. `check_focus.py` now fails only
when two of them point at the same target. Proven by putting a duplicate back
into the served copy:

    FAIL - /: 2 skip links all pointing at #main: Skip to content / Skip to the
           content - a keyboard visitor meets the same destination twice

### The sweep that found nothing, which is also a result

Before that, all 18 served pages were checked for four things no static reader
can see: `NaN`/`undefined`/`[object Object]`/`Infinity` in rendered text, loading
placeholders still on screen, text elements overlapping, and text wider than its
box. **No junk text anywhere. No overflow anywhere.** That is worth knowing.

Both "stuck loading" hits were the probe's fault, not the site's, and both are
worth writing down because they will catch the next person too:

- **trends.html** looked like it had a permanent "Loading archetype names…".
  The section is `IntersectionObserver`-gated and my probe scrolled to the page
  bottom and back, never parking it in view. Park it and the legend fills
  immediately: 8 archetype swatches with names, 9 buttons, an 8-row table.
- **player-animations.html** looked like 8 code blocks stuck at "loading…". They
  are inside closed `<details>` and load on expand. **A closed `<details>`'s
  contents still report a non-zero bounding box in Chrome** — 1104x30 here — so
  "is it visible" cannot be answered from rect size alone. Open one and it fills.

That is the tenth and eleventh false alarm this session, and in both cases I
nearly "fixed" a page that was working correctly.


## P7.1 closed: public/assets/assets/ is gone (2026-08-10)

I had this filed as an operator decision for four passes. It was not one — it was
a question I had never gathered the evidence to answer. Once gathered, there was
no fork left in it.

**187 files, 84.8 MB.**

    identical to public/assets/   172 files   84.4 MB
    differs                        15 files   all .js, all strictly SMALLER
    no counterpart                  0 files

The 15 that differ are stale. Every one is smaller than the file it shadows —
`error-boundary.js` 10,361 B against the live 12,231 B, `keyboard-a11y.js` 9,875
against 10,662 — so they are older copies of scripts that still exist at the
correct path.

**Nothing can reach them.** No reference to `assets/assets` in any HTML, JS, JSON
or MJS on the site. No `import.meta.url` or `new URL()` anywhere under
`public/assets`, which is the one mechanism that would resolve a module's sibling
path to `/assets/assets/`. No HTML file inside `public/assets/` that could rebase
a relative path there. The root has no `assets/assets` at all, so `sync_public.py`
never made it and does not recreate it — confirmed by running it after the delete.

And they were tracked in git, not ignored, with no `.vercelignore` — so the
delete is a `git revert` away if this is ever wrong.

### A claim I made last pass that was wrong

I called this "real weight on every visitor." **It is not.** Vercel serves
`public/` statically and nothing references these files, so no visitor has ever
downloaded one. The real costs are the deploy bundle, the repo, and a hazard:
`vercel.json` matches `/assets/(.*)\.(json|js|…)` with
`max-age=31536000, immutable`, so if anything ever *had* resolved to one of those
15 stale scripts, a visitor would have cached year-old code for a year.

### What is left, and what is actually mine

**P6.1 stays the operator's**, and the difference is worth stating: duplicates
have no alternative use, so deleting them is not a judgement. The 746 KB dead
module set has a real second option — reviving it — and choosing between delete
and revive is a product call about what the site should do, not a cleanup.


### The duplicate tree was load-bearing for exactly one file, and that was a bug

My evidence for deleting `assets/assets/` was a grep for the literal string. That
could never have found the one thing that reached it, because the string never
appears:

    // in /assets/mtnn-worker.js
    fetch('assets/mtnn_meta.json?v=37335d35')
    loadF32('assets/mtnn_embeddings.f32')

**A relative URL inside a worker resolves against the worker script's own URL**,
not the document's. So both of these asked for `/assets/assets/…`, and that path
existed only because of the duplicated tree. The worker had been quietly reading
the duplicate for as long as both were there. Deleting it turned a silent wrong
path into a 404 — which is the only reason anyone noticed.

Nothing is broken by that: **`mtnn-worker.js` is never instantiated.** There is no
`new Worker(` anywhere in the repo and nothing references it by name. It is dead
code, so the 404 is theoretical — but the wrong path was real, and would have bitten
whoever wired it up.

Both paths are absolute now. Stylesheets under `assets/` were checked for the same
trap — a `url(assets/…)` in a stylesheet rebases the same way — and there are none.
The only other worker, `workers/modern-search.worker.js`, has no relative fetches.

### And it was guessing the model dimension, wrongly

    .catch(()=>({dim:48, rows:12966}))
    var dim = metaJson.dim || 48;

The shipped model is **64-d**. `dim` is not cosmetic here: `rows` is derived as
`E.length/dim`, so a wrong dim misaligns every vector in the matrix and returns
confident nonsense instead of failing. Both guesses are gone — a missing or
unreadable `mtnn_meta.json` now throws. The file header claimed "12,966 × 48-d"
too, which was simply false about the shipped artefact.

Worth stating plainly: **the grep I trusted was structurally incapable of finding
this**, and I would not have looked without being pushed to check workers and CSS
specifically. Deleting the duplicates was still right; the evidence I offered for
it was one mechanism short.


## P5.3: one of those files was a duplicate, and the other pair was not (2026-08-10)

"`front_office.json` at 8 paths" was really **5 distinct files**, each mirrored
into `public/` by `sync_public.py`. Hashing them separates two very different
situations:

    assets/data/front_office.json             1,160,938 B   fa0a3241
    assets/front_office.json                  1,127,784 B   fb95747f
    assets/data/front_office_by_season.json     913,467 B   09c3502c
    assets/front_office_by_season.json          913,467 B   09c3502c   <- same hash
    assets/front_office_lite.json                17,467 B   c9496248

**The by_season pair is byte-identical**, and both are referenced from one place:

    cacheBY = await fetchJSON('/assets/data/front_office_by_season.json')
           || await fetchJSON('/assets/front_office_by_season.json');

A fallback to the same bytes cannot help. Both are static assets deployed
together out of `public/assets`, so if the primary is missing the deploy is
broken and the copy is missing too; if it is present the copy returns the same
913,467 bytes. **913 KB shipped to make a dead branch look like resilience.**
Copy deleted, branch removed.

**The other pair is not a duplication problem at all**, which is why it should
not be "cleaned up": `assets/data/front_office.json` is a strict **superset** of
`assets/front_office.json` — 26 top-level keys against 25, the extra one being
`valuation_history`, and **all 25 shared keys are equal**. Both are live, with 10
and 22 references. Consolidating onto the superset would save another 1,127,784 B
and remove a drift hazard, but it means repointing 22 references and their cache
tokens, and any consumer that iterates top-level keys would newly see
`valuation_history`. That is a follow-up with a real risk surface, not a
drive-by, and it is recorded rather than done.

## Two committed modules never parsed at all

`node --check` on the file I was editing failed — on a line I had not touched.
Sweeping every committed module found two:

    assets/teams-time.js       a try{ block never closed before its catch
    assets/push-retention.js   \" escapes that leaked out of some generator

A module with a syntax error does not partly work. The browser reports it once
and **everything in that file simply never happens** — the same failure that took
out index.html's entire script earlier in this session.

Neither is referenced by any page today, so nothing was visibly broken. That is
luck, not design, and it is the second time this session that dead code has
turned out to be hiding something.

### The check that should have existed

`check_syntax` parsed **inline** `<script>` blocks and skipped `assets/*.js`
entirely. Every module on the site was outside it. It now parses both — **93
scripts** rather than the inline handful — and it respects `--root`, so the
served copies under `public/` are parsed as well as the source. Proven by
breaking a file again and re-running:

    FAIL - assets/push-retention.js does not parse: SyntaxError: Invalid or
           unexpected token

Both broken files are fixed rather than excluded. An excluded file is a permanent
blind spot, and these two are exactly the kind that would stay broken forever.
Whether they should exist at all is **P6.1**, still the operator's call — but
they are at least syntactically valid now if the answer is "revive".


## F2: the site's own footers decided this one (2026-08-10)

"Self-host or drop" looked like a taste question. It was not, because the pages
say what the font is for:

    dumbmodel #fafaf8 • paper aesthetic • Architects Daughter

A face the design credits by name, in its own footer, as part of the aesthetic is
not a thing to drop to save a request. **Self-host**, which keeps it byte-identical
and costs nothing visually.

**18 pages loaded it; 16 actually use it.** Two — `player-fit.html` and its
`player-fit/index.html` mirror — carried the preconnects and the stylesheet and
never named the family anywhere. Their links are simply gone.

I nearly got this wrong. My first count said "12 of 18 load a font they never
use", because I only looked for `var(--hand)`. Ten pages set
`font-family:"Architects Daughter",cursive` literally instead, several of them
from inside JS template strings where the quotes are escaped. Checking the
literal form as well as the variable moved the answer from 12 unused to 2.

### What changed

    assets/fonts/architects-daughter-latin.woff2       13,156 B
    assets/fonts/architects-daughter-latin-ext.woff2    7,028 B
    assets/fonts/OFL.txt                                4,362 B
    assets/fonts.css                     two @font-face rules

Both subsets and their `unicode-range` values are copied from Google's own css2
response, so a browser still downloads only the subset it needs — the Latin-only
case pulls 13 KB and never touches the extended one. `font-display:swap` is
preserved. The licence is SIL OFL 1.1 and its full text ships beside the files.

**Three `<link>` tags per page became one**, and two third-party origins
disappeared from every page on the site. No visitor IP goes to Google to render a
heading any more, which is the part that had nothing to do with performance.

Verified in a browser rather than assumed:

    /index.html    face-loaded=True  width 394 vs fallback 449  google-requests=0
    /play.html     face-loaded=True  width 394 vs fallback 449  google-requests=0
    /teams.html    face-loaded=True  width 394 vs fallback 449  google-requests=0

The width comparison is the part that matters: `document.fonts.check()` can
return true while the text still renders in the fallback. 394 against 449 for the
same string is the real face doing the work.

### And the stamper had never seen a stylesheet

`stamp_assets.py` stamped `fetch()` calls and `<script src>`, and had no pattern
for `<link href>` — because until `fonts.css` **there was no linked stylesheet on
this site**; every page carries its CSS inline. `vercel.json` puts css in exactly
the same `max-age=31536000, immutable` rule as js, so an unstamped stylesheet is
pinned in a returning visitor's cache for a year. Now stamped:
`fonts.css?v=31e5658b` on all 16.

The `.woff2` files are deliberately left unstamped. A font's bytes do not change
in place, and Google's path carries the face version (`…/architectsdaughter/v20/…`),
so a new cut arrives under a new filename.


## The map had eight colours and no key (2026-08-10)

play.html paints the cloud and the pickable pool in eight archetype colours and
said nowhere what any of them meant. Identity carried by colour alone, on the
surface the brief puts at the centre of everything. trends.html has had a key for
its archetype map the whole time; this one never did.

Names come from `assets/mtnn_arch.json` — the same `gameArchetypes` array
trends.html reads, already committed and now fetched here too. **The index
alignment was checked, not assumed:** trends pairs `#0072B2` with "Offensive
Glass + Rim Protection", which is `MAP_OKABE[0]` and `gameArchetypes[0]`. A key
that mislabels a colour is worse than no key, and this is a page where a wrong
label would quietly teach someone the wrong thing about the model.

Built in JS rather than markup so it exists only when the names do. If the fetch
fails there is no key **and no swatches** — a half-loaded version, coloured
squares with nothing to read them by, is precisely the problem being fixed.

The swatches carry a 1.4px ink border, which is not decoration: `MAP_OKABE[7]` is
`#FFFEF7`, chosen to be visible against the near-black canvas, and it would
disappear entirely on the white card underneath it. Same trap as model.html's
1.07:1 cloud, caught this time before shipping rather than after.

**Verified by looking at it**: eight entries, wrapping to four rows, colours
matching the clusters above them, and the near-white swatch clearly bounded.

`smoke_play.py` now requires eight named entries. Proven both ways — renaming the
key's id in the served copy:

    FAIL - the map has no colour key — eight archetype colours are drawn and
           nothing on the page says what any of them mean

### Two loose ends closed honestly

The six `collide` warnings my visual probe raised against trends.html were **all
false**, and I said at the time I would not act on them unverified. Settled now:
every overlapping `<td>` reports `inDetails: True, detailsOpen: False`. They are
table cells inside a **closed** `<details>`, which still report a layout box in
Chrome — the same behaviour that made player-animations look broken two passes
ago. Nothing is wrong with the page.

And the P5.3 follow-up I recorded last pass is **not the win I implied**. Pages
fetch `/assets/front_office.json` — the subset — directly. Consolidating them
onto the superset saves 1,127,784 B of deploy bundle but adds **33,154 B to every
visitor** on those pages, because the superset carries `valuation_history` they
do not use. That is a trade, not a cleanup, and it should not be filed as one.


## /player.html was a search box and nothing else (2026-08-10)

Phase 4 of the brief is player cards, and I had not looked at the page. It is
**466 pixels tall** — for comparison trends.html is about 9,000 — and the whole
thing is one input:

    Every charted player has a page
    2,293 of them … Until now nothing on this site linked them.
    [ Find a player: Wembanyama, Jordan, Nash… ]

`search()` returns nothing until the query reaches two characters, so **you could
only find a player you had already thought of**. 2,293 cards, no way in. The
page's own sentence about nothing linking them was still true of the page saying
it.

It needed no new data. `knowledge/` already carries thirteen hub pages —
**8 archetype hubs and 5 position hubs** — `open('archetypes/playmaking-steals')`
already worked, and the page's own error message even names them. Nothing linked
to them either.

`scripts/build_player_hubs.py` writes the row from those files. The labels are
read out of each hub's frontmatter rather than typed into the markup, because a
hand-copied label goes stale the moment a hub is renamed and the page would then
be lying about what it links to — the same reason `build_wiki_index.py` exists.

**Static markup, not JS, and that is the point.** The row costs nothing on load
and needs no index, so the 539 KB `wiki_index.json` stays deferred until someone
actually searches. A blank page that could have shown thirteen doors did not
justify making every visitor download half a megabyte to see them.

Verified by clicking, not by reading:

    hub buttons in the page: 13
      first archetype   shown=True chars=1950 loading=False errs=[]
                        'Archetype: Defensive Glass + Rim Pressure (Fts)…'
      first position    shown=True chars=1857 loading=False errs=[]
                        'Position: C — Center…'

`min-height:28px` is declared on the buttons rather than left to padding, so the
target-size check can settle WCAG 2.5.8 instead of estimating it.

### What is still thin here

The row is thirteen doors, not a directory. A player whose archetype you cannot
guess is still only reachable by typing their name, and there is no A–Z. The data
supports one — every record carries `positions`, `archetypes`, `span` and a
12-value skill vector — but 2,293 links is a real weight decision, and the useful
version of it is probably paged or letter-at-a-time rather than all at once.
Recorded rather than guessed at.


## "No fabrication" sat above a fabricated table (2026-08-10)

Phase 5 of the brief is the team / front office page, and I had not looked at it.
`teams.html` carried a section headed **"Formula — honest placeholder"** whose
closing line read:

    No fabrication — placeholder table honest 10 rows, full sync via
    build_front_office.py.

Underneath it, a sortable ten-row table of hardcoded literals:

    {team:'LAL',FOR:72.1,W:47,wpm:0.258,wstarpm:0.28,popm:0.022,val:7.1,…}

**The numbers matched nothing.** Against the committed 2025-26
`front_office.json`:

    team   page FOR   real for_score      page W   real wins
    NYK    91.2       61.7                51       53
    SAS    87.4       69.3                34       62
    OKC    86.1       70.7                68       64
    CLE    84.3       66.7                48       52
    BOS    83.9       78.1                64       56

Not a rounding difference and **not a different season** either — OKC 68 and SAS
34 look like 2024-25, but CLE 48 does not; CLE won 64 that year. The real file is
internally coherent (wins + losses = 82 for all thirty). The ten rows correspond
to no season the site holds.

They were presented in a sortable table with a FOR column, directly above **the
real thing** — `#foTable`, all thirty teams read from `front_office_lite.json` at
load. Two team tables, different numbers, and the word "honest" attached to the
invented one.

Deleted: the table, the 2,139 characters of hardcoded rows and sort wiring behind
it, and the three claims that described it. The heading is now **"How FOR is
computed"**, which is what that block actually does, and the line about the data
source now says what is true — every number in the table below is read from the
file. The formula documentation stays; it explains the real table's FOR column.

That is the third fabricated surface removed this session, after `/owner`'s nine
`Math.random()` columns and model.html's `EH 0.92`. All three announced their own
honesty in the surrounding copy.

### One thing that checked out

The card headed "Why SAS 94.8 > OKC 85.8 with 22W gap?" **is** consistent: the
real table gives SAS a W* of 94.80 and OKC 85.80. That explanation was always
about the real numbers, so it stays exactly as written.

### And a risk from an earlier pass, closed

`teams.html` loads only `error-boundary.js`, `keyboard-a11y.js` and
`pwa-install.js`. It does **not** load `teams-time.js` or `teams-board.js` — so
the two syntax errors I fixed two passes ago were in genuinely dead code and that
fix changed no behaviour on any page. Worth confirming rather than assuming,
since reviving a dead module silently would have been a real regression.


## /owner: the payroll column named its season and the wins column did not (2026-08-10)

Last page of the brief without a read-it-against-its-own-data pass. Its 30-team
table headed one column **Pay24-25** while every other column went unlabelled,
and the wins in the same row are **2025-26**. A reader sees `W 56` beside
`Pay24-25` and concludes both are 2024-25. Boston won **61** in 2024-25, not 56.

**I expected fabrication and did not find it.** Every figure on the page matches
the committed data, and the column label is *correct*: BOS carries both

    payroll_m           129.33     <- what /owner and /teams read
    payroll_m_2025_26   213.82     <- the actual 2025-26 payroll

so `Pay24-25` accurately names the field, and `56 ÷ 129.33 = 0.433` is the 0.43
the page prints. The lite file's own method note says it outright: *"Wins per $1M
payroll 2024-25."*

The two seasons are a deliberate methodology choice — cap efficiency asks what
the roster you paid for went on to win — and the defect was only that the page
never said so. Headers are now **W 25-26**, **W\* 25-26**, **Pay 24-25**, with a
caption carrying the worked example and naming the field the page does *not* use.

Nothing about the numbers changed. One line of markup per mirror.

### Worth recording, because it cuts against the last three passes

Three fabricated surfaces came out of this session — `/owner`'s `Math.random()`
columns, model.html's `EH 0.92`, teams.html's ten hardcoded rows — and the
pattern made a fourth feel likely here. It was not. The check that would have
"found" one was the same check that confirmed there was none: comparing every
printed figure against the file it claims to come from. A suspicion is not a
finding, and the page that survives the audit deserves to be recorded as
surviving it.

**All five phases of the brief have now had a look-at-the-page pass.**


## Nav links that worked by luck (2026-08-10)

Twenty-two pages carry **eight different navigations**. Most of that is
deliberate — the persona pages share one nav, the content pages share another —
and which links belong where is a product decision, so the order and the
membership are untouched.

Two things in it were not decisions. Both are objective, and both were found by
asking a question with a yes/no answer: *does the same destination always get the
same name, and does the same name always go to the same place?*

**`play.html` addressed eleven page links relatively.** `href="./teams.html"`
where all twenty-one other pages write `href="/teams.html"`. It resolves today
only because `vercel.json` sets `trailingSlash: false`; served once at `/play/`
instead of `/play`, every one of them would resolve to `/play/teams.html` and
404. This repo already knows the trap — `stamp_assets.py` carries a comment
saying root-absolute "is what a page in a subdirectory needs, since a relative
path resolves differently depending on whether the URL ends in a slash." The nav
had the same bug the assets were fixed for.

**Six home links pointed at `/index.html`.** `cleanUrls: true` redirects that to
`/`, and the board already had the measurement from the service-worker
investigation: `/index.html → 308`. Four pages sent every visitor clicking "Map"
through a redirect to reach the page they were already asking for.

Afterwards, measured the same way it was found:

    relative page hrefs left:                 0
    /index.html hrefs left:                   0
    labels pointing at more than one place:   0

### What was deliberately left alone

`/` is still called **DUMBMODEL** on sixteen pages and **Map** on two, and
`/play.html` is **Play** on fourteen and **Play today's →** on seven. Those are
naming choices with a plausible intent behind them — the CTA styling differs too
— and picking one is a voice decision, not a defect. Recorded rather than
changed.


## The game drew a share card and no shared link could show it (2026-08-10)

`play.html` builds a 1200x630 share image — `makeShareOG()`, `#shareCard`,
`#shareCardD`, a whole popup to display it. Sharing is unambiguously intended.
The metadata that decides what a shared link *looks like*:

    missing description: 15 | no og: 20 | no twitter: 22 | no canonical: 22  (of 22)

A link to `/play` — the page every navigation on the site drives to — rendered as
a bare URL. No title, no summary, no image, while the page itself was drawing one.

`scripts/build_social_meta.py` writes the tags, and **every value is already
committed or already on the page**:

    og:title        the page's own <title>
    og:description  the page's own meta description — only where one exists
    og:image        assets/og-1200x630.png, measured at exactly 1200x630
    og:url          the clean URL, derived from the file path

**Fifteen pages have no description and none was invented for them.** Writing
fifteen summaries is copy, not wiring; those pages now get a title and an image
in a preview and no summary line. That is a gap to fill deliberately, not a
blank to fill automatically.

**22 of 22 now carry Open Graph and Twitter tags. 20 of 22 carry a canonical.**

## The two that do not, and why

Six pages exist at two paths. Four of those pairs are true mirrors — `brand.html`
and `brand/index.html` are one page at `/brand`, same title, and naming one
canonical for both is exactly right.

**`/player` is not a mirror pair. It is a collision.**

    player.html         "Vector Hoops — Player cards"
    player/index.html   "Vector Hoops — Player • Stay on floor"

Two different pages, different content, both resolving to `/player` under
`cleanUrls`. Whichever Vercel serves, **the other is unreachable at its clean
URL** — and one of them is the player-cards hub whose browse row was built two
passes ago. Twenty pages link `Players` there.

No canonical was written for either, because none would be true. The generator
detects the case by comparing titles and refuses rather than guessing, and says
so on every run:

    NOTE  https://hoops.dumbmodel.com/player is claimed by two different pages
          — no canonical written for either

- [x] **P9.6 Decide which page owns `/player`.**
  Withdrawn 2026-08-10 — not a decision. This branch created the clash and
  this branch resolved it. See the note at the end of this file. Resolving it means renaming one
  or adding a rewrite, and choosing which of the two a visitor should land on is
  a product call. Worth knowing that the local server cannot answer it either —
  `SimpleHTTPRequestHandler` does not implement `cleanUrls`, so only the deployed
  site or Vercel's documented precedence settles which one currently wins.


## P9.6 was not a decision. It was my bug, filed as your problem (2026-08-10)

Last pass I found `/player` claimed by two different pages, wrote that resolving
it "is a product call", and handed it over. One command shows that was wrong:

    git ls-tree -r --name-only origin/master | grep player
      player/index.html
      public/player/index.html

**`player.html` does not exist on master.** This branch added it, in
`0fe49182 feat(player): 7.9MB of generated player wiki was reachable from
nothing`, next to a `player/index.html` that had been there all along. The
collision is not a pre-existing condition to adjudicate — it arrived with my own
commit, and every one of the 22 nav links I pointed at `/player.html` funnels
through a 308 into it.

The site's own usage says who owns the name. **'Player' means the persona page**
— nine pages link `/player/`, index.html links `/player` twice. **'Players' means
the cards hub** — 22 links, all to `/player.html`, all added by this branch. The
newcomer is the one that moves.

`player.html` → `player-cards.html`, served at `/player-cards`, which is what its
own heading and eyebrow have said all along ("Player cards" / PLAYER CARDS).
Twenty-two links, four scripts and both mirrors follow it; the stale
`public/player.html` is deleted rather than left to be served.

    collision notices:            1  ->  0
    pages with a canonical:   20/22  ->  22/22
    stale /player.html links:    22  ->  0

Renaming rather than adding a `vercel.json` rewrite is deliberate: two files
competing for one clean URL resolves by a precedence I could not test locally —
`SimpleHTTPRequestHandler` does not implement `cleanUrls` — and a rule that
depends on undocumented behaviour is worse than a name that cannot collide.

**The lesson is the filing, not the fix.** "This needs a decision" is a claim
about the world, and it deserves the same evidence as any other claim I make. I
checked what the *branch* contained and never checked what `master` contained,
which is the one question that separates "a condition of the site" from "a thing
I just did".


## The audit I promised, and the bug it led to (2026-08-10)

Last pass I found P9.6 was my own bug filed as an operator decision, and said the
other six deserved the same question: **did this branch create the condition, or
did it pre-date the branch?**

    on master     player-animations.html      (and unpkg is on master too)
    on master     assets/pwa-install.js
    on master     assets/teams-time.js
    on master     assets/teams-board.js
    on master     assets/push-retention.js
    neither       .gitattributes

**P9.6 was the only one.** P4.5, P6.1, P6.4, P8.2, P9.3 and P9.4 all genuinely
pre-date this branch. The remaining board is the operator's, and now that is a
checked fact rather than an assumption.

That left P9.5, the one item about verifying **my own** work. The datalist popup
really is unreachable from CDP. But the path nobody had tested is the one people
actually use: typing a fragment and pressing Enter without touching the dropdown.

## "curry" scores you against Seth

`pickModern` ranks exact › prefix › substring, and where several names contain the
fragment the tie is broken by position in `MODERN` — array order, not relevance:

    curry     -> Seth Curry 2022-23        (5 rows matched)
    ant       -> Anthony Davis 2022-23     (53 rows matched)
    giannis   -> Giannis Antetokounmpo     (3 rows, all the same person)

Type "curry" meaning Stephen and you are silently scored against Seth. Type "ant"
and you get Anthony Davis — **on a page whose own placeholder offers "Ant" as the
example**.

There is no prominence field in this data. Ranking them properly would mean
inventing a signal, and ranking by cosine to the target would hand you the
answer. So the pick stands and the page says it was a pick:

    curry also matches 1 other player — Stephen Curry. Type more of the name to pick one.
    ant also matches 19 other players — Anthony Edwards · Anthony Gill · …

Other seasons of the player already chosen are not counted as other people, which
is why "giannis" says nothing at all.

### Two things caught before shipping

The disclosure interpolates the typed fragment, which makes it **the first user
input on this page to reach `innerHTML`**. There was no escaping helper in
play.html — I had reached for `esc2`, which exists on trends.html and not here,
so the first version would have thrown on every guess. It escapes properly now,
and a typed `<img src=x onerror=...>` creates no element.

And the season-stripping regex went in through a heredoc that doubled its
backslashes — `/\\s+\\d{4}-\\d{2}$/` matches a literal backslash, so nothing
stripped and "giannis" reported two other players, both of them Giannis. It was
caught by looking at the output rather than the code, and `smoke_play.py` now
asserts the disclosure so the next silent failure is not silent.


## Winning the daily looked exactly like being stuck (2026-08-10)

The daily seed sets **one** question — `setSeq([POOL[s%POOL.length].i])` — so
winning it ends the pack. Nothing had ever looked at what happens next.

`nextQ()` opened with `if(idx>=seq.length){ log(...); updateWW(true); return }`,
and that return came **before the line that writes the question**. So a player who
won the daily and pressed Next was left with:

    Russell Westbrook 2010-11 → ? • pack idx 5991 • LOD 4k 60fps

the same puzzle they had just finished, an empty guess box, and the only word
that the game was over appended to a debug-style log panel underneath.

It says so where the player is looking now:

    Done for today. The puzzle is seeded by the date, so a new one is here
    tomorrow. The map below is still live — hover a point to name it, or share
    the card.

"Tomorrow" is a fact about the code, not a promise: the seed is
`hStr(new Date().toISOString().slice(0,10))`, so it turns over with the date. The
guess box stays enabled — the map picker fills it, and there is no reason to stop
someone comparing more players against the same target once the scoring is done.

`smoke_play.py` presses Next after winning and requires the question line to
change.

### The screenshot lied again, and the measurement caught it

The full-page capture of the finished game showed a **completely black map**, and
it looked like a serious bug — the canvas blanked at the end of a round. Measured
instead of believed:

    after load             ink   19687   canvas 501x360   resizes 0
    after winning          ink   19687   canvas 501x360   resizes 0
    after pressing Next    ink   19687   canvas 501x360   resizes 0

Nothing blanked. `Page.captureScreenshot` with `captureBeyondViewport` and a clip
taller than the viewport does not re-rasterise canvas content — the earlier
canvas crops worked because they fitted inside the viewport. **That is twice this
session a screenshot has sent me after a bug that was not there** (the 390px
phone crop was the first), and both times the fix was to measure the thing
directly rather than trust the picture of it.


## The share card linked to a different puzzle (2026-08-10)

Nothing had ever opened the share card. It works — `makeShareOG()` draws on the
win (27,994 non-uniform pixels on the 1200x630 canvas), the popup opens, the
matchup and both career paths are on it. One line on it was false:

    sx.fillText('hoops.dumbmodel.com/play?pack=' +
      (new URL(location.href).searchParams.get('pack') || '672-123-456') + ...)

A daily game has no `?pack=` in its URL, so **every shared card fell back to the
literal `672-123-456`** — the demo pack from the placeholder rows. The one
artefact on this site built to be posted in public advertised a link to a
different puzzle than the picture above it.

`seq` holds the pool ids the round was built from and `parsePack` reads exactly
that format back, so `seq.join('-')` round-trips. Verified by following it:

    daily seq   [5991]   target 'Russell Westbrook 2010-11'
    card link   hoops.dumbmodel.com/play?pack=5991
    replayed    target 'Russell Westbrook 2010-11'   seq [5991]

If `seq` is somehow empty the bare `/play` is printed rather than a pack code
that leads somewhere else. `smoke_play.py` fails if the demo string ever comes
back, or if a non-empty seq produces a link with no pack.

That is the fourth value on this site that was stated with no relationship to
what it described, after `/owner`'s `Math.random()` columns, model.html's
`EH 0.92`, and teams.html's ten hardcoded rows.

### Two things about the card that are design, not defects

Left alone deliberately, because they are judgement about how the site should
present itself rather than something being wrong:

- **The card is mostly empty.** The two trajectories occupy a small patch of a
  1200x630 poster; roughly two thirds is black. It reads as a diagnostic, not a
  thing someone wants to post.
- **The footer is build metadata** — `v7.2 paper traj 1200ms easeInOut cubic
  grey→vivid 0.35→1.0 • SoC white • LPCM` — set in small grey on black. It is
  legible to whoever wrote it and to nobody else.

- [ ] **P9.7 The share card is a diagnostic, not a poster.** Both points above.
  Fixing them means deciding what the card is *for* — a score to brag about, a
  picture of the model working, an invitation to play — and that is a voice call.

### And `#shareCardD` is never drawn

A second 1200x630 canvas that stays at ink 0 and `0x0` through a whole game. It
is not wired to anything the win path touches. Recorded rather than removed —
it may be the download variant of a feature that was never finished, which makes
it P6.1's question, not a stray to sweep.


## The streak survived a nine-day gap (2026-08-10)

The last path a person walks that nothing had exercised: coming back tomorrow.
`updateWW` added to the count whenever the day was new and never asked **when the
last day was**:

    if(hit && !ww.days.includes(today)){
      ww.days.push(today); ww.days = ww.days.slice(-7);
      ww.streak = (ww.streak||0) + 1;
    }

So it counted days played, ever, while the page called it a **streak** and drew a
seven-dot **Week Warrior** beside it. Play once, disappear for six months, play
again: two.

Measured over a shimmed clock rather than argued from the code — a `Date` stub
installed before the page's own scripts, four rounds played:

    2026-08-10   streak 1   days ['2026-08-10']
    2026-08-11   streak 2   days ['2026-08-10','2026-08-11']
    2026-08-12   streak 3   days ['2026-08-10','2026-08-11','2026-08-12']
    2026-08-21   streak 4   days [... ,'2026-08-21']      <- nine days later

Now the same four rounds give **1, 2, 3, 1**, and `days` resets with the count so
seven dots mean seven days in a row rather than seven days scattered across
months.

This is the label-versus-value question again, and it went the other way from
`/owner`. There the column said `Pay24-25` and the field really was 2024-25, so
the fix was to say which season the *other* columns came from. Here the word
"streak" described something that was not one, so the value moved to match the
word.

`smoke_play.py` seeds a stale record and moves the clock nine days rather than
playing four rounds, and requires the streak to reset, the dots to reset with it,
and a genuinely consecutive day to still count up.

### One thing left unexplained

`smoke_render.py` exited 1 once, in the middle of a batch, and has exited 0 three
times since — including twice more in the same sequence that produced the
failure. Nothing in its output named a page. It uses a **fixed** profile directory
(`vh-render-profile`) while the other browser checks use their own, which is the
obvious place for contention with a leftover Chrome, but **I did not confirm
that** and it is recorded as an unreproduced flake rather than as understood.


## Operating the controls, not just tabbing past them (2026-08-10)

`check_focus.py` tabs through every page and proves each control can be *reached*.
Nothing had ever *used* one. Three pages' interactive controls, operated for the
first time.

**trends.html — the archetype filter works.** Nine buttons; "All 8" leaves the map
at its full 40,307 ink and each archetype redraws it to a distinct value
(27,260 / 27,983 / 27,334 / 27,817 — it dims the rest rather than hiding them, so
the count stays high). `aria-pressed` is right: exactly one `true` and eight
`false` after a click. No errors.

**model.html — both controls work.** The career picker holds 1,313 options and
each selection redraws the retrieval map. The four attribution targets each change
the bars beneath them — the top feature reads `PLAYER_HEIGHT_INCHES bio 0.86` for
Archetype and `1.93` for Position. One `aria-pressed=true`. No errors.

Two pages checked, two pages correct. Worth recording as checked rather than
assumed.

## teams.html — sorting from the keyboard worked once, then stranded you

The third page had a real defect, and it is the kind that only shows up when you
use the thing twice.

`draw()` rewrites the table with `innerHTML`, so the `<th>` being operated is
destroyed. Measured before and after pressing Enter on a header:

    before Enter: {"label":"W*","focused":true,"inDoc":true}
    after Enter:  {"oldNodeStillInDoc":false,"sameNode":false,"activeTag":"BODY"}

Focus fell to `<body>`. A keyboard user sorts one column and is then at the very
top of the document — past the skip link, past the whole navigation — and has to
tab all the way back to sort a second. The board records this table being given
keyboard support and `aria-sort` precisely so it would not be mouse-only; the
support was there and it worked exactly once per visit.

`sortBy` now restores focus to the header carrying the same `data-k` after the
redraw, and only when focus was already inside the table, so a redraw from
anywhere else never steals it. After the fix: `activeTag: TH`, `activeText: W*`.

The `say()` announcement was already correct and is untouched — the live region
was saying "Sorted by W*, descending" the whole time, to someone who had just
been thrown to the top of the page.

Also removed three `#tbl` CSS rules and the comment above them describing "the
page's own table … 11 `<th scope="col" data-k>`". That table was the fabricated
ten-row placeholder deleted earlier; the rules styled nothing and the comment
described something that no longer existed.


## players.html showed its filter state to eyes only (2026-08-10)

Operating the Explorer's controls: the three filters work and keep focus — map
ink moves 8,270 / 6,241 / 8,587 per click, focus stays on the button pressed,
clicking a name in the list draws its trajectory (7,658 → 10,877). No errors.

But the active filter was marked **only in CSS**:

    <button id="fAll" class="pill on mono">All 1814</button>
    .pill.on{background:var(--ink);color:#fff}

A sighted visitor sees which of All / Current is selected. A screen reader hears
two identically-named buttons and no state at all — WCAG 4.1.2. trends.html and
model.html both set `aria-pressed` on their own button groups, so this was the
site disagreeing with itself, not an open question.

`keyboard-a11y.js` mirrors the class onto `aria-pressed`. That module already
carries the scar tissue for this kind of work — a MutationObserver that once
froze the tab by rewriting attributes inside its own observed subtree — so every
write here is a no-op when the DOM already says it, and the observer filters on
`class` so writing `aria-pressed` cannot requeue it.

### The obvious grouping was wrong, and would have shipped a lie

The first version grouped by parent: take the button carrying `.on`, mark its
siblings. All three filters live in one `<span>`, so `fLod` came along and got
`aria-pressed="false"`.

**`fLod` is not a filter.** It runs

    $('fLod').textContent='DPR '+DPR.toFixed(1); rs();

— it relabels itself with the device pixel ratio and re-renders. A one-shot.
Announcing it as an unpressed toggle would have invented a control state, which
is a worse failure than the missing one being fixed.

Membership is earned now: a button is given a pressed state only after it has
been **seen** carrying `.on`. Measured across a full interaction:

    on load               fAll pressed=true   fCur pressed=null   fLod pressed=null
    after clicking fCur   fAll pressed=false  fCur pressed=true   fLod pressed=null
    after clicking fLod   fAll pressed=false  fCur pressed=true   fLod pressed=null
    after clicking fAll   fAll pressed=true   fCur pressed=false  fLod pressed=null

The active filter always announces itself. A sibling that has never been active
carries no state until it earns one — incomplete, but never untrue. `fLod` is
never touched.

That is the second time in two passes that the *first* fix was the dangerous one:
restoring focus after a table redraw would have stolen it from mouse users
without the `contains(activeElement)` guard, and this would have announced a
toggle that does not exist. Operating a control tells you what it does; only
looking at what it *is* tells you what to claim about it.


## The search never said whether it was open (2026-08-10)

Last untested control on the site: the player search on `/player-cards`. Typing
works — five hits for "curry" — arrow keys walk into the results, and Enter opens
the card.

The input declared `aria-controls="hits"` at a `role="listbox"` and **never set
`aria-expanded`**. A screen reader met a control that points at a popup and never
says whether the popup is there, while five results sat underneath it.

Now stated where the list is actually written, and guarded so a repeat write is a
no-op:

    on load          {"expanded":"false","hits":0}
    typed 'curry'    {"expanded":"true","hits":5}
    typed 'zzzzz'    {"expanded":"false","hits":0}
    cleared          {"expanded":"false","hits":0}

`role="combobox"` and `aria-autocomplete="list"` come with it, since the element
was already behaving as one.

### A bug I nearly reported that was my own probe

The first run said **Enter opened nothing** — empty card, focus sitting on the
result button. That reads exactly like a keyboard dead end: the Enter handler is
bound to the input, focus has moved off it, and the list's own keydown handler
only answers ArrowUp/ArrowDown.

It was the probe. I sent `rawKeyDown` + `keyUp` with no `char` event, and a
button's native activation needs the full sequence — the same three-part Enter
`smoke_play.py` has always used. With the char event the card opens:

    '2001-02 – 2007-08 7 seasons CPF Defensive Glass + Rim Pressure (Fts)…'

Second time this session a synthetic-input shortcut has manufactured a defect,
and the tell was the same both times: the failure was too clean.

### Left alone, and why

Every `li[role="option"]` wraps a `<button>`, so a screen reader meets a button
inside an option and `aria-selected` never moves off `false` as focus walks the
list. Fixing that properly means making the options themselves focusable and
driving the whole thing with `aria-activedescendant` — a rebuild of the widget,
not an attribute. It works by mouse and by keyboard today; recorded rather than
half-changed.

- [x] **P9.8 The results list is buttons inside options.**
  Done 2026-08-10 — rebuilt as a proper combobox. See the note at the end. `aria-selected` cannot
  do its job while focus lives on a child of the option. Worth doing as a
  deliberate widget pass, along with the same question on play.html's datalist.


## The dictionary had already found the fifth one (2026-08-10)

Auditing `dictionary.html` against the committed data, which is the last page
never checked that way. It does not need auditing — **it is doing the audit.**
The last section is titled *"Terms this site uses that have no file behind
them"*, and it names two values as claims rather than measurements:

    Purity@k — A specific value, purity@10 0.7057, has appeared in site copy.
               It is not in assets/eval_scoreboard.json … It may come from an
               older 48-d evaluation. Until a scoreboard ships it, it is a claim.

    Lift     — A specific value, lift 6.32, has appeared in site copy with no
               stated denominator … does not come to 6.32.

So the question became: **are those two still on display?**

`6.32` is gone site-wide already. `0.7057` was not. It sat on the pill over the
game map, on the page the brief puts first:

    <span class=chrome-caviar>Past ★ Modern ○</span> • pulp 0.7057

Checked before removing, rather than taking the dictionary's word for it:
`0.7057` does not appear anywhere in `assets/eval_scoreboard.json`, there is no
purity key in it at all, and the nearest values it holds are 0.757 and 0.7676 —
different numbers.

The pill now reads `Past ★ Modern ○`, which is the legend it exists to give. And
the dictionary entry moved to the past tense — it said the value *"has appeared
in site copy"*, which stops being true the moment the value comes off, so it now
says where it was and that it is gone.

**Fifth unsourced value removed**, after `/owner`'s `Math.random()` columns,
model.html's `EH 0.92`, teams.html's ten hardcoded rows, and the share card's
demo pack code. This one is different from the other four: nobody had to find it.
The site had already written down that it could not be substantiated, and left it
on screen anyway. The gap was between knowing and acting, which is the cheapest
kind of gap to close and the easiest to walk past.

`lift 6.32` needs no action — already absent. Recorded so the next pass does not
re-investigate it.


## I built a check that could not fail, and threw it away (2026-08-10)

Five unsourced figures have come off this site one at a time, and `sourced` in
`check_frontend.py` only knows the four literal strings it was told. The obvious
generalisation: pull every measurement-shaped number out of the static markup and
require it to appear somewhere in a committed asset.

It ran clean. **77 figures examined, 0 unmatched** as a standalone audit; wired
into the gate it reported **86 measurements traced, 0 failures** in 5.9 seconds.
That looked like an all-clear on the whole class.

Then the RED test refused to go red. I injected

    Held-out retrieval top-5 accuracy is 0.9987 across the pool.

into the served copy, and the check counted it — 86 measurements became 87 — and
passed it. So I measured the thing itself instead of the site:

    haystack: 66.9 MB across 124 files
    random 2-dot-4 decimals found in it:  11/400   (3%)
    random 2-dot-2 decimals found in it: 289/400   (72%)

**Nearly three quarters of two-decimal values match by accident**, and two
decimals is the shape almost every metric on this site takes — `cos 0.94`,
`top-5 0.76`, `baseline 0.20`. The check was not passing because the pages are
clean. It was passing because 66.9 MB of float data contains almost any short
decimal you care to name. My injected value only slipped through the 3% because I
happened to pick four decimals.

Reverted. A gate that cannot fail is worse than no gate: it converts an open
question into a green tick, and the next person reads the tick.

**And the sentence I wrote an hour earlier in this same pass — "every static
numeric claim on the site traces to shipped data" — is not supported.** What the
audit actually established is that no figure is *conspicuously* absent from
66.9 MB of assets, which given the collision rate is close to saying nothing. The
five that were found were found by reading claims in context, and that is still
the only method here with a demonstrated hit rate.

Worth knowing before anyone builds it again: the technique needs value-aware
matching — parse the assets, compare numbers against the specific field a claim
names, with a tolerance — not a substring search. That is a real piece of work
and it is not obviously worth it, because reading the page has been finding these
faster.


## P9.8: the option that was a button (2026-08-10)

Logged two passes ago as a widget rebuild rather than an attribute, and left
because the search worked by mouse and by keyboard. It did work. It also told a
screen reader something untrue about its own shape:

    <li role="option" aria-selected="false"><button data-slug=…>…</button></li>

An option containing a button, and DOM focus moving out of the combobox onto that
button on every ArrowDown — so `aria-selected` sat at `false` on all five rows
forever and the input's `aria-activedescendant` was never used at all.

Rebuilt to the pattern the markup was already reaching for. **The option is the
option**: no button inside it, focus stays in the input, and the arrow keys move
`aria-activedescendant`.

    typed 'curry'   expanded=true   activedesc=null    focus=INPUT   selected=false,false,false,false,false
    ArrowDown       expanded=true   activedesc=hit-0   focus=INPUT   selected=true,false,false,false,false
    ArrowDown       expanded=true   activedesc=hit-1   focus=INPUT   selected=false,true,false,false,false
    Enter           opens '2001-02 – 2007-08 · 7 seasons · CPF …'

Mouse still opens a row, and clicking one sets the active descendant too, so the
two input methods leave the widget in the same state rather than in two different
ones.

**Focus no longer moves, which makes the visible cue load-bearing.** A sighted
keyboard user had the browser's own focus ring doing that job; now the active row
carries it — the existing yellow fill plus a `3px` outline, checked by eye rather
than assumed. The `Escape` key clears the list, which the old handler never
offered.

The list's own ArrowUp/ArrowDown handler is gone. It existed only because focus
used to land inside the list; there is nothing in there to steer now.

### Why this one was worth doing at all

The honest case against was that it works. The case for is that this is the site's
search — the primary control on the page the brief names for player cards — and it
was describing itself incorrectly to exactly the users who cannot see the yellow
row. Five options that all report `aria-selected="false"` while one of them is
plainly selected is not a nuance; it is the widget denying its own state.


## Reduced motion stopped at the stylesheet (2026-08-10)

Every page on this site carries

    @media (prefers-reduced-motion:reduce){*,*::before,*::after{
      animation-duration:.001ms!important;transition-duration:.001ms!important}}

and it has been read, on this board and elsewhere, as "motion is handled". It is
not. That block governs CSS animation and transition. **Every piece of motion
that matters on the game page is JavaScript**: `animateCareer` runs a 1200ms
`requestAnimationFrame` loop, `pulseRing2` holds a ring on screen for 1240ms, and
the spike waits out a 600ms timer. A media query cannot touch any of them.

Measured with the media feature emulated over CDP, playing a full round each way:

    no-preference   matchMedia=false   rAF frames during the win 112   long timers 4
    reduce          matchMedia=true    rAF frames during the win 114   long timers 4

`matchMedia` answered correctly the whole time. Nothing asked it.

Gated now — and the point is that only the *motion* goes, not the result:

    no-preference   rAF 112  timers 4   idx 1  chips 18  overlayInk 6116  dist 0.06 · cos 0.94
    reduce          rAF   4  timers 2   idx 1  chips 18  overlayInk 6116  dist 0.06 · cos 0.94

**Identical pixel count on the trajectory overlay.** The same picture is drawn,
in one frame instead of a hundred and twelve; the pack still advances, the chips
still render, the readout is unchanged. The ring simply never appears, because a
ring that exists to flash has nothing to offer someone who asked for no flashing.

`reducedMotion()` reads the query live rather than caching it at load, so
changing the setting mid-session counts.

`smoke_play.py` emulates the feature and checks the ring stays hidden — the
cheapest observable, since it is shown for 1240ms otherwise. It also fails if the
page's own check stops reporting the preference at all, because animations gated
on something that never reads true are not gated.

### Worth saying about the standing rule

"Every animation gated behind `prefers-reduced-motion`" was a constraint I was
given at the start of this work and believed was satisfied, because the CSS block
is on every page and easy to grep for. The grep was the whole problem: it finds
the declaration, not the coverage. Nothing had ever set the preference and
watched what happened.


## The service worker was argued about. Now it has been watched (2026-08-10)

`play.html` displays **"offline capable"**, and the worker was rewritten earlier
this session on the reasoning that v7.1 could never have installed — `addAll()` is
atomic, three of its four SHELL entries 404'd against the live site, so the whole
install promise rejected and seven pages registered a worker that never existed.
That was a good argument. Nobody had watched it happen.

Loaded the site, waited, and asked the browser:

    service worker:  [{"scope":"…","active":true,"state":"activated"}]
    caches:          [{"cache":"hoops-v7-2","urls":["/","/manifest.json"]}]

**It installs and activates.** First end-to-end confirmation that the v7.1 defect
is actually gone rather than argued gone.

Two of three SHELL entries cached, and the missing one is the harness, not the
site:

    vercel.json rewrite:  /offline → /offline.html   (and cleanUrls: true)
    local server:         /offline 404, /offline.html 200

`SimpleHTTPRequestHandler` does not do clean URLs, so `/offline` cannot be fetched
locally at all. What that accidentally demonstrated is the part of the rewrite
that mattered most: **the per-entry `.catch()` did its job.** One unreachable
entry degraded the shell to two files instead of destroying the install, which is
precisely the failure mode v7.1 died of.

### What is still not established

Navigating offline succeeded for both `/play.html` and `/` — but that proves less
than it looks. Chrome's own HTTP cache can satisfy a navigation it has just seen,
and the local server sends none of the `max-age=0, must-revalidate` headers
`vercel.json` sets for `.html`. **So the success cannot be attributed to the
service worker rather than the browser cache**, and "offline capable" stays an
unverified claim in production terms.

Recorded rather than chased: settling it needs either the deployed site or a local
server that implements the rewrites and the cache headers. Worth knowing that
every browser check in `scripts/` navigates to `/play.html` and `/teams.html`
while visitors hit `/play` and `/teams` — the files are the same, so the risk is
small, but no check currently exercises a clean URL.


## Nine pages were set in Times New Roman (2026-08-10)

Found while auditing something else entirely. `public/player/index.html` declares

    body{ ... font-family:ui-sans-system; ... }

**`ui-sans-system` is not a CSS keyword.** The real generic is `ui-sans-serif`.
CSS parses an unknown unquoted name as a font *family name*, so the declaration is
syntactically valid, matches no installed font, and — with no fallback after it —
hands the paragraph to the browser's default. Nothing warns. It greps clean. Every
static gate on this branch passed it 22 pages at a time.

Measured with `CSS.getPlatformFontsForNode`, which reports the font the renderer
actually resolved rather than the one the cascade asked for:

    /owner/index.html        asked ui-sans-system    RENDERED Times New Roman  428 chars
    /player/index.html       asked ui-sans-system    RENDERED Times New Roman  134
    /brand/index.html        asked ui-sans-system    RENDERED Times New Roman   63
    /dfs/index.html          asked ui-sans-system    RENDERED Times New Roman  357
    /player-fit/index.html   asked ui-sans-system    RENDERED Times New Roman   86
    ... and the four flat twins (owner.html, brand.html, dfs.html, player-fit.html)

Nine pages of a site whose own footer calls it a **paper aesthetic** were rendering
body copy in the browser's default serif. Not a subtle mis-weighting — a different
typeface from the other thirteen pages.

Three distinct defects, one generator:

**A — the nine with no fallback.** Now carry the stack `hoops.css` already ships:
`ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif`.
The full stack rather than the one-token spelling fix, because `ui-sans-serif` is
not universally implemented and a bare generic would reproduce the bug elsewhere.

**B — the same misspelling with a fallback behind it** (`index.html`, `teams.html`,
`players.html`, `model.html`, `methods.html`, `leaderboard.html`, `inventory.html`,
`offline.html`). Invisible: `system-ui` catches it and always did. Corrected anyway
so the site has one spelling of its own name for its own font.

**C — an HTML escape that is not one.** Five pages carried

    <span style="font-family:\"Architects Daughter\",cursive">

A backslash escapes nothing inside an HTML attribute; the value ends at the first
quote. Fed to a real tokenizer, that span is not what it looks like:

    'style'                  = 'font-family:\'
    'architects'             = None
    'daughter\",cursive"'    = None

An invalid declaration plus two junk attributes, so the handwriting font never
applied on any of the five. Now single-quoted, and measured resolving:

    /brand/index.html   asked "Architects Daughter", cursive   RENDERED Architects Daughter
    /dfs/index.html     asked "Architects Daughter", cursive   RENDERED Architects Daughter
    /player/index.html  asked "Architects Daughter", cursive   RENDERED Architects Daughter
    /brand.html         asked "Architects Daughter", cursive   RENDERED Architects Daughter
    /dfs.html           asked "Architects Daughter", cursive   RENDERED Architects Daughter

with the attribute list down to `['style']`. The font was already self-hosted in
`assets/fonts.css` and linked by all five — nothing was missing except a quote.

After: every prose page on the site renders Segoe UI. (`/players.html` still reports
Consolas because its largest block of prose is a mono table, which is deliberate.)

### Two near-misses worth recording

**The first measurement said the opposite.** Pointing
`getPlatformFontsForNode` at `<body>` returned Consolas on all 21 pages with
`glyphCount` 19 — which is "Skip to the content", exactly 19 characters, mono by
design. `body`'s own text nodes are the skip link and nothing else. The probe had
to target an element that actually holds prose before it measured the thing I was
asking about. A uniform-looking result across every page was the tell.

**The blast radius was nearly 17 whole files.** All 22 pages are CRLF. The fixer
read with universal newlines and wrote with `newline=""`, which would have
converted every line in every file and buried a one-line change in a 3,000-line
diff. Caught by checking the line endings before applying rather than after.
`git diff --numstat` came back 1–2 lines per file, which is what was intended.

### What this says about the gates

`check_frontend` parses 93 scripts and resolves 146 links; `check_contrast`
evaluates 150 declared colour pairs; `check_a11y` clears 22 pages. None of them
looks at whether a declared font exists, because a font name is an opaque string
to all three. The defect was visible to anyone who opened the page and invisible to
everything automated. It was found by reading a file for an unrelated reason.


## The sixth candidate fabrication was real data (2026-08-10)

Five unsourced values have been removed from this branch under the no-fabrication
rule. `/player` carries three more — `1.28`, `0.62`, `0.81` — presented with the
specificity of measurements and citing no field:

    Closer 1.28 stays green vs 0.62 red - exploitable #FFD8D5
    [lock 1.28 closer] [avoid 0.62 exploitable] [dep 0.81]

The word "closer" points at `closing_score` in `matchup_players.json`, so that is
where I checked, and the result looked damning:

    closing_score   n=14690   min 0.644   max 1.558
    0.62 -> 0 rows, and below the minimum of the field entirely

**A value beneath the floor of its own metric is the clearest fabrication signal
there is, and it was the wrong field.** `matchup_grade` is a categorical with a
level literally named `closer`, and `matchup_factor` is a constant attached to it.
The cross-tab settles it:

    matchup_grade        matchup_factor
    neutral-closable     n=5029   {1.05: 4949, 1.134: 80}
    neutral              n=4383   {1.0: 4383}
    closer               n=2272   {1.28: 2267, 1.35: 5}
    starter-closer       n=1309   {1.12: 1202, 1.21: 107}
    exploitable          n=1153   {0.62: 937, 0.57: 216}
    matchup-dependent    n=544    {0.81: 544}

All three chips map exactly — `closer` → 1.28, `exploitable` → 0.62,
`matchup-dependent` → 0.81, which is what "dep" abbreviates. **Sourced, correct,
and nothing to remove.**

One qualifier that is fair to state: these are modal constants, not universal ones.
`closer` is 1.28 in 2267 of 2272 rows (99.8%) and `matchup-dependent` is 0.81 in
all 544, but `exploitable` is 0.62 in 937 of 1153 (81%) with the remaining 216 at
0.57. The page quotes the dominant value of each grade, which is a fair summary of
a two-valued category rather than a claim that every exploitable player scores 0.62.

Separately verified on the same page: "held-out top-5 0.76 against a 0.20
transparent baseline" cites `assets/eval_scoreboard.json` and survives the
like-for-like test — MTNN test-split top5 is 0.757 and the 14-d baseline's *test
split* is 0.1962 (its overall is 0.1954), both on the same n=790 cohort. The
comparison is not the common trick of a held-out model number against an
all-splits baseline.

### Why this is on the board rather than deleted quietly

The no-fabrication rule has removed five values here, and a sixth was two minutes
from joining them on evidence that was internally consistent and pointed the wrong
way. The failure mode is specific: **I searched the field whose name the prose
echoed instead of enumerating the fields that could produce the number.** Checking
one field and finding the value impossible feels like proof; it is proof only if
that field is the right one. The discipline has to be able to clear a claim, not
only condemn one, or it stops being a check and becomes a ratchet.


## P9.9 — the site says both 48-d and 64-d (2026-08-10)

Noticed in passing while reading `eval_scoreboard.json` for something else, and it
would have dropped silently if it had not been written down.

The file contradicts itself. Its `description` opens "Query the shipped **48-d**
MTNN space", and four lines below, its own `embedding_asset` block says `dim: 64`.

The bytes settle which is right:

    assets/mtnn_embeddings.f32   3,319,296 bytes
    12,966 rows x 64 dims x 4    3,319,296        exact
    bytes / rows / 4             64.0000
    model                        mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256
    sha256 on disk == sha256 declared in the scoreboard

**The shipped space is 64-d.** The `description` string is stale prose inside an
otherwise accurate file.

That string never reaches the DOM — no page reads `.description`, so no visitor
sees it. The prose does, and the prose is split:

    "48-d"  30 occurrences
    "64-d"  32 occurrences

The site disagrees with itself about its own model, roughly half and half, and it
is already half-aware of it: `trends.html` carries the comment *"The method string
says 48-d. eval_scoreboard.json says the shipped…"* and `dictionary.html` warns a
figure "may come from an older 48-d evaluation."

### Why this is not a find-and-replace

Some of the thirty are correct. `methods.html` attributes one to **MT v3**, an
older model; `dictionary.html` describes "an older 48-d evaluation" deliberately.
Others plainly describe the current artifact — `methods.html` calls the live game's
map "48-d", and the game runs on the shipped 64-d space.

So each of the thirty has to be matched to the model version it describes.
**Where that version is genuinely unknown, guessing fabricates a claim about a
historical model in the act of correcting one about the current model** — which is
the same rule this branch has enforced five times, pointed the other way.
Regenerating the asset would fix the `description` string and is forbidden here.

Filed as P9.9 rather than fixed, with the byte-level evidence above so the next
pass starts from a settled fact rather than re-deriving it.


## P9.9 was 30 wrong numbers. Four of them were reachable (2026-08-10)

Filed last pass as "the site says both 48-d and 64-d, 30 occurrences, needs
operator judgement." Enumerating all thirty with context changed the size of it
completely.

**Eight of the ten modules containing "48-d" are loaded by no page at all.**

    mtnn-full.js           *** NO PAGE LOADS IT ***
    past-modern-game.js    *** NO PAGE LOADS IT ***
    skill-tower-viz.js     *** NO PAGE LOADS IT ***
    viral-share.js         *** NO PAGE LOADS IT ***
    network-viz.js         *** NO PAGE LOADS IT ***
    mtnn-worker.js         *** NO PAGE LOADS IT ***
    game.js                only via past-modern-game.js  -> dead
    insight-engine.js      only via game.js              -> dead
    error-boundary.js      22 pages
    archetype-bridge.js    players.html

That is P6.1's 746 KB of unloaded modules, and correcting prose inside files that
may simply be deleted is work with a negative expected value. So the thirty split
into four reachable statements, a large dead-code remainder, and a handful that
are **correct as written** — `methods.html` attributes one to `MT v3` and
`dictionary.html` describes "an older 48-d evaluation" on purpose.

### The four, each measured before touching

    inventory.html            "MTNN 48-d leakfree recall@10 0.977 composite 0.7937"
    methods.html              "hold Past->Modern twin in 48-d map 6+ guesses"
    archetype-bridge.js       title:'mtnn_meta centroid 48-d mean'
    error-boundary.js         '48-d MTNN 2.5MB embeddings took too long.'

`mtnn_meta.json` reports `dim: 64`, `rows: 12966`, model `mtnn_v5_…_d64_…`, and
its `centroids` are **8 vectors of length 64** — which is what settles the
archetype-bridge line specifically, since that one is about centroids rather than
the embedding. `eval_scoreboard_v6.json`'s `baseline_v5_metrics` block agrees:
`dim: 64`, and it also contains the other two figures on the inventory line —
`leak_free_player_split_recall_at_10: 0.977` and `composite: 0.7937`, both exact.
**Only the dimension on that line was wrong.** The error-boundary size claim was
wrong too: `mtnn_embeddings.f32` is 3,319,296 bytes = 3.17 MB, not 2.5 MB.

Stated plainly because it limits the claim: **the error-boundary string is not
reachable today.** It fires on `vh:mtnn-failed`, which only `mtnn.js` and
`insight-engine.js` dispatch, and no page loads either — so `window.VHMtnn` never
exists. Fixed for correctness, not because a visitor was seeing it.

### What was checked and found *not* broken

A wrong dimension in *code* would be far worse than in prose — striding 48 floats
through a 64-float row misaligns every vector. Searched for it:

    insight-engine.js   DIM:48   <- declared once, read nowhere, dead field
    mtnn.js             dim = meta.dim || 64, rows = meta.rows || 12966
                        throw new Error('emb len mismatch '+E.length+' vs '+rows*dim)

`mtnn.js` derives the dimension from metadata, defaults correctly, and asserts the
buffer length. The one hardcoded `48` in the codebase is a dead property. **No
striding bug.** Also cleared: `inventory.html`'s `recall@10 0.977` looked like a
sixth unsourced value against `mtnn_meta.json`'s `test_recall_at_10 = 0.846`, but
those are different protocols — transductive versus leak-free player split — and
0.977 is measured under the second.

## The cache name the page announced and the worker did not use

Two asset files changed, so `stamp_assets.py` re-hashed `?v=` tokens on 21 pages,
and the standing rule bumps the worker with them: `hoops-v7-2` → `hoops-v7-3`.
Nothing here caches JS — the shell is three entries and fetch is network-first —
but `/` **is** in the shell, and a cached `/` keeps pointing at the old tokens.

`offline.html` prints the cache name to the visitor, twice. The bump left it
announcing `hoops-v7-2` while the worker used `hoops-v7-3`.

`scripts/fix_offline_claims.py` exists precisely to keep that page honest, it has
a `--check` mode, and it **passed**:

    0 claim(s) to correct, 11 already correct, 0 not found

because it compares the page against the literal string `hoops-v7-2` baked into
its own source. It was asserting a frozen constant, not an invariant — the same
shape as the audit reverted in `5d7ec48b`, and it would have shipped a page that
lies about the worker.

Replaced with a derived check. `check_frontend.py` now reads `const C` out of
`sw.js` and requires every page mentioning a `hoops-v…` name to match it.
**Demonstrated failing before it was made to pass**, on the real drift:

    RC=1
    FAIL — 1 problem(s):
      - offline.html shows cache name 'hoops-v7-2' but sw.js uses 'hoops-v7-3'
        — a visitor reading the page is told the wrong cache

then green on both roots after the page was corrected. Eleven checks now.

One bug of my own, caught before commit: the check first printed "1 page mention
agree" while failing, because the counter incremented on every mention including
the mismatched one. A gate that miscounts its own evidence is halfway back to the
problem it was written for.


## Amendment: "four reachable" was measured through too narrow a filter (2026-08-10)

The P9.9 sweep above enumerated thirty occurrences of "48-d" and concluded four
were reachable. It walked `public/` filtering `endswith(('.html','.js'))`.
**Shipped JSON was never looked at**, and that is where the interesting one was:

    eratwins.json         "method": "signature seasons matched in the promoted MTNN
                                     embedding (48-d, L2-normalized, index-aligned
                                     with vectors.json); twin = ne…"
    mtnn_map.json         "method": "PCA(3) on 48-d MTNN embeddings; axes min-max
                                     scaled for the explorer map."
    archetypes_time.json  "…K=8 k-means on promoted MTNN embeddings (48-d, L2-normalized)…"
    series.json           "…48-d fuse labeled -> 64-d truthful MTNN v4…"

and `trends.html` prints the first one straight into the document:

    $('twinMethod').textContent = TW.method || '';

So there is a **fifth reachable "48-d", and it is correct**. Those twins really
were computed in the older space, and the page does not merely leave the string
there — it explains it, immediately below:

    This table was computed in the 48-dimensional embedding, as its own method
    line states. The model the game ships now is 64-dimensional
    (assets/eval_scoreboard.json). These twins are therefore a snapshot of an
    earlier space, not of the current one, and are labelled that way rather than
    quietly reused.

That is the site doing the right thing without being asked.

### What it changes

Nothing to fix, and one claim to correct: "four reachable, all four wrong" should
read **four reachable and wrong, a fifth reachable and correct**. Amended in
`READINESS.md` and in the artifact. The commit message on `19818290` says four; it
is immortal and slightly narrow, which is what this note is for.

It also makes the case against a blanket 48→64 replacement much stronger than it
was when P9.9 was filed. This is not one stale string — it is **a family of derived
assets that were genuinely built from a 48-d embedding and say so**. `mtnn_map.json`
is the explorer map's own projection. Overwriting those method fields would replace
true provenance with false, which is the no-fabrication rule pointed backwards.

### The lesson, which is the same one as last time

Last note recorded searching `closing_score` because the prose said "closer", and
being wrong because the number lived in `matchup_factor`. This is that error in a
different coat: **I filtered the search by the file type I expected the answer to
be in.** A conclusion of the form "only N of these are reachable" is a claim about
coverage, and it is only as good as the glob that produced it. The fix both times
is the same — enumerate what could hold the answer before deciding what does.


## The game spent six seconds on an eight-player demo pool (2026-08-10)

Every gate on this branch answers "is it correct". None of them answers **"how
long until you can play"**, and nobody had asked. `/owner` and `/teams` were
measured for bytes-on-paint; the page the brief puts first never was.

Measured over CDP with a cold cache and Fast 3G emulated (1.6 Mbit/s, 150 ms RTT),
reading the page's own Resource Timing plus a poller stamping when the guess
datalist fills:

    resource                          start      end       ms        KB
    game_vectors.json                   480     6676     6189     397.6
    mtnn_arch.json                     6699     6930      231       3.5
    vectors_map_lite.json              6699     9593     2894     185.3
    embedding_map_manifest.json         488    12643    12155     908.2
    embedding_map_trajectories.json     488    13634    13146    1109.4

    guess box usable      355 ms
    map has ink           502 ms
    REAL pool loaded     6701 ms
    datalist over time:  [[241, 0], [502, 8], [6701, 1305]]

That last line is the finding. **The datalist holds 8 names for six and a half
seconds, then 1,305.** `game_vectors.json` is 397.6 KB and needs about 2.0s alone
on this link; it took 6.2s because the last line of the script fired

    fetchTrajCache();fetchManifest();

eagerly — 1.08 MB of trajectories and 0.89 MB of manifest, launched at the same
millisecond as the pool and sharing the pipe three ways. Both exist only to warm
the cache for the win animation. Neither is needed to play, both are memoised, and
the win path already does `await fetchTrajCache()` at the moment it draws.

Deferred behind the pool — the IIFE now returns its promise instead of discarding
it, and the prefetch chains off it:

    var vhPoolReady = (function(){ return fetch('assets/game_vectors.json'…

    vhPoolReady.then(function(){ fetchTrajCache(); fetchManifest(); });

Same measurement again:

                          before      after
    game_vectors.json     6189 ms    2343 ms
    vectors_map_lite      9593 ms    5753 ms
    REAL pool loaded      6701 ms    2856 ms      <- 2.35x
    total bytes          2656.7 KB  2656.7 KB     <- unchanged

**Nothing was removed and nothing was made smaller.** The same 2.66 MB is
requested; it is requested in the order the player needs it. Trajectories finish
at 13,921 ms instead of 13,634 — 287 ms later, on an asset that cannot be reached
before a win, and the win path awaits it anyway. Unthrottled the real pool lands
at 247 ms, so nothing regressed on a fast link. A full round still plays.

### What I went looking for and did not find

The obvious follow-on worry was that a player spends those seconds in a fake game
without being told. **The page is already scrupulous about this**, which is worth
recording because I was ready to file it as a defect:

    <span class=chip style="background:var(--yellow)">demo pool · 10 past × 8 modern</span>

    This page scores on a built-in demo pool — 10 past and 8 modern players,
    compared on a 3-value profile. It is not the 64-dimensional model…

and on load it rewrites the chip, the note and the input placeholder to the real
counts. It also refuses to swap mid-game, with the reasoning stated in place:
*"swapping under a game in progress would be worse than letting that one game
finish on the demo pool."* So the honest-but-limited window is real and disclosed;
this change shrinks it from 6.7s to 2.9s rather than fixing a lie.

No cache-token or worker bump: the only file changed is a page, `.html` is served
`max-age=0, must-revalidate`, and the worker shell is `/`, `/offline`,
`/manifest.json`. The `tokens` check confirms it.


## /model downloaded 1.1 MB to draw an 8 KB table (2026-08-10)

Having found a 2.35x on `/play` by timing it, the obvious question was whether the
other phase pages had the same shape. `/trends` is lean — 264.1 KB, everything in
by 1.9s on Fast 3G. **`/model` was not.** The explainability page, phase 3 of the
brief, took **13.3 seconds to draw its map** on a cold Fast 3G load:

    resource                          start      end       ms        KB
    embedding_map_points_limited.json   393     5096     4703     273.5
    front_office.json                   363    13079    12716    1101.6
    embedding_map_trajectories.json     393    13194    12801    1109.4
    TOTAL                                                       2577.8
    map has ink                       13259 ms

`front_office.json` on the *model* page. It is fetched for exactly one subtree:

    fetch('assets/front_office.json')  ->  j.model_eval.model_zoo

    front_office.json          1,127,784 B
    model_eval.model_zoo           8,299 B      0.74% of what comes down the wire
    teams + teams_by_abbr        896,034 B      79.4%, and this page reads neither

**A page about how the model works was spending twelve seconds downloading the
front office to render thirteen rows of model metrics.**

`scripts/build_model_zoo.py` now cuts the subtree into `assets/model_zoo.json`,
verbatim — the script copies, it does not compute, round or rename, and `--check`
fails if the slice drifts from its source. The page keeps the shape it already
destructures (`(j.model_eval||{}).model_zoo`), so the consumer is a one-line URL
change.

    resource                          start      end       ms        KB
    model_zoo.json                      355      824      469      12.6
    embedding_map_points_limited.json   385     3787     3402     273.5
    embedding_map_trajectories.json     385     7869     7484    1109.4
    TOTAL                                                       1488.7
    map has ink                        7939 ms

                        before      after
    payload            2577.8 KB  1488.7 KB    -42.2%
    map has ink        13259 ms    7939 ms     1.67x
    zoo table lands    13079 ms      824 ms    16x

`front_office_lite.json` already existed and was the obvious home, but it carries
`teams` for owner/teams/index and has no `model_eval`. Putting the zoo in it would
push 8 KB onto three pages that never read it — the same trade the board rejected
for a 33,154-byte merge. A separate slice costs them nothing.

Checked before assuming: `inventory.html` and `methods.html` name
`front_office.json` in prose but never fetch it, so `/model` was the only page
paying this.

### A number that had drifted, found on the way

The card heading was hardcoded:

    <div class="mono">Model zoo 10 models 5-fold CV</div>

The slice holds **13** models, one of which carries no numeric MAE, so the table
below it drew **12**. The heading had been wrong by two for as long as the data has
had thirteen entries. It now counts the same `rows` array the table is built from —
the page already uses that argument for its headline figure ("filling it from the
same rows means the headline and the table can never drift") and this heading had
simply never been included in it. Rendered: `Model zoo · 12 models · 5-fold CV`,
matching the note beneath it.

### Not touched, and why

`embedding_map_trajectories.json` is the other 1.1 MB and it is already behind an
IntersectionObserver, loading when the retrieval section approaches the viewport.
It starts at 385 ms here because that section sits inside the first 1280x900
screen, which is the observer working as designed rather than a defect. Making the
map paint before 7.9s means either splitting that file or drawing the cloud from
the 273.5 KB points file first — a real option, but a design change rather than a
correction, so it is not something to do quietly.


## Two loose ends from the speed pass (2026-08-10)

**`READINESS.md` and `readiness.html` are a mirror, and I keep treating them as
one file plus an optional extra.** The speed table went into the markdown and not
into the artifact, which is the thing the operator actually opens. That is the
third time this pair has needed an outside nudge — 129→135, the preview
contradiction, and now the firing's own headline result. It has exactly the shape
of root↔`public/`, which has a gate precisely because a hand-maintained mirror
drifts. **Rule from here: an edit to one is unfinished until the other carries it
or this board says why not.** No gate for it yet; `sync_public.py` cannot help
because the artifact lives in the scratchpad, not the repo.

Also corrected while in there: the artifact was citing a specific deployment id
four builds old as "READY". The branch alias always serves the newest build, so
the page now says that and names the current one — `dpl_CHZw7DepiHr81t2q4UP8unUCbCJE`
→ `def85879`, checked through the API — rather than pinning a claim that ages
badly. The header is anchored to a sha now instead of only a commit count, since
an absolute count is wrong one commit later by construction.

**`/trends` reported `map has ink NEVER` and I let it pass unremarked.** Almost
certainly the same explanation given for `/model`'s trajectories — an
IntersectionObserver section sitting below the 1280×900 fold that is never
approached in a probe that does not scroll. Recording it rather than asserting it:
the probe never scrolled, so "never drew" and "never asked to draw" are not
distinguished by that run. `/trends` is 264.1 KB and fully loaded by 1.9s on
Fast 3G, so there is no speed question hiding behind it either way.

### Still remembered rather than enforced

`build_model_zoo.py --check` exists and is in the verify list, but it is not a
`check_frontend` check. `mirror` and `tokens` are checks precisely because a
hand-maintained convention drifted silently, and a stale slice would be served
`immutable` for a year with nothing going red. Wiring it is the shape of
`check_tokens` — subprocess the `--check`, fail on a non-zero exit — and it has to
be shown failing once before it counts.


## The generator that subtracted its own output (2026-08-10)

Last pass closed with one named gap: `build_model_zoo.py --check` existed and was
not wired into anything, so a stale slice would ship `immutable` for a year with
nothing going red. Wiring it meant asking whether the rest of the family was in
the same state. **Seven `build_*.py` generators, all with a `--check`, none of them
wired to anything.**

Before running any of them from a gate — the ledger's first entry is a measuring
run that also shipped — each was audited and then tested rather than trusted:

    script                          net    pipe   torch  check-before-write
    build_front_office_lite.py      False  False  False  yes
    build_game_vectors.py           False  False  False  yes
    build_model_zoo.py              False  False  False  yes
    build_name_fixes.py             False  False  False  yes
    build_player_hubs.py            False  False  False  yes
    build_social_meta.py            False  False  False  yes
    build_wiki_index.py             False  False  False  yes

Then all seven `--check` runs against a clean tree: still clean afterwards, 286 to
830 ms each. Safe to call from a gate.

### Two of the seven could not fail

    build_player_hubs  --check  ->  "would write the browse row — 13 hub link(s)"   RC=0
    build_social_meta  --check  ->  "2 page(s) to change"                           RC=0

Both named their own drift and exited 0. And the second one was **describing a real
hole**:

    would add  player-cards.html   12 tag(s)
    would add  player/index.html   10 tag(s)

    player-cards.html    og=0  twitter=0  canonical=1
    player/index.html    og=0  twitter=0  canonical=0

Two pages with no Open Graph and no Twitter tags at all — one of them the page the
brief names for phase 4 — while `READINESS.md` said *"Every page now carries Open
Graph, Twitter and canonical metadata."* **I wrote that sentence.** The check that
would have caught me exited 0.

### Why it was never true: the generator deleted its own work

Running it did not fix it. It added 12 and 10 tags, then reported "1 tag to change"
on each, then on the next run the counts were back to **12 and 10** and the pages
were back to **og=0, twitter=0**.

`build()` returns *the tags this page is missing*, and the caller replaces the whole
managed block with exactly that:

    body = build(text, url)                  # only what is missing
    block = f"{START}\n{body}\n{END}"
    updated = text[:i(START)] + block + text[i(END)+len(END):]   # replaces everything

`have_props` was read from the **full text, including the block this script owns**.
So every tag it had already written counted as already-present, got excluded from
the next `body`, and was then deleted by the wholesale replace. The two pages
oscillated between twelve tags and zero on alternate runs, forever.

Fixed by reading the "already has" sets from the text with its own block removed:

    outside = re.sub(re.escape(START) + r".*?" + re.escape(END), "", text, flags=re.S)

Convergence measured rather than assumed — write, check, three times:

    pass 1: write RC=0 (21 changed) | check RC=0 (0 pages)
    pass 2: write RC=0 (0 changed)  | check RC=0 (0 pages)
    pass 3: write RC=0 (0 changed)  | check RC=0 (0 pages)

Net against HEAD, counted per page: **only the two pages changed.** 213 social tags
site-wide became 235; the other twenty pages are byte-identical. `git diff --numstat`
lists 7 files while `git status` lists 44 — the other 37 were rewritten with the
same bytes and differ only by mtime.

### The gate

`check_frontend.py` gained a **`derived`** check running all seven generators'
`--check`. Twelve checks now. Shown failing before it was allowed to pass, by
perturbing one value in the slice:

    perturbed DeepMLP_era14_256_128_64_32 avg_mae 4450.09 -> 4451.09

    RC=1
      6/7 derived asset(s) match the sources they were built from
    FAIL — build_model_zoo.py reports drift — assets/model_zoo.json is stale

then regenerated, `identical: True` against the source subtree, RC=0, 7/7.

**A bug in my own check, caught in that RED run.** The failure message printed

    is stale â€" run: python scripts/build_model_zoo.py

`subprocess.run(..., text=True)` decodes with the locale codec — cp1252 here — and
the generators print em-dashes. Mojibake in a gate's own failure message, from the
class the ledger already carries. `encoding="utf-8", errors="replace"` now, and the
two older call sites that had the same latent bug were fixed with it.


## /trends "map has ink NEVER" — settled (2026-08-10)

Left open last pass as recorded-not-asserted: the speed probe reported no ink on
`/trends`, and the probe never scrolled, so "never drew" and "never asked to draw"
were not distinguished by that run.

`trends.html` has one canvas, `#archMap`, and `bootMap()` sits behind an
IntersectionObserver on `#mapSection` with `rootMargin:'320px'`. Measured rather
than reasoned:

    at the top       ink=0       #mapSection top=2597px   viewport=802px
    after scrolling  ink=45709   scrollY=2597px

The section starts 2,597px down a 802px viewport — nearly two screens past the
320px margin — so the observer had correctly not fired. **Working as designed.**
Closed, not a defect, and the same explanation given for `/model`'s trajectories
now has a measurement behind it rather than an analogy.


## P4.5 has a measurement now: `git status` overreports on this checkout

Nearly misread this firing's blast radius because of it. After running the
generators, `git status --porcelain` listed **44 modified files** while
`git diff --numstat` listed **7**. The seven were real; the other thirty-seven had
no content change at all.

    core.autocrlf = true
    .gitattributes present: NO

    dictionary.html   HEAD  crlf=0    lf=349
                      work  crlf=335  lf=349     bytes 22076 vs 22411

HEAD stores the file with LF. `autocrlf=true` converts on checkout, so the working
copy carries CRLF and is 335 bytes larger — exactly the carriage returns. `git diff`
normalises both sides and correctly reports nothing; `git status` compares against a
stat cache that no longer matches, and flags the file. `git update-index --refresh`
does not clear it, because the bytes genuinely differ.

Worth noting the third state in that table: **335 CRLF against 349 LF is mixed** —
fourteen lines in that file are LF while the rest are CRLF. Tools that rewrite part
of a file leave exactly this.

### What it means in practice

**`git diff --numstat` is the authoritative blast-radius check on this checkout;
`git status` is not.** Every commit on this branch has been verified with numstat
for that reason, and this is the first time the gap was large enough to be
misleading on its own.

This is **P4.5** — the missing `.gitattributes` — which stays the operator's call
because a `* text=auto eol=lf` line rewrites line endings across a checkout another
agent is working in. It is now filed with a measurement rather than as a
housekeeping note: the cost of not having it is that the single most common
"what did I just change" command reports six times more than it should.


## The game told a screen reader nothing about the guess you just made (2026-08-10)

`check_a11y.py` settles eleven criteria and says so in its own docstring: *"real
screen-reader flow still needs a browser and a person"*. This is the browser half.
`Accessibility.getFullAXTree` returns the computed role, name and properties for
every node, which is what a screen reader actually receives rather than what the
markup suggests it should.

The sweep across eight pages was mostly reassuring:

    page                 ax nodes  unnamed interactive  live regions
    /play.html                271                    0             1
    /player-cards.html        113                    0             1
    /trends.html              811                    0             2
    /model.html              2034                    0             3
    /teams.html              1404                    0             1
    /players.html             698                    0             1
    /dictionary.html          651                    0             0
    /index.html               353                    0             1

**Zero unnamed interactive nodes anywhere.** Every button, link and field announces
itself. Two things it did surface.

### The game was silent between guesses

`/play` carries one polite live region, `#vh-live`, and the accessibility layer
already announces the *result box* — the payoff — with a comment saying "the entire
payoff of a guess … was silent" and fixing that. Each guess **before** the payoff
was still silent. Played a round over CDP and read the region:

    before the guess   #vh-live  ''
    typed              'AJ Griffin 2022-23'
    after the guess    #vh-live  ''
    what the sighted player got, in #log:
                       'guess → AJ Griffin 2022-23 cos -0.67 ◐ • row 11029'

`#log` is not a live region, so nothing reached the status node. Six guesses, and
no way to hear whether the last one landed at -0.67 or 0.94 — **that is the loop.**
A game you cannot get warmer in is not a game.

Now announced, and deliberately verbatim so what is heard and what is shown cannot
drift apart. Only `cos` is expanded, to `cosine`; decorative glyphs become sentence
breaks; every number, name and season is untouched:

    #vh-live   'guess . AJ Griffin 2022-23 cosine -0.67 . row 11029'
    #log       'guess → AJ Griffin 2022-23 cos -0.67 ◐ • row 11029'

`log()` appends with `innerHTML +=`, which re-parses the container and reports every
existing entry as removed and re-added, so the observer reads `lastElementChild`
rather than trying to pick the new node out of the mutation record, and a guard
stops one line being announced several times.

### Ten decorative tiles announcing themselves as "image"

`/teams` and `/players` each exposed five `role=image` nodes with an empty
accessible name — bare `<svg viewBox="0 0 40 40">` tile artwork. They were not
`aria-hidden`; a hidden node is `ignored` and never reaches the tree at all, which
is precisely why they showed up. A screen reader met each one and was told "image"
and nothing more. `aria-hidden="true"` on all ten, plus five on `index.html` that
had the same markup. Re-measured: **none.**

## The gate I built last pass caught my own change, then caught itself

Running the suite after all this, `check_frontend` went red:

    build_social_meta.py reports drift — FAIL 1 page(s) need social metadata

That is the `derived` check working. But the drift was not real, and finding out
why was the more useful half. The generator wanted to rewrite `play.html` — whose
social block I had not touched, same title, markers intact, `og=7 twitter=3` before
and after. `difflib` on `.splitlines()` showed no difference at all. The bytes did:

    before: crlf=705 lf=705      block head: '…start -->\r\n<link rel="canonical"…'
    after : crlf=693 lf=705      block head: '…start -->\n<link rel="canonical"…'

`block = f"{START}\n{body}\n{END}"` composes with LF while `core.autocrlf=true`
hands out CRLF working copies. **So after every fresh checkout the rebuilt block
differed from the stored one by line endings alone** — the script reported drift it
had caused itself, rewrote the file twelve bytes shorter, and went quiet until the
next checkout.

Harmless while nothing read it. As the `derived` gate's input it is a false red on
a clean tree, which is the failure that teaches you to ignore a gate. Both
generators now emit the newline the file already uses. Convergence re-measured:

    pass 1: social write RC=0 (21 pages) | social check RC=0 | hubs check RC=0
    pass 2: social write RC=0 (0 pages)  | social check RC=0 | hubs check RC=0
    pass 3: social write RC=0 (0 pages)  | social check RC=0 | hubs check RC=0

and `play.html` is back to `crlf=705`, its only diff the forty lines added above.
This is **P4.5** again, from a third direction: the missing `.gitattributes` is why
a generator can be correct on one checkout and wrong on the next.


## Two writers, one live region — and an assertion that could not fail (2026-08-10)

The per-guess announcement added earlier this pass was verified on a single miss.
That was not enough: `say()` assigns `textContent`, and after the change **two
observers feed the same node** — the pre-existing one on `#resultBox`, which
carries the payoff, and the new one on `#log`. A win produces both. Recorded every
value `#vh-live` took, through a real win:

    6088 ms  'guess . Alperen Sengun 2024-25 cosine 1.00 LOCK . row 11992'
    9197 ms  'Result. Alperen Sengun 2024-25 ≈ Alperen Sengun 2024-25 • cos 1.00 …'
    9201 ms  'Trajectory done … confetti 12 . karaoke-grade 1.24s . glass-click …'

**The payoff was announced and replaced four milliseconds later by telemetry.** A
polite region voices the last write, so the change made to help a blind player
would have read them "confetti 12, karaoke-grade 1.24s" instead of the answer.

Guarded: while `#resultBox` is up it owns the region. Re-measured —

    6181 ms  'guess . Alperen Sengun 2024-25 cosine 1.00 LOCK . row 11992'
    9313 ms  'Result. Alperen Sengun 2024-25 ≈ Alperen Sengun 2024-25 • cos 1.00 …'

two values, and the Result is the one left standing.

### The first assertion I wrote for this could not fail

Encoded in `smoke_play` — and the RED test refused to go red. Deleting the entire
per-guess announcement left the check **passing**, because it read `#vh-live` after
the *win*, where the `resultBox` observer fills the region regardless. It was
asserting something that was true for another reason.

Moved to the **miss** path, which is the only place that can prove it: a miss draws
no result box, so nothing else writes there.

    GREEN  spoken   miss 'guess . Caleb Houstan 2024-25 cosine -0.91 . row 12039'
    RED    spoken   miss ''    ->  RC=1

The win-side check stayed as a second assertion, for the clobbering above, with the
reason it is insufficient on its own written next to it.

### Coverage

The sweep was run on eight pages and the claim was written as "across eight pages".
Re-run across **all 22**: still zero unnamed interactive nodes and zero unnamed
images. The persona pages — where the Times New Roman bug hid — are in that set now.

### Service worker: deliberately not bumped

`index.html` changed this pass and `/` is in the worker's shell, which is the
condition that triggered the v7.2 → v7.3 bump. Not bumping, and the reason belongs
on the record rather than in silence: **that bump fired because `?v=` asset tokens
had changed**, so a cached `/` would have pointed at URLs that no longer existed.
Nothing here changed a token — `aria-hidden` is markup, `stamp_assets --check` is
clean — and the worker is network-first, so the cached `/` is only ever an offline
fallback. The cost of being wrong is that an offline visitor's tile icons announce
as unlabelled images until the next revalidation. Bumping every markup edit would
purge the shell constantly and make the version meaningless.


## Twenty seconds of nothing on the landing page's map control (2026-08-10)

Ran a static payload census over every page to find the next `/model` — a page
downloading far more than it reads. It nominated `index.html` at **5,150 KB**, more
than double anything else, with `vectors.json` at 3,696 KB.

**The census was wrong, and its own docstring said it would be.** It reads
`fetch()` literals and cannot see when they run. Measured in the browser instead:

    /index.html   Fast 3G, cold cache
    embedding_map_points_limited.json   455 → 2164 ms   273.5 KB
    TOTAL                                                325.5 KB
    map has ink                          2188 ms

The landing page is lean. `loadFull()` — the 3.6 MB — is called from exactly one
place: `$('b8k').onclick`. A shortlist is not a verdict; 15× off, in the safe
direction, and only because the browser was asked.

### What the browser did find

The button that fetch sits behind:

    $('b8k').onclick = async () => { await loadFull(); $('b8k').classList.add('on'); … }

State is set *after* the await. Pressed it on Fast 3G and sampled every two
seconds:

     2.0s  label='8k'  class=''    1764 pts
     …
    18.0s  label='8k'  class=''    1764 pts
    20.1s  label='8k'  class='on'  12966 pts

**Twenty seconds in which nothing whatsoever changed** — no label, no
`aria-busy`, no point count — and then the map redrew. The only honest reading of
that page is that the press did not register, and the reasonable response is to
press again. `loadFull()` had no guard, so **every press started another 3,784,565-byte
download.** Its `catch(e){}` returned nothing either, so a failed fetch and a slow
one were indistinguishable, and the handler flipped the button to "on" over a cloud
that had not changed.

Three things, all measured after:

    300 ms after the press   label='8k…'  aria-busy='true'
                             announced 'Loading the full cloud — 12,966 points,
                                        a 3.6 megabyte download.'
    second press mid-load    vectors.json requests: 1
    on completion            class='on'   announced 'Full cloud drawn — 12,966 points.'
    third press once loaded  requests still 1

`loadFull` returns a boolean and memoises; the handler sets state before it awaits
and restores on either outcome; failure says so out loud instead of pretending.
`index.html` already had `#ixLive`, so the announcement had somewhere to go.

### Worth keeping

The census stays useful — it is how the shortlist got made — but it belongs in
scratch, not in `scripts/`, because a tool that reports 5,150 KB for a 325 KB page
is a false alarm generator if anyone treats its output as a finding. The rule it
earned: **a static reader can tell you what a page names, never what it runs.**
Both of this session's payload wins were confirmed in a browser before a line
changed, and this is the case where that discipline saved the work rather than
merely documenting it.


## The failure path I described but never ran (2026-08-10)

The 8k fix above claimed "a failure says so instead of pretending". Nothing had
made it fail. `loadFull()` awaits **twice**, so there are two failure paths, and
only the first was the one I had in mind.

**Blocking `vectors.json`** — the first await — behaved as claimed: 1,764 points
still drawn, button not `on`, label restored, `aria-busy` cleared, and the region
saying so.

**Blocking `points_limited`** — the second await — did not:

    dots.length  12966        button class ''
    'The full cloud could not be loaded. Still showing the 1,764-point map.'
    '12,966 player-seasons are now on the map.'

Three things wrong at once. `dots.length=0` and the repopulate ran *between* the
two awaits, so a failure on the second left **12,966 uncoloured points on screen**;
the button said not-loaded over a loaded map; and my own failure sentence named a
1,764-point map that was not what anyone was looking at. Then the accessibility
layer's poller — which watches `dots.length` on an interval, by its own comment
"cheaper and less brittle than patching loadFull()" — saw the count change and
announced the success line last, over the failure.

Both files are fetched with `Promise.all` now, the new array is built in full, and
`dots` is only swapped once both have arrived. A throw at either await leaves the
map exactly as it was, which is what makes the sentence true when it is said.
Re-measured at the authoritative level rather than off the fps label, which lags:

    second-fetch failure: dots.length 1764 -> 1764   button class ''
      'Loading the full cloud — 12,966 points, a 3.6 megabyte download.'
      'The full cloud could not be loaded. Still showing the 1,764-point map.'

Two announcements, both true, and the poller stays quiet because nothing changed.
The completion line counts `dots.length` now instead of carrying a typed 12,966 —
the same rule as the model-zoo heading.

### Service worker: not bumped, same rule as `019ba589`

`index.html` changed again and `/` is in the shell. **Not bumped**, and stated
rather than left silent: no `?v=` token changed — `vectors.json?v=14872103` is
untouched — `stamp_assets --check` is clean, `.html` is served
`max-age=0, must-revalidate`, and the worker is network-first, so the cached `/`
is only ever an offline fallback. That is the same test applied at `019ba589`, and
writing it down each time is what stops two rules existing.

### Still measured-once: the 8k control has no assertion

`smoke_render` only renders the page. Delete the busy-state block, the re-entry
guard or the all-or-nothing swap and **nothing goes red.** The probes that proved
each of them live in scratch. This is the same gap named for the per-guess
announcement one pass ago, and that one was closed the same day — this one is not.
`scripts/probe_8k2.py` logic is most of a check: press, assert `aria-busy` inside
500 ms, assert one request across two presses, block the second fetch and assert
`dots.length` is unchanged. **Open, and named here rather than left implicit.**


## The 8k control is enforced now, and two of its six assertions were hollow (2026-08-10)

Named as open last pass: delete the busy state, the re-entry guard or the
all-or-nothing swap and nothing on this repo would go red. `scripts/smoke_index.py`
closes it — the landing page's one control that does real work, pressed under a
~6 Mbit/s throttle so the busy window is a real interval rather than a race.

Writing the check was the easy half. **Proving it can fail found two assertions
that were worth nothing**, by mutating one behaviour at a time and requiring the
smoke to notice:

    busy state                  RC=1   caught
    label change                RC=1   caught
    re-entry guard              RC=1   caught
    memoisation                 RC=1   caught
    counted completion line     RC=0   *** NOT CAUGHT ***
    atomic swap                 RC=0   *** NOT CAUGHT ***

**The counted-announcement assertion was passing on somebody else's text.** The
page has a second announcer — an interval watching `dots.length` — that writes
after the button's own completion line and replaces it. The check read whatever was
left in the region, found "12,966" in the *interval watcher's* sentence, and passed
with the button's line deleted. Now it records every value the region takes and
looks for the button's own line in that sequence. This is the third assertion this
session to pass for a reason other than the one it was written for.

**The atomic-swap row proved nothing because my mutation was a no-op** — it
appended a comment. A mutation that does not change behaviour tests the harness,
not the code, so the runner now refuses to score a mutation whose text matches the
original. Rewritten to reintroduce the real shape of the bug — split the
`Promise.all` and mutate the map before the second fetch — it is caught, with the
message naming the number: *"a failure partway through left the map at 12966 points
instead of 1764."*

All six now:

    busy state / label change / re-entry guard / memoisation
    counted completion line / atomic swap        RC=1   caught

and `index.html` restored byte-identical afterwards.

Two process notes worth the space. The mutation anchors are multi-line, and this
checkout is CRLF, so the first run reported ANCHOR NOT FOUND on the only mutation
that mattered — **a multi-line anchor is a line-ending assumption in disguise**,
which is the same trap the two generators had. And I wrote a literal newline into a
Python file twice by routing `
` through a shell heredoc, which the ledger already
warns about; the Edit tool fixed in one move what the heredoc broke twice.


## Next: product depth on phases 4 and 5, starting with a measurement (2026-08-10)

Three firings in a row have ended in verification infrastructure — the derived
gate, the live-region assertions, now the map-control smoke. Each was a named open
item and each is closed, so the enforcement debt is paid. **Carrying on in that
direction would be following the gradient rather than the brief.**

Phases 4 and 5 — player cards and dictionary, team and front office — have had the
least product depth. And there is a thread already open in them: the payload census
shortlisted

    player-cards.html    25K html + 569K fetched    wiki_index.json 539KB

and **that was never checked in a browser.** It is exactly the question that found
`/model` downloading 1.1 MB to draw an 8 KB table, and the one that stopped me
"fixing" a landing page that turned out to be 15× lighter than the census claimed.
Eager or lazy is a two-minute measurement and it decides whether there is anything
there at all.

Start there next, not at another gate.


## The search that downloaded its index five times (2026-08-10)

Followed the board's own next-step rather than looking for a new one. The census
had shortlisted `player-cards.html` at 569 KB fetched, `wiki_index.json` 539 KB,
never checked in a browser. **Checked: 30.4 KB on load.** The index is lazy, the
census was wrong a second time, and that shortlist is settled rather than carried.

The interesting thing was the gap it left. `assets/wiki_index.json` arrives only
when someone uses the search, which is the page. Typing during that wait, Fast 3G:

           t     rows   opts  first result
        0.0s        0      0  ''
        ...
       12.0s        5      5  'Seth Curry2015-16 - 2024-25'

    wiki_index.json requests for five keystrokes: 5

**Twelve seconds under a search box with nothing on screen, and five downloads of
the same 539 KB file.** Two causes, each a line long.

`loadIndex()` memoised the *result*:

    if(IDX) return Promise.resolve(IDX);

`IDX` is null for the entire flight, so focus plus five keystrokes entered it six
times and started six fetches, which then contended for one pipe — that is what
turned a 2.7-second download into twelve. It holds the **promise** now.

And the loading message existed the whole time, unreachable:

    function search(){
      if(!IDX){ $('hits').innerHTML='<li class="sub dim">Loading index...</li>'; return; }

with its only caller written

    $('q').addEventListener('input',function(){ IDX?search():loadIndex(); });

**The caller guarded on exactly the condition the callee was written to handle**,
so the branch could not be reached by typing. The right words sat three lines from
the empty list they were meant to fill. The handler calls both now.

           t     rows   opts  first result
        0.0s        1      0  'Loading index...'
        2.4s        5      5  'Seth Curry2015-16 - 2024-25'

    wiki_index.json requests for five keystrokes: 1

**12.0s to 2.4s for first results, and the wait is explained while it happens.**
The loading row is `role="presentation"` and leaves `aria-expanded` false: `#hits`
is a listbox, and an unroled `<li>` in one reads as an option a screen reader can
choose, which a status line is not.

### Enforced the same day

`scripts/smoke_cards.py`, mutation-tested like the last one:

    promise memo                RC=1   caught
    loading branch reachable    RC=1   caught
    search on resolve           RC=1   caught

Three for three, no hollow assertions this time, and `player-cards.html` restored
to exactly the intended diff afterwards.

### P4.5 paid for itself

`git status` reported `player/index.html` modified. `git diff --numstat` reported
nothing, and nothing is right — it is the CRLF stat artifact recorded under P4.5
two passes ago. **The note stopped me investigating a change that did not exist**,
which is the whole point of having written it down.


## The search's failure path, run rather than asserted (2026-08-10)

The catch added an hour earlier gained three behaviours and none had been
executed: `IDXP=null` so a later keystroke can retry, a spoken failure, and
`role="presentation"` on the error row. **"Cleared so a later keystroke can retry"
was committed as a code comment, which is a claim.** The last two unmeasured
failure paths on this branch turned out to hold three faults and a clobbered
announcement respectively, so:

    A: index blocked
      rows       [{'role': 'presentation', 'text': 'Index unavailable (Failed to fetch).'}]
      options    0   aria-expanded='false'
      announced  'The player index could not be loaded.'

    B: block lifted, one more edit
      requests   0 -> 1     (the second request is what proves IDXP was cleared)
      options    5   aria-expanded='true'
      first row  {'role': 'option', 'text': 'Seth Curry2015-16 - 2024-25'}

All three hold. Nothing to fix — which is worth saying plainly, because the value
of running it was never conditional on finding something.

**My probe manufactured a false negative first.** Phase B appended `x`, leaving
the query as `curryx`, which honestly matches nobody — and the probe read zero
options as a broken retry. The retry had worked; the query was wrong. Same shape
as the synthetic keypress that made Enter look broken on this very page months of
notes ago: *when a probe says the code is wrong, suspect the probe first.*

Folded into `smoke_cards.py` as two more assertions, and the mutation that proves
them — deleting `IDXP=null` from the catch — is caught, with a cascade I had not
predicted:

    retry after failure   RC=1   caught
      - with the index blocked the results list shows 'Loading index…'
      - typing again after a failed index started no new request

Without the clear, the next keystroke gets the settled promise back, `search()`
runs with `IDX` still null, and the *error message is overwritten by the loading
message* — so the page would sit forever claiming to be loading something it had
already given up on. Four mutations, four caught.

## An anchor that drifted from its own content

`READINESS.md` opened "measured at `159c90ac`" while the content beneath it — the
player-search section included — was three commits newer. The cause is visible in
this session's own transcript: a compound command carrying the anchor bump failed
on shell quoting, and the rewrite carried the board note and the verify-list row
but **not the bump**. A retry after a failure has to carry every edit the original
had, not the ones that were easiest to remember.

`scratch/sync_readiness.py` now derives sha, commits, paths, insertions, deletions,
script count and board length from git in one run and writes both halves from the
same numbers. They cannot drift apart by being updated on different days, and
moving the anchor necessarily refreshes everything under it.

## Service worker: not bumped, same test as `019ba589`

`player-cards.html` changed and its inline JS with it. **Not bumped**, stated
rather than left silent: no `?v=` token changed — `wiki_index.json?v=4e63a03b` is
untouched — `/player-cards` is not in the worker's three-entry shell, `.html` is
served `max-age=0, must-revalidate`, and the worker is network-first. Third time
this decision has come up and the third time the same test decided it; writing it
down each time is what keeps it one rule.


## Change your mind on a player card and it changes it back (2026-08-10)

The remaining lazy fetch on `/player-cards` is the card open itself. It already
had the two things that make a wait bearable — a "Loading <name>…" placeholder and
a 404 path that names the missing file — so the expectation was that it would
settle itself. The thing nobody had asked was what happens when a visitor opens
**two** cards.

`open(path, push)` writes the card body, `document.title`, a `history.pushState`
entry and the spoken announcement, all unconditionally in `.then`. **No sequencing
guard**, so the request that finishes last wins whichever one was asked for last.

Cards are 2.6-5.4 KB, too close for jitter to decide a test reliably, so one
request was held for three seconds deliberately — a controlled version of what an
unlucky link does to a single resource. Click Vince Carter, change your mind,
click Gerald Brown:

    1s later   card 'Skills Lens - 1998-99'  title 'Gerald Brown'   url '?p=gerald-brown'
    5s later   card 'Skills Lens - 2000-01'  title 'Vince Carter'   url '?p=vince-carter'
               announced 'Vince Carter card loaded.'

**Three seconds after settling on Gerald Brown you are on Vince Carter**, and the
`pushState` ran after the visitor had already navigated away — so Back now goes to
a page they never chose. The announcement tells a non-visual visitor the same
wrong thing.

A sequence number, checked in both `.then` and `.catch` — a stale *failure* must
not replace a card someone has since opened either:

    var mine=++openSeq;
    ...
    if(mine!==openSeq) return;

Re-measured, same race:

    5s later   title 'Gerald Brown — Vector Hoops'  url '?p=gerald-brown'
               announced 'Gerald Brown card loaded.'

### Enforced, and the matrix is five for five

`smoke_cards.py` now races two cards with the same deliberate hold. Mutations:

    promise memo                RC=1   caught
    loading branch reachable    RC=1   caught
    search on resolve           RC=1   caught
    retry after failure         RC=1   caught
    card sequence guard         RC=1   caught

The new one reports it in the words that matter: *"a card the visitor moved away
from replaced the one they chose — title 'Vince Carter'"*.

### The pattern this makes three of

Three defects this session were the same shape: **two writers, one surface, last
write wins.** The game's live region (the payoff announcement clobbered 4 ms later
by telemetry), the landing page's point count (a poller announcing success over a
failure), and now the card view. None was visible in a screenshot, in a gate, or on
a fast link. All three needed the same question — *what if the slower one arrives
second?* — and none of them would have been asked by looking at the code alone,
because in each case the code reads correctly right up until you time it.


## The guard I wrote proactively, then published as enforced (2026-08-10)

The card race fix guarded both `.then` and `.catch` — the second with a comment
saying "a stale failure must not replace a card the visitor has since opened."
Good instinct, and **by this branch's own rule that comment was a claim.** The race
phase held a request that *succeeds*; nothing produced a stale failure, the
mutation matrix deleted only the `.then` guard, and `READINESS.md` had already gone
out saying a sequence number "guards both the success and the failure path…
Enforced." A reader takes that to cover two things. It covered one.

Delaying vince-carter **and** blocking it makes the held fetch reject at three
seconds instead of resolving, which is the missing case exactly:

    clicked first   'Vince Carter'   (held 3s, then fails)
    clicked second  'Gerald Brown'

    5s later   title 'Gerald Brown — Vector Hoops'  url '?p=gerald-brown'
               body  '1998-99 – 1998-991 seasonSGPlaymaking + Steals…'
               announced 'Gerald Brown card loaded.'

    a stale 404 replaced the open card: False

The guard holds. **Nothing to fix, and that is not the point** — the claim was
published before it was true, and it is one line's difference between a guard that
works and a guard that was never run. Folded in as a seventh assertion; the matrix
is now six for six, the new mutation reporting *"a card that failed to load
replaced one the visitor had already opened."*

## Worker bumps: a standing rule instead of a remembered sentence

Four commits in a row have changed a page's inline JS and had to decide whether to
bump the service worker, and the decision went unstated in two of them. It is the
same test every time, so it belongs in `READINESS.md` once rather than in each
commit from memory:

**The worker is bumped when a `?v=` asset token changes, or when a page in the
three-entry shell (`/`, `/offline`, `/manifest.json`) changes. Nothing else.**
`.html` is served `max-age=0, must-revalidate` and the worker is network-first, so
a page edit reaches visitors without one. That is the `019ba589` test; from here a
commit cites it rather than re-deriving it.

`player-cards.html` this pass: no token changed, not in the shell, **not bumped.**

## Next: sweep for the shape instead of tripping over it

Three defects this session have been one shape — **two writers, one surface, last
write wins**: the game's live region, the landing page's point count, the card
view. The board note above says none is findable by reading. That is true of the
*defects* and false of the *candidates*: a user-triggered `fetch(...).then(...)`
that writes `innerHTML`, `textContent`, `document.title` or `pushState` **without a
sequence or generation guard** is a grep, and the browser decides each one.

That sweep is also the natural way into phase 5, which has had the least product
depth of anything in the brief. `/teams` is the least-examined interactive page —
`chemistry.json` at 103 KB, eager-vs-lazy never checked, and sorting plus filters
as its primary controls.

**Next step: grep for the shape across the live pages and loaded assets, shortlist,
then let the browser settle each — starting on `/teams`.** The same census-then-
browser discipline that has been wrong twice about payload and right every time
about behaviour.


## The sweep the board asked for, and what it actually took to run (2026-08-10)

Board's next step was: grep for the two-writers shape, shortlist, let the browser
settle each, starting on `/teams`.

**The grep worked. The narrowing step did not.** Restricted to live code — 22 pages
and the four assets they actually load, because eight of the ten modules that once
looked relevant are loaded by nothing — 14 fetch chains write the page and none
carries a guard a regex can see. But a fetch that runs once at load cannot race
itself, so the list is only useful once narrowed to *what a visitor can trigger
twice*, and the enclosing-function regex attributed those fetches to `resize`,
`say`, `rows` and `esc2`. Those are plainly not the functions; it takes the nearest
declaration above, which in this code style is usually an unrelated helper.

**So the static half stopped being useful exactly where it mattered**, and rather
than build on it, the browser was asked instead: load each page, count requests,
operate every button and select twice, count again.

    /teams.html          0 controls found     no data re-fetched
    /model.html         10 controls           no data re-fetched
    /players.html       87 controls           embedding_map_points_limited.json  8 extra
    /owner/index.html    0 controls found     no data re-fetched
    /trends.html        38 controls           no data re-fetched

Two things in that table. One real signal on `/players`. And **`/teams` and
`/owner` reporting zero controls is my probe's gap, not a fact about those pages** —
their sort headers are `<th>`, and the selector was `button, select, [role=button]`.
Recorded so the next pass does not read those two rows as coverage.

## The filter that re-downloaded its own data

`loadPts(f)` fetched the 273.5 KB point file on every call, assigned `allPts`, then
filtered — and both filter buttons called it. Measured on Fast 3G:

    click 1 fCur  250ms after: button=Current  map says 'all • 1764 pts'
                  settled:     button=Current  map says 'current • 532 pts'
    ...
    273.5 KB downloaded 4 time(s) for four clicks

**1.07 MB to filter a list the page had already parsed**, and because the class and
`aria-pressed` flip synchronously while the redraw waits on the network, the button
said Current for about two seconds while the map still said `all • 1764 pts`, with
nothing on screen explaining the gap.

Filtering is a property of data in memory. One fetch, held as a promise so
overlapping presses share it, then a synchronous redraw:

    273.5 KB downloaded 0 time(s) for four clicks
    click 1 fCur  button=current  map says 'current • 532 pts'   (at 250ms)

The lag window is gone rather than shortened, because there is no longer anything
to wait for — which also removes the possibility of two filter responses landing
out of order.

**A race was NOT demonstrated here, and I am not claiming one.** Clicking Current
then All 150 ms apart ended correctly on All both before and after the change:
equal-sized responses generally complete in order. The card race needed a
deliberate hold to expose it; this one was never shown, so the fix is justified by
the 1.07 MB and the two-second contradiction, not by a race I did not see.

### My probe reported the wrong thing first

The first run said `button=All` for all four clicks, including immediately after
pressing Current. The check was `className.indexOf('on')>=0` — and **"mono"
contains the letters "on"**, so every button matched. `classList.contains('on')`
fixed it. Same family as the season-chip regex that matched unseparated chips, and
the reason the rule is *suspect the probe first*: the reading that looked like a
finding was mine.

Enforced by `scripts/smoke_players.py` — no requests for four presses, and the map
agreeing with the button a quarter-second after each. Restoring the old code turns
both assertions red.


## Phase 5, and three times my own instruments lied (2026-08-10)

Last pass recorded a gap of my own making: the re-fetch probe reported **0 controls**
on `/teams` and `/owner`, and that was the selector — `button, select, [role=button]`
— not the pages. Their sort headers are `<th>`, and on `/teams` they do not even
exist in the static markup, because `draw()` builds the whole table each time.

Widened to include `th[data-k]`, `summary`, `input` and anything focusable:

    /teams.html        15 control(s) operated twice each   no data re-fetched
    /owner/index.html   9 control(s) operated twice each   no data re-fetched

**Gap closed, and the answer is a negative.** Nothing on either page re-fetches.

### The sort state, which is the thing those tables are for

`aria-sort` is name/role/**value** — the same criterion behind the Explorer filter
fix, where the active state was visible to eyes and to nothing else. Measured by
clicking headers and reading every `<th>`:

    /teams.html     at rest  [('#', 'ascending')] of 12 headers
                    caption  'Front-office rating for all 30 teams, sorted by #.'
                    clicked Team  -> [('Team','ascending')],  caption follows
                    clicked W-L   -> [('W-L','descending')],  caption follows

    /owner/index.html  at rest  [('FOR','descending')] of 9 headers
                       clicked W 25-26  -> [('W 25-26','descending')]

**Both correct**, including `/owner`'s default — `sortKey='for_final'` is COLS[8],
and the header for it really does announce `descending` before anything is clicked.
`/teams` goes further than the spec asks and names the current sort in a caption.

### What was actually missing

`/owner`'s table had **no caption and no `aria-label`**. A screen reader announced
nine columns and thirty rows of nothing in particular, while its sibling page names
its table and its sort. Added in the same pattern, counted from the rows drawn
rather than asserting thirty:

    at rest              '30 teams by spend and front-office rating, sorted by FOR, descending…'
    after clicking W     '30 teams by spend and front-office rating, sorted by W, descending…'

### Three instruments, three wrong readings

Worth putting together, because the pattern is now the main risk in how this work
is done:

  * the enclosing-function regex attributed fetches to `resize`, `say`, `rows` and
    `esc2` — it takes the nearest declaration above, which in this code is usually
    an unrelated helper
  * `className.indexOf('on')` reported every filter button as active, because
    **"mono" contains "on"**
  * this pass, `at rest [...][:5]` printed the first five headers of nine and made
    `/owner` look like it announced no sort at all — the marked header is the ninth

None of those was a defect in the site. All three looked like one. **The rule that
keeps earning its place: when an instrument says the code is wrong, check the
instrument first** — and print what you are asserting on, not a prefix of it.


## "How it works" did nothing (2026-08-10)

`check_frontend`'s `links` check has resolved every internal link on this branch
since it was written. Its pattern is

    RE_LINK = re.compile(r'href=["\'](\.?/?[\w\-]+\.html)(?:[#?][^"\']*)?["\']')

— it captures the **file** and treats `#anything` as optional trailing noise. So
`/dictionary.html#retrieval` has always passed on the strength of the file
existing, whatever is or is not inside it. **36 fragment links across 22 pages, and
none of them had ever been checked.**

Two do not resolve, both on the landing page:

    <a class="site-nav__link" href="#games">Games</a>
    <a class="btn btn-xl" href="#model">How it works</a>

The second sits beside "Play today's Vector Hoops →" as the other half of the front
door's call to action. `index.html` builds markup with `innerHTML`, so the ids could
have appeared at runtime — they do not:

    after the page has run:
      #games    getElementById=False  name-anchor=False
      #model    getElementById=False  name-anchor=False

    clicking each:
      Games          scrollY 0 -> 0   location.hash='#games'
      How it works   scrollY 0 -> 0   location.hash='#model'

The page is 1,895px tall, so there was somewhere to go. **Both links wrote a
fragment into the address bar and left the reader where they were.**

### Where they now point, and why not an invented anchor

The page has six cards and no games section, so there is no honest `#games` target
to create. Both labels already have real destinations that the nav itself uses:
`Model → /model.html` is the page that answers "how it works", and the nav's own
CTA is `Play today's → /play.html`. Pointing the two links there uses what exists
rather than minting anchors to justify the links.

**Worth flagging as yours:** the nav now has "Games" and "Play today's →" both
going to `/play.html`. That is redundant, and whether "Games" should exist as a
separate item at all is a product call. A dead link is not — that part is not a
judgement.

### The gate

`check_frontend` gained a **`fragments`** check: every fragment link must name an
element that exists in the served markup. Thirteen checks now. Shown failing before
it was allowed to pass, by repointing the dictionary's skip link:

    FAIL — dictionary.html links to '#nowhere-at-all' but no element in
      dictionary.html has id='nowhere-at-all' — the link writes a fragment into the
      address bar and leaves the reader where they were

Ids are read from the served markup, so a target built at runtime would read as
missing. None is today. That is a limit worth stating rather than hiding: a loud
failure is the right way to learn it changed.

### The comment that broke my own audit

After fixing both hrefs the audit still reported them unresolved — because the note
explaining the change quotes `href="#games"`, and the scan read the comment as a
link. **This is the third time on this branch that a comment quoting markup has been
counted as markup**; `check_frontend` already carries `without_comments()` for
exactly this, learned when a comment quoting `<input id=guess>` was counted as a
second declaration of that id. The new check uses it. The scratch audit now strips
comments too.


## Nobody had pressed Back (2026-08-10)

`/player-cards` keeps its state in the query string. `open()` calls
`history.pushState({path},'','?p=slug')` and a handler reads it back:

    window.addEventListener('popstate',function(){
      var t=fromUrl(); if(t) open(t,false); else { $('cardWrap').hidden=true; }
    });

Every control on this site has now been driven except the browser's own. It is
worth more than usual here: the card race showed its symptom in this exact
mechanism — a `pushState` that ran after the visitor had navigated away — and a
card reopened by Back goes through the `open()` that now carries a sequence guard.

Two paths, both driven. **A shared link works**: arriving directly at
`?p=vince-carter` loads the card, sets the title, and shows it. **Back and Forward
work** as navigation. What did not:

    Back     url ''   hidden=True   title 'Vince Carter — Vector Hoops'

The card was gone and **the tab still named it.** `open()` rewrites
`document.title`; the `else` branch hid the card and put nothing back — not the
title, and not an announcement, so a non-visual visitor was told when a card opened
and nothing at all when it went away.

A title is what the tab shows, what a bookmark saves, and what a screen reader
reads on navigation. Restored from the value the page arrived with, and the close is
announced for the same reason the open is:

    Back     url ''   hidden=True   title 'Vector Hoops — Player cards'
             announced 'Card closed.'
    Forward  url '?p=vince-carter'  title 'Vince Carter — Vector Hoops'
             announced 'Vince Carter card loaded.'

### The matrix is eight for eight

`smoke_cards.py` now presses Back too, and both new behaviours have a mutation:

    promise memo / loading branch / search on resolve / retry after failure
    card sequence guard / stale-404 guard
    title restored on Back      RC=1   caught
    close announced             RC=1   caught

The last two report it in the words that matter — *"the card is gone and the title,
the bookmark and the screen reader all still name it"*, and *"a non-visual visitor
is told when a card opens and nothing when it goes away."*

### Why this path was worth driving at all

Nothing about it is exotic. Open a card, press Back — that is the second thing
anyone does on a page that changes the URL. It survived every gate, every smoke and
an accessibility-tree sweep because **all of those look at a page in one state**,
and this is a defect that only exists in the transition between two.


## The one modal on the site (2026-08-10)

The Back-button defect said something general: **every gate looks at a page in one
state, and this one only existed in the transition between two.** A modal is the
same shape. `/play.html` has the only one — the share overlay — and it is on the
page the brief puts first.

It was a `div` with a class on it. `pop.classList.add('on')`, `.remove('on')`, and
a click on the backdrop. Driven in a browser with real key events, after a real win:

    closed      focusable-and-visible inside overlay: 0
    opened      focus BUTTON#btnShareCard   (still behind the overlay)
    Tab 1       BUTTON#btnGlass2            behind it
    Tab 2       BUTTON#btnNext2             behind it
    Tab 3       BUTTON#closeShare           in dialog
    Escape      still open
    closed      focus BODY

Five things wrong, one thing right. Right: closed, the overlay is `display:none`, so
nothing inside it is a phantom tab stop — the worst version of this bug is absent.

Wrong: **focus never entered.** The visitor is left on a button behind a
`rgba(8,10,15,.74)` backdrop with a 10px blur. **Tab then walked the page behind
the card** — and the second control it reached is `Next Q →`, which advances the
game underneath the card the player is still looking at. Three tabs to reach Close.
**Escape did nothing**, the one key everyone tries. And **closing dropped focus to
`<body>`**, so the next Tab restarted at the skip link at the top of the document.
No `role`, no `aria-modal`, no name — a screen reader was never told a dialog opened.

Now: `role=dialog`, `aria-modal=true`, named; focus moves in on open, Tab wraps
inside, Escape closes, and the opener gets focus back.

    opened      focus BUTTON#closeShare   inside=True   name 'Share this result'
    tab walk    closeShare → closeShare → closeShare → closeShare
    Escape      open=False   focus BUTTON#btnShareCard

The card itself is a `<canvas>`, which reaches a screen reader as "image" and
nothing more. It is named at draw time from the same variables the picture is drawn
from — the same rule as the per-guess announcement, so what is heard and what is
drawn cannot drift apart.

### The assertion that passed with the trap broken

`smoke_play.py` gained the check, and the mutation matrix caught five of six. The
miss is worth more than the five:

    Tab stays inside     RC=0   *** NOT CAUGHT ***

The mutation removed the wrap branch, so Tab **did** leave — onto a footer link.
But the trap has a catch-all for focus found outside, and that hauled it back on the
*next* Tab. The assertion read the state after two presses, so it saw focus inside
and passed. **A visitor experiences each keystroke, not the last one.** The check now
records where focus is at every press and fails on the first stray:

    tab walk BUTTON#closeShare → BUTTON#closeShare → BUTTON#closeShare → BUTTON#closeShare
    - tabbing inside the share card reached A, which is behind the overlay

Six for six after that. That makes four assertions this session that passed for a
reason other than the one they named, every one found by mutating the code rather
than by reading the test.


## The page said "offline capable" (2026-08-11)

`/play.html` prints it on the Daily Q card. Nothing on this repo had ever pulled
the plug, so the claim had never been true or false — only printed.

**Two things had to be right before the measurement meant anything**, and the
first two runs got both wrong in the flattering direction.

`Network.emulateNetworkConditions {offline:true}` is **per-target, and a service
worker is its own target.** The page went offline; the worker's `fetch()` did not.
That run reported a perfectly playable game — the worker was still talking to the
server. Stopping the server is the only version of "the network is gone" that is
true for every target at once.

And a bare `SimpleHTTPRequestHandler` **sends no `Cache-Control` at all**, so
Chrome heuristically cached the HTML and served it offline on its own. Production
sends `max-age=0, must-revalidate` on every `.html`, which forbids exactly that,
and `immutable` on `/assets/*`, which genuinely does survive. Both are mirrored
from `vercel.json` now: a server that serves a different site than production
makes every offline measurement meaningless.

With both fixed:

    title    'Vector Hoops — Offline'
    question NO #q

The shell was three entries — `/`, `/offline`, `/manifest.json` — and `/play` was
not one of them. **The one page advertising offline play served the offline
notice.**

### Why not just add the path

Every page loads four `?v=`-stamped scripts and a stamped stylesheet, and
`stamp_assets.py` re-hashes those whenever an asset changes. A hardcoded SHELL
rots at the next deploy — which is exactly how v7.1 shipped a worker that never
installed at all.

So the fill happens at runtime: a same-origin GET that comes back 200 is copied
into the cache under its exact stamped URL. New tokens miss and go to the network,
which is what they are for, and `activate` purges the lot on a version bump.

**Documents and code, not data.** `.json` keeps its exemption — a stale model asset
must never be served — and `.f32`/`.bin` join it: immutable, large
(`mtnn_embeddings.f32` alone is 3.2 MB) and already held by the HTTP cache for a
year, so a second copy buys nothing.

    online   controlled=True  names=1305 pool=1305 ink=19676
    cache    ['hoops-v7-4'] holds 10 entries, 0 of them data files
    offline  'DUMB MODEL — Play Past→Modern'  names=1305 pool=1305 ink=19676
    unseen   /teams offline lands on 'Vector Hoops — Offline'

### The fallback that was two tiers pretending to be three

    caches.match(e.request).then(r => r || caches.match('/offline') || caches.match('/'))

`caches.match` returns a **Promise**, and a Promise is always truthy — so the last
tier could never be reached, and a miss on the first resolved to `undefined`.
`respondWith(undefined)` is the browser's error page, not a fallback. Now a loop
that awaits each tier in turn.

### What the offline page was telling people

The page a visitor lands on when their connection dies is the page whose entire
job is describing this cache, and it was carrying:

- **"This page is 9965 bytes"** — it is 11,576. A self-referential number that
  cannot stay true; deleted rather than corrected.
- **"offline shell &lt;28k instant"** — never checked, unrelated to anything the
  worker does.
- **"Core only playable offline"** — false in exactly the way measured above.
- a **DENY7** list of asset sizes (2.6MB props, 141K valuation, 9.9MB matchup…)
  that nothing had verified. Unverified numbers on screen are the one thing this
  branch does not ship, so they are gone rather than re-derived.

Twelve replacements, and `check_frontend`'s `worker` check caught the thirteenth
before it landed: the new copy read `cache hoops-v7-4.` and the check reported the
trailing full stop as a wrong cache name.

### The promise now has a gate

`worker` gained a second half. sw.js says what it will not cache in a regex;
offline.html says it in a sentence; nothing tied them together. It now reads the
extension list out of `const DATA` and out of the clause ending "are never cached",
and requires the two sets to be **equal** — because the dangerous direction is
someone narrowing the regex while the page still promises the file is safe.

The first version of that check only caught the harmless direction. Shown failing
on the real one:

    - offline.html promises ['.bin', '.f32', '.json'] are never cached and sw.js
      exempts ['.json'] — the mismatch is a promise about a visitor's model data
      that the worker is not keeping

`scripts/fix_offline_claims.py` is deleted. It was a one-shot string migration for
the previous correction; its "before" strings no longer exist and its "after"
strings have now themselves been rewritten, so it exited 1 with seven MISSes and
could never be run again. What replaces it is a check that derives, not a script
that remembers.

`scripts/smoke_offline.py` is new: three assertions, three mutations, three caught.


## 201 links paid a redirect, and after yesterday they cost more than that (2026-08-11)

`vercel.json` sets `cleanUrls: true`. sw.js's own header records the measurement
against the live site — `/index.html 308`, `/offline.html 308` — so every internal
link ending in `.html` is a redirect before the page starts. There were **201**,
across 23 pages.

A round trip per click was the cheap half. The worker started filling its cache at
runtime yesterday, and **that cache is keyed on the request URL**:

    navigating to /model        1 document request   ['/model']
    navigating to /model.html   2 document requests  ['/model.html', '/model']

    offline, /model             lands on 'Vector Hoops — Model Zoo …'
    offline, /model.html        lands on 'Vector Hoops — Offline'

A visitor with the page **already cached** was shown the offline notice, because of
how the link was written. The offline capability shipped one commit earlier was
defeated by 201 links written before it existed.

### The sweep

188 hrefs rewritten — attribute values only. The pages quote paths in prose and in
code samples (sw.js's own SHELL history, the dictionary's examples), and rewriting
those would falsify text rather than fix a link. One of the 188 is in
`assets/error-boundary.js`: the "Offline mode →" link on the error panel, which is
the one link on the site most likely to be clicked while offline.

That JS change moved every page's `?v=` token, so `stamp_assets.py` re-stamped 21
files and the worker went to `hoops-v7-5` — the old cache was filled under URLs
that no longer exist.

### Two checks, one of which I broke writing the other

`clean` is new: no internal href may end in `.html`. Shown failing first, on the
real thing — 156 findings across 23 pages — then green, then failing again after
putting a single `.html` back.

`links` had matched `href="…\.html"` since it was written, which was every internal
link on the site until this commit. The moment they lost the extension it matched
nothing:

    links:
      0 internal link(s) resolve

**A green line for work it was no longer doing.** It reads whole hrefs now and
resolves them the way cleanUrls does — `/model` is `model.html` if that exists,
otherwise `model/index.html`, and a real file like `/manifest.json` is served as
itself. It checks **237** links, up from 146, and fails on a broken one:

    - teams.html links to /nonexistent-page, which the site does not serve

`fragments` had the same resolution bug in the other direction: it turned every
extensionless path into `…/index.html`, so the six `/dictionary#…` deep links went
looking for their targets inside `index.html` and reported as broken the moment the
`.html` came off. Fixed to prefer the file.

`smoke_offline.py`'s server now emulates the 308 as well as the headers. Serving
both URL forms with a 200 would hide this entire class of bug from every assertion
in it.

**That is now three times in three days that a checker reported success while
measuring nothing** — the live-region read after a win, the counted announcement
that matched a different announcer's sentence, and this. All three were found by
changing the code under the check rather than by reading the check.


## The page said there was no Curry (2026-08-11)

Phase 2. `/trends` is the change-over-time research, and the section headed **"Who
is the modern version of…?"** has the page's one text input. Typing `curry` into it:

    No charted career by that name with at least four seasons.

`assets/eratwins.json` holds **five**: Dell, Michael, Eddy, Stephen and Seth. The
matcher was `k.indexOf(v)===0` — a prefix test against the **whole name** — so a
surname could never match anything. A surname is how anybody types a basketball
player, and telling someone a career is not charted when it is is worse than
finding nothing.

Exact first, then prefix, then anywhere in the name. One match resolves straight to
the card; several are listed with the real count, and the list says **"…and N
more"** rather than stopping silently at six.

    'henderson' matches 3 → '3 charted careers match. Did you mean Alan Henderson…'
    'mckie'                → the Aaron McKie card
    'zzzznotaplayer'       → 'No charted career by that name…'

### The same bug as /player-cards, one page over

    $('twinInput').addEventListener('input',function(){ if(!TW) load(); else lookup(); });

While the 632 KB is in flight, typing calls the loader and never the lookup — so
`lookup()`'s own branch for exactly this case

    if(!byName){ $('twinResult').innerHTML='<p class="sub dim">Still loading…</p>'; return; }

**could not be reached by typing at all.** Measured on Fast 3G: the box was empty
for **2,459 ms** and then answered. `load()` is memoised here — unlike
player-cards, which fired six downloads — so the cost was silence, not bandwidth.

    before   606 ms ''                3067 ms 'No charted career by that name…'
    after    606 ms 'Still loading…'  3066 ms '5 charted careers match. Did you mean…'
    requests 1, both times

And the box had no `say()` of its own. The rotation chart announces; the archetype
map announces; the answer the section is **named after** did not.

### The announcement check that a stale announcement satisfied

Two of six mutations were not caught at first, both announcement assertions, both
because "the live region is not empty" is not the same as "this answer was
announced" — `#live` still held `Still loading…` from a moment before.

Tying them to the current answer caught one. The other still passed, and the reason
is worth keeping: typing `mckie` passes through `mck`, whose **match list already
names Aaron McKie**, so a check looking for that name in the live region was
satisfied by an announcement three keystrokes old. The fix is mechanical rather
than textual — **blank the live region immediately before the deciding
keystroke**, so only that keystroke can fill it.

Six for six after that. That makes **six** assertions this session that passed for
a reason other than the one they named, and the live region is now three of them.


## One heading for the whole landing page (2026-08-11)

Heading navigation — the H key, the rotor — is how somebody using a screen reader
moves through a long document. Counted across the site:

    index.html         5 cards   1 heading
    players.html       3 cards   1 heading      the Explorer the brief centres on
    model.html         5 cards   2 headings     the explainability page
    methods.html       6 cards   1 heading
    leaderboard.html   4 cards   1 heading
    trends.html        9 cards  14 headings     the one that was already right

**31 card regions with no heading anywhere inside them.** The landing page offered
one stop for five sections; the Explorer offered one for three. `/trends` proved
it was fixable and nothing had been carried across.

37 headings added, **visually hidden and worded to match what each card already
shows**, so nothing on screen moved. Each is anchored to a snippet of its own
card's text rather than to a card index — an anchor that has moved fails loudly, a
count that has moved silently puts the heading in the wrong section.

Markup is not the accessibility tree, so this was verified where it matters,
through `Accessibility.getFullAXTree`:

    /index.html      1 → 6 headings
    /players.html    1 → 4
    /model.html      2 → 6
    /methods.html    1 → 7
    /leaderboard.html 1 → 5
    /owner.html      1 → 4
    /play.html       2 → 5
    /teams.html      5 → 7

### The gate found eight pages my own count had missed

A `headings` check went into `check_frontend` — **15 checks now** — walking each
card's extent rather than counting per page. It immediately failed eight pages my
`cards − headings` arithmetic had called clean: `brand`, `dfs`, `player-fit`,
`player/index` and their mirrors each have one card holding the whole page, and
the only heading sat in the header **above** it.

### Then the gate turned out to be measuring the wrong thing. Twice.

**`${m.arch}`.** The first run reported `player-animations.html` as having an
unreachable section. Its cards are built from a template literal — the check was
reading a script body as markup. A card that does not exist until the script runs
cannot be given a static heading, and reading JS as HTML is how a checker starts
inventing findings.

**And a parent card was passing on its child's heading.** Deleting
`4. Threats and mitigations` from methods.html left the check green: that card
*contains* another card, whose heading was still inside its extent. The check now
cuts at the first nested card, so a heading has to come before the section it
heads. Shown failing on the same deletion afterwards:

    - methods.html has a card with no heading in it — '4. Threats → Mitigation (honest)'

That is the **seventh** check this session that reported success while measuring
something other than what it named.

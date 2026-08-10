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
- [ ] P5.3 Asset duplication: `front_office.json` exists at **8 paths**
      (`assets/`, `assets/data/`, and six under `public/assets/…`). Whichever
      is authoritative, five copies are dead weight in the deploy.

### Cross-cutting
- [ ] F2 self-host or drop the Google Fonts link.
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

- [ ] **P7.1 public/assets/assets/ is 187 duplicated files, 86,808 KB, shipping.**
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

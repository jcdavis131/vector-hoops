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

- [ ] **P6.2** Target size (WCAG 2.5.5) belongs in each page's CSS, declaratively,
  where it can be reviewed — not a runtime sweep. Not done; removed the sweep.
- [ ] **P6.3** The three tags sit at end of `<body>` (copying the placement
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

- [ ] **P9.1 The map is still only on 3 pages.** This pass fixed *reachability*,
  not *presence*. `trends.html` in particular is about rotation, archetype drift,
  era twins and career arcs — all spatial, all currently shown as charts with no
  map beside them, while `assets/embedding_map_trajectories.json` (1,135,755 b) is
  already fetched by two other pages. Putting a real map there is a feature build,
  not an audit fix, which is why it is boarded rather than done in the same pass
  as a nav change.

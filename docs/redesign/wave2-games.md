# Wave 2, task 2.3: Map Hunt, Twenty Questions, Era Crossed (receipts)

Branch `forge/w2games` from origin/master `431e092e`. Scope per DESIGN-DIRECTION.md section 4, row 2.3:
map-guess.html + assets/map-hunt.js, twenty-questions.html + assets/inline-twenty-questions.js (and the
builder of its data, scripts/build_twenty_questions.py), play/era-crossed.html + assets/inline-era-crossed.js,
and the map/tq/era scopes of assets/game.css. atlas.css, shell.css, embed-3d.js, sw.js and the `.game--play`
rules are untouched. Other pages changed only in stamped `?v=` tokens (play.html: game.css + engagement.js;
index.html, live.html: engagement.js).

## What changed

### Map Hunt (/map-guess)
- **The handle is kept** (`state.map = Embed3D.mount(el, {variant:'game', ...})`). One `syncMap()` draws every
  tap with `overlay()`: `exact` for the target, `cold` when the distance grew from the previous tap, `warm`
  otherwise (first tap and "same distance" included, as on /play; see kit requests). On finish, won or lost,
  `setSelected(target)` marks the answer on the map. `syncMap()` runs from `handleTap` and once right after
  mount, so taps restored from today's saved progress (restore runs before the mount) land as rings too
  (render below).
- **Names for any dot.** A tap on a season outside the 1,313-season quiz pool used to print "player #4567";
  names now come from the quiz pool, then from `handle.info(i)`. Restored taps that are not in the pool are
  repainted once the map's names load (a short poll on `info(0)`; there is no load callback, see kit requests).
- **One true count.** "12,966" is said once on the page, in the lede, as `<span data-fact="player_seasons">`
  (site-facts.js now loads here, so it follows the data). Cut from the per-tap rows ("closer than X% of all
  player-seasons"), the puzzle line, the static loading placeholder and the meta/og/twitter descriptions.
  The provenance's "one of 64 notable player-seasons" is correct and stays: build_map_hunt.py draws the
  mystery from `mh_pool` (quiz-pool seasons whose player has a dossier in entity-index.json), 64 rows, and
  every `mh` day in index.json is inside it. The builder now writes `mh_pool` (64) and `th_pool` (1,313,
  the whole candidates.json, Twin Hunt's given-player pool) into index.json; `#mh-pool-count` is filled from
  `mh_pool` with 64 as the static fallback, and Twin Hunt mode alone shows its own sentence with `th_pool`.
  index.json was rewritten with only the two fields added (`days` and `generated` byte-identical); a full
  builder rerun changed 3 puzzle bytes by one quantization step (float rounding), so the shipped puzzles
  were kept. index.json and candidates.json are now fetched by literal URL, so stamp_assets.py versions
  them. Embed3D's own loading state still says 12,966 while the map loads (embed-3d.js copy).
  (Review fix: an earlier commit on this branch wrongly replaced 64 with 1,313.)
- **Research chrome**: `variant:'game'` (no switcher, no clustering legend). Meta/og/twitter "true 64-d
  cosine distance" gone; the provenance says "distance in the model's embedding" and links /methods#the-model.
- **Plain links**: the mode chip-links lost their emoji ("Daily Map Hunt", "Twin Hunt", "Daily Court").
- **Layout**: the mount sat in a fixed-height `overflow:hidden` box, which would have clipped the legend and
  note Embed3D appends inside the host. It is now `.mh-map.card--void` (Play's `#map-wrap` pattern) and the
  mount sizes to its content. The static placeholder's 60-line hex SVG sketch is gone (Embed3D replaces the
  host's content with its own currentColor sketch at mount); a one-line `.state--loading` ("Loading the map…") stays for the moment before mount; it no longer promises
  a search box, which appears only when Embed3D is missing or mount() throws (Embed3D's own error state
  offers a retry).
- **Escaping**: names, seasons, the day key, error messages and the datalist options go through `esc()`.
  The "no puzzle for this day" error no longer throws HTML through `Error.message`.
- Restore no longer plays the win/lose sound or scrolls to the result on page load.

### Twenty Questions (/twenty-questions)
- **One renderer.** `#tq-canvas` and its 2-D renderer (`sizeCanvas/drawMap/cssVar/dpr`, the resize handler),
  `#map-overlay` chips and the `#map-legend` (the 9 px legend from the audit) are gone. `#map-wrap.card--void`
  holds `#tq-map`, mounted with `Embed3D.mount(el, {variant:'game', height:360, onSelect})`.
- **The id join, verified.** The old `twenty-questions-map.json` points were `[x, y, career]` in
  *sorted-person_id* order, not row order: only 12 of 12,966 entries had `points[i]` == row i, so it could not
  drive `setDim`. The builder now emits `career[i]` (career index of vectors.json row i == Embed3D point i).
  Check script (wt/hoops-audit/w2games/verify_tq_ids.py) over all 12,966 rows: vectors.json vs embed3d.json
  name+season mismatches 0; career name mismatches 0; seasons outside the career's first-last span 0; shipped
  `career` array vs a fresh join mismatches 0. `build_twenty_questions.py --check` is green; the tree file
  changed only in its lineage note. The map file is 59 KB (was 238 KB).
- **Dimming**: `setDim(rows of careers still possible)` after every answer, tie elimination and undo;
  `setDim(null)` when nothing is ruled out. On the reveal the player's seasons are `setHighlight` + kept lit.
  A tapped dot toasts "Name · season · still possible / ruled out" (so the game note's "tap a dot" is true);
  before the tree loads, or after the reveal, it gives name and season only.
  The tree and the join are fetched by literal URL, so stamp_assets.py gives both a `?v=<sha8>` token
  (assets/*.json is cached for an hour; an unversioned URL could pair the new JS with the old `{points}` file).
  embed-3d.js loads synchronously before the game script; the game stays playable if the map or the join fails.
- **Copy**: the map is now the 3D projection of the embedding, so the "2-D atlas projection of the 14
  features, not the 64-d embedding" lines were false and went with the provenance block. How to play says
  "the site's 3D player map", with a Methods link (/methods#the-map). The map sits under the question cards
  (the question is the action at 390). Key line: ".caption" "Faded dots are careers your answers have
  ruled out."
- **engagement.js** (its Twenty Questions hook only, one condition): the "So close, you ran all 20 questions"
  card fired whenever any `hidden` attribute changed while the Yes button was still disabled for loading.
  Embed3D toggles `hidden` on its state/legend during load, so the card showed at Q1 in the first render.
  It now requires the question card to be loaded (`aria-busy="false"`). This file is shared with index/live/
  play, whose code paths are untouched.

### Era Crossed (/play/era-crossed)
- Canonical and og:url were already clean (1.3); the share text and the share card's URL drop `.html`.
- **`.opt` -> `button.card.opt`**: the kit card is the surface (inside `#round-card` the kit's `.card .card`
  rule gives the raised surface); game.css keeps only button resets, tap layout, focus ring and the
  correct/wrong states.
- Provenance block removed; How to play links /methods#the-model. Reveal note: "is the closest twin,
  similarity 64 out of 100" (was "embedding cosine × 100"). Meta description: "as the model ranks them".
  Share card subtitle: "past star → closest modern twin" (was "· 64-d embedding").

### All three
- No `style=""` left on the pages; the two noscript notes are `.game-noscript`. The only inline style the JS
  sets is Era's similarity bar width (data).
- Share cards (TQ, Era) read `--bg/--fg/--fg-2/--fg-3/--accent/--ok/--line` and `--font-code/--font-display`
  at draw time, so the PNG follows the visitor's theme (dark in dark mode). TQ's card counts careers from the
  data. No hex and no literal font family left in the three pages' JS.

## Detectors (check_design.py --report --json; hits on the owned files, before = 431e092e)

| Detector | before | after | notes |
|---|---|---|---|
| D6 hex | 31 | 0 | share-card + 2-D map colours in the two inline quizzes; the map-guess sketch hex (allowlisted) is deleted too |
| D8 font-size < 11 px | 0 | 0 | none counted before; the `#map-legend` block is deleted, and so is the sketch's `font-size="9"` SVG text |
| D9 literal fonts (also) | 17 | 0 | |
| D15 `style=""` | 0 | 0 | the two noscript `style` attrs were not counted by the detector; removed anyway |
| D16 one atlas engine | 2 renderers on these pages | 1 | `#tq-canvas` point renderer retired; `getContext('2d')` left on TQ/Era is the share-card canvas only (manual; D16 is not automated) |
| D17 clean URLs | 0 | 0 | plus the two `.html` share URLs in inline-era-crossed.js, which the detector does not read |
| D21 copy lint | 0 | 0 | visible text was clean; jargon in meta descriptions, the Era reveal note and share card removed |
| D24 tap targets | | | probe (`tiny`, <24 px) 1-2 per page, all nav/footer prose links; progress dots stay non-interactive (aria-hidden) |

Site totals: D6 650 -> 619, D9 108 -> 91; everything else unchanged. Enforced D1, D14 green.

## Gates

- stamp_lf.py then `--check`: OK, 110 assets. stamp_footer.py --check: OK, 26 pages.
- sync_public.py then `--check`: OK, 435 files.
- budget_check.py: all green, no row edited. map-guess 207.4 / 214.0 KiB, twenty-questions 218.4 / 942.0
  (embed3d.json is fetched by the engine, not counted), era-crossed 156.8 / 821.0; heaviest-page JS 285.1 / 294.0.
- check_contrast.py OK; check_a11y.py OK (18 pages); check_site_facts.py OK; check_design.py (enforced) OK.
- pytest (minus vector_core_parity): only the 3 known tests/test_check_served_model.py failures.
- node --check map-hunt.js, inline-twenty-questions.js, inline-era-crossed.js, engagement.js: OK.
  node --test tests/embed3d.test.mjs: 15/15.
- build_twenty_questions.py --check: OK.

## Renders (serve.py :8843, prod CSP, reduced motion; admit.sh, min Available 1,755 MB)

390 light+dark and 1280 light+dark; Map Hunt mid-game and Twin Hunt solved were reached by seeding today's
progress keys on a first visit, then reloading (the restore path). 0 exceptions, 0 failed requests, no
horizontal overflow in any shot.
- **Map Hunt mid-game** (3 restored taps): three rings on the void (warm, warm, cold), legend "Warmer guess /
  Colder guess", game note; rows name all three seasons (none in the quiz pool shows as "player #"), status
  "… colder. 5 taps left."
- **Twin Hunt solved**: "Found it" + warm rings, answer marked, result card, share bar.
- **Twenty Questions** after four answers: 134 careers, the map faded to the survivors; question card above
  the map; no near-miss card (it showed in the first render before the engagement.js fix).
- **Era Crossed** after a pick: card options, correct/wrong states, similarity bars, plain reveal note.
- The probe's low-contrast list in light flags the nav wordmark/links and gradient-backed bits (it reads
  `background-color` only); they read fine in the PNGs.
- Not rendered: error states (puzzle 404, tree 404), TQ reveal, Era game over.

## Deferred / for others

- **methods.html** (not owned): the provenance cut from TQ and Era should land on /methods. Ready to paste:
  - Twenty Questions: "The question tree is built offline from the season vectors, archetype assignments and
    honours data by greedy maximum information gain over 25 yes/no attributes; leaves of five or fewer
    players resolve by name. Every career resolves within 20 questions (worst case 18). The map is the same
    3D projection of the 64-d embedding as Map Hunt; answers fade every season of a ruled-out career."
  - Era Crossed: "The correct answer is the nearest other-decade career by cosine similarity in the 64-d
    embedding (from eratwins.json); the three distractors are the next-closest of its top-5 candidates.
    Similarity shown is cosine × 100. 1,313 rounds are pre-dealt into 131 games at build time; one game
    (~4 KB) downloads per visit."
- Map Hunt puzzle files end 2026-11-03 (LAUNCH-AUDIT 22): the generator still needs scheduling.
- Era Crossed data: some anchors are modern careers (a "2020s" anchor against 2010s "modern" options seen in
  the render): build_era_crossed.py's anchor/candidate decades, not touched here.
- engagement.js still hard-codes "2,426 careers" in the near-miss card.

## Kit requests (embed-3d.js / atlas.css owners)

- A neutral ring kind `'guess'` (key "Guess") for first and same-distance taps (already requested by 2.2).
- A load callback (`onLoad`) or a `ready` promise on the handle, so pages can label restored taps without polling `info(0)`.
- A `note` override (or `note:false`) for the game variant: TQ's key line lives outside the engine.
- A loading copy option, so a page that already states the count does not repeat it while loading.
- A kit card-as-button variant (`.card--choice`: button resets, focus ring, `.is-correct/.is-wrong`), to replace Era's `.opt` layout rules.

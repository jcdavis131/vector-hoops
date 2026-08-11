# frontend-live — readiness

**Nothing here is live.** Everything below is measured at **`292d0696`** — the sha is the anchor,
because the commit that records a count is never inside the count it records. All of it is on
`frontend-live`; `master` is untouched, and pushing `master` is what deploys the site. Suite green
at that commit.

| | |
|---|---|
| commits ahead of master | 193 at `292d0696` |
| paths changed | 2,638 (2,547 under `public/`, 38 scripts) |
| insertions / deletions | +207,041 / −310,495 |
| working notes | `tasks/frontend-live-buildout-2026-08-10.md`, 5,478 lines |

**Where to look at it.** The branch is pushed and Vercel builds every commit on it:

```
vector-hoops-git-frontend-live-cams-projects-c5c4c5f6.vercel.app
```

That alias always serves the newest build on the branch, so it does not go stale as this file does
— which is why no specific deployment id is quoted here. Every
`frontend-live` deployment carries `target: null`; only `master` commits carry
`target: "production"`, so none of this has touched the live site. Previews sit behind
`ssoProtection: all_except_custom_domains`, so that URL works for you and cannot be fetched
from here — which is why everything below was verified locally instead.

Deletions outweigh insertions because two duplications came out: an 84.8 MB orphan asset tree
(187 files, zero references) and a byte-identical 913,467-byte JSON copy.

## Verify it

Run against both roots. All exit 0.

```
python scripts/check_frontend.py            # 13 checks, 22 pages, 93 scripts parsed
# build_*.py --check now runs inside check_frontend's `derived` check, all seven of them
python scripts/check_a11y.py                # 11 WCAG A/AA criteria
python scripts/check_contrast.py            # WCAG 1.4.3
python scripts/check_responsive.py
python scripts/check_focus.py               # tabs 18 pages in Chrome
python scripts/check_viewport.py --widths 320,360,390
python scripts/smoke_render.py              # 8 pages, empty console
python scripts/smoke_play.py                # plays a full round
python scripts/smoke_index.py               # presses the landing page's map control
python scripts/smoke_cards.py               # searches before the 539 KB index lands
python scripts/smoke_players.py             # filters the Explorer without re-fetching
node scripts/smoke_owner_table.mjs          # + arch_map, retrieval_map, name_fix, early_errors
```

Add `--root public` to the python checkers to test the served copy.

**Service worker bumps, so the rule stops being remembered per commit.** The worker version is
bumped when a `?v=` asset token changes, or when a page in its three-entry shell (`/`, `/offline`,
`/manifest.json`) changes. Nothing else: `.html` is served `max-age=0, must-revalidate` and the
worker is network-first, so an edit to any other page reaches visitors without one.

## What changed

**The game.** The map was never visible — a bare `canvas{}` rule gave the overlay an opaque
background, so the cloud, crosshair, guess ring and connecting line were painted underneath it.
Pool rows had lost the `x,y,c` that `game_vectors.json` already carried, so a winning guess threw
and scored nothing. Trajectories keyed row indices against NBA player_ids — 52 of 2,149 matched by
coincidence; now 2,269 of 2,273. The suggestion datalist was empty; now 1,305 of 1,305. You can pick
a guess off the map, the map says what its eight colours mean, an ambiguous name admits it was
ambiguous, winning no longer looks like being stuck, the share link reproduces the puzzle it shows,
and a streak that survived a nine-day gap now resets.

**Five values stated numbers with no source:** `/owner`'s nine `Math.random()` columns,
`model.html`'s `EH 0.92`, `teams.html`'s ten hardcoded rows under the words "No fabrication", the
share card's demo pack code, and the map's `pulp 0.7057` — which the site's own dictionary already
listed as unverifiable. A sixth candidate was cleared rather than removed: `/player`'s `1.28`, `0.62`
and `0.81` looked fabricated because `0.62` sits below the floor of `closing_score`, but `closer` is
a level of `matchup_grade`, not that field, and the grade → `matchup_factor` cross-tab maps all three
exactly. The rule has to be able to clear a claim, not only condemn one.

**Speed, on the two pages the brief puts first.** Nothing here had ever been timed — every gate
answers "is it correct", none answered "how long until you can use it". Measured over CDP with a
cold cache and Fast 3G emulated (1.6 Mbit/s, 150 ms RTT):

| | before | after | |
|---|---|---|---|
| `/play` — real pool loaded | 6,701 ms | **2,856 ms** | 2.35× |
| `/model` — map has ink | 13,259 ms | **7,939 ms** | 1.67× |
| `/model` — payload | 2,577.8 KB | **1,488.7 KB** | −42% |
| `/model` — zoo table lands | 13,079 ms | **824 ms** | 16× |

`/play` ended its script with `fetchTrajCache();fetchManifest();` — 2 MB of win-animation prefetch
fired at the same millisecond as `game_vectors.json`, the 397.6 KB that decides when the game starts.
Until it lands the page runs on an 8-name demo pool (disclosed on the page, and it refuses to swap
mid-game). Deferring the prefetch behind the pool promise costs nothing: the win path already awaits
it, and both fetches are memoised. Same bytes, better order.

`/model` fetched all 1,127,784 bytes of `front_office.json` to read one 8,299-byte subtree —
`model_eval.model_zoo`, 0.74% of the transfer, on a page that reads neither `teams` nor
`teams_by_abbr` (79.4% of the file). `scripts/build_model_zoo.py` cuts that subtree into
`assets/model_zoo.json` verbatim, with a `--check` mode that fails if it drifts from its source.

**The landing page's map control gave twenty seconds of nothing.** `index.html` itself is lean —
325.5 KB, map ink at 2,188 ms on Fast 3G. The 3.6 MB `vectors.json` sits behind the "8k" button, and
that handler set its state *after* awaiting the fetch: no label change, no `aria-busy`, no point
count moving, for 20.1 seconds. The only honest reading of that page is that the press did not
register — and `loadFull()` had no guard, so pressing again started another 3,784,565-byte download.
Now the state goes up in 300 ms, the download happens once however many times you press, and a
failure says so instead of flipping the button to "on" over an unchanged cloud. **Enforced, not just
fixed:** `scripts/smoke_index.py` presses the control under a throttle and fails if any of those
behaviours goes missing — and mutation-testing that check found two of its own six assertions
worthless before they were repaired.

That failure claim then had to be earned. `loadFull()` awaits twice, and only the first path was
the one I had in mind: blocking `points_limited` — the second — left **12,966 uncoloured points on
screen** under a button reading not-loaded, while the region announced "Still showing the
1,764-point map", and a poller elsewhere in the page then announced the success line over the top of
it. Both files fetch together now and `dots` is swapped only once both have arrived, so a throw at
either await leaves the map exactly as it was. Re-measured: `dots.length 1764 → 1764`, two
announcements, both true.

**The player search downloaded its index five times.** `/player-cards` is 30.4 KB on load — the
539 KB `wiki_index.json` is lazy — so everything happens in the gap before it lands. Typing there on
Fast 3G gave **twelve seconds of an empty list and five downloads of the same file**: `loadIndex()`
memoised its *result*, and `IDX` stays null for the whole flight, so every keystroke started another
fetch and they contended. Worse, `search()` already had a "Loading index…" branch for exactly this
case, and its only caller was `IDX ? search() : loadIndex()` — **guarding on the condition the callee
was written to handle**, so the message could never be reached by typing. The promise is memoised now
and the handler calls both: **12.0s → 2.4s** to first results, one request, and the wait explained
while it happens. Enforced by `scripts/smoke_cards.py`, mutation-tested three for three.

**Changing your mind on a player card changed it back.** `open()` writes the card, the title, a
history entry and the announcement unconditionally when its fetch resolves, with no sequencing — so
the slower request wins whichever card you asked for last. Measured by holding one request three
seconds: a visitor who clicked Vince Carter, changed their mind and clicked Gerald Brown was on
**Gerald Brown at 1s and Vince Carter at 5s**, with a `pushState` that ran after they had navigated
away, so Back went somewhere they never chose. A sequence number now guards both the success and the
failure path — a stale 404 must not replace a card someone has since opened either, which was measured by delaying that request **and** blocking it so the held fetch rejects. Enforced by two race phases in `scripts/smoke_cards.py`; its mutation matrix is six for six.

**The Explorer's filter re-downloaded its own data.** `loadPts(f)` fetched the 273.5 KB point file
on every call and both filter buttons called it, so **four alternating presses downloaded it four
times — 1.07 MB to filter a list the page had already parsed**. The button class and `aria-pressed`
flip synchronously while the redraw waits on the network, so the button read "Current" for about two
seconds while the map still said `all • 1764 pts`. One fetch, then a synchronous redraw from memory:
**0 requests for four presses**, and the map agrees with the button immediately. No race was
demonstrated here and none is claimed — the fix is justified by the megabyte and the contradiction.
Enforced by `scripts/smoke_players.py`.

**Front office (phase 5), checked and largely sound.** Operating every control on `/teams` and
`/owner` re-fetches nothing, and both tables report their sort correctly through `aria-sort` —
including `/owner`'s default, which announces `FOR descending` before anything is clicked. `/teams`
goes further and names the current sort in a caption. The one gap: **`/owner`'s table had no caption
and no `aria-label`**, so a screen reader met nine columns and thirty rows of nothing in particular.
It now carries the same caption pattern as its sibling, counted from the rows drawn rather than
asserting thirty, and it follows the sort.

**"How it works" did nothing.** The `links` check captures the file half of an href and treats
`#anything` as trailing noise, so **36 fragment links across 22 pages had never been checked**. Two
did not resolve, both on the landing page: `#games` in the nav and `#model` on the "How it works"
button beside "Play today's". Neither id existed at parse time or after the scripts ran, and clicking
each moved the page from **scrollY 0 to scrollY 0** while writing the fragment into the address bar.
Both now point at the pages the nav already uses for those words — `/play.html` and `/model.html` —
rather than at anchors minted to justify the links. A new `fragments` check makes every deep link
land on something that exists; it was shown failing first.

**Green only means something if it can go red.** Every interaction smoke here has a mutation matrix;
the gates did not, and one of them turned out this week to have been incapable of failing. New
`scripts/audit_gates.py` breaks something each gate claims to catch and requires it to notice —
**thirteen cases, thirteen caught**: a statement with no right-hand side, an id renamed out from under
a `getElementById`, a script that is not on disk, a duplicate id, an unsourced figure printed as fact,
a cited number moved away from its file, a price on a page, a root edit that never reached `public/`,
a stale `?v=`, `<html>` with no `lang`, 1.10:1 text, a deleted skip link, and a 2,400px element at
320px. Each case restores from a backup and the run ends by comparing every touched file byte for
byte. **Four tested nothing on the first attempt** — and three of those were the mutation being wrong,
not the gate: `focus` deliberately ignores the skip link's class name, `viewport` cannot fail on the
3-of-23 pages that set `overflow-x:clip`, and `contrast` fails only on rules declaring both colour and
background. An uncaught mutation is a question, not a verdict.

**A regex that was two backspace characters.** Half the sections here ship a `Loading assets/…json …`
placeholder and several only start when scrolled to; nothing had checked that any of them goes away.
A section stuck on "Loading" is this site's worst failure — it reads as a slow network rather than a
broken page and survives every static gate. `smoke_settled.py` scrolls all 22 pages to the bottom,
waits, and reads what is on screen: **all 22 settle clean**. Proving that meant mutating a page to
break it, and the check stayed green — because `STUCK = """…/\bloading\b/i…"""` in a plain Python
string makes `\b` **a backspace character**, so the regex shipped as `/\x08loading\x08/i` and matched
nothing on any page ever. One `r` prefix. Three earlier versions were wrong too: `SVGElement` has no
`getClientRects` (21 pages reported as `Uncaught`), the page's own error queue is replaced by a sink
after load, and `/loading/` matched "reloading". An honest negative: the first real run flagged eight
stuck panels on `/player-animations` that are collapsed `<details>` Chrome now hides with
`content-visibility` — the page was never at fault.

**A glossary you could not search.** `/dictionary` is deep-linked from five pages and holds 19 terms
in six sections; the only way to find one was a jump index that is a wall of nineteen chips. A filter
now sits under it — everything it filters is already in the DOM, so nothing is fetched, and it ships
`disabled` and is enabled by the script so a page with no JS is honest about it. Beyond filtering:
the count says what is on screen, a query nobody matches says so rather than leaving a blank page,
the jump index stops offering entries that are gone, and a section heading does not stand over
nothing. **That last one was wrong, and the mutation that should have caught it reported green** —
both because the six `<h2>`s are siblings of the entries inside one card rather than wrappers around
them, so "hide a card with no visible entries" hid nothing and the check counted the same cards.
Regrouped by heading; six mutations, six caught.

**The page scrolled, the focus didn't.** Five pages link into the dictionary for a definition, and
the `fragments` gate proved those ids exist without proving anything happens on arrival. A fragment
navigation focuses its target **only if the target can hold focus** — measured, `#era-z`, `#retrieval`
and `teams#foSec` all scrolled correctly (scrollY 815 / 2315 / 638) and left focus on `BODY`, so the
next Tab restarted at the skip link and a screen reader began a 19-entry glossary from the top after
being sent to one entry. `tabindex="-1"` on six elements; verified landing on the target afterwards.
An honest positive: all 23 `#main` skip-link targets were already correct — only the content anchors
were missed, which is why nothing had caught it. The gate now reads the target's tag and attributes,
so it checks arrival rather than existence.

**One heading for the whole landing page.** Heading navigation is how a screen-reader user moves
through a long document, and **31 card regions across the site had no heading anywhere inside them** —
the landing page offered one stop for five sections, and the Explorer, the page the brief centres
everything on, one for three. `/trends` had 14 over 9 cards and nothing had been carried across. 37
headings added, visually hidden and worded to match what each card already shows, so nothing on screen
moved; verified through `Accessibility.getFullAXTree`, where it counts: index **1 → 6**, model
**2 → 6**, methods **1 → 7**, leaderboard **1 → 5**, players **1 → 4**. A new `headings` gate
(15 checks now) immediately failed **eight more pages** my own per-page arithmetic had called clean.
It then had to be fixed twice itself: it was reading a template literal in a script body as markup,
and a parent card was passing on its nested child's heading.

**The page said there was no Curry.** Phase 2. `/trends` is the change-over-time research, and its
one text input sits under **"Who is the modern version of…?"**. Typing `curry` returned *"No charted
career by that name with at least four seasons"* — `eratwins.json` holds five. The matcher was a
prefix test against the whole name, so a **surname could never match**. Now exact, then prefix, then
anywhere in the name: one match opens the card, several are listed with the true count and an
"…and N more" rather than a silent cap. The same box also carried the `/player-cards` bug one page
over — typing during the 632 KB download called the loader and never the lookup, so the
"Still loading…" branch was unreachable and the box sat **empty for 2,459 ms**; and the answer the
section is named after was never announced, though the chart and the map beside it both are.
Enforced by new `smoke_trends.py`, which derives its own queries from the loaded index rather than
naming a player: **six mutations, six caught** — after two announcement assertions were found passing
on a *stale* announcement, one of them from three keystrokes earlier.

**201 links paid a redirect.** `vercel.json` sets `cleanUrls`, and sw.js's own header records the
live-site measurement — `/index.html 308`. Every internal link ending in `.html` cost a round trip
before the page started, and after the worker began filling its cache at runtime it cost more than
that, because **the cache is keyed on the request URL**: `/model` was one request and worked offline;
`/model.html` was two and **landed a visitor who already had the page cached on the offline notice**.
188 hrefs rewritten, attribute values only — prose and code samples quoting paths are left alone, and
one of the 188 is the "Offline mode" link inside `error-boundary.js`, the link most likely to be
clicked while offline. Two gates: new `clean` (no internal href ends in `.html`, shown failing at 156
findings), and a repair to `links`, which had matched `.html` hrefs only and so reported
**"0 internal link(s) resolve"** the moment they lost the extension — a green line for work it was no
longer doing. It now checks 237.

**The page said "offline capable".** `/play.html` prints it on the Daily Q card, and nothing here
had ever pulled the plug. Two things had to be right before the measurement meant anything, and the
first two runs got both wrong in the flattering direction: `Network.emulateNetworkConditions` is
**per-target and a service worker is its own target**, so the page went offline and the worker's
`fetch()` did not; and a bare test server **sends no `Cache-Control`**, so Chrome heuristically
cached the HTML that production marks `must-revalidate`. With the server actually stopped and
`vercel.json`'s headers mirrored, `/play` served **the offline notice with no game behind it**. Fixed
by filling the cache at runtime rather than from a hardcoded list that rots at every deploy —
documents and code, never `.json`/`.f32`/`.bin`, so a stale model asset still cannot be served.
Measured after: 10 entries, 0 of them data, and offline the game keeps its question, its 1,305
suggestions, its pool and its map. Also found: the fallback chain was **two tiers pretending to be
three** (`r || caches.match(a) || caches.match(b)` — a Promise is always truthy), and the offline page
was printing its own byte count wrongly (9,965 against 11,576), an unverified asset-size list, and a
claim that the game played offline. Enforced: new `smoke_offline.py` (3 mutations, 3 caught) and a
second half to the `worker` gate that requires sw.js's exemption regex and the page's promise to name
**the same set**.

**The one modal on the site.** The Back-button defect generalised: gates look at a page in one
state, and a modal is a second state. `/play.html` has the only one — the share overlay, on the page
the brief puts first. Driven with real key events after a real win: opening it **left focus on the
button behind the backdrop**, Tab then walked two controls the player could no longer see — the
second being `Next Q →`, **which advances the game underneath the card they are looking at** —
**Escape did nothing**, and closing dropped focus to `<body>` so the next Tab restarted at the skip
link. No role, no name, no `aria-modal`. Now a real dialog: focus enters, Tab wraps inside, Escape
closes, the opener gets focus back, and the canvas is named at draw time from the values it is drawn
from. One honest positive: closed, the overlay is `display:none`, so it was never a phantom tab stop.
Enforced in `smoke_play.py`, **six mutations, six caught** — but only after the Tab check was
rewritten, because the first version passed with the trap broken (a catch-all hauled focus back on
the *next* press, and the assertion read only the final state).

**Nobody had pressed Back.** `/player-cards` puts its state in the query string — `open()` calls
`pushState('?p=slug')` and a `popstate` handler reads it back. A shared link works and Back/Forward
navigate correctly, but backing out to the bare URL hid the card and **left the tab reading
'Vince Carter — Vector Hoops'** with no card on screen, and announced nothing, so a non-visual
visitor was told when a card opened and never when it closed. The title is restored from the value
the page arrived with and the close is announced. Enforced: `smoke_cards.py` presses Back, and its
mutation matrix is eight for eight. This survived every gate and an accessibility sweep because
**those look at a page in one state, and this only exists in the transition between two.**

**Typography.** Nine pages were rendering body copy in Times New Roman. They declared
`font-family:ui-sans-system`, which is not a CSS keyword — the real generic is `ui-sans-serif`, so
the name matched no font and, with no fallback behind it, the paragraph fell to the browser default.
Measured with `CSS.getPlatformFontsForNode`, not inferred. The four persona pages and their flat
twins now carry the stack `hoops.css` already shipped, and the same misspelling was corrected on
eight more pages where a `system-ui` fallback had been quietly covering for it. Five pages also
carried `style="font-family:\"Architects Daughter\",cursive"` — a backslash escapes nothing inside an
HTML attribute, so a real tokenizer read an invalid declaration plus two junk attributes and the
handwriting font never applied. Every prose page now renders the sans it asks for.

**Accessibility.** Skip links 6/22 → 22/22. Focus rings 6/22 → 22/22. Static failures 81 → 0.
Contrast failures 12 → 0. Sorting the teams table from the keyboard no longer strands you at the top
of the page. The players filter announces which one is active. The player search is a real combobox.

**What a screen reader actually receives.** `check_a11y.py` settles eleven criteria and says in its
own docstring that "real screen-reader flow still needs a browser and a person". The browser half is
now done: `Accessibility.getFullAXTree` reports the computed role and name of every node, which is
what assistive tech receives rather than what the markup implies. Across **all 22 pages** —
**zero unnamed interactive nodes and zero unnamed images**; every button, link and field announces
itself. Two gaps it found:

- **The game was silent between guesses.** `/play` announces the result box at the end, but each
  guess before it reached nothing. Measured: `#vh-live` empty before a guess and empty after, while
  the sighted player read `guess → AJ Griffin 2022-23 cos -0.67 ◐ • row 11029` in `#log`, which is
  not a live region. With six guesses and no way to hear whether you landed at −0.67 or 0.94, the
  game could not be played without sight. Each guess is now announced verbatim — only `cos` expands
  to `cosine`, every number and name untouched, so heard and shown cannot drift apart. Two observers
  then fed one region: measured through a win, the payoff was announced and **replaced 4 ms later**
  by `'Trajectory done … confetti 12 … karaoke-grade 1.24s'`, so the result box now owns the region
  while it is up. `smoke_play` asserts both, on the miss path — the only place that can prove it,
  since a win fills the region either way and the first version of that assertion passed with the
  whole announcement deleted.
- **Fifteen decorative `<svg>` tiles announced themselves as "image"** with no name, on `/teams`,
  `/players` and `/index`. They were not `aria-hidden` — a hidden node never reaches the tree, which
  is why they showed up. Now hidden; re-measured as none.

**Weight and third parties.** `/owner` −96% and `/teams` −96.4% bytes on paint. Google Fonts removed
from all 18 pages that carried it; Architects Daughter self-hosted (20,184 bytes, SIL OFL alongside),
dropping two third-party origins site-wide.

**Social metadata — and a sentence here that was false.** This section used to end "Every page now
carries Open Graph, Twitter and canonical metadata." It did not. `player-cards.html` and
`player/index.html` had `og=0, twitter=0`, and `build_social_meta.py --check` had been naming both of
them and exiting 0 the whole time. The generator could not fix it either: it returns *the tags a page
is missing* while its caller replaces the entire managed block with exactly that, and it read
"already has" from text that included its own block — so each run deleted what the last one wrote,
and those two pages oscillated between twelve tags and zero. Fixed at the source; convergence
measured over three write/check cycles; 213 tags site-wide became 235, with the other twenty pages
byte-identical. **Now it is true.**

## Ten decisions

| id | decision | why it is not mine |
|---|---|---|
| P6.1 | delete or revive 746 KB of modules no page loads | reviving is a feature, not wiring |
| P9.3 | maps on the remaining 13 pages | a map on a glossary may be decoration |
| P9.4 | the unpkg script on `player-animations.html` | measured: not an a11y problem; is one CDN acceptable? |
| P9.7 | what the share card is for | two thirds black, footer is build metadata — that is voice |
| P4.5 | no `.gitattributes` | changes a shared checkout another agent works in |
| P8.2 | hyphen fix belongs upstream | needs data regeneration, which I must not run |
| P6.4 | the install prompt is inert | trigger it or remove it |
| P9.5 | datalist dropdown behaviour | popup is browser chrome, unreachable from CDP |
| P9.9 | the site says both 48-d and 64-d | which statements describe the shipped model and which describe an older one |

| P9.10 | "Games" and "Play today's" now both go to `/play.html` | whether "Games" should be a separate nav item is a product call; the dead link it replaced was not |

Each of the first nine was checked against `origin/master` and pre-dates this branch. **P9.10 is new and is mine** — the nav's "Games" link pointed at `#games`, which named no element, and repointing it at the daily left two nav items going to the same place. The one collision this
branch created — two pages claiming `/player` — was found, fixed, and withdrawn from this list.

**P9.9 in detail** — smaller than it was filed, because the reachable part is now fixed. The shipped
embedding is 64-d, verified from the bytes: `assets/mtnn_embeddings.f32` is 3,319,296 bytes =
12,966 rows × 64 × 4, its sha256 matches the hash `eval_scoreboard.json` declares, `mtnn_meta.json`
says `dim: 64` with 8 centroids of length 64, and the model is named `…_d64_…`.

Enumerating all thirty "48-d" statements showed **eight of the ten modules containing them are loaded
by no page** — that is P6.1's 746 KB, and correcting prose in files that may be deleted has negative
expected value. Four statements were reachable and are corrected: `inventory.html`, `methods.html`,
`archetype-bridge.js` and `error-boundary.js`. Also checked and clean: no code strides 48 floats
through a 64-float row — the single hardcoded `48` is a dead property, and `mtnn.js` derives the
dimension from metadata and asserts the buffer length.

**A fifth reachable one is correct as it stands, and the enumeration missed it.** That sweep read
only `.html` and `.js`; several shipped *JSON* assets carry "48-d" in a `method` field, and
`trends.html` prints `eratwins.json`'s directly into the page. It is accurate — those twins really
were computed in the older 48-d space — and the page already says so beside it: *"This table was
computed in the 48-dimensional embedding… The model the game ships now is 64-dimensional… labelled
that way rather than quietly reused."* `mtnn_map.json` (PCA(3) on 48-d) and `archetypes_time.json`
(k-means on 48-d) come from the same older space, and `series.json` records the transition
explicitly. This is the strongest argument against a find-and-replace: a family of derived assets is
honestly describing its own provenance, and overwriting those strings would replace true statements
with false ones.

**What is left for you** is the remainder: `methods.html` attributes one to `MT v3` and
`dictionary.html` describes "an older 48-d evaluation" deliberately, so those are correct as written;
the architecture diagram in `network-viz.js` is labelled `v4 baseline` with `12,392 seasons` against
the shipped v5's 12,966, which is a redraw-or-relabel call; and `eval_scoreboard.json`'s own
`description` still says "the shipped 48-d MTNN space" four lines above its `dim: 64`. That field
never reaches the DOM, and settling it needs the asset regenerated, which is forbidden here.

## Not covered

- Nothing is deployed to production. The branch has never been merged; its preview builds (see the
  URL above) are all `target: null` and only `master` carries `target: "production"`. The preview is
  SSO-gated, so it was never something this session could open — every claim below was verified
  against a local server and a headless browser instead.
- Fourteen findings were false alarms caught before acting. A closed `<details>` still reports a
  layout box in Chrome; IntersectionObserver sections look broken if you scroll past them;
  `captureBeyondViewport` screenshots do not re-rasterise canvas. Twice a screenshot sent me after a
  bug that was not there, and twice a synthetic keypress did.
- **Bulk-checking figures against the assets does not work.** Tried and reverted: random two-decimal
  values match the 66.9 MB of committed data 72% of the time, so a substring check passes almost
  anything. The five above were found by reading claims in context.
- Reading order and copy quality still need a person.
- Merging the two `front_office.json` files was considered and rejected: it saves 1,127,784 bytes of
  deploy bundle but adds 33,154 bytes to every visitor on the pages reading the smaller one.

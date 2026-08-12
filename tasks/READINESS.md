# frontend-live — readiness

**This is live.** Everything below was measured at **`7ff3d8ba`**, which was `origin/master` when it
was measured, and pushing `master` is what deploys hoops.dumbmodel.com. Past tense on purpose: an
earlier draft of this line said "which *is* also `origin/master`", which the very next docs commit
falsified — the same shape as the error the rest of this paragraph is about, written while fixing it.
The sha is the anchor; nothing else here needs to claim to be current. An earlier version of this header said
"Nothing here is live" and "`master` is untouched" while anchored at `0e95b151`; both stopped being
true the first time this branch was pushed to `master`, and a readiness document that misstates
whether it has shipped is the one sentence in it that has to be right. The sha is the anchor because
the commit that records a count is never inside the count it records.

Counts are against baseline **`adb33291`**, named here because the previous version of this table
quoted them against nothing — which makes a number no one can re-derive, including whoever wrote it.
Re-run any row with the range `adb33291..7ff3d8ba`:

| | | |
|---|---|---|
| commits this session | 314 on this branch's own line | `git rev-list --first-parent --count adb33291..7ff3d8ba` |
| commits including merged-in work | 362 — walks both sides of the merge and counts Scout's | `git rev-list --count adb33291..7ff3d8ba` |
| paths changed, across the merge | 2,713 | `git diff --name-only adb33291..7ff3d8ba \| wc -l` |
| insertions / deletions | +229,831 / −310,710 | `git diff --shortstat adb33291..7ff3d8ba` |
| working notes | `tasks/frontend-live-buildout-2026-08-10.md`, 6,839 lines | |

**Where to look at it.** The branch is pushed and Vercel builds every commit on it:

```
vector-hoops-git-frontend-live-cams-projects-c5c4c5f6.vercel.app
```

That alias always serves the newest build on the branch, so it does not go stale as this file does
— which is why no specific deployment id is quoted here. Previews sit behind
`ssoProtection: all_except_custom_domains`, so that URL works for you and cannot be fetched from
here, which is why everything below was verified against a local server and a headless browser.

**The production site is the other half of that, and it is this branch.** A previous version of this
paragraph said every `frontend-live` deployment carries `target: null` and "none of this has touched
the live site". That was true of the *preview* builds and false about the work, because this branch
is pushed to `master` as each piece lands, and `master` is what carries `target: "production"`. The
sentence outlived the workflow it described by several hundred commits. Production is verified by
fetching it — `curl -s https://hoops.dumbmodel.com/assets/map-camera.js | wc -c` against the local
byte count, since `?v=` is a cache-buster the server ignores and a 200 on it proves only that the
path exists.

Deletions outweigh insertions because two duplications came out: an 84.8 MB orphan asset tree
(187 files, zero references) and a byte-identical 913,467-byte JSON copy.

## Verify it

Run against both roots. All exit 0.

```
python scripts/check_frontend.py            # 20 checks, 18 pages, 93 scripts parsed
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
python scripts/smoke_framing.py             # every map's cloud centred on its canvas
python scripts/smoke_framing.py --mobile    # and at 390x844, where the aspect is inverted
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

**Fetched, parsed, discarded.** I named this last turn as "2.75 MB read for a count and a mean" — it
was not read at all. `Array.isArray(props)` against a file that is an **object**, so the computing
branch never ran: **2,753,469 bytes came down on every visit and were thrown away**, and the line a
visitor read was always the typed `else`. Every figure in it, checked: `avgΔ -1.02` **no** (the real
mean is **-0.035** over 3,407 scored player-seasons), `Wemby +5.7` yes, `Castle +3` **no** and
`Harper +0.2` **no** — both appear only in 2026-27, which has no actuals. `build_props_summary.py`
cuts it to **2,020 bytes, 0.073%**, and carries the source line verbatim because the "prop" here is
*the prior season's average rounded to 0.5*, not a market line. Ranked by raw delta the top mover was
**Alondes Williams at -51.3 off four games** — the list was measuring sample size; qualified at 41
games it is Micah Potter +11.9. **`/player` fetch weight: 5,231,646 → 209,419 bytes over two turns.**
And the offline sweep added last turn **was flaky**, which three runs revealed: a fixed 2.4 s wait
scored `/model` at 69% once and 100% twice, and `/teams` boots its lower cards on an
`IntersectionObserver` so without a scroll they render on timing rather than on the network. It
scrolls and settles now — three consecutive runs, every page at 100%. **A test that reads at a fixed
moment measures the moment.**

**The offline claim, tested on eighteen pages instead of one.** Last turn I fixed 37 trailing-slash
links and justified it with the service worker's cache without ever measuring the benefit — and
`smoke_offline` covered `/play` alone, so *"works offline after your first visit"* had been tested on
one page of eighteen. `--site` now warms every page, stops the server, and revisits every page,
comparing each against **itself** online. **Its first run said 17 of 18 were dead, and that was the
test:** it walked the `.html` form, which `cleanUrls` 308s and the worker rightly refuses to cache —
which is exactly why those 37 links mattered. On the clean URLs the site links, 17 of 18 came back
whole. **The eighteenth was real.** `/player` returned 74% of its online text because it fetched
**5,231,646 bytes for a 19 KB page** (`front_office.json` twice, under two paths, for one field
each), passed `{cache:'no-store'}` on three of four fetches — opting out of the very cache the
offline claim rests on — and, when a fetch failed, **invented 480 players at random coordinates named
`Player0`…`Player479`** under a status line printing `30T · 20719×64-d` whether or not anything had
loaded. One lite fetch now, no `no-store`, empty arrays instead of invented ones: **5,231,646 →
2,960,868 bytes, and 74% → 100% offline.** All 18 pages come back at 100% of their online DOM.

**A mutation that fails to apply looks exactly like one that was caught.** `/dfs` promised "locks /
fades" and "minute-lock safety"; `projections.json` ends its own method line with *"Not a minutes or
pace forecast — treat as geometry-implied next-year profile pending held-out eval."* The eval exists:
**10,108 scored player-seasons**, `meanAbsErrPrimary` 0.459 — unreadable until you know what guessing
scores. `build_projection_eval.py` computes that baseline per feature (**2,920 bytes, 0.10% of the
source**, and it fails if it stops reproducing the summary's 0.459). The answer is the honest version
of what the page promised: **offensive glass 0.41 of the guessing error, on-court impact 0.88** — it
sees a player's shape coming and not their impact, and impact is the one you would have been paid on.
**Then the tooling hole:** every smoke exits 1 for a real failure *and* for "my mutation string no
longer matches", so the matrix loops run all session scored stale mutations as caught. Two of
`smoke_dfs`'s four did. Not-applied exits **2** now across all seven smokes, and an 18th check —
`mutations` — verifies every string still matches a served file first. **39 of 39 matched, so nothing
earlier had been faked.** And one I pushed: the previous commit went out with a stale asset token
because the chain that ran the gate did not *stop* on it. **Re-running the gate after a rebase is not
the discipline; stopping on it is.**

**The page claimed wins drive value; its own file says r = 0.09.** `/brand` was 413 characters of
jargon headed *"Wins into sponsor ROI"*. Nothing had ever checked the claim against the file it would
have come from: across 30 teams, `corr(wins, valuation) = +0.09`, `corr(payroll, valuation) = +0.10`,
`corr(rating, valuation) = 0.00`. Not a scale problem — valuations run **$2.95B to $10.09B**, wins
**17 to 64**, both wide and unrelated. Dearest per win **BKN $274M**, cheapest **DET $55M**. The page
computes all of it now and says the opposite of what it used to assert. **The line that matters most
is the caveat:** every valuation in this repo is `forbes_synth_estimated_for_training`, so the
correlation describes *the file that generated them, not the league* — and "wins do not drive
franchise value" is a far bigger claim than 30 synthetic points from one season can carry. It would
have been easy to ship r = 0.09 as a finding about basketball; it is a finding about a training set.
`smoke_brand.py` recomputes every figure in Python and compares — **four mutations, four caught**,
plus the blocked-file path. Two smaller ones, both mine: `build_valuation_note.py` was rewriting the
script comment that *quotes* the old headline, turning the record of the defect into a copy of the
fix (patterns now skip `<script>` and comments); and the smoke asserted Python's `-0.00` against the
browser's `0.00` — a signed zero is not a sign, the page was right.

**The valuations were synthetic all along.** Every check and smoke was green — 17 and 16 in one
sweep — so the question became what a green sweep cannot see. Measuring what all 18 pages put on
screen: **`brand` 413 characters of text, `player-fit` 378, `dfs` 784**, against `player.html`'s
3,776. Three nav destinations are taglines, not pages, and two had **no links at all**.
`/player-fit` carried an `<input>` and a **Find fit →** button with no handler and no id to attach
one to — P6.4 exactly — replaced with the three places fit actually works. Then the numbers:
`brand`'s headline `$9.1B top • GSW 9.14B` was **stale** (the file's own `season_focus` says GSW
**$10,090M**), it was on **three pages including the landing page**, its premise is unsupported
(`corr(wins, valuation) = 0.09` across 30 teams), and — the real finding — **all 360 valuation
records over 12 seasons name their own source as `forbes_synth_estimated_for_training`.** They are
estimates generated to train the model, not measured franchise values, and no page said so.
`scripts/build_valuation_note.py` stamps the computed figure and the disclosure quoted from the
file's `source` field; `derived` runs it — **11 generators** — shown red by putting `$9.1B` back. The
numbers are not changed, because a synthetic estimate is still the best figure this repo has and
deleting it would leave the pages emptier and no more honest. It is labelled, as the dictionary
already labels the 48-d `eratwins.json`. Also: `check_contrast` caught `.pill.o` at 3.06:1 — last
turn I fixed that with a later override instead of the declaration, so the paint was right and the
declaration was still wrong.

**The page nothing walked.** `/player` served `public/player.html` — tracked with **no root
counterpart**, so `sync_public.py` never touched it and all sixteen root-walking checks went past.
Moved to the root and checked for the first time: **seventeen findings on one page**, including a
three-tier price card (`PRO $19/MO`, `AGENCY $199`, `OWNER FOR $5K`) on a site whose first brief line
is *make all pages free*, four unsourced figures, ten cards with no heading, no `<h1>`, no `<main>`,
three unnamed controls, and 388px of layout at a 320px viewport. `make_free.py` had never been
pointed at it and was still naming three files that no longer exist — a tool reporting `SKIP` and
passing. **Five routes were claimed by two files each**; with `cleanUrls` and `trailingSlash:false`
the directory half is unreachable, and on `/owner` the reachable half was the one **without** the
screen-reader table caption — an accessibility fix reported as shipped had been shadowed since the
day it was written. **37 links carried a trailing slash**, which the service worker's URL-keyed cache
turns into an offline-notice hit, and `check_clean` only knew about the `.html` half. Two new arms,
both shown red first: **`routes`** (nothing served from outside the mirror, no route claimed twice)
and trailing slashes in **`clean`** — **seventeen checks over 18 pages**. Also: `/play`'s onboarding
tip stole focus 400 ms after load on a first visit, past the skip link and the nav; and ten headings
I added were `class="vh-sr"` before that rule existed on the page, so they rendered as visible
duplicate titles — caught by `check_viewport`, not by me.

**Phase five, and a rebase I did not re-gate.** `/teams` carried a card headed *"Why San Antonio
rates above Oklahoma City"* over *"Why SAS 94.8 > OKC 85.8"* — but 94.8/85.8 are `weighted_wins`, and
on `for_final`, the column the 30-team table **on the same page** sorts by, OKC is 70.7 at rank 3 and
SAS 69.3 at rank 4. The page argued the opposite of its own table, and a canvas painted the claim
every frame under an `<h2>` promising a "glass-box check" over a card that checked nothing. **72
pairs** in that file disagree between weighted wins and the rating; the card now picks the widest —
NYK, most weighted wins in the league, rated 6th, against DEN rated 2nd — and reads every number from
the same fetch the table uses. New `smoke_teams.py`, three mutations, three caught. **And what a
rebase four turns ago had been hiding, all live:** `play.html` did not parse — a search-and-replace
appended `; renderCal()` to the *declaration* as well as the call sites, so **49,730 bytes of the game
page never ran**; `public/player.html` shipped with `--ink:#FF4F6B`, the token behind body text,
borders and shadows, giving **16 painted elements between 2.44:1 and 4.13:1**; and the landing map
lost the only control that reached the 12,966 seasons its own heading advertises. The `syntax` check
would have caught the first the moment it ran — it simply was not run between the rebase and the
push. **Re-run the gates after a rebase, before the push: a rebase is a merge, and the tree that gets
pushed is not the tree that was tested.**

**520 broken table rows on the player cards, and a claim that nearly shipped.** `/player-cards`
renders 2,308 markdown cards and nothing had checked any of its 39,389 wikilinks. Every archetype and
position hub lists its members in a table whose cells are wikilinks — and the row splitter was
`.split('|')`, so a link's own pipe became a column break: `<td>[[../players/rajon-rondo</td><td>Rajon
Rondo]]</td>`, **520 rows across all 13 hubs**, on the feature the page offers as the alternative to
searching by name. Two smaller ones: `[[OKF|OKF.md]]` pointed at `players/OKF` because every bare
slug was forced under `players/`, and `OKF.md`'s own format contract — `` `[[slug|Display Name]]` ``
in backticks — was linkified, rewriting the documentation into the thing it documents. **The claim
that nearly shipped:** 2,306 wikilinks resolve to nothing and 2,304 are one boilerplate word on every
player card, so "every card ships a dead link" was a commit away — until `smoke_wiki.py` failed on
its own assertion that the sentence appears as text. It is **inside an HTML comment the renderer
strips**. The real number reaching a reader was three, and the check now reports *landed*, *never
drawn* and *demoted to text* as three numbers rather than one. New `wiki` check (**16 now**, proved
red by emptying its allowlist: 2,306 findings) and new `smoke_wiki.py` — five mutations, five caught,
after `demote-bare` first ran green for want of an input rather than for want of a bug.

**Why this player — the model's own gradient, 48 bytes at a time.** Phase three is explainability,
and `/model` had the population view only. `assets/mtnn_attr_topk.bin` had held the per-player answer
the whole time and no page read it: `[12966][4][8]`, the eight input features that moved each of four
predictions most, signed. Because `topkLayout` documents the byte layout exactly, one player's slice
is **two HTTP Range requests — 48 bytes out of 2,489,472** (production answers 206 with
`accept-ranges: bytes`; checked live before this was built). `scripts/build_attr_index.py` supplies
the row number the browser cannot derive — 38,606 bytes, 2.2% of the 1.7 MB file that states it,
1,764 of 1,764 resolving. The card refuses three things in writing: it is a **local linearization,
not a counterfactual**; the attribution checkpoint (2,262,906 bytes) is **not the one the
architecture panel records** (1,563,083); and **zero means never measured**, rendered `n/m`. The
failure that mattered was never a blank screen but *plausible numbers for the wrong row*, so
`smoke_attr.py` decodes the same bytes in Python and compares — Curry 2025-26 row 12,908 and Duncan
1997-98 row 757, two targets each, all agreeing — **336 bytes on the wire with Range, 34,852,608
without, and the right row read either way.** Five mutations, five caught; pinning the row to 0 drew
AC Green's numbers under Curry's name.

**The focus-ring gate had been measuring less than it said.** Adding a card made it report *fewer*
tab stops, 499 → 493 — and a page that grew cannot lose stops. Its wrap detection keyed on
`tag.class|text`, so the second group of *Archetype / Position / Skills / Next Profile* buttons ended
the walk early; and `MAX_TABS = 60` was truncating `/players` at exactly 60, a cap reporting itself
as a count. **499 → 516 on node identity → 555 with the cap raised**; `/players` has 99. Found by a
page getting bigger, not by looking.

**The league, one season at a time.** Phase two of the brief is change over time, and `/trends` had
no way to see it — `archMap` draws every charted season at once, which is where the archetypes sit,
not how the league moved through them. The data was here in the wrong shape:
`embedding_map_trajectories.json` has **1,764 players, 30 seasons, 12,038 player-seasons** but is
keyed by player, so "where was the league in 2003-04" means walking 1,764 careers — on every frame.
`scripts/build_season_map.py` pivots it once at build time into **415,336 bytes, 36.6% of the
source, with `x`, `y`, `z` and `c` copied verbatim**. The new section loads it on an explicit press
whose size, span and count are *stamped by the generator* (proved by lying to it: `120 KB` makes
`--check` exit 1), scrubs 30 seasons with a range input and a play control, draws each season's real
roster — 290 in 1996-97, 500 in 2024-25 — on the shared camera, and counts the archetype mix **from
the points on screen** rather than from a prevalence table in a different clustering. First press:
1996-97's largest share is *Defensive Glass + Rim Pressure (Fts)* at 18%; 2025-26's is *Three-Point
Accuracy + Three-Point Volume* at 20% — and `c` in the trajectory file was checked against the file
the names come from rather than assumed to match it: **0 of 1,764 vivid rows disagree**. `smoke_season.py` checks the page against the file for five probed seasons — and
its `once` mutation **ran green twice for two different wrong reasons**: the button's own `disabled`
carried the first, and the second was counting HTTP requests that Chrome served from cache, as
production would. It counts `fetch()` calls now.

**One camera for every map, and the legend that ate one.** Five maps here; before
`assets/map-camera.js`, five contracts — the landing map could be dragged, zoomed and hovered, the
Explorer answered only to `←` `→` and `Home`, and the other three to nothing. The projection maths
was copy-pasted between the two 3D ones and had already drifted (`cy` 0.53 against 0.52). One module
now owns yaw, pitch, zoom and every gesture that moves them, and its contract is the **union** of
what the two pages had, not one imposed on the other: `H`, the focus announcement and `Home` come
from `/players`; drag, tilt, zoom and hover from `/`. Driving `/players` with real mouse events then
failed six checks at once, all one cause: the archetype key is appended **inside** the map's overlay
and fills it — `[93,191,625,371]` over a canvas of `[83,181,635,440]`, `pointer-events: auto`.
**Clicking a dot behind the legend had never worked on that page**, and nothing caught it because no
test had ever driven a real pointer at it. Every readout over both maps is `pointer-events: none`
now. `smoke_map.py` takes `--page` and drives both: **twelve mutations on index, twelve caught; six
camera mutations against `/players`, six caught** — eight of them live in the module, so one matrix
protects every map that attaches to it.

**The map was never a control.** Every page here describes a map you can turn, and neither version
of the landing page bound a gesture to it — mine span on a timer and took one click, and the version
on master claims "drag rotate yaw/pitch, wheel zoom, dblclick recenter, touch pinch" in its **commit
message** while binding **zero** `addEventListener` calls in its code. It is a control now: drag and
arrow keys rotate, ± buttons / `+` `−` / ctrl-wheel zoom within a 0.55–3× clamp, Enter picks the
point nearest the centre, and the auto-spin yields to whoever is steering. A **plain wheel still
scrolls the page** and `touch-action: pan-y` keeps the vertical swipe — a 440px canvas across the
front door is the last place to trap a scroll. One `proj()` now serves the draw loop, picking and the
selection ring; those three disagreed before, which is why the ring slid off its own dot whenever the
cloud turned. Two designed-out defects: the a11y layer's `role="img"` on something that takes arrow
keys (now `application`, with the keys spelled out in `#mapHelp` via `aria-describedby`), and a
reduced-motion spin that started off under a button still reading `◐`. New `scripts/smoke_map.py`
drives real CDP mouse and key input and reads `window.yaw`/`pitch`/`zoom` back — **nine mutations,
nine caught** — and it serves its mutations instead of writing them, so a killed run cannot leave a
broken page in the checkout.

**The ring only exists under a real Tab.** `check_focus.py` proves a focus ring exists and that Tab
reaches things in order; it never asked whether the ring can be *seen* (WCAG 1.4.11 wants 3:1). The
first measurement used `element.focus()` and reported **67 controls with no focus indicator at all** —
every one of them the measurement, not the site: Chrome does not match `:focus-visible` for scripted
focus, so **any tool that measures focus styling by scripting focus is measuring nothing.** Walked
with real key events instead: **494 tab stops, one genuine failure** — `<posecode-player>` on
`/player-animations`, a page carrying no `:focus-visible` rule at all and relying on Chrome's default
ring. It needed `:focus`, because Chrome makes an overflowing custom element a focusable scroll
container and that stop does not match the heuristic. New `check_focus_ring.py`, **eighteen checks
now**, two mutations, two caught.

**43 targets under 24px, and why none of them fails.** WCAG 2.2 added 2.5.8 Target Size at AA — 24 × 24
CSS px — and this site is built out of small mono pills that nobody had measured. Across 22 pages:
**555 targets, 43 under 24 × 24, 8 exempt as inline links in prose, 35 passing on the spacing
exception, 0 failing.** The criterion is not "everything must be 24px": a small target passes if a
24px circle centred on it reaches no other target. So the site meets it — **but 35 of those meet it by
spacing rather than size**, which a later layout change can take away silently, so it is now a gate
rather than a note. `scripts/check_target_size.py` names the crowding neighbour, because "too small"
alone is not actionable. Its first mutation **did not fire**, correctly: the shrink lost to the page's
own later rule, so the chips stayed 28px. **Seventeen checks now.**

**75 to zero, and a gate that reads the browser.** Every painted text element on all 22 pages now
clears WCAG AA — 75 → 67 → 49 → 31 → 6 → 2 → **0** — measured with its real backdrop composited
through transparent ancestors. The method the failures taught: **scope to the container that
guarantees the ground, never change a shared value.** Pills key off the class that puts the yellow
there; the two dark containers are excluded explicitly; eighteen inline declarations were swapped only
on pages with no dark ground, because an inline style beats every rule. Four of the findings were not
colour problems at all: `opacity:.7` on already-muted text composites to 3.69:1; `#zooTable .proj`
out-specified `span.proj` for three rounds; `#D64227` on white is **4.4989:1**, which rounds to "4.5"
and fails; and one inline `color:#878580` no rule could reach. New
`scripts/check_painted_contrast.py` is the browser half the static checker says it cannot do —
**sixteen checks now** — with two mutations, two caught.

**Text inks, and two attempts that traded one failure for another.** The brand colours were carrying
text below AA on every page — `#EB6834` at 3.20:1, `#009E73` at 3.42:1, `#2A78D6` at 4.42:1. Three
new tokens fix them: `--orange-ink #C84714`, `--blue-ink #2873CF`, `--green-ink #008460`. **New names,
not new values** — every ring, fill, polyline and border still draws the brand colour, and only text
moves. **67 → 31 below AA, with zero findings left on a dark ground.** Two earlier attempts were
measured and reverted: darkening the shared muted token to clear 4.5 on paper took the same text on
the `#0A0C10` inset from 5.3:1 to **4.14:1**, and giving the dark page its own light token put a
`div.mono` on its white card at **1.7:1**. The lesson is specific — a colour token is not a
light-or-dark decision at the page level; the remaining muted greys need per-container scoping, which
is the next step rather than another global swap.

**The contrast gate has never looked at what was painted.** `check_contrast.py` reads CSS rules and
says in its own docstring that colour-only rules are "printed to check in a browser, never failed on".
Nobody ran the browser half — and most of this site's text is rendered from JSON into elements a
static pass never sees. Measured on every page, scrolled until the lazy sections filled, with each
element's real backdrop composited through its transparent ancestors: **75 painted text elements below
WCAG AA across 15 colour pairs**, including the wordmark at 3.20:1, "▲ Thrived after the move" at
3.42:1, a pill at 1.92:1 — and the archetype names on the map inset at **1.04:1**, which is invisible
rather than low. That last one is fixed (75 → 67). The rest is **not** committed: darkening the muted
greys to clear 4.5 on white took the same text on the `#0A0C10` inset from 5.3:1 down to 4.14:1, so
the swap that helps on paper hurts on the inset. A palette change has to solve both background
families at once; the solved-for values are recorded on the board.

**A whole wiki page, read aloud.** Yesterday's live-region finding was a class, so the class got
swept: every `[aria-live]` element on all 22 pages, loaded and scrolled. **It came back clean — and
that was wrong**, because two were empty at the moment of measurement. `#card` on `/player-cards` and
`#twinResult` on `/trends` are the containers a card and a lookup fill; a sweep that never opens
anything reads them as 0. Opened, `#card` holds **4,283 characters** and was `aria-live="polite"` —
so opening a card announced *"Vince Carter card loaded."* **and then read out the entire wiki page**,
roughly seven hundred words, every time. The twin box announced its answer twice, once as prose and
once as the card. Both pages already said the right sentence, so the fix is subtractive. The assertion
went into the two smokes that drive those pages **with the region full**, because that is the only
state the defect exists in; both mutations caught.

**The model page read its charts aloud at you.** Two regions on `/model` carried `aria-live="polite"`
and both are containers that receive whole blocks — the twelve-row attribution chart (279 characters)
and the pipeline detail (176). A live region announces whatever lands in it, and both fill **on
arrival**, so a screen reader was handed 455 characters to a visitor who had pressed nothing, plus 321
more per press. The information was never missing: every bar already carries its own `role="img"`
label and the chips are real buttons with `aria-pressed`. The charts are ordinary regions now and one
status node carries a sentence, only when asked: *"Position — 12 features, led by
PLAYER_HEIGHT_INCHES at 1.93."* New `smoke_model.py`, three mutations, three caught — **after** its
first version passed with `aria-live` put back, because it asserted only half the fix. It asks the
principle now: a live region is for a sentence, not for twelve rows. Two sweeps found nothing, which
is the rest of the result: `/trends`' rotation chart is already one tab stop with arrow-key selection
and announcements, and every chip on both pages is already a real button with a pressed state.

**It said 10 matches. There were 538.** `/player-cards` sliced its results to ten *before* counting
them, so the announcement was the length of the list rather than the number of matches: typing `an`
matches **538** charted players and a screen-reader user was told **"10 matches."**, with ten rows on
screen and nothing saying there were more. It now says *538 matches, showing the first 10.* `/trends`
had the same shape, showing six of the eight reinvention motifs in its own file; it names them as the
six most common of eight now. Two mutations, two caught — and the assertion counts from the index the
test serves rather than asking the page, because asking the page how many matches it found is asking
the thing under test to grade itself. **A figure sweep found nothing**, which is the other half of the
result: every decimal on fourteen pages exists in a committed asset, and all 18 apparent
figure/file mismatches were the heuristic rather than the site.

**The same wrong number, five more times.** Yesterday's stale count was a hardcoded number that had
drifted from its data, and nothing here looks for that class. Every count every page states was put
next to the collection sizes of the assets that page fetches; six were within 12% of a real count
without being it. **Three were real** — eight more visitor-facing places carrying 1814 across
`index.html` and `model.html`, including the landing page's map label (`"Vector Hoops map 1814
limited"`, a filename rather than a description) and the share card it draws. **Three were the
heuristic being a heuristic**: `12345` is the LCG constant, `130` is the model's input width from
`mtnn_arch.json`, `1200` is `1200×630` and `1200ms`. The generator covers all three pages now, and
"86% mem save" is gone from the landing page in three places. The fix broke the page first — replacing
a frozen number with `dots.length` put a read above its own declaration, and three smokes went red at
once.

**1814 was 1764, in eleven places.** The Explorer's list rendered the first 80 of whatever the filter
left and said nothing about the rest, so the only route to a player outside those 80 was clicking a
dot on a canvas. A search now sits above it — nothing is fetched, the box ships `disabled` and the
script enables it, and the count is stated: *80 of 1764 shown*. **And the number was wrong**: the page
said **1814** in eleven visitor-facing places while the asset holds **1,764** usable points, with the
prose reading *"Honest count live from file"* beside the frozen number and the map label printing
`dots.length` and a hardcoded 1814 side by side, plus a "mem 86%" from nothing at all. New
`build_player_counts.py` derives both counts from the asset; the `derived` gate already runs it.
Two of my own things fell out: the hidden heading on that card said "How this page is built" over the
player list (checked all 37 — the only one wrong), and `smoke_players.py` judged the map loaded by
looking for `"pts"` in the label, so rewording it reported a working map as broken.

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

- The **preview** builds are not production: they are all `target: null`, only `master` carries
  `target: "production"`, and the preview is SSO-gated so it was never something this session could
  open. Every claim here was verified against a local server and a headless browser instead. What
  this bullet used to say — "nothing is deployed to production, the branch has never been merged" —
  is the same stale claim the header carried, in the section named for things that are not covered.
  Production *is* covered: this branch is pushed to `master` as each piece lands.
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

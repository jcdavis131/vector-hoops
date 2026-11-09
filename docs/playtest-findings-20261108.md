# Landing-page playtest findings — 2026-11-08 (triaged)

**Agent play only — never human user data.**
**Target:** branch `scout/landing-map-viz` (PR #196 draft, head `010b1c27`), served locally from its `public/` folder at `http://127.0.0.1:8472/` and playtested there. The live site (hoops.dumbmodel.com) was never tested. No merges, no production deploys, no changes to the serving model (MTNN v5 champion untouched).
**Method:** six persona agents (first-timer, speed runner, mobile thumb, keyboard-only, bug hunter, data checker), each with its own Harada mandala, working the local preview through the shared headless harness (`~/workspace/tools/qa-chrome/`, Playwright 1.64.1 + cached Chromium, no-outside-request flags). Every finding below was reproduced at least twice unless marked otherwise. Severity: **blocks play** = the visitor cannot proceed / sees nothing happen; **breaks trust** = the page misleads or confuses; **cosmetic** = visible wart or noise with no functional cost.
**Scope note:** this run covers the landing page only (`index.html` + its guided chips, honesty strip, guided stories, and 3D atlas). The whole-site phase (every page, transition, component, feature) is a separate phase after this report.

## At a glance

| | Blocks play | Breaks trust | Cosmetic | Total |
|---|---|---|---|---|
| Raw findings (6 personas) | 10 | 13 | 13 | 36 |
| **Triaged findings** | **6** | **6** | **11** | **23** |

Plus one **serve artifact** (extensionless links 404 on the plain static serve — not a page defect, see below) and one **UNVERIFIED** item kept for the record (keyboard-only F3). The triage folded 4 duplicate groups: the lazy season index (4 raw → T1), the chip scroll reset (2 raw → T2), the extensionless-link 404s (6 raw → serve artifact), and the ESPN console noise (4 raw → T13). Full triage map at the end.

**The one-line summary:** the data is fast and correct everywhere — every number checks out — but on a fresh visit the page's two core interactions are dead (map dots don't select, "Surprise me" is greyed out), and the two paths that do work (guided chips, search picks) drop the visitor where they can't see the payoff.

**Top 5 findings:**
1. **T1** — The season index loads only on demand, so map dot taps and "Surprise me" are dead on a fresh visit (blocks play).
2. **T2** — A guided chip click reloads the page to the top; the twin list it promises sits ~2,200 px below (blocks play).
3. **T4** — Search shows only the 8 most recent seasons, so Curry 2015–16, LeBron 2012–13, and Kobe's first 11 seasons are unreachable by search (blocks play).
4. **T7** — Typing `Jokić` — the exact spelling in the search placeholder — returns a false "No season matches that name" (breaks trust).
5. **T9** — At 1280×800 the whole first viewport is headline; the search box sits below the fold (breaks trust).

---

## Blocks play

### T1 — Season index loads only on demand: map dot taps and "Surprise me" are dead on a fresh visit

- **Personas:** first-timer (F3), bug hunter (F4, F5), mobile thumb (F1) — 4 raw findings, one root cause.
- **Page URL:** http://127.0.0.1:8472/
- **Repro:**
  1. Fresh load the landing page in a clean browser context.
  2. Scroll the 3D atlas into view and tap/click any dot in the cloud (bug hunter: 45 + 55 clicks across two sessions; mobile thumb: 35 touch taps + 1 mouse click; 0 selections in all cases). The readout stays "Select any point on the atlas, or search a name above." No error, no feedback — the clicks fail silently.
  3. Scroll to "Surprise me" under the search box: it is `disabled` (greyed). It stays disabled 25 s after load, after the map has been in view 10 s, and after 40+ s of map interaction.
  4. Click any guided chip (or select via search): the index loads (`VHAtlas.size()` goes 0 → 12,966) and both interactions wake up — the next dot tap selects immediately (Taurean Prince 2020–21; Terry Rozier 2016–17; Jordan Poole 2021–22 in the three runs) and "Surprise me" enables and works (Gerald Wallace 2004–05).
- **Screenshots:** `screenshots/t01-dot-selected-after-chip.png` (works after a chip select), `screenshots/t01-tap-warmed.png` (same tap selects once the index is warm), `screenshots/t01-surprise-disabled.png` (greyed-out button on a fresh load).
- **Console output:** none on this path — the failures are silent.
- **Root cause (verified in the served code):** the season index (`NAMES`/`SEASONS`, `N`) is decoded from `assets/projections/embed3d.json` only inside `ensureIndex()` in `assets/atlas-3d.js`, which is called only from search focus/typing, `VHAtlas.select` (chip/story links), or a `?id=` deep link — nothing calls it eagerly at boot. The canvas click path calls the internal `select()` directly, without `ensureIndex`; with `N = 0`, `select()` maps every id to `-1`, so the tap is a silent no-op. "Surprise me" (`home-tonight.js` `wireSurprise()`) enables via `VHAtlas.onReady` (fires when the index decodes) or `onSelect` — but the index never loads before the first select, so the button's only real enable path is "the visitor already selected something". Its own code comment says "enable Surprise me as soon as the data is in" and "the season file (phase 1) lands eagerly" — neither holds in this build.
- **Fix suggestion:** call `ensureIndex` eagerly at boot (or from the canvas click path and the Surprise wiring), so the hero CTA and the map's advertised tap work before any selection.

### T2 — Guided chip click reloads the page to the top; the twin list it promises sits ~2,200 px below

- **Personas:** first-timer (F1), mobile thumb (F2) — 2 raw findings, same defect.
- **Page URL:** http://127.0.0.1:8472/ → http://127.0.0.1:8472/?proj=pca&id=672
- **Repro:**
  1. Load the landing page, scroll to the guided chips, click/tap "Jordan 1997–98 — see who the model puts closest".
  2. The page fully reloads and lands on the hero headline (desktop: scrollY 1573 → 0; mobile: scrollY 1560 → 0). Nothing visibly changed.
  3. Scroll down ~2,200 px: the peers table now shows Kobe Bryant 2011–12 / 2012–13 / 2009–10 (0.833 / 0.819 / 0.810). The chip's payoff did arrive — below the fold.
- **Screenshots:** `screenshots/t02-chip-after-click.png` (pixel-identical to the landing hero — itself the evidence), `screenshots/t02-chip-landing-mobile.png`.
- **Console output:** none for this step (one ViewTransition InvalidStateError observed once on this navigation, mobile run — see T13).
- **Note:** this is deliberate in code, not an accident — `assets/home-tonight.js` says "the atlas's own opening selection (and URL ?id=) never moves the page". The design intent collides with the first-timer experience: the chip is the page's own invitation to "see who the model puts closest", and following it shows the visitor nothing.
- **Fix suggestion:** after a chip navigation, scroll to the readout/map (the same `showMap()` the search-pick path already uses).

### T3 — Search pick scrolls to the map but not to the peer names

- **Persona:** first-timer (F2).
- **Page URL:** http://127.0.0.1:8472/?id=12787 (after picking LeBron James 2025–26)
- **Repro:**
  1. Load the landing page, scroll to the search box, type "LeBron James".
  2. Click the first dropdown option (LeBron James 2025–26).
  3. The viewport shows the 3-D map, with the selected dot and its twins as ~3 tiny red specks in a white dot-cloud. No names anywhere. The peers table top sits just above the visible area (viewport y −78).
  4. Scroll down one screen: the peers table shows Paolo Banchero 2023–24 (0.805) etc.
- **Measured:** scrollY after pick 1151; peers populate in 3.8–4.5 s.
- **Screenshot:** `screenshots/t03-search-pick-viewport.png` (also the evidence for T14).
- **Console output:** none for this step.
- **Fix suggestion:** scroll so the selected readout + peers table (not just the map canvas) are in view after a pick.

### T4 — Search shows only the 8 most recent seasons, so older seasons are unreachable by search

- **Persona:** data checker (F2).
- **Page URL:** http://127.0.0.1:8472/
- **Repro:**
  1. Load the landing page, type `Stephen Curry` in the hero search box.
  2. Count the dropdown options and look for 2015–16: exactly 8 options, newest first, stopping at 2017–18 — 2015–16 is absent. Same for `LeBron James` (8 options stopping at 2018–19; 2012–13 absent) and `Kobe Bryant` (8 options stopping at 2007–08 — his first 11 seasons unreachable).
- **Expected (from the files):** Stephen Curry has 17 seasons in `vectors_search_lite.json` (2009–10 to 2025–26, minus 2019–20, which is correctly absent — 5 games, below the eligibility threshold); LeBron James has 23; Kobe Bryant has 20 (minus 2013–14, 6 games, correctly absent).
- **Screenshots:** `screenshots/t04-curry-cap.png`, `screenshots/t04-curry-cap-2.png`.
- **Console output:** none related.
- **Root cause:** `assets/atlas-3d.js` `doSearch()` ends `results = all.slice(0, 8)`, sorted most-recent first, and the query matches names only — there is no way to type a season to narrow it. The story's own hero example, Curry 2015–16, can therefore only be reached via its chip/deep link (`?proj=tsne&id=8197`), not via the search the hero advertises ("Type any player").
- **Fix suggestion:** raise the cap, or let the visitor type a season to narrow the list.

### T5 — No keyboard way to select a point on the 3D map

- **Persona:** keyboard-only (F1).
- **Page URL:** http://127.0.0.1:8472/ (atlas section, `#atlas`)
- **Repro:**
  1. Load the landing page, press Tab repeatedly (15 presses from the top) until the canvas is focused. Focused label reads: "Player map: drag or use the arrow keys to turn it, + and − to zoom".
  2. Press ArrowRight, ArrowDown — the view rotates, the page does not scroll, focus stays on the canvas.
  3. Press Enter, then Space. Nothing changes: the readout still says "Select any point on the atlas, or search a name above."
  4. Press Tab — focus leaves the canvas to the Clear button (no trap, but no selection either).
- **Screenshot:** `screenshots/t05-focus-canvas.png` (canvas focused, red outline, point cloud visible).
- **Console output:** none relevant (no page errors in any run).
- **Root cause:** `assets/embed-3d.js` — the canvas `keydown` handler handles only ArrowLeft/Right/Up/Down and `+`/`-`. Point selection lives only in the `pointerdown`/`pointerup` path. The mount's `aria-label` says "Drag to rotate, tap a point to select." — pointer-only verbs. The canvas's own label mentions arrows and zoom but never selection. (Related to T1 but distinct: even with the index warm, there is still no key that selects a point.)
- **Mitigation that exists:** a keyboard user CAN select a season by name — search box (type + ArrowDown + Enter), the three guided chips, the twelve story links, and the peer-table rows (Tab to a row, Enter/Space) all work. What is missing is picking an arbitrary point on the map itself — the thing the map's own label advertises.
- **Fix suggestion:** give the canvas a point-cycling key (e.g. `[`/`]` to step points, Enter to select), or add a visible "Select a point without a mouse" control next to the map. At minimum, change the mount label so it does not promise a tap-only action to keyboard users.

### T6 — Map Hunt has no puzzle today (2026-11-09 is outside the puzzle window)

- **Persona:** speed runner (F7).
- **Page URL:** http://127.0.0.1:8472/map-guess.html (direct load; unreachable from the landing page on this serve — see the serve-artifact section)
- **Repro:**
  1. Load `/map-guess.html` directly (twice, fresh contexts).
  2. The notice card reads: "Map Hunt is taking the night off. There is no puzzle for 2026-11-09: that date is outside the puzzle window."
- **Screenshot:** `screenshots/t06-map-hunt-off.png`.
- **Console output:** none tied to this.
- **Note:** the page is honest about it (it says why, and offers alternates). This is a date-dependent finding — 1 of the 3 advertised games is unplayable on the playtest date. Its fallback exits ("Play today's" → `/map-guess`, "Play the classic Daily Court instead" → `/play`) point at the same extensionless links as the serve-artifact section; on Vercel those resolve, so the fallback issue is a serve artifact, not a page defect. Code confirmation (read-only): `assets/map-hunt.js:324-326` renders exactly this message when the date falls outside the puzzle window — deterministic for today, not a load flake.

---

## Breaks trust

### T7 — Typing `Jokić` — the exact spelling in the search placeholder — returns a false "No season matches that name"

- **Persona:** data checker (F1).
- **Page URL:** http://127.0.0.1:8472/
- **Repro:**
  1. Load the landing page, click the hero search box (placeholder: "Find a player — Curry, Jokić…").
  2. Type `Jokić` (with ć, exactly as the placeholder spells it).
  3. Read the dropdown: `No season matches that name.` — twice, in two browser sessions. Same result for `Dončić`. Typing the unaccented `Jokic` / `Doncic` returns 8 seasons each.
- **Expected (from the files):** 7 Nikola Jokic seasons exist — `vectors_search_lite.json` `players[]` with `n="Nikola Jokic"`, seasons 2019–20 through 2025–26; `projections/embed3d.json` `meta.names` contains `Nikola Jokic`. The data store holds **zero** non-ASCII display names (0 of 2,422 in `embed3d.json` `meta.names`), while the search in `assets/atlas-3d.js` `doSearch()` does a raw `indexOf(q)` with no accent folding — so any accented query can never match. The page's own placeholder invites the spelling its index cannot match.
- **Screenshot:** `screenshots/t07-jokic-accent.png`.
- **Console output:** none related (no error on this path).

### T8 — Search ranks Jordan 2002–03 (Wizards) first, not the famous 1997–98 season

- **Persona:** first-timer (F4).
- **Page URL:** http://127.0.0.1:8472/
- **Repro:**
  1. Load the landing page, scroll to the search box, type "Michael Jordan".
  2. Read the dropdown: 2002–03, 2001–02, 1997–98, 1996–97 (most recent first).
  3. Click the first option: the readout says "Michael Jordan 2002–03", #1 twin LeBron James 2003–04 (0.770) — not the Kobe twin the chips and stories promise.
- **Screenshot:** `screenshots/t08-jordan-dropdown.png`.
- **Console output:** none for this step.
- **Note:** recency ordering is fine for LeBron (top hit 2025–26 is the current season), but for a retired legend it puts the least-famous season first. A first-timer's most likely click lands on Wizards Jordan.
- **Fix suggestion:** rank a player's best-known / peak season first, or label the dropdown with a hint (e.g. team) so the choice is informed.

### T9 — At 1280×800 the whole first viewport is headline; the search box sits below the fold

- **Persona:** first-timer (F5).
- **Page URL:** http://127.0.0.1:8472/
- **Repro (every load):**
  1. Load the landing page at 1280×800 and do not scroll.
  2. Observe: nav + the giant H1 ("A 3-D sketch of 12,966 player-seasons: near on the map means similar style, but the model's twin list is the verdict.") fill the viewport. The second line of the clarifying subhead ("Type any player. A neural embedding finds the three seasons since 1996–97 that play most alike…") is cut off mid-line at the bottom edge.
  3. The search box sits at page y=856 (56 px below the fold); its dropdown opens further below, off-screen.
  4. The only visible buttons above the fold are nav "Explore" and "Sound" — no call to action.
- **Screenshot:** `screenshots/t09-landing-viewport.png` (hero only).
- **Console output:** none for this step.
- **Note:** this is also why the headline reads as jargon on first read — "player-seasons", "the model", "twin list" are only decoded by the subhead and honesty strip, both of which require scrolling.
- **Fix suggestion:** shrink the hero so the search box (and at least the subhead) fit in the first viewport at 1280×800.

### T10 — Sticky nav covers section headings and lets text bleed through (mobile)

- **Persona:** mobile thumb (F3).
- **Page URL:** http://127.0.0.1:8472/ (390×844, touch)
- **Repro:**
  1. Scroll any story heading to the top of the viewport (scrollIntoView, or plain thumb scrolling).
  2. The heading's first line slides under the sticky nav and is cut mid-glyph: navBottom 114 px, headingTop 60 px — the heading "The model's twins cross eras — it matches style, not time." sits 54 px under the nav.
  3. While scrolling, body text shows through the nav bar itself: the hero line "…matches style, not time." is faintly readable behind MAP / PLAY / EXPLORE.
- **Screenshot:** `screenshots/t10-heading-under-nav.png` (both defects visible in one frame).
- **Console output:** none.
- **Root cause (served `assets/shell.css` + `assets/atlas.css`):** on ≤900 px the nav becomes two rows (brand + links) and measures 114 px tall live, but `--nav-h` is 44 px so `scroll-padding-top` is only 60 px — 54 px short. The nav background is `color-mix(in srgb, var(--bg) 86%, transparent)` plus backdrop blur, i.e. 14% see-through against high-contrast black body text.

### T11 — Daily Court's first-visit onboarding modal intercepts every click until dismissed

- **Persona:** speed runner (F5).
- **Page URL:** http://127.0.0.1:8472/play.html (direct load; unreachable from the landing page on this serve — see the serve-artifact section)
- **Repro:**
  1. Load `/play.html` in a fresh context.
  2. A "How to play" modal appears (`#onboarding-backdrop.sheet__backdrop` + `.sheet[role=dialog]`).
  3. Click the brand home link: `page.click` times out after 30 s (hit-test: the backdrop swallows the click — the link under it is not hit-testable).
  4. Click ▶ Play Court: the modal dismisses. Reload in the same context: no modal (localStorage `vh.onboardSeenV3`).
- **Screenshot:** `screenshots/t11-daily-court-modal.png`.
- **Console output:** none tied to this.
- **Note:** the modal never reshows in the same browser once dismissed, so this bites exactly one click on a first visit — but it is a forced extra click on the game's own front door. Map Hunt and Twenty Questions have no such modal.

### T12 — Browser back loses the typed search text

- **Persona:** speed runner (F6).
- **Page URL:** http://127.0.0.1:8472/
- **Repro:**
  1. Type "Jordan" in the search box and pick the Jordan 1997–98 chip. The search input shows "Jordan", the URL is `?id=672&proj=pca`, and the selected panel reads "Michael Jordan · 1997–98".
  2. Navigate to `/play.html`, then press browser back.
  3. The URL, selection, and atlas are all restored — but the search input is now empty (`""`), even though the search text was what produced the selection.
- **Screenshots:** `screenshots/t12-state-before-back.png` (input "Jordan"), `screenshots/t12-state-after-back.png` (input empty).
- **Console output:** none tied to this.
- **Note:** selection and projection survive the round trip via the URL; only the typed text is lost.

---

## Cosmetic

### T13 — Tonight strip retries the scoreboard in a loop; console fills with 404/504 noise (plus a ViewTransition error)

- **Personas:** first-timer (F6), bug hunter (F3), speed runner (F8), mobile thumb (F7) — 4 raw findings, one issue.
- **Page URL:** http://127.0.0.1:8472/ (every load)
- **Repro:**
  1. Load the landing page with the console open.
  2. Watch: `GET /api/espn/scoreboard → 404` alternating with `GET https://site.api.espn.com/.../scoreboard → 504 / ERR_NAME_NOT_RESOLVED / ERR_ABORTED`, repeating every few seconds (6+ cycles in 55 s; bug hunter: 12 page-caused console errors in run 2, 8 in the followup — 2 per page load, every load, 9 loads total).
  3. The page degrades gracefully — static text only ("Courtside Live follows every NBA game as it happens…"), the games list stays `hidden`, no error is shown to the visitor. Links to /live and /replay still render.
- **Console output (verbatim, per load):**
  - `Failed to load resource: the server responded with a status of 404 (File not found)` — `http://127.0.0.1:8472/api/espn/scoreboard`
  - `Failed to load resource: net::ERR_NAME_NOT_RESOLVED` — `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard` (first load) or `Failed to load resource: the server responded with a status of 504 (Offline)` (later loads)
  - Plus one `pageerror: Transition was aborted because of invalid state. ViewTransition opt-in disabled` on navigations (first-timer, speed runner, mobile thumb all saw it).
- **Note:** the external ESPN failure is expected in this offline harness (no outside requests allowed), and the local `/api/espn/scoreboard` 404 is partly a serve artifact (no API route on the static serve; `vercel.json` rewrites it to ESPN). What is page behaviour, and the finding, is the tight retry loop with no backoff and the resulting console noise on every load. Severity is cosmetic because the visitor sees no breakage — but no load completes with a clean console.
- **Fix suggestion:** back off the scoreboard retry (or stop after the first failure) and silence the expected-offline path.

### T14 — On the map, the selected season and its twins are ~3 tiny red specks in a white blob

- **Persona:** first-timer (F7).
- **Page URL:** http://127.0.0.1:8472/?id=12787 (or any selection)
- **Repro:**
  1. Select any player (search pick or chip).
  2. Look at the 3-D map: a white dot-cloud on black; the selection and twins are a few small red dots near the bottom of the cloud, barely distinguishable at 1280×800.
  3. The map alone does not communicate the twin — the names in the peers table (below, out of view per T3) carry the whole "aha".
- **Screenshot:** `screenshots/t03-search-pick-viewport.png` (same shot as T3).
- **Console output:** none for this step.
- **Note:** the page is honest about this ("Color appears only on your selection and its twins", "nearby dots can mislead") — the finding is only that the visual payoff of the map is weak for a first-timer. Enlarging/highlighting the twin dots or adding a "your pick + twins" callout on the canvas would make the map itself deliver the aha.

### T15 — Drawer Close button is unreachable by forward Tab once the drawer is open

- **Persona:** keyboard-only (F2).
- **Page URL:** http://127.0.0.1:8472/ (site nav, Explore drawer)
- **Repro:**
  1. Load the landing page, Tab to the Explore button (5th stop) and press Enter. The drawer opens; focus moves to the first item (Atlas).
  2. Press Tab 13 times through all items (Atlas … Guide). The 14th Tab lands on the search box — focus has left the drawer. Close was never focused.
  3. Reopen the drawer, press Shift+Tab once from the Atlas item — focus lands on Close. Press Escape anywhere in the drawer — it closes and focus returns to the Explore button.
- **Screenshot:** `screenshots/t15-drawer-open.png`.
- **Console output:** none.
- **Note:** the Close button sits in the drawer header, before the item list in DOM order, while opening the drawer moves focus to the first item — so forward Tab can never reach it. Escape already covers the function, so this is ordering polish, not a trap.
- **Fix suggestion:** move the Close button after the item list in DOM order (or make opening the drawer focus Close first).

### T16 — Search input's focus ring is a pale halo, not the standard 2px red outline

- **Persona:** keyboard-only (F4).
- **Page URL:** http://127.0.0.1:8472/ (hero search, `#atlas-search`)
- **Repro:**
  1. Load the landing page, press Tab 8 times to the search box.
  2. The input shows a faint yellow glow where every other stop shows a hard red ring.
- **Measured:** the search input is the only stop of 56 in the full Tab walk with `outline-style: none`. Its focus indicator is a 4px pale-yellow box-shadow halo (`rgba(255,235,130,0.55) 0px 0px 0px 4px`) plus a red border — visible, but lower contrast than the 2px solid red outline (`rgb(224,72,59)`, offset 3px) every other control gets. Two sources agree: live computed style and the CSS (`:focus { outline: none; }` + `input:focus-visible` in `assets/atlas.css`).
- **Screenshot:** `screenshots/t16-focus-search.png`.
- **Fix suggestion:** give the search input the same 2px solid red `:focus-visible` outline as the other controls (keep the halo if wanted, but do not rely on it alone).

### T17 — Two primary nav links are under 44 px wide; footer links are 32 px tall (mobile)

- **Persona:** mobile thumb (F4).
- **Page URL:** http://127.0.0.1:8472/ (390×844, touch)
- **Repro (twice — identical 22-item lists, live `getBoundingClientRect`):**
  1. Load the page at 390 px and measure visible links/buttons.
  2. Nav "Map" is 38×48 px, nav "Play" is 43×48 px (width under the 44 px bar; height is fine).
  3. Footer links measure 167×32 px (Daily Court, Map Hunt, Twenty Questions, Era Crossed, Pixel Replay, Live, Schedule, Players, Insights, Twin Networks, Playoff Runs, Taxonomy, Guide) and 358×32 px (Methods, Models, Source on GitHub); "dumbmodel" is 67×15 px. Inline text links are 16 px tall.
- **Screenshot:** `screenshots/t17-mobile-top.png` (nav).
- **Console output:** none.
- **Note:** every other primary action passes 44 px — search field, "SURPRISE ME" (151×44), guided chips (44 tall, full width), PCA/T-SNE/UMAP pills, CLEAR / COPY LINK / SHARE IMAGE, story-card buttons. The off-screen "Skip to content" link (126×37, top −51) is excluded — it is hidden until focused. The nav misses are 1–6 px of width.

### T18 — Guided chip labels are 11.5 px (mobile)

- **Persona:** mobile thumb (F5).
- **Page URL:** http://127.0.0.1:8472/ (390×844, touch)
- **Repro (twice, live `getComputedStyle`):**
  1. Scroll to the guided chips under the map.
  2. Chip label font-size is 11.5 px (Jordan / Kobe / Curry chips and all "See …" chips), all-caps letterspaced, wrapping to two lines inside 44 px-tall buttons.
  3. Compare: story-card body is 15 px, story headings 24 px, map legend/note 15 px, page body 15 px.
- **Screenshot:** `screenshots/t18-chip-labels.png`.
- **Console output:** none.
- **Note:** chips wrap cleanly into 4 rows (row height 245 px, width 358 px, no overflow) and are 44 px tall — tappability is fine; only the label size is small.

### T19 — Map tooltip clips off the right viewport edge (mobile, hover only)

- **Persona:** mobile thumb (F6). Observed once via mouse hover + code-confirmed; touch has no hover so this path is mouse-only.
- **Page URL:** http://127.0.0.1:8472/ (390×844)
- **Repro:**
  1. Move a pointer to the right side of the dot cloud.
  2. The tooltip renders at cursor + 14 px with no clamp and runs past the 390 px edge: "Tariq Abdul-Wahad · 1999-0…" is cut at the viewport edge.
- **Screenshot:** `screenshots/t19-tooltip-clip.png`.
- **Console output:** none.
- **Root cause (served `assets/embed-3d.js`, `hover()`):** `tip.style.left = (e.clientX - r.left + 14) + 'px'` with no min/max clamp against canvas width. No page-level horizontal scroll results (scrollWidth stays 390).

### T20 — Honesty strip says the sketch "shows 3 of the model's 64 dimensions"

- **Persona:** data checker (F3).
- **Page URL:** http://127.0.0.1:8472/ — honesty strip under Fig. 1.
- **Shown:** "It shows 3 of the model's 64 dimensions, so two dots can look far apart while the model calls them twins."
- **Expected (from the files):** the sketch shows 3 PCA *components* of the 64-d embedding, not 3 of the 64 dimensions. `projections/embed3d.json` `meta.method.pca` = "sklearn PCA n_components=3 (SVD)"; `meta.variance_explained` = [0.1027, 0.0977, 0.0649] — the three components together capture ~26.5% of the variance (the map caption's "~27% of the differences" is the accurate version of the same fact). The disclosure directly below the strip says it correctly ("three PCA dimensions"). The underlying claim — peers can sit far apart on the sketch — is true and verified (Kobe→Dirk ranks 448th on PCA).
- **Screenshot:** `screenshots/t20-atlas-empty.png`.
- **Note:** loose shorthand, contradicted nowhere else on the page, and the accurate wording sits one disclosure below it.

### T21 — "Same archetype" in the stories is true only for the displayed archetype definition

- **Persona:** data checker (F4).
- **Page URL:** http://127.0.0.1:8472/ — Stories 1 step 3 and 3 step 3.
- **Shown:** Jordan 1997–98 and Kobe 2011–12 "carry the same archetype: 'Scoring Volume + Free-Throw Shooting'"; same wording for Curry 2015–16 / Harden 2017–18.
- **Expected (from the files):** true for the archetype the page displays. `archetype_assignments.json` `assignments[id].mtnnGlobalName` = "Scoring Volume + Free-Throw Shooting" for all four rows (ids 672, 6317, 8197, 8885), and that is exactly the field `assets/atlas-3d.js` `ensureArch()` renders. But the same file carries a second archetype field, `eraNativeName`, where Jordan 1997–98 is "Scoring Volume + Perimeter Shooting" while Kobe 2011–12 is "Scoring Volume + Free-Throw Shooting" — so a reader cross-checking the file's other archetype column would see different labels for the Jordan/Kobe pair. (Curry/Harden share both fields: eraNativeName "Scoring Volume + Two-Way Impact" for both.)
- **Screenshot:** `screenshots/t21-stories.png`.
- **Note:** the page is internally consistent; the ambiguity is only visible to someone reading the raw file's second archetype field. Worth one clarifying word ("model archetype") if the copy is ever touched.

### T22 — Daily Court card shows tomorrow's date in the evening (UTC day, not Chicago day)

- **Persona:** data checker (F5).
- **Page URL:** http://127.0.0.1:8472/ — Play section, "Daily Court · World 11-09".
- **Shown at check time:** `11-09`. Local date in America/Chicago at the time was Nov 8 (evening); the VM/browser clock was Nov 9 ~00:5x UTC.
- **Expected:** this is intentional per code, not a data error — `assets/inline-index.js` sets `#today-world` from `new Date().toISOString().slice(0,10)` (UTC date), so the game day rolls at UTC midnight. No file contradicts it.
- **Screenshot:** none — date read from the card; see the Play section in `screenshots/t23-landing-desktop.png`.
- **Note:** a Chicago evening visitor reads "today" as Nov 8 and sees 11-09. Flagged only so the date convention is a conscious choice, not an accident.

### T23 — Only Daily Court has a top-level visible entry; Map Hunt + Twenty Questions hide in the drawer or ~4,200 px down

- **Persona:** speed runner (F9).
- **Page URL:** http://127.0.0.1:8472/
- **Repro:**
  1. Land on the page and look for the games. Only Daily Court has a top-level visible entry (nav "Play").
  2. Map Hunt and Twenty Questions are reachable only from the Explore drawer (1 extra click; the items sit below the drawer fold on mobile) or from the hero cards at ~4,213 px desktop / ~4,871 px mobile (~5 screens down), footer ~5,084–5,213 px.
- **Screenshot:** `screenshots/t23-landing-desktop.png`.
- **Console output:** none tied to this.
- **Note:** the three games exist and work at their `.html` URLs — the finding is discoverability, not availability. On the plain static serve the drawer/footer links 404 (serve artifact, below); on Vercel they resolve.

---

## Serve artifact — extensionless links 404 on the plain static serve (NOT a page defect)

- **Personas:** bug hunter (F1, F2), speed runner (F1–F4) — 6 raw findings folded here.
- **What was seen:** on the local `python3 -m http.server` serve, 13 of 26 same-origin links return 404 (`/methods`, `/map-guess`, `/live`, `/schedule`, `/players`, `/twin-network`, `/playoff-runs`, `/twenty-questions`, `/taxonomy`, `/models/mtnn-v5`, `/guide`, `/replay`, `/play/era-crossed`), and `/play` + `/insights` serve raw Python directory listings (title `Directory listing for /play/`) instead of pages. The speed runner's link probe found the same shape: 26 distinct internal hrefs — 9 reach the promised page, 4 serve a directory listing, 13 404.
- **Why it is a serve artifact, not a page defect:** the plain server applies no rewrites. The repo's `vercel.json` (worktree root, `cleanUrls: false`) defines a rewrite for every one of these 13 (`/methods` → `/methods.html`, `/live` → `/live.html`, …, `/play/era-crossed` → `/play/era-crossed.html`, `/models/mtnn-v5` → `/models/mtnn-v5.html`), and every destination `.html` file exists in `public/`. On Vercel these links resolve. Control check: `/methods.html` loads 200 ("How it works — methods — Vector Hoops") while `/methods` 404s on this serve.
- **Screenshots:** `screenshots/artifact-nav-methods-404.png`, `screenshots/artifact-play-listing.png`.
- **The durable observation:** the links are rewrite-dependent, not self-sufficient — any plain static serve (or a dropped rewrite) breaks them. That is a robustness note, not a defect in the page as served on Vercel.
- **What this does NOT cover:** T6's "no puzzle today" message and T11's onboarding modal are genuine page behaviour on their own pages — only their *reachability from the landing page* was affected by this serve artifact.

---

## UNVERIFIED (kept, not a finding)

- **Keyboard-only F3 — projection switcher appeared not to switch in one screenshot.** In one run, after Tab to t-SNE and Enter, the probe read `data-projection="pca"` (unchanged) and the screenshot showed PCA still active. Three later reproductions prove the switcher works: `aria-pressed` flips to t-SNE=true / PCA=false, the note text changes to the t-SNE description ("This view keeps tight groups together…"), and computed styles confirm t-SNE dark/active with the point cloud reshaped. The early probe was invalid (`setProjection` never writes the mount's `data-projection` attribute) and the early screenshots were stale headless frames. No action needed.

---

## Verified working (no finding)

- **Data:** 12,966 player-seasons in both data files and on the page (headline, plate, footer, `#atlas-count`); footer seasons 1996–97 to 2025–26 (30 seasons); 64-d embedding. Twin lists match `peers_top8.json` exactly — Jordan 1997–98 (Kobe 2011–12 0.833, 2012–13 0.819, 2009–10 0.810), Curry 2015–16 (Harden 2017–18 0.856, Harden 2015–16 0.827, Westbrook 2015–16 0.825), LeBron 2012–13, Kobe 2008–09 — names, order, and stats. Sketch ranks recomputed exactly from `embed3d.json` (Kobe 32nd-nearest to Jordan on PCA; Dirk 448th to Kobe; Harden 2nd to Curry; Dirk 10th in UMAP). Archetype labels shown all match `archetype_assignments.json` `mtnnGlobalName`. Lab figures match `insights.json` (Jrue Holiday −8.7 usage; Parsons $22.1M bought 0.2 win shares). Twin of the Day is a real `twin_explainer.json` entry (Anthony Edwards ~ Michael Jordan, sim 0.715, 28 seasons apart, DEEP CUT). Search gaps are data-correct: Curry 2019–20 and Kobe 2013–14 are below the eligibility threshold and correctly absent.
- **Interactions:** guided chips 3/3, guided stories 12/12 step links (all select + 3 peers), search valid/nonsense/empty (nonsense → clean "No season matches that name", no crash), map drag rotates, projection switcher 3/3 (PCA/t-SNE/UMAP), Clear / Copy link ("Link copied") / Share image (PNG download) / "How to read this map" disclosure all work. Zero uncaught exceptions — 0 `pageerror` events across all runs.
- **Keyboard:** full Tab walk — 58 focusable elements, all reachable in sensible order, walk wraps with no trap; Escape closes the listbox and the drawer with sensible focus return; no meaning carried by colour alone; 55 of 56 stops show a solid 2px red focus outline (the 56th is T16).
- **Mobile:** no horizontal overflow at 390 px (scrollWidth 390, 0 offenders, three runs); touch drag rotates the map; search works by touch alone (Curry → 8 results → Stephen Curry 2025–26 selected); guided chips wrap and are tappable; story cards readable at 15 px body / 24 px headings.
- **Load:** page load 1.8 s, H1 visible 2.9 s, chip → peers in DOM 2.5–3.4 s, search dropdown 1.7–2.0 s, search pick → peers 3.8–4.5 s (desktop); landing load 6.1/6.4 s desktop, 5.4 s mobile (speed runner, page settle incl. title fetch).

## Per-persona verdict rollup

- **First-timer:** FAIL reaches a twin list / aha within 30 s (T1, T2); FAIL headline understandable on first read (T9); PASS search finds a known player; PASS guided chips lead to a changed map state; FAIL no step leaves a first-timer with no visible next action (T1, T2, T3, T9).
- **Speed runner:** FAIL Daily Court loads without a forced extra click (T11 + serve artifact); FAIL every primary link reaches the promised page (serve artifact); FAIL back/forward restores exact state (T12); FAIL all three advertised games startable today (T6 + serve artifact); FAIL clean console / no repeated failed requests (T13 + serve artifact).
- **Mobile thumb:** PASS no horizontal scroll or clipped content at 390 px; FAIL every primary action is tappable (≥44 px target) (T17); FAIL the map responds to touch drag and dot taps (T1); PASS search + result selection work by touch alone; FAIL text is readable without pinch-zoom (T18).
- **Keyboard-only:** FAIL every interactive element is reachable and operable by keyboard alone (T5); PASS focus is always visibly indicated (except T16, cosmetic); PASS no keyboard trap; PASS Escape closes overlays and returns focus sensibly; PASS no meaning is carried by colour alone.
- **Bug hunter:** FAIL zero console errors on load and during the full exercise (T13); FAIL zero failed same-origin requests (T13 + serve artifact); FAIL every same-origin link loads (serve artifact); FAIL every button does something visible (T1); PASS no uncaught exception in any exercised interaction.
- **Data checker:** PASS headline player-season count matches the data files exactly; PASS sampled twin lists match the model data; PASS honesty-strip claims are true of the page's actual behaviour (except T20 wording); PASS archetype labels match `archetype_assignments.json`; FAIL no stale or mismatched figure anywhere (T7, T4).

## Triage map (raw → triaged)

| Triaged | Raw findings folded in |
|---|---|
| T1 | first-timer F3, bug-hunter F4, bug-hunter F5, mobile-thumb F1 |
| T2 | first-timer F1, mobile-thumb F2 |
| T3 | first-timer F2 |
| T4 | data-checker F2 |
| T5 | keyboard-only F1 |
| T6 | speed-runner F7 |
| T7 | data-checker F1 |
| T8 | first-timer F4 |
| T9 | first-timer F5 |
| T10 | mobile-thumb F3 |
| T11 | speed-runner F5 |
| T12 | speed-runner F6 |
| T13 | first-timer F6, bug-hunter F3, speed-runner F8, mobile-thumb F7 |
| T14 | first-timer F7 |
| T15 | keyboard-only F2 |
| T16 | keyboard-only F4 |
| T17 | mobile-thumb F4 |
| T18 | mobile-thumb F5 |
| T19 | mobile-thumb F6 |
| T20 | data-checker F3 |
| T21 | data-checker F4 |
| T22 | data-checker F5 |
| T23 | speed-runner F9 |
| Serve artifact | bug-hunter F1, bug-hunter F2, speed-runner F1, speed-runner F2, speed-runner F3, speed-runner F4 |
| UNVERIFIED | keyboard-only F3 (not a finding) |

## Limitations

- **Offline harness:** the harness blocks outside requests by design, so ESPN live data (Tonight strip scores, /live) could not be verified; the Tonight section's fallback copy makes no false claim. The external half of T13's console noise is harness-caused; the retry loop itself is page behaviour.
- **`mtnn_embeddings.f32` absent from this worktree:** `public/assets/` has no such file, so cosine similarities could not be recomputed from the raw 64-d embeddings. `peers_top8.json` (run `july-v5-a4918f09`, built 2026-10-19, pinned to f32 sha256 `2574ef58…`) is the authority the page itself uses, and every displayed similarity matches it exactly. The landing page does not load `mtnn.js`, so no missing-file fetch occurs on this page.
- **Raw persona reports** (mandalas, full findings, all screenshots, run JSONs) live outside this repo at `~/workspace/.jarvis/idea-executions/f680e716-b47f-4372-89d5-137d3155d299/scratch/<persona>/` (first-timer, speed-runner, mobile-thumb, keyboard-only, bug-hunter, data-checker).

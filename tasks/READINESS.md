# frontend-live — readiness

**Nothing here is live.** All 129 commits are on `frontend-live`; `master` is untouched, and
pushing `master` is what deploys the site. Suite green at the time of writing.

| | |
|---|---|
| commits ahead of master | 129 |
| paths changed | 2,628 (2,546 under `public/`, 30 scripts) |
| insertions / deletions | +199,624 / −310,403 |
| working notes | `tasks/frontend-live-buildout-2026-08-10.md`, 3,278 lines |

Deletions outweigh insertions because two duplications came out: an 84.8 MB orphan asset tree
(187 files, zero references) and a byte-identical 913,467-byte JSON copy.

## Verify it

Run against both roots. All exit 0.

```
python scripts/check_frontend.py            # 10 checks, 22 pages, 93 scripts parsed
python scripts/check_a11y.py                # 11 WCAG A/AA criteria
python scripts/check_contrast.py            # WCAG 1.4.3
python scripts/check_responsive.py
python scripts/check_focus.py               # tabs 18 pages in Chrome
python scripts/check_viewport.py --widths 320,360,390
python scripts/smoke_render.py              # 8 pages, empty console
python scripts/smoke_play.py                # plays a full round
node scripts/smoke_owner_table.mjs          # + arch_map, retrieval_map, name_fix, early_errors
```

Add `--root public` to the python checkers to test the served copy.

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
listed as unverifiable.

**Accessibility.** Skip links 6/22 → 22/22. Focus rings 6/22 → 22/22. Static failures 81 → 0.
Contrast failures 12 → 0. Sorting the teams table from the keyboard no longer strands you at the top
of the page. The players filter announces which one is active. The player search is a real combobox.

**Weight and third parties.** `/owner` −96% and `/teams` −96.4% bytes on paint. Google Fonts removed
from all 18 pages that carried it; Architects Daughter self-hosted (20,184 bytes, SIL OFL alongside),
dropping two third-party origins site-wide. Every page now carries Open Graph, Twitter and canonical
metadata.

## Eight decisions

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

Each was checked against `origin/master`: all eight pre-date this branch. The one collision this
branch created — two pages claiming `/player` — was found, fixed, and withdrawn from this list.

## Not covered

- Nothing is deployed; the branch has never been merged and no preview URL was created.
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

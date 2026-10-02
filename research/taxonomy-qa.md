# Taxonomy of Play Styles — QA report
Branch: `scout/playstyle-taxonomy` (held, unmerged, unpushed). Date: 2026-10-02.

## Method (as built)
- **Player representation:** median 14-d stat-profile vector per `person_id` (2,426 players) from `assets/vectors.json`.
  Features are per-100-possessions, z-scored within season (era-honest). Median chosen over minutes-weighted mean
  because it represents career-typical style and is robust to late-career decline years; the mean let peak seasons
  dominate and lumped all star perimeter players into one blob.
- **Clustering:** Ward agglomerative, pure-numpy (no sklearn on this VM), full dendrogram on 2,426 players (~6 s).
- **k selection:** silhouette peaks at k=5 (0.109) → the 5 families. In the 15–30 archetype band silhouette is flat
  (~0.04, expected: play style is a continuum, not well-separated blobs); merge-distance elbow is smooth.
  k=22 chosen for interpretability + anchor validation, nested in the same dendrogram as the families
  (verified: every archetype sits inside exactly one family → true 3-level tree: root → 5 families → 22 archetypes → players).
- **Naming:** rule-derived from each cluster's stat signature (percentiles vs all 2,426 players), never vibes.

## Anchor verification (20 tested, 19 pass)
Required 5 — all PASS:
| Anchor | Archetype |
|---|---|
| Stephen Curry + Damian Lillard | [7] High-Volume Star Scorers |
| Rudy Gobert + Dikembe Mutombo | [19] Rim Runners & Protectors |
| LeBron James + Luka Dončić | [8] Dominant Two-Way Stars |
| Dennis Rodman + Ben Wallace | [4] Rebound & Defense Specialists |
| Steve Nash + John Stockton | [10] Elite Point Guards |

Additional 14/15 PASS: Jordan+Kobe, Ray Allen+Reggie Miller, Klay+Ray Allen, Dirk+Durant, Jokić+Domantas Sabonis,
Giannis+Amar'e, Wade+T-Mac, Gobert+DeAndre Jordan, Kawhi+Paul George, Westbrook+Derrick Rose,
Draymond+Rondo, Brook Lopez+Horford, Harden+Westbrook, Tony Parker+Billups.

One informative failure: **Dwight Howard + DeAndre Jordan** — Howard lands in [8] Dominant Two-Way Stars
(superstar usage: 95th FTA, 94th PTS), Jordan in [19] Rim Runners & Protectors (low-usage lob threat).
The split is honest: stardom tier divides the rim-runner style.

Investigated and deliberately not forced: Duncan+Garnett (Duncan is a post hub, Garnett a face-up two-way forward —
genuinely different offensive profiles), Chris Paul+Gary Payton Sr. (pass-first vs scoring PG),
Harden+Dončić (guard vs jumbo forward by rebounding), Jokić+Arvydas Sabonis, Marc Gasol+Horford.
These reflect narrative similarity; the data disagrees on statistical grounds. Documented, not hidden.

Known absence: **Magic Johnson** is not in the dataset (career predates the 1996–97 start); Luka Dončić covers the
jumbo-creator anchor. Stated on the page itself.

## QA checklist
- [x] `assets/taxonomy.json` schema valid (families→archetypes→members, 14-feature signatures, 6 top features each)
- [x] All 2,426 member `person_id`s resolve in `assets/vectors.json` (the identity-stamped registry); 0 missing, 0 duplicates
- [x] 19/20 anchors pass (all 5 required); failures documented above, none hidden
- [x] `node --check assets/taxonomy.js` clean
- [x] All 23 asset/URL references in `taxonomy.html` resolve (clean-URL routes + query-stripped files)
- [x] `vercel.json` has `/taxonomy` → `/taxonomy.html` rewrite
- [x] Shared nav (`assets/site-nav.js`) carries the Taxonomy link, mirrored to `public/assets/`
- [x] root↔public byte-identical: `taxonomy.html`, `assets/taxonomy.js`, `assets/taxonomy.json`, `assets/site-nav.js` (via `cmp`)
- [ ] Visual render QA — no browser binary on this VM; needs a live-browser pass (page render, expand/collapse, search, zero console errors) before merge

## Files changed (branch only)
- `assets/taxonomy.json` (new, 290 KB) + `public/assets/taxonomy.json` (mirror)
- `assets/taxonomy.js` (new) + `public/assets/taxonomy.js` (mirror)
- `taxonomy.html` (new) + `public/taxonomy.html` (mirror)
- `assets/site-nav.js` (added Taxonomy link) + `public/assets/site-nav.js` (mirror)
- `vercel.json` (added /taxonomy rewrite)
- `research/taxonomy-qa.md` (this file)

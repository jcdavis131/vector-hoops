# Proper-noun entity layer — findings

**Construct: entity grounding.** The 20 live Insights cards name players, teams
and seasons only as text. This layer promotes every proper noun to a
first-class entity, links each to the cards that cite it, and joins players to
their existing player dossiers — so a reader (or a future feature) can go from
a name on a card straight to that player's dossier and to every other card
that mentions them.

## Coverage

Source: `assets/insights.json` on origin/master (20 cards), scanned across
title, tldr, lede, rows[].label and foot. Players linked against
`assets/dossiers.json` on origin/master (2,415 dossiers).

- **70 players** extracted → **dossier hit rate 100% (70/70)**. Every player
  named in any card has a dossier. No frequently-mentioned player lacks one —
  the money/sacrifice lane's whole cast (Malone, Payton, Beal, Melo, Lillard,
  Bosh, Love) and the one-off rows (Timofey Mozgov, Ian Mahinmi, Gary Forbes)
  all resolve.
- **21 teams** extracted (full franchise names; see normalization).
- **32 season references** extracted, plus 6 multi-year span entities
  ('02-18 style windows → "2002-18" etc.).
- 5 cards name no player at all: time-capsule, dead-styles,
  three-point-takeover, careful-era, contender-chemistry (the last two are
  team/era stories by design).

## Headline findings (all counts card-level: one cite per card max)

- **Giannis Antetokounmpo and Tim Duncan are each cited in 5 of 20 cards** —
  the two faces of the section. Giannis: most-unique, transformed,
  paid-to-not-play, max-money-bargains, contenders-pretenders (uniqueness /
  reinvention / value). Duncan: playoff-swings, the-188-million-win-share,
  same-jersey-smaller-role, hometown-discount, max-money-bargains (swings /
  money / sacrifice).
- LeBron James next at 4; nine players at 3 (Westbrook, Harden, Embiid,
  Durant, Love, Wade, Manu, Klay, Dirk). The sacrifice cluster (Duncan, Wade,
  Manu, Klay, Dirk) is the densest sub-graph in the layer.
- The most-referenced season is **2025-26 (13 cards)**, then 1996-97 (10) —
  the section is anchored on the current season and the dataset window.
- Teams are thin: 21 franchises, max 3 cards (Lakers, Heat). The Insights are
  player-centric, not team-centric — no team clears 4 cards.

## Normalization rules (binding for this layer)

1. Card text and dossier names are normalized identically before matching:
   Unicode NFKD diacritics stripped, possessive 's removed, apostrophes and
   periods removed, hyphens → space, case-folded. So card text "Dončić"
   matches dossier "Luka Doncic", and "Shaquille O'Neal" matches dossier
   "Shaquille ONeal".
2. Entity display names follow the dossier canonical form (`n` field):
   ASCII, no suffixes ("Mike Dunleavy", not "Mike Dunleavy Jr."), no
   apostrophes ("Shaquille ONeal", "Amare Stoudemire").
3. Full names match before aliases (longest-first), so alias "Malone" can
   never steal the "Karl Malone" match.
4. Aliases are applied ONLY where card text actually uses them, each
   hand-verified against the corpus (grep-checked for collisions):
   LeBron→LeBron James, Giannis/Antetokounmpo→Giannis Antetokounmpo,
   Durant, Mitchell, Duncan, Embiid, Harden, Payton, Beal, Lillard,
   Melo→Carmelo Anthony, Malone→Karl Malone, Wade→Dwyane Wade, Manu→Manu
   Ginobili, Klay→Klay Thompson, Iguodala→Andre Iguodala, Gordon→Aaron Gordon,
   Doncic→Luka Doncic, Gilgeous-Alexander→Shai Gilgeous-Alexander,
   Jokic→Nikola Jokic, Mills→Patty Mills, Diaw→Boris Diaw,
   Westbrook→Russell Westbrook, Curry→Stephen Curry, Love→Kevin Love,
   Bosh→Chris Bosh, Ross→Terrence Ross. Tyson Chandler appears in full.
5. Teams normalize to full franchise names: "Portland"→Portland Trail Blazers,
   "New York"→New York Knicks, "the Heat"→Miami Heat, "LA Lakers"→Los Angeles
   Lakers. Foot abbreviations matched case-sensitively on raw text:
   MIN/CLE/TOR/MIA→full names. (Lowercase "min" in "(min 800 min)" is a
   minutes qualifier, NOT Minnesota — caught and excluded during review.)
6. Seasons normalize to YYYY-YY with hyphen: "'18-19"→"2018-19",
   "'99-00"→"1999-00" (two-digit ≥96 → 19xx). Multi-year spans ('02-18)
   kept as span entities, e.g. "2002-18", distinct from season entities.
7. Special mappings (documented, judgment calls): "summer 2016"→"2016-17"
   (the season it produced); "the 2026 Finals"→"2025-26" (the championship
   series closing that season). ISO scrape dates (2026-10-01) are explicitly
   excluded from season matching.

## Unresolved / excluded

- **"Brown"** (contenders-pretenders lede: "Philadelphia (5.14, Brown 41.0 —
  plus LeBron, plus Embiid)"). No first name given; cannot be safely resolved
  to a dossier player (Jaylen Brown is a Celtic in the real world; the card
  gives no disambiguator). Excluded from the index, flagged here.
- **"Green"** (hometown-discount lede: "kept Diaw, Green and Mills for 2014").
  Likely Danny Green, but the card never says so. Excluded, flagged here.
- Award names (MVP, Finals MVP) and tier labels (Lost Finals, Champions) are
  not entities in this layer's player/team/season taxonomy.

## Gaps and follow-ups

- The 5 player-free cards are a feature gap for entity-driven navigation:
  time-capsule and dead-styles could gain entity links when their row data
  (twin pairs, archetype exemplars) is wired in.
- Team entities have no dossier counterpart (dossiers are player-only); a
  team page/dossier layer would complete the graph.
- Season spans (2002-18 etc.) are coarse — a future pass could expand them to
  per-season entities if the UI wants year-level linking.
- The two ambiguous short forms ("Brown", "Green") need a card-text fix at
  the source (full names) before they can be grounded.

## Draft cards

One draft card warranted: `assets/insights-proper-nouns.json`
("most-cited-players" — Giannis and Duncan, 5 cards each). It is the natural
launch card for the noun layer and every count is real extraction output.
A second card was considered (season concentration: 2025-26 in 13/20 cards)
but judged too obvious to ship — not forced.

## Artifacts

- `assets/entity-index.json` — the machine-readable index
- `research/extract_entities.py` — the extraction script (re-runnable)
- `assets/insights-proper-nouns.json` — 1 draft card, live schema
- `research/proper-noun-layer-FINDINGS.md` — this memo

# Greatest Playoff Runs — two-way rebuild

Branch: `scout/two-way-playoff-runs` (held — Cameron's word required before merge/push).
Built 2026-10-02. Replaces the offense-only formula with an all-around two-way score,
per Cameron's verdict: *"the stat should be greatest all around"* — defense and net
rating count, not a toggle.

## The formula

**Individuals** (playoff GP ≥ 10, 113 player-seasons with sourced defensive data):

```
score = PTS100 + 10·(TS − 0.55) + DBPM + 0.25·(team playoff NetRtg)
        + 2 per round won + 4 if champion
```

**Units** (duos/trios — now "two-way cores", not "scoring cores"):

```
score = Σ_members (PTS100 + 10·(TS − 0.55) + DBPM)
        + 0.25·(team playoff NetRtg) + 2 per round won + 4 if champion
```

**Teams**: grouped by (season, ordered opponent path); ranked by official
Basketball-Reference playoff net rating first, then wins. Only teams that won at
least two series (≥ 8 wins) qualify — a run has to go somewhere.

## Calibration math

- **DBPM enters at 1.0 — symmetric with scoring.** A point of DBPM is a point
  prevented per 100 possessions; a point of PTS100 is a point scored per 100.
  They move the score identically: no hidden thumb on the scale. DBPM is
  zero-centered by construction, so no era adjustment is needed.
- **Team net rating enters at 0.25 — deliberately diluted.** Net rating is
  shared across the whole roster; at full weight, team context would swamp the
  individual signal (every 2001 Laker would get +13.7). At quarter weight, a
  +12 demolition is worth about +3 — a real boost, never the whole story.
  Worked check: 0.25 × 13.7 (2001 Lakers) = 3.4; 0.25 × 15.5 (2026 Knicks) = 3.9.
- **Round/title bonuses unchanged** (+2/round, +4 title): winning still matters,
  still never swamps the per-possession signal.
- Worked example — LeBron 2008-09: 47.1 + 10·(0.618−0.55)=0.68 + 4.8 +
  0.25·9.9=2.48 + 4 + 0 = **59.05** ✓ (hand-verified against raw splits).

## What's new vs the old ranking

### Individuals — top 10 movers

| New | Old | Run | One-line reason |
|-----|-----|-----|-----------------|
| 1 | 3 | LeBron James 2008-09, 59.05 | DBPM +4.8, best defensive mark in the pool — the all-around carry job |
| 2 | 1 | Michael Jordan 1997-98, 58.63 | Still elite; modest DBPM (+1.0) costs him #1 |
| 3 | 10 | Nikola Jokić 2022-23, 56.59 | +3.7 DBPM plus the title — two-way peak |
| 4 | 5 | Kevin Durant 2016-17, 56.41 | +13.5 team net rating does heavy lifting |
| 5 | 7 | Shai Gilgeous-Alexander 2024-25, 55.94 | +2.6 DBPM, complete two-way season |
| 6 | 6 | Giannis Antetokounmpo 2020-21, 55.82 | +3.2 DBPM holds his spot |
| 7 | 2 | Michael Jordan 1996-97, 55.47 | Falls: only +1.7 DBPM and a +6.5 team |
| 8 | 4 | Kawhi Leonard 2018-19, 55.29 | +2.4 DBPM, steady |
| 9 | 16 | LeBron James 2019-20, 55.02 | +3.1 DBPM + ring = biggest climber |
| 10 | 17 | Stephen Curry 2016-17, 54.87 | +13.5 demolition share outweighs +1.4 DBPM |

Out: Stephen Curry 2021-22 (8→16), Kobe Bryant 2008-09 (9→12) — great offense,
not enough defense around it.

### Duos / trios

Now two-way cores. New #1 duo: Curry/Durant 2016-17 (95.90). New #1 trio:
Brunson/Towns/Anunoby 2025-26 (121.35) on a verified +9.6 combined DBPM —
Towns' +5.51 and Anunoby's +3.97 both confirmed against BRef's leaders pages.

### Teams

Win% → net rating first. The top 3 are all-time demolitions: 2026 Knicks (+15.5),
2001 Lakers (+13.7), 2017 Warriors (+13.5). Net-rating-first means dominant
non-champions now appear: 2009 Cavs (#6, +9.9), 2010 Magic (#7, +9.9), 2009
Nuggets (#9, +9.3), 2019 Bucks (#12, +8.7). That is the formula working as
designed, not a bug — but it is a philosophical shift from the old all-champions
board, worth stating plainly.

### Sanity anchors

| Run | NetRtg | Rank (of ~480) | Reads as |
|-----|--------|----------------|----------|
| 2001 Lakers | +13.7 | #2 | all-time demolition ✓ |
| 1999 Spurs | +8.5 | #13 | all-time ✓ |
| 2015 Warriors | +8.2 | #16 | all-time ✓ |
| 2004 Pistons | +7.3 | #22 | all-time defensive run ✓ |
| 2008 Celtics | +6.1 | #29 | top-30, grinding 16-10 title ✓ |

No pure-offense early exit ranks absurdly high (the ≥8-win floor keeps 5-4
second-round exits like the 2025 Cavs +12.1 off the board). No famously great
defensive run ranks absurdly low.

## Data

- **Players:** 113 player-seasons with playoff OBPM/DBPM/BPM from
  Basketball-Reference (fetched 2026-10-02), every row BPM = OBPM + DBPM
  cross-checked (max discrepancy 0.10, pure rounding). Stored in
  `data/playoff_defense_bref.json`.
- **Teams:** official BRef playoff ORtg/DRtg/NRtg/W/L for all 30 seasons
  1997–2026 (16 teams each + league-average row). Adopted after discovering my
  per-game estimates were systematically off by ~0.6 (e.g. 2003 Spurs: mine
  +6.9 vs official +6.0).
- **Towns/Anunoby 2026 verification:** the eye-popping values (+5.51 / +3.97
  DBPM) were confirmed against BRef's 2026 playoff leaders pages — real, not
  transcription errors.

## Gaps (explicit, never synthesized)

1. **Shaquille O'Neal 1998** — the only pool player-season without a DBPM figure.
   The BRef playoffs-advanced URL pattern 404s, series-stat outlinks proved
   unstable, and web search surfaced no DBPM value. Documented exclusion from
   the individual board (his other pool seasons are included).
2. **Units with incomplete defensive data — 36 skipped units could reach the top
   10** (upper bounds computed with the verified DBPM < 2.83 ceiling for
   player-seasons absent from BRef's single-season top-250 leaders). Notable
   exclusions: 2002 Shaq/Kobe duo (would rank ~#1–2), 2008-09/2009-10
   Kobe/Pau/Bynum trios, 2008 Celtics trio, 2013 Heat trio, 1999/2003/2014 Spurs
   trios, 2004 Pistons trio, 2009 LeBron/Mo Williams duo. Full list with
   verified score ranges: `research/two-way-unit-threats.json` (build artifact, 36 units).
   **Follow-up:** a live-browser read of ~42 BRef player pages (their Playoffs
   Advanced tables are HTML-comment-wrapped, not text-extractable) would complete
   the units board. This subagent cannot operate a live browser — flagged for
   the parent to delegate.
3. **42 player-seasons** carry verified upper bounds only (DBPM < 2.83, OBPM <
   5.70, BPM < 6.98) — used for the bound analysis, never as scores.

## QA checklist

- [x] JSON schema: same four-bucket shape; all scores numeric; every bucket
      sorted descending (asserted in build).
- [x] Population: 10 individuals / 10 duos / 10 trios / 12 teams (asserted).
- [x] 5 hand spot-checks vs raw splits (LeBron '09, Jordan '98, Jokić '23,
      Curry '17, Kawhi '19) — all match to the penny.
- [x] Individuals bound proof: no unsourced player-season (old score + generous
      DBPM ≤ +6, team ≤ +16 maxima) can reach the top-10 cutoff — 0 violations.
- [x] No duplicate names in any unit; all unit members verified same team-season
      via BRef team abbrev (asserted).
- [x] Team mapping: every (season, path) group resolved to a BRef franchise —
      0 unmapped, 0 ambiguous after one hand-verified override (2013-14
      ATL-WAS-MIA = Indiana Pacers; the sole W-L collision in 30 postseasons).
- [x] `node --check` on assets/playoff-runs.js — clean.
- [x] Root ↔ public mirrors byte-identical (`cmp`): playoff-runs.json,
      playoff-runs.js, playoff-runs.html.
- [x] Method strings in JSON state plainly: two-way (offense + defense + net
      rating), calibration reasoning, Shaq '98 exclusion, units exclusion rule.
- [ ] Visual browser QA of the rendered page — blocked for this subagent (no
      live browser); flagged for parent delegation.

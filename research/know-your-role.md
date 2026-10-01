# Know Your Role — research report

**Date:** 2026-10-01 · **Status:** research only, no card code · **Data:** `assets/playoffs.json`
(RS vs playoff per-100 splits, 1996-97 → 2025-26), `assets/player_team_season.json`.
Read-only; nothing modified.

## Headline finding

**33 times since 1997, a high-usage star changed teams, took a much smaller
piece of the offense — and won much bigger.** The canonical case tops the
list on narrative if not on math: Andre Iguodala went from Philadelphia's lead
wing (25.7 playoff USG, 0 rounds) to Golden State's 6th man (14.9 playoff USG)
and won 2015 Finals MVP. The biggest measured sacrifice: Dwight Howard gave up
**14.0 points of playoff usage** (28.2 → 14.2) going from Houston's hub to the
Lakers' rim-runner — and got a ring with a .677 playoff TS. Aaron Gordon, the
prompting example, verifies: Orlando's playoff go-to guy (22.8 USG, 5-game
2019 cameo) → Denver's fourth option (15.2 USG over 20 games), more efficient
on less (.540 → .588 TS), champion.

## Methodology

**Unit:** ordered season pairs (S_old, S_new) for one player, ≤ 8 years apart,
different teams, both seasons present in `playoffs.json`.

**OLD season — "was the man":**
- RS GP ≥ 50; RS USG ≥ 19.0; and (RS USG ≥ 21.5 **or** PO USG ≥ 21.5)
- PO GP ≥ 4 (was in the playoff rotation)
- team won ≤ 1 playoff round

**NEW season — "knew the role":**
- RS-USG rank ≥ 3 among teammates with RS GP ≥ 50 (a smaller piece of the offense)
- PO GP ≥ 8, PO USG ≥ 14 (still genuinely mattered in May)
- PO TS ≥ 0.52
- team won ≥ 2 more rounds than the old team (or the new season ended in a title)

**Adaptation, not decline:** PO TS_new ≥ PO TS_old − 0.03 (efficiency held or
improved in the smaller role).

**Anti-washed rule:** the new-season gates (PO GP ≥ 8, PO USG ≥ 14, PO TS ≥ 0.52)
jointly exclude victory-lap veterans — a 10-mpg cameo cannot clear 14% playoff
usage over 8+ games. No age data is used; contribution is measured, not assumed.

**Sacrifice** = max(RS USG drop, PO USG drop), ≥ 4.0 required. The PO lens is
deliberate: for several players (Gordon, West, Pau) the regular-season number
barely moved while their *playoff* role transformed — and May is when roles
are real.

**Score** = sacrifice × (rounds_new − rounds_old). Best-scoring pair kept per
player. **Result: 33 qualifying players.**

## Ranked table (top 12 of 33)

| # | Player | Old: season, team, USG | New: season, team, USG (team RS rank) | ΔUSG (lens) | Rounds before → after | PO TS before → after (new PO GP) | Score | Why it matters |
|---|--------|------------------------|----------------------------------------|-------------|----------------------|----------------------------------|-------|----------------|
| 1 | Dwight Howard | 2013-14 HOU, 24.1 RS / 28.2 PO | 2019-20 LAL, 14.6 RS / 14.2 PO (rk 5/8) | −14.0 (PO) | 0 → 4, champs | .581 → .677 (18) | 56.0 | Post hub → rim-runner; anchored the bubble title defense at .677 TS |
| 2 | Mikal Bridges | 2022-23 BKN, 22.3 RS / 29.3 PO | 2025-26 NYK, 17.0 RS / 15.4 PO (rk 5/11) | −13.9 (PO) | 0 → 4, champs | .539 → .643 (19) | 55.6 | Half a season as Brooklyn's #1 → 3&D wing on the '26 Knicks champs |
| 3 | David West | 2008-09 NOH, 25.9 RS / 28.5 PO | 2016-17 GSW, 19.1 RS / 14.8 PO (rk 6/13) | −13.7 (PO) | 0 → 4, champs | .485 → .604 (17) | 54.8 | All-Star hub → 15-mpg enforcer on the 16-1 Warriors |
| 4 | Pau Gasol | 2004-05 MEM, 25.7 RS / 31.2 PO | 2008-09 LAL, 20.3 RS / 18.7 PO (rk 3/10) | −12.5 (PO) | 0 → 4, champs | .498 → .622 (23) | 50.0 | Memphis' everything → triangle second option; back-to-back Finals, two rings |
| 5 | Brook Lopez | 2012-13 BKN, 28.2 RS / 28.1 PO | 2020-21 MIL, 16.6 RS / 16.6 PO (rk 6/9) | −11.6 (RS) | 0 → 4, champs | .548 → .632 (23) | 46.4 | Post-up All-Star → stretch-5 rim protector; started every game of a title run |
| 6 | JR Smith | 2010-11 DEN, 21.6 RS / 32.8 PO | 2014-15 CLE, 18.8 RS / 18.2 PO (rk 4/13) | −14.6 (PO) | 0 → 3, Finals | .492 → .538 (18) | 43.8 | Unplayable-chucker archetype → credible 3&D starter on a Finals team |
| 7 | Andre Iguodala | 2008-09 PHI, 22.1 RS / 25.7 PO | 2014-15 GSW, 13.1 RS / 14.9 PO (rk 9/10) | −10.8 (PO) | 0 → 4, champs | .546 → .546 (21) | 43.2 | The canonical one: Philly's lead wing → sixth man → 2015 Finals MVP |
| 8 | Jrue Holiday | 2021-22 MIL, 23.1 RS / 26.0 PO | 2023-24 BOS, 16.1 RS / 14.6 PO (rk 5/10) | −11.4 (PO) | 1 → 4, champs | .461 → .617 (19) | 34.2 | Milwaukee's second option → Boston's fourth/fifth; title at .617 PO TS |
| 9 | Ray Allen | 2004-05 SEA, 27.0 RS / 28.5 PO | 2012-13 MIA, 18.5 RS / 17.6 PO (rk 4/11) | −10.9 (PO) | 1 → 4, champs | .599 → .598 (23) | 32.7 | Seattle's #1 → Miami's fourth option; hit the biggest shot of the 2013 Finals |
| 10 | Aaron Gordon | 2018-19 ORL, 21.3 RS / 22.8 PO | 2022-23 DEN, 20.6 RS / 15.2 PO (rk 3/9) | −7.6 (PO) | 0 → 4, champs | .540 → .588 (20) | 30.4 | Orlando's playoff go-to guy → Denver's cutter/roller; more efficient on less |
| 11 | Jason Kidd | 2003-04 NJN, 23.5 RS / 18.8 PO | 2010-11 DAL, 14.0 RS / 14.8 PO (rk 8/10) | −9.5 (RS) | 1 → 4, champs | .456 → .560 (21) | 28.5 | Engine of the Nets Finals runs → spot-up guard/defender on the 2011 Mavs |
| 12 | Chris Bosh | 2006-07 TOR, 26.6 RS / 25.2 PO | 2012-13 MIA, 22.5 RS / 18.7 PO (rk 3/11) | −6.5 (PO) | 0 → 4, champs | .487 → .524 (23) | 26.0 | Toronto's franchise player → third star; two rings as the ultimate connector |

Rows are sorted by score (sacrifice × rounds leap); `value` below is the
sacrifice alone, so it is not strictly monotonic down the table — the foot of
the card draft explains the ranking.

## Anchor verification (the 10 named examples)

| Anchor | Verdict | Numbers |
|--------|---------|---------|
| Aaron Gordon ORL → DEN | ✅ verified (PO lens) | PO USG 22.8 → 15.2 (−7.6); RS USG essentially flat 21.3 → 20.6; PO TS .540 → .588; 0 → 4 rounds, 2023 champs |
| Andre Iguodala PHI → GSW | ✅ verified, #7 | PO USG 25.7 → 14.9 (−10.8); 0 → 4 rounds, 2015 champs, Finals MVP |
| Chris Bosh TOR → MIA | ✅ verified, #12 | PO USG 25.2 → 18.7 (−6.5); 0 → 4 rounds, 2013 champs (2012 too) |
| Kevin Love MIN → CLE | ❌ cannot verify in-dataset | Zero MIN seasons in `playoffs.json` — Minnesota missed the playoffs all six Love seasons (2008-09 → 2013-14). The "after" is verified (2015-16 CLE: RS USG 23.3, PO USG 22.1, champion) but the pre-move usage has no in-dataset source |
| Ray Allen → MIA 2013 | ✅ verified, #9 | Best pair by score is SEA '05 → MIA '13 (−10.9); the first-act pair SEA '05 → BOS '08 also qualifies (−10.1, 1 → 4 rounds, champs) |
| Dwyane Wade ceding to LeBron | ✅ verified, **separate lens** | Same-team, so excluded from the ranked table by design. Same-team check: 2008-09 MIA 35.2 RS USG, 0 rounds → 2011-12 MIA 30.5 RS USG, 4 rounds, champs (−4.7). The sacrifice is real and measurable — it just didn't involve changing teams |
| Andrew Wiggins MIN → GSW | ⚠️ partially verified, below threshold | Team leap is in the data (2017-18 MIN 0 rounds → 2021-22 GSW 4 rounds, champs) but usage barely moved: RS 22.8 → 22.4, PO 23.2 → 20.4 (−2.8 < 4.0 gate). His sacrifice was defensive effort and shot selection (PO TS .514 → .544), not volume — honorable mention, not a card row |
| Manu Ginóbili 6th-man acceptance | ❌ correctly absent | Same team throughout; peak RS USG 27.4 (2007-08) → 23.8 (2013-14), drop 3.6 < 4.0. His role acceptance was a constant from the start of his prime, not a measurable transition |
| David West IND → GSW | ✅ verified, #3 | PO USG 28.5 → 14.8 (−13.7); 0 → 4 rounds, 2017 champs (2018 too). Best pair uses 2008-09 NOH, his highest-usage season |
| Klay Thompson as 3rd option | ❌ correctly absent | Same team; peak RS USG 27.2 came **on the 2015 champions** — no team leap was possible. "Third option" was cross-sectional (Curry/Durant ahead), never a transition |

## Card draft (card #12 — for `build_insights.py`, not yet built)

```python
def insight_know_your_role():
    rows = [
        {"label": "Dwight Howard '19-20", "value": -14.0,
         "tag": "28.2 → 14.2 playoff USG · HOU '14 → LAL champs '20"},
        {"label": "Mikal Bridges '25-26", "value": -13.9,
         "tag": "29.3 → 15.4 playoff USG · BKN '23 → NYK champs '26"},
        {"label": "David West '16-17", "value": -13.7,
         "tag": "28.5 → 14.8 playoff USG · NOH '09 → GSW champs '17"},
        {"label": "Pau Gasol '08-09", "value": -12.5,
         "tag": "31.2 → 18.7 playoff USG · MEM '05 → LAL champs '09"},
        {"label": "Brook Lopez '20-21", "value": -11.6,
         "tag": "28.2 → 16.6 USG · BKN '13 → MIL champs '21"},
        {"label": "JR Smith '14-15", "value": -14.6,
         "tag": "32.8 → 18.2 playoff USG · DEN '11 → CLE Finals '15"},
        {"label": "Andre Iguodala '14-15", "value": -10.8,
         "tag": "25.7 → 14.9 playoff USG · PHI '09 → GSW champs '15"},
        {"label": "Jrue Holiday '23-24", "value": -11.4,
         "tag": "26.0 → 14.6 playoff USG · MIL '22 → BOS champs '24"},
        {"label": "Ray Allen '12-13", "value": -10.9,
         "tag": "28.5 → 17.6 playoff USG · SEA '05 → MIA champs '13"},
        {"label": "Aaron Gordon '22-23", "value": -7.6,
         "tag": "22.8 → 15.2 playoff USG · ORL '19 → DEN champs '23"},
    ]
    return {
        "slug": "know-your-role",
        "kicker": "Know your role",
        "title": "The fastest way to win more is to need the ball less",
        "tldr": "33 times since 1997, a high-usage star changed teams, took a "
        "much smaller piece of the offense — and won much bigger. Iguodala "
        "gave up 10.8 points of playoff usage and won Finals MVP as a sixth "
        "man; Gordon went from Orlando's playoff go-to guy to Denver's fourth "
        "option and a championship, more efficient on less.",
        "lede": "Usage sacrificed (regular-season or playoff USG, whichever "
        "shows the role change) against playoff rounds gained, for players who "
        "went from a team's hub (21.5+ USG) to its third option or lower on a "
        "different, much better team. Dwight Howard's −14.0 is the biggest "
        "sacrifice on a title team: Houston's hub to the Lakers' rim-runner at "
        ".677 true shooting. Rows are ranked by sacrifice × rounds gained, so "
        "JR Smith's record −14.6 sits sixth — his leap was three rounds, not "
        "four, and it came in a five-game 2011 cameo.",
        "stat": "-14.0",
        "stat_label": "Dwight Howard's playoff-usage drop, Houston hub to "
        "Lakers rim-runner — the biggest sacrifice on a title team",
        "viz": "bars",
        "viz_label": "Usage given up (USG points) × playoff rounds gained",
        "rows": rows,
        "foot": "33 qualifying transitions, 1996-97 → 2025-26. Old season: "
        "50+ RS games, 21.5+ USG (RS or playoffs), team won ≤ 1 round. New "
        "season: different team, 3rd option or lower, 8+ playoff games at "
        "14+ USG and .520+ TS, efficiency held vs the old role, team won ≥ 2 "
        "more rounds. Pre-move stardom on lottery teams is invisible to this "
        "dataset (it only covers playoff players) — see Kevin Love. Same-team "
        "sacrifices (Wade, Manu, Klay) need a different lens.",
        "og_title": "Know your role",
        "og_desc": "Iguodala gave up 10.8 points of usage and won Finals MVP. "
        "Gordon went from Orlando's go-to guy to Denver's fourth option and "
        "a ring. 33 stars who won bigger by needing the ball less.",
    }
```

Suggested build function name: `insight_know_your_role()`, appended after
`insight_playoff_swings()`; needs a `pipeline/build_know_your_role.py`
serializer if the site wants per-row drill-down (33-row JSON, same pattern as
`build_playoff_swings.py`).

## Data caveats

1. **Lottery-team stardom is invisible.** `playoffs.json` only contains players
   who appeared in the playoffs, so a star's pre-move seasons on bad teams are
   systematically missing (Love's entire MIN tenure, Wiggins' 2019-20,
   Allen's 2006-07 SEA peak, Gordon's 2016-18 ORL). The methodology only fires
   when an earlier playoff-season baseline exists.
2. **Mid-season trades aggregate.** RS stats cover the full season across both
   teams (Bridges' 2022-23 blends PHX + BKN; Deron Williams' 2016-17 blends
   DAL + CLE); `player_team_season.json` maps one team per season.
3. **Old-season playoff samples are small.** First-round exits give 4–6 game
   baselines (Bridges 4, Pau 4, Gordon 5, West 5, JR 5). Directionally right,
   noisy in magnitude — documented per-row above via PO GP.
4. **USG rank uses teammates with RS GP ≥ 50** to dampen bench-chucker noise
   (Crawford, Ross); rank is only a gate (≥ 3rd option), applied conservatively.
5. **`MIN` fields were not used** (known-unreliable); GP thresholds do the
   durability work instead.
6. **Team rounds** = max over mapped teammates; a team-season with no
   `playoffs.json` players = missed playoffs = 0 rounds.

## Could not verify

- **Kevin Love's MIN→CLE usage drop** — no MIN seasons exist in the dataset
  (see anchor table). Would need a pre-2014 usage source.
- **Wiggins' sacrifice as a usage drop** — measured and found below threshold
  (−2.8 PO USG); his real change was defensive role + efficiency.
- **Manu's and Klay's transitions** — no measurable team-change transition
  exists for either; both are correctly absent, not missing.
- **Wade** — verified, but only under the same-team lens; excluded from the
  ranked table by the change-of-teams design decision.
- **Dose-response**: the analysis shows correlation between sacrifice and team
  success, not causation — great players disproportionately join great teams.

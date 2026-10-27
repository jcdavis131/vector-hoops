# PBP Text Corpus — Vector Hoops data-collection deep dive

Scope: READ-ONLY investigation. No bulk fetch, no live-checkout writes, no training.
Sources read end-to-end: one CDN PBP file in full
(`pipeline/cache/cdn_pbp/playbyplay_0022600001.json`, 593 actions) plus all five
cached files measured programmatically, and `pipeline/build_replays.py` (319 lines).
Checkout examined: `~/workspace/vector-hoops-mlops-v2/`
(the `~/workspace/vector-hoops/` checkout named in the brief does not exist on this box;
the `cdn_pbp` cache lives under `vector-hoops-mlops-v2`).

## 0. What the corpus actually is — read this first

There is exactly ONE free-text field in the feed: `description`. Everything else is
structured. So a "PBP text corpus" is not prose: it is ~200 short templates with
player-name / number slots, plus a rich structured record per action. Any text
tower that embeds every raw `description` verbatim is re-embedding the same
~200 sentences millions of times. The correct design (Section 4) embeds templates
once and composes them with structured slots.

Prior text work is NOT this corpus: the earlier Wikipedia work embedded bio intros
for 594 players. That is biography text, not game text, and must not be mixed into
or substituted for PBP text.

Feed identity, quoted from the files:

- Cache file: `pipeline/cache/cdn_pbp/playbyplay_<gameId>.json`
- `meta.request`: `https://api.nba.com/statscapture/games/0022600001/playbyplay?Format=json`
- Replay builder source constant:
  `https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_{gid}.json`
- Top level: `{"meta": {...}, "game": {"gameId": ..., "actions": [...]}}`
- The five cached games: `0022600001`, `0022600002`, `0022600003`, `0022600085`,
  `0022600086` (2026-10-20/21 opening games, per brief; `0022600001` verified
  `timeActual` 2026-10-20, `date` 2026-10-20 in its replay file).
- Replay mirror: `assets/replays/<gameId>.json` + `index.json`, same five game IDs.

## 1. Event taxonomy

### 1.1 Universal fields (present on 100% of the 3,152 actions, unless noted)

`actionNumber`, `clock` (ISO-8601 duration, e.g. `PT12M00.00S`), `timeActual`
(wall-clock ISO timestamp), `period`, `periodType` (always `REGULAR` here),
`actionType`, `possession` (teamId), `orderNumber`, `scoreHome`, `scoreAway`
(strings, e.g. `"0"`, `"113"`), `isFieldGoal` (0/1), `isTargetScoreLastPeriod`,
`edited` (73.6% non-null), `description`. Near-universal: `teamId` /
`teamTricode` (98.6%), `subType` (95.4%), `personId` / `playerName` / `playerNameI`
/ `personIdsFilter` (92.8% each — absent exactly where no player is attached:
period/game markers, team rebounds, team timeouts).

### 1.2 Taxonomy table (measured over all 5 games, 3,152 actions)

| `actionType` | `subType` values (count) | n | Share | Key extra fields | `description` example (verbatim) |
|---|---|---|---|---|---|
| `substitution` | `out` (365), `in` (365) | 730 | 23.2% | `personId`, `playerNameI` | `SUB out: M. Robinson` / `SUB in: N. Queta` |
| `rebound` | `defensive` (372), `offensive` (186) | 558 | 17.7% | `reboundTotal`, `reboundDefensiveTotal`, `reboundOffensiveTotal`, `shotActionNumber` (links rebound to the missed shot) | `J. Walsh REBOUND (Off:0 Def:1)`; team rebounds (114, no `personId`): `TEAM offensive REBOUND` |
| `2pt` | `Layup` (225), `Jump Shot` (223), `DUNK` (60), `Hook` (21) | 529 | 16.8% | `shotDistance`, `shotResult` (`Made`/`Missed`), `descriptor`, `pointsTotal` (made only, 275), `assistPersonId`/`assistPlayerNameInitial`/`assistTotal` (153), `blockPersonId`/`blockPlayerName` (58), `x`, `y`, `xLegacy`, `yLegacy`, `side` | `J. Collins putback Layup (2 PTS)` |
| `3pt` | `Jump Shot` (368) | 368 | 11.7% | `shotDistance`, `shotResult`, `descriptor` (123), `pointsTotal` (126 made), `assist*` (110), `block*` (6), `x`, `y`, `side` | `MISS J. Collins 24' 3PT` |
| `freethrow` | `1 of 1` (38), `1 of 2` (113), `2 of 2` (113), `1 of 3` (9), `2 of 3` (9), `3 of 3` (9) | 291 | 9.2% | `shotResult`, `pointsTotal` (233), `descriptor` (4 only) — NO `x`/`y`, NO `shotDistance` | `J. Tatum Free Throw 1 of 1 (3 PTS)`; `A. Thompson Free Throw 1 of 2 (1 PTS)` |
| `foul` | `personal` (228), `offensive` (24), `technical` (4) | 256 | 8.1% | `officialId`, `foulPersonalTotal`, `foulTechnicalTotal`, `foulDrawnPersonId`/`foulDrawnPlayerName` (253), `descriptor` (159: `shooting`, `off-the-ball`, `flagrant`, …) | `M. Robinson offensive FOUL (1 PF)`; `D. Robinson shooting personal FOUL (1 PF) (Tatum 1 FT)` |
| `turnover` | `bad pass` (45), `lost ball` (36), `out-of-bounds` (30), `offensive foul` (25), `shot clock` (9), `traveling` (6), `palming` (1) | 152 | 4.8% | `turnoverTotal` (143), `stealPersonId`/`stealPlayerName` (80 — the forced-turnover counterpart), `officialId` (71), `descriptor` (30) | `M. Robinson offensive foul TURNOVER (1 TO)`; `D. White bad pass TURNOVER (1 TO)`; `M. Robinson lost ball out-of-bounds TURNOVER (2 TO)` |
| `steal` | (blank) | 80 | 2.5% | `personId` only (pairs with a turnover's `steal*` fields) | `D. Robinson STEAL (1 STL)` |
| `block` | (blank) | 64 | 2.0% | `personId` only (pairs with a shot's `block*` fields) | `M. Robinson BLOCK (1 BLK)` |
| `timeout` | `full` (54), `challenge` (5) | 59 | 1.9% | team-only, no `personId` | `DET Timeout` / `BOS Timeout` |
| `period` | `start` (20), `end` (20) | 40 | 1.3% | none beyond universal | `Period Start` / `Period End` |
| `jumpball` | `recovered` (12) | 12 | 0.4% | `jumpBallWonPersonId`/`jumpBallWonPlayerName`, `jumpBallLostPersonId`/`jumpBallLostPlayerName`, `jumpBallRecoverdPersonId` [sic — source spelling drops the "e"] / `jumpBallRecoveredName`, `descriptor` = `startperiod` | `Jump Ball M. Robinson vs. J. Duren: Tip to J. Tatum` |
| `game` | `end` (5) | 5 | 0.2% | none beyond universal | `Game End` |
| `violation` | `delay-of-game`, `defensive goaltending`, `lane`, `kicked ball` (1 each) | 4 | 0.1% | `officialId` (3) | `TEAM delay-of-game VIOLATION`; `A. Drummond defensive goaltending VIOLATION`; `W. Carter Jr. lane VIOLATION` |
| `heave` | `jumpshot` (4) | 4 | 0.1% | `shotDistance` (4) but `isFieldGoal` = 0 and `x`/`y` = null — end-of-period heaves are NOT field goals in this feed | `PHI Heave` |

### 1.3 Corrections to naive readings of the feed

- There is NO `actionType` value `fieldgoal`. Field goals are `actionType` in
  {`2pt`, `3pt`} AND `isFieldGoal` = 1. That flag is the only reliable FG test:
  529 + 368 = 897, exactly the `isFieldGoal` = 1 count, and exactly the count of
  actions with non-null `x`/`y`.
- Coordinates exist ONLY for field goals: `x`/`y` present on 897/3,152 actions
  (28.5%), all of them FGs. `x` range 2.79–97.96, `y` range 0–99.18 (percent of
  court; `build_replays.py` converts to feet: `x/100*94`, `y/100*50`, and
  self-checks `shotDistance` against distance to the nearer rim).
  `shotDistance` is present on 901 actions = 897 FGs + 4 heaves; range 0–78.66 ft.
  `shotResult`: `Made` 634, `Missed` 554 (includes 291 free throws; FG-only split:
  401 made / 496 missed).
- `descriptor` (41 distinct values) is the shot/move modifier vocabulary, not free
  text: `pullup` (131), `driving` (91), `running` (83), `driving floating` (51),
  `step back` (43), `cutting` (39), `putback` (24), `alley-oop` (20), `tip` (19),
  `turnaround` (15), `fadeaway` (14), plus foul/turnover descriptors (`shooting`,
  `bad pass`, `lost ball`, `loose ball`, `charge`, `flagrant`, …).
- `qualifiers` (non-empty on 36.3%) is a second structured vocabulary:
  `pointsinthepaint` (258 alone), `2ndchance`, `fastbreak`, `fromturnover`,
  `inpenalty`, `2freethrow`/`1freethrow`, `team`, `mandatory`, `deadball`,
  `startperiod`, in combination (e.g. `["2ndchance","pointsinthepaint"]` 68×).
- `side` (`left`/`right`) exists only on FG actions (897).
- Distinct (`actionType`, `subType`) pairs: 38. Distinct
  (`actionType`, `subType`, `descriptor`) triples: 92. The structured event space
  is small; the text variation rides almost entirely on names and numbers.

### 1.4 How `build_replays.py` consumes the feed (read, not modified)

- Sorts actions by (`period`, −clock, `orderNumber`); derives home/away sides
  from which score moves; reconstructs starters (first action not a
  `substitution in`) and the on-court lineup purely from substitution actions,
  with a repair rule if the feed shows a player playing while off the lineup.
- Emits one compact event per action with fields
  `[period, clock, type, sub, team, person, x, y, away, home, made, desc, poss, rightSide]`
  where `desc` is the VERBATIM `description` — so replay files are a second,
  compact (105.2 bytes/action, §3) carrier of the same text, not a deduplicated one.
- Explicit staged-data disclaimer in the file: shooter, shot spot, event, clock
  and score are from the feed; the other nine players' positions are NOT in any
  public feed and are staged/projected. PBP text therefore carries NO off-ball
  location information — do not claim otherwise in any downstream spec.

## 2. Template measurement (measured, method stated)

### Method

- **Method A (verbatim):** distinct raw `description` strings.
- **Method B (masked template):** replace every name string observed in the
  files' own name fields (`playerNameI`, `playerName`, `jumpBallRecoveredName`,
  `jumpBallWonPlayerName`, `jumpBallLostPlayerName`, `foulDrawnPlayerName` —
  205 distinct name strings, longest-first substitution) with `{P}`, then
  replace every number (including distances like `24'`, counts like `(1 PF)`,
  `(2 PTS)`, `(Off:0 Def:1)`) with `{N}`. Team tricodes in descriptions
  (`DET Timeout`, `NYK shot clock Team TURNOVER`) are NOT masked by this pass
  and survive as distinct templates — a known, conservative bias (true template
  count is slightly lower).
- One file (`0022600001`, 593 actions) was read end-to-end to confirm the
  schema; all counts below are computed over all five files.

### Results

| Measure | Value |
|---|---|
| Total actions | 3,152 |
| Distinct verbatim descriptions (Method A) | 2,376 (75.4% distinct — misleading: mostly name/number swaps) |
| Distinct masked templates (Method B) | **203 (6.4% of actions)** |
| Templates occurring ≥ 10× | 46 templates covering 2,701 actions (**85.7%**) |
| Singleton templates (1×) | 67 (mostly rare shot-descriptor combinations, e.g. `MISS {P} driving bank Hook`, `{P} turnaround bank Hook ({N} PTS)`) |
| Per-game masked templates | 93, 110, 106, 101, 98 (mean ≈ 102/game) |
| Marginal new templates per added game, in file order | 93 → +44 → +30 → +21 → +15 (cumulative 93 → 137 → 167 → 188 → 203) |
| Mean description length | 30.9 chars (min 8, max 77); total description text 97,374 chars |

Top templates (masked, count): `{P} REBOUND (Off:{N} Def:{N})` 444;
`SUB out: {P}` 365; `SUB in: {P}` 365; `{P} Free Throw {N} of {N} ({N} PTS)` 233;
`MISS {P} {N}' {N}PT` 126; `{P} shooting personal FOUL ({N} PF) ({P} {N} FT)` 119;
`{P} STEAL ({N} STL)` 80; `TEAM offensive REBOUND` 75;
`{P} {N}' {N}PT ({N} PTS) ({P} {N} AST)` 71; `{P} BLOCK ({N} BLK)` 64.

### Honest extrapolation (ESTIMATE, not fact)

The marginal-template curve is decaying fast (93 → 15 new per game over five
games) and the structured space is only 92 (type, subType, descriptor) triples,
so the template vocabulary over a full season is plausibly in the **low
thousands, not tens of thousands** — ESTIMATE: roughly 500–3,000 masked
templates for a full season, with the long tail dominated by rare
descriptor × shot-type combinations and team-tricode variants that the masking
above does not collapse. This is an extrapolation from five opening games of
one season: new seasons add new players (names — masked away), new descriptor
combinations, and rule/wording changes, but they do not add a new grammar.
The falsifiable version of this claim: re-run Method B on a 50-game sample
spanning multiple seasons; if distinct templates exceed ~3,000, the estimate
is wrong and the dedup budget must be revised. Do NOT quote "203 templates"
as a 30-season fact.

## 3. Volume estimate across 30 seasons (ESTIMATES with method)

### Method and the failed in-repo verification

- Measured per-game rates come from the five cached games only (all 4-period,
  no overtime — so the range below is a lower-bound sample; OT and playoff games
  will exceed it).
- The brief's `~1,230 games/season × 30 ≈ 36,900` figure could NOT be verified
  against in-repo schedule data: no schedule file was found in
  `vector-hoops-mlops-v2` (the cache holds per-season player-stat files
  `base_YYYY-YY.json`, `playoff_games_YYYY-YY.json`, tracking files — no
  regular-season schedule/game list). The 36,900 figure is therefore carried as
  the brief's stated assumption, and a shortened-season correction is shown
  alongside it. Do not cite 36,900 as repo-verified.
- Measured rates: actions/game 593–667, mean 630.4; FG actions/game 174–188,
  mean 179.4; free throws/game 45–75; substitutions/game 126–184;
  distinct players with an attributed action/game 19–27 (mean attributed
  actions per player-game 22.9–30.7 across the five games).
- Measured storage rates: raw CDN JSON 2,217,615 bytes / 3,152 actions =
  **703.6 bytes/action**; compact replay JSON 331,533 bytes / 3,152 =
  **105.2 bytes/action** (verbatim `desc` still included).

### Estimates (regular season only; playoffs excluded)

| Quantity | At 36,900 games (brief assumption) | At ~35,834 games (shortened-season corrected) |
|---|---|---|
| Total actions (× 630.4/game) | **~23.26 million** | **~22.59 million** |
| Total FG actions (× 179.4/game) | **~6.62 million** | **~6.43 million** |
| Raw CDN JSON (× 703.6 B/action) | **~16.4 GB** | **~15.9 GB** |
| Compact replay-rate JSON (× 105.2 B/action) | ~2.45 GB | ~2.38 GB |
| Per season (1,230 games) | ~775,000 actions; ~546 MB raw | — |

Shortened-season correction (ESTIMATE): 30 seasons 1996-97 → 2025-26 contain
26 full 82-game seasons (26 × 1,230 = 31,980) and four shortened seasons —
1998-99 (29 teams × 50 games / 2 = 725), 2011-12 (30 × 66 / 2 = 990),
2019-20 (≈1,059 games, uneven schedules — approximate), 2020-21
(30 × 72 / 2 = 1,080) — totalling ≈ 35,834, i.e. ~1,066 fewer games than 36,900
(~3% lower). If playoffs were added (~80–90 games/season × 630 actions ≈
+50,000 actions/season, ESTIMATE), the 30-season action total rises ~7%.

### The 30-season availability caveat (BLOCKED until checked)

All five cached files are 2026-10-20/21; NO historical CDN PBP file exists in
the cache to confirm that the `cdn.nba.com/static/json/liveData/playbyplay/`
format (including `x`/`y` coordinates and this exact `description` wording)
extends back 30 seasons unchanged. The volume math above assumes format parity
across all 30 seasons. If older seasons come from a different endpoint/format
(e.g. the stats API PBP without coordinates, or Basketball-Reference text),
the template vocabulary, the coordinate fields, and the per-action byte rate
all change, and pre-format-change seasons need a separate schema audit before
any "30 seasons of PBP text" claim is made. This is the single largest
uncertainty in this lane — larger than the ±3% game-count correction.

## 4. Deduplication strategy

### What varies per instance vs what is fixed

| Fixed (template) | Varies per instance (structured slot) |
|---|---|
| Action wording: `MISS … 3PT`, `… REBOUND (Off:… Def:…)`, `… Free Throw … of …`, `SUB in/out:`, `… STEAL (… STL)` | Shooter / actor: `personId`, `playerNameI` (and secondary actors: `assistPersonId`, `foulDrawnPersonId`, `stealPersonId`, `blockPersonId`, jump-ball trio) |
| Shot-type + modifier: `subType` (`Layup`, `Jump Shot`, `DUNK`, `Hook`) + `descriptor` (`pullup`, `driving`, `putback`, `alley-oop`, …) | Clock: `clock` + `period`; score state: `scoreHome`/`scoreAway`; margin and clutch flag derived from these |
| Qualifier pattern family (`pointsinthepaint`, `fastbreak`, `2ndchance`, `fromturnover`) | Coordinates + distance: `x`, `y`, `side`, `shotDistance` (FG only) |
| Counting-suffix shape (`(N PF)`, `(N TO)`, `(N AST)`) | Running totals: `pointsTotal`, `foulPersonalTotal`, `turnoverTotal`, `rebound*Total`, `assistTotal` — cumulative within game, reset per game (and must reset per season for features, §6) |
| Team-only wordings (`TEAM offensive REBOUND`, `Period Start`) | Team: `teamId`/`teamTricode`; possession: `possession`; lineup state derived from substitution sequence |

### Template extraction method (deterministic, no model needed for step 1)

1. Parse each action's `description`; replace spans matching the action's own
   name fields (`playerNameI`, plus secondary name fields present on that
   action) with `{P}` and all digit runs with `{N}`. This is exactly Method B
   above and is reproducible from the structured fields alone — no NLP.
2. Key the template by (masked description, `actionType`, `subType`) to avoid
   collisions where the same wording spans types; the residual vocabulary is
   the 92 (type, subType, descriptor) triples plus wording variants, i.e. the
   low-thousands estimate of §2.
3. Residual pass (only if the 50-game multi-season check in §2 breaks the
   estimate): collapse team tricodes in team-only descriptions
   (`DET Timeout` → `{TEAM} Timeout`) and normalize the `- blocked` suffix and
   `MISS` prefix as slots, not templates.

### Composed representation (the text tower input)

Per action, store: `template_id` (2 bytes) + structured slots — NOT a
per-action text embedding:

```
action_repr = TemplateEmb[template_id]            # 768-d (Stage 1) → 128-d Matryoshka
              ⊕ StructuredEmb(actionType, subType, descriptor, qualifiers)
              ⊕ Numeric(x, y, shotDistance, clock_seconds, score_margin, period)
              ⊕ ActorSlot(personId → season-scoped player key; secondary actors likewise)
```

Pooling per player-season (per the program): aggregate the action
representations attributed to that player in that season (mean-pool with an
on/off ablation: text tower in vs out, everything else held fixed). Substitutions
are kept as structured lineup signal (§5), not as text: 23.2% of all actions
are `SUB in/out` templates carrying zero lexical information beyond the name
slot, so embedding them as text wastes a quarter of the tower's capacity.

### Expected compression (measured + estimated, kept distinct)

- **Measured on 5 games:** 3,152 per-action embeddings → 203 template embeddings
  = **15.5× reduction** in the embedding table. At 768-d float32: 9.69 MB
  per-action vs 0.62 MB templated (203 × 768 × 4 B); at 128-d: 1.61 MB vs 0.10 MB.
- **Estimated at 30-season scale:** if the vocabulary lands at 500–3,000
  templates (§2 estimate), the template table is 1.5–9.2 MB at 768-d
  (0.26–1.54 MB at 128-d) against ~71 GB for per-action 768-d embeddings of
  23.26M actions — a table-size reduction of roughly four orders of magnitude.
  Per-instance storage is NOT eliminated: each action still needs its
  `template_id` + structured slots (tens of bytes/action, vs 703.6 B raw JSON
  and 105.2 B replay-compact). Quote the 15.5× as measured; quote the
  30-season figure only as the estimate it is.
- Stage plan (from the program, not re-derived here): Stage 1
  EmbeddingGemma-300M, Matryoshka 768→128 (measured here in the program:
  128-d retains ~99% of 768-d twin agreement); SVD only as baseline;
  Stage 2 task-aligned projection; text as ONE tower pooled per player-season.

## 5. Narrative signal for future-stat prediction

Box stats already contain the totals. PBP text + its structured slots can only
earn their tower by carrying *how* and *when* those totals were produced, and
*with whom* — information that aggregates erase. Each row names the encoding
fields and a falsifiable check; a signal that fails its check is dropped, not
kept as "color."

| Signal (what box stats do not carry) | PBP field(s) that encode it | Falsifiable check (next-season prediction) |
|---|---|---|
| **Shot diet / shot creation mix** — pullup vs catch-and-shoot vs driving vs putback vs alley-oop share; paint vs perimeter; fastbreak vs half-court; second-chance share | `descriptor` + `subType` + `shotDistance` + `x`/`y` + `qualifiers` (`pointsinthepaint`, `fastbreak`, `2ndchance`, `fromturnover`) on `2pt`/`3pt` actions | Add per-player-season descriptor/qualifier shares to the forecast model; pre-registered win = paired-bootstrap improvement on next-season PTS/TS%/usage over the box-stat-only baseline, with the on/off tower ablation. Fails if shares add nothing once box-score shot mix is included. |
| **Role change within a season** — starter → bench, bench → closer, position/usage drift before the box-score season line moves | `substitution` in/out sequence + `clock`/`period` (reconstruct lineups exactly as `build_replays.py` does: starters = first action not a sub-in; lineup changes on subs) + first/last-stint timing per game | Split-season role features (starter-share, 4th-quarter stint share, games as first-sub) predict next-season MIN/usage change better than full-season averages alone. Fails if role features are collinear with minutes and add no out-of-sample R². |
| **Clutch usage and efficiency** — who takes shots when the game is close and late, and whether they make them | `period` = 4 (or OT) + `clock` (e.g. < 5:00) + derived margin from `scoreHome`/`scoreAway` + `shotResult` + `possession` on FG/FT actions | Clutch FG attempts share and clutch eFG in season S predict next-season usage/PTS in close games (or do not — the "clutch gene" null). Fails if clutch splits are no more predictive than overall splits at equal sample size. |
| **Lineup context** — production with starters vs bench units; who a player shares the floor with (spacing, creation load) | Substitution-derived lineups (`build_replays.py` `lineups` arrays) + `personIdsFilter` + `assistPersonId` on made FGs (who created the shot) | Lineup-adjusted features (share of minutes with a high-usage creator, assisted-share of made FGs) predict next-season AST%/usage/TS% beyond raw box stats. Fails if assist-share is fully explained by position. |
| **Foul-trouble patterns** — early fouls → bench → suppressed minutes, repeated across games; also drawn-foul rate | `foul` actions + `foulPersonalTotal` + `clock`/`period` of each foul + the substitution that follows it; `foulDrawnPersonId` for fouls drawn | Early-foul rate (fouls before halftime) and fouls-per-minute in season S predict next-season MIN and PF rate, controlling for position. Fails if foul trouble does not persist player-to-player across seasons. |
| **Creation vs finishing** — assisted vs self-created makes; putbacks and second-chance points (hustle/role signal, not just scoring) | `assistPersonId`/`assistTotal` (263/897 FGs assisted in sample), `descriptor` = `putback`/`tip`, `qualifiers` `2ndchance`, `shotActionNumber` linking rebounds to the next shot | Self-created-make share and putback rate predict next-season usage/AST% and offensive-rebound rate respectively. Fails if they collapse to position + minutes. |
| **Turnover *kind*, not just count** — bad-pass (creation risk) vs lost-ball vs shot-clock vs offensive foul (discipline) | `turnover` `subType` + `descriptor` + `stealPersonId` (forced vs unforced) | Turnover-type shares predict next-season TOV% and AST/TO better than total TOV% alone. Fails if type shares are noise at player-season sample sizes (test with split-half reliability first). |
| **Defensive event context** — blocks/steals as events with a victim and a shot attached, not just totals | `block`/`steal` actions + the paired shot's `blockPersonId` / turnover's `stealPersonId` | Block/steal rates against high-usage opponents (from paired actions) predict next-season BLK%/STL% beyond totals. Weakest prior of the table — include only if split-half reliability clears a threshold. |

Deliberately EXCLUDED from the text tower: verbatim team/timeout/period/game
markers (`Period Start`, `Game End`, `DET Timeout` — no player, no signal),
and substitution text itself (structured lineup signal only, §4). Any signal
whose check needs next-season box stats must use those stats ONLY as targets,
never as inputs (§6).

## 6. Leakage rules

Season boundary is the hard wall. For a model predicting season S+1 from season S:

1. **Season-bounded inputs (no exceptions):** every PBP-derived feature —
   template embeddings, pooled text-tower vectors, descriptor/qualifier shares,
   clutch splits, lineup features, foul-trouble features, turnover-type shares —
   must be computed from season-S actions ONLY. No action, description, running
   total, or aggregate from season S+1 (or later) may enter the input, the
   pooling, or feature selection.
2. **Template vocabulary and projection fitting are season-bounded too:**
   fit the masked-template vocabulary (§4) and any Stage-2 task-aligned
   projection on training seasons only (≤ S). Because masked templates contain
   no names, vocabulary leakage is small — but a projection fitted on S+1
   would still leak S+1 outcomes through the weights, so the rule stands even
   though the templates look generic. Re-fit or freeze-and-report: if a frozen
   template table from earlier seasons is reused, record its fit-season range
   in the artifact metadata.
3. **Running totals reset:** `pointsTotal`, `foulPersonalTotal`,
   `turnoverTotal`, `rebound*Total`, `assistTotal` are cumulative within a game
   in the feed; any season-level accumulation must reset at the season boundary
   and must never carry a prior season's closing total forward as a feature
   unless that prior-season total is itself an explicit, labelled season-S input.
4. **Targets are not inputs:** next-season box stats (PTS, usage, TS%, MIN,
   etc.) are targets only. Do not use them to select templates, weight actions,
   or filter player-seasons in training inputs.
5. **Within-season tasks need a cutoff too:** for any in-season prediction
   (e.g. rest-of-season), mask all actions after the cutoff timestamp
   (`timeActual` / game date), not just the target game's actions.
6. **Identity handling:** `personId` may be used to GROUP actions into a
   player-season pool (that is what pooling means), but `personId` and names
   must NOT enter the text embedding itself. The text tower sees templates +
   structured slots; identity enters only as the pooling key.

### Name-masked ablation (how it works on templated text)

1. Take the season-S action set for a player-season. Produce two versions:
   (a) **unmasked** — template + structured slots as in §4, with the actor
   slot carrying the player key; (b) **masked** — replace every name-bearing
   slot with a generic token: the actor becomes `[PLAYER]`, secondary actors
   (`assistPersonId`, `foulDrawnPersonId`, `stealPersonId`, `blockPersonId`,
   jump-ball trio) become `[OTHER]`, and team tricodes in team-only
   descriptions become `[TEAM]`. `actionType`, `subType`, `descriptor`,
   `qualifiers`, `clock`, `period`, scores, `x`/`y`, `shotDistance`,
   `shotResult` are IDENTICAL in both versions — only identity tokens change.
2. Train the same forecast model on (a) and (b) with everything else fixed
   (same seasons, same targets, same pooling). Compare next-season forecast
   error by paired bootstrap.
3. **Reading the result:** masked ≈ unmasked ⇒ the signal is structural
   (shot diet, role, clutch, lineup patterns) and the tower generalizes to
   unseen players — the desired outcome. Unmasked ≫ masked ⇒ the tower is
   memorizing player identity through name-adjacent slots, and the masked
   version is the honest model to ship; investigate which slot leaks identity
   (usually a secondary-actor or team-tricode field that survived masking).
4. Because the text is templated, masking is cheap and exact: it is a
   field substitution, not an NLP redaction problem. The one place masking
   must be audited by hand is the `description` string itself — verify no
   masked output still contains a surname (e.g. via a surname appearing in a
   non-name field such as a jump-ball description) before the ablation is
   trusted.

## Open items for the synthesis (not resolved by this lane)

- 30-season format parity (§3 caveat): confirm the CDN liveData schema and
  `description` wording for pre-2020s seasons, or scope the text corpus to the
  format-parity window and say so.
- 50-game multi-season Method-B re-run to confirm or revise the 500–3,000
  template-vocabulary estimate (§2).
- No in-repo schedule file was found; the 36,900-game figure needs an external
  schedule source or a schedule-file build before it is quoted as verified.

VERDICT: PASS — taxonomy measured on all 5 games — ~/workspace/mlops-v2-drafts/data-deep-dive/pbp-text-corpus.md
VERDICT: PASS — template diversity measured (203 masked templates / 3,152 actions, method stated) — ~/workspace/mlops-v2-drafts/data-deep-dive/pbp-text-corpus.md
VERDICT: PASS — volume estimate with method and shortened-season correction — ~/workspace/mlops-v2-drafts/data-deep-dive/pbp-text-corpus.md
VERDICT: PASS — dedup design (template-once + structured slots, 15.5x measured) — ~/workspace/mlops-v2-drafts/data-deep-dive/pbp-text-corpus.md
VERDICT: BLOCKED — 30-season format parity unverified (no historical CDN file in cache; no in-repo schedule file found) — ~/workspace/mlops-v2-drafts/data-deep-dive/pbp-text-corpus.md

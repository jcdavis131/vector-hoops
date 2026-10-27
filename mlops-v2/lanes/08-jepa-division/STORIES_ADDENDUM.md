# Lane 8 Addendum — Story Surfaces (Stories as Readout)

**Status:** DESIGN INPUT ONLY. No training, no GPU, no package installs,
no repo writes, no prod writes, no merge, no commits. Nothing in this
addendum is built, trained, evaluated, or ratified.

**Status of stories as first-class integration targets — READ FIRST:
USER VISION UNDER REVIEW, NOT RATIFIED ARCHITECTURE.** The user named
stories past AND present as a first-class integration target on
2026-10-26 (panel brief §9), alongside Atlas, Daily Court, Twin
Explainer, Twenty Questions, and Pixel Replay/Live. That note is a
vision for Lane 8 drafting. It does NOT rewrite the board, contract
headlines, eval protocol, or prototype briefs. The governance hold
(contract §11) stands in full. Stories as an integration target are
before the 12-seat review panel under its expanded charge (panel
brief §9: which models to build, how to integrate them, and the spec
outline — including story surfaces). Until the panel synthesis lands
and the user rules on it, this addendum is drafting input to that
review, not a ruling, and it must never be quoted as decided
architecture or as a finalized spec. Spec finalization waits for
panel synthesis.

**What this file is:** a NEW addendum to Lane 8's delivered design. It
does NOT edit `DIVISION_OF_LABOR.md`, `JEPA_DESIGN.md`,
`INTEGRATION_ADDENDUM.md`, or `HJEPA_VISION_ADDENDUM.md`. Those four
files stand unchanged. It does not edit any other lane's files. Where
this addendum and the delivered Lane 8 files appear to differ, the
difference is a design sketch for panel review, not a correction. The
delivered files remain the authority until the panel rules and the
user decides otherwise.

**Authority:** Contract §0 (shared facts), §7 (division of labor),
§10 (user correction, Scope A data gathering, Scope B text design),
§11 (governance hold), §12 (user vision note); panel brief §9 (living
basketball mind vision; stories past AND present); H-JEPA vision
addendum (two surfaces, one hierarchy, one render direction). This
addendum adds NO new model, NO new training objective, and NO new
target. It defines how the two existing prediction surfaces are READ
as stories.

**One-sentence definition:** a story is a human-readable readout of
what the world model already predicts or what real data already
records — a career told from season data, a possession explained
through an era bridge, a classic game retold from its real events,
or an unfolding game/season narrated from the model's live read —
rendered as text plus a visual (Atlas, court, or sprites acting the
story out), and never as invented events.

## 0. The grounding rule — unmissable, binding on every surface below

**EVERY STORY STAYS GROUNDED IN REAL DATA. NO SYNTHETIC EVENTS. NO
INVENTED POSSESSIONS. NO HALLUCINATED STAT LINES.**

This rule binds every surface in §§1–2, past and present alike, and
it survives any panel ruling, because it is a data-integrity rule,
not an architecture claim — the same standing as the sprite ban in
the H-JEPA addendum §4.

Concretely, the rule means:

1. **Every story element names its source.** A stat line comes from
   a named season row in `assets/vectors.json` (12,966 rows, keyed by
   `person_id`, never by name alone — distinct players share names).
   An event comes from a named play-by-play record. A location comes
   from a real measured coordinate (PBP `x`/`y`, shot coordinates
   when collected, tracking aggregates as season context only).
   A forecast comes from a named model output (coarse or fine
   predictor), labeled as predicted. An element with no source is
   not written, not drawn, and not smoothed over.
2. **Gaps are marked, never filled.** Any story element requiring
   data not yet on this VM is marked **DATA-GATED** with its
   unblocker (§5 register), and the story either omits that element
   or says plainly that it is unknown. A gap is never bridged with a
   plausible possession, a typical stat line, a generic play, or a
   generated commentary event presented as real. Official PBP event
   text only; generated commentary is never a substitute source.
3. **Predicted and real are labeled on the surface itself.** A story
   that starts in real events and continues into a prediction marks
   the boundary where reality ends and prediction begins. A ghost,
   a predicted play, or a predicted location that is not labeled as
   predicted is not a feature; it is a fabrication (H-JEPA
   addendum §4, labeling rule).
4. **Sprites act stories out; sprite positions never train the
   model.** This is the same hard line as contract §7 and the
   H-JEPA addendum §4, applied to stories. Sprites are presentation:
   figures drawn on a court graphic to act out a real recorded event
   or a labeled model prediction. Sprite coordinates are drawing
   choices, not measurements. They are never training inputs, never
   stored as a data source, and never fed back into any model —
   including a future story component. Likewise, story narration
   text itself is display only: it is never training input and
   never a data source for another story.
5. **A story is not evidence.** A story surface never proves a model
   works. Model quality is judged only by the evals that already
   exist or are specified elsewhere (Lane 8 §5 for the fine surface;
   the coarse surface's forecast eval, panel-pending per §1.3 of the
   H-JEPA addendum). A compelling story built on a failing model is
   still a failing model with good presentation.

## 1. PAST stories — reading what already happened

Past stories read from real recorded data, with model outputs used
only to explain or connect — never to invent. Three surfaces.

### 1.1 Career-arc narration — "where this player has been"

**What it is:** the story of one player's career, told from that
player's real season-by-season record: rise, peak, change of role,
decline, reinvention — in plain words, with the numbers that support
each beat.

**Inputs (real assets only):**
- The player's season rows in `assets/vectors.json` (14-d game
  vector per season: PTS, AST, OREB, DREB, STL, BLK, TOV, FG3A, FGA,
  FTA, FG3_PCT, FG_PCT, FT_PCT, PLUS_MINUS, z-scored within season),
  keyed by `person_id` across all of that person's seasons.
- The player's 64-d champion embeddings in `assets/mtnn_embeddings.f32`
  (same `person_id`, season by season), for the style trajectory:
  how the player's similarity neighborhood moved over time.
- Season context from the pipeline cache where the narration needs
  it (team, honors, playoffs), under the same provenance discipline
  as Lane 7's inventory — named source per claim, never assumed.

**Output form:**
- Text: a short arc narrative, one beat per career phase, each beat
  tied to named seasons and named stats (for example: scoring volume
  up, efficiency down, role shift visible in assist and rebound
  shares). No beat without a supporting season row.
- Visual: the Atlas. The player's season points trace a path through
  the map, season by season, so the arc is visible as movement, not
  just described. The Atlas xyz is PCA(3) of the 14 stats (contract
  §0) — the visual is the stat space, labeled as such, never
  presented as the 64-d embedding space.

**Product surface it attaches to:** alongside the Atlas (the arc
trace lives on the map) and alongside Twin Explainer (each phase's
"who played like this then" is a twin lookup on that season's row,
with the whole `person_id` excluded — a player is never presented
as their own twin, and same-name distinct players stay distinct).

**Data status:** NOT data-gated at season level. The season rows and
embeddings exist today. This surface is still DESIGN ONLY: it is not
built, and its narration form awaits spec finalization after panel
synthesis. Data existing is not the same as a surface existing.

### 1.2 Era-bridge explanation — "why a 2009 possession feels like one today"

**What it is:** the explanation for why basketball from one era
feels like basketball from another — told at two levels, which must
not be conflated.

**Level A — season-level era bridge (data exists today).**
Why a player-season from 2009 plays like a player-season from today:
the twin relationship across eras, explained in plain words from
real stats and embeddings. Example shape (not a claimed pair): a
2009 season and a modern season sit near each other because their
14-d stat profiles and their 64-d style profiles agree on named
dimensions (scoring volume, playmaking share, shot mix), while
differing on named dimensions that mark the era gap. The space of
every number is stated: 14-d stat-space similarity and 64-d
embedding-space similarity are different numbers and are never
presented as one (contract §5 space distinction: the Curry 2016-17
→ Ginobili 2009-10 pair is rank 1 in 14-d stat space at cosine
0.9623, but cosine 0.4003 and rank 390th in 64-d space, where the top
twin is Harden 2017-18 at 0.86 — any era-bridge story using that pair
must show both spaces and explain the divergence).

**Inputs (Level A):** `assets/vectors.json` 14-d rows and
`assets/mtnn_embeddings.f32` 64-d rows for both seasons, keyed by
`person_id`; the twin lookup itself (existing twin space, v5
champion, preserved exactly).

**Output form (Level A):** text — the plain-words "why they're
twins" explanation, with the agreeing and disagreeing stat groups
named; visual — the Atlas, showing both seasons' positions and the
distance between them in stat space, plus the twin list for each.

**Product surface it attaches to:** alongside Twin Explainer (the
explanation is the Twin Explainer's job, extended across eras) and
Daily Court (an era-bridge twin reveal gains its "why this feels
familiar" paragraph).

**Level B — possession-level era bridge (DATA-GATED).**
Why a specific 2009 POSSESSION feels like a specific possession
today: same play shape, same floor spots, same decision — shown on
the court, acted out by sprites. This is the version of the surface
the user's example points at, and it is the version that does NOT
yet have data.

**Inputs (Level B, when they exist):** historical play-by-play
records for both eras, with event `x`/`y` coordinates and event
text, for the two possessions being compared; shot coordinates where
the possessions end in shots.

**Output form (Level B):** text — the possession comparison, event
by event, naming what matches and what differs; visual — the court,
with both possessions drawn from their real event coordinates, and
sprites acting each possession out in sequence. Sprite positions
here depict REAL recorded events, not predictions — and still never
train anything (§0 rule 4).

**Product surface it attaches to:** alongside Pixel Replay/Live
(the court + sprites are the replay surface's job) and Twin
Explainer (the explanation text travels with the replay).

**Data status:** Level A is design-ready on existing season data.
Level B is **DATA-GATED** — historical PBP at scale does not exist
on this VM (only the 5 opening 2026-27 games in `cdn_pbp/`; see §5).
Until historical PBP lands, no possession-level era-bridge story for
2009 — or any past season — may be written, drawn, or implied. A
season-level bridge must never be dressed up as a possession story.

### 1.3 Classic-game story — "what actually happened on the floor"

**What it is:** a story generated for a classic game from what
actually happened on the floor: the real sequence of events, the
real turning points, the real box score — narrated in order, with
nothing added.

**Inputs (real assets only):**
- The game's play-by-play record: statistical events AND event text,
  in order, with `x`/`y` coordinates where the source carries them.
- The game's box score (real final and quarter lines, from the same
  game record — never a reconstructed or estimated line).
- The participating players' season context (14-d rows, 64-d
  embeddings) only where the narration needs a "who this player was
  that season" beat, keyed by `person_id`.

**Output form:**
- Text: the game told as a story — opening, runs, turning points,
  closing — where every beat cites a real event or a real quarter
  line. A turning point is a named event (a run of real scoring
  events, a real shift in the score), not a narrative invention.
  Events the record does not contain are not narrated.
- Visual: the court, with key events drawn at their real coordinates
  (shots at their real spots, in sequence), and sprites acting the
  key sequence out from the recorded events. The sprite re-enactment
  is labeled as a re-enactment of recorded events, not as footage
  and not as prediction.

**Product surface it attaches to:** alongside Pixel Replay/Live
(the court + sprite re-enactment is the replay surface's job) and
Daily Court (a classic-game story is the Daily Court format pointed
at the past: one game a day, told from its real record).

**Data status:** **DATA-GATED for classic (historical) games.**
No historical PBP cache exists on this VM beyond the 5 opening
2026-27 games (games 0022600001–3, 0022600085–6, ~593 actions each,
with `x`/`y` and description text). Those 5 games prove the format
— event order, coordinates, text — and nothing more. They are not
classic games, and a story format proven on them is not a classic
game story. Historical classic-game stories wait for the Scope A
collection (per-season PBP, game logs) plus its inventory + gap
report, routed through a machine with clean source access (Hatch
stalls on ShotChartDetail and 403s on CDN per the 2026-10-11
verdict). Until then, the surface is designed, not available.

## 2. PRESENT stories — the model's live read, told as a story

Present stories are the forward-facing half of the vision: the
model's read of a game or a season still unfolding, told as a story
rather than delivered as a bare number. A forecast of "24.1 points"
is a number. A present story is: "he is trending toward a
career-high scoring season, and the reason is the shot mix shift
visible since December" — where every clause traces to a forecast
output or a real observed line, and the forecast clauses are labeled
as predicted.

### 2.1 Live game story — "what happens next, tonight"

**What it is:** narration of an unfolding game from the fine
surface's live read: what the model expects next (next event, next
scoring run, next matchup to hunt), told as the game goes, with the
story updating as real events land and predictions are replaced by
outcomes.

**Inputs:**
- The unfolding game's real state, event by event (score, clock,
  lineup, possession, recent events — Lane 8 `JEPA_DESIGN.md` §1.1
  game state), from a live or near-live game feed.
- The fine predictor's next-state predictions (Lane 8 Mode G:
  game-state latent plus action triple → predicted next game state,
  decoded into event type, shot zone, expected points, and — when
  location data exists — locations).
- The coarse context conditioning the fine predictor (season
  trajectory and style context of the players on the floor, per the
  H-JEPA addendum §3.1).

**Output form:**
- Text: the live read in story sentences — what is happening, what
  the model expects next, and why (the conditioning context in plain
  words). Each predicted sentence is labeled predicted; each
  observed sentence cites the real event that just happened. When a
  prediction is wrong, the story says so and moves on — wrong
  predictions are never edited out of the record retroactively.
- Visual: the court, with sprites acting the predicted next sequence
  out — labeled PREDICTED on the surface itself — beside or over
  the real court state. Predicted sprite positions are rendering of
  a prediction, never data (§0 rule 4).

**Product surface it attaches to:** alongside Pixel Replay/Live
(the live court + sprites are the Live surface's job) and Daily
Court (the live read is the Daily Court format pointed at tonight's
game rather than at a twin reveal).

**Data status:** **DATA-GATED twice over.** First, the fine
predictor is not trained (train gate CLOSED, contract §0; fine
training additionally gated on historical PBP, shot coordinates,
game logs, and a frozen game-state dataset — H-JEPA addendum §2.4).
Second, the live game-state feed itself is an open question for the
spec (§4, question 6): this addendum names no feed and assumes none.
A live game story without a trained fine predictor and a real live
feed is vision, not a surface.

### 2.2 Live season story — "where this season is headed"

**What it is:** narration of an unfolding season from the coarse
surface's live read: where a player's season is headed, how the
in-progress line compares with the predicted trajectory, and what
would have to change for the story to change — updated as games
accumulate.

**Inputs:**
- The player's in-progress season line, aggregated from real games
  played so far (per-game statistics aggregated upward, per the
  H-JEPA addendum §3.2 — one-directional in time, no future games
  leaking into a past state).
- The coarse predictor's predicted season trajectory (Lane 9 Mode S
  latent prediction, with the 14-d readout — the H-JEPA addendum
  §1.3 target, whose readout form is itself an open question).
- The gap between predicted and observed trajectory, which is the
  story's engine: outperforming the prediction shifts the predicted
  remainder one way, underperforming shifts it the other.

**Output form:**
- Text: the season story — the predicted line, the observed line so
  far, the gap in plain words, and the conditional ("if the current
  form holds, the season ends near X; the forecast moves if Y
  changes"). The predicted remainder is labeled predicted; the
  observed portion cites real aggregated lines. No future game is
  narrated as though it happened.
- Visual: the Atlas, with the player's in-progress season point
  moving toward (or away from) the predicted season point, plus the
  twin neighborhood at each end — who the player plays like now,
  and who the model expects them to play like by season's end
  (twin quality as floor constraint / secondary validation, per the
  panel-pending prediction-first framing — §4 fallback covers the
  alternative ruling).

**Product surface it attaches to:** alongside the Atlas (the moving
season point is the map's job) and Twenty Questions (the season
story is the guessing game's forward half: "who is this player
becoming?" rather than "who is this player?"). It also attaches to
Daily Court where a daily twin reveal gains its "where this player
is headed" paragraph.

**Data status:** NOT data-gated on inputs at season level (season
rows, aggregation path, and Mode S design exist), but gated on the
model: the coarse predictor is not trained, the train gate is
CLOSED, and the prediction-first headline (per-stat MAE/R² on the
14-d forecast) is panel-pending under the §11 hold. The surface is
therefore designed, not available, and its headline eval follows
whichever ruling the panel and user reach (§4).

## 3. Relation to the hierarchy — stories are a READOUT, not a third model

Stories read from BOTH hierarchy surfaces. They add NO third model,
NO third training objective, and NO story term to any loss. The
hierarchy (H-JEPA addendum §3) already predicts everything a story
needs to say; a story is how a prediction is told, not an additional
thing predicted.

| Story surface | Reads from coarse (season) | Reads from fine (game) | Reads from neither — it reads real data directly |
|---|---|---|---|
| Career-arc narration (§1.1) | Season trajectory across years (style movement) | — | Season rows, 14-d lines (the arc itself is real data, not a prediction) |
| Era-bridge, season level (§1.2A) | — (twin space consulted, not the coarse predictor) | — | 14-d rows + 64-d embeddings, both eras |
| Era-bridge, possession level (§1.2B) | Season/style context of the players involved | Event-location prediction only where the story compares a predicted possession with a real one; otherwise real PBP only | Historical PBP `x`/`y` + event text (the possessions themselves are real data) |
| Classic-game story (§1.3) | Season context beats only | — (re-enactment, not prediction) | PBP record + box score (the game itself is real data) |
| Live game story (§2.1) | Coarse context conditioning the fine predictor | Fine next-state predictions (the story's forward clauses) | Unfolding real game state (the story's observed clauses) |
| Live season story (§2.2) | Coarse predicted trajectory + predicted-vs-observed gap | Aggregated fine outcomes feeding the in-progress line (H-JEPA §3.2 upward link) | Aggregated real per-game lines so far |

**How the two levels compose in a single story:** the coarse level
supplies the arc (where a career or season is headed, who a player
is becoming); the fine level supplies the moments (what happens on
the next possession, where the next shot comes from). A full
"living basketball mind" story uses both: the season arc explains
why the possession matters, and the possession shows the arc
happening. Neither level is retrained for storytelling, and neither
level's eval changes because a story reads from it.

**What a story readout needs that the two surfaces do not already
provide — stated as OPEN QUESTIONS, not invented components:**

1. **Moment selection.** Which possessions, games, or seasons become
   story beats, and which are left out? The predictors output states
   and forecasts; they do not choose what is worth narrating. The
   selection rule is UNDECIDED — it is a spec question, not a
   component this addendum designs.
2. **Plain-words decoding.** How does a latent forecast become stat
   lines and sentences without adding numbers the forecast does not
   contain? The coarse readout form itself (latent-only vs direct
   14-d output) is already open in the H-JEPA addendum §1.3; the
   story-text decoding inherits that open question and adds one of
   its own (sentence form). UNDECIDED.
3. **Mixed real/predicted boundary marking.** A story that starts in
   real events and continues into prediction needs a marking rule
   for the boundary that survives both text and visuals (court,
   sprites, Atlas). The labeling principle is fixed (§0 rule 3);
   the marking FORM is UNDECIDED.
4. **Update cadence for present stories.** Does a live game story
   update after every event, every possession, every quarter — and
   does a live season story update after every game or on a rolling
   window? This mirrors the hierarchy's open update-cadence question
   (H-JEPA addendum §3.4 item 2) and is UNDECIDED here.
5. **Story faithfulness checking.** How is a finished story checked
   against its sources — every stat traced to a row, every event
   traced to a record, every forecast clause traced to a model
   output, no element untraced? The CHECK (a verification pass) is
   named here as a requirement; its checklist and its pass rule are
   UNDECIDED and belong to the spec, not to this addendum.
6. **Live game-state feed.** What real feed supplies the unfolding
   game state for §2.1, with what latency and what provenance? No
   feed is named or assumed in this addendum. UNDECIDED.
7. **Text-tower relationship.** Does story narration use the Scope B
   text tower (PBP event-text embeddings, contract §10) — for
   example, to select or phrase beats? The text tower is a separate
   design with its own panel review and its own forecast-lift
   gating. It is NOT adopted into stories by this addendum.
   UNDECIDED, pending that design's fate.

No other readout component is proposed. In particular, this addendum
proposes NO story model, NO story embedding, NO story loss term, NO
story training set, and NO story metric. If the panel wants a story
quality metric, the spec defines it after the panel rules; this
addendum does not invent one.

## 4. Panel note — what the panel is asked to judge, and what happens under each ruling

**Stories come from panel brief §9 (user vision, 2026-10-26):**
stories past AND present are a first-class integration target, the
model that predicts the future can also read the past, sprites act
stories out from the model's memory, and every story stays grounded
in real data. This addendum is the design input that makes that
vision concrete enough to judge: six surfaces (§§1–2), a grounding
rule (§0), a hierarchy-readout account (§3), and a data-gated
register (§5).

**The panel's expanded charge covers story surfaces** (panel brief
§9c: integration architecture — how the models connect to each
other and to the product surfaces, including story surfaces). The
panel is therefore asked to judge, for stories specifically:

- Whether stories belong in the integration architecture as a
  first-class surface, or as annotations on the existing five
  surfaces (the attachment map in §§1–2 is drawn the second way —
  stories attach alongside existing surfaces — so the panel can
  adopt, move, or cut attachments without redesigning the models).
- Whether the readout account (§3) is sufficient — stories as
  readout with no third model — or whether any story need the panel
  identifies requires a component this addendum deliberately left
  as an open question (§3, questions 1–7).
- Whether the grounding rule (§0) and the DATA-GATED register (§5)
  draw the honesty line in the right place, or whether any surface
  below should be cut, narrowed, or held until more data lands.

**Spec finalization waits for panel synthesis.** This addendum is
DESIGN INPUT, not a finalized spec. No story surface may proceed to
a build spec, a training proposal, or a production decision on the
authority of this file. The sequence is: panel synthesis → user
ruling → spec (by the build team, against the ruling) → execution
up to, but NOT through, the training gate, merges, and production
writes, which still require the user's separate word.

**Fallback if the panel rules otherwise — clean, no deletion needed:**

- If the panel declines H-JEPA centrality: the readout account
  survives unchanged, with "coarse" and "fine" read as Lane 9 Mode S
  and Lane 8 Mode G as separate predictors rather than as hierarchy
  levels. Career-arc and era-bridge stories (which mostly read real
  data) are unaffected. Live stories read the separate predictors
  instead of a hierarchy. The grounding rule and the sprite ban
  survive either ruling.
- If the panel declines the prediction-first reframe: past stories
  are unaffected (they read real data). Present stories keep their
  form but their headline eval reverts with the program's: the
  coarse surface's headline becomes the §8 joint metric (future
  twins) and the 14-d forecast stays a diagnostic, so a live season
  story's forward clauses are judged as diagnostics, not as the
  program's headline — the story text itself does not change, only
  what it is allowed to claim.
- If the panel cuts or defers story surfaces: the cut is clean,
  because stories are a readout with no model depending on them.
  Cutting stories removes presentation, not training, eval, or
  serving. No other lane's file needs to change.

## 5. DATA-GATED register — every gated story element, with its unblocker

**DATA-GATED** means: the element cannot be written or drawn until
the item lands, and no proxy, synthesis, or animation substitute may
fill the gap (§0 rule 2). "Exists" means the file is on this VM; it
does not mean the file is sufficient.

| Gated element | Status on this VM today | Unblocker | Stories it gates |
|---|---|---|---|
| Historical PBP at scale (events + text + `x`/`y`, per season) | 5 games only (`cdn_pbp/`: 0022600001–3, 0022600085–6, 2026-27 opening games, ~593 actions each) | Scope A per-season PBP collection via Alienware/Mac or alternate real sources + inventory + per-season gap report | Possession era-bridge (§1.2B), classic-game stories (§1.3) |
| Shot coordinates at scale | 0 LOC_X/LOC_Y hits anywhere under `pipeline/cache/`; one-date snapshots only (`pipeline/shotcharts/snapshots/`, 2026-10-20: BBRef 545 records / 3 games / 62 players; ESPN 546 / 3 games / 62 players, QA PASS) | True shot-position collection (ShotChartDetail or verified game-log / PBP shot locations) as the §6c shot-position tower, with honest era masks | Shot-location beats in classic-game and possession stories; fine-predictor location clauses in live game stories |
| Game logs, all seasons | No `gamelogs_*.jsonl` for any season (fetcher scripts only: `pipeline/fetch_gamelogs.py`, `pipeline/fetch_playoff_gamelogs.py`) | Per-season game-log fetch on a machine with clean stats access, under versioned-cache + fail-loud validation | In-progress season aggregation for live season stories at game granularity; later-season shot coordinates |
| Continuous 10-player trajectories | No source identified on this VM; PBP `x`/`y` gives event locations, tracking aggregates (2013-14+, 13 files; hustle 2015-16+, 11 files) give season totals, neither gives trajectories | A real trajectory source, named and verified — until then, vision-only (H-JEPA addendum §2.4 item 5) | Any story claiming where EVERY player stood at every moment. No story in §§1–2 makes that claim; event-location stories are the honest ceiling |
| Frozen game-state dataset (states, actions, next states) | Does not exist; raw sources are not a training set | Built from items above, versioned, hashed, index-aligned, fail-loud validation (contract §6b discipline) | Fine-predictor training, hence all predicted clauses in live game stories |
| Trained coarse predictor (Mode S) | Design exists (Lane 9 §2.1, H-JEPA addendum §1); train gate CLOSED | Panel synthesis + user ruling + separate training authorization + Phase 1 baselines measured | Forward clauses in live season stories (§2.2) |
| Trained fine predictor (Mode G) | Design exists (Lane 8 §3.2, H-JEPA addendum §2); train gate CLOSED + data-gated above | Data items above + panel synthesis + user ruling + separate training authorization + Lane 8 §5 eval on held-out games | Forward clauses in live game stories (§2.1) |
| Live game-state feed | No feed named or assumed in this addendum | Spec names a real feed with latency + provenance (§3 question 6) | Live game stories (§2.1) as a running surface, as opposed to a replay of a finished game |

**NOT gated (season-level story inputs exist today):** 12,966 season
rows in `assets/vectors.json`, 64-d champion embeddings in
`assets/mtnn_embeddings.f32`, season-level tracking aggregates as
context, and the twin space itself. Career-arc narration (§1.1) and
season-level era bridges (§1.2A) rest on these. They are still
DESIGN ONLY until spec finalization and production decisions that
are not this file's to make.

## 6. What this addendum does NOT do (boundary restatement)

- No training runs, no GPU, no package installs, no repo writes, no
  prod writes, no merge, no commits.
- No edits to Lane 8's delivered files, the H-JEPA addendum, or any
  other lane's files. This file is the single new deliverable.
- No rewrite of the board, contract headlines, eval protocol, or
  prototype briefs. Those rewrites await panel synthesis + user
  ruling under contract §11.
- No new model, target, loss term, training set, or metric. Stories
  are a readout (§3); the open questions in §3 are questions for the
  spec, not components asserted here.
- No capability claimed as built, trained, evaluated, or ratified.
  Every "attaches to" statement in §§1–2 names a host surface for a
  designed story, not a shipped feature. Every "enables" in this
  file is conditional on a gate in §5 that has not been passed.
- No story element in this file is itself a story: the example
  shapes in §§1–2 are forms ("a beat tied to a named season"), not
  claims about any real player, game, or possession. No real
  player's arc, no real game's turning points, and no real
  possession comparison is asserted here.

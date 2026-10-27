# Lane 8 Addendum — Hierarchical JEPA Vision (H-JEPA)

**Status:** DESIGN ONLY. No training, no GPU, no package installs, no
prod writes, no merge. Nothing in this addendum is built, trained,
evaluated, or ratified.

**Status of H-JEPA centrality — READ FIRST: USER VISION UNDER REVIEW,
NOT RATIFIED ARCHITECTURE.** The user named hierarchical JEPA world
models as "the main thing" on 2026-10-26 22:35 CDT (contract §12).
That note is a vision for Lane 8 drafting. It does NOT rewrite the
board, contract headlines, eval protocol, or prototype briefs. The
governance hold (contract §11) stands in full. The note has been sent
to the 12-seat review panel as a brief addendum, and THE PANEL JUDGES
H-JEPA CENTRALITY. Until the panel synthesis lands and the user rules
on it, H-JEPA centrality is a user vision under review. This addendum
is drafting input to that review, not a ruling, and it must never be
quoted as decided architecture.

**What this file is:** a NEW addendum to Lane 8's delivered design. It
does NOT edit `DIVISION_OF_LABOR.md`, `JEPA_DESIGN.md`, or
`INTEGRATION_ADDENDUM.md`. Those three files stand unchanged. It does
not edit any other lane's files. Where this addendum and the delivered
Lane 8 files appear to differ, the difference is a vision sketch for
panel review, not a correction. The delivered files remain the
authority until the panel rules and the user decides otherwise.

**Authority:** Contract §0 (shared facts), §7 (division of labor),
§8 (Phase 2 unified-loss design), §11 (governance hold), §12 (user
vision note). Companion reading: Lane 8 `JEPA_DESIGN.md` (the dynamics
model, including its §4 H-JEPA design note), Lane 9
`UNIFIED_LOSS_DESIGN.md` §2 (the Mode S / Mode G timescale decision),
Lane 7 `INVENTORY.md` and `SHOT_POSITION.md` (what data exists).

## 0. The vision in one paragraph

One hierarchical world model predicts at two timescales. At the coarse
level, it predicts what a player's next season looks like. At the fine
level, it predicts where players are on the floor during a play. The
coarse level gives the fine level its season context. The fine level's
outcomes, aggregated over games, move the coarse trajectory. Predicted
locations render through Pixel sprites. Sprites never train the model.
That is the whole vision. The rest of this addendum states what each
part means, what data each part needs, what is missing, and what stays
vision until data lands.

## 1. COARSE surface — future season stats (season timescale)

### 1.1 Definition

The coarse surface predicts a player's next-season stat line: what
that player's overall statistics look like one season ahead. The
timescale is the season. The input unit is one player-season row. The
output is a prediction about the next player-season row for the same
`person_id`. This is season-timescale prediction, not game-timescale
prediction. It answers "where is this player headed," not "what
happens on the next possession."

### 1.2 Inputs

- The player-season feature vector for season t: the 17 tower
  families of contract §0, at the width the pipeline pins (verified
  base today: 73 columns, Lane 7; the 120 / 130 / 143 dispute is the
  open re-pin decision, not a fact this addendum resolves).
- Career context, as proposed in Lane 9 §2.1: the mean of that
  player's earlier-season embeddings in the training portion only.
  This conditioning is PROPOSED and must be ablated, not assumed.
  It must never use val or test rows.
- Season identity as context where the design requires it, under the
  same fold discipline as Lane 3: adjacent-season pairs must not
  cross a fold boundary, and the frozen 2025-26 test season is never
  trained on or tuned on.
- No play-by-play input. No game-state input. The coarse surface does
  not read within-game sequences. That is the fine surface's job.

### 1.3 Target — stated from existing definitions, no new target invented

This addendum invents NO new target. It carries two existing target
formulations and states their relationship exactly:

1. **Latent target (Lane 9 Mode S).** The coarse surface IS Lane 9's
   Mode S predictor at the top of the hierarchy. Mode S is an
   unconditioned (or career-context-conditioned) next-season
   predictor with NO action conditioning: career movement across
   seasons is not a coaching decision, so there is no play-call /
   lineup / matchup triple at this timescale. Its target is head
   (a)'s contrastive embedding of the TRUE next season, z_{t+1},
   for the same `person_id`, with stop-grad. Its output is the
   predicted embedding ẑ_{t+1} (64-d, L2-normalized). Only rows with
   a true adjacent-season successor in the training portion are
   training examples. Rows whose next season is in val/test, or
   whose next season does not exist (final season, retired, left
   the league), contribute no Mode S loss.
2. **Stat-space readout (the 14-d game vector).** The 14-d game vector
   is the contract's existing stat surface: 14 raw per-100 stats,
   z-scored within season, in `assets/vectors.json` (12,966 rows).
   It is NOT a projection of the embedding, and it is NOT a second
   competing target. It is the human-readable form of the same next
   season: the stat line a fan reads, decoded or read out from the
   predicted season state. The relationship is therefore: Mode S
   predicts the next season in latent space; the 14-d vector is how
   that prediction is expressed and scored in stat space.

**Open question, named and not papered over:** whether the coarse
head outputs ONLY the latent prediction (with the 14-d line produced
by a separate readout or decoder, used for eval and display only) or
ALSO directly predicts the 14-d vector as a second output, is
UNDECIDED in this addendum. The two options have different eval
consequences, and the panel must rule or the user must decide before
any training design adopts one. What this addendum does NOT do is
pretend the latent target and the 14-d target are the same object.
They are two views of one next season, linked by a readout whose
form is still open.

**Governance label on the 14-d headline:** contract §10 records the
user's 2026-10-26 22:32 CDT correction — next-season overall stat
prediction (the 14-d forecast, scored by MAE/R² under expanding-window
CV plus the new-player slice) as the PRIMARY objective, with twins
demoted to product surface and secondary validation. That correction
is INPUT TO THE PANEL under the §11 hold, not a headline rewrite.
This addendum therefore states the 14-d forecast as the
user-directed, panel-pending headline for the coarse surface, and it
keeps the delivered contract headlines (future twins as the joint
metric, §8) fully specified alongside it, so this addendum survives
either ruling. If the panel ratifies prediction-first, the coarse
surface's headline eval is per-stat MAE/R² on the 14-d forecast. If
the panel does not ratify it, the coarse surface's headline eval
remains the §8 joint metric (future twins) and the 14-d readout stays
a diagnostic. Neither outcome changes the target definitions above.

### 1.4 What the coarse surface enables first

The coarse surface is the only part of the vision whose data exists
today: 12,966 player-season rows, adjacent-season pairs from Lane 3's
pair builder, and a delivered Mode S design (Lane 9 §2.1). It is
therefore the first surface that could move from design to a training
proposal — but only after (a) the panel rules, (b) the user authorizes
training (the train gate is CLOSED, contract §0), and (c) the Phase 1
separate baselines exist and are measured (§8 entry condition). Until
then, the coarse surface is a design sketch with real data behind it,
not a result.

## 2. FINE surface — in-game player locations (game timescale)

### 2.1 Definition

The fine surface predicts where players are on the floor during a
play, at game timescale. The input unit is a game state (Lane 8
`JEPA_DESIGN.md` §1.1: score, clock, lineup, possession, recent
events, season context). The action is the Lane 8 triple (play call,
lineup, matchup). The output is a predicted next game state, decoded
into renderable terms that include player locations on the floor.
This is Lane 8's Mode G predictor (`JEPA_DESIGN.md` §3.2; Lane 9
§2.2). It answers "what happens next, and where," not "what does next
season look like."

### 2.2 Inputs — restricted to REAL data only

Fine-surface training inputs are real measured positions only. The
allowed input classes are: real tracking data, real shot coordinates,
and real play-by-play events with coordinates. Nothing else qualifies.
In particular, sprite positions, replay files, and animation weights
never qualify (see §4, which bans them explicitly).

### 2.3 What exists on this VM today — named exactly

Measured from Lane 7 `INVENTORY.md` (2026-10-26, checkout `1e5bfecc`)
and contract §10's coordinator-verified starting point. Lane 10
(data gathering) has delivered no inventory file yet, so this section
rests on those two sources, not on a Lane 10 report. "Exists" means
the file is on this VM. It does not mean the file is sufficient for
fine-surface training.

| Asset on this VM today | What it actually is | Fine-surface use / limit |
|---|---|---|
| `pipeline/cache/` tracking aggregates: `tracking_*` (leaguedashptstats), 13 files, 2013-14 through 2025-26 | Season-level tracking AGGREGATES (e.g. speed, distance, touches, aggregated per player-season) | Context only. Aggregates describe a season. They do NOT give within-game player trajectories, and they do NOT give where a player stood on a given play. Pre-2013 is structurally absent (masked, never backfilled). A fine model cannot learn locations from season aggregates |
| `pipeline/cache/` hustle / defense tracking (`wide_skills_*`), 11 files, 2015-16 through 2025-26 | Season-level hustle and defense aggregates | Same limit as above: context only, not locations |
| `pipeline/cache/cdn_pbp/` — 5 play-by-play files, games 0022600001, 0022600002, 0022600003, 0022600085, 0022600086, all 2026-27 opening games, ~593–667 actions per game, 174–188 field-goal actions per game, all carrying `x`/`y` fields | The ONLY per-event location data in the stats cache: shot and event coordinates in PBP `x`/`y` naming, with event description text | Proof of format for a PBP location input. 5 games, one week, one season. NOT a training corpus. PBP `x`/`y` gives event locations (above all shot locations), not continuous 10-player trajectories |
| `pipeline/shotcharts/snapshots/` (2026-10-20): BBRef 545 records / 3 games / 62 players; ESPN plays 546 records / 3 games / 62 players, both QA PASS | One date of canonical per-shot records (feet, hoop at origin) | Format contract and prototype corpus for the shot tower. Worthless as historical coverage until backfilled |
| `assets/vectors.json` (12,966 rows, 14-d) and `assets/mtnn_embeddings.f32` (64-d) | Season-level style profiles | Lineup style context for the state encoder only (Lane 8 §3.3: the similarity space may be CONSULTED, never confused with the game state). Not locations |
| `assets/replays/` — 5 game files (the same 5 game IDs as `cdn_pbp/`) + `index.json`; `assets/replay-model.json` | Pixel Replay playback data and replay animation weights | Presentation and animation ONLY. NEVER training inputs. See §4 |

### 2.4 What is missing — every item DATA-GATED, with its unblocker

**DATA-GATED** means: the fine surface cannot train until the item
lands, and no proxy, synthesis, or animation substitute may fill the
gap. Each item names what collection would unblock it.

1. **Historical play-by-play at scale — DATA-GATED.** Beyond the 5
   opening games, no historical PBP cache exists on this VM.
   Unblocker: a per-season PBP collection (statistical events AND
   event text, with `x`/`y` where the source carries them), routed
   through a machine with clean source access (see item 4), followed
   by the data-gathering lane's inventory + per-season gap report
   (contract §10 Scope A first deliverable) so coverage by season
   and era is measured, not assumed.
2. **Shot coordinates at scale — DATA-GATED.** No ShotChartDetail
   response, no per-season shot file, and no LOC_X/LOC_Y column
   exists anywhere under `pipeline/cache/` (0 hits, contract §10).
   The 2026-10-20 snapshots cover one date only. Unblocker: true
   shot-position collection (ShotChartDetail zones, distances, and
   x/y coordinates, or game-log / PBP shot locations where verified),
   as the new shot-position tower of contract §6c, with era
   availability and per-feature masks defined honestly from the
   source. Coordinate coverage by era is a research question, not an
   assumption.
3. **Game logs for all seasons — DATA-GATED.** No `gamelogs_*.jsonl`
   exists for any season (only fetcher scripts:
   `pipeline/fetch_gamelogs.py` and `pipeline/fetch_playoff_gamelogs.py`).
   Later-season game logs are prioritized in Scope A because they
   carry actual shot coordinates, which the shot-position tower
   depends on. Unblocker: a per-season game-log fetch, on a machine
   with clean stats access, under versioned-cache + fail-loud
   validation discipline (contract §6b).
4. **A clean collection route — DATA-GATED (machine constraint).**
   This Hatch VM is a known-bad collector for stats.nba.com
   ShotChartDetail (stalls, zero bytes) and cdn.nba.com (instant
   403), per the 2026-10-11 shot-source verdict. Collection must
   route stats-API and CDN fetches through the Alienware box or the
   user's Mac, or through alternate real sources. Whether that
   Alienware/Mac path has since been exercised is UNVERIFIED in this
   lane's reading. Until it is exercised and measured, the fine
   surface has no collection path, only a collection plan.
5. **Continuous 10-player trajectories — DATA-GATED, and the source
   itself is an open question.** Nothing on this VM gives frame-level
   positions for all 10 players on the floor, and no on-VM asset
   names such a source. PBP `x`/`y` gives event locations, not
   trajectories. Tracking aggregates give season totals, not
   positions. The vision's phrase "player locations" therefore has
   two honest readings, and this addendum keeps them apart: (a)
   EVENT locations (where shots and events happened — collectable
   in principle from PBP and shot data, items 1–2 above); (b)
   CONTINUOUS trajectories (where every player is at every moment
   — no identified source on this VM, no collection plan yet, and
   therefore vision-only until a real source is named and verified).
   Any fine-surface claim that implies (b) from (a) data is false
   and must not be made.
6. **A built, validated, frozen game-state dataset — DATA-GATED.**
   Raw sources are not a training set. States, actions, and next
   states must be constructed with versioned, hashed, index-aligned
   artifacts and fail-loud validation (never silent imputation),
   following contract §6b pipeline discipline. This item follows
   items 1–3; it cannot precede them.

### 2.5 What the fine surface is NOT yet

The fine surface is not trainable today. The 5 PBP games prove the
coordinate format. They do not prove the model, the action
vocabulary, or the rollout. The action vocabulary must be derived
from what play-by-play actually distinguishes (Lane 8 §2.1, §6 item
5): if the source cannot distinguish two play calls, the action
space cannot contain that distinction. Any fine-surface demo built
on the 5 games alone is a format prototype, not evidence that the
fine surface works.

## 3. HIERARCHY — how coarse and fine relate (design, with open questions named)

Lane 8 `JEPA_DESIGN.md` §4 already records H-JEPA-style top-down
planning as a DESIGN NOTE, not a built component: coarse quarter
strategy constrains fine next-play planning, and fine outcomes update
the coarse plan. This addendum extends that note from quarter/play to
season/game, the two surfaces of this vision. The mechanism below is
DESIGN, not implementation. Every open question is named, not papered
over.

### 3.1 Top-down: coarse context conditions fine prediction

The coarse season state conditions the fine game predictor. In
concrete terms, the fine predictor's input includes, alongside the
game state of Lane 8 §1.1:

- The season context: season string, era, and the player's predicted
  season trajectory (the coarse surface's output for the players on
  the floor).
- The player's style context: the similarity profile of each lineup
  member (consulted as a feature, Lane 8 §3.3 — never confused with
  the game state itself).
- The coarse plan where one exists: for example, a season-level
  trajectory that implies a rotation pattern, a pace tendency, or a
  matchup to hunt. At quarter timescale this is Lane 8 §4's coarse
  plan (pace target, rotation, rest pattern); at season timescale
  it is the same idea one level up.

The design intent is that the fine predictor never predicts in a
vacuum: a 2009 game and a 2025 game with the same score and lineup
shape must predict differently, because the coarse context (era,
season trajectory, style) differs. Era-sensitivity, which the
similarity space deliberately removes, is exactly what the hierarchy
carries downward.

### 3.2 Bottom-up: fine outcomes aggregate toward the coarse trajectory

Fine outcomes aggregate upward. In concrete terms:

- A game's events produce per-game statistics (points, rebounds,
  assists, shot zones, and — when collected — shot locations).
- Per-game statistics, aggregated over the games played so far,
  update the player's in-progress season line.
- The updated season line is compared against the coarse surface's
  predicted season trajectory. The gap between predicted and observed
  trajectory is the signal that revises the coarse state: a player
  outperforming the coarse prediction shifts the predicted remainder
  of the season; a player underperforming it shifts it the other way.

The aggregation is one-directional in time: fine outcomes from games
already played update the coarse state for games not yet played.
Fine outcomes never rewrite the coarse prediction for games already
played, and never leak future games into a past coarse state. The
season-boundary masking discipline of the text design (no
future-season data into JEPA inputs) applies here in the same spirit:
no future-game data into a past game-state input.

### 3.3 The mechanism, stated as design

The hierarchy has two predictors, not one predictor with a timescale
token. This follows Lane 9 §2's decided timescale split (two predictor
modes, not one head with timescale conditioning), applied to the
hierarchy:

- **Coarse predictor (Mode S):** reads a player-season state, outputs
  the predicted next-season latent state (and, by readout, the 14-d
  line). No action conditioning.
- **Fine predictor (Mode G):** reads a game-state latent plus an
  action triple, outputs the predicted next game-state latent
  (decoded, for rendering and eval, into event type, shot zone,
  expected points, and — when location data exists — locations).
- **Downward link:** the coarse state is an additional conditioning
  input to the fine predictor. The coarse state does not replace the
  game state; it contextualizes it.
- **Upward link:** aggregated fine outcomes update the coarse state
  at defined boundaries (game boundary for the in-progress season
  line; season boundary for the next-season prediction). The update
  is a state update, not a training gradient: game outcomes change
  what the coarse state SAYS, and the coarse predictor is retrained
  or re-run only under its own training discipline, never by
  backpropagating a single game's outcome through the hierarchy at
  inference time.

### 3.4 Open questions — named, not resolved

1. **Conditioning form.** Is the coarse state concatenated to the
   fine predictor's input, used as a prior over fine outcomes, or
   injected by another mechanism? UNDECIDED. Each form has different
   failure modes, and the choice must be justified by eval, not by
   taste.
2. **Update cadence.** Does the coarse state update after every game,
   after a rolling window of games, or only at season boundaries?
   UNDECIDED. More frequent updates track form faster and leak noise
   faster; the tradeoff is an eval question.
3. **Hierarchy depth.** This vision has two levels (season, game).
   Lane 8 §4 adds a third idea (quarter strategy between them). Is
   the hierarchy two levels or three? UNDECIDED. The quarter level
   is recorded as a design note, not adopted, until the two-level
   version is validated.
4. **Shared encoder or separate encoders?** Lane 8 §4's note imagines
   predictors at two timescales sharing the state encoder's
   hierarchy. Contract §7's default is SEPARATE unless evals support
   sharing, and §8's Phase 1 rule is separate baselines first as
   ablation controls. The hierarchy in this addendum does NOT
   override either rule: shared hierarchy is a Phase 2 candidate
   that must pass the both-axes eval gate (match or beat each
   separate baseline, regress neither). Until that gate passes, the
   hierarchy is a conditioning design between two separate
   predictors, not a shared model.
5. **Continuous trajectories.** See §2.4 item 5: whether the fine
   surface ever predicts full 10-player trajectories, or only event
   locations, depends on a source that has not been identified.
   UNDECIDED and DATA-GATED, not a design choice this addendum can
   make.
6. **Eval for the hierarchy itself.** Next-play quality (Lane 8 §5.1)
   and season-forecast quality (§1.3) judge the two levels
   separately. No joint hierarchy metric is defined here. A
   hierarchy-specific eval — for example, whether coarse conditioning
   improves fine prediction versus a fine-only baseline on held-out
   games — must be defined before any hierarchy claim is made.
   Until then, "the hierarchy helps" is a hypothesis, not a finding.

## 4. RENDER DIRECTION — stated explicitly and unmissably

**THE LOOP IS: REAL DATA → WORLD MODEL PREDICTS LOCATIONS →
SPRITES RENDER THOSE LOCATIONS.**

- **Real data in:** game logs, play-by-play events, shot locations
  when collected, tracking aggregates as context. These are the ONLY
  training inputs (see §2.2–§2.4).
- **World model predicts:** given a game state and an action, the
  fine predictor outputs a predicted next game state, decoded into
  renderable terms including player locations.
- **Sprites render:** Pixel Replay / Live sprite figures draw the
  predicted states — positions on the court graphic, figures,
  animation — as PRESENTATION of a prediction.

**SPRITE POSITIONS NEVER TRAIN THE MODEL. RENDERING OUTPUT IS NOT
MEASUREMENT.**

Sprite positions are drawing choices: where a figure is drawn on a
court graphic. They are not records of where a player or a shot
actually was. Using them as training inputs would train the model on
its own output: the model would learn to reproduce the renderer, and
every "improvement" would be self-confirmation.

**EXPLICITLY BANNED in this addendum — any design element that would
feed sprite positions back as training input:**

- Reading pixel sprite coordinates from Pixel Replay / Live rendering
  code, replay files, or animation frames as model inputs. BANNED.
- Reading `assets/replays/` game files as training data. Those files
  are playback presentation, not measurement. BANNED as inputs.
- Reading `assets/replay-model.json` (replay animation weights) as
  world-model weights, inputs, or targets. Animation weights are not
  the world model. BANNED.
- Reading any future animation artifact, rendered frame, or sprite
  trajectory as a position measurement. If it was produced by
  rendering, it is not data. BANNED.
- Training a location predictor on locations that a previous model
  version predicted and a renderer drew, even if those locations
  "look right." Predicted locations that pass through a renderer
  do not become real data by passing through it. BANNED.
- Any pipeline stage, prototype, or demo that reads sprite positions
  as data FAILS REVIEW, under the same rule Lane 8 states in
  `DIVISION_OF_LABOR.md` §5 and `INTEGRATION_ADDENDUM.md` §2, and
  Lane 7 states in `INVENTORY.md` §3.

**Labeling rule (follows from the loop):** anything rendered from a
predicted location must be labeled as predicted, not real, on the
surface itself. A ghost opponent, a predicted play, or a predicted
location that is not labeled as predicted is not a feature; it is a
fabrication. The eval sketch (Lane 8 §5.3) checks the label, not just
the behavior.

## 5. AMBITION, HONESTLY SCOPED — what "as much as possible with advanced models" means in concrete phases

The user's ambition is to do as much as possible with advanced models
on Vector Hoops and to "bring the NBA to life with neural networks."
This section scopes that ambition into phases. NO TIMELINES ARE
INVENTED here: no dates, no quarters, no "by" statements. A phase
begins when its entry condition is met, not when a calendar says so.
NO CAPABILITY below is claimed as built. Everything is either data
that exists, a design that exists, or a gate that has not been passed.

### Phase A — Coarse first (data exists, design exists, gates open)

- **What it is:** the coarse surface (§1): next-season prediction
  via Mode S, with the 14-d readout.
- **Entry condition:** panel synthesis + user ruling on the
  prediction-first reframe; separate Phase 1 baselines measured;
  training separately authorized by the user.
- **What it enables:** a "where is this player headed" surface and a
  forecast audit against carry-forward, age-curve, and stats-MLP
  baselines (the rethink brief's O1/O4/O5 direction, panel-pending).
  It does not enable any in-game location feature.
- **What stays out:** all fine-surface work. Phase A success says
  nothing about whether the fine surface works.

### Phase B — Fine prototype on what exists (format only, not training)

- **What it is:** a format prototype built ONLY from the 5 PBP games
  and the one-date shot snapshots: the coordinate format, the
  state/action/next-state construction, the decoder from latent
  state to renderable locations, and the sprite-rendering path for a
  predicted location.
- **Entry condition:** none beyond design work — but the prototype
  must be labeled as a format prototype, and its results must never
  be presented as model quality, because 5 games cannot measure
  quality.
- **What it enables:** proof that the pipeline shape works
  end-to-end (real PBP `x`/`y` → state → predicted location →
  sprite render), so that when real data lands, the code path is
  ready. It enables NO training claim and NO rollout claim.

### Phase C — Fine real (gated on data, then on training authorization)

- **What it is:** the fine surface (§2) trained on real historical
  data: historical PBP at scale, shot coordinates at scale, game
  logs, and a built, validated, frozen game-state dataset (§2.4
  items 1–3 and 6).
- **Entry condition, in order:** (a) the collection route is
  exercised and measured (Alienware/Mac or alternate real sources);
  (b) the inventory + per-season gap report quantifies coverage;
  (c) the game-state dataset is built and frozen; (d) training is
  separately authorized by the user; (e) the fine surface is
  evaluated under Lane 8 §5 (next-play quality, planning quality,
  ghost believability) on held-out games.
- **What it enables, if it passes its eval:** next-play prediction,
  ghost opponents, what-if lineup simulations, and coach-mode
  play-calling on Pixel Replay / Live, all labeled as predicted.
  Each surface addition is a separate production decision, not an
  automatic consequence of a good eval number.

### Vision-only until data lands (not a phase, a horizon)

- **Full "bring the NBA to life":** living games in which predicted
  locations, ghost opponents, and coach-mode planning compose into a
  continuous, believable simulated game. This is the user's stated
  ambition. It stays vision until Phase C passes its eval. No demo,
  prototype, or render may present it as current capability.
- **Continuous 10-player trajectories:** vision-only until a real
  trajectory source is named and verified (§2.4 item 5). Even Phase C
  does not imply this: Phase C on PBP + shot data predicts EVENT
  locations, and trajectory prediction is a further, separately
  gated ambition.
- **The hierarchy as a single trained model:** vision-only until the
  both-axes sharing gate passes (§3.4 item 4). Until then, the
  hierarchy is a conditioning design between separate predictors.
- **Text as a hierarchy input:** the Scope B text tower (PBP event
  text embeddings, contract §10) is a separate design with its own
  panel review and its own forecast-lift gating. It is not adopted
  into this hierarchy by this addendum. If it ever enters the
  hierarchy, it enters as one tower with an on/off ablation, judged
  by forecast lift, not by assumption.

## 6. PANEL NOTE

H-JEPA centrality is before the 12-seat review panel as a brief
addendum (contract §12). This addendum is drafting input to that
review, not a ruling. The panel judges whether hierarchical JEPA
world models become the central architecture of the Vector Hoops
program, or remain one design among others under the §7
division-of-labor default. This addendum takes no position on that
judgment: it sketches what centrality WOULD mean if ratified (two
surfaces, one hierarchy, one render direction), so the panel has a
concrete proposal to judge, and it labels every panel-pending element
as pending so the panel is not asked to ratify a fait accompli.

**What would change in this addendum if the panel rules otherwise:**
the fallback is clean, because the two surfaces remain valid as
separate design sketches even if centrality is not ratified. If the
panel declines H-JEPA centrality, then: (a) the coarse surface
stands alone as Lane 9's Mode S season predictor, judged by its own
forecast eval (or by the §8 joint metric, per the ruling); (b) the
fine surface stands alone as Lane 8's Mode G next-state predictor,
judged by Lane 8 §5 on held-out games; (c) the hierarchy (§3) reverts
from a proposed architecture to an optional design note, exactly as
Lane 8 §4 already holds it; (d) the §7 division-of-labor default
(separate models, separate evals, sharing only on eval evidence)
continues unchanged; and (e) the render direction (§4) and the sprite
ban survive either ruling, because they are data-integrity rules,
not centrality claims — they bind any future world-model work whether
or not H-JEPA is central. No section of this addendum needs to be
deleted under the fallback. Only its framing changes: from "the
hierarchy is the main thing, pending ratification" to "the two
predictors are separate sketches, and the hierarchy is a note."

## 7. Conclusion — restated under the hold

H-JEPA centrality is a USER VISION UNDER REVIEW, not ratified
architecture. The panel judges it. Until the panel rules and the user
decides, this addendum is a sketch of two prediction surfaces
(coarse: future season stats; fine: in-game player locations from
real data only), one hierarchy design with its open questions named,
and one unmissable render direction (real data → world model
predicts locations → sprites render those locations; sprite positions
NEVER train the model). The coarse surface has data and a design
behind it. The fine surface has a format proof and a data-gated road
ahead of it. The full ambition — bringing the NBA to life with neural
networks — stays vision until the data lands, the training is
authorized, and the evals pass. This addendum claims nothing more,
and it must not be quoted as claiming more.

## 8. What this addendum does NOT do (boundary restatement)

- No training runs, no GPU, no package installs, no repo writes, no
  prod writes, no merge, no commits.
- No edits to Lane 8's three delivered files or to any other lane's
  files. This file is the single new deliverable.
- No rewrite of the board, contract headlines, eval protocol, or
  prototype briefs. Those rewrites await panel synthesis + user
  ruling under contract §11.
- No new target definition. The coarse target is Lane 9 Mode S's
  latent target with the 14-d readout (§1.3); the fine target is
  Lane 8 Mode G's next-state target (§2.1). Open questions about
  readout form, conditioning form, update cadence, hierarchy depth,
  and trajectory sources are named in §1.3, §2.4, and §3.4, not
  resolved by assertion.
- No capability claimed as built, trained, evaluated, or ratified.
  Every "enables" statement in §5 is conditional on a gate that has
  not been passed.

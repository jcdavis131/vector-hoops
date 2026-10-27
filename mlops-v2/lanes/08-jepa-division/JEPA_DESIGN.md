# Lane 8 — Hoops-JEPA Design (DESIGN ONLY)

**Status:** DESIGN ONLY. No training, no GPU, no package installs, no
prod writes, no merge. Hoops-JEPA is NOT built, trained, or evaluated
in this pass. Everything below is a design target, an asset inventory,
or a labeled paper/user pattern — never a measured Hoops-JEPA result.
**Authority:** Contract §7 (user decision 2026-10-26). Companion docs:
`DIVISION_OF_LABOR.md` (why two models), `INTEGRATION_ADDENDUM.md`
(how surfaces change).

## 1. Game-state encoder inputs — real data only

### 1.1 What a game state is (design definition)

A game state is a snapshot of a game at one decision point, sufficient
for the predictor to predict the next state given an action. In plain
terms, the state encoder reads:

- **Score and clock:** score differential, period, time remaining.
  These change behavior (see `DIVISION_OF_LABOR.md` §3) and are state,
  not metadata.
- **Lineup on the floor:** the five players per side currently in the
  game, with their identities (`person_id`, never name alone) and
  their season-level style context (the similarity space may be
  consulted as an input feature — a player's twin-style profile is a
  legitimate state descriptor — but the JEPA state is not the twin
  vector itself; see §3.3).
- **Possession and court context:** which team has the ball, shot
  clock, fouls-to-give / bonus state, timeouts remaining — each only
  if the play-by-play source actually carries it (see §1.2: do not
  assume a field exists until the source is verified).
- **Recent history:** the last N events (the preceding possessions),
  because "what happens next" depends on run, rhythm, and matchup
  adjustments, not only on the current snapshot.
- **Season / era context:** the season string (`YYYY-YY`) as an
  explicit input. JEPA is era-sensitive by design; era is fed in,
  never normalized out.
- **Shot-location context, when collected:** where shots in this
  game (and, aggregated, by these players) have come from — zones,
  distances, coordinates. This is the shot-position tower of
  contract §6c, and it is the single largest data dependency (§6).

### 1.2 What exists today on this VM vs. what is missing

Measured from Lane 7's inventory (`lanes/07-pipeline-overhaul/
INVENTORY.md`, measured 2026-10-26 on checkout `1e5bfecc`), not
re-derived here. "Exists" means the file is on this VM; it does not
mean it is sufficient for JEPA training.

**EXISTS TODAY:**

| Asset | What it actually is | JEPA use / limit |
|---|---|---|
| `assets/vectors.json` (12,966 rows, 14-d per-100 stats, z-scored within season) | Season-level style profiles | Lineup style context only. Season aggregates, NOT game states. Cannot teach "what happens next" inside a game |
| `assets/mtnn_embeddings.f32` (12,966 × 64-d, v5 champion) | Season-level similarity vectors | Same limit: season-level, not game-level. A player's twin profile can describe a lineup member; it cannot encode a live game state |
| `pipeline/cache/` (105 MB, 788 tracked files, 30 seasons 1996-97…2025-26: Base / Advanced / Scoring dashboards, bio, tracking 2013-14+, salaries, honors, playoffs, matchup data, BBRef per-game/advanced) | Season-level source cache | Era/season context and player-season features. No within-game sequence. The tracking era mask (pre-2013 absent) applies to any tracking-derived state feature |
| `pipeline/cache/cdn_pbp/` — 5 play-by-play files, 2026-27 opening games only, 593–667 actions per game, 174–188 field-goal actions per game, all carrying `x`/`y` | The ONLY per-shot location data in the stats cache | Proof of concept for a PBP shot-location input — 5 games, one week, one season. Not a training corpus |
| `pipeline/shotcharts/snapshots/` (2026-10-20: BBRef 545 records / 3 games / 62 players; ESPN plays 546 records / 3 games / 62 players, both QA PASS) | One date of canonical per-shot records (feet, hoop at origin) | Format contract + prototype corpus for the shot tower. Worthless as historical coverage until backfilled |
| `assets/replays/` — 5 game files (`0022600001`, `0022600002`, `0022600003`, `0022600085`, `0022600086`, 2026-10-20/21) + `index.json` | Pixel Replay playback data | Presentation, NOT measurement. Replay files render games; they are not JEPA training inputs, and sprite positions inside them are never inputs (§5 of the division doc) |
| `assets/replay-model.json` | Replay animation weights | Animation, not the world model. Do not confuse the two "models" |

**STILL MISSING (blockers, in order — see §6):**

| Missing asset | Consequence |
|---|---|
| Historical play-by-play cache (beyond the 5 opening games) | No within-game sequences to learn transitions from. JEPA training cannot start on history without this |
| Game-log cache (`pipeline/data/gamelogs_*.jsonl` — absent for all seasons per Lane 7) | No per-game form / availability / recent-history features; the form family already returns empty in the base rebuild for this reason |
| Historical shot-location cache (no `shotchartdetail` response, no per-season shot file, no LOC_X/LOC_Y column anywhere under `pipeline/cache/`) | No shot-location state feature for any historical season. The shot tower is a new collection job, not a reshape of existing data |
| A built game-state dataset (states + actions + next states, versioned, hashed, index-aligned) | Even after the raw sources land, the JEPA training set itself must be built, validated (fail loud, never silent imputation — contract §6b), and frozen before any training run |

**UNVERIFIED (marked, not assumed):**

- Whether historical play-by-play is collectable at scale from the
  currently reachable sources, and at what coverage by era (coordinate
  coverage by era is a research question per contract §6c, not an
  assumption). Lane 7's `SHOT_POSITION.md` and the 2026-10-11 shot-source
  verdict are the standing evidence: ShotChartDetail is the only
  LOC_X/LOC_Y source, it stalls from the Hatch VM, CDN 403s, and
  collection must run on Alienware/Mac. Whether that verdict's
  Alienware/Mac path has since been exercised is UNVERIFIED in this
  lane's reading.
- The exact field set of any historical play-by-play feed (shot clock,
  fouls, timeouts) — UNVERIFIED until a real historical file is in
  hand. The design in §1.1 lists candidate fields; the build must
  verify each one against the source, not against this doc.
- The 2026-27 live-game pipeline's coverage beyond the 5 opening
  games — UNVERIFIED here; Live/Pixel Replay growth is a product
  question for the coordinator, not a JEPA training claim.

## 2. Action space definition

The action is what the predictor is conditioned on: the choice that,
combined with the state, determines the next state. JEPA's action
space has three levels, all defined as design (no implementation):

### 2.1 Play call (the fine action)

The offensive (or defensive) call for the next possession or play.
Concrete examples:

- Offensive: high pick-and-roll with the star guard as ball-handler;
  post-up for the center against a smaller defender; off-ball flare
  screen to free a shooter for a corner three; isolation for the wing
  with 8 seconds on the shot clock.
- Defensive (the counterpart action when modeling the defense's
  response): switch everything on screens; drop coverage with the big
  staying near the rim; blitz the ball-handler and rotate; zone for
  one possession after a timeout.

A play call is a discrete, named choice with a small vocabulary at
first (design target: tens of calls, not hundreds). The vocabulary
must be derived from what play-by-play actually labels — if the
source cannot distinguish "flare screen" from "pin-down," the action
vocabulary cannot contain that distinction, and the design must say
so rather than inventing labels.

### 2.2 Lineup (the medium action)

The five players on the floor — a substitution decision. Concrete
examples:

- Go small: replace the center with a wing, accepting rebounding
  risk for spacing and switching.
- Go big: two traditional bigs together to control the glass and
  protect the rim.
- Rest the star: a bench unit for 3 minutes to save the star for the
  close, accepting a likely scoring dip.
- Matchup substitution: bring in the lockdown wing specifically to
  guard the opponent's hot scorer.

Lineup actions are constrained by who is available (foul trouble,
injury, rest) — availability is part of the state (§1.1), so an
illegal lineup (a fouled-out player) is never a valid action. The
action space must enforce that at design level, not hope the model
learns it.

### 2.3 Matchup (the conditioning context of the action)

Who guards whom, and which unit faces which unit — not a separate
button the coach presses, but the context that changes what a play
call means. The same high pick-and-roll against a drop defense and
against a switching defense is, for prediction purposes, two
different actions. The design therefore conditions the predictor on
(play call, lineup, matchup) jointly: the action is the triple, not
the play call alone.

**What the action is NOT:** a joystick direction, a sprite movement,
or a pixel coordinate. Actions are coaching decisions expressed in
basketball terms. If a future prototype ever conditions on sprite
motion, it has left this design and must say so.

## 3. Action-conditioned predictor (V-JEPA 2-AC pattern, small scale)

### 3.1 What the pattern actually is (traceable claims only)

The JEPA predictor paper in the `jepa-predictor-paper` skill
(`references/paper.md`) defines the JEPA setup as: a context encoder,
a target encoder, and a predictor that maps visible-context features
plus target-position tokens to predicted target features in the
encoder's representation space, trained by minimizing the distance
between the predicted features and the (stop-gradient) target
encoder's features. Conventionally the predictor is discarded after
pretraining and the encoder alone is deployed. The paper's own
contribution is retaining and reusing that predictor at test time
for occluded feature completion — on images, with mask fractions
0.25 / 0.56 / 0.77, where the lift over the masked-encoder baseline
grows with mask fraction (headline: CLIP paired with the I-JEPA
predictor lifts fine-grained Stanford Dogs from 15.9% to 52.1%,
+36 pp, at heavy occlusion).

The same paper's JEPA-family survey (paper §2, "JEPA family") states
the one V-JEPA 2-AC fact this design relies on: **V-JEPA 2 extends
JEPA to video, and V-JEPA 2-AC trains a NEW action-conditioned
predictor (the pretraining one is not reused)** — cited there as
Meta FAIR, "V-JEPA 2-AC: Action-conditioned predictor post-training,"
arXiv 2025. That is the pattern Hoops-JEPA follows: a predictor
trained (or post-trained) specifically to be action-conditioned,
rather than a repurposed pretraining predictor. No other V-JEPA 2-AC
architectural detail (layer counts, widths, training recipe) is
claimed here, because the skill's references do not supply it in
this lane's reading — and inventing it would violate the
traceability rule. The component list in §3.2 is therefore a
Hoops-JEPA design in plain architecture terms, not a restatement of
the V-JEPA 2-AC paper.

### 3.2 Component list (plain architecture terms)

1. **Game-state encoder.** Reads a game state (§1.1) and outputs a
   latent state vector: a fixed-width, normalized representation of
   "where the game is." It encodes score, clock, lineup identities
   and style context, possession, recent events, and season — the
   time- and era-sensitive content the similarity space deliberately
   removes. This encoder is JEPA's, not the twin space's (shared-stem
   rule: separate by default; see `DIVISION_OF_LABOR.md` §4).
2. **Target encoder (stable copy).** Encodes the TRUE next state
   (the state that actually followed, from real play data) into the
   same latent space. During training it is the stable reference
   (exponential moving average of the state encoder, per the JEPA
   pattern in §3.1) — the predictor learns to match it, and its
   gradients are stopped so the target cannot collapse toward the
   prediction.
3. **Action encoder.** Reads the action triple (play call, lineup,
   matchup — §2) and outputs an action embedding in a form the
   predictor can consume. Discrete calls embed as learned vectors;
   lineup/matchup embed from player identities and style context.
4. **Action-conditioned predictor.** Reads (current latent state,
   action embedding) and outputs the PREDICTED next latent state.
   This is the world model proper: it answers "given this state and
   this action, what comes next" in latent space, not in pixels and
   not in box-score lines.
5. **Rollout loop (inference only, design level).** Feed the
   predicted next state back as the current state, condition on the
   next action, and repeat. A rollout is a predicted sequence of
   states — a simulated stretch of game, a ghost opponent's plan, or
   a what-if branch. Rollout length is a design parameter to be set
   by eval (§5), not by hope: prediction error compounds, and the
   eval must measure how far a rollout stays believable.
6. **Decoders (evaluation and rendering only, NOT training targets
   of the JEPA objective).** A lightweight readout that maps a
   predicted latent state to human-readable terms (likely next event
   type, expected points of the possession, shot-zone distribution)
   for eval and for the Pixel Replay renderer. The JEPA objective
   itself is latent prediction (§3.1), not pixel or box-score
   reconstruction — a decoder that becomes the training target has
   turned JEPA back into a reconstruction model, and the design must
   not allow that drift silently.

### 3.2b DESIGN NOTE — unified-loss variant (2026-10-26 voice-call refinement, not the base design)

Standing context added 2026-10-26 records a proposed unified design:
a shared tower stem with a Matryoshka SupCon head plus a JEPA
predictor head whose target IS the contrastive embedding of the true
next season — the world model plans IN twin space — with bridge +
predictive positives, uncertainty weighting, and PCGrad on conflict,
judged by the joint-only "future twins" metric (predict next season,
retrieve its twins), under the kept rule "separate baselines first
as ablation controls; joint must not regress either head."
This variant is recorded here as a CANDIDATE, not adopted as the
base design, for two reasons stated in `DIVISION_OF_LABOR.md` §4.1:
it must first pass the both-axes eval gate against the separate
baselines, and its season-timescale predictor target must be
reconciled with this doc's game-timescale next-state predictor
(§3.2) rather than blurred into it. Its UniJEPA/DreamerV3/MuDreamer
provenance claims are recorded from standing context, not verified
against the skill's references in this lane, and need citation
checking before use as design authority. Design only — no training
authorized.

### 3.3 Relationship to the similarity space (one paragraph, no conflation)

The similarity space may be CONSULTED by the JEPA state/action
encoders (a player's twin-style profile is a useful descriptor of
who is on the floor), but the JEPA latent state is not the twin
vector, and JEPA is never trained to reproduce twin neighbours.
Consultation is a feature input; identity of the spaces would be
the interference the division exists to avoid.

## 4. DESIGN NOTE — H-JEPA-style top-down planning (NOT a built component)

**This section is a design note from the user's stated pattern
(contract §7: "H-JEPA-style top-down planning (coarse quarter
strategy → fine next play) is a DESIGN NOTE, not a built component
in this pass"). It is not a paper claim — the JEPA predictor paper
references in this lane's reading do not establish an H-JEPA
hierarchy for Hoops-JEPA — and it is not a component to build in
this pass.**

The idea, for a later pass: planning happens at two resolutions.
The COARSE level plans quarter strategy — pace target, rotation
pattern, which matchups to hunt, when to rest the star, foul
management across the quarter. The FINE level plans the next play —
the action triple of §2 for the immediate possession. The coarse
plan constrains the fine plan (a "rest the star" quarter strategy
removes star-heavy play calls from the fine action space for that
stretch); the fine outcomes update the coarse plan (a run of
successful small-ball possessions may extend the small-ball
stretch). In JEPA terms, this would mean predictors at two
timescales sharing the state encoder's hierarchy, with the coarse
predictor's output conditioning the fine predictor.

**Why it stays a note:** the fine level (§3) does not exist yet, so
there is nothing for a coarse level to sit on top of. Building the
hierarchy before the single-step predictor is validated would be
building the roof before the walls. The note is recorded here so a
later pass inherits the direction without mistaking it for progress.

## 5. JEPA's own eval sketch (outline, no numbers invented)

JEPA is judged by its own eval, never by the twin gate
(`DIVISION_OF_LABOR.md` §6). All evals below run on HELD-OUT games
(games never used in training), with the same expanding-window
discipline as the similarity folds where it applies (train on
earlier seasons, evaluate on later ones; the frozen-test idea —
never tune on the eval set — carries over even though the eval
objects are games, not player-seasons). No thresholds are set here;
setting a number before the first model exists would be inventing
a bar. The coordinator/user sets bars after the first measured
results.

### 5.1 Next-play prediction quality

- **Next-event accuracy:** given a real state and the real action
  that followed, does the predicted next latent state decode to the
  event type that actually happened (made/missed shot by zone,
  turnover type, foul, etc.)? Reported per event type, not just
  overall — a model that only predicts the majority event is not
  predicting.
- **Calibration of the decoded distribution:** when the decoder
  says a shot from a zone is likely, is it likely at the observed
  rate on held-out games? Overconfident predictions fail here even
  with good top-1 accuracy.
- **Baselines it must beat (to be named at eval time, not invented
  here):** a no-action baseline (predict the next state from the
  current state alone, ignoring the action — this isolates what the
  action conditioning actually adds) and a Markov baseline (predict
  from the last event only). If JEPA cannot beat "ignore the action,"
  the action conditioning is decorative.
- **Slice reporting:** by era (does prediction quality hold across
  the tracking era boundary?), by score/clock situation (close-and-
  late vs. blowout), and by rollout step (step 1 vs. step 5 vs.
  step 10 — error compounding made visible).

### 5.2 Planning quality

- **What-if discrimination:** given the same state, does the model
  rank a genuinely good action above a genuinely bad one, as judged
  by the actual outcomes that followed those actions in held-out
  games? A planner that cannot tell a good call from a bad one is
  not planning.
- **Rollout coherence:** do multi-step rollouts stay within
  plausible basketball (legal lineups, plausible score evolution,
  no impossible event sequences)? Measured by rule checks on
  rollouts, not by vibes.
- **Coach-mode usefulness (human check, small and honest):** a
  fixed set of held-out situations, each with the model's top-3
  suggested actions and its reasoning in plain words, reviewed by a
  human against what actually happened. This is a spot check in the
  spirit of Lane 5's 20 twin-quality checks — small, named, and
  eyeballed, not a metric pretending to be more than it is.

### 5.3 Ghost believability

- **Indistinguishability probe (outline):** can a human (or a
  held-out classifier, once one exists) distinguish a ghost
  opponent's predicted stretch from a real stretch of the same
  matchup, when both are rendered the same way? The bar is not
  perfection — it is "indistinguishable at the level the surface
  shows" (Pixel Replay rendering, not raw coordinates).
- **Style fidelity:** does a ghost of a specific team/player
  preserve that team's observable tendencies (pace, three-point
  rate, zone distribution) over a rollout, rather than collapsing
  to league-average play? Reported as tendency drift over rollout
  length.
- **Failure disclosure:** every ghost surface must label the ghost
  as model-predicted, not real. Believability without labeling is
  deception, and the eval must check the label, not just the
  behavior.

## 6. Data-dependency list (what must land first, in order)

1. **Historical play-by-play coverage.** JEPA learns transitions:
   state → action → next state. Without sequences of real events
   across many games and eras, there is nothing to learn from.
   Season aggregates (the current cache) cannot substitute. This is
   the first blocker, and it is UNVERIFIED whether collection at
   scale is feasible from reachable sources (see §1.2).
2. **Shot locations (the §6c shot-position tower).** Shot location
   is where a possession's outcome lives: zone, distance, and
   coordinates turn "a shot happened" into "a shot from here
   happened," which is what the state encoder, the action
   vocabulary (which shots a play call creates), and the ghost
   renderer all need. Why it blocks JEPA specifically, beyond the
   twin space: the similarity space can live without locations
   (shot TYPE mix already exists in the shotmix family); the
   dynamics space cannot, because "what happens next" after a play
   call is substantially "where does the shot come from." Collection
   must run on Alienware/Mac per the 2026-10-11 verdict (stats API
   stalls and CDN 403s from the Hatch VM); that path is still
   UNVERIFIED as exercised.
3. **Game logs.** Per-game form, availability, and recent-history
   features for the state encoder's history window. Absent for all
   seasons today (Lane 7 §1.2); re-fetch is a scheduled network job
   on a machine with clean stats access, not a local rebuild.
4. **A built, validated, frozen game-state dataset.** Raw sources
   are not a training set. States, actions, and next states must be
   constructed with versioned, hashed, index-aligned artifacts and
   fail-loud validation (never silent imputation), following the
   contract §6b pipeline discipline. Only then can any training run
   be authorized — and that authorization is a separate user
   decision, not granted by this design.
5. **The action vocabulary, derived from the sources.** Play-call
   labels must come from what play-by-play actually distinguishes
   (§2.1). If the source vocabulary is coarse, the action space is
   coarse, and the design must say so. Inventing fine labels the
   source cannot support would fake precision.

**Order matters:** 1 and 2 are collection jobs on another machine;
3 rides the same collection window; 4 and 5 follow from 1–3. No
JEPA training run is meaningful before 1–4 land, and this doc does
not authorize one.

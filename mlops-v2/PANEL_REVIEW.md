# Panel Review — Vector Hoops MTNN rebuild, prediction-first rethink

**To:** the user (decision-maker). **From:** panel coordinator, 2026-10-26.
**Basis:** `~/workspace/mlops-v2-drafts/PANEL_BRIEF.md` only. Every number below comes from that brief.
Nothing here is training authorization. Training, merges, and production writes still require the user's
separate word.
**Status labels:** seats 1–4 are channelled lenses in the standing-panel pattern — modelled perspectives,
NOT messages from the real people named. Seats 5–12 are role-based modelled experts, not named individuals.
Disagreements are kept, not averaged away.

---

## Seat 1 — Jeremy Howard (pragmatist, modelled lens)

**On the reframe:** Right, and overdue. The twin space was a beautiful demo in search of a job; a forecast
is a job. But the reframe only helps if it kills complexity, not if it renames it. A forecast model with
17 towers, two heads, a bridge loss, PCGrad, and a hierarchy synthesis is not simpler than the twin model
it replaces — it is bigger. The first forecast model should be embarrassingly simple: carry-forward,
age-curve, and a small MLP on the 73 verified columns, all three beaten before anything fancier is allowed
to exist.

**Sharpest critiques:**
1. The plan still has no cheapest-model-first ladder. If a stats-only MLP does not beat carry-forward on
   2025-26, the towers, the JEPA head, and the text tower are all decoration. Build the ladder, publish
   the rungs, and let each rung earn the next.
2. The 143-column chain is a trap for a pragmatist: 70 unverified context columns, gamelog-blocked, with
   an undecided honors semantics question inside them. Do not let the forecast program wait on 143. Train
   the first forecast on the verified 73 and let 143 earn its way in column-family by column-family, each
   family justified by forecast lift.
3. The text tower is the most likely waste in the program. Bio text (594 Wikipedia intros) is not
   play-by-play text, and generic embeddings already measured ~0.074 twin recovery against a 0.4 bar.
   The tower's burden of proof is a forecast delta, and the cheapest test is a frozen EmbeddingGemma
   rollup bolted onto the simple MLP — one week of work, kill it if the delta is noise.

**Architecture defended:** 73-column MLP forecast head first; JEPA and contrastive heads only after the
simple head beats carry-forward. Horizon: 1 season. Weighting: all 14 equal, report per-stat MAE
separately so a scoring-stat win cannot hide a rebounding-stat loss.
**Text worth / cheapest experiment:** Low prior. Cheapest kill: frozen Gemma rollup + simple MLP, on/off
ablation on Fold 2 only. If Fold 2 forecast MAE does not move beyond noise, kill the tower.
**Weakest link + first change:** No simple-baseline ladder. First change: freeze the baseline set
(carry-forward, age-curve, 73-col MLP) before any tower work.

VERDICT: PASS — reframe right, conditional on a simple-first ladder — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §4, §5
VERDICT: BLOCKED — any forecast claim on the 143 chain until a scratch build verifies it — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §2

## Seat 2 — Ilya Sutskever (first principles / scale, modelled lens)

**On the reframe:** Right for the wrong reason if the team thinks it is merely a metric change. The
deep question is what the representation must be invariant to. Twins demanded era-invariance; forecasting
demands time-sensitivity. These are not two heads on one stem — they are opposing pressures on the same
weights, and the brief's own history (the conflicting-invariance rationale for two models) already knows
this. A shared stem trained prediction-first will quietly destroy the twin space unless the twin floor is
a hard constraint with a number, not a sentiment.

**Sharpest critiques:**
1. The unified loss is premature as a design commitment. Phase 1 separate baselines are the ablation
   controls, but the brief already specifies the Phase 2 bridge (predict the contrastive embedding of the
   true next season) before Phase 1 has measured whether the two spaces are even compatible. If the
   contrastive space is era-invariant by construction, predicting next season *inside it* discards exactly
   the time-varying signal forecasting needs. The bridge target should be the forecast itself, with the
   twin space as regularizer — or the bridge is conceptually backwards.
2. The evaluation design measures interpolation, not generalization, in one place that matters: the
   new-player slice is ~83 players per recent season, but the brief never states whether those players'
   *pre-NBA* signal exists or whether the slice is evaluated cold. A forecast that only works for players
   with three prior seasons has not learned player development; it has learned smoothing.
3. Scale thinking is absent. Nothing in the brief says what improves as data grows: more seasons, more
   PBP text, more shot coordinates. If the answer is "the text tower," the program is betting its scaling
   story on its weakest component. The scaling story should be the forecast head's data engine: every new
   season is another training fold, not another tower.

**Architecture defended:** Forecast head predicting the 14-d vector directly (not via a twin embedding),
with the contrastive loss as a small auxiliary regularizer. Horizon: 1 season primary; multi-season only
as a diagnostic that exposes compounding error. Era handling: predict era-normalized, map back — because
raw stats across 30 seasons confound rule changes with player change, and a model that must learn both
will learn neither cleanly.
**Text worth / cheapest experiment:** The text tower's value is not in the text, it is in the alignment:
a contrastive text↔stat projection is the only version that could scale. Cheapest prove: train the
projection on Fold 1, test whether text-augmented forecasts beat stats-only on Fold 2 *new players only*.
If text helps only known players, it is memorization, not signal.
**Weakest link + first change:** The bridge direction in Phase 2. First change: restate the bridge as
forecast-primary (twin space regularizes the forecast; the forecast does not live inside the twin space)
before any Phase 2 design doc is written.

VERDICT: PASS — reframe right, but the Phase 2 bridge as specified is conceptually backwards — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §4
VERDICT: BLOCKED — twin floor as a real constraint until it is a number with a threshold — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §4

## Seat 3 — Andrej Karpathy (data engine, modelled lens)

**On the reframe:** Right, and it clarifies the dataset product: the dataset is now a forecast dataset,
not a similarity dataset. That changes what "good data" means. A twin dataset needs clean cross-sections;
a forecast dataset needs clean *transitions* — the same player across adjacent seasons, with the context
that changed between them (team, role, minutes, shot diet). The current 73 columns are mostly
cross-sectional; the transition signal lives exactly in the missing 70 context columns and the uncollected
game logs. The reframe is right, but it makes the data gap worse, not better.

**Sharpest critiques:**
1. The data engine has no disagreement-mining stage. The informative examples are not the 12,966 rows;
   they are the forecast misses: role changes, injuries, breakouts, collapses. The brief's eval reports
   average MAE but never specifies a miss taxonomy. Without it, the loop will optimize the easy bulk
   (stable veterans) and never learn the transitions that matter.
2. Play-by-play text is being treated as a tower input before it is treated as data. The first job is
   not embedding PBP text; it is *structuring* it: per-player-season rollups of play types, shot zones,
   creation context, and lineup context, all as numbers. Text embedding is what you do after the
   structured version stops improving — otherwise the model must rediscover from prose what the box
   score already says in numbers.
3. The sprite rule is correct but incomplete. The brief bans sprite positions from training, but it does
   not state the positive rule: which *derived* quantities from real PBP are allowed (e.g., drives,
   paint touches, speed already exist as tracking aggregates). A data engine needs an allowlist, not
   just a ban, or every lane will re-litigate it.

**Architecture defended:** Transition-first dataset: per-player adjacent-season pairs with change
features (Δminutes, Δusage, Δshot diet, team change flag) as first-class inputs. Forecast head on the
73 + structured PBP rollups; text embedding only as a later stage. Horizon: 1 season.
**Text worth / cheapest experiment:** Medium-low until structured PBP is exhausted. Cheapest kill: build
the structured PBP rollup features first, then test whether frozen text embeddings add forecast lift
*on top of* structured PBP. If they do not, the text tower is redundant by construction.
**Weakest link + first change:** No miss taxonomy, no transition features. First change: define the
forecast-miss taxonomy and the adjacent-season pair dataset before any model work.

VERDICT: PASS — reframe right; it converts the dataset product from cross-sections to transitions — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §2, §4
VERDICT: FAIL — text-as-tower before structured-PBP rollups; order is backwards — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §5

## Seat 4 — JB Straubel (systems at scale, modelled lens)

**On the reframe:** Right, and it is the only framing that can run unattended for a year: a forecast
refits every season on a schedule, while a twin space needs a human to admire it. But the brief's
operational story is thin. The collection constraint (Hatch cannot fetch ShotChartDetail or CDN PBP)
is stated as a routing note, not as a system design. A program whose critical data path depends on
"the Alienware box or the user's Mac" has a single point of failure with no owner, no schedule, and no
stall detection. That is how a forecast program silently goes stale.

**Sharpest critiques:**
1. No loop economics. Cost per refit, cost per collection run, and mean time to detect a silent stall
   are never stated. The 105MB tracked cache and 788 files are the current system; the PBP collection
   for 30 seasons will be orders of magnitude larger, and nothing in the brief sizes it, versions it, or
   states where it lives. Size the PBP corpus before committing to embed it.
2. The refit rule (refit on ≤2024 after CV) has no deployment counterpart. Who serves the refit model,
   what happens to the twin products during the swap, and what rolls it back if the forecast degrades
   on the live season? The twin floor is mentioned as a constraint but never as a rollback trigger.
3. EmbeddingGemma on CPU for a 30-season PBP corpus is asserted feasible via template dedup, but the
   dedup ratio is never estimated. If unique templates number in the hundreds of thousands rather than
   the thousands, the CPU plan collapses. Measure the template count on the existing handful of PBP
   games before designing around dedup.

**Architecture defended:** Whatever forecasts best under a strict loop budget: scheduled annual refit,
versioned cache, automated validation gates that fail loud, rollback on forecast degradation. Horizon:
1 season (the only horizon a yearly loop can honestly serve).
**Text worth / cheapest experiment:** Worth only what the loop can afford. Cheapest prove: measure
template count and embedding throughput on existing PBP games first; if the CPU budget fails, the text
tower is dead before it starts and no modelling debate matters.
**Weakest link + first change:** The collection path has no owner, schedule, or stall detection. First
change: a collection runbook (machine, schedule, size estimate, stall alarm, versioning) before any
bulk fetch.

VERDICT: PASS — reframe right; a forecast is operable where a twin space is ornamental — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §4
VERDICT: BLOCKED — bulk PBP/text plans until corpus size and CPU throughput are measured — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §2, §5

## Seat 5 — Contrastive / metric-learning specialist (modelled)

**On the reframe:** Right, with one real loss: a well-tuned twin space is the best *diagnostic* the
forecast program has. When a forecast misses, the twin space answers "who did this player used to play
like, and what happened to them next?" — that is a forecast prior, not a product garnish. Demoting
twins to "floor constraint" risks losing the diagnostic if the floor is defined as a single number
(hit@10) instead of as a property (the space must preserve career-archetype neighborhoods).

**Sharpest critiques:**
1. The auxiliary contrastive head will die under prediction-first weighting unless its weight is
   floored. Uncertainty weighting learns to down-weight the harder task; the twin task is harder
   (0.074 generic recovery shows the space is not trivially learnable), so learned weights will starve
   it. If the twin space must survive, its weight needs a floor, or it needs its own training phase.
2. SupCon on player-seasons has a label problem the brief never states: what is a "positive"? Same
   player adjacent seasons? Same archetype? The old spec's era-stratified batches assumed twin labels;
   under the reframe, the positive definition must be re-derived from forecast utility, or the auxiliary
   head optimizes a geometry nobody uses.
3. Matryoshka prefixes as H-JEPA levels is elegant and unproven. Coarse prefixes carrying "invariant
   twin structure" while fine prefixes carry "dynamics" is an assertion, not a measurement. The check is
   cheap: measure per-prefix forecast error and per-prefix twin recovery separately. If coarse prefixes
   do not actually behave invariantly, the hierarchy synthesis is decoration.

**Architecture defended:** Contrastive head kept, but with a weight floor and positives defined as
same-player adjacent seasons (the forecast-relevant neighborhood). Twin floor metric: archetype
neighborhood preservation, not just hit@10.
**Text worth / cheapest experiment:** Text as a contrastive positive (predictive positives) is the
most interesting text idea in the brief — but only if the positive definition is fixed first.
Cheapest kill: same frozen-Gemma on/off ablation, judged by forecast MAE, not twin metrics.
**Weakest link + first change:** Undefined positive labels under the reframe. First change: redefine
contrastive positives from forecast utility before touching loss weights.

VERDICT: PASS — reframe right, with the twin diagnostic preserved as archetype neighborhoods — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §4
VERDICT: BLOCKED — auxiliary contrastive head under learned weights without a weight floor — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §4

## Seat 6 — JEPA / world-model researcher (modelled)

**On the reframe:** Right, and it finally gives the JEPA head a real job: the world model predicts the
next season, full stop. But the brief's JEPA design is still written in twin language — "predict the
contrastive embedding of the true next season." A world model should predict the next *state*, and the
state here is a 14-d stat profile plus context, not a 64-d similarity vector. Predicting an embedding
is predicting a summary of a summary; every bit of forecast-relevant detail the embedding discarded
(and a 64-d L2 embedding of 17 towers discards a great deal) is detail the predictor can never recover.

**Sharpest critiques:**
1. The target is wrong. Defend: JEPA predictor target = next-season 14-d game vector (+ context deltas),
   stop-grad on nothing, because the target is observed data, not a learned representation. The
   contrastive embedding may be an *auxiliary* prediction target, but making it the primary target caps
   forecast accuracy at the embedding's information content.
2. Two timescales are named (season and game) but never resolved — the brief itself flags the slash as
   "not a decision." A season-timescale predictor and a next-play predictor are different models with
   different data (season aggregates vs PBP sequences). Shipping one head with "timescale conditioning"
   as a promissory note is how a design doc stays vague through implementation. Decide: season-scale
   first, game-scale only if PBP collection lands.
3. H-JEPA's lesson is being borrowed without its condition. H-JEPA gains were weak where timescales
   do not separate cleanly. In basketball, season-to-season change and game-to-game change are not
   cleanly separated levels (a role change is both), so the hierarchy may add machinery without the
   separation that justifies it. The hierarchy needs a measurement, not an analogy.

**Architecture defended:** JEPA predictor → next-season 14-d vector directly; latent state = tower
outputs, not the contrastive embedding; season timescale only in Phase 1. Contrastive head auxiliary.
**Text worth / cheapest experiment:** Text is most valuable to the world model as *context*, not as a
tower: PBP narrative describes role and scheme changes that stats reveal late. Cheapest prove: text
rollup as an additional JEPA *context* input (not a tower), on/off ablation on Fold 2 forecast MAE.
**Weakest link + first change:** Embedding-as-target. First change: retarget the JEPA head to the
observed next-season vector before any Phase 2 doc is finalized.

VERDICT: PASS — reframe right; it gives JEPA a real target — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §4
VERDICT: FAIL — JEPA target as contrastive embedding; target the observed next-season vector instead — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §4

## Seat 7 — Time-series forecasting lead (modelled)

**On the reframe:** Right, and the brief's expanding-window design is genuinely good — Fold 1 ≤2021 /
val 2022-23, Fold 2 ≤2023 / val 2024-25, frozen 2025-26 test, purge gap, new-player slice. That is the
strongest part of the whole program and should be frozen before anything else moves. But the forecast
framing is still naive in one respect: player careers are not a generic multivariate series. They have
age curves, regime changes (team, coach, injury, role), and a hard right-censoring problem (players exit
the league; the model must predict exit, not just stats conditional on staying).

**Sharpest critiques:**
1. Carry-forward is necessary but not sufficient as a baseline. The baseline set must include: (a)
   carry-forward, (b) age-curve (pooled aging curve per archetype, fit on train only), (c) a shrinkage
   estimator (regress each player's stats toward their archetype mean, with shrinkage strength fit on
   train). A neural forecast that cannot beat (c) has learned nothing a 1970s statistician could not do.
   The brief names carry-forward and "stats-only baselines" but never names shrinkage — the baseline
   most likely to embarrass the neural model.
2. The purge/embargo gap is stated but not sized. Adjacent-season positives crossing a fold boundary is
   one leak; a subtler one is *player identity* crossing folds (the same player's earlier seasons in
   train, later seasons in val is the point of forecasting, but their *career aggregates* — career
   averages, honors totals — leak future information if computed over the full career rather than
   train-period-only). The brief's 70 context columns include career columns; every career column must
   be recomputed as of the forecast origin or it is leakage, not signal.
3. Era handling is the undecided question that most affects the metric. Raw stats across 30 seasons mix
   pace, rule, and style regimes; era-normalized stats remove regime but the map-back step reintroduces
   era-forecast error (you must forecast the era too). The brief must decide and, whichever way, report
   both raw and era-normalized MAE so the choice cannot hide error.

**Architecture defended:** Forecast head with explicit age and regime features; horizon 1 season;
per-stat MAE primary, with a separate exit/attrition prediction (does the player have a next season at
all?) as a required companion metric — a model that predicts great stats for players who retire is
wrong in the way that matters most.
**Text worth / cheapest experiment:** Text's forecasting value, if any, is early regime-change signal
(role/scheme change described before stats show it). Cheapest kill: text rollup features tested
specifically on the role-change subset of Fold 2 (players whose team or minutes changed materially).
If text does not help exactly there, it helps nowhere that matters.
**Weakest link + first change:** Career-column leakage + missing shrinkage baseline. First change:
audit every context column for forecast-origin computation, and add the shrinkage baseline to the
frozen set.

VERDICT: PASS — reframe right; expanding-window design is the program's strongest asset — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §3
VERDICT: BLOCKED — any forecast claim using career context columns until forecast-origin computation is audited — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §2, §3

## Seat 8 — Sports-analytics modelling lead (modelled)

**On the reframe:** Right, and it matches how front offices actually think: nobody pays for "who is
similar"; they pay for "what will he produce, and what could change it." But the brief's stat language
is too thin for a front-office forecast. The 14-d game vector is per-100, z-scored within season. A
forecast of per-100 rates without minutes, availability, and role is not a forecast of production — it
is a forecast of efficiency conditional on playing. The most important forecast quantities (games,
minutes, usage, team context) are partly in the missing context columns and partly unmentioned.

**Sharpest critiques:**
1. The target is incomplete. The 14-d vector has no minutes, games played, or availability. A player
   whose per-100 stays flat but whose minutes halve has declined; a model forecasting only rates will
   call him stable. Either expand the target (minutes, games, usage as explicit forecast quantities)
   or state plainly that this is a rates-only forecast with a named blind spot. Do not let the 14-d
   vector silently stand in for "overall stats."
2. Shot coordinates are correctly identified as the key prize, but the brief overstates what later
   seasons give: shot location exists for recent seasons only, so the shot-position tower creates a
   *coverage cliff* — rich features for recent players, absent for historical ones. A forecast model
   trained with a tower that exists only post-2013 (tracking era) or post-shot-chart era will learn
   era as a feature. The tower needs an explicit missingness design (mask + era indicator), not just
   collection.
3. The twin products are not just a "nice aspect" to preserve — they are the program's distribution.
   Atlas, Daily Court, Twin Explainer, Twenty Questions are where users meet the model. A forecast
   program that lets the twin products rot while it chases MAE will ship a better model nobody opens.
   The twin floor must include a *product* check (do the live surfaces still work and still delight),
   not only a metric.

**Architecture defended:** Rates + availability forecast: 14-d rates plus minutes/games/usage heads,
team-change and role-change flags as inputs, shot-zone features with explicit missingness handling.
Horizon: 1 season. Weighting: all 14 equal for the headline, with minutes-weighted production (rate ×
minutes) reported alongside, because production is what teams pay for.
**Text worth / cheapest experiment:** PBP text's sports value is role and scheme language (pick-and-roll
frequency, spot-up vs creation mix) — but that is structured data wearing prose clothing. Cheapest
kill: structured play-type rollups first (Seat 3's point, endorsed); text only if it beats structured
rollups on the role-change subset.
**Weakest link + first change:** Rates-only target without availability. First change: add minutes /
games / usage to the forecast target definition, or explicitly scope the program as rates-only.

VERDICT: PASS — reframe right, but the 14-d target understates "overall stats" — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §1, §4
VERDICT: BLOCKED — shot-position tower design until its coverage cliff has a missingness plan — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §2

## Seat 9 — Embedding / retrieval lead (modelled)

**On the reframe:** Right, and it rescues the text program from a category error: the brief was judging
text embeddings by twin recovery (0.074 vs 0.4 bar), which measures whether generic text space matches
stat space — a test generic embeddings were never going to pass. Under forecasting, the question becomes
empirical and fair: does text reduce next-season MAE? But the staged counter-proposal still has a hole:
it never states the text *unit of retrieval*. Per-player-season pooled rollups destroy the event-level
structure that makes PBP text informative (sequence, matchup, lineup context). Pooling is a choice with
a cost, and the brief treats it as free.

**Sharpest critiques:**
1. Truncated SVD vs Matryoshka is a solved argument being relitigated: native Matryoshka (EmbeddingGemma
   768→128, measured ~99% retention here) dominates post-hoc SVD on frozen embeddings, because SVD
   directions are fit to the corpus, not to the task, and must be refit as the corpus grows. Keep SVD
   only as the baseline the brief already assigns it — but do not let the SVD step survive into the
   production path by inertia.
2. The name-masked ablation is necessary but insufficient. PBP text leaks identity through more than
   names: distinctive play styles, team schemes, and era phrasing all identify players. A name-masked
   ablation that still passes may be passing on style-as-identity. The stronger guard is the
   new-player slice: text must help players the model has never seen, where identity memorization is
   impossible.
3. The embedding choice itself is under-specified. EmbeddingGemma-300M is defended on local-CPU grounds,
   but the brief never compares it against the workspace's existing all-MiniLM-L6-v2 384-d fusion baseline
   on the same forecast task. A new embedder that cannot beat the incumbent embedder on the actual task
   is churn, not progress. Run both, same protocol, same folds.

**Architecture defended:** Text as a pooled rollup first (cheap), with event-level retrieval (per-game
or per-play-type rollups) as a second stage only if pooled rollups show signal. Embedding: Gemma vs
MiniLM head-to-head on Fold 2 forecast MAE, winner takes the tower.
**Text worth / cheapest experiment:** Unknown, honestly priced. Cheapest kill: Gemma rollup + MiniLM
rollup, each bolted onto the frozen simple MLP, Fold 2 only, new-player subset reported separately.
Two runs, one decision.
**Weakest link + first change:** No embedder comparison, no retrieval unit. First change: define the
text unit (player-season pooled rollup) and run the Gemma-vs-MiniLM head-to-head before any alignment
work.

VERDICT: PASS — reframe right; it replaces an unfair text test with a fair one — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §5
VERDICT: BLOCKED — any text-tower design until Gemma vs incumbent MiniLM is run on the same folds — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §5

## Seat 10 — Causal-inference / attribution specialist (modelled)

**On the reframe:** Right, and it makes the attribution prototype (Builder B) the most important product
in the program — but only if attribution means what it claims. A forecast attribution that lists "the
features that moved the prediction" is not causal; it is a sensitivity report. The brief's rubric says
"causal proof" for the prototypes without ever defining what would count as proof. In a forecast setting,
the honest causal claims are narrow: team changes, role changes, and injuries are quasi-experiments
(players who changed teams vs matched players who did not); most of what a tower ablation shows is
association, and the prototype must say so.

**Sharpest critiques:**
1. The prototype competition's "causal proof" criterion is undefined and therefore ungradeable. Define
   it now: a prototype earns "causal proof" only if it shows a counterfactual (same player, one input
   changed, forecast moved by X) AND a matched comparison (similar players without the change moved
   less). Anything less is labelled "associational" in the product, not "causal."
2. The forecast program's biggest causal trap is team context. A player's stats are co-produced by
   teammates, scheme, and minutes. A model that attributes all of a forecast to the player will
   systematically over-credit stars on good teams and under-credit role players. Team-context features
   (teammate quality, pace, scheme) belong in the forecast inputs, and the attribution prototype must
   show team vs player decomposition, or it will mislead exactly where it claims to explain.
3. The steerable future explorer (Builder A) is a causal product wearing a demo costume. Steering a
   latent ("more threes") and watching a forecast move is only meaningful if the steering corresponds
   to a realizable intervention. Some steers are realizable (shot diet, minutes, team); some are not
   (age, height, era). The explorer must restrict steers to realizable interventions and label the
   rest as illustrative, or users will read fantasy as forecast.

**Architecture defended:** Forecast head with team-context inputs and a matched-comparison attribution
method (counterfactual steer + matched cohort), not feature-importance lists. Horizon: 1 season.
**Text worth / cheapest experiment:** Text's causal value is near zero and its associational value is
real — PBP narrative often *describes* the role change rather than causing the forecast. Cheapest
kill: test text on the role-change subset with team-change controlled; if text's lift vanishes once
team change is in the model, text was proxying for team, not adding signal.
**Weakest link + first change:** Undefined "causal proof." First change: write the causal-proof
definition (counterfactual + matched comparison) into the prototype rubric before either prototype
is judged.

VERDICT: PASS — reframe right; it makes attribution a real product instead of a twin garnish — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §4
VERDICT: BLOCKED — any prototype claiming "causal proof" until the rubric defines it — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §4

## Seat 11 — Eval & metrics lead (modelled)

**On the reframe:** Right, and the brief's evaluation design is the best thing in it — but it is
incomplete in exactly the places where forecast programs usually cheat. The expanding windows, purge
gap, frozen 2025-26 test, and new-player slice are all correct. What is missing is: (a) a metric
hierarchy (one headline, named secondary metrics, named diagnostics — so no one can cherry-pick after
the fact); (b) uncertainty on every number (491 test rows is small; per-stat MAE differences of a few
percent are noise unless confidence intervals are reported); (c) a pre-registered decision rule (what
MAE improvement over carry-forward counts as "beats," decided before the runs, not after).

**Sharpest critiques:**
1. No metric hierarchy. The brief names MAE/R², twin metrics, future-twins, and per-stat breakdowns
   without ranking them. After the first runs, someone will pick whichever metric flatters the model.
   Freeze: headline = mean per-stat MAE on frozen 2025-26 (and Fold 2 val during development);
   secondary = new-player-slice MAE + minutes-weighted production MAE; diagnostics = twin floor,
   future-twins, per-stat R². No other metric may promote a model.
2. No uncertainty quantification. With 491 test rows and ~83 new players per season, small MAE deltas
   are within noise. Every reported comparison needs a paired bootstrap interval (same players, both
   models) — otherwise the program will "discover" wins that are sampling variation, and the promotion
   gate will certify noise.
3. The refit rule is honest but creates a reporting trap: a model refit on ≤2024 "makes NO honest claim
   on seasons it trained on," yet the live product will serve exactly those seasons' descendants. The
   brief must state what is reported for the refit model (its CV estimate, with the caveat attached)
   and forbid reporting refit-model training-fold metrics as performance.

**Architecture defended:** Any architecture, judged by the frozen hierarchy. Horizon: 1 season primary.
Weighting: headline = mean over all 14 stats (equal), with scoring stats as a named secondary — the
choice must be pre-registered, and the brief currently leaves it "proposed," which is the same as
undecided at the moment it matters most.
**Text worth / cheapest experiment:** The cheapest text experiment is only cheap if its decision rule
is pre-registered: text tower ships iff Fold 2 mean MAE improves by more than the bootstrap interval
around zero. Without that rule, the experiment will be argued about, not decided.
**Weakest link + first change:** No pre-registered metric hierarchy or decision rule. First change:
freeze the hierarchy + the "beats carry-forward" threshold + bootstrap reporting before any model runs.

VERDICT: PASS — reframe right; eval design is the program's strongest asset, but undecided at the decision points — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §3
VERDICT: BLOCKED — any promotion claim until the metric hierarchy and decision threshold are frozen — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §3, §4

## Seat 12 — Production-ML / data-platform lead (modelled)

**On the reframe:** Right, and it is the only framing with a shippable artifact: a forecast service that
refits yearly and serves next-season lines. But the brief describes a research program, not a production
system, and the gap between them is where this program will stall: no serving story, no data versioning
story for PBP at scale, no contract between the forecast model and the twin products that consume it.

**Sharpest critiques:**
1. No interface contract. The twin products (Atlas, Daily Court, Twin Explainer, Twenty Questions) run
   on a 64-d embedding with a known schema. The forecast model produces 14-d stat lines. What is the
   contract between them — does the forecast model also emit an embedding, does it consume one, or do
   they run side by side with separate schemas? Until that is written, integration (Lane 06) cannot
   start, and the "twin floor" is untestable because the two systems share no interface.
2. Data versioning is assumed, not designed. The 73-column base is reproducible from a tracked cache
   (788 files, exit-0 rebuild, hash-verified) — that is the gold standard, and the PBP collection must
   meet it: immutable versioned snapshots, per-season manifests, rebuild-from-cache verification. A
   PBP corpus fetched ad hoc from a laptop is not a dataset; it is a rumor. The collection runbook
   (Seat 4) and the versioning contract must land together.
3. The 143-column question is a platform question, not a modelling question. If 143 requires gamelog
   files that do not exist on the primary VM, then either the build moves to the machine that has them
   or the target is 73. A program that trains on 73 while designing for 143 will drift: feature order,
   masks, and manifests will diverge between the two chains (the rebuild report already shows the
   family-map discrepancy — 9 families in the base manifest vs 17 towers). Pin the chain that the
   platform can actually build, or move the build.

**Architecture defended:** Side-by-side services with a written contract: forecast service (14-d lines +
uncertainty) and twin service (64-d space), sharing the player-season key (player_id, season) and the
versioned cache. Horizon: 1 season. The forecast service ships only when its CV estimate beats
carry-forward by the frozen threshold (Seat 11).
**Text worth / cheapest experiment:** From a platform view, the text tower is the most expensive
component (corpus size, embedding compute, versioning) for the least proven return. Cheapest kill:
the Fold 2 on/off ablation (Seats 1, 9) — and if it fails, delete the tower from the platform roadmap
entirely rather than carrying it as a "future" line item.
**Weakest link + first change:** No interface contract between forecast and twin systems. First
change: write the one-page contract (keys, schemas, versioning, rollback trigger) before any
integration work.

VERDICT: PASS — reframe right; it yields a shippable service where twins yield a demo — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §4
VERDICT: BLOCKED — integration work until the forecast↔twin interface contract exists — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §6

---

## Synthesis

**Where the panel agrees (do not re-litigate these):**
1. The prediction-first reframe is RIGHT — 12 of 12 seats, with conditions. Twins are preserved as
   product surface and diagnostic, not deleted. The old twin-metric promotion gate is dead; the forecast
   gate (beat carry-forward + stats baselines on held-out folds) replaces it.
2. The expanding-window evaluation design (Fold 1 ≤2021/val 2022-23, Fold 2 ≤2023/val 2024-25, frozen
   2025-26 test of 491 rows, purge gap, new-player slice) is the program's strongest asset. Freeze it.
3. Carry-forward alone is not a sufficient baseline set. The frozen set must add an age-curve baseline
   and a shrinkage estimator (Seat 7), plus the simple 73-column MLP (Seat 1). A neural forecast that
   cannot beat shrinkage has learned nothing.
4. The text tower is UNPROVEN and must earn its place with one cheap, pre-registered experiment
   (frozen Gemma rollup + simple MLP, Fold 2 on/off ablation, new-player subset reported separately).
   SVD is a baseline only; native Matryoshka dominates post-hoc SVD. Structured PBP rollups come
   before text embedding (Seats 3, 8).
5. The data gap got worse under the reframe, not better: forecast needs transitions (adjacent-season
   pairs, role/team change, shot trajectory), and that signal lives in the missing 70 context columns
   and the uncollected game logs / PBP. Collection routing, sizing, versioning, and stall detection
   are the critical path — not modelling.

**Where the panel disagrees (kept open, not averaged):**
1. **JEPA target:** Seat 6 (and Seat 2) say predict the observed next-season 14-d vector; the brief's
   Phase 2 says predict the contrastive embedding of the true next season. This is the deepest
   architectural disagreement. The panel leans to Seat 6: an embedding target caps forecast accuracy at
   the embedding's information content.
2. **Unified loss timing:** Seats 2 and 5 warn the bridge and learned weights are premature and may
   starve the auxiliary head (weight floor needed, or separate phases). Seat 12 wants the interface
   contract first. Nobody defends writing the Phase 2 doc before Phase 1 baselines exist.
3. **What "overall stats" means:** Seat 8 says the 14-d rates vector without minutes/games/usage is not
   production — it is efficiency conditional on playing. Seat 11 says the headline must be pre-registered
   (mean over 14, equal) with minutes-weighted production as secondary. Both can be true: expand the
   target or explicitly scope rates-only.
4. **Era handling:** Seat 2 and Seat 7 favor era-normalized-then-map-back; no seat defends raw
   prediction strongly, but the map-back step's own error is unquantified. Report both raw and
   normalized MAE until decided.
5. **Text's best role:** tower (brief) vs JEPA context input (Seat 6) vs redundant-after-structured-PBP
   (Seats 3, 8). The cheap experiment adjudicates: run it as a tower first, since that is the brief's
   claim; context-input is the fallback if the tower fails but role-change-subset signal exists.

**Top 3 risks, in order, with falsifiable checks:**
1. **Forecast never beats shrinkage/carry-forward** — the whole program's premise fails. Check: frozen
   baseline set (carry-forward, age-curve, shrinkage, 73-col MLP) run on Fold 2 before any tower/JEPA/
   text work. If the MLP does not beat shrinkage, stop and redesign, do not add machinery.
2. **Career-column leakage + era confounding** — the model looks good in CV and is wrong in production.
   Check: audit every context column for forecast-origin computation; report raw and era-normalized
   MAE side by side; new-player slice reported separately on every run.
3. **Collection stalls or never versions** — the 143 chain and the shot-position tower stay blocked
   while modelling proceeds on an orphaned 73. Check: collection runbook + per-season gap report +
   corpus-size/CPU-throughput measurement on existing PBP games, all before bulk fetch. If the
   runbook cannot name a machine, a schedule, and a stall alarm, collection has not started.

## Ordered recommendations

**Build/change first, in order:**
1. Freeze the evaluation contract: metric hierarchy (headline = mean per-stat MAE on frozen test;
   secondary = new-player MAE + minutes-weighted production; diagnostics = twin floor, per-stat R²),
   baseline set (carry-forward, age-curve, shrinkage, 73-col MLP), decision threshold ("beats" =
   improvement beyond the paired bootstrap interval), and reporting rules (refit model reports CV
   estimate only, never training-fold metrics). No model runs before this.
2. Run the v5 forecast audit: does the existing nNextProfile=14 head beat carry-forward and shrinkage
   on Fold 2? This is the cheapest possible forecast result — the head already exists — and it sets
   the bar every new model must clear.
3. Land the collection runbook + gap report: per-season coverage for game logs, shot coordinates, PBP;
   machine + schedule + size estimate + stall alarm + versioning contract. Measure PBP template count
   and Gemma CPU throughput on existing games before any bulk plan.
4. Define the transition dataset: adjacent-season pairs with change features (Δminutes, Δusage,
   Δshot diet, team change), forecast-miss taxonomy, and the career-column leakage audit. This is the
   dataset the forecast program actually trains on.
5. Run the single cheap text experiment: frozen Gemma rollup (+ MiniLM head-to-head, same protocol)
   bolted onto the simple MLP, Fold 2 on/off ablation, new-player subset separate, decision rule
   pre-registered. Kill or keep the tower on that result alone. Structured PBP rollups precede any
   text-alignment work.
6. Write the forecast↔twin interface contract (keys, schemas, versioning, twin-floor number with
   rollback trigger, causal-proof definition for the prototypes) — then, and only then, reframe the
   prototype competition (A = steerable future explorer with realizable steers only; B = forecast
   attribution with counterfactual + matched comparison, associational results labelled as such).
7. Phase 2 unified-loss design LAST, after Phase 1 baselines exist — and retargeted: JEPA predicts the
   observed next-season vector; the contrastive head is auxiliary with a weight floor; hierarchy
   claims measured per-prefix (forecast error and twin recovery separately) before they are asserted.

**Explicitly NOT do:**
- Do not train, merge, or touch live serving files on the basis of this review. Design only.
- Do not let the program wait on the 143-column chain; the first forecast trains on the verified 73,
  and context families earn their way in by forecast lift.
- Do not use SVD as the production text-reduction path; it is a baseline only. Native Matryoshka or a
  task-aligned projection replaces it.
- Do not claim "causal" for any attribution that is only a sensitivity report; label associational
  results as associational.
- Do not report refit-model training-fold metrics as performance, and do not promote any model on a
  metric outside the frozen hierarchy.
- Do not synthesize, proxy-fill, or bootstrap-fill missing game logs, shot coordinates, or PBP. Real
  data only; a gap stays a gap until collected.
- Do not let Pixel Replay/Live sprite positions enter training data under any framing.

## Open questions that genuinely need the user's call (at most 3)

1. **Forecast target + weighting:** Is the headline 1-season-ahead, all-14-stats-equal (with scoring
   highlighted and minutes-weighted production as secondary) — or do you want scoring stats weighted
   above the rest in the headline itself, and do minutes/games/usage join the target as forecast
   quantities rather than staying a named blind spot?
2. **Era handling:** Predict era-normalized stats and map back, or predict raw stats directly? The
   panel leans normalized-then-map-back, but the map-back error is unquantified and the choice changes
   what "beats carry-forward" means.
3. **Prototype competition:** Proceed reframed now (A = steerable future explorer, B = forecast
   attribution, both judged on forecast with the causal-proof definition above) — or pause the
   competition until the Phase 1 forecast baseline exists so the prototypes have a real forecast to
   explain and steer?

## Addendum — user vision, 2026-10-26 22:35 CDT (sourced to the MEMORY.md note; NOT in the brief)

The user's stated "main thing": hierarchical JEPA world models predicting future stats AND player
locations, doing as much as possible with advanced models on Vector Hoops — "bring the NBA to life
with neural networks." Two surfaces, one hierarchy: coarse → future season stats; fine → in-game
player locations (real tracking / shot / PBP data). Render direction: predicted locations render
THROUGH Pixel sprites; sprites never train the model.

**Panel judgment (coordinator synthesis of the seated lenses, applied to this vision):**
- This vision STRENGTHENS the hierarchy case versus the brief's version — and the panel should say
  so plainly. Seat 6's objection was that season-stats and game-stats do not separate into clean
  levels. Season stats vs in-game locations DO separate: different timescales, different data
  modalities, different eval metrics. If the hierarchy is going to earn its machinery anywhere, it
  is here, not in coarse-vs-fine stat prefixes.
- But it is a SECOND program track, not a free extension of the stats track. The brief documents
  tracking aggregates (2013-14+) and shot coordinates (later seasons, uncollected) — it documents
  NO continuous player-location trajectory dataset at scale, and PBP gives discrete events, not
  trajectories. Whether a location-prediction target is even trainable from real data on hand is
  UNVERIFIED from the brief and needs its own inventory (what location data exists, at what
  coverage, on which machine) before any location design doc is written.
- The render direction is consistent with the hard sprite rule and resolves the pixel-game loop
  cleanly: world model predicts locations → sprites render them → sprites never enter training.
  No panel seat objects to this direction; it is the correct way around.
- Eval splits: a location model needs its own metric (e.g., displacement error on held-out
  possessions/games) and must NOT be promoted on stats MAE, nor the stats model on location error.
  Two tracks, two gates, one hierarchy claim that must be proven per level.
- Sequencing (panel consensus): stats forecast first — it is the reframe this review judged, and
  its baselines already exist. Location prediction enters as a Phase 3 design track, gated on the
  location-data inventory. Building both tracks at once doubles the collection critical path
  (Seat 4's warning) while the stats track has not yet beaten shrinkage (Seat 7's check).

**Effect on the 3 open questions:** none added, none removed. Ruling on Question 1 (target) should
additionally state whether location prediction is in scope for Phase 2 or deferred to Phase 3 —
that scoping sentence is the only new decision the vision requires at this stage.

VERDICT: PASS — hierarchy centrality strengthened by the stats-vs-locations level split — ~/workspace/mlops-v2-drafts/PANEL_REVIEW.md (Addendum)
VERDICT: BLOCKED — any location-prediction design until a real location-data inventory exists — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §2
VERDICT: PASS — render-through-sprites direction preserves the hard sprite rule — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §2

## Addendum II — H-JEPA centrality and the two-surface hierarchy (brief addendum, user 2026-10-26 22:35 CDT)

**The addendum, in the user's words:** "the main thing is going to be hierarchical JEPA world models
for predicting future stats and player locations, so we can do as much with these advanced models as
possible on Vector Hoops and bring the NBA to life with neural networks." The panel was asked to weigh
in on: (1) H-JEPA as the CENTRAL architecture, (2) two prediction surfaces under one hierarchy
(coarse → future season stats; fine → player locations within games, from real tracking aggregates,
shot coordinates, and play-by-play), with predicted locations rendering THROUGH Pixel Replay/Live
sprites — sprites RENDER predictions, never TRAIN the model (the sprite rule stands), and (3) how far
this goes on real data only (ghost mode, coach mode, Live "what happens next") plus the first
falsifiable demo for the location level.

### (1) H-JEPA centrality: justified as a destination, NOT as a build order — dissent recorded

The panel's position is split, and the split is about timing, not about the idea:

- **For centrality as the target architecture (Seats 6, 2-conditional, 8):** the two-surface version
  repairs the exact weakness Seat 6 named in the main review. H-JEPA's gains were weak where
  timescales do not separate; season stats vs in-game locations DO separate — different timescales,
  different data, different metrics. A hierarchy with one level that predicts a season and another
  that predicts a possession is a hierarchy with a reason to exist. Seat 8 adds that the fine level
  is where the product value lives: ghost mode and coach mode are not demos of a stats model, they
  are demos of a world model.
- **DISSENT — centrality as a build commitment is premature (Seats 1, 3, 4, 7):** Seat 1: the
  simplest loop first — a stats forecast that beats shrinkage — before any hierarchy is built;
  centrality as vision is fine, centrality as the first build is over-commitment before Phase 1
  baselines exist. Seat 3: an architecture cannot be central when its fine level has no data engine
  yet — there is no inventoried location-trajectory dataset in the brief (see below). Seat 4: two
  tracks double the loop economics and the collection critical path while the stats track has not
  cleared its first check. Seat 7: the fine level is a different forecasting problem (spatial event
  prediction), not an extension of season forecasting — centralizing both under one hierarchy
  before either is measured risks conflating their metrics and their failures.
- **Coordinator ruling on the disagreement:** H-JEPA is adopted as the CENTRAL *target* architecture
  and explicitly NOT as the first build. Build order stays: stats forecast baselines → location-data
  inventory → location demo → hierarchy integration only if both levels clear their gates. Any doc
  that presents H-JEPA centrality as "build the hierarchy now" misstates the panel's position.

VERDICT: PASS — H-JEPA as central target architecture, with real level separation — ~/workspace/mlops-v2-drafts/PANEL_REVIEW.md (Addendum II)
VERDICT: FAIL — H-JEPA centrality as immediate build order, before Phase 1 baselines exist — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §4

### (2) Two prediction surfaces under one hierarchy — what each level actually predicts

| Level | Predicts | Data basis (brief-documented) | Metric | Gate |
|---|---|---|---|---|
| Coarse | Next-season 14-d game vector (+ minutes/games/usage if Q1 rules so) | Verified 73-col base; 143-col context pending | Per-stat MAE/R² vs carry-forward + shrinkage | Frozen hierarchy, Seat 11 |
| Fine | Locations WITHIN games — see granularity note | Tracking aggregates 2013-14+, shot coordinates (later seasons, UNCOLLECTED), PBP events (thin cache) | Location error in feet vs baselines (demo spec below) | Location demo must clear its threshold before any hierarchy work |

**Granularity note — the fine level's hardest truth, stated plainly:** the brief documents tracking
*aggregates* (drives, paint touches, speed, distances) and shot *coordinates*, but NO continuous
per-frame player-location trajectories at scale. Aggregates are not trajectories, and PBP gives
discrete events, not paths. Therefore "predict player locations" is only well-defined at EVENT
granularity on brief-documented data: the location of the next shot, the next scoring event, or the
next play-type event — not continuous 10-player paths. Full trajectory prediction is UNVERIFIED as
feasible and must NOT be promised: it requires a trajectory source that the location-data inventory
has not found. If that inventory finds one, the fine level upgrades; until then, the fine level is
an event-location predictor, and ghost mode renders predicted EVENT locations (and, where actual
replay data exists, predicted-vs-actual event overlays) — not invented continuous motion. Rendering
predicted locations through sprites is consistent with the sprite rule in exactly one direction:
model → sprites. Any flow in the other direction (sprite positions → training inputs) remains banned,
and rendered predictions must be visually labelled as predictions, never presented as actual replays.

**What the hierarchy claim must prove, per level (Seat 6's condition, now testable):** the coarse
level must beat the stats baselines, AND the fine level must beat the location baselines, AND the
joint hierarchy must beat at least one level's separate baseline without regressing the other. A
hierarchy that wins only because one level carries it is not a hierarchy result.

VERDICT: PASS — two-surface hierarchy is well-formed, with genuinely separated levels — ~/workspace/mlops-v2-drafts/PANEL_REVIEW.md (Addendum II)
VERDICT: BLOCKED — continuous-trajectory prediction claims until a trajectory source is inventoried — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §2

### (3) Ambition on real data only — the ladder, in order, with what each rung needs

1. **Next-shot location prediction (first, feasible on brief-documented data once collected):**
   shot coordinates exist for later seasons; the demo spec below covers this rung. No new data
   modality required beyond the already-directed shot-coordinate collection.
2. **Next-event location + play type:** PBP events + shot coordinates + tracking aggregates predict
   where the next event happens and what it is. Needs the PBP collection to land at scale.
3. **Ghost mode (possession overlay):** predicted event locations vs actual event locations for a
   possession, rendered through sprites, labelled predicted-vs-actual. Needs rungs 1–2 cleared;
   renders events, not invented paths.
4. **Coach mode (counterfactual steers):** "what if the defense switches / the star sits" — predicted
   location distributions under a scheme change. Associational unless backed by matched comparisons
   (Seat 10's rule); steers restricted to realizable interventions (scheme, minutes, lineup), never
   age, height, or era. Needs rung 2 + a matched-cohort design.
5. **Live "what happens next":** LAST. Needs a live PBP feed, latency budget, and a proven batch
   demo first. Nothing in the brief documents a live feed or a latency target, so this rung is
   UNVERIFIED as feasible and must not be scheduled until rungs 1–3 clear.

**What real-data-only forbids at every rung:** synthetic trajectories, sprite positions as inputs,
interpolated "plausible" paths presented as predictions, and any location claim for pre-tracking-era
seasons where the data does not exist. A gap stays a gap until collected (Seat 12's rule).

### (4) First falsifiable demo — next-possession location prediction (spec, pre-registered)

**Task:** given a possession's real context up to event t (PBP events so far, tracking aggregates,
shot coordinates of prior shots, score/clock/lineup from PBP), predict the location of the NEXT shot
in that possession (x, y in feet, court coordinates), or predict "no shot this possession" as a
separate outcome head. If a possession ends without a shot, it counts in the no-shot head, not as a
location miss.

**Data scope:** location-era seasons ONLY (tracking 2013-14+; shot-chart coverage per the
collection inventory). The brief's 1996-97…2025-26 expanding windows do NOT apply to the fine
level — its folds are defined inside the location era (proposed: train ≤2021 / val 2022-23 /
frozen test 2024-25 or 2025-26 depending on collected coverage; exact seasons set by the inventory,
pre-registered before running).

**Baselines (all must be beaten, paired bootstrap intervals, same possessions):** (a) last-shot
location carry-forward; (b) team-mean shot location; (c) league-mean shot location by play type.
**Metric:** mean Euclidean error in feet on held-out possessions, reported overall AND by zone
(paint / mid-range / three) AND by play type — a model that wins overall by nailing paint shots
while failing threes has not proven the level. **Pre-registered success rule (proposed, needs the
user's threshold confirmation):** beat the best baseline's mean error by more than the bootstrap
interval on the frozen test AND on the new-player subset (players unseen in train — location
prediction must generalize to new players, not memorize shooters' favorite spots). **Kill rule:**
if the model does not beat carry-forward on the frozen test, the fine level stops — no hierarchy
work, no ghost mode — until a better location model or better location data exists. **Honesty
labels:** the demo page shows predicted vs actual shot spots side by side, predicted spots marked
as predictions, error in feet printed on the page, baselines printed alongside. A demo without
baselines on the page is not a demo, it is a trailer.

**Seats' dissent on the demo, kept:** Seat 7 notes next-shot location is the EASIEST location task
(shots cluster in known zones) and passing it proves less than passing next-event location for all
event types — accept the demo as rung 1, not as proof of the whole fine level. Seat 9 notes PBP
text may help the fine level (play-type language predicts where action goes) but only as context,
tested by ablation after the no-text demo clears. Seat 1 insists the demo run on the SIMPLEST
model first (gradient-boosted or small MLP on structured features) before any JEPA machinery
touches locations.

VERDICT: PASS — first falsifiable demo specified: next-shot location, error in feet, baselines + kill rule — ~/workspace/mlops-v2-drafts/PANEL_REVIEW.md (Addendum II)
VERDICT: BLOCKED — ghost/coach/Live claims until the rung-1 demo clears its pre-registered threshold — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §4

VERDICT: PASS — panel review complete: 12 seats, disagreements kept, synthesis + ordered recommendations delivered — ~/workspace/mlops-v2-drafts/PANEL_REVIEW.md
VERDICT: BLOCKED — any reframe ratification, training run, or production change until the user rules on the 3 open questions — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §4

---

## Addendum III — Model portfolio, integration architecture, story surfaces, spec outline (brief §9, user 2026-10-26 22:35–22:37 CDT)

**Basis:** brief §9 only, plus Round 1's standing verdicts above. **Scope boundary, stated so nothing is
redone:** Addendum II already settled H-JEPA centrality (central *target*, NOT first build), the
ambition ladder (next-shot → next-event → ghost → coach → Live last), the event-granularity limit
(no continuous trajectories on brief-documented data), and the pre-registered rung-1 demo
(next-shot location, error in feet, baselines + kill rule). Those verdicts STAND and are not
re-litigated here. What §9's expanded charge additionally demands — and what this addendum alone
delivers — is: (a) the model portfolio in build order, (b) the integration architecture, (c) the story
surfaces past and present with their grounding mechanism, (d) the spec outline the build team executes
against. Seats 1–4 remain channelled lenses (modelled perspectives, NOT messages from the real people
named); seats 5–12 remain role-based modelled experts. Design review only — no training, no prod
writes, no merges. Execution stops at the training / merge / production gates, which still require
the user's separate word (brief §9 says so explicitly; this addendum does not soften it).

### (1) Model portfolio — what to build, in build order, what each owns, what is cut

Build order is Round 1's order, now with named models and owners. A model does not start until the
model before it clears its gate, except where a track is marked parallel. "Owns" means: this model is
the single owner of that output; no other model re-computes it.

| # | Model | Owns | Builds on | Gate to next |
|---|---|---|---|---|
| M0 | v5 twin service (EXISTS, frozen) | 64-d twin space for Atlas, Daily Court, Twin Explainer, Twenty Questions | — | Twin floor: archetype-neighborhood preservation (Seat 5's metric, not hit@10 alone) + product check (Seat 8: surfaces still work and delight) |
| M1 | Baseline ladder (carry-forward, age-curve, shrinkage, 73-col MLP) | The bar every forecast must beat | Verified 73-col base | Frozen eval contract (SPEC-0); MLP must beat shrinkage on Fold 2 or the program stops and redesigns (Round 1 risk #1) |
| M2 | Forecast model v1 (tower MLP; JEPA predictor retargeted to the observed next-season vector per Seat 6) | Next-season 14-d game vector (+ minutes/games/usage IF Round 1 Q1 rules so; era handling per Q2) | M1 bar + transition dataset (SPEC-2) | Beats carry-forward + shrinkage by more than the paired bootstrap interval on Fold 2 AND frozen 2025-26; new-player slice reported separately |
| M3 | Structured PBP + shot-position feature builders (NOT neural models: deterministic builders with validation gates) | Per-player-season structured rollups (play types, shot zones, creation/lineup context) + shot-zone features with explicit missingness design (mask + era indicator for the coverage cliff, Seat 8) | Game-log / PBP / shot-coordinate collection (SPEC-2 runbook) | Each feature family earns its way into M2 by forecast lift, family by family (Seat 1's rule for the 143 chain, applied here too) |
| M4 | Text tower (CONDITIONAL, killable) | Pooled per-player-season text rollup (EmbeddingGemma, Matryoshka 128; MiniLM head-to-head, Seat 9) as ONE tower input to M2; Stage 2 alignment (contrastive text↔stat projection) ONLY if Stage 1 passes | M1 bar + template-dedup measurement (Seat 4: corpus size + CPU throughput on existing PBP games first) | Pre-registered Fold 2 on/off ablation: ships iff mean MAE improves beyond the bootstrap interval around zero, new-player subset separate; else DELETED from the roadmap, not carried as "future" (Seat 12) |
| M5 | Location event predictor (simplest model first: boosted trees / small MLP on structured features — Seat 1's rule — before any JEPA machinery) | Next-shot location (rung 1, Addendum II demo spec), then next-event location + play type (rung 2) | M3 builders + location-era folds (inside 2013-14+, NOT the 30-season windows) | Addendum II demo rule: beat best baseline (carry-forward / team-mean / league-mean-by-play-type) by more than the bootstrap interval on frozen test AND new-player subset, or the fine level STOPS (kill rule) |
| M6 | Contrastive twin head v2 (auxiliary) | Twin diagnostic under the forecast program: archetype neighborhoods + "who did this player used to play like, and what happened to them next?" as a forecast prior (Seat 5) | M2's stem, with a WEIGHT FLOOR (Seat 5: learned weights would starve it) and positives redefined as same-player adjacent seasons | Twin floor number + rollback trigger in the interface contract (SPEC-7); fails → M0 stays the serving twin space, M6 does not ship |
| M7 | H-JEPA hierarchy integration (LAST) | The joint claim: coarse (M2) + fine (M5) levels under one hierarchy, with per-level non-regression | M2 gate AND M5 gate BOTH cleared (see open question 3 for the one dissent on this conjunction) | Joint hierarchy must beat at least one level's separate baseline WITHOUT regressing the other (Addendum II condition); hierarchy claims measured per-prefix (forecast error and twin recovery separately, Seat 5) before asserted |

**What is CUT from the portfolio (explicit, so it cannot creep back as a "future" line item):**
- Continuous-trajectory prediction (10-player paths) — no trajectory source is inventoried; blocked
  until the location inventory finds one (Addendum II verdict stands).
- The original Phase 2 unified loss as specified (JEPA target = contrastive embedding of the true next
  season) — retargeted per Seats 2 and 6: JEPA predicts the observed next-season vector; the
  contrastive head is auxiliary with a weight floor. The bridge, if it survives at all, is a
  regularizer, not the primary target.
- Post-hoc truncated SVD as a production text path — baseline only (Round 1 verdict stands);
  native Matryoshka or the task-aligned projection replaces it.
- A free-form "story generator" model — stories are assembled from the event ledger (§3), not
  generated. No model in this portfolio invents narrative.
- Live "what happens next" as a build item — rung 5, unscheduled until rungs 1–3 clear AND a live
  feed + latency budget are documented (Addendum II verdict stands).
- Any model that trains on the 143-column chain before a scratch build verifies it (Round 1
  BLOCKED verdict stands); context families enter M2 by forecast lift only.

**Dissent on the portfolio, kept:** Seat 2 would cut M6's separate existence and fold the contrastive
term into M2 as a small regularizer, arguing a standalone auxiliary head invites weight politics;
Seat 5 replies that without a separately gated head, the twin diagnostic dies quietly — the panel
keeps M6 as a separately gated head with a floor, and records Seat 2's objection. Seat 7 would add
an explicit exit/attrition model (does the player have a next season at all?) as M2b, arguing a
rates forecast for a retired player is wrong in the way that matters most; the panel agrees it is
required as a companion metric and leaves its build order to SPEC-3 (as a head of M2 or a sibling
model, decided at spec time, not here).

VERDICT: PASS — portfolio ordered M0→M7 with gates, consistent with Round 1 order — ~/workspace/mlops-v2-drafts/PANEL_REVIEW.md (Addendum III)
VERDICT: FAIL — any portfolio that starts with M7, continuous trajectories, or the embedding-target bridge — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §4, §9

### (2) Integration architecture — how the models connect, and to what

**First principle (Seat 12's rule, extended): models do not call models. They share data through
versioned artifacts.** Every integration in this program is a contract over an artifact with a
manifest, not a runtime dependency between model services. That is what makes the twin floor testable,
the forecast rollback possible, and the story ledger honest.

**The data plane (the actual integration surface):**
- `cache/` (versioned, immutable snapshots, per-season manifests, rebuild-from-cache verification —
  the 73-col rebuild's exit-0 + hash-verified standard, applied to every new corpus including PBP).
  Nothing fetched ad hoc from a laptop is a dataset; it is a rumor (Seat 12).
- `transition dataset` (adjacent-season pairs + change features + forecast-miss taxonomy, SPEC-2):
  the single training artifact for M1/M2. Career columns recomputed as of forecast origin — the
  leakage audit (Seat 7) is a gate on this artifact, not a note in a doc.
- `event store` (game_id, event_num, real PBP events + shot coordinates + tracking aggregates,
  each row carrying its source and collection version): the single artifact for M3/M5 AND for the
  story surfaces (§3). The event store is read-only to story rendering; stories never write back
  into training data (no feedback loop from rendered predictions into the corpus).
- `text corpus` (template-deduplicated PBP text + bio text kept SEPARATE and labelled — bio text is
  not PBP text, Seat 1): the single artifact for M4, with its size and CPU-throughput measurement
  (Seat 4) as a gate before any bulk embedding.

**The service plane (side-by-side services, one contract):**
- **Forecast service** (M1/M2): serves next-season 14-d lines (+ minutes/games/usage if Q1 rules so)
  WITH uncertainty (paired bootstrap intervals) and provenance (model version, training folds,
  eval-contract version). It does NOT serve embeddings.
- **Twin service** (M0, later M6 if gated): serves the 64-d space for Atlas, Daily Court,
  Twin Explainer, Twenty Questions. It does NOT serve forecasts. The two services share only the
  player-season key (player_id, season) and the versioned cache — that shared key IS the interface
  (Seat 12's contract, now written as SPEC-7).
- **Location service** (M5): serves event-location predictions as DISTRIBUTIONS (predicted spot +
  error radius in feet + baseline comparison), never as bare points. Every location response carries
  its baselines and its "predicted, not actual" label — the demo page's honesty rule, generalized
  to the service.
- **Story service** (§3): read-only over the event store + forecast-service outputs + twin-service
  neighborhoods. It assembles stories; it predicts nothing itself. Its only model-adjacent input is
  versioned forecast snapshots (for hindsight overlays), each labelled with the forecast origin.
- **Hierarchy service** (M7, LAST): the ONLY cross-service integration allowed to be a model rather
  than a contract — and only after M2 and M5 clear their gates. Its interface is the shared stem +
  per-level outputs; it must satisfy the non-regression condition (Addendum II) or it does not ship,
  and M2/M5 keep serving separately.

**Data flow, end to end:** raw sources → versioned cache (SPEC-2 runbook: machine, schedule, size,
stall alarm) → validated build (73 base; 143 families by lift) → transition dataset → M1 ladder →
M2 forecast → forecast service → {Daily Court forecast lines, Twenty Questions "what's next" hints,
story hindsight overlays}; and in parallel: game logs / PBP / shot coordinates → event store →
M3 builders → {M2 lift features, M5 location model} → location service → {Pixel Replay/Live ghost
overlays, story possession renderings}; and: twin service (M0/M6) → {Atlas, Daily Court twins,
Twin Explainer, Twenty Questions, story era-bridges}. Text corpus → M4 → M2 (conditional, killable).

**Where the twin space survives as a component (asked explicitly by §9):** three places, and only
three. (1) Product: M0 keeps serving the four twin surfaces untouched until M6 clears the floor.
(2) Diagnostic: archetype neighborhoods answer "who did this player used to play like, and what
happened to them next?" — a forecast prior, not garnish (Seat 5). (3) Auxiliary regularizer: M6's
contrastive head with a weight floor, positives = same-player adjacent seasons. What the twin space
does NOT survive as: the JEPA primary target (Seat 6's ruling stands), the promotion headline
(Round 1 ruling stands), or the story surfaces' source of truth (§3's ledger is).

**Rollback and degradation (Seats 4, 11, 12):** the interface contract (SPEC-7) names two rollback
triggers, both automatic in design: (a) forecast service degrades on the live season beyond its
bootstrap interval vs carry-forward → roll back to the previous forecast version, twin products
unaffected (services are side-by-side, so a forecast rollback cannot break Atlas); (b) twin floor
breached (archetype-neighborhood preservation below threshold) → M6 reverts to M0 serving, forecast
service unaffected. A rollback that takes down the other service is a contract violation, not bad luck.

**Dissent on integration, kept:** Seat 6 argues the side-by-side contract, while safe, concedes the
hierarchy's deepest claim — that one latent serves both levels — and that M7 should therefore be
allowed a shared-latent interface from the start, gated only on its own non-regression test, rather
than forced through side-by-side services first. The panel keeps side-by-side as the SHIPPING
architecture and treats the shared latent as M7's internal design (to be judged by the non-regression
condition), not as a reason to couple the shipping services early. Seat 10 adds that coach-mode
steers (rung 4) must pass through the story service's labelling rules (realizable interventions
only, associational results labelled) even when served from the location service — integration must
not launder an associational steer into a causal claim by changing services.

VERDICT: PASS — side-by-side services over versioned artifacts, twin space surviving in exactly 3 roles — ~/workspace/mlops-v2-drafts/PANEL_REVIEW.md (Addendum III)
VERDICT: BLOCKED — any integration that couples forecast and twin serving, or lets stories write back into training data — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §6, §9

### (3) Story surfaces — past AND present, from real data only

**The three surfaces (§9's charge), each with its grounding and its feasibility judgment:**

**S1 — Career-arc narration (PAST + PRESENT, feasible FIRST, on the 73 base).** The story of a
player's career told season by season: role changes, breakouts, declines, team moves, and what the
forecast model expected vs what happened. Present-tense version: an ongoing arc for a current player,
updated as the season progresses from versioned forecast snapshots, each update disclosing its
revision ("on Nov 1 the model said X; on Dec 1, with new data, it says Y"). Grounding: every
narrative claim resolves to a (player_id, season) row in the validated build or a versioned forecast
snapshot. Forecast statements carry horizon + uncertainty; association is labelled association.
Feasibility: HIGH — needs M2 (for forecast-vs-actual) but the descriptive arc (stats + role + team
changes) is buildable on M1 + the 73 base today.

**S2 — Era-bridging possessions ("why a 2009 possession feels like one today").** Two real
possessions, one from each era, shown side by side: same play type, similar event-location pattern,
similar archetype neighborhoods — with the era differences (pace, rules, spacing) disclosed, not
smoothed over. Grounding: BOTH possessions are real PBP event sequences with game_ids and event
numbers; similarity is SHOWN (play-type match, location-pattern match, twin-neighborhood overlap),
never asserted in prose alone. A bridge that cannot show both event sequences side by side does not
render. Feasibility: MEDIUM — needs M5 rung 2 (next-event location + play type) for the location
pattern match; the play-type + archetype version is feasible earlier, and must be labelled as the
partial version it is until rung 2 clears.

**S3 — Classic-game stories (PAST, from what actually happened on the floor).** A game's story
assembled from its REAL PBP event sequence, in order — the events are the story's spine, and
nothing is inserted between them. Two overlays are permitted, both labelled: (a) the forecast
hindsight overlay — "at the end of Q3, the model (from pre-game state only) would have predicted
X" — computed strictly from pre-game inputs, so no future leakage hides inside a hindsight claim;
(b) predicted-vs-actual event overlays from M5 (rung 3 ghost mode), with predicted spots visually
distinct from actual spots. Sprites act the story out: real events rendered as actual replays,
predicted overlays rendered as predictions. Feasibility: MEDIUM-HIGH for the event spine (replay
files exist; the event store generalizes them); the hindsight overlay waits on M2; the ghost overlay
waits on M5 rung 1–2.

**The grounding mechanism (the panel's core deliverable for stories — judge this, not the vibes):**
the **event ledger**. Every story element — a sentence, a stat line, a sprite sequence, a forecast
claim — carries a pointer: (game_id, event_num) for events, (player_id, season) for stats,
(model version, forecast origin, input snapshot) for predictions. The renderer resolves every
pointer before rendering; **an unresolvable pointer refuses that element (fail-loud, never fill-in)**.
Narrative text is constrained assembly over the ledger: sentence templates with slots filled from
ledger values ("In {season}, {player} moved from {team_a} to {team_b} and his {stat} went from
{x} to {y}"), NOT free-form prose generation. A story's footer prints its provenance: sources,
model versions, and a predicted-vs-actual legend. An automated assertion validates every stat line
in a rendered story against the validated build before publication; a mismatch blocks publication.
Pre-tracking-era stories carry NO location claims (the gap is labelled, not papered over with
"plausible" locations). Present-tense stories (ongoing arcs) carry a revision history, not a
silent edit.

**Feasibility judgment, overall:** stories are feasible WITHOUT any new generative model — that is
the point. What is NOT feasible honestly, and must not be promised: a "model memory" that narrates
freely (free-form generation over a latent is ungrounded by construction); stories about possessions
or games with no event-store coverage; location narration for eras without location data; and any
story that explains WHY a career turned (causal narration) beyond Seat 10's matched-comparison
standard — career stories describe what happened and what was forecast, and label causal claims as
associational unless a matched comparison backs them.

**Dissent on stories, kept:** Seat 10 insists S1's career narration will read as causal ("he declined
because of the trade") unless every causal-sounding sentence is either backed by a matched comparison
or reworded to association — the panel adopts this as a rendering rule, not a suggestion. Seat 9
notes S2's similarity needs a stated retrieval unit (possession-level event sequence, not pooled
season text) and that the twin-neighborhood bridge is a weak retrieval signal on its own — S2 must
show play-type + location match, not twin similarity alone. Seat 1 insists S1 ship from structured
data before any model narration is attempted: the descriptive arc first, forecast-vs-actual second,
and no "model memory" language in the product until the ledger version ships. The panel agrees with
all three dissents and folds them into the rules above.

VERDICT: PASS — story surfaces feasible via the event ledger, constrained assembly, fail-loud pointers — ~/workspace/mlops-v2-drafts/PANEL_REVIEW.md (Addendum III)
VERDICT: FAIL — free-form "model memory" narration, invented possessions, or unlabelled hindsight as story sources — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §9
VERDICT: BLOCKED — S2 location-pattern bridges and S3 ghost overlays until M5 rungs 1–2 clear — ~/workspace/mlops-v2-drafts/PANEL_REVIEW.md (Addendum II)

### (4) Spec outline — what the build team executes against, in the user's sequence

Sequence per §9: brief → panel weighs in → specs → execute end to end, stopping at the training /
merge / production gates (user's word). Each spec below is a separate doc with an evidence contract:
a spec is DONE when its evidence exists, not when its prose reads well. Specs are written in order;
a spec's gate is the next spec's entry condition. No spec authorizes training, merging, or serving.

| Spec | Title (owner lane) | Evidence contract (what "done" means) | Gate / kill rule |
|---|---|---|---|
| SPEC-0 | Evaluation contract (Lane 05) | Frozen metric hierarchy (headline = mean per-stat MAE on frozen 2025-26; secondary = new-player MAE + minutes-weighted production; diagnostics = twin floor, per-stat R²); frozen baseline set (carry-forward, age-curve, shrinkage, 73-col MLP); "beats" = improvement beyond paired bootstrap interval; refit reporting rule (CV estimate only) | No model runs before SPEC-0 is frozen. Any promotion claim outside the hierarchy is void. |
| SPEC-1 | Baseline ladder (Lane 04) | M1 runs on Fold 2 with all four baselines, paired bootstrap intervals, new-player slice separate | MLP does not beat shrinkage → STOP, redesign, do not add machinery (Round 1 risk #1). |
| SPEC-2 | Collection runbook + transition dataset (Lanes 01, 02, 07) | Per-season gap report (game logs, shot coords, PBP); machine + schedule + size estimate + stall alarm + versioning contract; corpus-size + CPU-throughput measurement on existing PBP games; adjacent-season pairs + change features + miss taxonomy + career-column leakage audit | Runbook cannot name machine/schedule/stall alarm → collection has not started; no bulk fetch. Leakage audit fails → no forecast claim on context columns. |
| SPEC-3 | Forecast model v1 (Lane 04) | M2 with retargeted JEPA head (observed next-season vector); target definition per Round 1 Q1 ruling (minutes/games/usage in or out, stated); era handling per Q2 ruling; exit/attrition companion (head or sibling, Seat 7) | Must beat SPEC-1 bar on Fold 2 AND frozen test, or it does not serve. |
| SPEC-4 | Structured PBP + shot tower (Lane 07) | M3 builders with validation gates; missingness design (mask + era indicator) for the coverage cliff; per-family forecast-lift table | A family with no forecast lift does not enter M2. |
| SPEC-5 | Text experiment (Lanes 01, 04) | Frozen Gemma rollup + MiniLM head-to-head, same protocol, Fold 2 on/off ablation, new-player subset separate, decision rule pre-registered (SPEC-0) | Fails the rule → tower DELETED from roadmap (not "future"). Passes → Stage 2 alignment spec, separately gated. |
| SPEC-6 | Location demo (Lane 08, fine track) | M5 rung-1 demo per Addendum II spec (next-shot location, error in feet, 3 baselines on the page, zone + play-type breakdowns, new-player subset) | Kill rule (Addendum II): does not beat carry-forward on frozen test → fine level stops, no hierarchy work. |
| SPEC-7 | Interface contract + product integration (Lane 06) | One-page contract: keys (player_id, season) / (game_id, event_num), schemas, versioning, twin-floor number + rollback triggers (both services), causal-proof definition (counterfactual + matched comparison), realizable-steers-only rule for the explorer | No integration work before SPEC-7; prototype competition reframed (A = future explorer, B = forecast attribution) only after SPEC-7, per Round 1 Q3's ruling path. |
| SPEC-8 | Story ledger + story surfaces (new, Lane 06 + product) | Event-ledger schema + renderer fail-loud rule + template library + provenance footer + stat-line assertion gate; S1 shipped first (descriptive arc, then forecast-vs-actual); S2/S3 gated on M5 rungs as §3 states | Any story element with an unresolvable pointer does not render. Any stat mismatch blocks publication. |
| SPEC-9 | Hierarchy integration (Lane 08, LAST) | M7 with shared-stem design + per-prefix measurements (forecast error and twin recovery separately) + non-regression proof (beats ≥1 level's separate baseline, regresses neither) | Either level's gate uncleared → SPEC-9 does not start. Non-regression fails → M2/M5 keep serving separately; hierarchy does not ship. |

**Spec-writing rules (binding on the build team):** every spec states its inputs by artifact + version
(never "the data"), its outputs by schema, its evidence contract, and its kill rule. A spec that
cannot state its kill rule is not ready for execution. Specs do not re-open Round 1's frozen
decisions (expanding windows, purge gap, sprite rule, real-data-only) — they implement them.

### (5) Per-seat verdicts on Addendum III (compact; full reasoning in Round 1 + Addenda I–II)

| Seat | Verdict on portfolio / integration / stories | Sharpest critique |
|---|---|---|
| 1 Howard | PASS, conditional on M1-first | Portfolio is right only if M1 truly gates everything; any spec that lets M2/M5 start before SPEC-1 clears is the old complexity in new clothes. |
| 2 Ilya | PASS, with the bridge objection carried | M7 as LAST is the only honest hierarchy order; the retargeted JEPA head (observed vector, not embedding) must survive spec-writing — watch SPEC-3 for bridge language creeping back. |
| 3 Karpathy | PASS, conditional on SPEC-2 first | The transition dataset + miss taxonomy is the portfolio's real product; M4 before M3 is still backwards, and SPEC-5's ordering (structured first) must hold. |
| 4 Straubel | PASS, conditional on SPEC-2 runbook | Side-by-side services are operable; but the collection path still has no named owner in any spec — SPEC-2 must name a machine, a schedule, and a human owner, or it is a wish. |
| 5 Contrastive | PASS, with weight-floor condition | M6's separate gate + weight floor is the minimum for twin survival; SPEC-7's floor number must be a number, not "preserve neighborhoods" prose. |
| 6 JEPA/world-model | PASS, with target condition | Portfolio repairs the target error; but M5's "simplest first" rule must not become an excuse to never attempt a learned location model — SPEC-6's kill rule cuts both ways. |
| 7 Forecasting | PASS, with exit-model condition | M2 without the exit/attrition companion understates "overall stats"; SPEC-3 must settle head-vs-sibling, not defer it. |
| 8 Sports-analytics | PASS, with missingness condition | M3's coverage-cliff design is the portfolio's most underrated item; a shot tower without mask + era indicator will learn era as a feature and corrupt M2. |
| 9 Embedding/retrieval | PASS, with retrieval-unit condition | S2 needs a possession-level retrieval unit stated in SPEC-8; pooled-season similarity must not stand in for possession similarity. |
| 10 Causal/attribution | PASS, with labelling condition | The ledger is necessary but not sufficient: S1/S3 causal-sounding sentences need the matched-comparison rule IN the renderer, not in a style guide nobody enforces. |
| 11 Eval/metrics | PASS, with hierarchy condition | SPEC-0 is the portfolio's keystone; if the hierarchy or the "beats" threshold slips during spec-writing, every later gate is negotiable and therefore worthless. |
| 12 Production-ML | PASS, with contract condition | Side-by-side + rollback triggers is shippable; but SPEC-7 must be written before SPEC-3 serves anything, or integration will be retrofitted — the exact failure mode this spec exists to prevent. |

### (6) Ordered recommendations, explicitly NOT do, and open questions

**Ordered recommendations (Addendum III only; Round 1's ordered list stands alongside):**
1. Write SPEC-0 first, this week in program terms: frozen hierarchy + baseline set + "beats" threshold.
   Nothing else unblocks without it.
2. Write SPEC-2 (runbook + gap report + transition dataset) second: it is the critical path for M2,
   M3, M5, and S2/S3 alike, and it is the only spec whose delay blocks four models at once.
3. Write SPEC-7 (interface contract) third, BEFORE SPEC-3 serves anything: the contract is cheap
   to write now and ruinous to retrofit later.
4. Execute SPEC-1 → SPEC-3 (stats track) while SPEC-2's collection runs in parallel; the stats
   track must not wait on collection beyond the 73 base.
5. Execute SPEC-6 (location demo) as its own track with its own folds; do not merge its metrics,
   schedule, or success criteria with the stats track.
6. Write SPEC-8 (story ledger) with S1 first: the descriptive arc ships on structured data before
   any forecast overlay, so stories deliver value even if M2 slips.
7. Write SPEC-9 LAST, only on cleared M2 + M5 gates, with the non-regression proof as its evidence
   contract — and be prepared, honestly, for SPEC-9 to conclude the hierarchy does not earn its
   machinery. That is a successful spec outcome, not a failure.

**Explicitly NOT do (Addendum III additions to Round 1's list):**
- Do not build a continuous-trajectory model, a free-form story generator, or a Live service on
  this plan. All three are cut or unscheduled above; resurrecting any of them requires new evidence
  (a trajectory source, a grounding proof, a live feed + latency budget), not enthusiasm.
- Do not couple forecast and twin serving, do not let stories write back into training data, and do
  not let the hierarchy's shared latent become an excuse to skip per-level gates.
- Do not present predicted locations or hindsight forecasts as actual events — visually, verbally,
  or by omission. Every predicted element is labelled predicted, on the page, in the product.
- Do not let SPEC-9 start on one cleared gate: the conjunction (M2 AND M5) is the rule, unless
  the user rules otherwise on open question 3.
- Do not treat this addendum as ratification, training authorization, or a merge/production decision.
  Design review only; the user's ruling on Round 1 Q1–Q3 plus the 3 questions below still gates
  execution.

**Open questions that genuinely need the user's call (Addendum III: at most 3; Round 1's Q1–Q3
remain standing and are NOT restated here):**
1. **Story narration risk tolerance:** templated-only narration over the ledger (panel's
   recommendation — fully grounded, limited voice) vs constrained generation with ledger
   verification (richer voice, with an automated assertion gate before publication)? The panel
   leans templated-only for v1; a generation step, even verified, is a new failure mode.
2. **Portfolio cuts, confirmed:** do you confirm cutting continuous-trajectory prediction and
   deferring Live "what happens next" out of the build plan until new evidence (trajectory source;
   live feed + latency budget) exists — or do you want either kept as an explicitly funded
   investigation track alongside the build?
3. **Hierarchy trigger:** must SPEC-9 wait for BOTH M2 and M5 gates (panel's recommendation), or
   may hierarchy design start once M2 alone clears, with M5 integrated when it lands?

VERDICT: PASS — Addendum III complete: portfolio M0→M7, side-by-side integration, ledger-grounded stories, SPEC-0→SPEC-9 outline — ~/workspace/mlops-v2-drafts/PANEL_REVIEW.md (Addendum III)
VERDICT: BLOCKED — spec execution past SPEC-0, any training run, merge, or production change until the user rules on Round 1 Q1–Q3 and Addendum III Q1–Q3 — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §9

---

## Addendum III-A — User override: the joint model as the CENTRAL build; the Muon optimizer (user, 2026-10-26 22:39 CDT)

**Governance, stated first because it decides everything below:** panel advice does not overrule the
user. Round 1 and Addendum III recommended baselines-first with the joint hierarchy LAST (M7). The
user has pushed back: he still holds that the ORIGINAL state-of-the-art model — the JOINT loss with
the contrastive model and the JEPA model TRAINING TOGETHER — is the real key, not just a long-term
target. The joint model is therefore adopted here as the CENTRAL BUILD of the portfolio. This section
supersedes Addendum III §(1)'s ordering (M2 → M6 → M7-last) and §(4)'s SPEC-9 role where it says so
explicitly, and nothing else. What does NOT change under any reading of this override: training
remains gated (this is a portfolio decision, NOT training authorization); SPEC-0's frozen eval
contract, the expanding windows, the purge gap, and the new-player slice; the real-data-only rule;
the sprite rule; the twin floor as a serving gate; the career-column leakage audit; the rung-1
location demo and its kill rule; the event-ledger grounding for stories. The override moves the
joint model to the center — it does not waive a single check.

### (a) Joint-from-the-start: is it defensible, and what de-risks it

**Panel answer: YES, defensible — but only in one specific form: joint-first with CONCURRENT
controls, not joint-instead-of-baselines.** The indefensible version would be "train the joint model
first and let the baselines catch up later," because then no one can tell whether the joint machinery
earned anything or merely accompanied a win the simple model would have had anyway (Round 1 risk #1,
unchanged). The defensible version keeps every Round 1 baseline — it just runs them CONCURRENTLY
rather than SEQUENTIALLY: the M1 ladder (carry-forward, age-curve, shrinkage, 73-col MLP) runs on
the identical folds and protocol, in parallel with the joint build, and the joint model must beat
that bar at pre-registered checkpoints to CONTINUE. Baselines-first was a sequencing rule; the
override replaces sequencing with concurrency, and the bar itself is never waived. That is the whole
trick, and the rest of this section is its machinery.

**The central build, renamed for clarity: MJ (joint model).** One shared tower stem; two heads live
from step 0: (i) the JEPA/forecast head, PRIMARY, predicting the observed next-season vector
(see bridge note below); (ii) the contrastive twin head, AUXILIARY, with a WEIGHT FLOOR (Seat 5's
condition, now load-bearing rather than optional — learned uncertainty weights would otherwise
starve the harder twin task). Matryoshka prefixes double as hierarchy levels (coarse = invariant
structure, fine = dynamics), measured per-prefix at every checkpoint. Text (M4) enters MJ only as
an ablation ARM, never as a default component: MJ-with-text vs MJ-without-text, decided by the
SPEC-5 rule.

**De-risk package — the seven mechanisms that make joint-first honest:**
1. **Concurrent controls + continuation gates (replaces the sequential gate).** Checkpoints at Fold 1
   val, Fold 2 val, and frozen 2025-26. Continuation rule, pre-registered in SPEC-0's amendment:
   MJ continues iff it beats shrinkage AND carry-forward by more than the paired bootstrap interval
   at that checkpoint. Miss at Fold 1 val → diagnostic pause (inspect arms, do not add machinery).
   Miss at Fold 2 val → MJ stops as the serving candidate and falls back (mechanism 5); it may
   continue only as a research track with the miss on the record.
2. **Ablation arms INSIDE the joint build — Phase 1 baselines preserved as controls, not phases.**
   Every MJ result is reported alongside, on identical folds: MJ-full (both heads); MJ-minus-
   contrastive (forecast head only); MJ-minus-JEPA (contrastive only, for the twin diagnostic);
   MJ-frozen-stem (heads only, testing whether the stem or the heads earn the win); and the M1
   ladder itself. A joint win that does not beat its own MJ-minus-contrastive arm is not a joint
   win — it is a forecast win wearing joint clothes. This is how "baselines as controls" survives
   inside a joint-first program.
3. **Gradient-conflict instrumentation + pre-registered stop/rebalance rule.** Per-step logging of
   gradient cosine between heads (the Phase 2 interference monitor), per-head loss curves, and
   per-prefix forecast error AND twin recovery separately. Rule: if head-gradient cosine stays
   negative for a pre-registered run of steps, trigger PCGrad projection; if conflict persists
   after projection + weight-floor enforcement, trigger the head-freeze diagnostic (freeze one
   head, measure the other's recovery) before any loss-weight hand-tuning. Hand-tuned weights
   without a logged trigger are forbidden — that is how joint models get tuned to the val set.
4. **Bridge direction — the one element the override does NOT automatically carry over.** The
   ORIGINAL Phase 2 bridge (JEPA target = contrastive embedding of the true next season) was ruled
   conceptually backwards in Round 1 (Seats 2, 6): an embedding target caps forecast accuracy at
   the embedding's information content. The user's override adopts joint CENTRALITY; it does not
   explicitly re-adopt the embedding target. This addendum therefore keeps the corrected bridge:
   JEPA predicts the OBSERVED next-season vector (primary); the contrastive head regularizes and
   serves the twin diagnostic; "predictive positives" (JEPA predictions as extra contrastive
   positives) survive as an auxiliary mechanism only. If the user wants the embedding-target bridge
   restored, that is a separate explicit ruling — see open question 1. Panel recommendation:
   observed-vector primary.
5. **Fallbacks, named before they are needed.** (i) MJ misses the Fold 2 bar → best single-head
   arm (MJ-minus-contrastive) becomes the serving candidate; MJ continues as research only.
   (ii) Twin floor breached → twin service stays on frozen M0; MJ's contrastive head does not
   ship, forecast serving unaffected (side-by-side services, Addendum III §(2)). (iii) Sustained
   gradient conflict → head-freeze diagnostic, then (if unresolved) separate-heads serving
   (M2 + M6 side by side) as the fallback architecture — the joint claim is abandoned, not papered
   over. Every fallback keeps a serving path open; none requires re-architecting under pressure.
6. **Hierarchy claim evaluated continuously, not at M7-last.** Under joint-first, the hierarchy IS
   MJ's prefix structure, so per-prefix checks (forecast error + twin recovery separately) run at
   every checkpoint. The hierarchy earns its claim incrementally: coarse prefixes must behave
   invariantly (twin recovery) and fine prefixes dynamically (forecast error) — if they do not,
   the hierarchy synthesis is decoration and SPEC-9's proof obligation fails even if MJ's headline
   MAE looks good.
7. **Fine track unchanged.** M5 (location event predictor) runs in parallel with its own folds,
   baselines, and kill rule (Addendum II demo spec). Joint-first on the season track does not
   accelerate, delay, or waive the fine track; the full two-surface hierarchy claim still needs
   BOTH tracks' gates (see open question 3 for the one proposed relaxation, which the panel does
   NOT recommend).

**Revised portfolio order (supersedes Addendum III §(1) where stated):** M0 (frozen twin service)
→ M1 (concurrent controls, not a phase gate) → **MJ (central joint build)** → M3/M4 feeding MJ
arms → M5 (parallel fine track, unchanged) → hierarchy proof as an ONGOING obligation on MJ
(SPEC-9 redefined, below). **Revised spec mapping:** SPEC-3 becomes the JOINT-model spec (stem,
both heads, weight floor, PCGrad protocol, ablation arms, optimizer arms per §(b)); SPEC-9 becomes
the HIERARCHY-EVIDENCE obligation (per-prefix measurements + non-regression proof), not a
separate late build. SPEC-0 (frozen first, amended with continuation gates), SPEC-2 (runbook +
transition dataset), SPEC-7 (interface contract) are unchanged in role.

### (b) Optimizers for joint / multi-head training — including "MoAn"

**Identification — RESOLVED, not asserted by the panel.** The user confirmed (2026-10-26 22:39 CDT,
program record) that "MoAn" = **Muon** (MomentUm Orthogonalized by Newton–Schulz, Jordan et al.,
2024), and corrected the record: it is an OPTIMIZER, not a loss. The panel adopts that identification
on the user's word. Mechanism, search-verified for this section: Muon runs SGD with Nesterov momentum
on weight matrices and replaces each 2D hidden-layer update with its nearest semi-orthogonal matrix
via a 5-step Newton–Schulz iteration; it applies ONLY to 2D parameters, with AdamW as the fallback
for 1D parameters, embeddings, and heads; it keeps 2 optimizer-state copies (weights + momentum)
vs AdamW's 3 (weights + first + second moments); its published wins are LLM-scale speedruns
(NanoGPT ~1.35× vs AdamW) and large-model training. Large-scale adoption claims in the program
record (Moonlight, Kimi K2 with MuonClip, and other frontier runs) are noted but the panel's
judgment below does NOT depend on them — because the transfer question is the whole issue.

**The transfer question, stated bluntly:** every strong Muon result the panel can verify is at
LLM scale (hundreds of millions to billions of parameters, GPU training, huge matrix-dominated
layers). MJ is small tower MLPs on 12,966 rows, CPU-bound, with heterogeneous small matrices and
many 1D/scalar parameters (tower biases, head weights, learned uncertainty scalars). Muon's two
mechanisms that win at LLM scale — memory savings on giant matrices and balanced directions in
huge layers — have little to save or balance here, while its costs (Newton–Schulz iteration per
step, LR sensitivity noted in independent studies, hybrid-group complexity) are paid in full.
Fit to THIS model is therefore UNPROVEN, and Muon must be an ablation, not an adoption on faith.
That is not a slight against Muon; it is the same ladder logic as everything else in this program
(Seat 1): the cheapest thing that works is the default, and the fancier thing earns its place on
the same folds.

**Candidate optimizers for MJ, with what would justify each HERE (not in general):**

| Optimizer | Mechanism in one line | Justified for MJ iff… | Panel stance |
|---|---|---|---|
| AdamW (default) | Per-parameter adaptive moments + decoupled weight decay; robust across heterogeneous scales | Always the default arm: tower/head scale heterogeneity, small CPU model, well-understood tuning | DEFAULT for SPEC-3. Every challenger is measured against it on identical folds. |
| Muon (hybrid: Muon for 2D stem/head matrices, AdamW for 1D/embeddings/heads/uncertainty scalars) | Orthogonalized momentum updates for matrices; balanced singular directions | Beats AdamW beyond the bootstrap interval on Fold 2 forecast MAE, OR matches MAE with a large wall-clock win AND no stability cost (no loss spikes, no LR fragility) | CHALLENGER ARM, not default. Adopt/ablate/skip decided by that arm (see Moonshot verdict). Full-Muon (no AdamW fallback) is NOT entertained — Muon by construction does not apply to 1D params. |
| SOAP / Shampoo | Preconditioned (second-order-ish) updates | Never on this program's evidence: memory + compute cost unjustified on CPU for a 12,966-row model; no published win at this scale | SKIP. Revisit only if MJ scales 100×. |
| Lion | Sign-based momentum, memory-light | Only if memory becomes binding, which it is not on this model; sign updates risk instability under conflicting multi-head gradients | SKIP. |
| Sophia | Hessian-diagonal-aware updates | LLM-scale motivation; no justification at tower-MLP scale, adds a Hessian estimate to tune | SKIP. |
| SGD + momentum (plain) | Single global LR, no adaptivity | Only as a diagnostic arm if AdamW behaves pathologically (it should not); too slow across heterogeneous tower scales | DIAGNOSTIC ONLY, not a contender. |

**Multi-head optimizer mechanics (binding on SPEC-3, whichever optimizer wins):** separate parameter
groups — stem matrices, forecast head, contrastive head, text tower (if the arm runs), and learned
uncertainty scalars (AdamW only, always: scalars are not Muon-eligible and must not be swept into a
matrix group). Per-group learning rates + weight decay (a single LR across heads with different
gradient scales is how joint models silently starve one head). Order of operations per step:
compute per-head gradients → PCGrad projection on conflict → gradient clipping → optimizer step.
Warmup mandatory (Muon especially is LR-sensitive; any Muon arm without warmup + LR sweep is an
invalid arm, not a negative result). Optimizer state is versioned with the model checkpoint —
an MJ result without its optimizer + group config recorded is not reproducible and does not count
toward any gate.

**Dissent on optimizers, kept:** Seat 6 argues the optimizer debate is a distraction from the
target/loss decisions and should consume at most one arm, not a workstream — the panel agrees and
caps it: one Muon arm, one decision, no optimizer search. Seat 4 adds that CPU Newton–Schulz cost
must be measured on the actual tower matrices before the arm is even designed (if NS overhead
dominates step time on small matrices, the arm's wall-clock case collapses before it starts).

### (c) MOONSHOT VERDICT — the joint contrastive+JEPA model in the living-basketball-mind vision

**Moonshot defined (per the program record):** the joint contrastive+JEPA model, trained together
under one loss, inside the H-JEPA living-basketball-mind vision — coarse levels predicting future
season stats, fine levels predicting in-game event locations, stories past and present rendered
through Pixel sprites from real data. The panel judges the moonshot as a PROGRAM, not a single
model: the stats track, the fine track, and the story ledger together.

**VERDICT: CONDITIONAL GO.** The moonshot goes as the central build (MJ), under the de-risk package
in §(a) and the optimizer discipline in §(b). It is NOT an unconditional go: an unconditional go
would waive the baseline bar, the twin floor, and the demo kill rule, and this addendum refuses all
three waivers even under a user override — because the override was about centrality, not about
evidence standards, and the panel's job is to hold the standards while adopting the user's direction.

**Proof capability — what "the moonshot works" would actually consist of (all required, none
sufficient alone):** (1) MJ beats shrinkage + carry-forward beyond the bootstrap interval on Fold 2
AND frozen 2025-26, with ablation arms showing the JOINT structure (not one head) earning part of
the win; (2) twin floor held (archetype neighborhoods + product check) with M0 fallback intact;
(3) per-prefix hierarchy checks pass (coarse = invariant, fine = dynamic, measured separately);
(4) M5 rung-1 demo clears its pre-registered threshold (fine-level claim); (5) at least one
ledger-grounded story surface (S1 descriptive arc minimum) ships with provenance intact. Stats-only
success (1)–(3) without (4)–(5) is a PARTIAL moonshot — a real result, but not the living-basketball-
mind vision, and it must be reported as partial, not as the moonshot landed.

**Kill criteria (any one triggers its stated consequence):** (i) MJ misses the Fold 2 continuation
bar → MJ stops as serving candidate, fallback arm serves ( §(a) mechanism 5); the moonshot's stats
claim is dead until a redesigned MJ clears a fresh Fold 2. (ii) Twin floor breached with no recovery
via weight floor → twin claim dead; M0 serves; moonshot narrows to forecast-only. (iii) Sustained
gradient conflict after PCGrad + floor + head-freeze diagnostic → joint claim dead; separate-heads
serving is the fallback architecture. (iv) M5 demo kill rule triggers → fine-level claim dead;
moonshot narrows to stats + stories-from-stats (S1 only, S2/S3 location overlays removed).
(v) Muon arm destabilizes (spikes, LR fragility) or underperforms AdamW → Muon SKIPPED, no
revisit without new evidence. A killed claim stays killed in reporting: no "moonshot" language for
a narrowed program.

**Muon adopt/ablate/skip (panel verdict): ABLATE.** One hybrid arm (Muon for 2D matrices, AdamW
for the rest) vs AdamW, identical folds/protocol, Fold 2 decision on MAE + wall-clock + stability.
Adopt iff it beats AdamW beyond the bootstrap interval on MAE, or matches MAE with a large
wall-clock win and zero stability cost. Otherwise SKIP — and skipping Muon costs the moonshot
nothing, because the moonshot's claim is about the joint loss and the hierarchy, not about which
optimizer stepped through it.

### (d) Per-seat verdicts on the override (compact)

| Seat | Verdict on joint-first + Muon | Sharpest critique |
|---|---|---|
| 1 Howard | PASS, conditional on concurrent controls | Joint-first is acceptable ONLY with the continuation gates; without them it is complexity-first, and the panel would be laundering the user's enthusiasm into an evidence waiver. |
| 2 Ilya | PASS, with bridge condition | Centrality adopted; but joint-first makes the bridge direction MORE important, not less — an embedding-target joint model would bake the backwards target into the central build. Observed-vector primary or the panel's pass becomes a fail. |
| 3 Karpathy | PASS, conditional on SPEC-2 | Joint-first changes nothing about the data product: transitions + miss taxonomy still gate everything; MJ without SPEC-2 is a joint model of cross-sections, which is the wrong dataset with two heads. |
| 4 Straubel | PASS, conditional on runbook + NS cost measure | Two tracks + joint build triples the loop economics; and the Muon arm needs its CPU NS cost measured before it is designed, not after it disappoints. |
| 5 Contrastive | PASS, weight floor now load-bearing | Under joint-first the floor is not a nicety — without it, learned weights starve the twin head by design, and the "joint" model becomes a forecast model with a decorative head. |
| 6 JEPA/world-model | PASS, target condition | Joint-first is the right home for a world model; but the world model predicts the next STATE (observed vector), and any SPEC-3 draft that reinstates embedding-as-target fails this seat. |
| 7 Forecasting | PASS, with exit-model condition | Continuation gates must be pre-registered NUMBERS (bootstrap intervals), not "MJ looks promising" — joint-first raises the stakes on gate discipline, it does not lower them. |
| 8 Sports-analytics | PASS, missingness condition | Joint-first does not fix the coverage cliff; M3's mask + era design still gates any shot-tower input to MJ, joint or not. |
| 9 Embedding/retrieval | PASS, retrieval-unit condition | Text-as-arm (not default) is the correct joint-first treatment; a text tower default inside MJ would smuggle the weakest component into the central build. |
| 10 Causal/attribution | PASS, labelling condition | Joint-first makes attribution HARDER (two heads, one win — which head earned it?); the ablation arms are therefore not optional extras, they are the attribution method. |
| 11 Eval/metrics | PASS, gate condition | SPEC-0's amendment (continuation gates + arm reporting) is the single most important document in the override; if it slips, joint-first is ungradeable. |
| 12 Production-ML | PASS, contract condition | Side-by-side serving + rollback triggers matter MORE under joint-first, because a joint serving failure now takes down both claims at once unless the contract isolates them. |

### (e) Ordered recommendations (override-adjusted), NOT-do additions, open questions

**Ordered recommendations:** 1. Amend SPEC-0 FIRST (continuation gates + arm-reporting rules +
optimizer-arm rule) — the override's keystone document. 2. Rewrite SPEC-3 as the JOINT-model spec
(stem, both heads, weight floor, PCGrad protocol, ablation arms, AdamW default + one Muon arm).
3. Redefine SPEC-9 as the hierarchy-evidence obligation on MJ (per-prefix checks at every
checkpoint). 4. Keep SPEC-2, SPEC-7, and the M5 demo track exactly on their existing schedules —
the override changes the season track's center, not the data, contract, or fine-track plans.
5. Run the Muon arm ONCE, on Fold 2, and decide it — no optimizer search, no second arm without
new evidence.

**Explicitly NOT do (additions under the override):** Do not use the override to waive the baseline
bar, the twin floor, the demo kill rule, or the leakage audit — centrality is not exemption. Do not
reinstate the embedding-target bridge without an explicit user ruling (open question 1). Do not
adopt Muon on faith, on LLM-scale reputation, or on wall-clock alone without the MAE + stability
conditions. Do not let joint-first collapse the ablation arms: an MJ result reported without its
arms is ungradeable and does not count toward any gate. Do not describe a narrowed program
(stats-only, or forecast-only after a kill trigger) as the moonshot.

**Open questions for the user (Addendum III-A: 3; the identification question is RESOLVED — the
user confirmed MoAn = Muon — and is not asked again):**
1. **Bridge direction under joint-first:** observed-next-season-vector primary (panel
   recommendation, kept from Round 1) vs restoring the original embedding-target bridge (JEPA
   predicts the contrastive embedding of the true next season)? The override adopted joint
   centrality; this question settles whether it also restores the original target.
2. **Continuation-gate form:** concurrent controls with pre-registered checkpoint gates as
   proposed in §(a) (panel recommendation) — or do you want the M1 sequential bar restored as a
   hard pre-gate before MJ training begins, with joint-first applying only after the bar is
   cleared?
3. **Muon arm scope:** hybrid Muon (2D matrices) + AdamW (rest) as the single challenger arm
   (panel recommendation) — or do you want a broader optimizer comparison (e.g., Muon vs AdamW vs
   one additional optimizer) before SPEC-3 is written?

VERDICT: PASS — user override adopted: MJ is the central build, joint-first with concurrent controls, ablation arms, continuation gates, and fallbacks — ~/workspace/mlops-v2-drafts/PANEL_REVIEW.md (Addendum III-A)
VERDICT: PASS — "MoAn" identification resolved as Muon (user-confirmed 2026-10-26 22:39 CDT; mechanism search-verified); Muon verdict is ABLATE, not adopt or skip — ~/workspace/mlops-v2-drafts/PANEL_REVIEW.md (Addendum III-A)
VERDICT: CONDITIONAL GO — moonshot (joint contrastive+JEPA in the living-basketball-mind vision) as central build under the de-risk package; partial success reported as partial — ~/workspace/mlops-v2-drafts/PANEL_REVIEW.md (Addendum III-A)
VERDICT: BLOCKED — any training run, merge, or production change; SPEC-0 amendment and SPEC-3 joint spec must land first, and the user must rule on Addendum III-A Q1–Q3 — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §9

---

## Addendum III-B — Moonshot verdict, standalone (user charge, 2026-10-26 22:40 CDT)

**Charge and relationship to III-A:** the user asked the panel to weigh in on the moonshot idea and
to build it. The moonshot = the joint contrastive + JEPA model trained together under one loss,
inside the H-JEPA living-basketball-mind vision (future stats + player locations + stories past and
present). III-A already gave a conditional-go moonshot verdict in summary form. This section is the
FULL verdict the charge demands: go / no-go argued seat by seat, the single proving capability, the
build order and kill ladder, and the Muon decision for this specific model. It EXPANDS III-A; it
does not reverse it. Where III-A and III-B overlap (conditional go, ABLATE on Muon, kill criteria),
III-B is the binding, more detailed statement. The build track (specs, code, data inventory, eval
harness) proceeds in parallel; this verdict FEEDS spec finalization — any spec draft still assuming
M7-last must be revised to MJ-central (III-A) before it is finalized. Training, merges, and prod
writes remain gated on the user's separate word. Nothing here authorizes them.

### (a) Go / no-go on the moonshot as framed — the strongest cases, seat by seat

**Overall verdict: CONDITIONAL GO — 12 of 12 seats, no hard no-go, with different conditions.**
That unanimity needs one honest qualifier: every seat's "go" is conditional on a gate it names, and
the conditions are not decorative. A moonshot that waived them would not survive this panel. The
disagreement is about WHICH condition is load-bearing, not about whether the moonshot is worth
attempting. The strongest overall case FOR and AGAINST, before the seats:

**Strongest case FOR (the panel's best argument for building it):** this is the first basketball
model in which forecast, similarity, location, and narrative share ONE latent — and each product
gets better because of it. The forecast gains a prior ("who did this player used to play like, and
what happened to them next?"); the twin space gains a future (it stops being a static map and
becomes a trajectory); location prediction gains season context (role, trajectory, shot diet);
stories gain grounding (every narrative element resolves to an event, a season row, or a versioned
forecast). No separate-models program produces that compounding. And unusually for a moonshot, this
one is FALSIFIABLE: the eval contract, the ablation arms, and the kill ladder below turn "did the
moonshot work?" into a checkable question instead of a vibe. A falsifiable moonshot is worth
attempting; an unfalsifiable one is worth declining.

**Strongest case AGAINST (the panel's best argument for declining it as framed):** it stacks FOUR
individually unproven hard problems — a forecast that beats shrinkage, a joint optimization that
does not starve one head, location prediction from a thin event cache, grounded stories without
invention — into ONE program, where the most likely outcome is a good forecast model wearing
moonshot language. The joint/hierarchy machinery could consume the program while the simple model
would have shipped value; the location-data gap is the critical path and sits outside modelling
control (collection routing, not architecture); and "one mind" language will pressure every later
decision toward keeping the moonshot alive past the point where the evidence says narrow it. The
against-case does not say "do not build" — it says the moonshot's enemy is not technical difficulty
but self-deception, and the kill ladder in §(c) is the only defense.

**Seat-by-seat (leaning + strongest FOR + strongest AGAINST + the condition that seat's go depends on):**

| Seat | Leaning | Strongest FOR | Strongest AGAINST | Go depends on |
|---|---|---|---|---|
| 1 Howard | GO-conditional | Forecast is a job and the moonshot gives it products (ghost, coach, stories) users open | Moonshot language invites complexity-first; the ladder must gate or the program ships machinery instead of MAE | M1 continuation gates enforced, no exceptions |
| 2 Ilya | GO-conditional | One representation with coarse invariance + fine time-sensitivity is the RIGHT deep question — the hierarchy finally has a reason to exist | Wrong invariances baked into a central build (embedding-target bridge, unmeasured level separation) would corrupt both tracks at once | Observed-vector target; per-prefix invariance measured, not asserted |
| 3 Karpathy | GO-conditional | The data engine (transitions + event store) IS the moonshot's substrate; get it right and every model benefits | A moonshot without the transition dataset is a demo: joint heads on cross-sections learn smoothing, not development | SPEC-2 (transitions + miss taxonomy) before MJ serves |
| 4 Straubel | GO-conditional | A forecast + location loop can run unattended yearly — the only moonshot shape that survives contact with operations | Collection path is a single point of failure with no owner; two tracks double loop economics while neither has cleared a gate | Named collection owner + schedule + stall alarm (SPEC-2) |
| 5 Contrastive | GO | Twin diagnostic becomes a forecast prior — the moonshot's most underrated compounding | Auxiliary starvation: learned weights will kill the twin head inside a joint build unless the floor is load-bearing | Weight floor + separately gated M6-style diagnostic inside MJ |
| 6 JEPA/world-model | GO | A world model finally has a real job across timescales; event-location prediction is a genuine world-model task | Granularity overclaim: event locations are not trajectories, and a moonshot sold on "player paths" would be fiction | Event-granularity honesty (Addendum II) kept in every product label |
| 7 Forecasting | GO-conditional | Expanding windows + shrinkage bar make the moonshot gradeable — rare, and the reason to attempt it | Era confounding + career-column leakage + exit/attrition could make the moonshot look good in CV and wrong live | Leakage audit + exit companion + raw AND normalized MAE reported |
| 8 Sports-analytics | GO-conditional | Front offices pay for production forecasts + location insight, not similarity — the moonshot matches real demand | Rates-only target understates production; coverage cliff makes the fine level era-biased without a missingness design | Minutes/games/usage ruling (Q1) + mask + era indicator for shot tower |
| 9 Embedding/retrieval | GO-conditional | Retrieval across eras and possessions is the story engine — S2 bridges are impossible without the joint latent | Text tower unproven; pooled rollups destroy the event structure stories need; retrieval unit unstated | Possession-level retrieval unit in SPEC-8; text as arm, not default |
| 10 Causal/attribution | GO-conditional (most skeptical on claims) | Counterfactual steers + matched attribution are the moonshot's most VALUABLE product (coach mode, if honest) | Causal language will outrun evidence: steers and career stories will read as causal when they are associational | Matched-comparison rule IN the renderer; realizable steers only |
| 11 Eval/metrics | GO-conditional | Frozen hierarchy + arms + kill ladder make the moonshot falsifiable — the panel's strongest reason to say go | Without pre-registered gates, moonshot language cherry-picks whichever metric flatters MJ after the fact | SPEC-0 amendment (gates + arm reporting) frozen BEFORE MJ runs |
| 12 Production-ML | GO-conditional | Side-by-side services let the moonshot ship in slices (stats first, locations later, stories on the ledger) without coupling failures | No interface contract yet; a joint serving failure otherwise takes down both claims at once | SPEC-7 contract + rollback triggers before any serving |

**What would flip a seat to NO-GO (recorded so the user can see the tripwires):** Seat 1 flips if
continuation gates are waived for MJ; Seat 2 flips if the embedding-target bridge is restored
without new evidence; Seat 7 flips if the leakage audit is skipped; Seat 10 flips if causal
language ships without the matched-comparison rule; Seat 11 flips if SPEC-0's amendment is not
frozen before MJ runs. These are not hypotheticals — they are the five fastest ways to turn this
conditional go into a no-go, and spec finalization must check each one explicitly.

### (b) What makes it a genuine moonshot vs an incremental model — the single proving capability

An incremental program would produce: a better forecast model, a location demo, and some stories —
each valuable, each explicable without the others. The moonshot claim is stronger and therefore
falsifiable: **ONE trained hierarchy, given only pre-horizon state, beats the separate-models
baselines on BOTH horizons — next-season stats AND next-event locations — AND ablating either
level degrades the other level's metric.** That is the single capability that would prove it.
Unpacked, it has three conjuncts, and all three are required:

1. **Stats horizon:** MJ's forecast head beats shrinkage + carry-forward beyond the bootstrap
   interval on Fold 2 AND frozen 2025-26 (the same bar as any incremental forecast model — the
   moonshot does not get an easier stats bar for being ambitious).
2. **Location horizon:** MJ's fine level (or its M5 track integrated into MJ) beats carry-forward /
   team-mean / league-mean-by-play-type on next-event locations, error in feet, on the location-era
   frozen test AND the new-player subset (the Addendum II demo bar, extended from next-shot to
   next-event).
3. **The jointness proof (the conjunct that separates moonshot from incremental):** MJ beats its
   own separate-head arms (MJ-minus-contrastive on stats; MJ-minus-JEPA-equivalent location model
   on locations) AND ablating the coarse level degrades fine-level error while ablating the fine
   level degrades coarse-level MAE — i.e., the levels HELP each other measurably. If MJ wins both
   horizons but the arms show the levels are independent, the program has two good models sharing a
   stem, not one mind — valuable, incremental, and it must be reported as such. If only the stats
   horizon clears, that is a PARTIAL moonshot (III-A's language, kept): a real result, explicitly
   not the living-basketball-mind vision. If only locations clear, that is a location demo, not a
   moonshot at all.

Why this capability and not a flashier one (ghost mode that "feels alive," a story that "reads
beautifully")? Because feelings are not falsifiable and this program's one structural advantage is
that its moonshot IS falsifiable. Ghost mode and stories are the moonshot's PRODUCTS; the proving
capability is the property those products rest on. A ghost overlay built on a fine level that never
beat carry-forward is a trailer (Addendum II's word, kept). A story built on ungrounded narration is
fiction (Addendum III's rule, kept). The capability above is what lets the products be honest.

### (c) Build order and kill criteria that keep a moonshot honest

**Build order (moonshot framing; III-A's MJ-central order, with the story track made explicit):**
0. SPEC-0 amendment (continuation gates + arm reporting + optimizer-arm rule) — frozen FIRST;
   nothing runs before it. 1. SPEC-2 (collection runbook + gap report + transition dataset +
   leakage audit) — the critical path, in parallel with everything below. 2. MJ stats track
   (SPEC-3 joint spec) with M1 concurrent controls + ablation arms from step 0. 3. M5 fine track
   (SPEC-6 demo) in parallel, own folds, own bar. 4. SPEC-7 interface contract before ANY serving.
   5. SPEC-8 story ledger with S1 first (descriptive arc on structured data, then forecast overlay).
   6. Hierarchy proof as an ongoing obligation (per-prefix checks at every MJ checkpoint), NOT a
   final phase — the jointness proof in §(b) is evaluated continuously, and its failure is
   reportable at any checkpoint, not discovered at the end.

**Kill ladder — which rung failure kills what (read top to bottom; higher rungs kill more):**
- **SPEC-0 not frozen → PROCESS KILL: nothing starts.** A moonshot without pre-registered gates
  is ungradeable by construction; starting MJ first and writing gates later voids every later
  claim, including good ones.
- **MJ misses the Fold 2 stats bar → TOTAL KILL of the moonshot as framed.** The central build
  failed its own bar. What remains is an incremental program (best single-head arm, location demo
  if it clears) reported as such — NOT as a narrowed moonshot. This is the single rung whose
  failure kills the whole framing, because the moonshot's identity is a joint model that forecasts
  better than baselines; without that, there is no moonshot, only components.
- **Jointness proof fails (MJ wins horizons but arms show levels are independent) → TOTAL KILL of
  the "one mind" claim, PARTIAL survival of the models.** The stats and location models may still
  serve separately as incremental wins, but the moonshot as framed — one hierarchy, both horizons,
  levels helping each other — is dead, and must be reported dead, not rebranded as "moonshot v1."
- **M5 rung-1 demo fails (does not beat carry-forward on frozen test) → FINE-LEVEL KILL, moonshot
  NARROWS (does not die).** Ghost, coach, and Live claims die with it; S2 location bridges and S3
  ghost overlays are removed. What survives is the stats-joint + stories-from-stats moonshot,
  labelled narrowed. (Contrast with the stats-bar kill above: the moonshot's center is the joint
  STATS model; locations extend it, they do not anchor it. If the user disagrees with that
  asymmetry, that is the new open question below.)
- **Twin floor breached with no recovery → TWIN-CLAIM KILL, moonshot narrows to forecast-only.**
  M0 keeps serving twin products; MJ's contrastive head does not ship; forecast serving unaffected.
- **Story-ledger failure (unresolvable pointers, stat mismatch) → THAT STORY SURFACE KILLED, not
  the moonshot.** The surface does not render until its ledger resolves. A story program that
  ships ungrounded stories to save the moonshot narrative has failed harder than a story program
  that ships nothing.
- **Muon arm fails → OPTIMIZER CLAIM KILLED ONLY.** Muon adoption dies; MJ continues on AdamW.
  The moonshot verdict does not depend on the optimizer outcome in either direction (§(d)).

**Honesty rule for the ladder (Seat 11's condition, adopted as binding):** every kill or narrowing
is announced in the same place the moonshot was announced (board + review), with the failed gate
named and the narrowed scope stated. A moonshot that quietly narrows while keeping its name is the
exact failure mode the against-case warns about, and the panel treats silent narrowing as a
reporting violation, not a strategy.

### (d) Muon for THIS build — small tower MLPs, 12,966 rows, CPU: adopt / ablate / skip

**Identification (resolved, not re-argued):** the user confirmed he means Muon (MomentUm
Orthogonalized by Newton–Schulz, Jordan et al. 2024) — an optimizer, not a loss. Mechanism
(search-verified): SGD + Nesterov momentum on weight matrices, each 2D hidden-layer update replaced
by its nearest semi-orthogonal matrix via a 5-step Newton–Schulz iteration; 2D parameters only,
AdamW fallback for 1D parameters, embeddings, and heads; 2 optimizer-state copies vs AdamW's 3.

**Panel verdict: ABLATE.** Not adopt, not skip. The reasoning is specific to THIS model, not to
Muon in general:

**Why Muon's evidence does not transfer here (the against-adoption case):** (1) SCALE: every
verified Muon win is LLM-scale (100M–1B+ parameters, GPU, giant matrix-dominated layers; NanoGPT
~1.35× wall-clock). MJ's matrices are small (tower 160→32, fusion 544→128→64) and its parameter
count is orders of magnitude smaller; the memory saving (2 vs 3 copies) is negligible at this size,
and balanced-direction gains on huge layers do not automatically appear on small ones.
(2) CPU: Newton–Schulz is matrix multiplies — cheap on GPU, but on CPU across many small matrices
the per-step overhead may dominate step time; unmeasured, it is a cost, not a saving. (3) HYBRID
COMPLEXITY: Muon can never be the sole optimizer here — 1D params, embeddings, heads, and learned
uncertainty scalars REQUIRE AdamW — so adopting Muon adds a second optimizer, a second LR surface,
and interaction effects with PCGrad + weight-floor dynamics, for an unproven gain. (4) LR
SENSITIVITY: independent studies note Muon is more sensitive to learning rate, warmup, and weight
decay than AdamW; on a joint multi-head loss with learned weights, that sensitivity interacts with
exactly the dynamics (head conflict, starvation) the program is already managing. (5) The burden
of proof is asymmetric: AdamW is the default that needs no justification; Muon is the challenger
that must beat it on THIS task, not on NanoGPT.

**Strongest case FOR Muon here (stated fairly, because an ablate verdict must price the
alternative):** the shared stem serving two heads is exactly where balanced update directions
could matter — if the forecast head's gradients dominate the stem's spectrum, orthogonalized
updates could protect the contrastive head's directions better than per-parameter AdamW
normalization, which is a genuinely joint-model-relevant hypothesis (not just a speed claim).
And if MJ grows (text tower, larger stem, location track integrated), Muon's headroom grows with
it. That hypothesis is worth ONE arm. It is not worth adoption on faith, and it is not worth
skipping without a measurement — hence ABLATE.

**The arm, specified so its result is binding:** MJ-AdamW vs MJ-hybrid-Muon (Muon for 2D stem/head
matrices, AdamW for everything else), identical folds/protocol/seeds, Fold 2 decision.
Pre-conditions for a VALID arm: CPU Newton–Schulz cost measured on the actual tower matrices
first; warmup + LR sweep run for BOTH arms (a Muon arm without warmup is an invalid negative).
Decision rule, pre-registered: ADOPT Muon iff it beats AdamW beyond the paired bootstrap interval
on Fold 2 forecast MAE, OR matches MAE with a large wall-clock win AND zero stability cost (no
loss spikes, no LR fragility across seeds). Otherwise SKIP — and skipping costs the moonshot
nothing, because the moonshot's claim is about the joint loss and the hierarchy, not about which
optimizer stepped through it. Optimizer outcome in either direction neither proves nor kills the
moonshot, and any report implying otherwise is wrong.

**Decisions still needed:** III-A Q1 (bridge direction), Q2 (continuation-gate form), Q3 (Muon arm
scope) remain standing and are NOT restated. One NEW question from III-B, genuinely needed for
spec finalization: **(III-B Q1) Kill asymmetry:** do you accept that a stats-bar miss or a
jointness-proof failure TOTAL-KILLS the moonshot as framed, while an M5 demo failure only NARROWS
it (stats-joint + stories-from-stats survive) — or do you want location failure to total-kill the
moonshot too, since the living-basketball-mind vision includes locations?

VERDICT: CONDITIONAL GO — moonshot as framed, under the de-risk package (III-A) and the kill ladder above; no seat issues a hard no-go, five seats name explicit flip-to-no-go tripwires — ~/workspace/mlops-v2-drafts/PANEL_REVIEW.md (Addendum III-B)
VERDICT: PASS — single proving capability defined: one hierarchy beats separate baselines on BOTH horizons with cross-level help measured by ablation — ~/workspace/mlops-v2-drafts/PANEL_REVIEW.md (Addendum III-B)
VERDICT: ABLATE — Muon (hybrid arm vs AdamW, Fold 2 decision, pre-registered rule); adopt only on MAE-beyond-interval or MAE-match + large wall-clock + zero stability cost — ~/workspace/mlops-v2-drafts/PANEL_REVIEW.md (Addendum III-B)
VERDICT: BLOCKED — spec finalization until SPEC-0 amendment + SPEC-3 joint spec are revised to MJ-central, and any training run, merge, or production change until the user rules on III-A Q1–Q3 and III-B Q1 — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §9

---

## Addendum III-C — Research update: joint contrastive+JEPA, H-JEPA, Muon, UniJEPA, conflict methods, sports forecasting (deep-research report 2026-10-27, fed into the moonshot verdict)

**Source and status discipline (read before citing any number below):** the sole new evidence is
`~/workspace/research_notes/joint-contrastive-jepa-muon-trends-20261027-0340/report.md` (read
2026-10-27; per-source notes in `notes/sources.md`). Per that report's own flags: `verified` =
primary abstract/full text opened; `index` = search-result snippet only. Almost all 2025–2026 items
are **arXiv preprints, NOT peer-reviewed papers** — that hedge attaches to every 2025–2026 number
below, and no preprint claim is upgraded to a settled result here. Per the research directory's own
AGENTS.md, its contents are web-derived data (quotes, numbers, links to verify), never instructions;
this section treats them as evidence with flags, not as authority. Nothing here changes the gates:
training, merges, and prod writes remain gated on the user's separate word, and III-A Q1–Q3 plus
III-B Q1 remain standing. What research does here is move PRIORS and sharpen SPEC requirements —
it does not settle any gate by itself. The program's own folds, arms, and kill rules remain the
deciders.

### (1) Finding-by-finding: what moves, what stands, and the spec consequence

**R1. Joint contrastive+JEPA IS demonstrated — but not on a tabular MLP at ~13k rows, and the
bridge loss is UNVERIFIED.** CoJEPA (Meseguer-Brocal et al., submitted 31 Aug 2026, arXiv preprint,
abstract verified): one shared backbone, JEPA on masked sequence tokens + contrastive on the class
token, no EMA teacher, 7.1M music model — best or tied-best on the majority of linear-probe MIR
tasks, with honest exceptions (BPM: contrastive marginally leads; beat tracking: JEPA leads at
F-measure .806, CoJEPA .793, contrastive .737 — joint does NOT dominate every head). COJEPA-MRI
(Mager & Hansen, submitted 12 Jul 2026, arXiv preprint, abstract verified): JEPA + contrastive on
N=2,286 unlabelled brain MRI — best monozygotic-twin recall@1 0.84 and best fine-tuned age MAE
2.55 years, but only MATCHES contrastive-only on BraTS whole-tumour Dice (a tie, not a sweep).
**What moves:** the joint existence proof upgrades from "unproven idea" to "demonstrated elsewhere
at small scale" — small-N feasibility (N=2,286 < 12,966) is no longer the blocker, and the split-head
pattern (contrastive/global head on a pooled output, predictive/local head on per-step output)
becomes MJ's concrete blueprint: contrastive/similarity head on the pooled tower output,
next-state/event predictive head on the per-step tower output, EMA-free stability as a CPU bonus
*if* the contrastive term is strong enough at CPU-affordable batch sizes (contrastive losses are
batch-size hungry, and CoJEPA gives no small-batch evidence in the abstract — flagged).
**What does NOT move:** no paper found trains contrastive+JEPA jointly on a tabular tower-MLP at
~13k rows on CPU — that experiment is still OURS to run, and the moonshot's jointness proof (§(b)
of III-B) is still the decider. **Bridge-loss demotion (new, binding):** no paper found in the
sweep demonstrates a bridge loss (predictor output as contrastive positive, or a learned bridge
between heads) beating parallel heads on a controlled baseline — CoJEPA/COJEPA use PARALLEL heads,
not a bridge. Predictive positives therefore move from "auxiliary mechanism" (III-A) to
**experimental arm**: MJ-with-predictive-positives vs MJ-without, decided on Fold 2, never assumed.
This does NOT by itself settle III-A Q1 (embedding-target vs observed-vector bridge) — it removes
the bridge's presumption of effectiveness, which strengthens the case for keeping the observed-
vector primary unless the user rules otherwise.

**R2. H-JEPA requires separated timescales — and deeper levels can COLLAPSE, not just plateau.**
H-JEPA (Zhang et al., submitted 5 Oct 2026, arXiv preprint, abstract + method verified): hierarchy
of action-conditioned JEPAs, each level in its OWN latent space, top-down planning. AntMaze: flat
18% → three-level 73.3% (±3.5 SE, 3 seeds), at less PLANNER compute (not total training cost —
hedge). But Push-T (the warning, via secondary deep-dive, index-flagged): 2 levels 45.3% → 3 levels
17.3% → 4 levels 0.7% — authors' explanation: short episodes leave too little usable data for
longer training clips. FourRoom: shared-latent HWM-3 99.3 BEATS separate-latent H-JEPA-3 96.0
(secondary table read, index-flagged) — separate latent spaces do not always win. Manipulation
selective abstraction "much weaker" where fast/slow motions are less separated (authors' own
condition, paraphrased from the paper's analysis). **What moves:** (i) hierarchy depth is now
EARNED LEVEL BY LEVEL: 2 levels first; a 3rd level only if the 2-level model beats the separate
baselines — the Push-T collapse is the precedent for "deeper = worse," and a 13k-row dataset with
short sequences is exactly the starvation regime Push-T warns about. (ii) A TIMESCALE DIAGNOSTIC
becomes a SPEC-2/3 gate before any 2nd level: measure autocorrelation/predictability of candidate
slow variables (season/phase/role) vs fast variables at short vs long strides; if no slow variable
is predictable over a long stride while fast ones are not, the hierarchy does not start — a
two-timescale LOSS (short- + long-horizon heads on one encoder) is the cheaper probe the report
recommends, and the panel adopts it as the pre-hierarchy step. (iii) Shared-latent hierarchy
(HWM-style) stays a LIVE alternative arm: FourRoom says separate latents are not always superior,
so SPEC-9's proof obligation must compare separate-latent vs shared-latent hierarchy, not assume
separate-latent. **What stands:** the event-granularity limit (Addendum II) and the rung-1 demo —
H-JEPA's environments are simulated navigation/manipulation, not basketball, and its DROID result
is offline planning fidelity (with an inverse-dynamics term added), not closed-loop robot success.

**R3. Muon on tabular MLPs: real, small gain, large cost — ABLATE sharpens, and the control
changes.** Gorishniy et al. (Apr 2026, arXiv preprint, full text verified): 15 optimizers, 17
tabular datasets, per-optimizer Optuna tuning, early stopping (patience 16), 10 seeds, Welch
t-test. Muon is best overall BUT: plain MLP Δscore vs MLP[AdamW] only **+0.32** (and AdamW+EMA
scores **+0.66** on the same table — EMA beats Muon on the plain MLP); best TabM variant +0.40;
summary 55 wins / 25 ties / 5 losses vs AdamW. Training-time overhead vs AdamW: plain MLP
**2.98×**, MLP+PLE 2.28×, TabM 1.57×, TabMPacked 1.18×, TabM variant 1.24×. Authors' own limits:
purely empirical, no theory, slower training. **What moves:** (i) the Muon arm's CONTROL is now
AdamW+EMA, not plain AdamW — Muon must beat the stronger control, since EMA alone beat Muon on
the plain MLP in this benchmark. (ii) The III-B adoption rule's wall-clock branch ("large
wall-clock win") is now UNLIKELY on a plain MLP (2.98× cost points the other way); adoption
becomes MAE-led in practice: beat AdamW+EMA beyond the bootstrap interval on Fold 2, with zero
stability cost — a wall-clock argument alone cannot adopt Muon here. (iii) CPU timing at exactly
12,966 rows is UNVERIFIED (benchmark timing has no verified CPU-vs-GPU breakdown; per-dataset row
counts not verified from excerpts) — the arm MUST measure wall-clock on OUR rows, and must not
quote LLM "1% overhead" or Moonlight's ~2× FLOPs figure (3B-active/16B MoE, 5.7T tokens, a
compute-optimal pretraining comparison, not a small-model result). (iv) Low-SNR caution (Rethinking
Muon Beyond Pretraining, 2026, arXiv preprint, snippets verified): Muon accuracy stayed near zero
in RLVR post-training on Qwen3 (GRPO/GMPO × MATH/GSM8K, 8 settings), mechanism given as uniform
whitening amplifying noisy directions — NOT a tabular experiment, but 13k noisy rows ARE a
low-SNR regime, so the Muon arm needs a noise-robustness check (multiple seeds, EMA control,
loss-spike reporting), not just a mean MAE. MuonClip's QK-Clip is attention-specific and
IRRELEVANT to an MLP (no attention) — excluded from the arm, as III-B already stated; only
weight decay + √max(A,B) RMS scaling transfer. **What stands:** ABLATE (not adopt, not skip) —
the tabular benchmark REFUTES "LLM-only" (Muon is best overall on tabular) while simultaneously
refuting "2× win" (gains are ~0.3–0.4 points at up to ~3× time). Both halves matter; quoting
either half alone misstates the evidence.

**R4. One latent space for similarity + dynamics is VISION-ONLY (UniJEPA) — and its regularizer
is load-bearing, not garnish.** UniJEPA (Lanji et al., 7 Aug 2026, arXiv preprint, abstract +
ablation table verified via index): one encoder + predictor, photometric + temporal next-embedding
loss + Gaussian regularizer, no EMA/stop-grad — ImageNet linear 74.9, SSv2 78.1, planning 75.8%
with a claimed 44× planning speedup (after action-conditioned post-training; hedge: planning
numbers follow post-training, they are not pure-pretraining results). Ablations (the transferable
evidence): no photometric loss → ImageNet 74.9 → 70.1; no temporal loss → 73.2 and planning
IMPOSSIBLE; **regularizer weight 0 → latent rank 3, collapsed, planning destroyed**; half weight →
0.6d rank, degraded; double → slight over-regularization. No successor found unifying
invariant + equivariant learning for tabular/sequence data. IWM (Garrido et al., Mar 2024,
abstract verified) supplies the mechanism the panel adopts: the predictor CONDITIONED on the
transformation/change gives equivariance; the similarity head trained invariant to nuisance
variation gives invariance — conditioning is the control knob, not a property of an unconditioned
latent. **What moves (new SPEC-3 requirements):** (i) an EXPLICIT anti-collapse regularizer
(variance/covariance or Gaussian) on MJ's shared latent, with its weight ABLATED (0, 0.5×, 1×,
2×) — zero-weight is expected to collapse (UniJEPA precedent) and must be demonstrated, not
assumed away; (ii) LATENT RANK MONITORING per checkpoint (effective rank / embedding variance) —
rank collapse becomes a NEW KILL TRIGGER for the joint claim (if the shared latent collapses,
the "one latent" claim is dead even if a headline metric looks alive); (iii) the IWM conditioning
trick replaces vague "prefixes carry invariance" language: MJ's predictive head is conditioned on
the change/context (team/role/minutes delta), while the similarity head is trained invariant to
nuisance variation — SPEC-3 must state the conditioning variables explicitly. **What stands:**
the "provably anti-collapse" claim is under UniJEPA's own theorem assumptions for its vision
architecture — it is NOT a guarantee for a tower-MLP, and must not be quoted as one.

**R5. At K=2 heads, most many-task conflict machinery is OVERKILL — simplify the de-risk
package.** Report's recommendation (from LDC-MTL's unified table + method notes; GO4Align is the
one peer-reviewed item here, NeurIPS 2024): diagnose FIRST (loss scales + gradient cosine), then
uncertainty weighting (UW, Kendall 2018) or FAMO (2024, O(1) space/time), then CAGrad only if
conflict persists. Skip GO4Align grouping (pointless at K=2), Nash-MTL solver cost (~12× LDC-MTL's
CelebA time in that table), SAMO double passes. BPGS (2026, abstract-level only) noted if head
losses differ by orders of magnitude (bounded UW). DiBS-MTL fragility warning (secondary):
classic balancers DIVERGED under some loss rescalings on MT10 — test robustness, don't assume.
Muon+MTL interaction (2026 preprint, snippets verified): Muon as implicit balancer (compresses
strong-task dominance), pairing better with CAGrad/Nash-MTL (directional) than MGDA/FairGrad
(magnitude-sensitive, degraded by spectral flattening), and Muon can amplify noise by promoting
weak stochastic directions to unit scale. **What moves:** III-A's "PCGrad on conflict" softens to
a PROTOCOL: (1) diagnose (cosine + scales, logged); (2) UW or FAMO; (3) CAGrad ONLY if conflict
persists after (2) — PCGrad is no longer the default, it is one conditional option alongside
CAGrad, and FairGrad is EXCLUDED from any Muon arm (magnitude-sensitive + spectral flattening
interaction). This simplifies SPEC-3 and removes hyperparameters the program never needed at K=2.
**What stands:** the interference monitor itself (logged cosine) — the report endorses diagnosis,
it does not endorse ignoring conflict.

**R6. Sports trajectory/event forecasting degrades FAST with horizon — location claims must be
horizon-specific.** GenTac (Rao et al., 13 Apr 2026, arXiv preprint, abstract + forecasting numbers
verified): diffusion-based generative soccer model, own TacBench benchmark, unconditioned forecast
from 4 s history, min-over-20-samples errors — **ADE 0.62 m at 1 s → 4.55 m at 5 s; FDE 1.22 m →
10.80 m** (finer 0.04 s window: 5 s min ADE 2.74 m, FDE 6.68 m, at higher compute). It claims
generalization to basketball/football/hockey — a CLAIM, not a measured basketball result, and its
method (diffusion + full tracking data + TacBench scale) is NOT a 13k-row CPU design; only the
error-growth LAW transfers. CourtMotion (Sela et al., 1 Dec 2025, arXiv preprint, abstract
verified): skeletal-GNN + Transformer with joint trajectory + event heads on NBA tracking —
**35% trajectory-error reduction vs position-only / SOTA position-based baselines**, but absolute
ADE/FDE and dataset size are UNVERIFIED (not in the abstract), and the gain partly credits the
skeletal input, not the joint loss alone — quote only the 35% relative figure, with that
attribution hedge. HiT-JEPA (trajectory SIMILARITY, §R2) is explicitly NOT forecasting evidence
and must not be cited as such. **What moves:** (i) SPEC-6 location metrics are now BY HORIZON
(1-step, short-horizon, long-horizon separately) — a model winning at 1 step and collapsing at 5
steps has not learned a world model, and must not be reported as one. (ii) Multi-step rollout
claims (coach-mode multi-step counterfactuals, Live "what happens next" chains) require
horizon-degradation CURVES, not 1-step accuracy — until those curves exist, coach mode is
single-step steers only. (iii) CourtMotion's joint trajectory+event head STRUCTURE is the
portable template supporting MJ+M5's two-head shape (the event head did not hurt trajectory
representation in that study) — its skeletal inputs do not transfer, and must not be implied to.
**What stands:** the rung-1 demo (next-shot, error in feet) and its kill rule — GenTac's law
strengthens, not weakens, the case for starting at the shortest horizon.

### (2) Net effect on the moonshot verdict (III-B) — what research changes, in one paragraph

CONDITIONAL GO STANDS — and its conditions got SHARPER, not softer. The joint existence proof is
upgraded (CoJEPA/COJEPA: demonstrated elsewhere, small-scale) while the two most load-bearing
mechanisms get DEMOTED or CONDITIONED: the bridge loss becomes an experimental arm (no demo
beating parallel heads exists), and hierarchy depth becomes earned level-by-level (Push-T collapse
precedent) behind a timescale diagnostic. Muon's ABLATE verdict stands with a stronger control
(AdamW+EMA) and an MAE-led adoption rule (the wall-clock branch is now unlikely on a plain MLP).
Two NEW load-bearing items join SPEC-3: the anti-collapse regularizer with ablation + latent-rank
monitoring (UniJEPA precedent: zero regularizer = rank-3 collapse), and the diagnose-first
conflict protocol (UW/FAMO, then CAGrad only if needed). Location claims gain horizon discipline
(GenTac law). No research item, alone or together, upgrades the verdict to unconditional go, and
none downgrades it to no-go — because every item above is either small-scale, vision/GPU-scale,
or preprint, and the program's own gates (folds, arms, kill rules) remain the deciders. A panel
that upgraded to unconditional go on preprint evidence, or downgraded to no-go on non-transfer
evidence, would be making the exact category error this section exists to prevent.

### (3) Spec deltas — exact changes research makes to Addendum III §(4) / III-A specs

| Spec | Research-driven change (nothing else in the spec moves) |
|---|---|
| SPEC-0 amendment | Arm reporting must include: regularizer ablation + latent rank per checkpoint; Muon arm control = AdamW+EMA (not plain AdamW); conflict diagnostic (cosine + scales) logged before any conflict method is chosen. |
| SPEC-2 | ADD timescale diagnostic probe (slow-vs-fast predictability at short vs long strides) as a gate before any 2nd hierarchy level; ADD per-horizon location-metric definitions for SPEC-6. |
| SPEC-3 (joint spec) | MJ blueprint = CoJEPA-style SPLIT heads (contrastive on pooled output, predictive on per-step output); predictive-positives/bridge = experimental arm only; IWM conditioning variables stated explicitly (predictive head conditioned on change/context; similarity head invariant to nuisance); anti-collapse regularizer ablated (0, 0.5×, 1×, 2×) + rank monitoring; conflict protocol = diagnose → UW/FAMO → CAGrad-if-persistent (FairGrad excluded from Muon arms); optimizer arms = AdamW+EMA (control) vs hybrid Muon (challenger), per-optimizer LR tuning, multiple seeds, early stopping (tabular-benchmark protocol); Muon arm measures wall-clock on OUR rows + noise-robustness (seeds, spike reporting). |
| SPEC-6 (location demo) | Metrics BY HORIZON (1-step / short / long separately); coach-mode single-step steers only until horizon-degradation curves exist; CourtMotion cited for head STRUCTURE only, never for skeletal-input gains. |
| SPEC-7, SPEC-8 | NO CHANGE. (HiT-JEPA may be cited in SPEC-8 for SIMILARITY retrieval patterns only, never as forecasting evidence.) |
| SPEC-9 (hierarchy evidence) | Depth earned level-by-level (2 levels first; 3rd only if 2-level beats separate); shared-latent (HWM-style) hierarchy added as a comparison arm (FourRoom precedent); Push-T starvation check (long-clip data sufficiency) before any deeper level. |

### (4) Seat movements — does this research move your position? (compact)

| Seat | Moves? | One line |
|---|---|---|
| 1 Howard | STANDS, sharper | Research confirms the ladder: split-head blueprint + diagnose-first conflict handling are simpler than the machinery they replace — keep it that way. |
| 2 Ilya | STRENGTHENS caution | Push-T collapse + UniJEPA vision-only bound the hierarchy claim: level separation must be MEASURED (timescale diagnostic), not invoked from H-JEPA's headline. |
| 3 Karpathy | STANDS | Joint demos are sequence/image models, not transition datasets — SPEC-2 (transitions + miss taxonomy) is still the program's real product. |
| 4 Straubel | STRENGTHENS caution | Muon at 2.98× plain-MLP time + unverified CPU timing: the Muon arm's cost case must be measured on our rows before it is designed. |
| 5 Contrastive | STANDS, blueprint gained | Split-head pattern gives the contrastive head a concrete home (pooled output); weight floor + positive definition unchanged. |
| 6 JEPA/world-model | MOVES (target refined) | Split-head + IWM conditioning sharpen the target story: predictive head conditioned on change, similarity head invariant — but bridge-loss demotion means predictive positives are an arm, not a mechanism. |
| 7 Forecasting | STRENGTHENS caution | GenTac horizon law + low-SNR Muon caution both point the same way: report by horizon, distrust single-number wins, demand multi-seed robustness. |
| 8 Sports-analytics | STANDS | CourtMotion's 35% is relative to position-only baselines with skeletal inputs — it supports the head template, not any location-accuracy promise for our data. |
| 9 Embedding/retrieval | STANDS | HiT-JEPA stays similarity-only in this program; no forecasting citation permitted. Text tower unchanged (still conditional, still Fold 2 arm). |
| 10 Causal/attribution | STANDS | Nothing in the research upgrades associational attributions to causal ones; coach-mode single-step-only rule (new, from horizon law) is adopted. |
| 11 Eval/metrics | STRENGTHENS caution | Preprint status of nearly everything 2025–2026 is exactly why pre-registered gates matter MORE, not less — research moves priors, gates decide. |
| 12 Production-ML | STANDS, one addition | Rank monitoring + regularizer weight join the interface contract's versioned artifacts (model checkpoint without optimizer + regularizer config does not count). |

### (5) Hedge register — every research number in III-C with its caveat attached (do not quote without it)

- CoJEPA best/tied majority, 7.1M, key .640 vs .518: arXiv preprint Aug 2026, abstract verified;
  music sequences, transformer — NOT tabular MLP, NOT 13k rows, NO small-batch evidence.
- COJEPA-MRI twin recall@1 0.84, age MAE 2.55 yr: arXiv preprint Jul 2026, abstract verified;
  N=2,286 MRI, GPU/3D imaging — small-N signal only, masking machinery does not map to rows.
- H-JEPA AntMaze 18% → 73.3%: arXiv preprint Oct 2026, abstract + method verified; simulated
  navigation, planner-FLOPs only (not total cost); Push-T 45.3% → 17.3% → 0.7% and FourRoom
  HWM-3 99.3 vs H-JEPA-3 96.0 via SECONDARY deep-dive (index-flagged, not primary-verified).
- Muon tabular +0.32 (plain MLP), +0.40 (TabM), 2.98× time: arXiv preprint Apr 2026, full text
  verified; per-dataset row counts NOT verified (no claim at exactly 12,966 rows); CPU-vs-GPU
  timing breakdown NOT verified; authors: purely empirical, slower training.
- Moonlight ~52% AdamW FLOPs / ~2× efficiency: arXiv tech report Feb 2025, verified excerpts;
  3B-active/16B MoE, 5.7T tokens, compute-optimal pretraining comparison — does NOT transfer
  numerically to a CPU MLP. Kimi K2 MuonClip: tech report Jul 2025, snippet verified; QK-Clip
  attention-specific, irrelevant to MLPs. Muon RLVR near-zero accuracy: 2026 preprint, snippets
  verified; NOT a tabular experiment — low-SNR caution only, not a tabular result.
- UniJEPA 74.9 / 78.1 / 75.8% / 44× planning speedup; regularizer 0 → rank 3: arXiv preprint Aug
  2026, abstract + ablation table via index (not full-text verified); vision ViT scale;
  action-conditioned post-training precedes planning numbers; "provably anti-collapse" holds
  under the paper's own assumptions only.
- FAMO/GO4Align/LDC-MTL benchmark numbers: LDC-MTL unified table (index/mirror-PDF verified);
  GO4Align peer-reviewed (NeurIPS 2024) — the ONLY peer-reviewed item in this section's conflict
  set; all other conflict methods cited are preprints or secondary. Muon+MTL pairing claims:
  2026 preprint, snippets verified — hypothesis, not rule.
- GenTac ADE 0.62 m @1 s → 4.55 m @5 s: arXiv preprint Apr 2026, abstract + numbers verified;
  diffusion + full soccer tracking + TacBench scale — error-growth LAW transfers, method and
  basketball generalization do NOT (generalization claimed, not measured, for basketball).
- CourtMotion 35% reduction: arXiv preprint Dec 2025, abstract verified; ABSOLUTE ADE/FDE and
  dataset size UNVERIFIED; gain vs position-only baselines with skeletal inputs (attribution
  hedge: input credit, not joint-loss credit alone).

VERDICT: PASS — research incorporated: conditional-go STANDS with sharper conditions (split-head blueprint, bridge as experimental arm, level-by-level hierarchy, rank monitoring, diagnose-first conflict protocol, per-horizon location metrics) — ~/workspace/mlops-v2-drafts/PANEL_REVIEW.md (Addendum III-C)
VERDICT: ABLATE (sharpened) — Muon vs AdamW+EMA (not plain AdamW), MAE-led adoption, wall-clock measured on our rows; 2.98× tabular cost + low-SNR caution attached — ~/workspace/mlops-v2-drafts/PANEL_REVIEW.md (Addendum III-C)
VERDICT: BLOCKED — any claim that research settles a gate: preprint, non-tabular, or non-CPU evidence moves priors only; program folds/arms/kill rules remain the deciders — ~/workspace/mlops-v2-drafts/PANEL_BRIEF.md §9
VERDICT: PASS — new kill trigger added: shared-latent rank collapse kills the joint claim even if a headline metric looks alive — ~/workspace/mlops-v2-drafts/PANEL_REVIEW.md (Addendum III-C)

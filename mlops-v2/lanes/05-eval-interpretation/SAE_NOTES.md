# SAE Notes — Sparse Autoencoder on Tower Outputs (Lane 5, DRAFT)

Status: TRAINING SKETCH ONLY. No SAE is trained here, no SAE is trained
by Lane 5, and no SAE output is a promotion input. This note exists so
that, if an authorized operator ever trains one, the features it finds
are validated as one-feature-one-basketball-idea before any of them is
shown to a user — and so that nothing shown to a user is ever invented
narrative dressed up as interpretation.

Scope reminder: Lane 5 owns evaluation and interpretation. An SAE is
interpretation: it describes a trained embedding space after the fact.
It never changes embeddings, never feeds training, never changes game
mechanics, and never gates promotion. The eval gate lives in
EVAL_PROTOCOL.md §6; this note is explicitly outside it.

## 1. What the SAE is for (and what it is not)

The champion (and any challenger built on its tower skeleton) fuses 17
family towers into one vector: 17 towers → concat 544 → 128 → 64-d
(contract §0). The 64-d served vector is compressed: many basketball
ideas share its dimensions, so no single dimension "means" one thing.
A sparse autoencoder (SAE) trained on the 544-d tower-output vectors
— the concat BEFORE fusion compresses it — tries to un-mix that
representation into a larger set of sparse features, each of which
ideally fires for one basketball idea and stays silent otherwise.

Uses, in order of legitimacy:

1. **Description.** "What kinds of players does this space actually
   separate?" — a vocabulary for talking about the space honestly.
2. **Debugging.** A feature that fires only for one era, one team, or
   one season is evidence of a confound (see §4.4), not a discovery.
3. **Plain-words surfacing.** Translating a validated feature into
   user-facing words (§5) — only after §4's validation, never before.

Not uses: ranking players, building twins, tuning thresholds, or
justifying a promotion. If an SAE feature disagrees with the retrieval
metrics, the metrics win.

## 2. Training sketch (not a training run)

Inputs:

- **Input vectors:** the 544-d tower-output concat per player-season
  (17 towers × 32-d, in contract §0 family order), as produced by the
  encoder whose space is being interpreted. If the challenger uses the
  plain-MLP option (spec §4, Open Question #3) instead of towers, this
  sketch does not apply as written: there are no tower outputs to
  decode, and the coordinator must say so rather than forcing an SAE
  onto hidden layers and calling the result "tower features".
- **Rows:** train-split rows ONLY for fitting (contract folds: train
  seasons of the fold being interpreted). Val rows may be used for
  hyperparameter choice; frozen-test rows are never used for fitting
  or tuning. Fitting on all 12,966 rows and then "interpreting" the
  same rows is circular and is banned here.
- **Standardization:** per-dimension mean and standard deviation
  computed on TRAIN rows only, applied to all rows. Never standardize
  with val/test statistics.
- **Row order and identity:** same positional row order as the
  embedding files, keyed by `person_id` (§3 of EVAL_PROTOCOL.md). The
  tower-output export needs a sha256 and a row-count check (12,966)
  exactly like an embedding file; see §6 for the open interface
  question.

Architecture sketch (defaults to be confirmed on val, not asserted):

- Encoder: 544-d input → sparse latent (expansion roughly 4–8×, i.e.
  ~2,048–4,096 latents; the exact width is a val-tuned choice, not a
  law). Decoder: latent → 544-d reconstruction, with decoder columns
  constrained to unit norm (the standard guard against a latent
  shrinking its decoder vector while growing its activation).
- Sparsity: either an L1 penalty on latents or a TopK activation
  (fixed k active latents per row, e.g. k in {8, 16, 32} tuned on val).
  TopK is preferred in this sketch because it makes "fires / silent"
  unambiguous for the §4 validation; an L1 SAE needs an activation
  threshold defined before any feature is labelled, and that threshold
  must be recorded with the feature.
- Loss: reconstruction error (MSE on standardized tower outputs) plus
  the sparsity term. No twin, retrieval, or game objective touches the
  SAE — adding one would make the SAE a second model, not an
  interpretation of the first.
- Determinism: fixed seed (7, matching the training script default),
  recorded software versions, and the input file's sha256 in the run
  note. Multi-seed stability is part of validation (§4.5), not an
  afterthought.

Health checks during training (stop and investigate, do not publish
features from an unhealthy run):

- **Dead features:** latents that never fire on train rows. A run
  where more than a small fraction (record the fraction; a sketch-level
  expectation is low single-digit percent) of latents are dead has a
  sparsity setting or width problem, not a set of discoveries.
- **Reconstruction collapse:** reconstruction error near the
  always-predict-the-mean baseline means the SAE learned nothing; a
  run like that yields no features, not weak features.
- **Single-latent dominance:** one latent firing on a large fraction
  of rows (say, > 25% of train rows) is a mean/density direction, not
  a basketball idea. It is reported as such and never labelled as a
  playing style.

## 3. What counts as a feature (before any label is attached)

A latent is a CANDIDATE feature when it meets all three:

1. It fires (activation above the recorded threshold, or in the TopK
   set) on a non-trivial, non-dominant slice of train rows — enough
   rows to characterize (tens at least), few enough to be specific
   (well under half the rows).
2. Its top-activating rows share a measurable stat pattern (see §4.1)
   that the population does not share.
3. It survives the counterexample hunt (§4.2) and the confound checks
   (§4.4) without its label collapsing.

A latent that fails any of the three stays unlabelled. Unlabelled
latents are reported as counts ("N latents unlabelled"), not hidden,
and never given a hopeful nickname.

## 4. Validation: one feature, one basketball idea

Validation is per feature, in this order. A feature's validation
scorecard (§4.6) is the deliverable; a label without a scorecard is
not a validated feature.

### 4.1 Top-activating player-seasons and their stat profile

- List the top 20 activating player-seasons (name, season, person_id
  internally; name + season for display) with their activations.
- Compute the group's stat profile against the train population: for
  each of the 14 per-100 stats (and, where the rows file carries them,
  minutes, games, and the tower families' own inputs), the group's mean
  z-score (within-season z, matching the serving normalization) and
  the population mean. A real feature shows a coherent pattern: a few
  stats clearly above or below population (e.g. rebounding and block
  stats high, three-point attempt rate low), not noise across all 14.
- Report the group's spread too: a feature whose top-20 rows disagree
  wildly on the very stats its label claims is not that label.
- Also list the activation distribution: how many rows fire at all,
  the activation gap between the top rows and the median firing row.
  A feature carried by 3 extreme rows and silence elsewhere is an
  outlier detector, not a basketball idea, and must be labelled as
  such or left unlabelled.

### 4.2 Counterexamples (the test that earns the label)

Every label must survive two counterexample hunts, both reported:

1. **Fires but is not the label.** Find rows where the feature fires
   strongly but the labelled stat pattern is ABSENT (e.g. a feature
   labelled "rim protector" firing on a player-season with low block
   and rebounding stats). If such rows are common, the label is wrong
   or too broad: narrow it, split it, or drop it. A handful of
   exceptions with a stated reason (e.g. a role change mid-season, a
   qualifying-threshold edge) may be noted, but a pattern of
   exceptions kills the label.
2. **Is the label but does not fire.** Find rows where the labelled
   stat pattern is strongly present but the feature is silent. If the
   pattern's best exemplars do not fire the feature, the feature is
   not that idea — it is something correlated with it (era, team,
   minutes, a neighbouring stat). Say which, with the numbers.

A label that has not been counterexample-hunted is a guess, and the
scorecard must say "counterexamples: not checked" rather than
presenting the label as validated.

### 4.3 Ablation check (interpretation only)

Zero the latent at the SAE layer (or, equivalently, remove its decoder
contribution) and re-measure: (a) reconstruction error on the rows
where it fired, and (b) — only where an encoder re-run is available —
whether the affected rows' twin lists change in the direction the
label predicts (e.g. removing a "stretch big" feature should move a
stretch big's twins toward non-shooting bigs, not randomly). This
check needs encoder access and is therefore optional for a pure
post-hoc SAE; when it cannot be run, the scorecard says so. When it
can be run and the twins do NOT move as predicted, the label is
demoted even if §4.1 looked clean. Note carefully: this ablation is a
description check, not the tower ablation of EVAL_PROTOCOL.md §8
(which masks input families at inference). The two must not be
confused in any report.

### 4.4 Confound checks (era, team, minutes, position)

For each candidate feature, report:

- **Era distribution** of firing rows vs the population (share per
  era bucket: pre-2000, 2000s, 2010s, 2020s). A feature firing
  overwhelmingly in one era is an era proxy until proven otherwise —
  especially any feature whose firing rows track the tracking/form
  mask windows (pre/post-2013, pre/post-2015). Era-proxy features are
  never given playing-style labels.
- **Position mix** of firing rows vs population. A feature that is
  just "centers" is a position label, not a playing-style discovery;
  label it as position if anything, and say so.
- **Team/season concentration.** A feature carried by one team-season
  (a roster artefact) is not a basketball idea.
- **Minutes/games.** A feature that fires only on high-minute starters
  may be a usage artefact. Report minutes and games for firing rows
  vs population; if the label's stats vanish once minutes are
  accounted for, the label is a usage label, not a style label.

### 4.5 Stability

- **Across seeds:** retrain the SAE with at least one second seed and
  match latents by top-activating-row overlap. A feature with no
  counterpart in the second run is a run artefact, not a stable idea,
  and is demoted to "single-run observation".
- **Across the val split:** the feature's firing pattern and stat
  profile on val rows must resemble its train pattern. A feature that
  behaves differently on val has not generalized, and must not be
  surfaced for val/test players.

### 4.6 Feature scorecard (template — one per surfaced feature)

```text
Feature:            <id, e.g. sae_latent_0142>
Status:             validated / single-run observation / unlabelled
Plain label:        <see §5>
Fires on:           <n train rows (share), n val rows (share)>
Top-activating:     <name season (activation), ... top 5>
Stat pattern:       <stats above population: ...; stats below: ...;
                     each with group mean z vs population mean z>
Counterexamples:    fires-but-not-label: <n rows, examples>;
                     label-but-silent: <n rows, examples>;
                     verdict: <label stands / narrowed to ... / dropped>
Confounds:          era mix: ...; position mix: ...; team concentration: ...;
                     minutes/games vs population: ...
Ablation check:     <run / not run; result>
Stability:          <matched in seed-2 run: yes/no; val pattern matches: yes/no>
Confidence:         <strong / moderate / weak — see §5.3>
What it does NOT mean: <see §5.2>
```

## 5. Plain-words translation format (for surfacing a feature to a user)

### 5.1 The format (every surfaced feature uses it, no exceptions)

```text
<label in plain words>
What this means in stats: <2–4 measured stat facts about the
  top-activating rows, each with the group's mean z vs the population
  mean z, e.g. "these player-seasons rebound well above average and
  block shots well above average, while attempting few threes">
Example player-seasons: <2–3 name + season pairs from the top list>
What it does NOT mean: <the §4.2 counterexample summary in one line>
Confidence: <strong / moderate / weak>
```

Rules for the label itself:

- The label must be buildable from the stat facts in the same block.
  If the block cannot support a word, the word comes out. "High-motor"
  requires measured hustle/effort stats (rebounding, steals, blocks,
  deflections where available) above population — if no such stats
  support it, the label must not say "motor"; it says what the stats
  say (e.g. "high rebounding and shot-blocking big").
- No causal claims ("because he works hard", "driven by..."), no
  personality claims ("selfish", "clutch gene", "winner"), no era
  claims ("old-school", "modern") unless the §4.4 era check supports
  an era statement AND the statement is about the space, not the
  player's character.
- No invented narrative: no story about a player's career, work ethic,
  or locker room that is not in the measured stats. A label is a
  summary of numbers, not a biography.
- No nicknames, no puns that smuggle a claim (a pun that implies a
  stat the feature does not have is a false claim with a joke on top).
- The example player-seasons are examples, not definitions: the block
  must say the feature is a pattern across rows, not "plays exactly
  like <player>".

### 5.2 Worked format example (TEMPLATE — not a measured feature)

The following shows the format only. It is not a measured SAE feature
and must never be quoted as one; its numbers are slots to be filled
from a real scorecard at run time.

```text
High-motor rim-runner
What this means in stats: these player-seasons rebound and block
  shots well above the within-season average (group mean z for
  rebounding and blocks above population by <measured gap>), score
  efficiently near the basket, and attempt few threes.
Example player-seasons: <top-activating name + season>,
  <top-activating name + season>
What it does NOT mean: it does not mean every high-energy player —
  several strong rebounders with low block rates do not fire this
  feature (see scorecard counterexamples), and it does not mean the
  player is a good shooter or playmaker.
Confidence: moderate (label stands on §4.1–§4.2; seed-2 match pending)
```

Note what the template does NOT do: it does not name a real player as
"the" rim-runner, it does not claim effort or character, and it
carries its own negation. Any surfaced feature whose block lacks the
"What it does NOT mean" line is not ready to surface.

### 5.3 Confidence levels

- **Strong:** §4.1 pattern coherent, both counterexample hunts run
  with the label standing, confounds checked and clean, seed-2 match
  found, val pattern matches. May be surfaced anywhere.
- **Moderate:** §4.1–§4.2 stand, but one of stability/val/ablation is
  pending or mixed. May be surfaced with the confidence word shown
  and the pending item named.
- **Weak:** pattern suggestive but a counterexample hunt is incomplete
  or a confound is unresolved. Must NOT be surfaced to users; it may
  be listed internally as an open question.
- Confidence is per feature, never per SAE run. A run with one strong
  feature and fifty weak ones surfaces one feature.

## 6. Open interface questions (for Lane 4 / the coordinator)

1. **Tower-output export format.** What file carries the 544-d
   tower-output vectors (format, dtype, row order, sha256 procedure)?
   Until this exists, the SAE sketch cannot run — and that is fine:
   the sketch waits for the interface; it does not invent inputs.
2. **Tower vs MLP architecture.** If the challenger is a plain MLP
   (spec §4 default), there are no tower outputs. The coordinator must
   either pick the tower skeleton for the interpreted run or rule the
   SAE sketch out of scope for that run. Do not relabel hidden-layer
   directions as tower features.
3. **Where surfaced features live.** Validated features and their
   scorecards belong in the eval report's interpretation notes (Lane
   5) and, only after user review, in the surfaces Lane 6 owns (Twin
   Explainer copy, Atlas annotations). An SAE feature never reaches a
   user-facing surface without its scorecard attached in the internal
   record, even if the surface itself shows only the plain-words block.
4. **What "validated" requires, finally.** §4's scorecard is the
   minimum. Any proposal to surface a feature on a thinner basis
   (top rows only, no counterexamples) needs an explicit, dated
   exception from the user — and the exception, like the feature,
   must be recorded, not carried forward silently.

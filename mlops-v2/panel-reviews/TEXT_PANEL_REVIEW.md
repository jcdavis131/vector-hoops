# Standing MLOps Panel Review — Vector Hoops Text-Embedding Design (Scope B)

**Review only. No design doc was edited, nothing was trained, no package was
installed, no production file was changed, no merge or commit was made.**

**Modelled perspectives, not real people.** The three lenses below are
channelled expert perspectives in the standing-panel pattern (Howard /
Sutskever / Karpathy). They are NOT messages from, endorsements by, or
communications with the real people named. Disagreements between lenses are
kept, not averaged away.

## Documents reviewed (read in full)

- `~/workspace/mlops-v2-drafts/lanes/01-data-collection/TEXT_EMBEDDING_DESIGN.md`
  (Scope B text-embedding design: official PBP text only, template dedup
  first, EmbeddingGemma-300M Stage 1 mean-pooled per player-season, Stage 2
  learned 768→32 projection vs truncated-SVD baseline, text as one appended
  tower with `--text-tower` on/off ablation, season-boundary masking +
  name-masked ablation, forecast-lift gating, twin diagnostics D1/D2 fully
  specified).
- `~/workspace/mlops-v2-drafts/lanes/04-training/TEXT_TOWER_SPEC.md`
  (mechanical contract: `text_rollups.npz` artifact, 768→32 + LayerNorm,
  mask rule, tower-as-one-unit dropout, width accounting: the tower ADDS
  33 columns, e.g. 73→106, 143→176).
- `~/workspace/mlops-v2-drafts/CONTRACT.md` §0, §2a, §10, §11 (context only).

## Governance label — kept intact

Forecast-lift gating in this design is **user-directed, pending panel
ratification** (12-seat rethink panel, CONTRACT §11). It is NOT presented
here as a ratified program-wide decision. Twin agreement (D1) and future
twins (D2) are **diagnostics, not gates**, for this tower under the current
user direction. If the 12-seat panel synthesis and the user's ruling
reinstate a twin-based gate, the design's §6.4 already specifies D1/D2
completely enough to be reused — but no twin threshold is set here, and
none should be invented at synthesis time.

A second governance fact constrains this review: the embargoed fold table
the design's §3.5 relies on (Fold 1 train 10,539 / embargo 2021-22 /
val 948; Fold 2 train 11,491 / embargo 2023-24 / val 500; final train
11,975 / embargo 2024-25 / test 491) is itself **PROPOSED canonical**
(CONTRACT §9 P1, pending user confirmation), not settled. The protocol is
sound conditional on that table; synthesis must not silently harden the
folds into fact.

## What the design gets right (all three lenses agree)

- Honest labelling. MEASURED / ESTIMATED / PROPOSED / UNVERIFIED /
  DIAGNOSTIC labels are used consistently, and no lift number is presented
  as measured. The 2% threshold, the 50%/1% masked bar, the ~10,000-template
  figure and the 100-event floor are all correctly marked as proposed or
  estimated, not as results.
- The right comparison. Same head, same stat towers, same folds, same seed
  protocol, same budget, text on vs off — plus an SVD baseline at the same
  width that the learned projection must also beat. Beating SVD but not
  stats-only, or vice versa, is correctly defined as not a win.
- Fail-loud discipline. The tower spec's §5 (absent artifact, missing
  artifact row, season-mismatched join, width mismatch → non-zero exit)
  and the ban on imputation / adjacent-season borrowing are exactly right.
  A `person_id`-only join is correctly called a bug, and person-exclusion
  in D1/D2 is by `person_id`, not by row or by name.
- No conflation of spaces. The 768-d vs 128-d Matryoshka retention
  (0.0732 / 0.0739 ≈ 99.1%) is correctly treated as a twin-agreement
  diagnostic that does NOT prove forecast retention, and D2 is correctly
  reported as NOT COMPUTABLE until a predictor head that outputs an
  embedding exists — not approximated from the 14-d stat forecast.
- Arithmetic checks out. 30 × 1,230 × 593 = 21,881,700 ≈ 21.9M raw events;
  21.9M / 10,000 ≈ 2,190× (≈2,200× claimed); the range 21.9M / 15,000 ≈
  1,460× to 21.9M / 2,000 ≈ 10,950× matches the claimed ~1,500×–11,000×.
  Width arithmetic is correct: 73 + 33 = 106; 143 + 33 = 176.
- The mask rule is honest about its cost. Early seasons will be heavily
  masked if PBP coverage starts late, and the design says so plainly
  instead of hiding it behind imputation.

None of that rescues the five risks below. The design is well-written
about its own uncertainties — which is precisely why those uncertainties
must be closed before synthesis treats the design as settled.

---

## Lens 1 — Jeremy Howard (pragmatist: simplest thing that works first)

### Verdict: NEEDS-REVISION

**The pilot is runnable in principle and is the right next step — but as
specified it is too loose to settle the one question it exists to settle,
and the 100-event floor and 2% threshold are sane as targets but not yet
sane as pass/fail bars.**

**Is the pilot actually runnable on Hatch?** Plausibly, for the embedding
step alone — and the design is right to claim only a call-count reduction,
not a wall-clock time. 10,000 short-template forward passes through a
300M-parameter embedder in batches is a small job on any modern CPU;
even 100,000 templates would likely still fit inside a generous CPU
budget. The sparse counting over ~21.9M events is integer work, and SVD
on 12,966 × 768 is routine. What is NOT established is everything the
pilot presupposes: EmbeddingGemma weights availability on Hatch is
UNVERIFIED (design Q5), measured batch throughput is UNVERIFIED, and no
install or download is authorized by the design. The "half-day of Hatch
CPU" pilot gate is an arbitrary line with no stated consequence curve —
if extrapolation says 13 hours, is that a fail, or a "run it overnight"?
A pilot that can be argued either way after it runs is not a gate.

**What the pilot honestly proves — and what it does not.** The 5-game
pilot proves: the §1.3 normalization code runs, the on-disk PBP schema
fields are as assumed, template counts on 5 modern opening games, and
measured templates/second plus peak memory. It proves nothing about the
30-season template count, the floor distribution, era coverage, or
validation lift — and the design says so (§8.3). Synthesis must preserve
that boundary in writing: a good 5-game pilot must not be quoted later
as evidence for the 2,200× figure. The 2,200× figure itself rests on the
weakest number in the document (see Risk 1).

**What I would CUT first.** The design already cut the right things
(2-layer MLP and auxiliary alignment deferred, default off). I would cut
further for the first cut, in this order: (1) width tuning {16, 32, 64}
→ 32 only until a headline lift exists at 32; tuning width on validation
folds before any lift is demonstrated is multiplicity spent before there
is a signal; (2) the 50/200 floor sensitivity → report floor 100 only
for the first headline, with sensitivity as a follow-up once a lift is
claimed; (3) the second-head sensitivity run (Q7) → one head for the
first claim; (4) storing both 768-d and 128-d rollups as standard
practice → 768-d only, 128-d only if a storage/CPU constraint forces it
(the design already says a switch must re-run the protocol; storing both
by default pays storage and confusion costs for a diagnostic). What I
would NOT cut: the masked ablation, the SVD baseline, or the per-fold /
per-stat / new-player-slice reporting — those are the claim itself.

**The 100-event floor: sane direction, unmeasured number.** The rationale
("a few games typically accumulate hundreds of primary-actor events") is
ESTIMATED from ~593 actions/game spread across ~20 players, not measured
on a real season distribution. It ignores skew: primary-actor events are
heavily concentrated in starters, and the floor counts primary-actor
events only, so assist-role volume does not count toward it (the design
is ambiguous on whether assist-role events ever count — see M4). Worse,
the floor interacts with the new-player slice in the wrong direction:
new players are disproportionately low-minute players, so the floor may
mask exactly the cold-start rows where a text style signal is supposed
to help most, then the "slice must not regress" check (§3.6) is run on
the surviving, higher-minute subset. A floor that silently redefines the
slice it is supposed to protect is not a neutral preprocessing choice.

**The 2% threshold: sane as a target, not yet as a bar.** 2% mean relative
MAE reduction across 14 stats is a reasonable ambition for one auxiliary
tower — neither trivially passable nor impossibly large. But as a
pass/fail rule it is missing the uncertainty machinery: no paired
confidence interval, no statement of seed spread relative to 2%, no
accounting for multiplicity (width × floor × auxiliary-loss tuning, all
on the same validation folds), and a per-fold "each fold ≥ 0%" rule that
lets one noisy fold veto a real lift or, conversely, lets a lucky fold
carry a headline built on 948 + 500 validation rows. A 2% mean can also
hide per-stat regressions (e.g. scoring stats up, rebounding down) that
the per-stat tables will show but the headline will not punish. Until
§3.7 gains a paired-bootstrap interval and a rule for per-stat
regressions, 2% is a target to aim at, not a gate to pass through.

**Howard's bottom line:** start with the pilot, but tighten it (weights
check, throughput + memory, audited template samples, a stated
consequence for missing the half-day line) and simplify the first claim
(32 only, floor 100 only, one head) before synthesis locks the protocol.

---

## Lens 2 — Ilya Sutskever (first principles / scale: style vs identity, time, scale)

### Verdict: NEEDS-REVISION

**The design does not yet prove playing STYLE rather than player IDENTITY,
mean-pooling discards exactly the temporal structure the text carries,
and three scale effects are underestimated. The masked ablation as
specified is close to vacuous, and that is the single most important
finding in this review.**

**The masked ablation may be a no-op.** Read §1.3 step 1 against §6.2
together: the BASE template construction already "replace[s] every player
name with a role token: ACTOR / ASSISTOR / FOULED / FOULER." The §6.2
"second set of templates and rollups with ALL player names masked" then
adds, on the face of the text, only jersey-number removal and the
(re-stated) ban on embedding `personId` values — plus a stricter
team-masked sensitivity reported alongside. If the base rollup is already
name-free, the primary masked ablation cannot measure what the design
claims it measures ("lift that survives name masking"). What differs
between the base and masked rollups must be stated exactly — team
abbreviations, jersey numbers, and anything else — or the 50% retention
bar is measuring the removal of jersey/team tokens, not the removal of
identity. Synthesis must not carry forward a 50% bar for an ablation
whose treatment is undefined.

**Even a well-defined masked ablation is insufficient to prove style.**
Masking names removes the most obvious identity channel, not identity.
A player's count distribution over templates IS a fingerprint: shot-type
mix, foul tendency, rebounding role and creation role are precisely what
make a star recognizable, and the forecast head also sees the stat towers
— so a style fingerprint can be mapped by the head back to a memorized
player history even with names gone. The design names this residual
honestly ("team context, role combinations, and rare play patterns can
still identify a star") but then keeps the 50%/1% bar as the pass
condition anyway, with only a "downgrade to style-plus-context" if the
stricter ablation collapses. That ordering is backwards: the burden is
to show the signal helps where identity cannot — on players the model
has not memorized. The bars themselves are fragile as ratios: if
unmasked lift is 2.1%, masked lift of 1.05% passes BOTH bars (50%
retained, ≥1% absolute) while sitting squarely inside plausible seed
noise; if unmasked lift is 8%, masked lift of 3.9% fails the ratio bar
while being a large, real effect. A ratio bar without an absolute
uncertainty interval and without a new-player-slice condition does not
prove what it claims.

**What would prove style (falsifiable, in order of strength):**
(1) masked lift on the new-player slice specifically — players with no
earlier-season row in the fold's training portion, where memorized
history cannot explain a win; (2) a person-disjoint check — masked
rollups evaluated on players held out entirely from projection training
and head training, not just season-held-out; (3) the team-masked
sensitivity as a reported requirement, not an optional alongside. Until
(1) is a pass condition, any "style" claim must be worded as
"style-plus-context, identity not excluded."

**Mean-pooling destroys temporal and order information — by design, and
without a test that the loss is harmless.** A count-weighted mean over a
season discards: within-season trajectory (role change after a trade,
return from injury, rookie development across months), sequencing
(play-type transitions, e.g. what follows a steal), matchup and lineup
context, game state (clutch vs garbage time — score and clock are
deliberately stripped in §1.3 step 2, so a bench scorer feasting in
garbage time and a rotation scorer in close games can produce similar
rollups), and dispersion (a player with a bimodal play mix vs a
consistent one can share a mean). The design's defence — "PBP order
inside a season is game order, not a style signal the forecast head
needs at season granularity" — is an assertion, not a result, and it
sits uneasily next to the program's own JEPA direction, where order is
the entire object. Two further pooling losses are unacknowledged:
(a) frequency dominance — the mean is dominated by the most common
generic templates (routine rebounds, common fouls, free throws), which
can drown rare but style-defining templates; no rarity weighting
(TF-IDF-style or otherwise) is considered even as a diagnostic;
(b) magnitude loss — after L2 normalization the rollup carries no
volume information, and `n_events` is an audit field in the artifact,
not a model input under the spec's `cat([proj·m, m])` join, so the head
cannot distinguish a 100-event rollup from a 5,000-event one except
through the mask bit.

**What breaks at scale (30 seasons) that the design underestimates:**
(1) Vocabulary and schema drift — PBP phrasing, `actionType`/`subType`
taxonomies and description conventions change across eras and providers;
a template key that is stable in 2026-27 may fragment or, worse,
silently merge distinct plays in earlier eras. The 2,000–15,000 template
range assumes a stable taxonomy it has not verified. (2) The per-fold
template dictionary (§6.3) creates an era-coverage cost the design
accepts but does not quantify: templates that first appear in
validation/test seasons map to UNK, so era-specific play types are
systematically zeroed exactly where the model is being evaluated.
(3) Embedding-domain drift — EmbeddingGemma is a modern-text model;
its geometry on abbreviated, era-specific PBP shorthand is unmeasured,
and the 99.1% Matryoshka retention number says nothing about this
because it was measured on twin agreement, not on era-shifted text.
None of these kills the design; all three mean the first measured
template count must come from a full real season spanning an era
boundary, not from 5 opening games.

**Ilya's bottom line:** the forecast-lift question is the right question,
but the design's style claim currently rests on an ablation that may not
differ from its baseline and cannot exclude identity even if it does.
Fix the ablation's definition, add the new-player masked condition, and
either test an order/dispersion statistic against the mean or explicitly
record mean-pooling as a known information loss with a named follow-up.

---

## Lens 3 — Andrej Karpathy (data engine: coverage, dedup, joins)

### Verdict: BLOCKED

**Blocked for any embedding run and for any bulk-collection commitment —
not blocked for coordinator synthesis, provided synthesis writes the
inventory gate in as a hard precondition (see the synthesis judgment).
As a data design, this document rests on 5 games out of ~36,900
regular-season games, on an unverified schema mapping, and on a template
key that is still an open question. That is a data-gated design, and
synthesis must label it as such.**

**What the pilot honestly proves.** Almost nothing about the design's
core numbers. Five 2026-27 opening games are the best-case modern
schema: current taxonomy, current description conventions, complete
fields. They cannot speak to: per-season PBP availability or
completeness (which seasons have PBP at all, which games are missing
or truncated, whether descriptions are present on all actions),
`personId` role semantics in earlier eras, template-count growth across
eras, or the floor distribution. The design is candid about this
(§5, §8.3, Q4) — the failure would be synthesis or a later reader
treating the pilot as validation of the 30-season numbers. The pilot's
honest yield is narrow and valuable: normalization code that runs,
measured throughput/memory, and audited template samples. Nothing more.

**Template dedup risks — the key is the design, and the key is open.**
Q1 is not a footnote; the template count, the rollup meaning, and the
CPU story all depend on it, and the design leaves it as "text PLUS
structured fields, exact construction open." Each choice has a failure
mode the design does not yet guard against:
- Collapsing templates that differ only by context: stripping score and
  clock removes garbage-time vs clutch context (a real style
  distinction — who creates late, who pads leads); stripping team
  removes opponent and system context; bucketing shot distance removes
  the difference between a 24-foot pull-up and a 28-foot heave if both
  land in one bucket. The design keeps shot type, distance bucket,
  make/miss and foul/rebound/turnover types, which is the right instinct
  — but the bucket boundaries and the qualifier handling ("step back",
  "fadeaway", "putback", "tip") are never specified, and punctuation /
  whitespace stripping can merge distinct qualifiers if applied blindly.
- Splitting templates that should merge: if team abbreviation, shot
  zone and coordinate bucket all enter the key, the template count
  explodes along exactly the axes the dedup was meant to collapse, and
  the 2,200× figure evaporates. If they do not enter the key, the
  structured fields are carried "alongside" the text in a way the
  rollup never explains — are they embedded, counted, or ignored?
- Role-token mapping: ACTOR vs ASSISTOR vs FOULED/FOULER depends on
  Q2's unverified `personId` role semantics. If the on-disk schema
  marks involved players differently from what the design assumes
  (e.g. a second `personId` field, or assist credit stored elsewhere),
  primary-actor counts — and therefore the floor, the mask, and the
  rollup itself — are wrong in a way that looks clean downstream.
  The required check is cheap and must precede any embedding: inspect
  one on-disk game field by field, document the mapping, and audit
  ~100 random normalized templates against their originals with a
  human-readable diff.

**The `personId` join and the new-player-slice mapping are unresolved
at the exact seam where leakage happens.** Three gaps, in order of
danger: (1) Format — the spec requires `person_id` as a string array,
but the design never confirms the on-disk PBP `personId` type/format
matches the vectors `person_id` (string vs int, leading zeros, any
re-keying across eras), nor that one person maps to one id across all
30 seasons (merged/duplicate ids for the same player would break both
the join and the person-exclusion in D1/D2). A join-rate report
(fraction of stat-matrix rows matched, fraction of PBP events matched,
unmatched ids listed) is required and is currently absent from the
spec's run-report fields. (2) Forecast-sample mapping — CONTRACT §2a
defines the new-player slice on single rows (no earlier-season row in
the fold's training portion), but a forecast sample spans input season
S → target S+1. Is a player "new" if S is their debut season, if they
have no row before S, or if they have no row in the fold's training
portion regardless of S? The design correctly refuses to silently
redefine this (Q3) — but until the split lane confirms the mapping,
every slice table is uninterpretable and the §3.6 "must not regress
the slice" gate cannot be evaluated. (3) Era masking meets the slice:
if pre-coverage seasons are masked, "new" players from masked eras
enter the slice with zero text, and the slice metric mixes
"no text available" with "text did not help."

**The data check I demand before any embedding run (all four, no
partial credit):**
1. Scope A inventory + gap report: per-season PBP game counts vs the
   1,230-game anchor, action counts, description-presence rate, and
   `personId` coverage, for all 30 seasons — measured, not estimated.
2. One full real season normalized under BOTH key variants (text-only
   vs text + structured fields): exact raw count, exact unique count
   per variant, and the resulting template-growth curve — this
   replaces the 2,000–15,000 estimate with a measurement and pins Q1.
3. Join validation on that season: PBP `personId` → vectors `person_id`
   match rate, unmatched-id list, and the measured floor distribution
   (what fraction of player-seasons fall below 50 / 100 / 200 events,
   overall and on the new-player slice).
4. Pilot gate as tightened in Lens 1: weights available on Hatch (or a
   named alternate machine), measured templates/second and peak memory
   on the 5 on-disk games, and a 100-template audit (original vs
   normalized, role-token correctness) signed off before bulk work.

Until (1)–(3) land, the design's numbers are placeholders with good
labels — and synthesis must not promote them to premises for the
training lane, the width decision, or any timeline.

**Karpathy's bottom line:** the data engine is not built yet. The design
knows what it does not know, which is to its credit; the review's job
is to make sure nobody downstream forgets that. Inventory first,
embedding second, and never the reverse.

---

## Top 5 risks, in order, each with a falsifiable check

**Risk 1 — The template count (and therefore the CPU story) is a guess
built on an undefined key.**
The 2,000–15,000 range, the ~10,000 working figure and the 2,200×
reduction all assume §1.3 normalization on a stable 30-season taxonomy
that has never been run, with the key itself left open (Q1).
*Falsifiable check:* normalize one full real season under both key
variants (text-only; text + structured fields) and report exact raw and
unique counts per variant. The design's estimate is falsified if the
unique count exceeds 50,000 under either variant, or if the two variants
differ by more than 2× — in either case the key must be pinned and the
pilot gate re-run before any bulk embedding.

**Risk 2 — Identity masquerading as style, via an ablation that may be
a no-op.**
Base templates are already name-masked (§1.3 step 1), so the §6.2
masked ablation's treatment is undefined; and even a defined masked
ablation cannot exclude fingerprint identity (style distributions +
stat towers → memorized player history).
*Falsifiable check:* report masked lift separately on the new-player
slice and on a person-disjoint holdout, with a paired interval. The
style claim is falsified if overall masked lift passes while masked
new-player-slice lift is ≤ 0 (or its interval includes 0) — in that
case the tower is, at most, "style-plus-context," and no style claim
may be promoted.

**Risk 3 — Coverage illusion: 5 games standing in for 30 seasons.**
On-disk PBP is 5 opening 2026-27 games; no 2022–26 PBP needed for the
validation folds, and no 2025-26 PBP needed for the frozen test, is on
disk. Era masking, missing games and schema drift are all unmeasured.
*Falsifiable check:* Scope A inventory reporting per-season PBP game
coverage, description-presence rate, and text mask rate per era and
per fold. The design's usability for its own protocol is falsified if
any validation-fold season has < 90% game coverage or if the overall
train-fold mask rate exceeds 30% without era-stratified reporting —
in that case the headline must be era-stratified, not pooled.

**Risk 4 — Mean-pooling destroys order, dispersion and volume, and
frequency dominates the signal.**
Count-weighted means discard trajectory, sequencing, matchup/game-state
context and dispersion; generic templates dominate; L2 normalization
plus an audit-only `n_events` strips volume from the model input.
*Falsifiable check:* on one real season, report (a) the event share of
the top 20 templates and (b) split-half rollup agreement (first-half vs
second-half season rollups, mean cosine). The mean-pool first cut is
falsified as sufficient if the top 20 templates exceed 50% of events
and a rarity-weighted (or split-half) rollup variant beats the mean
rollup on validation lift — in that case the first cut must be
replaced, not merely supplemented, before promotion.

**Risk 5 — The 2% / 50% / 1% bars can pass on noise and hide regressions.**
No paired interval, no seed-spread rule, no multiplicity accounting for
width × floor × auxiliary tuning on the same validation folds, and a
mean-across-14-stats headline that can hide per-stat regressions.
*Falsifiable check:* report the validation headline as a paired
bootstrap interval across folds and seeds, plus per-stat lifts and
per-fold lifts. The win claim is falsified if the 95% interval includes
0, if seed spread exceeds the claimed lift, if any validation fold
regresses beyond seed noise, or if floor-50 / floor-200 sensitivity
flips the sign of the headline — in any of those cases §3.7 does not
pass, regardless of the point estimate clearing 2%.

---

## Ordered recommendations

### Must change before synthesis (M1–M7)

- **M1 — Make the Scope A inventory a hard synthesis precondition, not a
  parallel track.** Synthesis must record: no bulk embedding, no
  template-count claim, and no training-lane width commitment until the
  per-season inventory (Risk 3 check) and the one-full-season
  normalization (Risk 1 check) land. The 5-game pilot stays, but only
  as a throughput/code-path check.
- **M2 — Define the masked ablation's treatment exactly, and add the
  new-player masked condition.** State, field by field, what differs
  between the base rollup and the masked rollup (names already masked
  in base; so: jersey numbers, team abbreviations, and anything else).
  Add as a pass condition: masked lift on the new-player slice must be
  > 0 with its interval excluding 0, and the team-masked sensitivity
  must be reported (not optional). If that condition fails, the claim
  is downgraded to "style-plus-context" in the synthesis record.
  The 50% ratio bar applies only when unmasked lift itself clears 2%
  with its interval excluding 0; otherwise the ratio is uninterpretable
  and must not be quoted.
- **M3 — Add uncertainty machinery to §3.7.** Paired bootstrap interval
  for the headline lift (across folds and seeds), per-stat and per-fold
  lift tables as pass/fail inputs (not appendices), a seed-spread rule
  (spread must be smaller than the claimed lift), and a multiplicity
  note: every width/floor/auxiliary choice tuned on validation folds
  must be listed with the headline, and the frozen test is reported
  once, as-is, against the same threshold.
- **M4 — Clarify rollup composition in one paragraph.** Whether
  assist-role events form a separate rollup or merge into the
  primary-actor rollup; whether assist-role events count toward the
  100-event floor; whether `n_events` (or any volume signal) is a
  model input or audit-only; and that the mask multiplication in
  `cat([proj·m, m])` is applied AFTER LayerNorm (otherwise a LayerNorm
  bias gives masked rows a nonzero vector). Each answer changes the
  artifact schema or the training script, so silence is not acceptable.
- **M5 — Resolve the forecast-sample slice mapping and the join
  validation.** The split lane must confirm, in the fold-manifest
  schema, how the single-row new-player definition maps to S→S+1
  forecast samples, and the tower spec's run report must gain a
  join-rate section (stat rows matched, PBP events matched, unmatched
  ids, `personId` format confirmation, duplicate-id check). Until
  then, slice tables must state their mapping, and the slice gate
  cannot pass.
- **M6 — Tighten the pilot gate.** Weights availability on Hatch (or a
  named alternate machine), measured templates/second and peak memory,
  a stated consequence for missing the half-day line (e.g. move to
  Alienware/Mac, not "run longer"), and a 100-template audit
  (original vs normalized, role-token correctness) before bulk work.
  No install or download is authorized by this review.
- **M7 — Simplify the first claim (Howard's cut).** First headline at
  width 32 only, floor 100 only, one forecast head, 768-d rollups only.
  Width {16, 64}, floor {50, 200} sensitivity, second-head sensitivity
  and the 128-d fallback become follow-ups triggered by a headline
  lift, not part of the first claim. This reduces validation-fold
  multiplicity (Risk 5) at zero cost to the design's logic.

### Nice-to-have (do not block synthesis)

- N1 — A rarity-weighted rollup variant (and/or a split-half
  first-half/second-half rollup pair) as a named follow-up experiment
  against the mean-pool first cut, judged by the same §3.5 protocol.
- N2 — A recency-weighted within-season variant, likewise as a
  follow-up, not part of the first cut.
- N3 — Per-era mask-rate and per-era lift breakdowns in every run
  report (the design already requires mask rates; era-stratified lift
  would make Risk 3 visible in the headline tables).
- N4 — A 2-layer MLP projection variant (768→128→32) as a follow-up
  only after the linear projection beats SVD — the design already
  defers this correctly.
- N5 — Clarify tower-dropout mask-bit handling in the spec (is the
  mask bit itself dropped with the tower, or kept?) — a one-line
  training-lane clarification, not a design change.

### Explicitly NOT changed by this review

- The governance label (forecast-lift gating user-directed, pending
  panel ratification; twin diagnostics as diagnostics, not gates).
- The embargoed fold table's status (PROPOSED canonical, pending user
  confirmation) — synthesis must not harden it.
- The pinned stat width (73 vs 143 vs 130 vs 120 dispute) — the tower's
  +33 accounting is correct on top of whichever width is pinned, and
  this review does not pick a winner.
- No design doc, contract headline, eval protocol or prototype brief
  was rewritten by this review, per CONTRACT §11.

---

## Synthesis-ready judgment

**Not ready as-is; ready for coordinator synthesis only after revisions
M1–M7 are recorded in the synthesis record (as conditions and
clarifications, not as silent edits to the design docs).**

In one sentence: the design asks the right question (forecast lift, not
twin retention), with the right comparison and fail-loud discipline, but
its template count is unmeasured, its style proof is undefined-to-
insufficient, and its coverage is 5 games out of 30 seasons — so
synthesis must carry it forward as a data-gated, conditionally-specified
design, not as a settled protocol.

---

*Evidence paths: design —
`~/workspace/mlops-v2-drafts/lanes/01-data-collection/TEXT_EMBEDDING_DESIGN.md`;
tower spec —
`~/workspace/mlops-v2-drafts/lanes/04-training/TEXT_TOWER_SPEC.md`;
contract — `~/workspace/mlops-v2-drafts/CONTRACT.md` §0, §2a, §10, §11;
this review —
`~/workspace/mlops-v2-drafts/panel-reviews/TEXT_PANEL_REVIEW.md`.*

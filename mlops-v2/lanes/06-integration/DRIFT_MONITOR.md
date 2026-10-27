# Lane 6 — Drift Monitor: Monitor-Only Design for Each New Season

Status: DRAFT ONLY. Monitor-only by design.
This monitor never retrains. It never promotes. It never switches an
asset. It watches, measures, and alerts a human. A breach triggers a
human review. Nothing else happens automatically.

## 0. Principle

A new season adds about 67–98 new players (about 83 typical) and about
500 new player-season rows (recent seasons: 2022-23 = 464, 2023-24 =
484, 2024-25 = 500, 2025-26 = 491). Those rows arrive in a model that
was trained without them. Two things can go wrong:

1. The new rows sit in a different part of the space (distribution
   shift). Twins and neighbours for new players become unreliable.
2. The new rows are fine, but the world changed (a style shift in the
   league). The model is stale, not broken. Those are different
   problems with different fixes. The monitor must tell them apart
   before anyone proposes a fix.

The monitor reports facts. It does not prescribe a retrain. A retrain
is a separate decision, with its own gate, on the user's word.

## 1. When the monitor runs

- Trigger: a new season's rows arrive and are embedded (by whatever
  the current served model is — champion v5 today, v6 only after a
  passed switch). The monitor runs on arrival, once per season.
- It also runs on demand after any data refresh that changes row
  counts, and after any asset swap (to confirm the new asset's first
  measurement is sane, not to bless it).
- It does not run continuously. Season arrival is the event. Polling
  daily for a yearly event wastes attention and trains everyone to
  ignore the alert when it finally fires.
- Output: one short report per run. Silent runs still write a log
  line (date, season, verdict, metric values). A monitor with no log
  is a monitor no one can audit.

## 2. What the monitor measures

All metrics compare the NEW season's rows against the TRAINING
distribution of the served model. "Training distribution" means the
rows the served model was trained on (or, for a distilled challenger,
the rows its eval protocol designates as train). Record which row set
that is in the run report. Comparing against the wrong baseline
invalidates the run.

Baselines are recorded at promotion time (or, for the champion, at
monitor adoption time from the current served asset). This document
does NOT invent baseline numbers. Any threshold below marked
PROPOSED DEFAULT needs its baseline confirmed at adoption. A monitor
with an unmeasured baseline alerts on noise.

### 2.1 Metric M1 — Mean pairwise cosine (collapse / concentration watch)

- Definition: mean cosine similarity over a fixed random sample of
  pairs within the new season's rows, computed in the served 64-d
  space. Same sampling rule every run (fixed seed, fixed sample size,
  recorded in the report). Compare against the same statistic on the
  training rows.
- What it catches: collapse (all new rows pile into one region — mean
  pairwise cosine jumps toward 1) and scattering (new rows spread
  wider than training rows — mean drops sharply).
- PROPOSED DEFAULT alert: absolute shift vs training baseline larger
  than 0.05. Confirm against the measured baseline spread at adoption:
  if the training statistic itself varies by more than 0.03 across
  season slices, widen the band before first live use. A band narrower
  than natural season-to-season variation is a false-alarm machine.
- Also record: mean pairwise cosine at each prefix (16-d, 8-d) for the
  new rows, for the lightweight surfaces' sake. Alert on the 64-d
  value. Report the prefixes.

### 2.2 Metric M2 — Per-tower output drift (representation watch)

- Definition: for each of the 17 tower families, the mean tower output
  vector (or, for a plain-MLP challenger with no towers, the mean
  input-family vector) over the new season's rows, compared against
  the same mean over training rows. Distance: cosine distance between
  the two means, per family. Report the three largest family drifts
  by name.
- What it catches: a single input family driving the shift (e.g. a
  tracking-definition change moves the tracking family, while the
  rest of the space is stable). That pattern points at a data problem,
  not a model problem.
- PROPOSED DEFAULT alert: any single family with cosine distance
  above 0.10 vs its training mean, OR more than 5 families above
  0.05 at once. The first pattern says "one input broke". The second
  says "the league moved".
- Tower-skeleton caveat: if the served model is a plain MLP (the v6
  spec default), there are no tower outputs to measure. In that case
  measure per-family INPUT drift instead (same rule, input means),
  and say so in the report. Do not report a tower metric for a model
  with no towers. A fabricated tower number is worse than a missing
  one.
- Mask check (goes with M2): for the new season, report the share of
  rows with each family masked (tracking, form, and the rest). A mask
  share that jumps vs training (e.g. tracking suddenly masked for a
  full season) is itself an alert, even if the means look stable —
  masked rows carry the mask signal, and the mask can leak era (Lane
  2 / Lane 5 concern). Record the mask shares every run.

### 2.3 Metric M3 — New-player-slice top-1 (cold-start watch)

- Definition: for new-season rows whose `person_id` has NO earlier
  row in the training set (the cold-start slice, contract §2a), run
  adjacent-season retrieval the same way the eval protocol does —
  except a true rookie has no adjacent season. So measure instead:
  for each new-player row, its nearest neighbour in the training set
  by 64-d cosine, and the share of those neighbours that fall in the
  same broad style cluster (k = 8 cluster, or archetype assignment)
  as a human-readable sanity proxy — plus the mean nearest-neighbour
  cosine for the slice.
- Honest limit: there is no ground-truth twin for a rookie. M3 is a
  plausibility check, not an accuracy score. Report it as such. A
  monitor that claims rookie accuracy it cannot measure will be
  believed once and then ignored forever.
- PROPOSED DEFAULT alert: mean nearest-neighbour cosine for the
  new-player slice more than 0.10 below the training rows' mean
  nearest-neighbour cosine, OR the slice's mean below the 5th
  percentile of the training distribution. Either pattern says new
  players land far from everyone — their twins and comps are guesses.
- Also record: new-player count for the season, and the share of the
  season's rows that are new players. A season with 98 rookies needs
  more scrutiny than a season with 67, even at identical metric
  values.

### 2.4 Metric M4 — Twin-band stability (product watch)

- Definition: recompute the twin-band terciles on the new season's
  twin pairs (new rows' nearest neighbours, whole person excluded)
  and compare against the served bands.
- What it catches: product drift. Even if M1–M3 look fine, a band
  shift means the words "strong twin" now mean something different
  than they did at promotion. The product changed while the model
  stood still.
- PROPOSED DEFAULT alert: either cutoff moves by more than 0.03, or
  the share of new pairs landing in "strong" moves by more than 10
  percentage points vs the promotion-time share.
- Action on alert: human review of the band question only (see §3).
  Do NOT auto-update the served bands. Band changes are product
  changes. They ship with the checklist, not with the monitor.

### 2.5 Metric M5 — Era-shift check (leakage watch)

- Definition: for a sample of new-season rows, artificially mask one
  modern-only family (tracking, the Lane 5 mask-ablation era test)
  and measure how far each row's nearest neighbours shift in era.
  Report the era-shift rate: share of rows whose top neighbour's
  decade changes under masking.
- What it catches: mask-as-era-signal. If masking tracking throws a
  modern player into the 1990s, the space leans on the mask, not on
  play style. New seasons with different mask patterns expose this
  fastest.
- PROPOSED DEFAULT alert: era-shift rate above 25% on the new-season
  sample, or more than 10 points above the promotion-time rate.
- This metric runs on a sample (fixed seed, at least 200 rows) to
  keep the run cheap. Record the sample size. A rate without a sample
  size is not a measurement.

## 3. Alert thresholds — summary table

Thresholds are PROPOSED DEFAULTS until baselines are measured at
adoption. The adoption run must record the baseline values and confirm
or revise each threshold in writing. An unconfirmed threshold still
alerts — but the report must label it UNCONFIRMED so the reviewer
weights it correctly.

| Metric | Alert when | Severity |
|---|---|---|
| M1 mean pairwise cosine | \|shift vs training\| > 0.05 | Review |
| M2 per-tower / per-family drift | Any family > 0.10, or > 5 families > 0.05 | Review (single family: suspect data; many families: suspect league shift) |
| M2 mask shares | Any family mask share jumps > 10 points vs training | Review |
| M3 new-player slice | Mean NN cosine > 0.10 below training mean, or below training p5 | Review |
| M4 twin bands | Either cutoff moves > 0.03, or "strong" share moves > 10 points | Review (bands only; no auto-update) |
| M5 era shift | Era-shift rate > 25%, or > 10 points above promotion rate | Review |

Severity levels: there is only one severity — Review. The monitor
does not grade breaches into "auto-fix" tiers, because no tier of
breach earns an automatic fix. A bigger breach earns a faster human
review, not a different machine action.

## 4. What a breach triggers (and what it never triggers)

A breach triggers exactly one thing: a human review, with this packet:

1. The run report (season, row counts, new-player count, all five
   metric values with baselines and thresholds).
2. The top-3 drifted families (M2) or the affected slice (M3), so the
   reviewer starts at the cause, not at the metric.
3. Five example rows illustrating the breach (nearest neighbours
   before / after, or band labels before / after). Abstract numbers
   do not get reviewed well. Examples do.
4. The recommended review question, stated plainly: "Is this a data
   problem, a league shift, or a model failure?" The reviewer answers
   that question. The monitor does not.

A breach NEVER triggers:

- A retrain. Retraining needs its own gate and the user's word.
- A promotion. Promotion needs a held-out win plus the user's
  separate word.
- A rollback. Rollback is a human decision (see §5). Auto-rollback
  on a noisy metric would take the site down for a false alarm.
- A band update, a threshold update, or any served-file write. The
  monitor reads. It does not write to served assets. Ever.

If the review concludes the breach is a false alarm (threshold too
tight, sample too small, one-off season shape), the reviewer records
that conclusion and revises the threshold in writing. The revision
applies to future runs. It does not rewrite the past run's report.

If the review concludes the model is stale or broken, the next step
is a proposal (retrain, challenger, or rollback), not an action. The
proposal goes to the user. The monitor's job ends at the review
packet.

## 5. Rollback procedure (one-command revert, human-initiated)

Rollback returns the site to the champion asset plus the prior
thresholds. It is a human decision, executed by one command. The
command itself is written and tested by the coordinator at switch
time (this lane writes docs only, so it specifies the command's
contract here, not the script).

### 5.1 The rollback bundle (frozen at every switch)

Contents, all versioned, all sha-recorded:

- Champion asset: `assets/mtnn_embeddings.f32` + sha256.
- Served constants: `assets/served-constants.js` (bands, percentile
  table, badge values).
- `assets/twin_bands.json`, `assets/twin_explainer.json`,
  `assets/eratwins.json`, `assets/peers_top8.json`.
- `assets/scoring_lite.f32` + `assets/scoring_lite_index.json`.
- `assets/projections/embed3d.json`, star-twin library, archetype
  assignments.
- The rollback column of RECALIBRATION_CHECKLIST.md for that switch
  (every prior threshold and value, in one place).
- The switch report that authorized the switch (asset tag, date,
  approver). Rollback without knowing what you roll back to is just
  a second unplanned switch.

### 5.2 The revert command (contract)

One command, run by a human, that:

1. Restores every file in §5.1 from the bundle to root AND to
   `public/` (byte-for-byte mirror — a root-only restore serves two
   models at once).
2. Verifies after restore: champion asset sha matches the bundle sha;
   served band values match the rollback column; probe answers
   (fixed probe targets, recorded at switch time) return the
   champion-space answers.
3. Prints PASS or FAIL. On FAIL, it prints which file mismatched and
   stops. A half-restored site is worse than a slow restore.
4. Writes a log entry: date, reason, bundle sha, verification result.
   The log entry is the audit trail. Without it, the next reviewer
   cannot tell whether the site serves v6 or the champion.

Command shape (contract, not code — the coordinator implements it):

```
rollback-to-champion --bundle <bundle-sha> --verify-probes
```

No flags for partial rollback. A partial rollback (e.g. bands only,
asset unchanged) is not a rollback. It is a new, untested
combination of two models' outputs. If only one file looks wrong,
fix that file through the normal checklist path, not through this
command.

### 5.3 After rollback

- The site serves the champion again, with champion bands, champion
  pairs, and champion answers. Confirm with a cache-busted live
  fetch, exactly as the switch verification did. A rollback is not
  complete until the live fetch confirms it.
- The failed model stays versioned under its own filename. Rollback
  does not delete it. Deleting a failed challenger destroys the
  evidence about why it failed.
- The review packet that triggered the rollback is filed with the
  rollback log. The next challenger proposal must address it.

## 6. Monitor run report (template)

```
Season: ____  Rows added: ____  New players: ____
Served model: ____ (asset tag + sha256)
Training baseline set: ____ (row set + date measured)
M1 mean pairwise cosine: new ____ vs train ____ (shift ____) — PASS/ALERT
M2 top drifted families: ____, ____, ____ — PASS/ALERT
M2 mask shares: tracking ____ / form ____ / other ____ — PASS/ALERT
M3 new-player mean NN cosine: ____ vs train ____ — PASS/ALERT
M4 band cutoffs recomputed: ____ / ____ vs served ____ / ____ — PASS/ALERT
M5 era-shift rate: ____ (n=____) vs promotion ____ — PASS/ALERT
Verdict: CLEAR / REVIEW (list breached metrics)
Reviewer (if REVIEW): ____  Conclusion: ____  Threshold changes: ____
```

A CLEAR run still files the report. The filed CLEAR runs are what make
a future ALERT meaningful — without a history of clears, no one knows
whether an alert is unusual or routine.

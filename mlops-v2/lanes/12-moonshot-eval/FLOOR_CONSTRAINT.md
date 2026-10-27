# Twin Quality as a Floor Constraint — Lane 12 (DRAFT)

Status: DRAFT ONLY. Spec finalization waits for the panel's moonshot
verdict (CONTRACT.md §11, §13). No training runs, no merges, no
production writes, no execution on real data in this pass.

Headline framing (user-directed 2026-10-26 22:32 CDT, PENDING PANEL
RATIFICATION): forecast accuracy is the headline; twin quality is
a FLOOR constraint, not the goal. This document defines that floor.
It does not set the forecast gate — that lives in BASELINES.md —
and it does not authorize any product switch.

## 1. The rule in one paragraph

Atlas, Daily Court, and Twenty Questions keep running on the v5
twin space (MTNN v5, 64-d, champion asset, pinned) until a
forecast-first model clears the twin floor defined in §3. Clearing
the floor does not switch the product: a switch still needs the
user's separate word, plus the rollback plan in §5. Missing the
floor does not kill the forecast model: it stays research-only FOR
TWIN PURPOSES, while its forecast service (if it clears the
forecast gate in BASELINES.md) is judged separately. The two gates
are independent — a model can clear one without the other, and the
report must say which it cleared.

## 2. When the floor applies, and when it does not

- The floor applies to a CANDIDATE TWIN SPACE: any model (or
  auxiliary contrastive head of a forecast-first model) proposed
  as a replacement for the v5 twin space on a product surface.
- The floor does NOT apply to a forecast-only model: a model that
  produces next-season 14-d forecasts and no twin space never
  triggers a product switch, so there is nothing to floor-check.
  Its twin-metric block is null with the reason "no twin space
  produced", never 0, and never a floor failure.
- The floor is evaluated with Lane 5's eval protocol
  (EVAL_PROTOCOL.md) and script, same code path for champion and
  candidate, exhaustive retrieval, self excluded, pessimistic
  ties, person_id identity. It is never evaluated against old
  anchor numbers: champion top-1 anchors disagree with each other
  across protocols (0.118 vs 0.438 vs 0.5081, Lane 5 §14 C4), so
  the floor compares candidate vs champion measured IN THE SAME
  RUN, on the same rows, under the same protocol.

## 3. Which twin metrics constitute the floor

All of the following, measured at 64-d (the serving width), on BOTH
val folds AND the frozen test. A floor check on val only, or on the
frozen test only, is incomplete.

1. Adjacent-season top-1 retention: candidate top-1 divided by
   champion top-1, same run, same cohort.
2. Adjacent-season recall@10 retention: candidate recall@10
   divided by champion recall@10, same run, same cohort.
3. Continuity spread: candidate `continuity_spread_global`
   (Lane 5 §4.2: max − min over modern boundary means, lower is
   better) compared with the champion's, same run.
4. Collapse watch: nearest-neighbour cosine stats (Lane 5 §4.3).
   A collapsed space fails the floor regardless of its retrieval
   numbers.
5. Era-leak test: the mask-ablation era test (Lane 5 §9). A fired
   leak flag fails the floor regardless of retrieval numbers.
6. Twin agreement vs champion (diagnostic floor component):
   hit-rate@10 of the candidate's top-10 sets against the
   champion's freshly computed 64-d top-10 sets (Lane 5 §4.4).
   This is a transfer diagnostic, not a beat-bar: by the
   distillation ceiling (Lane 5 §7), a model trained on v5's twins
   cannot beat v5 on agreement, only match it. The floor value
   below is therefore a "did it transfer" bar, not a "did it win"
   bar.
7. Spot check (required only when a product switch is actually
   proposed, not for a research-only floor report): the 20
   held-out Daily Court twin-quality spot checks (Lane 5 §11).

Proposed floor values (ALL PROPOSED, pending the user's
confirmation — none is a measured result, and none is adopted
until the user confirms it at spec finalization):

- Top-1 retention ≥ 0.90 on every val fold AND the frozen test.
- Recall@10 retention ≥ 0.90 on every val fold AND the frozen test.
- Continuity spread ≤ 1.10 × the champion's spread (same run).
- No collapse flag on any val fold or the frozen test
  (top-1 cosine mean < 0.99 and std > 0.01, Lane 5 §4.3).
- No era-leak flag (Lane 5 §9.4: tracking/form shift share minus
  control shift share ≤ 0.20, or absolute 0.30 without a control).
- Twin-agreement hit-rate@10 ≥ 0.05 on the frozen test (Lane 5's
  "did not transfer" flag threshold, adopted here as the floor
  value; random is ≈ 0.0008, so 0.05 is ~60× random, not near-random).
- Spot check, when a switch is proposed: ≥ 17/20 PASS with zero
  HARD-FAILs (self-twin or same-name wrong-person twin, Lane 5
  §11.3). One HARD-FAIL fails the switch proposal outright.

An additional floor component is NAMED but NOT quantified here,
because no number for it exists in any delivered doc: panel
Addendum III's M0 gate of "archetype-neighborhood preservation"
plus a product check (surfaces still work and delight). That
component must be defined with a metric and a threshold at spec
finalization; until then it is recorded as an open definition, not
papered over with an invented number.

## 4. What happens if the floor is missed vs cleared

If the floor is MISSED (any component in §3 fails on any required
cohort):

- NO product switch. Atlas, Daily Court, and Twenty Questions
  keep serving the v5 twin space, unchanged, on the pinned
  champion asset.
- The candidate is RESEARCH-ONLY for twin purposes. It keeps its
  versioned filename and is never pointed at by a product surface.
- The miss does NOT cancel the forecast track: if the same model
  clears the forecast gate (BASELINES.md), its forecasts may still
  be served through the forecast service, which does not serve
  embeddings. The report states both verdicts side by side so a
  reader cannot mistake a forecast win for a twin win or vice versa.
- The miss report names the failed component(s), the cohort(s),
  and the measured numbers. "Close" is not a clear, and a
  single-cohort pass is not a floor pass.

If the floor is CLEARED (every component in §3 passes on every
required cohort):

- Still NO automatic switch. A product switch needs the user's
  SEPARATE word after the floor report, plus the spot check (§3
  item 7) if not already run, plus the rollback plan (§5).
- Clearing the floor is necessary but not sufficient for a switch:
  the user decides with the floor report, the forecast report, and
  the spot-check table in front of him. No script, lane, or
  coordinator switches on its own.
- A cleared floor does not retroactively bless earlier
  research-only numbers: the switch proposal re-states the exact
  asset filename + sha256, the exact floor numbers, and the exact
  surfaces affected, so the decision is auditable.

## 5. Rollback (required before any switch, per CONTRACT.md §2e)

- The champion asset stays pinned and untouched; the switch
  proposal names the one-command revert to the champion asset +
  prior thresholds (Daily Court thresholds, twin bands, era
  twins, difficulty bands — all re-derived values listed, not
  assumed to transfer).
- If a switched surface degrades in production, the revert is
  executed and the candidate returns to research-only. The floor
  report is kept as the record of what was claimed at switch time.

## 6. Contract conflicts and notes (reported, not silently resolved)

- C1: contract §2a prints Fold 2 val as 984 rows; Lane 3 implements
  500. The floor is evaluated per cohort from the manifest's own
  season lists, so it scores correctly under either figure — but
  a floor report must state which manifest it used, and 984 must
  be amended before any gated run.
- C2: contract §2d's original promotion gate ("beats the champion
  on ALL primary metrics") vs this floor's retention framing
  (≥ 90% of champion). These are different bars for different
  jobs, and that difference is intentional under the 22:32
  correction: the old gate judged a challenger fighting to REPLACE
  v5 as a better twin space; the floor judges a forecast-first
  model that must merely NOT BREAK the twin product if its space
  is ever used there. The old gate still applies, unchanged, to
  any model proposed as a strictly-better twin replacement
  (CONTRACT.md §7 gate scoping); the floor applies to
  forecast-first candidates. A report must state which bar it
  applied. If the panel rules that one bar should replace the
  other, the amendment happens at spec finalization, not here.
- C3: twin agreement as a floor component inherits Lane 5's
  distillation-ceiling caveat: for a candidate trained with v5
  twins as positives, agreement measures transfer, not quality
  beyond v5. For a forecast-first candidate trained WITHOUT v5
  twin positives, low agreement is not automatically a failure of
  the model — it is a failure of the floor for product-switch
  purposes only (the candidate's twins would change the product's
  answers). The report must state whether the candidate used v5
  twin positives, so the agreement number is read correctly.

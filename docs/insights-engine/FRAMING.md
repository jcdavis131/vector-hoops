# Freakonomics-Grade Framing Guide

The bar for any insight that ships on Vector Hoops. Adapted from Cameron's
research-taste frame: *counterintuitive questions about incentives and biases,
grounded in data, answered with real numbers, honest controls, and explicit
invalidators — never vibes.*

## The five-part anatomy

Every shipped insight carries all five. The curation queue (`queue.py frame`)
requires the title + at least one invalidator before approval is possible.

1. **The counterintuitive question.** State the puzzle the reader *thinks* they
   know the answer to, then break it. "The best shooter in history..." is not a
   question. "Why does the data say the most-copied player in NBA history is
   someone you never heard of?" is.
2. **The real numbers.** Exact values with units, the population they came
   from, and the gate that selected it. "61 twin-set appearances across 12,966
   player-seasons" — not "a lot".
3. **The mechanism, in plain words.** One paragraph: *why* this happens, in
   language a smart non-technical fan understands. No jargon without a
   translation in the same sentence.
4. **The invalidators.** At least one explicit "this claim dies if...".
   Examples: a metric definition quirk ("counts appearances, not similarity
   strength"), a selection effect ("the gate excludes low-minute players"),
   a data vintage ("through 2025-26; 2026-27 could move it").
5. **The honest comparison.** The base rate or the baseline the number beats.
   A +8.6 playoff swing means nothing without "the average qualified scorer
   moves −0.4".

## What fails the bar

- A number with no population ("players who..." — which players? how many?).
- A superlative the data doesn't support ("the greatest ever" from a top-10
  sample of one metric).
- A story that needs the numbers to be different than they are. If the honest
  framing is boring, the insight doesn't ship — the numbers don't get
  massaged.
- Vibes about *why* with no mechanism the data can check. "Clutch gene" is
  not a mechanism; "usage concentrates on stars against playoff defenses" is
  checkable.

## Worked example: the twin-centrality candidate

Mined 2026-10-20 by `scripts/insight-miner/miner.py` (module `twin_centrality`).
All numbers below are real, from `assets/twin_centrality.json`
(sha256 in the candidate's provenance record).

- **Question:** Why are the most-copied players in NBA history the ones nobody
  remembers?
- **Numbers:** Charles Cooke's 2017-18 season appears in 61 other players'
  top-10 twin lists — the most of 12,966 player-seasons. The rest of the top 5:
  Devin Green '05-06 (56), Deng Adel '18-19 (42), Michael Frazier '19-20 (39),
  Ryan Broekhoff '18-19 (37). Zero All-Stars in the top 10.
- **Mechanism (plain words):** Twins are nearest neighbors in the 64-d
  embedding space. The players who appear in the *most* twin lists sit near
  the statistical center of the league — the average NBA wing, the average
  NBA guard. Stars are outliers; almost nobody is near an outlier. Role
  players are near *everyone*.
- **Invalidators:** (1) Twin Centrality counts neighbor-set *appearances*,
  not similarity strength — a weak 10th-place appearance counts the same as a
  1st. (2) Two-way/10-day players churn through many team contexts, which may
  inflate their centrality; the count doesn't control for that.
- **Honest comparison:** The median player-season appears in 9 twin lists;
  Cooke's 61 is ~6.8× the median (computed from all 12,966 counts in
  `assets/twin_centrality.json`, 2026-10-20).

Framed title: "The most-copied players in NBA history are the ones nobody
remembers." Lede: "Charles Cooke's 2017-18 season appears in 61 other players'
top-10 twin lists — more than any star. The twins that recur are statistical
averages, not legends."

## Framing score (optional, `queue.py frame --framing-score`)

0–10, editor's judgment: does the framed piece hold all five parts without
strain? Below 7: reframe or reject. This is a judgment call, not a metric —
record it so future editors can see what the bar looked like.

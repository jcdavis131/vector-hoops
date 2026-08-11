# Hill-climb round 1 at dim 64 is not decision-grade

**2026-08-11.** `hill_climb --mode families --seeds 7,13 --epochs 20 --arch-dim 64`,
13 of 18 families measured. Recorded because the result is a negative one and
negative results get re-derived if nobody writes them down.

## What the climb printed

Incumbent `cqs 72.28  test 0.740  purity 0.7358`.

    mask playoffs     +1.73  test 0.848  purity 0.7172   passes guards
    mask honors       +1.62  test 0.842  purity 0.7139   guard
    mask roster       +1.52  test 0.857  purity 0.7156   guard, by 0.0002
    mask market       +1.41  test 0.848  purity 0.7087   guard
    mask form         +1.10  test 0.830  purity 0.7138   guard
    mask playmaking   +0.98  test 0.844  purity 0.6916   guard
    mask rebounding   +0.89  test 0.842  purity 0.7030   guard
    mask efficiency   +0.86  test 0.734  purity 0.7092   guard
    mask pedigree     +0.84  test 0.821  purity 0.7092   guard
    mask competition  +0.34  test 0.739  purity 0.7389   passes guards
    mask career       -0.34  test 0.711  purity 0.7201   guard
    mask defense      -1.39  test 0.714  purity 0.7077   guard
    mask bio          -2.16  test 0.637  purity 0.7291   guard

## Why none of it decides anything

`eval_cache.json` keeps every trial per seed, so the climb's own dispersion is
measurable from its own results. Across the 22 configurations that have both
seeds, median |s7 - s13|, converted to a seed sd by the usual factor 1.128:

    metric        implied seed sd    BASELINE_SD
    CQS                 2.38             0.60
    test recall         0.133            0.031
    purity              0.0042           0.0055

**The largest gain in the table, +1.73 CQS, is smaller than one seed sd.** So is
every recall gain. BASELINE_SD is not wrong — it was measured under a different
protocol (40 epochs, val-recall smoothing over the last 3 checks, the deployed
recipe). The climb runs 20 epochs with `--val-every 0 --no-best-checkpoint`
deliberately, for cross-seed comparability, and pays for it with roughly four
times the dispersion. Comparing climb deltas against BASELINE_SD is comparing
across protocols, which this repo's own provenance block warns about in
capitals.

Purity is the exception: 0.0042 measured here against 0.0055 recorded. It is
the one metric stable enough at two seeds to carry a decision, and the purity
drops the guards rejected are 0.019 to 0.027 — four to six sd. **The guards are
right, and they are right about the only metric that is currently resolvable.**

## The incumbent had a bad seed

    full            s7 cqs 74.15  test 0.838      s13 cqs 70.42  test 0.642
    drop_playoffs   spread 1.07
    drop_roster     spread 0.98

`full` spreads 3.73 CQS across its two seeds while the candidates spread ~1.
Seed 13 drew badly for the unmasked configuration, which lowers the incumbent
mean every candidate is scored against. A meaningful part of "+1.73" is that
draw rather than any property of masking `playoffs`.

## What would make it decision-grade

`composite_score.PROMOTE_SEEDS_TARGET` is 4, and its `_threshold` already widens
the bar when a decision rests on few seeds — the climb does not use that
machinery, it uses fixed `PURITY_SLACK`/`RECALL_SLACK` of 0.02. Two changes
would make round 1 mean something, and neither is made here because both are
modelling policy:

1. more seeds — at the observed CQS sd of 2.38, four seeds put 2 x SEM at 2.38,
   still above +1.73, so resolving this gain honestly needs more than four;
2. ~~`passes_guards` could call `same_sign()`~~ — wrong, see the correction
   below. It is called, at the end of each round, on the winner.

## Not the point, but worth keeping

`mask roster` was rejected for purity 0.7156 against a floor of 0.7158 — by
0.0002, against a purity seed sd of 0.0042. That boundary is being adjudicated
at a twentieth of the noise.


## Paired by seed, the family result disappears

Comparing means hides that seed variance is largely *shared*: a seed that draws
badly draws badly for every configuration. Pairing each candidate against `full`
on the same seed removes that shared term. Doing so to the same cache:

    drop_playoffs    s7 -0.67   s13 +4.13   mixed
    drop_honors      s7 -0.85   s13 +4.10   mixed
    drop_roster      s7 -0.84   s13 +3.87   mixed
    drop_market      s7 -1.11   s13 +3.92   mixed

**Every family "win" is negative on seed 7 and strongly positive on seed 13.**
The whole leaderboard was seed 13's bad draw for the unmasked configuration.
Masking makes the model worse on the good seed. `same_sign()` — which requires
every seed to agree — already exists in hill_climb.py **and is already wired
in**: see the correction at the end of this file.

Only three configurations gain on both seeds: `drop_efficiency`,
`drop_competition`, and `fusion_concat_384_d64`.

## Run-to-run noise, separate from seed noise

`fusion_concat_256_d64` is `{"--dim": "64"}` over BASE_ARCH, which is exactly
what `full` is under `--arch-dim 64`. Same configuration, same seed 7, same
epochs:

    full                   cqs 74.15   test recall 0.838
    fusion_concat_256_d64  cqs 74.13   test recall 0.814

So an identical run repeats to about 0.02 CQS and 0.024 recall. That is
nondeterminism within a seed, on top of the dispersion between seeds, and it
means cache rows written in different sessions are only loosely comparable.

## The one result that survives pairing against a matched control

Widening fusion-hidden from 256 to 384 at dim 64, each seed against the same
seed of the 256 control rather than against `full`:

    seed   cqs             purity                    test recall
    s7     74.13 -> 74.45  0.7345 -> 0.7531 (+4.4sd) 0.814 -> 0.806
    s13    72.07 -> 71.73  0.7396 -> 0.7641 (+5.8sd) 0.690 -> 0.632

**Purity rises on both seeds by four to six sd of its own measured noise. CQS is
a wash and recall falls.** It is a trade, not a free win — and it is the only
trade in this cache whose better side is the metric that two seeds can actually
resolve. Read against `full` instead of the matched control it looks like a
strict improvement, which is how I first read it and is wrong.


## Correction: the tool already does this, and I never let it finish

I wrote twice above that `same_sign()` is unwired and that `passes_guards()`
never calls it. **Both are wrong.** `climb_families` calls it at the end of every
round, and `evaluate()` populates the `cqs_per_seed` it needs:

    for k in ("cqs", "test_recall", ...):
        agg[k] = mean(vals)
        agg[f"{k}_per_seed"] = vals

The acceptance chain, in order: drop every candidate that fails `passes_guards`;
take the highest CQS of what remains; stop if the gain is under `MIN_GAIN` 1.2;
stop if `same_sign` says the seeds disagree; otherwise accept.

Run against round 1's numbers, that chain does this:

    guard survivors    competition +0.34, playoffs +1.73
    best               playoffs, +1.73
    MIN_GAIN 1.2       1.73 > 1.2, passes
    same_sign          playoffs is -0.67 on seed 7 -> seeds disagree
    outcome            "best (playoffs) gain +1.73 but seeds disagree - stop"

**It accepts nothing, which is the same conclusion the paired analysis above
reaches by hand.** The tool was right on its own. I never saw it because I kept
killing the round before its acceptance logic ran — thirteen of eighteen
families measured, and the decision only happens after all eighteen.

The lesson is not about hill_climb. It is that I diagnosed a missing guard from
a run I had truncated, and the guard was there the whole time. A partial run is
not evidence about what a program decides.
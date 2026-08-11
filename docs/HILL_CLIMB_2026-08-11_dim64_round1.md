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
2. `passes_guards` could call `same_sign()`, which already exists and requires
   every seed to agree a candidate is better. Nothing calls it.

## Not the point, but worth keeping

`mask roster` was rejected for purity 0.7156 against a floor of 0.7158 — by
0.0002, against a purity seed sd of 0.0042. That boundary is being adjudicated
at a twentieth of the noise.

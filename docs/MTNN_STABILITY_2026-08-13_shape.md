# Within-season shape — measured negative

> **Status:** measured, rejected, and the cause isolated (2026-08-13 / 2026-08-14)
> **Verdict:** the `SHAPE_*` features carry harm. As a 20th tower, **−0.81 CQS**; folded into `form` with the tower count held constant, **−1.56 CQS** and recall 0.8123 → 0.7303. Worse without the extra tower, so the architecture was never the problem — the columns are.
> **Default:** off. `build_vectors.py --with-shape` to reproduce. Closed, not parked.

## The gap

The 19 existing towers describe a player-season as totals, rates, and **multi-season** slopes (`CAREER_SLOPE_3Y`, `CAREER_MPG_SLOPE`, `CAREER_GP_SLOPE`, `LAG1_COSINE`, `PO_*_DELTA`). None describes the arc **within** a season. Two player-seasons with identical `FORM_*` can be a rookie earning minutes all year and a veteran losing them.

The repo already computes this. `pipeline/faderfinisher_analysis.py` has split each player's own game sequence at its midpoint and compared per-36 halves since the quiz shipped — and writes the result to `assets/faderfinisher.json` as trivia. It has never fed the model. There are no `SHAPE|FADE|ARC` features in the manifest.

## What was built

Four columns from `pipeline/data/gamelogs_*.jsonl` (2015-16 onward, ~30k player-games per season, already on disk — no network, no API key):

| feature | meaning |
|---|---|
| `SHAPE_PTS_H2H1` | per-36 scoring, 2nd half of a player's own games minus 1st |
| `SHAPE_REB_H2H1` | same for rebounds |
| `SHAPE_MIN_SLOPE` | OLS slope of minutes over game index, as a share of a mean night |
| `SHAPE_PEAK_POS` | where the best 5-game per-36 stretch sat, 0–1 within the season |

Split method is faderfinisher's. Its **eligibility band** (≥25 games per half, delta 1.5–6.0 per-36) is deliberately not reused — those thresholds exist to keep quiz answers unambiguous, and here they would mask every player whose arc is small or season was short. Floor is 20 games total, twice the `form` family's 10, because shape splits the season.

Sanity checks before wiring anything up (2023-24, 462 players): H2−H1 straddles zero (58.4% / 53.5% negative, so the split is not sign-broken), `SHAPE_PEAK_POS` spans all 11 deciles, and shuffling the games file changes no output — the chronological sort is load-bearing rather than incidental.

Rebuild parity: **142 → 146 features, 19 → 20 families, nothing removed.**

## Protocol

Pinned to the recipe recorded in `mtnn_report.json` → `composite.baseline_provenance`, which warns that *"numbers from different protocols are not comparable"*:

```
--dim 64 --val-every 0 --no-best-checkpoint    (40 epochs, concat fusion)
seeds [5, 7, 13, 21, 42, 99]
```

Both arms train on the **same** rebuilt matrix. The only difference is whether the tower exists:

```
baseline   --exclude-families shape    18 input towers (today's architecture)
variant    (nothing)                   19 input towers
```

`--dim`'s in-code default has drifted to 48; leaving it unpinned silently changes the protocol and costs ~0.4 CQS. The full rebuild is three steps — `build_vectors.py --offline && enrich_vectors.py && integrate_context.py`. Skipping `enrich_vectors.py` drops position labels to 0% coverage and costs ~3.9 CQS with nothing in the log but a warning.

## Result

```
seed  baseline  variant   delta   baseline recall  variant recall
   5     77.34    74.90   -2.44            0.864           0.720
   7     76.04    76.14   +0.10            0.778           0.782
  13     77.49    74.92   -2.57            0.850           0.718
  21     77.17    77.59   +0.42            0.854           0.854
  42     75.44    75.74   +0.30            0.738           0.768
  99     76.29    75.61   -0.68            0.790           0.746

baseline(18t)  n=6  CQS 76.63 +/- 0.83  recall 0.8123  purity 0.7710
variant(19t)   n=6  CQS 75.82 +/- 0.99  recall 0.7647  purity 0.7711

delta CQS -0.81   baseline seed sd 0.83   ->  INDISTINGUISHABLE (inside seed noise)
```

Formally inside noise, but negative on every summary: mean CQS −0.81, mean recall −0.048, dispersion up (0.99 vs 0.83). Nothing here is a gain hiding under variance.

The failure is **bimodal, not diffuse**. Three seeds are flat-to-positive; two (5, 13) collapse ~2.5 CQS with recall falling 0.85 → 0.72 while purity is untouched. A recall-only collapse with stable purity is a retrieval-geometry failure, not a bad feature — the embedding still separates archetypes, it just stops matching a player to himself next season.

## What the mechanism is *not*

The obvious hypothesis was fusion coverage-blindness (see the vector-equities fix): a sparse new tower that the shared fusion cannot see the mask coverage of. **The coverage data does not support it.**

```
family      le_2021   2022_23   2024_plus
honors       0.0914    ...
system       0.1950    ...
roster       0.1950    ...
injury       0.2576
form         0.2576    0.8502     0.8567
shape        0.2781    0.9599     0.9465
tracking     0.3698    0.9973     0.9971
```

`shape` is the **7th sparsest of 20** pre-2021 and better covered than `form` in the modern era. Sparsity is not what distinguishes it.

What remains is dispersion from widening the fusion itself. This repo has seen that before: `baseline_provenance.dispersion_note` records seed 42 historically collapsing to CQS ~70.7 / recall ~0.47 under concat fusion on the 130-feature recipe, a basin the current recipe closed. Adding a 20th tower appears to reopen a basin of that kind for seeds 5 and 13. Unproven — stated as the surviving hypothesis, not a finding.

## The follow-up — run 2026-08-14, and it settles it

The A/B above confounds two changes: **new features** and **a wider fusion**.
Separating them: map `SHAPE_*` into the existing `form` family instead of
creating a 20th tower. Same four columns, same information, and the tower count
never moves — 146 features, still **18 input towers**, `form` widened 5 → 9.

Hypothesis was that the fusion was at fault. It is not.

```
seed   CQS      recall@10
   5   75.90    0.7720
   7   75.00    0.7380
  13   77.20    0.8400
  21   73.79    0.6680
  42   74.10    0.6720
  99   74.45    0.6920

variant  n=6  CQS 75.0733 +/- 1.2802  recall@10 0.7303
delta -1.5550 vs baseline 76.6283  ->  DISCARD (recall floor 0.8123 -> 0.7303)
```

Side by side:

| arrangement | towers | ΔCQS | recall | shape of failure |
|---|---|---|---|---|
| shape as a 20th tower | 19 | −0.81 | 0.8123 → 0.7647 | bimodal: 3 seeds flat, 2 collapse |
| shape inside `form` | 18 | **−1.56** | 0.8123 → **0.7303** | uniform: every seed down |

Holding the tower count constant made it **worse, not better** — the damage
roughly doubled — and the bimodality disappeared into uniform degradation.
That is the signature of the columns polluting a tower directly rather than the
fusion occasionally falling into a bad basin.

**Conclusion: the fusion width was never the problem. The `SHAPE_*` features
themselves carry harm.** Within-season trajectory, as constructed here, is not a
useful input to this model. Shape stays gated off, and this line of work is
closed rather than parked.

Worth noting how the verdict was reached: the discard fired on the **recall
floor**, not the headline. CQS alone would also have failed it (−1.56 against a
seed sd of 0.83), but it was the floor that named what actually broke.

Measured through `gpu/climb.py` on herdmux — screen, then a 6-seed panel, tree
frozen at `295e1dd2`, journalled to `gpu/results.tsv`.

## Reproduce

```bash
python pipeline/build_vectors.py --offline --with-shape
python pipeline/enrich_vectors.py
python pipeline/integrate_context.py
python pipeline/train_mtnn.py --epochs 40 --dim 64 --device cuda \
    --val-every 0 --no-best-checkpoint --seed 5            # variant, 19 towers
python pipeline/train_mtnn.py --epochs 40 --dim 64 --device cuda \
    --val-every 0 --no-best-checkpoint --seed 5 --exclude-families shape   # baseline, 18
```

Run every seed in `[5, 7, 13, 21, 42, 99]` and compare means, not single seeds — two of six seeds here would have supported the opposite conclusion on their own.

**Do not edit the working tree while a sweep is running.** `gpu/train_local.py` bind-mounts the live repo, so a `git checkout` mid-sweep changes what half the runs train on. The first attempt at this measurement was lost that way and had to be discarded.

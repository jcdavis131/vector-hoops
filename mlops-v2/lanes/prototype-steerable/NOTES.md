# Steerable Twin Explorer — NOTES (Builder A, prototype v0)

## What it is

A static player page (`index.html`, loads only the relative `data.js` next
to it — no server, no external fetches, no build step). Pick one of 4 start
players, pick one of 10 steering directions, move one slider. The twin list
shown is the precomputed top-10 for that exact slider step, over the full
12,966-row champion space, person-excluded (by `person_id`, never name).

## Data provenance (all real, all read-only)

- Champion: MTNN v5, `mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256`,
  incumbent 2026-07-25. Embeddings: `assets/mtnn_embeddings.f32`,
  12,966 × 64 float32, L2-normalized rows, index-aligned with
  `vectors.json` players[] and `skills.json` grades[] (stated in
  `mtnn_meta.json`, verified in precompute: row norms ≈ 1.0).
- Assets were read, never written. No training run, no GPU, no new
  package, no production write, no merge — prototype only.

## Directions and their derivations (every slider is labeled with these)

Steering formula, identical for all directions:

```
steered = L2-normalize(start_embedding + alpha * direction),  direction unit norm
alpha in {-1.0, -0.8, -0.6, -0.4, -0.2, 0, +0.2, +0.4, +0.6, +0.8, +1.0}
twins   = top-10 by cosine over all 12,966 rows, start person's rows excluded
```

### (a) Skill-difference vectors (5) — from `skills.json` grades

For each skill: mean 64-d embedding of rows graded ≥ 90 minus mean
embedding of rows graded ≤ 10, L2-normalized. Each skill has exactly
1,297 high rows and 1,424 low rows (grades are within-season percentiles,
so the counts are identical across skills).

| Slider | Skill (grade column) | Plain meaning |
|---|---|---|
| Perimeter Shooting | shooting | toward elite three-point shooters |
| Playmaking | playmaking | toward pass-first floor generals |
| Rim Protection | rim | toward shot-blockers and bigs |
| Scoring Volume | scoring | toward high-volume bucket-getters |
| Offensive Glass | oreb | toward glass-crashers |

Caveat recorded, not hidden: `skills.json` carries 12 grade columns, while
`mtnn_meta.json` lists 18 skill keys. The 6 extra keys (post, transition,
motor, shooting_gravity, rim_gravity, disruption_gravity) have no grade
columns in `skills.json`, so no direction is built from them. Any future
direction using them needs a real grade source first.

### (b) Archetype-centroid directions (3) — from `mtnn_meta.json`

Direction = L2-normalized (centroid − global mean embedding), centroids
8 × 64 (already unit norm). Labels are **derived**, not copied from
`vectors.json` cluster names: the label for each centroid comes from the
mean skill grades of the rows nearest that centroid in embedding space.
(The `vectors.json` `c` field clusters the 14-d stat space — a different
space — and agrees with nearest-centroid assignment only 46% of the time,
so reusing those names would mislabel the embedding archetypes.)

| Slider | Centroid | Nearest rows | Their mean grades (the label's evidence) |
|---|---|---|---|
| Glass + Rim bigs | 0 | 1,730 | oreb 87.1, rim 86.3, dreb 80.5, finishing 78.3 |
| Perimeter shooting | 5 | 2,079 | shooting 80.7, scoring low-ish otherwise; finishing 22.3, oreb 29.1 |
| Playmaking + steals | 6 | 1,707 | playmaking 86.8, hands 74.7, rim 25.2, dreb 25.9 |

Full per-centroid profiles are baked into `data.json` (`directions[].profile`).

### (c) Stat-group difference vectors (2) — from `vectors.json` era-z stats

Mean embedding of rows in the top decile of an era-z stat minus mean
embedding of rows in the bottom decile (1,297 rows each side), L2-normalized:

| Slider | Stat | Plain meaning |
|---|---|---|
| Three-point volume (raw stat) | FG3A z | toward high-volume three-point shooters |
| Rim pressure / free throws (raw stat) | FTA z | toward players who live at the rim and draw fouls |

## Success test (run, not asserted)

Headline case — Stephen Curry 2016-17, Perimeter Shooting slider:

| Slider | Top-10 mean Shooting grade | Top twin |
|---|---|---|
| 0.0 (real player) | 78.6 | James Harden 2017-18 (0.8600) |
| +0.6 | 93.3 | Damian Lillard 2018-19 (0.7665) |
| +1.0 | 94.7 | Klay Thompson 2016-17 (0.7050) |

Full before/after lists for the +0.6 move (top 5 of 10):

- Before (0.0): James Harden 2017-18 (0.8600), Damian Lillard 2018-19
  (0.8377), Russell Westbrook 2015-16 (0.8153), James Harden 2018-19
  (0.7994), Jayson Tatum 2023-24 (0.7914).
- After (+0.6): Damian Lillard 2018-19 (0.7665), James Harden 2017-18
  (0.7430), Jayson Tatum 2023-24 (0.7279), James Harden 2018-19 (0.7138),
  Paul George 2019-20 (0.7028) — Paul George enters, pure shooters rise,
  Westbrook drops out of the top 5.

Second dramatic case — Curry + Glass + Rim bigs archetype to +1.0: the
top-10 mean Rim grade moves 56.3 → 93.5 and the list flips to centers
(Mitchell Robinson, Neemias Queta, Jaxson Hayes, Ed Davis at the top).
That is the "turn a guard into a big" demo in one slide.

Validation coverage: `precompute.py` prints the metric at alpha −1 / 0 / +1
for all 4 starts × 10 directions (40 rows). Nearly every direction moves
its metric strongly in the expected direction. Honest exceptions, shown
on the page rather than hidden:

- **Scoring saturates upward** for these starts (all four are elite
  scorers, grades 97–99): Curry scoring mean goes 11.3 (−1.0) → 98.2 (0)
  → 97.6 (+1.0). The slider still matters going down, not up — a ceiling
  effect, not a bug.
- **FTA saturates upward** for Curry/Jokic for the same reason (their
  unsteered lists already average FTA z 2.87 / 3.74); the −1.0 direction
  moves strongly (−1.21 / −1.33).
- Every baked list was checked: exactly 10 twins, all cosines in [0, 1],
  zero person-exclusion violations across all 4 × 10 × 11 = 440 lists.

## Limits (also stated on the page itself)

1. Steering is linear in the saved embedding space, NOT a model rerun.
   The steered point is never fed to any model.
2. Directions are correlations, not model internals. Sliding can drag
   correlated traits along (more shooting also pulls more scoring).
3. Tower-level steering is NOT available in v0: tower outputs are not a
   saved asset, and the saved `mtnn.onnx` is a stale 119→48 export, NOT
   the served v5 — it is not used anywhere in this prototype.
4. Slider positions are discrete precomputed steps, not continuous
   live computation. The page does no embedding math in the browser.
5. Space discipline: Curry 2016-17 → Ginobili 2009-10 is a 14-d
   stat-space Twin Reveal pair. In 64-d embedding space its cosine is
   0.4003 and it ranks 390th (person-excluded); it is never presented
   as a 64-d top twin. The 64-d top twin of Curry 2016-17 is James
   Harden 2017-18 at 0.8600.
6. No invented features, no invented twins: every twin is a real row
   (name, season, person_id, cosine) computed by `precompute.py`.

## Reproducibility

```
python3 precompute.py   # reads assets read-only, rewrites data.json + data.js
python3 -m py_compile precompute.py
```

Then open `index.html` directly (file:// works: only a relative
`<script src="data.js">`, no `fetch`, no external URL).

## SAE steering — v1 DESIGN NOTE ONLY (not implemented, not faked)

A future version could replace these hand-built difference vectors with
sparse-autoencoder features trained on the 64-d embeddings: one SAE
feature ≈ one basketball idea, and sliding a feature's activation would
steer more cleanly than a skill-difference vector (which mixes correlated
traits). That requires training an SAE on the 12,966 embeddings, validating
each feature with counterexamples (a feature labeled "shooting" must not
fire mainly on high-usage non-shooters), and re-baking the slider steps
from SAE-decoded directions. None of that exists in v0, and no page text
claims it does. The v0 directions above are the honest baseline an SAE
version would have to beat on the same success test.

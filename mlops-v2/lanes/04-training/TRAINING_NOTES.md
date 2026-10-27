# Training notes — MTNN v7 contrastive challenger (Lane 4, DRAFT ONLY)

Status: DRAFT ONLY. The train gate is CLOSED. Do not run
`train_mtnn_v7.py` until training is authorized by a separate user decision.
This file records choices, costs, and open items. It does not authorize a run.

## 1. Encoder choice: towers, not the plain MLP

The challenger spec (section 4) defaults to a plain MLP (120 → 256 → 256
→ 64) because the objective is the experiment, not the architecture. This
draft supersedes that default and keeps the v5 tower skeleton with the
prediction heads removed. Reason: the towers are the interpretability
surface. Lane 5 masks whole families at inference to ablate them. That
ablation only lines up if the challenger has the same 17 family towers as
the champion. A plain MLP has no families to mask.

Cost, stated plainly:

- More parameters and slower CPU training than the plain MLP.
- One more structure to keep in sync with v5 if the families change.
- The plain MLP stays available as `--encoder plain-mlp` for a control run.
  A control run that beats the tower run on val top-1 is evidence against
  the tower choice, not a reason to hide it.

## 2. One deliberate deviation: no season token

V5 fused a 12-d season embedding into the output. This draft drops it. A
season token is an era shortcut for a twin-space objective: same-era rows
look alike for free. Era-stratified batches plus no season token are the
two era-leak guards. If a later run restores the season token, it must say
so in the run report and re-check the era-shift test in Lane 5.

## 3. What the script refuses to do

- It never writes the champion file `assets/mtnn_embeddings.f32`.
- It never trains on val or test rows. Gradients see train rows only.
  The final asset encodes all rows once, at the end, by the frozen best
  model. That step is inference, not training.
- It never tunes on test. Temperature selection uses val only.
- It never expands the 11-feature proxy to 120 dims. If the real
  120-feature matrix file is absent, the script exits non-zero and names
  Open Question #1. No silent fallback exists. Resolve Question #1 first.

## 4. Collapse watch and the triplet fallback

SupCon can collapse: all embeddings converge to one point. The script logs
alignment, uniformity, and mean pairwise cosine each epoch. If mean
pairwise cosine exceeds 0.90 for 3 consecutive epochs, the run switches to
triplet loss with semi-hard mining and flags the switch in the report.
Triplet is reachable only through that collapse path. There is no manual
triplet mode. If collapse happens, report it as a finding, not a detail.

## 5. Items Lane 5 must confirm before promotion use

- The `val_continuity` definition in this script is the early-stopping-time
  proxy: mean (1 − cosine) between a val row and its same-player
  adjacent-season row. Lane 5's eval protocol is authoritative for
  promotion and must confirm it matches that definition.
- The per-family dropout log uses the contract section 0 family order.
  Lane 5 ablations must use the same order, or the logs do not line up.
- Temperature grid runs are separate full runs. The grid winner is the
  best 64-d val top-1. Test rows play no part in that choice.

## 6. FUTURE extension (NOT implemented in this script)

Temporal career-sequence direction. Do not read this section as current
behavior. The script trains on single player-seasons. It has no sequence
model.

Idea: treat a player's career as a sequence of season embeddings. Train a
sequence model over that sequence. Mask one season in the sequence. Predict
the masked season from its neighbors. Use the sequence model output as an
extra training signal, or as a career-context feature for the twin space.

Why it may help: adjacent-season positives already assume career
continuity. A sequence model makes that assumption explicit. It can learn
career arcs (rise, peak, decline) instead of single-season similarity.

Why it is future work, not this draft:

- It changes the input unit from one row to one career. The fold manifest,
  the pair builder, and the batch sampler all assume rows.
- It adds a second objective. The promotion bar judges the contrastive
  objective alone. A second objective muddies that judgment.
- It needs a career-length and masking policy that no lane has specified
  yet (minimum career length, mask rate, edge seasons).

Next step when this direction is picked up: write a separate spec section
for it, with its own pair and split rules, before any code. Do not bolt it
onto this script silently.

## 7. Reverse-engineering notes

Sources read before drafting (read-only):

- `pipeline/train_mtnn_v6.py` — a thin shim over `train_mtnn.py`, not a
  standalone trainer. Its v6 defaults (transformer fusion, hybrid loss)
  were NOT carried over: this draft follows the v2 contract (SupCon +
  Matryoshka), not the v6 shim.
- `pipeline/train_mtnn.py` — ResidualTower (`cat([x·m, m])`), ConcatFusion
  (544 → 256 → 64 in the shipped code path; this draft inserts the
  champion tag's 128 step: 544 → 256 → 128 → 64).
- `pipeline/mtnn_towers.py` — the tower-column rule (family slices minus
  dropped and excluded families). This draft uses the full 17 families;
  no family is excluded here.
- `pipeline/mtnn_recipe.py` and `pipeline/mtnn_hp_sweep.py` — recipe and
  sweep discipline (record every flag, rank on held-out metrics). This
  draft records the full config in each run report for the same reason.
- NOT found, as the task brief stated: `pipeline/train_mtnn_v6_cpu.py`
  does not exist in the checkout. Nothing in this draft depends on it.
- NOT found yet (parallel lane): Lane 3's `fold_manifest_schema.json`.
  This draft consumes contract section 2a as the schema and accepts a
  single fold object, a list of folds, or `{"folds": [...]}`. When Lane 3
  lands its schema, the coordinator must check this script against it.
  If they differ, Lane 3's schema wins and this script needs a revision.

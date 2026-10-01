# Retraining audit — player identity fix (2026-10-01)

**Verdict: no retraining of the v5 champion. Preserve incumbent embeddings.**

## What was checked

The identity bug conflated 11 shared display names (22 persons, 123 player-seasons)
across downstream assets. The question: did the conflation corrupt the champion
model's training or evaluation, requiring a challenger?

## Evidence

1. **Embeddings are per-row.** `assets/mtnn_embeddings.f32` (12,966 × 64) holds one
   vector per player-season, computed from that row's features alone. Identity
   (name/person) is not an encoder input — no row's vector changes when its
   person_id changes.

2. **v5 training script is not in the repo** (built 2026-07-25). The v6 challenger
   script (`pipeline/train_mtnn_v6_scaling.py`, same model family) shows the
   pattern: names were used only for (a) the ≥2-season filter and (b)
   player-aware train/val/test splits — never as model inputs.

3. **Blast-radius analysis of the conflation on training:**
   - Filter: 2 rows out of 12,966 (Ron Harper Jr. 2025-26, Reggie Williams b1964
     1996-97 — one season each) were included only because their names merged
     with a multi-season person. 0.015% of rows.
   - Split: Sr./Jr. rows forced into the same fold is the *conservative*
     direction — it prevents train/test leakage, it doesn't cause it.

4. **v6 was never promoted** (failed held-out eval: top1 0.0007 vs v5's 0.118).
   Its name-based filtering affects no production artifact.

5. **Confirmed downstream blast radius** (all fixed in this PR): career trails,
   insights career grouping, twin-explainer pair keys, Daily Court game pools,
   and 16 derived assets grouped or keyed by display name.

## Decision

Per the standing rule (never promote a challenger without a held-out win, and
never overwrite the incumbent): **keep the v5 champion and its embeddings.**
The identity fix is metadata + downstream grouping only.

## Standing rule for future training

Any future training run MUST use `person_id` (from `assets/player-identity.json`
/ `vectors.json`), never display names, for season-count filtering and
player-aware splits. `pipeline/train_mtnn_v6_scaling.py` still uses
`Counter(names)` and must be updated to join `person_id` before its next run.

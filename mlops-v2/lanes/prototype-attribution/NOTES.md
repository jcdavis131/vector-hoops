# Builder B — Attribution Graph: method notes

Pair: Stephen Curry 2016-17 (row 8631, person_id `stephen-curry`) →
Manu Ginobili 2009-10 (row 5492, person_id `manu-ginobili`).
Model: champion MTNN v5 `mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256`,
12,966 rows, 64-d L2 embeddings. Prototype only: no training, no GPU,
no package installs, no writes outside this lane directory, no merge.

## Headline (30-second sentence)

On the box score these two are the same kind of player — elite scoring
guards who shoot, pass and pick pockets and never rebound — so the stat
path ranks Ginobili #1 for Curry; but the champion embedding, which also
weighs era, role and inputs the box score cannot see, ranks him only
390th and prefers Harden. This is a stat twin, not an embedding twin.

## What is measured vs estimated vs unavailable

| Claim on the page | Status | How |
|---|---|---|
| 64-d cosine 0.4003, rank 390; top = Harden 2017-18 at 0.86 | MEASURED | Dot product of served L2 rows; exhaustive ranking of all 12,950 non-Curry rows, person-excluded (all 16 Curry seasons removed as candidates) |
| 14-d cosine 0.9623, rank 1 | MEASURED | Cosine on vectors.json `v` (already era-z within season); same person-excluded exhaustive ranking |
| 64-d dimension decomposition (dim 43 +0.0354 top, dim 55 −0.0364 drag, top 10 = 71.6% of score) | MEASURED, unlabeled | Exact per-dimension products emb_curry[i] × emb_ginobili[i], summing to 0.4003. Labeled DIMENSIONS, never towers — no dimension has a basketball name |
| 14-d leave-one-group-out (all groups: rank stays 1–3; Playmaking drop hurts most, 1 → 3; Defense 1 → 2) | MEASURED, real ablation | Drop the group's stats, re-normalise each row, re-rank all candidates. This ablates the Twin Reveal path because Twin Reveal runs on these 14-d stats |
| Leave-one-stat-out (only STL alone moves rank, 1 → 2) | MEASURED | Same method, one stat at a time |
| Facet comparison (14 stats + 12 skills) | MEASURED | Read directly from vectors.json / skills.json grades |
| Counterfactuals (best at α=+1: playmaking 390 → 300; best anywhere: impact α=+2 → 263; rebounding/rim push past 2,000) | MEASURED | Direction = mean 64-d embedding of top-quartile minus bottom-quartile rows on that skill grade; moved vector re-normalised and re-ranked exhaustively |
| Any tower-level contribution | ESTIMATED-FROM-FACETS AT MOST — in practice NOT CLAIMED | The 17 tower families are named in the contract, but no tower score is computed from the served model on this page |
| True served-model tower ablation | UNAVAILABLE — explicit gap node | The 120-feature input matrix is uncommitted, so v5 cannot be re-run with a tower masked. Shown red/dashed, never papered over |
| mtnn.onnx / mtnn_attr_pop.json / mtnn_jacobian.json | BANNED, NEVER READ | 119→48 not served 64-d / 48-d pre-v5 exports marked not_from_served_net. Presenting them as v5 attributions would be false |

## Method details that matter

- Person-excluded ranking: the target person's own seasons are removed
  from the candidate pool. The candidate's other seasons stay in (that is
  why Ginobili 2006-07 and 2010-11 appear at 14-d ranks 2 and 4).
- 14-d groups used for LOGO: Scoring volume (PTS, FGA, FTA), Playmaking
  (AST, TOV), Rebounding (OREB, DREB), Defense (STL, BLK), Shooting
  (FG3A, FG3_PCT, FG_PCT, FT_PCT), Impact (PLUS_MINUS). These cover all 14.
- Skills coverage honesty: skills.json grades 12 skills per row.
  mtnn_meta.json lists 18 skill keys, but post, transition, motor,
  shooting_gravity, rim_gravity and disruption_gravity have no per-row
  grades in skills.json, so they are not shown as facets.
- Counterfactual slider steps through precomputed sweep values
  (α = −2 … +2 in 0.5 steps) from data.json; it does not invent ranks.
- Curry has 16 rows in the file (no 2019-20 row); hence 12,950 candidates.

## Reproduce

```sh
python3 precompute.py        # regenerates data.json from read-only assets
python3 -m py_compile precompute.py
```

`index.html` embeds the same JSON inline (so it runs from a file open
with no server and no external fetch). To re-embed after re-running
precompute: replace the JSON inside
`<script type="application/json" id="DATA">…</script>` with the new
`data.json` contents. Verification done 2026-10-26: precompute parses
and runs, embedded JSON parses, inline JS passes `node --check`, and
the page contains no `http(s)://` fetch, `src=` or `fetch(` call.

## Limits

- One pair only, by design. Nothing here generalises to “why the model
  twins players” in general.
- The 64-d dimensions are uninterpretable labels; the decomposition
  proves where the score comes from arithmetically, not what it means.
- Skill directions are correlational (high-vs-low grade means), not
  causal interventions inside the model — they move the input vector,
  they do not re-run the towers.
- The 14-d space and the 64-d space are different systems (CONTRACT §0);
  agreement in one never implies agreement in the other.

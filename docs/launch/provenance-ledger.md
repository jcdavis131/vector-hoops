# Provenance Ledger — format

Every number on every surface traces to its source and vintage. If a number
can't be traced, it doesn't ship — it ships as "unknown" or not at all.

## The rule

"Every number can be recomputed from source" (methods.html). A claim
without provenance borrows the model's authority — and the Insights
"From the ledger" rule is the pattern: each card prints its source, sample,
and window on the card face. A ledger card never borrows the model's
authority.

## Ledger record — one per headline claim

| Field | Required | What it is |
|---|---|---|
| `claim` | yes | the number in plain words |
| `value` | yes | the number itself, exact |
| `source` | yes | the file / commit / API that produced it (repo-relative, or a named public source) |
| `source_vintage` | yes | when the source data was gathered (as-of date) |
| `transform` | yes | what turned source → value (pipeline script, commit SHA, parameters) |
| `data_window` | when time-bound | the years / seasons covered |
| `computed_at` | yes | when the value was computed |
| `status` | yes | `verified` / `last-known` / `stale` / `unknown` |
| `invalidators` | yes | what would prove this wrong (the anti-hype line) |

## Status rules (binding)

- **verified** — recomputed from source in the current repo state; receipts kept.
- **last-known** — source is down or stale; the number shows with its as-of,
  labeled honestly.
- **stale** — past its freshness window. Refresh it or demote it to
  last-known. Never present it as fresh.
- **unknown** — not measured. The page says "unknown" — never an invented number.
- **Hard-block:** a data QA failure stops the launch. A ledger entry never
  ships stale-as-fresh.

## Where ledgers live

1. **On-page** — the "From the ledger" pattern: source, sample, and window
   on the card face.
2. **methods.html** — site-level provenance: data sources, the model,
   known limits.
3. **dumbmodel.com/provenance** — the honesty ledger: every headline number
   → its source file/commit, plus the drift changelog (what was wrong, when
   it was fixed).
4. **Data files** — metadata headers in shipped JSON/CSV: source, vintage,
   generating commit.

## Worked examples (real rows)

**Row 1 — the served embedding**
- claim: MTNN v5 champion embeds 12,966 player-seasons in 64 dimensions
- value: 12,966 × 64
- source: `assets/mtnn_embeddings.f32` (production asset)
- source_vintage: 2026-07-25 (incumbent since)
- transform: model id `mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256`;
  single-model serving policy
- data_window: all player-seasons through 2025-26
- computed_at: 2026-10-20 (served-bytes check)
- status: verified
- invalidators: a lineage-verified retrain would supersede. The
  served-model lineage gate is currently red — this entry records what is
  served, not what a retrain claims. Cameron decides.

**Row 2 — Arc Forecaster held-out score**
- claim: Arc Forecaster v1 held-out macro-MAE 0.4382, beats baselines
- value: 0.4382 (macro-MAE)
- source: `arc_forecasts_v1.json` + `arc_priors_2026-27.json` (491 players),
  PR #45
- source_vintage: trained ≤2023, held-out ≥2024
- transform: chronological held-out eval, seed fixed
- computed_at: 2026-10-01 (PR #45)
- status: verified
- invalidators: honest framing required — MAE is in embedding space, not
  points. A challenger needs a held-out win to supersede.

**The anti-example this prevents:** conflating
`assets/mtnn_embeddings.f32` (64-d production embedding) with
`assets/vectors.json` (14 raw per-100 game stats, z-scored within season —
NOT a projection of the embedding). Atlas xyz is PCA(3) of those 14 stats,
62.4% variance kept — a *view*, not the model. The ledger names the asset
per row so the two never merge.

## Drift changelog

When a claim was wrong and got fixed, it goes here with: what was wrong,
the wrong value, the right value, when fixed, which commit. Real entries
from our history, kept on dumbmodel.com/provenance:
- the v6 / 128-d / 12,452 stale copy
- the 14-d scoring copy (should have been 64-d)
- the stale twin QA count 1308 → 1313

Changelog line format:
`- <date> — <surface>: <wrong> → <right> (fixed in <commit>)`

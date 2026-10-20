# Insight Provenance Format

Every mined claim carries a provenance record linking it to the model run and
the data vintage that produced it. Built by `scripts/insight-miner/provenance.py`.

## The record

```json
{
  "schema": 1,
  "model": {
    "model_id": "mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256",
    "run_id": "july-v5-a4918f09",
    "exported": "2026-07-25T00:00:00Z",
    "lineage_source": "assets/mtnn_lineage.json"
  },
  "data_vintage": "stats through 2025-26 season; Basketball-Reference game logs pulled 2026-10-02",
  "inputs": [
    {"path": "assets/twin_centrality.json", "sha256": "9f2c…"},
    {"path": "assets/mtnn_lineage.json", "sha256": "41ab…"}
  ],
  "computed_at": "2026-10-20T18:55:00Z",
  "repo_commit": "ed032e0a",
  "miner_version": 1
}
```

## Field rules

| field | rule |
|---|---|
| `model.model_id` / `run_id` | Read from `assets/mtnn_lineage.json`. If the file is missing or unreadable, both are the literal string `"unknown"` — never a guess, never blank. |
| `data_vintage` | Human string naming the data window the inputs cover. Write what you know ("stats through 2025-26; pulled 2026-10-02"). `"unknown"` only if genuinely unknown. |
| `inputs[].sha256` | Hex sha256 of the file at compute time; `"unknown"` if unreadable. A changed hash means the numbers may no longer reproduce — flag in review. |
| `computed_at` | UTC, `%Y-%m-%dT%H:%M:%SZ`. |
| `repo_commit` | Short SHA of the repo the miner ran against. Reproducibility anchor. |

## The unknown rule (binding)

`"unknown"` is a first-class value, not a TODO. A provenance record with
`"unknown"` model fields is *valid* — the claim may sit in the curation queue —
but the queue blocks approval until provenance resolves (an editor must either
restore the lineage file or document why the claim is model-independent).
What must never happen: filling in a plausible-looking run id to make the
record "complete". A fabricated run id is worse than a missing one; it breaks
the revalidation contract in DEDUPE_DECAY.md.

## Why per-claim, not per-run

Insight candidates are mined at different times from different asset vintages
(twin tables from July, playoff splits from October). One global "data as of"
would lie about half the claims. Per-claim provenance costs a few hundred
bytes and makes each number independently auditable: model run → input hashes →
vintage → the exact repo commit that produced it.

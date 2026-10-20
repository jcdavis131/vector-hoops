# Insight Miner — automated candidate-insight pipeline (Pillar 5)

Stdlib-only. Model outputs → candidate insights → human curation. This pipeline
never writes to the public site: candidates land in a curation queue, and only
framed, approved entries reach `assets/insights.json` via the existing
`pipeline/build_insights.py` path. No fake insights shipped — a missing source
asset produces an honest note, never invented numbers.

## The loop

```
  model outputs (assets/*.json)
        │
        ▼
  miner.py ──► candidates.json          batch mining, 4 modules
        │         (real numbers only; provenance on every claim)
        ▼
  dedupe.py ──► fresh / duplicates / supersessions
        │
        ▼
  queue.py ──► queue.jsonl             human curation: frame -> approve/reject
        │         states: pending -> approved | rejected ; approved -> retired
        ▼
  decay.py ──► expire / revalidate    realtime TTL 7d; seasonal on vintage
                                     roll; evergreen revalidated on model change

  triggers.py (parallel lane) ──► TriggerEvent records for live data:
     twin_network_shift | uniqueness_move | drift_spike | archetype_emergence
     Pure functions over (old_snapshot, new_snapshot); the Pillar 2 realtime
     plane provides snapshots via assets/realtime/snapshot-<ts>.json.
```

## Quickstart

```bash
cd scripts/insight-miner
OUT=/tmp/insight-demo

# 1. mine candidates from real repo data
python3 miner.py --out $OUT

# 2. dedupe against the existing queue
python3 dedupe.py --new $OUT/candidates.json --existing curation-queue.jsonl

# 3. enqueue fresh candidates
python3 queue.py enqueue --in $OUT/candidates.json --queue curation-queue.jsonl

# 4. human frames one (Freakonomics bar: docs/insights-engine/FRAMING.md)
python3 queue.py frame --queue curation-queue.jsonl --id <id> \
  --title "..." --lede "..." --invalidator "..." --by "cameron"

# 5. approve only when framed
python3 queue.py set-state --queue curation-queue.jsonl --id <id> \
  --state approved --by "cameron" --note "framing reviewed"

# 6. decay pass (cron-friendly; --apply to write)
python3 decay.py evaluate --queue curation-queue.jsonl
python3 decay.py check-model --queue curation-queue.jsonl

# 7. triggers demo on real historical data (no live feed needed)
python3 triggers.py --demo
```

## Modules

| file | owns |
|---|---|
| `schema.py` | record shapes: CandidateInsight, Provenance, QueueEntry, TriggerEvent; dedupe-key builder |
| `provenance.py` | model run + data vintage + input hashes; "unknown" never invented |
| `miner.py` | batch mining: twin_centrality, drift, archetype_shift, playoff_swing |
| `dedupe.py` | exact + near dedupe; supersession retires stale entries with a note |
| `queue.py` | JSONL curation queue; approval requires framed title + invalidators |
| `decay.py` | realtime 7d TTL; seasonal expiry on vintage roll; evergreen model revalidation |
| `triggers.py` | realtime trigger math + Pillar 2 feed contract + `--demo` |

## Provenance rule (binding)

Every claim links to the model run (`assets/mtnn_lineage.json`: run_id
`july-v5-a4918f09`, model `mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256`) and the
data vintage that produced it. If lineage is missing, provenance records
`"unknown"` and the claim may sit in the queue but must not be approved.

## Ownership

Pillar 5 owns `scripts/insight-miner/*`. Docs live in `docs/insights-engine/`.
The realtime snapshot contract (`assets/realtime/snapshot-<ts>.json`) is owned
by Pillar 2; this pipeline only consumes it.

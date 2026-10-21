# Dedupe + Decay Rules

## Dedupe

Mining runs repeatedly over slowly-changing data. Without dedupe the queue
fills with the same claim every week. Two levels (`scripts/insight-miner/dedupe.py`):

**1. Exact — the dedupe key.** `type:metric:sorted-entity-keys`, e.g.
`twin_centrality:leader:ps:8752`. Same key = same claim. The older record wins
the queue slot; the newer run is reported as a duplicate and dropped.

**2. Near — same type + same entities, different metric or moved numbers.**
If the headline numbers agree within 5% relative, the newer is a duplicate.
If they moved beyond 5%, the newer **supersedes** the older: the old queue
entry is marked `retired` with a `superseded-by <new-id>` note in its
`state_history` — never silently deleted. The queue is an audit trail.

Entity keys are stable identifiers (`ps:<player-season id>`,
`pair:<from>><to>`, `arch:<label>`, `season:<s>`). The builder for keys lives
in `schema.dedupe_key_for`.

## Decay

Insights retire when the data moves on (`scripts/insight-miner/decay.py`).
Decay class is assigned at mine time and stored on the candidate:

| class | rule | example |
|---|---|---|
| `realtime` | Expires 7 days after the trigger fired (`detected_at`, else `computed_at`). A week-old "just shifted" is a lie. | twin-network-shift trigger events |
| `seasonal` | Valid until the data vintage rolls. When new-season data lands, run `decay.py evaluate --new-vintage "<string>"`; approved entries on older vintages expire and the miner re-mines them fresh. Expiry is driven by the explicit flag — never by guessing the vintage changed. | archetype shifts, playoff swings |
| `evergreen` | Never expires. But when the serving model changes (new `run_id` in `assets/mtnn_lineage.json`), every evergreen entry must be **revalidated**: re-run the miner, then dedupe decides — numbers hold (duplicate), numbers moved (supersession), source vanished (manual review). `decay.py check-model` flags what needs this. | twin centrality, drift |

`decay.py evaluate --apply` writes `expired` into the queue; `check-model`
only reports. Nothing in decay deletes entries: `rejected`, `retired`, and
`expired` are terminal states, and reviving a claim means enqueueing a fresh
candidate with a new id.

## The served-model lineage gate (red — not ours to resolve)

Pillar 5 does not touch the served-model lineage gate (currently red) and does
not train or ship models. What the gate means for this pipeline: if the lineage
can't be resolved, `provenance.py` emits `"unknown"` model fields and the queue
holds those candidates at `pending` until an editor resolves provenance. The
decision — find the original run files or order a replacement champion — is
Cameron's (see the program mandala's open decisions).

# Realtime Insight Triggers

Design for "the twin network just shifted" events. Code:
`scripts/insight-miner/triggers.py`.

## The four trigger types

| trigger | fires when | example event |
|---|---|---|
| `twin_network_shift` | A player's live twin set diverges from the served baseline: Jaccard similarity of neighbor sets < 0.5 | "SGA's twin network just shifted" |
| `uniqueness_move` | A player's era-uniqueness score (0–100) moves ≥ 8 points between snapshots | "Wemby's era-uniqueness jumped 11 points" |
| `drift_spike` | A new season-pair embedding rotation exceeds the historical 95th percentile | "The 2026-27 arrival season rotated the space more than any since 2019-20" |
| `archetype_emergence` | Any archetype's share moves ≥ 2 percentage points between seasons | "The stretch-big archetype surged 4.2pp" |

Thresholds live in `triggers.DEFAULT_THRESHOLDS`. They are starting points,
not tuned constants — the docstring on each eval function says what the
threshold means, and changes go through the queue's editorial review, not a
silent commit.

## Architecture: pure functions over snapshots

Triggers are pure: `eval_*(old_snapshot, new_snapshot, thresholds) -> [TriggerEvent]`.
Snapshots are plain dicts. This keeps the trigger math testable without a live
feed (`triggers.py --demo` verifies `drift_spike` and `archetype_emergence`
on real historical data today — 2 events fired on the 2026-10-20 run, both
from the 2024-25 → 2025-26 archetype move).

## Feed contract (proposal for Pillar 2)

The Pillar 2 realtime plane produces snapshots; this pipeline consumes them.
Proposed contract — **confirm with the P2 coordinator before building to it:**

- Path: `assets/realtime/snapshot-<UTC ts>.json`
- Shape: `{"twins": {player_key: [neighbor keys]}, "uniqueness": {player_key: score}, "as_of": "<ts>", ...}`
- Freshness: snapshots older than 60 minutes are "last known", not live —
  `load_live_snapshot()` reports them as stale and no triggers evaluate.
- Baseline: `assets/twin_baseline_snapshot.json` holds the served twin sets
  to compare against. Owned by whoever publishes twin tables (P1/P4 lane);
  the miner run that builds new twin tables should refresh it.

When the feed is absent or stale, `triggers.py` exits 0 reporting
"feed unavailable / feed stale" — the honest-503 path. A missing feed is
never a silent zero, and triggers never fire on invented data.

## The event record

```json
{
  "schema": 1,
  "trigger_id": "twin-network-shift-sga-2026-10-20T19:00:00Z",
  "type": "twin_network_shift",
  "detected_at": "2026-10-20T19:00:00Z",
  "entities": [{"kind": "player", "name": "sga"}],
  "delta": {"jaccard": 0.31, "threshold": 0.5, "old_size": 10, "new_size": 10},
  "provenance": { "model": {...}, "data_vintage": "live feed", "inputs": [], ... },
  "dedupe_key": "trigger_event:twin_network_shift:player:sga",
  "expires_at": "2026-10-27T19:00:00Z",
  "decay_class": "realtime"
}
```

Trigger events enter the same curation queue (`queue.py enqueue`) with
`decay_class: realtime` — 7-day TTL, then `decay.py` expires them. A trigger
firing is a *candidate*, not a publication: the editorial bar (FRAMING.md)
applies unchanged.

## Anti-spam rules

- One event per `dedupe_key` per TTL window: if SGA's network is still shifted
  tomorrow, that's the same event, not a new one (dedupe catches it).
- New players appearing in the feed do **not** fire `twin_network_shift` —
  there is no baseline to diverge from. That's a roster event, not an insight.
- `drift_spike` needs ≥ 4 historical pairs before the percentile is meaningful;
  below that it honestly doesn't fire.

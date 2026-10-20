# Insights Engine (Pillar 5)

Automated insight mining over the Vector Hoops model outputs — with a human in
the loop before anything reaches the site.

## Why this exists

The embedding atlas knows things nobody has said out loud yet: which seasons
bent the statistical shape of the league, which play-styles are vanishing,
whose game actually translates to the playoffs. The insights engine surfaces
those as *candidate* insights with real numbers and full provenance — then a
human frames them to the Freakonomics bar before they ship.

Standing rules:

- **Real numbers only.** Every number traces to a repo data asset hashed in the
  provenance record. Missing data is "unknown", never invented.
- **Human editorial gate.** No candidate reaches the site without a framed
  title, a lede, and at least one invalidator. The queue enforces this.
- **Provenance on everything.** Model run + data vintage + input hashes, per
  claim (see PROVENANCE.md).
- **Insights die.** Realtime claims expire in 7 days; seasonal claims die when
  the vintage rolls; evergreen claims revalidate when the model changes
  (see DEDUPE_DECAY.md).

## The pipeline (code: `scripts/insight-miner/`)

```
  model outputs (assets/*.json)
        │
        ▼
  miner.py ──► candidates.json          batch mining (4 modules today)
        │
        ▼
  dedupe.py ──► fresh / dup / supersede exact + near-duplicate detection
        │
        ▼
  queue.py ──► curation-queue.jsonl     human frames → approve / reject
        │
        ▼
  decay.py ──► expire / revalidate      TTLs, vintage rolls, model changes

  triggers.py (parallel lane) ──► live trigger events on Pillar 2 snapshots
```

Nothing here writes to `assets/insights.json` or the public site. The handoff
is: editor exports approved queue entries → feeds them through
`pipeline/build_insights.py` (the only writer of the served insights).

## Docs in this folder

| doc | covers |
|---|---|
| FRAMING.md | the Freakonomics-grade framing guide + worked example |
| PROVENANCE.md | the provenance record format, per claim |
| DEDUPE_DECAY.md | dedupe keys, near-dup rules, decay classes |
| TRIGGERS.md | realtime trigger design + Pillar 2 interface |
| QUEUE.md | curation queue format + state machine |

## Current status (2026-10-20)

Batch miner: 4 modules (twin_centrality, drift, archetype_shift, playoff_swing),
verified against real repo data — the playoff-swing miner reproduces the
curated numbers in `pipeline/build_insights.py` exactly (Mitchell +8.6,
Embiid −14.6, 334 qualifying player-seasons). Triggers: math + feed contract
implemented; live evaluation waits on Pillar 2's `assets/realtime/` snapshots.
`triggers.py --demo` verifies the math on historical data today.

## Open decisions (for Cameron)

1. Should approved insights auto-open a PR that appends to
   `pipeline/build_insights.py`, or stay a manual handoff? (Manual today.)
2. Feed contract for Pillar 2 is a proposal in TRIGGERS.md — confirm before P2
   builds to it.

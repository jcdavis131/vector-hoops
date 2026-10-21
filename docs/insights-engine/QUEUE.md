# Curation Queue Format

The queue is the human-in-the-loop gate between mining and publishing. Format:
one JSON object per line in a `.jsonl` file (default name `curation-queue.jsonl`,
kept out of the repo — it's working state, not a served asset).

## QueueEntry

```json
{
  "id": "twin-centrality-leader-p5-miner-1",
  "state": "pending",
  "state_history": [
    {"state": "pending", "at": "2026-10-20T19:00:00Z", "by": "miner", "note": "mined"},
    {"state": "pending", "at": "2026-10-20T19:20:00Z", "by": "cameron", "note": "framed"},
    {"state": "approved", "at": "2026-10-20T19:25:00Z", "by": "cameron", "note": "framing reviewed"}
  ],
  "editorial": {
    "framed_title": "The most-copied players in NBA history are the ones nobody remembers",
    "lede": "Charles Cooke's 2017-18 season appears in 61 other players' top-10 twin lists…",
    "invalidators": ["Twin Centrality counts appearances, not similarity strength…"],
    "framing_score": 8.5,
    "framed_by": "cameron",
    "framed_at": "2026-10-20T19:20:00Z"
  },
  "candidate": { "schema": 1, "id": "…", "type": "twin_centrality", "question_draft": "…",
                 "numbers": […], "method": "…", "entities": […],
                 "provenance": {…}, "scores": {…},
                 "dedupe_key": "twin_centrality:leader:ps:8752",
                 "decay_class": "evergreen", "status": "candidate" }
}
```

## State machine

```
pending ──► approved ──► retired
   │            │
   │            └──► (decay.py) expired
   └──► rejected
```

- `pending → approved | rejected` — human decision. **Approval is blocked
  unless `editorial.framed_title` and at least one `invalidator` are set.**
  `queue.py set-state` enforces this; it's the editorial bar as code.
- `approved → retired` — manual, or supersession by a newer candidate
  (`dedupe.py --apply` records `superseded-by <id>` in `state_history`).
- `approved → expired` — only `decay.py evaluate --apply` writes this.
- `rejected`, `retired`, `expired` are terminal. Reviving a claim means
  enqueueing a fresh candidate (new id), never editing history.
- Every transition appends to `state_history` with `at` / `by` / `note` —
  the queue is an audit trail, not just a todo list.

## CLI (`scripts/insight-miner/queue.py`)

```bash
queue.py enqueue --in candidates.json --queue curation-queue.jsonl [--by miner]
queue.py list --queue curation-queue.jsonl [--state pending]
queue.py frame --queue curation-queue.jsonl --id <id> \
  --title "…" --lede "…" --invalidator "…" [--invalidator "…"] \
  --by cameron [--framing-score 8.5]
queue.py set-state --queue curation-queue.jsonl --id <id> \
  --state approved|rejected|retired --by cameron --note "…"
```

## Handoff to the site

Approved entries do **not** auto-publish. The editor exports them and feeds the
numbers through `pipeline/build_insights.py` — the only writer of
`assets/insights.json` — adding the per-card page, OG image, and mirror via
the existing mirror rule. Whether that handoff stays manual or becomes an
"open a PR" automation is an open decision for Cameron (see README.md).

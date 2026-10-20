# v2 layers — build status

Large layer files (`layer_*.jsonl`, `raw_*.jsonl`, `geo/`) are NOT committed —
they are regenerable from the fetch scripts in `../` and documented here.
Only `../v1/` (the QA-passed v1 resource) is versioned in git.

| Layer | Status | Script |
|---|---|---|
| cities (171,374) | done | GeoNames dump, see geo/ |
| universities (24,381) | done | fetch_orgs.py |
| nhl (36,650) | done | fetch_athletes2.py |
| politicians (22,033) | done | fetch_athletes2.py |
| companies | pulling | fetch_orgs.py |
| nfl / mlb | pulling | fetch_athletes2.py |
| business / authors | pulling | fetch_athletes2.py |
| franchises | pulling | fetch_franchises.py |
| soccer / tennis / golf | queued | fetch_athletes2.py |
| musicians / actors / military / inventors | queued | fetch_athletes2.py |
| wars / battles | queued | fetch_conflicts.py |
| researchers | v2.1 | OpenAlex (spec pending) |

Run order note: edges (alma mater, played-for, founded) come after entities land.

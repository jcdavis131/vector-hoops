# v2 layers — build status
Updated 2026-10-20 01:11 CDT. Large layer files are NOT committed (regenerable
from the fetch scripts in `../`; the committed copy of this README lives in git).

| Layer | Status | Script |
|---|---|---|
| cities (171,374) | done | GeoNames dump, see geo/ |
| universities (24,381) | done | fetch_orgs.py |
| nhl (36,650) | done | fetch_athletes2.py |
| politicians (22,033) | done | fetch_athletes2.py |
| franchises | done — 234 (US 137 + EPL 20, LaLiga 20, Serie A 20, Bundesliga 19, Ligue 1 18; LaLiga/Serie A curated — Wikidata has no P118 for ES/IT clubs) | fetch_franchises.py |
| companies | pulling | fetch_orgs.py |
| nfl / mlb | pulling | fetch_athletes2.py |
| business / authors | pulling | fetch_athletes2.py |
| soccer / tennis / golf | queued | fetch_athletes2.py |
| musicians / actors / military / inventors | queued | fetch_athletes2.py |
| wars / battles | queued | fetch_conflicts.py |
| researchers | v2.1 | OpenAlex (spec pending) |

Edges: 37,345 banked (played-for 15,191 / alma-mater 18,784 / employer 3,179 / founded-by 191).
Re-run fetch_edges.py after new layers land — checkpoints pick up only new QIDs.
Store: build_store.py → atlas.db (256,883 entities + edges, 80.6 MB).

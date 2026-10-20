# Entity anchors v1 — build report (2026-10-19)

players: 2415 | teams: 30

## QA gates
- [x] no duplicate entity_id
- [x] every record has precisions
- [x] no Jan-1 day-precision trap

## Unknown rates
- players time unknown: 63/2415 (2.6%)
- players place unknown: 177/2415 (7.3%)
- teams with any unknown: 1/30

## Next (v1.1)
- variant pass for 353 label mismatches (running)
- geocode all place anchors → lat/lon
- split region/country from place names

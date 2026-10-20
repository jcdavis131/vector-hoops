# SPEC — Entity Time+Place Anchor Resource

**Version:** 0.1 (2026-10-19)
**Status:** draft → build
**Principle:** every entity gets a time anchor and a place anchor.
Players/companies have birthplace+date; papers have publication date +
author affiliations; contracts/photos/documents carry their own.

## 1. Schema

One record per entity. JSON, one file per domain.

```json
{
  "entity_id": "nba:player:lebron-james",
  "entity_type": "player",
  "name": "LeBron James",
  "time_anchor": {"date": "1984-12-30", "precision": "day"},
  "place_anchor": {"name": "Akron", "region": "Ohio", "country": "USA",
                   "lat": 41.0814, "lon": -81.5190, "precision": "city"},
  "provenance": {"source": "wikidata:Q270", "retrieved": "2026-10-19",
                 "method": "sparql-p569-p19"},
  "confidence": "high"
}
```

**Precision levels** (honest, never inflated):
- time: `day` | `month` | `year` | `decade` | `unknown`
- place: `coordinates` | `city` | `region` | `country` | `unknown`
- confidence: `high` (primary source) | `medium` (secondary) | `low` (inferred)

**Entity types v1:** `player`, `team`.
**Entity types v2:** `athlete` (all pro sports), `franchise` (all major leagues),
`politician` (notable: ≥15 Wikipedia editions), `businessperson`, `author`.
**Entity types v2.1:** `researcher` — via OpenAlex (affiliation-anchored:
institution + years, not birth-anchored; Wikidata result set too large to query).
**Entity types later:** `paper`, `institution`, `contract`, `photo`, `document`.

## 2. Coverage targets (v1)

| Domain | Entities | Source | Target |
|---|---|---|---|
| NBA players (atlas) | 2,415 | Wikidata P569/P19 | 100% dob, 100% place |
| NBA franchises | 30 | Wikidata P571/P159 | 100% founded, 100% city |

Current: 2,062/2,415 players with dob (85%); variant pass recovering
label mismatches; 30/30 teams complete (year precision).

## 3. Quality bar — what makes it SOTA

1. **Completeness:** every entity has a record, even if anchors are `unknown`.
   No silent gaps — a missing anchor is explicit.
2. **Precision honesty:** year-only dates stay `precision: year`, never
   padded to Jan 1. (Wikidata returns 1946-01-01 for year-known; we store
   `1946` + `year`.)
3. **Disambiguation:** Jr/Sr splits, hyphen variants, and initials
   (`AC Green` → `A.C. Green`) resolved to distinct Wikidata QIDs, recorded
   in `provenance`. No two entities share an `entity_id`.
4. **Provenance on every record:** source + retrieval date + method.
5. **Geocoding:** every place anchor resolves to lat/lon (city level or better)
   via a single geocoder pass, so downstream models get coordinates, not strings.
6. **Versioned:** `resource_version` + changelog; consumers pin versions.

## 4. QA gates (must pass before any version ships)

- [ ] No duplicate `entity_id`
- [ ] Every record has `time_anchor.precision` and `place_anchor.precision`
- [ ] No `day`-precision date with month/day = 01-01 (the Wikidata year-pad trap)
- [ ] Spot-check 50 random records against Basketball-Reference
- [ ] `unknown` rate reported per domain, trending down across versions

## 5. Iteration loop

v1: players + teams, Wikidata-sourced, city precision.
v1.1: fill the 353 misses; geocode all places; fix the 84 dossier orphans.
v1.2: pre-1996 players (feeds DOMAIN_MAP D1).
v2: arXiv — papers (published date) + authors (affiliation → institution place).
Each version: gather → validate (gates §4) → changelog → downstream check.

## 6. Downstream integration

- **Dense retriever:** time+place query pairs ("players born in Akron",
  "1990s Chicago natives") as a new pair source; tests the pronoun forms
  from DOMAIN_MAP §2.
- **SOTA attention model:** time+place anchors become entity features —
  birthplace region and birth cohort as learnable embeddings alongside
  the stat vector.
- **Atlas surfaces:** birthplace shown on player cards; birthplace map layer.

## 7. Non-goals

- Not a biographical database (that's dossiers). Only the two anchors.
- No scraping of paywalled sources. Wikidata + Wikipedia + BR only.

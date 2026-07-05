---
okf: 1
kind: spec
id: okf
name: "Open Knowledge Format — contract"
---

# OKF — Open Knowledge Format for the Vector Hoops LLM-Wiki

An interlinked, machine-editable knowledge layer: one markdown page per
charted NBA player (1996-97 onward), plus archetype and position hubs.
Built to **expand and evolve over time** — by the pipeline, by humans, and
by LLM agents — without the layers clobbering each other.

## The two-layer contract

Every page has exactly two layers:

1. **AUTO layer** — everything between
   `<!-- okf:auto:begin … -->` and `<!-- okf:auto:end … -->`.
   Regenerated from `assets/vectors.json` by `pipeline/build_wiki.py` on
   every run. **Never edit inside the markers** — edits there are
   overwritten by design.
2. **CURATED layer** — everything *below* the end marker. Preserved
   verbatim across regenerations. This is where the wiki grows.

The YAML frontmatter is machine-owned (regenerated with the auto layer),
with one exception: an `ambiguous: true` flag means the dataset carries
duplicate name+season rows and the page likely folds two different humans
— a curator should split the history in the curated layer.

## Editing rules for LLM agents

- Add content **only below the auto end marker**.
- Use `##`-level sections from this vocabulary where possible:
  `## Notes`, `## Scouting`, `## History`, `## Film`, `## Corrections`,
  `## Links`. New section names are allowed but must be `##`-level.
- Interlink aggressively with wikilinks: `[[slug|Display Name]]` for
  players (same directory), `[[../archetypes/slug|Name]]` and
  `[[../positions/pg|PG]]` across directories.
- Claims beyond what the vector data supports must carry a source or be
  phrased as observation ("film note", "reported"). The auto layer is the
  only place statistical claims are generated without citation — they are
  reproducible from `assets/vectors.json`.
- Never delete curated content written by others; append or annotate.

## File map

```
knowledge/
  OKF.md               this contract
  INDEX.md             entry point (regenerated)
  players/<slug>.md    one per player — slug: accent-folded, lowercase,
                       non-alphanumerics to single hyphens (identical to
                       playerSlug() in assets/game.js)
  archetypes/<slug>.md 8 hubs, one per stat archetype (regenerated)
  positions/<pos>.md   5 hubs (pg, sg, sf, pf, c) (regenerated)
```

Hub pages and INDEX.md follow the same two-layer contract.

## What the AUTO layer contains (player pages)

- **Vector identity** — career-mean top σ traits vs era, plus thin spots.
- **Signature season** — the most extreme statistical identity (max L2
  norm of the era-normalized vector).
- **Season chart** — season × position × archetype × leading traits.
- **Statistical neighbors** — nearest career shapes by cosine in the
  14-dim era-normalized space, as wikilinks. This is the interlink spine:
  every page links its 6 neighbors, so the graph is connected and walkable.
- **Hub links** — archetype and position membership.

## Provenance

- Stats: stats.nba.com per-100-possession seasons, z-scored within season
  (era-honest), via `pipeline/build_vectors.py`.
- Positions: Basketball-Reference season totals, via
  `pipeline/fetch_positions.py` + `enrich_vectors.py` (99.7% coverage;
  unmatched seasons show `—`).
- Archetypes: k-means clusters computed at build time; names describe the
  cluster centroid honestly.

## Versioning

`okf: 1` in frontmatter. Breaking changes to the marker contract or the
slug rule bump the version and require a migration note here.

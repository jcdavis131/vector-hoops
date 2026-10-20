# Vector Hoops model API — static-JSON endpoint patterns (Pillar 1)

The site is static at the edge (Vercel, no backend). The API is therefore
**static JSON, served immutable** — every "endpoint" below is a file under
`public/`, cached by the CDN for a year, addressed by its stamped URL
(`?v=<sha8>` from `scripts/stamp_assets.py`). There are no query params, no
auth headers, no POST. Clients fetch; the platform regenerates and republishes.

This is the honest serving story: predictable, cheap, and cacheable — and it
means anything not precomputed is a **planned endpoint**, not a live one.
Planned endpoints answer 404 today (an honest "does not exist", never a fake
payload). `GET /503.json`-style fabrications are banned by the standing rule:
honest 503 over fake success.

## Conventions

- All reads are `GET`. No endpoint mutates anything.
- JSON is UTF-8, `Content-Type: application/json`, immutable cache (`?v=` stamp).
- Every payload carries `as_of` (ISO date) and, where it names the model,
  `model` + `run_id` + `f32_sha256` so a client can pin exactly which bytes it
  consumed. Stale data is labeled `last_known`, never presented as fresh.
- Payload sizes are kept small enough to sit in the CDN cache; anything over
  ~2 MB is a build-time aggregation problem, not an endpoint.

## Live endpoints (served today)

| Endpoint | What it returns | Payload size | Latency budget | Cost budget |
|---|---|---|---|---|
| `GET /models/registry.json` | The model registry: schema, champion, challengers, artifact paths, provenance, open decisions | ~5 KB | p50 < 100 ms, p95 < 400 ms from edge | edge-cache hit ~free; budget: < 1 GB/mo (200k reads) |
| `GET /assets/vectors.json?v=…` | 12,966 player-season stat profiles (14 era-z features), the transparent baseline space | ~4.1 MB | p50 < 300 ms, p95 < 1.5 s | budget: < 10 GB/mo; kill switch: freeze `?v=` stamp (CDN stops revalidating) |
| `GET /assets/eval_scoreboard.json` | Held-out adjacent-season retrieval results + protocol | ~20 KB | p50 < 100 ms, p95 < 400 ms | < 0.5 GB/mo |
| `GET /assets/site_facts.json` | Machine-readable site facts (build vintage, counts) | ~5 KB | p50 < 100 ms, p95 < 400 ms | < 0.5 GB/mo |

Sizes are measured from the repo bytes today; latency budgets are design
targets for edge-served static JSON (not measured claims — see "What we don't
have" below).

## Planned endpoints (not served — 404, not fabricated)

These are the Pillar 1 actions 5–6 (embedding API, forecast endpoints) in their
static-JSON shape. Each becomes live only when a builder script commits its
payload and a budget entry lands in `budgets.json`.

| Pattern | Returns | Design budget |
|---|---|---|
| `GET /models/knn/<pid>_<season>.json` | Top-32 nearest neighbors (k-NN) of one player-season in the 64-d champion space: neighbor ids, cosine similarity, rank | ≤ 8 KB per file; p95 < 400 ms |
| `GET /models/twins/<pid>.json` | All-seasons twin list for a player (nearest season across eras), precomputed | ≤ 16 KB; p95 < 400 ms |
| `GET /models/era-bridge/<decade>.json` | Era-bridge pairs: highest-similarity cross-decade matches for one decade | ≤ 32 KB; p95 < 500 ms |
| `GET /models/forecasts/arc_v1.json` | Arc Forecaster v1 outputs: 491 players' forecast + honest interval, vintage | ≤ 200 KB; p95 < 500 ms |
| `GET /models/forecasts/season_2026-27.json` | TimesFM season projections with intervals, by team/player | ≤ 500 KB; p95 < 800 ms |

A fan-out client pattern (e.g. "k-NN for every player on a roster") must
aggregate server-side at build time — the client does not fetch 12 files.

## What we don't have (honestly)

- No measured latency percentiles. The budgets above are targets to verify
  with real edge fetches before any SLA is quoted; until then they are design
  numbers, not facts.
- No per-endpoint usage metering yet (that's Pillar 7.2/7.3 territory).
- No rate limiting exists on a static site; abuse protection is CDN-level.

## Building a new endpoint (the contract)

1. Write the builder script (`scripts/build_<name>.py` or a pipeline stage).
2. It fails loudly on QA failure — hard-block, never ships stale-as-fresh.
3. Commit the payload under `assets/` (or `models/`), stamp with
   `scripts/stamp_assets.py`, mirror with `scripts/sync_public.py`.
4. Add the measured budget to `budgets.json` and the route to this doc.
5. Promotions to champion never ride on an API addition: the single-model
   serving policy is unchanged by new endpoints (Pillar 1.8 open decision).

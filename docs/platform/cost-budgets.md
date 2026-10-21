# Per-endpoint cost budgets

Owner: Pillar 7 (platform plumbing). Last reviewed: 2026-10-20.

## Where we are today (honest baseline)

Vector Hoops is a **fully static site** on Vercel: no `api/` routes, no serverless
functions, no edge middleware. The entire cost surface is:

1. **Vercel bandwidth + edge serving** for static pages/assets (cached aggressively;
   `assets/*` ships `immutable` year-long cache with content-hash `?v=` tokens via
   `scripts/stamp_assets.py`).
2. **Zero backend.** The only runtime external call is the browser's direct fetch to
   ESPN's public scoreboard API for live scores — that cost is ESPN's, rate-limited by
   a 90-second `sessionStorage` cache in `assets/site-nav.js`.

So "per-endpoint budgets" today means: keep the static payload small (bandwidth is the
bill) and keep the one external dependency cached and degradable. The framework below
extends to the future public API (Pillar 7 action 1) when it exists.

## Current budgets (enforced in CI)

| Endpoint / surface | Budget | Enforced by | Kill switch |
|---|---|---|---|
| Every served page (HTML+CSS+JS+JSON it pulls) | `budgets.json`, 1.5× measured, 32 KiB floor — new pages must arrive with a measured budget | `scripts/budget_check.py` gate 1, CI `budget-gates.yml` | Page ships over budget → CI fails; shrink or justify |
| Total JS any page references | `js_total_bytes` in `budgets.json` | budget gate 2 | same |
| Heaviest single page (JS; all assets) | `js_worst_page_bytes`, `assets_worst_page_bytes` | budget gate 2 | same |
| ESPN scoreboard fetch | ≤1 request / 90s / visitor (sessionStorage cache); fail → silent, nav just doesn't light up | code review (no automated gate yet) | Remove the fetch; page works without it |
| Asset cache discipline | content-hash tokens current (`stamp_assets.py --check`), root↔public mirror in sync | budget gate 3 | stale token = returning visitors pinned on old bytes for a year |

Bandwidth intuition: the page-weight budgets ARE the bandwidth budget. A 3.5 MB
`index.html` weight budget (current) × N visits is the Vercel bandwidth line; keeping
weights down is keeping the bill down. The immutable asset cache means repeat visits
cost ~0 for assets.

## Future: public API budgets (Pillar 7 action 1 — not built yet)

When the model API (k-NN, twin lookup, forecasts) ships, each endpoint gets a row here
**before launch**:

| Endpoint | Monthly budget | Per-key rate limit | Kill switch | Dashboard |
|---|---|---|---|---|
| `GET /v1/twins` | TBD (his call — see open decision) | TBD | key revocation + endpoint disable | TBD |
| `GET /v1/knn` | TBD | TBD | same | TBD |
| `GET /v1/forecast` | TBD | TBD | same | TBD |

Rules for that launch: keys + rate limits from day one (no anonymous unlimited);
per-endpoint counters; a single kill switch per endpoint that a human can throw in
under 5 minutes; usage dashboard linked from `/status`. **API packaging/pricing is his
decision** (mandala open decision 2) — free tier vs paid determines the numbers above.

## Review cadence

- Budgets re-measured whenever a page's weight changes materially (the `--measure`
  flow), never hand-raised to make CI pass.
- This doc re-reviewed quarterly or when the API ships, whichever comes first.
- Any budget breach that reaches production = incident (see incident-runbook.md).

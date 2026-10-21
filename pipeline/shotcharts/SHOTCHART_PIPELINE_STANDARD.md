# Shot-Chart Pipeline Standard v1.0.0
*Coordinator-designed contract. Every shot-chart source implements this exact contract — one interface, N sources.*

## 5-stage contract

Every pipeline runs the same five stages, in order. Each stage is independently runnable and idempotent.

```
FETCH → VALIDATE → NORMALIZE → SNAPSHOT → PUBLISH
```

| Stage | Input | Output | Failure mode |
|---|---|---|---|
| FETCH | date | `raw/<source>/<date>/*.json` + checkpoint | BlockedError → honest 503, exit 2; transient → jittered backoff (see `pipeline/nba_http.py` conventions) |
| VALIDATE | raw files | QA verdict (PASS/FAIL + check detail) | FAIL → pipeline stops; PUBLISH never runs (hard block) |
| NORMALIZE | raw files | canonical JSONL records (in-memory or tmp) | schema mismatch → FAIL |
| SNAPSHOT | normalized records | `snapshots/<source>/shotcharts-<YYYYMMDD>.jsonl` + `.manifest.json` | deterministic: sorted output, stable sha256 |
| PUBLISH | snapshot + manifest | served copies under `assets/` + `public/` + `LATEST.json` | runs ONLY on QA PASS |

## CLI surface (identical for every source)

```
pipeline/shotcharts/pipeline.py <source> <stage> --date YYYY-MM-DD [--resume] [--out DIR]
```

- `<source>`: `stats_nba` | `nba_cdn` | `espn` | `bbr` | `stub_503`
- `<stage>`: `fetch` | `validate` | `normalize` | `snapshot` | `publish` | `all`
- Exit codes: `0` ok · `1` QA FAIL (publish blocked) · `2` fetch error · `3` source gated (503 stub)
- `--resume`: skip games already in `checkpoints/<source>/<date>.json`

## Canonical shot record (JSONL, one per line)

```json
{
  "game_id": "0022600015",
  "game_date": "2026-10-21",
  "season": "2026-27",
  "player_id": "2544",
  "player_name": "LeBron James",
  "team_abbr": "LAL",
  "period": 4,
  "clock": "02:31",
  "x": -12.5,
  "y": 18.2,
  "made": true,
  "shot_type": "3PT",
  "shot_zone": "Above the Break 3",
  "source": "stats_nba",
  "fetched_at": "2026-10-22T06:00:00Z",
  "pipeline_version": "1.0.0"
}
```

**Coordinate contract:** feet, hoop center at (0,0), +y toward half-court, x positive to the shooter's right facing the hoop. Each source module documents its native system and the conversion applied; the implementer verifies against known court geometry (rim 10 ft high, corner 3 at 22 ft, break 23.75 ft) before first publish.

## Manifest (modeled on DOWNSTREAM.md snapshot discipline)

```json
{
  "source": "stats_nba",
  "date": "2026-10-21",
  "fetched_at": "2026-10-22T06:00:00Z",
  "sha256": "<sha256 of the snapshot file>",
  "records": 4821,
  "games": 11,
  "players": 203,
  "qa": {
    "verdict": "PASS",
    "checks": {"schema": "PASS", "row_counts": "PASS", "spot_sample": "PASS"}
  },
  "pipeline_version": "1.0.0"
}
```

## QA gates (hard-block PUBLISH on any FAIL)

1. **Schema** — every record has all required fields with correct types; `|x| ≤ 30`, `0 ≤ y ≤ 47` (generous court bounds); `made` is bool; `period` in 1–7; `shot_type` in {2PT, 3PT}.
2. **Row-count sanity** — shots per game within [80, 350] (an NBA game lands ~170–210 total attempts). Outside → FAIL with the game id.
3. **Spot-sample vs source** — re-fetch one random game from the source, compare record count and key-set hash. Mismatch → FAIL.

## Idempotency + resume

- `checkpoints/<source>/<date>.json`: `{"completed_game_ids": [...], "started_at": ..., "source": ...}`. FETCH skips completed ids on `--resume`.
- SNAPSHOT output is fully deterministic: records sorted by (game_id, period, clock, player_id, x, y) → stable sha256 across runs.
- Re-running `all` for a completed date is a no-op (exit 0, "already complete").

## Directory layout (under `pipeline/shotcharts/`)

```
pipeline/shotcharts/
  SHOTCHART_PIPELINE_STANDARD.md   # this file
  pipeline.py                       # dispatcher: <source> <stage>
  common/
    manifest.py     # manifest write/read/verify (sha256)
    qa.py           # the three QA gates
    checkpoints.py  # skip-on-resume bookkeeping
  sources/
    stats_nba.py    # stats.nba.com/stats/shotchartdetail via pipeline/nba_http.py
    nba_cdn.py      # cdn.nba.com (if recon: viable)
    espn.py         # ESPN (flag-only → 503 stub w/ documented gap)
    bbr.py          # Basketball-Reference (if recon: viable)
    stub_503.py     # honest-503 template: documents gap + retry procedure, exit 3
  raw/<source>/<date>/              # raw fetches (gitignored)
  checkpoints/<source>/<date>.json
  snapshots/<source>/shotcharts-<YYYYMMDD>.jsonl
  manifests/<source>/shotcharts-<YYYYMMDD>.manifest.json
```

Build on existing repo foundations: `pipeline/ingest.py` (`BlockedError`, `FetchError`, error classification) and `pipeline/nba_http.py` (warmed sessions, jittered backoff, browser headers) — do not reinvent HTTP.

## Architecture: snapshot vs live (decided per source)

- **Historical** → versioned snapshots in repo (`assets/data/shotcharts/<source>/` + `public/` mirror). Named `shotcharts-<YYYYMMDD>.jsonl`; `LATEST.json` per source points at the newest manifest.
- **Live games** → client-side fetch from the public API **where CORS allows**. stats.nba.com sends no `Access-Control-Allow-Origin` (known) → browser fetch impossible → degrade to latest snapshot with a "through <date>" label. ESPN core API allows it (verified in `assets/live-nba.js`).
- The per-source choice is documented in that source module's docstring and in the PR body. CORS posture drives the call, not preference.

## Budgets + honesty (PLAN.md §§4–5, binding)

- Served snapshot per date: **<500KB** (page-critical data budget) or an explicit allowlist note in the PR. Historical backfills stay out of the served tree until allowlisted.
- No mock/stale data, ever. Snapshots carry `fetched_at`; served figures carry source + vintage labels.
- "(noisy)" discipline where estimates appear; axes never lie on any shot-chart viz; annotations carry the insight.
- Gated sources ship as `stub_503`: the gap documented, the retry procedure documented (what to re-probe, on what cadence), exit 3 with a plain-language message. A stated gap beats a silent one.

## No cron

Refresh scheduling is Cameron's follow-up decision. Document the recommended schedule per source in the PR body; do not create cron jobs or scheduled workflows in this program.

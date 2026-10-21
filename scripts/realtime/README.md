# Realtime data plane — runbook (Pillar 2)

Live game-state pipeline for Vector Hoops. Stdlib only. No invented sources:
everything comes from the repo's established ESPN API patterns
(`site.api.espn.com/apis/site/v2/sports/basketball/nba`) — scoreboard, summary,
teams, roster. Honest 503 over fake success: a failed poll never fabricates
numbers; the last-known snapshot stands and the failure lands in
`feed_health.json`.

## Scripts

| Script | What it does | Intended cadence |
|---|---|---|
| `espn.py` | Shared client (timeouts, one retry, failure as `EspnError`) | — |
| `scoreboard.py` | Game-night snapshot → `assets/realtime/scoreboard.json` | **45–60s on game nights** (cron) |
| `season_refresh.py` | 2026-27 teams + rosters → `assets/realtime/season_2026_27.json` (records, athlete identity, status/injury) | **daily, overnight** |
| `feed_health.py` | Probe all sources → `assets/realtime/feed_health.json` (status, last_good_tick, latency_ms, consecutive_failures) | 5–15 min |
| `qa.py` | Guard: valid JSON, `as_of` present and never future, ESPN-shaped scores, no invented sentinels | pre-commit / CI candidate |

## Snapshot contract

* Every snapshot carries `as_of` (UTC ISO) and `last_good_tick`. Stale = "last
  known" — the badge components in `assets/realtime/realtime.js` render it.
* Pre-tip games carry ESPN score `"0"` — consumers show an en dash, never
  "0–0 as a score" (same rule as `assets/live.js`).
* Writes are atomic (temp + replace); a failed poll leaves the snapshot
  untouched.
* Point-in-time rule: a snapshot dated `as_of` must never backfill features
  for games played before `as_of` without a point-in-time join. `qa.py`
  hard-fails any `as_of` in the future.

## Game-night operations

`scoreboard.py` sets `"quiet": true` when no game is live or upcoming — the
caller can skip sub-minute cadence and check every few hours instead.
Suggested cron (operator's call, not committed here):

```
# game nights Oct–Jun: every minute, commit-on-change wrapper pushes
* 18-23 * 10-4 * * cd /repo && python3 scripts/realtime/scoreboard.py
# daily season refresh + health probe
7 5 * * * cd /repo && python3 scripts/realtime/season_refresh.py
*/10 * * * * cd /repo && python3 scripts/realtime/feed_health.py
```

The static site's sub-minute freshness on game nights comes from the browser
fetching ESPN directly (existing `live.js`, 30s). The committed snapshot is
the **last-known-good fallback** for honest degradation and the source the
feed-health dashboard reads.

## ESPN client note (verified 2026-10-20)

ESPN's edge returns HTTP 403 for a `User-Agent` containing a parenthetical
URL (e.g. `name/1.0 (+https://…)`). The client identifies as
`vector-hoops-realtime/1.0` with `Accept: application/json`. If polls start
403ing, check the UA first.

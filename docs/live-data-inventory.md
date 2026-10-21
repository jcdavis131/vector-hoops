# Live Data Inventory — /live.html ("Courtside Live")

Mapping target: the page meta promises "Win probability, atlas twins, ghost watch,
shot charts — the second screen for NBA nights." This doc maps each widget to its
data source. Client: `assets/live-nba.js` (HAND-BUILT, read-only, no auth, no build step).
Recon: direct-HTTP probes of ESPN's public core API, 2026-10-21. Raw captures: /tmp/nba-recon/ (ephemeral).

## What the API gives us (all public, no-auth, read-only)

Base: `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba`

| # | Endpoint pattern | Feeds | Refresh |
|---|---|---|---|
| 1 | `GET /events?dates=YYYYMMDD&lang=en&region=us` | Game list (11 games on 2026-10-21). Verified live. | 5 min |
| 2 | `GET /events/{id}/competitions/{id}?lang=en&region=us` | Per-game hub: competitors, status/predictor/situation refs, `shotChartAvailable` flag | 30s live / 5min otherwise |
| 3 | `GET …/competitions/{id}/status?lang=en&region=us` | `state` (pre/in/post), `shortDetail` ("10/21 - 7:00 PM EDT"), `displayClock`, `period`, `completed` | 30s live |
| 4 | `GET …/competitors/{tid}/score?lang=en&region=us` | `displayValue` ("0"), `value`. ×2 per game. | 30s live |
| 5 | `GET …/competitions/{id}/predictor?lang=en&region=us` | **Win probability (ESPN BPI)**: away `gameProjection` ("47.3"), home = 100 − away; `matchupQuality`, predicted point diff, expected points. Verified pregame AND postgame. | 60s live / 5min pregame |
| 6 | `GET …/competitions/{id}/situation?lang=en&region=us` | Live situation (possession, clock detail) — returns bare `$ref` pregame; populates during live games. | 30s live |

Static team map (30 teams: id → abbr/name/colors) ships inside the client —
verified against the API 2026-10-21. Zero requests for team metadata.

Request budget per refresh (11-game slate): 1 (list) + 11 (competitions) +
11 (status) + 22 (scores) = 45; +11 more if win prob on. Measured 6.9s for
56 parallel requests. ESPN's CDN tolerates it; stay at 30s/5min cadence, stop on 429.

## Widget → endpoint wiring notes

- **Tonight's slate / schedule** → #1 → #2. Pregame: show `shortDetail` start time + BPI win prob (#5).
- **Live score bug** (score + clock + period) → #2 → #3 + #4×2. 30s refresh while `state==="in"`.
- **Win probability meter** → #5. Label honestly: "ESPN BPI win probability". Pregame = model projection; live = updates through the game (`lastModified` stamps it).
- **Ghost watch** (which game to watch) → derive client-side: live games sorted by `matchupQuality` (#5) then closeness (score diff / clock from #3+#4).
- **Atlas twins** → NOT a live API: powered by the site's own MTNN v5 embedding (`assets/mtnn_embeddings.f32`). Wire client-side from existing data.
- **Shot charts** → NOT AVAILABLE. `shotChartAvailable` is a boolean flag only; no public endpoint carries shot-location data (ESPN's old `site.api.espn.com` shot-chart routes are dead — 404 as of 2026-10-21). Options: drop the promise from page copy, or render historical shot zones from the atlas's own data (not live).

## Dead ends (do not re-probe)

- `site.api.espn.com/apis/site/v2/sports/nba/scoreboard` → 404 `{"code":404}` (retired).
- `stats.nba.com` → connection timeout from this VM (bot-drop).
- `data.nba.net` → connection failed (retired by NBA).
- `balldontlie.io` free tier → 404 (moved to keyed `api.balldontlie.io`).
- FanDuel / BetMGM / ESPN BET → PerimeterX / edge-drop (prior recon).
- DraftKings → page loads, API 403 via Akamai (prior recon).

## Honest gaps

1. Shot-chart DATA has no public source — flag only. Page copy promising "shot charts" needs a rewrite or an atlas-data fallback.
2. `situation` detail shape during live games is unverified (no live game during recon window 12:00–12:15 CT; first tip 18:00 CT). Re-verify during a live game before relying on possession fields.
3. Win probability is ESPN BPI (a model), not a market — label it as such; never present as odds.

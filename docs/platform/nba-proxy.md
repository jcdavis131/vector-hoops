# cdn.nba.com proxy (`/api/nba/*`)

Feeds plan item P1. One Vercel function, `api/nba/[feed].js`, fetches cdn.nba.com so the site can stop reading ESPN. Pages, CSP and `sw.js` are unchanged here; P2 repoints the clients. `/api/nba/*` is same-origin, so `connect-src 'self'` already allows it and P2 needs no new CSP host for it.

## Endpoints

| Route | Upstream | Body | s-maxage | stale-while-revalidate |
|---|---|---|---|---|
| `GET /api/nba/scoreboard` | `liveData/scoreboard/todaysScoreboard_00.json` | raw | 15 | 30 |
| `GET /api/nba/boxscore?game=<id>` | `liveData/boxscore/boxscore_<id>.json` | raw | 75 | 75 |
| `GET /api/nba/playbyplay?game=<id>` | `liveData/playbyplay/playbyplay_<id>.json` | raw | 75 | 75 |
| `GET /api/nba/schedule[?from=YYYY-MM-DD&to=YYYY-MM-DD]` | `staticData/scheduleLeagueV2_1.json` | projected | 600 | 3600 |

Every 200 and 404 carries `Cache-Control: public, max-age=0, s-maxage=<n>, stale-while-revalidate=<m>`. The function sets it, and a function's own `Cache-Control` overrides the `/(.*)` `no-cache` rule in `vercel.json` (Vercel docs, "Cache-Control headers": a function's header "overrides any matching route headers defined in vercel.json").

**Schedule projection.** The upstream file is about 406 KB (inventory, 2026-10-24 HEAD). The response keeps who, when, status and score, and copies a key only when upstream has it. Nothing is filled in:

```
{ok, source, seasonYear, from, to,
 gameDates: [{date: "YYYY-MM-DD", gameDate: <upstream string>,
   games: [{gameId, gameCode, gameStatus, gameStatusText, gameDateTimeUTC, gameDateEst,
            gameLabel, arenaName, arenaCity,
            homeTeam: {teamId, teamTricode, teamCity, teamName, wins, losses, score},
            awayTeam: {...}}]}]}
```

It is a superset of the shape in `tests/fixtures/scorecard/cdn_cache/scheduleLeagueV2.json`. `from`/`to` filter on the league date (`gameDates[].gameDate`, US Eastern); the window may be at most 62 days. If upstream changes its date format the function returns 502 `upstream_bad_body` instead of guessing.

## Headers (D8)

Exactly `pipeline/nba_http.py` `_STATS_HEADERS` plus the repo's Chrome 120 UA (the inventory's H1):

```
Accept: application/json, text/plain, */*
Accept-Language: en-US,en;q=0.9
Origin: https://www.nba.com
Referer: https://www.nba.com/
x-nba-stats-origin: stats
x-nba-stats-token: true
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
```

There is no cookie warm-up, no `Sec-Fetch-*`, no `Accept-Encoding` and no retry. The request uses `node:https`, not global `fetch`. Node's fetch (undici) adds headers of its own. Measured on Node 24.1 against a local server, `fetch(url, {headers: {Accept}})` sent `accept-language: *`, `sec-fetch-mode: cors`, `user-agent: node` and `accept-encoding: gzip, deflate`. That breaks "exactly", and the `sec-fetch-mode` header is the spoofing D8 rules out. The test `transport sends exactly the H1 header set` asserts the key set handed to `https.request`.

## Rate budget (D8: at most 1 request per 2 s per host)

Every endpoint is the same host, so the budget is 0.5 req/s in total.

**Per key.** Each distinct URL is refreshed at most once per its TTL:
- the CDN serves it for `s-maxage`;
- `stale-while-revalidate` is that same one background refresh, so it changes latency, not rate;
- the function's memory cache holds every outcome (200, 404, 502) for the same TTL, so a pre-tip play-by-play 404 can't hot-loop.

**Worst case, 15 concurrent live games.** That is 1 scoreboard + 15 boxscore + 15 play-by-play + 1 schedule = 32 keys:

```
1/S_sb + 15/S_box + 15/S_pbp + 1/S_sched <= 0.5 req/s
1/15   + 15/75    + 15/75    + 1/600     = 0.0667 + 0.2 + 0.2 + 0.0017 = 0.468 req/s
```

That leaves about 6% headroom. The plan's 15-30 s for everything does not fit: 32 keys at 30 s is 1.07 req/s, twice the budget.

The cost is lag. Box score and play-by-play can trail by up to 75 s, plus the SWR refresh. The live score and clock come from the scoreboard, which trails by at most 15 s. On a normal night with fewer live games the same TTLs leave more slack. To speed up box and play-by-play later, the inequality has to be re-solved first. For example, `S_box = S_pbp = 65` gives 0.53 req/s, which is over.

**Hard gate.** Inside an instance, upstream requests are spaced at least 2 s apart: each miss reserves the next 2 s slot.
- A request that can't get a slot within 5 s gets the stale memory copy if one exists (`X-Proxy-Cache: stale`).
- With no copy it gets `503 rate_budget` with `Retry-After`.

This also caps cache-busting with random valid game ids at 0.5 req/s per instance. Concurrent misses on one key share one in-flight request. That sharing is best-effort, and the arithmetic does not count on it.

**Region pin.** `vercel.json` has `functions["api/nba/*.js"].regions = ["iad1"]`. The glob does not match `api/odds.js`, and there is no project-level `regions` key, so odds.js is untouched. With one function region there is one function memory cache. Every edge region's misses and SWR refreshes land in iad1 and are answered from that cache.

**Not shown.** Two things the budget can't see:
1. Vercel's edge cache is regional, so N edge regions can each send a miss per TTL. Those misses reach the iad1 function, not cdn.nba.com, so they cost invocations, not upstream requests.
2. The real multiplier is **instance count**. Under load Vercel may run more than one instance in iad1, and each has its own memory and gate. The hard ceiling is 0.5 req/s × live instances.

The log line below makes that measurable: count `nba_upstream` lines per 2 s window in the runtime logs.

`maxDuration` is 15 s: at most 5 s waiting for a slot plus the 8 s upstream timeout.

## Errors

All errors are JSON `{ok: false, error, feed, ...}`. No upstream header is ever passed on. Upstream sends `set-cookie: bm_s/bm_so`, and that is dropped too.

| Status | `error` | When | Cache-Control |
|---|---|---|---|
| 400 | `bad_request` | game not `^\d{10}$`, bad date, unknown or repeated query param | `s-maxage=3600` |
| 404 | `unknown_feed` | `/api/nba/<other>` | `s-maxage=3600` |
| 404 | `not_found` | upstream 404, passed through (e.g. play-by-play before tip) | the feed's |
| 405 | `method_not_allowed` | not GET/HEAD | `no-store` |
| 502 | `upstream_status` (+ `upstreamStatus`) | upstream 403, 5xx or any other non-200/404 | `no-store` |
| 502 | `upstream_timeout` | no answer in 8 s | `no-store` |
| 502 | `upstream_network` | connection error | `no-store` |
| 502 | `upstream_bad_body` | 200 that isn't JSON (e.g. a challenge page), or a schedule it can't project | `no-store` |
| 503 | `rate_budget` | no upstream slot within 5 s and nothing cached | `no-store` + `Retry-After` |

Unknown query params are rejected rather than ignored. That keeps the CDN key space bounded, so `?cb=123` can't mint fresh cache keys.

## Logging (D8: every request logged)

The function writes one JSON line per upstream request and nothing for cache hits:

```
{"evt":"nba_upstream","feed":"boxscore","game":"0022600104","url":"https://cdn.nba.com/...","status":200,
 "outcome":"ok","ms":143,"bytes":34883,"region":"iad1","at":"2026-10-24T..."}
```

It never logs headers or cookies.

## Tests

`tests/nba-proxy.test.mjs` runs under `node --test` with no network: both the upstream seam and `https.request` are faked. It covers:
- validation;
- the exact header set, with banned headers checked absent;
- the 8 s timeout;
- the error mapping;
- per-feed Cache-Control, plus the budget inequality computed from the live TTLs;
- memory-cache TTL, in-flight sharing, 2 s spacing, stale and 503;
- one log line per fetch;
- the schedule projection.

CI runs it through `tests/test_nba_proxy_node.py`, which follows the `test_live_node.py` pattern; ci.yml runs pytest.

`api/` is not mirrored by `scripts/sync_public.py`, and doesn't need to be. Vercel builds functions from the root `api/` directory (as with `api/odds.js`), while static files come from `public/`.

## Gate: does cdn.nba.com answer a Vercel IP?

See the result section below, filled in from the preview deploy of branch `forge/f1proxy`.

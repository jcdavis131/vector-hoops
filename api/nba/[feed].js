/* api/nba/[feed].js — Vercel serverless proxy for cdn.nba.com (feeds plan P1).
 *
 *   GET /api/nba/scoreboard               -> liveData/scoreboard/todaysScoreboard_00.json (raw)
 *   GET /api/nba/boxscore?game=<10 digits>  -> liveData/boxscore/boxscore_<id>.json (raw)
 *   GET /api/nba/playbyplay?game=<id>       -> liveData/playbyplay/playbyplay_<id>.json (raw)
 *   GET /api/nba/schedule[?from=&to=]       -> staticData/scheduleLeagueV2_1.json, PROJECTED
 *                                             (see projectSchedule; dates are YYYY-MM-DD)
 *
 * The browser cannot read cdn.nba.com itself: it answers CORS only for
 * https://www.nba.com and 403s any request without the nba.com Origin
 * (evidence/FEED-INVENTORY-2026-10-24.md). So this function makes the request.
 *
 * HEADERS (D8, Cam 2026-10-22: "Yes, repo's header set"). Exactly the set
 * pipeline/nba_http.py sends: its _STATS_HEADERS plus the Chrome 120 UA the
 * repo's fetchers use. No cookie warm-up, no Sec-Fetch-*, no Accept-Encoding,
 * no retries. The request goes through node:https, NOT global fetch: Node's
 * fetch (undici) silently adds `sec-fetch-mode: cors`, `accept-language: *`,
 * `user-agent: node` and `accept-encoding`, which would break "exactly".
 *
 * RATE BUDGET (D8: at most 1 request per 2 s per host = 0.5 req/s to
 * cdn.nba.com; every endpoint here is the same host).
 *   Each distinct cache key (one URL) is refreshed at most once per its TTL:
 *   the CDN serves it for s-maxage, stale-while-revalidate is that same single
 *   background refresh (it changes latency, not rate), and the in-memory cache
 *   below holds every outcome (200, 404, 5xx) for the same TTL.
 *   Worst case, 15 concurrent live games = 1 scoreboard + 15 boxscore +
 *   15 playbyplay + 1 schedule = 32 keys:
 *     1/S_sb + 15/S_box + 15/S_pbp + 1/S_sched <= 0.5 req/s
 *     1/15   + 15/75    + 15/75    + 1/600     = 0.0667 + 0.2 + 0.2 + 0.0017
 *                                              = 0.468 req/s  (<= 0.5, ~6% slack)
 *   The plan's 15-30 s for everything does NOT fit: 32 keys at 30 s is
 *   1.07 req/s, 2x over. Trade-off: boxscore and play-by-play can lag up to
 *   75 s (+ the SWR refresh); live score and clock come from the scoreboard,
 *   which lags at most 15 s.
 *   Belt and braces: a per-instance gate spaces upstream requests >= 2 s apart
 *   (MIN_GAP_MS). A request that cannot get a slot within MAX_WAIT_MS is served
 *   stale from memory if we have a copy, else 503 rate_budget. This also caps
 *   cache-busting with random game ids at 0.5 req/s per instance.
 *   The function is pinned to ONE region (vercel.json functions
 *   "api/nba/*.js" -> regions ["iad1"]), so there is one function cache, not
 *   one per region. Residual multiplier we cannot see from here: Vercel may run
 *   more than one instance in iad1 under load; each instance has its own memory
 *   and gate. Receipts: docs/platform/nba-proxy.md.
 *
 * LOGGING (D8: every request logged): exactly one JSON line per upstream
 * request, {evt:"nba_upstream", feed, game, url, status, outcome, ms, bytes,
 * region, at}. Never headers, never cookies.
 *
 * ERRORS (JSON {ok:false, error, feed, ...}; upstream headers are never passed on):
 *   400 bad_request      bad/missing/unknown query parameter
 *   404 unknown_feed     /api/nba/<something else>
 *   404 not_found        upstream said 404 (passthrough; e.g. pbp before tip)
 *   405 method_not_allowed
 *   502 upstream_timeout | upstream_status | upstream_network | upstream_bad_body
 *   503 rate_budget      no upstream slot within MAX_WAIT_MS and nothing cached
 */
'use strict';

var https = require('node:https');
var zlib = require('node:zlib');

var HOST = 'cdn.nba.com';
var BASE = 'https://cdn.nba.com/static/json';
var TIMEOUT_MS = 8000;
var MIN_GAP_MS = 2000; /* D8: 1 request per 2 s per host */
var MAX_WAIT_MS = 5000; /* longest a request waits for an upstream slot */
var MAX_KEYS = 500; /* bound on the in-memory cache */
var MAX_SPAN_DAYS = 62; /* schedule ?from=&to= window */

/* Exactly pipeline/nba_http.py _STATS_HEADERS + the repo's Chrome 120 UA (H1). */
var H1_HEADERS = Object.freeze({
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.nba.com',
  'Referer': 'https://www.nba.com/',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
});

var GAME_RE = /^\d{10}$/;
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ttl = s-maxage = in-memory TTL (seconds); swr = stale-while-revalidate. */
var FEEDS = {
  scoreboard: {
    ttl: 15, swr: 30, params: [],
    url: function () { return BASE + '/liveData/scoreboard/todaysScoreboard_00.json'; }
  },
  boxscore: {
    ttl: 75, swr: 75, params: ['game'],
    url: function (q) { return BASE + '/liveData/boxscore/boxscore_' + q.game + '.json'; }
  },
  playbyplay: {
    ttl: 75, swr: 75, params: ['game'],
    url: function (q) { return BASE + '/liveData/playbyplay/playbyplay_' + q.game + '.json'; }
  },
  schedule: {
    ttl: 600, swr: 3600, params: ['from', 'to'],
    url: function () { return BASE + '/staticData/scheduleLeagueV2_1.json'; }
  }
};

function cacheControl(feed) {
  var f = FEEDS[feed];
  return 'public, max-age=0, s-maxage=' + f.ttl + ', stale-while-revalidate=' + f.swr;
}

/* ---------- validation ---------- */

function validDate(s) {
  if (!DATE_RE.test(s)) return false;
  var d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/* Returns {feed, query} or {status, error, message}. */
function parseRequest(req) {
  var u;
  try { u = new URL(req.url || '/', 'http://localhost'); } catch (e) {
    return { status: 400, error: 'bad_request', message: 'unparseable url' };
  }
  var m = /^\/api\/nba\/([^/]+)\/?$/.exec(u.pathname);
  var feed = m ? m[1] : (req.query && req.query.feed);
  if (typeof feed !== 'string' || !Object.prototype.hasOwnProperty.call(FEEDS, feed)) {
    return { status: 404, error: 'unknown_feed', message: 'feeds: ' + Object.keys(FEEDS).join(', ') };
  }
  var spec = FEEDS[feed];
  var q = {};
  var bad = null;
  u.searchParams.forEach(function (v, k) {
    if (bad) return;
    if (k === 'feed') return; /* Vercel's own dynamic-route param */
    if (spec.params.indexOf(k) < 0) { bad = 'unknown parameter: ' + k; return; }
    if (Object.prototype.hasOwnProperty.call(q, k)) { bad = 'repeated parameter: ' + k; return; }
    q[k] = v;
  });
  if (bad) return { status: 400, error: 'bad_request', feed: feed, message: bad };
  if (spec.params.indexOf('game') >= 0 && !GAME_RE.test(q.game || '')) {
    return { status: 400, error: 'bad_request', feed: feed, message: 'game must match ^\\d{10}$' };
  }
  if (feed === 'schedule') {
    var f = q.from, t = q.to;
    if (f !== undefined && !validDate(f)) return { status: 400, error: 'bad_request', feed: feed, message: 'from must be YYYY-MM-DD' };
    if (t !== undefined && !validDate(t)) return { status: 400, error: 'bad_request', feed: feed, message: 'to must be YYYY-MM-DD' };
    if (f !== undefined && t !== undefined) {
      var span = (Date.parse(t) - Date.parse(f)) / 864e5;
      if (span < 0) return { status: 400, error: 'bad_request', feed: feed, message: 'from is after to' };
      if (span > MAX_SPAN_DAYS) return { status: 400, error: 'bad_request', feed: feed, message: 'window is over ' + MAX_SPAN_DAYS + ' days' };
    }
  }
  return { feed: feed, query: q };
}

/* ---------- schedule projection ----------
 * scheduleLeagueV2_1.json is ~406 KB. The schedule and scoreboard pages need
 * only who, when, status and score. Contract (keys copied only when present
 * upstream; nothing is filled in):
 *   {ok, source, seasonYear, from, to, gameDates: [{date: "YYYY-MM-DD",
 *     gameDate: <upstream string>, games: [{gameId, gameCode, gameStatus,
 *     gameStatusText, gameDateTimeUTC, gameDateEst, gameLabel, arenaName,
 *     arenaCity, homeTeam: {teamId, teamTricode, teamCity, teamName, wins,
 *     losses, score}, awayTeam: {...}}]}]}
 * It is a superset of tests/fixtures/scorecard/cdn_cache/scheduleLeagueV2.json.
 */
var GAME_KEYS = ['gameId', 'gameCode', 'gameStatus', 'gameStatusText', 'gameDateTimeUTC',
  'gameDateEst', 'gameLabel', 'arenaName', 'arenaCity'];
var TEAM_KEYS = ['teamId', 'teamTricode', 'teamCity', 'teamName', 'wins', 'losses', 'score'];

function pick(src, keys) {
  var out = {};
  keys.forEach(function (k) { if (src && src[k] !== undefined) out[k] = src[k]; });
  return out;
}

/* "10/20/2026 00:00:00" or "2026-10-20..." -> "2026-10-20"; else null. */
function isoDate(s) {
  if (typeof s !== 'string') return null;
  var m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (m) return m[3] + '-' + m[1] + '-' + m[2];
  m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : null;
}

function projectSchedule(raw, from, to) {
  var ls = raw && raw.leagueSchedule;
  if (!ls || !Array.isArray(ls.gameDates)) return null;
  var dates = [];
  for (var i = 0; i < ls.gameDates.length; i++) {
    var gd = ls.gameDates[i] || {};
    var date = isoDate(gd.gameDate);
    if (date === null) return null; /* unknown upstream date format: refuse, don't guess */
    if (from && date < from) continue;
    if (to && date > to) continue;
    dates.push({
      date: date,
      gameDate: gd.gameDate,
      games: (gd.games || []).map(function (g) {
        var o = pick(g, GAME_KEYS);
        if (g.homeTeam) o.homeTeam = pick(g.homeTeam, TEAM_KEYS);
        if (g.awayTeam) o.awayTeam = pick(g.awayTeam, TEAM_KEYS);
        return o;
      })
    });
  }
  return {
    ok: true,
    source: 'cdn.nba.com staticData/scheduleLeagueV2_1.json (projected)',
    seasonYear: ls.seasonYear,
    from: from || null,
    to: to || null,
    gameDates: dates
  };
}

/* ---------- upstream ---------- */

/* One GET with exactly H1_HEADERS. Resolves {status, body} (body a string) or
 * rejects with {code: 'upstream_timeout' | 'upstream_network'}. No retries. */
function fetchUpstream(url) {
  return new Promise(function (resolve, reject) {
    var done = false;
    function fail(code, msg) {
      if (done) return;
      done = true;
      reject({ code: code, message: msg });
    }
    var req = https.request(url, { method: 'GET', headers: Object.assign({}, H1_HEADERS) }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('error', function (e) { fail('upstream_network', String(e && e.message)); });
      res.on('end', function () {
        if (done) return;
        var buf = Buffer.concat(chunks);
        try {
          var enc = String(res.headers['content-encoding'] || '').toLowerCase();
          if (enc === 'gzip') buf = zlib.gunzipSync(buf);
          else if (enc === 'br') buf = zlib.brotliDecompressSync(buf);
          else if (enc === 'deflate') buf = zlib.inflateSync(buf);
        } catch (e) {
          return fail('upstream_network', 'bad content-encoding');
        }
        done = true;
        resolve({ status: res.statusCode, body: buf.toString('utf8') });
      });
    });
    req.setTimeout(TIMEOUT_MS, function () {
      fail('upstream_timeout', 'no answer in ' + TIMEOUT_MS + ' ms');
      req.destroy();
    });
    req.on('error', function (e) { fail('upstream_network', String(e && e.message)); });
    req.end();
  });
}

/* ---------- per-instance cache + gate ---------- */

var mem = new Map(); /* url -> {at, ttlMs, result} */
var inflight = new Map(); /* url -> Promise<result> */
var nextSlotAt = 0;

function now() { return module.exports._now(); }

function remember(url, ttlMs, result) {
  if (mem.size >= MAX_KEYS && !mem.has(url)) mem.delete(mem.keys().next().value);
  mem.set(url, { at: now(), ttlMs: ttlMs, result: result });
}

function logUpstream(rec) {
  module.exports._log(JSON.stringify(rec));
}

/* result: {kind: 'ok', body} | {kind: 'not_found'} | {kind: 'error', code, status?} */
function runUpstream(feed, game, url) {
  var t0 = now();
  return module.exports._upstream(url).then(function (r) {
    var result;
    if (r.status === 200) {
      try { JSON.parse(r.body); result = { kind: 'ok', body: r.body }; } catch (e) {
        result = { kind: 'error', code: 'upstream_bad_body', status: 200 };
      }
    } else if (r.status === 404) {
      result = { kind: 'not_found' };
    } else {
      result = { kind: 'error', code: 'upstream_status', status: r.status };
    }
    logUpstream({ evt: 'nba_upstream', feed: feed, game: game || null, url: url, status: r.status,
      outcome: result.kind === 'error' ? result.code : result.kind, ms: now() - t0,
      bytes: Buffer.byteLength(r.body || ''), region: process.env.VERCEL_REGION || null,
      at: new Date(t0).toISOString() });
    return result;
  }, function (e) {
    var code = (e && e.code === 'upstream_timeout') ? 'upstream_timeout' : 'upstream_network';
    logUpstream({ evt: 'nba_upstream', feed: feed, game: game || null, url: url, status: null,
      outcome: code, ms: now() - t0, bytes: 0, region: process.env.VERCEL_REGION || null,
      at: new Date(t0).toISOString() });
    return { kind: 'error', code: code };
  });
}

/* Resolves {result, cache: 'hit' | 'miss' | 'stale'} or {budget: true}. */
function getFeed(feed, game, url) {
  var ttlMs = FEEDS[feed].ttl * 1000;
  var c = mem.get(url);
  if (c && now() - c.at < c.ttlMs) return Promise.resolve({ result: c.result, cache: 'hit' });
  if (inflight.has(url)) {
    return inflight.get(url).then(function (r) { return { result: r, cache: 'hit' }; });
  }
  var slot = Math.max(now(), nextSlotAt);
  var wait = slot - now();
  if (wait > MAX_WAIT_MS) {
    if (c) return Promise.resolve({ result: c.result, cache: 'stale' });
    return Promise.resolve({ budget: true, retryAfter: Math.ceil(wait / 1000) });
  }
  nextSlotAt = slot + MIN_GAP_MS;
  var p = (wait > 0 ? module.exports._sleep(wait) : Promise.resolve())
    .then(function () { return runUpstream(feed, game, url); })
    .then(function (r) { remember(url, ttlMs, r); return r; });
  inflight.set(url, p);
  var clear = function () { inflight.delete(url); };
  p.then(clear, clear);
  return p.then(function (r) { return { result: r, cache: 'miss' }; });
}

/* ---------- response ---------- */

function send(res, req, status, body, cc, extra) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cc);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (extra) Object.keys(extra).forEach(function (k) { res.setHeader(k, extra[k]); });
  var text = typeof body === 'string' ? body : JSON.stringify(body);
  res.setHeader('Content-Length', Buffer.byteLength(text));
  res.end(req.method === 'HEAD' ? undefined : text);
}

function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return Promise.resolve(send(res, req, 405, { ok: false, error: 'method_not_allowed' },
      'no-store', { Allow: 'GET, HEAD' }));
  }
  var p = parseRequest(req);
  if (p.error) {
    return Promise.resolve(send(res, req, p.status,
      { ok: false, error: p.error, feed: p.feed || null, message: p.message },
      'public, max-age=0, s-maxage=3600'));
  }
  var feed = p.feed, q = p.query;
  var url = FEEDS[feed].url(q);
  return getFeed(feed, q.game, url).then(function (g) {
    if (g.budget) {
      return send(res, req, 503, { ok: false, error: 'rate_budget', feed: feed,
        message: 'upstream budget is 1 request per 2 s; retry shortly' },
      'no-store', { 'Retry-After': String(g.retryAfter) });
    }
    var r = g.result;
    var extra = { 'X-Proxy-Cache': g.cache };
    if (r.kind === 'not_found') {
      return send(res, req, 404, { ok: false, error: 'not_found', feed: feed, game: q.game || null },
        cacheControl(feed), extra);
    }
    if (r.kind === 'error') {
      return send(res, req, 502, { ok: false, error: r.code, feed: feed,
        upstreamStatus: r.status === undefined ? null : r.status }, 'no-store', extra);
    }
    if (feed === 'schedule') {
      var proj = projectSchedule(JSON.parse(r.body), q.from, q.to);
      if (!proj) {
        return send(res, req, 502, { ok: false, error: 'upstream_bad_body', feed: feed,
          upstreamStatus: 200 }, 'no-store', extra);
      }
      return send(res, req, 200, proj, cacheControl(feed), extra);
    }
    return send(res, req, 200, r.body, cacheControl(feed), extra);
  });
}

module.exports = handler;

/* Seams for tests/nba-proxy.test.mjs (same pattern as api/odds.js). */
module.exports._upstream = fetchUpstream;
module.exports._now = function () { return Date.now(); };
module.exports._sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
module.exports._log = function (line) { console.log(line); };
module.exports._reset = function () { mem.clear(); inflight.clear(); nextSlotAt = 0; };
module.exports._parseRequest = parseRequest;
module.exports._projectSchedule = projectSchedule;
module.exports._cacheControl = cacheControl;
module.exports._FEEDS = FEEDS;
module.exports._H1_HEADERS = H1_HEADERS;
module.exports._TIMEOUT_MS = TIMEOUT_MS;
module.exports._MIN_GAP_MS = MIN_GAP_MS;

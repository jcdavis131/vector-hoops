/* tests/nba-proxy.test.mjs — unit tests for api/nba/[feed].js (feeds plan P1).
 * Run: node --test tests/nba-proxy.test.mjs (stdlib only, no network: the
 * upstream call and https.request are both replaced by fakes).
 */
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
const https = require('node:https');
const proxy = require('../api/nba/[feed].js');

const realUpstream = proxy._upstream;
let clock = 1_000_000;
let calls = [];
let logs = [];
let slept = [];
let answer = () => ({ status: 200, body: '{"ok":1}' });

beforeEach(() => {
  proxy._reset();
  clock = 1_000_000;
  calls = [];
  logs = [];
  slept = [];
  answer = () => ({ status: 200, body: '{"ok":1}' });
  proxy._now = () => clock;
  proxy._sleep = (ms) => { slept.push(ms); clock += ms; return Promise.resolve(); };
  proxy._log = (line) => logs.push(JSON.parse(line));
  proxy._upstream = (url) => {
    calls.push(url);
    const a = answer(url);
    return a instanceof Error || a.code ? Promise.reject(a) : Promise.resolve(a);
  };
});

function fakeRes() {
  return {
    statusCode: 0, headers: {}, body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = b; }
  };
}

async function call(url, method = 'GET') {
  const res = fakeRes();
  await proxy({ method, url }, res);
  const json = res.body ? JSON.parse(res.body) : null;
  return { res, json };
}

const CDN = 'https://cdn.nba.com/static/json';

/* ---------- validation ---------- */

test('game id must be exactly 10 digits', async () => {
  for (const bad of ['', '123', '00226001041', '002260010a', '0022600104%20', '../../x']) {
    const { res, json } = await call('/api/nba/boxscore?game=' + bad);
    assert.equal(res.statusCode, 400, bad);
    assert.equal(json.error, 'bad_request');
  }
  const { res } = await call('/api/nba/playbyplay');
  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0, 'no upstream call on bad input');
});

test('unknown and repeated params are 400; Vercel feed param is ignored', async () => {
  assert.equal((await call('/api/nba/scoreboard?x=1')).res.statusCode, 400);
  assert.equal((await call('/api/nba/boxscore?game=0022600104&game=0022600105')).res.statusCode, 400);
  assert.equal((await call('/api/nba/scoreboard?feed=scoreboard')).res.statusCode, 200);
});

test('unknown feed is a typed 404, not an upstream call', async () => {
  const { res, json } = await call('/api/nba/odds');
  assert.equal(res.statusCode, 404);
  assert.equal(json.error, 'unknown_feed');
  assert.equal(calls.length, 0);
});

test('schedule window validation', async () => {
  for (const q of ['from=2026-13-01', 'to=2026-02-30', 'from=20261020', 'from=2026-11-01&to=2026-10-01', 'from=2026-01-01&to=2026-06-01']) {
    assert.equal((await call('/api/nba/schedule?' + q)).res.statusCode, 400, q);
  }
});

test('only GET and HEAD', async () => {
  const { res } = await call('/api/nba/scoreboard', 'POST');
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers['allow'], 'GET, HEAD');
});

/* ---------- routing + passthrough ---------- */

test('each feed hits the documented cdn.nba.com URL', async () => {
  await call('/api/nba/scoreboard');
  await call('/api/nba/boxscore?game=0022600104');
  await call('/api/nba/playbyplay?game=0022600104');
  assert.deepEqual(calls, [
    CDN + '/liveData/scoreboard/todaysScoreboard_00.json',
    CDN + '/liveData/boxscore/boxscore_0022600104.json',
    CDN + '/liveData/playbyplay/playbyplay_0022600104.json'
  ]);
});

test('200 passes the body through unchanged and leaks no upstream header', async () => {
  answer = () => ({ status: 200, body: '{"scoreboard":{"games":[]}}', headers: { 'set-cookie': 'bm_s=x' } });
  const { res } = await call('/api/nba/scoreboard');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, '{"scoreboard":{"games":[]}}');
  assert.deepEqual(Object.keys(res.headers).sort(),
    ['cache-control', 'content-length', 'content-type', 'x-content-type-options', 'x-proxy-cache']);
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
});

test('HEAD sends headers and no body', async () => {
  const { res } = await call('/api/nba/scoreboard', 'HEAD');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, undefined);
});

/* ---------- error mapping ---------- */

test('upstream 404 passes through as typed 404 with the feed cache header', async () => {
  answer = () => ({ status: 404, body: '<Error>NoSuchKey</Error>' });
  const { res, json } = await call('/api/nba/playbyplay?game=0022600999');
  assert.equal(res.statusCode, 404);
  assert.deepEqual(json, { ok: false, error: 'not_found', feed: 'playbyplay', game: '0022600999' });
  assert.equal(res.headers['cache-control'], 'public, max-age=0, s-maxage=75, stale-while-revalidate=75');
});

test('upstream 403/500 -> 502 upstream_status, no-store', async () => {
  for (const status of [403, 500, 503]) {
    proxy._reset();
    answer = () => ({ status, body: 'denied' });
    const { res, json } = await call('/api/nba/scoreboard');
    assert.equal(res.statusCode, 502);
    assert.deepEqual(json, { ok: false, error: 'upstream_status', feed: 'scoreboard', upstreamStatus: status });
    assert.equal(res.headers['cache-control'], 'no-store');
  }
});

test('timeout, network failure and non-JSON 200 are typed 502s', async () => {
  const cases = [
    [{ code: 'upstream_timeout' }, 'upstream_timeout'],
    [{ code: 'upstream_network' }, 'upstream_network'],
    [{ status: 200, body: '<html>challenge</html>' }, 'upstream_bad_body']
  ];
  for (const [a, code] of cases) {
    proxy._reset();
    answer = () => a;
    const { res, json } = await call('/api/nba/boxscore?game=0022600104');
    assert.equal(res.statusCode, 502, code);
    assert.equal(json.error, code);
  }
});

/* ---------- cache headers + budget ---------- */

test('Cache-Control per feed matches the budget arithmetic', () => {
  assert.equal(proxy._cacheControl('scoreboard'), 'public, max-age=0, s-maxage=15, stale-while-revalidate=30');
  assert.equal(proxy._cacheControl('boxscore'), 'public, max-age=0, s-maxage=75, stale-while-revalidate=75');
  assert.equal(proxy._cacheControl('playbyplay'), 'public, max-age=0, s-maxage=75, stale-while-revalidate=75');
  assert.equal(proxy._cacheControl('schedule'), 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600');
  const F = proxy._FEEDS;
  const worst = 1 / F.scoreboard.ttl + 15 / F.boxscore.ttl + 15 / F.playbyplay.ttl + 1 / F.schedule.ttl;
  assert.ok(worst <= 0.5, 'worst case ' + worst + ' req/s exceeds D8 0.5 req/s');
});

test('memory cache holds every outcome for the feed TTL', async () => {
  answer = () => ({ status: 404, body: 'x' });
  await call('/api/nba/playbyplay?game=0022600104');
  clock += 74_000;
  const second = await call('/api/nba/playbyplay?game=0022600104');
  assert.equal(second.res.headers['x-proxy-cache'], 'hit');
  assert.equal(calls.length, 1);
  clock += 2_000;
  await call('/api/nba/playbyplay?game=0022600104');
  assert.equal(calls.length, 2);
});

test('concurrent misses on one key share one upstream request', async () => {
  await Promise.all([1, 2, 3].map(() => call('/api/nba/scoreboard')));
  assert.equal(calls.length, 1);
});

test('upstream requests are spaced >= 2 s apart; over-budget is stale or 503', async () => {
  const ids = ['0022600101', '0022600102', '0022600103', '0022600104', '0022600105'];
  // Sequential distinct keys at the same instant: 0, 2, 4 s waits, then over MAX_WAIT_MS.
  const out = [];
  for (const id of ids) {
    clock = 1_000_000; // every request arrives at the same moment
    out.push(await call('/api/nba/boxscore?game=' + id));
  }
  assert.deepEqual(slept, [2000, 4000]);
  assert.equal(calls.length, 3);
  assert.equal(out[3].res.statusCode, 503);
  assert.equal(out[3].json.error, 'rate_budget');
  assert.ok(Number(out[3].res.headers['retry-after']) >= 1);
});

test('expired key with no slot is served stale from memory', async () => {
  await call('/api/nba/scoreboard');
  clock += 16_000; // scoreboard expired
  proxy._sleep = () => Promise.resolve(); // hold the clock: three slots reserved at once
  for (const id of ['0022600101', '0022600102', '0022600103']) call('/api/nba/boxscore?game=' + id);
  const { res } = await call('/api/nba/scoreboard');
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['x-proxy-cache'], 'stale');
});

test('one log line per upstream request, no headers in it', async () => {
  await call('/api/nba/boxscore?game=0022600104');
  await call('/api/nba/boxscore?game=0022600104'); // cached: no new line
  assert.equal(logs.length, 1);
  const l = logs[0];
  assert.equal(l.evt, 'nba_upstream');
  assert.equal(l.feed, 'boxscore');
  assert.equal(l.game, '0022600104');
  assert.equal(l.status, 200);
  assert.equal(l.outcome, 'ok');
  assert.ok(!JSON.stringify(l).toLowerCase().includes('user-agent'));
});

/* ---------- schedule projection ---------- */

test('schedule is projected and windowed; nothing is filled in', async () => {
  const raw = {
    meta: { version: 1 },
    leagueSchedule: {
      seasonYear: '2026-27',
      gameDates: [
        { gameDate: '10/20/2026 00:00:00', games: [{ gameId: '0022600001', gameStatus: 3, gameStatusText: 'Final', broadcasters: { big: 1 }, homeTeam: { teamId: 1, teamTricode: 'DET', score: 121, seed: null }, awayTeam: { teamId: 2, teamTricode: 'BOS', score: 113 } }] },
        { gameDate: '10/21/2026 00:00:00', games: [{ gameId: '0022600004', gameStatus: 1 }] }
      ]
    }
  };
  answer = () => ({ status: 200, body: JSON.stringify(raw) });
  const { res, json } = await call('/api/nba/schedule?from=2026-10-20&to=2026-10-20');
  assert.equal(res.statusCode, 200);
  assert.equal(json.seasonYear, '2026-27');
  assert.equal(json.gameDates.length, 1);
  assert.equal(json.gameDates[0].date, '2026-10-20');
  assert.deepEqual(json.gameDates[0].games[0], {
    gameId: '0022600001', gameStatus: 3, gameStatusText: 'Final',
    homeTeam: { teamId: 1, teamTricode: 'DET', score: 121 },
    awayTeam: { teamId: 2, teamTricode: 'BOS', score: 113 }
  });
  // A different window reuses the one cached upstream body.
  const all = await call('/api/nba/schedule');
  assert.equal(all.json.gameDates.length, 2);
  assert.deepEqual(all.json.gameDates[1].games[0], { gameId: '0022600004', gameStatus: 1 });
  assert.equal(calls.length, 1);
});

test('schedule with an unknown date format is refused, not guessed', () => {
  assert.equal(proxy._projectSchedule({ leagueSchedule: { gameDates: [{ gameDate: 'Oct 20', games: [] }] } }), null);
  assert.equal(proxy._projectSchedule({}), null);
});

/* ---------- the real transport: exact header set ---------- */

function stubHttps(respond) {
  const seen = [];
  const orig = https.request;
  https.request = (url, opts, cb) => {
    seen.push({ url, opts });
    const req = new EventEmitter();
    req.setTimeout = (ms, fn) => { req.timeoutMs = ms; req.onTimeout = fn; };
    req.destroy = () => { req.destroyed = true; };
    req.end = () => respond(req, cb);
    return req;
  };
  return { seen, restore: () => { https.request = orig; } };
}

function fakeIncoming(status, body, headers = {}) {
  const res = new EventEmitter();
  res.statusCode = status;
  res.headers = headers;
  setImmediate(() => { res.emit('data', body); res.emit('end'); });
  return res;
}

test('transport sends exactly the H1 header set (D8) and nothing else', async () => {
  const s = stubHttps((req, cb) => cb(fakeIncoming(200, Buffer.from('{"a":1}'))));
  try {
    const r = await realUpstream(CDN + '/liveData/scoreboard/todaysScoreboard_00.json');
    assert.deepEqual(r, { status: 200, body: '{"a":1}' });
  } finally { s.restore(); }
  const h = s.seen[0].opts.headers;
  assert.equal(s.seen[0].opts.method, 'GET');
  assert.deepEqual(h, {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://www.nba.com',
    'Referer': 'https://www.nba.com/',
    'x-nba-stats-origin': 'stats',
    'x-nba-stats-token': 'true',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const keys = Object.keys(h).map((k) => k.toLowerCase());
  for (const banned of ['cookie', 'accept-encoding', 'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-dest', 'sec-ch-ua']) {
    assert.ok(!keys.includes(banned), banned);
  }
});

test('transport timeout is 8 s and maps to upstream_timeout', async () => {
  let reqRef;
  const s = stubHttps((req) => { reqRef = req; setImmediate(() => req.onTimeout()); });
  try {
    await assert.rejects(realUpstream(CDN + '/x.json'), (e) => e.code === 'upstream_timeout');
  } finally { s.restore(); }
  assert.equal(reqRef.timeoutMs, 8000);
  assert.equal(reqRef.destroyed, true);
});

test('transport network error and gzip body', async () => {
  let s = stubHttps((req) => setImmediate(() => req.emit('error', new Error('ECONNRESET'))));
  try {
    await assert.rejects(realUpstream(CDN + '/x.json'), (e) => e.code === 'upstream_network');
  } finally { s.restore(); }
  s = stubHttps((req, cb) => cb(fakeIncoming(200, zlib.gzipSync('{"z":2}'), { 'content-encoding': 'gzip' })));
  try {
    assert.deepEqual(await realUpstream(CDN + '/x.json'), { status: 200, body: '{"z":2}' });
  } finally { s.restore(); }
});

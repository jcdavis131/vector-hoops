// feed-health.js staleness rule: the 120-minute limit status.html states.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { shownStatus, STALE_AFTER_MINUTES } = require('../assets/realtime/feed-health.js');
const MIN = 60000;
const NOW = Date.parse('2026-11-10T12:00:00Z');
const tick = ago => new Date(NOW - ago * MIN).toISOString();

test('ok at 119 minutes stays ok', () => assert.equal(shownStatus('ok', tick(119), NOW), 'ok'));
test('ok at exactly 120 minutes stays ok (older than 120 is stale)', () => assert.equal(shownStatus('ok', tick(120), NOW), 'ok'));
test('ok at 121 minutes is stale', () => assert.equal(shownStatus('ok', tick(121), NOW), 'stale'));
test('down stays down, fresh or old', () => {
  assert.equal(shownStatus('down', tick(1), NOW), 'down');
  assert.equal(shownStatus('down', tick(100000), NOW), 'down');
  assert.equal(shownStatus('down', 'unknown', NOW), 'down');
});
test('an unknown or missing tick is stale', () => {
  assert.equal(shownStatus('ok', 'unknown', NOW), 'stale');
  assert.equal(shownStatus('ok', undefined, NOW), 'stale');
  assert.equal(shownStatus('ok', null, NOW), 'stale');
});
test('degraded and fresh stays degraded', () => assert.equal(shownStatus('degraded', tick(5), NOW), 'degraded'));

test('the 120 equals FEED_STALE_AFTER_MINUTES in scripts/build_status.py', () => {
  const py = fs.readFileSync(new URL('../scripts/build_status.py', import.meta.url), 'utf8');
  const m = py.match(/^FEED_STALE_AFTER_MINUTES\s*=\s*(\d+)/m);
  assert.ok(m, 'FEED_STALE_AFTER_MINUTES not found in build_status.py');
  assert.equal(STALE_AFTER_MINUTES, Number(m[1]));
});

function realtimeWindow(nowMs) {
  const src = fs.readFileSync(new URL('../assets/realtime/realtime.js', import.meta.url), 'utf8');
  const g = {};
  new Function('window', 'Date', src.replace(/\}\)\(typeof window[\s\S]*$/, '})(window);'))(g, class extends Date {
    static now() { return nowMs; }
  });
  return g;
}

test('the committed ledger: newest tick + 121 min -> all stale; + 119 min -> the newest is not', () => {
  const led = JSON.parse(fs.readFileSync(new URL('../assets/realtime/feed_health.json', import.meta.url), 'utf8'));
  const rows = Object.entries(led.sources).filter(([, s]) => s && typeof s === 'object');
  const ticks = rows.map(([, s]) => Date.parse(s.last_good_tick)).filter(Number.isFinite);
  if (!ticks.length) return;
  const newest = Math.max(...ticks);
  for (const [name, s] of rows) {
    assert.equal(shownStatus(s.status, s.last_good_tick, newest + 121 * MIN), s.status === 'down' ? 'down' : 'stale', name);
  }
  // A row recorded 'down' stays 'down' by the rule, and the writer keeps its old tick, so the
  // "not stale" side looks only at rows that are not down and have a parseable tick.
  const live = rows.filter(([, s]) => s.status !== 'down' && Number.isFinite(Date.parse(s.last_good_tick)));
  if (!live.length) return;
  const newestLive = Math.max(...live.map(([, s]) => Date.parse(s.last_good_tick)));
  for (const [name, s] of live.filter(([, s]) => Date.parse(s.last_good_tick) === newestLive)) {
    assert.notEqual(shownStatus(s.status, s.last_good_tick, newestLive + 119 * MIN), 'stale', name);
  }
});

test('realtime.js prints ages over 48 h in days, at the boundary', () => {
  const badge = iso => realtimeWindow(NOW).Realtime.staleBadge(iso);
  assert.match(badge(tick(47 * 60)), /47 hr ago/);
  assert.match(badge(tick(48 * 60 - 1)), /48 hr ago/);
  assert.match(badge(tick(48 * 60 + 1)), /2 d ago/);
  assert.match(badge(tick(49 * 60)), /2 d ago/);
  assert.match(badge(tick(486 * 60)), /20 d ago/);
});

/* The page itself: feed-health.js run in node against a fake document and the
 * real realtime.js, then asserting on the rendered HTML. */
async function renderPage(health, snap, nowMs) {
  const els = { overall: {}, sources: {}, snapshot: {} };
  const win = realtimeWindow(nowMs);
  win.Realtime.loadJson = url => Promise.resolve(/feed_health/.test(url) ? health : snap);
  const doc = { readyState: 'complete', getElementById: id => els[id], addEventListener() {} };
  const src = fs.readFileSync(new URL('../assets/realtime/feed-health.js', import.meta.url), 'utf8');
  new Function('window', 'document', 'Date', src)(win, doc, class extends Date {
    static now() { return nowMs; }
  });
  await new Promise(r => setTimeout(r, 10));
  return els;
}
const src = (name, agoMin, status = 'ok') => [name, {
  status, last_good_tick: tick(agoMin), checked_at: tick(1), latency_ms: 5, consecutive_failures: 0, detail: 'row'
}];
const ledger = (...rows) => ({ sources: Object.fromEntries(rows) });
const snapAt = (agoMin, quiet = false) => ({ as_of: tick(agoMin), quiet, season: 's', games: [] });
const dots = html => [...html.matchAll(/class="fh-dot ([^"]*)"/g)].map(m => m[1]);
const statusTexts = html => [...html.matchAll(/<dt>Status<\/dt><dd>([^<]*)<\/dd>/g)].map(m => m[1]);

test('page (a): old ticks -> no healthy verdict, stale verdict, no ok dot, each Status stale', async () => {
  const e = await renderPage(ledger(src('a', 9000), src('b', 9000), src('c', 700)), snapAt(9000), NOW);
  assert.ok(!e.overall.innerHTML.includes('All sources healthy.'));
  assert.match(e.overall.innerHTML, /stale/);
  assert.ok(!e.overall.innerHTML.includes('fh-dot ok'));
  assert.ok(!e.sources.innerHTML.includes('fh-dot ok'));
  assert.ok(!e.snapshot.innerHTML.includes('fh-dot ok'));
  assert.deepEqual(statusTexts(e.sources.innerHTML), ['stale', 'stale', 'stale']);
  assert.deepEqual(dots(e.sources.innerHTML), ['degraded', 'degraded', 'degraded']);
});

test('page (b): one stale source with a fresh snapshot -> degraded', async () => {
  const e = await renderPage(ledger(src('a', 5), src('b', 500)), snapAt(1), NOW);
  assert.match(e.overall.innerHTML, /Degraded/);
  assert.match(e.overall.innerHTML, /fh-dot degraded/);
  assert.deepEqual(statusTexts(e.sources.innerHTML), ['ok', 'stale']);
  assert.deepEqual(dots(e.sources.innerHTML), ['ok', 'degraded']);
});

test('page: a fresh source recorded degraded -> Degraded verdict, degraded dot', async () => {
  const e = await renderPage(ledger(src('a', 5), src('b', 5, 'degraded')), snapAt(1), NOW);
  assert.match(e.overall.innerHTML, /Degraded/);
  assert.ok(!e.overall.innerHTML.includes('All sources healthy.'));
  assert.deepEqual(dots(e.sources.innerHTML), ['ok', 'degraded']);
});

test('page (c): fresh sources with a stale snapshot -> degraded, snapshot dot not ok', async () => {
  const e = await renderPage(ledger(src('a', 5), src('b', 6)), snapAt(500), NOW);
  assert.match(e.overall.innerHTML, /Degraded/);
  assert.ok(!e.snapshot.innerHTML.includes('fh-dot ok'));
});

test('page (d): all fresh -> All sources healthy.', async () => {
  const e = await renderPage(ledger(src('a', 5), src('b', 6)), snapAt(1), NOW);
  assert.match(e.overall.innerHTML, /All sources healthy\./);
  assert.match(e.overall.innerHTML, /fh-dot ok/);
  assert.match(e.snapshot.innerHTML, /fh-dot ok/);
});

test('page (e): fresh checked_at but old last_good_tick is stale', async () => {
  const e = await renderPage(ledger(src('a', 5), src('b', 500)), snapAt(1), NOW);
  assert.deepEqual(statusTexts(e.sources.innerHTML), ['ok', 'stale']);
  assert.ok(!e.overall.innerHTML.includes('All sources healthy.'));
});

test('page: quiet and fresh -> All sources healthy., snapshot dot stays degraded', async () => {
  const e = await renderPage(ledger(src('a', 1)), snapAt(1, true), NOW);
  assert.match(e.overall.innerHTML, /All sources healthy\./);
  assert.match(e.snapshot.innerHTML, /fh-dot degraded/);
});

test('page: a down source keeps the Down verdict; a null source entry does not crash', async () => {
  const e = await renderPage(ledger(src('a', 5, 'down'), ['n', null]), snapAt(1), NOW);
  assert.match(e.overall.innerHTML, /Down:/);
  assert.equal(statusTexts(e.sources.innerHTML).length, 2);
});

test('page: the committed ledger, clocked from the file, never reads healthy when stale', async () => {
  const led = JSON.parse(fs.readFileSync(new URL('../assets/realtime/feed_health.json', import.meta.url), 'utf8'));
  const ticks = Object.values(led.sources).filter(s => s && typeof s === 'object').map(s => Date.parse(s.last_good_tick)).filter(Number.isFinite);
  if (!ticks.length) return;
  const newest = Math.max(...ticks);
  const old = await renderPage(led, snapAt(1), newest + 121 * MIN);
  assert.ok(!old.overall.innerHTML.includes('All sources healthy.'));
  assert.ok(!old.sources.innerHTML.includes('fh-dot ok'));
});

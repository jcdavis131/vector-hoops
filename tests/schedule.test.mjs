// schedule.js renders what Scoreboard.fetchWeek() really returns: [{day, games, failed?}].
// Stubs below are MOCKED, ESPN-shaped events trimmed to the fields parseEvents reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const sched = require('../assets/schedule.js');
const sb = require('../assets/scoreboard.js');

const DAYS = ['20261106', '20261107', '20261108', '20261109', '20261110', '20261111', '20261112'];

// mocked ESPN event (not real data), run through the real parseEvents
function mockEvent(id, date, state, away, home) {
  const team = (abbr, homeAway, score) => ({
    homeAway, score, team: { abbreviation: abbr, displayName: abbr + ' mock', color: '111111' },
  });
  const raw = {
    events: [{
      id, date,
      status: { type: { state, shortDetail: '11/09 - 8:00 PM EST' } },
      competitions: [{ status: { displayClock: '0.0', period: 4 },
        competitors: [team(home, 'home', '101'), team(away, 'away', '99')] }],
    }],
  };
  return sb.parseEvents(raw)[0];
}
const box = () => ({ innerHTML: '' });
const LABELS = ['Fri, 11/6', 'Sat, 11/7', 'Sun, 11/8', 'Mon, 11/9', 'Tue, 11/10', 'Wed, 11/11', 'Thu, 11/12'];
const key = (d) => d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8);

test('(a) a game renders as AWAY @ HOME under its own day only', () => {
  const g = mockEvent('1', '2026-11-10T01:00:00Z', 'pre', 'BOS', 'NYK');
  const week = DAYS.map((day) => ({ day, games: day === '20261109' ? [g] : [] }));
  const on = box(); sched.renderDay(on, week, key('20261109'));
  assert.match(on.innerHTML, /BOS @ NYK/);
  assert.match(on.innerHTML, /href="live\.html\?game=1"/);
  assert.match(on.innerHTML, /live →/);
  for (const d of DAYS.filter((x) => x !== '20261109')) {
    const b = box(); sched.renderDay(b, week, key(d));
    assert.doesNotMatch(b.innerHTML, /BOS|NYK/);
    assert.match(b.innerHTML, /No games this day\./);
  }
});

test('(b) nav day keys equal the fetched day keys in three time zones', () => {
  const script = `const s=require(${JSON.stringify(new URL('../assets/schedule.js', import.meta.url).pathname)});
    const w=${JSON.stringify(DAYS)}.map(day=>({day,games:[]}));
    console.log(JSON.stringify(s.weekDays(w).map(d=>[d.key,d.label])));`;
  for (const tz of ['America/Chicago', 'UTC', 'Asia/Tokyo']) {
    const r = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.map((x) => x[0]), DAYS.map(key), tz);
    assert.deepEqual(out.map((x) => x[1]), LABELS, tz + ' labels (what a visitor reads)');
  }
});

test('(c) a day whose fetch failed says it could not be loaded, not "No games"', async () => {
  const realFetch = globalThis.fetch;
  let week;
  try {
    globalThis.fetch = async () => { throw new Error('mock network down'); }; // mocked outage
    week = await sb.fetchWeek();
  } finally { globalThis.fetch = realFetch; }
  const b = box(); sched.renderDay(b, week, sched.weekDays(week)[2].key);
  assert.match(b.innerHTML, /could not be loaded/);
  assert.doesNotMatch(b.innerHTML, /No games this day\./);
});

test('(d) a day that loaded with zero games says No games this day.', () => {
  const week = DAYS.map((day) => ({ day, games: [] }));
  const b = box(); sched.renderDay(b, week, key('20261108'));
  assert.match(b.innerHTML, /No games this day\./);
  assert.doesNotMatch(b.innerHTML, /could not be loaded/);
});

test('pre-game rows show Central tip time and no Eastern label', () => {
  const g = mockEvent('2', '2026-11-10T01:00:00Z', 'pre', 'BOS', 'NYK'); // 7:00 PM CST
  const week = DAYS.map((day) => ({ day, games: day === '20261109' ? [g] : [] }));
  const b = box(); sched.renderDay(b, week, key('20261109'));
  assert.match(b.innerHTML, /7:00\s?PM CST/);
  assert.doesNotMatch(b.innerHTML, /\b(EDT|EST|ET)\b/);
});

test('final rows show away - home score', () => {
  const g = mockEvent('3', '2026-11-10T01:00:00Z', 'post', 'BOS', 'NYK');
  const week = DAYS.map((day) => ({ day, games: day === '20261109' ? [g] : [] }));
  const b = box(); sched.renderDay(b, week, key('20261109'));
  assert.match(b.innerHTML, /99 - 101 · Final/);
});

test('fetchWeek marks a failed day and keeps a loaded one', async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (u) => {
      if (u.endsWith(sb.shiftDay(sb.etToday(), 1))) throw new Error('mock network down');
      return { ok: true, json: async () => ({ events: [] }) };
    };
    const w = await sb.fetchWeek();
    assert.equal(w.length, 7);
    assert.equal(w.filter((x) => x.failed).length, 1);
    assert.equal(w[4].failed, true);
    assert.equal(w[3].failed, undefined);
  } finally { globalThis.fetch = realFetch; }
});

test('games within a day are ordered by tip time; a live row shows its detail', () => {
  const late = mockEvent('5', '2026-11-10T03:00:00Z', 'pre', 'LAL', 'DEN');
  const early = mockEvent('6', '2026-11-10T00:00:00Z', 'pre', 'BOS', 'NYK');
  const live = Object.assign(mockEvent('7', '2026-11-10T01:00:00Z', 'in', 'MIA', 'ORL'), { detail: 'Q3 5:42' });
  const week = DAYS.map((day) => ({ day, games: day === '20261109' ? [late, live, early] : [] }));
  const b = box(); sched.renderDay(b, week, key('20261109'));
  const at = (t) => b.innerHTML.indexOf(t);
  assert.ok(at('BOS @ NYK') >= 0 && at('BOS @ NYK') < at('MIA @ ORL') && at('MIA @ ORL') < at('LAL @ DEN'));
  assert.match(b.innerHTML, /LIVE<\/b> Q3 5:42/);
});

test('routeFor: pre/in and recent finals go to live, finals older than 24h to replay', () => {
  const h = 3600e3;
  const ev = (state, ageH, date) => ({ id: 'x1', state, date: date !== undefined ? date : new Date(Date.now() - ageH * h).toISOString() });
  assert.equal(sched.routeFor(ev('pre', 0)), 'live.html?game=x1');
  assert.equal(sched.routeFor(ev('in', 1)), 'live.html?game=x1');
  assert.equal(sched.routeFor(ev('post', 5)), 'live.html?game=x1');
  assert.equal(sched.routeFor(ev('post', 40)), 'replay.html?espn=x1');
  assert.equal(sched.routeFor(ev('post', 0, 'not a date')), 'live.html?game=x1');
});

test('boot() paints the nav from fetched keys, selects day 4, renders it, and handles clicks (3 zones)', () => {
  const script = `
    const assert = require('node:assert/strict');
    const nav = { innerHTML: '', handlers: {}, addEventListener(t, f) { this.handlers[t] = f; } };
    const box = { innerHTML: '' };
    const DAYS = ${JSON.stringify(DAYS)};
    const LABELS = ${JSON.stringify(LABELS)};
    const g = { id: '1', date: '2026-11-10T01:00:00Z', state: 'pre', detail: '', a: { abbr: 'BOS', score: '0' }, h: { abbr: 'NYK', score: '0' } };
    const week = DAYS.map((day) => ({ day, games: day === '20261109' ? [g] : [] }));
    globalThis.window = globalThis;
    globalThis.document = { readyState: 'complete', getElementById: (id) => ({ schedNav: nav, schedBox: box }[id]) };
    globalThis.Scoreboard = { fetchWeek: async () => week };
    require(${JSON.stringify(new URL('../assets/schedule.js', import.meta.url).pathname)});
    assert.match(box.innerHTML, /Loading the week/, 'loading text before the fetch settles');
    setTimeout(() => {
      const keys = [...nav.innerHTML.matchAll(/data-day="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(keys, DAYS.map((d) => d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8)), 'nav keys = fetched keys');
      const texts = [...nav.innerHTML.matchAll(/<button[^>]*>([^<]*)<[/]button>/g)].map((m) => m[1]);
      assert.deepEqual(texts, LABELS, 'painted button text');
      assert.match(nav.innerHTML, /is-active" data-day="2026-11-09" aria-current="date">Mon, 11[/]9<[/]button>/, 'fourth day active, labelled Mon, 11/9');
      assert.equal((nav.innerHTML.match(/is-active/g) || []).length, 1);
      assert.match(box.innerHTML, /BOS @ NYK/, 'first paint shows the selected day');
      nav.handlers.click({ target: { closest: () => ({ getAttribute: () => '2026-11-08' }) } });
      assert.match(box.innerHTML, /No games this day\\./, 'click repaints the box');
      assert.match(nav.innerHTML, /is-active" data-day="2026-11-08" aria-current="date">Sun, 11[/]8<[/]button>/, 'click moves the active day');
      assert.equal((nav.innerHTML.match(/is-active/g) || []).length, 1);
    }, 20);`;
  for (const tz of ['America/Chicago', 'UTC', 'Asia/Tokyo']) {
    const r = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.equal(r.status, 0, tz + ': ' + r.stderr);
  }
});

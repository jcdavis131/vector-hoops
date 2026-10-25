// Shared game-center layer (assets/game-center.js): pure functions only.
// Fixture plays are synthetic (a made-up 23–22 first quarter), never real
// game data, and they exist only to pin the template arithmetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const GC = require('../assets/game-center.js');

function play(period, clock, text, away, home, opts) {
  opts = opts || {};
  return {
    period: { number: period }, clock: { displayValue: clock }, text: text,
    type: { text: opts.type || '' }, awayScore: away, homeScore: home,
    scoringPlay: !!opts.scoring, wallclock: opts.wall || undefined,
  };
}

// SAS 23, DAL 22, Q1 3:09 in the source video is the shape, not the data:
// these rows are invented for the test and carry no real play text.
const PLAYS = [
  play(1, '12:00', 'Jump ball', 0, 0, { type: 'Jump Ball' }),
  play(1, '10:00', 'Away scores two', 2, 0, { type: 'Jump Shot', scoring: true }),
  play(1, '9:00', 'Home scores three', 2, 3, { type: '3-pt Jump Shot', scoring: true }),
  play(1, '8:00', 'Away scores two', 4, 3, { type: 'Layup', scoring: true }),
  play(1, '7:00', 'Away scores two', 6, 3, { type: 'Layup', scoring: true }),
  play(1, '3:09', 'Timeout', 6, 3, { type: 'Timeout', wall: '2026-10-24T01:00:00.000Z' }),
  play(1, '3:00', 'Home scores two', 6, 5, { type: 'Layup', scoring: true }),
];

test('normalizePlay: clock label, scores, timeout flag', () => {
  const r = GC.normalizePlay(PLAYS[5], 5);
  assert.equal(r.label, 'Q1 3:09');
  assert.equal(r.timeout, true);
  assert.equal(r.away, 6);
  assert.equal(r.home, 3);
});

test('annotate: lead change fires only on a real flip, not on a tie', () => {
  const ann = GC.annotate(PLAYS.map((p, i) => GC.normalizePlay(p, i)));
  assert.equal(ann[2].leadChange, true); // away lead -> home lead
  assert.equal(ann[3].leadChange, true); // home lead -> away lead
  assert.equal(ann[1].leadChange, false); // 0-0 -> away lead is not a flip
});

test('feedRows: a timeout play is a divider, and a period change inserts END OF Q', () => {
  const rows = PLAYS.map((p, i) => GC.normalizePlay(p, i));
  rows.push(play(2, '12:00', 'Second quarter starts', 6, 5, { type: 'Period' }));
  const norm = rows.map((p, i) => GC.normalizePlay(p, i));
  const feed = GC.feedRows(norm, 'all');
  assert.ok(feed.some((x) => x.divider && x.text === 'TIMEOUT'));
  assert.ok(feed.some((x) => x.divider && x.text === 'END OF Q1'));
  assert.ok(!feed.some((x) => x.row && x.row.timeout));
});

test('filterRows: highlights keep scores and lead changes, insights keep state plays', () => {
  const rows = PLAYS.map((p, i) => GC.normalizePlay(p, i));
  const ann = GC.annotate(rows);
  assert.ok(GC.filterRows(ann, 'highlights').every((r) => r.scoring || r.leadChange));
  assert.ok(GC.filterRows(ann, 'insights').some((r) => r.timeout));
  assert.equal(GC.filterRows(ann, 'all').length, rows.length);
});

test('catchUp: headline, lead changes and largest run come from scores only', () => {
  const c = GC.catchUp(PLAYS.map((p, i) => GC.normalizePlay(p, i)));
  assert.equal(c.headline, 'Away lead 6–5');
  assert.match(c.sentences.join(' '), /2 lead changes/);
  assert.match(c.sentences.join(' '), /Largest unanswered run: Away 4–0/);
  assert.match(c.label, /Generated from play-by-play data/);
  assert.equal(GC.catchUp([]), null);
});

test('stateHero: timeout shows elapsed, never a countdown', () => {
  const rows = PLAYS.map((p, i) => GC.normalizePlay(p, i));
  const last = rows[rows.length - 2]; // the timeout play itself
  const hero = GC.stateHero('in', last, 72000);
  assert.equal(hero.kind, 'timeout');
  assert.equal(hero.title, 'TIMEOUT');
  assert.match(hero.detail, /elapsed 1:12/);
  assert.doesNotMatch(hero.detail, /countdown|remaining/i);
  const noWall = GC.stateHero('in', last, null);
  assert.doesNotMatch(noWall.detail, /elapsed/);
  assert.equal(GC.stateHero('pre', null, null).kind, 'pregame');
  assert.equal(GC.stateHero('post', null, null).kind, 'final');
});

test('splitHeaderHtml: invalid colors render uncolored, names are escaped', () => {
  const html = GC.splitHeaderHtml(
    { abbr: 'A<B', score: 23, color: 'notacolor' },
    { abbr: 'H', score: 22, color: '1d428a' },
    'Q1 3:09', 'LIVE');
  assert.doesNotMatch(html, /notacolor/);
  assert.match(html, /--gc-h:#1d428a/);
  assert.match(html, /A&lt;B/);
  assert.doesNotMatch(html, /<img|logo/i);
});

test('parseBoxScore: columns by name, starters before bench, DNP kept', () => {
  const bx = {
    players: [{
      team: { abbreviation: 'AAA' },
      statistics: [{
        keys: ['MIN', 'PTS', 'REB', 'AST', 'STL'],
        athletes: [
          { athlete: { shortName: 'Starter One' }, starter: true, stats: ['30', '20', '5', '4', '2'] },
          { athlete: { shortName: 'Bench One' }, starter: false, stats: ['10', '3', '1', '0', '0'] },
          { athlete: { shortName: 'Did Not' }, starter: false, didNotPlay: true, stats: [] },
        ],
      }],
    }],
  };
  const teams = GC.parseBoxScore(bx, ['MIN', 'PTS', 'REB', 'AST', 'STL']);
  assert.equal(teams[0].starters.length, 1);
  assert.equal(teams[0].bench.length, 2);
  assert.deepEqual(teams[0].starters[0].cells, ['30', '20', '5', '4', '2']);
  assert.equal(teams[0].bench[1].dnp, true);
  assert.deepEqual(GC.parseBoxScore(null, ['MIN']), []);
});

test('pulse: last three plays newest first, win probability may be null', () => {
  const rows = PLAYS.map((p, i) => GC.normalizePlay(p, i));
  const p = GC.pulse(rows, null, '');
  assert.equal(p.wp, null);
  assert.equal(p.last3.length, 3);
  assert.equal(p.last3[0].text, 'Home scores two');
  const withWp = GC.pulse(rows, 61.4, 'Home');
  assert.equal(withWp.wp.pct, 61.4);
});

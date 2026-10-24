/* tests/odds-normalize.test.mjs — smoke test for api/odds.js normalization.
 * Run: node tests/odds-normalize.test.mjs (stdlib only, no network).
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const odds = require('../api/odds.js');

const { _median: median, _pickEvent: pickEvent, _normalize: normalize } = odds;

// median: upper-middle on even counts — always a real book's line, no fake precision
assert.equal(median([3]), 3);
assert.equal(median([-110, -105, -115]), -110);
assert.equal(median([224.5, 225.5]), 225.5);
assert.equal(median([]), null);

// pickEvent: matches the team pair, prefers the nearest future tipoff
const ev1 = { home_team: 'San Antonio Spurs', away_team: 'Houston Rockets', commence_time: '2026-10-24T01:30:00Z', bookmakers: [] };
const ev2 = { home_team: 'San Antonio Spurs', away_team: 'Houston Rockets', commence_time: '2026-10-20T01:30:00Z', bookmakers: [] };
const ev3 = { home_team: 'Boston Celtics', away_team: 'New York Knicks', commence_time: '2026-10-24T00:00:00Z', bookmakers: [] };
const picked = pickEvent([ev2, ev3, ev1], 'San Antonio Spurs', 'Houston Rockets');
assert.equal(picked, ev1);
assert.equal(pickEvent([ev3], 'San Antonio Spurs', 'Houston Rockets'), null);

// normalize: median across books per market; favorite = most negative spread
function book(mlH, mlA, spH, spA, tot) {
  return {
    markets: [
      { key: 'h2h', outcomes: [{ name: 'San Antonio Spurs', price: mlH }, { name: 'Houston Rockets', price: mlA }] },
      { key: 'spreads', outcomes: [{ name: 'San Antonio Spurs', point: spH }, { name: 'Houston Rockets', point: spA }] },
      { key: 'totals', outcomes: [{ name: 'Over', point: tot }, { name: 'Under', point: tot }] }
    ]
  };
}
const ev = {
  home_team: 'San Antonio Spurs', away_team: 'Houston Rockets',
  commence_time: '2026-10-24T01:30:00Z',
  bookmakers: [book(130, -150, 3.5, -3.5, 224.5), book(140, -155, 4.0, -4.0, 225.5), book(120, -145, 3.0, -3.0, 223.5)]
};
const out = normalize(ev, 'HOU', 'SA');
assert.equal(out.ok, true);
assert.equal(out.books, 3);
assert.equal(out.moneyline.SA, 130);   // median of [130,140,120]
assert.equal(out.moneyline.HOU, -150); // median of [-150,-155,-145]
assert.deepEqual(out.spread, { abbr: 'HOU', line: -3.5 });
assert.deepEqual(out.total, { line: 224.5 });

// normalize: missing moneyline -> null (card hides, never faked)
const evNoMl = { ...ev, bookmakers: [{ markets: [{ key: 'totals', outcomes: [{ name: 'Over', point: 220 }] }] }] };
assert.equal(normalize(evNoMl, 'HOU', 'SA'), null);

console.log('odds-normalize: all assertions passed');

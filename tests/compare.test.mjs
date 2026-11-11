import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const api = require(path.join(here, '..', 'assets', 'compare.js'));

const rows = [
  ['Stephen Curry', '2015-16', 'Sniper', [90, 99, 10, 80, 70, 60, 20, 15, 40, 10, 95, 80]],
  ['Stephen Curry', '2020-21', 'Sniper', [88, 97, 12, 82, 72, 61, 18, 16, 42, 11, 94, 78]],
  ['Luka Doncic', '2023-24', 'Floor General', [92, 70, 40, 60, 95, 50, 30, 55, 20, 15, 80, 88]],
];

test('parsePair splits on the last colon', () => {
  assert.deepEqual(api.parsePair('Stephen Curry:2015-16'), { name: 'Stephen Curry', season: '2015-16' });
  assert.deepEqual(api.parsePair('J.R. Smith:2012-13'), { name: 'J.R. Smith', season: '2012-13' });
});

test('findRow prefers the named season, else the last', () => {
  const named = api.findRow(rows, 'Stephen Curry', '2015-16');
  assert.equal(named[1], '2015-16');
  const latest = api.findRow(rows, 'Stephen Curry', '');
  assert.equal(latest[1], '2020-21');
});

test('deltas are grade[a] minus grade[b]', () => {
  const a = api.findRow(rows, 'Stephen Curry', '2015-16');
  const b = api.findRow(rows, 'Luka Doncic', '2023-24');
  const d = api.deltas(a, b);
  assert.equal(d[0], 90 - 92);
  assert.equal(d[1], 99 - 70);
});

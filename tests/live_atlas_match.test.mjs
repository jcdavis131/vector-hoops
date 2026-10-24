// live-atlas.js name matching: a wrong dot is worse than no dot (review M1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { matchRow, mapTeam, hexColor } = require('../assets/live-atlas.js');

test('a same-name older player never matches', () => {
  // a 2026-27 rookie who shares a name with a 2009-10 player
  assert.equal(matchRow([{ id: 7, season: '2009-10', team: 'ATL' }], 'ATL'), null);
});

test('no rows: unmatched', () => {
  assert.equal(matchRow(undefined, 'ATL'), null);
  assert.equal(matchRow([], 'ATL'), null);
});

test('a recent row on his team wins over an older namesake and another team', () => {
  const rows = [
    { id: 1, season: '2003-04', team: 'GSW' },
    { id: 2, season: '2024-25', team: 'BOS' },
    { id: 3, season: '2025-26', team: 'GSW' },
  ];
  assert.equal(matchRow(rows, 'GS'), 3); // ESPN GS == map GSW
});

test('same player, two recent seasons on his team: the newest', () => {
  const rows = [{ id: 4, season: '2024-25', team: 'NYK' }, { id: 5, season: '2025-26', team: 'NYK' }];
  assert.equal(matchRow(rows, 'NY'), 5);
});

test('a single recent row on another team is a traded player', () => {
  assert.equal(matchRow([{ id: 9, season: '2025-26', team: 'MIA' }], 'ATL'), 9);
});

test('two recent rows, neither on his team: ambiguous, unmatched', () => {
  const rows = [{ id: 10, season: '2024-25', team: 'MIA' }, { id: 11, season: '2025-26', team: 'DAL' }];
  assert.equal(matchRow(rows, 'ATL'), null);
});

test('team index and colour guard', () => {
  assert.equal(mapTeam('UTAH'), 'UTA');
  assert.equal(mapTeam('ATL'), 'ATL');
  assert.equal(hexColor('c8102e'), '#c8102e');
  assert.equal(hexColor('#c8102e'), '#c8102e');
  assert.equal(hexColor('red;background:url(x)'), undefined);
  assert.equal(hexColor(''), undefined);
});

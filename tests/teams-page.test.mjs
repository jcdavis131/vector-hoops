import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const api = require(path.join(here, '..', 'assets', 'teams-page.js'));

const teams = JSON.parse(readFileSync(path.join(here, '..', 'assets', 'teams.json'), 'utf8'));
const rost = JSON.parse(readFileSync(path.join(here, '..', 'assets', 'current_rosters_2026_27.json'), 'utf8'));
const idx = JSON.parse(readFileSync(path.join(here, '..', 'assets', 'replays', 'index.json'), 'utf8'));

test('thirty teams in the ledger', () => {
  assert.equal(teams.teams.length, 30);
});

test('BOS roster is the dated preseason list', () => {
  assert.equal(rost.as_of, '2026-09-29');
  const bos = api.rosterFor(rost, 'BOS');
  assert.ok(bos.length > 10);
  assert.ok(bos.some((p) => p.name === 'Jayson Tatum'));
});

test('gamesForTeam only returns files that include that tri-code', () => {
  const bos = api.gamesForTeam(idx, 'BOS');
  assert.ok(bos.length >= 1);
  assert.ok(bos.every((g) => g.teams.some((t) => t.tri === 'BOS')));
  const none = api.gamesForTeam(idx, 'CHI');
  assert.equal(none.length, 0);
});

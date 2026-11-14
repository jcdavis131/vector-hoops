import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const api = require(path.join(here, '..', 'assets', 'seasons.js'));

test('calendar includes 2007-08 and 2026-27', () => {
  const keys = api.seasonKeys(1996, 2026);
  assert.ok(keys.includes('1996-97'));
  assert.ok(keys.includes('2007-08'));
  assert.ok(keys.includes('2026-27'));
  assert.equal(keys[keys.length - 1], '2026-27');
});

test('missing seasons match the committed norms file', () => {
  const norms = JSON.parse(readFileSync(path.join(here, '..', 'assets', 'season_norms.json'), 'utf8'));
  const have = Object.keys(norms.seasons);
  const gaps = api.missingSeasons(have, 1996, 2025);
  assert.deepEqual(gaps, ['2007-08', '2012-13', '2013-14']);
  assert.equal(have.includes('2026-27'), false);
});

test('FG3A series only includes seasons that record it', () => {
  const norms = JSON.parse(readFileSync(path.join(here, '..', 'assets', 'season_norms.json'), 'utf8'));
  const series = api.featureSeries(norms.seasons, 'FG3A');
  assert.ok(series.length > 10);
  assert.ok(series.every((r) => typeof r.mu === 'number'));
  assert.equal(series.some((r) => r.season === '2024-25'), false);
});

test('retrieval card uses the test split, not train', () => {
  const doc = JSON.parse(readFileSync(path.join(here, '..', 'assets', 'eval_scoreboard.json'), 'utf8'));
  const card = api.retrievalCard(doc);
  assert.equal(card.n, 790);
  assert.equal(card.top1, 0.438);
  assert.equal(card.top5, 0.757);
  assert.equal(card.base1, 0.0785);
  assert.match(card.metric, /n=790/);
  assert.doesNotMatch(card.note, /MTNN|cosine|64-d/i);
});

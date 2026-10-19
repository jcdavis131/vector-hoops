// Panel v3 G4: a twin-chip set citing only absences fails the honesty bar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
globalThis.window = {}; // twin-explainer.js assigns window.VHTwinExplainer at load
const { isAbsenceOnly, explainPair, CHIP } = require(path.join(here, '..', 'assets', 'twin-explainer.js'));

test('all-absence chip set fails', () => {
  assert.equal(isAbsenceOnly([
    'both rarely block shots',
    'both stay off the offensive glass',
    'both rarely gamble for steals',
  ]), true);
});

test('mixed set passes', () => {
  assert.equal(isAbsenceOnly([
    'both rarely block shots',
    'both fill it up scoring',
    'both stay off the offensive glass',
  ]), false);
});

test('all-presence set passes', () => {
  assert.equal(isAbsenceOnly([
    'both fill it up scoring',
    'both run the offense',
    'both crash the offensive glass',
  ]), false);
});

test('empty set does not fail', () => {
  assert.equal(isAbsenceOnly([]), false);
});

test('explainPair flags absence-only live pairs', () => {
  // two players who are both well below average on the 3 closest dims
  const codes = Object.keys(CHIP);
  const labels = {};
  codes.forEach((c) => { labels[c] = c.toLowerCase(); });
  const va = codes.map(() => -1.2);
  const vb = codes.map(() => -1.1);
  const live = explainPair(va, vb, codes, labels);
  assert.equal(isAbsenceOnly(live.shared), true);
});

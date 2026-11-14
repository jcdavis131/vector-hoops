// Panel v3 G4: a twin-chip set citing only absences fails the honesty bar.
// assets/twin-explainer.js exports explainPair, pairKey and CHIP. The rule is
// enforced inside explainPair: it caps shared absences at one chip and returns
// an absenceOnly flag when the first three of its presence/average/absence
// ranking (over all traits) were all absences before the cap, so the card can
// show "Strong twin, mostly in what they don't do."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
globalThis.window = {}; // twin-explainer.js assigns window.VHTwinExplainer at load
const { explainPair, CHIP } = require(path.join(here, '..', 'assets', 'twin-explainer.js'));

const codes = Object.keys(CHIP);
const labels = {};
codes.forEach((c) => { labels[c] = c.toLowerCase(); });
const fill = (x) => codes.map(() => x);
const absenceChips = new Set(codes.map((c) => CHIP[c][1]));
const presenceChips = new Set(codes.map((c) => CHIP[c][0]));
const countIn = (chips, set) => chips.filter((c) => set.has(c)).length;

test('the shipped module exposes the explainer API the card uses', () => {
  assert.equal(typeof explainPair, 'function');
  assert.ok(codes.length >= 14, 'CHIP has the 14 serving traits');
  codes.forEach((c) => assert.equal(CHIP[c].length, 2, c + ' has a presence and an absence chip'));
});

test('all-absence evidence is flagged absenceOnly, and shows at most one absence chip', () => {
  const live = explainPair(fill(-1.2), fill(-1.1), codes, labels);
  assert.equal(live.absenceOnly, true);
  // nothing but absences to cite: the cap leaves exactly one chip, never two
  assert.equal(live.shared.length, 1);
  assert.equal(countIn(live.shared, absenceChips), 1);
  assert.deepEqual(live.kinds, ['absence']);
});

test('mixed evidence (one shared presence, thirteen shared absences) is not absenceOnly', () => {
  // explainPair ranks all traits presence, then average, then absence; the flag
  // is set only when the first three of that ranking are all absences. The
  // presence is the LAST trait listed, so it leads only if the ranking put it there.
  const last = codes.length - 1;
  const va = fill(-1), vb = fill(-1);
  va[last] = 1; vb[last] = 1;
  const live = explainPair(va, vb, codes, labels);
  assert.equal(live.absenceOnly, false);
  assert.deepEqual(live.kinds, ['presence', 'absence']);
  assert.deepEqual(live.shared, [CHIP[codes[last]][0], CHIP[codes[0]][1]]);
  // presence, then average, then one absence: the average sits before the presence in trait order
  va[last - 1] = 0; vb[last - 1] = 0;
  const three = explainPair(va, vb, codes, labels);
  assert.equal(three.absenceOnly, false);
  assert.deepEqual(three.kinds, ['presence', 'average', 'absence']);
  assert.deepEqual(three.shared, [CHIP[codes[last]][0], 'both average ' + labels[codes[last - 1]], CHIP[codes[0]][1]]);
});

test('average traits outrank absences, so three of them are not absenceOnly', () => {
  // the three average traits are the last three listed; eleven absences come before them
  const n = codes.length;
  const va = fill(-1), vb = fill(-1);
  for (let k = n - 3; k < n; k++) { va[k] = 0; vb[k] = 0; }
  const live = explainPair(va, vb, codes, labels);
  assert.equal(live.absenceOnly, false);
  assert.deepEqual(live.kinds, ['average', 'average', 'average']);
  assert.deepEqual(live.shared, [n - 3, n - 2, n - 1].map((k) => 'both average ' + labels[codes[k]]));
});

test('all-presence evidence is not absenceOnly and cites only presences', () => {
  const live = explainPair(fill(1.2), fill(1.1), codes, labels);
  assert.equal(live.absenceOnly, false);
  assert.equal(live.shared.length, 3);
  assert.equal(countIn(live.shared, presenceChips), 3);
  assert.deepEqual(live.kinds, ['presence', 'presence', 'presence']);
  assert.equal(countIn(live.shared, absenceChips), 0);
});

test('an empty pair does not fail the bar', () => {
  const live = explainPair([], [], [], {});
  assert.equal(live.absenceOnly, false);
  assert.deepEqual(live.shared, []);
});

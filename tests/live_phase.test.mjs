// live.js game phase: ESPN uses state 'post' for postponed/cancelled games too (review M2).
// live.js is a page script, so the marked gamePhase block is evaluated on its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../assets/live.js', import.meta.url), 'utf8');
const m = src.match(/\/\* gamePhase:begin[\s\S]*?\*\/([\s\S]*?)\/\* gamePhase:end \*\//);
assert.ok(m, 'gamePhase block markers missing in live.js');
const gamePhase = new Function(m[1] + '\nreturn gamePhase;')();

test('a completed final is final', () => {
  assert.deepEqual(gamePhase({ state: 'post', completed: true, name: 'STATUS_FINAL', description: 'Final' }), { phase: 'post', label: 'Final' });
});
test('postponed is not final', () => {
  assert.deepEqual(gamePhase({ state: 'post', completed: false, name: 'STATUS_POSTPONED', description: 'Postponed' }), { phase: 'off', label: 'Postponed' });
});
test('canceled is not final even if completed', () => {
  assert.equal(gamePhase({ state: 'post', completed: true, name: 'STATUS_CANCELED', description: 'Canceled' }).phase, 'off');
});
test('suspended is not final', () => {
  assert.equal(gamePhase({ state: 'post', completed: false, name: 'STATUS_SUSPENDED', description: 'Suspended' }).label, 'Suspended');
});
test('live and pre pass through', () => {
  assert.equal(gamePhase({ state: 'in' }).phase, 'in');
  assert.equal(gamePhase({ state: 'pre' }).phase, 'pre');
  assert.equal(gamePhase(undefined).phase, '');
});

// Panel v3 G2: the Daily Court share text is the recipient's whole experience.
// These tests pin its exact rendered form: spoiler-free, correct score line,
// per-slot emoji, streak line, and a playable URL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// viral-share.js is a browser IIFE that only touches `window` at load time
// (window.VHShare = ...); document/navigator are used inside functions only.
globalThis.window = {};
require(path.join(here, '..', 'assets', 'viral-share.js'));
const { buildDailyCourtText } = globalThis.window.VHShare;
assert.equal(typeof buildDailyCourtText, 'function', 'buildDailyCourtText exposed');

const OPTS = {
  dayKey: '2026-10-19',
  pool: [{ n: 'Player A' }, { n: 'Player B' }, { n: 'Player C' }],
  slotResults: [
    { won: true, count: 2 },   // fast solve -> green
    { won: false, count: 6 },  // lost -> red X
    null,                       // unplayed -> white square
  ],
  solved: 1,
  total: 3,
  totalGuesses: 8,
  streak: 4,
  mode: 'court',
};

test('recipient text: score line, grid emoji, streak, URL', () => {
  const { text, title, url } = buildDailyCourtText(OPTS);
  assert.ok(text.includes('Daily Court — 2026-10-19'), 'header with day');
  assert.ok(text.includes('1/3 in 8 guesses'), 'score line');
  assert.ok(text.includes('🟩 ❌ ⬜'), 'per-slot emoji row');
  assert.ok(text.includes('🔥 4-day streak'), 'streak line');
  assert.ok(url.includes('/play?day=2026-10-19'), 'playable URL');
  assert.equal(title, 'Daily Court 2026-10-19');
});

test('recipient text is spoiler-free: no answers, no names', () => {
  const { text } = buildDailyCourtText(OPTS);
  assert.ok(!text.includes('→'), 'no twin arrow in share text');
  assert.ok(!text.includes('Player A'), 'no player names in share text');
  assert.ok(!/twin/i.test(text), 'no mention of twins');
});

test('triple mode labels correctly', () => {
  const { text, title, url } = buildDailyCourtText({ ...OPTS, mode: 'triple' });
  assert.ok(text.includes('Daily Triple'), 'triple label in text');
  assert.equal(title, 'Daily Triple 2026-10-19');
  assert.ok(url.includes('&mode=triple'), 'triple URL param');
});

test('zero-guess / zero-streak renders without streak line', () => {
  const { text } = buildDailyCourtText({ ...OPTS, solved: 0, totalGuesses: 0, streak: 0, slotResults: [null, null, null] });
  assert.ok(text.includes('0/3 in 0 guesses'), 'zero score line');
  assert.ok(!text.includes('🔥'), 'no streak line at zero');
  assert.ok(text.includes('⬜ ⬜ ⬜'), 'all-unplayed grid');
});

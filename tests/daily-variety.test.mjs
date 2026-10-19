// Panel v3 G5: at most 2 same-archetype targets per daily puzzle set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
globalThis.window = {}; // past-modern-game.js assigns window.VHPastModern at load
const { buildDailyPool } = require(path.join(here, '..', 'assets', 'past-modern-game.js'));

// skewed pool: 80 of 100 entries share archetype 3
function skewedPool() {
  const past = [];
  for (let i = 0; i < 100; i++) {
    past.push({ i, n: 'Player' + i, s: '2000-01', c: i < 80 ? 3 : (i % 8) });
  }
  return past;
}

test('no archetype appears more than twice per day', () => {
  const past = skewedPool();
  for (const day of ['2026-10-19', '2026-10-20', '2026-10-21', '2027-01-01']) {
    const pool = buildDailyPool(day, past, 5, 'daily-court-v2');
    assert.equal(pool.length, 5);
    const counts = {};
    for (const p of pool) counts[p.c | 0] = (counts[p.c | 0] || 0) + 1;
    for (const [c, n] of Object.entries(counts)) {
      assert.ok(n <= 2, `day ${day}: archetype ${c} appears ${n}x`);
    }
  }
});

test('deterministic: same day gives same pool', () => {
  const past = skewedPool();
  const a = buildDailyPool('2026-10-19', past, 5, 'daily-court-v2');
  const b = buildDailyPool('2026-10-19', past, 5, 'daily-court-v2');
  assert.deepEqual(a.map((p) => p.i), b.map((p) => p.i));
});

test('no duplicate players in a day', () => {
  const past = skewedPool();
  const pool = buildDailyPool('2026-10-19', past, 5, 'daily-court-v2');
  const names = new Set(pool.map((p) => p.n));
  assert.equal(names.size, 5);
});

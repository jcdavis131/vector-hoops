// REFRESH-PROOF: the Daily Court score survives serialize → reload → render.
//
// ux-revamp PLAN §6 names this the CI reload-invariance fuzz test: 1,000
// randomized games, each recorded as an event stream, serialized to JSON
// (the reload), reloaded into a fresh store, and re-rendered through
// renderSnapshot(). Any divergence between the pre- and post-reload render
// fails the build. It also cross-checks assets/daily-score.js's scorer
// against assets/daily-ledger.js's scorer (two independent implementations
// of the same contract must agree), and asserts the write-failure contract
// (record() never throws, unsynced surfaces, flush recovers).
//
// Run: node --test tests/daily-refresh-proof.test.mjs
//      (also wired into pytest: tests/test_daily_refresh_proof.py)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DS = require('../assets/daily-score.js');
const DL = require('../assets/daily-ledger.js');

// Deterministic PRNG (mulberry32) — the suite is reproducible, not flaky.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function memStore(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(String(k), String(v)),
    removeItem: (k) => m.delete(k),
    _dump: () => Object.fromEntries(m),
  };
}

const NAMES = ['Nikola Jokic', 'Giannis Antetokounmpo', 'Victor Wembanyama',
  'Luka Doncic', 'Shai Gilgeous-Alexander', 'Joel Embiid', 'Jayson Tatum',
  'Anthony Edwards', 'Stephen Curry', 'Kevin Durant', 'LeBron James',
  'Devin Booker', 'Donovan Mitchell', 'Damian Lillard', 'Anthony Davis',
  'Kawhi Leonard', 'Paul George', 'Jimmy Butler', 'Jalen Brunson', 'Tyrese Haliburton'];

// One randomized guess stream per slot: wins, losses, mid-games, dupes,
// over-6 streams (corrupt or extra), empty slots.
function randomStream(rand, slot) {
  const kind = rand();
  const gs = [];
  const n = Math.floor(rand() * 8); // 0..7 — deliberately includes >6
  const winAt = kind < 0.45 ? 1 + Math.floor(rand() * 6) : 0;
  for (let i = 0; i < n; i++) {
    const name = NAMES[Math.floor(rand() * NAMES.length)];
    // 10% chance of a duplicate name (the "one guess per player" rule)
    gs.push({ name, rank: winAt === i + 1 ? 0 : 1 + Math.floor(rand() * 200), ts: slot * 1000 + i });
    if (rand() < 0.1) gs.push({ name, rank: 50 + i, ts: slot * 1000 + i + 0.5 });
  }
  return gs;
}

const RUNS = 1000;

test(`refresh-proof: ${RUNS} serialize→reload→render runs, zero divergences`, () => {
  let divergences = 0;
  const divergenceCases = [];
  for (let run = 0; run < RUNS; run++) {
    const rand = mulberry32(1337 + run * 7919);
    const dayKey = `2026-10-${String(15 + (run % 14)).padStart(2, '0')}`;
    const mode = run % 2 ? 'triple' : 'court';
    const slotCount = mode === 'triple' ? 3 : 5;
    const store = memStore();
    const S = DS.createStore(store);
    // Record every guess as its own event (the append-only path).
    for (let slot = 0; slot < slotCount; slot++) {
      for (const g of randomStream(rand, slot)) {
        const r = S.record(dayKey, slot, g, mode);
        assert.equal(r.ok, true, `run ${run}: record() must succeed on a healthy store`);
      }
    }
    const before = S.renderSnapshot(dayKey, mode, slotCount);
    // THE reload: serialize the whole store, parse into a fresh one.
    const reloaded = memStore(JSON.parse(JSON.stringify(store._dump())));
    const S2 = DS.createStore(reloaded);
    const after = S2.renderSnapshot(dayKey, mode, slotCount);
    try {
      assert.deepEqual(after, before);
    } catch (e) {
      divergences++;
      if (divergenceCases.length < 3) divergenceCases.push({ run, dayKey, mode, err: e.message });
    }
  }
  assert.equal(divergences, 0,
    `${divergences}/${RUNS} runs diverged after reload: ${JSON.stringify(divergenceCases)}`);
  console.log(`refresh-proof: ${RUNS} runs, ${divergences} divergences`);
});

test('cross-implementation agreement: daily-score.js vs daily-ledger.js', () => {
  // Two independent scorers of the same contract must agree on every stream.
  for (let run = 0; run < 200; run++) {
    const rand = mulberry32(4242 + run * 1013);
    const gs = randomStream(rand, 0);
    const a = DS.scoreSlot({ rv: 'v1', guesses: gs });
    const b = DL.scoreSlot(gs);
    assert.equal(a.won, b.won, `run ${run}: won agrees`);
    assert.equal(a.count, b.count, `run ${run}: count agrees`);
    assert.equal(a.winIn, b.winIn, `run ${run}: winIn agrees`);
    assert.equal(a.state, b.state, `run ${run}: state agrees`);
  }
});

test('unknown rules version freezes the score instead of rewriting it', () => {
  const store = DS.createStore(memStore());
  const key = store._slotStorageKey('2026-10-21', 0, 'court');
  // A record stamped by a FUTURE rules version lands in storage.
  const raw = JSON.stringify({ day: '2026-10-21', slot: 0, mode: 'court',
    guesses: [{ name: 'Nikola Jokic', rank: 0, ts: 1 }], rv: 'v9-future', ts: 1 });
  const mem = memStore(); mem.setItem(key, raw);
  const S = DS.createStore(mem);
  const slot = S.readSlot('2026-10-21', 0, 'court');
  assert.ok(slot, 'legacy record is still readable');
  assert.equal(slot.legacy, true, 'flagged legacy');
  assert.equal(slot.state, 'legacy', 'never a fresh won/lost verdict');
  assert.equal(slot.won, false, 'never claims a win under unknown rules');
  // …and it survives a reload without being rewritten.
  const snap = S.renderSnapshot('2026-10-21', 'court', 5);
  const snap2 = DS.createStore(memStore(JSON.parse(JSON.stringify(mem._dump()))))
    .renderSnapshot('2026-10-21', 'court', 5);
  assert.deepEqual(snap2, snap);
});

test('write-failure contract: queue + unsynced, never a stale number, flush recovers', () => {
  let dead = true;
  const flaky = {
    getItem: (k) => (dead ? null : live.getItem(k)),
    setItem: (k, v) => { if (dead) throw new Error('disk full'); live.setItem(k, v); },
    removeItem: (k) => live.removeItem(k),
  };
  const live = memStore();
  const S = DS.createStore(flaky);
  let threw = false;
  let r;
  try { r = S.record('2026-10-21', 0, { name: 'Nikola Jokic', rank: 5 }, 'court'); }
  catch (e) { threw = true; }
  assert.equal(threw, false, 'record() never throws');
  assert.equal(r.ok, false, 'failed write reports ok:false');
  assert.equal(r.unsynced, true, 'unsynced surfaced');
  assert.equal(S.unsynced(), true, 'store-level unsynced flag set');
  const snap = S.renderSnapshot('2026-10-21', 'court', 5);
  assert.equal(snap.unsynced, true, 'the render carries unsynced, not a stale number');
  assert.equal(snap.slots[0].played, false, 'unpersisted guesses are not rendered as fact');
  dead = false; // storage heals
  const f = S.flush();
  assert.equal(f.ok, true, 'flush retries the queue');
  assert.equal(S.unsynced(), false, 'unsynced clears after a successful flush');
  const after = S.renderSnapshot('2026-10-21', 'court', 5);
  assert.equal(after.slots[0].played, true, 'the queued guess lands after recovery');
  assert.equal(after.unsynced, false);
});

// Regression tests for the Daily Court append-only ledger (panel v3 G1).
// Run: node --test tests/daily-ledger.test.mjs
// Protocol under test: a guess recorded for (day, slot) is never removed or
// altered by a later write; concurrent writers converge by union; foreign
// records are quarantined, never silently merged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DL = require('../assets/daily-ledger.js');

function memStore(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(String(k), String(v)),
    removeItem: (k) => m.delete(k),
    _dump: () => Object.fromEntries(m),
  };
}
const K = 'vh.daily.v2.2026-10-19.slot0';

test('save then load round-trips guesses', () => {
  const L = DL.createLedger(memStore());
  const out = L.save(K, '2026-10-19', 0, [{ name: 'Nikola Jokic', rank: 5 }], 's1');
  assert.equal(out.length, 1);
  assert.ok(out[0].gid, 'guess gets an identity');
  assert.equal(out[0].day, '2026-10-19');
  assert.equal(out[0].slot, 0);
  const back = L.load(K, '2026-10-19', 0);
  assert.equal(back.guesses.length, 1);
  assert.equal(back.quarantined, false);
});

test('two interleaved writers converge: stale-read write loses nothing', () => {
  // THE regression test for the panel-v3 root cause: writer A reads stale
  // state, writer B saves, then A saves — the old blind overwrite deleted
  // B's guesses. The ledger must union instead.
  const store = memStore();
  const A = DL.createLedger(store);
  const B = DL.createLedger(store);
  A.save(K, '2026-10-19', 0, [{ name: 'Nikola Jokic', rank: 5 }], 'sA'); // A writes guess 1
  const bWorking = B.load(K, '2026-10-19', 0).guesses; // B reads (sees guess 1)
  A.save(K, '2026-10-19', 0, bWorking.concat([{ name: 'Giannis Antetokounmpo', rank: 3 }]), 'sA'); // A adds guess 2 via stale-ish path
  // B now saves a guess from its earlier read (stale read-modify-write)
  const merged = B.save(K, '2026-10-19', 0, bWorking.concat([{ name: 'Victor Wembanyama', rank: 0 }]), 'sB');
  const names = merged.map((g) => g.name).sort();
  assert.deepEqual(names, ['Giannis Antetokounmpo', 'Nikola Jokic', 'Victor Wembanyama']);
  const win = merged.some((g) => g.rank === 0);
  assert.equal(win, true, 'the recorded win survives the interleaving');
});

test('a recorded win is never removed by a later write', () => {
  const store = memStore();
  const L = DL.createLedger(store);
  L.save(K, '2026-10-19', 0, [{ name: 'Victor Wembanyama', rank: 0 }], 's1');
  // A later writer with a stale, win-less working set saves again.
  const out = L.save(K, '2026-10-19', 0, [{ name: 'Nikola Jokic', rank: 5 }], 's2');
  assert.equal(out.some((g) => g.rank === 0), true);
  assert.equal(out.length, 2);
});

test('foreign record (wrong day) is quarantined, not merged', () => {
  const store = memStore({
    [K]: JSON.stringify({ day: '2026-10-18', slot: 0, guesses: [{ name: 'Joel Embiid', rank: 0 }] }),
  });
  const L = DL.createLedger(store);
  const r = L.load(K, '2026-10-19', 0);
  assert.equal(r.guesses.length, 0);
  assert.equal(r.quarantined, true);
  assert.equal(store.getItem(K), null, 'foreign record removed from the live key');
  const dump = store._dump();
  const qKeys = Object.keys(dump).filter((k) => k.startsWith('vh.quarantine.v1.'));
  assert.equal(qKeys.length, 1, 'foreign bytes preserved under quarantine');
  assert.match(dump[qKeys[0]], /Joel Embiid/);
});

test('wrong-slot record is quarantined', () => {
  const store = memStore({
    [K]: JSON.stringify({ day: '2026-10-19', slot: 3, guesses: [{ name: 'X', rank: 1 }] }),
  });
  const L = DL.createLedger(store);
  const r = L.load(K, '2026-10-19', 0);
  assert.equal(r.quarantined, true);
  assert.equal(r.guesses.length, 0);
});

test('duplicate guesses dedupe by identity, legacy by name', () => {
  const L = DL.createLedger(memStore());
  const g = { name: 'Nikola Jokic', rank: 5 };
  const once = L.save(K, '2026-10-19', 0, [g], 's1');
  const twice = L.save(K, '2026-10-19', 0, once.concat([{ name: 'nikola jokic', rank: 5 }]), 's1');
  assert.equal(twice.length, 1, 'same name, no gid -> deduped as before');
  const stamped = DL.stampGuess({ name: 'A' }, '2026-10-19', 0, 's1');
  const stamped2 = DL.stampGuess({ name: 'A' }, '2026-10-19', 0, 's1');
  assert.notEqual(stamped.gid, stamped2.gid, 'distinct records get distinct identities');
  assert.equal(DL.mergeGuesses([stamped], [stamped2]).length, 1, 'same player name still dedupes');
  const stampedB = DL.stampGuess({ name: 'B' }, '2026-10-19', 0, 's1');
  assert.equal(DL.mergeGuesses([stamped], [stampedB]).length, 2);
  assert.equal(DL.mergeGuesses([stamped], [stamped]).length, 1, 'same gid merges');
});

test('header invariant: total equals sum of slot tries after interleaving', () => {
  // Mirrors renderDailyCourt's aggregation: totals are recomputed from
  // storage, so they must equal the union the ledger guarantees.
  const store = memStore();
  const ledgers = [0, 1, 2].map(() => DL.createLedger(store));
  const keys = [0, 1, 2].map((i) => `vh.daily.v2.2026-10-19.slot${i}`);
  ledgers[0].save(keys[0], '2026-10-19', 0, [{ name: 'A' }, { name: 'B' }], 's1');
  ledgers[1].save(keys[1], '2026-10-19', 1, [{ name: 'C', rank: 0 }], 's2');
  // Stale writer appends to slot 0 from an empty read:
  ledgers[2].save(keys[0], '2026-10-19', 0, [{ name: 'D' }], 's3');
  let total = 0, solved = 0;
  for (let i = 0; i < 3; i++) {
    const gs = ledgers[0].load(keys[i], '2026-10-19', i).guesses;
    total += gs.length;
    if (gs.some((g) => g.rank === 0)) solved++;
  }
  assert.equal(total, 4, '2 + 1 + 1, nothing lost');
  assert.equal(solved, 1);
});

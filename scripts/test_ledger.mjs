// test_ledger.mjs — the Daily Court ledger contract.
//
// What it proves (v4 panel Tier 0 #1, Harada goal 1 pillars 2+6):
//   1. Reload invariance: same serialized event stream -> same score, always.
//      A seeded fuzzer generates random game histories, JSON round-trips them
//      (the reload), and asserts the score is identical.
//   2. Regression tests quoting the walker-observed contradictions verbatim:
//        - "Won in 5/6" on a failed game (walkthrough-verification-v4 §1 #1)
//        - solve banner vs final card disagreeing (same §1 #1)
//        - "undefined/6" in the share text (the sd.cnt/sd.count key mismatch)
//   3. Write-failure honesty: a failed write reports ok:false, marks the
//      ledger unsynced, queues for retry — never a stale number.
//   4. Streak base-rate math is p^k with the labeled assumed rate.
//
// It tests the REAL shipped bytes: assets/daily-ledger.js is read from disk
// and evaluated with an injected fake store. Any contradiction fails the
// build (exit non-zero).
//
//     node scripts/test_ledger.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const ROOT = new URL('..', import.meta.url).pathname;
const src = readFileSync(ROOT + '/assets/daily-ledger.js', 'utf8');

// Load the shipped module with a fake window/localStorage so the browser
// globals it guards against don't exist here.
const moduleShim = { exports: {} };
const windowShim = {};
const fakeStore = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    _clear: () => m.clear(),
  };
})();
const loadShim = new Function('module', 'exports', 'window', 'localStorage', 'Date', src + '\n;return module.exports;');
const VHLedger = loadShim(moduleShim, moduleShim.exports, windowShim, undefined, Date);
VHLedger._setStorage(fakeStore);

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('  ok  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

// Deterministic PRNG so CI is reproducible (mulberry32).
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

console.log('== reload invariance (fuzz over serialized histories) ==');
{
  const rand = rng(20261019);
  const NAMES = ['LeBron James', 'Kobe Bryant', 'Tim Duncan', 'Dirk Nowitzki', 'KG', 'AI', 'T-Mac', 'Nash'];
  let ran = 0;
  for (let t = 0; t < 5000; t++) {
    const n = Math.floor(rand() * 8);          // 0..7 guesses (7 = overshoot)
    const winAt = rand() < 0.35 ? 1 + Math.floor(rand() * Math.max(1, n)) : 0;
    const guesses = [];
    for (let i = 0; i < n; i++) {
      guesses.push({
        name: NAMES[Math.floor(rand() * NAMES.length)] + '#' + i,
        rank: (winAt === i + 1) ? 0 : 1 + Math.floor(rand() * 300),
        sim: rand(),
      });
    }
    const before = VHLedger.scoreSlot(guesses);
    const reloaded = VHLedger.scoreSlot(JSON.parse(JSON.stringify(guesses))); // the reload
    ran++;
    if (before.won !== reloaded.won || before.count !== reloaded.count ||
        before.over !== reloaded.over || before.winIn !== reloaded.winIn ||
        before.state !== reloaded.state) {
      failures++;
      console.log('  FAIL fuzz case ' + t + ': score changed across a serialize round-trip');
      console.log('    before: ' + JSON.stringify(before) + ' after: ' + JSON.stringify(reloaded));
      break;
    }
    // structural invariants of the single scoring procedure
    if (before.won && (before.winIn < 1 || before.winIn > 6)) { failures++; console.log('  FAIL winIn out of range'); break; }
    if (!before.won && before.winIn !== 0) { failures++; console.log('  FAIL winIn nonzero on non-win'); break; }
    if (before.count > 6) { failures++; console.log('  FAIL count exceeds 6 guesses'); break; }
    if (before.won && before.count !== before.winIn) { failures++; console.log('  FAIL stream not truncated at the win'); break; }
    if (before.over !== (before.won || before.count >= 6)) { failures++; console.log('  FAIL over invariant'); break; }
    if (!['won', 'lost', 'open'].includes(before.state)) { failures++; console.log('  FAIL bad state'); break; }
  }
  check('5000 fuzzed histories: identical score after serialize round-trip', failures === 0, ran + ' ran');
}

console.log('== regression: walker-observed contradictions, quoted ==');
{
  const failed = [];
  for (let i = 0; i < 6; i++) failed.push({ name: 'Miss' + i, rank: 10 + i }); // 6 guesses, none rank 0
  const s = VHLedger.scoreSlot(failed);
  const line = VHLedger.fmtSlotScore({ guesses: failed }, '2026-10-19');
  check('failed game (6 misses) is not a win', s.won === false && s.state === 'lost');
  check('"Won in 5/6" on a failed game is impossible: ledger line has no "Won"',
    line.indexOf('Won') === -1, 'got: ' + line);
  check('failed game ledger line is exactly "Missed \u00B7 {date}"',
    line === 'Missed \u00B7 2026-10-19', 'got: ' + line);

  // solve banner vs final card: both render from VHLedger.fmtSlotScore, so
  // the banner's string and the card's string are the same call.
  const win3 = [{ name: 'A', rank: 5 }, { name: 'B', rank: 2 }, { name: 'C', rank: 0 }];
  const banner = VHLedger.fmtSlotScore({ guesses: win3 }, '2026-10-19');
  const card = VHLedger.fmtSlotScore({ guesses: JSON.parse(JSON.stringify(win3)) }, '2026-10-19');
  check('solve banner and final card agree ("Won in 3/6 \u00B7 {date}")',
    banner === card && banner === 'Won in 3/6 \u00B7 2026-10-19', 'got: ' + banner + ' / ' + card);
}

console.log('== regression: share card never emits "undefined" (sd.cnt bug) ==');
{
  fakeStore._clear();
  VHLedger.record('2026-10-19', 0, { guesses: [{ name: 'A', rank: 5 }, { name: 'B', rank: 0 }] }, 'court');
  VHLedger.record('2026-10-19', 1, { guesses: [{ name: 'C', rank: 9 }, { name: 'D', rank: 8 }, { name: 'E', rank: 7 }, { name: 'F', rank: 6 }, { name: 'G', rank: 5 }, { name: 'H', rank: 4 }] }, 'court');
  const ledger = VHLedger.read('2026-10-19', 'court', 5);
  const pool = [{ n: 'P1' }, { n: 'P2' }, { n: 'P3' }, { n: 'P4' }, { n: 'P5' }];
  const text = VHLedger.shareText(ledger, pool, 3);
  check('share text has no "undefined"', text.indexOf('undefined') === -1, text.split('\n').slice(0, 3).join(' | '));
  check('lost slot shares as X-marked row', text.indexOf('\u274C X/6 Slot 2') !== -1);
  check('every shared URL carries ref=share', VHLedger.shareUrl('2026-10-19', 'court').indexOf('ref=share') !== -1);
}

console.log('== write-failure honesty ==');
{
  const throwing = { getItem: () => null, setItem: () => { throw new Error('disk full'); } };
  VHLedger._setStorage(throwing);
  const r = VHLedger.record('2026-10-19', 0, { guesses: [{ name: 'A', rank: 0 }] }, 'court');
  check('failed write reports ok:false', r.ok === false);
  check('ledger marks itself unsynced, never a stale number', VHLedger.unsynced() === true);
  check('failed write is queued for retry', VHLedger._pendingWrites().length === 1);
  VHLedger._setStorage(fakeStore);
  const f = VHLedger.flush();
  check('retry flushes the queued write', f.ok === true && VHLedger.unsynced() === false);
  const back = VHLedger.readSlot('2026-10-19', 0, 'court');
  check('retried write lands with the true score', back && back.won === true && back.winIn === 1);
}

console.log('== streak base-rate math (Diaconis: labeled assumption) ==');
{
  const o = VHLedger.streakOdds(7);
  check('assumed daily win rate is explicitly labeled 0.6', o.p === 0.6 && VHLedger.ASSUMED_DAILY_WIN_RATE === 0.6);
  check('streakOdds(7) = 0.6^7', Math.abs(o.prob - Math.pow(0.6, 7)) < 1e-12, String(o.prob));
  const t = VHLedger.streakOddsText(7);
  check('parenthetical states the assumption and rounds (~2.8%)',
    t.indexOf('60%-a-day player') !== -1 && t.indexOf('~2.8%') !== -1, t);
}

console.log('== runtime self-check gates streak display (Dye) ==');
{
  check('VHLedger.verify() passes on the shipped code', VHLedger.verify() === true);
  check('VHLedger.honest is true when the self-check passes', VHLedger.honest === true);
}

console.log('== share card: a fully-lost day shares as 5 X rows, never "Won" (Kubrick) ==');
{
  fakeStore._clear();
  const loses = [];
  for (let i = 0; i < 6; i++) loses.push({ name: 'Miss' + i, rank: 10 + i });
  for (let s = 0; s < 5; s++) VHLedger.record('2026-10-19', s, { guesses: loses }, 'court');
  const ledger = VHLedger.read('2026-10-19', 'court', 5);
  const pool = [{ n: 'P1' }, { n: 'P2' }, { n: 'P3' }, { n: 'P4' }, { n: 'P5' }];
  const text = VHLedger.shareText(ledger, pool, 0);
  check('lost day shares: five X/6 rows', (text.match(/\u274C X\/6/g) || []).length === 5, text.split('\n').slice(4, 9).join(' | '));
  check('lost day share text never says "Won"', text.indexOf('Won') === -1);
  check('no streak line on a 0 streak', text.indexOf('day streak') === -1);
  check('shared URL carries ref=share', text.indexOf('ref=share') !== -1);
}

console.log(failures === 0 ? '\nALL LEDGER TESTS PASS' : '\n' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);

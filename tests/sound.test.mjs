// assets/sound.js: the ABC parser and the looped scheduler are pure and deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const S = require(path.join(here, '..', 'assets', 'sound.js'));

const brief = (ev) => ev.map((e) => [e.v, e.b, e.d, e.m, e.g]);

test('a known score parses to an exact note schedule', () => {
  const s = S.parse('X:1\nM:4/4\nL:1/8\nQ:1/4=120\nK:G\nV:A inst=square gain=.5\n!f! G2 F/E/ [GBd]2 z ^c- c |\nV:B inst=drums\nC,,4 ^F,,4 |');
  assert.equal(s.bpm, 120);
  assert.equal(s.barLen, 4);
  assert.equal(s.len, 4);
  assert.deepEqual(s.voices.map((v) => [v.id, v.inst, v.len]), [['A', 'square', 4], ['B', 'drums', 4]]);
  // K:G sharpens F; ^c holds C#5 and the tie extends it; drums ignore the key
  assert.deepEqual(brief(s.ev), [
    [0, 0, 1, 67, 0.375],
    [1, 0, 2, 36, 0.6],
    [0, 1, 0.25, 66, 0.375],
    [0, 1.25, 0.25, 64, 0.375],
    [0, 1.5, 1, 67, 0.375],
    [0, 1.5, 1, 71, 0.375],
    [0, 1.5, 1, 74, 0.375],
    [1, 2, 2, 42, 0.6],
    [0, 3, 1, 73, 0.375],
  ]);
});

test('repeats replay their bars once; accidentals end at the bar line', () => {
  const s = S.parse('L:1/4\nK:C\n|: ^F G :| F |');
  assert.deepEqual(s.ev.map((e) => [e.b, e.m]), [[0, 66], [1, 67], [2, 66], [3, 67], [4, 65]]);
});

test('key signatures and modes', () => {
  const mids = (k) => S.parse('L:1/4\nK:' + k + '\nC D E F G A B').ev.map((e) => e.m % 12);
  assert.deepEqual(mids('D'), [1, 2, 4, 6, 7, 9, 11]);
  assert.deepEqual(mids('Am'), [0, 2, 4, 5, 7, 9, 11]);
  assert.deepEqual(mids('Edor'), [1, 2, 4, 6, 7, 9, 11]);
  assert.deepEqual(mids('F'), [0, 2, 4, 5, 7, 9, 10]);
});

test('the scheduler unrolls the loop across its boundary, deterministically', () => {
  const s = S.parse('L:1/4\nK:C\nC E G c');
  const a = S.slice(s, 3, 6).map((x) => [x.at, x.e.m]);
  assert.deepEqual(a, [[3, 72], [4, 60], [5, 64]]);
  assert.deepEqual(S.slice(s, 3, 6).map((x) => x.at), a.map((x) => x[0]));
  assert.deepEqual(S.slice(s, 4.5, 4.5), []);
});

test('every cue loops cleanly: whole bars, every voice the same length, notes in range', () => {
  assert.deepEqual(Object.keys(S.CUES).sort(), ['calm', 'home', 'live', 'play', 'replay']);
  for (const [name, abc] of Object.entries(S.CUES)) {
    const s = S.parse(abc);
    assert.ok(s.bpm >= 60 && s.bpm <= 180, name + ' tempo ' + s.bpm);
    assert.equal(s.len % s.barLen, 0, name);
    for (const v of s.voices) assert.equal(v.len, s.len, name + ' voice ' + v.id + ' is ' + v.len + ' beats, loop is ' + s.len);
    assert.ok(s.ev.length > 10, name);
    for (const e of s.ev) {
      assert.ok(Number.isFinite(e.b) && e.b >= 0 && e.b < s.len && e.d > 0, name + ' ' + JSON.stringify(e));
      assert.ok(e.m >= 24 && e.m <= 100 && e.g > 0 && e.g <= 1, name + ' ' + JSON.stringify(e));
    }
  }
});

test('sound effects parse and stay short', () => {
  for (const name of ['swish', 'miss', 'block', 'live', 'right', 'wrong', 'wipe']) {
    const s = S.parse(S.SFX[name]);
    const end = Math.max(...s.ev.map((e) => e.b + e.d)) * 60 / s.bpm;
    assert.ok(s.ev.length >= 2 && end < 1, name + ' lasts ' + end + ' s');
  }
});

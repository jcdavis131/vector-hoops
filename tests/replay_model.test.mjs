// Pixel Replay coordinate model, in node: role lookup, and (when the shipped weights and the
// parity fixture are present) the browser forward pass against the trained torch model.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RM = require('../assets/replay-model.js');
const ROLES = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'replay_roles.json'), 'utf8'));

test('names fold the way build_roles.py folds them', () => {
  assert.equal(RM.roles._norm('Nikola Jokić'), 'nikolajokic');
  assert.equal(RM.roles._norm('Jaren Jackson Jr.'), 'jarenjackson');
  assert.equal(RM.roles._norm("De'Aaron Fox"), 'deaaronfox');
  assert.equal(RM.roles._norm('Gary Trent Jr'), 'garytrent');
});

test('forGame: NBA ids directly, ESPN players by full name, unknowns left out', () => {
  RM.roles._init(ROLES);
  const nba = Object.keys(ROLES.roles)[0];
  const [name, pid] = Object.entries(ROLES.names)[0];
  const G = { players: { [nba]: { n: 'X', t: 0 }, e1: { n: 'Y', f: name, t: 1 }, e2: { n: 'Z', f: 'Nobody Atall', t: 0 }, e3: { n: 'W', t: 1 } } };
  const out = RM.roles.forGame(G);
  assert.deepEqual(Object.keys(out).sort(), [nba, 'e1'].sort());
  assert.equal(out.e1.length, 16);
  const r = ROLES.roles[String(pid)];
  assert.deepEqual(out.e1.slice(0, 3), r.slice(0, 3));
  assert.equal(out.e1.slice(3, 11).reduce((a, b) => a + b, 0), r[3] >= 0 && r[3] < 8 ? 1 : 0);
  assert.equal(RM.roles.forGame(G), out, 'cached per game');
});

const W = path.join(ROOT, 'assets', 'replay-model.json'), FX = path.join(ROOT, 'tests', 'fixtures', 'replay_model_parity.json');
test('shipped weights give the trained model\'s answers', { skip: !(fs.existsSync(W) && fs.existsSync(FX)) && 'no shipped model yet' }, () => {
  RM._init(JSON.parse(fs.readFileSync(W, 'utf8')));
  const fx = JSON.parse(fs.readFileSync(FX, 'utf8')), sc = RM.meta.scale;
  let worst = 0, sum = 0, n = 0;
  fx.P.forEach((P, i) => {
    const y = RM.forward(Float32Array.from(P.flat()), Float32Array.from(fx.G[i]));
    fx.pred[i].forEach((xy, k) => { const d = Math.hypot((y[2 * k] - xy[0]) * sc[0], (y[2 * k + 1] - xy[1]) * sc[1]); worst = Math.max(worst, d); sum += d; n++; });
  });
  assert.ok(worst <= fx.max_ft, `worst ${worst.toFixed(3)} ft > ${fx.max_ft}`);
  assert.ok(sum / n <= fx.mean_ft, `mean ${(sum / n).toFixed(3)} ft > ${fx.mean_ft}`);
});

test('replay.js tells the model the training convention for offense when the feed has none', async () => {
  const { makeContext } = await import('./replay_harness.mjs');
  const vm = await import('node:vm');
  const game = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'replays', '0022600001.json'), 'utf8'));
  const T = game.types, seen = {};
  for (const e of game.events) if ((T[e[2]] === 'foul' || T[e[2]] === 'block') && e[4] >= 0 && e[5] && !seen[T[e[2]]]) { seen[T[e[2]]] = e; e[12] = -1; } // as ESPN sends them
  assert.ok(seen.foul && seen.block, 'fixture game has a foul and a block');
  const H = makeContext('model-offense', false, false);
  H.canvas.dataset.mode = 'embed';
  H.sandbox.location.search = '?model=0';
  const calls = [];
  H.sandbox.window.ReplayModel = { ready: true, place: (c) => { calls.push(c); return null; } };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'replay.js'), 'utf8'), H.sandbox, { filename: 'replay.js' });
  H.sandbox.window.PixelReplay.setGame(game);
  for (const ty of ['foul', 'block']) {
    const e = seen[ty], c = calls.find((x) => x.type === ty && x.actor === String(e[5]) && x.clock === e[1] && x.period === e[0]);
    assert.ok(c, ty + ' reached the model');
    assert.ok(c.defense.includes(String(e[5])), ty + ': the acting player (fouler / blocker) is on defense, as in training');
  }
});

test('with the shipped model and the smoother, every real shot spot stays exactly where the feed put it', { skip: !fs.existsSync(W) && 'no shipped model yet' }, async () => {
  const { makeContext } = await import('./replay_harness.mjs');
  const vm = await import('node:vm');
  const game = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'replays', '0022600001.json'), 'utf8'));
  const H = makeContext('model-anchor', false, false);
  H.canvas.dataset.mode = 'embed';
  H.sandbox.location.search = '?model=0';
  H.sandbox.atob = H.sandbox.window.atob = (b) => Buffer.from(b, 'base64').toString('binary');
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'replay-model.js'), 'utf8'), H.sandbox, { filename: 'replay-model.js' });
  H.sandbox.window.ReplayModel._init(JSON.parse(fs.readFileSync(W, 'utf8')));
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'replay.js'), 'utf8'), H.sandbox, { filename: 'replay.js' });
  H.sandbox.window.PixelReplay.setGame(game);
  const FR = H.sandbox.window.PixelReplay.frames(), st = H.sandbox.window.PixelReplay.stats.model;
  assert.ok(st.events > 100, 'the model placed scenes');
  let shots = 0, moved = 0;
  game.events.forEach((e, i) => {
    const ty = game.types[e[2]];
    if ((ty === '2pt' || ty === '3pt') && e[6] != null && e[5] && FR[i].m) { shots++; const p = FR[i].pos[String(e[5])]; if (!p || Math.hypot(p[0] - e[6], p[1] - e[7]) > 1e-6) moved++; }
  });
  assert.ok(shots > 50, 'shots placed by the model: ' + shots);
  assert.equal(moved, 0);
});

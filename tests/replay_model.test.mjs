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

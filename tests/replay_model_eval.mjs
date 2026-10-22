// Score Pixel Replay's player placement against real tracking, end to end.
//
//   node tests/replay_model_eval.mjs --games <dir from scripts/tracking/holdout_replays.py> --weights <weights.json> [--roles assets/replay_roles.json]
//
// Each held-out 2015-16 game is loaded into the real assets/replay.js twice: once as the site
// runs without the model (rung a: formation templates), once with assets/replay-model.js
// placing the players (rung b). For every event it compares each player's position in the
// replay's frame with where SportVU saw him, in feet, leaving out the acting shooter whose spot
// both are given. Also reports how often two players stand within 2 ft (scenes that pile up).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { makeContext, ROOT } from './replay_harness.mjs';

function args(argv) {
  const o = { games: null, weights: null, roles: null, limit: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--games') o.games = argv[++i];
    else if (a === '--weights') o.weights = argv[++i];
    else if (a === '--roles') o.roles = argv[++i];
    else if (a === '--limit') o.limit = +argv[++i];
    else throw new Error('unknown argument ' + a);
  }
  return o;
}
const o = args(process.argv);
const REPLAY = fs.readFileSync(path.join(ROOT, 'assets', 'replay.js'), 'utf8');
const MODEL = fs.readFileSync(path.join(ROOT, 'assets', 'replay-model.js'), 'utf8');
const W = o.weights ? JSON.parse(fs.readFileSync(o.weights, 'utf8')) : null;
const ROLES = o.roles ? JSON.parse(fs.readFileSync(o.roles, 'utf8')) : null;

function frames(game, withModel) {
  const H = makeContext('eval', false, false);
  H.canvas.dataset.mode = 'embed';
  H.sandbox.location.search = '?model=0'; // no fetch: the eval hands the weights in
  if (withModel) {
    H.sandbox.atob = H.sandbox.window.atob = (b) => Buffer.from(b, 'base64').toString('binary'); // a browser has atob; the stub sandbox does not
    vm.runInContext(MODEL, H.sandbox, { filename: 'replay-model.js' });
    H.sandbox.window.ReplayModel._init(W);
    if (ROLES) {
      const R = ROLES;
      H.sandbox.window.ReplayRoles = { forGame: (G) => { const out = {}; for (const id of Object.keys(G.players)) { const r = R.roles[id]; if (r) out[id] = expand(r); } return out; } };
    }
  }
  vm.runInContext(REPLAY, H.sandbox, { filename: 'replay.js' });
  H.sandbox.window.PixelReplay.setGame(JSON.parse(JSON.stringify(game)));
  return { fr: H.sandbox.window.PixelReplay.frames(), stats: H.sandbox.window.PixelReplay.stats };
}
function expand(r) { // [x,y,z,c,p] -> the 16 role features train_coords.py uses
  const v = new Array(16).fill(0); v[0] = r[0]; v[1] = r[1]; v[2] = r[2];
  if (r[3] >= 0 && r[3] < 8) v[3 + r[3]] = 1; if (r[4] >= 0 && r[4] < 5) v[11 + r[4]] = 1; return v;
}

const ix = JSON.parse(fs.readFileSync(path.join(o.games, 'index.json'), 'utf8')).games.slice(0, o.limit || undefined);
const acc = { a: { all: [], by: {}, set: [] }, b: { all: [], by: {}, set: [] } }, close = { a: [0, 0], b: [0, 0], truth: [0, 0] };
// per team, the cheapest match of the five staged spots to the five real ones: scores the shape of the scene, not who stands where
const PERMS = (function perms(a) { if (a.length < 2) return [a]; const o = []; a.forEach((x, i) => perms(a.slice(0, i).concat(a.slice(i + 1))).forEach((r) => o.push([x].concat(r)))); return o; })([0, 1, 2, 3, 4]);
function setCost(A, B) { let best = Infinity; for (const p of PERMS) { let c = 0; for (let i = 0; i < 5; i++) c += Math.hypot(A[i][0] - B[p[i]][0], A[i][1] - B[p[i]][1]); if (c < best) best = c; } return best / 5; }
let used = 0; const closeBy = {};
for (const gid of ix) {
  const game = JSON.parse(fs.readFileSync(path.join(o.games, gid + '.json'), 'utf8'));
  const truth = JSON.parse(fs.readFileSync(path.join(o.games, gid + '.truth.json'), 'utf8'));
  const runs = { a: frames(game, false) };
  if (W) { runs.b = frames(game, true); used += runs.b.stats.model.events; }
  game.events.forEach((e, i) => {
    const ty = truth.ev[i], t = truth.truth[i], anchored = (ty === '2pt' || ty === '3pt' || ty === 'freethrow') ? String(e[5]) : null;
    const pts = { truth: Object.values(t) };
    for (const k of Object.keys(runs)) {
      const pos = runs[k].fr[i].pos; pts[k] = [];
      { const T = [[], []], S = [[], []]; for (const [pid, xy] of Object.entries(t)) { const p = pos[pid], pl = game.players[pid]; if (!p || !pl) continue; T[pl.t].push(xy); S[pl.t].push(p); }
        if (T[0].length === 5 && T[1].length === 5) acc[k].set.push((setCost(S[0], T[0]) + setCost(S[1], T[1])) / 2); }
      for (const [pid, xy] of Object.entries(t)) {
        const p = pos[pid]; if (!p) continue; pts[k].push(p);
        if (pid === anchored) continue;
        const d = Math.hypot(p[0] - xy[0], p[1] - xy[1]);
        acc[k].all.push(d); (acc[k].by[ty] = acc[k].by[ty] || []).push(d);
      }
    }
    for (const k of Object.keys(pts)) {
      const P = pts[k];
      const ct = (closeBy[ty] = closeBy[ty] || {}), c2 = (ct[k] = ct[k] || [0, 0]);
      for (let x = 0; x < P.length; x++) for (let y = x + 1; y < P.length; y++) { close[k][1]++; c2[1]++; if (Math.hypot(P[x][0] - P[y][0], P[x][1] - P[y][1]) < 2) { close[k][0]++; c2[0]++; } }
    }
  });
}
const mean = (v) => +(v.reduce((s, x) => s + x, 0) / Math.max(1, v.length)).toFixed(2);
const med = (v) => { const s = v.slice().sort((a, b) => a - b); return +(s[s.length >> 1] || 0).toFixed(2); };
const rep = { games: ix.length, modelEvents: used, rungA: { meanFt: mean(acc.a.all), medianFt: med(acc.a.all), setFt: mean(acc.a.set), n: acc.a.all.length }, byType: {} };
if (W) rep.rungB = { meanFt: mean(acc.b.all), medianFt: med(acc.b.all), setFt: mean(acc.b.set), n: acc.b.all.length };
for (const t of Object.keys(acc.a.by)) rep.byType[t] = { rungA: mean(acc.a.by[t]), rungB: W ? mean(acc.b.by[t] || []) : null, n: acc.a.by[t].length };
rep.within2ftByType = Object.fromEntries(Object.entries(closeBy).map(([t, o]) => [t, Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +(v[0] / Math.max(1, v[1])).toFixed(4)]))]));
rep.within2ft = Object.fromEntries(Object.entries(close).filter(([, v]) => v[1]).map(([k, v]) => [k, +(v[0] / v[1]).toFixed(4)]));
process.stdout.write(JSON.stringify(rep, null, 1) + '\n');

// Pixel Replay harness: runs assets/replay.js in node against a stub canvas and DOM.
//
//   node tests/replay_harness.mjs [--js assets/replay.js] [--reduce] [--sprites] [--starts 40] [--frames 20] [--sweep 0.25] [--out file.json]
//
// No dependencies (node:vm only). For every game in assets/replays/index.json it opens a
// fresh context, loads the game through window.PixelReplay.load, then plays short bursts
// from evenly spaced points across the whole game with the camera at rest (the Broadcast
// preset, untouched), then the same bursts while dragging the camera every frame, then
// with the Follow-ball preset. A paused sweep then renders one frame every --sweep seconds of
// replay time across the whole game (rest camera), so short moments (a dunker on the rim)
// are always sampled. It prints one JSON report.
//
// A "draw call" is one call to fillRect, fill, stroke, strokeRect, drawImage, clearRect or
// fillText on a 2d context. "main" counts the page's visible canvas; "offscreen" counts
// every canvas replay.js makes with document.createElement('canvas'). perFrame numbers
// are main-canvas calls per rendered frame; amortized adds offscreen calls spread over
// the same frames, so a cache rebuild is never hidden.
//
// An error is: an exception out of a frame, an exception at load, or the page's own
// "could not be loaded" message. --js lets the same harness measure an older replay.js
// (for example `git show db483cde:assets/replay.js > old.js`).
//
// Without --sprites the page has no Image, so players are drawn as boxes. --sprites adds a
// stub Image (512x768, loads at once) and blank getImageData, so the Blender sprite path
// (recolour, per-size cell cache, one drawImage per player) runs instead.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRAW = new Set(['fillRect', 'fill', 'stroke', 'strokeRect', 'drawImage', 'clearRect', 'fillText']);

function args(argv) {
  const o = { js: path.join(ROOT, 'assets', 'replay.js'), reduce: false, sprites: false, starts: 40, frames: 20, sweep: 0.25, out: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--js') o.js = path.resolve(argv[++i]);
    else if (a === '--reduce') o.reduce = true;
    else if (a === '--sprites') o.sprites = true;
    else if (a === '--starts') o.starts = +argv[++i];
    else if (a === '--frames') o.frames = +argv[++i];
    else if (a === '--sweep') o.sweep = +argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else throw new Error('unknown argument ' + a);
  }
  return o;
}

function makeCtx(counter) {
  const ctx = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, imageSmoothingEnabled: true, globalAlpha: 1, font: '' };
  const names = ['fillRect', 'fill', 'stroke', 'strokeRect', 'drawImage', 'clearRect', 'fillText', 'beginPath', 'moveTo',
    'lineTo', 'closePath', 'setTransform', 'translate', 'save', 'restore', 'arc', 'rect', 'scale', 'rotate'];
  for (const n of names) {
    ctx[n] = function () { if (DRAW.has(n)) counter.n++; };
  }
  ctx.getImageData = (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
  ctx.putImageData = () => {};
  return ctx;
}

function makeEl(tag, doc) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(), style: {}, dataset: {}, children: [], listeners: {}, attrs: {},
    textContent: '', value: '0', checked: true, href: '', className: '',
    _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(s) {
      this._html = s; this.children = [];
      const n = (String(s).match(/<span/g) || []).length;
      for (let i = 0; i < n; i++) this.children.push(makeEl('span', doc));
    },
    get firstChild() { return this.children[0] || null; },
    appendChild(c) { this.children.push(c); return c; },
    insertBefore(c, ref) { const i = this.children.indexOf(ref); if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] ?? null; },
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    dispatch(t, ev) { for (const f of this.listeners[t] || []) f.call(this, ev || {}); },
    click() { this.dispatch('click', { target: this }); },
    querySelector() { return makeEl('i', doc); },
    setPointerCapture() {},
    focus() {},
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
  };
  return el;
}

function makeContext(gameId, reduce, sprites) {
  const clock = { now: 1000 };
  const counters = { main: { n: 0 }, off: { n: 0 } };
  const raf = { cb: null };
  const doc = { listeners: {}, activeElement: null };
  const ids = {};
  const canvas = makeEl('canvas', doc);
  canvas.width = 400; canvas.height = 225;
  const mainCtx = makeCtx(counters.main);
  canvas.getContext = () => mainCtx;
  ids.rpCanvas = canvas;
  const groups = { '.rp-cams button': [], '.rp-filter button': [], '.rp-game': [] };
  for (const c of ['broadcast', 'baseline', 'overhead', 'iso', 'follow']) { const b = makeEl('button', doc); b.dataset.cam = c; groups['.rp-cams button'].push(b); }
  for (const f of ['all', '3', 'dunk', 'd', 'lead']) { const b = makeEl('button', doc); b.dataset.f = f; groups['.rp-filter button'].push(b); }
  Object.assign(doc, {
    getElementById(id) { return ids[id] || (ids[id] = makeEl('div', doc)); },
    querySelectorAll(sel) { return groups[sel] || []; },
    createElement(tag) {
      const el = makeEl(tag, doc);
      if (String(tag).toLowerCase() === 'canvas') { el.width = 300; el.height = 150; const c = makeCtx(counters.off); el.getContext = () => c; }
      return el;
    },
    createTextNode(s) { return { textContent: String(s) }; },
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
  });
  const href = 'https://hoops.dumbmodel.com/replay?g=' + gameId;
  const sandbox = {
    document: doc,
    console,
    URL, URLSearchParams,
    location: { href, search: '?g=' + gameId },
    history: { replaceState() {} },
    performance: { now: () => clock.now },
    matchMedia: (q) => ({ matches: reduce && /prefers-reduced-motion:\s*reduce/.test(q), addEventListener() {}, addListener() {} }),
    requestAnimationFrame(cb) { raf.cb = cb; return 1; },
    cancelAnimationFrame() {},
    fetch(url) {
      const rel = String(url).split('?')[0].replace(/^\//, '');
      const file = path.join(ROOT, rel);
      const okDir = file.startsWith(path.join(ROOT, 'assets', 'replays')) || (sprites && file.startsWith(path.join(ROOT, 'assets', 'sprites')));
      if (!okDir || !fs.existsSync(file)) return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')) });
      const txt = fs.readFileSync(file, 'utf8');
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(txt)) });
    },
  };
  if (sprites) {
    sandbox.Image = class { set src(v) { this._src = v; this.width = 512; this.height = 768; setImmediate(() => this.onload && this.onload()); } get src() { return this._src; } };
  }
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return { sandbox, clock, counters, raf, ids, groups, canvas };
}

const flush = () => new Promise((r) => setImmediate(r));

function summarize(xs) {
  if (!xs.length) return { frames: 0, mean: null, median: null, p95: null, max: null };
  const s = xs.slice().sort((a, b) => a - b), q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { frames: xs.length, mean: +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1), median: q(0.5), p95: q(0.95), max: s[s.length - 1] };
}

async function runGame(js, gameId, o) {
  const H = makeContext(gameId, o.reduce, o.sprites), errors = [];
  try { vm.runInContext(js, H.sandbox, { filename: 'replay.js' }); } catch (e) { errors.push('boot: ' + e.message); return { gameId, errors }; }
  const PR = H.sandbox.window.PixelReplay;
  if (!PR) { errors.push('window.PixelReplay missing'); return { gameId, errors }; }
  try { await PR.load(gameId); } catch (e) { errors.push('load: ' + e.message); }
  for (let k = 0; k < 5; k++) await flush();
  const now = H.ids.rpNow ? H.ids.rpNow.textContent : '';
  if (/could not be loaded/.test(now)) errors.push('page says: ' + now);

  let lastCb = H.raf.cb;
  function frame(dtMs) {
    H.clock.now += dtMs;
    const cb = H.raf.cb || lastCb; H.raf.cb = null; lastCb = cb;
    const m0 = H.counters.main.n, f0 = H.counters.off.n;
    try { cb(H.clock.now); } catch (e) { errors.push('frame: ' + (e && e.message)); }
    return [H.counters.main.n - m0, H.counters.off.n - f0];
  }
  PR.seek(1e9); const tEnd = PR.state.t;
  function pass(name, perFrameHook) {
    const main = [], off = [];
    for (let s = 0; s < o.starts; s++) {
      PR.seek(tEnd * s / o.starts); PR.speed(4); PR.play(true);
      for (let f = 0; f < o.frames; f++) { if (perFrameHook) perFrameHook(f); const [m, x] = frame(16.7); main.push(m); off.push(x); }
    }
    PR.play(false);
    const tot = main.reduce((a, b) => a + b, 0), totOff = off.reduce((a, b) => a + b, 0);
    return { name, perFrame: summarize(main), offscreenCalls: totOff, amortizedPerFrame: +((tot + totOff) / Math.max(1, main.length)).toFixed(1) };
  }
  frame(16.7); // first frame after load (cache build, if any), not part of any pass
  const passes = [];
  passes.push(pass('rest'));
  { const main = [], off = [];
    PR.play(false);
    for (let t = 0; t <= tEnd; t += o.sweep) { PR.seek(t); const [m, x] = frame(16.7); main.push(m); off.push(x); }
    const tot = main.reduce((a, b) => a + b, 0), totOff = off.reduce((a, b) => a + b, 0);
    passes.push({ name: 'sweep', perFrame: summarize(main), offscreenCalls: totOff, amortizedPerFrame: +((tot + totOff) / Math.max(1, main.length)).toFixed(1) }); }
  let px = 100;
  passes.push(pass('drag', (f) => {
    if (f === 0) { H.canvas.dispatch('pointerdown', { pointerId: 1, clientX: px, clientY: 100 }); }
    px += 3; H.canvas.dispatch('pointermove', { pointerId: 1, clientX: px, clientY: 100 });
    if (f === o.frames - 1) H.canvas.dispatch('pointerup', { pointerId: 1 });
  }));
  const follow = H.groups['.rp-cams button'].find((b) => b.dataset.cam === 'follow');
  follow.click(); for (let k = 0; k < 40; k++) frame(16.7);
  passes.push(pass('follow'));
  const dbg = PR.stats ? JSON.parse(JSON.stringify(PR.stats)) : null;
  return { gameId, tEnd: +tEnd.toFixed(2), errors, passes, stats: dbg };
}

async function main() {
  const o = args(process.argv);
  const js = fs.readFileSync(o.js, 'utf8');
  const ix = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'replays', 'index.json'), 'utf8'));
  const games = [];
  for (const g of ix.games) games.push(await runGame(js, g.gameId, o));
  const restMeans = games.map((g) => g.passes && g.passes[0].perFrame.mean).filter((x) => x != null);
  const report = {
    js: path.relative(ROOT, o.js).split(path.sep).join('/'), reduce: o.reduce, sprites: o.sprites, starts: o.starts, framesPerStart: o.frames,
    games, errors: games.reduce((a, g) => a + g.errors.length, 0),
    restMeanPerFrame: restMeans.length ? +(restMeans.reduce((a, b) => a + b, 0) / restMeans.length).toFixed(1) : null,
  };
  const out = JSON.stringify(report, null, 1);
  if (o.out) fs.writeFileSync(o.out, out);
  process.stdout.write(out + '\n');
  process.exit(report.errors ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });

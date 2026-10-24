// Embed3D kit (wave 1, task 1.4): assets/embed-3d.js in node against a tiny DOM stub.
//
//   node --test tests/embed3d.test.mjs
//
// No dependencies (node:vm only), the same approach as tests/replay_harness.mjs: a fresh
// context per test with stub document/canvas/fetch/matchMedia/getComputedStyle and a
// manual requestAnimationFrame pump. Covers option parsing, the chrome per variant,
// setDim/overlay/setGroups state and drawing, the colour token read (and its re-read on a
// prefers-color-scheme change), the loading and error states, reduced motion, re-mount.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'assets', 'embed-3d.js'), 'utf8');

// ---- tiny DOM ----
class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = []; this.parentNode = null; this.attrs = {}; this.listeners = {};
    this.dataset = {}; this.hidden = false; this._html = ''; this._text = '';
    this.className = ''; this.cssTextWrites = 0;
    const self = this;
    const styleTarget = {};
    this.style = new Proxy(styleTarget, {
      set(t, k, v) { if (k === 'cssText') self.cssTextWrites++; t[k] = v; return true; },
    });
    this.clientWidth = 600; this.clientHeight = 420;
  }
  get innerHTML() { return this._html; }
  set innerHTML(s) { this._html = String(s); this.children = []; this._text = ''; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(s) { this._text = String(s); this.children = []; this._html = ''; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  insertBefore(c, ref) { const i = this.children.indexOf(ref); if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); c.parentNode = this; return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter((g) => g !== f); }
  dispatch(t, ev) { for (const f of this.listeners[t] || []) f.call(this, ev || {}); }
  click() { this.dispatch('click', { target: this }); }
  get classes() { return String(this.className).split(/\s+/).filter(Boolean); }
  all() { const out = []; const walk = (n) => { for (const c of n.children) { out.push(c); walk(c); } }; walk(this); return out; }
  q(cls) { return this.all().find((n) => n.classes.includes(cls)) || null; }
  qa(cls) { return this.all().filter((n) => n.classes.includes(cls)); }
  querySelector(sel) { return sel.startsWith('.') ? this.q(sel.slice(1)) : this.all().find((n) => n.tagName === sel.toUpperCase()) || null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; }
}
class Text { constructor(s) { this.textContent = String(s); this.children = []; this.classes = []; } }

function makeCtx(log) {
  const ctx = { fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1 };
  for (const n of ['setTransform', 'clearRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'save', 'restore']) ctx[n] = () => {};
  ctx.fillRect = (x, y, w, h) => log.push({ op: 'fillRect', fill: ctx.fillStyle, alpha: ctx.globalAlpha, x, y, w, h });
  ctx.arc = (x, y, r) => log.push({ op: 'arc', x, y, r, fill: ctx.fillStyle, stroke: ctx.strokeStyle });
  ctx.fill = () => log.push({ op: 'fill', fill: ctx.fillStyle });
  ctx.stroke = () => log.push({ op: 'stroke', stroke: ctx.strokeStyle });
  return ctx;
}

// A v4 fixture: 3 points, two projections, teams BOS/LAL, seasons 2024-25 / 2023-24.
function fixture() {
  const code = (seasonOff, team, cluster) => (seasonOff << 9) | (team << 3) | cluster;
  return {
    meta: { format: 4, n: 3, projections: ['pca', 'tsne'], normalized: true, season_base: 1996,
      names: ['Ann', 'Bo', 'Cy'], teams: ['BOS', 'LAL'] },
    n: [0, 1, 1],
    m: [code(28, 1, 2), code(28, 2, 5), code(27, 1, 0)],
    pca: [100, 0, 0, -200, 300, 0, 0, -400, 500],
    tsne: [0, 100, 0, 300, 0, -200, 500, 0, -400],
  };
}

const LIGHT = { '--void': '#1E2022', '--void-ink': '#D8DCD8', '--void-ink-2': '#A7B0BC', '--void-accent': '#FF7A5C',
  '--accent': '#E0483B', '--fg-3': '#6E6E66', '--data-terra': '#A05A38', '--team-a': '#123456' };

function env({ tokens = LIGHT, reduce = false, coarse = false, fetchImpl = null, doc = fixture() } = {}) {
  const log = [];
  const raf = [];
  const mq = {};
  const fetches = [];
  const vars = { ...tokens };
  const documentElement = new El('html');
  const document = {
    documentElement,
    createElement(tag) { const e = new El(tag); if (tag === 'canvas') { e.width = 300; e.height = 150; e.getContext = () => makeCtx(log); e.setPointerCapture = () => {}; } return e; },
    createTextNode(s) { return new Text(s); },
  };
  const win = {
    document, devicePixelRatio: 1, listeners: {},
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter((g) => g !== f); },
    matchMedia(q) {
      if (!mq[q]) {
        const matches = q.includes('reduced-motion') ? reduce : q.includes('pointer: coarse') ? coarse : false;
        mq[q] = { matches, listeners: [], addEventListener(t, f) { this.listeners.push(f); }, removeEventListener(t, f) { this.listeners = this.listeners.filter((g) => g !== f); } };
      }
      return mq[q];
    },
    getComputedStyle(node) { assert.equal(node, documentElement); return { getPropertyValue: (k) => vars[k] || '' }; },
    requestAnimationFrame(cb) { raf.push(cb); return raf.length; },
    cancelAnimationFrame() {},
    setTimeout, clearTimeout,
    fetch(url, init) {
      fetches.push(url);
      if (fetchImpl) return fetchImpl(url, init, fetches.length);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(doc) });
    },
  };
  win.window = win;
  const ctx = vm.createContext({ window: win, document, Map, Set, Promise, Math, Array, Object, String, Number, Uint8Array, Uint32Array, Float32Array, Error, JSON, console, parseInt, isFinite });
  // globals the IIFE reaches without the window. prefix
  for (const k of ['requestAnimationFrame', 'cancelAnimationFrame', 'fetch', 'setTimeout', 'clearTimeout', 'matchMedia', 'getComputedStyle']) ctx[k] = win[k].bind ? win[k].bind(win) : win[k];
  vm.runInContext(SRC, ctx, { filename: 'embed-3d.js' });
  const pump = (n = 1) => { for (let i = 0; i < n; i++) { const cbs = raf.splice(0); cbs.forEach((cb) => cb(16 * (i + 1))); } };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { win, Embed3D: win.Embed3D, log, raf, pump, settle, mq, vars, fetches, host: new El('div') };
}

// values made in the vm realm: compare by structure, not prototype
const plain = (x) => JSON.parse(JSON.stringify(x));
const wrapOf = (host) => host.q('embed3d');
const stateOf = (host) => host.q('embed3d__state');

test('option parsing: variant, projection, height, highlight alias, defaults', async () => {
  const e = env();
  let h = e.Embed3D.mount(e.host);
  assert.equal(h.snapshot().variant, 'home');
  assert.equal(h.snapshot().projection, 'pca');
  assert.equal(h.snapshot().height, 420);
  assert.equal(wrapOf(e.host).getAttribute('data-variant'), 'home');

  const e2 = env();
  e2.host.dataset.variant = 'game'; e2.host.dataset.projection = 'tsne'; e2.host.dataset.height = '380';
  h = e2.Embed3D.mount(e2.host, { highlight: [2] });
  let s = h.snapshot();
  assert.deepEqual([s.variant, s.projection, s.height, s.highlight], ['game', 'tsne', 380, [2]]);

  const e3 = env();
  h = e3.Embed3D.mount(e3.host, { variant: 'bogus', height: 500, highlightIds: [0, 1], greyscale: true });
  s = h.snapshot();
  assert.equal(s.variant, 'home');
  assert.equal(s.height, 500);
  assert.deepEqual(s.highlight, [0, 1]);
  assert.equal(s.greyscale, true);
  // the canvas buffer sets the displayed height (width:100%; height:auto in atlas.css)
  const canvas = e3.host.q('embed3d__canvas');
  assert.equal(canvas.height, 500);
  assert.equal(canvas.width, 600);
});

test('variant chrome: classes only, home keeps the switcher, game and live drop research chrome', async () => {
  for (const variant of ['home', 'game', 'live']) {
    const e = env();
    const h = e.Embed3D.mount(e.host, { variant });
    await e.settle(); await e.settle();
    assert.equal(h.snapshot().loaded, true, variant);
    const w = wrapOf(e.host);
    for (const cls of ['embed3d__frame', 'embed3d__canvas', 'embed3d__state', 'embed3d__tip', 'embed3d__legend', 'embed3d__note']) {
      assert.ok(w.q(cls), `${variant}: .${cls}`);
    }
    // no inline chrome anywhere in the tree
    for (const n of [w, ...w.all()]) assert.equal(n.cssTextWrites || 0, 0, `${variant}: cssText on ${n.className}`);
    const note = w.q('embed3d__note');
    const text = note.textContent + note.innerHTML;
    assert.doesNotMatch(text, /k-means|silhouette|64-d/i, variant);
    assert.equal(stateOf(e.host).hidden, true, `${variant}: loading state cleared`);
    const bar = w.q('embed3d__bar');
    if (variant === 'home') {
      assert.ok(bar, 'home has the bar');
      const seg = bar.q('seg');
      assert.equal(seg.children.length, 2);
      assert.deepEqual(seg.children.map((b) => b.getAttribute('aria-pressed')), ['true', 'false']);
      assert.ok(bar.q('embed3d__axis').textContent.includes('arbitrary units'));
      seg.children[1].click();
      assert.equal(h.snapshot().projection, 'tsne');
      assert.deepEqual(seg.children.map((b) => b.getAttribute('aria-pressed')), ['false', 'true']);
      assert.match(note.innerHTML, /t-SNE/);
      assert.equal(w.q('embed3d__legend').hidden, true, 'home: no legend');
    } else {
      assert.equal(bar, null, `${variant}: no projection switcher`);
      assert.doesNotMatch(text, /PCA|t-SNE|UMAP/, variant);
      assert.equal(w.q('embed3d__legend').hidden, true, `${variant}: legend empty until fed`);
    }
  }
});

test('loading state is the sketch, in currentColor', () => {
  const e = env({ fetchImpl: () => new Promise(() => {}) });
  e.Embed3D.mount(e.host, { variant: 'game' });
  const st = stateOf(e.host);
  assert.ok(st.classes.includes('embed3d__state--loading'));
  assert.equal(st.hidden, false);
  assert.match(st.innerHTML, /<svg class="state__sketch"/);
  assert.match(st.innerHTML, /currentColor/);
  assert.doesNotMatch(st.innerHTML, /#[0-9a-f]{6}/i);
  assert.equal(st.getAttribute('role'), null);
});

test('error state: role=alert, names the HTTP status (no undefined src), retry refetches', async () => {
  let calls = 0;
  const e = env({
    fetchImpl: () => {
      calls++;
      if (calls === 1) return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('no')) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(fixture()) });
    },
  });
  const h = e.Embed3D.mount(e.host, { variant: 'game' });
  await e.settle(); await e.settle();
  const st = stateOf(e.host);
  assert.ok(st.classes.includes('embed3d__state--error'));
  assert.equal(st.getAttribute('role'), 'alert');
  assert.match(st.textContent, /HTTP 404 for assets\/projections\/embed3d\.json/);
  assert.doesNotMatch(st.textContent, /is not defined/);
  assert.match(h.snapshot().error, /HTTP 404/);
  // the frame (and canvas) survive the error: the state covers them, it does not wipe the host
  assert.ok(e.host.q('embed3d__canvas'));
  const retry = st.children.find((c) => c.tagName === 'BUTTON');
  assert.ok(retry && retry.classes.includes('btn'));
  assert.equal(retry.textContent, 'Try again');
  retry.click();
  assert.ok(st.classes.includes('embed3d__state--loading'));
  await e.settle(); await e.settle();
  assert.equal(e.fetches.length, 2);
  assert.equal(h.snapshot().loaded, true);
  assert.equal(st.hidden, true);
  assert.equal(h.snapshot().error, null);
});

test('error state: malformed data and a custom src are reported', async () => {
  const bad = fixture(); bad.meta.format = 3;
  const e = env({ doc: bad });
  e.Embed3D.mount(e.host, { src: 'x/custom.json' });
  await e.settle(); await e.settle();
  assert.equal(e.fetches[0], 'x/custom.json');
  assert.match(stateOf(e.host).textContent, /malformed/);

  const e2 = env({ fetchImpl: () => Promise.resolve({ ok: false, status: 500 }) });
  e2.Embed3D.mount(e2.host, { src: 'x/custom.json' });
  await e2.settle(); await e2.settle();
  assert.match(stateOf(e2.host).textContent, /HTTP 500 for x\/custom\.json/);
});

test('colour tokens: read from :root, void-accent for marks, fallback, re-read on scheme change', async () => {
  const e = env();
  const h = e.Embed3D.mount(e.host, { variant: 'home', greyscale: true });
  let c = h.snapshot().colors;
  assert.equal(c.mark, 'rgb(255,122,92)');      // --void-accent
  assert.equal(c.accent, 'rgb(224,72,59)');     // --accent
  assert.equal(c.void, 'rgb(30,32,34)');
  assert.equal(c.voidInk, 'rgb(216,220,216)');
  assert.equal(c.voidInk2, 'rgb(167,176,188)');
  assert.equal(c.fg3, 'rgb(110,110,102)');
  assert.equal(c.terra, 'rgb(160,90,56)');
  assert.equal(c.ramp.length, 16);
  assert.equal(c.ramp[15], 'rgb(216,220,216)'); // nearest = the void's ink

  // the selected point is painted in the mark colour
  await e.settle(); await e.settle();
  h.setSelected(1);
  e.log.length = 0; e.pump();
  assert.ok(e.log.some((r) => r.op === 'fill' && r.fill === 'rgb(255,122,92)'));
  assert.ok(e.log.some((r) => r.op === 'stroke' && r.stroke === 'rgb(255,122,92)'));

  // scheme change: tokens re-read
  e.vars['--void-accent'] = 'rgb(1, 2, 3)';
  e.vars['--data-terra'] = '#C17C60';
  const scheme = e.mq['(prefers-color-scheme: dark)'];
  assert.equal(scheme.listeners.length, 1);
  scheme.listeners[0]({ matches: true });
  c = h.snapshot().colors;
  assert.equal(c.mark, 'rgb(1,2,3)');
  assert.equal(c.terra, 'rgb(193,124,96)');
  e.log.length = 0; e.pump();
  assert.ok(e.log.some((r) => r.op === 'fill' && r.fill === 'rgb(1,2,3)'));

  // destroy drops the listener
  h.destroy();
  assert.equal(scheme.listeners.length, 0);

  // no --void-accent: marks fall back to --accent; no tokens at all: atlas.css's numbers
  const e2 = env({ tokens: { ...LIGHT, '--void-accent': '' } });
  assert.equal(e2.Embed3D.mount(e2.host).snapshot().colors.mark, 'rgb(224,72,59)');
  const e3 = env({ tokens: {} });
  const c3 = e3.Embed3D.mount(e3.host).snapshot().colors;
  assert.equal(c3.mark, 'rgb(224,72,59)');
  assert.equal(c3.void, 'rgb(30,32,34)');
});

test('parseColor', () => {
  const { Embed3D } = env();
  assert.deepEqual(Array.from(Embed3D.parseColor('#abc')), [170, 187, 204]);
  assert.deepEqual(Array.from(Embed3D.parseColor(' #FF7A5C ')), [255, 122, 92]);
  assert.deepEqual(Array.from(Embed3D.parseColor('#FF7A5C80')), [255, 122, 92]);
  assert.deepEqual(Array.from(Embed3D.parseColor('rgba(255, 122, 92, .45)')), [255, 122, 92]);
  assert.equal(Embed3D.parseColor('var(--x)'), null);
  assert.equal(Embed3D.parseColor(''), null);
});

test('setDim: state and drawing (non-members fade, null clears, [] fades all)', async () => {
  const e = env();
  const h = e.Embed3D.mount(e.host, { variant: 'game', dim: [0] });
  assert.deepEqual(h.snapshot().dim, [0]);
  await e.settle(); await e.settle();
  e.log.length = 0; e.pump();
  const rects = e.log.filter((r) => r.op === 'fillRect');
  assert.equal(rects.length, 3);
  const alphas = rects.map((r) => r.alpha).sort((a, b) => a - b);
  // two dimmed points are at least 5x fainter than the kept one
  assert.ok(alphas[2] / alphas[1] >= 5, JSON.stringify(alphas));
  h.setDim(null);
  assert.equal(h.snapshot().dim, null);
  e.log.length = 0; e.pump();
  assert.ok(e.log.filter((r) => r.op === 'fillRect').every((r) => r.alpha > 0.3));
  h.setDim([]);
  e.log.length = 0; e.pump();
  assert.ok(e.log.filter((r) => r.op === 'fillRect').every((r) => r.alpha < 0.2));
});

test('overlay: rings by kind, legend keys for game, [] clears', async () => {
  const e = env();
  const h = e.Embed3D.mount(e.host, { variant: 'game' });
  await e.settle(); await e.settle();
  h.overlay([{ id: 0, kind: 'warm' }, { id: 1, kind: 'cold', r: 20 }, { id: 2, kind: 'exact', color: 'var(--team-a)' }, { id: null }]);
  const s = h.snapshot();
  assert.deepEqual(s.rings.map((r) => [r.id, r.kind, r.r]), [[0, 'warm', 10], [1, 'cold', 20], [2, 'exact', 10]]);
  assert.equal(s.rings[0].color, 'rgb(160,90,56)');   // warm = --data-terra
  assert.equal(s.rings[1].color, 'rgb(167,176,188)'); // cold = --void-ink-2
  assert.equal(s.rings[2].color, '#123456');          // var(--team-a) resolved through :root
  const legend = e.host.q('embed3d__legend');
  assert.equal(legend.hidden, false);
  assert.deepEqual(legend.qa('embed3d__key').map((k) => k.textContent), ['Found it', 'Warmer guess', 'Colder guess']);
  e.log.length = 0; e.pump();
  const strokes = e.log.filter((r) => r.op === 'stroke').map((r) => r.stroke);
  assert.ok(strokes.includes('rgb(160,90,56)') && strokes.includes('rgb(167,176,188)') && strokes.includes('#123456'));
  h.overlay([]);
  assert.deepEqual(h.snapshot().rings, []);
  assert.equal(legend.hidden, true);
});

test('setGroups: team colours paint points, legend swatches, note; find() by team/season', async () => {
  const e = env();
  const h = e.Embed3D.mount(e.host, { variant: 'live' });
  await e.settle(); await e.settle();
  assert.deepEqual(plain(h.find({ team: 'bos' })), [0, 2]);
  assert.deepEqual(plain(h.find({ team: 'BOS', season: '2024-25' })), [0]);
  assert.deepEqual(plain(h.find({ season: 2023 })), [2]);
  assert.deepEqual(plain(h.info(1)), { name: 'Bo', season: '2024-25', team: 'LAL', cluster: 5 });
  h.setGroups([{ label: 'BOS', color: 'rgb(0, 122, 51)', ids: h.find({ team: 'BOS', season: '2024-25' }) },
    { label: 'LAL', color: 'var(--team-a)', ids: [1] }, { label: 'none', ids: [] }]);
  const s = plain(h.snapshot());
  assert.deepEqual(s.groups, [{ label: 'BOS', color: 'rgb(0, 122, 51)', n: 1 }, { label: 'LAL', color: '#123456', n: 1 },
    { label: 'none', color: 'rgb(167,176,188)', n: 0 }]);
  const legend = e.host.q('embed3d__legend');
  assert.equal(legend.hidden, false);
  assert.equal(legend.getAttribute('aria-label'), 'Team colors');
  const keys = legend.qa('embed3d__key');
  assert.deepEqual(keys.map((k) => k.textContent), ['BOS', 'LAL', 'none']);
  assert.equal(keys[1].q('embed3d__swatch').style.background, '#123456');
  assert.match(e.host.q('embed3d__note').textContent, /players in this game/);
  e.log.length = 0; e.pump();
  const fills = e.log.filter((r) => r.op === 'fillRect').map((r) => r.fill);
  assert.ok(fills.includes('rgb(0, 122, 51)') && fills.includes('#123456'), JSON.stringify(fills));
  h.setGroups([]);
  assert.equal(legend.hidden, true);
  e.log.length = 0; e.pump();
  assert.ok(e.log.filter((r) => r.op === 'fillRect').every((r) => /^rgb\(\d+,\d+,\d+\)$/.test(r.fill)));
});

test('#165 semantics: selection dims the field, twins in the mark colour, info()', async () => {
  const e = env();
  const h = e.Embed3D.mount(e.host, { variant: 'home', greyscale: true });
  assert.equal(h.info(0), null); // not loaded yet
  await e.settle(); await e.settle();
  h.setSelected(0); h.setHighlight([1]);
  e.log.length = 0; e.pump();
  const rects = e.log.filter((r) => r.op === 'fillRect');
  // point 2 is neither selected nor a twin: dimmed by 0.35
  const arcs = e.log.filter((r) => r.op === 'arc');
  assert.equal(arcs.length, 3); // twin dot + selected dot + selected ring
  assert.ok(arcs.every((a) => a.fill === 'rgb(255,122,92)'));
  assert.ok(Math.min(...rects.map((r) => r.alpha)) < 0.35);
  h.setSelected(-1);
  assert.equal(h.snapshot().selected, null);
});

test('reduced motion freezes the turn; touch never restarts it', async () => {
  const e = env({ reduce: true });
  const h = e.Embed3D.mount(e.host);
  assert.equal(h.snapshot().autoRotate, false);
  await e.settle(); await e.settle();
  const canvas = e.host.q('embed3d__canvas');
  canvas.dispatch('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
  canvas.dispatch('pointerup', { pointerId: 1, clientX: 10, clientY: 10 });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(h.snapshot().autoRotate, false);
  const e2 = env();
  assert.equal(e2.Embed3D.mount(e2.host).snapshot().autoRotate, true);
});

test('tap selects through onSelect with the point id', async () => {
  const e = env();
  const picks = [];
  const h = e.Embed3D.mount(e.host, { variant: 'game', onSelect: (id) => picks.push(id) });
  await e.settle(); await e.settle();
  e.pump();
  // find where point 1 was drawn and tap it
  const r = e.log.filter((x) => x.op === 'fillRect')[0];
  const canvas = e.host.q('embed3d__canvas');
  canvas.dispatch('pointerdown', { pointerId: 1, clientX: r.x + r.w / 2, clientY: r.y + r.h / 2 });
  canvas.dispatch('pointerup', { pointerId: 1, clientX: r.x + r.w / 2, clientY: r.y + r.h / 2 });
  assert.equal(picks.length, 1);
  assert.ok(h.info(picks[0]));
  h.destroy();
});

test('re-mounting the same element destroys the previous handle', async () => {
  const e = env();
  const a = e.Embed3D.mount(e.host, { variant: 'live' });
  await e.settle(); await e.settle();
  const resizeBefore = (e.win.listeners.resize || []).length;
  const b = e.Embed3D.mount(e.host, { variant: 'live' });
  assert.notEqual(a, b);
  assert.equal((e.win.listeners.resize || []).length, resizeBefore); // old listener gone, new one added
  assert.equal(e.host.children.length, 1);
  assert.equal(e.mq['(prefers-color-scheme: dark)'].listeners.length, 1);
});

test('source: no inline chrome, colour or font literals left in embed-3d.js', () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /cssText/);
  assert.doesNotMatch(code, /ACCENT\s*=/);
  assert.doesNotMatch(code, /['"][^'"\n]*#[0-9a-f]{3,8}\b[^'"\n]*['"]/i);
  assert.doesNotMatch(code, /system-ui|sans-serif|monospace|font-family/);
  assert.doesNotMatch(code, /k-means|silhouette/i);
});

// Lotería reskin: the twin share card is the recipient's whole experience.
// These tests pin its rendered form: 9:16 lotería card, cream paper, giant
// headline with the target on the black bar, twin as card Nº 1 with the
// distance chip and name banner, site footer — system fonts only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// viral-share.js is a browser IIFE that only touches `window` at load time.
// drawTwinCard takes a canvasOverride, so the draw assertions run against a
// recording stub ctx; shareTwinCard is driven with a document whose canvas
// throws (so it skips the image card) and a navigator.share that records
// what the recipient would receive.
globalThis.window = {};
globalThis.document = { createElement() { throw new Error('no canvas in node'); } };
require(path.join(here, '..', 'assets', 'viral-share.js'));
const { drawTwinCard, shareTwinCard } = globalThis.window.VHShare;
assert.equal(typeof drawTwinCard, 'function', 'drawTwinCard exposed');
assert.equal(typeof shareTwinCard, 'function', 'shareTwinCard exposed');

const OPTS = {
  targetName: 'Victor Wembanyama',
  targetSeason: '2024-25',
  twinName: 'Hakeem Olajuwon',
  twinSeason: '1993-94',
  sim: 0.92,
  why: ['elite rim protection', 'mid-range touch'],
  dayKey: '2026-11-14',
  url: 'https://hoops.dumbmodel.com/play?day=2026-11-14',
};

function recordingCtx() {
  const calls = [];
  const fonts = [];
  return {
    calls,
    fonts,
    fillStyle: '', strokeStyle: '', lineWidth: 0, textAlign: '', textBaseline: '',
    set font(v) { fonts.push(v); this._font = v; },
    get font() { return this._font; },
    fillRect(x, y, w, h) { calls.push({ m: 'fillRect', x, y, w, h, fill: this.fillStyle }); },
    strokeRect(x, y, w, h) { calls.push({ m: 'strokeRect', x, y, w, h, stroke: this.strokeStyle }); },
    fillText(s, x, y) { calls.push({ m: 'fillText', s, x, y, fill: this.fillStyle, font: this._font }); },
    measureText(s) { return { width: String(s).length * 20 }; },
  };
}

function draw(opts) {
  const ctx = recordingCtx();
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const out = drawTwinCard(opts, canvas);
  assert.equal(out, canvas, 'returns the canvas it drew on');
  return { canvas, ctx };
}

function texts(ctx) { return ctx.calls.filter((c) => c.m === 'fillText').map((c) => c.s); }
function rects(ctx, fill) { return ctx.calls.filter((c) => c.m === 'fillRect' && c.fill === fill); }

test('draw: 9:16 canvas, cream ground, headline + black bar', () => {
  const { canvas, ctx } = draw(OPTS);
  assert.equal(canvas.width, 1080, 'width 1080');
  assert.equal(canvas.height, 1920, 'height 1920');
  const ground = rects(ctx, '#FCFBF7');
  assert.ok(ground.some((r) => r.w === 1080 && r.h === 1920), 'full-canvas cream ground');
  const t = texts(ctx);
  assert.ok(t.includes('WHO PLAYS'), 'headline line 1');
  assert.ok(t.includes('LIKE'), 'headline line 2');
  assert.ok(t.includes('VICTOR WEMBANYAMA'), 'target on the black bar');
  const bar = rects(ctx, '#232323').find((r) => r.y === 470 && r.h === 130);
  assert.ok(bar, 'black highlight bar behind the target');
});

test('draw: twin as lotería card Nº 1 — red banner, distance chip, footer', () => {
  const { ctx } = draw(OPTS);
  const t = texts(ctx);
  assert.ok(t.includes('1'), 'number badge 1');
  assert.ok(t.includes('92%'), 'distance chip');
  assert.ok(t.includes('STYLE MATCH'), 'distance label');
  assert.ok(t.includes('HAKEEM OLAJUWON 1993-94'), 'name banner');
  assert.ok(t.includes('elite rim protection'), 'why line 1');
  assert.ok(t.includes('hoops.dumbmodel.com'), 'site footer');
  const banner = rects(ctx, '#C1272D').find((r) => r.w === 620 && r.h === 96);
  assert.ok(banner, 'red banner band, card width');
});

test('draw: banner colour rotates by rank — rank 2 is marigold', () => {
  const { ctx } = draw({ ...OPTS, rank: 2 });
  const banner = rects(ctx, '#E8A317').find((r) => r.w === 620 && r.h === 96);
  assert.ok(banner, 'marigold banner for rank 2');
  assert.ok(texts(ctx).includes('2'), 'number badge 2');
});

test('draw: system fonts only — no webfont, no remote fetch', () => {
  const { ctx } = draw(OPTS);
  assert.ok(ctx.fonts.length > 0, 'fonts were set');
  for (const f of ctx.fonts) {
    assert.match(f, /ui-(sans-serif|monospace)/, 'system font stack: ' + f);
    assert.ok(!/https?:/.test(f), 'no remote font: ' + f);
  }
});

async function buildTwinText(opts) {
  let shared = null;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { share: async (payload) => { shared = payload; } },
  });
  const ok = await shareTwinCard(opts);
  assert.equal(ok, true, 'the share sheet was used');
  assert.ok(shared, 'navigator.share received a payload');
  return shared;
}

test('share text: names the target and the twin, distance, playable URL', async () => {
  const { text, title, url } = await buildTwinText(OPTS);
  assert.ok(text.includes('Victor Wembanyama'), 'target named');
  assert.ok(text.includes('Hakeem Olajuwon'), 'twin named');
  assert.ok(text.includes('92%'), 'distance in text');
  assert.ok(url.includes('/play?day=2026-11-14'), 'playable URL');
  assert.equal(title, 'Who plays like Victor Wembanyama?');
});

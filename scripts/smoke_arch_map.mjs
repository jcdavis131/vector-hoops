// Data-contract test for the archetype map on trends.html.
//
// The page gate proves the block parses. It cannot prove the code runs, and this
// section's risk was never syntax — it was whether $ and say resolve from where
// the IIFE sits, and whether the cloud it reads is the shape it assumes. So this
// extracts the shipped IIFE verbatim, runs it against the real
// assets/vectors_map_lite.json and assets/mtnn_arch.json under a DOM stub, and
// asserts what it rendered.
//
//     node scripts/smoke_arch_map.mjs      # exit 0 clean, 1 on any failure
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const page = readFileSync(ROOT + '/trends.html', 'utf8');

const start = page.indexOf("  var cv=$('archMap'); if(!cv) return;");
if (start === -1) { console.log('FAIL could not find the archetype-map IIFE'); process.exit(1); }
const open = page.lastIndexOf('(function(){', start);
const end = page.indexOf('\n})();', start);
const src = page.slice(open, end + 6);
console.log(`extracted ${src.length} bytes of the shipped IIFE\n`);

// ── DOM stub ────────────────────────────────────────────────────────────────
const els = {};
const mkEl = (id) => (els[id] = els[id] || {
  id, innerHTML: '', textContent: '', style: {}, attrs: {}, handlers: {},
  clientWidth: 900,
  setAttribute(k, v) { this.attrs[k] = v; },
  getAttribute(k) { return this.attrs[k]; },
  addEventListener(t, fn) { this.handlers[t] = fn; },
  getContext() {
    return {
      setTransform() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {},
      set fillStyle(v) {}, set globalAlpha(v) {},
    };
  },
});
for (const id of ['archMap', 'archKey', 'archBtns', 'archMapTable', 'archMapMethod', 'live']) mkEl(id);

globalThis.document = { getElementById: (id) => els[id] || null };
globalThis.window = { devicePixelRatio: 2, addEventListener() {} };

const files = {
  'assets/vectors_map_lite.json': ROOT + '/assets/vectors_map_lite.json',
  'assets/mtnn_arch.json': ROOT + '/assets/mtnn_arch.json',
};
globalThis.fetch = (url) => {
  const key = Object.keys(files).find((k) => url.startsWith(k));
  if (!key) return Promise.resolve({ ok: false, status: 404 });
  return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(readFileSync(files[key], 'utf8'))) });
};

// ── run it ──────────────────────────────────────────────────────────────────
let fail = 0;
const check = (n, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); if (!ok) fail++; };

try {
  new Function(src)();
  check('IIFE runs with no ReferenceError', true);
} catch (e) {
  check('IIFE runs with no ReferenceError', false, String(e));
  process.exit(1);
}

await new Promise((r) => setTimeout(r, 60));   // let the fetch promises settle

const key = els.archKey.innerHTML;
const btns = els.archBtns.innerHTML;
const table = els.archMapTable.innerHTML;
const method = els.archMapMethod.textContent;
const truth = JSON.parse(readFileSync(files['assets/vectors_map_lite.json'], 'utf8')).players;
const names = JSON.parse(readFileSync(files['assets/mtnn_arch.json'], 'utf8')).gameArchetypes;

// the cloud is 189,455 bytes and must not sit on the critical path
check('the loader is gated behind an IntersectionObserver', /IntersectionObserver/.test(src) && /bootMap\(\)/.test(src));
check('there is a no-observer fallback', /else\s*\{\s*bootMap\(\);\s*\}/.test(src));

check('canvas got role=img', els.archMap.attrs.role === 'img');
check('canvas got a descriptive aria-label', (els.archMap.attrs['aria-label'] || '').length > 80);
check('legend names all 8 archetypes', names.every((n) => key.includes(n)), `${names.length} names`);
check('legend never relies on colour alone', key.includes('never the only label'));
check('9 filter buttons (All + 8)', (btns.match(/<button/g) || []).length === 9);
check('exactly one button is pressed', (btns.match(/aria-pressed="true"/g) || []).length === 1);
check('table has 8 data rows', (table.match(/<tr><td/g) || []).length === 8);
check('every th declares scope', (table.match(/<th /g) || []).length === (table.match(/<th scope="col">/g) || []).length);

const shares = [...table.matchAll(/<td>(\d+\.\d\d)%<\/td>/g)].map((m) => parseFloat(m[1]));
check('shares sum to 100', Math.abs(shares.reduce((a, b) => a + b, 0) - 100) < 0.05, shares.reduce((a, b) => a + b, 0).toFixed(2) + '%');
const counted = [...table.matchAll(/<td>(\d+)<\/td>/g)].map((m) => +m[1]).reduce((a, b) => a + b, 0);
check('counts sum to the cloud size', counted === truth.length, `${counted} vs ${truth.length}`);
check('method states the point count', method.includes(truth.length.toLocaleString()));
check('method states the projection caveat', /2-D projection/.test(method) && /exact\s+distances/.test(method.replace(/\s+/g, ' ')));
check('method explains why there is no season stepper', /4 rows to 491/.test(method));

console.log(`\n${fail === 0 ? 'ALL CHECKS PASS' : fail + ' FAILED'}`);
process.exit(fail === 0 ? 0 : 1);

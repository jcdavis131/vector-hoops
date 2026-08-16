// Data-contract test for the retrieval map on model.html.
//
// Extracts the shipped IIFE verbatim and runs it against the real
// embedding_map_trajectories.json, embedding_map_points_limited.json and
// eval_scoreboard.json under a DOM stub.
//
// The check that matters most is the last one: this section must not compute a
// neighbour rank. The scoreboard's top-1/top-5 are 64-d cosine, and ranking by
// distance in the 2-D projection on screen would be a different measurement. The
// numbers must come from the file.
//
//     node scripts/smoke_retrieval_map.mjs
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const page = readFileSync(ROOT + '/model.html', 'utf8');

const start = page.indexOf("  var sec=$('retrSection'); if(!sec) return;");
if (start === -1) { console.log('FAIL could not find the retrieval IIFE'); process.exit(1); }
const open = page.lastIndexOf('(function(){', start);
const end = page.indexOf('\n})();', start);
const src = page.slice(open, end + 6);
console.log(`extracted ${src.length} bytes of the shipped IIFE\n`);

const els = {};
const mkEl = (id) => (els[id] = {
  id, innerHTML: '', textContent: '', value: '', disabled: true, style: {}, attrs: {}, handlers: {},
  clientWidth: 900,
  setAttribute(k, v) { this.attrs[k] = v; },
  addEventListener(t, fn) { this.handlers[t] = fn; },
  getContext: () => ({
    setTransform() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {},
    set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {},
    set lineJoin(v) {}, set lineCap(v) {}, set globalAlpha(v) {},
  }),
});
for (const id of ['retrSection', 'retrMap', 'retrPick', 'retrLive', 'retrLead', 'retrRead', 'retrTable', 'retrMethod']) mkEl(id);

globalThis.document = { getElementById: (id) => els[id] || null };
let observed = false;
globalThis.window = {
  devicePixelRatio: 2,
  addEventListener() {},
  IntersectionObserver: class {
    constructor(cb) { this.cb = cb; }
    observe() { observed = true; this.cb([{ isIntersecting: true }]); }
    disconnect() {}
  },
};
globalThis.IntersectionObserver = globalThis.window.IntersectionObserver;

const files = {
  'assets/embedding_map_trajectories.json': ROOT + '/assets/embedding_map_trajectories.json',
  'assets/embedding_map_points_limited.json': ROOT + '/assets/embedding_map_points_limited.json',
  'assets/eval_scoreboard.json': ROOT + '/assets/eval_scoreboard.json',
};
globalThis.fetch = (url) => {
  const key = Object.keys(files).find((k) => url.startsWith(k));
  if (!key) return Promise.resolve({ ok: false, status: 404 });
  return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(readFileSync(files[key], 'utf8'))) });
};

let fail = 0;
const check = (n, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); if (!ok) fail++; };

try { new Function(src)(); check('IIFE runs with no ReferenceError', true); }
catch (e) { check('IIFE runs with no ReferenceError', false, String(e)); process.exit(1); }

check('it lazy-loads behind an IntersectionObserver', observed);
await new Promise((r) => setTimeout(r, 300));

const tr = JSON.parse(readFileSync(files['assets/embedding_map_trajectories.json'], 'utf8')).trajectories;
const sb = JSON.parse(readFileSync(files['assets/eval_scoreboard.json'], 'utf8'));
const lead = els.retrLead.innerHTML;
const method = els.retrMethod.textContent;
const opts = (els.retrPick.innerHTML.match(/<option/g) || []).length;
const eligible = Object.keys(tr).filter((k) => tr[k].length >= 4).length;

check('canvas got role=img and a real label', els.retrMap.attrs.role === 'img' && (els.retrMap.attrs['aria-label'] || '').length > 80);
check('picker enabled and populated', !els.retrPick.disabled && opts === eligible, `${opts} options vs ${eligible} careers >= 4 seasons`);
check('defaults to a real career', els.retrPick.value === '2544' && !!tr[els.retrPick.value]);
check('readout names the span', /\d+ seasons?, \d{4}-\d{2} to \d{4}-\d{2}/.test(els.retrRead.textContent), els.retrRead.textContent.slice(0, 70));
check('table rows equal that career length', (els.retrTable.innerHTML.match(/<tr><td/g) || []).length === tr['2544'].length, `${tr['2544'].length} seasons`);
check('every th declares scope', (els.retrTable.innerHTML.match(/<th /g) || []).length === (els.retrTable.innerHTML.match(/<th scope="col">/g) || []).length);

// the figures must be the file's, rounded — not typed in
const top1 = Math.round(sb.results.mtnn.overall.top1 * 100);
const top5 = Math.round(sb.results.mtnn.overall.top5 * 100);
const base5 = Math.round(sb.results.baseline_transparent_14d.overall.top5 * 100);
check('lead quotes top-1 from the file', lead.includes(`<b>${top1}%</b>`), `${top1}%`);
check('lead quotes top-5 from the file', lead.includes(`<b>${top5}%</b>`), `${top5}%`);
check('lead quotes the 14-d baseline from the file', lead.includes(`<b>${base5}%</b>`), `${base5}%`);
check('lead quotes the pair count from the file', lead.includes(sb.eligible_pairs.toLocaleString()), String(sb.eligible_pairs));

// the trap
check('method states the 2-D vs 64-d caveat', /2-D projection/.test(method) && /64-d cosine/.test(method));
check('the code computes no neighbour rank', !/\brank\b\s*=|sort\([^)]*dist|Math\.hypot|dx\*dx/.test(src));

console.log(`\n${fail === 0 ? 'ALL CHECKS PASS' : fail + ' FAILED'}`);
process.exit(fail === 0 ? 0 : 1);

// End-to-end test for the early error hook.
//
// The claim being tested is specific: an error thrown before
// assets/error-boundary.js loads still ends up in vh.errors. That is the failure
// 9a0a4481 was — index.html's entire inline script was a SyntaxError, never ran,
// and nothing recorded it, because the boundary loads at the end of <body> and a
// listener only sees scripts parsed after it.
//
// So this installs the hook exactly as the pages ship it, fires an error through
// it, then loads the real error-boundary.js and checks the error came out the
// other side.
//
//     node scripts/smoke_early_errors.mjs
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// the hook, taken from a shipped page rather than from the generator
const page = readFileSync(ROOT + '/index.html', 'utf8');
const hookMatch = page.match(/<script>\/\* early error queue[\s\S]*?<\/script>/);
if (!hookMatch) { console.log('FAIL no early hook found in index.html'); process.exit(1); }
const hookSrc = hookMatch[0].replace(/^<script>/, '').replace(/<\/script>$/, '');

// ── minimal DOM/browser stub ────────────────────────────────────────────────
const listeners = {};
const store = {};
const el = () => ({
  style: {}, innerHTML: '', textContent: '', id: '', classList: { add() {}, contains: () => false },
  setAttribute() {}, appendChild() {}, insertBefore() {}, remove() {}, addEventListener() {},
  firstChild: null, parentNode: null,
});
globalThis.window = {
  addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
  matchMedia: () => ({ matches: false }),
  console,
};
globalThis.addEventListener = globalThis.window.addEventListener;
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
globalThis.document = {
  readyState: 'complete',
  body: el(), documentElement: el(),
  createElement: el, getElementById: () => null, querySelector: () => null,
  querySelectorAll: () => [], addEventListener() {},
};
// Node 24 exposes navigator as a getter-only global, so it has to be redefined
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'smoke', onLine: true }, configurable: true });
globalThis.location = { href: 'https://example.test/index.html', reload() {} };
globalThis.setTimeout = (fn) => fn;
globalThis.CustomEvent = class { constructor(t) { this.type = t; } };

let fail = 0;
const check = (n, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); if (!ok) fail++; };

// 1. install the hook, exactly as shipped
new Function(hookSrc)();
check('hook installs a queue', Array.isArray(globalThis.window.__vhErr));
check('hook registers an error listener', (listeners.error || []).length === 1);
check('hook registers an unhandledrejection listener', (listeners.unhandledrejection || []).length === 1);

// 2. fire the failure the boundary could never see: a script that did not parse
listeners.error[0]({
  message: "Unexpected identifier 'c'",
  filename: 'https://example.test/index.html',
  lineno: 412, colno: 18, error: { stack: 'SyntaxError: Unexpected identifier' },
});
listeners.unhandledrejection[0]({ reason: new Error('a rejected fetch') });
check('queue captured both', globalThis.window.__vhErr.length === 2, `${globalThis.window.__vhErr.length} queued`);

// 3. now load the real boundary, as the end of <body> would
const boundary = readFileSync(ROOT + '/assets/error-boundary.js', 'utf8');
try { new Function(boundary)(); check('error-boundary.js runs', true); }
catch (e) { check('error-boundary.js runs', false, String(e)); process.exit(1); }

// 4. did the pre-boundary error survive?
const logged = JSON.parse(store['vh.errors'] || '[]');
check('the pre-boundary errors reached vh.errors', logged.length >= 2, `${logged.length} logged`);
check('the SyntaxError is there with its line', logged.some((e) => /Unexpected identifier/.test(e.message) && e.lineno === 412));
check('the rejection is there', logged.some((e) => e.type === 'unhandledrejection' && /rejected fetch/.test(e.message)));

// 5. the queue must stop accumulating, or it double-logs and grows forever
const before = JSON.parse(store['vh.errors']).length;
globalThis.window.__vhErr.push({ type: 'js', message: 'should be ignored' });
const after = JSON.parse(store['vh.errors']).length;
check('queue is a no-op sink after draining', !Array.isArray(globalThis.window.__vhErr) && before === after);

console.log(`\n${fail === 0 ? 'ALL CHECKS PASS' : fail + ' FAILED'}`);
process.exit(fail === 0 ? 0 : 1);

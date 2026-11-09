// t13-t15-harness.mjs — execute the A6 JS changes under stubbed DOM globals
// (no browser needed): T15 open() focuses Close; T13 markLive/loadTonight
// stop after the first failed scoreboard fetch per tab session.
// Stdlib only (node:vm). Reads the overlay's assets/*.js, writes nothing.
// Usage: node docs/phase2-A6/t13-t15-harness.mjs   (exit 0 = all PASS)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? ' — ' + detail : ''));
  if (!cond) failures++;
}

function storage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    _dump: () => Object.fromEntries(m),
  };
}

function makeEl() {
  const listeners = {};
  const attrs = {};
  const classes = new Set();
  return {
    attrs, classes, listeners,
    hidden: false, focused: false,
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return k in attrs ? attrs[k] : null; },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    classList: { toggle(c, on) { if (on) classes.add(c); else classes.delete(c); } },
    focus() { this.focused = true; },
    closest() { return null; },
    querySelector() { return null; },
  };
}

// ---------------- T15 + T13/markLive (site-nav.js) ----------------
{
  const session = storage();
  const local = storage();
  let fetchCalls = 0;
  const fetchStub = () => { fetchCalls++; return Promise.reject(new Error('offline')); };

  const closeBtn = makeEl();
  const firstItem = makeEl();
  const exploreBtn = makeEl();
  exploreBtn.setAttribute('aria-expanded', 'false');
  const drawer = makeEl();
  drawer.hidden = true;
  drawer.querySelector = (sel) => (sel === '.explore-item' ? firstItem : null);
  const liveLink = makeEl();
  const soundBtn = makeEl();
  const nav = makeEl();
  nav.getAttribute = (a) => (a === 'data-mounted' ? (nav.attrs['data-mounted'] || null) : (a === 'data-active' ? '/' : null));
  nav.setAttribute = (k, v) => { nav.attrs[k] = String(v); };
  nav.querySelector = (sel) => {
    if (sel === '.site-nav__explore') return exploreBtn;
    if (sel === '.site-nav__drawer') return drawer;
    if (sel === '.site-nav__drawer-close') return closeBtn;
    if (sel === '.explore-item[href="/live"]') return liveLink;
    if (sel === '.site-nav__sound') return soundBtn;
    return null;
  };

  const sandbox = {
    console,
    window: { fetch: fetchStub, location: { href: 'http://127.0.0.1:8477/', pathname: '/' } },
    document: {
      readyState: 'complete',
      querySelector: (sel) => (sel === '.site-nav' ? nav : null),
      addEventListener() {},
    },
    sessionStorage: session,
    localStorage: local,
    location: { href: 'http://127.0.0.1:8477/', pathname: '/' },
    fetch: fetchStub,
    AbortController,
    setTimeout,
    URL,
  };
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'assets', 'site-nav.js'), 'utf8'), sandbox, { filename: 'site-nav.js' });

  // mount() ran at load: markLive fetched once and failed.
  await new Promise((r) => setTimeout(r, 50));
  check('T13/markLive first mount fetches once', fetchCalls === 1, 'fetchCalls=' + fetchCalls);
  check('T13/markLive failure flag set', session.getItem('vh_nav_live_failed') === '1', JSON.stringify(session._dump()));

  // T15: open() must focus Close, not the first item.
  sandbox.window.VHExploreDrawer.open();
  check('T15 open() focuses Close', closeBtn.focused === true, 'closeBtn.focused=' + closeBtn.focused);
  check('T15 open() does not focus first item', firstItem.focused === false, 'firstItem.focused=' + firstItem.focused);
  check('T15 open() unhides drawer', drawer.hidden === false);
  check('T15 open() sets aria-expanded', exploreBtn.getAttribute('aria-expanded') === 'true');
  sandbox.window.VHExploreDrawer.close(true);
  check('T15 close(true) returns focus to Explore', exploreBtn.focused === true);
  check('T15 close() hides drawer', drawer.hidden === true);

  // Second mount in the same session must NOT refetch (failure remembered).
  const callsBefore = fetchCalls;
  nav.attrs['data-mounted'] = null;
  sandbox.window.VHSiteNav.mount();
  await new Promise((r) => setTimeout(r, 50));
  check('T13/markLive second mount skips fetch', fetchCalls === callsBefore, 'fetchCalls=' + fetchCalls + ' (was ' + callsBefore + ')');
}

// ---------------- T13/loadTonight (home-tonight.js) ----------------
{
  const session = storage();
  let fetchCalls = 0;
  const fetchStub = () => { fetchCalls++; return Promise.reject(new Error('offline')); };

  const sandbox = {
    console,
    window: { fetch: fetchStub, matchMedia: () => ({ matches: false }) },
    document: {
      readyState: 'complete',
      getElementById: (id) => (id === 'tonight' ? {} : null),
      querySelector: () => null,
      addEventListener() {},
    },
    sessionStorage: session,
    fetch: fetchStub,
    AbortController,
    setTimeout,
    URL,
    Intl,
  };
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'assets', 'home-tonight.js'), 'utf8'), sandbox, { filename: 'home-tonight.js' });

  // boot() ran at load: loadTonight fetched once and failed.
  await new Promise((r) => setTimeout(r, 50));
  check('T13/loadTonight first boot fetches once', fetchCalls === 1, 'fetchCalls=' + fetchCalls);
  check('T13/loadTonight failure flag set', session.getItem('vh.tonightFailed') === '1', JSON.stringify(session._dump()));

  // Second boot in the same session must NOT refetch.
  vm.runInContext(fs.readFileSync(path.join(root, 'assets', 'home-tonight.js'), 'utf8'), sandbox, { filename: 'home-tonight.js' });
  await new Promise((r) => setTimeout(r, 50));
  check('T13/loadTonight second boot skips fetch', fetchCalls === 1, 'fetchCalls=' + fetchCalls);
}

console.log(failures === 0 ? 'HARNESS ALL PASS' : 'HARNESS FAILURES: ' + failures);
process.exit(failures === 0 ? 0 : 1);

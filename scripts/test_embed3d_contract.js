/* Contract test for window.Embed3D.mount — runs in node with DOM stubs. */
'use strict';
const fs = require('fs');
const src = fs.readFileSync('assets/embed-3d.js', 'utf8');

/* --- minimal browser stubs --- */
function mkEl() {
  const el = {
    children: [], dataset: {}, style: {},
    innerHTML: '', textContent: '',
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {}, setPointerCapture() {},
    getContext() { return new Proxy({}, { get: () => () => {} }); },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    setAttribute() {},
    clientWidth: 800,
  };
  return el;
}
global.document = { createElement: () => mkEl() };
global.window = global;
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.fetch = () => Promise.reject(new Error('network down (test)'));
global.requestAnimationFrame = () => 0;
global.matchMedia = () => ({ matches: false });
global.ResizeObserver = undefined;

eval(src);

const assert = require('assert');
assert(typeof window.Embed3D === 'object', 'Embed3D namespace exists');
assert(typeof window.Embed3D.mount === 'function', 'mount is a function');

const host = mkEl();
const calls = [];
const handle = window.Embed3D.mount(host, {
  projection: 'tsne',
  highlightIds: [1, 2, 3],
  height: 500,
  onSelect: (id) => calls.push(id),
});
assert(typeof handle.setProjection === 'function', 'handle.setProjection');
assert(typeof handle.setHighlight === 'function', 'handle.setHighlight');
assert(typeof handle.destroy === 'function', 'handle.destroy');
handle.setHighlight([4, 5]);
handle.destroy();

/* dataset default path */
const host2 = mkEl();
host2.dataset.projection = 'pca';
window.Embed3D.mount(host2, {});
/* graceful failure: error div must be rendered (fetch rejected) */
setTimeout(() => {
  assert(/3D map unavailable/.test(host2.innerHTML),
    'honest error rendered on data-load failure, got: ' + host2.innerHTML.slice(0, 80));
  console.log('CONTRACT OK: mount + handle + graceful failure');
}, 50);

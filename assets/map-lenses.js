/* map-lenses.js — layout switcher for the game map: [Map | PCA | t-SNE (+SVD)]
 *
 * IIFE, zero dependencies. Drives shared-map.js through its lens hooks
 * (getRowIds / getBasePositions / setBasePositions / setDimmed / refresh).
 *
 * Usage:
 *   var handle = VHMapLenses.attach(api, { mountEl: el, idToPid: Map });
 *   handle.setCandidates([externalId, ...]);  // optional: "N remain" + isolate
 *   handle.destroy();
 *
 * - layouts.v1.json lazy-loads on the FIRST 2D-lens switch, never on attach.
 * - Transitions: 800ms simultaneous ease-in-out lerp of every dot at once
 *   (no stagger). prefers-reduced-motion -> instant jump.
 * - Dimming/elimination state lives in the map instance and is preserved
 *   across lenses automatically (positions and dim sets are independent).
 * - Segments render dynamically from whichever layout keys survive the
 *   build-time distinctness gate (Map | PCA | t-SNE [+ SVD]).
 */
(function () {
  'use strict';

  var LAYOUTS_URL = 'assets/layouts.v1.json';
  var TRANSITION_MS = 800;
  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {}

  var CAPTIONS = {
    map: 'The universe as the model sees it — 3D.',
    tsne: 't-SNE — twin neighborhoods: tight clusters play alike.',
    svd: 'SVD — a second linear view of the same space.'
  };

  function easeInOut(k) {
    return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  }

  function pcaCaption(meta) {
    try {
      var axes = meta.pca.axes;
      var a0 = axes[0].top_features.join(' vs ');
      var a1 = axes[1].top_features.join(' vs ');
      return 'PCA — ' + a0 + ' · ' + a1;
    } catch (e) {
      return 'PCA — the big axes of the data.';
    }
  }

  function attach(api, opts) {
    opts = opts || {};
    if (!api || typeof api.getRowIds !== 'function' ||
        typeof api.getBasePositions !== 'function' ||
        typeof api.setBasePositions !== 'function') {
      return null;
    }
    var home = api.getBasePositions();
    if (!home) return null;
    var rowIds = api.getRowIds();
    var idToPid = opts.idToPid || new Map();

    var mountEl = opts.mountEl || null;
    var current = 'map';
    var layoutsPromise = null;
    var layoutsData = null;   // {ids, pidToIdx, pca, tsne, svd?, meta}
    var lensOrder = ['map', 'pca', 'tsne'];
    var candidates = null;    // external ids or null
    var isolate = false;
    var rafId = 0;
    var destroyed = false;

    // ---------- control bar ----------
    var bar = document.createElement('div');
    bar.className = 'vh-lensbar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Map layouts');
    var btns = {};
    function renderButtons() {
      bar.innerHTML = '';
      btns = {};
      lensOrder.forEach(function (name) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip pill vh-lens-btn' + (name === current ? ' on' : '');
        b.textContent = { map: 'Map', pca: 'PCA', tsne: 't-SNE', svd: 'SVD' }[name] || name;
        b.setAttribute('data-lens', name);
        b.addEventListener('click', function () { switchLens(name); });
        bar.appendChild(b);
        btns[name] = b;
      });
      var cap = document.createElement('span');
      cap.className = 'vh-lens-cap';
      cap.id = 'vh-lens-cap';
      bar.appendChild(cap);
      var count = document.createElement('span');
      count.className = 'vh-lens-count';
      count.hidden = true;
      bar.appendChild(count);
      var iso = document.createElement('button');
      iso.type = 'button';
      iso.className = 'chip pill vh-lens-iso';
      iso.textContent = 'Isolate';
      iso.hidden = true;
      iso.setAttribute('aria-pressed', 'false');
      iso.addEventListener('click', toggleIsolate);
      bar.appendChild(iso);
      bar._cap = cap; bar._count = count; bar._iso = iso;
      updateCaption();
      updateCounter();
    }
    function updateCaption() {
      if (!bar._cap) return;
      var t = CAPTIONS[current] || current;
      if (current === 'pca' && layoutsData) t = pcaCaption(layoutsData.meta);
      bar._cap.textContent = t;
    }
    function updateCounter() {
      if (!bar._count) return;
      if (candidates && candidates.length) {
        bar._count.hidden = false;
        bar._count.textContent = candidates.length + ' remain';
        bar._iso.hidden = false;
      } else {
        bar._count.hidden = true;
        bar._iso.hidden = true;
      }
    }
    function markActive() {
      Object.keys(btns).forEach(function (n) {
        btns[n].classList.toggle('on', n === current);
      });
    }

    // ---------- layouts data (lazy) ----------
    function ensureLayouts() {
      if (layoutsPromise) return layoutsPromise;
      layoutsPromise = fetch(LAYOUTS_URL, { cache: 'default' })
        .then(function (r) {
          if (!r.ok) throw new Error('http ' + r.status);
          return r.json();
        })
        .then(function (j) {
          var pidToIdx = new Map();
          (j.ids || []).forEach(function (pid, i) { pidToIdx.set(pid, i); });
          layoutsData = {
            pidToIdx: pidToIdx,
            pca: j.pca, tsne: j.tsne, svd: j.svd || null,
            meta: j.meta || {}
          };
          var order = ['map', 'pca', 'tsne'];
          if (layoutsData.svd) order.push('svd');
          if (order.join() !== lensOrder.join()) {
            lensOrder = order;
            renderButtons();
          }
          updateCaption();
          return layoutsData;
        })
        .catch(function (err) {
          if (bar._cap) bar._cap.textContent = 'Layouts unavailable — 3D map only.';
          throw err;
        });
      return layoutsPromise;
    }

    // internal row index -> [ox,oy,oz] target for a lens (null = keep current)
    function targetsFor(name) {
      if (name === 'map') {
        return function (i) {
          return i < home.ox.length ? [home.ox[i], home.oy[i], home.oz[i]] : null;
        };
      }
      if (!layoutsData) return null;
      var arr = layoutsData[name];
      if (!arr) return null;
      var pidToIdx = layoutsData.pidToIdx;
      return function (i) {
        if (i >= rowIds.length) return null;
        var pid = idToPid.get(rowIds[i]);
        if (pid == null) return null;
        var li = pidToIdx.get(pid);
        if (li == null) return null;
        var pt = arr[li];
        if (!pt) return null;
        return [pt[0] / 1000, pt[1] / 1000, 0];
      };
    }

    function switchLens(name) {
      if (destroyed || name === current) return;
      if (name !== 'map') {
        ensureLayouts().then(
          function () { doSwitch(name); },
          function () { /* layouts failed: stay on current lens */ }
        );
        return;
      }
      doSwitch(name);
    }

    function doSwitch(name) {
      if (destroyed || name === current) { current = name; markActive(); updateCaption(); return; }
      var to = targetsFor(name);
      if (!to) return;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      current = name;
      markActive();
      updateCaption();
      if (reduceMotion) {
        api.setBasePositions(to);
        return;
      }
      var from = api.getBasePositions();
      if (!from) { api.setBasePositions(to); return; }
      var t0 = performance.now();
      function frame(now) {
        if (destroyed) return;
        var k = Math.min(1, (now - t0) / TRANSITION_MS);
        var e = easeInOut(k);
        api.setBasePositions(function (i) {
          var t = to(i);
          if (!t || i >= from.ox.length) return t;
          return [
            from.ox[i] + (t[0] - from.ox[i]) * e,
            from.oy[i] + (t[1] - from.oy[i]) * e,
            from.oz[i] + (t[2] - from.oz[i]) * e
          ];
        });
        if (k < 1) {
          rafId = requestAnimationFrame(frame);
        } else {
          rafId = 0;
        }
      }
      rafId = requestAnimationFrame(frame);
    }

    // ---------- candidates / isolate ----------
    function setCandidates(extIds) {
      candidates = Array.isArray(extIds) && extIds.length ? extIds.slice() : null;
      isolate = false;
      if (bar._iso) bar._iso.setAttribute('aria-pressed', 'false');
      try { api.setDimmed(null); } catch (e) {}
      updateCounter();
    }
    function toggleIsolate() {
      isolate = !isolate;
      if (bar._iso) bar._iso.setAttribute('aria-pressed', isolate ? 'true' : 'false');
      try {
        if (isolate && candidates) {
          var cand = new Set(candidates.map(function (id) { return id | 0; }));
          var ids = api.getRowIds();
          var dim = [];
          for (var i = 0; i < ids.length; i++) {
            if (!cand.has(ids[i])) dim.push(ids[i]);
          }
          api.setDimmed(dim);
        } else {
          api.setDimmed(null);
        }
      } catch (e) {}
    }

    // ---------- keyboard 1/2/3(/4) ----------
    function onKey(e) {
      if (destroyed) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
                t.tagName === 'SELECT' || t.isContentEditable)) return;
      var idx = { '1': 0, '2': 1, '3': 2, '4': 3 }[e.key];
      if (idx == null || idx >= lensOrder.length) return;
      e.preventDefault();
      switchLens(lensOrder[idx]);
    }

    // ---------- init ----------
    renderButtons();
    if (mountEl) mountEl.appendChild(bar);
    document.addEventListener('keydown', onKey);

    return {
      switchLens: switchLens,
      setCandidates: setCandidates,
      get current() { return current; },
      destroy: function () {
        destroyed = true;
        if (rafId) cancelAnimationFrame(rafId);
        document.removeEventListener('keydown', onKey);
        if (bar.parentNode) bar.parentNode.removeChild(bar);
      }
    };
  }

  window.VHMapLenses = { attach: attach };
})();

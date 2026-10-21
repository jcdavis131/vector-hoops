/* Vector Hoops viz-lib — core. No dependencies.
 *
 * One component system for every visualization on the site. Every primitive
 * (network, flow, bars, drift, matchup, trajectory) is built on these:
 *   - theme colors resolved from the Drafting Board tokens (atlas.css), so
 *     paper default + night-board dark both work and SVG snapshots are
 *     self-contained (colors are baked as attributes, not classes)
 *   - lazy data loading (IntersectionObserver) + fixed-aspect mounts
 *     (no layout shift)
 *   - honest 503 error cards on data failure — never invented numbers
 *   - deep-link state (?p= etc.), copy-link buttons, PNG snapshot export
 *   - reduced-motion respected everywhere; motion encodes data, never decor
 *
 * Convention: primitives return SVG strings; pages mount them with VHL.mount.
 * Style: ES5, like the rest of the repo.
 */
(function (global) {
  'use strict';

  var VHL = (global.VHL = global.VHL || {});

  /* ---------- theme ---------- */

  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      if (v && v.trim()) return v.trim();
    } catch (e) {}
    return fallback;
  }

  VHL.colors = function () {
    var dark = false;
    try {
      dark = !!(
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
      );
    } catch (e) {}
    return {
      dark: dark,
      board: cssVar('--board', dark ? '#0F1114' : '#FCFBF7'),
      ink: cssVar('--ink', dark ? '#ECEEF1' : '#232323'),
      fg: cssVar('--fg', dark ? '#ECEEF1' : '#232323'),
      fg2: cssVar('--fg-2', dark ? '#A7B0BC' : '#57574F'),
      fg3: cssVar('--fg-3', '#7F8995'),
      line: cssVar('--line', dark ? '#1D232C' : '#E7E4DA'),
      surface: cssVar('--surface', dark ? '#14161A' : '#FCFBF7'),
      surface2: cssVar('--surface-2', dark ? '#1A1D22' : '#F5F2E9'),
      accent: cssVar('--accent', dark ? '#FF7A33' : '#E0483B'),
      terra: cssVar('--data-terra', dark ? '#C17C60' : '#A05A38'),
      moss: cssVar('--data-moss', '#8A9A8B'),
      gold: cssVar('--gold', '#D4AF69'),
      void: cssVar('--void', '#1E2022'),
      blue: cssVar('--blue', dark ? '#7FA7D9' : '#2B6CE5')
    };
  };

  VHL.fonts = {
    display: 'Archivo, Inter, ui-sans-serif, system-ui, sans-serif',
    text: 'Inter, ui-sans-serif, system-ui, sans-serif',
    code: 'ui-monospace, Menlo, Consolas, monospace'
  };

  /* ---------- small helpers ---------- */

  VHL.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  VHL.reduced = function () {
    try {
      return !!(
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
    } catch (e) {
      return false;
    }
  };

  VHL.hash = function (str) {
    // deterministic 32-bit hash — stable jitter, no Math.random in renders
    var h = 2166136261, s = String(str), i;
    for (i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) | 0;
    }
    return (h >>> 0) / 4294967295;
  };

  var NAME_FIXES = {
    'Shai GilgeousAlexander': 'Shai Gilgeous-Alexander',
    'KarlAnthony Towns': 'Karl-Anthony Towns',
    'Michael CarterWilliams': 'Michael Carter-Williams',
    "Shaquille ONeal": "Shaquille O'Neal",
    "Jermaine ONeal": "Jermaine O'Neal",
    'Royce ONeale': "Royce O'Neale"
  };
  VHL.pretty = function (name) {
    return NAME_FIXES[name] || name;
  };
  VHL.shortSeason = function (s) {
    var p = String(s).split('-');
    return p.length === 2 ? "'" + p[0].slice(2) + '-' + p[1] : String(s);
  };

  /* ---------- data ---------- */

  VHL.get = function (url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r;
    });
  };

  VHL.getJSON = function (url) {
    return VHL.get(url).then(function (r) {
      return r.json();
    });
  };

  /* Honest 503 card: data failed to load. Rendered as an HTML block (not SVG)
     so it inherits page styles; never a fabricated chart. */
  VHL.errorHTML = function (what) {
    return (
      '<div class="vhl-error" role="alert">' +
      '<b>Couldn\u2019t load ' +
      VHL.esc(what) +
      ' right now.</b>' +
      '<span>Check your connection and reload \u2014 no numbers are shown rather than wrong ones.</span>' +
      '</div>'
    );
  };

  /* Lazy: run load() the first time el scrolls into view. Shows a skeleton
     frame with the final aspect ratio so nothing shifts when data arrives. */
  VHL.lazy = function (el, load, aspect) {
    var w = 640, h = Math.round(640 / (aspect || 16 / 9));
    el.innerHTML =
      '<div class="vhl-frame" style="aspect-ratio:' + w + '/' + h + '">' +
      '<div class="vhl-skel" aria-hidden="true"></div></div>';
    var done = false;
    function fire() {
      if (done) return;
      done = true;
      load();
    }
    if (!('IntersectionObserver' in window)) {
      fire();
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          io.disconnect();
          fire();
        }
      });
    }, { rootMargin: '240px' });
    io.observe(el);
  };

  /* ---------- mount ---------- */

  /* Mount an SVG string with no layout shift. The frame keeps the aspect
     ratio from first paint; the svg scales to fill. Re-renders on color-scheme
     change so night-board swaps stay correct. */
  VHL.mount = function (el, svg, opts) {
    opts = opts || {};
    var aspect = opts.aspect || '16/9';
    el.innerHTML =
      '<div class="vhl-frame" style="aspect-ratio:' + aspect + '">' + svg + '</div>';
    var svgEl = el.querySelector('svg');
    if (!VHL._themeHooks) VHL._themeHooks = [];
    // re-render on theme flip (debounced): colors are baked per render
    if (opts.rerender && typeof opts.rerender === 'function') {
      VHL._themeHooks.push({ el: el, fn: opts.rerender });
    }
    return svgEl;
  };

  try {
    if (typeof window !== 'undefined' && window.matchMedia) {
      window
        .matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', function () {
          (VHL._themeHooks || []).forEach(function (h) {
            if (document.contains(h.el)) h.fn();
          });
        });
    }
  } catch (e) {}

  /* ---------- deep links ---------- */

  VHL.params = function () {
    return new URLSearchParams(location.search);
  };

  VHL.setParams = function (obj) {
    var url = new URL(location.href);
    Object.keys(obj).forEach(function (k) {
      if (obj[k] == null) url.searchParams.delete(k);
      else url.searchParams.set(k, String(obj[k]));
    });
    history.replaceState(null, '', url.toString());
  };

  VHL.copyLink = function (btn) {
    var url = location.href;
    function done() {
      var old = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(function () {
        btn.textContent = old;
      }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, done);
    } else done();
  };

  /* ---------- snapshot ---------- */

  /* Export an <svg> element to a PNG download. Primitives bake colors as
     attributes, so the snapshot matches the screen render exactly. */
  VHL.snapshot = function (svgEl, filename) {
    try {
      var clone = svgEl.cloneNode(true);
      var vb = svgEl.viewBox.baseVal;
      var w = vb && vb.width ? vb.width : 640;
      var h = vb && vb.height ? vb.height : 360;
      clone.setAttribute('width', w * 2);
      clone.setAttribute('height', h * 2);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      var blob = new Blob([new XMLSerializer().serializeToString(clone)], {
        type: 'image/svg+xml;charset=utf-8'
      });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas');
          c.width = w * 2;
          c.height = h * 2;
          var ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, w * 2, h * 2);
          URL.revokeObjectURL(url);
          var a = document.createElement('a');
          a.download = filename || 'viz.png';
          a.href = c.toDataURL('image/png');
          document.body.appendChild(a);
          a.click();
          a.remove();
        } catch (e) {}
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch (e) {}
  };

  /* Wire a .vhl-share row: buttons with data-vhl="copy|shot" inside container. */
  VHL.wireShare = function (container, svgOf, name) {
    container.querySelectorAll('[data-vhl="copy"]').forEach(function (b) {
      b.addEventListener('click', function () {
        VHL.copyLink(b);
      });
    });
    container.querySelectorAll('[data-vhl="shot"]').forEach(function (b) {
      b.addEventListener('click', function () {
        var svg = typeof svgOf === 'function' ? svgOf() : svgOf;
        if (svg) VHL.snapshot(svg, (name || 'viz') + '.png');
      });
    });
  };

  /* ---------- motion ---------- */

  /* rAF tween: motion encodes data (positions, widths), skipped entirely
     under reduced-motion (jump to final state). */
  VHL.tween = function (dur, onFrame, onDone) {
    if (VHL.reduced()) {
      onFrame(1);
      if (onDone) onDone();
      return;
    }
    var t0 = null;
    function step(t) {
      if (t0 == null) t0 = t;
      var k = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3); // easeOutCubic
      onFrame(e);
      if (k < 1) requestAnimationFrame(step);
      else if (onDone) onDone();
    }
    requestAnimationFrame(step);
  };

  /* Bind tap/click on svg [data-vhl-node] groups: 44px+ hit areas for mobile. */
  VHL.bindNodes = function (svgEl, onNode) {
    if (!onNode) return;
    svgEl.addEventListener('click', function (e) {
      var g = e.target.closest ? e.target.closest('[data-vhl-node]') : null;
      if (g && g.getAttribute('data-vhl-node')) onNode(g.getAttribute('data-vhl-node'), g, e);
    });
    svgEl.addEventListener('keydown', function (e) {
      var g = e.target.closest ? e.target.closest('[data-vhl-node]') : null;
      if (g && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onNode(g.getAttribute('data-vhl-node'), g, e);
      }
    });
  };

  /* Opening an SVG tag with baked theme font + role. */
  VHL.svgOpen = function (w, h, label) {
    var c = VHL._c || (VHL._c = VHL.colors());
    return (
      '<svg viewBox="0 0 ' +
      w +
      ' ' +
      h +
      '" class="vhl-svg" role="img" aria-label="' +
      VHL.esc(label) +
      '" font-family="' +
      VHL.fonts.text +
      '" style="width:100%;height:100%;display:block">'
    );
  };
})(window);

/* Vector Hoops 3D Embedding Map — hand-rolled canvas 3D point renderer.
   Zero dependencies (no Three.js). Data is precomputed at build time
   (scripts/build_embed3d.py) and served as assets/projections/embed3d.json.

   Contract (index via atlas-3d.js, map-guess via map-hunt.js, live via live.js):
     window.Embed3D.mount(el, opts)  -> handle
     opts = {
       variant: 'home'|'game'|'live'   (el.dataset.variant, default 'home')
       projection: 'pca'|'tsne'|'umap' (el.dataset.projection, default 'pca')
       highlightIds | highlight: [ids] twins / the given player
       onSelect: function(id){}        tap / click on a point
       height: px                      (el.dataset.height, default 420)
       src: url                        (el.dataset.src) data override
       greyscale: bool                 accepted for #165 compatibility; every
                                       variant now draws depth-shaded greys
       dim: [ids]   overlay: [rings]   groups: [{label,color,ids}]
     }
     handle = { setProjection(name), setHighlight(ids), setSelected(id),
                setDim(ids), overlay(rings), setGroups(groups), find(q),
                info(i), snapshot(), destroy() }

   Chrome (all styled by atlas.css, no inline chrome here):
     .embed3d[data-variant] > .embed3d__bar (home only: .seg projection + .embed3d__axis)
       > .embed3d__frame > canvas.embed3d__canvas + .embed3d__state + .embed3d__tip
       > .embed3d__legend (home: none; game: warm/cold keys for guess rings;
                           live: team swatches from setGroups)
       > .embed3d__note
   The game and live variants carry no research chrome: no projection switcher,
   no clustering legend, no clustering-quality note (LAUNCH-AUDIT item 22).

   Colours: read from the page's tokens with getComputedStyle at mount and on
   every prefers-color-scheme change (--void, --void-ink, --void-ink-2,
   --void-accent, --accent, --fg-3, --data-terra). The canvas is the void on
   both themes, so marks on it use --void-accent (atlas.css:33: --accent is
   4.02:1 on the void) and fall back to --accent where a page lacks it.

   Honesty rules (binding): axes are arbitrary units — never semantic labels.
   Each projection is labeled with what it preserves and what it distorts. */
(function (global) {
  'use strict';

  var VARIANTS = { home: 1, game: 1, live: 1 };

  /* What each projection preserves / distorts. Shown in the home note. */
  var PROJ_NOTES = {
    pca: 'PCA shows the widest spread but keeps only ~27% of the differences — nearby dots can mislead.',
    tsne: 't-SNE keeps tight groups together, but gaps between groups mean nothing.',
    umap: 'UMAP keeps tight groups together, but gaps between groups mean nothing.'
  };
  var PROJ_AXIS = {
    pca: 'PCA dim 1–3 (arbitrary units)',
    tsne: 't-SNE dim 1–3 (arbitrary units)',
    umap: 'UMAP dim 1–3 (arbitrary units)'
  };
  function projLabel(name) {
    return name === 'tsne' ? 't-SNE' : String(name).toUpperCase();
  }

  /* Token names read from :root. FALLBACK is used only when a page does not
     load atlas.css (the token reads back empty); the numbers mirror atlas.css
     so a page without the sheet still paints a visible map. */
  var TOKENS = {
    void: '--void', voidInk: '--void-ink', voidInk2: '--void-ink-2',
    voidAccent: '--void-accent', accent: '--accent', fg3: '--fg-3', terra: '--data-terra'
  };
  var FALLBACK = {
    void: [30, 32, 34], voidInk: [216, 220, 216], voidInk2: [167, 176, 188],
    voidAccent: [255, 122, 92], accent: [224, 72, 59], fg3: [110, 110, 102], terra: [160, 90, 56]
  };

  /* The loading sketch (seed: map-guess.html .embed3d-sketch), drawn in
     currentColor so it reads on the void with no colour of its own. */
  var SKETCH_DOTS = [115, 176, 2.2, .41, 154, 107, 3, .66, 135, 86, 2.2, .56, 329, 38, 3, .31,
    185, 197, 3, .37, 282, 40, 2.2, .56, 118, 176, 2.2, .32, 39, 189, 2.2, .41, 333, 203, 2.2, .62,
    243, 208, 2.2, .44, 284, 87, 2.2, .31, 294, 58, 2.2, .39, 349, 183, 2.2, .66, 236, 164, 1.6, .63,
    91, 187, 1.6, .6, 141, 215, 2.2, .32, 167, 104, 3, .34, 319, 63, 2.2, .37, 189, 110, 3, .31,
    266, 53, 3, .56, 109, 34, 2.2, .59, 137, 205, 2.2, .46, 55, 148, 2.2, .37, 182, 37, 1.6, .49,
    39, 153, 1.6, .42, 354, 92, 1.6, .65, 222, 190, 1.6, .5, 321, 207, 2.2, .36, 331, 162, 2.2, .43,
    222, 72, 1.6, .66, 313, 70, 2.2, .35, 57, 189, 1.6, .65, 351, 150, 2.2, .64, 262, 126, 1.6, .46,
    109, 82, 3, .53, 270, 191, 2.2, .61, 46, 34, 3, .4, 330, 205, 3, .51, 331, 144, 1.6, .64,
    363, 99, 2.2, .52, 140, 60, 2.2, .56, 259, 137, 3, .37, 358, 98, 2.2, .45, 185, 78, 1.6, .36];
  function sketchSvg() {
    var s = '<svg class="state__sketch" viewBox="0 0 400 260" aria-hidden="true" focusable="false">' +
      '<rect x="4" y="4" width="392" height="252" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".5"/>';
    var i;
    for (i = 40; i < 400; i += 80) s += '<line x1="' + i + '" y1="8" x2="' + i + '" y2="252" stroke="currentColor" stroke-width=".6" opacity=".15"/>';
    for (i = 52; i < 260; i += 80) s += '<line x1="8" y1="' + i + '" x2="392" y2="' + i + '" stroke="currentColor" stroke-width=".6" opacity=".15"/>';
    s += '<g stroke="currentColor" stroke-width="1.2" stroke-dasharray="5 4" opacity=".7"><line x1="40" y1="226" x2="200" y2="196"/>' +
      '<line x1="40" y1="226" x2="120" y2="120"/><line x1="40" y1="226" x2="300" y2="226"/></g>';
    for (i = 0; i < SKETCH_DOTS.length; i += 4) {
      s += '<circle cx="' + SKETCH_DOTS[i] + '" cy="' + SKETCH_DOTS[i + 1] + '" r="' + SKETCH_DOTS[i + 2] +
        '" fill="currentColor" opacity="' + SKETCH_DOTS[i + 3] + '"/>';
    }
    s += '<path d="M4 22V4h18M378 4h18v18M396 238v18h-18M22 256H4v-18" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
    return s;
  }

  /* "#rgb", "#rrggbb", "#rrggbbaa", "rgb(...)", "rgba(...)" -> [r,g,b] or null */
  function parseColor(str) {
    var s = String(str || '').trim(), m;
    if ((m = /^#([0-9a-f]{3,8})$/i.exec(s))) {
      var h = m[1];
      if (h.length === 3 || h.length === 4) {
        return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
      }
      if (h.length === 6 || h.length === 8) {
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      }
      return null;
    }
    if ((m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s))) {
      return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])];
    }
    return null;
  }
  function rgb(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  function mix(a, b, t) {
    return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
  }

  function cssVar(name) {
    try {
      if (typeof global.getComputedStyle !== 'function' || !global.document) return '';
      return String(global.getComputedStyle(global.document.documentElement).getPropertyValue(name) || '').trim();
    } catch (e) { return ''; }
  }

  /* Read every token once; returns {name: [r,g,b]} plus .css strings. */
  function readTokens() {
    var out = { rgb: {}, css: {} };
    Object.keys(TOKENS).forEach(function (k) {
      var c = parseColor(cssVar(TOKENS[k]));
      out.rgb[k] = c || FALLBACK[k];
      out.css[k] = rgb(out.rgb[k]);
    });
    /* the mark colour on the void: --void-accent, else --accent */
    var va = parseColor(cssVar(TOKENS.voidAccent));
    out.css.mark = va ? rgb(va) : out.css.accent;
    /* 16 depth buckets from just above the void to the void's ink (#165's
       40..220 grey ramp, now theme-driven) */
    out.ramp = [];
    for (var b = 0; b < 16; b++) out.ramp.push(rgb(mix(out.rgb.void, out.rgb.voidInk, 0.06 + b / 15 * 0.94)));
    return out;
  }

  /* A colour given by a caller: "var(--x)" resolves through the page tokens
     (canvas cannot read var()); anything else passes through. */
  function resolveColor(c, fallback) {
    var s = String(c == null ? '' : c).trim();
    var m = /^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/.exec(s);
    if (m) s = cssVar(m[1]) || (m[2] || '').trim();
    return s || fallback;
  }

  function el(tag, cls) {
    var n = global.document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function mount(host, opts) {
    opts = opts || {};
    var ds = host.dataset || {};
    if (host.__embed3d && typeof host.__embed3d.destroy === 'function') {
      try { host.__embed3d.destroy(); } catch (e) { /* stale handle */ }
    }
    var variant = String(opts.variant || ds.variant || 'home');
    if (!VARIANTS[variant]) variant = 'home';
    var projection = opts.projection || ds.projection || 'pca';
    // atlas.css floors .embed3d__canvas at 320px; a smaller buffer would stretch and mis-pick
    var height = Math.max(320, +opts.height || parseInt(ds.height, 10) || 420);
    var onSelect = typeof opts.onSelect === 'function' ? opts.onSelect : null;
    var hasMM = typeof global.matchMedia === 'function';
    var reduceMotion = hasMM && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    /* #165 semantics, now the one atlas look: depth-shaded greys, selection =
       mark colour + ring, twins = mark dots, the field dims on selection. */
    var greyscale = opts.greyscale !== false;
    var coarsePointer = hasMM && global.matchMedia('(pointer: coarse)').matches;
    var pickRadius = coarsePointer ? 28 : 18;
    var COL = readTokens();

    /* ---- DOM ---- */
    host.innerHTML = '';
    var wrap = el('div', 'embed3d');
    wrap.setAttribute('data-variant', variant);
    var bar = el('div', 'embed3d__bar');
    var frameEl = el('div', 'embed3d__frame');
    var canvas = el('canvas', 'embed3d__canvas');
    canvas.setAttribute('aria-label', 'Player map: drag or use the arrow keys to turn it, + and − to zoom');
    var stateEl = el('div', 'embed3d__state embed3d__state--loading');
    var tip = el('div', 'embed3d__tip');
    tip.setAttribute('aria-hidden', 'true');
    var legend = el('div', 'embed3d__legend');
    legend.hidden = true;
    var note = el('p', 'embed3d__note');
    if (variant === 'home') wrap.appendChild(bar);
    frameEl.appendChild(canvas);
    frameEl.appendChild(stateEl);
    frameEl.appendChild(tip);
    wrap.appendChild(frameEl);
    wrap.appendChild(legend);
    wrap.appendChild(note);
    host.appendChild(wrap);
    var ctx = canvas.getContext('2d');

    /* ---- state ---- */
    var state = {
      loaded: false, n: 0, pos: null, /* pos[proj] = Float32Array(n*3) */
      names: null, seasons: null, teams: null, clusters: null, idToIdx: null,
      yaw: 0.6, pitch: 0.45, dist: 3.2,
      proj: projection, highlight: new Set(), selectedId: null,
      dim: null, rings: [], groups: [], groupOf: null,
      autoRotate: !reduceMotion, idleTimer: 0, raf: 0,
      sx: null, sy: null, sz: null, /* screen coords of last frame */
      error: null, destroyed: false
    };
    setHighlight(opts.highlightIds || opts.highlight);
    if (opts.dim) setDim(opts.dim);
    if (opts.overlay) overlay(opts.overlay);
    if (opts.groups) setGroups(opts.groups);
    renderNote();
    renderLegend();

    /* ---- loading / error ---- */
    function showLoading() {
      stateEl.className = 'embed3d__state embed3d__state--loading';
      stateEl.removeAttribute('role');
      stateEl.innerHTML = sketchSvg() +
        '<p><span class="state__label">Loading the map</span><br>12,966 player-seasons, placed by how they played.</p>';
      stateEl.hidden = false;
    }
    function showError(msg) {
      state.error = msg;
      stateEl.className = 'embed3d__state embed3d__state--error';
      stateEl.setAttribute('role', 'alert');
      stateEl.innerHTML = '';
      var p = el('p');
      var b = el('b');
      b.textContent = 'The map could not load.';
      p.appendChild(b);
      p.appendChild(global.document.createTextNode(' ' + msg));
      var retry = el('button', 'btn');
      retry.type = 'button';
      retry.textContent = 'Try again';
      retry.addEventListener('click', function () { load(); });
      stateEl.appendChild(p);
      stateEl.appendChild(retry);
      stateEl.hidden = false;
    }

    /* ---- data load ---- */
    /* The literal fetch URL below is stamped ?v=<sha8> by scripts/stamp_assets.py
       (year-long immutable cache on assets/*.json). The dynamic branch is for
       page overrides via opts.src / el.dataset.src. */
    var dataUrl = opts.src || ds.src || '';
    function load() {
      if (state.destroyed) return;
      state.error = null;
      showLoading();
      var req;
      try {
        req = dataUrl
          ? fetch(dataUrl, { cache: 'force-cache' })
          : fetch('assets/projections/embed3d.json?v=fce603a1', { cache: 'force-cache' });
      } catch (e) { req = Promise.reject(e); }
      return req.then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + (dataUrl || 'assets/projections/embed3d.json'));
        return r.json();
      }).then(function (doc) {
        if (state.destroyed) return;
        ingest(doc);
      }).catch(function (err) {
        if (state.destroyed) return;
        showError('The projection data could not be loaded (' + String(err && err.message || err) +
          '). Nothing is hidden — the file is missing or unreadable, so there is no map to show.');
      });
    }

    function ingest(doc) {
      var meta = doc && doc.meta;
      if (!meta || meta.format !== 4 || !meta.projections) {
        showError('The projection data is malformed (missing v4 points or meta).');
        return;
      }
      var n = meta.n;
      var avail = meta.projections;
      var i, k, a;
      /* V4 columnar format (see meta.fields): doc.n = delta-encoded indices
         into meta.names; doc.m = packed per-point int
           season = season_base + (m >> 9),
           team   = meta.teams[((m >> 3) & 63) - 1]  (-1 => unknown),
           cluster = m & 7;
         doc.pca/tsne/umap = flat int arrays, 3 per point in row order,
         int millis of the centered, unit-normalized projection
         (divide by 1000; meta.normalized=true so no re-center below). */
      var names = meta.names || [];
      var teams = meta.teams || [];
      var sBase = meta.season_base || 1996;
      var dn = doc.n, mc = doc.m;
      if (!dn || !mc || dn.length !== n || mc.length !== n) {
        showError('The projection data is malformed (column length mismatch).');
        return;
      }
      var col = {};
      for (k = 0; k < avail.length; k++) {
        col[avail[k]] = doc[avail[k]];
        if (!col[avail[k]] || col[avail[k]].length !== n * 3) {
          showError('The projection data is malformed (coordinate column "' + avail[k] + '" missing or short).');
          return;
        }
      }
      state.n = n;
      if (avail.indexOf(state.proj) < 0) state.proj = avail[0];
      state.pos = {};
      for (k = 0; k < avail.length; k++) state.pos[avail[k]] = new Float32Array(n * 3);
      state.names = new Array(n);
      state.seasons = new Array(n);
      state.teams = new Array(n);
      state.clusters = new Uint8Array(n); /* still decoded: info(i).cluster */
      state.idToIdx = new Map();
      var cx = {}, cy = {}, cz = {};
      for (k = 0; k < avail.length; k++) { cx[avail[k]] = 0; cy[avail[k]] = 0; cz[avail[k]] = 0; }
      var nameIdx = 0, code, ti, arr, o, inv = 1 / 1000, y0;
      for (i = 0; i < n; i++) {
        nameIdx += dn[i];
        state.names[i] = names[nameIdx] || ('#' + i);
        code = mc[i];
        y0 = sBase + (code >> 9);
        state.seasons[i] = y0 + '-' + String(y0 + 1).slice(-2);
        ti = ((code >> 3) & 63) - 1;
        state.teams[i] = ti >= 0 ? (teams[ti] || '') : '';
        state.clusters[i] = code & 7;
        state.idToIdx.set(i, i); /* id IS the array index (meta.id) */
        for (k = 0; k < avail.length; k++) {
          a = avail[k]; arr = col[a]; o = i * 3;
          var x = arr[o] * inv, y = arr[o + 1] * inv, z = arr[o + 2] * inv;
          state.pos[a][o] = x; state.pos[a][o + 1] = y; state.pos[a][o + 2] = z;
          cx[a] += x; cy[a] += y; cz[a] += z;
        }
      }
      /* center + normalize each projection to unit max-radius. V4 data arrives
         already centered + unit-normalized (meta.normalized), so this is
         skipped: re-centering rounded data would double the quantization
         error. Kept for any future non-normalized format. */
      if (!meta.normalized) {
        for (k = 0; k < avail.length; k++) {
          a = avail[k]; arr = state.pos[a];
          var mx = cx[a] / n, my = cy[a] / n, mz = cz[a] / n, rmax = 0;
          for (i = 0; i < n; i++) {
            o = i * 3;
            arr[o] -= mx; arr[o + 1] -= my; arr[o + 2] -= mz;
            var r = Math.sqrt(arr[o] * arr[o] + arr[o + 1] * arr[o + 1] + arr[o + 2] * arr[o + 2]);
            if (r > rmax) rmax = r;
          }
          var s = rmax > 0 ? 1 / rmax : 1;
          for (i = 0; i < n * 3; i++) arr[i] *= s;
        }
      }
      state.sx = new Float32Array(n);
      state.sy = new Float32Array(n);
      state.sz = new Float32Array(n);
      /* Panel S7: reusable index array for per-frame back-to-front depth sort */
      state.order = new Array(n);
      for (i = 0; i < n; i++) state.order[i] = i;
      state.loaded = true;
      rebuildGroupIndex();
      if (variant === 'home') buildSwitcher(avail);
      renderNote();
      stateEl.hidden = true;
      stateEl.innerHTML = '';
      resize();
      if (!state.raf) state.raf = requestAnimationFrame(frame);
    }

    /* ---- projection switcher (home only) ---- */
    function buildSwitcher(avail) {
      bar.innerHTML = '';
      var label = el('span', 'label');
      label.textContent = 'Projection';
      bar.appendChild(label);
      var seg = el('div', 'seg');
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', 'Projection');
      state.buttons = {};
      avail.forEach(function (name) {
        var b = el('button');
        b.type = 'button';
        b.textContent = projLabel(name);
        b.setAttribute('aria-pressed', name === state.proj ? 'true' : 'false');
        b.addEventListener('click', function () { setProjection(name); });
        seg.appendChild(b);
        state.buttons[name] = b;
      });
      bar.appendChild(seg);
      var axis = el('span', 'embed3d__axis');
      axis.textContent = PROJ_AXIS[state.proj] || '';
      bar.appendChild(axis);
      state.axisLabel = axis;
    }

    function renderNote() {
      var text;
      if (variant === 'home') {
        /* Panel S10: plain words, with the number. #165 greyscale wording. */
        note.innerHTML = '<b>' + projLabel(state.proj) + '</b> — ' + (PROJ_NOTES[state.proj] || '') +
          ' Points are shaded by depth — nearer dots are brighter. Color appears only on your selection and its twins.' +
          ' Each dot is one player-season. Axes are arbitrary units.';
        return;
      }
      if (variant === 'game') {
        text = 'Each dot is one player-season; nearer dots are brighter. Drag to turn the map, tap a dot to pick it.';
      } else {
        text = state.groups.length
          ? 'Each dot is one player-season. Colored dots are the players in this game.'
          : 'Each dot is one player-season; nearer dots are brighter.';
      }
      note.textContent = text;
    }

    function key(label, color, ring) {
      var k = el('span', 'embed3d__key');
      var sw = el('span', 'embed3d__swatch');
      /* data colour (a team's, or a token resolved above), not chrome */
      if (ring) { sw.style.border = '2px solid ' + color; } else { sw.style.background = color; }
      k.appendChild(sw);
      k.appendChild(global.document.createTextNode(label));
      return k;
    }
    function renderLegend() {
      legend.innerHTML = '';
      var keys = [];
      if (state.groups.length) {
        state.groups.forEach(function (g) { keys.push(key(g.label, g.css)); });
      }
      if (variant === 'game' && state.rings.length) {
        var kinds = {};
        state.rings.forEach(function (r) { kinds[r.kind] = true; });
        if (kinds.exact) keys.push(key('Found it', COL.css.mark, true));
        if (kinds.warm) keys.push(key('Warmer guess', COL.css.terra, true));
        if (kinds.cold) keys.push(key('Colder guess', COL.css.voidInk2, true));
      }
      keys.forEach(function (k) { legend.appendChild(k); });
      legend.hidden = !keys.length;
      if (keys.length) {
        legend.setAttribute('aria-label', variant === 'live' ? 'Team colors' : 'Map key');
      }
    }

    function setProjection(name) {
      if (!state.pos || !state.pos[name]) return;
      state.proj = name;
      if (state.buttons) {
        Object.keys(state.buttons).forEach(function (k) {
          state.buttons[k].setAttribute('aria-pressed', k === name ? 'true' : 'false');
        });
        if (state.axisLabel) state.axisLabel.textContent = PROJ_AXIS[name] || '';
      }
      renderNote();
    }

    function setHighlight(ids) {
      state.highlight = new Set(ids || []);
    }

    /* C1.1: the selected point, styled apart from the twin highlights. */
    function setSelected(id) {
      state.selectedId = (id == null || id < 0) ? null : id;
    }

    /* Fade every point outside `ids` (Twenty Questions' remaining candidates).
       null/undefined clears; an empty array fades everything. */
    function setDim(ids) {
      state.dim = ids == null ? null : new Set(ids);
    }

    /* Guess rings: [{id, kind:'warm'|'cold'|'exact', r:px, color}]; [] clears. */
    function overlay(rings) {
      state.rings = (rings || []).filter(function (r) { return r && r.id != null; }).map(function (r) {
        var kind = r.kind === 'warm' || r.kind === 'cold' || r.kind === 'exact' ? r.kind : 'warm';
        return { id: r.id, kind: kind, r: +r.r > 0 ? +r.r : 10, color: r.color || null };
      });
      renderLegend();
    }
    function ringColor(r) {
      if (r.color) return resolveColor(r.color, COL.css.mark);
      return r.kind === 'exact' ? COL.css.mark : r.kind === 'cold' ? COL.css.voidInk2 : COL.css.terra;
    }

    /* Colour groups: [{label, color, ids}]; [] clears. A point in two groups
       takes the first. Up to 254 groups. */
    function setGroups(groups) {
      state.groups = (groups || []).slice(0, 254).map(function (g, gi) {
        var fallback = [COL.css.mark, COL.css.terra, COL.css.voidInk2, COL.css.voidInk][gi % 4];
        return {
          label: String(g && g.label != null ? g.label : 'Group ' + (gi + 1)),
          color: g && g.color, css: resolveColor(g && g.color, fallback),
          ids: (g && g.ids) || []
        };
      });
      rebuildGroupIndex();
      renderLegend();
      renderNote();
    }
    function rebuildGroupIndex() {
      if (!state.loaded) return;
      var go = new Uint8Array(state.n).fill(255);
      for (var g = state.groups.length - 1; g >= 0; g--) {
        state.groups[g].ids.forEach(function (id) {
          var i = state.idToIdx.get(id);
          if (i !== undefined) go[i] = g;
        });
      }
      state.groupOf = state.groups.length ? go : null;
    }

    /* Ids matching {team, season} (season as '2024-25' or its start year). */
    function find(q) {
      q = q || {};
      if (!state.loaded) return [];
      var out = [], team = q.team ? String(q.team).toUpperCase() : null;
      var season = q.season != null ? String(q.season) : null;
      for (var i = 0; i < state.n; i++) {
        if (team && String(state.teams[i]).toUpperCase() !== team) continue;
        if (season && state.seasons[i] !== season && state.seasons[i].slice(0, 4) !== season) continue;
        out.push(i);
      }
      return out;
    }

    /* ---- theme ---- */
    function retheme() {
      COL = readTokens();
      state.groups.forEach(function (g, gi) {
        g.css = resolveColor(g.color, [COL.css.mark, COL.css.terra, COL.css.voidInk2, COL.css.voidInk][gi % 4]);
      });
      renderLegend();
    }
    var schemeMQ = hasMM ? global.matchMedia('(prefers-color-scheme: dark)') : null;
    if (schemeMQ) {
      if (schemeMQ.addEventListener) schemeMQ.addEventListener('change', retheme);
      else if (schemeMQ.addListener) schemeMQ.addListener(retheme);
    }

    /* ---- sizing: the buffer's aspect sets the displayed height
       (.embed3d__canvas is width:100%; height:auto) ---- */
    var dpr = 1;
    function resize() {
      var w = wrap.clientWidth || frameEl.clientWidth || 1;
      dpr = Math.min(2, global.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(height * dpr);
    }
    resize();
    var ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(function () { if (!state.destroyed) resize(); });
      ro.observe(wrap);
    }
    global.addEventListener('resize', resize);

    /* ---- interaction: drag rotate, wheel/pinch zoom, click select ---- */
    var pointers = new Map();
    var pinchD0 = 0, pinchDist0 = 1;
    var downX = 0, downY = 0, moved = false;
    function pauseRotate(resume) {
      state.autoRotate = false;
      if (state.idleTimer) clearTimeout(state.idleTimer);
      state.idleTimer = 0;
      if (resume && !reduceMotion) state.idleTimer = setTimeout(function () { state.autoRotate = true; }, 3000);
    }

    /* Panel N5: keyboard operation — arrows rotate, +/− zoom. */
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown');
    canvas.addEventListener('keydown', function (e) {
      var step = 0.12, handled = true;
      if (e.key === 'ArrowLeft') state.yaw -= step;
      else if (e.key === 'ArrowRight') state.yaw += step;
      else if (e.key === 'ArrowUp') state.pitch = Math.max(-1.4, Math.min(1.4, state.pitch - step));
      else if (e.key === 'ArrowDown') state.pitch = Math.max(-1.4, Math.min(1.4, state.pitch + step));
      else if (e.key === '+' || e.key === '=') state.dist = Math.max(1.6, state.dist * 0.9);
      else if (e.key === '-' || e.key === '_') state.dist = Math.min(8, state.dist * 1.1);
      else handled = false;
      if (handled) { e.preventDefault(); pauseRotate(false); }
    });

    canvas.addEventListener('pointerdown', function (e) {
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        downX = e.clientX; downY = e.clientY; moved = false;
      } else if (pointers.size === 2) {
        var ps = Array.from(pointers.values());
        pinchDist0 = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
        pinchD0 = state.dist;
      }
      pauseRotate(false);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!pointers.has(e.pointerId)) { hover(e); return; }
      var prev = pointers.get(e.pointerId);
      var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 4) moved = true;
        state.yaw += dx * 0.005;
        state.pitch = Math.max(-1.4, Math.min(1.4, state.pitch + dy * 0.005));
      } else if (pointers.size === 2) {
        var ps = Array.from(pointers.values());
        var d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
        if (d > 0) state.dist = Math.max(1.6, Math.min(8, pinchD0 * pinchDist0 / d));
      }
    });
    function endPointer(e) {
      pointers.delete(e.pointerId);
      if (pointers.size === 0) {
        if (!moved && onSelect && state.loaded) {
          var idx = pick(e);
          if (idx >= 0) onSelect(idx); /* id IS the array index (see meta.id) */
        }
        pauseRotate(true);
      }
    }
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      state.dist = Math.max(1.6, Math.min(8, state.dist * (1 + e.deltaY * 0.001)));
      pauseRotate(true);
    }, { passive: false });

    function projectAll() {
      /* rotate + perspective for every point — typed arrays, no allocation */
      var arr = state.pos[state.proj];
      var cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
      var cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
      var w = canvas.width / dpr, h = canvas.height / dpr;
      var scale = Math.min(w, h) * 0.42;
      var ox = w / 2, oy = h / 2, d = state.dist;
      var n = state.n, sx = state.sx, syy = state.sy, sz = state.sz;
      for (var i = 0; i < n; i++) {
        var o = i * 3;
        var x = arr[o], y = arr[o + 1], z = arr[o + 2];
        var x1 = x * cy - z * sy, z1 = x * sy + z * cy;
        var y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
        var persp = d / (d + z2 + 1.6);
        sx[i] = ox + x1 * scale * persp;
        syy[i] = oy - y1 * scale * persp;
        sz[i] = persp;
      }
    }

    function pick(e) {
      var r = canvas.getBoundingClientRect();
      var mx = e.clientX - r.left, my = e.clientY - r.top;
      var best = -1, bestD = pickRadius * pickRadius;
      for (var i = 0; i < state.n; i++) {
        var dx = state.sx[i] - mx, dy = state.sy[i] - my;
        var q = dx * dx + dy * dy;
        if (q < bestD) { bestD = q; best = i; }
      }
      return best;
    }

    /* tip and cursor are geometry/state, toggled per event (atlas.css owns the look) */
    function hover(e) {
      if (!state.loaded || !onSelect) { tip.style.display = ''; return; }
      var idx = pick(e);
      if (idx < 0) { tip.style.display = ''; canvas.style.cursor = ''; return; }
      canvas.style.cursor = 'pointer';
      var r = canvas.getBoundingClientRect();
      tip.textContent = state.names[idx] + ' · ' + state.seasons[idx] +
        (state.teams[idx] ? ' · ' + state.teams[idx] : '');
      tip.style.display = 'block';
      tip.style.left = (e.clientX - r.left + 14) + 'px';
      tip.style.top = (e.clientY - r.top - 10) + 'px';
    }

    function dot(x, y, size, ring) {
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, 6.2832);
      ctx.fill();
      if (ring) {
        ctx.beginPath();
        ctx.arc(x, y, size / 2 + 3, 0, 6.2832);
        ctx.stroke();
      }
    }

    /* ---- frame loop: one depth-sorted pass, fillStyle batched by bucket ---- */
    var lastT = 0;
    function frame(t) {
      state.raf = 0;
      if (state.destroyed) return;
      var dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
      lastT = t;
      if (state.autoRotate && state.loaded) state.yaw += dt * 0.12;
      if (state.loaded) draw();
      state.raf = requestAnimationFrame(frame);
    }
    function draw() {
      projectAll();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      var sx = state.sx, syy = state.sy, sz = state.sz, n = state.n;
      var ramp = COL.ramp, groupOf = state.groupOf, groups = state.groups, dim = state.dim;
      /* Panel S7: single back-to-front pass — perceived density is real depth.
         sz is perspective scale: smaller = farther, so ascending = far first. */
      var order = state.order;
      order.sort(function (a, b) { return sz[a] - sz[b]; });
      var selActive = state.selectedId != null;
      var lastKey = -1;
      for (var k = 0; k < n; k++) {
        var i = order[k];
        var depth = sz[i];
        var size = 1 + depth * 1.6;
        var alpha = 0.35 + depth * 0.55;
        var g = groupOf ? groupOf[i] : 255;
        var keyId;
        if (g !== 255) {
          keyId = 100 + g;
          size += 0.8;
          alpha = Math.min(1, alpha + 0.2);
        } else {
          keyId = depth > 1 ? 15 : (depth * 16) | 0;
        }
        if (keyId !== lastKey) {
          ctx.fillStyle = g !== 255 ? groups[g].css : ramp[keyId];
          lastKey = keyId;
        }
        if (greyscale && selActive && i !== state.selectedId && !state.highlight.has(i)) alpha *= 0.35;
        if (dim && !dim.has(i)) alpha *= 0.15;
        ctx.globalAlpha = alpha;
        ctx.fillRect(sx[i] - size / 2, syy[i] - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      /* highlights: larger dots; the selection gets a ring */
      var hl = greyscale ? COL.css.mark : COL.css.voidInk;
      if (state.highlight.size || selActive) {
        ctx.strokeStyle = hl;
        ctx.fillStyle = hl;
        ctx.lineWidth = 1.5;
        state.highlight.forEach(function (id) {
          if (id === state.selectedId) return;
          var j = state.idToIdx.get(id);
          if (j === undefined) return;
          ctx.fillStyle = hl;
          dot(sx[j], syy[j], 3 + sz[j] * 2.5, !greyscale);
        });
        if (selActive) {
          var si = state.idToIdx.get(state.selectedId);
          if (si !== undefined) {
            ctx.fillStyle = hl;
            ctx.strokeStyle = hl;
            dot(sx[si], syy[si], 3 + sz[si] * 2.5, true);
          }
        }
      }
      /* guess rings */
      if (state.rings.length) {
        ctx.lineWidth = 2;
        state.rings.forEach(function (r) {
          var j = state.idToIdx.get(r.id);
          if (j === undefined) return;
          var c = ringColor(r);
          ctx.strokeStyle = c;
          ctx.beginPath();
          ctx.arc(sx[j], syy[j], r.r * (0.6 + 0.4 * sz[j]), 0, 6.2832);
          ctx.stroke();
          if (r.kind === 'exact') { ctx.fillStyle = c; dot(sx[j], syy[j], 3 + sz[j] * 2.5, false); }
        });
      }
    }

    function destroy() {
      state.destroyed = true;
      if (state.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(state.raf);
      state.raf = 0;
      global.removeEventListener('resize', resize);
      if (ro) ro.disconnect();
      if (schemeMQ) {
        if (schemeMQ.removeEventListener) schemeMQ.removeEventListener('change', retheme);
        else if (schemeMQ.removeListener) schemeMQ.removeListener(retheme);
      }
      if (state.idleTimer) clearTimeout(state.idleTimer);
      if (host.__embed3d === handle) host.__embed3d = null;
      host.innerHTML = '';
    }

    function info(i) {
      if (!state.loaded || i < 0 || i >= state.names.length) return null;
      return { name: state.names[i], season: state.seasons[i], team: state.teams[i], cluster: state.clusters[i] };
    }

    /* A read-only view of the handle's state (tests, debugging). */
    function snapshot() {
      return {
        variant: variant, projection: state.proj, loaded: state.loaded, error: state.error,
        greyscale: greyscale, autoRotate: state.autoRotate, height: height,
        highlight: Array.from(state.highlight), selected: state.selectedId,
        dim: state.dim ? Array.from(state.dim) : null,
        rings: state.rings.map(function (r) { return { id: r.id, kind: r.kind, r: r.r, color: ringColor(r) }; }),
        groups: state.groups.map(function (g) { return { label: g.label, color: g.css, n: g.ids.length }; }),
        colors: { mark: COL.css.mark, void: COL.css.void, voidInk: COL.css.voidInk, voidInk2: COL.css.voidInk2,
          accent: COL.css.accent, fg3: COL.css.fg3, terra: COL.css.terra, ramp: COL.ramp.slice() }
      };
    }

    var handle = {
      setProjection: setProjection, setHighlight: setHighlight, setSelected: setSelected,
      setDim: setDim, overlay: overlay, setGroups: setGroups, find: find,
      info: info, snapshot: snapshot, destroy: destroy
    };
    host.__embed3d = handle;
    load();
    return handle;
  }

  global.Embed3D = { mount: mount, parseColor: parseColor };
})(typeof window !== 'undefined' ? window : this);

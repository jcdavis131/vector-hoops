/* Vector Hoops 3D Embedding Map — hand-rolled canvas 3D point renderer.
   Zero dependencies (no Three.js). Data is precomputed at build time
   (scripts/build_embed3d.py) and served as assets/projections/embed3d.json.

   Contract (Workers B and C depend on it — do not change):
     window.Embed3D.mount(el, opts)
     opts = { projection: 'pca'|'tsne'|'umap', highlightIds: [ids],
              onSelect: function(id){}, height: px, src: url }
     - el.dataset.projection is the default when opts.projection is absent.
     - Returns { setProjection(name), setHighlight(ids), destroy() }.

   Honesty rules (binding): axes are arbitrary units — never semantic labels.
   Each projection is labeled with what it preserves and what it distorts. */
(function (global) {
  'use strict';

  /* Okabe-Ito CVD-safe categorical palette (Panel S6) */
  var CLUSTER_COLORS = [
    '#0072B2', '#D55E00', '#009E73', '#CC79A7',
    '#56B4E9', '#E69F00', '#000000', '#F0E442'
  ];

  /* What each projection preserves / distorts. Shown in the UI. */
  var PROJ_NOTES = {
    pca: 'PCA keeps the big-picture spread of the data, but near neighbors can be scrambled.',
    tsne: 't-SNE keeps local neighborhoods together; distances between far-apart groups are NOT meaningful.',
    umap: 'UMAP keeps local neighborhoods together; global distances are NOT meaningful.'
  };
  var PROJ_AXIS = {
    pca: 'PCA dim 1\u20133 (arbitrary units)',
    tsne: 't-SNE dim 1\u20133 (arbitrary units)',
    umap: 'UMAP dim 1\u20133 (arbitrary units)'
  };

  function fail(el, msg) {
    el.innerHTML = '<div class="embed3d-error" role="alert" style="padding:24px;' +
      'font:14px/1.5 system-ui,sans-serif;color:#8a2b2b;background:#fdf3f3;' +
      'border:1px solid #e5c1c1;border-radius:8px;">' +
      '<strong>3D map unavailable.</strong><br>' + msg + '</div>';
  }

  function mount(el, opts) {
    opts = opts || {};
    var projection = opts.projection || el.dataset.projection || 'pca';
    var height = opts.height || parseInt(el.dataset.height, 10) || 420;
    var onSelect = typeof opts.onSelect === 'function' ? opts.onSelect : null;
    var reduceMotion = (typeof global.matchMedia === 'function') &&
      global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---- DOM ---- */
    el.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'embed3d';
    wrap.style.cssText = 'position:relative;width:100%;';
    var bar = document.createElement('div');
    bar.className = 'embed3d-bar';
    bar.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;' +
      'margin-bottom:8px;font:13px system-ui,sans-serif;';
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:' + height +
      'px;touch-action:pan-y;cursor:grab;border-radius:8px;background:#151619;';
    var note = document.createElement('div');
    note.className = 'embed3d-note';
    note.style.cssText = 'margin-top:6px;font:12px/1.5 system-ui,sans-serif;' +
      'color:#8b8578;max-width:70ch;';
    /* Panel S3: color legend. These are this map's own k-means groups — NOT the
       named archetypes used on other plates (different clustering build). */
    var legend = document.createElement('div');
    legend.className = 'embed3d-legend';
    legend.style.cssText = 'margin-top:6px;display:flex;flex-wrap:wrap;gap:4px 10px;' +
      'font:11px/1.6 system-ui,sans-serif;color:#8b8578;align-items:center;';
    legend.setAttribute('aria-label', 'Map color legend: 8 algorithm-found groups');
    var legendHtml = '<span style="color:#b9b3a6">Colors = 8 k-means groups on the 64-d embeddings (this map\u2019s build; loose groups, not positions or eras):</span>';
    for (var li = 0; li < 8; li++) {
      legendHtml += '<span style="display:inline-flex;align-items:center;gap:4px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' +
        CLUSTER_COLORS[li] + '"></span>Group ' + (li + 1) + '</span>';
    }
    legend.innerHTML = legendHtml;
    var tip = document.createElement('div');
    tip.style.cssText = 'position:absolute;pointer-events:none;display:none;' +
      'background:rgba(20,21,23,.92);color:#f9f6f0;font:12px/1.4 system-ui,sans-serif;' +
      'padding:6px 9px;border-radius:6px;white-space:nowrap;z-index:3;';
    wrap.appendChild(bar);
    wrap.appendChild(canvas);
    wrap.appendChild(note);
    wrap.appendChild(legend);
    wrap.appendChild(tip);
    el.appendChild(wrap);
    var ctx = canvas.getContext('2d');

    /* ---- state ---- */
    var state = {
      loaded: false, n: 0, pos: null, /* pos[proj] = Float32Array(n*3) */
      names: null, seasons: null, teams: null, clusters: null,
      byCluster: null, idToIdx: null,
      yaw: 0.6, pitch: 0.45, dist: 3.2,
      proj: projection, highlight: new Set(),
      autoRotate: !reduceMotion, lastTouch: 0, idleTimer: 0,
      sx: null, sy: null, sz: null, /* screen coords of last frame */
      destroyed: false
    };
    if (opts.highlightIds) setHighlight(opts.highlightIds);

    /* ---- data load ---- */
    /* The literal fetch URL below is stamped ?v=<sha8> by scripts/stamp_assets.py
       (year-long immutable cache on assets/*.json). The dynamic branch is for
       Worker B/C overrides via opts.src / el.dataset.src. */
    var dataUrl = opts.src || el.dataset.src;
    var req = dataUrl
      ? fetch(dataUrl, { cache: 'force-cache' })
      : fetch('assets/projections/embed3d.json?v=2d0c151f', { cache: 'force-cache' });
    req.then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + src);
      return r.json();
    }).then(function (doc) {
      if (state.destroyed) return;
      ingest(doc);
    }).catch(function (err) {
      fail(el, 'The projection data could not be loaded (' +
        String(err && err.message || err) + '). Nothing is hidden \u2014 the file ' +
        'is missing or unreadable, so there is no map to show.');
    });

    function ingest(doc) {
      var pts = doc && doc.points;
      var meta = doc && doc.meta;
      if (!pts || !pts.length || !meta || !meta.projections) {
        fail(el, 'The projection data is malformed (missing points or meta).');
        return;
      }
      var n = pts.length;
      state.n = n;
      var avail = meta.projections;
      if (avail.indexOf(state.proj) < 0) state.proj = avail[0];
      state.pos = {};
      var has = {};
      var p, i, k, a;
      for (k = 0; k < avail.length; k++) {
        has[avail[k]] = true;
        state.pos[avail[k]] = new Float32Array(n * 3);
      }
      state.names = new Array(n);
      state.seasons = new Array(n);
      state.teams = new Array(n);
      state.clusters = new Uint8Array(n);
      /* V3 compact format (see meta.fields): n=meta.names idx, s=season start
         year, t=team, c=cluster, coords int millis. */
      var names = meta.names || [];
      state.idToIdx = new Map();
      function seasonStr(y) {
        var y2 = String(y + 1).slice(-2);
        return y + '-' + y2;
      }
      var cx = {}, cy = {}, cz = {};
      for (k = 0; k < avail.length; k++) { cx[avail[k]] = 0; cy[avail[k]] = 0; cz[avail[k]] = 0; }
      for (i = 0; i < n; i++) {
        p = pts[i];
        state.names[i] = names[p.n] || ('#' + i);
        state.seasons[i] = seasonStr(p.s);
        state.teams[i] = p.t || ''; state.clusters[i] = p.c | 0;
        state.idToIdx.set(i, i); /* id IS the array index (meta.id) */
        for (k = 0; k < avail.length; k++) {
          a = avail[k]; var v = p[a]; if (!v) continue;
          var o = i * 3;
          state.pos[a][o] = v[0] / 1000; state.pos[a][o + 1] = v[1] / 1000; state.pos[a][o + 2] = v[2] / 1000;
          cx[a] += v[0] / 1000; cy[a] += v[1] / 1000; cz[a] += v[2] / 1000;
        }
      }
      /* center + normalize each projection to unit max-radius */
      for (k = 0; k < avail.length; k++) {
        a = avail[k]; var arr = state.pos[a];
        var mx = cx[a] / n, my = cy[a] / n, mz = cz[a] / n, rmax = 0;
        for (i = 0; i < n; i++) {
          var o = i * 3;
          arr[o] -= mx; arr[o + 1] -= my; arr[o + 2] -= mz;
          var r = Math.sqrt(arr[o] * arr[o] + arr[o + 1] * arr[o + 1] + arr[o + 2] * arr[o + 2]);
          if (r > rmax) rmax = r;
        }
        var s = rmax > 0 ? 1 / rmax : 1;
        for (i = 0; i < n * 3; i++) arr[i] *= s;
      }
      /* per-cluster index lists for single-pass batched draws */
      state.byCluster = [];
      var counts = new Array(8).fill(0);
      for (i = 0; i < n; i++) counts[state.clusters[i] % 8]++;
      for (k = 0; k < 8; k++) state.byCluster.push(new Uint32Array(counts[k]));
      var fill = new Array(8).fill(0);
      for (i = 0; i < n; i++) {
        var c = state.clusters[i] % 8;
        state.byCluster[c][fill[c]++] = i;
      }
      state.sx = new Float32Array(n);
      state.sy = new Float32Array(n);
      state.sz = new Float32Array(n);
      /* Panel S7: reusable index array for per-frame back-to-front depth sort */
      state.order = new Array(n);
      for (i = 0; i < n; i++) state.order[i] = i;
      buildSwitcher(avail);
      updateNote();
      state.loaded = true;
      resize();
      requestAnimationFrame(frame);
    }

    /* ---- projection switcher ---- */
    function buildSwitcher(avail) {
      bar.innerHTML = '';
      var label = document.createElement('span');
      label.textContent = 'Projection:';
      label.style.color = '#8b8578';
      bar.appendChild(label);
      state.buttons = {};
      avail.forEach(function (name) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = name.toUpperCase().replace('TSNE', 't-SNE').replace('UMAP', 'UMAP').replace('PCA', 'PCA');
        b.setAttribute('aria-pressed', name === state.proj ? 'true' : 'false');
        b.style.cssText = 'font:13px system-ui,sans-serif;padding:5px 12px;border-radius:999px;' +
          'border:1px solid #3a3d40;background:' + (name === state.proj ? '#D4AF69' : 'transparent') +
          ';color:' + (name === state.proj ? '#151619' : '#f9f6f0') + ';cursor:pointer;';
        b.addEventListener('click', function () { setProjection(name); });
        bar.appendChild(b);
        state.buttons[name] = b;
      });
      var axis = document.createElement('span');
      axis.style.cssText = 'margin-left:auto;color:#8b8578;font-size:12px;';
      axis.textContent = PROJ_AXIS[state.proj] || '';
      bar.appendChild(axis);
      state.axisLabel = axis;
    }

    function updateNote() {
      /* Panel S10: plain words, with the number. Panel S4: silhouette disclosed. */
      var plain = {
        pca: 'PCA shows the widest spread but keeps only ~27% of the differences \u2014 nearby dots can mislead.',
        tsne: 't-SNE keeps tight groups together, but gaps between groups mean nothing.',
        umap: 'UMAP keeps tight groups together, but gaps between groups mean nothing.'
      };
      note.innerHTML = '<strong style="color:#f9f6f0;">' +
        state.proj.toUpperCase().replace('TSNE', 't-SNE') + '</strong> \u2014 ' +
        (plain[state.proj] || (PROJ_NOTES[state.proj] || '')) +
        ' Colors: 8 rough groups found by the k-means algorithm (silhouette 0.09 \u2014 loose, treat as flavor, not positions). ' +
        'Each dot is one player-season. Axes are arbitrary units.';
    }

    function setProjection(name) {
      if (!state.pos || !state.pos[name]) return;
      state.proj = name;
      if (state.buttons) {
        Object.keys(state.buttons).forEach(function (k) {
          var on = k === name;
          var b = state.buttons[k];
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
          b.style.background = on ? '#D4AF69' : 'transparent';
          b.style.color = on ? '#151619' : '#f9f6f0';
        });
        if (state.axisLabel) state.axisLabel.textContent = PROJ_AXIS[name] || '';
      }
      updateNote();
    }

    function setHighlight(ids) {
      state.highlight = new Set(ids || []);
    }

    /* ---- sizing ---- */
    var dpr = 1;
    function resize() {
      var w = wrap.clientWidth;
      dpr = Math.min(2, global.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(height * dpr);
    }
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(function () { if (!state.destroyed) resize(); }).observe(wrap);
    }
    global.addEventListener('resize', resize);

    /* ---- interaction: drag rotate, wheel/pinch zoom, click select ---- */
    var pointers = new Map();
    var pinchD0 = 0, pinchDist0 = 1;
    var downX = 0, downY = 0, moved = false;

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
      if (handled) {
        e.preventDefault();
        state.autoRotate = false;
        if (state.idleTimer) clearTimeout(state.idleTimer);
      }
    });

    canvas.addEventListener('pointerdown', function (e) {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        downX = e.clientX; downY = e.clientY; moved = false;
        canvas.style.cursor = 'grabbing';
      } else if (pointers.size === 2) {
        var ps = Array.from(pointers.values());
        pinchDist0 = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
        pinchD0 = state.dist;
      }
      state.autoRotate = false;
      if (state.idleTimer) clearTimeout(state.idleTimer);
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
        canvas.style.cursor = 'grab';
        if (!moved && onSelect && state.loaded) {
          var idx = pick(e);
          if (idx >= 0) onSelect(pointId(idx));
        }
        if (!reduceMotion) {
          if (state.idleTimer) clearTimeout(state.idleTimer);
          state.idleTimer = setTimeout(function () { state.autoRotate = true; }, 3000);
        }
      }
    }
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      state.dist = Math.max(1.6, Math.min(8, state.dist * (1 + e.deltaY * 0.001)));
      state.autoRotate = false;
      if (state.idleTimer) clearTimeout(state.idleTimer);
      if (!reduceMotion) state.idleTimer = setTimeout(function () { state.autoRotate = true; }, 3000);
    }, { passive: false });

    function pointId(i) {
      return i; /* id IS the array index (see meta.id) */
    }

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
      var best = -1, bestD = 18 * 18;
      for (var i = 0; i < state.n; i++) {
        var dx = state.sx[i] - mx, dy = state.sy[i] - my;
        var q = dx * dx + dy * dy;
        if (q < bestD) { bestD = q; best = i; }
      }
      return best;
    }

    function hover(e) {
      if (!state.loaded || !onSelect) { tip.style.display = 'none'; return; }
      var idx = pick(e);
      if (idx < 0) { tip.style.display = 'none'; canvas.style.cursor = 'grab'; return; }
      canvas.style.cursor = 'pointer';
      var r = canvas.getBoundingClientRect();
      tip.textContent = state.names[idx] + ' \u00B7 ' + state.seasons[idx] +
        (state.teams[idx] ? ' \u00B7 ' + state.teams[idx] : '');
      tip.style.display = 'block';
      tip.style.left = (e.clientX - r.left + 14) + 'px';
      tip.style.top = (e.clientY - r.top - 10) + 'px';
    }

    /* ---- frame loop: one batched draw per cluster, no per-frame allocation ---- */
    var lastT = 0;
    function frame(t) {
      if (state.destroyed) return;
      var dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
      lastT = t;
      if (state.autoRotate && state.loaded) state.yaw += dt * 0.12;
      if (state.loaded) {
        projectAll();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
        var sx = state.sx, syy = state.sy, sz = state.sz, cl = state.clusters;
        /* Panel S7: single back-to-front pass — perceived density is real depth,
           not a fixed cluster draw-order artifact. sz is perspective scale:
           smaller = farther, so ascending order paints far points first. */
        var order = state.order;
        order.sort(function(a, b){ return sz[a] - sz[b]; });
        var lastC = -1;
        for (var k = 0; k < n; k++) {
          var i = order[k];
          var cc = cl[i] % 8;
          if (cc !== lastC) { ctx.fillStyle = CLUSTER_COLORS[cc]; lastC = cc; }
          var depth = sz[i];
          var size = 1 + depth * 1.6;
          ctx.globalAlpha = 0.35 + depth * 0.55;
          ctx.fillRect(sx[i] - size / 2, syy[i] - size / 2, size, size);
        }
        ctx.globalAlpha = 1;
        /* highlights: larger dots + ring */
        if (state.highlight.size) {
          ctx.strokeStyle = '#F9F6F0';
          ctx.lineWidth = 1.5;
          state.highlight.forEach(function (id) {
            var i = state.idToIdx.get(id);
            if (i === undefined) return;
            var depth = sz[i];
            var size = 3 + depth * 2.5;
            ctx.fillStyle = '#F9F6F0';
            ctx.beginPath();
            ctx.arc(sx[i], syy[i], size / 2, 0, 6.2832);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(sx[i], syy[i], size / 2 + 3, 0, 6.2832);
            ctx.stroke();
          });
        }
      }
      requestAnimationFrame(frame);
    }

    function destroy() {
      state.destroyed = true;
      global.removeEventListener('resize', resize);
      if (state.idleTimer) clearTimeout(state.idleTimer);
      el.innerHTML = '';
    }

    function info(i) {
      if (!state.loaded || i < 0 || i >= state.names.length) return null;
      return { name: state.names[i], season: state.seasons[i], team: state.teams[i], cluster: state.clusters[i] };
    }

    return { setProjection: setProjection, setHighlight: setHighlight, destroy: destroy, info: info };
  }

  global.Embed3D = { mount: mount };
})(typeof window !== 'undefined' ? window : this);

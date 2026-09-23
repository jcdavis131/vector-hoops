/* atlas-map.js — the home-page instrument.
 *
 * Plots all 12,966 player-seasons from vectors_search_lite.json on a 2-D view
 * (x: paint → perimeter, y: scoring load; PCA of the 14 era-normalised
 * per-100 features, as recorded in vectors.json). Selecting a season asks the
 * 64-d MTNN embedding (VHMtnn, mtnn.js) for its three nearest seasons by
 * cosine similarity. Nothing here is invented: every name, season, archetype
 * and similarity comes from the shipped data files.
 */
(function () {
  'use strict';

  var DATA_URL = '/assets/vectors_search_lite.json';
  var ARCHETYPES = [
    'Offensive glass + rim protection',
    'Offensive glass, low shot volume',
    'Three-point volume, low on-court impact',
    'Defensive glass + rim pressure',
    'Shot volume + three-point volume',
    'Three-point accuracy + volume',
    'Playmaking + steals',
    'Scoring volume + shot volume'
  ];
  var FEATURED = { n: 'Stephen Curry', s: '2015-16' };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('sky-canvas');
  if (!canvas) return;
  var wrap = $('map-wrap');
  var ctx = canvas.getContext('2d');
  var tip = $('hover-tip');

  var P = [];            // players
  var W = 0, H = 0, DPR = 1;
  var PAD = 28;
  var grid = null, GX = 64, GY = 40;
  var selected = -1, peers = [], hover = -1, filterArch = -1;
  var revealT = reduceMotion ? 1 : 0;
  var bounds = { x0: 0, x1: 1, y0: 0, y1: 1 };

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  var COL = {};
  function readColors() {
    COL.accent = '#FF7A33'; // the field is always the dark void, so the bright accent is used in both themes
    COL.dot = 'rgba(214,222,232,';
    COL.axis = 'rgba(255,255,255,0.07)';
    COL.axisStrong = 'rgba(255,255,255,0.14)';
    COL.peer = '#F4F6F8';
  }

  function fmtSeason(s) { return (s || '').replace('-', '–'); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---------- geometry ----------
  function sx(x) { return PAD + (x - bounds.x0) / (bounds.x1 - bounds.x0) * (W - PAD * 2); }
  function sy(y) { return PAD + (y - bounds.y0) / (bounds.y1 - bounds.y0) * (H - PAD * 2); }

  function computeBounds() {
    var x0 = 1, x1 = 0, y0 = 1, y1 = 0;
    for (var i = 0; i < P.length; i++) {
      var p = P[i];
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    // symmetric margins about the centre so the crosshair sits on the true middle
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    var hx = (x1 - x0) / 2 * 1.04, hy = (y1 - y0) / 2 * 1.06;
    bounds = { x0: cx - hx, x1: cx + hx, y0: cy - hy, y1: cy + hy };
  }

  function buildGrid() {
    grid = new Array(GX * GY);
    for (var g = 0; g < grid.length; g++) grid[g] = [];
    for (var i = 0; i < P.length; i++) {
      var gx = Math.min(GX - 1, Math.max(0, Math.floor(sx(P[i].x) / W * GX)));
      var gy = Math.min(GY - 1, Math.max(0, Math.floor(sy(P[i].y) / H * GY)));
      grid[gy * GX + gx].push(i);
    }
  }

  function nearestAt(mx, my, radius) {
    if (!grid) return -1;
    var gx = Math.floor(mx / W * GX), gy = Math.floor(my / H * GY), best = -1, bd = radius * radius;
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var cx = gx + dx, cy = gy + dy;
      if (cx < 0 || cy < 0 || cx >= GX || cy >= GY) continue;
      var cell = grid[cy * GX + cx];
      for (var k = 0; k < cell.length; k++) {
        var i = cell[k];
        if (filterArch >= 0 && P[i].c !== filterArch) continue;
        var ddx = sx(P[i].x) - mx, ddy = sy(P[i].y) - my, d = ddx * ddx + ddy * ddy;
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  }

  // ---------- drawing ----------
  function resize() {
    var r = wrap.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(280, Math.round(r.width));
    H = Math.max(260, Math.round(r.height));
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    PAD = W < 520 ? 18 : 36;
    if (P.length) buildGrid();
    draw();
  }

  function draw() {
    if (!ctx) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // one-point frame: centre crosshair + quiet quarter lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = COL.axis;
    ctx.beginPath();
    for (var q = 1; q < 4; q++) {
      if (q === 2) continue;
      var gx = Math.round(PAD + (W - PAD * 2) * q / 4) + 0.5;
      var gy = Math.round(PAD + (H - PAD * 2) * q / 4) + 0.5;
      ctx.moveTo(gx, PAD); ctx.lineTo(gx, H - PAD);
      ctx.moveTo(PAD, gy); ctx.lineTo(W - PAD, gy);
    }
    ctx.stroke();
    ctx.strokeStyle = COL.axisStrong;
    ctx.beginPath();
    var mx = Math.round(W / 2) + 0.5, my = Math.round(H / 2) + 0.5;
    ctx.moveTo(mx, PAD); ctx.lineTo(mx, H - PAD);
    ctx.moveTo(PAD, my); ctx.lineTo(W - PAD, my);
    ctx.stroke();
    // centre circle
    ctx.beginPath(); ctx.arc(mx, my, Math.min(W, H) * 0.09, 0, Math.PI * 2); ctx.stroke();

    if (!P.length) return;

    // points — revealed from the centre outward during the opening
    var n = P.length, rad = W < 520 ? 1.05 : 1.25;
    var maxR = Math.hypot(W / 2, H / 2) * revealT;
    var dim = selected >= 0 || filterArch >= 0;
    for (var i = 0; i < n; i++) {
      var p = P[i], x = sx(p.x), y = sy(p.y);
      if (revealT < 1 && Math.hypot(x - W / 2, y - H / 2) > maxR) continue;
      var a;
      if (filterArch >= 0) a = p.c === filterArch ? 0.85 : 0.07;
      else a = dim ? 0.26 : 0.5;
      ctx.fillStyle = COL.dot + a + ')';
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }

    // peers: hairlines back to the selected season, then rings
    if (selected >= 0) {
      var s = P[selected], ssx = sx(s.x), ssy = sy(s.y);
      ctx.strokeStyle = 'rgba(244,246,248,0.35)';
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      peers.forEach(function (pr) { var q = P[pr.id]; if (!q) return; ctx.moveTo(ssx, ssy); ctx.lineTo(sx(q.x), sy(q.y)); });
      ctx.stroke();
      ctx.setLineDash([]);
      peers.forEach(function (pr, k) {
        var q = P[pr.id]; if (!q) return;
        var qx = sx(q.x), qy = sy(q.y);
        ctx.fillStyle = COL.peer;
        ctx.beginPath(); ctx.arc(qx, qy, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = COL.peer; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(qx, qy, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = COL.peer;
        ctx.font = '600 10px ' + (css('--font-display') || 'sans-serif');
        ctx.fillText(String(k + 1), qx + 11, qy - 9);
      });

      // selected: accent crosshair to both edges + ring
      ctx.strokeStyle = COL.accent; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(ssx) + 0.5, PAD); ctx.lineTo(Math.round(ssx) + 0.5, H - PAD);
      ctx.moveTo(PAD, Math.round(ssy) + 0.5); ctx.lineTo(W - PAD, Math.round(ssy) + 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = COL.accent;
      ctx.beginPath(); ctx.arc(ssx, ssy, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(ssx, ssy, 11, 0, Math.PI * 2); ctx.stroke();
    }

    if (hover >= 0 && hover !== selected) {
      var h = P[hover];
      ctx.strokeStyle = COL.peer; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx(h.x), sy(h.y), 6, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function opening() {
    if (reduceMotion) { revealT = 1; draw(); return; }
    var t0 = performance.now(), dur = 1400;
    function step(t) {
      var k = Math.min(1, (t - t0) / dur);
      revealT = 1 - Math.pow(1 - k, 3);
      draw();
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ---------- readout ----------
  function renderReadout() {
    var sel = $('atlas-selected'), body = $('atlas-peers-body'), status = $('atlas-peers-status');
    if (!sel || !body) return;
    if (selected < 0) {
      sel.innerHTML = '<p class="readout__empty">Select any point on the atlas, or search a name above.</p>';
      body.innerHTML = '';
      if (status) status.textContent = '';
      return;
    }
    var p = P[selected];
    sel.innerHTML =
      '<div class="readout__label">Selected season</div>' +
      '<div class="readout__name">' + esc(p.n) + '</div>' +
      '<dl class="readout__facts">' +
        '<div><dt>Season</dt><dd>' + esc(fmtSeason(p.s)) + '</dd></div>' +
        '<div><dt>Archetype</dt><dd>' + esc(ARCHETYPES[p.c] || '—') + '</dd></div>' +
        '<div><dt>Paint → perimeter</dt><dd>' + p.x.toFixed(3) + '</dd></div>' +
        '<div><dt>Scoring load</dt><dd>' + p.y.toFixed(3) + '</dd></div>' +
      '</dl>' +
      '<a class="readout__link" href="/players">Open player directory →</a>';

    if (!window.VHMtnn || !window.VHMtnn.isReady()) {
      body.innerHTML = [0, 1, 2].map(function (k) {
        return '<tr class="is-loading"><td class="r">' + (k + 1) + '</td><td><span class="skeleton"></span></td><td><span class="skeleton skeleton--s"></span></td><td class="hide-s"><span class="skeleton"></span></td><td class="r"><span class="skeleton skeleton--s"></span></td></tr>';
      }).join('');
      if (status) status.textContent = 'Loading the 64-d embedding…';
      return;
    }
    if (status) status.textContent = '';
    body.innerHTML = peers.map(function (pr, k) {
      var q = P[pr.id];
      return '<tr data-id="' + pr.id + '" tabindex="0" aria-label="Select ' + esc(q.n) + ' ' + esc(q.s) + '">' +
        '<td class="r num">' + (k + 1) + '</td>' +
        '<td class="peer-name">' + esc(q.n) + '</td>' +
        '<td class="num">' + esc(fmtSeason(q.s)) + '</td>' +
        '<td class="hide-s">' + esc(ARCHETYPES[q.c] || '—') + '</td>' +
        '<td class="r num peer-sim">' + pr.sim.toFixed(3) + '</td></tr>';
    }).join('');
  }

  function computePeers() {
    peers = [];
    if (selected < 0 || !window.VHMtnn || !window.VHMtnn.isReady()) return;
    var name = P[selected].n;
    // other players only: a player's own adjacent seasons are trivially close
    peers = window.VHMtnn.topK(selected, 3, function (i) { return P[i] && P[i].n !== name; });
  }

  function select(i, opts) {
    opts = opts || {};
    selected = (i == null || i < 0 || i >= P.length) ? -1 : i;
    computePeers();
    renderReadout();
    draw();
    var live = $('atlas-live');
    if (live && selected >= 0) live.textContent = P[selected].n + ', ' + fmtSeason(P[selected].s) + ' selected.';
    if (!opts.noUrl) {
      try {
        var u = new URL(location.href);
        if (selected >= 0) u.searchParams.set('id', String(selected)); else u.searchParams.delete('id');
        history.replaceState(null, '', u);
      } catch (e) {}
    }
  }

  function ensureEmbedding() {
    if (!window.VHMtnn) return;
    window.VHMtnn.load(function (ok) {
      if (!ok) {
        var status = $('atlas-peers-status');
        if (status) status.textContent = 'The embedding could not be loaded on this connection. The atlas still works; peers need the 3.3 MB embedding file.';
        var body = $('atlas-peers-body'); if (body) body.innerHTML = '';
        return;
      }
      computePeers(); renderReadout(); draw();
    });
  }

  // ---------- search ----------
  function initSearch() {
    var input = $('atlas-search'), list = $('atlas-results');
    if (!input || !list) return;
    var results = [], active = -1;
    function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; input.removeAttribute('aria-activedescendant'); }
    function render() {
      if (!results.length) { list.innerHTML = '<li class="atlas-results__empty" role="presentation">No season matches that name.</li>'; list.hidden = false; return; }
      list.innerHTML = results.map(function (i, k) {
        var p = P[i];
        return '<li role="option" id="atlas-opt-' + k + '" data-id="' + i + '"' + (k === active ? ' aria-selected="true" class="is-active"' : ' aria-selected="false"') + '>' +
          '<span>' + esc(p.n) + '</span><span class="num">' + esc(fmtSeason(p.s)) + '</span></li>';
      }).join('');
      list.hidden = false; input.setAttribute('aria-expanded', 'true');
      if (active >= 0) input.setAttribute('aria-activedescendant', 'atlas-opt-' + active);
    }
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      if (q.length < 2) { close(); return; }
      var starts = [], contains = [];
      for (var i = 0; i < P.length; i++) {
        var n = P[i].n.toLowerCase();
        if (n.indexOf(q) === 0 || n.indexOf(' ' + q) > -1) starts.push(i);
        else if (n.indexOf(q) > -1) contains.push(i);
      }
      var all = starts.concat(contains);
      all.sort(function (a, b) { return P[a].n === P[b].n ? (P[b].s > P[a].s ? 1 : -1) : 0; });
      results = all.slice(0, 8); active = results.length ? 0 : -1; render();
    });
    input.addEventListener('keydown', function (e) {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { active = Math.min(results.length - 1, active + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter') { if (active >= 0) { select(results[active]); input.value = P[results[active]].n + ' ' + fmtSeason(P[results[active]].s); close(); } e.preventDefault(); }
      else if (e.key === 'Escape') { close(); }
    });
    list.addEventListener('mousedown', function (e) {
      var li = e.target.closest('li[data-id]'); if (!li) return;
      e.preventDefault();
      var i = +li.getAttribute('data-id'); select(i); input.value = P[i].n + ' ' + fmtSeason(P[i].s); close();
    });
    input.addEventListener('blur', function () { setTimeout(close, 120); });
  }

  // ---------- legend (archetype filter) ----------
  function initLegend() {
    var host = $('atlas-legend'); if (!host) return;
    var counts = new Array(8).fill(0);
    P.forEach(function (p) { if (p.c >= 0 && p.c < 8) counts[p.c]++; });
    host.innerHTML = ARCHETYPES.map(function (a, k) {
      return '<button type="button" class="legend-chip" data-arch="' + k + '" aria-pressed="false"><span>' + esc(a) + '</span><span class="num">' + counts[k].toLocaleString('en-US') + '</span></button>';
    }).join('');
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-arch]'); if (!b) return;
      var k = +b.getAttribute('data-arch');
      filterArch = filterArch === k ? -1 : k;
      host.querySelectorAll('[data-arch]').forEach(function (el) { el.setAttribute('aria-pressed', String(+el.getAttribute('data-arch') === filterArch)); });
      draw();
    });
  }

  // ---------- pointer ----------
  function pointer(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function showTip(i, x, y) {
    if (!tip) return;
    if (i < 0) { tip.hidden = true; return; }
    var p = P[i];
    tip.innerHTML = '<b>' + esc(p.n) + '</b><span class="num">' + esc(fmtSeason(p.s)) + '</span>';
    tip.hidden = false;
    var tx = Math.min(W - 12, Math.max(12, x)), ty = Math.max(40, y);
    tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
  }
  canvas.addEventListener('pointermove', function (e) {
    if (!P.length) return;
    var m = pointer(e), i = nearestAt(m.x, m.y, 14);
    if (i !== hover) { hover = i; draw(); }
    canvas.style.cursor = i >= 0 ? 'pointer' : 'crosshair';
    showTip(i, m.x, m.y);
  });
  canvas.addEventListener('pointerleave', function () { hover = -1; showTip(-1); draw(); });
  canvas.addEventListener('click', function (e) {
    var m = pointer(e), i = nearestAt(m.x, m.y, 18);
    if (i >= 0) select(i);
  });

  document.addEventListener('click', function (e) {
    var tr = e.target.closest && e.target.closest('#atlas-peers-body tr[data-id]');
    if (tr) select(+tr.getAttribute('data-id'));
    if (e.target.closest && e.target.closest('[data-map="reset"]')) { filterArch = -1; initLegendReset(); select(-1); }
    if (e.target.closest && e.target.closest('[data-map="share"]')) share(e.target.closest('[data-map="share"]'));
  });
  document.addEventListener('keydown', function (e) {
    var tr = e.target.closest && e.target.closest('#atlas-peers-body tr[data-id]');
    if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(+tr.getAttribute('data-id')); }
  });
  function initLegendReset() {
    document.querySelectorAll('#atlas-legend [data-arch]').forEach(function (el) { el.setAttribute('aria-pressed', 'false'); });
  }
  function share(btn) {
    var url = location.href;
    var done = function () { var t = btn.querySelector('span') || btn; var old = t.textContent; t.textContent = 'Link copied'; setTimeout(function () { t.textContent = old; }, 1800); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () {});
  }

  // ---------- boot ----------
  function fail(msg) {
    var s = $('atlas-state');
    if (s) { s.hidden = false; s.innerHTML = '<p><b>The atlas could not load.</b> ' + esc(msg) + '</p><button type="button" class="btn" onclick="location.reload()">Try again</button>'; }
  }

  readColors();
  resize();
  window.addEventListener('resize', function () { clearTimeout(resize._t); resize._t = setTimeout(resize, 120); });
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: light)');
    if (mq.addEventListener) mq.addEventListener('change', function () { readColors(); draw(); });
  }

  fetch(DATA_URL, { cache: 'force-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (j) {
      P = j.players || [];
      if (!P.length) throw new Error('no rows');
      computeBounds(); buildGrid();
      var s = $('atlas-state'); if (s) s.hidden = true;
      var count = $('atlas-count'); if (count) count.textContent = P.length.toLocaleString('en-US');
      initSearch(); initLegend();
      var id = -1;
      try { var q = new URL(location.href).searchParams.get('id'); if (q != null && /^\d+$/.test(q)) id = +q; } catch (e) {}
      if (id < 0) { for (var i = 0; i < P.length; i++) if (P[i].n === FEATURED.n && P[i].s === FEATURED.s) { id = i; break; } }
      opening();
      select(id, { noUrl: true });
      if ('requestIdleCallback' in window) requestIdleCallback(ensureEmbedding, { timeout: 1500 }); else setTimeout(ensureEmbedding, 400);
    })
    .catch(function (err) { fail('The season file did not arrive (' + err.message + '). Check your connection and try again.'); });
})();

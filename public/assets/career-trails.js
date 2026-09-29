/* career-trails.js — animated season-by-season career paths on the atlas.
 *
 * Hooks the atlas single-select flow (window.VHAtlas, exposed by atlas-map.js).
 * Tap a player-season -> "Trail" button appears in the readout -> the player's
 * career draws as a glowing trail (rookie -> prime -> twilight) with a scrubber
 * and a plain-words "what changed" strip. Additive only: the base map is
 * untouched; all trail rendering happens on an overlay canvas + control bar.
 *
 * Data: /assets/trails_index.json (33KB, fetched on first selection) then
 * /assets/trails.json (829KB, fetched on first Trail tap, cached by sw.js).
 */
(function () {
  'use strict';

  var INDEX_URL = '/assets/trails_index.json';
  var TRAILS_URL = '/assets/trails.json';
  var MOSS = '#8A9A8B', TERRA = '#C17C60', VOID = '#07090C';
  var HONEST_KEY = 'vh:trail-honest-seen';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var wrap = document.getElementById('map-wrap');
  var sky = document.getElementById('sky-canvas');
  var readout = document.getElementById('atlas-selected');
  if (!wrap || !sky || !window.VHAtlas) return;

  var indexP = null, trailsP = null, labels = null;
  var active = null; // {trail, pts:[{x,y}], years:[], n, idx, overlay, octx, bar, ...}

  function normName(n) { return String(n || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function fmtSeason(s) { return String(s || '').replace('-', '–'); }
  function shortYear(s) { return '’' + String(s || '').slice(2, 4); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function loadIndex() {
    if (!indexP) {
      indexP = fetch(INDEX_URL, { cache: 'force-cache' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .catch(function () { return {}; });
    }
    return indexP;
  }
  function loadTrails() {
    if (!trailsP) {
      trailsP = fetch(TRAILS_URL, { cache: 'force-cache' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (j) { labels = (j._meta && j._meta.labels) || {}; return j; })
        .catch(function () { return null; });
    }
    return trailsP;
  }

  // ---------- selection hook ----------
  window.VHAtlas.onSelect(function (player) {
    exitTrail();
    removeButton();
    if (!player) return;
    loadIndex().then(function (idx) {
      // the player may have moved on while the index loaded
      var cur = window.VHAtlas.selectedPlayer();
      if (!cur || cur.n !== player.n || cur.s !== player.s) return;
      if (idx[normName(player.n)]) injectButton(player);
    });
  });

  function removeButton() {
    var b = document.getElementById('trail-btn');
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }
  function injectButton(player) {
    if (!readout || document.getElementById('trail-btn')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'trail-btn'; b.className = 'trail-btn';
    b.innerHTML = '&#9654; Trail';
    b.setAttribute('aria-label', 'Watch ' + player.n + '’s career as an animated trail');
    b.addEventListener('click', function () {
      b.disabled = true; b.textContent = 'Loading…';
      loadTrails().then(function (t) {
        b.disabled = false; b.innerHTML = '&#9654; Trail';
        if (!t) return;
        var trail = t[normName(player.n)];
        if (trail) enterTrail(trail);
      });
    });
    readout.appendChild(b);
  }

  // ---------- trail mode ----------
  function yearOf(s) { return parseInt(String(s).slice(0, 4), 10) || 0; }

  function enterTrail(trail) {
    exitTrail();
    var n = trail.seasons.length;
    if (n < 2) return;
    var years = trail.seasons.map(yearOf);
    var pts = trail.pts.map(function (p) { return window.VHAtlas.project(p[0], p[1]); });

    var overlay = document.createElement('canvas');
    overlay.id = 'trail-canvas';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.cssText = 'position:absolute;inset:0;z-index:2;pointer-events:none;';
    wrap.appendChild(overlay);

    var bar = document.createElement('div');
    bar.id = 'trail-bar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Career trail scrubber');
    var honestSeen = false;
    try { honestSeen = !!window.localStorage.getItem(HONEST_KEY); } catch (e) {}
    bar.innerHTML =
      '<div class="trail-row">' +
        '<button type="button" id="trail-close" aria-label="Close trail">&times;</button>' +
        '<span id="trail-season" aria-live="polite"></span>' +
        '<input type="range" id="trail-scrub" min="0" max="' + (n - 1) + '" step="1" value="0" aria-label="Season scrubber">' +
      '</div>' +
      '<div id="trail-changed" aria-live="polite"></div>' +
      (honestSeen ? '' : '<div id="trail-honest">Trails show how a player\u2019s <i>style</i> moved \u2014 not whether they got better. Neighbours are similarity, not rankings.</div>');
    wrap.appendChild(bar);
    if (!honestSeen) { try { window.localStorage.setItem(HONEST_KEY, '1'); } catch (e) {} }

    active = {
      trail: trail, n: n, years: years, pts: pts,
      overlay: overlay, octx: overlay.getContext('2d'),
      seasonEl: bar.querySelector('#trail-season'),
      scrub: bar.querySelector('#trail-scrub'),
      changedEl: bar.querySelector('#trail-changed'),
      progress: 0, raf: 0, scrubbing: false
    };

    sizeOverlay();
    bar.querySelector('#trail-close').addEventListener('click', exitTrail);
    active.scrub.addEventListener('input', function () {
      active.scrubbing = true;
      cancelAnimationFrame(active.raf);
      setFrame(parseInt(active.scrub.value, 10) || 0);
    });
    document.addEventListener('keydown', escHandler);

    if (reduceMotion) {
      setFrame(n - 1);
    } else {
      animate();
    }
  }

  function escHandler(e) { if (e.key === 'Escape') exitTrail(); }

  function exitTrail() {
    if (!active) return;
    cancelAnimationFrame(active.raf);
    document.removeEventListener('keydown', escHandler);
    if (active.overlay.parentNode) active.overlay.parentNode.removeChild(active.overlay);
    var bar = document.getElementById('trail-bar');
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    active = null;
  }

  function sizeOverlay() {
    if (!active) return;
    var d = window.VHAtlas.dims();
    active.overlay.width = sky.width;
    active.overlay.height = sky.height;
    active.overlay.style.width = sky.style.width;
    active.overlay.style.height = sky.style.height;
    active.octx.setTransform(d.DPR, 0, 0, d.DPR, 0, 0);
    // re-project: the base map may have resized
    active.pts = active.trail.pts.map(function (p) { return window.VHAtlas.project(p[0], p[1]); });
    drawFrame();
  }
  window.addEventListener('resize', function () { if (active) { clearTimeout(sizeOverlay._t); sizeOverlay._t = setTimeout(sizeOverlay, 150); } });

  function animate() {
    if (!active || active.scrubbing) return;
    var total = 1100 * (active.n - 1);
    var t0 = performance.now();
    function step(t) {
      if (!active || active.scrubbing) return;
      var k = Math.max(0, Math.min(1, (t - t0) / total));
      var prog = k * (active.n - 1);
      setFrame(prog);
      if (k < 1) active.raf = requestAnimationFrame(step);
    }
    active.raf = requestAnimationFrame(step);
  }

  function setFrame(prog) {
    if (!active) return;
    active.progress = prog;
    var idx = Math.min(active.n - 1, Math.floor(prog + 1e-6));
    active.idx = idx;
    active.scrub.value = String(idx);
    active.seasonEl.textContent = fmtSeason(active.trail.seasons[idx]);
    renderChanged(idx);
    drawFrame();
  }

  function chipText(code, dir) {
    var label = (labels && labels[code]) || code;
    var arrow = dir > 0 ? '\u2191' : (dir < 0 ? '\u2193' : '\u2192');
    return label + ' ' + arrow;
  }
  function renderChanged(idx) {
    if (!active) return;
    if (idx === 0) { active.changedEl.textContent = 'Rookie season'; return; }
    var d = active.trail.deltas[idx] || [];
    active.changedEl.textContent = d.map(function (c) { return chipText(c[0], c[1]); }).join(' \u00B7 ');
  }

  function drawFrame() {
    if (!active) return;
    var ctx = active.octx, pts = active.pts, n = active.n;
    var d = window.VHAtlas.dims(), W = d.W, H = d.H;
    ctx.clearRect(0, 0, W, H);

    // veil: pull the rest of the atlas back so the trail reads
    ctx.fillStyle = 'rgba(7,9,12,0.55)';
    ctx.fillRect(0, 0, W, H);

    var prog = active.progress;
    var last = pts[n - 1], first = pts[0];
    var grad = ctx.createLinearGradient(first.x, first.y, last.x, last.y);
    grad.addColorStop(0, MOSS);
    grad.addColorStop(1, TERRA);

    function strokePath(upto, style, width, alpha) {
      ctx.strokeStyle = style; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalAlpha = alpha;
      var seg = Math.floor(upto), frac = upto - seg;
      for (var k = 0; k < Math.min(seg, n - 1); k++) {
        drawSeg(k, pts[k], pts[k + 1]);
      }
      if (frac > 0 && seg < n - 1) {
        var a = pts[seg], b = pts[seg + 1];
        drawSeg(seg, a, { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac });
      }
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    }
    function drawSeg(k, a, b) {
      if (active.years[k + 1] - active.years[k] > 1) ctx.setLineDash([4, 5]); // missed seasons: dotted gap
      else ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    // full path, faint (context) + travelled path, bright (comet)
    strokePath(n - 1, grad, 2, 0.28);
    if (prog > 0.01) strokePath(prog, grad, 2.75, 0.95);

    // season dots along the travelled path
    var every = Math.max(1, Math.round(n / 5));
    ctx.fillStyle = '#ECEEF1';
    for (var i = 0; i <= Math.min(n - 1, Math.floor(prog)); i++) {
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 2.2, 0, Math.PI * 2); ctx.fill();
      if (i % every === 0 || i === n - 1) {
        ctx.globalAlpha = 0.75;
        ctx.font = '600 10px system-ui, sans-serif';
        ctx.fillText(shortYear(active.trail.seasons[i]), pts[i].x + 7, pts[i].y - 7);
      }
    }
    ctx.globalAlpha = 1;

    // head: terracotta glow + season pill
    var hp = pts[Math.min(n - 1, Math.floor(prog + 1e-6))];
    var glow = ctx.createRadialGradient(hp.x, hp.y, 0, hp.x, hp.y, 16);
    glow.addColorStop(0, 'rgba(193,124,96,0.9)');
    glow.addColorStop(1, 'rgba(193,124,96,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(hp.x, hp.y, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(hp.x, hp.y, 3.4, 0, Math.PI * 2); ctx.fill();

    var label = fmtSeason(active.trail.seasons[Math.min(n - 1, Math.floor(prog + 1e-6))]);
    ctx.font = '700 11px system-ui, sans-serif';
    var tw = ctx.measureText(label).width;
    var lx = Math.min(W - tw - 18, Math.max(6, hp.x + 10)), ly = Math.max(6, hp.y - 30);
    ctx.fillStyle = 'rgba(7,9,12,0.85)';
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(lx - 6, ly - 4, tw + 12, 20, 6); ctx.fill(); }
    else ctx.fillRect(lx - 6, ly - 4, tw + 12, 20);
    ctx.fillStyle = '#ECEEF1';
    ctx.fillText(label, lx, ly + 11);
  }
})();

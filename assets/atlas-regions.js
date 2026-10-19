/* atlas-regions.js — the Atlas becomes a place (Part 2 panel: Goldsberry, McInnes).
 *
 * Separate module on purpose: it layers region labels, the region panel, and the
 * Regions/Players view toggle OVER the base map without touching atlas-map.js's
 * draw loop. The one exception is window.VHAtlas.setCap (added there, 4 lines),
 * which lets Regions view subsample the 12,966 points with a visible note.
 *
 * HONESTY NOTE (Hullman/Kubrick): atlas_regions.json carries no per-row
 * membership — only exemplars. Region markers sit at the centroid of each
 * region's exemplars and are labeled as approximate; the PANEL content
 * (name, blurb, size, era span, exemplars) is exact.
 */
(function () {
  'use strict';

  var REGIONS_URL = '/assets/atlas_regions.json';
  var LITE_URL = '/assets/vectors_search_lite.json';
  var POINT_CAP = 3000;

  var wrap = document.getElementById('map-wrap');
  var canvas = document.getElementById('sky-canvas');
  var strip = document.getElementById('region-strip');
  var panel = document.getElementById('region-panel');
  if (!wrap || !canvas) return;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtSeason(s) { return (s || '').replace('-', '–'); }

  // canvas 2D available? (The map is canvas-2D, not WebGL.)
  var probeCanvas = document.createElement('canvas');
  var hasCanvas = !!(probeCanvas.getContext && probeCanvas.getContext('2d'));

  var regions = [], anchors = {}, liteByIdx = {};
  var selectedRegion = -1, regionsMode = false;

  // Same bounds formula as atlas-map.js (documented duplication; keeps modules decoupled).
  function computeBounds(P) {
    var x0 = 1, x1 = 0, y0 = 1, y1 = 0, i, p;
    for (i = 0; i < P.length; i++) {
      p = P[i];
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    var hx = (x1 - x0) / 2 * 1.04, hy = (y1 - y0) / 2 * 1.06;
    return { x0: cx - hx, x1: cx + hx, y0: cy - hy, y1: cy + hy };
  }

  function mapXY(x, y, W, H, bounds, pad) {
    return {
      left: (pad + (x - bounds.x0) / (bounds.x1 - bounds.x0) * (W - pad * 2)) / W * 100,
      top: (pad + (y - bounds.y0) / (bounds.y1 - bounds.y0) * (H - pad * 2)) / H * 100
    };
  }

  function buildLayer(P, bounds) {
    var layer = document.getElementById('region-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'region-layer';
      layer.setAttribute('aria-hidden', 'false');
      wrap.appendChild(layer);
    }
    layer.innerHTML = '';
    regions.forEach(function (rg, k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'region-tag';
      b.setAttribute('data-region', String(k));
      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', 'Atlas region: ' + rg.name + '. ' + rg.blurb);
      b.innerHTML = '<span class="region-tag__dot" aria-hidden="true"></span><span class="region-tag__name">' + esc(rg.name) + '</span>';
      b.addEventListener('click', function () { selectRegion(k); });
      layer.appendChild(b);
    });
    positionTags(P, bounds);
  }

  function positionTags(P, bounds) {
    var layer = document.getElementById('region-layer');
    if (!layer) return;
    var r = wrap.getBoundingClientRect();
    var W = Math.max(280, Math.round(r.width)), H = Math.max(260, Math.round(r.height));
    var pad = W < 520 ? 18 : 36;
    var tags = layer.querySelectorAll('.region-tag');
    regions.forEach(function (rg, k) {
      var a = anchors[k], tag = tags[k];
      if (!a || !tag) return;
      var pos = mapXY(a.x, a.y, W, H, bounds, pad);
      tag.style.left = pos.left.toFixed(2) + '%';
      tag.style.top = pos.top.toFixed(2) + '%';
    });
    // Greedy de-collision on narrow maps: larger regions keep their tags.
    // Every region stays reachable via the strip below the map.
    if (W < 700) {
      var order = regions.map(function (rg, k) { return k; })
        .sort(function (a, b) { return regions[b].size - regions[a].size; });
      var placed = [];
      order.forEach(function (k) {
        var tag = tags[k], ra = tag.getBoundingClientRect(), clash = false;
        for (var i = 0; i < placed.length; i++) {
          var rb = placed[i].getBoundingClientRect();
          if (ra.left < rb.right && ra.right > rb.left && ra.top < rb.bottom && ra.bottom > rb.top) { clash = true; break; }
        }
        if (clash) tag.classList.add('is-collided');
        else { tag.classList.remove('is-collided'); placed.push(tag); }
      });
    } else {
      tags.forEach(function (tag) { tag.classList.remove('is-collided'); });
    }
  }

  function buildStrip() {
    if (!strip) return;
    strip.innerHTML = '';
    regions.forEach(function (rg, k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'region-chip';
      b.setAttribute('data-region', String(k));
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = '<span>' + esc(rg.name) + '</span><span class="num">' + rg.size.toLocaleString('en-US') + '</span>';
      b.addEventListener('click', function () { selectRegion(k); });
      strip.appendChild(b);
    });
  }

  function renderPanel(k) {
    if (!panel) return;
    if (k < 0) { panel.hidden = true; panel.innerHTML = ''; return; }
    var rg = regions[k];
    // Display name/season come from the lite row (the map's own labels), not the
    // regions file: 1 of 36 exemplars differs ("Mike Dunleavy" vs "Mike Dunleavy
    // Jr.", row 7675). Row index is the join key and is correct in both files.
    var ex = rg.exemplars.map(function (e) {
      var lp = liteByIdx[e.row];
      var nm = (lp && lp.n) || e.name, sn = (lp && lp.s) || e.season;
      return '<li><a href="/players?q=' + encodeURIComponent(nm) + '">' + esc(nm) + '</a> <span class="num">' + esc(fmtSeason(sn)) + '</span></li>';
    }).join('');
    panel.innerHTML =
      '<div class="region-panel__head">' +
        '<div><div class="readout__label">Atlas region</div>' +
        '<h3 class="region-panel__name">' + esc(rg.name) + '</h3></div>' +
        '<button type="button" class="region-panel__close" aria-label="Close region panel">×</button>' +
      '</div>' +
      '<p class="region-panel__blurb">' + esc(rg.blurb) + '</p>' +
      (rg.geometry ? '<p class="region-panel__geometry">' + esc(rg.geometry) + '</p>' : '') +
      '<dl class="readout__facts">' +
        '<div><dt>Player-seasons</dt><dd class="num">' + rg.size.toLocaleString('en-US') + '</dd></div>' +
        '<div><dt>Era span</dt><dd class="num">' + esc(fmtSeason(rg.era_span[0])) + ' – ' + esc(fmtSeason(rg.era_span[1])) + '</dd></div>' +
      '</dl>' +
      '<div class="readout__label">Exemplars</div>' +
      '<ul class="region-panel__exemplars">' + ex + '</ul>' +
      '<p class="region-panel__note">Marker placed at the center of the region\u2019s exemplars; the region itself has no drawn boundary.</p>';
    panel.hidden = false;
    var close = panel.querySelector('.region-panel__close');
    if (close) close.addEventListener('click', function () { selectRegion(-1); });
  }

  function selectRegion(k) {
    selectedRegion = (k === selectedRegion) ? -1 : k;
    document.querySelectorAll('[data-region]').forEach(function (el) {
      el.setAttribute('aria-pressed', String(+el.getAttribute('data-region') === selectedRegion));
    });
    var layer = document.getElementById('region-layer');
    if (layer) layer.classList.toggle('has-selection', selectedRegion >= 0);
    renderPanel(selectedRegion);
    if (selectedRegion >= 0 && panel && !panel.hidden) {
      try { panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
    }
  }

  function setRegionsMode(on) {
    regionsMode = on;
    var btn = wrap.querySelector('[data-map="regions"]');
    if (btn) {
      btn.setAttribute('aria-pressed', String(on));
      var label = btn.querySelector('span');
      if (label) label.textContent = on ? 'Players' : 'Regions';
    }
    canvas.classList.toggle('is-regions', on);
    var layer = document.getElementById('region-layer');
    if (layer) layer.classList.toggle('is-regions', on);
    var note = document.getElementById('region-note');
    // Point cap lives in atlas-map.js (window.VHAtlas.setCap); degrade gracefully if absent.
    try {
      if (window.VHAtlas && window.VHAtlas.setCap) window.VHAtlas.setCap(on ? POINT_CAP : 0);
    } catch (e) {}
    if (note) {
      if (on) {
        note.hidden = false;
        note.textContent = 'Region view: showing a ' + POINT_CAP.toLocaleString('en-US') +
          '-point sample of 12,966. Switch to Players for every point.';
      } else note.hidden = true;
    }
  }

  function initFallback() {
    // Static fallback when canvas 2D is unavailable: the map becomes a
    // browsable region list. The region panel works without canvas.
    if (hasCanvas) return;
    canvas.style.display = 'none';
    var fb = document.getElementById('atlas-fallback');
    if (!fb) return;
    fb.hidden = false;
    var list = fb.querySelector('ul');
    if (list) {
      list.innerHTML = regions.map(function (rg, k) {
        return '<li><button type="button" data-region="' + k + '">' + esc(rg.name) +
          ' <span class="num">' + rg.size.toLocaleString('en-US') + '</span></button></li>';
      }).join('');
      list.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-region]');
        if (b) selectRegion(+b.getAttribute('data-region'));
      });
    }
  }

  function boot() {
    Promise.all([
      fetch(REGIONS_URL, { cache: 'force-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
      fetch(LITE_URL, { cache: 'force-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    ]).then(function (res) {
      var rj = res[0], lite = res[1];
      regions = rj.regions || [];
      var P = lite.players || [];
      if (!regions.length || !P.length) return;
      P.forEach(function (p, i) { liteByIdx[i] = p; });
      var bounds = computeBounds(P);
      // Anchor = centroid of the region's exemplars (no membership in the file).
      regions.forEach(function (rg, k) {
        var sx = 0, sy = 0, n = 0;
        rg.exemplars.forEach(function (e) {
          var p = liteByIdx[e.row];
          if (p) { sx += p.x; sy += p.y; n++; }
        });
        if (n) anchors[k] = { x: sx / n, y: sy / n };
      });
      buildStrip();
      buildLayer(P, bounds);
      initFallback();
      var t = null;
      window.addEventListener('resize', function () {
        clearTimeout(t); t = setTimeout(function () { positionTags(P, bounds); }, 120);
      });
      var rbtn = wrap.querySelector('[data-map="regions"]');
      if (rbtn) rbtn.addEventListener('click', function () { setRegionsMode(!regionsMode); });
    }).catch(function () { /* regions are enhancement; the base map still works */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/* court-lab.js — Court Lab interactions. IIFE, zero deps.
 *
 * Tabs: Shots | Hex | Zones | Twins. Season scrubber updates DATA ONLY —
 * the court (VHCourtDraw) is drawn once and never moves.
 * Shot data lazy-loads from assets/shots.v1.json on first player pick.
 */
(function () {
  'use strict';

  var D = window.VHCourtDraw;

  var INK = '#232323';
  var BOARD = '#FCFBF7';
  var PENCIL = '#9A9A94';
  var BLUE = '#2B6CE5';
  var RED = '#E0483B';
  var TERRA = '#C17C60';
  var MOSS = '#8A9A8B';
  var GLOW = 'rgba(255,235,130,.55)';

  var STORE_KEY = 'vh-court-lab-player';
  var DATA_URL = 'assets/shots.v1.json';

  var S = {
    data: null, loading: null,
    pid: null, season: null, tab: 'shots',
    court: null
  };

  var $ = function (id) { return document.getElementById(id); };

  function r2(n) { return (Math.round(n * 100) / 100).toString(); }
  function pt(x, y) { var p = D.P(x, y); return r2(p[0]) + ' ' + r2(p[1]); }
  function arcTo(cx, cy, r, a0, a1) {
    var p1 = D.P(cx + r * Math.cos(a1), cy + r * Math.sin(a1));
    var d = a1 - a0;
    var large = Math.abs(d) > Math.PI ? 1 : 0;
    var sweep = d > 0 ? 1 : 0; // y-up CCW appears clockwise on screen
    return 'A ' + r2(r) + ' ' + r2(r) + ' 0 ' + large + ' ' + sweep + ' ' +
      r2(p1[0]) + ' ' + r2(p1[1]);
  }

  // --- exact zone polygons (mirror build_shots.classify_zone) --------------
  var SQ = Math.sqrt;
  var Y3495 = SQ(35 * 35 - 25 * 25);          // 24.495
  var Y2236 = SQ(23.75 * 23.75 - 8 * 8);      // 22.360
  var Y1918 = SQ(23.75 * 23.75 - 14 * 14);    // 19.183
  var X2634 = SQ(14 * 14 - 13.75 * 13.75);    // 2.634
  var Y3407 = SQ(35 * 35 - 8 * 8);            // 34.074 — r=35 arc at |x|=8
  var CY = D.GEOM.CORNER_Y;                    // 8.948

  function zonePath(zi) {
    switch (zi) {
      case 0: // HEAVE
        return 'M ' + pt(-25, Y3495) + ' ' +
          arcTo(0, 0, 35, Math.atan2(Y3495, -25), Math.atan2(Y3495, 25)) +
          ' L ' + pt(25, 41.75) + ' L ' + pt(-25, 41.75) + ' Z';
      case 1: // RA — full disc r=4 (classifier: r<=4, any y); painted over PAINT
        return 'M ' + pt(4, 0) + ' ' + arcTo(0, 0, 4, 0, Math.PI) + ' ' +
          arcTo(0, 0, 4, Math.PI, 2 * Math.PI) + ' Z';
      case 2: // PAINT
        return 'M ' + pt(-8, -5.25) + ' L ' + pt(8, -5.25) +
          ' L ' + pt(8, 13.75) + ' L ' + pt(-8, 13.75) + ' Z';
      case 3: // C3_L
        return 'M ' + pt(-25, -5.25) + ' L ' + pt(-22, -5.25) +
          ' L ' + pt(-22, CY) + ' L ' + pt(-25, CY) + ' Z';
      case 4: // C3_R
        return 'M ' + pt(22, -5.25) + ' L ' + pt(25, -5.25) +
          ' L ' + pt(25, CY) + ' L ' + pt(22, CY) + ' Z';
      case 5: // MR_LC
        return 'M ' + pt(-22, -5.25) + ' L ' + pt(-14, -5.25) +
          ' L ' + pt(-14, CY) + ' L ' + pt(-22, CY) + ' Z';
      case 6: // MR_RC
        return 'M ' + pt(14, -5.25) + ' L ' + pt(22, -5.25) +
          ' L ' + pt(22, CY) + ' L ' + pt(14, CY) + ' Z';
      case 7: // MR_LW
        return 'M ' + pt(-14, -5.25) + ' L ' + pt(-8, -5.25) +
          ' L ' + pt(-8, Y2236) + ' ' +
          arcTo(0, 0, 23.75, Math.atan2(Y2236, -8), Math.atan2(CY, -22)) +
          ' L ' + pt(-14, CY) + ' Z';
      case 8: // MR_RW
        return 'M ' + pt(8, -5.25) + ' L ' + pt(14, -5.25) +
          ' L ' + pt(14, CY) + ' L ' + pt(22, CY) + ' ' +
          arcTo(0, 0, 23.75, Math.atan2(CY, 22), Math.atan2(Y2236, 8)) +
          ' Z';
      case 9: // MR_TS
        return 'M ' + pt(-X2634, 13.75) + ' ' +
          arcTo(0, 0, 14, Math.atan2(13.75, -X2634), Math.atan2(13.75, X2634)) +
          ' Z';
      case 10: // MR_TL
        return 'M ' + pt(-8, 13.75) + ' L ' + pt(-8, Y2236) + ' ' +
          arcTo(0, 0, 23.75, Math.atan2(Y2236, -8), Math.atan2(Y2236, 8)) +
          ' L ' + pt(8, 13.75) + ' L ' + pt(X2634, 13.75) + ' ' +
          arcTo(0, 0, 14, Math.atan2(13.75, X2634), Math.atan2(13.75, -X2634)) +
          ' Z';
      case 11: // W3_L (clipped to r<35; beyond is HEAVE)
        return 'M ' + pt(-22, CY) + ' ' +
          arcTo(0, 0, 23.75, Math.atan2(CY, -22), Math.atan2(Y2236, -8)) +
          ' L ' + pt(-8, Y3407) + ' ' +
          arcTo(0, 0, 35, Math.atan2(Y3407, -8), Math.atan2(Y3495, -25)) +
          ' L ' + pt(-25, CY) + ' Z';
      case 12: // W3_R (clipped to r<35; beyond is HEAVE)
        return 'M ' + pt(22, CY) + ' ' +
          arcTo(0, 0, 23.75, Math.atan2(CY, 22), Math.atan2(Y2236, 8)) +
          ' L ' + pt(8, Y3407) + ' ' +
          arcTo(0, 0, 35, Math.atan2(Y3407, 8), Math.atan2(Y3495, 25)) +
          ' L ' + pt(25, CY) + ' Z';
      default: // T3 (clipped to r<35; beyond is HEAVE)
        return 'M ' + pt(-8, Y2236) + ' ' +
          arcTo(0, 0, 23.75, Math.atan2(Y2236, -8), Math.atan2(Y2236, 8)) +
          ' L ' + pt(8, Y3407) + ' ' +
          arcTo(0, 0, 35, Math.atan2(Y3407, 8), Math.atan2(Y3407, -8)) +
          ' L ' + pt(-8, Y2236) + ' Z';
    }
  }

  var ZONE_CENTROID = [
    [0, 38.5], [0, 2.2], [0, 9.5],
    [-23.5, 1.5], [23.5, 1.5],
    [-18, 1.5], [18, 1.5],
    [-11, 15], [11, 15],
    [0, 13.9], [0, 19],
    [-19, 30], [19, 30], [0, 30]
  ];

  // --- boot -----------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    var svg = $('court');
    if (!svg || !D) return;
    S.court = D.drawCourt(svg, {});

    wireTabs();
    wireScrubber();
    wireSearch();

    var pid = pidFromUrl() || storedPid();
    ensureData(function () {
      if (!pid || S.data.ids.indexOf(pid) < 0) pid = defaultPid();
      setPlayer(pid, true);
    });
  }

  function ensureData(cb) {
    if (S.data) { cb(); return; }
    if (S.loading) { S.loading.push(cb); return; }
    S.loading = [cb];
    showCourtNote('Loading shot data…');
    fetch(DATA_URL, { cache: 'force-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        S.data = json;
        hideCourtNote();
        buildDatalist();
        var cbs = S.loading; S.loading = null;
        cbs.forEach(function (fn) { fn(); });
      })
      .catch(function (err) {
        S.loading = null;
        showCourtNote('Shot data failed to load (' + err.message +
          '). Check your connection and reload.');
      });
  }

  // --- player ----------------------------------------------------------------
  function pidFromUrl() {
    try {
      var m = /[?&]player=([^&]+)/.exec(window.location.search);
      return m ? decodeURIComponent(m[1]).toLowerCase().replace(/\+/g, ' ') : null;
    } catch (e) { return null; }
  }
  function storedPid() {
    try { return window.localStorage.getItem(STORE_KEY); } catch (e) { return null; }
  }
  function defaultPid() {
    var feat = S.data.feat ? Object.keys(S.data.feat) : [];
    if (feat.indexOf('lebron james') >= 0) return 'lebron james';
    if (feat.length) return feat[0];
    return S.data.ids[0];
  }
  function displayName(pid) {
    var i = S.data.ids.indexOf(pid);
    return i >= 0 ? S.data.names[i] : pid;
  }

  function buildDatalist() {
    var dl = $('player-list');
    if (!dl) return;
    var feat = S.data.feat || {};
    var html = '';
    // featured first
    Object.keys(feat).forEach(function (pid) {
      html += '<option value="' + esc(displayName(pid)) + '">';
    });
    S.data.ids.forEach(function (pid, i) {
      if (!feat[pid]) html += '<option value="' + esc(S.data.names[i]) + '">';
    });
    dl.innerHTML = html;
  }

  function setPlayer(pid, first) {
    S.pid = pid;
    try { window.localStorage.setItem(STORE_KEY, pid); } catch (e) {}
    var input = $('player-search');
    if (input) input.value = displayName(pid);
    var seasons = playerSeasons(pid);
    if (seasons.indexOf(S.season) < 0) {
      S.season = seasons[seasons.length - 1]; // latest
    }
    syncScrubber();
    if (!first) render();
    else render();
    updateUrl(pid);
  }

  function updateUrl(pid) {
    try {
      var url = new URL(window.location.href);
      url.searchParams.set('player', pid);
      window.history.replaceState(null, '', url.toString());
    } catch (e) {}
  }

  function playerSeasons(pid) {
    var i = S.data.ids.indexOf(pid);
    return i >= 0 ? S.data.seasons[i] : [];
  }
  function playerZones(pid, season) {
    var i = S.data.ids.indexOf(pid);
    if (i < 0) return null;
    var si = S.data.seasons[i].indexOf(season);
    return si >= 0 ? S.data.zones[i][si] : null;
  }
  function featEntry(pid) { return (S.data.feat || {})[pid] || null; }
  function featSeasonIndex(fe, season) {
    return fe ? fe.s.indexOf(season) : -1;
  }

  // --- wiring ------------------------------------------------------------------
  function wireTabs() {
    var tabs = document.querySelectorAll('[role="tab"]');
    for (var i = 0; i < tabs.length; i++) {
      (function (tab) {
        tab.addEventListener('click', function () { setTab(tab.dataset.tab); });
        tab.addEventListener('keydown', function (ev) {
          if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
            var list = Array.prototype.slice.call(tabs);
            var j = (list.indexOf(tab) +
              (ev.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length;
            list[j].focus(); setTab(list[j].dataset.tab);
          }
        });
      })(tabs[i]);
    }
  }
  function setTab(t) {
    S.tab = t;
    var tabs = document.querySelectorAll('[role="tab"]');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].dataset.tab === t;
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
      tabs[i].classList.toggle('is-active', on);
    }
    render();
  }

  function wireScrubber() {
    var sc = $('season-scrub');
    if (!sc) return;
    sc.addEventListener('input', function () {
      var seasons = playerSeasons(S.pid);
      var s = seasons[parseInt(sc.value, 10)];
      if (s && s !== S.season) { S.season = s; render(); }
    });
  }
  function syncScrubber() {
    var sc = $('season-scrub');
    var seasons = playerSeasons(S.pid);
    if (!sc) return;
    sc.min = '0';
    sc.max = String(seasons.length - 1);
    sc.value = String(Math.max(0, seasons.indexOf(S.season)));
    sc.setAttribute('aria-label', 'Season');
  }

  function wireSearch() {
    var input = $('player-search');
    if (!input) return;
    input.addEventListener('change', function () {
      var q = input.value.trim().toLowerCase();
      if (!q) return;
      var idx = -1;
      // exact display-name match first, then id match, then prefix
      for (var i = 0; i < S.data.names.length; i++) {
        if (S.data.names[i].toLowerCase() === q) { idx = i; break; }
      }
      if (idx < 0) {
        idx = S.data.ids.indexOf(q);
      }
      if (idx < 0) {
        for (var j = 0; j < S.data.names.length; j++) {
          if (S.data.names[j].toLowerCase().indexOf(q) === 0) { idx = j; break; }
        }
      }
      if (idx >= 0) setPlayer(S.data.ids[idx]);
      else input.value = displayName(S.pid); // revert on no match
    });
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // --- render ---------------------------------------------------------------
  function clearLayers() {
    [S.court.data, S.court.ghost, S.court.anno].forEach(function (g) {
      while (g.firstChild) g.removeChild(g.firstChild);
    });
  }

  function render() {
    if (!S.data || !S.pid) return;
    clearLayers();
    $('twins-panel').hidden = true;
    var seasons = playerSeasons(S.pid);
    $('season-label').textContent = S.season || '';
    $('season-name').textContent = displayName(S.pid);
    var empty = $('court-empty');
    empty.hidden = true;

    var drew = false;
    if (S.tab === 'shots') drew = renderShots();
    else if (S.tab === 'hex') drew = renderHex();
    else if (S.tab === 'zones') drew = renderZones();
    else if (S.tab === 'twins') drew = renderTwins();

    // vintage label — every view carries one
    $('vintage').textContent = S.data.vintage + ' · ' + S.tab.toUpperCase() +
      ' · ' + (S.season || '');
    if (!drew && empty.hidden) {
      showEmpty('No tracked shots for ' + displayName(S.pid) +
        ' in ' + S.season + '.');
    }
  }

  function showEmpty(msg) {
    var empty = $('court-empty');
    empty.hidden = false;
    $('court-empty-msg').textContent = msg;
  }
  function showCourtNote(msg) {
    var n = $('court-note');
    if (n) { n.hidden = false; n.textContent = msg; }
  }
  function hideCourtNote() {
    var n = $('court-note');
    if (n) n.hidden = true;
  }

  // --- shot of the night: ONE warm-glow highlight per view -------------------
  function drawSon(seasonIdx) {
    var fe = featEntry(S.pid);
    if (!fe) return;
    var son = fe.son[seasonIdx];
    if (!son) return;
    var x = son[0] / 1000, y = son[1] / 1000;
    var p = D.P(x, y);
    var g = S.court.anno;
    D.el('circle', {
      cx: r2(p[0]), cy: r2(p[1]), r: '1.15',
      fill: GLOW, filter: 'url(#vh-son-glow)', 'class': 'son-glow'
    }, g);
    // hand-drawn marker ring
    var ring = D.wobblePath(D.hexPoints(x, y, 1.5), 0.07,
      hashStr(S.pid + S.season));
    D.el('polygon', {
      points: ring.map(function (q) { return r2(q[0]) + ',' + r2(q[1]); }).join(' '),
      fill: 'none', stroke: RED, 'stroke-width': '0.14', 'class': 'son-ring'
    }, g);
    var dist = Math.round(Math.hypot(x, y) * 10) / 10;
    var t = D.el('text', {
      x: r2(p[0]), y: r2(p[1] - 2.2), 'class': 'court-callout',
      'text-anchor': 'middle'
    }, g);
    t.textContent = 'SHOT OF THE NIGHT · ' + dist + ' FT';
    // callout card under the court
    var card = $('son-card');
    card.hidden = false;
    $('son-text').textContent = displayName(S.pid) + ' · ' + S.season +
      ' — longest make from ' + dist + ' ft.';
  }
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i); h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // --- Shots tab ---------------------------------------------------------------
  function renderShots() {
    $('son-card').hidden = true;
    var fe = featEntry(S.pid);
    var fi = featSeasonIndex(fe, S.season);
    if (!fe || fi < 0) {
      if (fe) {
        showEmpty('Full shot dots are kept for the last ' + fe.s.length +
          ' seasons (' + fe.s[0] + ' to ' + fe.s[fe.s.length - 1] +
          ') — the Zones tab charts every season.');
      }
      return false;
    }
    var dots = fe.dots[fi];
    var g = S.court.data;
    for (var i = 0; i < dots.length; i++) {
      var x = dots[i][0] / 1000, y = dots[i][1] / 1000;
      var p = D.P(x, y);
      if (dots[i][2]) {
        D.el('circle', { cx: r2(p[0]), cy: r2(p[1]), r: '0.42',
          fill: INK, stroke: BOARD, 'stroke-width': '0.07',
          'class': 'dot dot-made' }, g);
      } else {
        D.el('circle', { cx: r2(p[0]), cy: r2(p[1]), r: '0.42',
          fill: 'none', stroke: INK, 'stroke-width': '0.10',
          'class': 'dot dot-miss' }, g);
      }
    }
    drawSon(fi);
    return dots.length > 0;
  }

  // --- Hex tab -----------------------------------------------------------------
  function renderHex() {
    $('son-card').hidden = true;
    var fe = featEntry(S.pid);
    var fi = featSeasonIndex(fe, S.season);
    if (!fe || fi < 0) {
      if (fe) {
        showEmpty('Hex maps are kept for the last ' + fe.s.length +
          ' seasons (' + fe.s[0] + ' to ' + fe.s[fe.s.length - 1] +
          ') — the Zones tab charts every season.');
      }
      return false;
    }
    var rows = fe.hex[fi];
    var g = S.court.data;
    for (var i = 0; i < rows.length; i++) {
      var c = D.hexCenter(rows[i][0], rows[i][1]);
      var vs = rows[i][3];
      var t = Math.min(1, Math.abs(vs) / 300);
      var fill, alpha = 0.18 + 0.62 * t;
      if (vs > 0) fill = MOSS; else if (vs < 0) fill = TERRA; else fill = PENCIL;
      var corners = D.hexPoints(c[0], c[1], D.GEOM.HEX_SIZE * 0.94);
      D.el('polygon', {
        points: corners.map(function (q) { return r2(q[0]) + ',' + r2(q[1]); }).join(' '),
        fill: fill, 'fill-opacity': r2(alpha),
        stroke: BOARD, 'stroke-width': '0.05', 'class': 'hex'
      }, g);
    }
    drawSon(fi);
    return rows.length > 0;
  }

  // paint before RA: the RA disc overlaps the paint rect and wins on top
  var ZONE_DRAW_ORDER = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1];

  // --- Zones tab -----------------------------------------------------------------
  function renderZones() {
    $('son-card').hidden = true;
    var zrows = playerZones(S.pid, S.season);
    if (!zrows) return false;
    var lg = S.data.zones_lg;
    var g = S.court.data;
    var total = 0, made = 0;
    var by = {};
    zrows.forEach(function (row) { by[row[0]] = [row[1], row[2]]; });
    for (var oi = 0; oi < ZONE_DRAW_ORDER.length; oi++) {
      var zi = ZONE_DRAW_ORDER[oi];
      var fga = by[zi] ? by[zi][0] : 0;
      var fgm = by[zi] ? by[zi][1] : 0;
      total += fga; made += fgm;
      var div = 0;
      if (fga >= 10 && lg[zi][0] > 0) {
        div = (fgm / fga - lg[zi][1] / lg[zi][0]) * 100;
      }
      var t = Math.min(1, Math.abs(div) / 15);
      var fill = PENCIL, alpha = 0.10;
      if (fga >= 10 && Math.abs(div) >= 1) {
        fill = div > 0 ? MOSS : TERRA;
        alpha = 0.15 + 0.55 * t;
      } else if (fga > 0) {
        alpha = 0.16;
      }
      D.el('path', { d: zonePath(zi), fill: fill, 'fill-opacity': r2(alpha),
        stroke: PENCIL, 'stroke-width': '0.05', 'class': 'zone',
        'data-zone': zi }, g);
      if (fga > 0) {
        var cp = D.P(ZONE_CENTROID[zi][0], ZONE_CENTROID[zi][1]);
        var label = D.ZONES[zi][0].replace(/_/g, ' ');
        var tx = D.el('text', { x: r2(cp[0]), y: r2(cp[1]),
          'class': 'court-zonelabel', 'text-anchor': 'middle' }, g);
        tx.textContent = label;
        if (fga >= 10) {
          var pct = D.el('text', { x: r2(cp[0]), y: r2(cp[1] + 1.35),
            'class': 'court-zonepct', 'text-anchor': 'middle' }, g);
          pct.textContent = Math.round(fgm / fga * 100) + '%';
        }
      }
    }
    // zone table
    var rows = [];
    for (var k = 0; k < 14; k++) {
      var zfga = by[k] ? by[k][0] : 0;
      var zfgm = by[k] ? by[k][1] : 0;
      var pct = zfga ? Math.round(zfgm / zfga * 100) : null;
      var zdiv = (zfga >= 10 && lg[k][0] > 0)
        ? Math.round((zfgm / zfga - lg[k][1] / lg[k][0]) * 100) : null;
      rows.push({ zi: k, fga: zfga, pct: pct, div: zdiv });
    }
    rows.sort(function (a, b) { return b.fga - a.fga; });
    var html = '<table class="zone-table"><thead><tr>' +
      '<th>Zone</th><th>FGA</th><th>FG%</th><th>vs league</th></tr></thead><tbody>';
    rows.forEach(function (row) {
      var dv = row.div === null ? '—'
        : (row.div > 0 ? '+' : '') + row.div + ' pts';
      var cls = row.div === null ? '' : (row.div > 0 ? 'pos' : (row.div < 0 ? 'neg' : ''));
      html += '<tr data-zone="' + row.zi + '"><td>' + esc(D.ZONES[row.zi][1]) +
        '</td><td>' + row.fga + '</td><td>' +
        (row.pct === null ? '—' : row.pct + '%') +
        '</td><td class="' + cls + '">' + dv + '</td></tr>';
    });
    html += '</tbody></table>';
    html += '<p class="fineprint">FG% vs league average across all tracked shots, ' +
      '2015-16 to present. Zone regions approximate.</p>';
    var panel = $('zone-panel');
    panel.innerHTML = html;
    panel.hidden = false;
    // hover a row -> emphasize the zone on court
    var trs = panel.querySelectorAll('tr[data-zone]');
    for (var i = 0; i < trs.length; i++) {
      (function (tr) {
        tr.addEventListener('mouseenter', function () {
          highlightZone(parseInt(tr.dataset.zone, 10));
        });
        tr.addEventListener('mouseleave', function () { highlightZone(-1); });
      })(trs[i]);
    }
    var sum = $('zone-sum');
    if (total > 0) {
      sum.textContent = displayName(S.pid) + ' · ' + S.season + ' — ' +
        made + '/' + total + ' (' + Math.round(made / total * 100) + '%)';
    } else {
      sum.textContent = '';
    }
    return total > 0;
  }
  function highlightZone(zi) {
    var paths = S.court.data.querySelectorAll('.zone');
    for (var i = 0; i < paths.length; i++) {
      var on = parseInt(paths[i].getAttribute('data-zone'), 10) === zi;
      paths[i].setAttribute('stroke', on ? BLUE : PENCIL);
      paths[i].setAttribute('stroke-width', on ? '0.22' : '0.05');
    }
  }

  // --- Twins tab -------------------------------------------------------------------
  var TWIN_DASH = ['', '1.4 0.9', '0.45 0.9'];
  function renderTwins() {
    $('son-card').hidden = true;
    $('zone-panel').hidden = true;
    $('zone-sum').textContent = '';
    var fe = featEntry(S.pid);
    if (!fe || !fe.twins || !fe.twins.length) {
      showEmpty('No embedding twins with shot data for ' +
        displayName(S.pid) + ' yet.');
      return false;
    }
    var g = S.court.ghost;
    var panel = $('twins-panel');
    var html = '';
    fe.twins.forEach(function (tw, i) {
      var tid = twinId(tw);
      var tfeat = tid ? featEntry(tid) : null;
      var seasonLabel = '', drewGhost = false;
      if (tfeat) {
        var li = tfeat.hex.length - 1;
        seasonLabel = tfeat.s[li];
        var rows = tfeat.hex[li];
        for (var k = 0; k < rows.length; k++) {
          if (rows[k][2] < 5) continue;
          var c = D.hexCenter(rows[k][0], rows[k][1]);
          var corners = D.hexPoints(c[0], c[1], D.GEOM.HEX_SIZE * 1.02);
          var attrs = {
            points: corners.map(function (q) {
              return r2(q[0]) + ',' + r2(q[1]);
            }).join(' '),
            fill: 'none', stroke: BLUE, 'stroke-width': '0.13',
            'stroke-opacity': (0.85 - i * 0.2).toString(),
            'class': 'twin-ghost twin-' + i
          };
          if (TWIN_DASH[i]) attrs['stroke-dasharray'] = TWIN_DASH[i];
          D.el('polygon', attrs, g);
          drewGhost = true;
        }
      }
      var sim = Math.round((tw.sim || 0) * 100);
      html += '<div class="twin-card">' +
        '<div class="twin-head"><span class="twin-swatch twin-' + i + '"></span>' +
        '<strong>' + esc(tw.n) + '</strong>' +
        '<span class="twin-sim">' + sim + '% similar</span></div>' +
        '<div class="twin-chips">' +
        tw.c.map(function (chip) {
          return '<span class="chip">' + esc(chip) + '</span>';
        }).join('') + '</div>' +
        '<div class="twin-diff">Differs most: ' + esc(tw.d) +
        (seasonLabel ? ' · ghost: ' + esc(seasonLabel) : '') + '</div>' +
        (drewGhost ? '' : '<div class="twin-diff">Shot map unavailable.</div>') +
        '</div>';
    });
    panel.innerHTML = html;
    panel.hidden = false;
    // faint base dots for context: player's own latest hex as pencil wash
    var fi = featSeasonIndex(fe, S.season);
    if (fi < 0) fi = fe.hex.length - 1;
    return true;
  }
  function twinId(tw) {
    if (tw.id) return tw.id;
    // twins store display name; resolve back to a feat id by normalized name
    var want = normName(tw.n);
    var keys = Object.keys(S.data.feat || {});
    for (var i = 0; i < keys.length; i++) {
      if (normName(keys[i]) === want) return keys[i];
    }
    return null;
  }
  function normName(s) {
    return String(s).toLowerCase().replace(/[.']/g, '').replace(/-/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  window.VHCourtLab = { setPlayer: setPlayer, setTab: setTab };
})();

/* Vector Hoops — assets/drift.js
 * The League Drift page (drift.html): renders the season-to-season
 * rotation timeline (SVG line/area chart), the biggest-shifts table, and
 * the method quote — all straight from assets/drift.json (pipeline/
 * procrustes_drift.py). Same svgEl / native-<title>-tooltip pattern as
 * the career-arc and breakdown charts in assets/game.js, kept standalone
 * here since this page never loads game.js.
 */
(function () {
  'use strict';

  var DRIFT_URL = 'assets/drift.json';
  var ARCH_URL = 'assets/archetypes_time.json';
  var TRAJ_URL = 'assets/trajectories.json';
  var EMERGENCE_URL = 'assets/archetype_emergence.json';
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var ORANGE_HEX = '#eb6834';
  var BLUE_HEX = '#2a78d6';
  var INK = '#111111';
  var INK_MUTED = '#898781';
  var HAIRLINE = '#e1e0d9';
  var SURFACE_HEX = '#ffffff';
  var HOT_HEX = '#006300';
  var COLD_HEX = '#d03b3b';

  // 8 cluster hues, fixed order — the SAME validated palette as the 3D map's
  // archetype color mode (assets/game.js PALETTE). globalArchetypes in
  // archetypes_time.json is emitted in the identical order as vectors.json
  // clusters, so index i here always names the same archetype as PALETTE[i]
  // does on the map.
  var ARCH_PALETTE = ['#3987e5', '#c98500', '#199e70', '#9085e9', '#e66767', '#008300', '#d55181', '#d95926'];

  // The math finds the spikes; these labels are our own read of known
  // league events near them — stated as observations, not derived facts.
  // Each `to` matches a pair's "to" season in drift.json exactly.
  var ANNOTATIONS = [
    { to: '1998-99', label: 'Lockout' },
    { to: '2004-05', label: 'Hand-check rules' },
    { to: '2011-12', label: 'Lockout' },
    { to: '2019-20', label: 'COVID bubble' },
    { to: '2021-22', label: 'Post-bubble spacing' }
  ];

  var ARCHETYPE_ERAS = [
    { label: '1996–2003', lo: '1996-97', hi: '2002-03', fill: 'rgba(57,135,229,0.10)', stroke: '#3987e5' },
    { label: '2003–2009', lo: '2003-04', hi: '2008-09', fill: 'rgba(25,158,112,0.10)', stroke: '#199e70' },
    { label: '2009–2015', lo: '2009-10', hi: '2014-15', fill: 'rgba(201,133,0,0.10)', stroke: '#c98500' },
    { label: '2015–2021', lo: '2015-16', hi: '2020-21', fill: 'rgba(144,133,233,0.10)', stroke: '#9085e9' },
    { label: '2021–2026', lo: '2021-22', hi: '2025-26', fill: 'rgba(235,104,52,0.10)', stroke: '#eb6834' }
  ];

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function svgEl(tag, attrs, parent) {
    var el = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

  function featureList(mostRotated) {
    return mostRotated.map(function (m) {
      return m.feature + ' (' + m.axisDrift + ')';
    }).join(', ');
  }

  function eraBandsForPairs(pairs, xOf, LEFT, W, RIGHT, n) {
    var bands = [];
    ARCHETYPE_ERAS.forEach(function (era) {
      var idxs = [];
      pairs.forEach(function (p, i) {
        if (p.to >= era.lo && p.to <= era.hi) idxs.push(i);
      });
      if (!idxs.length) return;
      var i0 = idxs[0], i1 = idxs[idxs.length - 1];
      var x0 = i0 === 0 ? LEFT : (xOf(i0 - 1) + xOf(i0)) / 2;
      var x1 = i1 === n - 1 ? W - RIGHT : (xOf(i1) + xOf(i1 + 1)) / 2;
      bands.push({ era: era, x0: x0, x1: x1 });
    });
    return bands;
  }

  function biggestShiftRanks(biggestShifts) {
    var map = {};
    (biggestShifts || []).forEach(function (p, rank) {
      map[p.to] = rank + 1;
    });
    return map;
  }

  function renderEraLegend(host) {
    if (!host) return;
    host.innerHTML = ARCHETYPE_ERAS.map(function (era) {
      return '<li class="drift-era-legend__item">' +
        '<span class="drift-era-legend__swatch" style="background:' + era.fill + ';border-color:' + era.stroke + '"></span>' +
        '<span class="drift-era-legend__label">' + era.label + '</span></li>';
    }).join('');
  }

  function renderChart(host, pairs, biggestShifts) {
    host.innerHTML = '';
    host.removeAttribute('aria-label');

    var W = 880, LEFT = 46, RIGHT = 20, TOP = 58, BOT = 34;
    var H = 352;
    var plotW = W - LEFT - RIGHT, plotH = H - TOP - BOT;
    var n = pairs.length;
    var shiftRank = biggestShiftRanks(biggestShifts);

    var maxVal = pairs.reduce(function (m, p) { return Math.max(m, p.rotationDeg); }, 0);
    var yMax = Math.max(15, Math.ceil((maxVal + 1) / 5) * 5);

    function xOf(i) { return n <= 1 ? LEFT + plotW / 2 : LEFT + (i / (n - 1)) * plotW; }
    function yOf(v) { return TOP + (1 - v / yMax) * plotH; }

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      role: 'img',
      'aria-label': 'League rotation in degrees, ' + pairs[0].from + ' through ' + pairs[n - 1].to,
      'font-family': getComputedStyle(document.body).fontFamily
    }, host);

    var bands = eraBandsForPairs(pairs, xOf, LEFT, W, RIGHT, n);
    bands.forEach(function (band, bi) {
      svgEl('rect', {
        x: band.x0, y: TOP, width: band.x1 - band.x0, height: plotH,
        fill: band.era.fill, stroke: 'none'
      }, svg);
      if (bi > 0) {
        svgEl('line', {
          x1: band.x0, y1: TOP, x2: band.x0, y2: TOP + plotH,
          stroke: band.era.stroke, 'stroke-width': 1.5, 'stroke-dasharray': '4 3', opacity: 0.65
        }, svg);
      }
      var cx = (band.x0 + band.x1) / 2;
      svgEl('text', {
        x: cx, y: 16, 'text-anchor': 'middle', 'font-size': 10,
        'font-weight': 700, fill: band.era.stroke
      }, svg).textContent = band.era.label;
    });

    for (var g = 0; g <= yMax; g += 5) {
      var gy = yOf(g);
      svgEl('line', {
        x1: LEFT, y1: gy, x2: W - RIGHT, y2: gy,
        stroke: g === 0 ? INK : HAIRLINE, 'stroke-width': g === 0 ? 1.5 : 1
      }, svg);
      svgEl('text', {
        x: LEFT - 8, y: gy + 3, 'text-anchor': 'end', 'font-size': 9, fill: INK_MUTED
      }, svg).textContent = g + '°';
    }

    var areaD = 'M ' + xOf(0) + ' ' + yOf(0) + ' ';
    pairs.forEach(function (p, i) { areaD += 'L ' + xOf(i) + ' ' + yOf(p.rotationDeg) + ' '; });
    areaD += 'L ' + xOf(n - 1) + ' ' + yOf(0) + ' Z';
    svgEl('path', { d: areaD, fill: 'rgba(235, 104, 52, 0.12)', stroke: 'none' }, svg);

    var lineD = pairs.map(function (p, i) { return xOf(i) + ',' + yOf(p.rotationDeg); }).join(' ');
    svgEl('polyline', { points: lineD, fill: 'none', stroke: ORANGE_HEX, 'stroke-width': 2 }, svg);

    var xLabelStep = Math.max(1, Math.ceil(n / 10));
    pairs.forEach(function (p, i) {
      var cx = xOf(i), cy = yOf(p.rotationDeg);
      var rank = shiftRank[p.to];
      var r = rank ? 5 : 3.5;
      var dot = svgEl('circle', {
        cx: cx, cy: cy, r: r, fill: ORANGE_HEX, style: 'cursor:pointer'
      }, svg);
      dot.addEventListener('click', function () {
        if (window.VHTrendsViz) window.VHTrendsViz.setPair(i);
      });
      var title = document.createElementNS(SVG_NS, 'title');
      title.textContent = p.from + ' → ' + p.to + ': ' + p.rotationDeg + '° rotation, ' +
        p.sharedPlayers + ' shared players, residual ' + p.residual +
        (rank ? ' (#' + rank + ' biggest shift)' : '') +
        '. Most-rotated features: ' + featureList(p.mostRotated) + '.';
      dot.appendChild(title);

      if (rank) {
        svgEl('circle', {
          cx: cx, cy: cy, r: 9, fill: 'none', stroke: ORANGE_HEX, 'stroke-width': 2.5, opacity: 0.9
        }, svg);
        svgEl('text', {
          x: cx, y: cy - 12, 'text-anchor': 'middle', 'font-size': 9,
          'font-weight': 800, fill: ORANGE_HEX
        }, svg).textContent = '#' + rank;
      }

      if (i % xLabelStep === 0 || i === n - 1) {
        svgEl('text', {
          x: cx, y: H - 10, 'text-anchor': 'middle', 'font-size': 9, fill: INK_MUTED
        }, svg).textContent = "'" + p.to.slice(2, 4);
      }
    });

    ANNOTATIONS.forEach(function (a, ai) {
      var idx = -1;
      for (var i = 0; i < n; i++) { if (pairs[i].to === a.to) { idx = i; break; } }
      if (idx < 0) return;
      var cx = xOf(idx), cy = yOf(pairs[idx].rotationDeg);
      var labelY = ai % 2 === 0 ? 30 : 44;
      svgEl('line', {
        x1: cx, y1: cy - 6, x2: cx, y2: labelY + 6,
        stroke: BLUE_HEX, 'stroke-width': 1, 'stroke-dasharray': '2 2'
      }, svg);
      svgEl('circle', { cx: cx, cy: cy, r: 5.5, fill: 'none', stroke: BLUE_HEX, 'stroke-width': 2 }, svg);
      svgEl('text', {
        x: cx, y: labelY, 'text-anchor': 'middle', 'font-size': 9,
        'font-weight': 700, fill: BLUE_HEX
      }, svg).textContent = a.label;
    });
  }

  function renderShiftsTable(table, shifts) {
    var tbody = table.querySelector('tbody');
    tbody.innerHTML = shifts.map(function (p) {
      var interp = p.interpretation
        ? '<td class="drift-interpret">' + escapeHtml(p.interpretation) + '</td>'
        : '<td class="drift-interpret">—</td>';
      return '<tr>' +
        '<td>' + escapeHtml(p.from) + ' → ' + escapeHtml(p.to) + '</td>' +
        '<td>' + p.rotationDeg + '°</td>' +
        '<td>' + p.residual + '</td>' +
        '<td>' + p.sharedPlayers + '</td>' +
        '<td>' + escapeHtml(featureList(p.mostRotated)) + '</td>' +
        interp +
        '</tr>';
    }).join('');
  }

  function showError(host) {
    host.innerHTML = '';
    host.setAttribute('aria-label', 'Drift chart failed to load');
    var p = document.createElement('p');
    p.className = 'drift-loading';
    p.textContent = 'Could not load the drift data (assets/drift.json). Try reloading.';
    host.appendChild(p);
  }

  function pct1(v) { return (v * 100).toFixed(1) + '%'; }

  function truncateName(name, max) {
    var lim = max || 28;
    if (!name || name.length <= lim) return name || '';
    return name.slice(0, lim - 1) + '…';
  }

  function eraBandsForSeasons(seasons, xOf, LEFT, W, RIGHT, TOP, plotH, n) {
    var bands = [];
    ARCHETYPE_ERAS.forEach(function (era) {
      var idxs = [];
      seasons.forEach(function (s, i) {
        if (s >= era.lo && s <= era.hi) idxs.push(i);
      });
      if (!idxs.length) return;
      var i0 = idxs[0], i1 = idxs[idxs.length - 1];
      var x0 = i0 === 0 ? LEFT : (xOf(i0 - 1) + xOf(i0)) / 2;
      var x1 = i1 === n - 1 ? W - RIGHT : (xOf(i1) + xOf(i1 + 1)) / 2;
      bands.push({ era: era, x0: x0, x1: x1 });
    });
    return bands;
  }

  function collapsedPathSegments(path) {
    var segs = [];
    (path || []).forEach(function (p) {
      if (segs.length && segs[segs.length - 1].archetype === p.archetype) {
        segs[segs.length - 1].count += 1;
      } else {
        segs.push({ archetype: p.archetype, count: 1 });
      }
    });
    return segs;
  }

  function archIndex(name, names) {
    var i = (names || []).indexOf(name);
    return i >= 0 ? i : 0;
  }

  // -------------------------------------------------------------------
  // The Archetype Eras (assets/archetypes_time.json): stream chart,
  // biggest-shifts table, five era panels with lineage.
  // -------------------------------------------------------------------

  function renderArchetypeStream(host, legendHost, data) {
    host.innerHTML = '';
    host.removeAttribute('aria-label');

    var names = data.globalArchetypes;
    var prevalence = data.prevalence;
    var n = prevalence.length;
    var K = names.length;

    var W = 880, LEFT = 40, RIGHT = 16, TOP = 42, BOT = 34;
    var H = 352;
    var plotW = W - LEFT - RIGHT, plotH = H - TOP - BOT;
    var seasons = prevalence.map(function (p) { return p.season; });

    function xOf(i) { return n <= 1 ? LEFT + plotW / 2 : LEFT + (i / (n - 1)) * plotW; }
    function yOf(v) { return TOP + (1 - v) * plotH; }

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      role: 'img',
      'aria-label': 'Archetype share of the league, ' + prevalence[0].season + ' through ' + prevalence[n - 1].season,
      'font-family': getComputedStyle(document.body).fontFamily
    }, host);

    var bands = eraBandsForSeasons(seasons, xOf, LEFT, W, RIGHT, TOP, plotH, n);
    bands.forEach(function (band, bi) {
      svgEl('rect', {
        x: band.x0, y: TOP, width: band.x1 - band.x0, height: plotH,
        fill: band.era.fill, stroke: 'none'
      }, svg);
      if (bi > 0) {
        svgEl('line', {
          x1: band.x0, y1: TOP, x2: band.x0, y2: TOP + plotH,
          stroke: band.era.stroke, 'stroke-width': 1.5, 'stroke-dasharray': '4 3', opacity: 0.55
        }, svg);
      }
      svgEl('text', {
        x: (band.x0 + band.x1) / 2, y: 14, 'text-anchor': 'middle', 'font-size': 9,
        'font-weight': 700, fill: band.era.stroke
      }, svg).textContent = band.era.label;
    });

    // cumulative share stack per season, bottom-to-top in archetype order
    var cum = prevalence.map(function (p) {
      var c = [], running = 0;
      for (var k = 0; k < K; k++) { running += p.shares[k] || 0; c.push(running); }
      return c;
    });

    // gridlines every 25%
    for (var g = 0; g <= 4; g++) {
      var frac = g / 4;
      var gy = yOf(frac);
      svgEl('line', {
        x1: LEFT, y1: gy, x2: W - RIGHT, y2: gy,
        stroke: g === 0 ? INK : HAIRLINE, 'stroke-width': g === 0 ? 1.5 : 1
      }, svg);
      svgEl('text', {
        x: LEFT - 8, y: gy + 3, 'text-anchor': 'end', 'font-size': 9, fill: INK_MUTED
      }, svg).textContent = Math.round(frac * 100) + '%';
    }

    // stacked bands, bottom archetype first — a 2px surface-colored stroke
    // on every band separates touching fills (no border-as-separator).
    for (var k = 0; k < K; k++) {
      var d = 'M ' + xOf(0) + ' ' + yOf(k === 0 ? 0 : cum[0][k - 1]) + ' ';
      for (var i = 0; i < n; i++) d += 'L ' + xOf(i) + ' ' + yOf(cum[i][k]) + ' ';
      for (var j = n - 1; j >= 0; j--) d += 'L ' + xOf(j) + ' ' + yOf(k === 0 ? 0 : cum[j][k - 1]) + ' ';
      d += 'Z';
      svgEl('path', {
        d: d, fill: ARCH_PALETTE[k % ARCH_PALETTE.length],
        stroke: SURFACE_HEX, 'stroke-width': 1.5, 'stroke-linejoin': 'round'
      }, svg);
    }

    // per-season invisible hit columns + native tooltip listing every
    // archetype's share that season (same title-tooltip pattern as the
    // rotation chart above).
    var step = n > 1 ? plotW / (n - 1) : plotW;
    prevalence.forEach(function (p, i) {
      var cx = xOf(i);
      var hit = svgEl('rect', {
        x: Math.max(LEFT, cx - step / 2), y: TOP, width: step, height: plotH,
        fill: 'transparent'
      }, svg);
      var lines = names.map(function (nm, k) { return nm + ': ' + pct1(p.shares[k] || 0); });
      var title = document.createElementNS(SVG_NS, 'title');
      title.textContent = p.season + ' (n=' + p.n + ') — ' + lines.join(', ');
      hit.appendChild(title);
    });

    var xLabelStep = Math.max(1, Math.ceil(n / 10));
    prevalence.forEach(function (p, i) {
      if (i % xLabelStep === 0 || i === n - 1) {
        svgEl('text', {
          x: xOf(i), y: H - 10, 'text-anchor': 'middle', 'font-size': 9, fill: INK_MUTED
        }, svg).textContent = "'" + p.season.slice(2, 4);
      }
    });

    if (legendHost) {
      // v25: readable chips with full names, wrapping flex, not tiny monospace, tooltip
      legendHost.className = 'era-legend';
      legendHost.id = 'archetype-legend';
      legendHost.innerHTML = names.map(function (nm, k) {
        var col = ARCH_PALETTE[k % ARCH_PALETTE.length];
        return '<li class="archetype-legend__item" title="' + escapeHtml(nm) + ' — full league share, click era to filter">' +
          '<span class="archetype-legend__swatch" style="background:' + col + '"></span>' +
          '<span>' + escapeHtml(nm) + '</span></li>';
      }).join('');
    }
  }

  // Narrative-driven archetype narrative — v25 clean readable, no aggressive truncation, proper spacing
  function renderArchetypeEraNarrative(host, data) {
    if (!host || !data || !data.eras) return;
    var eras = data.eras;
    var shifts = data.biggestShifts || [];
    function topSorted(era){ return era.archetypes.slice().sort(function(a,b){return b.share - a.share;}); }
    function glassPct(era){
      return Math.round(era.archetypes.reduce(function(s,a){ return /Glass|Rim|Interior/i.test(a.name) ? s + a.share : s; },0)*100);
    }
    var s0 = eras[0] ? topSorted(eras[0])[0] : null;
    var s1 = eras[1] ? topSorted(eras[1])[0] : null;
    var s1b = eras[1] ? topSorted(eras[1])[1] : null;
    var s2 = eras[2] ? topSorted(eras[2])[0] : null;
    var s3 = eras[3] ? topSorted(eras[3]) : [];
    var s4 = eras[4] ? topSorted(eras[4])[0] : null;

    var story = '';

    if (eras[0] && s0){
      story += '<p><span class="arch-era-kicker">1996–2003</span> <span class="arch-era-sentence">League was still <strong>paint-built</strong>. <strong>' + escapeHtml(s0.name) + '</strong> led at <strong>' + Math.round(s0.share*100) + '%</strong>. Bigs who rebounded and blocked — ' + glassPct(eras[0]) + '% combined glass/rim types.</span></p>';
    }
    if (eras[1] && s1){
      story += '<p><span class="arch-era-kicker">2003–2009</span> <span class="arch-era-sentence"><strong>Transition.</strong> <strong>' + escapeHtml(s1.name) + '</strong> on top' + (s1b ? ' ('+Math.round(s1b.share*100)+'%)' : '') + ' — diversity peaked, effective types 7.7. Playmaking guards held share.</span></p>';
    }
    if (eras[2] && s2){
      story += '<p><span class="arch-era-kicker">2009–2015</span> <span class="arch-era-sentence">Protection still king: <strong>' + escapeHtml(s2.name) + '</strong> ' + Math.round(s2.share*100) + '% share. Spacing tags just 12% of league.</span></p>';
    }
    if (eras[3] && s3.length){
      var top3 = s3.slice(0,3).map(function(a){ return escapeHtml(a.name)+' '+Math.round(a.share*100)+'%'; }).join(', ');
      story += '<p><span class="arch-era-kicker">2015–2021</span> <span class="arch-era-sentence"><strong>The flip.</strong> Top three are now all perimeter shooting — ' + top3 + '. That is the Warriors/Curry effect in the stream.</span></p>';
    }
    if (eras[4] && s4){
      var shiftLine = '';
      if (shifts.length >= 2){
        var pure = shifts.find(function(sh){ return /Glass.*Rim/i.test(sh.archetype); }) || shifts[0];
        var newcomer = shifts.find(function(sh){ return sh.delta > 0; }) || shifts[1];
        shiftLine = ' Pure <em>' + escapeHtml(pure.archetype) + '</em> went 28%→0% (' + (pure.delta*100).toFixed(1) + 'pp) replaced by <em>' + escapeHtml(newcomer.archetype) + '</em> +' + (newcomer.delta*100).toFixed(1) + 'pp.';
      }
      story += '<p><span class="arch-era-kicker">2021–2026</span> <span class="arch-era-sentence">Modern hybrid: <strong>' + escapeHtml(s4.name) + '</strong> ' + Math.round(s4.share*100) + '% — bigs who shoot <em>and</em> board.' + shiftLine + '</span></p>';
    }

    host.innerHTML = story;
  }

  function renderArchetypeShiftsChart(host, shifts) {
    if (!host || !shifts || !shifts.length) return;
    // v25: rewrite as HTML for readability — no SVG overlapping "-18.4pp" text. Row 44px, bar 14px rounded.
    var maxAbs = shifts.reduce(function (m, s) { return Math.max(m, Math.abs(s.delta)); }, 0.01);
    var rows = shifts.map(function (s) {
      var up = s.delta >= 0;
      var pct = Math.abs(s.delta) / maxAbs;
      var barW = Math.max(6, Math.round(pct * 46)); // percent of total width (of half)
      var deltaText = (up ? '+' : '') + (s.delta * 100).toFixed(1) + 'pp';
      var tooltip = s.archetype + ': ' + pct1(s.early) + ' early → ' + pct1(s.late) + ' late (' + deltaText + ')';
      var barStyle;
      if (up) {
        barStyle = 'left:50%; width:' + barW + '%;';
      } else {
        barStyle = 'right:50%; width:' + barW + '%; left:auto;';
      }
      // full archetype name, 2 lines max via CSS clamp
      return '<div class="arch-shift-row" title="' + escapeHtml(tooltip) + '">' +
        '<div class="arch-shift-label">' + escapeHtml(s.archetype) + '</div>' +
        '<div class="arch-shift-bar-wrap">' +
          '<div class="arch-shift-bar-center" aria-hidden="true"></div>' +
          '<div class="arch-shift-bar ' + (up ? 'arch-shift-bar--up' : 'arch-shift-bar--down') + '" style="' + barStyle + '"></div>' +
        '</div>' +
        '<div class="arch-shift-delta ' + (up ? 'arch-shift-delta--up' : 'arch-shift-delta--down') + '">' + escapeHtml(deltaText) + '</div>' +
      '</div>';
    }).join('');

    host.innerHTML = '<div class="arch-shifts-list" role="list" aria-label="Archetype share change, early five vs late five">' + rows + '</div>';
  }

  function renderEraPanelsCompact(host, eras) {
    if (!host || !eras) return;
    // v25: show full names, not 22 chars truncated, 2-line wrap via CSS
    host.innerHTML = eras.map(function (era) {
      var sorted = era.archetypes.slice().sort(function (a, b) { return b.share - a.share; });
      var top = sorted.slice(0, 3);
      var sentence = '';
      if (era.era === '1996-2003') sentence = 'Early league was ' + Math.round(top[0].share*100) + '% ' + escapeHtml(top[0].name) + ' + ' + Math.round(top[1].share*100) + '% ' + escapeHtml(top[1].name) + ' — anchor bigs + score-first wings.';
      else if (era.era === '2003-2009') sentence = 'Middle era mixed ' + top.map(function(t){ return escapeHtml(t.name)+' '+Math.round(t.share*100)+'%';}).join(' / ') + '. Playmaking held.';
      else if (era.era === '2009-2015') sentence = 'Defense still paid: ' + escapeHtml(top[0].name) + ' ' + Math.round(top[0].share*100) + '%. Offense shifted to volume.';
      else if (era.era === '2015-2021') sentence = 'Spacing era: ' + top.slice(0,2).map(function(t){return escapeHtml(t.name)+' '+Math.round(t.share*100)+'%';}).join(' + ') + ' led.';
      else sentence = 'Today: ' + top.map(function(t){return escapeHtml(t.name)+' '+Math.round(t.share*100)+'%';}).join(', ') + ' — hybrids.';
      var bars = top.map(function (item) {
        var pct = Math.round(item.share * 100);
        // full name, CSS clamps to 2 lines
        return '<div class="era-compact-bar" title="' + escapeHtml(item.name) + ' — ' + pct1(item.share) + '"><span class="era-compact-bar__name">' + escapeHtml(item.name) + '</span><span class="era-compact-bar__track"><span class="era-compact-bar__fill" style="width:' + pct + '%"></span></span><span class="era-compact-bar__pct">' + pct + '%</span></div>';
      }).join('');
      return '<div class="era-compact-card"><div class="era-compact-card__head">' + escapeHtml(era.era) + '<span>K=' + (era.k || 8) + '</span></div><p class="era-compact-sen">' + sentence + '</p>' + bars + '</div>';
    }).join('');
  }

  // -------------------------------------------------------------------
  // Court heatmap
  // -------------------------------------------------------------------

  var ZONE_META = [
    { key: 'rim', label: 'Rim', layer: 'off', group: 'paint' },
    { key: 'paintFT', label: 'FT / paint', layer: 'off', group: 'paint' },
    { key: 'mid', label: 'Midrange', layer: 'off', group: 'mid' },
    { key: 'arc', label: 'Beyond arc', layer: 'off', group: 'arc' },
    { key: 'oreb', label: 'Off. glass', layer: 'off', group: 'glass' },
    { key: 'ast', label: 'Playmaking', layer: 'off', group: 'ast' },
    { key: 'paintD', label: 'Rim protection', layer: 'def', group: 'paintD' },
    { key: 'perimeterD', label: 'Perimeter D', layer: 'def', group: 'periD' },
    { key: 'glassD', label: 'Def. glass', layer: 'def', group: 'glassD' }
  ];

  var COURT_TAG_LABELS = {
    three_and_d: '3-and-D wing',
    stretch_big: 'Stretch big',
    traditional_big: 'Traditional big',
    spacing_role: 'Spacing role',
    two_way_perimeter: 'Two-way perimeter',
    primary_creator: 'Primary creator',
    volume_scorer: 'Volume scorer'
  };

  var courtState = {
    mode: 'era',
    eraIdx: 0,
    data: null,
    heat: null
  };

  function zoneScale(mode) {
    return mode === 'diff' ? 0.25 : 0.75;
  }

  function zoneAlpha(v, mode) {
    var t = Math.abs(v) / zoneScale(mode);
    if (t > 1) t = 1;
    if (t < 0.03) return 0;
    return 0.14 + t * 0.58;
  }

  var COURT_LABEL_POS = {
    rim: { x: 25, y: 8.4, short: 'RIM' },
    paintFT: { x: 25, y: 16.6, short: 'FTA' },
    mid: { x: 10.2, y: 11.4, short: 'MID' },
    arc: { x: 25, y: 33.5, short: '3PT' },
    oreb: { x: 10.5, y: 3.2, short: 'OREB' },
    paintD: { x: 31.2, y: 12.6, short: 'BLK' },
    perimeterD: { x: 43.6, y: 27.5, short: 'STL' },
    glassD: { x: 39.5, y: 3.2, short: 'DREB' }
  };

  function courtZoneLabel(ctx, g, key, v, mode) {
    var pos = COURT_LABEL_POS[key];
    if (!pos || Math.abs(v) < 0.025) return;
    var up = v >= 0;
    var rgbHex = mode === 'diff'
      ? (up ? '#006300' : '#c62828')
      : (up ? '#c45a1f' : '#1f5fbf');
    var px = g.X(pos.x), py = g.Y(pos.y);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + Math.max(7.5, 1.55 * g.s) + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    var w = ctx.measureText(pos.short).width + 6;
    ctx.fillRect(px - w / 2, py - 7, w, 14);
    ctx.fillStyle = '#111111';
    ctx.font = '600 ' + Math.max(6.5, 1.35 * g.s) + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(pos.short, px, py - 1);
    ctx.font = '700 ' + Math.max(7.5, 1.55 * g.s) + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = rgbHex;
    // Drift magnitude in z-space, not a per-stat rate: this is a composite,
    // so there is no per-100 number to convert it into. Say SD, not sigma.
    var sig = (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) + ' SD';
    ctx.fillText(sig, px, py + 8);
    ctx.restore();
  }

  function courtGeometry(w, h) {
    var s = w / 50;
    var g = {
      s: s, w: w, h: h,
      RIM: { x: 25, y: 5.25 },
      RA: 4, R3: 23.75, CORNER: 22,
      KEY_W: 16, KEY_H: 19, FT_R: 6
    };
    g.X = function (ft) { return ft * s; };
    g.Y = function (ft) { return h - ft * s; };
    g.breakY = g.RIM.y + Math.sqrt(g.R3 * g.R3 - g.CORNER * g.CORNER);
    g.leftAngle = Math.atan2(g.Y(g.breakY) - g.Y(g.RIM.y), g.X(25 - g.CORNER) - g.X(g.RIM.x));
    g.rightAngle = Math.atan2(g.Y(g.breakY) - g.Y(g.RIM.y), g.X(25 + g.CORNER) - g.X(g.RIM.x));
    return g;
  }

  function pathRA(ctx, g) {
    ctx.arc(g.X(g.RIM.x), g.Y(g.RIM.y), g.RA * g.s, 0, Math.PI * 2);
  }
  function pathKey(ctx, g) {
    ctx.rect(g.X(25 - g.KEY_W / 2), g.Y(g.KEY_H), g.KEY_W * g.s, g.KEY_H * g.s);
  }
  function pathInside3(ctx, g) {
    ctx.moveTo(g.X(25 - g.CORNER), g.Y(0));
    ctx.lineTo(g.X(25 - g.CORNER), g.Y(g.breakY));
    ctx.arc(g.X(g.RIM.x), g.Y(g.RIM.y), g.R3 * g.s, g.leftAngle, g.rightAngle, false);
    ctx.lineTo(g.X(25 + g.CORNER), g.Y(0));
    ctx.closePath();
  }
  function pathCourt(ctx, g) {
    ctx.rect(0, 0, g.w, g.h);
  }

  function fillSigned(ctx, g, builders, v, mode) {
    var a = zoneAlpha(v, mode);
    if (a <= 0) return;
    var up = v >= 0;
    var rgb = up ? '0,99,0' : '198,40,40';
    if (mode !== 'diff') rgb = up ? '235,104,52' : '42,120,214';
    ctx.save();
    ctx.beginPath();
    builders.forEach(function (b) { b(ctx, g); });
    ctx.fillStyle = 'rgba(' + rgb + ',' + a.toFixed(3) + ')';
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(' + rgb + ',' + Math.min(0.95, a + 0.28).toFixed(3) + ')';
    ctx.lineWidth = Math.max(1, g.s * 0.11);
    ctx.stroke();
    ctx.restore();
  }

  function hatchSigned(ctx, g, builders, v, mode, mirror) {
    var a = zoneAlpha(v, mode);
    if (a <= 0) return;
    var rgb = mode === 'diff'
      ? (v >= 0 ? '0,99,0' : '198,40,40')
      : '30,100,200';
    ctx.save();
    ctx.beginPath();
    builders.forEach(function (b) { b(ctx, g); });
    ctx.clip('evenodd');
    ctx.strokeStyle = 'rgba(' + rgb + ',' + Math.min(0.95, a + 0.22).toFixed(3) + ')';
    ctx.lineWidth = Math.max(1.2, g.s * 0.18);
    var step = 2.1 * g.s;
    var span = g.w + g.h;
    ctx.beginPath();
    for (var d = -span; d <= span; d += step) {
      if (mirror) {
        ctx.moveTo(d, 0);
        ctx.lineTo(d - span, span);
      } else {
        ctx.moveTo(d, 0);
        ctx.lineTo(d + span, span);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawCourtLinesLite(ctx, g) {
    ctx.save();
    ctx.strokeStyle = 'rgba(17,17,17,0.9)';
    ctx.lineWidth = Math.max(1.2, g.s * 0.11);
    ctx.strokeRect(0.5, 0.5, g.w - 1, g.h - 1);
    ctx.strokeRect(g.X(25 - g.KEY_W / 2), g.Y(g.KEY_H), g.KEY_W * g.s, g.KEY_H * g.s);
    ctx.beginPath();
    ctx.arc(g.X(25), g.Y(g.KEY_H), g.FT_R * g.s, Math.PI, 0, false);
    ctx.stroke();
    ctx.beginPath();
    pathRA(ctx, g);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(g.X(22), g.Y(4));
    ctx.lineTo(g.X(28), g.Y(4));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(g.X(g.RIM.x), g.Y(g.RIM.y), 0.75 * g.s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(g.X(25 - g.CORNER), g.Y(0));
    ctx.lineTo(g.X(25 - g.CORNER), g.Y(g.breakY));
    ctx.moveTo(g.X(25 + g.CORNER), g.Y(0));
    ctx.lineTo(g.X(25 + g.CORNER), g.Y(g.breakY));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(g.X(g.RIM.x), g.Y(g.RIM.y), g.R3 * g.s, g.leftAngle, g.rightAngle, false);
    ctx.stroke();
    ctx.restore();
  }

  function paintZones(ctx, g, zones, mode) {
    fillSigned(ctx, g, [pathRA], zones.rim || 0, mode);
    fillSigned(ctx, g, [pathKey, pathRA], zones.paintFT || 0, mode);
    fillSigned(ctx, g, [pathInside3, pathKey], zones.mid || 0, mode);
    fillSigned(ctx, g, [pathCourt, pathInside3], zones.arc || 0, mode);
    hatchSigned(ctx, g, [pathKey], zones.paintD || 0, mode, false);
    hatchSigned(ctx, g, [pathCourt, pathInside3], zones.perimeterD || 0, mode, true);

    var BOX = 3;
    var aO = zoneAlpha(zones.oreb || 0, mode);
    var aD = zoneAlpha(zones.glassD || 0, mode);
    ctx.save();
    ctx.lineWidth = 1;
    if (aO > 0) {
      var rgbO = mode === 'diff'
        ? ((zones.oreb || 0) >= 0 ? '0,99,0' : '198,40,40')
        : '235,104,52';
      ctx.beginPath();
      ctx.rect(g.X(14.6), g.Y(2.4 + BOX), BOX * g.s, BOX * g.s);
      ctx.fillStyle = 'rgba(' + rgbO + ',' + Math.min(0.95, aO + 0.08).toFixed(3) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(17,17,17,0.55)';
      ctx.lineWidth = Math.max(1, g.s * 0.08);
      ctx.stroke();
    }
    if (aD > 0) {
      var rgbD = mode === 'diff'
        ? ((zones.glassD || 0) >= 0 ? '0,99,0' : '198,40,40')
        : '30,100,200';
      ctx.beginPath();
      ctx.rect(g.X(50 - 14.6 - BOX), g.Y(2.4 + BOX), BOX * g.s, BOX * g.s);
      ctx.fillStyle = 'rgba(' + rgbD + ',' + Math.min(0.95, aD + 0.08).toFixed(3) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(17,17,17,0.55)';
      ctx.lineWidth = Math.max(1, g.s * 0.08);
      ctx.stroke();
    }
    ctx.restore();

    var astT = zoneAlpha(zones.ast || 0, mode);
    if (astT > 0.05) {
      var rgbA = mode === 'diff'
        ? ((zones.ast || 0) >= 0 ? '0,99,0' : '208,59,59')
        : '235,104,52';
      ctx.save();
      ctx.strokeStyle = 'rgba(' + rgbA + ',' + Math.min(1, astT + 0.2).toFixed(3) + ')';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = Math.max(1, g.s * 0.16);
      ctx.setLineDash([4, 3]);
      var o = { x: 25, y: g.KEY_H + 4.5 };
      [{ x: 9, y: 18 }, { x: 41, y: 18 }, { x: 25, y: 7.2 }].forEach(function (t) {
        var dx = g.X(t.x) - g.X(o.x), dy = g.Y(t.y) - g.Y(o.y);
        var len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
        var hx = g.X(t.x) - ux * 4, hy = g.Y(t.y) - uy * 4;
        ctx.beginPath();
        ctx.moveTo(g.X(o.x), g.Y(o.y));
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.save();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(g.X(t.x), g.Y(t.y));
        ctx.lineTo(hx - uy * 2.4, hy + ux * 2.4);
        ctx.lineTo(hx + uy * 2.4, hy - ux * 2.4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });
      ctx.restore();
    }
  }

  function courtEraBaselineIdx(eraIdx, nEras) {
    if (nEras <= 0) return 0;
    if (eraIdx <= 0) return nEras - 1;
    return eraIdx - 1;
  }

  function courtEraBaselineMeta() {
    var eras = (courtState.data && courtState.data.eras) || [];
    var n = eras.length;
    if (!n) return null;
    var eraIdx = Math.min(Math.max(courtState.eraIdx, 0), n - 1);
    var baseIdx = courtEraBaselineIdx(eraIdx, n);
    return {
      eraIdx: eraIdx,
      baseIdx: baseIdx,
      era: eras[eraIdx],
      baseline: eras[baseIdx],
      isCurrentBaseline: eraIdx === 0
    };
  }

  function diffZoneMix(current, baseline) {
    var out = {};
    ZONE_META.forEach(function (z) {
      out[z.key] = (current[z.key] || 0) - (baseline[z.key] || 0);
    });
    return out;
  }

  function activeCourtZones() {
    var heat = courtState.heat;
    if (!heat) return null;
    if (courtState.mode === 'diff') return heat.delta;
    if (courtState.mode === 'early') return heat.early;
    if (courtState.mode === 'late') return heat.late;
    var meta = courtEraBaselineMeta();
    if (!meta || !meta.era || !meta.era.zoneMix) return null;
    if (!meta.baseline || !meta.baseline.zoneMix || meta.eraIdx === meta.baseIdx) {
      return meta.era.zoneMix;
    }
    return diffZoneMix(meta.era.zoneMix, meta.baseline.zoneMix);
  }

  function renderCourtZoneList(host, zones, mode) {
    if (!host || !zones) return;
    var rows = ZONE_META.slice().sort(function (a, b) {
      return Math.abs(zones[b.key] || 0) - Math.abs(zones[a.key] || 0);
    });
    host.innerHTML = rows.map(function (z) {
      var v = zones[z.key] || 0;
      var cls = v >= 0 ? 'is-up' : 'is-down';
      // zoneMix is an era-vs-era delta of a composite; SD is the honest unit.
      var txt = (v >= 0 ? '+' : '') + v.toFixed(2) + ' SD';
      return '<div class="court-heatmap__zone ' + cls + '">' +
        '<span class="court-heatmap__zone-name">' +
        '<span class="court-heatmap__zone-dot" aria-hidden="true"></span>' +
        escapeHtml(z.label) + '</span>' +
        '<span class="court-heatmap__zone-val">' + txt + '</span></div>';
    }).join('');
  }

  function renderCourtTags(host, eras) {
    if (!host) return;
    var meta = courtEraBaselineMeta();
    var era = meta && meta.era;
    var counts = (era && era.tagCounts) || {};
    var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    var baselineLine = '';
    if (meta && meta.baseline && meta.eraIdx !== meta.baseIdx) {
      var baseLabel = meta.isCurrentBaseline ? 'today' : 'prior era';
      baselineLine = '<p class="court-heatmap__tags-label">Compared with ' +
        escapeHtml(meta.baseline.era) + ' <span class="court-heatmap__baseline-kind">(' +
        baseLabel + ')</span></p>';
    }
    if (!keys.length) {
      host.innerHTML = baselineLine +
        '<p class="court-heatmap__tags-empty">Role tags appear when viewing an era.</p>';
      return;
    }
    var total = keys.reduce(function (s, k) { return s + counts[k]; }, 0) || 1;
    host.innerHTML = baselineLine +
      '<p class="court-heatmap__tags-label">Era role tags · ' +
      escapeHtml(era.era) + '</p><div class="court-heatmap__tag-row">' +
      keys.map(function (k) {
        var pct = Math.round(100 * counts[k] / total);
        return '<span class="court-heatmap__tag" title="' + counts[k] + ' cluster hits">' +
          escapeHtml(COURT_TAG_LABELS[k] || k) +
          ' <em>' + pct + '%</em></span>';
      }).join('') + '</div>';
  }

  function courtCaption() {
    if (courtState.mode === 'diff') {
      return 'Change from the first five seasons to the last five.';
    }
    if (courtState.mode === 'early') return 'League court mix in the first five seasons.';
    if (courtState.mode === 'late') return 'League court mix in the last five seasons.';
    var meta = courtEraBaselineMeta();
    if (!meta || !meta.era) return 'Court mix for this era.';
    if (!meta.baseline || meta.eraIdx === meta.baseIdx) {
      return meta.era.era + ' court mix.';
    }
    if (meta.isCurrentBaseline) {
      return meta.era.era + ' vs today (' + meta.baseline.era + '). Green = more than today.';
    }
    return meta.era.era + ' vs prior era (' + meta.baseline.era + '). Green = more than before.';
  }

  function drawCourtHeatmap() {
    var canvas = document.getElementById('archetype-court-canvas');
    var caption = document.getElementById('archetype-court-caption');
    var listHost = document.getElementById('archetype-court-zone-list');
    var tagsHost = document.getElementById('archetype-court-tags');
    var eraTabs = document.getElementById('archetype-court-era-tabs');
    if (!canvas || !courtState.heat) return;

    var zones = activeCourtZones();
    if (!zones) return;

    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var wCss = Math.max(rect.width || canvas.clientWidth || 320, 200);
    var hCss = wCss * (47 / 50);
    canvas.width = Math.round(wCss * dpr);
    canvas.height = Math.round(hCss * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, wCss, hCss);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, wCss, hCss);

    var g = courtGeometry(wCss, hCss);
    var paintMode = (courtState.mode === 'diff' || courtState.mode === 'era') ? 'diff' : 'abs';
    paintZones(ctx, g, zones, paintMode);
    drawCourtLinesLite(ctx, g);
    ['arc', 'oreb', 'glassD', 'paintD', 'rim', 'mid', 'paintFT', 'perimeterD'].forEach(function (k) {
      courtZoneLabel(ctx, g, k, zones[k] || 0, paintMode);
    });

    if (caption) caption.textContent = courtCaption();
    renderCourtZoneList(listHost, zones, paintMode);

    if (eraTabs) {
      eraTabs.hidden = courtState.mode !== 'era';
    }
    if (courtState.mode === 'era') {
      renderCourtTags(tagsHost, courtState.data.eras);
    } else if (tagsHost) {
      var movers = (courtState.data.biggestShifts || []).slice(0, 3);
      tagsHost.innerHTML = '<p class="court-heatmap__tags-label">Biggest share movers</p>' +
        '<div class="court-heatmap__tag-row">' +
        movers.map(function (s) {
          var d = (s.delta >= 0 ? '+' : '') + (s.delta * 100).toFixed(1) + 'pp';
          return '<span class="court-heatmap__tag' + (s.delta >= 0 ? ' is-up' : ' is-down') + '">' +
            escapeHtml(truncateName(s.archetype, 28)) + ' <em>' + d + '</em></span>';
        }).join('') + '</div>';
    }
  }

  function bindCourtHeatmap(data) {
    var root = document.getElementById('archetype-court-heatmap') || document.querySelector('.court-heatmap');
    if (!data || !data.courtHeatmap) {
      var hideRoot = document.getElementById('archetype-court-heatmap');
      if (hideRoot) hideRoot.hidden = true;
      return;
    }
    if (!root) {
      // allow drawing even if wrapper missing — canvas may still exist
      root = null;
    }
    courtState.data = data;
    courtState.heat = data.courtHeatmap;
    courtState.eraIdx = Math.max(0, (data.eras || []).length - 1);

    var eraTabs = document.getElementById('archetype-court-era-tabs');
    if (eraTabs && data.eras) {
      var nEras = data.eras.length;
      eraTabs.innerHTML = data.eras.map(function (e, i) {
        var baseIdx = courtEraBaselineIdx(i, nEras);
        var baseEra = data.eras[baseIdx];
        var baseHint = i === 0
          ? ('vs today (' + (baseEra && baseEra.era) + ')')
          : ('vs prior (' + (baseEra && baseEra.era) + ')');
        return '<button type="button" class="court-heatmap__era' +
          (i === courtState.eraIdx ? ' is-active' : '') +
          '" data-era="' + i + '" title="' + escapeHtml(baseHint) + '">' +
          escapeHtml(e.era) + '</button>';
      }).join('');
      eraTabs.onclick = function (ev) {
        var btn = ev.target.closest('[data-era]');
        if (!btn) return;
        if (courtState.mode !== 'era') courtState.mode = 'era';
        (root || document).querySelectorAll('.court-heatmap__mode').forEach(function (b) {
          var on = (b.getAttribute('data-mode') || '') === 'era';
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        courtState.eraIdx = parseInt(btn.getAttribute('data-era'), 10) || 0;
        eraTabs.querySelectorAll('.court-heatmap__era').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        drawCourtHeatmap();
      };
    }

    (root || document).querySelectorAll('.court-heatmap__mode').forEach(function (btn) {
      btn.onclick = function () {
        courtState.mode = btn.getAttribute('data-mode') || 'diff';
        (root || document).querySelectorAll('.court-heatmap__mode').forEach(function (b) {
          var on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        drawCourtHeatmap();
      };
    });

    (root || document).querySelectorAll('.court-heatmap__mode').forEach(function (b) {
      var on = (b.getAttribute('data-mode') || '') === courtState.mode;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    drawCourtHeatmap();
    if (!courtState._resizeBound) {
      courtState._resizeBound = true;
      window.addEventListener('resize', function () {
        if (courtState.heat) drawCourtHeatmap();
      });
    }
  }

  function showArchetypeError(chartHost, legendHost, shiftsHost, panelsHost, err) {
    var detail = err && err.message ? ' (' + err.message + ')' : '';
    chartHost.innerHTML = '';
    chartHost.setAttribute('aria-label', 'Archetype eras chart failed to load');
    var p = document.createElement('p');
    p.className = 'drift-loading';
    p.textContent = 'Could not load the archetype eras data (assets/archetypes_time.json).' + detail + ' Try reloading.';
    chartHost.appendChild(p);
    if (legendHost) legendHost.innerHTML = '';
    if (shiftsHost) shiftsHost.innerHTML = '<p class="drift-loading">Could not load.' + detail + '</p>';
    if (panelsHost) panelsHost.innerHTML = '<p class="drift-loading">Could not load.' + detail + '</p>';
    var courtRoot = document.getElementById('archetype-court-heatmap');
    if (courtRoot) courtRoot.hidden = true;
  }

  // -------------------------------------------------------------------
  // Archetype emergence (assets/archetype_emergence.json)
  // -------------------------------------------------------------------

  var ROLE_SERIES = [
    { key: 'three_and_d', label: '3-and-D wing', color: '#3987e5' },
    { key: 'stretch_big', label: 'Stretch big', color: '#199e70' },
    { key: 'traditional_big', label: 'Traditional big', color: '#c98500' },
    { key: 'spacing_role', label: 'Spacing role', color: '#d55181' }
  ];

  function renderEmergenceVerdict(host, hypothesis) {
    if (!host || !hypothesis) return;
    var claims = hypothesis.supportedClaims + '/' + hypothesis.totalClaims;
    var headline = hypothesis.headline || '';
    host.innerHTML =
      '<div class="emergence-narrative">' +
        '<div class="emergence-kicker"><span class="arch-era-kicker">VERDICT</span><span class="trends-chip trends-chip--active" style="margin-left:6px">' + escapeHtml(hypothesis.verdict) + ' · ' + claims + '</span></div>' +
        '<p class="story-lede" style="margin-top:8px">' + escapeHtml(headline) + '</p>' +
      '</div>';
  }

  function renderRolePrevalenceChart(host, rows) {
    if (!host || !rows || !rows.length) return;
    host.innerHTML = '';
    var W = 880, LEFT = 52, RIGHT = 20, TOP = 20, BOT = 40;
    var H = 260;
    var plotW = W - LEFT - RIGHT, plotH = H - TOP - BOT;
    var n = rows.length;
    var yMax = 0.35;
    function xOf(i) { return LEFT + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW); }
    function yOf(v) { return TOP + (1 - v / yMax) * plotH; }

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      role: 'img',
      'aria-label': 'Era-relative role prevalence by five-era windows',
      'font-family': getComputedStyle(document.body).fontFamily
    }, host);

    for (var g = 0; g <= 4; g++) {
      var frac = (g / 4) * yMax;
      var gy = yOf(frac);
      svgEl('line', {
        x1: LEFT, y1: gy, x2: W - RIGHT, y2: gy,
        stroke: g === 0 ? INK : HAIRLINE, 'stroke-width': g === 0 ? 1.5 : 1
      }, svg);
      svgEl('text', {
        x: LEFT - 8, y: gy + 3, 'text-anchor': 'end', 'font-size': 9, fill: INK_MUTED
      }, svg).textContent = Math.round(frac * 100) + '%';
    }

    ROLE_SERIES.forEach(function (series) {
      var pts = rows.map(function (r, i) { return xOf(i) + ',' + yOf(r[series.key] || 0); }).join(' ');
      svgEl('polyline', {
        points: pts, fill: 'none', stroke: series.color, 'stroke-width': 2.5
      }, svg);
      rows.forEach(function (r, i) {
        var cx = xOf(i), cy = yOf(r[series.key] || 0);
        var dot = svgEl('circle', { cx: cx, cy: cy, r: 4, fill: series.color }, svg);
        var title = document.createElementNS(SVG_NS, 'title');
        title.textContent = r.era + ' — ' + series.label + ': ' + pct1(r[series.key] || 0);
        dot.appendChild(title);
      });
    });

    rows.forEach(function (r, i) {
      svgEl('text', {
        x: xOf(i), y: H - 12, 'text-anchor': 'middle', 'font-size': 9, fill: INK_MUTED
      }, svg).textContent = r.era.replace('-', '–');
    });

    var legendY = TOP - 6;
    ROLE_SERIES.forEach(function (series, si) {
      var lx = LEFT + si * 155;
      svgEl('line', {
        x1: lx, y1: legendY, x2: lx + 18, y2: legendY, stroke: series.color, 'stroke-width': 2.5
      }, svg);
      svgEl('text', {
        x: lx + 22, y: legendY + 3, 'font-size': 9, fill: INK
      }, svg).textContent = series.label;
    });
  }

  function renderRollingDiversityChart(host, rows) {
    if (!host || !rows || !rows.length) return;
    host.innerHTML = '';
    var W = 880, LEFT = 46, RIGHT = 46, TOP = 20, BOT = 40;
    var H = 220;
    var plotW = W - LEFT - RIGHT, plotH = H - TOP - BOT;
    var n = rows.length;
    var yMax = Math.max.apply(null, rows.map(function (r) { return r.effectiveN; })) * 1.1;
    var kMax = Math.max.apply(null, rows.map(function (r) { return r.k; })) + 1;
    function xOf(i) { return LEFT + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW); }
    function yOf(v) { return TOP + (1 - v / yMax) * plotH; }
    function yK(k) { return TOP + (1 - k / kMax) * plotH; }

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      role: 'img',
      'aria-label': 'Rolling five-season optimal K and effective archetype count',
      'font-family': getComputedStyle(document.body).fontFamily
    }, host);

    var effPts = rows.map(function (r, i) { return xOf(i) + ',' + yOf(r.effectiveN); }).join(' ');
    svgEl('polyline', {
      points: effPts, fill: 'none', stroke: ORANGE_HEX, 'stroke-width': 2
    }, svg);
    rows.forEach(function (r, i) {
      var cx = xOf(i), cy = yK(r.k);
      svgEl('circle', { cx: cx, cy: cy, r: 3.5, fill: BLUE_HEX }, svg);
      if (i % 4 === 0 || i === n - 1) {
        svgEl('text', {
          x: cx, y: H - 12, 'text-anchor': 'middle', 'font-size': 8, fill: INK_MUTED
        }, svg).textContent = "'" + (r.endSeason || '').slice(2, 4);
      }
    });

    svgEl('text', {
      x: LEFT - 8, y: TOP + 8, 'text-anchor': 'end', 'font-size': 9, fill: ORANGE_HEX
    }, svg).textContent = 'eff N';
    svgEl('text', {
      x: W - RIGHT + 8, y: TOP + 8, 'text-anchor': 'start', 'font-size': 9, fill: BLUE_HEX
    }, svg).textContent = 'opt K';
  }

  function renderEmergenceClaimsViz(host, claims) {
    if (!host || !claims) return;
    // Turn bullet checklist into flowing narrative
    var yes = claims.filter(function(c){return c.supported;});
    var no = claims.filter(function(c){return !c.supported;});
    var sent = yes.map(function(c){ return escapeHtml(c.detail); }).slice(0,4).join(' · ');
    var noSent = no.map(function(c){ return escapeHtml(c.detail); }).join(' ');
    host.innerHTML = '<div class="season-story" style="box-shadow:1.5px 1.5px 0 var(--ink);padding:12px 14px">' +
      '<p class="story-para"><strong>Why we think it emerged:</strong> ' + sent + '.</p>' +
      (noSent ? '<p class="story-para" style="color:#6B665E"><strong>The holdout:</strong> ' + noSent + '</p>' : '') +
      '<p class="story-para" style="margin-top:8px;font-size:11px;color:#6B665E">6 of 7 checks passed — not a clean monotonic shrink, but spacing roles (3-and-D + stretch big) grew from 6% → 11% while traditional glass-big fell 30%→25%.</p>' +
      '</div>';
  }

  function renderNovelBadges(host, tagged) {
    if (!host || !tagged) return;
    // Convert badge soup into narrative sentence per era
    var erasWithNovel = tagged.filter(function(t){return t.novelArchetypes && t.novelArchetypes.length;});
    if (!erasWithNovel.length) { host.innerHTML=''; return; }
    var html = erasWithNovel.map(function(t){
      var tops = t.novelArchetypes.slice(0,2).map(function(a){return escapeHtml(truncateName(a.name,28))+' '+Math.round(a.share*100)+'%';}).join(', ');
      return '<p class="story-para" style="font-size:12px"><span class="arch-era-kicker">' + escapeHtml(t.era) + '</span><span style="margin-left:6px">' + tops + (t.novelArchetypes.length>2 ? ' +'+(t.novelArchetypes.length-2)+' more novel types' : '') + ' — new cluster geometry appeared.</span></p>';
    }).join('');
    host.innerHTML = '<div class="season-story" style="margin-top:8px;box-shadow:1.5px 1.5px 0 var(--ink)"><div style="font-family:var(--mono);font-size:10px;font-weight:800;text-transform:uppercase;margin-bottom:4px">Mid/post-2000s novel geometry</div>' + html + '</div>';
  }

  function showEmergenceError(verdictHost, roleHost, rollHost, claimsHost, badgesHost) {
    var msg = 'Could not load archetype emergence data (assets/archetype_emergence.json).';
    if (verdictHost) verdictHost.innerHTML = '<p class="drift-loading">' + msg + '</p>';
    [roleHost, rollHost].forEach(function (h) {
      if (!h) return;
      h.innerHTML = '';
      var p = document.createElement('p');
      p.className = 'drift-loading';
      p.textContent = msg;
      h.appendChild(p);
    });
    if (claimsHost) claimsHost.innerHTML = '<p class="drift-loading">' + msg + '</p>';
    if (badgesHost) badgesHost.innerHTML = '<p class="drift-loading">' + msg + '</p>';
  }

  // -------------------------------------------------------------------
  // Career Shapes (assets/trajectories.json): class stat cards, headline
  // callout, era transition-rate mini-chart, top reinvention motifs.
  // -------------------------------------------------------------------

  var TRAJ_CLASS_LABEL = {
    'stable': 'Stable specialist',
    'reinvention': 'Reinvention',
    'late-bloom': 'Late bloom',
    'migrator': 'Migrator',
    'drifter': 'Drifter'
  };

  var TRAJ_CLASS_DEF = {
    'stable': 'One archetype for >=75% of the career.',
    'reinvention': 'One clean archetype switch, both sides sustained.',
    'late-bloom': 'Same switch, but after the 60% mark.',
    'migrator': '3+ archetypes, none ever dominant.',
    'drifter': 'Moved without settling into a new majority.'
  };

  // Our own read of the most common reinvention motifs, not derived — kept
  // separate from the counts the pipeline computes. A motif not in this map
  // (e.g. after a rebuild reorders the top list) simply renders without a gloss.
  var TRAJ_MOTIF_GLOSS = {
    'Three-Point Volume + Three-Point Accuracy→Three-Point Accuracy (Low Turnovers)': 'the aging-shooter arc',
    'Three-Point Accuracy (Low Turnovers)→Three-Point Volume + Three-Point Accuracy': 'volume creeping back in',
    'Rim Protection + Offensive Glass→Offensive Glass + Defensive Glass': 'trading blocks for boards',
    'Defensive Glass + Rim Pressure (Fts)→Offensive Glass + Defensive Glass': 'settling into the glass',
    'Scoring Volume + Shot Volume→Playmaking + Steals': 'scorer turned table-setter',
    'Offensive Glass + Defensive Glass→Rim Protection + Offensive Glass': 'adding rim protection'
  };

  var TRAJ_CLASS_COLOR = {
    'stable': '#3987e5',
    'reinvention': '#eb6834',
    'late-bloom': '#c98500',
    'migrator': '#9085e9',
    'drifter': '#e66767'
  };

  function renderTrajectoryClassViz(host, classStats) {
    if (!host || !classStats || !classStats.length) return;
    host.innerHTML = '';
    var sorted = classStats.slice().sort(function (a, b) { return b.share - a.share; });
    var W = 880, H = 160, cx = 95, cy = 80, r = 58, ir = 34;
    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      role: 'img',
      'aria-label': 'Career class distribution',
      'font-family': getComputedStyle(document.body).fontFamily
    }, host);

    var start = -Math.PI / 2;
    var total = sorted.reduce(function (s, c) { return s + c.share; }, 0) || 1;
    var angle = start;
    sorted.forEach(function (c) {
      var slice = (c.share / total) * Math.PI * 2;
      var x1 = cx + r * Math.cos(angle);
      var y1 = cy + r * Math.sin(angle);
      angle += slice;
      var x2 = cx + r * Math.cos(angle);
      var y2 = cy + r * Math.sin(angle);
      var large = slice > Math.PI ? 1 : 0;
      var color = TRAJ_CLASS_COLOR[c.class] || ORANGE_HEX;
      var d = 'M ' + cx + ' ' + cy + ' L ' + x1 + ' ' + y1 +
        ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2 + ' Z';
      var path = svgEl('path', { d: d, fill: color, stroke: SURFACE_HEX, 'stroke-width': 2 }, svg);
      var title = document.createElementNS(SVG_NS, 'title');
      var label = TRAJ_CLASS_LABEL[c.class] || c.class;
      title.textContent = label + ': ' + pct1(c.share) + ', ' + c.meanCareerLength.toFixed(1) + ' seasons avg';
      path.appendChild(title);
    });
    svgEl('circle', { cx: cx, cy: cy, r: ir, fill: SURFACE_HEX }, svg);
    var reinvention = sorted.find(function (c) { return c.class === 'reinvention'; });
    var stable = sorted.find(function (c) { return c.class === 'stable'; });
    if (reinvention && stable) {
      svgEl('text', {
        x: cx, y: cy - 4, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 700, fill: INK
      }, svg).textContent = 'Reinventors';
      svgEl('text', {
        x: cx, y: cy + 10, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800, fill: ORANGE_HEX
      }, svg).textContent = reinvention.meanCareerLength.toFixed(1) + ' yr';
      svgEl('text', {
        x: cx, y: cy + 22, 'text-anchor': 'middle', 'font-size': 8, fill: INK_MUTED
      }, svg).textContent = 'vs ' + stable.meanCareerLength.toFixed(1) + ' stable';
    }

    var legendX = 200, legendY = 24, rowH = 26;
    sorted.forEach(function (c, i) {
      var y = legendY + i * rowH;
      var color = TRAJ_CLASS_COLOR[c.class] || ORANGE_HEX;
      var label = TRAJ_CLASS_LABEL[c.class] || c.class;
      var pmSign = c.meanPMz >= 0 ? '+' : '';
      svgEl('rect', { x: legendX, y: y - 8, width: 12, height: 12, fill: color, rx: 2 }, svg);
      svgEl('text', {
        x: legendX + 18, y: y + 1, 'font-size': 11, 'font-weight': 700, fill: INK
      }, svg).textContent = label;
      svgEl('text', {
        x: legendX + 18, y: y + 14, 'font-size': 9, fill: INK_MUTED
      }, svg).textContent = pct1(c.share) + ' · ' + c.meanCareerLength.toFixed(1) +
        ' seasons · PM-z ' + pmSign + c.meanPMz.toFixed(2);
    });
  }

  function renderCareerPathGallery(host, classExamples, globalArchetypes) {
    if (!host) return;
    var classes = ['stable', 'reinvention', 'late-bloom', 'migrator', 'drifter'];
    // v25: spaced, readable meta with pill • name • seasons, gap 6px, no concatenation
    host.innerHTML = classes.map(function (cls) {
      var ex = classExamples && classExamples[cls] && classExamples[cls][0];
      if (!ex) return '';
      var segs = collapsedPathSegments(ex.path);
      var total = segs.reduce(function (s, seg) { return s + seg.count; }, 0) || 1;
      var blocks = segs.map(function (seg) {
        var idx = archIndex(seg.archetype, globalArchetypes);
        return '<span class="path-block" style="flex:' + seg.count + ';background:' +
          ARCH_PALETTE[idx % ARCH_PALETTE.length] + '" title="' + escapeHtml(seg.archetype) +
          ' (' + seg.count + ' seasons)"></span>';
      }).join('');
      var skill = ex.skillArc && ex.skillArc.narrative
        ? '<span class="path-gallery__skill">' + escapeHtml(ex.skillArc.narrative) + '</span>'
        : '';
      return '<div class="path-gallery__row" title="' + escapeHtml(ex.name) + ' career path">' +
        '<div class="path-gallery__meta">' +
          '<span class="path-gallery__class">' + escapeHtml(TRAJ_CLASS_LABEL[cls] || cls) + '</span>' +
          '<span class="path-gallery__separator" aria-hidden="true">•</span>' +
          '<span class="path-gallery__name">' + escapeHtml(ex.name) + '</span>' +
          '<span class="path-gallery__separator" aria-hidden="true">•</span>' +
          '<span class="path-gallery__n">' + ex.n + ' seasons</span>' +
        '</div>' +
        '<div class="path-gallery__track" aria-label="Career archetype path for ' + escapeHtml(ex.name) + '">' +
          blocks + '</div>' + skill + '</div>';
    }).filter(Boolean).join('');
  }

  function renderMotifFlowChart(host, motifs) {
    if (!host || !motifs || !motifs.length) return;
    host.innerHTML = '';
    var top = motifs.slice(0, 6);
    var W = 420, LEFT = 8, RIGHT = 8, TOP = 10;
    var rowH = 34, gap = 4;
    var H = TOP + top.length * (rowH + gap) + 8;
    var maxCount = top.reduce(function (m, x) { return Math.max(m, x.count); }, 1);

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      role: 'img',
      'aria-label': 'Top reinvention archetype switches',
      'font-family': getComputedStyle(document.body).fontFamily
    }, host);

    top.forEach(function (m, i) {
      var y = TOP + i * (rowH + gap) + rowH / 2;
      var barW = 40 + (m.count / maxCount) * 70;
      var gloss = TRAJ_MOTIF_GLOSS[m.from + '→' + m.to];
      svgEl('text', {
        x: LEFT, y: y - 2, 'text-anchor': 'start', 'font-size': 8, fill: INK
      }, svg).textContent = truncateName(m.from, 22);
      svgEl('text', {
        x: LEFT, y: y + 10, 'text-anchor': 'start', 'font-size': 8, fill: INK_MUTED
      }, svg).textContent = truncateName(m.to, 22);
      var ax = W / 2 - barW / 2;
      var line = svgEl('line', {
        x1: ax, y1: y + 2, x2: ax + barW, y2: y + 2,
        stroke: ORANGE_HEX, 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0.85
      }, svg);
      var title = document.createElementNS(SVG_NS, 'title');
      title.textContent = m.from + ' → ' + m.to + ' (' + m.count + ' careers)' +
        (gloss ? ' — ' + gloss : '');
      line.appendChild(title);
      svgEl('polygon', {
        points: (ax + barW) + ',' + y + ' ' + (ax + barW + 8) + ',' + (y + 2) + ' ' + (ax + barW) + ',' + (y + 4),
        fill: ORANGE_HEX
      }, svg);
      svgEl('text', {
        x: W - RIGHT, y: y + 4, 'text-anchor': 'end', 'font-size': 10, 'font-weight': 800, fill: ORANGE_HEX
      }, svg).textContent = '×' + m.count;
      if (gloss) {
        svgEl('text', {
          x: W / 2, y: y + 16, 'text-anchor': 'middle', 'font-size': 8, fill: INK_MUTED, 'font-style': 'italic'
        }, svg).textContent = gloss;
      }
    });
  }

  function renderTrajectoryEraChart(host, eraRates) {
    host.innerHTML = '';
    host.removeAttribute('aria-label');

    var W = 880, LEFT = 46, RIGHT = 20, TOP = 24, BOT = 34;
    var H = 200;
    var plotW = W - LEFT - RIGHT, plotH = H - TOP - BOT;
    var n = eraRates.length;
    var maxVal = eraRates.reduce(function (m, e) { return Math.max(m, e.meanTransitionRate); }, 0);
    var yMax = maxVal * 1.25;
    var step = plotW / n;
    var barW = step * 0.55;

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      role: 'img',
      'aria-label': 'Mean archetype transition rate by decade, ' + eraRates[0].decade + ' through ' + eraRates[n - 1].decade,
      'font-family': getComputedStyle(document.body).fontFamily
    }, host);

    svgEl('line', {
      x1: LEFT, y1: TOP + plotH, x2: W - RIGHT, y2: TOP + plotH, stroke: INK, 'stroke-width': 1.5
    }, svg);

    eraRates.forEach(function (e, i) {
      var cx = LEFT + step * i + step / 2;
      var barH = yMax > 0 ? (e.meanTransitionRate / yMax) * plotH : 0;
      var y = TOP + plotH - barH;
      var rect = svgEl('rect', {
        x: cx - barW / 2, y: y, width: barW, height: barH, fill: ORANGE_HEX, rx: 3
      }, svg);
      var title = document.createElementNS(SVG_NS, 'title');
      title.textContent = e.decade + ': ' + e.meanTransitionRate.toFixed(2) +
        ' mean transition rate (' + e.careers + ' careers)';
      rect.appendChild(title);
      svgEl('text', {
        x: cx, y: y - 6, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: INK
      }, svg).textContent = e.meanTransitionRate.toFixed(2);
      svgEl('text', {
        x: cx, y: H - 10, 'text-anchor': 'middle', 'font-size': 10, fill: INK_MUTED
      }, svg).textContent = e.decade;
    });
  }

  function renderTrajectoryMotifs(host, motifs) {
    renderMotifFlowChart(host, motifs);
  }

  function showTrajectoryError(classVizHost, galleryHost, chartHost, motifHost) {
    var msg = 'Could not load career shape data (assets/trajectories.json).';
    if (classVizHost) classVizHost.innerHTML = '<p class="drift-loading">' + msg + '</p>';
    if (galleryHost) galleryHost.innerHTML = '<p class="drift-loading">' + msg + '</p>';
    if (chartHost) {
      chartHost.innerHTML = '';
      chartHost.setAttribute('aria-label', 'Career shapes chart failed to load');
      var p = document.createElement('p');
      p.className = 'drift-loading';
      p.textContent = 'Could not load the career shapes data (assets/trajectories.json). Try reloading.';
      chartHost.appendChild(p);
    }
    if (motifHost) motifHost.innerHTML = '<p class="drift-loading">' + msg + '</p>';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var chartHost = document.getElementById('drift-chart');
    var eraLegendHost = document.getElementById('drift-era-legend');
    var shiftsTable = document.getElementById('drift-shifts-table');
    var methodEl = document.getElementById('drift-method-quote');

    fetch(DRIFT_URL).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      renderChart(chartHost, data.pairs, data.biggestShifts);
      renderEraLegend(eraLegendHost);
      renderShiftsTable(shiftsTable, data.biggestShifts);
      if (methodEl) methodEl.textContent = data.method;
    }).catch(function () {
      showError(chartHost);
      var tbody = shiftsTable && shiftsTable.querySelector('tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="drift-loading">Could not load.</td></tr>';
      if (methodEl) methodEl.textContent = 'Could not load method text (assets/drift.json).';
    });

    var archChartHost = document.getElementById('archetype-stream-chart');
    var archLegendHost = document.getElementById('archetype-legend');
    var archShiftsHost = document.getElementById('archetype-shifts-chart');
    var archPanelsHost = document.getElementById('archetype-era-panels');
    var archNarrHost = document.getElementById('archetype-era-narrative');

    if (archChartHost) {
      fetch(ARCH_URL).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (data) {
        renderArchetypeStream(archChartHost, archLegendHost, data);
        renderArchetypeShiftsChart(archShiftsHost, data.biggestShifts);
        renderEraPanelsCompact(archPanelsHost, data.eras);
        if (archNarrHost) renderArchetypeEraNarrative(archNarrHost, data);
        try {
          bindCourtHeatmap(data);
        } catch (courtErr) {
          console.error('court heatmap failed:', courtErr);
          var courtRoot = document.getElementById('archetype-court-heatmap');
          if (courtRoot) {
            courtRoot.hidden = true;
          }
        }
      }).catch(function (err) {
        console.error('archetype eras load failed:', err);
        showArchetypeError(archChartHost, archLegendHost, archShiftsHost, archPanelsHost, err);
      });
    }

    var emVerdictHost = document.getElementById('emergence-verdict');
    var emRoleHost = document.getElementById('emergence-role-chart');
    var emRollHost = document.getElementById('emergence-rolling-chart');
    var emClaimsHost = document.getElementById('emergence-claims-viz');
    var emNovelHost = document.getElementById('emergence-novel-badges');

    if (emVerdictHost) {
      fetch(EMERGENCE_URL).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (data) {
        renderEmergenceVerdict(emVerdictHost, data.hypothesis);
        renderRolePrevalenceChart(emRoleHost, data.playerRolePrevalence);
        renderRollingDiversityChart(emRollHost, data.rollingWindows);
        renderEmergenceClaimsViz(emClaimsHost, data.hypothesis && data.hypothesis.claims);
        renderNovelBadges(emNovelHost, data.taggedPrevalence);
      }).catch(function () {
        showEmergenceError(emVerdictHost, emRoleHost, emRollHost, emClaimsHost, emNovelHost);
      });
    }

    var trajClassHost = document.getElementById('trajectory-class-viz');
    var trajGalleryHost = document.getElementById('trajectory-path-gallery');
    var trajChartHost = document.getElementById('trajectory-era-chart');
    var trajMotifHost = document.getElementById('trajectory-motif-flow');

    if (trajClassHost || trajChartHost) {
      fetch(TRAJ_URL).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (data) {
        renderTrajectoryClassViz(trajClassHost, data.classStats);
        renderCareerPathGallery(trajGalleryHost, data.classExamples, data.globalArchetypes);
        renderTrajectoryEraChart(trajChartHost, data.eraTransitionRates);
        renderMotifFlowChart(trajMotifHost, data.topReinventionMotifs);
      }).catch(function () {
        showTrajectoryError(trajClassHost, trajGalleryHost, trajChartHost, trajMotifHost);
      });
    }
  });
})();

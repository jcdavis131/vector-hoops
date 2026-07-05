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
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var ORANGE_HEX = '#eb6834';
  var BLUE_HEX = '#2a78d6';
  var INK = '#111111';
  var INK_MUTED = '#898781';
  var HAIRLINE = '#e1e0d9';

  // The math finds the spikes; these labels are our own read of known
  // league events near them — stated as observations, not derived facts.
  // Each `to` matches a pair's "to" season in drift.json exactly.
  var ANNOTATIONS = [
    { to: '1998-99', label: 'Lockout' },
    { to: '2004-05', label: 'Hand-check rules' },
    { to: '2011-12', label: 'Lockout' },
    { to: '2019-20', label: 'COVID bubble' },
    { to: '2022-23', label: 'Scoring era' }
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

  function renderChart(host, pairs) {
    host.innerHTML = '';
    host.removeAttribute('aria-label');

    var W = 880, LEFT = 46, RIGHT = 20, TOP = 46, BOT = 34;
    var H = 340;
    var plotW = W - LEFT - RIGHT, plotH = H - TOP - BOT;
    var n = pairs.length;

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

    // horizontal gridlines every 5 degrees, hairline; 0-line in ink
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

    // area fill under the line
    var areaD = 'M ' + xOf(0) + ' ' + yOf(0) + ' ';
    pairs.forEach(function (p, i) { areaD += 'L ' + xOf(i) + ' ' + yOf(p.rotationDeg) + ' '; });
    areaD += 'L ' + xOf(n - 1) + ' ' + yOf(0) + ' Z';
    svgEl('path', { d: areaD, fill: 'rgba(235, 104, 52, 0.12)', stroke: 'none' }, svg);

    // the rotation line
    var lineD = pairs.map(function (p, i) { return xOf(i) + ',' + yOf(p.rotationDeg); }).join(' ');
    svgEl('polyline', { points: lineD, fill: 'none', stroke: ORANGE_HEX, 'stroke-width': 2 }, svg);

    // points + native tooltips + selective x labels
    var xLabelStep = Math.max(1, Math.ceil(n / 10));
    pairs.forEach(function (p, i) {
      var cx = xOf(i), cy = yOf(p.rotationDeg);
      var dot = svgEl('circle', { cx: cx, cy: cy, r: 3.5, fill: ORANGE_HEX }, svg);
      var title = document.createElementNS(SVG_NS, 'title');
      title.textContent = p.from + ' → ' + p.to + ': ' + p.rotationDeg + '° rotation, ' +
        p.sharedPlayers + ' shared players, residual ' + p.residual +
        '. Most-rotated features: ' + featureList(p.mostRotated) + '.';
      dot.appendChild(title);

      if (i % xLabelStep === 0 || i === n - 1) {
        svgEl('text', {
          x: cx, y: H - 10, 'text-anchor': 'middle', 'font-size': 9, fill: INK_MUTED
        }, svg).textContent = "'" + p.to.slice(2, 4);
      }
    });

    // story annotations — small labeled markers, staggered into two rows
    // so nearby spikes (e.g. 2019-20 / 2022-23) don't collide.
    ANNOTATIONS.forEach(function (a, ai) {
      var idx = -1;
      for (var i = 0; i < n; i++) { if (pairs[i].to === a.to) { idx = i; break; } }
      if (idx < 0) return;
      var cx = xOf(idx), cy = yOf(pairs[idx].rotationDeg);
      var labelY = ai % 2 === 0 ? 12 : 26;
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
      return '<tr>' +
        '<td>' + escapeHtml(p.from) + ' → ' + escapeHtml(p.to) + '</td>' +
        '<td>' + p.rotationDeg + '°</td>' +
        '<td>' + p.residual + '</td>' +
        '<td>' + p.sharedPlayers + '</td>' +
        '<td>' + escapeHtml(featureList(p.mostRotated)) + '</td>' +
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

  document.addEventListener('DOMContentLoaded', function () {
    var chartHost = document.getElementById('drift-chart');
    var shiftsTable = document.getElementById('drift-shifts-table');
    var methodEl = document.getElementById('drift-method-quote');

    fetch(DRIFT_URL).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      renderChart(chartHost, data.pairs);
      renderShiftsTable(shiftsTable, data.biggestShifts);
      if (methodEl) methodEl.textContent = data.method;
    }).catch(function () {
      showError(chartHost);
      var tbody = shiftsTable && shiftsTable.querySelector('tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="drift-loading">Could not load.</td></tr>';
      if (methodEl) methodEl.textContent = 'Could not load method text (assets/drift.json).';
    });
  });
})();

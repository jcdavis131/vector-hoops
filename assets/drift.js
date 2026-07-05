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
  var ARCH_PALETTE = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9',
                      '#e66767', '#d55181', '#d95926'];

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

  function pct1(v) { return (v * 100).toFixed(1) + '%'; }

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

    var W = 880, LEFT = 40, RIGHT = 16, TOP = 14, BOT = 34;
    var H = 340;
    var plotW = W - LEFT - RIGHT, plotH = H - TOP - BOT;

    function xOf(i) { return n <= 1 ? LEFT + plotW / 2 : LEFT + (i / (n - 1)) * plotW; }
    function yOf(v) { return TOP + (1 - v) * plotH; }

    // cumulative share stack per season, bottom-to-top in archetype order
    var cum = prevalence.map(function (p) {
      var c = [], running = 0;
      for (var k = 0; k < K; k++) { running += p.shares[k] || 0; c.push(running); }
      return c;
    });

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      role: 'img',
      'aria-label': 'Archetype share of the league, ' + prevalence[0].season + ' through ' + prevalence[n - 1].season,
      'font-family': getComputedStyle(document.body).fontFamily
    }, host);

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
      legendHost.innerHTML = names.map(function (nm, k) {
        return '<li class="archetype-legend__item">' +
          '<span class="archetype-legend__swatch" style="background:' + ARCH_PALETTE[k % ARCH_PALETTE.length] + '"></span>' +
          escapeHtml(nm) + '</li>';
      }).join('');
    }
  }

  function renderArchetypeShiftsTable(table, shifts) {
    var tbody = table.querySelector('tbody');
    tbody.innerHTML = shifts.map(function (s) {
      var up = s.delta >= 0;
      var deltaCls = 'archetype-delta ' + (up ? 'archetype-delta--up' : 'archetype-delta--down');
      var deltaText = (up ? '+' : '') + (s.delta * 100).toFixed(1) + 'pp';
      return '<tr>' +
        '<td>' + escapeHtml(s.archetype) + '</td>' +
        '<td>' + pct1(s.early) + '</td>' +
        '<td>' + pct1(s.late) + '</td>' +
        '<td class="' + deltaCls + '">' + deltaText + '</td>' +
        '</tr>';
    }).join('');
  }

  function eraLineageHtml(item) {
    if (!item.ancestor) return '';
    var strong = item.ancestor.similarity >= 0.9;
    var cls = 'archetype-lineage' + (strong ? ' archetype-lineage--strong' : '');
    var chain = strong ? '⛓' : '←';
    return '<p class="' + cls + '"><span class="archetype-lineage__chain">' + chain + '</span> descends from ' +
      escapeHtml(item.ancestor.name) + ', ' + item.ancestor.similarity.toFixed(2) + ' aligned similarity</p>';
  }

  function renderEraPanels(host, eras) {
    host.innerHTML = eras.map(function (era) {
      var items = era.archetypes.slice().sort(function (a, b) { return b.share - a.share; }).map(function (item) {
        return '<li class="archetype-era-item">' +
          '<div class="archetype-era-item__name">' + escapeHtml(item.name) + '</div>' +
          '<div class="archetype-era-item__share">' + pct1(item.share) + ' of the era</div>' +
          eraLineageHtml(item) +
          '</li>';
      }).join('');
      return '<div class="archetype-era-card">' +
        '<div class="archetype-era-card__head">' + escapeHtml(era.era) +
        ' <span class="archetype-era-card__n">(n=' + era.n + ')</span></div>' +
        '<ul class="archetype-era-list">' + items + '</ul>' +
        '</div>';
    }).join('');
  }

  function showArchetypeError(chartHost, legendHost, table, panelsHost, methodEl) {
    chartHost.innerHTML = '';
    chartHost.setAttribute('aria-label', 'Archetype eras chart failed to load');
    var p = document.createElement('p');
    p.className = 'drift-loading';
    p.textContent = 'Could not load the archetype eras data (assets/archetypes_time.json). Try reloading.';
    chartHost.appendChild(p);
    if (legendHost) legendHost.innerHTML = '';
    var tbody = table && table.querySelector('tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="drift-loading">Could not load.</td></tr>';
    if (panelsHost) panelsHost.innerHTML = '<p class="drift-loading">Could not load.</p>';
    if (methodEl) methodEl.textContent = 'Could not load method text (assets/archetypes_time.json).';
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
    'stable': 'One archetype covered at least three-quarters of the career.',
    'reinvention': 'One sustained archetype switch, each side holding at least two seasons.',
    'late-bloom': 'One sustained archetype switch, arriving after the 60% mark of the career.',
    'migrator': 'Three or more archetypes across the career, none ever reaching 60% of the seasons.',
    'drifter': 'Moved between archetypes without a switch ever settling into a new majority.'
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

  function renderTrajectoryHeadline(host, classStats) {
    var byClass = {};
    classStats.forEach(function (c) { byClass[c.class] = c; });
    var reinvention = byClass['reinvention'], stable = byClass['stable'];
    if (!reinvention || !stable) { host.textContent = 'Not enough classes to compare.'; return; }
    host.innerHTML = '<b>Reinventors last longest:</b> ' + reinvention.meanCareerLength.toFixed(1) +
      ' seasons vs ' + stable.meanCareerLength.toFixed(1) + ' for stable specialists &mdash; ' +
      'observed with selection effects.';
  }

  function renderTrajectoryClassCards(host, classStats) {
    var sorted = classStats.slice().sort(function (a, b) { return b.share - a.share; });
    host.innerHTML = sorted.map(function (c) {
      var label = TRAJ_CLASS_LABEL[c.class] || c.class;
      var def = TRAJ_CLASS_DEF[c.class] || '';
      var pmSign = c.meanPMz >= 0 ? '+' : '';
      return '<div class="trajectory-class-card">' +
        '<div class="trajectory-class-card__head">' + escapeHtml(label) + '</div>' +
        '<div class="trajectory-class-card__share">' + pct1(c.share) + ' of careers</div>' +
        '<div class="trajectory-class-card__stats">' + c.meanCareerLength.toFixed(1) +
        ' seasons avg &middot; PM-z ' + pmSign + c.meanPMz.toFixed(2) + '</div>' +
        '<p class="trajectory-class-card__def">' + escapeHtml(def) + '</p>' +
        '</div>';
    }).join('');
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
      title.textContent = e.decade + ': ' + e.meanTransitionRate.toFixed(3) +
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
    host.innerHTML = motifs.map(function (m) {
      var gloss = TRAJ_MOTIF_GLOSS[m.from + '→' + m.to];
      return '<li class="trajectory-motif-item">' +
        '<span class="trajectory-motif-item__path">' + escapeHtml(m.from) + ' &rarr; ' + escapeHtml(m.to) + '</span>' +
        '<span class="trajectory-motif-item__count">&times;' + m.count + '</span>' +
        (gloss ? '<span class="trajectory-motif-item__gloss">' + escapeHtml(gloss) + '</span>' : '') +
        '</li>';
    }).join('');
  }

  function showTrajectoryError(headlineHost, cardsHost, chartHost, motifHost, methodEl) {
    if (headlineHost) headlineHost.textContent = 'Could not load career shape data (assets/trajectories.json).';
    if (cardsHost) cardsHost.innerHTML = '<p class="drift-loading">Could not load.</p>';
    if (chartHost) {
      chartHost.innerHTML = '';
      chartHost.setAttribute('aria-label', 'Career shapes chart failed to load');
      var p = document.createElement('p');
      p.className = 'drift-loading';
      p.textContent = 'Could not load the career shapes data (assets/trajectories.json). Try reloading.';
      chartHost.appendChild(p);
    }
    if (motifHost) motifHost.innerHTML = '<li class="drift-loading">Could not load.</li>';
    if (methodEl) methodEl.textContent = 'Could not load method text (assets/trajectories.json).';
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

    var archChartHost = document.getElementById('archetype-stream-chart');
    var archLegendHost = document.getElementById('archetype-legend');
    var archShiftsTable = document.getElementById('archetype-shifts-table');
    var archPanelsHost = document.getElementById('archetype-era-panels');
    var archMethodEl = document.getElementById('archetype-method-quote');

    if (archChartHost) {
      fetch(ARCH_URL).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (data) {
        renderArchetypeStream(archChartHost, archLegendHost, data);
        renderArchetypeShiftsTable(archShiftsTable, data.biggestShifts);
        renderEraPanels(archPanelsHost, data.eras);
        if (archMethodEl) archMethodEl.textContent = data.method;
      }).catch(function () {
        showArchetypeError(archChartHost, archLegendHost, archShiftsTable, archPanelsHost, archMethodEl);
      });
    }

    var trajHeadlineHost = document.getElementById('trajectory-headline');
    var trajCardsHost = document.getElementById('trajectory-class-cards');
    var trajChartHost = document.getElementById('trajectory-era-chart');
    var trajMotifHost = document.getElementById('trajectory-motif-list');
    var trajMethodEl = document.getElementById('trajectory-method-quote');

    if (trajChartHost) {
      fetch(TRAJ_URL).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (data) {
        renderTrajectoryHeadline(trajHeadlineHost, data.classStats);
        renderTrajectoryClassCards(trajCardsHost, data.classStats);
        renderTrajectoryEraChart(trajChartHost, data.eraTransitionRates);
        renderTrajectoryMotifs(trajMotifHost, data.topReinventionMotifs);
        if (trajMethodEl) trajMethodEl.textContent = data.method;
      }).catch(function () {
        showTrajectoryError(trajHeadlineHost, trajCardsHost, trajChartHost, trajMotifHost, trajMethodEl);
      });
    }
  });
})();

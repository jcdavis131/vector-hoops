/* Trend Research — approachable drift viz (assets/trends-viz.js).
 * Rotation gauge + ranked stat bars + 2D compass tilt. No 3D.
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var FEATURES = [
    'PTS', 'AST', 'OREB', 'DREB', 'STL', 'BLK', 'TOV', 'FG3A', 'FGA', 'FTA',
    'FG3_PCT', 'FG_PCT', 'FT_PCT', 'PLUS_MINUS'
  ];

  var FEATURE_LABEL = {
    PTS: 'Scoring volume', AST: 'Playmaking', OREB: 'Offensive rebounds',
    DREB: 'Defensive rebounds', STL: 'Steals', BLK: 'Shot blocking',
    TOV: 'Turnovers', FG3A: 'Three-point attempts', FGA: 'Field-goal attempts',
    FTA: 'Free-throw trips', FG3_PCT: 'Three-point accuracy',
    FG_PCT: 'Field-goal accuracy', FT_PCT: 'Free-throw accuracy',
    PLUS_MINUS: 'On-court impact'
  };

  // Fan-facing quadrant: +x = perimeter/spacing, +y = on-ball/usage
  var FEATURE_TILT = {
    FG3A: [1, 0.3], FG3_PCT: [1, 0.2], FGA: [0.4, 0.5], PTS: [0.3, 0.7],
    AST: [0, 0.8], TOV: [0, 0.5], STL: [0.2, 0.4],
    OREB: [-1, 0.2], BLK: [-0.9, 0.1], DREB: [-0.7, 0],
    FTA: [-0.3, 0.4], FG_PCT: [-0.2, 0.2], FT_PCT: [0, 0.1],
    PLUS_MINUS: [0.1, 0.6]
  };

  var STORY_CHIPS = [
    { label: 'COVID bubble', to: '2019-20' },
    { label: 'Post-bubble spacing', to: '2021-22' },
    { label: 'Hand-check era', to: '2004-05' },
    { label: 'Three-point wave', to: '2017-18' },
    { label: 'Latest', to: '2025-26' }
  ];

  var ORANGE = '#eb6834';
  var BLUE = '#2a78d6';
  var GREEN = '#199e70';
  var RED = '#d03b3b';
  var INK = '#111111';
  var MUTED = '#898781';
  var HAIR = '#e1e0d9';

  var QUALITY_LABEL = {
    favorable: 'Good for the league',
    unfavorable: 'Rough for the league',
    neutral: 'Style shift',
    unreliable: 'Hard to compare YoY'
  };

  var state = { pairs: [], chained: {}, biggestShifts: [], pairIdx: 0 };

  function pairIndex(toSeason) {
    for (var i = 0; i < state.pairs.length; i++) {
      if (state.pairs[i].to === toSeason) return i;
    }
    return -1;
  }

  function featureList(mostRotated) {
    return (mostRotated || []).map(function (m) {
      return FEATURE_LABEL[m.feature] || m.feature;
    }).join(', ');
  }

  function renderBiggestShifts(host) {
    if (!host) return;
    var shifts = state.biggestShifts;
    if (!shifts.length) {
      host.innerHTML = '<p class="drift-loading">No shift data.</p>';
      return;
    }
    host.innerHTML =
      '<div class="trends-biggest-head"><span class="trends-biggest-kicker">30-year view</span><span class="trends-biggest-title">Biggest reshapes — click to jump</span></div>' +
      '<div class="trends-biggest-row">' +
      shifts.map(function (p, rank) {
        var idx = pairIndex(p.to);
        var active = idx === state.pairIdx ? ' trends-shift-card--active' : '';
        var shortFeats = featureList(p.mostRotated).split(', ').slice(0,2).join(' + ');
        return '<button type="button" class="trends-shift-card' + active + '" data-idx="' + idx + '" title="' + shortFeats + '">' +
          '<span class="sc-rank">#' + (rank + 1) + '</span>' +
          '<span class="sc-season">' + p.from.replace("-20","-").replace("-19","-").replace("-18","-").replace("-17","-").replace("-16","-").slice(2) + "→" + p.to.slice(2) + '</span>' +
          '<span class="sc-deg">' + p.rotationDeg + '°</span>' +
          '</button>';
      }).join('') +
      '</div>';
    host.querySelectorAll('.trends-shift-card').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        if (idx >= 0) {
          state.pairIdx = idx;
          renderAll();
        }
      });
    });
  }

  function $(id) { return document.getElementById(id); }

  function svgEl(tag, attrs, parent) {
    var el = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

  function matMul(A, B) {
    var n = A.length;
    var out = [];
    for (var i = 0; i < n; i++) {
      out[i] = [];
      for (var j = 0; j < n; j++) {
        var s = 0;
        for (var k = 0; k < n; k++) s += A[i][k] * B[k][j];
        out[i][j] = s;
      }
    }
    return out;
  }

  function matTranspose(M) {
    var n = M.length;
    var out = [];
    for (var i = 0; i < n; i++) {
      out[i] = [];
      for (var j = 0; j < n; j++) out[i][j] = M[j][i];
    }
    return out;
  }

  function stepMatrix(fromSeason, toSeason) {
    var A = state.chained[fromSeason];
    var B = state.chained[toSeason];
    if (!A || !B) return null;
    return matMul(B, matTranspose(A));
  }

  function axisDriftsForPair(pair) {
    if (pair.axisDrifts && pair.axisDrifts.length) {
      return pair.axisDrifts.map(function (m) {
        return {
          feature: m.feature,
          drift: m.axisDrift,
          label: FEATURE_LABEL[m.feature] || m.feature
        };
      });
    }
    var Q = stepMatrix(pair.from, pair.to);
    if (!Q) {
      return (pair.mostRotated || []).map(function (m) {
        return { feature: m.feature, drift: m.axisDrift, label: FEATURE_LABEL[m.feature] || m.feature };
      });
    }
    return FEATURES.map(function (f, i) {
      return {
        feature: f,
        drift: Math.abs(1 - Math.abs(Q[i][i])),
        label: FEATURE_LABEL[f] || f
      };
    }).sort(function (a, b) { return b.drift - a.drift; });
  }

  function rotationVerdict(deg) {
    if (deg >= 11) return { word: 'Major reset', note: 'Comparisons across this year need extra context.' };
    if (deg >= 8) return { word: 'Big shift', note: 'Several stats changed how they rank players.' };
    if (deg >= 5) return { word: 'Moderate drift', note: 'Noticeable but not a full regime change.' };
    return { word: 'Steady', note: 'The league stat frame barely moved.' };
  }

  function tiltVector(drifts) {
    var x = 0, y = 0, w = 0;
    drifts.forEach(function (d) {
      var t = FEATURE_TILT[d.feature];
      if (!t) return;
      x += t[0] * d.drift;
      y += t[1] * d.drift;
      w += d.drift;
    });
    if (w < 1e-6) return { x: 0, y: 0 };
    return { x: x / w, y: y / w };
  }

  function tiltLabel(v) {
    var parts = [];
    if (v.x > 0.15) parts.push('perimeter & spacing');
    else if (v.x < -0.15) parts.push('paint & interior');
    if (v.y > 0.15) parts.push('on-ball & usage');
    else if (v.y < -0.15) parts.push('low-event role play');
    return parts.length ? parts.join(', ') : 'balanced across styles';
  }

  function compassPoint(v, r, cx, cy) {
    var mag = Math.sqrt(v.x * v.x + v.y * v.y);
    var scale = mag > 0.01 ? Math.min(r - 20, 30 + mag * 70) / mag : 0;
    return {
      x: cx + v.x * scale,
      y: cy - v.y * scale,
      visible: scale > 0
    };
  }

  function renderGauge(host, pair) {
    host.innerHTML = '';
    var W = 280, H = 170;
    var deg = pair.rotationDeg;
    var verdict = rotationVerdict(deg);
    var maxDeg = 14;
    var cx = W / 2, cy = H - 18, r = 100;

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      role: 'img',
      'aria-label': 'Rotation gauge ' + deg + ' degrees, ' + verdict.word
    }, host);

    // arc background zones
    var zones = [
      { to: 5, color: 'rgba(25,158,112,0.15)' },
      { to: 8, color: 'rgba(201,133,0,0.15)' },
      { to: 11, color: 'rgba(235,104,52,0.18)' },
      { to: maxDeg, color: 'rgba(208,59,59,0.18)' }
    ];
    var prev = 0;
    zones.forEach(function (z) {
      var a0 = Math.PI + (prev / maxDeg) * Math.PI;
      var a1 = Math.PI + (z.to / maxDeg) * Math.PI;
      var x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
      var x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      svgEl('path', {
        d: 'M ' + x0 + ' ' + y0 + ' A ' + r + ' ' + r + ' 0 0 1 ' + x1 + ' ' + y1,
        fill: 'none', stroke: z.color, 'stroke-width': 18, 'stroke-linecap': 'butt'
      }, svg);
      prev = z.to;
    });

    svgEl('path', {
      d: 'M ' + (cx - r) + ' ' + cy + ' A ' + r + ' ' + r + ' 0 0 1 ' + (cx + r) + ' ' + cy,
      fill: 'none', stroke: HAIR, 'stroke-width': 2
    }, svg);

    [0, 5, 10, 14].forEach(function (tick) {
      var a = Math.PI + (tick / maxDeg) * Math.PI;
      var tx = cx + (r + 10) * Math.cos(a);
      var ty = cy + (r + 10) * Math.sin(a);
      svgEl('text', {
        x: tx, y: ty + 3, 'text-anchor': 'middle', 'font-size': 9, fill: MUTED
      }, svg).textContent = tick + '°';
    });

    var needleA = Math.PI + (Math.min(deg, maxDeg) / maxDeg) * Math.PI;
    var nx = cx + (r - 8) * Math.cos(needleA);
    var ny = cy + (r - 8) * Math.sin(needleA);
    svgEl('line', {
      x1: cx, y1: cy, x2: nx, y2: ny, stroke: ORANGE, 'stroke-width': 3, 'stroke-linecap': 'round'
    }, svg);
    svgEl('circle', { cx: cx, cy: cy, r: 6, fill: ORANGE }, svg);

    svgEl('text', {
      x: cx, y: cy - 28, 'text-anchor': 'middle', 'font-size': 28, 'font-weight': 700, fill: INK
    }, svg).textContent = deg + '°';
    svgEl('text', {
      x: cx, y: cy - 10, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: ORANGE
    }, svg).textContent = verdict.word;
    svgEl('text', {
      x: cx, y: 14, 'text-anchor': 'middle', 'font-size': 10, fill: MUTED
    }, svg).textContent = pair.from + ' → ' + pair.to;
  }

  function insightMap(pair) {
    var map = {};
    (pair.statInsights || []).forEach(function (ins) {
      map[ins.feature] = ins;
    });
    return map;
  }

  function barColor(ins, hot) {
    if (!ins) return hot ? ORANGE : 'rgba(42,120,214,0.55)';
    if (ins.quality === 'favorable') return hot ? GREEN : 'rgba(25,158,112,0.55)';
    if (ins.quality === 'unfavorable') return hot ? RED : 'rgba(208,59,59,0.5)';
    if (ins.quality === 'unreliable') return hot ? '#9085e9' : 'rgba(144,133,233,0.55)';
    return hot ? ORANGE : 'rgba(42,120,214,0.55)';
  }

  function renderShiftBars(host, drifts, pair) {
    host.innerHTML = '';
    var W = 520, H = 340;
    var top = drifts.slice(0, 10);
    var maxD = top[0] ? top[0].drift : 0.1;
    var left = 150, right = 16, rowH = 28, topPad = 36;
    var insights = insightMap(pair);

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      role: 'img',
      'aria-label': 'Stats that changed meaning most for ' + pair.to
    }, host);

    svgEl('text', {
      x: left, y: 18, 'font-size': 11, 'font-weight': 700, fill: INK
    }, svg).textContent = 'Which stats changed meaning?';

    top.forEach(function (d, i) {
      var y = topPad + i * rowH;
      var barW = ((W - left - right) * d.drift) / maxD;
      var hot = i < 3;
      var ins = insights[d.feature];
      svgEl('text', {
        x: left - 8, y: y + 14, 'text-anchor': 'end', 'font-size': 10, fill: hot ? INK : MUTED,
        'font-weight': hot ? 700 : 400
      }, svg).textContent = d.label;
      svgEl('rect', {
        x: left, y: y + 4, width: barW, height: 16, rx: 3,
        fill: barColor(ins, hot)
      }, svg);
      var meta = ins && QUALITY_LABEL[ins.quality] ? ' · ' + QUALITY_LABEL[ins.quality] : '';
      svgEl('text', {
        x: left + barW + 6, y: y + 15, 'font-size': 9, fill: MUTED
      }, svg).textContent = (d.drift * 100).toFixed(1) + meta;
    });

    svgEl('text', {
      x: left, y: H - 10, 'font-size': 9, fill: MUTED
    }, svg).textContent = 'Bar length = how much that stat shifted. Color = unusual vs earlier seasons.';
  }

  function renderStatNarratives(host, pair) {
    if (!host) return;
    var insights = pair.statInsights || [];
    var verdict = rotationVerdict(pair.rotationDeg);
    if (!insights.length) {
      host.innerHTML = '<div class="season-story"><p class="story-intro"><strong>' + pair.to + '</strong> was a ' + verdict.word.toLowerCase() + ' year (' + pair.rotationDeg + '°). ' + verdict.note + '</p><p class="story-empty">No single stat crossed the drift threshold — the frame held steady.</p></div>';
      return;
    }
    // Build cohesive narrative — one lede + 2-3 flowing paragraphs instead of bullet cards
    var topLabels = insights.slice(0,3).map(function(ins){ return (FEATURE_LABEL[ins.feature]||ins.label).toLowerCase(); });
    var lede = '<p class="story-lede"><strong>' + pair.to + '</strong> rotated <strong>' + pair.rotationDeg + '°</strong> — ' + verdict.word.toLowerCase() + '. ' + verdict.note + ' ' +
      (pair.interpretation ? '<span class="story-interp">' + pair.interpretation + '</span> ' : '') +
      'The move was led by <strong>' + topLabels.slice(0,2).join('</strong> & <strong>') + '</strong>' + (topLabels[2] ? ' and <strong>' + topLabels[2] + '</strong>' : '') + '.</p>';

    var body = insights.map(function(ins, i){
      var q = ins.quality || 'neutral';
      var badge = QUALITY_LABEL[q] || 'Style shift';
      var badgeCls = 'mini-badge mini-badge--' + q;
      // clean narrative — keep original but ensure sentence start
      var text = ins.narrative || '';
      // Avoid repeating feature name if narrative already starts with it
      return '<p class="story-para"><span class="story-stat">' + (FEATURE_LABEL[ins.feature]||ins.label) + '</span> <span class="' + badgeCls + '">' + badge + '</span><span class="story-dot"> — </span>' + text + '</p>';
    }).join('');

    // Combine into 2 visual paragraphs if >3 insights — split after 2
    var mid = Math.ceil(insights.length/2);
    var firstHalf = insights.slice(0,mid).map(function(ins){
      var q=ins.quality||'neutral'; var badge=QUALITY_LABEL[q]||'Style shift';
      return '<p class="story-para"><span class="story-stat">' + (FEATURE_LABEL[ins.feature]||ins.label) + '</span> <span class="mini-badge mini-badge--' + q + '">' + badge + '</span><span class="story-dot"> — </span>' + ins.narrative + '</p>';
    }).join('');
    // For cohesive flow, we keep same but wrap in container
    host.innerHTML = '<div class="season-story">' + lede + '<div class="story-divider"></div>' + firstHalf + (insights.length>mid ? '<div class="story-divider light"></div>' + insights.slice(mid).map(function(ins){
      var q=ins.quality||'neutral'; var badge=QUALITY_LABEL[q]||'Style shift';
      return '<p class="story-para"><span class="story-stat">' + (FEATURE_LABEL[ins.feature]||ins.label) + '</span> <span class="mini-badge mini-badge--' + q + '">' + badge + '</span><span class="story-dot"> — </span>' + ins.narrative + '</p>';
    }).join('') : '') + '</div>';
  }

  function renderCompass(host, drifts, pair) {
    host.innerHTML = '';
    var W = 280, H = 280;
    var cx = W / 2, cy = H / 2, r = 100;
    var v = tiltVector(drifts);
    var label = tiltLabel(v);

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      role: 'img',
      'aria-label': 'League tilted toward ' + label + (pair ? (' in ' + pair.to) : '')
    }, host);

    svgEl('circle', {
      cx: cx, cy: cy, r: r, fill: 'rgba(250,249,245,0.9)', stroke: HAIR, 'stroke-width': 1.5
    }, svg);

    // cross axes
    svgEl('line', { x1: cx - r, y1: cy, x2: cx + r, y2: cy, stroke: HAIR, 'stroke-width': 1 }, svg);
    svgEl('line', { x1: cx, y1: cy - r, x2: cx, y2: cy + r, stroke: HAIR, 'stroke-width': 1 }, svg);

    var labels = [
      { t: 'Perimeter & spacing', x: cx + r - 8, y: cy - 8, anchor: 'end' },
      { t: 'Paint & interior', x: cx - r + 8, y: cy - 8, anchor: 'start' },
      { t: 'On-ball & usage', x: cx, y: cy - r + 14, anchor: 'middle' },
      { t: 'Low-event roles', x: cx, y: cy + r - 6, anchor: 'middle' }
    ];
    labels.forEach(function (lb) {
      svgEl('text', {
        x: lb.x, y: lb.y, 'text-anchor': lb.anchor, 'font-size': 9, fill: MUTED, 'font-weight': 600
      }, svg).textContent = lb.t;
    });

    // Background context: show all other seasons as muted points.
    state.pairs.forEach(function (p) {
      if (pair && p.to === pair.to) return;
      var pt = compassPoint(tiltVector(axisDriftsForPair(p)), r, cx, cy);
      if (!pt.visible) return;
      svgEl('circle', {
        cx: pt.x, cy: pt.y, r: 3.2, fill: 'rgba(20,24,38,0.22)'
      }, svg);
    });

    // Active season: highlight as the orange point only (no line).
    var active = compassPoint(v, r, cx, cy);
    if (active.visible) {
      svgEl('circle', { cx: active.x, cy: active.y, r: 5.2, fill: ORANGE }, svg);
    }

    svgEl('text', {
      x: cx, y: H - 14, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: INK
    }, svg).textContent = 'League tilted toward:';
    svgEl('text', {
      x: cx, y: H - 2, 'text-anchor': 'middle', 'font-size': 10, fill: ORANGE
    }, svg).textContent = label;
  }

  function updateStory(pair, drifts) {
    var cap = $('trends-viz-caption');
    if (!cap || !pair) return;
    var verdict = rotationVerdict(pair.rotationDeg);
    var lead = pair.statInsights && pair.statInsights[0];
    var leadLine = lead
      ? ' <strong>' + lead.label + '</strong> led the move (' +
        QUALITY_LABEL[lead.quality].toLowerCase() + ' vs prior seasons).'
      : '';
    var interp = pair.interpretation ? (' ' + pair.interpretation) : '';
    cap.innerHTML =
      '<strong>' + pair.to + '</strong> was a <strong>' + verdict.word.toLowerCase() + '</strong> year (' +
      pair.rotationDeg + '°). ' + verdict.note + leadLine +
      (interp ? ' <span class="trends-viz-caption__interp">' + interp + '</span>' : '');
  }

  function renderChips() {
    var host = $('trends-story-chips');
    if (!host) return;
    host.innerHTML = STORY_CHIPS.map(function (chip) {
      var idx = -1;
      for (var i = 0; i < state.pairs.length; i++) {
        if (state.pairs[i].to === chip.to) { idx = i; break; }
      }
      if (idx < 0) return '';
      var active = idx === state.pairIdx ? ' trends-chip--active' : '';
      return '<button type="button" class="trends-chip' + active + '" data-idx="' + idx + '">' +
        chip.label + '</button>';
    }).join('');
    host.querySelectorAll('.trends-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.pairIdx = parseInt(btn.getAttribute('data-idx'), 10);
        renderAll();
      });
    });
  }

  function renderAll() {
    var pair = state.pairs[state.pairIdx];
    if (!pair) return;
    var drifts = axisDriftsForPair(pair);
    renderBiggestShifts($('trends-biggest-shifts'));
    renderGauge($('trends-rotation-gauge'), pair);
    renderShiftBars($('trends-shift-bars'), drifts, pair);
    renderStatNarratives($('trends-stat-narratives'), pair);
    renderCompass($('trends-tilt-compass'), drifts, pair);
    updateStory(pair, drifts);
    renderChips();
    var slider = $('trends-season-slider');
    if (slider) slider.value = String(state.pairIdx);
    var label = $('trends-season-label');
    if (label) label.textContent = pair.to;
  }

  function bindControls() {
    var slider = $('trends-season-slider');
    if (slider) {
      slider.max = String(Math.max(0, state.pairs.length - 1));
      slider.addEventListener('input', function () {
        state.pairIdx = parseInt(slider.value, 10) || 0;
        renderAll();
      });
    }
    window.addEventListener('resize', renderAll);
  }

  function init(drift) {
    state.pairs = drift.pairs || [];
    state.chained = drift.chainedToRoot || {};
    state.biggestShifts = drift.biggestShifts || [];
    state.pairIdx = Math.max(0, state.pairs.length - 1);
    bindControls();
    renderAll();
  }

  window.VHTrendsViz = {
    setPair: function (idx) {
      if (idx < 0 || idx >= state.pairs.length) return;
      state.pairIdx = idx;
      renderAll();
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (!$('trends-rotation-gauge')) return;
    fetch('assets/drift.json?v=a420f8c8')
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(init)
      .catch(function () {
        var cap = $('trends-viz-caption');
        if (cap) cap.textContent = 'Could not load drift data.';
      });
  });
})();

/* court-draw.js — THE single court renderer for Vector Hoops.
 *
 * Hoop-centric feet: hoop at (0,0), +y toward half court, x left/right.
 * Every dimension below is computed from GEOM; the dimension labels are
 * formatted from the same constants — a drafting table never lies.
 *
 * No page may draw its own court. Use VHCourtDraw.drawCourt(svg).
 * Zero dependencies. IIFE.
 */
(function (global) {
  'use strict';

  var GEOM = {
    COURT_W: 50,          // sideline to sideline, ft
    COURT_L: 94,          // baseline to baseline, ft
    HOOP_X: 0,
    BASELINE_Y: -5.25,    // ft behind the hoop
    HALF_Y: 41.75,        // half-court line, ft from hoop (47 - 5.25)
    RIM_R: 0.75,
    BOARD_Y: -1.25, BOARD_W: 6,
    RA_R: 4,              // restricted-area arc
    THREE_R: 23.75,
    CORNER_X: 22,
    FT_Y: 13.75, FT_R: 6,
    LANE_W: 16,
    HEX_SIZE: 1.5         // pointy-top hex, center to corner, ft
  };
  // The corner-three line meets the arc where x^2 + y^2 = r^2.
  GEOM.CORNER_Y = Math.sqrt(GEOM.THREE_R * GEOM.THREE_R -
                            GEOM.CORNER_X * GEOM.CORNER_X);
  GEOM.ARC_A0 = Math.atan2(GEOM.CORNER_Y, GEOM.CORNER_X);

  // View window in screen-feet (y down). Covers y_ft in [-10, 46].
  var VIEW = { x0: -28, y0: -46, w: 56, h: 56 };

  var SVGNS = 'http://www.w3.org/2000/svg';

  // --- coordinate helpers ------------------------------------------------
  function X(x) { return x; }          // hoop-centric ft -> screen ft
  function Y(y) { return -y; }         // +y to half court, screen y is down
  function P(x, y) { return [X(x), Y(y)]; }

  // --- path builders (angles in radians, y-up math convention) -----------
  function arcPath(cx, cy, r, a0, a1) {
    var p0 = P(cx + r * Math.cos(a0), cy + r * Math.sin(a0));
    var p1 = P(cx + r * Math.cos(a1), cy + r * Math.sin(a1));
    var large = (a1 - a0 > Math.PI) ? 1 : 0;
    // y-up CCW appears clockwise on screen -> sweep flag 1
    return 'M ' + f2(p0[0]) + ' ' + f2(p0[1]) +
           ' A ' + f2(r) + ' ' + f2(r) + ' 0 ' + large + ' 1 ' +
           f2(p1[0]) + ' ' + f2(p1[1]);
  }
  function linePath(x0, y0, x1, y1) {
    var a = P(x0, y0), b = P(x1, y1);
    return 'M ' + f2(a[0]) + ' ' + f2(a[1]) +
           ' L ' + f2(b[0]) + ' ' + f2(b[1]);
  }
  function f2(n) { return (Math.round(n * 100) / 100).toString(); }

  function fmtFt(n) {
    var s = (Math.round(n * 100) / 100).toString();
    return s + ' FT';
  }

  // Pointy-top hex corners in feet, center (cx, cy) hoop-centric.
  function hexPoints(cx, cy, size) {
    size = size || GEOM.HEX_SIZE;
    var pts = [];
    for (var i = 0; i < 6; i++) {
      var a = Math.PI / 180 * (60 * i - 30);
      pts.push(P(cx + size * Math.cos(a), cy + size * Math.sin(a)));
    }
    return pts;
  }
  // Axial (q, r) -> hoop-centric feet center. Mirrors build_shots.py.
  function hexCenter(q, r, size) {
    size = size || GEOM.HEX_SIZE;
    return [size * Math.sqrt(3) * (q + r / 2), size * 1.5 * r];
  }

  // --- seeded wobble (hand-drawn marker feel, deterministic) --------------
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function wobblePath(points, amp, seed) {
    var rnd = mulberry32(seed || 7);
    var out = [];
    for (var i = 0; i < points.length; i++) {
      var jx = (rnd() - 0.5) * 2 * amp;
      var jy = (rnd() - 0.5) * 2 * amp;
      out.push([points[i][0] + jx, points[i][1] + jy]);
    }
    return out;
  }

  // --- element factory ----------------------------------------------------
  function el(name, attrs, parent) {
    var node = document.createElementNS(SVGNS, name);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) {
        node.setAttribute(k, attrs[k]);
      }
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  function label(parent, x, y, text, rotate) {
    var t = el('text', {
      x: f2(X(x)), y: f2(Y(y)),
      'class': 'court-dim',
      'text-anchor': 'middle',
      'dominant-baseline': 'middle'
    }, parent);
    if (rotate) t.setAttribute('transform',
      'rotate(' + rotate + ' ' + f2(X(x)) + ' ' + f2(Y(y)) + ')');
    t.textContent = text;
    return t;
  }

  // --- the court ----------------------------------------------------------
  function drawCourt(svg, opts) {
    opts = opts || {};
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox',
      VIEW.x0 + ' ' + VIEW.y0 + ' ' + VIEW.w + ' ' + VIEW.h);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label',
      'Half-court diagram, hoop at bottom, dimensions in feet');

    var defs = el('defs', {}, svg);
    var glow = el('filter', { id: 'vh-son-glow', x: '-80%', y: '-80%',
      width: '260%', height: '260%' }, defs);
    el('feGaussianBlur', { stdDeviation: '0.55', result: 'b' }, glow);
    var merge = el('feMerge', {}, glow);
    el('feMergeNode', { 'in': 'b' }, merge);
    el('feMergeNode', { 'in': 'SourceGraphic' }, merge);

    var base = el('g', { 'class': 'court-base' }, svg);
    var data = el('g', { 'class': 'court-data' }, svg);
    var ghost = el('g', { 'class': 'court-ghost' }, svg);
    var anno = el('g', { 'class': 'court-anno' }, svg);

    var G = GEOM;
    var LW = 0.10;   // main linework, ft
    var LW2 = 0.06;  // ticks, ft

    // boundary
    el('rect', {
      x: f2(X(-G.COURT_W / 2)), y: f2(Y(G.HALF_Y)),
      width: f2(G.COURT_W), height: f2(G.HALF_Y - G.BASELINE_Y),
      'class': 'court-line', 'stroke-width': LW
    }, base);

    // half-court line + center circle (near half)
    el('path', { d: linePath(-25, G.HALF_Y, 25, G.HALF_Y),
      'class': 'court-line', 'stroke-width': LW }, base);
    el('path', { d: arcPath(0, G.HALF_Y, 6, Math.PI, 2 * Math.PI),
      'class': 'court-line', 'stroke-width': LW }, base);

    // lane
    el('rect', {
      x: f2(X(-G.LANE_W / 2)), y: f2(Y(G.FT_Y)),
      width: f2(G.LANE_W), height: f2(G.FT_Y - G.BASELINE_Y),
      'class': 'court-line', 'stroke-width': LW
    }, base);
    // free-throw circle: solid far half, dashed near half
    el('path', { d: arcPath(0, G.FT_Y, G.FT_R, 0, Math.PI),
      'class': 'court-line', 'stroke-width': LW }, base);
    el('path', { d: arcPath(0, G.FT_Y, G.FT_R, Math.PI, 2 * Math.PI),
      'class': 'court-line court-dash', 'stroke-width': LW }, base);
    // lane hash marks
    for (var h = 0; h < 4; h++) {
      var hy = 2.75 + h * 3;
      el('path', { d: linePath(-8.9, hy, -8, hy),
        'class': 'court-line', 'stroke-width': LW2 }, base);
      el('path', { d: linePath(8, hy, 8.9, hy),
        'class': 'court-line', 'stroke-width': LW2 }, base);
    }

    // backboard + rim
    el('path', { d: linePath(-G.BOARD_W / 2, G.BOARD_Y, G.BOARD_W / 2, G.BOARD_Y),
      'class': 'court-line', 'stroke-width': LW }, base);
    el('circle', { cx: f2(X(0)), cy: f2(Y(0)), r: f2(G.RIM_R),
      'class': 'court-line', 'stroke-width': LW }, base);

    // restricted arc
    el('path', { d: arcPath(0, 0, G.RA_R, 0, Math.PI),
      'class': 'court-line', 'stroke-width': LW }, base);

    // corner threes + arc
    el('path', { d: linePath(-G.CORNER_X, G.BASELINE_Y, -G.CORNER_X, G.CORNER_Y),
      'class': 'court-line', 'stroke-width': LW }, base);
    el('path', { d: linePath(G.CORNER_X, G.BASELINE_Y, G.CORNER_X, G.CORNER_Y),
      'class': 'court-line', 'stroke-width': LW }, base);
    el('path', { d: arcPath(0, 0, G.THREE_R, G.ARC_A0, Math.PI - G.ARC_A0),
      'class': 'court-line', 'stroke-width': LW }, base);

    // baseline dimension ticks every 10 ft
    for (var tx = -20; tx <= 20; tx += 10) {
      el('path', { d: linePath(tx, G.BASELINE_Y, tx, G.BASELINE_Y - 0.6),
        'class': 'court-line', 'stroke-width': LW2 }, base);
    }

    // dimension labels — computed, never hardcoded
    label(base, 0, G.THREE_R + 1.35, fmtFt(G.THREE_R));
    label(base, G.COURT_W / 2 + 2.1, (G.HALF_Y + G.BASELINE_Y) / 2,
      fmtFt(G.COURT_L), -90);
    label(base, 0, G.BASELINE_Y - 1.75, fmtFt(G.COURT_W));
    label(base, G.RA_R + 1.5, 1.1, fmtFt(G.RA_R));

    var api = {
      el: svg, base: base, data: data, ghost: ghost, anno: anno,
      GEOM: GEOM, X: X, Y: Y, P: P,
      arcPath: arcPath, linePath: linePath,
      hexPoints: hexPoints, hexCenter: hexCenter,
      wobblePath: wobblePath, el: el, fmtFt: fmtFt
    };
    if (!opts.noDrawIn) drawIn(svg, opts);
    return api;
  }

  // --- draw-in animation --------------------------------------------------
  var reducedMotion = (typeof window !== 'undefined' && window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function drawIn(svg, opts) {
    opts = opts || {};
    var ms = opts.ms || 900;
    if (reducedMotion || ms <= 0) return;
    var paths = svg.querySelectorAll('.court-base path, .court-base circle, ' +
      '.court-base rect');
    for (var i = 0; i < paths.length; i++) {
      (function (node, idx) {
        var len;
        try { len = node.getTotalLength(); } catch (e) { return; }
        node.style.strokeDasharray = len;
        node.style.strokeDashoffset = len;
        node.style.transition = 'none';
        // stagger lightly down the court
        var delay = (idx / paths.length) * ms * 0.35;
        window.setTimeout(function () {
          node.style.transition =
            'stroke-dashoffset ' + Math.round(ms * 0.65) + 'ms ease-out';
          node.style.strokeDashoffset = '0';
        }, delay);
      })(paths[i], i);
    }
  }

  // --- 14 shot zones (mirrors build_shots.py; keep in sync) ---------------
  var ZONES = [
    ['HEAVE', 'Heave'],
    ['RA', 'Restricted area'],
    ['PAINT', 'Paint'],
    ['C3_L', 'Corner 3 · left'],
    ['C3_R', 'Corner 3 · right'],
    ['MR_LC', 'Mid-range · left corner'],
    ['MR_RC', 'Mid-range · right corner'],
    ['MR_LW', 'Mid-range · left wing'],
    ['MR_RW', 'Mid-range · right wing'],
    ['MR_TS', 'Mid-range · top short'],
    ['MR_TL', 'Mid-range · top long'],
    ['W3_L', 'Wing 3 · left'],
    ['W3_R', 'Wing 3 · right'],
    ['T3', 'Top 3']
  ];

  global.VHCourtDraw = {
    GEOM: GEOM,
    drawCourt: drawCourt,
    drawIn: drawIn,
    X: X, Y: Y, P: P,
    arcPath: arcPath, linePath: linePath,
    hexPoints: hexPoints, hexCenter: hexCenter,
    wobblePath: wobblePath,
    fmtFt: fmtFt,
    ZONES: ZONES,
    el: el
  };
})(typeof window !== 'undefined' ? window : this);

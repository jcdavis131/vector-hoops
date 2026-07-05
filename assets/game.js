/* Vector Hoops — game.js
 * Zero deps, zero build. Loads assets/vectors.json and runs "The Chimera":
 * a daily fused player-season, 6 guesses, cosine-similarity feedback,
 * a half-court zone-presence story, and a 3D league starfield map.
 *
 * Data contract (assets/vectors.json), produced by pipeline/build_vectors.py:
 *   { built, seasons:[first,last], normalization, features:[14],
 *     featureLabels:{feature->label}, clusters:[8 names],
 *     players:[{id,name,season,v:[14 z-scores],x,y,z,c,sal?}, ...] }
 * x,y,z are PCA(3) map coordinates in [0,1]; sal (optional) is the
 * era-honest salary z-score when the dataset carries payroll coverage.
 */
(function () {
  'use strict';

  var DATA_URL = 'assets/vectors.json';
  var EPOCH_DATE = '2026-07-01'; // puzzle #1
  var MAX_GUESSES = 6;
  var WIN_SIMILARITY = 0.92;
  var LS_KEY = 'vectorHoops.v2';
  var A_COUNT = 7; // first 7 dims come from player A, last 7 from player B

  // Feature indices (fixed by pipeline/build_vectors.py FEATURES order)
  var IDX = {
    PTS: 0, AST: 1, OREB: 2, DREB: 3, STL: 4, BLK: 5, TOV: 6,
    FG3A: 7, FGA: 8, FTA: 9, FG3_PCT: 10, FG_PCT: 11, FT_PCT: 12, PLUS_MINUS: 13
  };

  // ---------------------------------------------------------------------
  // Deterministic PRNG: xmur3 string hash -> mulberry32 generator
  // ---------------------------------------------------------------------

  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededRng(str) {
    var seedFn = xmur3(str);
    return mulberry32(seedFn());
  }

  // ---------------------------------------------------------------------
  // Vector math
  // ---------------------------------------------------------------------

  function dot(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  function norm(a) {
    return Math.sqrt(dot(a, a));
  }

  function cosineSim(a, b) {
    var na = norm(a), nb = norm(b);
    if (na === 0 || nb === 0) return 0;
    return dot(a, b) / (na * nb);
  }

  // ---------------------------------------------------------------------
  // Date helpers (UTC — one puzzle per UTC day)
  // ---------------------------------------------------------------------

  function utcDateString(d) {
    d = d || new Date();
    return d.toISOString().slice(0, 10); // YYYY-MM-DD in UTC
  }

  function daysBetweenUTC(fromStr, toStr) {
    var a = Date.parse(fromStr + 'T00:00:00Z');
    var b = Date.parse(toStr + 'T00:00:00Z');
    return Math.round((b - a) / 86400000);
  }

  function puzzleNumber(todayStr) {
    return daysBetweenUTC(EPOCH_DATE, todayStr) + 1;
  }

  // ---------------------------------------------------------------------
  // App state
  // ---------------------------------------------------------------------

  var DATA = null;         // parsed vectors.json
  var CENTROIDS = null;    // [k][14] mean vector per cluster
  var CLUSTER_XYZ = null;  // [k]{x,y,z,n} mean map position per cluster
  var TARGET = null;       // { a, b, vector, clusterIdx }
  var STATE = null;        // persisted localStorage state
  var TODAY = utcDateString();

  var els = {}; // cached DOM refs, filled in initDom()

  // ---------------------------------------------------------------------
  // Data prep
  // ---------------------------------------------------------------------

  function computeCentroids(players, k, dims) {
    var sums = [];
    var counts = [];
    for (var c = 0; c < k; c++) {
      sums.push(new Array(dims).fill(0));
      counts.push(0);
    }
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var s = sums[p.c];
      if (!s) continue;
      for (var d = 0; d < dims; d++) s[d] += p.v[d];
      counts[p.c]++;
    }
    for (c = 0; c < k; c++) {
      var n = counts[c] || 1;
      for (d = 0; d < dims; d++) sums[c][d] /= n;
    }
    return sums;
  }

  function computeClusterXYZ(players, k) {
    var sums = [];
    for (var c = 0; c < k; c++) sums.push({ x: 0, y: 0, z: 0, n: 0 });
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var s = sums[p.c];
      if (!s) continue;
      s.x += p.x; s.y += p.y; s.z += p.z; s.n++;
    }
    for (c = 0; c < k; c++) {
      if (sums[c].n > 0) { sums[c].x /= sums[c].n; sums[c].y /= sums[c].n; sums[c].z /= sums[c].n; }
      else { sums[c].x = 0.5; sums[c].y = 0.5; sums[c].z = 0.5; }
    }
    return sums;
  }

  function nearestCentroidIdx(vector, centroids) {
    var best = 0, bestDist = Infinity;
    for (var c = 0; c < centroids.length; c++) {
      var d = 0;
      for (var i = 0; i < vector.length; i++) {
        var diff = vector[i] - centroids[c][i];
        d += diff * diff;
      }
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return best;
  }

  function playerKey(p) {
    return p.name + ' (' + p.season + ')';
  }

  // ---------------------------------------------------------------------
  // Daily Chimera target selection
  // ---------------------------------------------------------------------

  function buildDailyTarget() {
    var players = DATA.players;
    var rng = seededRng('vector-hoops:' + TODAY);
    var a, b, tries = 0;
    do {
      var ia = Math.floor(rng() * players.length);
      var ib = Math.floor(rng() * players.length);
      a = players[ia];
      b = players[ib];
      tries++;
    } while (
      tries < 2000 &&
      (a === b || cosineSim(a.v, b.v) >= 0.3)
    );

    var vector = new Array(a.v.length);
    for (var i = 0; i < vector.length; i++) {
      vector[i] = i < A_COUNT ? a.v[i] : b.v[i];
    }

    var clusterIdx = nearestCentroidIdx(vector, CENTROIDS);

    return { a: a, b: b, vector: vector, clusterIdx: clusterIdx };
  }

  // ---------------------------------------------------------------------
  // Trait phrasing for the prompt
  // ---------------------------------------------------------------------

  function traitList(indices) {
    return indices.map(function (i) {
      return DATA.featureLabels[DATA.features[i]];
    });
  }

  function joinOxford(list) {
    if (list.length === 0) return '';
    if (list.length === 1) return list[0];
    if (list.length === 2) return list[0] + ' and ' + list[1];
    return list.slice(0, -1).join(', ') + ', and ' + list[list.length - 1];
  }

  function renderPrompt() {
    var aIdx = [0, 1, 2, 3, 4, 5, 6];
    var bIdx = [7, 8, 9, 10, 11, 12, 13];
    var aPhrase = joinOxford(traitList(aIdx));
    var bPhrase = joinOxford(traitList(bIdx));

    els.puzzleNumber.textContent = 'Vector Hoops #' + puzzleNumber(TODAY);
    els.puzzleDay.textContent = String(puzzleNumber(TODAY));
    els.promptText.innerHTML =
      "Today's Chimera: the <b>" + aPhrase + '</b> profile of one legend fused with the <b>' +
      bPhrase + '</b> profile of another. Same season halves, two different careers &mdash; find both.';
  }

  // ---------------------------------------------------------------------
  // localStorage state
  // ---------------------------------------------------------------------

  function defaultState() {
    return { streak: 0, lastWinDate: null, days: {} };
  }

  function loadState() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) { raw = null; }
    var s = defaultState();
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          s.streak = parsed.streak || 0;
          s.lastWinDate = parsed.lastWinDate || null;
          s.days = parsed.days || {};
        }
      } catch (e) { /* corrupt state, fall back to default */ }
    }
    if (!s.days[TODAY]) {
      s.days[TODAY] = { guesses: [], done: false, won: false };
    }
    return s;
  }

  function saveState() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(STATE)); } catch (e) { /* storage unavailable */ }
  }

  function todayRecord() {
    return STATE.days[TODAY];
  }

  function registerCompletion(won) {
    var rec = todayRecord();
    rec.done = true;
    rec.won = won;
    if (won) {
      var yesterday = utcDateString(new Date(Date.now() - 86400000));
      STATE.streak = (STATE.lastWinDate === yesterday) ? STATE.streak + 1 : 1;
      STATE.lastWinDate = TODAY;
    } else {
      STATE.streak = 0;
    }
    saveState();
    renderStreak();
  }

  function renderStreak() {
    els.streakNum.textContent = String(STATE.streak);
  }

  // ---------------------------------------------------------------------
  // Autocomplete
  // ---------------------------------------------------------------------

  function createAutocomplete(inputEl, listEl, players, onSelect) {
    var activeIdx = -1;
    var currentMatches = [];

    function close() {
      listEl.hidden = true;
      listEl.innerHTML = '';
      inputEl.setAttribute('aria-expanded', 'false');
      activeIdx = -1;
      currentMatches = [];
    }

    function open(matches) {
      currentMatches = matches;
      activeIdx = -1;
      listEl.innerHTML = '';
      if (matches.length === 0) { close(); return; }
      matches.forEach(function (p, idx) {
        var li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.textContent = playerKey(p);
        li.dataset.idx = String(idx);
        li.addEventListener('mousedown', function (ev) {
          ev.preventDefault();
          select(idx);
        });
        listEl.appendChild(li);
      });
      listEl.hidden = false;
      inputEl.setAttribute('aria-expanded', 'true');
    }

    function highlight() {
      var items = listEl.querySelectorAll('li');
      items.forEach(function (li, idx) {
        li.classList.toggle('active', idx === activeIdx);
      });
      if (activeIdx >= 0 && items[activeIdx]) {
        items[activeIdx].scrollIntoView({ block: 'nearest' });
      }
    }

    function select(idx) {
      var p = currentMatches[idx];
      if (!p) return;
      inputEl.value = playerKey(p);
      close();
      onSelect(p);
    }

    function search(term) {
      term = term.trim().toLowerCase();
      if (!term) { close(); return; }
      var matches = [];
      for (var i = 0; i < players.length && matches.length < 8; i++) {
        var p = players[i];
        if (playerKey(p).toLowerCase().indexOf(term) !== -1) matches.push(p);
      }
      open(matches);
    }

    inputEl.addEventListener('input', function () { search(inputEl.value); });

    inputEl.addEventListener('keydown', function (ev) {
      if (listEl.hidden) return;
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        activeIdx = Math.min(activeIdx + 1, currentMatches.length - 1);
        highlight();
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        highlight();
      } else if (ev.key === 'Enter') {
        if (activeIdx >= 0) {
          ev.preventDefault();
          select(activeIdx);
        }
      } else if (ev.key === 'Escape') {
        close();
      }
    });

    inputEl.addEventListener('blur', function () {
      setTimeout(close, 120);
    });

    return { close: close };
  }

  // ---------------------------------------------------------------------
  // Zone math: z-scored features -> court zone intensities
  // ---------------------------------------------------------------------
  //
  // Zone-mapping table (raw sigma -> [0, 0.85] opacity, floored at 0):
  //
  //   OFFENSE (amber)
  //     rim/paint   = avg( FTA[9], max(0, FGA[8]-FG3A[7]) )   rim pressure + inside volume
  //     midrange    = FGA[8]                                   overall shot volume proxy
  //     arc         = FG3A[7]                                  three-point volume
  //     oreb marker = OREB[2]                                  offensive-glass presence
  //     playmaking  = AST[1]                                   passing arcs from the key
  //   DEFENSE (blue)
  //     paint       = BLK[5]                                   rim protection
  //     perimeter   = STL[4]                                   perimeter pressure
  //     glass       = DREB[3]                                  defensive-glass presence
  //
  //   zoneOpacity(z) = clamp(z / 3, 0, 1) * 0.85
  //     z <= 0   -> 0.00   (floor)
  //     z = 1.5  -> 0.425
  //     z = 3    -> 0.85   (ceiling)
  //     z > 3    -> 0.85   (clamped)

  var ZONE_Z_MAX = 3; // sigma value that saturates a zone's glow
  var ZONE_OPACITY_MAX = 0.85;

  function zoneOpacity(z) {
    var t = z / ZONE_Z_MAX;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return t * ZONE_OPACITY_MAX;
  }

  function zoneRaw(v) {
    return {
      rim: (v[IDX.FTA] + Math.max(0, v[IDX.FGA] - v[IDX.FG3A])) / 2,
      mid: v[IDX.FGA],
      arc: v[IDX.FG3A],
      oreb: v[IDX.OREB],
      ast: v[IDX.AST],
      paintD: v[IDX.BLK],
      perimeterD: v[IDX.STL],
      glassD: v[IDX.DREB]
    };
  }

  var OFFENSE_KEYS = ['rim', 'mid', 'arc', 'oreb', 'ast'];
  var DEFENSE_KEYS = ['paintD', 'perimeterD', 'glassD'];
  var AREA_MATCH = { rim: 'paintD', arc: 'perimeterD', oreb: 'glassD' };
  var AREA_LABEL = { rim: 'the rim', arc: 'the arc', oreb: 'the glass' };
  var OFFENSE_PHRASE = {
    rim: 'shoots at the rim', mid: 'lives in the midrange', arc: 'shoots from the arc',
    oreb: 'crashes the glass', ast: 'runs it from the top of the key'
  };
  var DEFENSE_PHRASE = {
    paintD: 'protects the paint', perimeterD: 'defends the perimeter', glassD: 'owns the defensive glass'
  };

  function dominantKey(zones, keys) {
    var bestK = keys[0], bestV = -Infinity;
    keys.forEach(function (k) {
      if (zones[k] > bestV) { bestV = zones[k]; bestK = k; }
    });
    return bestK;
  }

  function entityPhrase(zones) {
    var topOff = dominantKey(zones, OFFENSE_KEYS);
    var topDef = dominantKey(zones, DEFENSE_KEYS);
    if (AREA_MATCH[topOff] === topDef) {
      return 'lives at ' + AREA_LABEL[topOff] + ' on both ends';
    }
    return DEFENSE_PHRASE[topDef] + ' and ' + OFFENSE_PHRASE[topOff];
  }

  function storyCaption(targetZones, guessZones) {
    return 'The Chimera ' + entityPhrase(targetZones) + ' — your guess ' + entityPhrase(guessZones) + '.';
  }

  // ---------------------------------------------------------------------
  // Half-court diagram (canvas, drawn in code — no assets)
  // ---------------------------------------------------------------------

  function courtGeometry(w, h) {
    var s = w / 50; // px per foot; canvas aspect fixed at 50:47
    var cx = w / 2;
    var rimY = h - 5.25 * s;
    var keyW = 16 * s, keyH = 19 * s;
    var keyX = cx - keyW / 2, keyY = h - keyH;
    var ftR = 6 * s;
    var r3 = 23.75 * s;
    var cornerOffset = 22 * s;
    var dy = Math.sqrt(Math.max(0, r3 * r3 - cornerOffset * cornerOffset));
    var cornerY = rimY - dy;
    var leftAngle = Math.atan2(cornerY - rimY, -cornerOffset);
    var rightAngle = Math.atan2(cornerY - rimY, cornerOffset);
    return {
      s: s, w: w, h: h, cx: cx, rimY: rimY,
      keyX: keyX, keyY: keyY, keyW: keyW, keyH: keyH,
      ftR: ftR, r3: r3, cornerOffset: cornerOffset, cornerY: cornerY,
      leftAngle: leftAngle, rightAngle: rightAngle
    };
  }

  function drawCourtLines(ctx, g) {
    ctx.save();
    ctx.strokeStyle = 'rgba(17,17,17,0.65)';
    ctx.lineWidth = Math.max(1, g.s * 0.08);

    // boundary
    ctx.strokeRect(0.5, 0.5, g.w - 1, g.h - 1);

    // key / paint
    ctx.strokeRect(g.keyX, g.keyY, g.keyW, g.keyH);

    // free-throw circle
    ctx.beginPath();
    ctx.arc(g.cx, g.keyY, g.ftR, 0, Math.PI * 2);
    ctx.stroke();

    // backboard
    ctx.beginPath();
    ctx.moveTo(g.cx - 3 * g.s, g.h - 4 * g.s);
    ctx.lineTo(g.cx + 3 * g.s, g.h - 4 * g.s);
    ctx.stroke();

    // rim
    ctx.beginPath();
    ctx.arc(g.cx, g.rimY, 0.75 * g.s, 0, Math.PI * 2);
    ctx.stroke();

    // 3pt corners (straight) + arc
    ctx.beginPath();
    ctx.moveTo(g.cx - g.cornerOffset, g.h);
    ctx.lineTo(g.cx - g.cornerOffset, g.cornerY);
    ctx.moveTo(g.cx + g.cornerOffset, g.h);
    ctx.lineTo(g.cx + g.cornerOffset, g.cornerY);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(g.cx, g.rimY, g.r3, g.leftAngle, g.rightAngle, false);
    ctx.stroke();

    // half-court line (top edge doubles as this on a half-court canvas)
    ctx.restore();
  }

  function radialGlow(ctx, x, y, r, rgb, opacity) {
    if (opacity <= 0.01 || r <= 0) return;
    var grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(' + rgb + ',' + opacity.toFixed(3) + ')');
    grad.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Data accents (validated against both the paper and dark surfaces):
  // orange = the Chimera / offense, blue = your guess / defense.
  var ORANGE_HEX = '#eb6834';
  var BLUE_HEX = '#2a78d6';
  var AMBER_RGB = '235,104,52';   // offense layer (orange)
  var BLUE_RGB = '42,120,214';    // defense layer (blue)

  function drawZones(ctx, g, offense, defense) {
    // ---- defense (blue), drawn first ----
    radialGlow(ctx, g.cx, g.keyY + g.keyH * 0.5, g.keyH * 0.9, BLUE_RGB, zoneOpacity(defense.paintD));
    radialGlow(ctx, g.cx, g.rimY, g.r3 * 1.02, BLUE_RGB, zoneOpacity(defense.perimeterD) * 0.5);
    if (zoneOpacity(defense.perimeterD) > 0.02) {
      ctx.save();
      ctx.strokeStyle = 'rgba(' + BLUE_RGB + ',' + zoneOpacity(defense.perimeterD).toFixed(3) + ')';
      ctx.lineWidth = Math.max(2, g.s * 0.5);
      ctx.beginPath();
      ctx.arc(g.cx, g.rimY, g.r3, g.leftAngle, g.rightAngle, false);
      ctx.stroke();
      ctx.restore();
    }
    radialGlow(ctx, g.cx + g.keyW * 0.55, g.h - 2 * g.s, 3.2 * g.s, BLUE_RGB, zoneOpacity(defense.glassD));

    // ---- offense (amber), drawn on top, translucent ----
    radialGlow(ctx, g.cx, g.rimY, 5.5 * g.s, AMBER_RGB, zoneOpacity(offense.rim));
    radialGlow(ctx, g.cx, g.keyY - 6 * g.s, 11 * g.s, AMBER_RGB, zoneOpacity(offense.mid) * 0.7);
    if (zoneOpacity(offense.arc) > 0.02) {
      ctx.save();
      ctx.strokeStyle = 'rgba(' + AMBER_RGB + ',' + zoneOpacity(offense.arc).toFixed(3) + ')';
      ctx.lineWidth = Math.max(2, g.s * 0.4);
      ctx.beginPath();
      ctx.arc(g.cx, g.rimY, g.r3, g.leftAngle, g.rightAngle, false);
      ctx.stroke();
      ctx.restore();
    }
    radialGlow(ctx, g.cx - g.keyW * 0.55, g.h - 2 * g.s, 3.2 * g.s, AMBER_RGB, zoneOpacity(offense.oreb));

    var astOp = zoneOpacity(offense.ast);
    if (astOp > 0.02) {
      ctx.save();
      ctx.strokeStyle = 'rgba(' + AMBER_RGB + ',' + Math.min(1, astOp + 0.15).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, g.s * 0.14);
      var origin = { x: g.cx, y: g.keyY };
      var targets = [
        { x: g.cx - g.cornerOffset * 0.7, y: g.cornerY + 4 * g.s },
        { x: g.cx + g.cornerOffset * 0.7, y: g.cornerY + 4 * g.s },
        { x: g.cx, y: g.rimY + 3 * g.s }
      ];
      targets.forEach(function (t) {
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.quadraticCurveTo((origin.x + t.x) / 2, Math.min(origin.y, t.y) - 6 * g.s, t.x, t.y);
        ctx.stroke();
      });
      ctx.restore();
    }
  }

  function renderCourt(canvas, vector) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    var g = courtGeometry(w, h);
    var zones = zoneRaw(vector);
    drawZones(ctx, g, zones, zones);
    drawCourtLines(ctx, g);
    return zones;
  }

  // ---------------------------------------------------------------------
  // Dimensional breakdown: diverging two-series bar chart (SVG)
  // 14 labeled rows, x = sigmas vs era, zero baseline, hairline grid.
  // ---------------------------------------------------------------------

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs, parent) {
    var el = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

  function renderBreakdown(targetVector, guessVector, guessName) {
    var host = els.breakdownChart;
    host.innerHTML = '';

    var W = 640, LEFT = 150, RIGHT = 20, TOP = 22;
    var ROW = 26, SEP = 18, BOT = 8;
    var H = TOP + 14 * ROW + SEP + BOT;
    var plotW = W - LEFT - RIGHT;
    var XMIN = -4, XMAX = 4;

    function xOf(v) {
      if (v < XMIN) v = XMIN;
      if (v > XMAX) v = XMAX;
      return LEFT + (v - XMIN) / (XMAX - XMIN) * plotW;
    }

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      'font-family': getComputedStyle(document.body).fontFamily
    }, host);

    // find the biggest-gap dimensions for selective direct labels
    var gaps = [];
    for (var gi = 0; gi < 14; gi++) {
      gaps.push({ i: gi, g: Math.abs(targetVector[gi] - guessVector[gi]) });
    }
    gaps.sort(function (a, b) { return b.g - a.g; });
    var labelRows = {};
    labelRows[gaps[0].i] = true;
    labelRows[gaps[1].i] = true;
    labelRows[gaps[2].i] = true;

    function rowY(i) {
      return TOP + i * ROW + (i >= 7 ? SEP : 0);
    }

    // gridlines each sigma; labels every 2
    for (var t = XMIN; t <= XMAX; t++) {
      var gx = xOf(t);
      svgEl('line', {
        x1: gx, y1: TOP - 4, x2: gx, y2: H - BOT,
        stroke: t === 0 ? '#111111' : '#e1e0d9',
        'stroke-width': t === 0 ? 1.5 : 1
      }, svg);
      if (t % 2 === 0) {
        var tl = svgEl('text', {
          x: gx, y: TOP - 9, 'text-anchor': 'middle',
          'font-size': 10, fill: '#898781'
        }, svg);
        tl.textContent = (t > 0 ? '+' : '') + t + 'σ';
      }
    }

    // half separator label between rows 6 and 7
    var sepY = TOP + 7 * ROW + SEP / 2;
    svgEl('line', {
      x1: 8, y1: sepY, x2: W - 8, y2: sepY,
      stroke: '#e1e0d9', 'stroke-width': 1, 'stroke-dasharray': '4 4'
    }, svg);
    var sepText = svgEl('text', {
      x: LEFT, y: sepY - 4, 'font-size': 9, fill: '#898781',
      'text-anchor': 'start', 'letter-spacing': '0.08em'
    }, svg);
    sepText.textContent = 'COUNTING-STAT HALF ABOVE · SHOOTING / IMPACT HALF BELOW';

    var BAR_H = 6, BAR_GAP = 2;

    function bar(y, v, color, title) {
      var x0 = xOf(0), x1 = xOf(v);
      var g = svgEl('g', {}, svg);
      svgEl('rect', {
        x: Math.min(x0, x1), y: y,
        width: Math.max(1, Math.abs(x1 - x0)), height: BAR_H,
        rx: 2, fill: color
      }, g);
      var titleEl = document.createElementNS(SVG_NS, 'title');
      titleEl.textContent = title;
      g.appendChild(titleEl);
      // oversized invisible hit target for the hover
      svgEl('rect', {
        x: LEFT, y: y - 2, width: plotW, height: BAR_H + 4,
        fill: 'transparent'
      }, g);
      return g;
    }

    for (var i = 0; i < 14; i++) {
      var y = rowY(i);
      var label = DATA.featureLabels[DATA.features[i]];
      var tv = targetVector[i], gv = guessVector[i];

      var lt = svgEl('text', {
        x: LEFT - 8, y: y + BAR_H + BAR_GAP / 2 + 1,
        'text-anchor': 'end', 'font-size': 11, fill: '#52514e'
      }, svg);
      lt.textContent = label;

      bar(y, tv, ORANGE_HEX, 'Chimera · ' + label + ': ' +
        (tv >= 0 ? '+' : '') + tv.toFixed(1) + 'σ');
      bar(y + BAR_H + BAR_GAP, gv, BLUE_HEX, (guessName || 'Your guess') +
        ' · ' + label + ': ' + (gv >= 0 ? '+' : '') + gv.toFixed(1) + 'σ');

      // selective direct labels on the 3 biggest-gap dimensions
      if (labelRows[i]) {
        var vt = svgEl('text', {
          x: xOf(tv) + (tv >= 0 ? 4 : -4), y: y + BAR_H - 1,
          'text-anchor': tv >= 0 ? 'start' : 'end',
          'font-size': 9, fill: '#111111', 'font-weight': 700
        }, svg);
        vt.textContent = (tv >= 0 ? '+' : '') + tv.toFixed(1);
        var vg = svgEl('text', {
          x: xOf(gv) + (gv >= 0 ? 4 : -4), y: y + 2 * BAR_H + BAR_GAP,
          'text-anchor': gv >= 0 ? 'start' : 'end',
          'font-size': 9, fill: '#111111', 'font-weight': 700
        }, svg);
        vg.textContent = (gv >= 0 ? '+' : '') + gv.toFixed(1);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Chimera mode: guessing + feedback
  // ---------------------------------------------------------------------

  function pctColorClass(sim) {
    if (sim >= 0.85) return 'vh-guess__pct--hot';
    if (sim >= 0.60) return 'vh-guess__pct--warm';
    return 'vh-guess__pct--cold';
  }

  function coachingLine(targetVector, guessVector) {
    var diffs = [];
    for (var i = 0; i < targetVector.length; i++) {
      diffs.push({ i: i, d: targetVector[i] - guessVector[i] });
    }
    diffs.sort(function (a, b) { return Math.abs(b.d) - Math.abs(a.d); });
    var top3 = diffs.slice(0, 3);
    var parts = top3.map(function (entry) {
      var label = DATA.featureLabels[DATA.features[entry.i]];
      var mag = Math.abs(entry.d).toFixed(1);
      return entry.d > 0
        ? 'more ' + label + ' (+' + mag + 'σ)'
        : 'less ' + label + ' (−' + mag + 'σ)';
    });
    return 'You need ' + parts.join(', ') + '.';
  }

  function clusterLine(guessPlayer) {
    var guessCluster = DATA.clusters[guessPlayer.c];
    var targetCluster = DATA.clusters[TARGET.clusterIdx];
    if (guessPlayer.c === TARGET.clusterIdx) {
      return "You're already in the Chimera's home archetype: <b>" + targetCluster + '</b>.';
    }
    return "You're in <b>" + guessCluster + '</b>; the Chimera lives in <b>' + targetCluster + '</b>.';
  }

  function isWinningGuess(guessPlayer, sim) {
    if (sim >= WIN_SIMILARITY) return true;
    if (guessPlayer.name === TARGET.a.name && guessPlayer.season === TARGET.a.season) return true;
    if (guessPlayer.name === TARGET.b.name && guessPlayer.season === TARGET.b.season) return true;
    return false;
  }

  function renderGuessRow(entry, idx) {
    var li = document.createElement('li');
    li.className = 'vh-guess';
    var pctClass = pctColorClass(entry.sim);
    var pct = Math.round(entry.sim * 100);
    li.innerHTML =
      '<div class="vh-guess__head">' +
        '<span class="vh-guess__num">' + (idx + 1) + '</span>' +
        '<span class="vh-guess__name">' + entry.name + '</span>' +
        '<span class="vh-guess__pct ' + pctClass + '">' + pct + '%</span>' +
      '</div>';
    return li;
  }

  function renderGuesses() {
    var rec = todayRecord();
    els.guessList.innerHTML = '';
    rec.guesses.forEach(function (entry, idx) {
      els.guessList.appendChild(renderGuessRow(entry, idx));
    });
    var left = Math.max(0, MAX_GUESSES - rec.guesses.length);
    els.guessesLeftNum.textContent = String(left);

    if (rec.guesses.length > 0) {
      var last = rec.guesses[rec.guesses.length - 1];
      var lastPlayer = DATA.players[last.id];
      els.resultCard.hidden = false;
      els.scoreboardPct.textContent = Math.round(last.sim * 100) + '%';

      var targetZones = renderCourt(els.courtTarget, TARGET.vector);
      var guessZones = renderCourt(els.courtGuess, lastPlayer.v);
      els.courtGuessLabel.textContent = 'Your guess: ' + last.name;
      els.storyCaption.textContent = storyCaption(targetZones, guessZones);
      renderBreakdown(TARGET.vector, lastPlayer.v, last.name);
      els.clusterLine.innerHTML = clusterLine(lastPlayer);
      var coaching = coachingLine(TARGET.vector, lastPlayer.v);
      if (typeof lastPlayer.sal === 'number') {
        // salary z (era-honest payroll percentile) when the dataset has it
        var sSign = lastPlayer.sal >= 0 ? '+' : '−';
        coaching += ' Market: this guess held a ' + sSign +
          Math.abs(lastPlayer.sal).toFixed(1) + 'σ payroll slot for its season.';
      }
      els.coachingLine.textContent = coaching;
    }

    if (rec.done) {
      showReveal(rec);
      lockInput();
    }
  }

  function lockInput() {
    els.chimeraInput.disabled = true;
    els.chimeraSubmit.disabled = true;
  }

  function shareEmojiRow(sim) {
    if (sim >= 0.85) return '🟩'; // green
    if (sim >= 0.60) return '🟨'; // yellow
    return '🟥'; // red
  }

  function buildShareText(rec) {
    var n = puzzleNumber(TODAY);
    var rows = rec.guesses.map(function (g) { return shareEmojiRow(g.sim); }).join('');
    var scoreLabel = rec.won ? String(rec.guesses.length) : 'X';
    return 'Vector Hoops #' + n + ' ' + scoreLabel + '/' + MAX_GUESSES + '\n' + rows;
  }

  function showReveal(rec) {
    els.revealCard.hidden = false;
    els.revealTitle.textContent = rec.won ? 'Solved' : 'The Chimera';
    els.revealBody.innerHTML =
      'Fused from <b>' + playerKey(TARGET.a) + '</b> (' + traitList([0, 1, 2, 3, 4, 5, 6]).join(', ') + ') and <b>' +
      playerKey(TARGET.b) + '</b> (' + traitList([7, 8, 9, 10, 11, 12, 13]).join(', ') + ').';
    els.shareCopied.hidden = true;
  }

  function submitGuess() {
    var p = pendingChimeraSelection;
    if (!p) return;
    var rec = todayRecord();
    if (rec.done || rec.guesses.length >= MAX_GUESSES) return;

    var sim = cosineSim(TARGET.vector, p.v);
    var entry = {
      id: p.id,
      name: playerKey(p),
      sim: sim
    };
    rec.guesses.push(entry);

    var won = isWinningGuess(p, sim);
    if (won || rec.guesses.length >= MAX_GUESSES) {
      registerCompletion(won);
    } else {
      saveState();
    }

    pendingChimeraSelection = null;
    els.chimeraInput.value = '';
    els.chimeraSubmit.disabled = true;
    renderGuesses();
    renderMapOnce();
  }

  var pendingChimeraSelection = null;

  // ---------------------------------------------------------------------
  // 3D starfield map: manual perspective projection, no libraries
  // ---------------------------------------------------------------------

  // 8 cluster hues, fixed order, validated for the dark map surface
  // (CVD-checked; identity is backed by the labeled legend + numbered pins).
  var PALETTE = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9',
                 '#e66767', '#d55181', '#d95926'];

  var PREFERS_REDUCED_MOTION = false;
  try {
    PREFERS_REDUCED_MOTION = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { PREFERS_REDUCED_MOTION = false; }

  var mapCam = {
    yaw: 0.6,
    pitch: 0.28,
    zoom: 1,
    focal: 2.6,
    autoRotate: !PREFERS_REDUCED_MOTION,
    dragging: false,
    lastX: 0,
    lastY: 0,
    pinchDist: null,
    rafId: null
  };

  function resizeSquareCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(rect.width, 240);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, size: w };
  }

  function project3D(x, y, z, size, cam) {
    // center to [-1, 1]-ish cube
    var px = (x - 0.5) * 2;
    var py = (y - 0.5) * 2;
    var pz = (z - 0.5) * 2;

    // rotate around Y (yaw)
    var cosY = Math.cos(cam.yaw), sinY = Math.sin(cam.yaw);
    var x1 = px * cosY + pz * sinY;
    var z1 = -px * sinY + pz * cosY;

    // rotate around X (pitch)
    var cosX = Math.cos(cam.pitch), sinX = Math.sin(cam.pitch);
    var y2 = py * cosX - z1 * sinX;
    var z2 = py * sinX + z1 * cosX;

    var focal = cam.focal / cam.zoom;
    var zc = z2 + focal;
    if (zc < 0.2) zc = 0.2;
    var scale = focal / zc;

    var half = size / 2;
    return {
      sx: half + x1 * scale * half * 0.85,
      sy: half - y2 * scale * half * 0.85,
      scale: scale,
      depth: zc
    };
  }

  // Wireframe axis cube: the unit PCA box, so the starfield reads as a
  // graph with visible dimensions rather than a free-floating cloud.
  var CUBE_CORNERS = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
  ];
  var CUBE_EDGES = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ];

  function drawAxisCube(ctx, size) {
    var pts = CUBE_CORNERS.map(function (c) {
      return project3D(c[0], c[1], c[2], size, mapCam);
    });
    ctx.save();
    ctx.strokeStyle = 'rgba(137,135,129,0.30)';
    ctx.lineWidth = 1;
    CUBE_EDGES.forEach(function (e) {
      ctx.beginPath();
      ctx.moveTo(pts[e[0]].sx, pts[e[0]].sy);
      ctx.lineTo(pts[e[1]].sx, pts[e[1]].sy);
      ctx.stroke();
    });
    // tick marks at quarters along the three labeled axes
    ctx.strokeStyle = 'rgba(137,135,129,0.45)';
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(function (axis) {
      for (var t = 0.25; t < 1; t += 0.25) {
        var p = project3D(axis[0] * t, axis[1] * t, axis[2] * t, size, mapCam);
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, 1.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    // axis labels just past the +1 corner of each axis
    ctx.fillStyle = 'rgba(195,194,183,0.85)';
    ctx.font = '700 11px ' + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var lab1 = project3D(1.08, 0, 0, size, mapCam);
    var lab2 = project3D(0, 1.08, 0, size, mapCam);
    var lab3 = project3D(0, 0, 1.08, size, mapCam);
    ctx.fillText('PC1', lab1.sx, lab1.sy);
    ctx.fillText('PC2', lab2.sx, lab2.sy);
    ctx.fillText('PC3', lab3.sx, lab3.sy);
    ctx.restore();
  }

  function renderMap() {
    if (!DATA) return;
    var canvas = els.map;
    var r = resizeSquareCanvas(canvas);
    var ctx = r.ctx, size = r.size;

    ctx.clearRect(0, 0, size, size);
    drawAxisCube(ctx, size);

    var players = DATA.players;
    var projected = new Array(players.length);
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var proj = project3D(p.x, p.y, p.z, size, mapCam);
      projected[i] = proj;
    }

    // painter's algorithm: farthest first
    var order = players.map(function (_, i) { return i; });
    order.sort(function (a, b) { return projected[b].depth - projected[a].depth; });

    var maxDepth = mapCam.focal * 2.2;
    for (var oi = 0; oi < order.length; oi++) {
      var idx = order[oi];
      var pl = players[idx];
      var pr = projected[idx];
      var depthT = Math.max(0, Math.min(1, pr.depth / maxDepth));
      var alpha = 0.55 * (1 - depthT) + 0.05;
      var radius = Math.max(0.6, 2.4 * pr.scale);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = PALETTE[pl.c % PALETTE.length];
      ctx.beginPath();
      ctx.arc(pr.sx, pr.sy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // target's home-cluster centroid: soft glowing beacon
    var centroid = CLUSTER_XYZ[TARGET.clusterIdx];
    var cproj = project3D(centroid.x, centroid.y, centroid.z, size, mapCam);
    var beaconR = 26 * cproj.scale;
    var grad = ctx.createRadialGradient(cproj.sx, cproj.sy, 0, cproj.sx, cproj.sy, beaconR);
    grad.addColorStop(0, 'rgba(' + AMBER_RGB + ',0.55)');
    grad.addColorStop(1, 'rgba(' + AMBER_RGB + ',0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cproj.sx, cproj.sy, beaconR, 0, Math.PI * 2);
    ctx.fill();

    // numbered guess pins, always on top
    var rec = todayRecord();
    rec.guesses.forEach(function (entry, gi) {
      var pl = players[entry.id];
      if (!pl) return;
      var pr = project3D(pl.x, pl.y, pl.z, size, mapCam);
      ctx.fillStyle = '#fafaf8';
      ctx.strokeStyle = BLUE_HEX;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pr.sx, pr.sy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#111111';
      ctx.font = 'bold 10px ' + getComputedStyle(document.body).fontFamily;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(gi + 1), pr.sx, pr.sy + 1);
    });
  }

  function renderMapLegend() {
    els.mapLegend.innerHTML = DATA.clusters.map(function (name, idx) {
      var color = PALETTE[idx % PALETTE.length];
      return '<span><span class="vh-legend-dot" style="background:' + color + '"></span>' + name + '</span>';
    }).join('');
  }

  function mapLoop() {
    if (!mapCam.autoRotate || mapCam.dragging) {
      mapCam.rafId = null;
      return;
    }
    mapCam.yaw += 0.0028;
    renderMap();
    mapCam.rafId = requestAnimationFrame(mapLoop);
  }

  function startMapLoopIfNeeded() {
    if (mapCam.rafId != null) return;
    if (mapCam.autoRotate && !mapCam.dragging) {
      mapCam.rafId = requestAnimationFrame(mapLoop);
    }
  }

  function renderMapOnce() {
    renderMap();
  }

  function setupMapInteraction() {
    var canvas = els.map;

    canvas.addEventListener('pointerdown', function (ev) {
      mapCam.dragging = true;
      mapCam.lastX = ev.clientX;
      mapCam.lastY = ev.clientY;
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* noop */ }
    });

    canvas.addEventListener('pointermove', function (ev) {
      if (!mapCam.dragging) return;
      var dx = ev.clientX - mapCam.lastX;
      var dy = ev.clientY - mapCam.lastY;
      mapCam.lastX = ev.clientX;
      mapCam.lastY = ev.clientY;
      mapCam.yaw += dx * 0.008;
      mapCam.pitch += dy * 0.008;
      mapCam.pitch = Math.max(-1.2, Math.min(1.2, mapCam.pitch));
      renderMap();
    });

    function endDrag() {
      if (!mapCam.dragging) return;
      mapCam.dragging = false;
      startMapLoopIfNeeded();
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', function () {
      if (mapCam.dragging) endDrag();
    });

    canvas.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var factor = Math.exp(-ev.deltaY * 0.001);
      mapCam.zoom = Math.max(0.5, Math.min(3.5, mapCam.zoom * factor));
      renderMap();
    }, { passive: false });

    // two-finger pinch to zoom
    canvas.addEventListener('touchmove', function (ev) {
      if (ev.touches.length !== 2) return;
      ev.preventDefault();
      var t0 = ev.touches[0], t1 = ev.touches[1];
      var d = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      if (mapCam.pinchDist != null) {
        var factor = d / mapCam.pinchDist;
        mapCam.zoom = Math.max(0.5, Math.min(3.5, mapCam.zoom * factor));
        renderMap();
      }
      mapCam.pinchDist = d;
    }, { passive: false });
    canvas.addEventListener('touchend', function (ev) {
      if (ev.touches.length < 2) mapCam.pinchDist = null;
    });

    els.mapPauseBtn.addEventListener('click', function () {
      mapCam.autoRotate = !mapCam.autoRotate;
      els.mapPauseBtn.textContent = mapCam.autoRotate ? 'Pause' : 'Resume';
      if (mapCam.autoRotate) startMapLoopIfNeeded();
    });
    els.mapPauseBtn.textContent = mapCam.autoRotate ? 'Pause' : 'Resume';

    window.addEventListener('resize', function () {
      renderMap();
    });

    els.mapDetails.addEventListener('toggle', function () {
      if (els.mapDetails.open) {
        renderMap();
        startMapLoopIfNeeded();
      } else if (mapCam.rafId != null) {
        cancelAnimationFrame(mapCam.rafId);
        mapCam.rafId = null;
      }
    });
  }

  // ---------------------------------------------------------------------
  // Share button
  // ---------------------------------------------------------------------

  function setupShare() {
    els.shareBtn.addEventListener('click', function () {
      var rec = todayRecord();
      var text = buildShareText(rec);
      var shared = false;
      if (navigator.share) {
        navigator.share({ text: text }).catch(function () {});
        shared = true;
      }
      if (!shared && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          els.shareCopied.hidden = false;
        }).catch(function () {});
      } else if (!shared) {
        els.shareCopied.hidden = false;
      }
    });
  }

  // ---------------------------------------------------------------------
  // How-to-play modal
  // ---------------------------------------------------------------------

  function openHelp() {
    els.helpBackdrop.hidden = false;
  }
  function closeHelp() {
    els.helpBackdrop.hidden = true;
  }

  function setupHelp() {
    els.helpBtn.addEventListener('click', openHelp);
    els.helpClose.addEventListener('click', closeHelp);
    els.helpBackdrop.addEventListener('click', function (ev) {
      if (ev.target === els.helpBackdrop) closeHelp();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !els.helpBackdrop.hidden) closeHelp();
    });
  }

  // ---------------------------------------------------------------------
  // Footer
  // ---------------------------------------------------------------------

  function renderFooter() {
    var range = DATA.seasons[0] + '–' + DATA.seasons[DATA.seasons.length - 1];
    els.footer.textContent =
      'Vectors: per-100-possession stats, z-scored within each season (era-honest) · ' +
      range + ' · built ' + DATA.built + ' · no tracking';
  }

  // ---------------------------------------------------------------------
  // DOM wiring
  // ---------------------------------------------------------------------

  function initDom() {
    els.puzzleNumber = document.getElementById('puzzle-number');
    els.puzzleDay = document.getElementById('puzzle-day');
    els.promptText = document.getElementById('prompt-text');
    els.chimeraInput = document.getElementById('chimera-input');
    els.chimeraSuggestions = document.getElementById('chimera-suggestions');
    els.chimeraSubmit = document.getElementById('chimera-submit');
    els.guessesLeftNum = document.getElementById('guesses-left-num');
    els.resultCard = document.getElementById('result-card');
    els.scoreboardPct = document.getElementById('scoreboard-pct');
    els.courtTarget = document.getElementById('court-target');
    els.courtGuess = document.getElementById('court-guess');
    els.courtGuessLabel = document.getElementById('court-guess-label');
    els.storyCaption = document.getElementById('story-caption');
    els.breakdownChart = document.getElementById('breakdown-chart');
    els.clusterLine = document.getElementById('cluster-line');
    els.coachingLine = document.getElementById('coaching-line');
    els.guessList = document.getElementById('guess-list');
    els.revealCard = document.getElementById('reveal-card');
    els.revealTitle = document.getElementById('reveal-title');
    els.revealBody = document.getElementById('reveal-body');
    els.shareBtn = document.getElementById('share-btn');
    els.shareCopied = document.getElementById('share-copied');
    els.map = document.getElementById('hoops-map');
    els.mapLegend = document.getElementById('map-legend');
    els.mapPauseBtn = document.getElementById('map-pause-btn');
    els.mapDetails = document.getElementById('map-details');
    els.streakNum = document.getElementById('streak-num');
    els.helpBtn = document.getElementById('help-btn');
    els.helpBackdrop = document.getElementById('help-backdrop');
    els.helpClose = document.getElementById('help-close');
    els.loadingBanner = document.getElementById('loading-banner');
    els.errorBanner = document.getElementById('error-banner');
    els.footer = document.getElementById('footer');
  }

  function setupChimeraInputs() {
    createAutocomplete(els.chimeraInput, els.chimeraSuggestions, DATA.players, function (p) {
      pendingChimeraSelection = p;
      els.chimeraSubmit.disabled = false;
    });
    els.chimeraInput.addEventListener('input', function () {
      pendingChimeraSelection = null;
      els.chimeraSubmit.disabled = true;
    });
    els.chimeraSubmit.addEventListener('click', submitGuess);
    els.chimeraInput.disabled = false;
  }

  function resumeChimeraIfDone() {
    var rec = todayRecord();
    if (rec.done) lockInput();
  }

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------

  function init() {
    initDom();
    setupHelp();
    fetch(DATA_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        DATA = json;
        var k = DATA.clusters.length;
        var dims = DATA.features.length;
        CENTROIDS = computeCentroids(DATA.players, k, dims);
        CLUSTER_XYZ = computeClusterXYZ(DATA.players, k);
        TARGET = buildDailyTarget();
        STATE = loadState();

        els.loadingBanner.hidden = true;
        renderPrompt();
        renderFooter();
        renderStreak();
        renderMapLegend();
        setupChimeraInputs();
        setupShare();
        setupMapInteraction();
        renderGuesses();
        resumeChimeraIfDone();
        renderMap();
        startMapLoopIfNeeded();

        if (todayRecord().guesses.length === 0 && !todayRecord().done) {
          openHelp();
        }
      })
      .catch(function (err) {
        els.loadingBanner.hidden = true;
        els.errorBanner.hidden = false;
        els.errorBanner.textContent = 'Could not load vectors.json (' + err.message + '). Is assets/vectors.json built yet?';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

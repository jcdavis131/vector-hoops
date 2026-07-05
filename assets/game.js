/* Vector Hoops — game.js
 * Zero deps, zero build. Loads assets/vectors.json and runs two modes:
 *   1. "The Chimera" — daily fused player-season, 6 guesses, cosine-similarity feedback.
 *   2. "Trade Machine" — free nearest-neighbor sandbox over the same vectors.
 *
 * Data contract (assets/vectors.json), produced by pipeline/build_vectors.py:
 *   { built, seasons:[first,last], normalization, features:[14],
 *     featureLabels:{feature->label}, clusters:[8 names],
 *     players:[{id,name,season,v:[14 z-scores],x,y,c}, ...] }
 */
(function () {
  'use strict';

  var DATA_URL = 'assets/vectors.json';
  var EPOCH_DATE = '2026-07-01'; // puzzle #1
  var MAX_GUESSES = 6;
  var WIN_SIMILARITY = 0.92;
  var LS_KEY = 'vectorHoops.v1';
  var A_COUNT = 7; // first 7 dims come from player A, last 7 from player B

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
  var CLUSTER_XY = null;   // [k]{x,y,n} mean map position per cluster
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

  function computeClusterXY(players, k) {
    var sums = [];
    for (var c = 0; c < k; c++) sums.push({ x: 0, y: 0, n: 0 });
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var s = sums[p.c];
      if (!s) continue;
      s.x += p.x; s.y += p.y; s.n++;
    }
    for (c = 0; c < k; c++) {
      if (sums[c].n > 0) { sums[c].x /= sums[c].n; sums[c].y /= sums[c].n; }
      else { sums[c].x = 0.5; sums[c].y = 0.5; }
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
  // Autocomplete (shared by both modes)
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
      '</div>' +
      '<div class="vh-guess__line">' + entry.cluster + '</div>' +
      '<div class="vh-guess__line">' + entry.coaching + '</div>';
    return li;
  }

  function renderGuesses() {
    var rec = todayRecord();
    els.guessList.innerHTML = '';
    rec.guesses.forEach(function (entry, idx) {
      els.guessList.appendChild(renderGuessRow(entry, idx));
    });
    els.guessCounter.textContent = rec.guesses.length + ' / ' + MAX_GUESSES;

    if (rec.guesses.length > 0) {
      var last = rec.guesses[rec.guesses.length - 1];
      els.scoreboard.hidden = false;
      els.scoreboardPct.textContent = Math.round(last.sim * 100) + '%';
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
      'Fused from <b>' + playerKey(TARGET.a) + '</b> (' + traitList([0,1,2,3,4,5,6]).join(', ') + ') and <b>' +
      playerKey(TARGET.b) + '</b> (' + traitList([7,8,9,10,11,12,13]).join(', ') + ').';
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
      sim: sim,
      cluster: clusterLine(p),
      coaching: coachingLine(TARGET.vector, p.v)
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
    renderMap();
  }

  var pendingChimeraSelection = null;

  // ---------------------------------------------------------------------
  // Map canvas
  // ---------------------------------------------------------------------

  var PALETTE = ['#e8a33d', '#3fbf7f', '#4d8fe8', '#d9564a', '#c060e0',
                 '#3ddede', '#e0d23d', '#8a8f9c'];

  function resizeCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(rect.width, 240);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr); // square aspect
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, size: w };
  }

  function renderMap() {
    if (!DATA) return;
    var canvas = els.map;
    var r = resizeCanvas(canvas);
    var ctx = r.ctx, size = r.size, pad = size * 0.05;
    var plotSize = size - pad * 2;

    ctx.clearRect(0, 0, size, size);

    function toXY(x, y) {
      return [pad + x * plotSize, pad + (1 - y) * plotSize];
    }

    // hint glow on target's cluster region
    var glowPos = CLUSTER_XY[TARGET.clusterIdx];
    var g = toXY(glowPos.x, glowPos.y);
    var glowRadius = plotSize * 0.22;
    var grad = ctx.createRadialGradient(g[0], g[1], 0, g[0], g[1], glowRadius);
    grad.addColorStop(0, 'rgba(232,163,61,0.28)');
    grad.addColorStop(1, 'rgba(232,163,61,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(g[0], g[1], glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // faint dots for every player, colored by cluster
    var players = DATA.players;
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var xy = toXY(p.x, p.y);
      ctx.fillStyle = PALETTE[p.c % PALETTE.length];
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // numbered guess pins
    var rec = todayRecord();
    rec.guesses.forEach(function (entry, idx) {
      var p = players[entry.id];
      if (!p) return;
      var xy = toXY(p.x, p.y);
      ctx.fillStyle = '#0e1420';
      ctx.strokeStyle = '#e8a33d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f5f3ee';
      ctx.font = 'bold 10px ' + getComputedStyle(document.body).fontFamily;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(idx + 1), xy[0], xy[1] + 1);
    });
  }

  function renderMapLegend() {
    els.mapLegend.innerHTML = DATA.clusters.map(function (name, idx) {
      var color = PALETTE[idx % PALETTE.length];
      return '<span><span class="vh-legend-dot" style="background:' + color + '"></span>' + name + '</span>';
    }).join('');
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
  // Trade Machine mode
  // ---------------------------------------------------------------------

  function sharedStrengthLabels(a, b) {
    var products = [];
    for (var i = 0; i < a.v.length; i++) {
      products.push({ i: i, p: a.v[i] * b.v[i] });
    }
    products.sort(function (x, y) { return y.p - x.p; });
    return products.slice(0, 2).map(function (entry) {
      return DATA.featureLabels[DATA.features[entry.i]];
    });
  }

  function runTradeMachine(anchor) {
    els.tradeAnchor.hidden = false;
    els.tradeAnchor.innerHTML = 'Comparing against <b>' + playerKey(anchor) + '</b>.';

    var players = DATA.players;
    var scored = [];
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (p.id === anchor.id) continue;
      scored.push({ p: p, sim: cosineSim(anchor.v, p.v) });
    }
    scored.sort(function (x, y) { return y.sim - x.sim; });
    var top = scored.slice(0, 8);

    els.tradeResults.innerHTML = '';
    top.forEach(function (entry) {
      var dup = entry.p.name === anchor.name;
      var labels = sharedStrengthLabels(anchor, entry.p);
      var card = document.createElement('div');
      card.className = 'vh-trade-card' + (dup ? ' vh-dup' : '');
      card.innerHTML =
        '<div class="vh-trade-card__head">' +
          '<span class="vh-trade-card__name">' + playerKey(entry.p) + '</span>' +
          '<span class="vh-trade-card__pct">' + Math.round(entry.sim * 100) + '%</span>' +
        '</div>' +
        '<div class="vh-trade-card__labels">Shared strength: ' + labels.join(', ') + '</div>';
      els.tradeResults.appendChild(card);
    });
  }

  // ---------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------

  function setupTabs() {
    function activate(which) {
      var chimera = which === 'chimera';
      els.tabChimera.setAttribute('aria-selected', String(chimera));
      els.tabTrade.setAttribute('aria-selected', String(!chimera));
      els.panelChimera.hidden = !chimera;
      els.panelTrade.hidden = chimera;
      if (chimera) renderMap();
    }
    els.tabChimera.addEventListener('click', function () { activate('chimera'); });
    els.tabTrade.addEventListener('click', function () { activate('trade'); });
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
    els.promptText = document.getElementById('prompt-text');
    els.chimeraInput = document.getElementById('chimera-input');
    els.chimeraSuggestions = document.getElementById('chimera-suggestions');
    els.chimeraSubmit = document.getElementById('chimera-submit');
    els.guessCounter = document.getElementById('guess-counter');
    els.scoreboard = document.getElementById('scoreboard');
    els.scoreboardPct = document.getElementById('scoreboard-pct');
    els.guessList = document.getElementById('guess-list');
    els.revealCard = document.getElementById('reveal-card');
    els.revealTitle = document.getElementById('reveal-title');
    els.revealBody = document.getElementById('reveal-body');
    els.shareBtn = document.getElementById('share-btn');
    els.shareCopied = document.getElementById('share-copied');
    els.map = document.getElementById('hoops-map');
    els.mapLegend = document.getElementById('map-legend');
    els.streakNum = document.getElementById('streak-num');
    els.tabChimera = document.getElementById('tab-chimera');
    els.tabTrade = document.getElementById('tab-trade');
    els.panelChimera = document.getElementById('panel-chimera');
    els.panelTrade = document.getElementById('panel-trade');
    els.tradeInput = document.getElementById('trade-input');
    els.tradeSuggestions = document.getElementById('trade-suggestions');
    els.tradeAnchor = document.getElementById('trade-anchor');
    els.tradeResults = document.getElementById('trade-results');
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

  function setupTradeInputs() {
    createAutocomplete(els.tradeInput, els.tradeSuggestions, DATA.players, function (p) {
      runTradeMachine(p);
    });
    els.tradeInput.disabled = false;
  }

  function resumeChimeraIfDone() {
    var rec = todayRecord();
    if (rec.done) lockInput();
  }

  window.addEventListener('resize', function () {
    if (!els.panelChimera.hidden) renderMap();
  });

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------

  function init() {
    initDom();
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
        CLUSTER_XY = computeClusterXY(DATA.players, k);
        TARGET = buildDailyTarget();
        STATE = loadState();

        els.loadingBanner.hidden = true;
        renderPrompt();
        renderFooter();
        renderStreak();
        renderMapLegend();
        setupTabs();
        setupChimeraInputs();
        setupTradeInputs();
        setupShare();
        renderGuesses();
        resumeChimeraIfDone();
        renderMap();
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

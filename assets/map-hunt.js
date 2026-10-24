/* map-hunt.js — Map Hunt + Twin Hunt: mystery player hidden in the 3D map.
 *
 * The map is the shared Embed3D engine, mounted with variant 'game'
 * (no projection switcher, no clustering legend). The handle is kept in
 * state.map: every tap is drawn as a ring with overlay() (warm/cold against
 * the previous tap, the neutral 'guess' for a first or same-distance tap,
 * exact when found), and the answer is setSelected() when
 * the game ends. Point ids are the row indices 0..12965 of vectors.json /
 * embed3d.json (index-aligned by lineage); anything else is resolved
 * defensively and a tap that cannot be resolved is ignored, never crashes.
 *
 * Game: up to 8 taps. Each tap reports how close it is to the mystery as
 * "closer than X% of all player-seasons" plus warmer/colder.
 * Map Hunt: find the hidden mystery player. Twin Hunt: find the given
 * player's era twin (assets/map-hunt/candidates.json, which is
 * eratwins.json resolved to row indices).
 *
 * Same-link-same-stars: puzzles are deterministic per day+mode
 * (assets/map-hunt/index.json); the share URL encodes ?day=&mode= and the
 * result (taps, stars) is a pure function of tap count, so a shared link
 * always replays the same puzzle with the same stars.
 */
(function () {
  'use strict';

  var N_ROWS = 12966; /* rows in every puzzle distance file; checked on load */
  var MAX_TAPS = 8;
  var ASSET_BASE = 'assets/map-hunt/';
  var SITE = 'https://hoops.dumbmodel.com';

  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function params() {
    var p = {};
    try {
      var q = new URL(location.href).searchParams;
      ['day', 'mode', 'r', 's'].forEach(function (k) { p[k] = q.get(k); });
    } catch (e) {}
    return p;
  }
  /* index.json and candidates.json are fetched by literal URL so stamp_assets.py
     versions them (?v=<sha8>); assets/*.json is cached for an hour */
  function jsonOf(req, u) { return req.then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + u); return r.json(); }); }
  function fetchU8(u) {
    return fetch(u, { cache: 'force-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + u);
      return r.arrayBuffer();
    }).then(function (b) { return new Uint8Array(b); });
  }
  function starsFor(taps) { return taps <= 3 ? 3 : taps <= 5 ? 2 : 1; }
  function starsStr(n) { return '★'.repeat(n) + '☆'.repeat(3 - n); }

  var state = {
    day: null, mode: 'mh', replay: false, restoring: false,
    candByIdx: {}, candList: [],
    targetIdx: null, givenIdx: null, targetName: null, targetSeason: null,
    twinName: null, twinSeason: null, twinSim: null,
    dist: null, taps: [], over: false, won: false,
    mountEl: null, map: null
  };

  /* ---------- identity resolution (defensive: point ids are row indices) --- */
  function resolveIndex(id) {
    if (typeof id === 'number' && isFinite(id) && id >= 0 && id < N_ROWS) return id | 0;
    if (typeof id === 'string') {
      var s = id.trim();
      if (/^\d+$/.test(s)) { var n = parseInt(s, 10); if (n >= 0 && n < N_ROWS) return n; }
      var low = s.toLowerCase();
      for (var i = 0; i < state.candList.length; i++) {
        var c = state.candList[i];
        if ((c[1] + '|' + c[2]).toLowerCase() === low || (c[1] + ' ' + c[2]).toLowerCase() === low ||
            (c[1] + ' (' + c[2] + ')').toLowerCase() === low) return c[0];
        if (c[1].toLowerCase() === low) return c[0];
      }
    }
    return null;
  }
  /* name + season of a row: the quiz pool first, then the map's own names
     (any of the 12,966 dots can be tapped); null until the map has loaded */
  function whoIs(idx) {
    var c = state.candByIdx[idx];
    if (c) return { name: c[1], season: c[2] };
    var info = state.map && typeof state.map.info === 'function' ? state.map.info(idx) : null;
    if (info && info.name) return { name: info.name, season: info.season != null ? seasonLabel(info.season) : '' };
    return null;
  }
  function seasonLabel(s) {
    if (typeof s === 'string') return s;
    var y = +s; if (!isFinite(y)) return '';
    return y + '-' + String((y + 1) % 100).padStart(2, '0');
  }
  function nameOf(idx) {
    var w = whoIs(idx);
    return w ? esc(w.name) + ' <span class="mh-season">' + esc(w.season) + '</span>' : 'a player-season';
  }

  /* ---------- UI helpers --------------------------------------------------- */
  function setStatus(html) { var el = $('#mh-status'); if (el) el.innerHTML = html; }
  function toast(msg) {
    try { if (window.VHToast) window.VHToast.show(msg); } catch (e) {}
  }
  function renderDots() {
    var el = $('#mh-dots'); if (!el) return;
    var html = '';
    for (var i = 0; i < MAX_TAPS; i++) {
      var cls = 'progress-dot';
      if (i < state.taps.length) cls += ' is-done';
      else if (i === state.taps.length && !state.over) cls += ' is-current';
      html += '<span class="' + cls + '">' + (i + 1) + '</span>';
    }
    el.innerHTML = html;
  }
  function trendHTML(t) {
    return t.trend === 'warm' ? ' <b class="mh-warmer">warmer ↑</b>'
      : t.trend === 'cold' ? ' <b class="mh-colder">colder ↓</b>'
      : t.trend === 'same' ? ' <b>same distance</b>' : '';
  }
  function renderTaps() {
    var el = $('#mh-taps'); if (!el) return;
    if (!state.taps.length) { el.innerHTML = '<p class="mh-empty">No taps yet — tap a point on the map' + (state.mode === 'th' ? ', or search a player,' : '') + ' to start.</p>'; return; }
    el.innerHTML = state.taps.map(function (t, i) {
      return '<div class="guess-row"><b>#' + (i + 1) + '</b> ' + nameOf(t.idx) +
        ' <span class="mh-dist">closer than <b>' + t.pct.toFixed(1) + '%</b> of all player-seasons' + trendHTML(t) + '</span></div>';
    }).join('');
  }
  function percentile(q) {
    var d = state.dist, worse = 0;
    for (var i = 0; i < d.length; i++) if (d[i] > q) worse++;
    return (worse / d.length) * 100;
  }

  /* ---------- the map: rings for taps, the answer on finish ---------------- */
  function syncMap() {
    var m = state.map; if (!m) return;
    try {
      m.overlay(state.taps.map(function (t) {
        /* a first tap (trend null) and a same-distance tap are the neutral 'guess' ring */
        return { id: t.idx, kind: t.idx === state.targetIdx ? 'exact' : t.trend === 'cold' ? 'cold' : t.trend === 'warm' ? 'warm' : 'guess' };
      }));
      m.setSelected(state.over ? state.targetIdx : null);
    } catch (e) { console.warn('map-hunt: map sync failed', e); }
  }
  /* Taps restored before the map loaded have no name yet unless they are in
     the quiz pool; once the map's names arrive, repaint them. */
  function relabelWhenLoaded() {
    var m = state.map;
    var needs = state.taps.some(function (t) { return !state.candByIdx[t.idx]; });
    if (!needs || !m || !m.ready || typeof m.ready.then !== 'function') return;
    m.ready.then(function () {
      if (state.map !== m) return;
      renderTaps();
      if (!state.over && state.taps.length) {
        var t = state.taps[state.taps.length - 1];
        setStatus(feedbackFor(t));
      }
    });
  }

  /* ---------- tap handling ------------------------------------------------- */
  function handleTap(id) {
    if (state.over || !state.dist) return;
    var idx = resolveIndex(id);
    if (idx === null) { toast('Could not identify that point — try another.'); return; }
    if (state.taps.some(function (t) { return t.idx === idx; })) { toast('Already tapped that one.'); return; }
    var q = state.dist[idx];
    var prev = state.taps.length ? state.taps[state.taps.length - 1].q : null;
    var trend = prev === null ? null : q < prev ? 'warm' : q > prev ? 'cold' : 'same';
    var tap = { idx: idx, q: q, pct: percentile(q), trend: trend };
    state.taps.push(tap);
    saveProgress();

    if (idx === state.targetIdx) { finish(true); return; }
    renderDots(); renderTaps(); syncMap();
    if (state.taps.length >= MAX_TAPS) finish(false);
    else setStatus(feedbackFor(tap));
  }
  function feedbackFor(t) {
    var trend = t.trend === 'warm' ? ' — <b class="mh-warmer">warmer</b>' : t.trend === 'cold' ? ' — <b class="mh-colder">colder</b>' : t.trend === 'same' ? ' — same distance' : '';
    var left = MAX_TAPS - state.taps.length;
    return '<b>' + nameOf(t.idx) + '</b>: closer than <b>' + t.pct.toFixed(1) + '%</b> of player-seasons' + trend + '. ' + left + ' tap' + (left === 1 ? '' : 's') + ' left.';
  }

  /* ---------- finish / result / share -------------------------------------- */
  function finish(won) {
    state.over = true; state.won = won;
    if (window.VHSound && !state.restoring) VHSound.sfx(won ? 'right' : 'wrong');
    renderDots(); renderTaps(); saveProgress(); syncMap();
    var taps = state.taps.length;
    var stars = starsFor(taps);
    var lastQ = state.taps.length ? state.taps[state.taps.length - 1].q : 255;
    var pct = won ? percentile(lastQ) : 0;
    var el = $('#mh-result');
    var title = won ? (state.mode === 'mh' ? 'Mystery star found!' : 'Twin found!') : 'Out of taps';
    var answer = '<b>' + esc(state.targetName) + '</b> <span class="mh-season">' + esc(state.targetSeason) + '</span>';
    var twinLine = state.twinName ? '<p class="mh-twin">Era twin: <b>' + esc(state.twinName) + '</b> ' + esc(state.twinSeason) + ' — style match ' + Math.round(state.twinSim * 100) + ' out of 100, across decades.</p>' : '';
    el.innerHTML =
      '<h3>' + title + '</h3>' +
      '<p class="mh-answer">' + (won ? 'That was ' : 'The answer was ') + answer + '</p>' +
      '<p class="mh-score">' + starsStr(stars) + ' · ' + taps + ' tap' + (taps === 1 ? '' : 's') +
      (won ? ' · closer than <b>' + pct.toFixed(1) + '%</b> of all player-seasons' : '') + '</p>' +
      twinLine +
      '<div class="share-bar">' +
      '<button class="btn btn-primary" id="mh-share-card" type="button">Share card</button>' +
      '<button class="btn" id="mh-copy-link" type="button">Copy link</button>' +
      '<button class="btn" id="mh-copy-text" type="button">Copy result</button>' +
      '</div>';
    el.classList.toggle('result--lost', !won);
    el.hidden = false;
    setStatus(won ? 'Found in ' + taps + ' tap' + (taps === 1 ? '' : 's') + '. ' + starsStr(stars) + ' The answer is the marked point on the map.' : 'The mystery was ' + answer + ', now marked on the map.');
    var sc = $('#mh-share-card'); if (sc) sc.addEventListener('click', shareCard);
    var cl = $('#mh-copy-link'); if (cl) cl.addEventListener('click', function () { copyText(shareURL(taps, stars), 'Link copied — same map, same stars.'); });
    var ct = $('#mh-copy-text'); if (ct) ct.addEventListener('click', function () { copyText(shareText(taps, stars, pct), 'Result copied.'); });
    if (!state.restoring) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function shareURL(taps, stars) {
    return SITE + '/map-guess?day=' + state.day + '&mode=' + state.mode + '&r=' + taps + '&s=' + stars;
  }
  function shareText(taps, stars, pct) {
    var modeWord = state.mode === 'mh' ? 'Map Hunt' : 'Twin Hunt';
    return '🗺️ Vector Hoops ' + modeWord + ' ' + state.day + ': ' + starsStr(stars) +
      ' — found today’s mystery player in ' + taps + ' taps on the 3D map,' +
      ' closer than ' + pct.toFixed(1) + '% of all ' + fmt(N_ROWS) + ' player-seasons.' +
      ' Play the same map: ' + shareURL(taps, stars);
  }
  function shareCard() {
    if (!window.VHShare || !window.VHShare.shareMapHunt) { toast('Share card unavailable — copy the link instead.'); return; }
    var taps = state.taps.length, stars = starsFor(taps);
    var lastQ = state.taps.length ? state.taps[state.taps.length - 1].q : 255;
    window.VHShare.shareMapHunt({
      mode: state.mode === 'mh' ? 'MAP HUNT' : 'TWIN HUNT',
      dayKey: state.day, stars: stars, taps: taps,
      pct: percentile(lastQ),
      name: state.targetName, season: state.targetSeason,
      twinName: state.twinName, twinSeason: state.twinSeason, twinSim: state.twinSim,
      url: shareURL(taps, stars)
    }).then(function (ok) { toast(ok ? 'Shared!' : 'Share dismissed.'); });
  }
  function copyText(text, okMsg) {
    function done(ok) { toast(ok ? okMsg : 'Copy failed — long-press to copy.'); }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); }); return; }
      var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
      ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta); done(ok);
    } catch (e) { done(false); }
  }

  /* ---------- persistence (today's progress survives reloads) --------------- */
  function storeKey() { return 'vh.maphunt.' + state.day + '.' + state.mode; }
  function saveProgress() {
    try { localStorage.setItem(storeKey(), JSON.stringify({ taps: state.taps.map(function (t) { return t.idx; }), over: state.over, won: state.won })); } catch (e) {}
  }
  function loadProgress() {
    try {
      var raw = localStorage.getItem(storeKey()); if (!raw) return null;
      var o = JSON.parse(raw); if (!o || !Array.isArray(o.taps)) return null; return o;
    } catch (e) { return null; }
  }

  /* ---------- mount / fallback ---------------------------------------------- */
  function mountMap() {
    var el = state.mountEl; if (!el) return;
    if (window.Embed3D && typeof window.Embed3D.mount === 'function') {
      try {
        /* mount() replaces the placeholder with its own loading state */
        state.map = window.Embed3D.mount(el, {
          variant: 'game',
          projection: 'pca',
          highlightIds: state.givenIdx !== null ? [state.givenIdx] : [],
          onSelect: handleTap,
          height: 400,
          loadingText: false, /* the lede states the count (data-fact) */
          selectedLabel: 'Answer' /* setSelected runs only on finish */
        });
        syncMap(); /* taps restored from today's progress land as rings too */
        relabelWhenLoaded();
        return;
      } catch (e) { state.map = null; console.warn('Embed3D mount failed, using fallback', e); }
    }
    // Graceful fallback: the game stays fully playable without the 3D script.
    showFallback();
  }
  function showFallback() {
    var fb = $('#mh-fallback'); if (!fb || !state.candList.length) return;
    fb.hidden = false;
    var input = $('#mh-search');
    var list = $('#mh-search-list');
    list.innerHTML = state.candList.map(function (c) {
      return '<option value="' + esc(c[1] + ' (' + c[2] + ')') + '">';
    }).join('');
    function submit() {
      var v = input.value.trim(); if (!v) return;
      var idx = resolveIndex(v);
      if (idx === null) {
        var low = v.toLowerCase();
        for (var i = 0; i < state.candList.length; i++) {
          if (state.candList[i][1].toLowerCase().indexOf(low) === 0) { idx = state.candList[i][0]; break; }
        }
      }
      if (idx === null) { toast('No player matches — try another name.'); return; }
      handleTap(idx); input.value = '';
    }
    $('#mh-search-btn').addEventListener('click', submit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    setStatus('3D map unavailable — search notable players instead. Same puzzle, same rules.');
  }

  /* ---------- boot ---------------------------------------------------------- */
  function NoPuzzle(day) { this.day = day; this.message = 'No puzzle for ' + day; }
  function fail(err) {
    var el = $('#mh-error');
    if (el) {
      el.hidden = false;
      var why = err instanceof NoPuzzle
        ? '<p>There is no puzzle for ' + esc(err.day) + ': that date is outside the puzzle window. <a href="/map-guess">Play today&rsquo;s</a></p>'
        : '<p>' + esc(err && err.message || 'The puzzle failed to load.') + '</p>';
      el.innerHTML = '<p><b>Map Hunt is taking the night off.</b></p>' + why + '<p><a href="/play">Play the classic Daily Court instead</a></p>';
    }
    var m = $('#mh-game'); if (m) m.hidden = true;
    console.warn('map-hunt:', err && err.message);
  }

  function boot() {
    state.mountEl = $('.embed3d-mount');
    var p = params();
    state.day = p.day || todayKey();
    state.mode = p.mode === 'th' ? 'th' : 'mh';
    state.replay = !!p.day && p.day !== todayKey();

    jsonOf(fetch('assets/map-hunt/index.json?v=764b5a7f', { cache: 'force-cache' }), 'index.json').then(function (idx) {
      var dayInfo = idx.days && idx.days[state.day];
      if (!dayInfo) throw new NoPuzzle(state.day);
      state.mhPool = +idx.mh_pool || null; state.thPool = +idx.th_pool || null;
      return jsonOf(fetch('assets/map-hunt/candidates.json?v=f34bb08b', { cache: 'force-cache' }), 'candidates.json').then(function (cands) {
        state.candList = cands;
        cands.forEach(function (c) { state.candByIdx[c[0]] = c; });
        if (state.mode === 'mh') {
          state.targetIdx = dayInfo.mh;
          var c = state.candByIdx[state.targetIdx];
          state.targetName = c[1]; state.targetSeason = c[2];
          state.twinName = c[4]; state.twinSeason = c[5]; state.twinSim = c[6];
        } else {
          state.givenIdx = dayInfo.th; state.targetIdx = dayInfo.tht;
          var g = state.candByIdx[state.givenIdx];
          /* The twin is a row index, not necessarily a quiz-pool candidate;
             its name/season live on the given player's candidate entry. */
          state.targetName = g[4]; state.targetSeason = g[5];
          state.twinName = null; // the target IS the twin
          state.givenName = g[1]; state.givenSeason = g[2];
          state.twinSim = g[6];
        }
        paintPuzzleMeta();
        return fetchU8(ASSET_BASE + 'puzzles/' + state.day + '-' + state.mode + '.u8');
      });
    }).then(function (u8) {
      if (u8.length !== N_ROWS) throw new Error('The distance file has ' + u8.length + ' rows, expected ' + N_ROWS + '.');
      state.dist = u8;
      renderDots(); renderTaps();
      var saved = loadProgress();
      if (saved && saved.taps && saved.taps.length && !state.replay) {
        // restore today's progress deterministically (duplicates/invalid ids are skipped by handleTap)
        state.restoring = true;
        saved.taps.forEach(function (idx) { if (!state.over) handleTap(idx); });
        state.restoring = false;
      }
      if (p.r && p.s && !state.over) {
        setStatus('A friend finished this map in ' + esc(p.r) + ' taps (' + starsStr(Math.max(0, Math.min(3, parseInt(p.s, 10) || 0))) + '). Can you beat it?');
      }
      mountMap();
      wireTabs();
    }).catch(fail);
  }

  function paintPuzzleMeta() {
    var el = $('#mh-puzzle');
    if (!el) return;
    var modeWord = state.mode === 'mh' ? 'Daily Map Hunt' : 'Twin Hunt';
    var replay = state.replay ? ' <span class="mh-replay">replaying a shared puzzle</span>' : '';
    var given = state.mode === 'th'
      ? '<p class="mh-given">Find <b>' + esc(state.givenName) + '</b> <span class="mh-season">' + esc(state.givenSeason) + '</span>&rsquo;s <b>era twin</b>: the season from another decade that plays most alike. The given player is the highlighted point on the map.</p>'
      : '<p class="mh-given">A mystery star is hiding somewhere on the map. Tap points to get warmer or colder.</p>';
    el.innerHTML = '<p class="mh-meta"><b>' + modeWord + '</b> · ' + esc(state.day) + replay + ' · ' + MAX_TAPS + ' taps</p>' + given;
    document.querySelectorAll('.game-modes [data-mode]').forEach(function (t) {
      var on = t.getAttribute('data-mode') === state.mode;
      t.classList.toggle('is-active', on);
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    /* pool sizes come from index.json (build_map_hunt.py); the page's static text is the fallback */
    var pool = $('#mh-pool-count'); if (pool && state.mhPool) pool.textContent = fmt(state.mhPool);
    var thLine = $('#mh-th-pool');
    if (thLine) {
      thLine.hidden = state.mode !== 'th';
      var thN = $('#mh-th-count'); if (thN && state.thPool) thN.textContent = fmt(state.thPool);
    }
  }
  function wireTabs() {
    document.querySelectorAll('.game-modes [data-mode]').forEach(function (t) {
      t.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return; // let a new-tab click through
        var m = t.getAttribute('data-mode');
        e.preventDefault(); // the link's own href drops ?day=; keep the day being played
        if (m === state.mode) return;
        location.href = '/map-guess?day=' + encodeURIComponent(state.day) + '&mode=' + m;
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

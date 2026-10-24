/* map-hunt.js — Map Hunt + Twin Hunt: mystery player hidden in the 3D embedding map.
 *
 * Contract with the 3D map (Worker A): a mount point
 *   <div class="embed3d-mount" data-projection="pca"></div>
 * plus <script src="/assets/embed-3d.js"></script>; guarded with
 * `if (window.Embed3D) Embed3D.mount(el, {projection, highlightIds, onSelect, height})`.
 * onSelect(id) passes the tapped point's identity. Point ids are the row
 * indices 0..12965 of vectors.json / mtnn_embeddings.f32 / mtnn_map.json
 * (index-aligned by lineage); anything else is resolved defensively and a tap
 * that cannot be resolved is ignored, never crashes.
 *
 * Game: up to 8 taps. Each tap reports cosine distance in 64-d as
 * "warmer/colder" plus "closer than X% of all 12,966 player-seasons".
 * Map Hunt: find the hidden mystery player. Twin Hunt: find the given
 * player's nearest embedding neighbor (reveal uses the era-twin data baked
 * into assets/map-hunt/candidates.json, which is eratwins.json resolved to
 * row indices).
 *
 * Same-link-same-stars: puzzles are deterministic per day+mode
 * (assets/map-hunt/index.json); the share URL encodes ?day=&mode= and the
 * result (taps, stars) is a pure function of tap count, so a shared link
 * always replays the same puzzle with the same stars.
 */
(function () {
  'use strict';

  var N_ROWS = 12966;
  var MAX_TAPS = 8;
  var ASSET_BASE = 'assets/map-hunt/';
  var SITE = 'https://hoops.dumbmodel.com';

  function $(s, r) { return (r || document).querySelector(s); }
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
  function fetchJSON(u) { return fetch(u, { cache: 'force-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + u); return r.json(); }); }
  function fetchU8(u) {
    return fetch(u, { cache: 'force-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + u);
      return r.arrayBuffer();
    }).then(function (b) { return new Uint8Array(b); });
  }
  function starsFor(taps) { return taps <= 3 ? 3 : taps <= 5 ? 2 : 1; }
  function starsStr(n) { return '★'.repeat(n) + '☆'.repeat(3 - n); }

  var state = {
    day: null, mode: 'mh', replay: false,
    candByIdx: {}, candList: [],
    targetIdx: null, givenIdx: null, targetName: null, targetSeason: null,
    twinName: null, twinSeason: null, twinSim: null,
    dist: null, taps: [], over: false, won: false,
    mountEl: null, embedMounted: false
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
        if ((c[1] + '|' + c[2]).toLowerCase() === low || (c[1] + ' ' + c[2]).toLowerCase() === low) return c[0];
        if (c[1].toLowerCase() === low) return c[0];
      }
    }
    return null;
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
  function renderTaps() {
    var el = $('#mh-taps'); if (!el) return;
    if (!state.taps.length) { el.innerHTML = '<p class="mh-empty">No taps yet — tap a point on the map' + (state.mode === 'th' ? ', or search a player,' : '') + ' to start.</p>'; return; }
    el.innerHTML = state.taps.map(function (t, i) {
      return '<div class="guess-row"><b>#' + (i + 1) + '</b> ' + t.label +
        ' <span class="mh-dist">' + t.feedback + '</span></div>';
    }).join('');
  }
  function percentile(q) {
    var d = state.dist, worse = 0;
    for (var i = 0; i < d.length; i++) if (d[i] > q) worse++;
    return (worse / d.length) * 100;
  }
  function nameOf(idx) {
    var c = state.candByIdx[idx];
    return c ? c[1] + ' <span class="mh-season">' + c[2] + '</span>' : 'player #' + idx;
  }

  /* ---------- tap handling ------------------------------------------------- */
  function handleTap(id) {
    if (state.over || !state.dist) return;
    var idx = resolveIndex(id);
    if (idx === null) { toast('Could not identify that point — try another.'); return; }
    if (state.taps.some(function (t) { return t.idx === idx; })) { toast('Already tapped that one.'); return; }
    var q = state.dist[idx];
    var pct = percentile(q);
    var prev = state.taps.length ? state.taps[state.taps.length - 1].q : null;
    var trend = '';
    if (prev !== null) trend = q < prev ? ' <b class="mh-warmer">warmer ↑</b>' : q > prev ? ' <b class="mh-colder">colder ↓</b>' : ' <b>same distance</b>';
    var feedback = 'closer than <b>' + pct.toFixed(1) + '%</b> of all 12,966 player-seasons' + trend;
    state.taps.push({ idx: idx, q: q, label: nameOf(idx), feedback: feedback });
    saveProgress();

    if (idx === state.targetIdx) { finish(true); return; }
    renderDots(); renderTaps();
    if (state.taps.length >= MAX_TAPS) finish(false);
    else setStatus(feedbackFor(idx, q, pct, prev));
  }
  function feedbackFor(idx, q, pct, prev) {
    var trend = prev === null ? '' : (q < prev ? ' — <b class="mh-warmer">warmer</b>' : q > prev ? ' — <b class="mh-colder">colder</b>' : ' — same distance');
    return '<b>' + nameOf(idx) + '</b>: closer than <b>' + pct.toFixed(1) + '%</b> of player-seasons' + trend + '. ' + (MAX_TAPS - state.taps.length) + ' taps left.';
  }

  /* ---------- finish / result / share -------------------------------------- */
  function finish(won) {
    state.over = true; state.won = won;
    if (window.VHSound) VHSound.sfx(won ? 'right' : 'wrong');
    renderDots(); renderTaps(); saveProgress();
    var taps = state.taps.length;
    var stars = starsFor(taps);
    var lastQ = state.taps.length ? state.taps[state.taps.length - 1].q : 255;
    var pct = won ? percentile(lastQ) : 0;
    var el = $('#mh-result');
    var title = won ? (state.mode === 'mh' ? 'Mystery star found!' : 'Twin found!') : 'Out of taps';
    var answer = '<b>' + state.targetName + '</b> <span class="mh-season">' + state.targetSeason + '</span>';
    var twinLine = state.twinName ? '<p class="mh-twin">Era twin: <b>' + state.twinName + '</b> ' + state.twinSeason + ' — ' + (state.twinSim * 100).toFixed(1) + '% style match across decades.</p>' : '';
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
    setStatus(won ? 'Found in ' + taps + ' taps. ' + starsStr(stars) : 'The mystery was ' + answer + '.');
    var sc = $('#mh-share-card'); if (sc) sc.addEventListener('click', shareCard);
    var cl = $('#mh-copy-link'); if (cl) cl.addEventListener('click', function () { copyText(shareURL(taps, stars), 'Link copied — same map, same stars.'); });
    var ct = $('#mh-copy-text'); if (ct) ct.addEventListener('click', function () { copyText(shareText(taps, stars, pct), 'Result copied.'); });
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function shareURL(taps, stars) {
    return SITE + '/map-guess?day=' + state.day + '&mode=' + state.mode + '&r=' + taps + '&s=' + stars;
  }
  function shareText(taps, stars, pct) {
    var modeWord = state.mode === 'mh' ? 'Map Hunt' : 'Twin Hunt';
    return '🗺️ Vector Hoops ' + modeWord + ' ' + state.day + ': ' + starsStr(stars) +
      ' — found today\u2019s mystery player in ' + taps + ' taps on the 3D embedding map,' +
      ' closer than ' + pct.toFixed(1) + '% of all 12,966 player-seasons.' +
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
        window.Embed3D.mount(el, {
          projection: 'pca',
          highlightIds: state.givenIdx !== null ? [state.givenIdx] : [],
          onSelect: handleTap,
          height: el.clientHeight || 440
        });
        state.embedMounted = true;
        var ph = el.querySelector('.embed3d-placeholder'); if (ph) ph.style.display = 'none';
        return;
      } catch (e) { console.warn('Embed3D mount failed, using fallback', e); }
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
      return '<option value="' + c[1] + ' (' + c[2] + ')">';
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
      if (idx === null) { toast('No player matches — try the map or another name.'); return; }
      handleTap(idx); input.value = '';
    }
    $('#mh-search-btn').addEventListener('click', submit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    setStatus('3D map unavailable — search notable players instead. Same puzzle, same rules.');
  }

  /* ---------- boot ---------------------------------------------------------- */
  function fail(msg) {
    var el = $('#mh-error');
    if (el) { el.hidden = false; el.innerHTML = '<p><b>Map Hunt is taking the night off.</b></p><p>' + msg + '</p><p><a href="/play">Play the classic Daily Court instead →</a></p>'; }
    var m = $('#mh-game'); if (m) m.hidden = true;
    console.warn('map-hunt:', msg);
  }

  function boot() {
    state.mountEl = $('.embed3d-mount');
    var p = params();
    state.day = p.day || todayKey();
    state.mode = p.mode === 'th' ? 'th' : 'mh';
    state.replay = !!p.day && p.day !== todayKey();

    fetchJSON(ASSET_BASE + 'index.json').then(function (idx) {
      var dayInfo = idx.days && idx.days[state.day];
      if (!dayInfo) throw new Error('No puzzle for ' + state.day + ' — this date is outside the puzzle window. <a href="/map-guess">Play today&rsquo;s →</a>');
      return fetchJSON(ASSET_BASE + 'candidates.json').then(function (cands) {
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
      if (u8.length !== N_ROWS) throw new Error('distance file has ' + u8.length + ' rows, expected ' + N_ROWS);
      state.dist = u8;
      renderDots(); renderTaps();
      var saved = loadProgress();
      if (saved && saved.taps && saved.taps.length && !state.replay) {
        // restore today's progress deterministically
        saved.taps.forEach(function (idx) {
          if (state.over) return;
          var prev = state.taps.length;
          handleTap(idx);
          if (state.taps.length === prev) { /* duplicate or invalid — skip */ }
        });
      }
      if (p.r && p.s && !state.over) {
        setStatus('A friend finished this map in ' + p.r + ' taps (' + starsStr(parseInt(p.s, 10) || 0) + '). Can you beat it?');
      }
      mountMap();
      wireTabs();
    }).catch(function (e) { fail(e.message || 'failed to load'); });
  }

  function paintPuzzleMeta() {
    var el = $('#mh-puzzle');
    if (!el) return;
    var modeWord = state.mode === 'mh' ? 'Daily Map Hunt' : 'Twin Hunt';
    var replay = state.replay ? ' <span class="mh-replay">replaying a shared puzzle</span>' : '';
    var given = state.mode === 'th'
      ? '<p class="mh-given">Find <b>' + state.givenName + '</b> <span class="mh-season">' + state.givenSeason + '</span>&rsquo;s <b>era twin</b> — the season from another decade that plays most alike (the highlighted point is the given player).</p>'
      : '<p class="mh-given">A mystery star is hiding somewhere in the 12,966-point map. Tap points — get warmer or colder.</p>';
    el.innerHTML = '<p class="mh-meta"><b>' + modeWord + '</b> · ' + state.day + replay + ' · ' + MAX_TAPS + ' taps</p>' + given;
    document.querySelectorAll('.game-modes [data-mode]').forEach(function (t) {
      var on = t.getAttribute('data-mode') === state.mode;
      t.classList.toggle('is-active', on);
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
  }
  function wireTabs() {
    document.querySelectorAll('.game-modes [data-mode]').forEach(function (t) {
      t.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return; // let a new-tab click through
        var m = t.getAttribute('data-mode');
        e.preventDefault(); // the link's own href drops ?day=; keep the day being played
        if (m === state.mode) return;
        location.href = '/map-guess?day=' + state.day + '&mode=' + m;
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

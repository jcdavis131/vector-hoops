/* atlas-3d.js — landing atlas wiring (Track 1, C1.2).
 *
 * Replaces atlas-map.js / atlas-regions.js / career-trails.js on index.html.
 * Fig. 1 is now the 3D greyscale Embed3D ball: slow-rotating, search/tap to
 * select, 3 twins highlighted in color.
 *
 * - Lazy boot on scroll-near (#159 pattern: IntersectionObserver, 600px
 *   rootMargin). The search box sits above the atlas: searching before load
 *   forces the boot (V4), then applies the highlight when ready.
 * - Search index decoded from assets/projections/embed3d.json with
 *   {cache:'force-cache'} — the engine's own fetch hits the same cache
 *   entry, so this is one 638KB transfer, and it's lazy (the old 2D page
 *   fetched 1.37MB eagerly for search).
 * - Readout + peers table from peers_top8.json via window.VHPeers (already
 *   on the page); archetype names from assets/archetype_assignments.json.
 * - Share-image (V3): this is a 2D canvas, not WebGL — the bitmap persists
 *   between frames, so there is no preserveDrawingBuffer hazard. We still
 *   capture inside requestAnimationFrame after a painted frame, so the
 *   export can never catch a pre-first-frame blank.
 * - Exposes window.VHAtlas { selectedPlayer, size, select, onSelect,
 *   onReady, exportImage } — the subset home-tonight.js ("Surprise me")
 *   needs. project/dims/highlightTeam/setCap belonged to the cut 2D
 *   modules and are intentionally gone.
 */
(function () {
  'use strict';

  var EMBED_URL = 'assets/projections/embed3d.json?v=fce603a1';
  var ARCH_URL = 'assets/archetype_assignments.json?v=4118981a';

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtSeason(s) { return (s || '').replace('-', '\u2013'); }

  var mountEl = document.querySelector('.embed3d-mount');
  if (!mountEl) return;

  /* ---------- state ---------- */
  var handle = null;            // Embed3D handle
  var booted = false;
  var N = 0, NAMES = [], SEASONS = [], SEASON_Y = [], ARCH = [];
  var indexReady = false, indexWaiters = [];
  var peersReady = false;
  var selected = -1, twins = [];
  var selectWaiters = [], readyWaiters = [];

  /* ---------- data: decode names/seasons like the engine does ---------- */
  function decodeIndex(doc) {
    var meta = doc.meta, names = meta.names || [], teams = meta.teams || [];
    var sBase = meta.season_base || 1996;
    var dn = doc.n, mc = doc.m, n = meta.n;
    var nameIdx = 0, i, code;
    NAMES = new Array(n); SEASONS = new Array(n); SEASON_Y = new Array(n);
    for (i = 0; i < n; i++) {
      nameIdx += dn[i];
      NAMES[i] = names[nameIdx] || ('#' + i);
      code = mc[i];
      var y = sBase + (code >> 9);
      SEASON_Y[i] = y;
      SEASONS[i] = y + '-' + String(y + 1).slice(-2);
    }
    N = n;
    indexReady = true;
    // The plotted count is the rows actually decoded, never a typed number.
    var count = $('atlas-count');
    if (count && n > 0) count.textContent = n.toLocaleString('en-US');
    var w = indexWaiters; indexWaiters = [];
    w.forEach(function (cb) { try { cb(); } catch (e) {} });
    var r = readyWaiters; readyWaiters = [];
    r.forEach(function (cb) { try { cb(); } catch (e) {} });
  }
  function ensureIndex(cb) {
    if (indexReady) { if (cb) cb(); return; }
    if (cb) indexWaiters.push(cb);
    if (indexWaiters.length > 1) return; // fetch already in flight
    fetch(EMBED_URL, { cache: 'force-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(decodeIndex)
      .catch(function () {
        indexWaiters = [];
        showError('The atlas data could not be loaded. Check your connection and try again.', function () {
          booted = false; handle = null;
          ensureIndex(); boot();
        });
      });
  }
  function ensurePeers(cb) {
    if (peersReady) { if (cb) cb(); return; }
    if (!window.VHPeers) { if (cb) cb(); return; }
    window.VHPeers.load(function (ok) {
      peersReady = !!ok;
      if (cb) cb();
    });
  }
  var archNames = null;
  function ensureArch(cb) {
    if (archNames) { if (cb) cb(); return; }
    fetch(ARCH_URL, { cache: 'force-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        archNames = {};
        (d.assignments || []).forEach(function (a) {
          if (a && a.id != null) archNames[a.id] = a.mtnnGlobalName || '';
        });
        if (cb) cb();
      })
      .catch(function () { archNames = {}; if (cb) cb(); });
  }

  /* Kit error state (atlas.css .state--error): role=alert, a retry button. */
  function showError(msg, retry) {
    if (handle && handle.destroy) { try { handle.destroy(); } catch (e) {} }
    mountEl.innerHTML = '<div class="state state--error" role="alert"><p><b>The map could not load.</b> ' +
      esc(msg) + '</p><button type="button" class="btn">Try again</button></div>';
    var b = mountEl.querySelector('button');
    if (b && retry) b.addEventListener('click', retry);
  }

  /* ---------- boot ---------- */
  function boot() {
    if (booted) return;
    booted = true;
    if (!window.Embed3D || !window.Embed3D.mount) {
      showError('The 3D atlas could not start.', function () { location.reload(); });
      return;
    }
    handle = window.Embed3D.mount(mountEl, {
      variant: 'home',
      greyscale: true,
      projection: 'pca',
      onSelect: function (id) { select(id); }
    });
  }
  function bootWhenNear() {
    var sec = $('atlas');
    try {
      if (sec && 'IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); boot(); }
        }, { rootMargin: '600px' });
        io.observe(sec);
        return;
      }
    } catch (e) { /* fall through */ }
    boot();
  }

  /* ---------- selection ---------- */
  function computeTwins() {
    twins = [];
    if (selected < 0 || !window.VHPeers || !window.VHPeers.isReady()) return;
    var name = NAMES[selected];
    twins = window.VHPeers.topK(selected, 3, function (i) { return NAMES[i] && NAMES[i] !== name; });
  }
  function select(i, opts) {
    opts = opts || {};
    selected = (i == null || i < 0 || i >= N) ? -1 : i;
    computeTwins();
    if (handle) {
      try {
        handle.setSelected(selected);
        handle.setHighlight(twins.map(function (t) { return t.id; }));
      } catch (e) {}
    }
    renderReadout();
    var live = $('atlas-live');
    if (live && selected >= 0) live.textContent = NAMES[selected] + ', ' + fmtSeason(SEASONS[selected]) + ' selected.';
    if (!opts.noUrl) {
      try {
        var u = new URL(location.href);
        if (selected >= 0) u.searchParams.set('id', String(selected)); else u.searchParams.delete('id');
        history.replaceState(null, '', u);
      } catch (e) {}
    }
    var w = selectWaiters; selectWaiters = [];
    w.forEach(function (cb) { try { cb(selected >= 0 ? { n: NAMES[selected], s: SEASONS[selected] } : null); } catch (e) {} });
  }

  function renderReadout() {
    var sel = $('atlas-selected'), body = $('atlas-peers-body'), status = $('atlas-peers-status');
    if (!sel || !body) return;
    if (selected < 0) {
      sel.innerHTML = '<p class="readout__empty caption">Select any point on the atlas, or search a name above.</p>';
      body.innerHTML = '';
      if (status) status.textContent = '';
      return;
    }
    var nm = NAMES[selected];
    sel.innerHTML =
      '<div class="label">Selected season</div>' +
      '<div class="readout__name">' + esc(nm) + '</div>' +
      '<div class="stat-strip">' +
        '<div class="stat"><b>' + esc(fmtSeason(SEASONS[selected])) + '</b>Season</div>' +
        '<div class="stat"><b>' + esc((archNames && archNames[selected]) || '—') + '</b>Archetype</div>' +
      '</div>' +
      '<a class="readout__link" href="/players?q=' + encodeURIComponent(nm) + '">Open ' + esc(nm) + ' dossier →</a>';
    if (!peersReady) {
      body.innerHTML = [0, 1, 2].map(function (k) {
        return '<tr class="is-loading"><td class="r">' + (k + 1) + '</td><td><span class="skeleton"></span></td><td><span class="skeleton skeleton--s"></span></td><td class="hide-s"><span class="skeleton"></span></td><td class="r"><span class="skeleton skeleton--s"></span></td></tr>';
      }).join('');
      if (status) status.textContent = 'Loading nearest-neighbor list…';
      return;
    }
    if (status) status.textContent = '';
    body.innerHTML = twins.map(function (pr, k) {
      var q = pr.id;
      return '<tr data-id="' + q + '" tabindex="0" aria-label="Select ' + esc(NAMES[q]) + ' ' + esc(SEASONS[q]) + '">' +
        '<td class="r num">' + (k + 1) + '</td>' +
        '<td class="peer-name">' + esc(NAMES[q]) + '</td>' +
        '<td class="num">' + esc(fmtSeason(SEASONS[q])) + '</td>' +
        '<td class="hide-s">' + esc((archNames && archNames[q]) || '—') + '</td>' +
        '<td class="r num peer-sim">' + pr.sim.toFixed(3) + '</td></tr>';
    }).join('');
  }

  /* ---------- search (V4: searching boots the atlas) ---------- */
  function initSearch() {
    var input = $('atlas-search'), list = $('atlas-results');
    if (!input || !list) return;
    var results = [], active = -1;
    function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; input.removeAttribute('aria-activedescendant'); }
    function render() {
      if (!results.length) { list.innerHTML = '<li class="atlas-results__empty" role="presentation">No season matches that name.</li>'; list.hidden = false; return; }
      list.innerHTML = results.map(function (i, k) {
        return '<li role="option" id="atlas-opt-' + k + '" data-id="' + i + '"' + (k === active ? ' aria-selected="true" class="is-active"' : ' aria-selected="false"') + '>' +
          '<span>' + esc(NAMES[i]) + '</span><span class="num">' + esc(fmtSeason(SEASONS[i])) + '</span></li>';
      }).join('');
      list.hidden = false; input.setAttribute('aria-expanded', 'true');
      if (active >= 0) input.setAttribute('aria-activedescendant', 'atlas-opt-' + active);
    }
    function doSearch(q) {
      var starts = [], contains = [];
      for (var i = 0; i < N; i++) {
        var n = NAMES[i].toLowerCase();
        if (n.indexOf(q) === 0 || n.indexOf(' ' + q) > -1) starts.push(i);
        else if (n.indexOf(q) > -1) contains.push(i);
      }
      // Rank: name/word-start before substring, then most recent season first.
      var tier = {};
      starts.forEach(function (i) { tier[i] = 0; });
      contains.forEach(function (i) { tier[i] = 1; });
      var all = starts.concat(contains);
      all.sort(function (a, b) {
        if (tier[a] !== tier[b]) return tier[a] - tier[b];
        if (SEASON_Y[a] !== SEASON_Y[b]) return SEASON_Y[b] - SEASON_Y[a];
        return NAMES[a] < NAMES[b] ? -1 : NAMES[a] > NAMES[b] ? 1 : 0;
      });
      results = all.slice(0, 8); active = results.length ? 0 : -1; render();
    }
    function onInput() {
      var q = input.value.trim().toLowerCase();
      if (q.length < 2) { close(); return; }
      boot(); // V4: search forces the atlas boot
      list.innerHTML = '<li class="atlas-results__empty" role="presentation">Loading the atlas…</li>';
      list.hidden = false;
      ensureIndex(function () { doSearch(q); });
    }
    input.addEventListener('input', onInput);
    input.addEventListener('focus', function () { ensureIndex(); }); // warm the index early
    input.addEventListener('keydown', function (e) {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { active = Math.min(results.length - 1, active + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter') { if (active >= 0) { pick(results[active]); } e.preventDefault(); }
      else if (e.key === 'Escape') { close(); }
    });
    list.addEventListener('mousedown', function (e) {
      var li = e.target.closest('li[data-id]'); if (!li) return;
      e.preventDefault();
      pick(+li.getAttribute('data-id'));
    });
    input.addEventListener('blur', function () { setTimeout(close, 120); });
    function pick(i) {
      select(i);
      input.value = NAMES[i] + ' ' + fmtSeason(SEASONS[i]);
      close();
    }
  }

  /* ---------- peers table: bidirectional sync ---------- */
  document.addEventListener('click', function (e) {
    var tr = e.target.closest && e.target.closest('#atlas-peers-body tr[data-id]');
    if (tr) select(+tr.getAttribute('data-id'));
    var rb = e.target.closest && e.target.closest('[data-map="reset"]');
    if (rb) select(-1);
    var sb = e.target.closest && e.target.closest('[data-map="share"]');
    if (sb) share();
    var eb = e.target && e.target.closest ? e.target.closest('#atlas-export') : null;
    if (eb) shareImage();
  });
  document.addEventListener('keydown', function (e) {
    var tr = e.target.closest && e.target.closest('#atlas-peers-body tr[data-id]');
    if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(+tr.getAttribute('data-id')); }
  });

  /* ---------- copy link (honest: "Copy failed" unless the write succeeds) ---------- */
  /* Feedback goes to the share bar's live region (kit .share-bar__status), not into the button label. */
  var statusTimer = 0;
  function say(msg) {
    var st = $('atlas-share-status');
    if (!st) return;
    st.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { st.textContent = ''; }, 2600);
  }
  function share() {
    var url = location.href;
    var done = say;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { done('Link copied'); }, function () { done('Copy failed'); });
    } else { done('Copy failed'); }
  }

  /* ---------- share image (V3) ---------- */
  function exportImage() {
    return new Promise(function (resolve) {
      if (!booted || !handle) { resolve(null); return; }
      // 2D canvas: capture inside rAF after a painted frame — never blank.
      requestAnimationFrame(function () {
        try {
          var cv = mountEl.querySelector('canvas');
          if (!cv) { resolve(null); return; }
          cv.toBlob(function (b) { resolve(b); }, 'image/png');
        } catch (e) { resolve(null); }
      });
    });
  }
  function shareImage() {
    var done = say;
    exportImage().then(function (blob) {
      if (!blob) { done('The map is not ready yet. Try again in a moment.'); return; }
      var p = selected >= 0 ? { n: NAMES[selected], s: SEASONS[selected] } : null;
      var title = (p ? p.n + ' ' + fmtSeason(p.s) : 'The atlas') + ' — Vector Hoops';
      var file = null;
      try { file = new File([blob], 'vector-hoops-atlas.png', { type: 'image/png' }); } catch (e) {}
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          navigator.share({ files: [file], title: title, text: title })
            .then(function () { done('Shared'); }, function () { /* dismissed */ });
          return;
        } catch (e) { /* fall through to download */ }
      }
      try {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'vector-hoops-atlas.png';
        document.body.appendChild(a); a.click();
        setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) {} a.remove(); }, 4000);
        done('Image saved');
      } catch (e) { done('Could not export'); }
    });
  }

  /* ---------- VHAtlas compat (home-tonight.js "Surprise me") ---------- */
  window.VHAtlas = {
    selectedPlayer: function () { return selected >= 0 ? { n: NAMES[selected], s: SEASONS[selected] } : null; },
    size: function () { return N; },
    select: function (i) { ensureIndex(function () { select(i); }); },
    onSelect: function (cb) { selectWaiters.push(cb); },
    onReady: function (cb) {
      if (indexReady) { try { cb(); } catch (e) {} return; }
      readyWaiters.push(cb);
    },
    exportImage: exportImage
  };

  /* ---------- go ---------- */
  ensurePeers(function () { if (selected >= 0) { computeTwins(); renderReadout(); } });
  ensureArch(function () { if (selected >= 0) renderReadout(); });
  initSearch();
  bootWhenNear();
  // Deep link: ?id=<row>
  try {
    var id = new URL(location.href).searchParams.get('id');
    if (id != null && /^\d+$/.test(id)) {
      boot();
      ensureIndex(function () { select(+id, { noUrl: true }); });
    }
  } catch (e) {}
})();

/* Shared top navigation — mount on <nav class="site-nav" data-active="/path">
 * Four primary slots on one axis: Map · Play · Explore (drawer) · How it works.
 * Map is first: the 3D atlas is the site's front door and the games' board.
 * The Explore drawer holds every other destination, one level down.
 * Styles live in assets/shell.css.
 */
(function (global) {
  'use strict';

  var MAP = { href: '/#atlas', label: 'Map', title: 'The atlas: 12,966 player-seasons on a 2-D map' };
  var PLAY = { href: '/play', label: 'Play', title: 'Daily Court: five past All-Stars, find each modern twin' };
  var HOW = {
    href: '/methods',
    label: 'How it works',
    title: 'Methods — every number recomputed from source, and the model graded'
  };

  var EXPLORE = [
    { href: '/', label: 'Atlas', desc: 'The map of 12,966 player-seasons' },
    { href: '/map-guess', label: 'Map Hunt', desc: 'Find the mystery star on the 3D map' },
    { href: '/live', label: 'Live', desc: 'Live game companion: win probability, atlas twins, shot charts', live: true },
    { href: '/schedule', label: 'Schedule', desc: 'Seven days of games — tonight on Live, last night on Replay' },
    { href: '/players', label: 'Players', desc: 'Directory, skill profiles and leaderboards' },
    { href: '/seasons', label: 'Seasons', desc: 'League shape, year by year, from the ledger' },
    { href: '/teams', label: 'Teams', desc: 'Rosters and the games we have on file' },
    { href: '/games', label: 'Games', desc: 'Play-by-play, shot charts, in-game board' },
    { href: '/compare', label: 'Compare', desc: 'Two player-seasons, skill next to skill' },
    { href: '/insights', label: 'Insights', desc: 'Findings from the model — and from the ledger' },
    { href: '/twin-network', label: 'Twin Networks', desc: 'Every player\u2019s nearest neighbors, mapped as a network' },
    { href: '/playoff-runs', label: 'Playoff Runs', desc: 'The greatest postseason runs, ranked' },
    { href: '/twenty-questions', label: 'Twenty Questions', desc: 'Think of a player — 20 yes/no questions, the map dims the rest' },
    { href: '/taxonomy', label: 'Taxonomy', desc: 'A taxonomy of play styles' },
    { href: '/methods', label: 'Methods', desc: 'Trust: every number recomputed from source, and the model graded' },
    { href: '/models/mtnn-v5', label: 'Models', desc: 'Model registry and the MTNN v5 champion card' },
    { href: '/guide', label: 'Guide', desc: 'The Ultimate Guide to the NBA, in plain words' }
  ];

  // The games, in the order the footer's Play column lists them. One flat object
  // per line, single quotes, no `{`/`}` in a value, no nested objects, no `]`:
  // scripts/stamp_footer.py and scripts/check_design.py (D12) read this list and
  // EXPLORE straight out of the source, and the stamper refuses a list it cannot
  // read in full.
  var GAMES = [
    { href: '/play', label: 'Daily Court' },
    { href: '/map-guess', label: 'Map Hunt' },
    { href: '/twenty-questions', label: 'Twenty Questions' },
    { href: '/play/era-crossed', label: 'Era Crossed' },
    { href: '/replay', label: 'Pixel Replay' }
  ];

  // Centre circle of a court, seen from above: the site's mark.
  var MARK = '<svg class="site-nav__mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<circle cx="12" cy="12" r="10.25" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
    '<line x1="1.75" y1="12" x2="22.25" y2="12" stroke="currentColor" stroke-width="1.5"/>' +
    '<circle cx="12" cy="12" r="3.25" fill="currentColor"/></svg>';

  var CHEVRON = '<svg class="site-nav__chev" viewBox="0 0 12 12" aria-hidden="true" focusable="false">' +
    '<path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var EXT = '<svg class="site-nav__ext" viewBox="0 0 12 12" aria-hidden="true" focusable="false">' +
    '<path d="M4.5 2.5H9.5V7.5M9.5 2.5 5.75 6.25M7.5 9.5h-5v-5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Sound: off by default; music starts only after a visitor turns it on
  var SOUND = '<button class="site-nav__sound" type="button" aria-pressed="false"><svg viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor"/><path class="w" d="M11 5.5a3.5 3.5 0 0 1 0 5M13 3.5a6 6 0 0 1 0 9" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<path class="x" d="M11 6l4 4m0-4-4 4" stroke="currentColor" stroke-width="1.4"/></svg><span>Sound</span></button>';

  var THEME = '<button class="site-nav__theme" type="button" aria-pressed="false" aria-label="Color theme, follow system">' +
    '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4">' +
    '<circle class="sun" cx="8" cy="8" r="2.4"/>' +
    '<path class="sun" d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>' +
    '<path class="moon" d="M10 2.2A5.6 5.6 0 1 0 13.8 10 4.4 4.4 0 0 1 10 2.2z" fill="currentColor" stroke="none"/></svg>' +
    '<span class="site-nav__theme-label">Theme</span></button>';

  var JUMP = '<button class="site-nav__jump" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="vh-jump" aria-label="Jump to a page">' +
    '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5">' +
    '<circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2 14 14"/></svg>' +
    '<span class="site-nav__jump-label">Jump</span></button>';

  function mount() {
    var nav = document.querySelector('.site-nav');
    if (!nav || nav.getAttribute('data-mounted') === '1') return;
    var active = nav.getAttribute('data-active') || '';

    var mapOn = (active === '/' || active === '/#atlas' || active === '/map-guess');
    var playOn = active === PLAY.href;
    var exploreItem = EXPLORE.filter(function (l) { return l.href === active; })[0] || null;
    var exploreOn = !!exploreItem;

    var drawerItems = EXPLORE.map(function (l) {
      var on = l.href === active;
      // P1-5: one aria-current per page — when a top-level slot already marks
      // this page (e.g. MAP for '/' and '/map-guess'), the drawer twin keeps
      // its visual is-active but does not claim aria-current a second time.
      var slotClaims = mapOn || playOn;
      return '<li><a class="explore-item' + (on ? ' is-active' : '') + '" href="' + l.href + '"' +
        (on && !slotClaims ? ' aria-current="page"' : '') + '>' +
        '<span class="explore-item__label">' + l.label +
        (l.live ? '<span class="explore-item__livedot" aria-hidden="true"></span>' : '') + '</span>' +
        '<span class="explore-item__desc">' + l.desc + '</span></a></li>';
    }).join('');

    if (!nav.getAttribute('aria-label')) nav.setAttribute('aria-label', 'Primary');
    nav.innerHTML =
      '<a class="site-nav__brand" href="/" aria-label="Vector Hoops, home">' + MARK +
        '<span>Vector<span class="site-nav__accent"> Hoops</span></span></a>' +
      '<div class="site-nav__slots" role="group" aria-label="Primary destinations">' +
        '<a class="site-nav__slot site-nav__link' + (mapOn ? ' is-active' : '') + '" href="' + MAP.href +
          '" title="' + MAP.title + '"' + (mapOn ? ' aria-current="page"' : '') + '>' + MAP.label + '</a>' +
        '<a class="site-nav__slot site-nav__link' + (playOn ? ' is-active' : '') + '" href="' + PLAY.href +
          '" title="' + PLAY.title + '"' + (playOn ? ' aria-current="page"' : '') + '>' + PLAY.label + '</a>' +
        '<button class="site-nav__slot site-nav__explore' + (exploreOn ? ' is-active' : '') + '" type="button"' +
          ' aria-expanded="false" aria-controls="vh-explore-drawer" aria-haspopup="true"' +
          ' title="Everything else, one level down">' +
          '<span>Explore</span>' + CHEVRON + '<span class="site-nav__live-dot" aria-hidden="true"></span></button>' +
        '<a class="site-nav__slot site-nav__link" href="' + HOW.href + '" rel="noopener" title="' + HOW.title + '">' +
          '<span>' + HOW.label + '</span>' + EXT + '</a>' +
      '</div>' +
      '<div class="site-nav__end">' + JUMP + THEME + SOUND +
        (active === '/play'
          ? '<span class="site-nav__meta">1996–97 → 2025–26</span>'
          : '<span class="site-nav__meta">12,966 seasons</span>') +
      '</div>' +
      '<div class="site-nav__drawer" id="vh-explore-drawer" role="region" aria-label="Explore everything else" hidden>' +
        '<div class="site-nav__drawer-head">' +
          '<span class="site-nav__drawer-title">Explore</span>' +
          '<button class="site-nav__drawer-close" type="button">Close' +
            '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>' +
        '</div>' +
        '<ul class="site-nav__drawer-list">' + drawerItems + '</ul>' +
      '</div>';
    nav.setAttribute('data-mounted', '1');

    wireDrawer(nav);
    markLive(nav);
    wireSound(nav);
    wireTheme(nav);
    wireJump(nav);

    // visit — Owner Q: which inbound refs actually bring returning players?
    // data-mounted guards double-fire; vh-analytics.js is a no-op until a
    // backend is chosen, so this is honest scaffolding, not theater.
    try {
      var ref = null;
      try { ref = new URL(location.href).searchParams.get('ref'); } catch (e) {}
      if (window.VHAnalytics) VHAnalytics.track('visit', { path: location.pathname, ref: ref });
    } catch (e) {}
  }

  function wireDrawer(nav) {
    var btn = nav.querySelector('.site-nav__explore');
    var drawer = nav.querySelector('.site-nav__drawer');
    var closeBtn = nav.querySelector('.site-nav__drawer-close');
    if (!btn || !drawer) return;

    function isOpen() { return btn.getAttribute('aria-expanded') === 'true'; }

    function open() {
      drawer.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      // T15 (#200): Close is the first Tab stop, not the first drawer link.
      if (closeBtn) closeBtn.focus();
      else {
        var first = drawer.querySelector('.explore-item');
        if (first) first.focus();
      }
    }

    function close(returnFocus) {
      if (!isOpen()) return;
      drawer.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (returnFocus) btn.focus();
    }

    btn.addEventListener('click', function () {
      if (isOpen()) close(false); else open();
    });
    closeBtn.addEventListener('click', function () { close(true); });

    drawer.addEventListener('click', function (e) {
      var item = e.target && e.target.closest ? e.target.closest('.explore-item') : null;
      if (item) close(false); // navigation proceeds; drop the drawer state
    });

    document.addEventListener('click', function (e) {
      if (isOpen() && !nav.contains(e.target)) close(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') close(true);
    });

    global.VHExploreDrawer = { open: open, close: close, isOpen: isOpen };
  }

  /* Live-dot: pulse the drawer Live link (and the Explore slot) while any
   * NBA game is in progress. One ESPN scoreboard fetch per 90s per tab,
   * cached in sessionStorage. */
  function markLive(nav) {
    var link = nav.querySelector('.explore-item[href="/live"]');
    var btn = nav.querySelector('.site-nav__explore');
    function set(on) {
      if (link) link.classList.toggle('is-live', !!on);
      if (btn) btn.classList.toggle('is-live', !!on);
    }
    try {
      var c = sessionStorage.getItem('vh_nav_live');
      if (c) { var o = JSON.parse(c); if (Date.now() - o.t < 90000) { set(o.on); return; } }
    } catch (e) {}
    fetch('/api/espn/scoreboard')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var on = (d.events || []).some(function (e) { return e.status && e.status.type && e.status.type.state === 'in'; });
        set(on);
        try { sessionStorage.setItem('vh_nav_live', JSON.stringify({ on: on, t: Date.now() })); } catch (e) {}
      })
      .catch(function () {});
  }

  // sound.js loads once per page, only when sound is on; the AudioContext is made inside a gesture (Safari)
  function family() {
    var p = location.pathname.replace(/(\/index)?(\.html)?\/?$/, '');
    return !p ? 'home' : p === '/live' ? 'live' : p === '/replay' ? 'replay' : /^\/(play|map-guess|twenty-questions)/.test(p) ? 'play' : 'calm';
  }
  function audioCtx() {
    var A = global.AudioContext || global.webkitAudioContext;
    try { var c = global.VHAudioCtx || (global.VHAudioCtx = new A()); if (c.state !== 'running') c.resume(); } catch (e) {}
  }
  var pend = null;
  function lazyScript(src, cb, fail) {
    if (global.VHSound) return cb();
    if (pend) return; // already loading: its callback reads the toggle's state when it lands
    pend = 1;
    var s = document.createElement('script'); s.src = src;
    s.onload = function () { pend = null; cb(); };
    s.onerror = function () { pend = null; s.remove(); fail(); };
    document.head.appendChild(s);
  }
  function wireSound(nav) {
    var b = nav.querySelector('.site-nav__sound'), on = false, wait = false, ev = ['pointerup', 'touchend', 'keydown'];
    if (!b) return;
    try { on = localStorage.getItem('vh.sound') === '1'; } catch (e) {}
    function set(v, store) {
      on = v; b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (store) try { localStorage.setItem('vh.sound', on ? '1' : '0'); } catch (e) {}
      if (global.VHAudio) global.VHAudio.setMuted(!on); // Daily Court's effects follow the one control
      try { document.dispatchEvent(new CustomEvent('vh-sound', { detail: on })); } catch (e) {}
    }
    function start() {
      lazyScript('/assets/sound.js?v=b3a48598', function () { if (on && global.VHSound) global.VHSound.start(family()); },
        function () { set(false, false); }); // offline: show off; the stored choice stays, so the next page retries
    }
    function first(e) { // a returning visitor: music waits for the first gesture on this page
      if (e && e.target && e.target.closest && e.target.closest('.site-nav__sound')) return;
      ev.forEach(function (t) { global.removeEventListener(t, first, true); });
      wait = false; if (on) { audioCtx(); start(); }
    }
    function toggle(v) {
      if (wait) { first(); return; } // waiting: start
      ev.forEach(function (t) { global.removeEventListener(t, first, true); });
      set(v, true);
      if (on) { audioCtx(); start(); } else if (global.VHSound) global.VHSound.stop();
    }
    set(on, false);
    if (on) { wait = true; ev.forEach(function (t) { global.addEventListener(t, first, true); }); }
    b.addEventListener('click', function () { toggle(!on); });
    global.VHSiteNav = global.VHSiteNav || {};
    global.VHSiteNav.setSound = toggle;
  }

  function themeCycle(cur) {
    if (cur === 'light') return 'dark';
    if (cur === 'dark') return '';
    return 'light';
  }

  function applyTheme(mode) {
    var root = document.documentElement;
    if (mode === 'light' || mode === 'dark') root.setAttribute('data-theme', mode);
    else root.removeAttribute('data-theme');
  }

  function themeLabel(mode) {
    if (mode === 'light') return 'Color theme, light';
    if (mode === 'dark') return 'Color theme, dark';
    return 'Color theme, follow system';
  }

  function wireTheme(nav) {
    var b = nav.querySelector('.site-nav__theme');
    if (!b) return;
    var mode = '';
    try { mode = localStorage.getItem('vh.theme') || ''; } catch (e) { mode = ''; }
    if (mode !== 'light' && mode !== 'dark') mode = '';
    function paint() {
      applyTheme(mode);
      b.setAttribute('aria-pressed', mode === 'dark' ? 'true' : 'false');
      b.setAttribute('aria-label', themeLabel(mode));
    }
    paint();
    b.addEventListener('click', function () {
      mode = themeCycle(mode);
      try { localStorage.setItem('vh.theme', mode); } catch (e) {}
      paint();
    });
  }

  function destinations() {
    var seen = {};
    var out = [];
    EXPLORE.concat(GAMES).forEach(function (l) {
      if (seen[l.href]) return;
      seen[l.href] = 1;
      out.push(l);
    });
    return out;
  }

  function filterDest(list, q) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return list.slice();
    return list.filter(function (d) {
      return (d.label + ' ' + (d.desc || '') + ' ' + d.href).toLowerCase().indexOf(q) !== -1;
    });
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function wireJump(nav) {
    var btn = nav.querySelector('.site-nav__jump');
    if (!btn || document.getElementById('vh-jump')) return;
    var dest = destinations();
    var wrap = document.createElement('div');
    wrap.className = 'site-jump';
    wrap.id = 'vh-jump';
    wrap.hidden = true;
    wrap.innerHTML = '<div class="site-jump__panel" role="dialog" aria-modal="true" aria-labelledby="vh-jump-title">' +
      '<p id="vh-jump-title" class="visually-hidden">Jump to a page</p>' +
      '<input class="input" id="vh-jump-q" type="search" aria-label="Jump to a page" placeholder="Jump to a page, or a player name" autocomplete="off" spellcheck="false"/>' +
      '<ul class="site-jump__list" id="vh-jump-list" role="listbox"></ul>' +
      '<p class="site-jump__hint">Ctrl or Cmd + K. Player names open the Players directory.</p></div>';
    document.body.appendChild(wrap);
    var input = wrap.querySelector('#vh-jump-q');
    var list = wrap.querySelector('#vh-jump-list');
    var active = 0;
    var rows = [];

    function close() {
      wrap.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      btn.focus();
    }
    function open() {
      wrap.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      input.value = '';
      render('');
      input.focus();
    }
    function render(q) {
      var hits = filterDest(dest, q);
      rows = hits.slice();
      var extra = '';
      var trimmed = String(q || '').trim();
      if (trimmed && hits.length === 0) {
        extra = '<li><a class="site-jump__item" role="option" href="/players?q=' +
          encodeURIComponent(trimmed) + '"><span>Search players for ' + esc(trimmed) +
          '</span><span class="site-jump__desc">Opens the Players directory</span></a></li>';
        rows = [{ href: '/players?q=' + encodeURIComponent(trimmed) }];
      }
      list.innerHTML = extra || hits.map(function (d, i) {
        return '<li><a class="site-jump__item' + (i === 0 ? ' is-active' : '') + '" role="option" href="' + d.href + '">' +
          '<span>' + d.label + '</span>' +
          (d.desc ? '<span class="site-jump__desc">' + d.desc + '</span>' : '') + '</a></li>';
      }).join('');
      active = 0;
    }
    function move(delta) {
      var items = list.querySelectorAll('.site-jump__item');
      if (!items.length) return;
      items[active] && items[active].classList.remove('is-active');
      active = (active + delta + items.length) % items.length;
      items[active].classList.add('is-active');
      items[active].focus();
    }
    btn.addEventListener('click', function () { if (wrap.hidden) open(); else close(); });
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    input.addEventListener('input', function () { render(input.value); });
    document.addEventListener('keydown', function (e) {
      var k = e.key;
      var meta = e.metaKey || e.ctrlKey;
      if (meta && (k === 'k' || k === 'K')) { e.preventDefault(); if (wrap.hidden) open(); else close(); return; }
      if (wrap.hidden) return;
      if (k === 'Escape' || k === 'Esc') { e.preventDefault(); close(); return; }
      if (k === 'ArrowDown') { e.preventDefault(); move(1); return; }
      if (k === 'ArrowUp') { e.preventDefault(); move(-1); return; }
      if (k === 'Enter' && document.activeElement === input) {
        var first = list.querySelector('.site-jump__item');
        if (first) { e.preventDefault(); first.click(); }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  var api = global.VHSiteNav = global.VHSiteNav || {};
  api.mount = mount; api.explore = EXPLORE; api.games = GAMES;
  api.themeCycle = themeCycle; api.filterDest = filterDest; api.destinations = destinations;
})(window);

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
    { href: '/map-guess', label: 'Map Hunt', desc: 'Find the mystery star on the 3D map — new tonight', live: true },
    { href: '/live', label: 'Live', desc: 'Live game companion: win probability, atlas twins, shot charts', live: true },
    { href: '/players', label: 'Players', desc: 'Directory, skill profiles and leaderboards' },
    { href: '/insights', label: 'Insights', desc: 'Findings from the model — and from the ledger' },
    { href: '/twin-network', label: 'Twin Networks', desc: 'Every player\u2019s nearest neighbors, mapped as a network' },
    { href: '/teams', label: 'Teams', desc: 'Thirty team intro loops and season snapshots' },
    { href: '/playoff-runs', label: 'Playoff Runs', desc: 'The greatest postseason runs, ranked' },
    { href: '/twenty-questions', label: 'Twenty Questions', desc: 'Think of a player — 20 yes/no questions, the map dims the rest' },
    { href: '/taxonomy', label: 'Taxonomy', desc: 'A taxonomy of play styles' },
    { href: '/methods', label: 'Methods', desc: 'Trust: every number recomputed from source, and the model graded' },
    { href: '/models/mtnn-v5', label: 'Models', desc: 'Model registry and the MTNN v5 champion card' }
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
      '<div class="site-nav__end">' + SOUND +
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
    motion();

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
      var first = drawer.querySelector('.explore-item');
      if (first) first.focus();
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

  // sound.js loads only once sound is on; the AudioContext resumes inside the click (Safari)
  function family() {
    var p = location.pathname.replace(/(\/index)?(\.html)?\/?$/, '');
    return !p ? 'home' : p === '/live' ? 'live' : p === '/replay' ? 'replay' : /^\/(play|map-guess|twenty-questions)/.test(p) ? 'play' : 'calm';
  }
  function audioCtx() {
    var A = global.AudioContext || global.webkitAudioContext;
    try { var c = global.VHAudioCtx || (global.VHAudioCtx = new A()); if (c.state !== 'running') c.resume(); } catch (e) {}
  }
  function lazyScript(src, cb) {
    if (global.VHSound) return cb();
    var s = document.createElement('script'); s.src = src; s.onload = cb; document.head.appendChild(s);
  }
  function wireSound(nav) {
    var b = nav.querySelector('.site-nav__sound'), on = false;
    if (!b) return;
    try { on = localStorage.getItem('vh.sound') === '1'; } catch (e) {}
    function go() { lazyScript('/assets/sound.js?v=2e012622', function () { if (global.VHSound && on) global.VHSound.start(family()); }); }
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) go();
    b.addEventListener('click', function () {
      on = !on; b.setAttribute('aria-pressed', on ? 'true' : 'false');
      try { localStorage.setItem('vh.sound', on ? '1' : '0'); } catch (e) {}
      if (on) { audioCtx(); go(); } else if (global.VHSound) global.VHSound.stop();
    });
  }

  // view-transition title; reveal sections/plates below the fold (visible without JS)
  function motion() {
    var h1 = document.querySelector('main h1') || document.querySelector('h1');
    if (h1) h1.classList.add('vh-title');
    if (!global.IntersectionObserver || (global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    var vh = global.innerHeight || 800, n = 0, io = new IntersectionObserver(function (es) {
      var k = 0;
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.style.transitionDelay = Math.min(k++, 5) * 50 + 'ms';
        e.target.classList.add('vh-in'); io.unobserve(e.target);
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('section, .plate'), function (el) {
      if (n > 40 || el.closest('.site-nav') || (el.parentElement && el.parentElement.closest('.vh-rv')) || (el.tagName === 'SECTION' && el.querySelector('.plate, section'))) return;
      var r = el.getBoundingClientRect();
      if (r.height && r.top > vh) { el.classList.add('vh-rv'); io.observe(el); n++; }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  global.VHSiteNav = { mount: mount, explore: EXPLORE };
})(window);

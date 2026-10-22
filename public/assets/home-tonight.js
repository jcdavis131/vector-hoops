/* home-tonight.js — the landing page's "Tonight" strip and "Surprise me".
 *
 * Tonight reads the same public ESPN scoreboard that live.js reads. Nothing
 * here is invented: on any failure (network, CORS, odd payload, no games)
 * the strip keeps its static copy and its two links to /live and /replay.
 * Tip times are formatted from ESPN's own event date in the viewer's zone.
 */
(function () {
  'use strict';

  var SB = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function parse(d) {
    return ((d && d.events) || []).map(function (e) {
      var c = e.competitions && e.competitions[0];
      var ts = (c && c.competitors) || [];
      var h = ts.filter(function (t) { return t.homeAway === 'home'; })[0];
      var a = ts.filter(function (t) { return t.homeAway === 'away'; })[0];
      var st = e.status && e.status.type;
      if (!h || !a || !st || !h.team || !a.team) return null;
      return {
        state: st.state, detail: st.shortDetail || '', date: e.date,
        h: { abbr: h.team.abbreviation, score: h.score },
        a: { abbr: a.team.abbreviation, score: a.score }
      };
    }).filter(Boolean);
  }

  function tip(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function chip(g) {
    var m = esc(g.a.abbr) + ' @ ' + esc(g.h.abbr);
    if (g.state === 'in') {
      return '<li class="is-live"><b>' + esc(g.a.abbr) + ' ' + esc(g.a.score) + '</b> &ndash; <b>' +
        esc(g.h.score) + ' ' + esc(g.h.abbr) + '</b> &middot; ' + esc(g.detail) + '</li>';
    }
    if (g.state === 'post') {
      return '<li>' + esc(g.a.abbr) + ' ' + esc(g.a.score) + ' &ndash; ' + esc(g.h.score) + ' ' +
        esc(g.h.abbr) + ' &middot; Final</li>';
    }
    var when = tip(g.date);
    return '<li><b>' + m + '</b>' + (when ? ' &middot; ' + esc(when) : '') + '</li>';
  }

  function render(games) {
    var root = document.getElementById('tonight');
    var text = document.getElementById('tonight-text');
    var list = document.getElementById('tonight-games');
    if (!root || !text || !list || !games.length) return;
    var live = games.filter(function (g) { return g.state === 'in'; });
    var pre = games.filter(function (g) { return g.state === 'pre'; });
    var n = games.length;
    if (live.length) {
      root.classList.add('is-live');
      text.textContent = live.length + (live.length === 1 ? ' game is' : ' games are') +
        ' live now. Follow along on Courtside Live.';
    } else if (pre.length) {
      text.textContent = n + (n === 1 ? ' game' : ' games') + ' on ESPN’s board today.';
    } else {
      // ESPN keeps last night's slate up into the morning: say which night it was.
      var latest = 0;
      games.forEach(function (g) { var t = Date.parse(g.date); if (t > latest) latest = t; });
      var before = latest && new Date(latest).toDateString() !== new Date().toDateString();
      var k = document.getElementById('tonight-k');
      if (before && k) k.textContent = 'Last night';
      text.textContent = (before ? 'Last night’s ' : 'Today’s ') + (n === 1 ? 'game is' : 'games are') +
        ' final. Rewatch them in Pixel Replay.';
    }
    // Live first, then upcoming, then finals; four chips (two on a phone) stay quiet.
    var order = live.concat(pre, games.filter(function (g) { return g.state === 'post'; }));
    var narrow = window.matchMedia && window.matchMedia('(max-width: 480px)').matches;
    var shown = order.slice(0, narrow ? 2 : 4);
    list.innerHTML = shown.map(chip).join('') +
      (order.length > shown.length ? '<li>+' + (order.length - shown.length) + ' more</li>' : '');
    list.hidden = false;
    try { if (window.VHEngage && window.VHEngage.writeLive) window.VHEngage.writeLive(live.length > 0); } catch (e) {}
  }

  function loadTonight() {
    if (!document.getElementById('tonight') || !window.fetch) return;
    var ctl = null;
    try { ctl = new AbortController(); setTimeout(function () { ctl.abort(); }, 8000); } catch (e) { ctl = null; }
    fetch(SB, ctl ? { signal: ctl.signal } : undefined)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { render(parse(d)); })
      .catch(function () { /* feed down: the static strip stands */ });
  }

  // The hero's one action pays off below it: after a pick, bring the map and
  // its twins into view (instantly when the viewer prefers reduced motion).
  function showMap() {
    var field = document.getElementById('map-wrap');
    if (!field || !field.scrollIntoView) return;
    var r = field.getBoundingClientRect();
    if (r.top >= 0 && r.top < window.innerHeight * 0.5) return;
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    field.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  }

  function wireSurprise() {
    // Only a pick the viewer just made in the hero scrolls; the atlas's own
    // opening selection (and URL ?id=) never moves the page.
    var hero = document.querySelector('.hero-search'), intent = 0;
    function mark(e) { if (e.type === 'mousedown' || e.key === 'Enter') intent = Date.now(); }
    if (hero) { hero.addEventListener('mousedown', mark, true); hero.addEventListener('keydown', mark, true); }
    try {
      if (window.VHAtlas && window.VHAtlas.onSelect) window.VHAtlas.onSelect(function (p) {
        if (p && Date.now() - intent < 800) { intent = 0; setTimeout(showMap, 30); }
      });
    } catch (e) {}
    var b = document.getElementById('atlas-surprise');
    if (!b) return;
    b.addEventListener('click', function () {
      var A = window.VHAtlas;
      var n = A && A.size ? A.size() : 0;
      if (!n || !A.select) return;
      A.select(Math.floor(Math.random() * n));
      showMap();
    });
  }

  function boot() { wireSurprise(); loadTonight(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

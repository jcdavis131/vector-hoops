/* home-tonight.js — the landing page's "Tonight" strip and "Surprise me".
 *
 * Tonight reads the same public ESPN scoreboard that live.js reads. Nothing
 * here is invented: on any failure (network, CORS, odd payload, no games)
 * the strip keeps its static copy and its two links to /live and /replay.
 * Tip times are formatted from ESPN's own event date in the viewer's zone;
 * "last night" is judged by the America/New_York day, as ESPN's NBA day is.
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
        // ESPN marks postponed / cancelled games state "post" with
        // completed:false and 0-0 scores: only completed games are finals.
        state: st.state, completed: st.completed === true, detail: st.shortDetail || '', date: e.date,
        h: { abbr: h.team.abbreviation, score: h.score },
        a: { abbr: a.team.abbreviation, score: a.score }
      };
    }).filter(Boolean);
  }

  function isFinal(g) { return g.state === 'post' && g.completed; }

  // ESPN's NBA day runs on America/New_York (live.js uses the same rule).
  function etDay(t) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
    } catch (e) { return new Date(t).toISOString().slice(0, 10); }
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
    if (isFinal(g)) {
      return '<li>' + esc(g.a.abbr) + ' ' + esc(g.a.score) + ' &ndash; ' + esc(g.h.score) + ' ' +
        esc(g.h.abbr) + ' &middot; Final</li>';
    }
    if (g.state === 'post') {
      // Postponed, cancelled, suspended: ESPN's own words, never a score.
      return '<li><b>' + m + '</b>' + (g.detail ? ' &middot; ' + esc(g.detail) : '') + '</li>';
    }
    var when = tip(g.date);
    return '<li><b>' + m + '</b>' + (when ? ' &middot; ' + esc(when) : '') + '</li>';
  }

  // Pure: what the strip says about a slate. nowMs is injectable for tests.
  function summarize(games, nowMs) {
    var live = games.filter(function (g) { return g.state === 'in'; });
    var pre = games.filter(function (g) { return g.state === 'pre'; });
    var fin = games.filter(isFinal);
    var other = games.filter(function (g) { return g.state === 'post' && !g.completed; });
    var n = games.length, label = 'Tonight', text;
    if (live.length) {
      text = live.length + (live.length === 1 ? ' game is' : ' games are') + ' live now. Follow along on Courtside Live.';
    } else if (pre.length) {
      text = n + (n === 1 ? ' game' : ' games') + ' on ESPN’s board today.';
    } else if (fin.length) {
      // ESPN keeps last night's slate up into the morning: say which night it was.
      var latest = 0;
      fin.forEach(function (g) { var t = Date.parse(g.date); if (t > latest) latest = t; });
      var before = latest > 0 && etDay(latest) < etDay(nowMs == null ? Date.now() : nowMs);
      if (before) label = 'Last night';
      var f = fin.length;
      text = f + (f === 1 ? ' game' : ' games') + (before ? ' from last night' : ' today') +
        (f === 1 ? ' is' : ' are') + ' final. Rewatch them in Pixel Replay.';
    } else {
      text = 'No games were played on ESPN’s board today.';
    }
    // Live first, then upcoming, then finals, then postponed / cancelled.
    return { label: label, text: text, live: live.length, order: live.concat(pre, fin, other) };
  }

  function render(games) {
    var root = document.getElementById('tonight');
    var text = document.getElementById('tonight-text');
    var list = document.getElementById('tonight-games');
    if (!root || !text || !list) return;
    if (!games.length) {
      // G2/T2.2: the static strip promises live coverage; gate it on game
      // presence so an empty slate doesn't read as a promise.
      var k0 = document.getElementById('tonight-k');
      if (k0) k0.textContent = 'Tonight';
      text.textContent = 'No games tonight — replays from last night are ready.';
      return;
    }
    var s = summarize(games);
    if (s.live) root.classList.add('is-live');
    var k = document.getElementById('tonight-k');
    if (k) k.textContent = s.label;
    text.textContent = s.text;
    // Four chips (two on a phone) stay quiet.
    var narrow = window.matchMedia && window.matchMedia('(max-width: 480px)').matches;
    var shown = s.order.slice(0, narrow ? 2 : 4);
    list.innerHTML = shown.map(chip).join('') +
      (s.order.length > shown.length ? '<li>+' + (s.order.length - shown.length) + ' more</li>' : '');
    list.hidden = false;
    try { if (window.VHEngage && window.VHEngage.writeLive) window.VHEngage.writeLive(s.live > 0); } catch (e) {}
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
    var b = document.getElementById('atlas-surprise');
    function ready() { var A = window.VHAtlas; return !!(A && A.size && A.size() > 0 && A.select); }
    // Disabled until the season file has loaded (the atlas's first select).
    if (b && !ready()) {
      b.disabled = true;
      // G2/T2.2: the atlas canvas boots lazily, but the season file (phase 1)
      // lands eagerly — enable Surprise me as soon as the data is in.
      try {
        if (window.VHAtlas && window.VHAtlas.onReady) {
          window.VHAtlas.onReady(function () { if (b && ready()) b.disabled = false; });
        }
      } catch (e) {}
    }
    try {
      if (window.VHAtlas && window.VHAtlas.onSelect) window.VHAtlas.onSelect(function (p) {
        if (b && b.disabled && ready()) b.disabled = false;
        if (p && Date.now() - intent < 800) { intent = 0; setTimeout(showMap, 30); }
      });
    } catch (e) {}
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
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parse: parse, chip: chip, summarize: summarize, etDay: etDay };
  }
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

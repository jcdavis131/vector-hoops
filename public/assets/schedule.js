/* assets/schedule.js — the 7-day schedule page.
 *
 * One fetch via the shared scoreboard module (V7: window.Scoreboard.fetchWeek),
 * date nav across today-3..today+3, game links routed by the 24h rule:
 *   pre/in            -> live.html?game=<id>
 *   post, final <=24h -> live.html?game=<id>   (morning-after lives on Live)
 *   post, final > 24h -> replay.html?espn=<id>
 * The final whistle is estimated as tip + 2.5h (same convention as live.js);
 * anything in the gray zone stays on Live — never confidently misrouted.
 *
 * Deferred classic script.
 */
(function (global) {
  'use strict';

  var EST_GAME_MS = 2.5 * 3600e3;
  var RULE_MS = 24 * 3600e3;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function dayKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function chicagoDay(iso) {
    try {
      var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
      return p; // YYYY-MM-DD
    } catch (e) { return ''; }
  }

  function routeFor(e) {
    if (e.state !== 'post') return 'live.html?game=' + encodeURIComponent(e.id);
    var tip = Date.parse(e.date);
    if (isNaN(tip)) return 'live.html?game=' + encodeURIComponent(e.id);
    var ageMs = Date.now() - (tip + EST_GAME_MS);
    if (ageMs > RULE_MS) return 'replay.html?espn=' + encodeURIComponent(e.id);
    return 'live.html?game=' + encodeURIComponent(e.id);
  }

  function renderDay(box, events, key) {
    var mine = events.filter(function (e) { return chicagoDay(e.date) === key; });
    mine.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (!mine.length) {
      box.innerHTML = '<p class="rp-muted">No games this day.</p>';
      return;
    }
    box.innerHTML = mine.map(function (e) {
      var href = routeFor(e);
      var where = href.indexOf('replay.html') === 0 ? 'replay' : 'live';
      var mid = e.state === 'in' ? '<b class="live-dot">● LIVE</b> ' + esc(e.detail || '') :
        e.state === 'post' ? esc(e.away.score) + ' - ' + esc(e.home.score) + ' · Final' :
        esc(e.detail || 'Pre-game');
      return '<a class="sched-game" href="' + esc(href) + '">' +
        '<span class="sg-teams">' + esc(e.away.abbr) + ' @ ' + esc(e.home.abbr) + '</span>' +
        '<span class="sg-mid">' + mid + '</span>' +
        '<span class="sg-where">' + where + ' →</span></a>';
    }).join('');
  }

  function boot() {
    var nav = document.getElementById('schedNav'), box = document.getElementById('schedBox');
    if (!nav || !box || !global.Scoreboard) return;
    var days = [];
    var now = new Date();
    for (var i = -3; i <= 3; i++) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      days.push({ key: dayKey(d), label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }) });
    }
    var selected = dayKey(now);
    function paintNav() {
      nav.innerHTML = days.map(function (d) {
        return '<button class="sched-day' + (d.key === selected ? ' is-active' : '') + '" data-day="' + d.key + '"' +
          (d.key === selected ? ' aria-current="date"' : '') + '>' + esc(d.label) + '</button>';
      }).join('');
    }
    paintNav();
    nav.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-day]');
      if (!b || !window._schedEvents) return;
      selected = b.getAttribute('data-day');
      paintNav();
      renderDay(box, window._schedEvents, selected);
    });
    box.innerHTML = '<p class="rp-muted">Loading the week…</p>';
    global.Scoreboard.fetchWeek().then(function (events) {
      window._schedEvents = events;
      renderDay(box, events, selected);
    }).catch(function () {
      box.innerHTML = '<p class="rp-muted">The schedule could not be loaded — ESPN may be unreachable.</p>';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

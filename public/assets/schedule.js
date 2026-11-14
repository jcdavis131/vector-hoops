/* assets/schedule.js — the 7-day schedule page.
 *
 * One fetch via the shared scoreboard module (V7: window.Scoreboard.fetchWeek),
 * date nav from the fetched ET day keys (today-3..today+3), game links routed by the 24h rule:
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

  function routeFor(e) {
    if (e.state !== 'post') return 'live.html?game=' + encodeURIComponent(e.id);
    var tip = Date.parse(e.date);
    if (isNaN(tip)) return 'live.html?game=' + encodeURIComponent(e.id);
    var ageMs = Date.now() - (tip + EST_GAME_MS);
    if (ageMs > RULE_MS) return 'replay.html?espn=' + encodeURIComponent(e.id);
    return 'live.html?game=' + encodeURIComponent(e.id);
  }

  /* Pre-game rows show the tip time in Central (the page says "Game times are
   * Central"); ESPN's shortDetail is Eastern, so it is not printed for them. */
  function tipTime(iso) {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(iso));
    } catch (e) { return ''; }
  }

  /* A game belongs to the ET day it was fetched under (a late tip stays on
   * that day's tab); the nav is built from those fetched day keys, so it
   * does not depend on the browser's time zone. */
  function weekDays(week) {
    return week.map(function (w) {
      var k = w.day.slice(0, 4) + '-' + w.day.slice(4, 6) + '-' + w.day.slice(6, 8);
      var d = new Date(Date.UTC(+w.day.slice(0, 4), +w.day.slice(4, 6) - 1, +w.day.slice(6, 8)));
      return { key: k, label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'UTC' }) };
    });
  }

  function renderDay(box, week, key) {
    var w = week.filter(function (x) { return weekDays([x])[0].key === key; })[0];
    if (!w || w.failed) {
      box.innerHTML = '<p class="rp-muted">The schedule could not be loaded — ESPN may be unreachable.</p>';
      return;
    }
    var mine = w.games.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (!mine.length) {
      box.innerHTML = '<p class="rp-muted">No games this day.</p>';
      return;
    }
    box.innerHTML = mine.map(function (e) {
      var href = routeFor(e);
      var where = href.indexOf('replay.html') === 0 ? 'replay' : 'live';
      var mid = e.state === 'in' ? '<b class="live-dot">● LIVE</b> ' + esc(e.detail || '') :
        e.state === 'post' ? esc(e.a.score) + ' - ' + esc(e.h.score) + ' · Final' :
        esc(tipTime(e.date) || 'Pre-game');
      return '<a class="sched-game" href="' + esc(href) + '">' +
        '<span class="sg-teams">' + esc(e.a.abbr) + ' @ ' + esc(e.h.abbr) + '</span>' +
        '<span class="sg-mid">' + mid + '</span>' +
        '<span class="sg-where">' + where + ' →</span></a>';
    }).join('');
  }

  function boot() {
    var nav = document.getElementById('schedNav'), box = document.getElementById('schedBox');
    if (!nav || !box || !global.Scoreboard) return;
    var days = [], selected = '';
    function paintNav() {
      nav.innerHTML = days.map(function (d) {
        return '<button class="sched-day' + (d.key === selected ? ' is-active' : '') + '" data-day="' + d.key + '"' +
          (d.key === selected ? ' aria-current="date"' : '') + '>' + esc(d.label) + '</button>';
      }).join('');
    }
    nav.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-day]');
      if (!b || !window._schedEvents) return;
      selected = b.getAttribute('data-day');
      paintNav();
      renderDay(box, window._schedEvents, selected);
    });
    box.innerHTML = '<p class="rp-muted">Loading the week…</p>';
    global.Scoreboard.fetchWeek().then(function (week) {
      window._schedEvents = week;
      days = weekDays(week);
      selected = days[Math.min(3, days.length - 1)].key; // fetchWeek centres on today (ET)
      paintNav();
      renderDay(box, week, selected);
    }).catch(function () {
      box.innerHTML = '<p class="rp-muted">The schedule could not be loaded — ESPN may be unreachable.</p>';
    });
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { weekDays: weekDays, renderDay: renderDay, tipTime: tipTime, routeFor: routeFor };
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

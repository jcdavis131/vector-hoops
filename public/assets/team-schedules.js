/* assets/team-schedules.js — schedule strips on the 30 team cards (teams.html).
 *
 * Uses the ONE shared scoreboard module (V7: window.Scoreboard.fetchWeek —
 * a single 7-day fetch, filtered client-side per team). No second fetch
 * implementation.
 *
 * Per card: last final -> /replay?espn=<id> (the 24h guard routes recent
 * finals to /live itself), today/upcoming -> /live?game=<id>.
 * Any fetch failure -> the strip hides (never a broken card).
 *
 * Deferred classic script. Runs on DOMContentLoaded.
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function fmtDay(iso) {
    try {
      return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'numeric', day: 'numeric' });
    } catch (e) { return ''; }
  }

  function render(abbr, el, events) {
    var mine = events.filter(function (e) {
      return e.away.abbr === abbr || e.home.abbr === abbr;
    });
    if (!mine.length) { el.hidden = true; return; }
    // Last final (most recent post), next upcoming (earliest pre/in).
    var finals = mine.filter(function (e) { return e.state === 'post'; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var upcoming = mine.filter(function (e) { return e.state !== 'post'; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var html = '<div class="sched-strip">';
    if (finals.length) {
      var f = finals[0];
      var vs = f.away.abbr === abbr ? 'vs ' + f.home.abbr : '@ ' + f.home.abbr;
      html += '<a class="sched-row" href="replay.html?espn=' + esc(f.id) + '">' +
        '<span>Last: ' + esc(vs) + ' ' + esc(f.away.score) + '-' + esc(f.home.score) + '</span>' +
        '<span class="sched-day">' + esc(fmtDay(f.date)) + ' · replay</span></a>';
    }
    if (upcoming.length) {
      var u = upcoming[0];
      var vs2 = u.away.abbr === abbr ? 'vs ' + u.home.abbr : '@ ' + u.home.abbr;
      var label = u.state === 'in' ? 'LIVE now' : 'Next';
      html += '<a class="sched-row" href="live.html?game=' + esc(u.id) + '">' +
        '<span>' + label + ': ' + esc(vs2) + '</span>' +
        '<span class="sched-day">' + esc(fmtDay(u.date)) + ' · live</span></a>';
    }
    el.innerHTML = html + '</div>';
  }

  function boot() {
    var mounts = Array.prototype.slice.call(document.querySelectorAll('.team-card__sched[data-abbr]'));
    if (!mounts.length || !global.Scoreboard) return;
    global.Scoreboard.fetchWeek().then(function (events) {
      mounts.forEach(function (el) {
        try { render(el.getAttribute('data-abbr'), el, events); }
        catch (e) { el.hidden = true; }
      });
    }).catch(function () {
      mounts.forEach(function (el) { el.hidden = true; });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

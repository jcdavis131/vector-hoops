/* assets/scoreboard.js — ONE ESPN scoreboard fetch module.
 *
 * V7 (PRD-SPEC.md): schedule.html and teams.html reuse this module — no
 * second schedule implementation. live.js also reads through it (its inline
 * mapping was extracted here verbatim, including the long-standing away-
 * color quirk where the away entry falls back to the home team's color —
 * preserved deliberately; fix separately, not in this track).
 *
 * Exposes window.Scoreboard: { SB, parseEvents, fetchDay, fetchWeek }.
 * fetchWeek() returns today-3..today+3 (one request per day, parallel) so
 * team strips and the league calendar see last finals, today, and upcoming.
 *
 * Stdlib only. Deferred classic script; also require()-able in node.
 */
(function (global) {
  'use strict';

  var SB = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';

  function etToday() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date()).replace(/-/g, '');
  }

  function shiftDay(yyyymmdd, n) {
    var t = new Date(Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8)) + n * 864e5);
    return String(t.getUTCFullYear()) + String(t.getUTCMonth() + 1).padStart(2, '0') + String(t.getUTCDate()).padStart(2, '0');
  }

  /* Verbatim extraction of live.js's event mapping (Oct 2026). */
  function parseEvents(d) {
    return (d.events || []).map(function (e) {
      var c = e.competitions[0], ts = c.competitors;
      var h = ts.filter(function (t) { return t.homeAway === 'home'; })[0];
      var a = ts.filter(function (t) { return t.homeAway === 'away'; })[0];
      if (!h || !a) return null;
      return {
        id: e.id, date: e.date,
        state: e.status.type.state, detail: e.status.type.shortDetail,
        clock: c.status.displayClock, period: c.status.period,
        h: { abbr: h.team.abbreviation, name: h.team.displayName, score: h.score,
             color: '#' + (h.team.color || '1c1a15'),
             rec: h.records && h.records[0] ? h.records[0].summary : '' },
        a: { abbr: a.team.abbreviation, name: a.team.displayName, score: a.score,
             color: '#' + (h.team.color || '6b675c'), // sic: preserved quirk, see header
             rec: a.records && a.records[0] ? a.records[0].summary : '' }
      };
    }).filter(Boolean);
  }

  function jget(u) {
    return fetch(u).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  /* day: 'YYYYMMDD' or null/undefined for today. */
  function fetchDay(day) {
    return jget(day ? SB + '?dates=' + day : SB).then(parseEvents);
  }

  /* 7-day window centered on today: [{day, games}]. */
  function fetchWeek() {
    var today = etToday();
    var days = [-3, -2, -1, 0, 1, 2, 3].map(function (n) { return shiftDay(today, n); });
    return Promise.all(days.map(function (day) {
      return fetchDay(day).then(function (games) { return { day: day, games: games }; })
        .catch(function () { return { day: day, games: [] }; });
    }));
  }

  var api = {
    SB: SB, etToday: etToday, shiftDay: shiftDay,
    parseEvents: parseEvents, fetchDay: fetchDay, fetchWeek: fetchWeek
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.Scoreboard = api);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

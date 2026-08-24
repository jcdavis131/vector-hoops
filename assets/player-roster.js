/* Vector Hoops — assets/player-roster.js
 * Season-accurate NBA team abbreviations from assets/player_meta.json
 * (pipeline/build_player_meta.py → roster_context join).
 *
 * Load BEFORE game.js / inline page scripts. game.js calls setRoster() when
 * it fetches player_meta; other pages call load().
 */
(function (global) {
  'use strict';

  var ROSTER = {};
  var loadPromise = null;

  function key(name, season) {
    return String(name) + '|' + String(season);
  }

  function setRoster(map) {
    ROSTER = map || {};
  }

  function teamAbbr(name, season) {
    if (!name || !season) return '';
    var t = ROSTER[key(name, season)];
    return t ? String(t) : '';
  }

  function load(url) {
    if (loadPromise) return loadPromise;
    loadPromise = fetch(url || 'assets/player_meta.json')
      .then(function (res) { return res.ok ? res.json() : {}; })
      .then(function (meta) {
        setRoster(meta && meta.roster);
        return ROSTER;
      })
      .catch(function () {
        setRoster({});
        return ROSTER;
      });
    return loadPromise;
  }

  function formatNamePlain(name, season) {
    var team = teamAbbr(name, season);
    return team ? String(name) + ' \u00b7 ' + team : String(name);
  }

  function formatNameHtml(name, season, esc) {
    var escape = esc || function (s) { return String(s); };
    var team = teamAbbr(name, season);
    var html = escape(name);
    if (team) {
      html += ' <span class="vh-team-tag" title="NBA team">' + escape(team) + '</span>';
    }
    return html;
  }

  /** Unique team abbreviations across a player's charted seasons (sorted). */
  function teamsForSeasons(name, seasons) {
    var seen = {};
    var out = [];
    (seasons || []).forEach(function (season) {
      var t = teamAbbr(name, season);
      if (t && !seen[t]) {
        seen[t] = true;
        out.push(t);
      }
    });
    return out.sort();
  }

  global.VHPlayerRoster = {
    key: key,
    setRoster: setRoster,
    teamAbbr: teamAbbr,
    load: load,
    formatNamePlain: formatNamePlain,
    formatNameHtml: formatNameHtml,
    teamsForSeasons: teamsForSeasons
  };
})(window);

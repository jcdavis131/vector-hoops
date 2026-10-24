/* Pixel Replay: the BOX SCORE panel (replay.html #rpBox).
 *
 * Real data only. Everything here comes from the ESPN game-summary payload the
 * page already fetches — assets/replay-espn.js attaches the raw `boxscore` and
 * the quarter `linescores` to the game object. Zero new network calls.
 *
 * Live games re-render on the page's existing 30 s poll (replay.js calls
 * render() after every successful ESPN fetch); completed games render the
 * final once. A game with no boxscore — a pre-game, or an NBA-feed replay
 * file built from the play-by-play only — gets an honest empty state, never
 * zeros dressed up as data.
 */
(function (root) {
  'use strict';

  /* [ESPN statistics key, column header] — looked up by name in the payload's
     keys array, never by position, so a payload that renames or reorders
     columns degrades to blanks instead of wrong numbers. */
  var COLS = [
    ['MIN', 'MIN'], ['FG', 'FG'], ['3PT', '3P'], ['FT', 'FT'],
    ['REB', 'REB'], ['AST', 'AST'], ['STL', 'STL'], ['BLK', 'BLK'],
    ['PTS', 'PTS'], ['+/-', '+/-']
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function chip(t) {
    return '<i class="sw" style="background:' + esc((t && t.c) || '#555555') + '"></i>';
  }

  function parsePlayers(bx) {
    var out = [];
    ((bx && bx.players) || []).forEach(function (tp) {
      var st = (tp.statistics && tp.statistics[0]) || {}, keys = st.keys || [], idx = {};
      COLS.forEach(function (c) { idx[c[0]] = keys.indexOf(c[0]); });
      var rows = [];
      ((st.athletes) || []).forEach(function (a) {
        var at = a.athlete || {}, stats = a.stats || [];
        rows.push({
          name: at.shortName || at.displayName || '',
          dnp: !!a.didNotPlay,
          cells: COLS.map(function (c) {
            var i = idx[c[0]];
            return i >= 0 && stats[i] != null ? String(stats[i]) : '';
          })
        });
      });
      out.push({ tri: tp.team && tp.team.abbreviation, rows: rows });
    });
    return out;
  }

  function teamTable(g) {
    var qs = g.quarters || [], maxQ = 0, i, k;
    qs.forEach(function (r) { maxQ = Math.max(maxQ, (r.q || []).length); });
    if (!maxQ) return '';
    var html = '<table class="rp-boxt"><caption class="visually-hidden">Team score by quarter</caption>' +
      '<thead><tr><th scope="col"><span class="visually-hidden">Team</span></th>';
    for (k = 0; k < maxQ; k++) html += '<th scope="col">' + (k < 4 ? 'Q' + (k + 1) : 'OT' + (k - 3)) + '</th>';
    html += '<th scope="col" class="tot">T</th></tr></thead><tbody>';
    /* away first, then home — the game object's team order */
    (g.teams || []).forEach(function (t, ti) {
      var row = null;
      for (i = 0; i < qs.length; i++) if (qs[i].abbr === t.tri) { row = qs[i]; break; }
      html += '<tr><th scope="row">' + chip(t) + esc(t.tri || '') + '</th>';
      for (k = 0; k < maxQ; k++) html += '<td>' + esc(row && row.q[k] != null ? row.q[k] : '') + '</td>';
      var tot = row && row.t != null ? row.t : (g.score ? g.score[ti] : '');
      html += '<td class="tot">' + esc(tot) + '</td></tr>';
    });
    return html + '</tbody></table>';
  }

  function playerTables(g) {
    var html = '';
    parsePlayers(g.boxscore).forEach(function (pt) {
      var t = null;
      (g.teams || []).forEach(function (gt) { if (gt.tri === pt.tri) t = gt; });
      if (!t || !pt.rows.length) return;
      html += '<h3 class="rp-boxteam">' + chip(t) + esc(pt.tri) + '</h3>';
      html += '<table class="rp-boxt rp-boxp"><caption class="visually-hidden">' + esc(pt.tri) + ' player lines</caption>' +
        '<thead><tr><th scope="col"><span class="visually-hidden">Player</span></th>' +
        COLS.map(function (c) { return '<th scope="col">' + c[1] + '</th>'; }).join('') +
        '</tr></thead><tbody>';
      pt.rows.forEach(function (r) {
        html += '<tr' + (r.dnp ? ' class="dnp"' : '') + '><th scope="row">' + esc(r.name) + '</th>';
        if (r.dnp) html += '<td colspan="' + COLS.length + '" class="dnp-note">DNP</td>';
        else html += r.cells.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('');
        html += '</tr>';
      });
      html += '</tbody></table>';
    });
    return html;
  }

  function render(g) {
    var box = document.getElementById('rpBox');
    if (!box) return;
    if (!g || !g.boxscore) {
      var built = g && g.gameId && g.gameId.indexOf('espn-') !== 0;
      box.innerHTML = '<p class="rp-muted">' + (built
        ? 'No box score in this replay file — it was built from the play-by-play feed.'
        : 'Box score not up yet.') + '</p>';
      return;
    }
    var state = g.live ? 'Live · refreshes with the feed' : (g.final ? 'Final' : '');
    box.innerHTML = teamTable(g) + playerTables(g) +
      '<p class="rp-boxsrc">ESPN' + (state ? ' · ' + state : '') + '</p>';
  }

  root.ReplayBoxscore = { render: render };
})(typeof window !== 'undefined' ? window : this);

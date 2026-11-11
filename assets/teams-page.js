/* Teams hub — teams.json + current_rosters_2026_27.json + replays/index.json. */
(function (root) {
  'use strict';

  function gamesForTeam(index, abbr) {
    abbr = String(abbr || '').toUpperCase();
    return (index && index.games || []).filter(function (g) {
      return (g.teams || []).some(function (t) { return t.tri === abbr; });
    });
  }

  function rosterFor(rosters, abbr) {
    if (!rosters || !rosters.teams) return [];
    return rosters.teams[abbr] || rosters.teams[String(abbr).toUpperCase()] || [];
  }

  function mount() {
    var grid = document.getElementById('team-grid');
    var panel = document.getElementById('team-panel');
    if (!grid || !panel) return;
    var pick = (new URLSearchParams(location.search).get('team') || '').toUpperCase();

    Promise.all([
      fetch('/assets/teams.json?v=a219199d').then(function (r) { return r.json(); }),
      fetch('/assets/current_rosters_2026_27.json?v=14817098').then(function (r) { return r.json(); }),
      fetch('/assets/replays/index.json?v=0c0f973c').then(function (r) { return r.json(); })
    ]).then(function (triple) {
      var teams = triple[0].teams || [];
      var rost = triple[1];
      var replays = triple[2];
      grid.innerHTML = teams.map(function (t) {
        var on = t.abbr === pick ? ' is-active' : '';
        return '<a class="card ex-team' + on + '" href="/teams?team=' + encodeURIComponent(t.abbr) + '">' +
          '<span class="label">' + t.abbr + '</span><span>' + t.name + '</span></a>';
      }).join('');

      if (!pick) {
        panel.innerHTML = '<p class="sub">Pick a team. Rosters are the ESPN preseason camp list dated ' +
          (rost.as_of || 'unknown') + ' — not opening-night. ' + (rost.note || '') + '</p>';
        return;
      }
      var meta = teams.filter(function (t) { return t.abbr === pick; })[0];
      var people = rosterFor(rost, pick);
      var games = gamesForTeam(replays, pick);
      if (!meta) {
        panel.innerHTML = '<div class="empty-state"><h2 class="empty-state__title">Unknown team</h2>' +
          '<p class="empty-state__body">No row in teams.json for ' + pick + '.</p></div>';
        return;
      }
      var rows = people.map(function (p) {
        return '<tr><th scope="row"><a href="/players?q=' + encodeURIComponent(p.name) + '">' + p.name +
          '</a></th><td>' + (p.position || '—') + '</td><td>' + (p.status || '—') + '</td></tr>';
      }).join('');
      var gameLis = games.length
        ? games.map(function (g) {
          var a = g.teams[0]; var b = g.teams[1];
          return '<li><a href="/games?id=' + encodeURIComponent(g.gameId) + '">' +
            a.tri + ' ' + g.score[0] + ' · ' + b.tri + ' ' + g.score[1] + ' · ' + g.date + '</a></li>';
        }).join('')
        : '';
      var emptyGames = games.length ? '' : '<div class="empty-state"><h2 class="empty-state__title">No play-by-play games on file</h2>' +
        '<p class="empty-state__body">Per-game logs for 2026-27 are not in the ledger yet. The Games page lists the five play-by-play files we do have. Schedule and Live cover the rest of the slate.</p></div>';
      panel.innerHTML = '<div class="card"><h2>' + meta.name + '</h2>' +
        '<p class="sub">Roster as of ' + (rost.as_of || '—') + ' · ' + people.length + ' names · ' + (rost.note || '') + '</p>' +
        (people.length
          ? '<table class="ex-table"><thead><tr><th scope="col">Player</th><th scope="col">Pos</th><th scope="col">Status</th></tr></thead><tbody>' + rows + '</tbody></table>'
          : '<div class="empty-state"><h2 class="empty-state__title">No roster in the file</h2><p class="empty-state__body">current_rosters_2026_27.json has no list for ' + pick + '.</p></div>') +
        '</div><div class="card"><h2>Games on file</h2>' +
        (gameLis ? '<ul class="ex-list">' + gameLis + '</ul>' : emptyGames) + '</div>';
    }).catch(function () {
      panel.innerHTML = '<div class="empty-state"><h2 class="empty-state__title">Team files failed to load</h2>' +
        '<p class="empty-state__body">Need teams.json, current_rosters_2026_27.json, and replays/index.json.</p></div>';
    });
  }

  var api = { gamesForTeam: gamesForTeam, rosterFor: rosterFor, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VHTeams = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
  }
})(typeof window !== 'undefined' ? window : this);

/* Games hub — shot charts and in-game board from replay event x/y. Real PBP only. */
(function (root) {
  'use strict';

  function fieldIndex(fields) {
    var out = {};
    (fields || []).forEach(function (n, i) { out[n] = i; });
    return out;
  }

  function typeName(game, code) {
    return (game.types || [])[code] || '';
  }

  function shotsFromEvents(game) {
    var F = fieldIndex(game.fields);
    var out = [];
    (game.events || []).forEach(function (e) {
      var t = typeName(game, e[F.type]);
      if (t !== '2pt' && t !== '3pt') return;
      if (e[F.x] == null || e[F.y] == null) return;
      out.push({
        x: e[F.x], y: e[F.y], made: !!e[F.made], three: t === '3pt',
        team: e[F.team], person: String(e[F.person]), desc: e[F.desc] || '',
        period: e[F.period], clock: e[F.clock]
      });
    });
    return out;
  }

  function boxFromEvents(game) {
    var F = fieldIndex(game.fields);
    var names = game.players || {};
    var box = {};
    function row(id) {
      if (!box[id]) {
        var meta = names[id] || {};
        box[id] = { id: id, name: meta.n || id, team: meta.t, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pts: 0 };
      }
      return box[id];
    }
    (game.events || []).forEach(function (e) {
      var id = e[F.person];
      if (id == null || id === -1) return;
      var t = typeName(game, e[F.type]);
      var made = !!e[F.made];
      var r = row(String(id));
      if (t === '2pt') { r.fga += 1; if (made) { r.fgm += 1; r.pts += 2; } }
      else if (t === '3pt') { r.fga += 1; r.tpa += 1; if (made) { r.fgm += 1; r.tpm += 1; r.pts += 3; } }
      else if (t === 'freethrow') { r.fta += 1; if (made) { r.ftm += 1; r.pts += 1; } }
    });
    return Object.keys(box).map(function (k) { return box[k]; }).sort(function (a, b) { return b.pts - a.pts; });
  }

  function timelineFromEvents(game) {
    var F = fieldIndex(game.fields);
    var out = [];
    (game.events || []).forEach(function (e) {
      var t = typeName(game, e[F.type]);
      if (t !== '2pt' && t !== '3pt' && t !== 'freethrow') return;
      if (!e[F.made]) return;
      out.push({
        period: e[F.period], clock: e[F.clock], desc: e[F.desc] || '',
        away: e[F.away], home: e[F.home]
      });
    });
    return out;
  }

  function shotChartSvg(shots) {
    var dots = (shots || []).map(function (s) {
      var r = s.three ? 0.85 : 0.65;
      var cls = (s.team === 1 ? 'sc-home' : 'sc-away') + (s.made ? ' is-make' : ' is-miss');
      return '<circle class="' + cls + '" cx="' + s.x + '" cy="' + s.y + '" r="' + r + '"/>';
    }).join('');
    return '<svg class="shot-chart" viewBox="0 0 94 50" role="img" aria-label="Shot chart, court feet">' +
      '<rect class="sc-floor" x="0" y="0" width="94" height="50"/>' +
      '<line class="sc-line" x1="47" y1="0" x2="47" y2="50"/>' +
      '<circle class="sc-line" cx="5.25" cy="25" r="6" fill="none"/>' +
      '<circle class="sc-line" cx="88.75" cy="25" r="6" fill="none"/>' +
      '<circle class="sc-hoop" cx="5.25" cy="25" r="0.75" fill="none"/>' +
      '<circle class="sc-hoop" cx="88.75" cy="25" r="0.75" fill="none"/>' +
      dots + '</svg>';
  }

  function mount() {
    var list = document.getElementById('game-list');
    var panel = document.getElementById('game-panel');
    if (!list || !panel) return;
    var pick = new URLSearchParams(location.search).get('id') || '';

    fetch('/assets/replays/index.json?v=0c0f973c').then(function (r) { return r.json(); }).then(function (idx) {
      var games = idx.games || [];
      list.innerHTML = games.map(function (g) {
        var a = g.teams[0]; var b = g.teams[1];
        var on = g.gameId === pick ? ' is-active' : '';
        return '<a class="card ex-game' + on + '" href="/games?id=' + encodeURIComponent(g.gameId) + '">' +
          '<span class="label">' + g.date + '</span>' +
          '<span>' + a.tri + ' ' + g.score[0] + ' · ' + b.tri + ' ' + g.score[1] + '</span></a>';
      }).join('');
      if (!pick) {
        panel.innerHTML = '<p class="sub">' + (idx.note || 'Shooter spots come from the NBA feed. Pick a game.') +
          '</p><div class="empty-state"><h2 class="empty-state__title">Five play-by-play games on disk</h2>' +
          '<p class="empty-state__body">There is no 2026-27 gamelog dump in the repo. Other nights: Schedule and Courtside Live. Pixel Replay animates the same five files.</p></div>';
        return;
      }
      var meta = games.filter(function (g) { return g.gameId === pick; })[0];
      if (!meta) {
        panel.innerHTML = '<div class="empty-state"><h2 class="empty-state__title">Game not on file</h2>' +
          '<p class="empty-state__body">No row in replays/index.json for ' + pick + '.</p></div>';
        return;
      }
      var replayUrl = '/assets/replays/' + encodeURIComponent(pick) + '.json';
      return fetch(replayUrl).then(function (r) { return r.json(); }).then(function (game) {
        var shots = shotsFromEvents(game);
        var box = boxFromEvents(game);
        var tl = timelineFromEvents(game);
        var expected = game.check && game.check.shots;
        var a = game.teams[0]; var b = game.teams[1];
        var boxRows = box.map(function (p) {
          return '<tr><th scope="row">' + p.name + '</th><td>' + p.pts + '</td><td>' + p.fgm + '/' + p.fga +
            '</td><td>' + p.tpm + '/' + p.tpa + '</td><td>' + p.ftm + '/' + p.fta + '</td></tr>';
        }).join('');
        var tlRows = tl.map(function (ev) {
          return '<li><span class="label">Q' + ev.period + ' ' + ev.clock + 's</span> ' + ev.desc +
            ' · ' + ev.away + '–' + ev.home + '</li>';
        }).join('');
        panel.innerHTML = '<div class="card"><h2>' + a.tri + ' ' + game.score[0] + ' · ' + b.tri + ' ' + game.score[1] + '</h2>' +
          '<p class="sub">' + game.date + ' · ' + pick + ' · ' + shots.length + ' located shots' +
          (expected != null ? ' (file check.shots=' + expected + ')' : '') +
          '. Spots are court feet from the NBA feed. The other nine players on the animation are projected — this chart plots shooters only.</p>' +
          shotChartSvg(shots) +
          '<p class="sub">Filled = make. Open = miss. Larger = three. Color = team 0 vs team 1 in the file.</p></div>' +
          '<div class="empty-state"><h2 class="empty-state__title">No win-probability series</h2>' +
          '<p class="empty-state__body">Replay JSON has no WP path. Live games show ESPN BPI on <a href="/live">Courtside Live</a> when that feed is up. This page will not invent a curve.</p></div>' +
          '<div class="card"><h2>In-game board</h2>' +
          '<p class="sub">Derived from the same events (2s, 3s, free throws). Not a separate box-score file.</p>' +
          '<table class="ex-table"><thead><tr><th scope="col">Player</th><th scope="col">Pts</th><th scope="col">FG</th><th scope="col">3P</th><th scope="col">FT</th></tr></thead><tbody>' +
          boxRows + '</tbody></table></div>' +
          '<div class="card"><h2>Scoring timeline</h2><ol class="ex-list">' + tlRows + '</ol></div>' +
          '<p class="sub"><a href="/replay">Open Pixel Replay</a> for the animation of this file.</p>';
      });
    }).catch(function () {
      panel.innerHTML = '<div class="empty-state"><h2 class="empty-state__title">Replay index failed to load</h2>' +
        '<p class="empty-state__body">Need assets/replays/index.json.</p></div>';
    });
  }

  var api = {
    fieldIndex: fieldIndex, shotsFromEvents: shotsFromEvents, boxFromEvents: boxFromEvents,
    timelineFromEvents: timelineFromEvents, shotChartSvg: shotChartSvg, mount: mount
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VHGames = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
  }
})(typeof window !== 'undefined' ? window : this);

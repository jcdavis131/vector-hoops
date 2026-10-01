/* Greatest Playoff Runs — renders the four leaderboards from assets/playoff-runs.json */
(function (global) {
  'use strict';

  var HEADS = {
    individuals: { title: 'Individual runs', sub: 'Ten-plus playoff games. Per-100 scoring plus efficiency, with a bonus for each round won and the title.' },
    duos: { title: 'Duos', sub: 'The two highest-scoring teammates of each run — both real rotation players (40+ regular-season games, 12+ playoff games).' },
    trios: { title: 'Trios', sub: 'The three highest-scoring teammates of each run. Scoring cores, not lineups.' },
    teams: { title: 'Team runs', sub: 'The most dominant postseasons of the last 30 years, ranked by win percentage, then wins, then leading-scorer firepower.' }
  };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function champBadge(r) {
    return r.champion ? '<span class="vh-runs__champ">🏆 Champions</span>' : '';
  }

  // Deep link into the Players directory, pre-filled search (?q= support
  // in assets/players-directory.js) so every run connects to the atlas.
  function plink(name) {
    return '<a class="vh-runs__plink" href="/players?q=' +
      encodeURIComponent(name) + '">' + esc(name) + '</a>';
  }

  function barRow(rank, names, meta, pts, maxPts, badge) {
    var w = maxPts > 0 ? Math.max(4, Math.round(100 * pts / maxPts)) : 4;
    return '<article class="vh-runs__row">' +
      '<div class="vh-runs__rank">' + rank + '</div>' +
      '<div><h3 class="vh-runs__names">' + names + badge + '</h3>' +
      '<p class="vh-runs__meta">' + meta + '</p>' +
      '<div class="vh-runs__bar" aria-hidden="true"><i style="width:' + w + '%"></i></div>' +
      '<p class="vh-runs__pts"><b>' + pts.toFixed(1) + '</b> pts per 100 possessions</p></div>' +
      '</article>';
  }

  function renderBoard(el, key, rows) {
    var head = HEADS[key];
    var maxPts = rows.reduce(function (m, r) { return Math.max(m, r.pts100 || r.top_pts100 || 0); }, 0);
    var html = '<div class="vh-runs__boardhead"><h2>' + esc(head.title) + '</h2><p>' + esc(head.sub) + '</p></div>';
    html += rows.map(function (r, i) {
      var rank = i + 1;
      if (key === 'individuals') {
        return barRow(rank, plink(r.player),
          '<b>' + esc(r.season) + '</b> · ' + esc(r.wl) + ' in ' + r.gp + ' games',
          r.pts100, maxPts, champBadge(r));
      }
      if (key === 'teams') {
        return barRow(rank, esc(r.team),
          '<b>' + esc(r.season) + '</b> · ' + esc(r.wl) + ' · path ' + esc(r.path) +
          ' · led by ' + plink(r.top_scorer),
          r.top_pts100, maxPts, champBadge(r));
      }
      return barRow(rank, r.players.map(plink).join(' <span aria-hidden="true">·</span> '),
        '<b>' + esc(r.team) + '</b> · ' + esc(r.season) + ' · ' + esc(r.wl),
        r.pts100, maxPts, champBadge(r));
    }).join('');
    el.innerHTML = html;
  }

  function render(data) {
    ['individuals', 'duos', 'trios', 'teams'].forEach(function (key) {
      var el = document.getElementById('board-' + key);
      if (el && data.rankings[key]) renderBoard(el, key, data.rankings[key]);
    });
  }

  function fail() {
    ['individuals', 'duos', 'trios', 'teams'].forEach(function (key) {
      var el = document.getElementById('board-' + key);
      if (el) el.innerHTML = '<p class="vh-runs__err">Rankings failed to load. Check your connection and reload.</p>';
    });
  }

  function initTabs() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.vh-runs__tab'));
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) {
          t.classList.remove('is-active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('is-active');
        tab.setAttribute('aria-selected', 'true');
        var key = tab.getAttribute('data-board');
        ['individuals', 'duos', 'trios', 'teams'].forEach(function (k) {
          document.getElementById('board-' + k).classList.toggle('is-active', k === key);
        });
        var map = { individuals: 0, duos: 1, trios: 2, teams: 3 };
        if (global.history && global.history.replaceState) {
          global.history.replaceState(null, '', '#board-' + key);
        }
      });
    });
    var hash = (global.location.hash || '').replace('#board-', '');
    if (['duos', 'trios', 'teams'].indexOf(hash) >= 0) {
      var t = document.querySelector('.vh-runs__tab[data-board="' + hash + '"]');
      if (t) t.click();
    }
  }

  function init() {
    initTabs();
    fetch('assets/playoff-runs.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      })
      .then(render)
      .catch(fail);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
